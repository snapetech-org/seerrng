import assert from 'node:assert/strict';
import path from 'node:path';
import { describe, it } from 'node:test';

import type { Express } from 'express';
import express from 'express';
import * as OpenApiValidator from 'express-openapi-validator';
import request from 'supertest';

describe('request status routes behind the OpenAPI validator', () => {
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
    app.delete('/api/v1/request/:requestId/status', (_req, res) =>
      res.status(204).send()
    );
    app.put('/api/v1/request/:requestId/watch-ahead', (_req, res) =>
      res.status(200).json({})
    );
    app.post('/api/v1/request/:requestId/retry', (_req, res) =>
      res.status(200).json({})
    );
    app.get('/api/v1/request/status', (_req, res) =>
      res.status(200).json({
        pageInfo: {
          pages: 0,
          pageSize: 25,
          results: 0,
          page: 1,
        },
        results: [],
        counts: {
          total: 0,
          active: 0,
          incomplete: 0,
          attention: 0,
          completed: 0,
          unavailable: 0,
          failed: 0,
        },
        olderCount: 0,
      })
    );
    app.get('/api/v1/request/status/:requestId/downloads', (_req, res) =>
      res.status(200).json({ results: [], hadErrors: false })
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

  it('allows DELETE /request/{requestId}/status through the contract', async () => {
    const response = await request(createValidatedApp()).delete(
      '/api/v1/request/31/status'
    );

    assert.strictEqual(response.status, 204);
  });

  it('allows an integer watch-ahead buffer through the request contract', async () => {
    const response = await request(createValidatedApp())
      .put('/api/v1/request/31/watch-ahead')
      .send({ episodeCount: 3 });

    assert.strictEqual(response.status, 200, JSON.stringify(response.body));
  });

  it('rejects a watch-ahead buffer above the supported limit', async () => {
    const response = await request(createValidatedApp())
      .put('/api/v1/request/31/watch-ahead')
      .send({ episodeCount: 6 });

    assert.strictEqual(response.status, 400);
  });

  it('allows the explicit season-zero TVDB mapping retry body', async () => {
    const response = await request(createValidatedApp())
      .post('/api/v1/request/31/retry')
      .send({
        tvdbId: 184871,
        seasonMappings: [
          { seasonNumber: 0, externalSeasonNumber: 0 },
          { seasonNumber: 1, externalSeasonNumber: 2 },
        ],
      });

    assert.strictEqual(response.status, 200, JSON.stringify(response.body));
  });

  it('allows an empty optional request retry body', async () => {
    const response = await request(createValidatedApp())
      .post('/api/v1/request/31/retry')
      .send({});

    assert.strictEqual(response.status, 200, JSON.stringify(response.body));
  });

  it('rejects an incomplete season mapping at the API contract boundary', async () => {
    const response = await request(createValidatedApp())
      .post('/api/v1/request/31/retry')
      .send({
        tvdbId: 184871,
        seasonMappings: [{ seasonNumber: 1 }],
      });

    assert.strictEqual(response.status, 400);
  });

  for (const filter of ['pending', 'processing', 'deleted']) {
    it(`allows the ${filter} request status filter to return no matches`, async () => {
      const response = await request(createValidatedApp())
        .get('/api/v1/request/status')
        .query({ filter });

      assert.strictEqual(response.status, 200);
      assert.strictEqual(response.body.pageInfo.results, 0);
      assert.deepStrictEqual(response.body.results, []);
    });
  }

  it('admits the Request Status search, paging, sort, and filter controls', async () => {
    const response = await request(createValidatedApp())
      .get('/api/v1/request/status')
      .query({
        take: 100,
        skip: 0,
        requestedBy: 1,
        mediaId: 11,
        bookFormat: 'ebook',
        timeFrame: '30d',
        sort: 'modified',
        sortDirection: 'asc',
        mediaType: 'book',
        filter: 'completed',
        search: 'picard',
      });

    assert.strictEqual(response.status, 200);
  });

  it('allows download-list responses to report partial provider errors', async () => {
    const response = await request(createValidatedApp()).get(
      '/api/v1/request/status/31/downloads'
    );

    assert.strictEqual(response.status, 200);
    assert.deepStrictEqual(response.body, { results: [], hadErrors: false });
  });
});
