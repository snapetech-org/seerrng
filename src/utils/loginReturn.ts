import { isPublicAuthPath } from './routeAccess';

export const LOGIN_RETURN_PARAM = 'returnTo';

const MAX_RETURN_PATH_LENGTH = 2048;
const PARSE_ORIGIN = 'http://return-path.invalid';

/**
 * Accepts only a same-origin, in-app path. Anything that could leave the app
 * (absolute URLs, protocol-relative paths, backslashes, control characters) or
 * land back on an auth page is rejected.
 */
export const getSafeReturnPath = (value: unknown): string | undefined => {
  if (typeof value !== 'string' || value.length > MAX_RETURN_PATH_LENGTH) {
    return undefined;
  }
  if (!value.startsWith('/') || value.startsWith('//')) {
    return undefined;
  }
  // eslint-disable-next-line no-control-regex
  if (/[\\\u0000-\u001f\u007f]/.test(value)) {
    return undefined;
  }

  let parsed: URL;
  try {
    parsed = new URL(value, PARSE_ORIGIN);
  } catch {
    return undefined;
  }
  if (parsed.origin !== PARSE_ORIGIN || isPublicAuthPath(parsed.pathname)) {
    return undefined;
  }

  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
};

export const buildLoginPath = (pathname: string, search = ''): string => {
  const returnPath = getSafeReturnPath(`${pathname}${search}`);
  if (!returnPath || returnPath === '/') {
    return '/login';
  }

  return `/login?${LOGIN_RETURN_PARAM}=${encodeURIComponent(returnPath)}`;
};
