import express from 'express';
import * as OpenApiValidator from 'express-openapi-validator';
import assert from 'node:assert/strict';
import path from 'node:path';
import { describe, it } from 'node:test';
import request from 'supertest';
import themeRoutes from './interfaceThemes';

const app = express();
app.use(
  OpenApiValidator.middleware({
    apiSpec: path.resolve(process.cwd(), 'seerr-api.yml'),
    validateRequests: true,
    validateSecurity: false,
  })
);
app.use('/api/v1/interface-themes', themeRoutes);

describe('public interface theme package routes', () => {
  it('lists installed package metadata without authentication', async () => {
    const response = await request(app).get('/api/v1/interface-themes');
    assert.equal(response.status, 200);
    assert.equal(response.headers['cache-control'], 'public, max-age=60');
    assert.deepEqual(
      response.body.themes.map(({ id }: { id: string }) => id),
      ['seerrOrig', 'seerrNGJ', 'persiusNG']
    );
    assert.equal(
      response.body.themes.find(({ id }: { id: string }) => id === 'persiusNG')
        ?.layout,
      'persius'
    );
  });

  it('serves only a validated installed stylesheet from the same origin', async () => {
    const response = await request(app).get(
      '/api/v1/interface-themes/persiusNG/theme.css'
    );
    assert.equal(response.status, 200);
    assert.match(response.headers['content-type'], /^text\/css; charset=utf-8/);
    assert.equal(response.headers['x-content-type-options'], 'nosniff');
    assert.equal(
      response.headers['cross-origin-resource-policy'],
      'same-origin'
    );
    assert.match(response.text, /data-interface-theme='persiusNG'/);
    assert.equal(
      (await request(app).get('/api/v1/interface-themes/%2e%2e/theme.css'))
        .status,
      404
    );
    assert.equal(
      (
        await request(app).get(
          '/api/v1/interface-themes/not-installed/theme.css'
        )
      ).status,
      404
    );
  });
});

describe('public interface theme routes behind the OpenAPI validator', () => {
  const app = express();
  app.use(
    OpenApiValidator.middleware({
      apiSpec: path.join(process.cwd(), 'seerr-api.yml'),
      validateRequests: true,
      validateSecurity: false,
    })
  );
  app.use('/api/v1/interface-themes', themeRoutes);
  app.use(
    (
      error: { status?: number; message?: string },
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction
    ) => {
      void _next;
      res.status(error.status ?? 500).json(error);
    }
  );

  it('allows the public manifest and CSS endpoints through validation', async () => {
    const list = await request(app).get('/api/v1/interface-themes');
    assert.equal(list.status, 200);
    assert.deepEqual(
      list.body.themes.map(({ id }: { id: string }) => id),
      ['seerrOrig', 'seerrNGJ']
    );

    const stylesheet = await request(app).get(
      '/api/v1/interface-themes/seerrOrig/theme.css'
    );
    assert.equal(stylesheet.status, 200);
    assert.match(stylesheet.headers['content-type'], /^text\/css/);
  });
});
