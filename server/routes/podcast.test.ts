import assert from 'node:assert/strict';
import { afterEach, before, beforeEach, describe, it, mock } from 'node:test';

import ApplePodcastsAPI from '@server/api/applePodcasts';
import AudiobookshelfPodcastsAPI, {
  AudiobookshelfAuthError,
  AudiobookshelfRequestError,
} from '@server/api/audiobookshelfPodcasts';
import { getRepository } from '@server/datasource';
import { User } from '@server/entity/User';
import { Permission } from '@server/lib/permissions';
import { clearAbsUserCache } from '@server/lib/podcastFollowers';
import { getSettings } from '@server/lib/settings';
import { checkUser } from '@server/middleware/auth';
import authRoutes from '@server/routes/auth';
import podcastRoutes, { clearPodcastCaches } from '@server/routes/podcast';
import { setupTestDb } from '@server/test/db';
import axios from 'axios';
import type { Express } from 'express';
import express from 'express';
import rateLimit from 'express-rate-limit';
import session from 'express-session';
import dns from 'node:dns/promises';
import request from 'supertest';

let app: Express;

function createApp() {
  const expressApp = express();
  expressApp.use(express.json());
  expressApp.use(
    session({
      // nosemgrep: javascript.express.security.audit.express-session-hardcoded-secret.express-session-hardcoded-secret -- fixed test-only session signing fixture; never used as an application credential
      secret: 'test-secret',
      cookie: { secure: 'auto' },
      resave: false,
      saveUninitialized: false,
    })
  );
  expressApp.use(rateLimit({ windowMs: 60_000, limit: 10_000 }), checkUser);
  expressApp.use('/auth', authRoutes);
  expressApp.use('/podcast', podcastRoutes);
  expressApp.use(
    (
      err: { status?: number; message?: string },
      _req: express.Request,
      res: express.Response,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      _next: express.NextFunction
    ) => {
      res
        .status(err.status ?? 500)
        .json({ status: err.status ?? 500, message: err.message });
    }
  );
  return expressApp;
}

before(() => {
  app = createApp();
});

beforeEach(() => {
  // the download queue is read to keep queued episodes from being offered
  // twice; tests that care re-mock it
  mock.method(
    AudiobookshelfPodcastsAPI.prototype,
    'getLibraryEpisodeDownloads',
    async () => ({ downloading: [], queued: [] })
  );
  // listening progress is read on every show page; no test may reach ABS
  mock.method(
    AudiobookshelfPodcastsAPI.prototype,
    'getEpisodeProgress',
    async () => ({
      finished: new Map<string, Set<string>>(),
      started: new Map<string, Set<string>>(),
      complete: true,
    })
  );
  // Audiobookshelf accounts are read to link follows; none by default
  mock.method(AudiobookshelfPodcastsAPI.prototype, 'getUsers', async () => []);
  // feed URLs are checked for private addresses: test hosts resolve to a
  // public address unless they are named "internal"
  mock.method(dns, 'lookup', async (hostname: string) => [
    {
      address: hostname.includes('internal') ? '192.168.1.10' : '93.184.216.34',
      family: 4,
    },
  ]);
});

afterEach(() => {
  mock.restoreAll();
  clearPodcastCaches();
  clearAbsUserCache();
});

setupTestDb();

async function login(email = 'admin@seerr.dev') {
  const settings = getSettings();
  const priorLocalLogin = settings.main.localLogin;
  settings.main.localLogin = true;

  try {
    const agent = request.agent(app);
    const res = await agent
      .post('/auth/local')
      .send({ email, password: 'test1234' });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    return agent;
  } finally {
    settings.main.localLogin = priorLocalLogin;
  }
}

function configureAbs(
  t: { after: (fn: () => void) => void },
  externalUrl?: string
) {
  const settings = getSettings();
  const original = settings.audiobookshelf;
  settings.audiobookshelf = {
    id: 1,
    name: 'ABS',
    hostname: 'abs.local',
    port: 13378,
    apiKey: 'secret-abs-key',
    useSsl: false,
    baseUrl: '',
    externalUrl,
    libraryId: 'books',
    libraryName: 'Books',
    syncEnabled: true,
  };
  t.after(() => {
    settings.audiobookshelf = original;
  });
}

function mockPodcastLibrary(name = 'Podcasts', fullPath = '/podcasts') {
  return mock.method(
    AudiobookshelfPodcastsAPI.prototype,
    'getLibraries',
    async () => [
      { id: 'books', name: 'Books', mediaType: 'book', folders: [] },
      {
        id: 'pod-lib',
        name,
        mediaType: 'podcast',
        folders: [{ id: 'fol-1', fullPath }],
      },
    ]
  );
}

