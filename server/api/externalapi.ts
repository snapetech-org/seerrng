import { getStaleCacheValue, type CacheStore } from '@server/lib/cache';
import { recordCacheHit, recordExternalApiCall } from '@server/lib/metrics';
import logger from '@server/logger';
import { trackBackgroundTask } from '@server/utils/backgroundTasks';
import { proxyRequestInterceptor } from '@server/utils/customProxyAgent';
import {
  getHttpErrorDetails,
  withTransientHttpRetry,
} from '@server/utils/httpError';
import {
  createSafeHttpRequestOptions,
  createSafeHttpUrl,
  stringifySafeHttpUrl,
} from '@server/utils/security';
import { userAgentRequestInterceptor } from '@server/utils/userAgent';
import type { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import axios from 'axios';
import rateLimit from 'axios-rate-limit';
import { createHash } from 'node:crypto';

// 5 minute default TTL (in seconds)
const DEFAULT_TTL = 300;

// 10 seconds default rolling buffer (in ms)
const DEFAULT_ROLLING_BUFFER = 10000;
// How long a request waits for the provider before answering from an expired
// copy. The provider request keeps running and refreshes the cache.
export const STALE_RESPONSE_WAIT_MS = 750;
export const DEFAULT_EXTERNAL_API_TIMEOUT_MS = 10_000;
export const DEFAULT_EXTERNAL_API_MAX_CONTENT_LENGTH = 16 * 1024 * 1024;
export const DEFAULT_EXTERNAL_API_MAX_BODY_LENGTH = 1024 * 1024;
export const MAX_PENDING_EXTERNAL_API_REQUESTS = 256;

export type ExternalAPIRequestFailure = {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  hostname: string;
  path: string;
  error: unknown;
};

const CACHE_KEY_DIGEST_PREFIX = ':sha256:';
const MAX_CACHE_KEY_VALUES = 100_000;
const MAX_CACHE_KEY_DEPTH = 64;
const MAX_CREDENTIAL_SCAN_NODES = 5_000;
const MAX_CREDENTIAL_SCAN_DEPTH = 32;
const CREDENTIAL_FIELD_PATTERN =
  /(authorization|api[-_]?key|auth(?:entication)?[-_]?token|auth[-_]?header|auth|token|secret|password|cookie|credential)$/i;

export const containsCredentialFields = (value: unknown): boolean => {
  const ancestors = new WeakSet<object>();
  let visitedNodes = 0;

  const inspect = (item: unknown, depth: number): boolean => {
    if (!item || typeof item !== 'object') {
      return false;
    }
    if (
      depth > MAX_CREDENTIAL_SCAN_DEPTH ||
      visitedNodes >= MAX_CREDENTIAL_SCAN_NODES
    ) {
      // If a configuration is too complex to inspect safely, do not let it
      // authorize detached background work.
      return true;
    }
    if (ancestors.has(item)) {
      return false;
    }
    if (item instanceof URLSearchParams) {
      return [...item.keys()].some((key) => CREDENTIAL_FIELD_PATTERN.test(key));
    }

    ancestors.add(item);
    visitedNodes += 1;
    try {
      return Object.entries(item).some(
        ([key, nested]) =>
          CREDENTIAL_FIELD_PATTERN.test(key) || inspect(nested, depth + 1)
      );
    } finally {
      ancestors.delete(item);
    }
  };

  return inspect(value, 0);
};

export interface ExternalAPIOptions {
  allowPrivateAddresses?: boolean;
  requireDirectConnection?: boolean;
  rejectUnsafeLocalAddresses?: boolean;
  allowedBaseUrls?: string[];
  nodeCache?: CacheStore;
  headers?: Record<string, unknown>;
  timeout?: number;
  maxContentLength?: number;
  maxBodyLength?: number;
  rateLimit?: {
    maxRPS?: number;
    maxRequests: number;
    perMilliseconds?: number;
  };
  // Some callers (e.g. JellyfinAPI) build their base URL from structured
  // settings where an unset hostname is a normal "not yet configured" state,
  // not an admin-entered typo. For those, defer the failure to request time
  // instead of throwing during construction.
  allowUnconfiguredBaseUrl?: boolean;
  onRequestFailure?: (failure: ExternalAPIRequestFailure) => void;
}

const getHttpOrigin = (
  value: string,
  options: { allowUnconfiguredBaseUrl?: boolean } = {}
): string | undefined => {
  let url: URL;
  try {
    url = new URL(value);
  } catch (error) {
    if (options.allowUnconfiguredBaseUrl) {
      return undefined;
    }
    throw error;
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('External API base URLs must use HTTP or HTTPS.');
  }
  if (url.username || url.password) {
    throw new Error('External API base URLs must not contain credentials.');
  }
  return url.origin;
};

const encodeUrlPath = (pathname: string): string =>
  pathname
    .split('/')
    .map((segment) => encodeURIComponent(decodeURIComponent(segment)))
    .join('/');

const encodeUrlQuery = (url: URL): string =>
  [...url.searchParams]
    .map(
      ([key, value]) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(value)}`
    )
    .join('&');

// `new URL(endpoint, baseUrl)` treats an endpoint starting with "/" as
// path-absolute, which discards any path segment already on `baseUrl`
// (e.g. TMDB's "/3" API version prefix). Every call site in this codebase
// writes endpoints as absolute-looking paths like "/movie/{id}", so they
// must resolve relative to the base URL's own path, not its origin.
const resolveExternalApiRequestUrl = (
  endpoint: string,
  baseUrl: string
): URL => {
  const base = new URL(baseUrl);
  if (!base.pathname.endsWith('/')) {
    base.pathname += '/';
  }
  const relativeEndpoint = endpoint.startsWith('/')
    ? endpoint.slice(1)
    : endpoint;
  return new URL(relativeEndpoint, base);
};

export const normalizeExternalApiRequestTarget = (
  endpoint: string,
  baseUrl: string,
  allowedOrigins: ReadonlySet<string>
): string => {
  let requestUrl: URL;
  try {
    requestUrl = resolveExternalApiRequestUrl(endpoint, baseUrl);
  } catch (error) {
    throw new Error('External API request target is not allowed.', {
      cause: error,
    });
  }

  if (
    !['http:', 'https:'].includes(requestUrl.protocol) ||
    requestUrl.username ||
    requestUrl.password ||
    !allowedOrigins.has(requestUrl.origin)
  ) {
    throw new Error('External API request target is not allowed.');
  }

  try {
    const query = encodeUrlQuery(requestUrl);
    return `${encodeUrlPath(requestUrl.pathname)}${query ? `?${query}` : ''}`;
  } catch (error) {
    throw new Error('External API request target is not allowed.', {
      cause: error,
    });
  }
};

export const createExternalApiCacheKeySuffix = (
  options?: Record<string, unknown>
) => {
  if (!options) {
    return '';
  }

  const hash = createHash('sha256');
  const ancestors = new Map<object, number>();
  let visitedValues = 0;
  const write = (value: string) => {
    hash.update(`${Buffer.byteLength(value, 'utf8')}:`);
    hash.update(value);
  };
  const serialize = (value: unknown, depth: number): void => {
    if (depth > MAX_CACHE_KEY_DEPTH || visitedValues >= MAX_CACHE_KEY_VALUES) {
      throw new Error('External API cache options exceed safe limits.');
    }
    visitedValues += 1;

    if (value === null) {
      write('null');
      return;
    }

    switch (typeof value) {
      case 'undefined':
        write('undefined');
        return;
      case 'string':
        write('string');
        write(value);
        return;
      case 'boolean':
        write(value ? 'true' : 'false');
        return;
      case 'number':
        write('number');
        write(
          Number.isNaN(value)
            ? 'NaN'
            : Object.is(value, -0)
              ? '-0'
              : String(value)
        );
        return;
      case 'bigint':
        write('bigint');
        write(value.toString());
        return;
      case 'symbol':
      case 'function':
        throw new TypeError(
          `Unsupported external API cache option value: ${typeof value}.`
        );
    }

    const ancestorDepth = ancestors.get(value);
    if (ancestorDepth !== undefined) {
      write('cycle');
      write(String(depth - ancestorDepth));
      return;
    }

    if (Buffer.isBuffer(value)) {
      write('buffer');
      write(value.toString('base64'));
      return;
    }
    if (value instanceof Date) {
      write('date');
      write(Number.isNaN(value.getTime()) ? 'invalid' : value.toISOString());
      return;
    }
    if (value instanceof URL) {
      write('url');
      write(value.href);
      return;
    }
    if (value instanceof URLSearchParams) {
      write('url-search-params');
      write(value.toString());
      return;
    }

    ancestors.set(value, depth);
    try {
      if (Array.isArray(value)) {
        write('array:start');
        for (const entry of value) {
          serialize(entry, depth + 1);
        }
        write('array:end');
        return;
      }

      write('object:start');
      for (const key of Object.keys(value).sort()) {
        write('key');
        write(key);
        serialize((value as Record<string, unknown>)[key], depth + 1);
      }
      write('object:end');
    } finally {
      ancestors.delete(value);
    }
  };

  serialize(options, 0);
  return `${CACHE_KEY_DIGEST_PREFIX}${hash.digest('hex')}`;
};

class ExternalAPI {
  protected axios: AxiosInstance;
  private baseUrl: string;
  private allowedOrigins: ReadonlySet<string>;
  private cacheScope: string;
  private cache?: CacheStore;
  private backgroundCacheRefreshEnabled: boolean;
  private onRequestFailure?: ExternalAPIOptions['onRequestFailure'];
  private static pendingRequests = new Map<string | symbol, Promise<unknown>>();
  private static explicitCacheKeys = new WeakMap<
    CacheStore,
    Map<string, { endpoint: string; scope: string }>
  >();

  protected getCached<T>(
    endpoint: string,
    config?: AxiosRequestConfig
  ): T | undefined {
    return this.cache?.get<T>(
      this.serializeCacheKey(endpoint, {
        params: config?.params,
        headers: config?.headers,
        baseURL: config?.baseURL,
      })
    );
  }

  protected setCached<T>(
    endpoint: string,
    value: T,
    ttl: number = DEFAULT_TTL,
    config?: AxiosRequestConfig
  ): void {
    if (!this.cache || ttl <= 0) return;
    const key = this.serializeCacheKey(endpoint, {
      params: config?.params,
      headers: config?.headers,
      baseURL: config?.baseURL,
    });
    if (!this.cache.set(key, value, ttl)) return;
    let keys = ExternalAPI.explicitCacheKeys.get(this.cache);
    if (!keys) {
      keys = new Map();
      ExternalAPI.explicitCacheKeys.set(this.cache, keys);
    }
    // Provider stores contain at most 500 entries; bound the shared index too.
    if (keys.size >= 1024) {
      for (const existing of keys.keys())
        if (this.cache.getTtl(existing) == null) keys.delete(existing);
      if (keys.size >= 1024) keys.delete(keys.keys().next().value!);
    }
    keys.set(key, { endpoint, scope: this.cacheScope });
  }

  protected removeCacheByEndpointPrefix(prefix: string): void {
    if (!this.cache) return;
    const keys = ExternalAPI.explicitCacheKeys.get(this.cache);
    for (const [key, item] of keys ?? []) {
      if (item.scope === this.cacheScope && item.endpoint.startsWith(prefix)) {
        this.cache.del(key);
        keys?.delete(key);
      }
    }
  }

  constructor(
    baseUrl: string,
    params: Record<string, unknown>,
    options: ExternalAPIOptions = {}
  ) {
    const configuredOrigin = getHttpOrigin(baseUrl, {
      allowUnconfiguredBaseUrl: options.allowUnconfiguredBaseUrl,
    });
    const allowedOrigins = new Set(
      [
        configuredOrigin,
        ...(options.allowedBaseUrls ?? []).map((url) => getHttpOrigin(url)),
      ].filter((origin): origin is string => origin !== undefined)
    );
    this.axios = axios.create({
      params,
      ...createSafeHttpRequestOptions(
        options.allowPrivateAddresses ?? false,
        false,
        options.requireDirectConnection ?? false,
        options.rejectUnsafeLocalAddresses ?? false
      ),
      timeout: options.timeout ?? DEFAULT_EXTERNAL_API_TIMEOUT_MS,
      maxContentLength:
        options.maxContentLength ?? DEFAULT_EXTERNAL_API_MAX_CONTENT_LENGTH,
      maxBodyLength:
        options.maxBodyLength ?? DEFAULT_EXTERNAL_API_MAX_BODY_LENGTH,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...options.headers,
      },
    });
    this.axios.interceptors.request.use((config) => {
      const requestUrl = new URL(config.url ?? '', config.baseURL ?? baseUrl);
      if (
        !['http:', 'https:'].includes(requestUrl.protocol) ||
        requestUrl.username ||
        requestUrl.password ||
        !allowedOrigins.has(requestUrl.origin)
      ) {
        throw new Error('External API request target is not allowed.');
      }
      return config;
    });
    this.axios.interceptors.request.use(proxyRequestInterceptor);
    this.axios.interceptors.request.use(userAgentRequestInterceptor);

    if (options.rateLimit) {
      this.axios = rateLimit(this.axios, {
        maxRequests: options.rateLimit.maxRequests,
        maxRPS: options.rateLimit.maxRPS,
        perMilliseconds: options.rateLimit.perMilliseconds,
      });
    }

    this.baseUrl = baseUrl;
    this.allowedOrigins = allowedOrigins;
    // Shared caches and the process-wide in-flight map must not coalesce
    // requests made with different credentials or constructor-level params.
    // Keep only a digest in cache keys so API secrets are not retained there.
    this.cacheScope = createExternalApiCacheKeySuffix({
      params,
      headers: options.headers,
    });
    this.cache = options.nodeCache;
    // Credential-bearing API instances can outlive the request or security
    // lease that created them. Let their cache entries expire naturally
    // instead of starting detached requests with stale authority.
    this.backgroundCacheRefreshEnabled = !(
      containsCredentialFields(params) ||
      containsCredentialFields(options.headers)
    );
    this.onRequestFailure = options.onRequestFailure;
  }

  protected async request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    endpoint: string,
    data?: unknown,
    config?: AxiosRequestConfig
  ): Promise<AxiosResponse<T>> {
    recordExternalApiCall(method);
    const normalizedEndpoint = normalizeExternalApiRequestTarget(
      endpoint,
      config?.baseURL ?? this.baseUrl,
      this.allowedOrigins
    );

    const requestUrl = new URL(
      normalizedEndpoint,
      config?.baseURL ?? this.baseUrl
    );
    const safeUrl = await createSafeHttpUrl(requestUrl.href, {
      // Private-address policy is enforced again by the socket DNS lookup
      // installed above. This validation establishes the HTTP(S), credential,
      // and URL-shape boundary before the absolute URL reaches Axios.
      allowPrivateAddresses: true,
    });
    if (!safeUrl) {
      throw new Error('External API request target is not allowed.');
    }

    const requestTarget = stringifySafeHttpUrl(safeUrl);

    try {
      switch (method) {
        case 'GET':
          // Servarr and other provider APIs can briefly refuse or time out a
          // read while they are starting, refreshing, or applying configuration.
          // Reads are safe to repeat, so absorb one transient transport/server
          // failure before the caller turns it into a user-facing error.
          return await withTransientHttpRetry(
            () => this.axios.get<T>(requestTarget, config),
            { signal: config?.signal }
          );
        case 'POST':
          // requestTarget is restricted to the constructor's allowed origins;
          // provider payloads may intentionally originate in local config.
          // codeql[js/file-access-to-http]
          return await this.axios.post<T>(requestTarget, data, config);
        case 'PUT':
          // requestTarget is restricted to the constructor's allowed origins;
          // provider payloads may intentionally originate in local config.
          // codeql[js/file-access-to-http]
          return await this.axios.put<T>(requestTarget, data, config);
        case 'PATCH':
          return await this.axios.patch<T>(requestTarget, data, config);
        case 'DELETE':
          return await this.axios.delete<T>(requestTarget, config);
      }
    } catch (error) {
      try {
        this.onRequestFailure?.({
          method,
          hostname: safeUrl.hostname,
          path: safeUrl.pathname,
          error,
        });
      } catch {
        // Diagnostics must not replace the original upstream request error.
      }

      throw error;
    }
  }

  // transform runs before the cache write.
  protected async get<T>(
    endpoint: string,
    config?: AxiosRequestConfig,
    ttl?: number,
    options?:
      | ((data: T) => boolean)
      | {
          cache?: CacheStore;
          transform?: (data: T) => T;
        }
  ): Promise<T> {
    const cache =
      typeof options === 'object' ? (options.cache ?? this.cache) : this.cache;
    const isUsableResponse =
      typeof options === 'function' ? options : undefined;
    const transform =
      typeof options === 'object' ? options.transform : undefined;
    const cacheKey = this.serializeCacheKey(endpoint, {
      params: config?.params,
      headers: config?.headers,
      baseURL: config?.baseURL,
    });
    if (ttl !== 0) {
      const cachedItem = cache?.get<T>(cacheKey);
      if (cachedItem !== undefined) {
        if (!isUsableResponse || isUsableResponse(cachedItem)) {
          recordCacheHit('external-api');
          return cachedItem;
        }
        cache?.del(cacheKey);
      }
    }

    const fresh = this.fetchAndCache(
      'GET',
      cacheKey,
      () => this.request<T>('GET', endpoint, undefined, config),
      ttl,
      isUsableResponse,
      cache,
      transform
    );

    // An expired copy answers only while this request's own provider call is
    // slow or failing. Nothing new is started in the background: the call
    // above belongs to this request and refreshes the cache when it finishes.
    const stale =
      ttl !== 0 ? getStaleCacheValue<T>(cache, cacheKey) : undefined;
    if (stale !== undefined && (!isUsableResponse || isUsableResponse(stale)))
      return this.freshOrStale(
        fresh,
        stale,
        isUsableResponse,
        config?.signal,
        () => cache?.del(cacheKey)
      );

    const response = await fresh;

    if (isUsableResponse && !isUsableResponse(response)) {
      return this.fetchAndCache(
        'GET',
        cacheKey,
        () => this.request<T>('GET', endpoint, undefined, config),
        0,
        isUsableResponse,
        cache,
        transform
      );
    }

    return response;
  }

  private async freshOrStale<T>(
    fresh: Promise<T>,
    stale: T,
    isUsableResponse?: (data: T) => boolean,
    signal?: AxiosRequestConfig['signal'],
    invalidate?: () => unknown
  ): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    const waited = new Promise<undefined>((resolve) => {
      const handle: NodeJS.Timeout = setTimeout(
        () => resolve(undefined),
        STALE_RESPONSE_WAIT_MS
      );
      handle.unref();
      timer = handle;
    });
    const cannotUseStale = (error: unknown) => {
      const status = (error as { response?: { status?: number } })?.response
        ?.status;
      return (
        signal?.aborted ||
        axios.isCancel(error) ||
        (status !== undefined &&
          status < 500 &&
          status !== 408 &&
          status !== 429)
      );
    };
    const refresh = fresh.catch((error: unknown) => {
      if (cannotUseStale(error)) invalidate?.();
      throw error;
    });
    try {
      const result = await Promise.race([
        refresh.then((data) => ({ data })),
        waited,
      ]);
      if (result && (!isUsableResponse || isUsableResponse(result.data))) {
        return result.data;
      }
    } catch (error) {
      if (cannotUseStale(error)) throw error;
      logger.debug('Provider request failed; answering from an expired copy', {
        label: 'External API',
        ...getHttpErrorDetails(error),
      });
    } finally {
      clearTimeout(timer);
    }
    // The provider call may still settle after this answer; never leave its
    // rejection unhandled.
    refresh.catch(() => undefined);
    if (signal?.aborted)
      throw new axios.CanceledError('Provider read cancelled');
    recordCacheHit('external-api-stale');
    return stale;
  }

  protected async post<T>(
    endpoint: string,
    data?: Record<string, unknown>,
    config?: AxiosRequestConfig,
    ttl?: number
  ): Promise<T> {
    const cacheable = typeof ttl === 'number' && ttl > 0;
    const cacheKey = this.serializeCacheKey(endpoint, {
      params: config?.params,
      headers: config?.headers,
      baseURL: config?.baseURL,
      ...(data ? { data } : {}),
    });

    if (cacheable) {
      const cachedItem = this.cache?.get<T>(cacheKey);
      if (cachedItem !== undefined) {
        recordCacheHit('external-api');
        return cachedItem;
      }
    }

    return this.fetchAndCache(
      'POST',
      cacheKey,
      () => this.request<T>('POST', endpoint, data, config),
      ttl
    );
  }

  protected async getRolling<T>(
    endpoint: string,
    config?: AxiosRequestConfig,
    ttl?: number
  ): Promise<T> {
    const cacheKey = this.serializeCacheKey(endpoint, {
      params: config?.params,
      headers: config?.headers,
      baseURL: config?.baseURL,
    });
    const cachedItem = ttl === 0 ? undefined : this.cache?.get<T>(cacheKey);

    if (cachedItem !== undefined) {
      recordCacheHit('external-api');
      const keyTtl = this.cache?.getTtl(cacheKey) ?? 0;

      // If the item has passed our rolling check, fetch again in background
      if (
        this.backgroundCacheRefreshEnabled &&
        !containsCredentialFields({
          params: config?.params,
          headers: config?.headers,
        }) &&
        keyTtl - (ttl ?? DEFAULT_TTL) * 1000 <
          Date.now() - DEFAULT_ROLLING_BUFFER
      ) {
        trackBackgroundTask('rolling external API cache refresh', () =>
          this.fetchAndCache(
            'GET',
            cacheKey,
            () => this.request<T>('GET', endpoint, undefined, config),
            ttl
          )
        );
      }
      return cachedItem;
    }

    return this.fetchAndCache(
      'GET',
      cacheKey,
      () => this.request<T>('GET', endpoint, undefined, config),
      ttl
    );
  }

  protected removeCache(endpoint: string, options?: Record<string, unknown>) {
    const cacheKey = this.serializeCacheKey(endpoint, {
      params: options,
      headers: undefined,
      baseURL: undefined,
    });
    this.cache?.del(cacheKey);
  }

  private serializeCacheKey(
    endpoint: string,
    options?: Record<string, unknown>
  ) {
    return `external-api${createExternalApiCacheKeySuffix({
      baseUrl: this.baseUrl,
      endpoint,
      scope: this.cacheScope,
      options,
    })}`;
  }

  private async fetchAndCache<T>(
    method: 'GET' | 'POST',
    cacheKey: string,
    request: () => Promise<{ data: T }>,
    ttl?: number,
    isUsableResponse?: (data: T) => boolean,
    cache: CacheStore | undefined = this.cache,
    transform?: (data: T) => T
  ): Promise<T> {
    const pendingKey = `${method}:${cacheKey}`;
    const cacheable =
      method === 'GET' ? ttl !== 0 : typeof ttl === 'number' && ttl > 0;
    const coalesce = method === 'GET' || cacheable;
    const requestKey: string | symbol = coalesce
      ? pendingKey
      : Symbol(pendingKey);
    if (coalesce) {
      const pendingRequest = ExternalAPI.pendingRequests.get(requestKey) as
        Promise<T> | undefined;
      if (pendingRequest) {
        return pendingRequest;
      }
    }

    if (ExternalAPI.pendingRequests.size >= MAX_PENDING_EXTERNAL_API_REQUESTS) {
      throw new Error('External API request capacity exceeded.');
    }

    // Defer adapter invocation until after the promise is admitted to the
    // process-wide map. This keeps the size check and registration atomic on
    // the JavaScript event loop, including for adapters that throw
    // synchronously.
    const pending = Promise.resolve()
      .then(request)
      .then((response) => {
        const data = transform ? transform(response.data) : response.data;
        if (
          cache &&
          cacheable &&
          (!isUsableResponse || isUsableResponse(data))
        ) {
          try {
            cache.set(cacheKey, data, ttl ?? DEFAULT_TTL);
          } catch (error) {
            logger.warn('Unable to cache external API response', {
              label: 'External API',
              errorMessage:
                error instanceof Error ? error.message : 'Unknown cache error',
            });
          }
        }

        return data;
      })
      .finally(() => {
        ExternalAPI.pendingRequests.delete(requestKey);
      });

    ExternalAPI.pendingRequests.set(requestKey, pending);

    return pending;
  }
}

export default ExternalAPI;
