import axios, {
  AxiosError,
  AxiosHeaders,
  type AxiosInstance,
  type InternalAxiosRequestConfig,
} from 'axios';
import type { SWRConfiguration } from 'swr';

const DEFAULT_RETRY_DELAY = 60_000;
const MAX_TIMER_DELAY = 2_147_483_647;

type HttpError = {
  retryAt?: number;
  response?: { status?: number; headers?: unknown };
};

const header = (headers: unknown, name: string): string | undefined => {
  if (!headers || typeof headers !== 'object') return;
  const entry = Object.entries(headers).find(
    ([key]) => key.toLowerCase() === name
  );
  return entry && entry[1] != null ? String(entry[1]) : undefined;
};

// Retry-After permits delay seconds or an HTTP date. The response Date avoids
// shortening a server's wait when the browser clock is skewed.
export const parseRetryAfter = (
  value: string | undefined,
  now = Date.now(),
  serverDate?: string
): number => {
  const text = value?.trim() ?? '';
  let delay = DEFAULT_RETRY_DELAY;
  if (/^\d+(?:\.\d+)?$/.test(text)) {
    const seconds = Number(text);
    if (Number.isFinite(seconds)) delay = seconds * 1000;
  } else if (text && !/^-?\d/.test(text)) {
    const date = Date.parse(text);
    const responseDate = Date.parse(serverDate ?? '');
    if (Number.isFinite(date))
      delay = date - (Number.isFinite(responseDate) ? responseDate : now);
  }
  // Retain long waits in full; cap individual timers, never the cooldown.
  return Math.max(1000, Number.isFinite(delay) ? delay : DEFAULT_RETRY_DELAY);
};

export class ApiRateLimitController {
  private retryAt = 0;
  private listeners = new Set<() => void>();

  getSnapshot = (): number => this.retryAt;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  remaining = (): number => Math.max(0, this.retryAt - Date.now());

  record(error: HttpError): void {
    if (error.response?.status !== 429 || error.retryAt) return;
    this.retryAt = Math.max(
      this.retryAt,
      Date.now() +
        parseRetryAfter(
          header(error.response.headers, 'retry-after'),
          Date.now(),
          header(error.response.headers, 'date')
        )
    );
    error.retryAt = this.retryAt;
    this.listeners.forEach((listener) => listener());
  }

  install(client: AxiosInstance, origin: string): () => void {
    const isAppApi = (config: InternalAxiosRequestConfig) => {
      try {
        const url = new URL(config.url ?? '', config.baseURL || origin);
        return url.origin === origin && url.pathname.startsWith('/api/');
      } catch {
        return false;
      }
    };
    const request = client.interceptors.request.use((config) => {
      if (!isAppApi(config) || !this.remaining()) return config;
      const error: AxiosError & HttpError = new AxiosError(
        'Requests are temporarily paused. Please try again after the cooldown.',
        'ERR_API_RATE_LIMIT',
        config,
        undefined,
        {
          config,
          data: undefined,
          status: 429,
          statusText: 'Too Many Requests',
          headers: new AxiosHeaders({
            'retry-after': String(Math.ceil(this.remaining() / 1000)),
          }),
        }
      );
      error.retryAt = this.retryAt;
      // Reject locally rather than queue delayed writes. Mutations must be
      // retried explicitly, never automatically replayed after the cooldown.
      return Promise.reject(error);
    });
    const response = client.interceptors.response.use(undefined, (error) => {
      if (error.config && isAppApi(error.config)) this.record(error);
      return Promise.reject(error);
    });
    return () => {
      client.interceptors.request.eject(request);
      client.interceptors.response.eject(response);
    };
  }
}

export const apiRateLimit = new ApiRateLimitController();

export const isRateLimitError = (error: unknown): boolean =>
  (error as HttpError | undefined)?.response?.status === 429;

export const installApiRateLimitHandling = (): (() => void) =>
  apiRateLimit.install(axios, window.location.origin);

export const retryApiRead: NonNullable<SWRConfiguration['onErrorRetry']> = (
  error: HttpError,
  _key,
  config,
  revalidate,
  options
) => {
  const status = error.response?.status;
  if (
    options.retryCount > (config.errorRetryCount ?? 3) ||
    (status && status >= 400 && status < 500 && ![408, 429].includes(status))
  )
    return;

  const retryAt =
    status === 429
      ? (error.retryAt ??
        Date.now() +
          parseRetryAfter(header(error.response?.headers, 'retry-after')))
      : Date.now() +
        Math.min(
          60_000,
          (config.errorRetryInterval ?? 5000) *
            2 ** Math.min(options.retryCount - 1, 4)
        );
  const schedule = () => {
    const remaining = Math.max(retryAt - Date.now(), apiRateLimit.remaining());
    if (remaining > 0) {
      setTimeout(schedule, Math.min(remaining, MAX_TIMER_DELAY));
    } else {
      void revalidate(options);
    }
  };
  setTimeout(
    schedule,
    Math.min(Math.max(1000, retryAt - Date.now()), MAX_TIMER_DELAY)
  );
};
