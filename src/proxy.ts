import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { isAuthenticationError } from './utils/auth';
import { getInternalApiBaseUrl } from './utils/internalApi';
import {
  buildLoginPath,
  getSafeReturnPath,
  LOGIN_RETURN_PARAM,
} from './utils/loginReturn';
import {
  isLoginPath,
  isPathPrefix,
  isPlexLoginCompletionPath,
  isResetPasswordPath,
  isSetupPath,
} from './utils/routeAccess';

export const INTERNAL_API_FETCH_TIMEOUT_MS = 5_000;

const internalApiFetchOptions = () => ({
  cache: 'no-store' as const,
  signal: AbortSignal.timeout(INTERNAL_API_FETCH_TIMEOUT_MS),
});

const isPlexLoginPath = (pathname: string): boolean =>
  isPathPrefix(pathname, '/login/plex');

/**
 * Replaces the server-side auth/redirect logic that previously lived in
 * `_app`'s getInitialProps. Moving it here lets pages be statically
 * optimized while preserving the original redirect behavior. The
 * client-side UserContext still revalidates the session on soft
 * navigations as a defense-in-depth fallback.
 */
export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isPlexLoginCompletion = isPlexLoginCompletionPath(
    pathname,
    req.nextUrl.searchParams.get('complete')
  );
  const apiBaseUrl = getInternalApiBaseUrl();

  let settings: { initialized?: boolean };
  try {
    const res = await fetch(`${apiBaseUrl}/api/v1/settings/public`, {
      ...internalApiFetchOptions(),
      headers: { accept: 'application/json' },
    });
    if (!res.ok) {
      return NextResponse.next();
    }
    settings = await res.json();
  } catch {
    // Backend not reachable (e.g. still starting up) — fail open and let
    // the client-side guards handle it rather than hard-failing every route.
    return NextResponse.next();
  }

  if (!settings.initialized) {
    if (!isSetupPath(pathname) && !isPlexLoginPath(pathname)) {
      return NextResponse.redirect(new URL('/setup', req.url));
    }
    return NextResponse.next();
  }

  let authed = false;
  try {
    const cookie = req.headers.get('cookie');
    const res = await fetch(`${apiBaseUrl}/api/v1/auth/me`, {
      ...internalApiFetchOptions(),
      headers: cookie ? { cookie } : undefined,
    });
    if (res.ok) {
      authed = true;
    } else if (!isAuthenticationError({ status: res.status })) {
      // A backend failure is not proof that the user's session is invalid.
      // Keep the page request alive so the client can retry instead of
      // turning a transient outage into a forced login.
      return NextResponse.next();
    }
  } catch {
    // A timeout or connection failure is not an authentication decision.
    return NextResponse.next();
  }

  if (authed) {
    if (
      (isSetupPath(pathname) || isLoginPath(pathname)) &&
      !isPlexLoginCompletion
    ) {
      // An already signed-in visitor goes straight to the saved destination.
      const destination = isLoginPath(pathname)
        ? getSafeReturnPath(req.nextUrl.searchParams.get(LOGIN_RETURN_PARAM))
        : undefined;
      return NextResponse.redirect(new URL(destination ?? '/', req.url));
    }
  } else if (
    !isLoginPath(pathname) &&
    !isSetupPath(pathname) &&
    !isResetPasswordPath(pathname)
  ) {
    return NextResponse.redirect(
      new URL(buildLoginPath(pathname, req.nextUrl.search), req.url)
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!api|imageproxy|avatarproxy|api-docs|_next|favicon.ico|.*\\.).*)',
  ],
};
