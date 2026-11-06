import assert from 'node:assert/strict';
import path from 'node:path';
import { describe, it } from 'node:test';

import type { Express } from 'express';
import express from 'express';
import * as OpenApiValidator from 'express-openapi-validator';
import request from 'supertest';

describe('book detail routes behind the OpenAPI validator', () => {
  function createValidatedApp(): Express {
    const app = express();
    app.use(
      OpenApiValidator.middleware({
        apiSpec: path.join(process.cwd(), 'seerr-api.yml'),
        validateRequests: true,
        validateSecurity: false,
      })
    );
    app.get('/api/v1/book/library', (req, res) =>
      res.json({ format: req.query.format, page: req.query.page })
    );
    app.get('/api/v1/book/:bookId', (req, res) =>
      res.status(200).json({
        id: req.params.bookId,
        title: req.query.lookupTitle,
      })
    );
    app.get('/api/v1/book/:bookId/ratings', (req, res) =>
      res.status(200).json({
        average: 4.5,
        count: 1,
        source: 'bookshelf',
        workId: req.params.bookId,
        lookupTitle: req.query.lookupTitle,
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

  it('admits the library format and pagination contract before dynamic book IDs', async () => {
    const res = await request(createValidatedApp()).get(
      '/api/v1/book/library?format=audiobook&page=2'
    );
    assert.equal(res.status, 200);
    assert.equal(res.body.format, 'audiobook');
    assert.equal(res.body.page, 2);
    assert.equal(
      (
        await request(createValidatedApp()).get(
          '/api/v1/book/library?format=both'
        )
      ).status,
      400
    );
  });

  it('admits the Bookshelf title fallback on book details', async () => {
    const response = await request(createValidatedApp())
      .get('/api/v1/book/bookshelf%3A0%3AMzc0NTQx')
      .query({ lookupTitle: 'The Return of the King' });

    assert.strictEqual(response.status, 200, JSON.stringify(response.body));
    assert.strictEqual(response.body.title, 'The Return of the King');
  });

  it('admits the title fallback on book ratings', async () => {
    const response = await request(createValidatedApp())
      .get('/api/v1/book/bookshelf%3A0%3AMzc0NTQx/ratings')
      .query({ lookupTitle: 'The Return of the King' });

    assert.strictEqual(response.status, 200, JSON.stringify(response.body));
    assert.strictEqual(response.body.lookupTitle, 'The Return of the King');
  });
});
