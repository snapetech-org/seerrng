import cookieParser from 'cookie-parser';
import express from 'express';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import request from 'supertest';
import { mountLumenFrontend } from './lumenFrontend';

test('old and new browsers enter Lumen, explicit classic access persists, and setup stays reachable', async () => {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), 'seerrng-lumen-entry-test-')
  );
  try {
    await fs.writeFile(path.join(root, 'index.html'), '<html>Lumen</html>');
    await fs.writeFile(path.join(root, 'app.js'), '/* shipped Lumen bundle */');
    let initialized = true;
    const app = express();
    app.use(cookieParser());
    mountLumenFrontend(app, {
      directory: root,
      isInitialized: () => initialized,
    });
    app.get('/', (_req, res) => res.send('Native interface'));
    for (const cookie of ['', 'theme=seerrNGJ', 'theme=seerrOrig']) {
      const response = await request(app).get('/').set('Cookie', cookie);
      assert.equal(response.status, 302);
      assert.equal(response.headers.location, '/lumen/');
      assert.equal(response.headers['cache-control'], 'no-store');
    }
    const companion = request.agent(app);
    assert.equal(
      (await companion.get('/?interface=classic')).text,
      'Native interface'
    );
    assert.equal((await companion.get('/')).text, 'Native interface');
    const browser = request.agent(app);
    assert.equal((await browser.get('/seerrng')).headers.location, '/');
    assert.equal((await browser.get('/')).text, 'Native interface');
    assert.equal(
      (await browser.get('/lumen/movie/550')).text,
      '<html>Lumen</html>'
    );
    assert.equal((await browser.get('/')).headers.location, '/lumen/');
    assert.equal((await request(app).get('/lumen/app.js')).status, 200);
    assert.equal((await request(app).get('/lumen/missing.js')).status, 404);
    initialized = false;
    assert.equal((await request(app).get('/')).text, 'Native interface');
    assert.equal(
      (await request(app).get('/lumen/')).headers.location,
      '/setup'
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
