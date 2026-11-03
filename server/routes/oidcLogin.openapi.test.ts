import assert from 'node:assert/strict';
import path from 'node:path';
import { describe, it } from 'node:test';

import type { Express } from 'express';
import express from 'express';
import * as OpenApiValidator from 'express-openapi-validator';
import request from 'supertest';

// The login page calls this route with both `returnUrl` (the OIDC callback
// page) and `returnTo` (the same-origin path to open after sign-in); see
// src/utils/oidc.ts. Both must pass the request validator.
function createValidatedApp(): Express {
  const app = express();
  app.use(
    OpenApiValidator.middleware({
      apiSpec: path.join(process.cwd(), 'seerr-api.yml'),
      validateRequests: true,
      validateSecurity: false,
    })
  );
  app.get('/api/v1/auth/oidc/login/:slug', (req, res) =>
    res.status(200).json({
      slug: req.params.slug,
      returnUrl: req.query.returnUrl,
      returnTo: req.query.returnTo,
    })
  );
  app.use(
    (
      error: { status?: number; message?: string },
      _req: express.Request,
      res: express.Response,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      _next: express.NextFunction
    ) =>
      res.status(error.status ?? 500).json({
        status: error.status ?? 500,
        message: error.message,
      })
  );
  return app;
}

describe('OIDC login route behind the OpenAPI validator', () => {
  const app = createValidatedApp();

  it('accepts the returnTo path sent by the login page', async () => {
    const response = await request(app)
      .get('/api/v1/auth/oidc/login/authentik')
      .query({ returnUrl: '/login', returnTo: '/requests' });

    assert.strictEqual(response.status, 200, JSON.stringify(response.body));
    assert.strictEqual(response.body.returnTo, '/requests');
  });

  it('accepts a returnTo path with its own query string and hash', async () => {
    // URLSearchParams leaves "/", "?", "=" and ":" unescaped in values.
    const response = await request(app).get(
      '/api/v1/auth/oidc/login/authentik?returnUrl=/login&returnTo=/discover/books?query=The+Hobbit:+Revisited#top'
    );

    assert.strictEqual(response.status, 200, JSON.stringify(response.body));
    assert.strictEqual(
      response.body.returnTo,
      '/discover/books?query=The Hobbit: Revisited'
    );
  });

  it('still works when returnTo is omitted', async () => {
    const response = await request(app)
      .get('/api/v1/auth/oidc/login/authentik')
      .query({ returnUrl: '/login' });

    assert.strictEqual(response.status, 200, JSON.stringify(response.body));
  });
});
