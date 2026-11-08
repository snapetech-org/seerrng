import { User } from '@server/entity/User';
import { Permission } from '@server/lib/permissions';
import { setupTestDb } from '@server/test/db';
import express from 'express';
import * as OpenApiValidator from 'express-openapi-validator';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import sharp from 'sharp';
import request from 'supertest';
import { createLumenRoutes } from './lumen';

let root: string;
after(() => fs.rm(root, { recursive: true, force: true }));
setupTestDb();
const app = express();
app.use(express.json({ limit: '1mb' }));
app.use((req, _res, next) => {
  if (req.headers['x-test-role']) {
    req.user = new User({
      id: req.headers['x-test-role'] === 'admin' ? 1 : 2,
      permissions: req.headers['x-test-role'] === 'user' ? 0 : Permission.ADMIN,
    });
  }
  next();
});
app.use(
  OpenApiValidator.middleware({
    apiSpec: path.resolve('seerr-api.yml'),
    validateRequests: true,
    validateSecurity: false,
  })
);
before(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'seerrng-lumen-config-test-'));
  app.use('/api/v1/lumen', createLumenRoutes(root));
});

test('embedded Lumen configuration is public, bounded, and administrator-write-only', async () => {
  const url = '/api/v1/lumen/config';
  assert.equal((await request(app).get(url)).status, 403);
  assert.equal((await request(app).put(url).send({})).status, 403);
  assert.equal(
    (await request(app).put(url).set('x-test-role', 'user').send({})).status,
    403
  );
  assert.equal(
    (await request(app).put(url).set('x-test-role', 'stale-admin').send({}))
      .status,
    403
  );
  assert.equal(
    (await request(app).get('/api/v1/lumen/configuration')).status,
    200
  );
  const config = {
    defaults: { theme: 'dark', showBooks: false },
    branding: { name: 'Household' },
  };
  assert.equal(
    (await request(app).put(url).set('x-test-role', 'admin').send(config))
      .status,
    200
  );
  const read = await request(app).get('/api/v1/lumen/configuration');
  assert.deepEqual(read.body, config);
  assert.equal(read.headers['cache-control'], 'no-store');
  assert.equal(
    (
      await request(app)
        .put(url)
        .set('x-test-role', 'admin')
        .send({ long: 'x'.repeat(65536) })
    ).status,
    413
  );
  assert.equal(
    (await request(app).put(url).set('x-test-role', 'admin').send([])).status,
    400
  );
  assert.deepEqual(
    JSON.parse(await fs.readFile(path.join(root, 'config.json'), 'utf8')),
    config
  );
  assert.deepEqual((await fs.readdir(root)).sort(), ['config.json']);
});

test('branding denies non-admin writes and publishes only re-encoded, bounded images', async () => {
  const url = '/api/v1/lumen/branding/logo';
  const png = await sharp({
    create: { width: 8, height: 8, channels: 4, background: '#123456' },
  })
    .png()
    .toBuffer();
  assert.equal(
    (await request(app).put(url).set('Content-Type', 'image/png').send(png))
      .status,
    403
  );
  assert.equal(
    (
      await request(app)
        .put(url)
        .set('x-test-role', 'user')
        .set('Content-Type', 'image/png')
        .send(png)
    ).status,
    403
  );
  assert.equal(
    (
      await request(app)
        .put(url)
        .set('x-test-role', 'admin')
        .set('Content-Type', 'image/png')
        .send(Buffer.from('<script>alert(1)</script>'))
    ).status,
    415
  );
  const upload = await request(app)
    .put(url)
    .set('x-test-role', 'admin')
    .set('Content-Type', 'image/png')
    .send(png);
  assert.equal(upload.status, 200);
  assert.match(
    upload.body.url,
    /^\/api\/v1\/lumen\/branding\/logo-[a-f0-9-]{36}\.png$/
  );
  const image = await request(app).get(upload.body.url);
  assert.equal(image.status, 200);
  assert.match(image.headers['content-type'], /^image\/png/);
  assert.equal((await sharp(image.body).metadata()).width, 8);
  assert.equal(
    (await request(app).get('/api/v1/lumen/branding/config.json')).status,
    404
  );
});
