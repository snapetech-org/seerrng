import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';

import { Cache } from '@server/lib/cache';
import {
  getPendingBackgroundTaskCount,
  waitForBackgroundTasks,
} from '@server/utils/backgroundTasks';
import type { AxiosAdapter, AxiosRequestConfig } from 'axios';
import axios from 'axios';
import NodeCache from 'node-cache';
import ExternalAPI, {
  DEFAULT_EXTERNAL_API_MAX_BODY_LENGTH,
  DEFAULT_EXTERNAL_API_MAX_CONTENT_LENGTH,
  DEFAULT_EXTERNAL_API_TIMEOUT_MS,
  MAX_PENDING_EXTERNAL_API_REQUESTS,
  STALE_RESPONSE_WAIT_MS,
  containsCredentialFields,
  createExternalApiCacheKeySuffix,
  normalizeExternalApiRequestTarget,
} from './externalapi';

class TestExternalAPI extends ExternalAPI {
  public getBeforeRedirect() {
    return this.axios.defaults.beforeRedirect;
  }

  public getLookup() {
    return this.axios.defaults.lookup;
  }

  public getTimeout() {
    return this.axios.defaults.timeout;
  }

  public getMaxContentLength() {
    return this.axios.defaults.maxContentLength;
  }

  public getMaxBodyLength() {
    return this.axios.defaults.maxBodyLength;
  }

  public setAdapter(adapter: AxiosAdapter) {
    this.axios.defaults.adapter = adapter;
  }

  public getRollingForTest<T>(
    endpoint: string,
    ttl?: number,
    config?: AxiosRequestConfig
  ): Promise<T> {
    return this.getRolling<T>(endpoint, config, ttl);
  }

  public getForTest<T>(
    endpoint: string,
    config?: AxiosRequestConfig,
    ttl?: number,
    isUsableResponse?: (data: T) => boolean
  ): Promise<T> {
    return this.get<T>(endpoint, config, ttl, isUsableResponse);
  }

  public postForTest<T>(
    endpoint: string,
    data?: Record<string, unknown>,
    ttl?: number
  ): Promise<T> {
    return this.post<T>(endpoint, data, undefined, ttl);
  }

  public removeForTest(
    endpoint: string,
    options?: Record<string, unknown>
  ): void {
    this.removeCache(endpoint, options);
  }
}

describe('createExternalApiCacheKeySuffix', () => {
  it('uses a stable digest for equivalent option objects', () => {
    const first = createExternalApiCacheKeySuffix({
      headers: { 'X-Api-Key': 'key', Accept: 'application/json' },
      query: { b: 2, a: 1 },
    });
    const second = createExternalApiCacheKeySuffix({
      query: { a: 1, b: 2 },
      headers: { Accept: 'application/json', 'X-Api-Key': 'key' },
    });

    assert.equal(first, second);
  });

  it('keeps cache keys bounded and avoids retaining raw request options', () => {
    const secret = `token-${'x'.repeat(20_000)}`;
    const suffix = createExternalApiCacheKeySuffix({
      headers: { Authorization: `Bearer ${secret}` },
    });

    assert.match(suffix, /^:sha256:[a-f0-9]{64}$/);
    assert.equal(suffix.includes(secret), false);
  });

  it('does not throw on circular option objects', () => {
    const options: Record<string, unknown> = {};
    options.self = options;

    assert.match(createExternalApiCacheKeySuffix(options), /^:sha256:/);
  });

  it('distinguishes cycles from literal values and preserves alias semantics', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const shared = { value: 1 };

    assert.notEqual(
      createExternalApiCacheKeySuffix(circular),
      createExternalApiCacheKeySuffix({ self: '[Circular]' })
    );
    assert.equal(
      createExternalApiCacheKeySuffix({ first: shared, second: shared }),
      createExternalApiCacheKeySuffix({
        first: { value: 1 },
        second: { value: 1 },
      })
    );
  });

  it('keeps request values that JSON would collapse in separate cache keys', () => {
    assert.notEqual(
      createExternalApiCacheKeySuffix({ value: Number.NaN }),
      createExternalApiCacheKeySuffix({ value: null })
    );
    assert.notEqual(
      createExternalApiCacheKeySuffix({ value: undefined }),
      createExternalApiCacheKeySuffix({})
    );
    assert.notEqual(
      createExternalApiCacheKeySuffix({
        params: new URLSearchParams('page=1'),
      }),
      createExternalApiCacheKeySuffix({
        params: new URLSearchParams('page=2'),
      })
    );
  });
});

