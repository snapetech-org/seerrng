import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import cookieParser from 'cookie-parser';
import express from 'express';
import rateLimit from 'express-rate-limit';
import request from 'supertest';
import csrfProtection, { requestUsesSecureTransport } from './csrfProtection';
import csrfTokenCookie from './csrfTokenCookie';

const getCsrfCookies = (cookies: string[] = []) => ({
  secret: cookies.find((cookie) => cookie.startsWith('_csrf=')),
  token: cookies.find((cookie) => cookie.startsWith('XSRF-TOKEN=')),
});

const getCookieValue = (cookie: string): string =>
  decodeURIComponent(
    cookie.slice(cookie.indexOf('=') + 1, cookie.indexOf(';'))
  );

const createTransportAwareApp = (options: { trustProxy?: boolean } = {}) => {
  const app = express();
  if (options.trustProxy) {
    app.set('trust proxy', 1);
  }
  app.use(cookieParser());
  app.use(csrfProtection());
  app.use(csrfTokenCookie(requestUsesSecureTransport));
  app.get('/', (_req, res) => res.sendStatus(204));
  app.post('/', (_req, res) => res.sendStatus(204));
  return app;
};

describe('csrfTokenCookie', () => {
  it('makes the browser-readable token available across application routes', async () => {
    const app = express();
    app.use((req, _res, next) => {
      req.csrfToken = () => 'test-token';
      next();
    });
    app.use(csrfTokenCookie(false));
    app.get('/nested/page', (_req, res) => res.sendStatus(204));

    const response = await request(app).get('/nested/page');
    const tokenCookie = response
      .get('Set-Cookie')
      ?.find((cookie) => cookie.startsWith('XSRF-TOKEN='));

    assert.ok(tokenCookie);
    assert.match(tokenCookie, /(?:^|;) Path=\/(?:;|$)/);
    assert.match(tokenCookie, /(?:^|;) SameSite=Strict(?:;|$)/);
    assert.doesNotMatch(tokenCookie, /(?:^|;) HttpOnly(?:;|$)/);
  });

  it('allows both CSRF cookies on direct HTTP deployments', async () => {
    const agent = request.agent(createTransportAwareApp());
    const response = await agent.get('/');
    const cookies = getCsrfCookies(response.get('Set-Cookie'));

    assert.ok(cookies.secret);
    assert.ok(cookies.token);
    assert.doesNotMatch(cookies.secret, /(?:^|;) Secure(?:;|$)/);
    assert.doesNotMatch(cookies.token, /(?:^|;) Secure(?:;|$)/);

    await agent
      .post('/')
      .set('X-XSRF-TOKEN', getCookieValue(cookies.token))
      .expect(204);
  });

  it('lets the Jellyfin bridge submit its token without a CSRF cookie', async () => {
    const app = express();
    app.use(cookieParser());
    app.use(csrfProtection());
    app.use(csrfTokenCookie(false));
    app.post('/api/v1/auth/jellyfin/bridge', (_req, res) =>
      res.sendStatus(204)
    );

    await request(app)
      .post('/api/v1/auth/jellyfin/bridge')
      .type('form')
      .send({ token: 'jellyfin-session-token' })
      .expect(204);
  });

  it('lets the signed Slack callback reach its own request verification', async () => {
    const app = express();
    app.use(rateLimit({ windowMs: 60 * 1000, limit: 100 }));
    app.use(cookieParser());
    app.use(csrfProtection());
    app.use(csrfTokenCookie(false));
    app.post('/api/v1/notifications/slack/actions', (_req, res) =>
      res.sendStatus(204)
    );

    await request(app)
      .post('/api/v1/notifications/slack/actions')
      .type('form')
      .send({ payload: '{}' })
      .expect(204);
  });

  it('secures both CSRF cookies behind a trusted HTTPS terminator', async () => {
    const response = await request(
      createTransportAwareApp({ trustProxy: true })
    )
      .get('/')
      .set('X-Forwarded-Proto', 'https');
    const cookies = getCsrfCookies(response.get('Set-Cookie'));

    assert.ok(cookies.secret);
    assert.ok(cookies.token);
    assert.match(cookies.secret, /(?:^|;) Secure(?:;|$)/);
    assert.match(cookies.token, /(?:^|;) Secure(?:;|$)/);
  });

  it('ignores X-Forwarded-Proto from an untrusted proxy instead of setting Secure cookies the browser will silently drop', async () => {
    // Regression test for the "invalid csrf token" bug: without an operator
    // opting in via "Enable Proxy Support" (trustProxy), the app must not
    // let a client-supplied header decide the cookie's Secure flag. Any
    // client can send this header; if the app honored it unconditionally,
    // a request could get classified "secure" while the browser's real
    // connection isn't, causing the browser to silently refuse to store the
    // resulting Secure cookie and desyncing CSRF validation on the next
    // request.
    const response = await request(
      createTransportAwareApp({ trustProxy: false })
    )
      .get('/')
      .set('X-Forwarded-Proto', 'https');
    const cookies = getCsrfCookies(response.get('Set-Cookie'));

    assert.ok(cookies.secret);
    assert.ok(cookies.token);
    assert.doesNotMatch(cookies.secret, /(?:^|;) Secure(?:;|$)/);
    assert.doesNotMatch(cookies.token, /(?:^|;) Secure(?:;|$)/);
  });

  it('never issues a Secure cookie a browser would drop, even when a request carries a spoofed proxy header mid-session', async () => {
    // This is the exact end-to-end scenario from the original bug report:
    // a request mid-session carries an X-Forwarded-Proto header (spoofed, or
    // from a proxy the operator never told Seerr to trust) while the
    // browser's real connection is plain HTTP. supertest doesn't model a
    // browser's refusal to store a Secure cookie over HTTP, so the decisive
    // assertion is upstream of that: without trustProxy enabled, the server
    // must never mark these cookies Secure in the first place, on *any*
    // request, regardless of what headers a client sends — that's what
    // removes the possibility of the browser silently dropping one and
    // desyncing the pairing.
    const agent = request.agent(createTransportAwareApp({ trustProxy: false }));

    const pageResponse = await agent.get('/');
    const pageCookies = getCsrfCookies(pageResponse.get('Set-Cookie'));
    assert.ok(pageCookies.secret);
    assert.ok(pageCookies.token);
    assert.doesNotMatch(pageCookies.secret, /(?:^|;) Secure(?:;|$)/);
    assert.doesNotMatch(pageCookies.token, /(?:^|;) Secure(?:;|$)/);

    const submitResponse = await agent
      .post('/')
      .set('X-Forwarded-Proto', 'https')
      .set('X-XSRF-TOKEN', getCookieValue(pageCookies.token))
      .expect(204);
    const submitCookies = getCsrfCookies(submitResponse.get('Set-Cookie'));
    assert.doesNotMatch(submitCookies.secret ?? '', /(?:^|;) Secure(?:;|$)/);
    assert.doesNotMatch(submitCookies.token ?? '', /(?:^|;) Secure(?:;|$)/);
  });
});
