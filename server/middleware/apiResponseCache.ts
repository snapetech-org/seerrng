import type { NextFunction, Request, Response } from 'express';

type JsonBody = Parameters<Response['json']>[0];

const cacheableRoutePatterns = [
  /^\/settings\/public$/,
  /^\/settings\/discover$/,
  /^\/discover(?:\/|$)/,
  /^\/search(?:\/|$)/,
  /^\/movie\/\d+/,
  /^\/tv\/\d+/,
  /^\/collection\/\d+/,
  /^\/person\/\d+/,
  /^\/music\/[^/]+/,
  /^\/book\/[^/]+/,
  /^\/author\/[^/]+/,
  /^\/artist\/[^/]+/,
];

const getCacheControl = (path: string, isAuthenticated: boolean) => {
  if (
    /^\/tv\/\d+\/media-server-(?:collections|saved-item)(?:\/|$)/.test(path)
  ) {
    // Membership and saved state are mutable outside SeerrNG and are re-read
    // immediately before every add/remove action. A browser-cached response is
    // not authoritative.
    return 'private, no-store';
  }

  if (path === '/settings/public') {
    // These values control authentication and media visibility. A stale 304
    // can silently revert the client to old feature flags, so never reuse it.
    return 'no-store, max-age=0';
  }

  if (path === '/settings/discover') {
    return 'private, no-cache, stale-if-error=300';
  }

  if (!isAuthenticated) {
    return undefined;
  }

  if (path.startsWith('/discover') || path.startsWith('/search')) {
    // Catalog feeds change frequently and support seeded refreshes. Keep the
    // browser copy for conditional 304 requests, but validate before reuse.
    // Do not permit stale-if-error here: it can replace a current provider
    // timeout with an old empty response and incorrectly render "No results."
    return 'private, no-cache';
  }

  // Detail and related catalog responses include live request, availability,
  // watchlist and viewer-policy state alongside provider metadata. Revalidate
  // every read so mutations cannot leave an enabled stale Request action.
  // Provider metadata retains its separate server-side cache.
  return 'private, no-cache';
};

export const apiResponseCache = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // API responses are private unless a route below explicitly opts into a
  // bounded browser cache. Cookie-authenticated requests are not covered by
  // HTTP's Authorization-header cache rules, so leaving sensitive responses
  // without a directive can expose them through a shared reverse proxy.
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Vary', 'Cookie, Authorization, X-API-Key, Accept-Encoding');

  if (req.headers.authorization || req.header('X-API-Key')) {
    return next();
  }

  if (req.method === 'GET' && req.path === '/settings/public') {
    delete req.headers['if-none-match'];
    delete req.headers['if-modified-since'];
  }

  if (
    req.method !== 'GET' ||
    !cacheableRoutePatterns.some((pattern) => pattern.test(req.path))
  ) {
    return next();
  }

  const json = res.json.bind(res);
  res.json = ((body: JsonBody) => {
    if (!res.headersSent && res.statusCode >= 200 && res.statusCode < 300) {
      const cacheControl = getCacheControl(req.path, Boolean(req.user));

      if (cacheControl) {
        res.setHeader('Cache-Control', cacheControl);
        res.setHeader('Vary', 'Cookie, Accept-Encoding');
      }
    }

    return json(body);
  }) as Response['json'];

  return next();
};
