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
    app.get(['/', '/resetpassword/:guid', '/requests/status'], (_req, res) =>
      res.send('Native interface')
    );
    const recovery = await request(app).get('/resetpassword/example');
    assert.equal(recovery.headers.location, '/lumen/resetpassword/example');
    assert.equal(recovery.headers['cache-control'], 'no-store');
    for (const cookie of ['', 'theme=seerrNGJ', 'theme=seerrOrig']) {
      const response = await request(app).get('/').set('Cookie', cookie);
      assert.equal(response.status, 302);
      assert.equal(response.headers.location, '/lumen/');
      assert.equal(response.headers['cache-control'], 'no-store');
    }
    const requestLink = await request(app).get('/requests/status?requestId=21');
    assert.equal(requestLink.headers.location, '/lumen/requests?requestId=21');
    assert.equal(requestLink.headers['cache-control'], 'no-store');
    const softwareLink = await request(app).get(
      '/requests/status?softwareRequestId=42'
    );
    assert.equal(
      softwareLink.headers.location,
      '/lumen/requests?softwareRequestId=42'
    );

    assert.equal(
      (await request(app).get('/requests/status?requestId=21&requestId=22'))
        .text,
      'Native interface'
    );
    const companion = request.agent(app);
    assert.equal(
      (await companion.get('/?interface=classic')).text,
      'Native interface'
    );
    assert.equal((await companion.get('/')).text, 'Native interface');
    assert.equal(
      (await companion.get('/resetpassword/example')).text,
      'Native interface'
    );
    assert.equal(
      (await companion.get('/requests/status?requestId=21')).text,
      'Native interface'
    );
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
      (await request(app).get('/resetpassword/example')).text,
      'Native interface'
    );
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
      '/movie/123/cast/extra',
      '/person/123/crew',
      '/issues/9007199254740992',
      '/tv/1000000001/cast',
      '/?interface=classic',
    ]) {
      const response = await request(app).get(route).set('X-Test-Role', 'user');
      assert.equal(response.status, 302, route);
      assert.equal(response.headers.location, '/lumen/', route);
    }
    const recovery = await request(app)
      .get('/resetpassword/example')
      .set('X-Test-Role', 'user');
    assert.equal(recovery.headers.location, '/lumen/resetpassword/example');
    const requestLink = await request(app)
      .get('/requests/status?requestId=21')
      .set('X-Test-Role', 'user');
    assert.equal(requestLink.headers.location, '/lumen/requests?requestId=21');
    for (const [route, destination] of [
      ['/requests', '/lumen/requests'],
      ['/following/', '/lumen/following'],
      ['/library', '/lumen/library'],
      ['/games', '/lumen/game-library'],
      ['/games?steam=connected', '/lumen/game-library?steam=connected'],
      ['/calendar', '/lumen/calendar'],
      ['/coming-soon', '/lumen/soon'],
      ['/discover/movies/upcoming/', '/lumen/soon?media=movie'],
      ['/discover/tv/upcoming', '/lumen/soon?media=tv'],
      ['/profile/settings/password', '/lumen/me/account'],
      [
        '/profile/settings/notifications/webpush',
        '/lumen/me/account/notifications',
      ],
      [
        '/profile/settings/notifications/discord',
        '/lumen/me/account/notifications',
      ],
      ['/profile/settings/episode-queue', '/lumen/me/account/tv-requests'],
      ['/profile/settings/client-tokens', '/lumen/me/account/client-tokens'],
      [
        '/profile/watchlist?search=A%26B&mediaType=movie&page=2&userId=17',
        '/lumen/watchlist?search=A%26B&mediaType=movie&page=2',
      ],
      [
        '/discover/watchlist?search=Example&mediaType=book&page=2&userId=17',
        '/lumen/watchlist/discover?search=Example&mediaType=book&page=2',
      ],
      ['/issues/71', '/lumen/issues/71'],
      ['/issues?issue=71', '/lumen/issues?issue=71'],
      ['/downloads', '/lumen/downloads'],
      [
        '/indexer-search?query=A%26B&category=movie',
        '/lumen/indexer-search?query=A%26B&category=movie',
      ],
      [
        '/search?query=A%2FB&type=book&format=audiobook',
        '/lumen/search?q=A%2FB&f=audio',
      ],
      ['/search?query=a&query=b&type=movie', '/lumen/search?f=movie'],
      ['/discover/games', '/lumen/games'],
      ['/discover/patches?kind=hack', '/lumen/patches?kind=hack'],
      ['/discover/audiobooks', '/lumen/audiobooks'],
      ['/movie/123/cast', '/lumen/movie/123#cast'],
      ['/movie/123/crew/', '/lumen/movie/123#crew'],
      ['/tv/456/cast/', '/lumen/tv/456#cast'],
      ['/tv/456/crew', '/lumen/tv/456#crew'],
      ['/movie/123/recommendations', '/lumen/movie/123/recommendations'],
      ['/movie/123/similar', '/lumen/movie/123/similar'],
      ['/tv/456/recommendations', '/lumen/tv/456/recommendations'],
      ['/tv/456/similar', '/lumen/tv/456/similar'],
      [
        '/discover/movies/studio/42?excludeStudio=true&sortBy=vote_average.desc&ignored=1',
        '/lumen/movies?excludeStudio=true&sort=vote_average.desc&studio=42',
      ],
      [
        '/discover/tv/network/213?availability=4k',
        '/lumen/series?network=213&show=have&quality=4k',
      ],
      [
        '/discover/movies?genre=18%7C35&keywords=73',
        '/lumen/movies?keywords=73&genre=18%2C35',
      ],
      ['/discover/tv?genre=18,35', '/lumen/series?genre=18%2C35&match=all'],
      ['/movie/123', '/lumen/movie/123'],
      ['/tv/456/?ignored=1', '/lumen/tv/456'],
      ['/collection/78', '/lumen/collection/78'],
      ['/person/90', '/lumen/person/90'],
      ['/person/1000000001', '/lumen/'],
      ['/discover/movies/studio/nope', '/lumen/'],
    ]) {
      const response = await request(app).get(route).set('X-Test-Role', 'user');
      assert.equal(response.headers.location, destination, route);
      assert.equal(response.headers['cache-control'], 'no-store');
    }
    const nonHtmlRequest = await request(app)
      .get('/movie/123')
      .set('X-Test-Role', 'user')
      .set('Accept', 'application/json');
    assert.equal(nonHtmlRequest.status, 302);
    assert.equal(nonHtmlRequest.headers.location, '/lumen/movie/123');
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