describe('Podcast API routes', () => {
  it('returns status configured=false when ABS is unconfigured or has no podcast library', async (t) => {
    const agent = await login();
    const settings = getSettings();
    const original = settings.audiobookshelf;
    settings.audiobookshelf = null;
    t.after(() => {
      settings.audiobookshelf = original;
    });

    const unconfigured = await agent.get('/podcast/status');
    assert.strictEqual(unconfigured.status, 200);
    assert.deepStrictEqual(unconfigured.body, {
      configured: false,
      libraryName: null,
      externalUrl: null,
      canManage: true,
      canManageCleanup: true,
    });

    configureAbs(t, 'https://listen.example.test');
    mock.method(
      AudiobookshelfPodcastsAPI.prototype,
      'getLibraries',
      async () => [
        { id: 'books', name: 'Books', mediaType: 'book', folders: [] },
      ]
    );

    const noPodLib = await agent.get('/podcast/status');
    assert.strictEqual(noPodLib.status, 200);
    assert.deepStrictEqual(noPodLib.body, {
      configured: false,
      libraryName: null,
      externalUrl: null,
      canManage: true,
      canManageCleanup: true,
    });
  });

  it('returns status configured=true and reflects user canManage permission', async (t) => {
    configureAbs(t, 'https://listen.example.test/');
    mockPodcastLibrary('My Podcasts');

    const userRepo = getRepository(User);
    const friend = await userRepo.findOneByOrFail({
      email: 'friend@seerr.dev',
    });
    friend.permissions = Permission.VOTE;
    await userRepo.save(friend);

    const agent = await login('friend@seerr.dev');
    const res = await agent.get('/podcast/status');
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(res.body, {
      configured: true,
      libraryName: 'My Podcasts',
      externalUrl: 'https://listen.example.test',
      canManage: false,
      canManageCleanup: false,
    });

    // a requester may follow shows but not delete files for everyone
    // (permissions are read on each request: the same session is reused)
    friend.permissions = Permission.REQUEST;
    await userRepo.save(friend);
    const asRequester = await agent.get('/podcast/status');
    assert.strictEqual(asRequester.body.canManage, true);
    assert.strictEqual(asRequester.body.canManageCleanup, false);

    // podcasts come with music: music requests alone are enough to follow,
    // and books alone are not
    friend.permissions = Permission.REQUEST_MUSIC;
    await userRepo.save(friend);
    const asMusic = await agent.get('/podcast/status');
    assert.strictEqual(asMusic.body.canManage, true);
    assert.strictEqual(asMusic.body.canManageCleanup, false);
    friend.permissions = Permission.REQUEST_BOOK + Permission.REQUEST_MOVIE;
    await userRepo.save(friend);
    const asBooks = await agent.get('/podcast/status');
    assert.strictEqual(asBooks.body.canManage, false);

    friend.permissions = Permission.MANAGE_REQUESTS;
    await userRepo.save(friend);
    const asManager = await agent.get('/podcast/status');
    assert.strictEqual(asManager.body.canManageCleanup, true);
  });

  it('returns 404 when ABS is not set up on library/search/feed/subscribe routes', async (t) => {
    const settings = getSettings();
    const original = settings.audiobookshelf;
    settings.audiobookshelf = null;
    t.after(() => {
      settings.audiobookshelf = original;
    });

    const agent = await login();
    const lib = await agent.get('/podcast/library');
    assert.strictEqual(lib.status, 404);
    assert.strictEqual(lib.body.message, 'Podcasts are not set up.');

    const search = await agent.get('/podcast/search?q=test');
    assert.strictEqual(search.status, 404);
    assert.strictEqual(search.body.message, 'Podcasts are not set up.');
  });

  it('maps library pagination, sorting, stripped descriptions, and caches podcast library lookup', async (t) => {
    configureAbs(t, 'https://listen.example.test');
    const getLibraries = mockPodcastLibrary();
    const getItems = mock.method(
      AudiobookshelfPodcastsAPI.prototype,
      'getPodcastLibraryItems',
      async () => ({
        total: 1,
        limit: 48,
        page: 1,
        results: [
          {
            id: 'pod-1',
            addedAt: 1700000000000,
            updatedAt: 1700000000000,
            title: 'Show One',
            author: 'Jane Doe',
            description: `<p>Hello &amp; <b>world</b> ${'x'.repeat(700)}</p>`,
            genres: ['Science'],
            feedUrl: 'https://feeds.example.test/one.xml',
            itunesId: '101',
            explicit: false,
            language: 'en',
            numEpisodes: 5,
            autoDownloadEpisodes: true,
          },
        ],
      })
    );

    const agent = await login();
    const res = await agent.get('/podcast/library?page=2&limit=24&sort=added');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.page, 2);
    assert.strictEqual(res.body.limit, 24);
    assert.strictEqual(res.body.results[0].description.length, 600);
    assert.ok(res.body.results[0].description.startsWith('Hello & world '));
    assert.strictEqual(
      res.body.results[0].coverUrl,
      '/api/v1/podcast/cover/pod-1'
    );
    assert.strictEqual(
      res.body.results[0].openUrl,
      'https://listen.example.test/item/pod-1'
    );
    assert.deepStrictEqual(getItems.mock.calls[0].arguments, [
      'pod-lib',
      { page: 1, limit: 24, sort: 'addedAt', desc: 1 },
    ]);

    await agent.get('/podcast/library?sort=episodes');
    assert.strictEqual(getLibraries.mock.callCount(), 1);
    assert.deepStrictEqual(getItems.mock.calls[1].arguments, [
      'pod-lib',
      { page: 0, limit: 48, sort: 'media.numTracks', desc: 1 },
    ]);
  });

  it('validates itemId on all itemId routes and returns 404 for missing or non-podcast items', async (t) => {
    configureAbs(t);
    mockPodcastLibrary();
    mock.method(
      AudiobookshelfPodcastsAPI.prototype,
      'getPodcastItem',
      async () => null
    );

    const agent = await login();
    for (const badPath of [
      '/podcast/library/bad$id',
      '/podcast/cover/bad$id',
      '/podcast/library/bad$id/available',
      '/podcast/library/bad$id/downloads',
    ]) {
      const bad = await agent.get(badPath);
      assert.strictEqual(bad.status, 400, badPath);
    }
    const badDownload = await agent
      .post('/podcast/library/bad$id/download')
      .send({ keys: ['k'] });
    assert.strictEqual(badDownload.status, 400);
    const badAuto = await agent
      .put('/podcast/library/bad$id/auto')
      .send({ autoDownload: true });
    assert.strictEqual(badAuto.status, 400);

    const missing = await agent.get('/podcast/library/missing-1');
    assert.strictEqual(missing.status, 404);
  });

  it('returns podcast details with episodes sorted newest first', async (t) => {
    configureAbs(t, 'https://listen.example.test');
    mockPodcastLibrary();
    mock.method(
      AudiobookshelfPodcastsAPI.prototype,
      'getPodcastItem',
      async () => ({
        id: 'pod-1',
        libraryId: 'pod-lib',
        mediaType: 'podcast',
        title: 'Detail Show',
        author: 'Host',
        description: '<p>Main</p>',
        genres: ['History'],
        feedUrl: 'https://feeds.example.test/detail.xml',
        itunesId: null,
        explicit: false,
        language: 'en',
        numEpisodes: 2,
        autoDownloadEpisodes: false,
        addedAt: 1700000000000,
        episodes: [
          {
            id: 'ep-old',
            title: 'Old Ep',
            subtitle: null,
            description: `<p>${'a'.repeat(1100)}</p>`,
            pubDate: 'Mon, 01 Jan 2024 00:00:00 GMT',
            publishedAt: 1704067200000,
            season: '1',
            episode: '1',
            episodeType: 'full',
            enclosureUrl: 'https://cdn.example.test/old.mp3',
            durationSeconds: 300,
            size: 100,
          },
          {
            id: 'ep-new',
            title: 'New Ep',
            subtitle: null,
            description: '<p>Fresh</p>',
            pubDate: 'Tue, 02 Jan 2024 00:00:00 GMT',
            publishedAt: 1704153600000,
            season: '1',
            episode: '2',
            episodeType: 'full',
            enclosureUrl: 'https://cdn.example.test/new.mp3',
            durationSeconds: 600,
            size: 200,
          },
        ],
      })
    );

    const agent = await login();
    const res = await agent.get('/podcast/library/pod-1');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(
      res.body.feedUrl,
      'https://feeds.example.test/detail.xml'
    );
    assert.strictEqual(res.body.episodes[0].id, 'ep-new');
    assert.strictEqual(res.body.episodes[1].id, 'ep-old');
    assert.strictEqual(res.body.autoRemovePlayed, false);
    assert.strictEqual(res.body.episodes[0].played, false);
    assert.strictEqual(res.body.episodes[1].description.length, 1000);
    assert.strictEqual(
      res.body.episodes[0].openUrl,
      'https://listen.example.test/item/pod-1'
    );
  });

  it('hides another linked user’s podcast details and download controls by item ID', async (t) => {
    configureAbs(t);
    mockPodcastLibrary();
    const settings = getSettings();
    const originalFollowers = settings.podcastFollowers;
    t.after(() => {
      settings.podcastFollowers = originalFollowers;
    });
    const userRepo = getRepository(User);
    const viewer = await userRepo.findOneByOrFail({
      email: 'friend@seerr.dev',
    });
    viewer.permissions = Permission.REQUEST_MUSIC;
    await userRepo.save(viewer);
    const viewerAbsId = 'viewer-abs-id';
    settings.podcastFollowers = {
      ...originalFollowers,
      links: { ...originalFollowers.links, [String(viewer.id)]: viewerAbsId },
    };

    const item = {
      id: 'private-show',
      libraryId: 'pod-lib',
      mediaType: 'podcast',
      title: 'Private Show',
      author: null,
      description: null,
      genres: [],
      feedUrl: 'https://feeds.example.test/private.xml',
      itunesId: null,
      explicit: false,
      language: null,
      numEpisodes: 1,
      autoDownloadEpisodes: true,
      addedAt: null,
      tags: ['follower:another-user'],
      episodes: [],
    };
    const getItem = mock.method(
      AudiobookshelfPodcastsAPI.prototype,
      'getPodcastItem',
      async () => item
    );
    const hiddenItem = {
      id: item.id,
      addedAt: null,
      updatedAt: null,
      title: item.title,
      author: item.author,
      description: item.description,
      genres: item.genres,
      feedUrl: item.feedUrl,
      itunesId: item.itunesId,
      explicit: item.explicit,
      language: item.language,
      numEpisodes: item.numEpisodes,
      autoDownloadEpisodes: item.autoDownloadEpisodes,
      tags: item.tags,
    };
    mock.method(
      AudiobookshelfPodcastsAPI.prototype,
      'getPodcastLibraryItems',
      async () => ({ total: 1, limit: 500, page: 0, results: [hiddenItem] })
    );
    const getFeed = mock.method(
      AudiobookshelfPodcastsAPI.prototype,
      'getPodcastFeed',
      async () => {
        throw new Error('A hidden feed must not be fetched.');
      }
    );
    const getCover = mock.method(
      AudiobookshelfPodcastsAPI.prototype,
      'getPodcastCover',
      async () => ({ buffer: Buffer.from('private'), contentType: 'image/png' })
    );
    const getDownloads = mock.method(
      AudiobookshelfPodcastsAPI.prototype,
      'getPodcastDownloads',
      async () => ({ downloading: [], queued: 0 })
    );
    const updateAuto = mock.method(
      AudiobookshelfPodcastsAPI.prototype,
      'updateAutoDownload',
      async () => undefined
    );
    const queue = mock.method(
      AudiobookshelfPodcastsAPI.prototype,
      'getLibraryEpisodeDownloads',
      async () => ({
        downloading: [
          {
            title: 'Private Episode',
            podcastId: item.id,
            podcastTitle: item.title,
          },
        ],
        queued: [],
      })
    );

    const agent = await login(viewer.email);
    for (const path of [
      '/podcast/library/private-show',
      '/podcast/library/private-show/available',
      '/podcast/library/private-show/downloads',
    ]) {
      const response = await agent.get(path);
      assert.strictEqual(response.status, 404, path);
    }
    const cover = await agent.get('/podcast/cover/private-show');
    assert.strictEqual(cover.status, 404);
    const download = await agent
      .post('/podcast/library/private-show/download')
      .send({ keys: ['episode'] });
    assert.strictEqual(download.status, 404);
    const auto = await agent
      .put('/podcast/library/private-show/auto')
      .send({ autoDownload: false });
    assert.strictEqual(auto.status, 404);
    const activity = await agent.get('/podcast/activity');
    assert.strictEqual(activity.status, 200);
    assert.deepStrictEqual(activity.body, { downloading: [], queued: [] });

    assert.strictEqual(getFeed.mock.callCount(), 0);
    assert.strictEqual(getCover.mock.callCount(), 0);
    assert.strictEqual(getDownloads.mock.callCount(), 0);
    assert.strictEqual(updateAuto.mock.callCount(), 0);
    assert.strictEqual(getItem.mock.callCount(), 5);
    assert.strictEqual(queue.mock.callCount(), 1);
  });

  it('proxies image covers with private Cache-Control and returns 404 when absent', async (t) => {
    configureAbs(t);
    mockPodcastLibrary();
    let coverResult: { buffer: Buffer; contentType: string } | null = {
      buffer: Buffer.from('img-bytes'),
      contentType: 'image/webp',
    };
    const covers = mock.method(
      AudiobookshelfPodcastsAPI.prototype,
      'getPodcastCover',
      async () => coverResult
    );
    mock.method(
      AudiobookshelfPodcastsAPI.prototype,
      'getPodcastLibraryItems',
      async () => ({
        results: [
          { id: 'pod-1', title: 'Show', feedUrl: null, itunesId: null },
        ],
        total: 1,
        limit: 500,
        page: 0,
      })
    );

    const agent = await login();
    const ok = await agent.get('/podcast/cover/pod-1');
    assert.strictEqual(ok.status, 200);
    assert.strictEqual(ok.headers['content-type'], 'image/webp');
    assert.strictEqual(ok.headers['cache-control'], 'private, max-age=86400');

    coverResult = null;
    const missing = await agent.get('/podcast/cover/pod-1');
    assert.strictEqual(missing.status, 404);

    // not a show in the podcast library (a book, another library): no cover
    const callsBefore = covers.mock.callCount();
    const book = await agent.get('/podcast/cover/book-1');
    assert.strictEqual(book.status, 404);
    assert.strictEqual(covers.mock.callCount(), callsBefore);
  });

  it('matches search results against library by normalized feedUrl or itunesId', async (t) => {
    configureAbs(t);
    mockPodcastLibrary();
    mock.method(
      AudiobookshelfPodcastsAPI.prototype,
      'getPodcastLibraryItems',
      async () => ({
        total: 2,
        limit: 500,
        page: 0,
        results: [
          {
            id: 'lib-by-feed',
            addedAt: null,
            updatedAt: null,
            title: 'Matched By Feed',
            author: null,
            description: null,
            genres: [],
            feedUrl: 'https://Feeds.Example.Test/show.xml/',
            itunesId: null,
            explicit: false,
            language: null,
            numEpisodes: 1,
            autoDownloadEpisodes: true,
          },
          {
            id: 'lib-by-itunes',
            addedAt: null,
            updatedAt: null,
            title: 'Matched By iTunes',
            author: null,
            description: null,
            genres: [],
            feedUrl: null,
            itunesId: '777',
            explicit: false,
            language: null,
            numEpisodes: 2,
            autoDownloadEpisodes: false,
          },
        ],
      })
    );
    mock.method(
      AudiobookshelfPodcastsAPI.prototype,
      'searchPodcasts',
      async () => [
        {
          itunesId: '111',
          title: 'Matched By Feed',
          author: 'A',
          coverUrl: 'https://cdn.example.test/1.jpg',
          feedUrl: 'http://feeds.example.test/show.xml',
          genres: ['Tech'],
          episodeCount: 10,
          explicit: false,
        },
        {
          itunesId: '777',
          title: 'Matched By iTunes',
          author: 'B',
          coverUrl: null,
          feedUrl: 'https://other.example.test/feed.xml',
          genres: [],
          episodeCount: 5,
          explicit: false,
        },
        {
          itunesId: '999',
          title: 'Not In Library',
          author: 'C',
          coverUrl: null,
          feedUrl: 'https://new.example.test/rss',
          genres: [],
          episodeCount: 3,
          explicit: false,
        },
      ]
    );

    const agent = await login();
    const bad = await agent.get('/podcast/search?q=');
    assert.strictEqual(bad.status, 400);

    const res = await agent.get('/podcast/search?q=tech');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.results[0].inLibrary, true);
    assert.strictEqual(res.body.results[0].libraryItemId, 'lib-by-feed');
    assert.strictEqual(res.body.results[1].inLibrary, true);
    assert.strictEqual(res.body.results[1].libraryItemId, 'lib-by-itunes');
    assert.strictEqual(res.body.results[2].inLibrary, false);
    assert.strictEqual(res.body.results[2].libraryItemId, null);
  });

  it('marks a found show Following only for the people who follow it', async (t) => {
    configureAbs(t);
    mockPodcastLibrary();
    const ownerAbsId = '7e942dd2-b7a8-48cf-bfcc-87241074180e';
    const otherAbsId = '1b2c3d4e-0000-4000-8000-000000000001';
    mock.method(AudiobookshelfPodcastsAPI.prototype, 'getUsers', async () => [
      { id: ownerAbsId, username: 'owner', email: null, type: 'root' },
    ]);
    const show = (id: string, feed: string, tags: string[], auto = true) => ({
      id,
      addedAt: null,
      updatedAt: null,
      title: id,
      author: null,
      description: null,
      genres: [],
      feedUrl: feed,
      itunesId: null,
      explicit: false,
      language: null,
      numEpisodes: 1,
      autoDownloadEpisodes: auto,
      tags,
    });
    mock.method(
      AudiobookshelfPodcastsAPI.prototype,
      'getPodcastLibraryItems',
      async () => ({
        total: 3,
        limit: 500,
        page: 0,
        results: [
          show('mine', 'https://feeds.example.test/mine.xml', [
            `follower:${ownerAbsId}`,
          ]),
          show('theirs', 'https://feeds.example.test/theirs.xml', [
            `follower:${otherAbsId}`,
          ]),
          // in my shows for one episode: not followed
          show(
            'episodes-only',
            'https://feeds.example.test/episodes.xml',
            [`follower:${ownerAbsId}`],
            false
          ),
        ],
      })
    );
    const found = (feed: string) => ({
      itunesId: null,
      title: feed,
      author: null,
      coverUrl: null,
      feedUrl: feed,
      genres: [],
      episodeCount: 1,
      explicit: false,
    });
    mock.method(
      AudiobookshelfPodcastsAPI.prototype,
      'searchPodcasts',
      async () => [
        found('https://feeds.example.test/mine.xml'),
        found('https://feeds.example.test/theirs.xml'),
        found('https://feeds.example.test/episodes.xml'),
      ]
    );

    const agent = await login();
    const res = await agent.get('/podcast/search?q=show');
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(
      res.body.results.map(
        (entry: { libraryItemId: string; following?: boolean }) => [
          entry.libraryItemId,
          entry.following === true,
        ]
      ),
      [
        ['mine', true],
        ['theirs', false],
        ['episodes-only', false],
      ]
    );
  });

  it('validates feedUrl and caches feed results per user', async (t) => {
    configureAbs(t);
    mockPodcastLibrary();
    const getFeed = mock.method(
      AudiobookshelfPodcastsAPI.prototype,
      'getPodcastFeed',
      async () => ({
        title: 'Preview Show',
        author: 'Host',
        description: '<p>Feed</p>',
        imageUrl: 'http://cdn.example.test/art.jpg',
        feedUrl: 'https://feeds.example.test/show.xml',
        itunesId: '123',
        itunesPageUrl: null,
        language: 'en',
        categories: ['Tech'],
        explicit: false,
        releaseDate: null,
        episodes: Array.from({ length: 120 }, (_, i) => ({
          key: `ep-${i}`,
          title: `Episode ${i}`,
          subtitle: null,
          description: `<p>Desc ${i}</p>`,
          pubDate: 'Tue, 02 Jan 2024 00:00:00 GMT',
          publishedAtMs: 1704153600000 - i * 1000,
          durationSeconds: 120,
          enclosureUrl: `https://cdn.example.test/${i}.mp3`,
          raw: { guid: `ep-${i}`, title: `Episode ${i}` },
        })),
      })
    );

    // the preview checks whether the show is already in the library
    mock.method(
      AudiobookshelfPodcastsAPI.prototype,
      'getPodcastLibraryItems',
      async () => ({ total: 0, limit: 500, page: 0, results: [] })
    );

    // ABS fetches the URL with its admin key: same permission as subscribing
    const userRepo = getRepository(User);
    const friend = await userRepo.findOneByOrFail({
      email: 'friend@seerr.dev',
    });
    friend.permissions = Permission.VOTE;
    await userRepo.save(friend);
    const friendAgent = await login('friend@seerr.dev');
    const forbidden = await friendAgent
      .post('/podcast/feed')
      .send({ feedUrl: 'https://feeds.example.test/show.xml' });
    assert.strictEqual(forbidden.status, 403);

    const agent = await login();
    for (const invalidUrl of [
      'ftp://feeds.example.test/a.xml',
      'https://user:pass@feeds.example.test/a.xml',
      `https://feeds.example.test/${'a'.repeat(2040)}`,
      // private, loopback and link-local targets are refused
      'http://127.0.0.1:13378/api/me',
      'http://192.168.68.1/',
      'http://169.254.169.254/latest/meta-data',
      'http://[::1]/',
      'https://feeds.internal.test/show.xml',
    ]) {
      const bad = await agent
        .post('/podcast/feed')
        .send({ feedUrl: invalidUrl });
      assert.strictEqual(bad.status, 400, invalidUrl);
    }
    assert.strictEqual(getFeed.mock.callCount(), 0);

    const ok1 = await agent
      .post('/podcast/feed')
      .send({ feedUrl: 'https://feeds.example.test/show.xml' });
    assert.strictEqual(ok1.status, 200);
    assert.strictEqual(ok1.body.episodes.length, 100);
    assert.strictEqual(ok1.body.episodeCount, 120);
    assert.strictEqual(ok1.body.episodes[0].key, 'ep-0');
    // plain-http artwork is upgraded so Lumen can show it
    assert.strictEqual(ok1.body.imageUrl, 'https://cdn.example.test/art.jpg');

    const ok2 = await agent
      .post('/podcast/feed')
      .send({ feedUrl: 'https://feeds.example.test/show.xml' });
    assert.strictEqual(ok2.status, 200);
    assert.strictEqual(getFeed.mock.callCount(), 1);
  });

  it('enforces permissions, duplicate conflict, safe path building, and episode queuing on subscribe', async (t) => {
    configureAbs(t);
    mockPodcastLibrary('Podcasts', '/media/podcasts/');

    const userRepo = getRepository(User);
    const friend = await userRepo.findOneByOrFail({
      email: 'friend@seerr.dev',
    });
    friend.permissions = Permission.VOTE;
    await userRepo.save(friend);

    const friendAgent = await login('friend@seerr.dev');
    const forbidden = await friendAgent
      .post('/podcast/subscribe')
      .send({ feedUrl: 'https://feeds.example.test/new.xml' });
    assert.strictEqual(forbidden.status, 403);

    mock.method(
      AudiobookshelfPodcastsAPI.prototype,
      'getPodcastLibraryItems',
      async () => ({
        total: 1,
        limit: 500,
        page: 0,
        results: [
          {
            id: 'existing-1',
            addedAt: null,
            updatedAt: null,
            title: 'Existing',
            author: null,
            description: null,
            genres: [],
            feedUrl: 'https://feeds.example.test/existing.xml',
            itunesId: '555',
            explicit: false,
            language: null,
            numEpisodes: 1,
            autoDownloadEpisodes: true,
          },
        ],
      })
    );

    const adminAgent = await login();
    const conflict = await adminAgent
      .post('/podcast/subscribe')
      .send({ feedUrl: 'https://feeds.example.test/existing.xml' });
    assert.strictEqual(conflict.status, 409);
    assert.strictEqual(conflict.body.libraryItemId, 'existing-1');

    mock.method(
      AudiobookshelfPodcastsAPI.prototype,
      'getPodcastFeed',
      async () => ({
        title: 'Bad: /Title* "Here"?',
        author: 'Host',
        description: '<p>Desc</p>',
        imageUrl: 'https://cdn.example.test/art.jpg',
        feedUrl: 'https://feeds.example.test/new.xml',
        itunesId: '888',
        itunesPageUrl: null,
        language: 'en',
        categories: ['Tech'],
        explicit: false,
        releaseDate: null,
        episodes: [
          {
            key: 'k1',
            title: 'Ep 1',
            subtitle: null,
            description: null,
            pubDate: null,
            publishedAtMs: 1704153600000,
            durationSeconds: 100,
            enclosureUrl: 'https://cdn.example.test/1.mp3',
            raw: { guid: 'k1', title: 'Ep 1' },
          },
          {
            key: 'k2',
            title: 'Ep 2',
            subtitle: null,
            description: null,
            pubDate: null,
            publishedAtMs: 1704067200000,
            durationSeconds: 100,
            enclosureUrl: 'https://cdn.example.test/2.mp3',
            raw: { guid: 'k2', title: 'Ep 2' },
          },
          {
            key: 'k3',
            title: 'Ep 3',
            subtitle: null,
            description: null,
            pubDate: null,
            publishedAtMs: 1703980800000,
            durationSeconds: 100,
            enclosureUrl: 'https://cdn.example.test/3.mp3',
            raw: { guid: 'k3', title: 'Ep 3' },
          },
        ],
      })
    );
    const createPodcast = mock.method(
      AudiobookshelfPodcastsAPI.prototype,
      'createPodcast',
      async (
        payload: Parameters<AudiobookshelfPodcastsAPI['createPodcast']>[0]
      ) => ({
        id: 'created-1',
        title: payload.media.metadata.title,
      })
    );
    const downloadEpisodes = mock.method(
      AudiobookshelfPodcastsAPI.prototype,
      'downloadEpisodes',
      async () => undefined
    );

    const ok = await adminAgent.post('/podcast/subscribe').send({
      feedUrl: 'https://feeds.example.test/new.xml',
      autoDownload: false,
      downloadLatest: 2,
    });
    assert.strictEqual(ok.status, 200);
    assert.deepStrictEqual(ok.body, {
      id: 'created-1',
      title: 'Bad: /Title* "Here"?',
      queued: 2,
    });
    assert.strictEqual(
      createPodcast.mock.calls[0].arguments[0].path,
      '/media/podcasts/Bad Title Here'
    );
    assert.strictEqual(
      createPodcast.mock.calls[0].arguments[0].media.autoDownloadEpisodes,
      false
    );
    assert.deepStrictEqual(downloadEpisodes.mock.calls[0].arguments, [
      'created-1',
      [
        { guid: 'k1', title: 'Ep 1' },
        { guid: 'k2', title: 'Ep 2' },
      ],
    ]);

    // a private feed address is refused before ABS is asked
    const privateFeed = await adminAgent
      .post('/podcast/subscribe')
      .send({ feedUrl: 'http://10.0.0.5/feed.xml' });
    assert.strictEqual(privateFeed.status, 400);
  });

  it('gets chosen episodes or every episode, on subscribe and for a show already in', async (t) => {
    configureAbs(t);
    mockPodcastLibrary('Podcasts', '/media/podcasts/');
    mock.method(
      AudiobookshelfPodcastsAPI.prototype,
      'getPodcastLibraryItems',
      async () => ({ total: 0, limit: 500, page: 0, results: [] })
    );
    const episode = (n: number) => ({
      key: `k${n}`,
      title: `Ep ${n}`,
      subtitle: null,
      description: null,
      pubDate: null,
      publishedAtMs: 1704153600000 - n * 86400000,
      durationSeconds: 100,
      enclosureUrl: `https://cdn.example.test/${n}.mp3`,
      raw: { guid: `k${n}`, title: `Ep ${n}` },
    });
    mock.method(
      AudiobookshelfPodcastsAPI.prototype,
      'getPodcastFeed',
      async () => ({
        title: 'Archive Show',
        author: 'Host',
        description: null,
        imageUrl: null,
        feedUrl: 'https://feeds.example.test/archive.xml',
        itunesId: null,
        itunesPageUrl: null,
        language: 'en',
        categories: [],
        explicit: false,
        releaseDate: null,
        episodes: [episode(1), episode(2), episode(3)],
      })
    );
    mock.method(
      AudiobookshelfPodcastsAPI.prototype,
      'createPodcast',
      async (payload: { media: { metadata: { title: string } } }) => ({
        id: 'archive-1',
        title: payload.media.metadata.title,
      })
    );
    const downloadEpisodes = mock.method(
      AudiobookshelfPodcastsAPI.prototype,
      'downloadEpisodes',
      async () => undefined
    );
    const agent = await login();

    const one = await agent.post('/podcast/subscribe').send({
      feedUrl: 'https://feeds.example.test/archive.xml',
      autoDownload: false,
      episodeKeys: ['k2'],
    });
    assert.strictEqual(one.status, 200, JSON.stringify(one.body));
    assert.strictEqual(one.body.queued, 1);
    assert.deepStrictEqual(downloadEpisodes.mock.calls[0].arguments, [
      'archive-1',
      [{ guid: 'k2', title: 'Ep 2' }],
    ]);

    const all = await agent.post('/podcast/subscribe').send({
      feedUrl: 'https://feeds.example.test/archive.xml',
      autoDownload: false,
      downloadAll: true,
    });
    assert.strictEqual(all.status, 200, JSON.stringify(all.body));
    assert.strictEqual(all.body.queued, 3);

    const both = await agent.post('/podcast/subscribe').send({
      feedUrl: 'https://feeds.example.test/archive.xml',
      episodeKeys: ['k1'],
      downloadAll: true,
    });
    assert.strictEqual(both.status, 400);

    // a show already in: every episode it does not have yet
    mock.method(
      AudiobookshelfPodcastsAPI.prototype,
      'getPodcastItem',
      async () => ({
        id: 'archive-1',
        libraryId: 'pod-lib',
        mediaType: 'podcast',
        title: 'Archive Show',
        author: 'Host',
        description: null,
        genres: [],
        feedUrl: 'https://feeds.example.test/archive.xml',
        itunesId: null,
        explicit: false,
        language: 'en',
        numEpisodes: 0,
        autoDownloadEpisodes: false,
        addedAt: null,
        tags: [],
        episodes: [],
      })
    );
    const getAll = await agent
      .post('/podcast/library/archive-1/download')
      .send({ all: true });
    assert.strictEqual(getAll.status, 200, JSON.stringify(getAll.body));
    assert.strictEqual(getAll.body.queued, 3);
    assert.strictEqual(getAll.body.notFound, 0);

    const mixed = await agent
      .post('/podcast/library/archive-1/download')
      .send({ all: true, keys: ['k1'] });
    assert.strictEqual(mixed.status, 400);
  });

  it('keeps folders unique, reports failed first downloads, and explains ABS refusals on subscribe', async (t) => {
    configureAbs(t);
    mockPodcastLibrary('Podcasts', '/media/podcasts');
    mock.method(
      AudiobookshelfPodcastsAPI.prototype,
      'getPodcastLibraryItems',
      async () => ({
        total: 1,
        limit: 500,
        page: 0,
        results: [
          {
            id: 'existing-1',
            addedAt: null,
            updatedAt: null,
            title: 'The Daily',
            author: null,
            description: null,
            genres: [],
            feedUrl: 'https://feeds.example.test/other-daily.xml',
            itunesId: '111',
            explicit: false,
            language: null,
            numEpisodes: 1,
            autoDownloadEpisodes: true,
          },
        ],
      })
    );
    mock.method(
      AudiobookshelfPodcastsAPI.prototype,
      'getPodcastFeed',
      async () => ({
        title: 'The Daily',
        author: null,
        description: null,
        imageUrl: null,
        feedUrl: 'https://feeds.example.test/daily.xml',
        itunesId: '999',
        itunesPageUrl: null,
        language: null,
        categories: [],
        explicit: false,
        releaseDate: null,
        episodes: [
          {
            key: 'k1',
            title: 'Ep 1',
            subtitle: null,
            description: null,
            pubDate: null,
            publishedAtMs: 1704153600000,
            durationSeconds: 100,
            enclosureUrl: 'https://cdn.example.test/1.mp3',
            raw: { guid: 'k1' },
          },
        ],
      })
    );
    const createPodcast = mock.method(
      AudiobookshelfPodcastsAPI.prototype,
      'createPodcast',
      async () => ({ id: 'created-2', title: 'The Daily' })
    );
    mock.method(
      AudiobookshelfPodcastsAPI.prototype,
      'downloadEpisodes',
      async () => {
        throw new Error('enclosure refused');
      }
    );

    const agent = await login();
    const made = await agent
      .post('/podcast/subscribe')
      .send({ feedUrl: 'https://feeds.example.test/daily.xml' });
    // the show was created: success, with the failed downloads flagged
    assert.strictEqual(made.status, 200);
    assert.deepStrictEqual(made.body, {
      id: 'created-2',
      title: 'The Daily',
      queued: 0,
      downloadFailed: true,
    });
    // same folder name as an existing show: told apart by the iTunes ID
    assert.strictEqual(
      createPodcast.mock.calls[0]?.arguments[0]?.path,
      '/media/podcasts/The Daily (999)'
    );

    mock.method(
      AudiobookshelfPodcastsAPI.prototype,
      'createPodcast',
      async () => {
        throw new AudiobookshelfRequestError(400, 'Podcast already exists');
      }
    );
    const refused = await agent
      .post('/podcast/subscribe')
      .send({ feedUrl: 'https://feeds.example.test/daily.xml' });
    assert.strictEqual(refused.status, 400);
    assert.strictEqual(
      refused.body.message,
      'Audiobookshelf refused: Podcast already exists'
    );
  });

  it('queues only undownloaded matching keys on download and lists available episodes', async (t) => {
    configureAbs(t);
    mockPodcastLibrary();
    mock.method(
      AudiobookshelfPodcastsAPI.prototype,
      'getPodcastItem',
      async () => ({
        id: 'pod-1',
        libraryId: 'pod-lib',
        mediaType: 'podcast',
        title: 'Show',
        author: null,
        description: null,
        genres: [],
        feedUrl: 'https://feeds.example.test/show.xml',
        itunesId: null,
        explicit: false,
        language: null,
        numEpisodes: 2,
        autoDownloadEpisodes: true,
        addedAt: null,
        episodes: [
          {
            id: 'abs-1',
            title: 'Already By URL',
            subtitle: null,
            description: null,
            pubDate: 'Mon, 01 Jan 2024 00:00:00 GMT',
            publishedAt: 1704067200000,
            season: null,
            episode: null,
            episodeType: null,
            enclosureUrl: 'https://cdn.example.test/ep1.mp3',
            durationSeconds: 100,
            size: 100,
          },
          {
            id: 'abs-2',
            title: 'Already By Title',
            subtitle: null,
            description: null,
            pubDate: 'Tue, 02 Jan 2024 00:00:00 GMT',
            publishedAt: 1704153600000,
            season: null,
            episode: null,
            episodeType: null,
            enclosureUrl: null,
            durationSeconds: 100,
            size: 100,
          },
        ],
      })
    );
    mock.method(
      AudiobookshelfPodcastsAPI.prototype,
      'getPodcastFeed',
      async () => ({
        title: 'Show',
        author: null,
        description: null,
        imageUrl: null,
        feedUrl: 'https://feeds.example.test/show.xml',
        itunesId: null,
        itunesPageUrl: null,
        language: null,
        categories: [],
        explicit: false,
        releaseDate: null,
        episodes: [
          {
            key: 'k-url',
            title: 'Different Title',
            subtitle: null,
            description: null,
            pubDate: null,
            publishedAtMs: 1704067200000,
            durationSeconds: 100,
            enclosureUrl: 'https://cdn.example.test/ep1.mp3',
            raw: { guid: 'k-url' },
          },
          {
            key: 'k-title',
            title: 'Already By Title',
            subtitle: null,
            description: null,
            pubDate: 'Tue, 02 Jan 2024 00:00:00 GMT',
            publishedAtMs: 1704153600000,
            durationSeconds: 100,
            enclosureUrl: 'https://cdn.example.test/ep2-new-url.mp3',
            raw: { guid: 'k-title' },
          },
          {
            key: 'k-new',
            title: 'Fresh Episode',
            subtitle: null,
            description: '<p>Download me</p>',
            pubDate: 'Wed, 03 Jan 2024 00:00:00 GMT',
            publishedAtMs: 1704240000000,
            durationSeconds: 200,
            enclosureUrl: 'https://cdn.example.test/ep3.mp3',
            raw: { guid: 'k-new', title: 'Fresh Episode' },
          },
        ],
      })
    );
    const downloadEpisodes = mock.method(
      AudiobookshelfPodcastsAPI.prototype,
      'downloadEpisodes',
      async () => undefined
    );

    const agent = await login();
    const available = await agent.get('/podcast/library/pod-1/available');
    assert.strictEqual(available.status, 200);
    assert.strictEqual(available.body.episodes.length, 1);
    assert.strictEqual(available.body.episodes[0].key, 'k-new');
    assert.strictEqual(available.body.total, 1);

    const queued = await agent
      .post('/podcast/library/pod-1/download')
      .send({ keys: ['k-url', 'k-title', 'k-new'] });
    assert.strictEqual(queued.status, 200);
    assert.deepStrictEqual(queued.body, {
      queued: 1,
      alreadyHave: 2,
      notFound: 0,
    });
    assert.deepStrictEqual(downloadEpisodes.mock.calls[0].arguments, [
      'pod-1',
      [{ guid: 'k-new', title: 'Fresh Episode' }],
    ]);

    // a key the feed no longer has is reported as not found
    const gone = await agent
      .post('/podcast/library/pod-1/download')
      .send({ keys: ['k-vanished'] });
    assert.deepStrictEqual(gone.body, {
      queued: 0,
      alreadyHave: 0,
      notFound: 1,
    });

    // an episode waiting in the download queue is neither offered again nor
    // queued a second time (a revisit while it downloads)
    mock.method(
      AudiobookshelfPodcastsAPI.prototype,
      'getLibraryEpisodeDownloads',
      async () => ({
        downloading: [],
        queued: [
          { title: 'Fresh Episode', podcastId: 'pod-1', podcastTitle: 'Show' },
          { title: 'Fresh Episode', podcastId: 'pod-2', podcastTitle: 'Other' },
        ],
      })
    );
    const whileQueued = await agent.get('/podcast/library/pod-1/available');
    assert.strictEqual(whileQueued.status, 200);
    assert.deepStrictEqual(whileQueued.body.episodes, []);
    assert.strictEqual(whileQueued.body.total, 0);
    const again = await agent
      .post('/podcast/library/pod-1/download')
      .send({ keys: ['k-new'] });
    assert.deepStrictEqual(again.body, {
      queued: 0,
      alreadyHave: 0,
      alreadyQueued: 1,
      notFound: 0,
    });
    assert.strictEqual(downloadEpisodes.mock.callCount(), 1);
  });

  it('pages through every undownloaded episode, not just the newest 100', async (t) => {
    configureAbs(t);
    mockPodcastLibrary();
    mock.method(
      AudiobookshelfPodcastsAPI.prototype,
      'getPodcastItem',
      async () => ({
        id: 'pod-1',
        libraryId: 'pod-lib',
        mediaType: 'podcast',
        title: 'Show',
        author: null,
        description: null,
        genres: [],
        feedUrl: 'https://feeds.example.test/show.xml',
        itunesId: null,
        explicit: false,
        language: null,
        numEpisodes: 0,
        autoDownloadEpisodes: true,
        addedAt: null,
        episodes: [],
      })
    );
    mock.method(
      AudiobookshelfPodcastsAPI.prototype,
      'getPodcastFeed',
      async () => ({
        title: 'Show',
        author: null,
        description: null,
        imageUrl: null,
        feedUrl: 'https://feeds.example.test/show.xml',
        itunesId: null,
        itunesPageUrl: null,
        language: null,
        categories: [],
        explicit: false,
        releaseDate: null,
        episodes: Array.from({ length: 250 }, (_, i) => ({
          key: `ep-${i}`,
          title: `Episode ${i}`,
          subtitle: null,
          description: null,
          pubDate: null,
          publishedAtMs: 1704153600000 - i * 1000,
          durationSeconds: null,
          enclosureUrl: `https://cdn.example.test/${i}.mp3`,
          raw: { guid: `ep-${i}` },
        })),
      })
    );

    const agent = await login();
    const first = await agent.get('/podcast/library/pod-1/available');
    assert.strictEqual(first.status, 200);
    assert.strictEqual(first.body.episodes.length, 100);
    assert.strictEqual(first.body.total, 250);
    assert.strictEqual(first.body.page, 1);

    const third = await agent.get(
      '/podcast/library/pod-1/available?page=3&limit=100'
    );
    assert.strictEqual(third.body.episodes.length, 50);
    assert.strictEqual(third.body.episodes[0].key, 'ep-200');
    assert.strictEqual(third.body.episodes[49].key, 'ep-249');

    const bad = await agent.get('/podcast/library/pod-1/available?limit=500');
    assert.strictEqual(bad.status, 400);
  });

  it('toggles autoDownload and returns download queue and upstream error mappings', async (t) => {
    configureAbs(t);
    mockPodcastLibrary();
    const updateAuto = mock.method(
      AudiobookshelfPodcastsAPI.prototype,
      'updateAutoDownload',
      async () => undefined
    );
    const getDownloads = mock.method(
      AudiobookshelfPodcastsAPI.prototype,
      'getPodcastDownloads',
      async () => ({
        downloading: [{ title: 'Ep Active' }],
        queued: 3,
      })
    );
    let itemLibrary = 'pod-lib';
    mock.method(
      AudiobookshelfPodcastsAPI.prototype,
      'getPodcastItem',
      async (id: string) =>
        id === 'book-1'
          ? null
          : {
              id,
              libraryId: itemLibrary,
              mediaType: 'podcast',
              title: 'Show',
              author: null,
              description: null,
              genres: [],
              feedUrl: null,
              itunesId: null,
              explicit: false,
              language: null,
              numEpisodes: 0,
              autoDownloadEpisodes: true,
              addedAt: null,
              episodes: [],
            }
    );

    const agent = await login();
    // only podcasts in the podcast library can be changed
    const notPodcast = await agent
      .put('/podcast/library/book-1/auto')
      .send({ autoDownload: false });
    assert.strictEqual(notPodcast.status, 404);
    itemLibrary = 'other-lib';
    const otherLibrary = await agent
      .put('/podcast/library/pod-1/auto')
      .send({ autoDownload: false });
    assert.strictEqual(otherLibrary.status, 404);
    assert.strictEqual(updateAuto.mock.callCount(), 0);
    itemLibrary = 'pod-lib';

    const badAuto = await agent
      .put('/podcast/library/pod-1/auto')
      .send({ autoDownload: 'yes' });
    assert.strictEqual(badAuto.status, 400);

    const okAuto = await agent
      .put('/podcast/library/pod-1/auto')
      .send({ autoDownload: false });
    assert.strictEqual(okAuto.status, 200);
    assert.deepStrictEqual(okAuto.body, { autoDownload: false });
    assert.deepStrictEqual(updateAuto.mock.calls[0].arguments, [
      'pod-1',
      false,
    ]);

    const downloads = await agent.get('/podcast/library/pod-1/downloads');
    assert.strictEqual(downloads.status, 200);
    assert.deepStrictEqual(downloads.body, {
      downloading: [{ title: 'Ep Active' }],
      queued: 3,
    });
    // read from the library queue, which includes the current download
    assert.deepStrictEqual(getDownloads.mock.calls[0].arguments, [
      'pod-1',
      'pod-lib',
    ]);

    mock.method(
      AudiobookshelfPodcastsAPI.prototype,
      'getPodcastDownloads',
      async () => {
        throw new AudiobookshelfRequestError(400, 'Bad request');
      }
    );
    const refused = await agent.get('/podcast/library/pod-1/downloads');
    assert.strictEqual(refused.status, 400);
    assert.strictEqual(
      refused.body.message,
      'Audiobookshelf refused: Bad request'
    );

    mock.method(
      AudiobookshelfPodcastsAPI.prototype,
      'getPodcastDownloads',
      async () => {
        throw new AudiobookshelfAuthError(401);
      }
    );
    const authErr = await agent.get('/podcast/library/pod-1/downloads');
    assert.strictEqual(authErr.status, 502);
    assert.strictEqual(
      authErr.body.message,
      'Audiobookshelf rejected the request. Check its API key permissions.'
    );

    mock.method(
      AudiobookshelfPodcastsAPI.prototype,
      'getPodcastDownloads',
      async () => {
        throw new Error('ECONNREFUSED');
      }
    );
    const netErr = await agent.get('/podcast/library/pod-1/downloads');
    assert.strictEqual(netErr.status, 502);
    assert.strictEqual(
      netErr.body.message,
      'Audiobookshelf could not be reached.'
    );
  });

  it('turns played-episode cleanup on and off per show, with permission checks', async (t) => {
    configureAbs(t);
    const settings = getSettings();
    const original = settings.podcastCleanup;
    t.after(() => {
      settings.podcastCleanup = original;
    });
    settings.podcastCleanup = { itemIds: [] };
    mock.method(settings, 'save', async () => undefined);
    mockPodcastLibrary();
    // the immediate tidy-up after switching on must not reach ABS either
    mock.method(
      AudiobookshelfPodcastsAPI.prototype,
      'getPodcastItem',
      async (id: string) =>
        id === 'pod-1'
          ? {
              id,
              libraryId: 'pod-lib',
              mediaType: 'podcast',
              title: 'Show',
              author: null,
              description: null,
              genres: [],
              feedUrl: null,
              itunesId: null,
              explicit: false,
              language: null,
              numEpisodes: 0,
              autoDownloadEpisodes: true,
              addedAt: null,
              episodes: [],
            }
          : null
    );

    const agent = await login();
    // only real shows in the podcast library go on the list
    const missing = await agent
      .put('/podcast/library/nope-1/cleanup')
      .send({ enabled: true });
    assert.strictEqual(missing.status, 404);
    assert.deepStrictEqual(getSettings().podcastCleanup.itemIds, []);

    const on = await agent
      .put('/podcast/library/pod-1/cleanup')
      .send({ enabled: true });
    assert.strictEqual(on.status, 200);
    assert.deepStrictEqual(getSettings().podcastCleanup.itemIds, ['pod-1']);

    const again = await agent
      .put('/podcast/library/pod-1/cleanup')
      .send({ enabled: true });
    assert.strictEqual(again.status, 200);
    assert.deepStrictEqual(getSettings().podcastCleanup.itemIds, ['pod-1']);

    const off = await agent
      .put('/podcast/library/pod-1/cleanup')
      .send({ enabled: false });
    assert.strictEqual(off.status, 200);
    assert.deepStrictEqual(getSettings().podcastCleanup.itemIds, []);

    const bad = await agent
      .put('/podcast/library/pod-1/cleanup')
      .send({ enabled: 'yes' });
    assert.strictEqual(bad.status, 400);
    const badId = await agent
      .put('/podcast/library/bad%20id/cleanup')
      .send({ enabled: true });
    assert.strictEqual(badId.status, 400);

    const user = await getRepository(User).findOneOrFail({
      where: { email: 'friend@seerr.dev' },
    });
    const previous = user.permissions;
    user.permissions = 0;
    await getRepository(User).save(user);
    t.after(async () => {
      user.permissions = previous;
      await getRepository(User).save(user);
    });
    const friend = await login('friend@seerr.dev');
    const denied = await friend
      .put('/podcast/library/pod-1/cleanup')
      .send({ enabled: true });
    assert.strictEqual(denied.status, 403);

    // requesters may follow shows, but not switch on file deletion
    // (permissions are read on each request: the same session is reused)
    user.permissions = Permission.REQUEST;
    await getRepository(User).save(user);
    const requesterOn = await friend
      .put('/podcast/library/pod-1/cleanup')
      .send({ enabled: true });
    assert.strictEqual(requesterOn.status, 403);
    const requesterOff = await friend
      .put('/podcast/library/pod-1/cleanup')
      .send({ enabled: false });
    assert.strictEqual(requesterOff.status, 403);

    user.permissions = Permission.MANAGE_REQUESTS;
    await getRepository(User).save(user);
    const managerOn = await friend
      .put('/podcast/library/pod-1/cleanup')
      .send({ enabled: true });
    assert.strictEqual(managerOn.status, 200);
    assert.deepStrictEqual(getSettings().podcastCleanup.itemIds, ['pod-1']);
  });

  it('shares one progress read between show pages for a minute', async (t) => {
    configureAbs(t, 'https://listen.example.test');
    mockPodcastLibrary();
    const ownerAbsId = 'owner-abs-id';
    mock.method(AudiobookshelfPodcastsAPI.prototype, 'getUsers', async () => [
      { id: ownerAbsId, username: 'owner', email: null, type: 'root' },
    ]);
    const reads = mock.method(
      AudiobookshelfPodcastsAPI.prototype,
      'getEpisodeProgress',
      async () => ({
        finished: new Map([['pod-1', new Set(['ep-old'])]]),
        started: new Map<string, Set<string>>(),
        finishedBy: new Map([
          ['pod-1', new Map([['ep-old', new Set([ownerAbsId])]])],
        ]),
        complete: true,
      })
    );
    mock.method(
      AudiobookshelfPodcastsAPI.prototype,
      'getPodcastItem',
      async (id: string) => ({
        id,
        libraryId: 'pod-lib',
        mediaType: 'podcast',
        title: 'Show',
        author: null,
        description: null,
        genres: [],
        feedUrl: null,
        itunesId: null,
        explicit: false,
        language: null,
        numEpisodes: 2,
        autoDownloadEpisodes: true,
        addedAt: null,
        episodes: [
          {
            id: 'ep-old',
            title: 'Old',
            subtitle: null,
            description: null,
            pubDate: null,
            publishedAt: 1704067200000,
            season: null,
            episode: null,
            episodeType: null,
            enclosureUrl: null,
            durationSeconds: null,
            size: null,
          },
          {
            // no date: sorted by when it was added, not to the bottom
            id: 'ep-undated',
            title: 'Undated',
            subtitle: null,
            description: null,
            pubDate: null,
            publishedAt: null,
            addedAt: 1704153600000,
            season: null,
            episode: null,
            episodeType: null,
            enclosureUrl: null,
            durationSeconds: null,
            size: null,
          },
        ],
      })
    );

    const agent = await login();
    const [one, two] = await Promise.all([
      agent.get('/podcast/library/pod-1'),
      agent.get('/podcast/library/pod-1'),
    ]);
    const three = await agent.get('/podcast/library/pod-1');
    assert.strictEqual(one.status, 200);
    assert.strictEqual(two.status, 200);
    assert.strictEqual(reads.mock.callCount(), 1);
    assert.deepStrictEqual(
      three.body.episodes.map((ep: { id: string; played: boolean }) => [
        ep.id,
        ep.played,
      ]),
      [
        ['ep-undated', false],
        ['ep-old', true],
      ]
    );
  });

  it('returns supported podcast genres even when Audiobookshelf is not set up', async (t) => {
    const settings = getSettings();
    const original = settings.audiobookshelf;
    settings.audiobookshelf = null;
    t.after(() => {
      settings.audiobookshelf = original;
    });

    const agent = await login();
    const res = await agent.get('/podcast/genres');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.genres.length, 19);
    assert.deepStrictEqual(res.body.genres[0], { id: 1301, name: 'Arts' });
    assert.ok(
      res.body.genres.some(
        (g: { id: number; name: string }) =>
          g.id === 1318 && g.name === 'Technology'
      )
    );
    assert.ok(
      res.body.genres.some(
        (g: { id: number; name: string }) =>
          g.id === 1488 && g.name === 'True Crime'
      )
    );
  });

  it('discovers charts preserving order, dropping missing feedUrl, marking library matches, validating genre, and caching', async (t) => {
    configureAbs(t);
    mockPodcastLibrary();
    mock.method(
      AudiobookshelfPodcastsAPI.prototype,
      'getPodcastLibraryItems',
      async () => ({
        total: 1,
        limit: 500,
        page: 0,
        results: [
          {
            id: 'lib-pod-2',
            addedAt: null,
            updatedAt: null,
            title: 'Second Show',
            author: null,
            description: null,
            genres: [],
            feedUrl: 'https://feeds.example.test/second.xml',
            itunesId: '222',
            explicit: false,
            language: null,
            numEpisodes: 3,
            autoDownloadEpisodes: true,
          },
        ],
      })
    );

    let appleCalls = 0;
    mock.method(axios, 'get', async (url: string) => {
      appleCalls += 1;
      if (
        url ===
        'https://itunes.apple.com/us/rss/toppodcasts/limit=30/genre=1318/json'
      ) {
        return {
          data: {
            feed: {
              entry: [
                {
                  id: { attributes: { 'im:id': '111' } },
                  'im:name': { label: 'First Show' },
                },
                {
                  id: { attributes: { 'im:id': '333' } },
                  'im:name': { label: 'No Feed Show' },
                },
                {
                  id: { attributes: { 'im:id': '222' } },
                  'im:name': { label: 'Second Show' },
                },
              ],
            },
          },
        };
      }
      if (
        url === 'https://itunes.apple.com/lookup?id=111,333,222&entity=podcast'
      ) {
        return {
          data: {
            results: [
              {
                collectionId: 222,
                collectionName: 'Second Show',
                artistName: 'Author 2',
                feedUrl: 'https://feeds.example.test/second.xml',
                artworkUrl600: 'https://cdn.example.test/2-600.jpg',
                genres: ['Podcasts', 'Technology'],
                trackCount: 15,
                collectionExplicitness: 'notExplicit',
              },
              {
                collectionId: 333,
                collectionName: 'No Feed Show',
                artistName: 'Author 3',
                genres: ['Technology'],
                trackCount: 2,
              },
              {
                collectionId: 111,
                collectionName: 'First Show',
                artistName: 'Author 1',
                feedUrl: 'https://feeds.example.test/first.xml',
                artworkUrl600: 'https://cdn.example.test/1-600.jpg',
                genres: ['Technology', 'Podcasts'],
                trackCount: 50,
                collectionExplicitness: 'explicit',
              },
            ],
          },
        };
      }
      throw new Error(`Unexpected Apple URL: ${url}`);
    });

    const agent = await login();

    const badGenre = await agent.get('/podcast/discover?genre=999999');
    assert.strictEqual(badGenre.status, 400);

    const badLimit = await agent.get('/podcast/discover?limit=51');
    assert.strictEqual(badLimit.status, 400);

    const first = await agent.get('/podcast/discover?genre=1318');
    assert.strictEqual(first.status, 200);
    assert.strictEqual(first.body.genre, 1318);
    assert.strictEqual(first.body.results.length, 2);
    assert.strictEqual(first.body.results[0].itunesId, '111');
    assert.strictEqual(first.body.results[0].inLibrary, false);
    assert.strictEqual(first.body.results[0].libraryItemId, null);
    assert.strictEqual(first.body.results[0].explicit, true);
    assert.deepStrictEqual(first.body.results[0].genres, ['Technology']);
    assert.strictEqual(first.body.results[1].itunesId, '222');
    assert.strictEqual(first.body.results[1].inLibrary, true);
    assert.strictEqual(first.body.results[1].libraryItemId, 'lib-pod-2');
    assert.strictEqual(appleCalls, 2);

    const cached = await agent.get('/podcast/discover?genre=1318');
    assert.strictEqual(cached.status, 200);
    assert.strictEqual(appleCalls, 2);
    assert.deepStrictEqual(cached.body, first.body);
  });

  it('serves discover charts when ABS is not set up, returns 502 on Apple error, and does not cache empty or failed results', async (t) => {
    const settings = getSettings();
    const original = settings.audiobookshelf;
    settings.audiobookshelf = null;
    t.after(() => {
      settings.audiobookshelf = original;
    });

    let mode: 'fail' | 'empty' | 'ok' = 'fail';
    let calls = 0;
    mock.method(ApplePodcastsAPI.prototype, 'getTopPodcasts', async () => {
      calls += 1;
      if (mode === 'fail') {
        throw new Error('Upstream timeout');
      }
      if (mode === 'empty') {
        return [];
      }
      return [
        {
          itunesId: '555',
          title: 'Top Show',
          author: 'Host',
          coverUrl: 'https://cdn.example.test/555.jpg',
          feedUrl: 'https://feeds.example.test/555.xml',
          genres: ['News'],
          episodeCount: 10,
          explicit: false,
        },
      ];
    });

    const agent = await login();

    const failRes = await agent.get('/podcast/discover');
    assert.strictEqual(failRes.status, 502);
    assert.strictEqual(
      failRes.body.message,
      'Podcast charts could not be reached.'
    );
    assert.strictEqual(calls, 1);

    mode = 'empty';
    const emptyRes = await agent.get('/podcast/discover');
    assert.strictEqual(emptyRes.status, 200);
    assert.deepStrictEqual(emptyRes.body, { genre: null, results: [] });
    assert.strictEqual(calls, 2);

    mode = 'ok';
    const okRes = await agent.get('/podcast/discover');
    assert.strictEqual(okRes.status, 200);
    assert.strictEqual(calls, 3);
    assert.deepStrictEqual(okRes.body, {
      genre: null,
      results: [
        {
          itunesId: '555',
          title: 'Top Show',
          author: 'Host',
          coverUrl: 'https://cdn.example.test/555.jpg',
          feedUrl: 'https://feeds.example.test/555.xml',
          genres: ['News'],
          episodeCount: 10,
          explicit: false,
          inLibrary: false,
          libraryItemId: null,
        },
      ],
    });
  });

  it('returns latest episodes mapped newest first, validates limit, caches per limit, and handles 404 fallback', async (t) => {
    const settings = getSettings();
    const original = settings.audiobookshelf;
    settings.audiobookshelf = null;
    const agent = await login();

    const unconfigured = await agent.get('/podcast/latest');
    assert.strictEqual(unconfigured.status, 404);
    settings.audiobookshelf = original;

    configureAbs(t, 'https://listen.example.test');
    mockPodcastLibrary();

    const getRecent = mock.method(
      AudiobookshelfPodcastsAPI.prototype,
      'getRecentEpisodes',
      async (_libId: string, limit: number) => [
        {
          id: 'ep-old',
          title: 'Old Ep',
          description: '<p>Old</p>',
          publishedAt: 1704067200000,
          durationSeconds: 300,
          podcastId: 'pod-1',
          podcastTitle: 'Show One',
          podcastAuthor: 'Host 1',
        },
        {
          id: 'ep-bad-pod',
          title: 'Bad Pod Ep',
          description: '<p>Skip me</p>',
          publishedAt: 1704240000000,
          durationSeconds: 100,
          podcastId: 'bad$id',
          podcastTitle: 'Bad',
          podcastAuthor: null,
        },
        {
          id: 'ep-new',
          title: 'New Ep',
          description: `<p>Hello &amp; <b>world</b> ${'z'.repeat(350)}</p>`,
          publishedAt: 1704153600000,
          durationSeconds: 600,
          podcastId: 'pod-2',
          podcastTitle: `Show Two (${limit})`,
          podcastAuthor: null,
        },
      ]
    );

    const badLimit = await agent.get('/podcast/latest?limit=0');
    assert.strictEqual(badLimit.status, 400);

    const res = await agent.get('/podcast/latest?limit=10');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.episodes.length, 2);
    assert.strictEqual(res.body.episodes[0].id, 'ep-new');
    assert.strictEqual(res.body.episodes[0].description.length, 300);
    assert.ok(res.body.episodes[0].description.startsWith('Hello & world '));
    assert.strictEqual(
      res.body.episodes[0].coverUrl,
      '/api/v1/podcast/cover/pod-2'
    );
    assert.strictEqual(
      res.body.episodes[0].openUrl,
      'https://listen.example.test/item/pod-2'
    );
    assert.strictEqual(res.body.episodes[1].id, 'ep-old');

    const resCached = await agent.get('/podcast/latest?limit=10');
    assert.strictEqual(resCached.status, 200);
    assert.strictEqual(getRecent.mock.callCount(), 1);

    const resDifferentLimit = await agent.get('/podcast/latest?limit=5');
    assert.strictEqual(resDifferentLimit.status, 200);
    assert.strictEqual(getRecent.mock.callCount(), 2);

    mock.restoreAll();
    clearPodcastCaches();

    mock.method(axios, 'request', async (config: { url?: string }) => {
      const url = config.url ?? '';
      if (url.endsWith('/api/libraries')) {
        return {
          status: 200,
          data: {
            libraries: [
              {
                id: 'pod-lib',
                name: 'Podcasts',
                mediaType: 'podcast',
                folders: [{ id: 'fol-1', fullPath: '/podcasts' }],
              },
            ],
          },
        };
      }
      if (url.endsWith('/api/libraries/pod-lib/recent-episodes')) {
        throw Object.assign(new Error('Not Found'), {
          response: { status: 404 },
        });
      }
      if (url.endsWith('/api/libraries/pod-lib/items')) {
        return {
          status: 200,
          data: {
            results: [
              {
                id: 'pod-a',
                updatedAt: 1700000002000,
                media: { metadata: { title: 'Pod A' } },
              },
              {
                id: 'pod-b',
                updatedAt: 1700000001000,
                media: { metadata: { title: 'Pod B' } },
              },
            ],
            total: 2,
            limit: 25,
            page: 0,
          },
        };
      }
      if (url.endsWith('/api/items/pod-a')) {
        return {
          status: 200,
          data: {
            id: 'pod-a',
            libraryId: 'pod-lib',
            mediaType: 'podcast',
            media: {
              metadata: { title: 'Pod A', author: 'Author A' },
              episodes: [
                {
                  id: 'ep-a1',
                  title: 'Ep A1',
                  description: '<p>From A</p>',
                  publishedAt: 1704067200000,
                  audioFile: { duration: 120 },
                },
              ],
            },
          },
        };
      }
      if (url.endsWith('/api/items/pod-b')) {
        return {
          status: 200,
          data: {
            id: 'pod-b',
            libraryId: 'pod-lib',
            mediaType: 'podcast',
            media: {
              metadata: { title: 'Pod B', author: 'Author B' },
              episodes: [
                {
                  id: 'ep-b1',
                  title: 'Ep B1',
                  description: '<p>From B</p>',
                  publishedAt: 1704153600000,
                  audioFile: { duration: 180 },
                },
              ],
            },
          },
        };
      }
      throw new Error(`Unexpected ABS request: ${url}`);
    });

    const fallbackRes = await agent.get('/podcast/latest?limit=20');
    assert.strictEqual(fallbackRes.status, 200);
    assert.deepStrictEqual(
      fallbackRes.body.episodes.map((ep: { id: string }) => ep.id),
      ['ep-b1', 'ep-a1']
    );
    assert.strictEqual(fallbackRes.body.episodes[0].podcastTitle, 'Pod B');
    assert.strictEqual(fallbackRes.body.episodes[0].podcastAuthor, 'Author B');
  });

  it('returns uncached podcast download activity and fills missing podcastTitle from library index', async (t) => {
    const settings = getSettings();
    const original = settings.audiobookshelf;
    settings.audiobookshelf = null;
    const agent = await login();

    const unconfigured = await agent.get('/podcast/activity');
    assert.strictEqual(unconfigured.status, 404);
    settings.audiobookshelf = original;

    configureAbs(t);
    mockPodcastLibrary();
    mock.method(
      AudiobookshelfPodcastsAPI.prototype,
      'getPodcastLibraryItems',
      async () => ({
        total: 1,
        limit: 500,
        page: 0,
        results: [
          {
            id: 'pod-2',
            addedAt: null,
            updatedAt: null,
            title: 'Indexed Show Title',
            author: null,
            description: null,
            genres: [],
            feedUrl: 'https://feeds.example.test/two.xml',
            itunesId: null,
            explicit: false,
            language: null,
            numEpisodes: 1,
            autoDownloadEpisodes: true,
          },
        ],
      })
    );
    const getActivity = mock.method(
      AudiobookshelfPodcastsAPI.prototype,
      'getLibraryEpisodeDownloads',
      async () => ({
        downloading: [
          {
            title: 'Active Ep',
            podcastId: 'pod-1',
            podcastTitle: 'Provided Title',
          },
        ],
        queued: [
          {
            title: 'Queued Ep',
            podcastId: 'pod-2',
            podcastTitle: null,
          },
          {
            title: 'Unknown Pod Ep',
            podcastId: 'pod-missing',
            podcastTitle: null,
          },
        ],
      })
    );

    const first = await agent.get('/podcast/activity');
    assert.strictEqual(first.status, 200);
    assert.deepStrictEqual(first.body, {
      downloading: [
        {
          title: 'Active Ep',
          podcastId: 'pod-1',
          podcastTitle: 'Provided Title',
        },
      ],
      queued: [
        {
          title: 'Queued Ep',
          podcastId: 'pod-2',
          podcastTitle: 'Indexed Show Title',
        },
        {
          title: 'Unknown Pod Ep',
          podcastId: 'pod-missing',
          podcastTitle: null,
        },
      ],
    });

    const second = await agent.get('/podcast/activity');
    assert.strictEqual(second.status, 200);
    assert.strictEqual(getActivity.mock.callCount(), 2);
  });
});
