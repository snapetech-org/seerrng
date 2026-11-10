import { User } from '@server/entity/User';
import { Permission } from '@server/lib/permissions';
import { getSettings } from '@server/lib/settings';
import cookieParser from 'cookie-parser';
import express from 'express';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import request from 'supertest';
import {
  mountLumenFrontend,
  redirectLockedNativeFrontend,
} from './lumenFrontend';

test('selected frontend, explicit native access, and setup stay reachable', async () => {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), 'seerrng-lumen-entry-test-')
  );
  try {
    await fs.writeFile(path.join(root, 'index.html'), '<html>Lumen</html>');
    await fs.writeFile(path.join(root, 'app.js'), '/* shipped Lumen bundle */');
    let initialized = true;
    let frontend: 'native' | 'lumen' | 'external' = 'lumen';
    let enforceFrontend = false;
    let companionUrl = 'http://companion.example:5080';
    const app = express();
    app.use(cookieParser());
    mountLumenFrontend(app, {
      directory: root,
      isInitialized: () => initialized,
      frontend: () => frontend,
      enforceFrontend: () => enforceFrontend,
      companionUrl: () => companionUrl,
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
    enforceFrontend = true;
    assert.equal((await browser.get('/')).headers.location, '/lumen/');
    assert.equal(
      (await browser.get('/seerrng')).headers.location,
      '/?interface=classic'
    );
    assert.equal(
      (await browser.get('/?interface=classic')).text,
      'Native interface'
    );
    assert.equal((await browser.get('/')).headers.location, '/lumen/');
    enforceFrontend = false;
    assert.equal((await browser.get('/')).text, 'Native interface');
    assert.equal(
      (await browser.get('/lumen/movie/550')).text,
      '<html>Lumen</html>'
    );
    assert.equal((await browser.get('/')).headers.location, '/lumen/');
    assert.equal((await request(app).get('/lumen/app.js')).status, 200);
    assert.equal((await request(app).get('/lumen/missing.js')).status, 404);
    frontend = 'native';
    assert.equal((await request(app).get('/')).text, 'Native interface');
    frontend = 'external';
    assert.equal(
      (await request(app).get('/')).headers.location,
      'http://companion.example:5080/'
    );
    assert.equal((await browser.get('/seerrng')).headers.location, '/');
    assert.equal((await browser.get('/')).text, 'Native interface');
    assert.equal(
      (await browser.get('/?interface=default')).headers.location,
      'http://companion.example:5080/'
    );
    for (const invalid of [
      'javascript:alert(1)',
      'https://user:secret@example.com',
      'https://example.com/?token=secret',
      'not a URL',
    ]) {
      companionUrl = invalid;
      assert.equal((await request(app).get('/')).text, 'Native interface');
    }
    const sameHost = request(app);
    companionUrl = 'http://same.example';
    assert.equal(
      (await sameHost.get('/').set('Host', 'same.example')).text,
      'Native interface'
    );
    companionUrl = 'http://same.example/requests/';
    assert.equal(
      (await request(app).get('/').set('Host', 'same.example')).headers
        .location,
      companionUrl
    );
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

test('optional Lumen lock redirects non-admin native pages but preserves admin access', async () => {
  const settings = getSettings();
  const previous = {
    defaultFrontend: settings.main.defaultFrontend,
    lockLumenForNonAdmins: settings.main.lockLumenForNonAdmins,
  };
  settings.main.defaultFrontend = 'lumen';
  settings.main.lockLumenForNonAdmins = true;
  const app = express();
  app.use((req, _res, next) => {
    const role = req.header('X-Test-Role');
    if (role)
      req.user = new User({
        id: role === 'admin' ? 1 : 2,
        permissions: role === 'admin' ? Permission.ADMIN : 0,
      });
    next();
  });
  app.use(redirectLockedNativeFrontend);
  app.get('*path', (_req, res) => res.send('Native interface'));
  try {
    for (const route of [
      '/',
      '/seerrng',
      '/movie/123',
      '/?interface=classic',
    ]) {
      const response = await request(app).get(route).set('X-Test-Role', 'user');
      assert.equal(response.status, 302, route);
      assert.equal(response.headers.location, '/lumen/', route);
    }
    assert.equal(
      (await request(app).get('/movie/123').set('X-Test-Role', 'admin')).text,
      'Native interface'
    );
    assert.equal((await request(app).get('/login')).text, 'Native interface');
    assert.equal(
      (await request(app).get('/lumen/').set('X-Test-Role', 'user')).text,
      'Native interface'
    );
    settings.main.lockLumenForNonAdmins = false;
    assert.equal(
      (await request(app).get('/seerrng').set('X-Test-Role', 'user')).text,
      'Native interface'
    );
  } finally {
    settings.main.defaultFrontend = previous.defaultFrontend;
    settings.main.lockLumenForNonAdmins = previous.lockLumenForNonAdmins;
  }
});
