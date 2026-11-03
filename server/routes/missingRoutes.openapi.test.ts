import assert from 'node:assert/strict';
import path from 'node:path';
import { describe, it } from 'node:test';

import type { Express } from 'express';
import express from 'express';
import * as OpenApiValidator from 'express-openapi-validator';
import request from 'supertest';

// Routes that exist on the server and are called by the web UI. Each case
// sends the request the way the UI does and expects the OpenAPI validator to
// let it through to the route handler.
function createValidatedApp(): Express {
  const app = express();
  app.use(express.json());
  app.use(
    OpenApiValidator.middleware({
      apiSpec: path.join(process.cwd(), 'seerr-api.yml'),
      validateRequests: true,
      validateSecurity: false,
    })
  );
  const ok: express.RequestHandler = (req, res) =>
    res.status(200).json({ params: req.params, body: req.body ?? null });
  app.get('/api/v1/artist/:artistId/similar', ok);
  app.get('/api/v1/media/:mediaId/jellystat', ok);
  app.post('/api/v1/media/:mediaId/library/clear-stale-availability', ok);
  app.post('/api/v1/overrideRule/advancedRequest', ok);
  app.post('/api/v1/settings/jobs/:jobId/enabled', ok);
  app.post('/api/v1/user/:userId/settings/interface-theme', ok);
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

describe('UI routes documented in the OpenAPI contract', () => {
  const app = createValidatedApp();

  it('GET /artist/{artistId}/similar', async () => {
    const response = await request(app)
      .get('/api/v1/artist/b10bbbfc-cf9e-42e0-be17-e2c3e1d2600d/similar')
      .query({ page: 2, pageSize: 20 });
    assert.strictEqual(response.status, 200, JSON.stringify(response.body));
  });

  it('GET /media/{mediaId}/jellystat', async () => {
    const response = await request(app).get('/api/v1/media/42/jellystat');
    assert.strictEqual(response.status, 200, JSON.stringify(response.body));
  });

  it('POST /media/{mediaId}/library/clear-stale-availability', async () => {
    const response = await request(app)
      .post('/api/v1/media/42/library/clear-stale-availability')
      .send({ token: 'a'.repeat(64), quality: '4K' });
    assert.strictEqual(response.status, 200, JSON.stringify(response.body));
  });

  it('rejects clear-stale-availability without a quality', async () => {
    const response = await request(app)
      .post('/api/v1/media/42/library/clear-stale-availability')
      .send({ token: 'a'.repeat(64) });
    assert.strictEqual(response.status, 400, JSON.stringify(response.body));
  });

  it('POST /overrideRule/advancedRequest for a movie', async () => {
    const response = await request(app)
      .post('/api/v1/overrideRule/advancedRequest')
      .send({
        mediaType: 'movie',
        is4k: false,
        requestUser: 1,
        tmdbId: 603,
        tags: [1, 2],
        serviceId: 3,
      });
    assert.strictEqual(response.status, 200, JSON.stringify(response.body));
  });

  it('POST /overrideRule/advancedRequest for a book', async () => {
    const response = await request(app)
      .post('/api/v1/overrideRule/advancedRequest')
      .send({
        mediaType: 'book',
        is4k: false,
        requestUser: 1,
        bookId: 'bookshelf:0:Mzc0NTQx',
        bookFormat: 'audiobook',
        requestId: null,
      });
    assert.strictEqual(response.status, 200, JSON.stringify(response.body));
  });

  it('POST /settings/jobs/{jobId}/enabled', async () => {
    const response = await request(app)
      .post('/api/v1/settings/jobs/plex-recently-added-scan/enabled')
      .send({ enabled: false });
    assert.strictEqual(response.status, 200, JSON.stringify(response.body));
  });

  it('POST /user/{userId}/settings/interface-theme', async () => {
    const response = await request(app)
      .post('/api/v1/user/1/settings/interface-theme')
      .send({ theme: 'seerr' });
    assert.strictEqual(response.status, 200, JSON.stringify(response.body));
  });

  it('rejects an interface-theme body with extra fields', async () => {
    const response = await request(app)
      .post('/api/v1/user/1/settings/interface-theme')
      .send({ theme: 'seerr', extra: true });
    assert.strictEqual(response.status, 400, JSON.stringify(response.body));
  });
});
