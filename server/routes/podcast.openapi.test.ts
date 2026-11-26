import express from 'express';
import * as OpenApiValidator from 'express-openapi-validator';
import assert from 'node:assert/strict';
import path from 'node:path';
import { it } from 'node:test';
import request from 'supertest';

// The request validator rejects query parameters the spec does not declare:
// these are the shapes Lumen's podcast pages send.
function app() {
  const result = express();
  result.use(express.json());
  result.use(
    OpenApiValidator.middleware({
      apiSpec: path.join(process.cwd(), 'seerr-api.yml'),
      validateRequests: true,
      validateSecurity: false,
    })
  );
  result.all('/api/v1/podcast/*splat', (_req, res) => {
    res.json({ ok: true });
  });
  result.use(
    (
      error: { status?: number },
      _req: express.Request,
      res: express.Response,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      _next: express.NextFunction
    ) => res.status(error.status ?? 500).json({ failed: true })
  );
  return result;
}

it('lets the podcast pages through the contract', async () => {
  const pages = [
    '/api/v1/podcast/library?page=2&limit=100&sort=added',
    '/api/v1/podcast/library/pod-1/available',
    '/api/v1/podcast/library/pod-1/available?page=3&limit=100',
    '/api/v1/podcast/search?q=hardcore%20history',
  ];
  for (const page of pages) {
    assert.equal((await request(app()).get(page)).status, 200, page);
  }
  const feed = await request(app())
    .post('/api/v1/podcast/feed')
    .send({ feedUrl: 'https://feeds.example.test/show.xml' });
  assert.equal(feed.status, 200);
  const cleanup = await request(app())
    .put('/api/v1/podcast/library/pod-1/cleanup')
    .send({ enabled: true });
  assert.equal(cleanup.status, 200);
});

it('rejects out-of-range or undeclared podcast paging', async () => {
  for (const page of [
    '/api/v1/podcast/library/pod-1/available?limit=500',
    '/api/v1/podcast/library/pod-1/available?page=0',
    '/api/v1/podcast/library/pod-1/available?offset=100',
  ]) {
    assert.equal((await request(app()).get(page)).status, 400, page);
  }
});
