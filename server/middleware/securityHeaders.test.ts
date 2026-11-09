import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import express from 'express';
import request from 'supertest';
import securityHeaders, {
  SECURITY_RESPONSE_HEADERS,
  STRICT_TRANSPORT_SECURITY_HEADER,
  buildContentSecurityPolicy,
} from './securityHeaders';

describe('security response headers', () => {
  it('prevents framing and MIME sniffing without exposing Express', async () => {
    const app = express();
    app.use(securityHeaders);
    app.get('/', (_req, res) => res.json({ ok: true }));

    const response = await request(app).get('/');

    assert.strictEqual(response.status, 200);
    for (const [name, value] of Object.entries(SECURITY_RESPONSE_HEADERS)) {
      assert.strictEqual(response.headers[name.toLowerCase()], value);
    }
    assert.strictEqual(
      response.headers['strict-transport-security'],
      undefined
    );
    assert.match(response.headers['content-security-policy'], /base-uri/);
    assert.match(
      response.headers['content-security-policy'],
      /default-src 'self'/
    );
    assert.match(
      response.headers['content-security-policy'],
      /script-src 'self';/
    );
    assert.match(
      response.headers['content-security-policy'],
      /script-src-attr 'none'/
    );
    assert.match(
      response.headers['content-security-policy'],
      /connect-src 'self' https:\/\/plex\.tv https:\/\/\*\.plex\.tv https:\/\/api\.github\.com/
    );
    assert.match(
      response.headers['content-security-policy'],
      /frame-src 'none'/
    );
    assert.doesNotMatch(
      response.headers['content-security-policy'],
      /unsafe-eval|(?:^|\s)\*(?:\s|;|$)/
    );
    assert.match(response.headers['content-security-policy'], /form-action/);
    assert.match(response.headers['content-security-policy'], /object-src/);
    assert.strictEqual(response.headers['x-powered-by'], undefined);
  });

  it('only sends HSTS for secure requests', async () => {
    const app = express();
    app.set('trust proxy', 1);
    app.use(securityHeaders);
    app.get('/', (_req, res) => res.json({ ok: true }));

    const httpResponse = await request(app).get('/');
    assert.strictEqual(
      httpResponse.headers['strict-transport-security'],
      undefined
    );

    const httpsResponse = await request(app)
      .get('/')
      .set('X-Forwarded-Proto', 'https');
    assert.strictEqual(
      httpsResponse.headers['strict-transport-security'],
      STRICT_TRANSPORT_SECURITY_HEADER
    );
  });

  it('allows development hot reload transports only outside production', () => {
    const developmentPolicy = buildContentSecurityPolicy('development');
    const productionPolicy = buildContentSecurityPolicy('production');

    assert.match(developmentPolicy, /script-src[^;]*'unsafe-eval'/);
    assert.match(developmentPolicy, /connect-src[^;]*ws: wss:/);
    assert.match(developmentPolicy, /connect-src[^;]*https:\/\/plex\.tv/);
    assert.match(
      productionPolicy,
      /connect-src[^;]*https:\/\/api\.github\.com/
    );
    assert.doesNotMatch(productionPolicy, /'unsafe-eval'|\bws:|\bwss:/);
  });
});
