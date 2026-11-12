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
  assert.deepEqual(
    (await request(app).get(url).set('x-test-role', 'admin')).body,
    { canSave: true, folder: 'ok' }
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

test('embedded Lumen reports an unusable configuration directory without changing saved settings', async () => {
  const url = '/api/v1/lumen/config';
  const saved = await fs.readFile(path.join(root, 'config.json'), 'utf8');
  const parked = `${root}-parked`;
  await fs.rename(root, parked);
  await fs.writeFile(root, 'not-a-directory');
  try {
    const check = await request(app).get(url).set('x-test-role', 'admin');
    assert.equal(check.status, 200);
    assert.equal(check.body.canSave, false);
    assert.match(check.body.message, /not a usable directory/);

    const put = await request(app)
      .put(url)
      .set('x-test-role', 'admin')
      .send({ defaults: { theme: 'light' } });
    assert.equal(put.status, 503);
    assert.match(put.body.message, /not a usable directory/);
  } finally {
    await fs.unlink(root);
    await fs.rename(parked, root);
  }
  assert.equal(
    await fs.readFile(path.join(root, 'config.json'), 'utf8'),
    saved
  );
});

test('embedded Lumen does not unlink a probe path when exclusive creation fails', async (t) => {
  const open = t.mock.method(fs, 'open', async () => {
    throw Object.assign(new Error('probe already exists'), { code: 'EEXIST' });
  });
  const unlink = t.mock.method(fs, 'unlink', async () => {});
  const check = await request(app)
    .get('/api/v1/lumen/config')
    .set('x-test-role', 'admin');

  assert.equal(check.status, 200);
  assert.equal(check.body.canSave, false);
  assert.equal(open.mock.callCount(), 1);
  assert.equal(unlink.mock.callCount(), 0);
});

test('branding differentiates undecodable input from storage errors', async () => {
  const url = '/api/v1/lumen/branding/logo';
  const corruptedPng = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    Buffer.from('not-a-valid-png'),
  ]);
  const invalid = await request(app)
    .put(url)
    .set('x-test-role', 'admin')
    .set('Content-Type', 'image/png')
    .send(corruptedPng);
  assert.equal(invalid.status, 415);
  assert.match(invalid.body.message, /could not be decoded/);

  const validPng = await sharp({
    create: { width: 8, height: 8, channels: 4, background: '#123456' },
  })
    .png()
    .toBuffer();
  const brandingDir = path.join(root, 'branding');
  await fs.rm(brandingDir, { recursive: true, force: true });
  await fs.writeFile(brandingDir, 'not a directory');
  try {
    const blocked = await request(app)
      .put(url)
      .set('x-test-role', 'admin')
      .set('Content-Type', 'image/png')
      .send(validPng);
    assert.equal(blocked.status, 503);
    assert.match(blocked.body.message, /not a usable directory/);
  } finally {
    await fs.rm(brandingDir, { force: true });
  }
});

test('embedded Lumen reports a config target directory as unwritable', async () => {
  const configFile = path.join(root, 'config.json');
  const parked = path.join(root, 'config-parked.json');
  const saved = await fs.readFile(configFile, 'utf8');
  await fs.rename(configFile, parked);
  await fs.mkdir(configFile);
  try {
    const check = await request(app)
      .get('/api/v1/lumen/config')
      .set('x-test-role', 'admin');
    assert.equal(check.body.canSave, false);
    assert.match(check.body.message, /not a usable directory/);

    const put = await request(app)
      .put('/api/v1/lumen/config')
      .set('x-test-role', 'admin')
      .send({ defaults: { theme: 'light' } });
    assert.equal(put.status, 503);
    assert.match(put.body.message, /not a usable directory/);
    assert.deepEqual(
      (await fs.readdir(root)).filter(
        (name) => name.endsWith('.saving') || name.endsWith('.probe')
      ),
      []
    );
  } finally {
    await fs.rmdir(configFile);
    await fs.rename(parked, configFile);
  }
  assert.equal(await fs.readFile(configFile, 'utf8'), saved);
});

test('embedded Lumen does not unlink a pre-existing save path after exclusive creation fails', async (t) => {
  const open = t.mock.method(fs, 'open', async () => {
    throw Object.assign(new Error('save path already exists'), {
      code: 'EEXIST',
    });
  });
  const unlink = t.mock.method(fs, 'unlink', async () => {});
  const save = await request(app)
    .put('/api/v1/lumen/config')
    .set('x-test-role', 'admin')
    .send({ defaults: { theme: 'light' } });

  assert.equal(save.status, 503);
  assert.equal(open.mock.callCount(), 1);
  assert.equal(unlink.mock.callCount(), 0);
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
  assert.equal(
    (await request(app).get('/api/v1/lumen/branding/..%2Fconfig.json')).status,
    404
  );
});
