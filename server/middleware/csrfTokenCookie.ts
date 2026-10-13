import { isSlackActionCallbackRequest } from '@server/lib/notifications/slackActions';
import type { Request, RequestHandler } from 'express';
import { isJellyfinBridgeAuthRequest } from './csrfProtection';

type SecureCookiePolicy = boolean | ((req: Request) => boolean);

export const csrfTokenCookie = (secure: SecureCookiePolicy): RequestHandler =>
  function setCsrfTokenCookie(req, res, next) {
    if (isJellyfinBridgeAuthRequest(req) || isSlackActionCallbackRequest(req)) {
      return next();
    }

    // The browser client reads this cookie to populate X-XSRF-TOKEN. Without
    // an explicit root path, a token issued while rendering a nested page is
    // scoped to that page directory and disappears after client navigation.
    res.cookie('XSRF-TOKEN', req.csrfToken(), {
      path: '/',
      sameSite: true,
      secure: typeof secure === 'function' ? secure(req) : secure,
    });
    next();
  };

export default csrfTokenCookie;
