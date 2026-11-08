import axios, { type AxiosError, type GenericAbortSignal } from 'axios';

export type HttpErrorDetails = {
  errorMessage: string;
  errorCode?: string;
  status?: number;
  upstreamMethod?: string;
  upstreamHost?: string;
  upstreamPath?: string;
  upstreamStatusCode?: number;
  upstreamMessage?: string;
};

type ErrorWithCause = {
  cause?: unknown;
};

const findAxiosError = (error: unknown): AxiosError | undefined => {
  let current = error;
  const seen = new Set<object>();

  for (
    let depth = 0;
    current !== undefined && current !== null && depth < 8;
    depth++
  ) {
    if (axios.isAxiosError(current)) {
      return current;
    }

    if (typeof current !== 'object') {
      return undefined;
    }
    if (seen.has(current)) {
      return undefined;
    }
    seen.add(current);
    current = (current as ErrorWithCause).cause;
  }

  return undefined;
};

const getRetryAfterHeader = (error: unknown): string | undefined => {
  let current = error;
  const seen = new Set<object>();

  for (
    let depth = 0;
    current !== undefined && current !== null && depth < 8;
    depth++
  ) {
    if (typeof current !== 'object') {
      return undefined;
    }
    if (seen.has(current)) {
      return undefined;
    }
    seen.add(current);

    const response = (
      current as {
        response?: {
          headers?: Record<string, unknown> & {
            get?: (name: string) => unknown;
          };
        };
      }
    ).response;
    const headers = response?.headers;
    const header =
      headers?.['retry-after'] ??
      headers?.['Retry-After'] ??
      headers?.get?.('retry-after');
    if (Array.isArray(header)) {
      return typeof header[0] === 'string' ? header[0] : undefined;
    }
    if (typeof header === 'string') {
      return header;
    }

    current = (current as ErrorWithCause).cause;
  }

  return undefined;
};

const sanitizeUpstreamMessage = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }

  const sanitized = value
    // Control characters are intentionally stripped from untrusted error text.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f-\u009f]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .replace(/\bBearer\s+[^\s,;]+/giu, 'Bearer [redacted]')
    .replace(
      /((?:api[_-]?key|access[_-]?token|token|secret|password)["']?\s*[:=]\s*["']?)[^&\s"',}]*/giu,
      '$1[redacted]'
    )
    .trim()
    .slice(0, 512);

  return sanitized || undefined;
};

const getUpstreamTarget = (
  error: AxiosError
): Pick<
  HttpErrorDetails,
  'upstreamMethod' | 'upstreamHost' | 'upstreamPath'
> => {
  const config = error.config;
  const requestUrl = config?.url;
  const baseUrl = config?.baseURL;
  let target: URL;

  try {
    if (requestUrl) {
      try {
        target = new URL(requestUrl);
      } catch {
        if (!baseUrl) {
          return {};
        }

        // Axios joins relative request paths to baseURL, even when that URL's
        // last path segment has no trailing slash (for example, /3 + /movie).
        const normalizedBaseUrl = `${baseUrl.replace(/\/+$/u, '')}/`;
        target = new URL(requestUrl.replace(/^\/+/, ''), normalizedBaseUrl);
      }
    } else if (baseUrl) {
      target = new URL(baseUrl);
    } else {
      return {};
    }
  } catch {
    return {};
  }

  return {
    ...(config?.method
      ? { upstreamMethod: config.method.toUpperCase().slice(0, 12) }
      : {}),
    ...(target.hostname ? { upstreamHost: target.hostname.slice(0, 253) } : {}),
    ...(target.pathname ? { upstreamPath: target.pathname.slice(0, 512) } : {}),
  };
};

export const getRetryAfterMs = (error: unknown): number | undefined => {
  const value = getRetryAfterHeader(error)?.trim();
  if (!value) {
    return undefined;
  }

  const seconds = Number(value);
  if (Number.isFinite(seconds)) {
    return seconds >= 0 ? Math.min(seconds * 1000, 10_000) : undefined;
  }

  const date = Date.parse(value);
  return Number.isNaN(date)
    ? undefined
    : Math.min(Math.max(date - Date.now(), 0), 10_000);
};