describe('ExternalAPI credential detection', () => {
  it('recognizes common credential parameter and header names', () => {
    assert.strictEqual(containsCredentialFields({ apikey: 'secret' }), true);
    assert.strictEqual(containsCredentialFields({ api_key: 'secret' }), true);
    assert.strictEqual(
      containsCredentialFields({ 'X-Plex-Token': 'secret' }),
      true
    );
    assert.strictEqual(
      containsCredentialFields({ Authorization: 'Bearer secret' }),
      true
    );
    assert.strictEqual(
      containsCredentialFields({ Accept: 'application/json' }),
      false
    );
    assert.strictEqual(
      containsCredentialFields({
        request: { headers: { clientSecret: 'nested-secret' } },
      }),
      true
    );
    assert.strictEqual(
      containsCredentialFields(new URLSearchParams('access_token=secret')),
      true
    );
    assert.strictEqual(
      containsCredentialFields(new URLSearchParams('page=1')),
      false
    );
  });
});

describe('ExternalAPI redirect handling', () => {
  it('rejects first-hop absolute URLs outside the configured origin', async () => {
    const api = new TestExternalAPI(
      'https://service.example/api',
      {},
      { headers: { Authorization: 'Bearer secret' } }
    );
    api.setAdapter(async (config) => ({
      config,
      data: { ok: true },
      headers: {},
      status: 200,
      statusText: 'OK',
    }));

    await assert.rejects(
      api.getForTest('https://attacker.example/collect'),
      /request target is not allowed/
    );
  });

  it('restricts per-request base URL overrides to explicit origins', async () => {
    const api = new TestExternalAPI('https://service.example/api', {});
    api.setAdapter(async (config) => ({
      config,
      data: { url: config.baseURL },
      headers: {},
      status: 200,
      statusText: 'OK',
    }));

    await assert.rejects(
      api.getForTest('/item', { baseURL: 'https://attacker.example' }),
      /request target is not allowed/
    );
  });

  it('allows explicitly configured base URL override origins', async () => {
    const api = new TestExternalAPI(
      'https://service.example/api',
      {},
      { allowedBaseUrls: ['https://metadata.example/v1'] }
    );
    api.setAdapter(async (config) => ({
      config,
      data: { url: config.baseURL },
      headers: {},
      status: 200,
      statusText: 'OK',
    }));

    assert.deepEqual(
      await api.getForTest('/item', {
        baseURL: 'https://metadata.example/v2',
      }),
      { url: 'https://metadata.example/v2' }
    );
  });

  it('rejects malformed base URLs before a request can be made', () => {
    assert.throws(
      () => new TestExternalAPI('http://:32400', {}),
      /Invalid URL/
    );
  });

  it('preserves a base URL path prefix when the endpoint starts with a slash', async () => {
    // Regression test: `new URL('/x', 'https://host/prefix')` resolves to
    // 'https://host/x', silently dropping '/prefix'. TMDB's base URL is
    // 'https://api.themoviedb.org/3' and every endpoint in this codebase is
    // written as an absolute-looking path like '/trending/all/day', so the
    // '/3' version prefix must survive.
    const api = new TestExternalAPI('https://service.example/v3', {});
    let requestedUrl: string | undefined;
    api.setAdapter(async (config) => {
      requestedUrl = config.url;
      return {
        config,
        data: { ok: true },
        headers: {},
        status: 200,
        statusText: 'OK',
      };
    });

    await api.getForTest('/trending/all/day');

    assert.equal(requestedUrl, 'https://service.example/v3/trending/all/day');
  });

  it('preserves versioned base paths for relative endpoints', () => {
    const allowedOrigins = new Set(['https://api.themoviedb.org']);

    assert.equal(
      normalizeExternalApiRequestTarget(
        '/trending/all/week',
        'https://api.themoviedb.org/3',
        allowedOrigins
      ),
      '/3/trending/all/week'
    );
    assert.equal(
      normalizeExternalApiRequestTarget(
        'movie/550?language=en',
        'https://api.themoviedb.org/3/',
        allowedOrigins
      ),
      '/3/movie/550?language=en'
    );
  });

  it('preserves allowed absolute request targets', () => {
    assert.equal(
      normalizeExternalApiRequestTarget(
        'https://api.themoviedb.org/3/movie/550',
        'https://api.themoviedb.org/3',
        new Set(['https://api.themoviedb.org'])
      ),
      '/3/movie/550'
    );
  });

  it('bounds requests when a client does not specify a timeout', () => {
    const defaultApi = new TestExternalAPI('https://service.example', {});
    const customApi = new TestExternalAPI(
      'https://service.example',
      {},
      {
        timeout: 25_000,
      }
    );

    assert.equal(defaultApi.getTimeout(), DEFAULT_EXTERNAL_API_TIMEOUT_MS);
    assert.equal(customApi.getTimeout(), 25_000);
  });

  it('bounds buffered responses and request bodies by default', () => {
    const defaultApi = new TestExternalAPI('https://service.example', {});
    const customApi = new TestExternalAPI(
      'https://service.example',
      {},
      {
        maxContentLength: 2048,
        maxBodyLength: 1024,
      }
    );

    assert.equal(
      defaultApi.getMaxContentLength(),
      DEFAULT_EXTERNAL_API_MAX_CONTENT_LENGTH
    );
    assert.equal(
      defaultApi.getMaxBodyLength(),
      DEFAULT_EXTERNAL_API_MAX_BODY_LENGTH
    );
    assert.equal(customApi.getMaxContentLength(), 2048);
    assert.equal(customApi.getMaxBodyLength(), 1024);
  });

  it('installs cross-origin credential stripping for API clients', () => {
    const api = new TestExternalAPI(
      'https://service.example',
      {},
      {
        headers: { 'X-Api-Key': 'secret' },
      }
    );
    const beforeRedirect = api.getBeforeRedirect();
    const headers = {
      Accept: 'application/json',
      'X-Api-Key': 'secret',
    };

    assert.equal(typeof beforeRedirect, 'function');
    assert.throws(
      () =>
        beforeRedirect?.(
          {
            href: 'https://attacker.example/final',
            hostname: 'attacker.example',
            protocol: 'https:',
            headers,
          },
          { headers: {}, statusCode: 307 },
          {
            headers: {},
            method: 'POST',
            url: 'https://service.example/start',
          }
        ),
      /cross-origin redirect/
    );

    assert.deepEqual(headers, { Accept: 'application/json' });
  });

  it('blocks private network destinations by default', async () => {
    const api = new TestExternalAPI('https://service.example', {});
    const lookup = api.getLookup();

    assert.equal(typeof lookup, 'function');
    await assert.rejects(
      new Promise<void>((resolve, reject) => {
        lookup?.('localhost', { all: true }, (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      }),
      (error: NodeJS.ErrnoException) => error.code === 'EACCES'
    );
  });
});

describe('ExternalAPI transient GET handling', () => {
  it('retries a transient provider failure before returning an error', async () => {
    const api = new TestExternalAPI('https://service.example', {});
    let calls = 0;
    api.setAdapter(async (config) => {
      calls += 1;
      if (calls === 1) {
        throw new axios.AxiosError('socket reset', 'ECONNRESET', config);
      }

      return {
        config,
        data: { ok: true },
        headers: {},
        status: 200,
        statusText: 'OK',
      };
    });

    assert.deepStrictEqual(await api.getForTest('/status'), { ok: true });
    assert.equal(calls, 2);
  });

  it('still surfaces a persistent transient provider failure', async () => {
    const api = new TestExternalAPI('https://service.example', {});
    let calls = 0;
    api.setAdapter(async (config) => {
      calls += 1;
      throw new axios.AxiosError(
        'upstream unavailable',
        'ERR_BAD_RESPONSE',
        config
      );
    });

    await assert.rejects(
      () => api.getForTest('/status'),
      /upstream unavailable/
    );
    assert.equal(calls, 2);
  });
});

describe('ExternalAPI rolling cache refresh', () => {
  it('bypasses existing rolling cache entries when TTL is zero', async () => {
    const cache = new NodeCache();
    const api = new TestExternalAPI(
      'https://service.example',
      {},
      { nodeCache: cache }
    );
    let calls = 0;
    api.setAdapter(async (config) => ({
      config,
      data: { call: ++calls },
      headers: {},
      status: 200,
      statusText: 'OK',
    }));

    assert.deepStrictEqual(await api.getRollingForTest('/item', 300), {
      call: 1,
    });
    assert.deepStrictEqual(await api.getRollingForTest('/item', 0), {
      call: 2,
    });
    assert.deepStrictEqual(await api.getRollingForTest('/item', 300), {
      call: 1,
    });
    assert.strictEqual(calls, 2);
  });

  it('registers stale cache refreshes for shutdown draining', async () => {
    const cache = new NodeCache();
    const api = new TestExternalAPI(
      'https://service.example',
      {},
      {
        nodeCache: cache,
      }
    );
    api.setAdapter(async (config) => ({
      config,
      data: { version: 1 },
      headers: {},
      status: 200,
      statusText: 'OK',
    }));

    assert.deepStrictEqual(
      await api.getRollingForTest<{ version: number }>('/item', 300),
      { version: 1 }
    );
    const [cacheKey] = cache.keys();
    assert.ok(cacheKey);
    assert.strictEqual(cache.ttl(cacheKey, 1), true);

    let releaseRefresh: (() => void) | undefined;
    const heldRefresh = new Promise<void>((resolve) => {
      releaseRefresh = resolve;
    });
    api.setAdapter(async (config) => {
      await heldRefresh;
      return {
        config,
        data: { version: 2 },
        headers: {},
        status: 200,
        statusText: 'OK',
      };
    });

    assert.deepStrictEqual(
      await api.getRollingForTest<{ version: number }>('/item', 300),
      { version: 1 }
    );
    assert.strictEqual(getPendingBackgroundTaskCount(), 1);

    let drained = false;
    const drain = waitForBackgroundTasks().then(() => {
      drained = true;
    });
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.strictEqual(drained, false);

    releaseRefresh?.();
    await drain;
    assert.strictEqual(getPendingBackgroundTaskCount(), 0);
    assert.deepStrictEqual(cache.get(cacheKey), { version: 2 });
  });

  it('does not detach refreshes that retain credentials', async () => {
    const cache = new NodeCache();
    const api = new TestExternalAPI(
      'https://service.example',
      {},
      {
        headers: { Authorization: 'Bearer secret' },
        nodeCache: cache,
      }
    );
    let calls = 0;
    api.setAdapter(async (config) => ({
      config,
      data: { version: ++calls },
      headers: {},
      status: 200,
      statusText: 'OK',
    }));

    assert.deepStrictEqual(
      await api.getRollingForTest<{ version: number }>('/item', 300),
      { version: 1 }
    );
    const [cacheKey] = cache.keys();
    assert.ok(cacheKey);
    assert.strictEqual(cache.ttl(cacheKey, 1), true);

    assert.deepStrictEqual(
      await api.getRollingForTest<{ version: number }>('/item', 300),
      { version: 1 }
    );
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.strictEqual(calls, 1);
    assert.strictEqual(getPendingBackgroundTaskCount(), 0);

    cache.del(cacheKey);
    assert.deepStrictEqual(
      await api.getRollingForTest<{ version: number }>('/item', 300),
      { version: 2 }
    );
  });

  it('does not detach refreshes with per-request credentials', async () => {
    const cache = new NodeCache();
    const api = new TestExternalAPI(
      'https://service.example',
      {},
      { nodeCache: cache }
    );
    let calls = 0;
    api.setAdapter(async (config) => ({
      config,
      data: { version: ++calls },
      headers: {},
      status: 200,
      statusText: 'OK',
    }));
    const requestConfig = {
      headers: { Authorization: 'Bearer request-secret' },
    };

    assert.deepStrictEqual(
      await api.getRollingForTest<{ version: number }>(
        '/item',
        300,
        requestConfig
      ),
      { version: 1 }
    );
    const [cacheKey] = cache.keys();
    assert.ok(cacheKey);
    assert.strictEqual(cache.ttl(cacheKey, 1), true);

    assert.deepStrictEqual(
      await api.getRollingForTest<{ version: number }>(
        '/item',
        300,
        requestConfig
      ),
      { version: 1 }
    );
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.strictEqual(calls, 1);
    assert.strictEqual(getPendingBackgroundTaskCount(), 0);
  });
});

describe('ExternalAPI cache isolation', () => {
  it('evicts unusable cached responses and retries an unusable provider response once', async () => {
    const cache = new NodeCache();
    const api = new TestExternalAPI(
      'https://service.example',
      {},
      { nodeCache: cache }
    );
    let calls = 0;
    api.setAdapter(async (config) => ({
      config,
      data: { items: ++calls < 2 ? [] : ['album'] },
      headers: {},
      status: 200,
      statusText: 'OK',
    }));

    const isUsable = (data: { items: string[] }) => data.items.length > 0;
    assert.deepStrictEqual(
      await api.getForTest('/music', undefined, 3600, isUsable),
      { items: ['album'] }
    );
    assert.strictEqual(calls, 2);
    assert.strictEqual(cache.keys().length, 0);

    assert.deepStrictEqual(
      await api.getForTest('/music', undefined, 3600, isUsable),
      { items: ['album'] }
    );
    assert.strictEqual(calls, 3);
    assert.strictEqual(cache.keys().length, 1);
  });

  it('bypasses existing GET cache entries when TTL is zero', async () => {
    const cache = new NodeCache();
    const api = new TestExternalAPI(
      'https://service.example',
      {},
      { nodeCache: cache }
    );
    let calls = 0;
    api.setAdapter(async (config) => ({
      config,
      data: { call: ++calls },
      headers: {},
      status: 200,
      statusText: 'OK',
    }));

    assert.deepStrictEqual(await api.getForTest('/item'), { call: 1 });
    assert.deepStrictEqual(await api.getForTest('/item', undefined, 0), {
      call: 2,
    });
    assert.deepStrictEqual(await api.getForTest('/item'), { call: 1 });
    assert.strictEqual(calls, 2);
  });

  it('preserves base URL and endpoint boundaries in cache keys', async () => {
    const cache = new NodeCache();
    const first = new TestExternalAPI(
      'https://service.example/a',
      {},
      { nodeCache: cache }
    );
    const second = new TestExternalAPI(
      'https://service.example/ab',
      {},
      { nodeCache: cache }
    );
    let firstCalls = 0;
    let secondCalls = 0;
    first.setAdapter(async (config) => ({
      config,
      data: { source: 'first', call: ++firstCalls },
      headers: {},
      status: 200,
      statusText: 'OK',
    }));
    second.setAdapter(async (config) => ({
      config,
      data: { source: 'second', call: ++secondCalls },
      headers: {},
      status: 200,
      statusText: 'OK',
    }));

    assert.deepStrictEqual(await first.getForTest('bc'), {
      source: 'first',
      call: 1,
    });
    assert.deepStrictEqual(await second.getForTest('c'), {
      source: 'second',
      call: 1,
    });
    assert.strictEqual(cache.keys().length, 2);
  });

  it('does not share cached or in-flight responses across credentials', async () => {
    const cache = new NodeCache();
    const first = new TestExternalAPI(
      'https://service.example',
      {},
      {
        headers: { Authorization: 'Bearer first-secret' },
        nodeCache: cache,
      }
    );
    const second = new TestExternalAPI(
      'https://service.example',
      {},
      {
        headers: { Authorization: 'Bearer second-secret' },
        nodeCache: cache,
      }
    );
    let firstCalls = 0;
    let secondCalls = 0;
    first.setAdapter(async (config) => {
      firstCalls += 1;
      await new Promise<void>((resolve) => setImmediate(resolve));
      return {
        config,
        data: { account: 'first' },
        headers: {},
        status: 200,
        statusText: 'OK',
      };
    });
    second.setAdapter(async (config) => {
      secondCalls += 1;
      return {
        config,
        data: { account: 'second' },
        headers: {},
        status: 200,
        statusText: 'OK',
      };
    });

    const [firstResponse, secondResponse] = await Promise.all([
      first.getForTest<{ account: string }>('/account'),
      second.getForTest<{ account: string }>('/account'),
    ]);

    assert.deepStrictEqual(firstResponse, { account: 'first' });
    assert.deepStrictEqual(secondResponse, { account: 'second' });
    assert.strictEqual(firstCalls, 1);
    assert.strictEqual(secondCalls, 1);
    assert.strictEqual(cache.keys().length, 2);
    assert.strictEqual(
      cache.keys().some((key) => key.includes('secret')),
      false
    );

    assert.deepStrictEqual(
      await first.getForTest<{ account: string }>('/account'),
      { account: 'first' }
    );
    assert.deepStrictEqual(
      await second.getForTest<{ account: string }>('/account'),
      { account: 'second' }
    );
    assert.strictEqual(firstCalls, 1);
    assert.strictEqual(secondCalls, 1);
  });

  it('separates per-request base URL overrides', async () => {
    const cache = new NodeCache();
    const api = new TestExternalAPI(
      'https://service.example',
      {},
      {
        allowedBaseUrls: ['https://first.example', 'https://second.example'],
        nodeCache: cache,
      }
    );
    api.setAdapter(async (config) => ({
      config,
      data: { baseURL: config.baseURL },
      headers: {},
      status: 200,
      statusText: 'OK',
    }));

    const first = await api.getForTest<{ baseURL: string }>('/item', {
      baseURL: 'https://first.example',
    });
    const second = await api.getForTest<{ baseURL: string }>('/item', {
      baseURL: 'https://second.example',
    });

    assert.strictEqual(first.baseURL, 'https://first.example');
    assert.strictEqual(second.baseURL, 'https://second.example');
    assert.strictEqual(cache.keys().length, 2);
  });

  it('keeps query parameters separate from transport cache fields', async () => {
    const cache = new NodeCache();
    const api = new TestExternalAPI(
      'https://service.example',
      {},
      { nodeCache: cache }
    );
    let calls = 0;
    api.setAdapter(async (config) => ({
      config,
      data: { call: ++calls, params: config.params },
      headers: {},
      status: 200,
      statusText: 'OK',
    }));

    assert.deepStrictEqual(
      await api.getForTest('/item', {
        params: { headers: 'query-header', baseURL: 'query-base' },
      }),
      {
        call: 1,
        params: { headers: 'query-header', baseURL: 'query-base' },
      }
    );
    assert.deepStrictEqual(await api.getForTest('/item', { params: {} }), {
      call: 2,
      params: {},
    });
    assert.strictEqual(cache.keys().length, 2);

    api.removeForTest('/item', {
      headers: 'query-header',
      baseURL: 'query-base',
    });
    assert.deepStrictEqual(
      await api.getForTest('/item', {
        params: { headers: 'query-header', baseURL: 'query-base' },
      }),
      {
        call: 3,
        params: { headers: 'query-header', baseURL: 'query-base' },
      }
    );
  });

  it('returns successful provider data when the cache rejects a write', async () => {
    const cache = new NodeCache();
    cache.set = (() => {
      throw new Error('cache unavailable');
    }) as typeof cache.set;
    const api = new TestExternalAPI(
      'https://service.example',
      {},
      { nodeCache: cache }
    );
    api.setAdapter(async (config) => ({
      config,
      data: { ok: true },
      headers: {},
      status: 200,
      statusText: 'OK',
    }));

    assert.deepStrictEqual(await api.getForTest('/item'), { ok: true });
  });
});

describe('ExternalAPI POST cache semantics', () => {
  it('does not cache or coalesce POST requests without an explicit TTL', async () => {
    const cache = new NodeCache();
    const api = new TestExternalAPI(
      'https://service.example',
      {},
      { nodeCache: cache }
    );
    let calls = 0;
    api.setAdapter(async (config) => {
      await new Promise<void>((resolve) => setImmediate(resolve));
      return {
        config,
        data: { call: ++calls },
        headers: {},
        status: 200,
        statusText: 'OK',
      };
    });

    const responses = await Promise.all([
      api.postForTest<{ call: number }>('/command', { name: 'Search' }),
      api.postForTest<{ call: number }>('/command', { name: 'Search' }),
    ]);

    assert.strictEqual(calls, 2);
    assert.deepStrictEqual(
      responses.map((response) => response.call).sort(),
      [1, 2]
    );
    assert.strictEqual(cache.keys().length, 0);
  });

  it('caches read-only POST requests when given a positive TTL', async () => {
    const cache = new NodeCache();
    const api = new TestExternalAPI(
      'https://service.example',
      {},
      { nodeCache: cache }
    );
    let calls = 0;
    api.setAdapter(async (config) => ({
      config,
      data: { call: ++calls },
      headers: {},
      status: 200,
      statusText: 'OK',
    }));

    assert.deepStrictEqual(
      await api.postForTest('/search', { query: 'item' }, 300),
      { call: 1 }
    );
    assert.deepStrictEqual(
      await api.postForTest('/search', { query: 'item' }, 300),
      { call: 1 }
    );
    assert.strictEqual(calls, 1);
    assert.strictEqual(cache.keys().length, 1);
  });
});

describe('ExternalAPI in-flight admission', () => {
  it('bounds unique pending work while preserving request coalescing', async () => {
    const api = new TestExternalAPI('https://service.example', {});
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let adapterCalls = 0;
    api.setAdapter(async (config) => {
      adapterCalls += 1;
      await held;
      return {
        config,
        data: { ok: true },
        headers: {},
        status: 200,
        statusText: 'OK',
      };
    });

    const admitted = Array.from(
      { length: MAX_PENDING_EXTERNAL_API_REQUESTS },
      (_, index) => api.getForTest<{ ok: boolean }>(`/held/${index}`)
    );
    const coalesced = api.getForTest<{ ok: boolean }>('/held/0');
    const rejected = api.getForTest('/over-capacity');

    assert.strictEqual(adapterCalls, 0);
    await assert.rejects(rejected, /request capacity exceeded/);

    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.strictEqual(adapterCalls, MAX_PENDING_EXTERNAL_API_REQUESTS);
    release();
    await Promise.all([...admitted, coalesced]);

    assert.deepStrictEqual(await api.getForTest('/after-drain'), { ok: true });
    assert.strictEqual(adapterCalls, MAX_PENDING_EXTERNAL_API_REQUESTS + 1);
  });
});

describe('ExternalAPI expired cache entries', () => {
  const expiredCache = async (api: TestExternalAPI, cache: Cache) => {
    // cache "/feed" for one second, then let it expire
    api.setAdapter(async (config) => ({
      config,
      data: { version: 'old' },
      headers: {},
      status: 200,
      statusText: 'OK',
    }));
    await api.getForTest('/feed', undefined, 1);
    const now = Date.now();
    mock.method(Date, 'now', () => now + 2_000);
    assert.strictEqual(cache.data.keys().length, 1);
  };
  const setup = () => {
    const cache = new Cache('tmdb', 'Test cache', {
      checkPeriod: 0,
      staleMaxAge: 3600,
    });
    const api = new TestExternalAPI(
      'https://service.example',
      { api_key: 'secret' },
      { nodeCache: cache.data }
    );
    return { cache, api };
  };
  afterEach(() => mock.restoreAll());

  it('answers from the expired copy while the provider is slow, then refreshes', async () => {
    const { cache, api } = setup();
    await expiredCache(api, cache);
    let finish: (() => void) | undefined;
    api.setAdapter(
      (config) =>
        new Promise((resolve) => {
          finish = () =>
            resolve({
              config,
              data: { version: 'new' },
              headers: {},
              status: 200,
              statusText: 'OK',
            });
        })
    );
    const started = performance.now();
    assert.deepStrictEqual(await api.getForTest('/feed', undefined, 600), {
      version: 'old',
    });
    assert.ok(performance.now() - started >= STALE_RESPONSE_WAIT_MS - 10);
    assert.ok(performance.now() - started < STALE_RESPONSE_WAIT_MS + 1_000);
    finish?.();
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepStrictEqual(await api.getForTest('/feed', undefined, 600), {
      version: 'new',
    });
  });

  it('answers from the expired copy when the provider fails', async () => {
    const { cache, api } = setup();
    await expiredCache(api, cache);
    api.setAdapter(async () => {
      throw Object.assign(new Error('Service unavailable'), {
        response: { status: 503 },
      });
    });
    assert.deepStrictEqual(await api.getForTest('/feed', undefined, 600), {
      version: 'old',
    });
  });

  for (const status of [401, 403, 404]) {
    it(`does not conceal a provider ${status} behind a stale copy`, async () => {
      const { cache, api } = setup();
      await expiredCache(api, cache);
      const failure = Object.assign(new Error('Provider denied request'), {
        response: { status },
      });
      api.setAdapter(async () => {
        throw failure;
      });
      await assert.rejects(api.getForTest('/feed', undefined, 600), failure);
      assert.strictEqual(cache.snapshot().entries.length, 0);
    });
  }

  it('does not answer stale after the caller aborts a slow read', async () => {
    const { cache, api } = setup();
    await expiredCache(api, cache);
    const controller = new AbortController();
    let finish: (() => void) | undefined;
    api.setAdapter(
      (config) =>
        new Promise((resolve) => {
          finish = () =>
            resolve({
              config,
              data: { version: 'new' },
              headers: {},
              status: 200,
              statusText: 'OK',
            });
        })
    );
    const request = api.getForTest('/feed', { signal: controller.signal }, 600);
    setTimeout(() => controller.abort(), 50);
    try {
      await assert.rejects(request, { code: 'ERR_CANCELED' });
    } finally {
      finish?.();
      await new Promise((resolve) => setImmediate(resolve));
    }
  });

  it('prefers a provider answer that arrives in time', async () => {
    const { cache, api } = setup();
    await expiredCache(api, cache);
    api.setAdapter(async (config) => ({
      config,
      data: { version: 'new' },
      headers: {},
      status: 200,
      statusText: 'OK',
    }));
    assert.deepStrictEqual(await api.getForTest('/feed', undefined, 600), {
      version: 'new',
    });
  });

  it('never answers from an expired copy when the caller bypasses the cache', async () => {
    const { cache, api } = setup();
    await expiredCache(api, cache);
    api.setAdapter(async (config) => ({
      config,
      data: { version: 'new' },
      headers: {},
      status: 200,
      statusText: 'OK',
    }));
    assert.deepStrictEqual(await api.getForTest('/feed', undefined, 0), {
      version: 'new',
    });
  });
});
