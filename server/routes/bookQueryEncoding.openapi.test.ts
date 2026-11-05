import assert from 'node:assert/strict';
import path from 'node:path';
import { describe, it } from 'node:test';

import type { Express } from 'express';
import express from 'express';
import * as OpenApiValidator from 'express-openapi-validator';
import request from 'supertest';

// Axios 1.x encodes spaces as + but leaves : unescaped. Free-text book
// parameters must accept that serialization instead of failing validation.
const freeTextBookParams: { route: string; url: string; param: string }[] = [
  {
    route: '/editions/book',
    url: '/editions/book?format=ebook',
    param: 'term',
  },
  {
    route: '/editions/book',
    url: '/editions/book?format=ebook',
    param: 'title',
  },
  {
    route: '/editions/book',
    url: '/editions/book?format=ebook',
    param: 'foreignBookId',
  },
  {
    route: '/editions/series-narrators',
    url: '/editions/series-narrators',
    param: 'title',
  },
  { route: '/discover/books', url: '/discover/books', param: 'query' },
  { route: '/discover/books', url: '/discover/books', param: 'author' },
  { route: '/discover/books', url: '/discover/books', param: 'narrator' },
  { route: '/discover/books', url: '/discover/books', param: 'subject' },
  { route: '/book/search', url: '/book/search', param: 'query' },
  {
    route: '/book/:bookId',
    url: '/book/bookshelf%3A0%3AMzc0NTQx',
    param: 'lookupTitle',
  },
  {
    route: '/book/:bookId/ratings',
    url: '/book/bookshelf%3A0%3AMzc0NTQx/ratings',
    param: 'lookupTitle',
  },
  { route: '/book-series/search', url: '/book-series/search', param: 'query' },
  { route: '/readmeabook/search', url: '/readmeabook/search', param: 'query' },
  {
    route: '/readmeabook/discover',
    url: '/readmeabook/discover?section=subject',
    param: 'subject',
  },
];

function createValidatedApp(): Express {
  const app = express();
  app.use(
    OpenApiValidator.middleware({
      apiSpec: path.join(process.cwd(), 'seerr-api.yml'),
      validateRequests: true,
      validateSecurity: false,
    })
  );
  const routes = new Set(freeTextBookParams.map(({ route }) => route));
  for (const route of routes) {
    app.get(`/api/v1${route}`, (req, res) =>
      res.status(200).json({ query: req.query })
    );
  }
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

describe('free-text book query parameters behind the OpenAPI validator', () => {
  const app = createValidatedApp();

  for (const { url, param } of freeTextBookParams) {
    it(`accepts Axios-serialized spaces and colons in ${url} ?${param}`, async () => {
      // Raw query string as Axios 1.x serializes its default params object.
      const separator = url.includes('?') ? '&' : '?';
      const response = await request(app).get(
        `/api/v1${url}${separator}${param}=The+Hobbit:+There+and+Back+Again`
      );

      assert.strictEqual(response.status, 200, JSON.stringify(response.body));
      assert.strictEqual(
        response.body.query[param],
        'The Hobbit: There and Back Again'
      );
    });
  }
});
