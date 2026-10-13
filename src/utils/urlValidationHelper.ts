import { hasAsciiControlCharacters } from './safeUrl';

const REDIRECT_BASE_URL = 'http://seerrng.invalid';
const AUTH_ROUTE_PREFIXES = ['/login', '/setup', '/resetpassword'];

export function isValidURL(value: unknown) {
  try {
    let url: URL;
    if (value === undefined || value === null || value === '') {
      return true;
    } else if (typeof value === 'string' && !hasAsciiControlCharacters(value)) {
      url = new URL(value);
    } else if (value instanceof URL) {
      url = value;
    } else {
      return false;
    }
    return (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

const isAuthenticationRoute = (pathname: string): boolean =>
  AUTH_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );

const getSafeFallbackHash = (value: unknown): string => {
  if (
    typeof value !== 'string' ||
    !value.startsWith('#') ||
    value.length < 2 ||
    hasAsciiControlCharacters(value)
  ) {
    return '';
  }

  // Login links use the URL fragment to carry a one-time token. Never copy it
  // into the destination URL when a browser inherits the fragment on redirect.
  if (new URLSearchParams(value.slice(1)).has('loginToken')) {
    return '';
  }

  return value;
};

/**
 * Accepts only a same-site application path and returns its normalized path,
 * query, and fragment. A fragment inherited by the browser can be supplied
 * separately when the server could not see it on the original request.
 */
export function getSafeRedirect(value: unknown, fallbackHash?: string): string {
  if (
    typeof value !== 'string' ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value.includes('\\') ||
    hasAsciiControlCharacters(value)
  ) {
    return '/';
  }

  try {
    const url = new URL(value, REDIRECT_BASE_URL);
    if (
      url.origin !== REDIRECT_BASE_URL ||
      url.pathname.startsWith('//') ||
      isAuthenticationRoute(url.pathname)
    ) {
      return '/';
    }

    return `${url.pathname}${url.search}${url.hash || getSafeFallbackHash(fallbackHash)}`;
  } catch {
    return '/';
  }
}

/** Builds the local login URL while keeping an optional safe destination. */
export function getLoginUrl(path?: string): string {
  const redirect = getSafeRedirect(path);
  return redirect === '/'
    ? '/login'
    : `/login?redirect=${encodeURIComponent(redirect)}`;
}
