import assert from 'node:assert/strict';
import path from 'node:path';
import { describe, it } from 'node:test';

import express from 'express';
import * as OpenApiValidator from 'express-openapi-validator';
import request from 'supertest';

// The requests Lumen's Comics/Manga page, its work page and the global search
// send, through the same request validator the server mounts (index.ts).
const app = express();
app.use(
  OpenApiValidator.middleware({
    apiSpec: path.join(process.cwd(), 'seerr-api.yml'),
    validateRequests: true,
    validateSecurity: false,
  })
);
app.get(
  [
    '/api/v1/discover/comics',
    '/api/v1/discover/comics/landing',
    '/api/v1/discover/comics/browse',
    '/api/v1/comic/work/:key',
    '/api/v1/comic/:id',
    '/api/v1/comic/:id/issues',
  ],
  (req, res) => res.status(200).json({ path: req.path, query: req.query })
);
app.use(
  (
    error: { status?: number; message?: string },
    _req: express.Request,
    res: express.Response,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _next: express.NextFunction
  ) =>
    res
      .status(error.status ?? 500)
      .json({ status: error.status ?? 500, message: error.message })
);

const admitted = async (url: string) => {
  const response = await request(app).get(url);
  assert.strictEqual(
    response.status,
    200,
    `${url}: ${JSON.stringify(response.body)}`
  );
  return response.body as { path: string; query: Record<string, string> };
};
const rejected = async (url: string) => {
  const response = await request(app).get(url);
  assert.strictEqual(response.status, 400, `${url} should be rejected`);
};

describe('comics behind the OpenAPI validator', () => {
  it('admits the landing page sections', async () => {
    await admitted('/api/v1/discover/comics/landing');
  });

  it('admits every browse filter the Comics page sends', async () => {
    for (const url of [
      '/api/v1/discover/comics/browse?type=manga&page=1',
      '/api/v1/discover/comics/browse?type=manga&sort=trending&page=2',
      '/api/v1/discover/comics/browse?type=manga&sort=newest&genre=Romance%2CAction&status=finished&page=1',
      '/api/v1/discover/comics/browse?type=manga&sort=title&status=ongoing&page=1',
      '/api/v1/discover/comics/browse?type=comic&sort=issues&page=1',
      '/api/v1/discover/comics/browse?type=comic&sort=newest&publisher=DC%20Comics&page=3',
      '/api/v1/discover/comics/browse?show=library&page=1',
      '/api/v1/discover/comics/browse?type=comic&show=requested&publisher=Image&page=1',
    ])
      await admitted(url);
    const body = await admitted(
      '/api/v1/discover/comics/browse?type=manga&genre=Romance&page=1'
    );
    assert.strictEqual(body.query.genre, 'Romance');
  });

  it('rejects browse values the page never sends', async () => {
    await rejected('/api/v1/discover/comics/browse?type=novel');
    await rejected('/api/v1/discover/comics/browse?status=paused');
    await rejected('/api/v1/discover/comics/browse?page=0');
  });

  it('admits grouped search (global search and the Comics scope)', async () => {
    const body = await admitted(
      '/api/v1/discover/comics?query=chainsaw&group=works&page=1'
    );
    assert.strictEqual(body.query.group, 'works');
    await admitted(
      '/api/v1/discover/comics?page=1&query=oshi%20no%20ko&group=works'
    );
    // the plain ComicVine search (SeerrNG's own pages) is unchanged
    await admitted('/api/v1/discover/comics?query=batman&page=2');
    await rejected('/api/v1/discover/comics?query=batman&group=volumes');
  });

  it('admits the work page for AniList and ComicVine keys', async () => {
    assert.strictEqual(
      (await admitted('/api/v1/comic/work/al-105778')).path,
      '/api/v1/comic/work/al-105778'
    );
    await admitted('/api/v1/comic/work/147500');
    await admitted('/api/v1/comic/130799');
    await admitted('/api/v1/comic/130799/issues?page=1');
    await rejected('/api/v1/comic/work/al-abc');
  });
});