export const getHttpErrorDetails = (error: unknown): HttpErrorDetails => {
  const axiosError = findAxiosError(error);
  if (axiosError) {
    const responseData = axiosError.response?.data;
    const responseRecord =
      responseData &&
      typeof responseData === 'object' &&
      !Array.isArray(responseData)
        ? (responseData as Record<string, unknown>)
        : undefined;
    const responseMessageKeys = [
      'status_message',
      'message',
      'error_description',
      'detail',
      'error',
      'title',
    ] as const;
    const responseMessage = responseRecord
      ? responseMessageKeys
          .map((key) => responseRecord[key])
          .map((value) =>
            value && typeof value === 'object' && !Array.isArray(value)
              ? (value as Record<string, unknown>).message
              : value
          )
          .find((value): value is string => typeof value === 'string')
      : undefined;
    const responseErrors = responseRecord?.errors;
    const firstResponseError = Array.isArray(responseErrors)
      ? responseErrors.find(
          (value): value is string => typeof value === 'string'
        )
      : undefined;
    const upstreamMessage = sanitizeUpstreamMessage(
      responseMessage ?? firstResponseError ?? axiosError.response?.statusText
    );
    const rawErrorMessage =
      error instanceof Error
        ? error.message || error.name
        : axiosError.message || axiosError.name;
    const errorMessage = sanitizeUpstreamMessage(rawErrorMessage);

    return {
      errorMessage: errorMessage || 'Unknown HTTP error',
      ...(axiosError.code ? { errorCode: axiosError.code } : {}),
      ...(axiosError.response?.status
        ? { status: axiosError.response.status }
        : {}),
      ...getUpstreamTarget(axiosError),
      ...(responseRecord && Number.isSafeInteger(responseRecord.status_code)
        ? { upstreamStatusCode: responseRecord.status_code as number }
        : {}),
      ...(upstreamMessage ? { upstreamMessage } : {}),
    };
  }

  if (error instanceof Error) {
    return {
      errorMessage:
        sanitizeUpstreamMessage(error.message) || error.name || 'Unknown error',
    };
  }

  return {
    errorMessage:
      sanitizeUpstreamMessage(String(error || 'Unknown error')) ||
      'Unknown error',
  };
};

export const hasHttpStatus = (
  error: unknown,
  expectedStatus: number
): boolean => {
  if (
    !Number.isInteger(expectedStatus) ||
    expectedStatus < 100 ||
    expectedStatus > 599
  ) {
    return false;
  }

  let current = error;
  const seen = new Set<object>();

  for (
    let depth = 0;
    current !== undefined && current !== null && depth < 8;
    depth++
  ) {
    if (typeof current === 'object') {
      if (seen.has(current)) {
        return false;
      }
      seen.add(current);
    }

    if (
      axios.isAxiosError(current) &&
      current.response?.status === expectedStatus
    ) {
      return true;
    }

    const record =
      typeof current === 'object'
        ? (current as {
            status?: unknown;
            statusCode?: unknown;
            cause?: unknown;
            response?: { status?: unknown };
          })
        : undefined;
    if (
      record?.status === expectedStatus ||
      record?.statusCode === expectedStatus ||
      record?.response?.status === expectedStatus
    ) {
      return true;
    }

    const message =
      current instanceof Error
        ? current.message
        : typeof current === 'string'
          ? current
          : '';
    if (
      message.trim() === String(expectedStatus) ||
      // nosemgrep: javascript.lang.security.audit.detect-non-literal-regexp.detect-non-literal-regexp -- expectedStatus is a number, never user text
      new RegExp(
        `(?:http|status(?:\\s+code)?)\\D{0,20}${expectedStatus}(?:\\D|$)`,
        'i'
      ).test(message)
    ) {
      return true;
    }

    current = record?.cause;
  }

  return false;
};

export const isTransientHttpError = (error: unknown): boolean => {
  const axiosError = findAxiosError(error);
  if (!axiosError) {
    return false;
  }

  const status = axiosError.response?.status;

  return (
    status === undefined || status === 408 || status === 429 || status >= 500
  );
};

export const withTransientHttpRetry = async <T>(
  request: () => Promise<T>,
  {
    maxAttempts = 2,
    delayMs = 250,
    onRetry,
    signal,
  }: {
    maxAttempts?: number;
    signal?: GenericAbortSignal;
    delayMs?: number;
    onRetry?: (error: unknown, nextAttempt: number) => void;
  } = {}
): Promise<T> => {
  let attempt = 1;

  while (true) {
    if (signal?.aborted) throw new axios.CanceledError('Request canceled.');
    try {
      return await request();
    } catch (error) {
      if (
        signal?.aborted ||
        attempt >= maxAttempts ||
        !isTransientHttpError(error)
      ) {
        throw error;
      }

      attempt += 1;
      onRetry?.(error, attempt);
      const retryDelay =
        getRetryAfterMs(error) ??
        Math.min(Math.max(delayMs, 0) * 2 ** (attempt - 2), 10_000);
      await new Promise<void>((resolve, reject) => {
        const canceled = () => {
          clearTimeout(timer);
          signal?.removeEventListener?.('abort', canceled);
          reject(new axios.CanceledError('Request canceled.'));
        };
        const timer = setTimeout(() => {
          signal?.removeEventListener?.('abort', canceled);
          resolve();
        }, retryDelay);
        signal?.addEventListener?.('abort', canceled, { once: true });
        if (signal?.aborted) canceled();
      });
    }
  }
};
