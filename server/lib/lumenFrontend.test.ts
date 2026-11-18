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
    app.get(
      ['/', '/resetpassword/:guid', '/requests/status', '/watch-sessions/:id'],
      (_req, res) => res.send('Native interface')
    );
    for (const page of [
      'jobs',
      'logs',
      'about',
      'categories',
      'network',
      'discovery',
      'metadata',
      'library-migration',
      'prowlarr',
    ]) {
      const response = await request(app).get(`/lumen/settings/${page}/`);
      assert.equal(response.status, 302);
      assert.equal(response.headers.location, `/lumen/admin/${page}`);
      assert.equal(response.headers['cache-control'], 'no-store');
    }
    const notificationSettings = await request(app).get(
      '/lumen/settings/notifications/webhook/'
    );
    assert.equal(notificationSettings.status, 302);
    assert.equal(
      notificationSettings.headers.location,
      '/lumen/admin/notifications/webhook'
    );
    assert.equal(notificationSettings.headers['cache-control'], 'no-store');
    const userDirectory = await request(app).get('/lumen/users/');
    const general = await request(app).get('/lumen/settings/main/');
    assert.equal(general.headers.location, '/lumen/admin/general');
    const userDefaults = await request(app).get('/lumen/settings/users/');
    assert.equal(userDefaults.headers.location, '/lumen/admin/general');
    const services = await request(app).get('/lumen/settings/services/');
    assert.equal(services.status, 302);
    assert.equal(services.headers.location, '/lumen/admin');
    assert.equal(services.headers['cache-control'], 'no-store');
    for (const provider of ['plex', 'jellyfin']) {
      const bookmark = await request(app).get(`/lumen/settings/${provider}/`);
      assert.equal(bookmark.status, 302);
      assert.equal(bookmark.headers.location, '/lumen/admin/media-libraries');
      assert.equal(bookmark.headers['cache-control'], 'no-store');
    }
    const legacyProwlarr = await request(app).get(
      '/lumen/settings/services?settingsSearchTarget=prowlarr'
    );
    assert.equal(legacyProwlarr.headers.location, '/lumen/admin/prowlarr');
    const admin = await request(app).get('/lumen/admin');
    assert.equal(admin.status, 200);
    assert.match(admin.text, /Lumen/);
    assert.equal(admin.headers['ratelimit-limit'], '600');
    assert.equal(userDirectory.status, 302);
    assert.equal(userDirectory.headers.location, '/lumen/admin/users');
    assert.equal(userDirectory.headers['cache-control'], 'no-store');
    for (const [bookmark, destination] of [
      ['/users/19/', '/household/19'],
      ['/profile/', '/me'],
      ['/profile/settings/password', '/me/account#password'],
      [
        '/profile/settings/episode-queue',
        '/me/account/tv-requests#episode-queue',
      ],
      [
        '/users/19/requests/?requestedBy=11&filter=pending&mediaType=movie',
        '/requests?requestedBy=19&show=pending&mediaType=movie',
      ],
      [
        '/users/19/watchlist?search=Arrival&page=2',
        '/watchlist/user/19?search=Arrival&page=2',
      ],
      ['/profile/settings/client-tokens', '/me/account/client-tokens'],
      [
        '/profile/settings/notifications/email/',
        '/me/account/notifications#notification-email',
      ],
      [
        '/profile/watchlist?search=Arrival&page=2',
        '/watchlist?search=Arrival&page=2',
      ],
    ]) {
      const response = await request(app).get(`/lumen${bookmark}`);
      assert.equal(response.status, 302);
      assert.equal(response.headers.location, `/lumen${destination}`);
      assert.equal(response.headers['cache-control'], 'no-store');
    }
    const userSettings = await request(app).get(
      '/lumen/users/19/settings/maturity'
    );
    assert.equal(userSettings.status, 302);
    assert.equal(
      userSettings.headers.location,
      '/lumen/admin/users/19/maturity'
    );
    const tvAccess = await request(app).get(
      '/lumen/users/19/settings/tv-request-access'
    );
    assert.equal(
      tvAccess.headers.location,
      '/lumen/admin/users/19/tv-request-access'
    );
    const notifications = await request(app).get(
      '/lumen/users/19/settings/notifications/telegram'
    );
    assert.equal(
      notifications.headers.location,
      '/lumen/admin/users/19/notifications#notification-telegram'
    );
    const shareFallback = await request(app).post('/lumen/share-target');
    assert.equal(shareFallback.status, 303);
    assert.equal(
      shareFallback.headers.location,
      '/lumen/share#share=unavailable'
    );
    assert.equal(shareFallback.headers['cache-control'], 'no-store');
    assert.equal(
      (await request(app).get('/lumen/share')).text,
      '<html>Lumen</html>'
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
    const filteredRequests = await request(app).get(
      '/requests/status?userId=19&filter=pending&mediaType=audiobook&timeFrame=7d&sort=added&sortDirection=asc&requestId=21&extra=1'
    );
    assert.equal(
      filteredRequests.headers.location,
      '/lumen/requests?requestedBy=19&show=pending&mediaType=book&bookFormat=audiobook&timeFrame=7d&order=oldest&requestId=21'
    );
    const softwareList = await request(app).get(
      '/requests?mediaType=retro&filter=downloading&userId=19'
    );
    assert.equal(
      softwareList.headers.location,
      '/lumen/requests?requestedBy=19&show=software&category=retro&softwareStatus=downloading'
    );
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
    for (const suffix of ['', '/join', '/42']) {
      const response = await request(app).get(
        `/watch-sessions${suffix}?token=ignored`
      );
      assert.equal(response.status, 302);
      assert.equal(response.headers.location, `/lumen/watch-sessions${suffix}`);
      assert.equal(response.headers['cache-control'], 'no-store');
    }
    assert.equal(
      (await request(app).get('/watch-sessions/9007199254740992')).text,
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
    assert.equal(
      (await companion.get('/watch-sessions/join')).text,
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
    const asset = await request(app).get('/lumen/app.js');
    assert.equal(asset.status, 200);
    assert.equal(asset.headers['ratelimit-limit'], undefined);
    const missingAsset = await request(app).get('/lumen/missing.js');
    assert.equal(missingAsset.status, 404);
    assert.equal(missingAsset.headers['ratelimit-limit'], undefined);
    assert.equal(
      (await request(app).get('/lumen/magazine/Science%20Vol.%202')).status,
      200
    );
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
      (await request(app).get('/lumen')).headers.location,
      '/lumen/'
    );
    for (const url of ['/lumen/', '/lumen/movie/123']) {
      const response = await request(app).get(url);
      assert.equal(response.status, 302, url);
      assert.equal(response.headers.location, '/lumen/setup', url);
      assert.equal(response.headers['cache-control'], 'no-store', url);
    }
    assert.equal((await request(app).get('/lumen/app.js')).status, 200);
    assert.equal((await request(app).get('/lumen/missing.js')).status, 404);
    assert.equal((await request(app).get('/lumen/setup')).status, 200);
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
      '/discover/list/2147483648',
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
      ['/watch-sessions', '/lumen/watch-sessions'],
      ['/watch-sessions/join?token=ignored', '/lumen/watch-sessions/join'],
      ['/watch-sessions/42', '/lumen/watch-sessions/42'],
      [
        '/requests?userId=19&filter=pending&mediaType=movie&extra=1',
        '/lumen/requests?requestedBy=19&show=pending&mediaType=movie',
      ],
      [
        '/requests/status?requestedBy=19&show=processing&mediaType=tv',
        '/lumen/requests?requestedBy=19&show=processing&mediaType=tv',
      ],
      [
        '/requests?userId=19&userId=20&filter=pending&filter=failed',
        '/lumen/requests',
      ],
      [
        '/requests?mediaType=modern&filter=all',
        '/lumen/requests?show=software&category=modern',
      ],
      ['/requests', '/lumen/requests'],
      ['/following/', '/lumen/following'],
      ['/library', '/lumen/library'],
      [
        '/issues?filter=open&mediaType=book&issueType=audio&timeFrame=7d&page=2&sort=modified&releaseYear=2020&genre=fiction',
        '/lumen/issues?filter=open&mediaType=book&issueType=audio&timeFrame=7d&page=2&sort=modified&releaseYear=2020&genre=fiction',
      ],
      ['/author/OL42A/', '/lumen/author/OL42A'],
      [
        '/series/bookshelf-series%3A1%3AU2VyaWVz%3A42/',
        '/lumen/book-series/bookshelf-series%3A1%3AU2VyaWVz%3A42',
      ],
      ['/book-series/requests', '/lumen/book-series/requests'],
      ['/book-series/42', '/lumen/book-series/42'],
      [
        '/book-series?query=Fixture+Series&format=ebook',
        '/lumen/book-series?query=Fixture+Series&format=ebook',
      ],
      [
        '/book-series/catalog?serverId=0&scope=audio%3Amain&providerId=hc%3A42&ignored=1',
        '/lumen/book-series/catalog?serverId=0&scope=audio%3Amain&providerId=hc%3A42',
      ],
      [
        '/book-series/bookshelf-series%3A1%3AU2VyaWVz',
        '/lumen/book-series/bookshelf-series%3A1%3AU2VyaWVz',
      ],
      ['/book/OL123W?format=audiobook', '/lumen/book/OL123W?f=audio'],
      [
        '/book/bookshelf%3A1%3AaGM6MTIz?format=audiobook&lookupTitle=Fixture+Book',
        '/lumen/book/bookshelf%3A1%3AaGM6MTIz?f=audio&lookupTitle=Fixture+Book',
      ],
      ['/magazine/Science%20Vol.%202', '/lumen/magazine/Science%20Vol.%202'],
      [
        '/music/5b36cb67-befa-41ca-a91d-a6dcf1f68062/',
        '/lumen/music/5b36cb67-befa-41ca-a91d-a6dcf1f68062',
      ],
      ['/artist/artist-42', '/lumen/artist/artist-42'],
      ['/comic/4050-12345', '/lumen/comic/4050-12345'],
      ['/sportarr/lg-000123/', '/lumen/sportarr/lg-000123'],
      [
        '/adult/12345678-1234-4123-8123-123456789abc?serverId=0',
        '/lumen/adult/12345678-1234-4123-8123-123456789abc?serverId=0',
      ],
      ['/users/', '/lumen/admin/users'],
      ['/games', '/lumen/game-library'],
      [
        '/software?category=retro&game=42&q=Zelda&extra=1',
        '/lumen/software?category=retro&q=Zelda&game=42',
      ],
      ['/games?steam=connected', '/lumen/game-library?steam=connected'],
      ['/calendar', '/lumen/calendar'],
      ['/swipe/', '/lumen/swipe'],
      ['/recordings/', '/lumen/recordings'],
      ['/collections/tv/19/', '/lumen/collections/tv/19'],
      [
        '/collections/music/artist-42?view=discography&extra=1',
        '/lumen/collections/music/artist-42?view=discography',
      ],
      ['/coming-soon', '/lumen/soon'],
      ['/discover/movies/upcoming/', '/lumen/soon?media=movie'],
      ['/discover/tv/upcoming', '/lumen/soon?media=tv'],
      ['/profile/settings/password', '/lumen/me/account#password'],
      [
        '/profile/settings/notifications/webpush',
        '/lumen/me/account/notifications#notification-webpush',
      ],
      [
        '/profile/settings/notifications/discord',
        '/lumen/me/account/notifications#notification-discord',
      ],
      [
        '/profile/settings/episode-queue',
        '/lumen/me/account/tv-requests#episode-queue',
      ],
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
      [
        '/discover/trending?mediaType=tv&timeWindow=week',
        '/lumen/trending?mediaType=tv&timeWindow=week',
      ],
      ['/discover/trending?mediaType=book', '/lumen/books'],
      [
        '/discover/books?subject=local+history',
        '/lumen/books?subject=local+history',
      ],
      [
        '/discover/music?genre=folk&sortBy=popular.year',
        '/lumen/music?genre=folk&sortBy=popular.year',
      ],
      ['/discover/book-recommendations/', '/lumen/books/recommendations'],
      ['/discover/collectors/', '/lumen/music/collectors'],
      ['/discover/providers', '/lumen/providers'],
      ['/discover/movies/genres', '/lumen/movies/genres'],
      ['/discover/tv/genres/', '/lumen/series/genres'],
      [
        '/discover/providers?feed=mdblist%2Flist&page=2&list=https%3A%2F%2Fmdblist.com%2Flists%2Fsample%2Flist&unmatched=1&ignored=1',
        '/lumen/providers?feed=mdblist%2Flist&page=2&list=https%3A%2F%2Fmdblist.com%2Flists%2Fsample%2Flist&unmatched=1',
      ],
      [
        '/share?title=A%26B&text=Example%0ATitle&url=https%3A%2F%2Fexample.com&ignored=1',
        '/lumen/share?title=A%26B&text=Example%0ATitle&url=https%3A%2F%2Fexample.com',
      ],
      ['/track-requests', '/lumen/track-requests'],
      ['/identify?source=A%26B&ignored=1', '/lumen/identify?source=A%26B'],
      ['/share?text=Example&image=1', '/lumen/share?text=Example&image=1'],
      ['/share?title=one&title=two&text=three', '/lumen/share?text=three'],

      ['/discover/games', '/lumen/games'],
      ['/discover/patches?kind=hack', '/lumen/patches?kind=hack'],
      ['/discover/audiobooks', '/lumen/audiobooks'],
      ['/discover/list/12345/?page=2&ignored=1', '/lumen/list/12345?page=2'],
      ['/franchise/anime/123/', '/lumen/franchise/anime/123'],
      ['/associations/movie/123/', '/lumen/associations/movie/123'],
      [
        '/associations/book/OL123W?view=graph&f=audio&type=shared-person&ignored=1',
        '/lumen/associations/book/OL123W?view=graph&f=audio&type=shared-person',
      ],
      [
        '/associations/movie/123?view=graph&view=list&f=audio&type=unrecognized',
        '/lumen/associations/movie/123',
      ],
      ['/movie/123/cast', '/lumen/movie/123/cast'],
      ['/movie/123/crew/', '/lumen/movie/123/crew'],
      ['/tv/456/cast/', '/lumen/tv/456/cast'],
      ['/tv/456/crew', '/lumen/tv/456/crew'],
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
      [
        '/discover/movies?libraryView=missing&genre=18',
        '/lumen/movies?genre=18&show=not',
      ],
      ['/discover/tv?libraryView=available', '/lumen/series?show=have'],
      [
        '/discover/tv?libraryView=missing&availability=4k',
        '/lumen/series?show=have&quality=4k',
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
