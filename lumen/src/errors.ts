import { ApiError } from './api';

// Plain words for people instead of "Failed to fetch" or "Internal Server Error". The raw
// error stays in the console for whoever has to debug it.
export function friendlyError(
  e: unknown,
  fallback = 'Something went wrong. Try again.'
) {
  console.warn('Lumen request failed:', e);
  const raw = e instanceof Error ? e.message : '';
  if (e instanceof ApiError) {
    // a sentence the server wrote for people is better than anything generic here
    const generic =
      !/\s/.test(raw) ||
      /^(internal server error|bad gateway|service unavailable|gateway timeout|forbidden|unauthorized|too many requests|request timeout|not found|bad request)\.?$/i.test(
        raw.trim()
      );
    if (raw && !generic) return raw;
    if (e.status === 401) return 'Your session ended. Sign in again.';
    if (e.status === 403) return 'You don’t have permission to do that.';
    if (e.status === 408 || e.status === 504)
      return 'The server took too long to answer. Try again.';
    if (e.status === 429)
      return 'Too many requests. Wait a minute and try again.';
    if (e.status >= 500)
      return 'The server had a problem. Try again in a moment.';
    return fallback;
  }
  if (
    (typeof navigator !== 'undefined' && navigator.onLine === false) ||
    /failed to fetch|load failed|networkerror|network request failed/i.test(raw)
  )
    return typeof navigator !== 'undefined' && navigator.onLine === false
      ? 'You’re offline. Check your connection and try again.'
      : 'Couldn’t reach the server. Check your connection and try again.';
  if (e instanceof DOMException && /abort|timeout/i.test(e.name))
    return 'The server took too long to answer. Try again.';
  return raw || fallback;
}
