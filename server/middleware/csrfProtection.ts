import csurf from '@dr.pogodin/csurf';
import { authenticateClientApiKey } from '@server/lib/clientApiKeys';
import { isSlackActionCallbackRequest } from '@server/lib/notifications/slackActions';
import type { Request, RequestHandler } from 'express';

const createCsrfProtection = (secure: boolean): RequestHandler =>
  csurf({
    cookie: {
      httpOnly: true,
      sameSite: true,
      secure,
      key: '_csrf',
      path: '/',
    },
  });

// `req.secure` already incorporates X-Forwarded-Proto exactly when (and only
// when) the operator has enabled "Enable Proxy Support" (settings.network.
// trustProxy), which is what puts Express itself into `trust proxy` mode
// (see server/index.ts). Reading the header directly here instead — as this
// function used to — trusted it unconditionally, regardless of whether a
// proxy is actually configured. A request that gets classified "secure"
// while the browser's real connection isn't causes the browser to silently
// refuse to store the resulting Secure-flagged _csrf/XSRF-TOKEN cookies,
// which desyncs CSRF validation on the very next request ("invalid csrf
// token"). Deferring entirely to req.secure keeps this decision consistent
// with the operator's own trust-proxy setting instead of an easily-spoofed,
// unconditionally-trusted header.
export const requestUsesSecureTransport = (req: Request): boolean => req.secure;

export const isJellyfinBridgeAuthRequest = (
  req: Pick<Request, 'method' | 'path'>
): boolean =>
  req.method === 'POST' &&
  /(?:^|\/)api\/v1\/auth\/jellyfin\/bridge\/?$/u.test(req.path);

// OIDC form_post is authenticated by the callback's signed correlation cookie,
// state, nonce and provider binding. An identity provider cannot supply our
// browser CSRF token. JSON callbacks and all other auth endpoints stay guarded.
export const isOidcFormPostCallback = (req: Request): boolean =>
  req.method === 'POST' &&
  /^\/api\/v1\/auth\/oidc\/callback\/[a-zA-Z0-9_-]+\/?$/u.test(req.path) &&
  Boolean(req.is('application/x-www-form-urlencoded'));

export const csrfProtection = (): RequestHandler => {
  const httpProtection = createCsrfProtection(false);
  const httpsProtection = createCsrfProtection(true);

  return (req, res, next) => {
    // A scoped bearer token has no ambient browser authority. Validate both
    // the token and its exact route scope before bypassing the cookie guard.
    const clientKey = req.header('X-API-Key');
    if (clientKey?.startsWith('sngc_')) {
      void authenticateClientApiKey(
        clientKey,
        req.method,
        req.path.replace(/^\/api\/v1(?=\/)/, '')
      )
        .then((actor) =>
          actor
            ? next()
            : res.status(401).json({
                message: 'Invalid API key or insufficient token scope.',
              })
        )
        .catch(next);
      return;
    }
    // Jellyfin bridge credentials and Slack request signatures are validated
    // by their exact callback routes instead of a browser CSRF cookie.
    if (
      isJellyfinBridgeAuthRequest(req) ||
      isSlackActionCallbackRequest(req) ||
      isOidcFormPostCallback(req)
    ) {
      return next();
    }

    return (requestUsesSecureTransport(req) ? httpsProtection : httpProtection)(
      req,
      res,
      next
    );
  };
};

export default csrfProtection;
