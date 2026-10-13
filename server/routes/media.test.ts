import assert from 'node:assert/strict';
import path from 'node:path';
import { before, beforeEach, describe, it, mock } from 'node:test';

import KapowarrAPI, {
  KapowarrTaskRunningError,
} from '@server/api/comics/kapowarr';
import MylarAPI from '@server/api/comics/mylar';
import LidarrAPI from '@server/api/servarr/lidarr';
import RadarrAPI from '@server/api/servarr/radarr';
import ReadarrAPI from '@server/api/servarr/readarr';
import SonarrAPI, { type SonarrSeries } from '@server/api/servarr/sonarr';
import TautulliAPI from '@server/api/tautulli';
import TheMovieDb from '@server/api/themoviedb';
import {
  MediaRequestStatus,
  MediaStatus,
  MediaType,
} from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import {
  DuplicateMediaRequestError,
  MediaRequest,
} from '@server/entity/MediaRequest';
import Season from '@server/entity/Season';
import { User } from '@server/entity/User';
import { Permission } from '@server/lib/permissions';
import { getSettings, type DVRSettings } from '@server/lib/settings';
import { checkUser } from '@server/middleware/auth';
import { setupTestDb } from '@server/test/db';
import type { Express } from 'express';
import express from 'express';
import * as OpenApiValidator from 'express-openapi-validator';
import rateLimit from 'express-rate-limit';
import session from 'express-session';
import request from 'supertest';
import authRoutes from './auth';
import mediaRoutes, {
  MAX_TAUTULLI_WATCH_USER_IDS,
  parseTautulliPlexUserIds,
} from './media';

describe('Tautulli watch-user bounds', () => {
  it('validates, deduplicates, and caps provider IDs below SQL limits', () => {
    const values = [
      { user_id: 1 },
      { user_id: '1' },
      { user_id: -1 },
      { user_id: 'not-an-id' },
      ...Array.from(
        { length: MAX_TAUTULLI_WATCH_USER_IDS + 10 },
        (_, index) => ({ user_id: index + 2 })
      ),
    ];
    const ids = parseTautulliPlexUserIds(values);

    assert.strictEqual(ids.length, MAX_TAUTULLI_WATCH_USER_IDS);
    assert.deepStrictEqual(ids.slice(0, 3), [1, 2, 3]);
    assert.deepStrictEqual(parseTautulliPlexUserIds({}), []);
  });
});

let app: Express;

const removeBookMock = mock.method(
  ReadarrAPI.prototype,
  'removeBook',
  async () => undefined
);
const getBookMock = mock.method(
  ReadarrAPI.prototype,
  'getBook',
  async (bookId: number) =>
    ({
      id: bookId,
      title: 'Requested Book',
      foreignBookId: 'requested-book',
      authorId: 700,
    }) as Awaited<ReturnType<ReadarrAPI['getBook']>>
);
const getBooksByAuthorMock = mock.method(
  ReadarrAPI.prototype,
  'getBooksByAuthor',
  async () =>
    [
      {
        id: 999,
        title: 'Another Book',
        foreignBookId: 'another-book',
        authorId: 700,
      },
    ] as Awaited<ReturnType<ReadarrAPI['getBooksByAuthor']>>
);
const removeAuthorMock = mock.method(
  ReadarrAPI.prototype,
  'removeAuthor',
  async () => undefined
);
const getAlbumMock = mock.method(
  LidarrAPI.prototype,
  'getAlbum',
  async ({ id }: { id: number }) =>
    ({ id, artistId: 800 }) as Awaited<ReturnType<LidarrAPI['getAlbum']>>
);
const getAlbumsByArtistMock = mock.method(
  LidarrAPI.prototype,
  'getAlbumsByArtist',
  async () =>
    [{ id: 998, artistId: 800 }] as Awaited<
      ReturnType<LidarrAPI['getAlbumsByArtist']>
    >
);
const removeAlbumMock = mock.method(
  LidarrAPI.prototype,
  'removeAlbum',
  async () => undefined
);
const removeArtistMock = mock.method(
  LidarrAPI.prototype,
  'removeArtist',
  async () => undefined
);
const removeMovieMock = mock.fn(async (movieId: number) => {
  void movieId;
});
const removeComicMock = mock.method(
  MylarAPI.prototype,
  'removeComic',
  async () => undefined
);
const removeVolumeMock = mock.method(
  KapowarrAPI.prototype,
  'removeVolume',
  async () => undefined
);
const removeSeriesMock = mock.fn(async (tvdbId: number) => {
  void tvdbId;
});
const getSeriesMock = mock.method(
  SonarrAPI.prototype,
  'getSeries',
  async () => []
);
const getTvShowMock = mock.fn(
  async ({ tvId }: Parameters<TheMovieDb['getTvShow']>[0]) => {
    return {
      id: tvId,
      content_ratings: { results: [] },
      created_by: [],
      episode_run_time: [],
      first_air_date: '',
      genres: [],
      homepage: '',
      in_production: false,
      languages: [],
      last_air_date: '',
      name: 'Test show',
      networks: [],
      number_of_episodes: 0,
      number_of_seasons: 0,
      origin_country: [],
      original_language: 'en',
      original_name: 'Test show',
      overview: '',
      popularity: 0,
      production_companies: [],
      production_countries: [],
      spoken_languages: [],
      seasons: [],
      status: 'Ended',
      type: 'Scripted',
      vote_average: 0,
      vote_count: 0,
      aggregate_credits: { cast: [] },
      credits: { crew: [] },
      external_ids: { tvdb_id: 777 },
      keywords: { results: [] },
      videos: { results: [] },
    } as Awaited<ReturnType<TheMovieDb['getTvShow']>>;
  }
);
const getMediaWatchStatsMock = mock.method(
  TautulliAPI.prototype,
  'getMediaWatchStats',
  async () => [
    { query_days: 0, total_time: 400, total_plays: 4 },
    { query_days: 7, total_time: 200, total_plays: 2 },
    { query_days: 30, total_time: 300, total_plays: 3 },
  ]
);
const getMediaWatchUsersMock = mock.method(
  TautulliAPI.prototype,
  'getMediaWatchUsers',
  async () => [
    {
      friendly_name: 'Admin',
      user_id: 1,
      user_thumb: '',
      username: 'admin',
      total_plays: 4,
      total_time: 400,
    },
  ]
);
for (const [prototype, method, implementation] of [
  [RadarrAPI.prototype, 'removeMovie', removeMovieMock],
  [SonarrAPI.prototype, 'removeSeries', removeSeriesMock],
  [TheMovieDb.prototype, 'getTvShow', getTvShowMock],
] as const) {
  Object.defineProperty(prototype, method, {
    configurable: true,
    get: () => implementation,
    set: () => undefined,
  });
}

function createApp() {
  const app = express();
  app.use(express.json());
  app.use(
    session({
      secret: 'test-secret',
      cookie: { secure: 'auto' },
      resave: false,
      saveUninitialized: false,
    })
  );
  app.use(rateLimit({ windowMs: 60_000, limit: 10_000 }), checkUser);
  app.use('/auth', authRoutes);
  app.use('/media', mediaRoutes);
  app.use(
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
  return app;
}

before(async () => {
  app = createApp();
});

beforeEach(() => {
  removeBookMock.mock.resetCalls();
  removeBookMock.mock.mockImplementation(async () => undefined);
  getBookMock.mock.resetCalls();
  getBookMock.mock.mockImplementation(
    async (bookId: number) =>
      ({
        id: bookId,
        title: 'Requested Book',
        foreignBookId: 'requested-book',
        authorId: 700,
      }) as Awaited<ReturnType<ReadarrAPI['getBook']>>
  );
  getBooksByAuthorMock.mock.resetCalls();
  getBooksByAuthorMock.mock.mockImplementation(
    async () =>
      [
        {
          id: 999,
          title: 'Another Book',
          foreignBookId: 'another-book',
          authorId: 700,
        },
      ] as Awaited<ReturnType<ReadarrAPI['getBooksByAuthor']>>
  );
  removeAuthorMock.mock.resetCalls();
  removeAuthorMock.mock.mockImplementation(async () => undefined);
  getAlbumMock.mock.resetCalls();
  getAlbumMock.mock.mockImplementation(
    async ({ id }: { id: number }) =>
      ({ id, artistId: 800 }) as Awaited<ReturnType<LidarrAPI['getAlbum']>>
  );
  getAlbumsByArtistMock.mock.resetCalls();
  getAlbumsByArtistMock.mock.mockImplementation(
    async () =>
      [{ id: 998, artistId: 800 }] as Awaited<
        ReturnType<LidarrAPI['getAlbumsByArtist']>
      >
  );
  removeAlbumMock.mock.resetCalls();
  removeAlbumMock.mock.mockImplementation(async () => undefined);
  removeArtistMock.mock.resetCalls();
  removeArtistMock.mock.mockImplementation(async () => undefined);
  removeMovieMock.mock.resetCalls();
  removeMovieMock.mock.mockImplementation(async () => undefined);
  removeComicMock.mock.resetCalls();
  removeComicMock.mock.mockImplementation(async () => undefined);
  removeVolumeMock.mock.resetCalls();
  removeVolumeMock.mock.mockImplementation(async () => undefined);
  removeSeriesMock.mock.resetCalls();
  removeSeriesMock.mock.mockImplementation(async () => undefined);
  getSeriesMock.mock.resetCalls();
  getSeriesMock.mock.mockImplementation(async () => []);
  getTvShowMock.mock.resetCalls();
  getMediaWatchStatsMock.mock.resetCalls();
  getMediaWatchUsersMock.mock.resetCalls();
  const settings = getSettings();
  settings.radarr = [
    {
      id: 30,
      name: 'Radarr',
      hostname: 'radarr.local',
      port: 7878,
      apiKey: 'radarr-key',
      useSsl: false,
      activeProfileId: 1,
      activeProfileName: 'Movies',
      activeDirectory: '/movies',
      minimumAvailability: 'released',
      tags: [],
      is4k: false,
      isDefault: true,
      syncEnabled: true,
      preventSearch: false,
      tagRequests: false,
      overrideRule: [],
    },
    {
      id: 40,
      name: 'Radarr 4K',
      hostname: 'radarr4k.local',
      port: 7878,
      apiKey: 'radarr-4k-key',
      useSsl: false,
      activeProfileId: 2,
      activeProfileName: 'Movies 4K',
      activeDirectory: '/movies-4k',
      minimumAvailability: 'released',
      tags: [],
      is4k: true,
      isDefault: true,
      syncEnabled: true,
      preventSearch: false,
      tagRequests: false,
      overrideRule: [],
    },
  ];
  settings.sonarr = [
    {
      id: 50,
      name: 'Sonarr',
      hostname: 'sonarr.local',
      port: 8989,
      apiKey: 'sonarr-key',
      useSsl: false,
      activeProfileId: 1,
      activeProfileName: 'TV',
      activeDirectory: '/tv',
      seriesType: 'standard',
      animeSeriesType: 'anime',
      enableSeasonFolders: true,
      monitorNewItems: 'all',
      tags: [],
      is4k: false,
      isDefault: true,
      syncEnabled: true,
      preventSearch: false,
      tagRequests: false,
      overrideRule: [],
    },
    {
      id: 60,
      name: 'Sonarr 4K',
      hostname: 'sonarr4k.local',
      port: 8989,
      apiKey: 'sonarr-4k-key',
      useSsl: false,
      activeProfileId: 2,
      activeProfileName: 'TV 4K',
      activeDirectory: '/tv-4k',
      seriesType: 'standard',
      animeSeriesType: 'anime',
      enableSeasonFolders: true,
      monitorNewItems: 'all',
      tags: [],
      is4k: true,
      isDefault: true,
      syncEnabled: true,
      preventSearch: false,
      tagRequests: false,
      overrideRule: [],
    },
  ];
  settings.readarr = [
    {
      id: 10,
      name: 'Bookshelf',
      hostname: 'bookshelf.local',
      port: 8787,
      apiKey: 'ebook-key',
      useSsl: false,
      baseUrl: '',
      activeProfileId: 1,
      activeProfileName: 'Ebooks',
      activeDirectory: '/books',
      activeMetadataProfileId: 1,
      tags: [],
      is4k: false,
      isDefault: true,
      syncEnabled: true,
      preventSearch: false,
      tagRequests: false,
      overrideRule: [],
      serviceType: 'ebook',
    },
    {
      id: 20,
      name: 'Audio Bookshelf',
      hostname: 'audiobooks.local',
      port: 8787,
      apiKey: 'audio-key',
      useSsl: false,
      baseUrl: '',
      activeProfileId: 2,
      activeProfileName: 'Audio',
      activeDirectory: '/audiobooks',
      activeMetadataProfileId: 2,
      tags: [],
      is4k: false,
      isDefault: true,
      syncEnabled: true,
      preventSearch: false,
      tagRequests: false,
      overrideRule: [],
      serviceType: 'audiobook',
    },
  ];
  settings.lidarr = [
    {
      id: 70,
      name: 'Lidarr',
      hostname: 'lidarr.local',
      port: 8686,
      apiKey: 'music-key',
      useSsl: false,
      activeProfileId: 1,
      activeProfileName: 'Music',
      activeMetadataProfileId: 1,
      activeMetadataProfileName: 'Standard',
      activeDirectory: '/music',
      tags: [],
      is4k: false,
      isDefault: true,
      syncEnabled: true,
      preventSearch: false,
      tagRequests: false,
      overrideRule: [],
    },
  ];
  settings.mylar = [
    {
      id: 80,
      name: 'Mylar3',
      hostname: 'mylar.local',
      port: 8090,
      apiKey: 'mylar-key',
      useSsl: false,
      baseUrl: '',
      isDefault: true,
      tags: [],
      syncEnabled: true,
      preventSearch: false,
    },
  ];
  settings.kapowarr = [
    {
      id: 90,
      name: 'Kapowarr',
      hostname: 'kapowarr.local',
      port: 5656,
      apiKey: 'kapowarr-key',
      useSsl: false,
      baseUrl: '',
      isDefault: true,
      tags: [],
      syncEnabled: true,
      preventSearch: false,
      rootFolder: '/comics',
    },
  ];
});

setupTestDb();

async function loginAs(email: string, password: string) {
  const settings = getSettings();
  const priorLocalLogin = settings.main.localLogin;
  settings.main.localLogin = true;

  try {
    const agent = request.agent(app);
    const res = await agent.post('/auth/local').send({ email, password });
    assert.strictEqual(res.status, 200);
    return agent;
  } finally {
    settings.main.localLogin = priorLocalLogin;
  }
}

describe('GET /media', () => {
  it('rejects malformed list filter values', async () => {
    const agent = await loginAs('admin@seerr.dev', 'test1234');
    const res = await agent.get('/media?filter=pending&filter=available');

    assert.strictEqual(res.status, 400);
    assert.match(res.body.message, /Filter must be a string/);
  });

  it('rejects unknown list sort values', async () => {
    const agent = await loginAs('admin@seerr.dev', 'test1234');
    const res = await agent.get('/media?sort=drop-table');

    assert.strictEqual(res.status, 400);
    assert.match(res.body.message, /Sort must be valid/);
  });

  it('filters media lists by media type before pagination', async () => {
    await getRepository(Media).save([
      new Media({
        tmdbId: 0,
        mediaType: MediaType.MUSIC,
        status: MediaStatus.AVAILABLE,
        mediaAddedAt: new Date('2026-01-03T00:00:00.000Z'),
      }),
      new Media({
        tmdbId: 123,
        mediaType: MediaType.MOVIE,
        status: MediaStatus.AVAILABLE,
        mediaAddedAt: new Date('2026-01-02T00:00:00.000Z'),
      }),
      new Media({
        tmdbId: 456,
        mediaType: MediaType.TV,
        status: MediaStatus.PARTIALLY_AVAILABLE,
        mediaAddedAt: new Date('2026-01-01T00:00:00.000Z'),
      }),
      new Media({
        tmdbId: 0,
        mediaType: MediaType.BOOK,
        status: MediaStatus.AVAILABLE,
        mediaAddedAt: new Date('2025-12-31T00:00:00.000Z'),
      }),
    ]);

    const agent = await loginAs('admin@seerr.dev', 'test1234');
    const res = await agent.get(
      '/media?filter=allavailable&sort=mediaAdded&take=20&mediaType=movie,tv'
    );

    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(
      res.body.results.map((item: { mediaType: string }) => item.mediaType),
      [MediaType.MOVIE, MediaType.TV]
    );
  });

  it('rejects malformed media type filters', async () => {
    const agent = await loginAs('admin@seerr.dev', 'test1234');
    const res = await agent.get('/media?mediaType=movie,invalid');

    assert.strictEqual(res.status, 400);
    assert.match(res.body.message, /Media type must be valid/);
  });

  it('denies media-list access without recent-view or request-management permission', async () => {
    const agent = await loginAs('friend@seerr.dev', 'test1234');
    const res = await agent.get(
      '/media?filter=allavailable&sort=mediaAdded&mediaType=movie,tv'
    );

    assert.strictEqual(res.status, 403);
  });

  it('returns only safe recent-media fields to recent-view users', async () => {
    const userRepository = getRepository(User);
    await userRepository.update(2, { permissions: Permission.RECENT_VIEW });
    const media = await getRepository(Media).save(
      new Media({
        tmdbId: 999_001,
        mediaType: MediaType.MOVIE,
        status: MediaStatus.AVAILABLE,
        status4k: MediaStatus.UNKNOWN,
        mediaAddedAt: new Date('2026-02-01T00:00:00.000Z'),
        serviceId: 30,
        externalServiceId: 40,
        externalServiceSlug: 'private-release',
        ratingKey: 'private-rating-key',
        jellyfinMediaId: 'private-jellyfin-id',
      })
    );

    try {
      const agent = await loginAs('friend@seerr.dev', 'test1234');
      const res = await agent.get(
        '/media?filter=allavailable&sort=mediaAdded&mediaType=movie,tv'
      );

      assert.strictEqual(res.status, 200);
      const item = res.body.results.find(
        (result: { id: number }) => result.id === media.id
      );
      assert.ok(item);
      assert.deepStrictEqual(Object.keys(item).sort(), [
        'id',
        'mediaAddedAt',
        'mediaType',
        'status',
        'status4k',
        'tmdbId',
      ]);

      const denied = await agent.get('/media?filter=pending&sort=modified');
      assert.strictEqual(denied.status, 403);
    } finally {
      await userRepository.update(2, { permissions: Permission.REQUEST });
    }
  });

  it('excludes an administrator-disabled category from unfiltered listings', async () => {
    const settings = getSettings();
    const originalCategories = { ...settings.main.enabledMediaCategories };
    settings.main.enabledMediaCategories = {
      ...originalCategories,
      comic: false,
    };
    const media = await getRepository(Media).save([
      new Media({
        tmdbId: 0,
        mediaType: MediaType.COMIC,
        status: MediaStatus.AVAILABLE,
        mediaAddedAt: new Date('2026-03-02T00:00:00.000Z'),
      }),
      new Media({
        tmdbId: 777,
        mediaType: MediaType.MOVIE,
        status: MediaStatus.AVAILABLE,
        mediaAddedAt: new Date('2026-03-01T00:00:00.000Z'),
      }),
    ]);

    try {
      const agent = await loginAs('admin@seerr.dev', 'test1234');
      const res = await agent.get('/media?filter=allavailable&sort=mediaAdded');

      assert.strictEqual(res.status, 200);
      const ids = res.body.results.map((item: { id: number }) => item.id);
      assert.ok(!ids.includes(media[0].id));
      assert.ok(ids.includes(media[1].id));
    } finally {
      settings.main.enabledMediaCategories = originalCategories;
    }
  });

  it('rejects an explicit mediaType filter for an administrator-disabled category', async () => {
    const settings = getSettings();
    const originalCategories = { ...settings.main.enabledMediaCategories };
    settings.main.enabledMediaCategories = {
      ...originalCategories,
      comic: false,
    };

    try {
      const agent = await loginAs('admin@seerr.dev', 'test1234');
      const res = await agent.get(
        '/media?filter=allavailable&sort=mediaAdded&mediaType=comic'
      );

      assert.strictEqual(res.status, 404);
    } finally {
      settings.main.enabledMediaCategories = originalCategories;
    }
  });
});

describe('GET /media/:id/watch_data', () => {
  it('hides media from an administrator-disabled category', async () => {
    const settings = getSettings();
    const originalCategories = { ...settings.main.enabledMediaCategories };
    settings.main.enabledMediaCategories = {
      ...originalCategories,
      comic: false,
    };
    const media = await getRepository(Media).save(
      new Media({
        tmdbId: 902,
        mediaType: MediaType.COMIC,
        status: MediaStatus.AVAILABLE,
      })
    );

    try {
      const agent = await loginAs('admin@seerr.dev', 'test1234');
      const response = await agent.get(`/media/${media.id}/watch_data`);

      assert.strictEqual(response.status, 404);
      assert.match(response.body.message, /Media does not exist/);
      assert.strictEqual(getMediaWatchStatsMock.mock.callCount(), 0);
      assert.strictEqual(getMediaWatchUsersMock.mock.callCount(), 0);
    } finally {
      settings.main.enabledMediaCategories = originalCategories;
    }
  });

  it('revalidates administrator authority before using Tautulli credentials', async () => {
    await getRepository(User).update(1, {
      permissions: Permission.REQUEST,
    });
    const staleAuthorizationApp = express();
    staleAuthorizationApp.use((req, _res, next) => {
      req.user = new User({ id: 1, permissions: Permission.ADMIN });
      next();
    });
    staleAuthorizationApp.use('/media', mediaRoutes);
    staleAuthorizationApp.use(
      (
        err: { status?: number; message?: string },
        _req: express.Request,
        res: express.Response,
        _next: express.NextFunction
      ) => (void _next, res.status(err.status ?? 500).json(err))
    );

    const response = await request(staleAuthorizationApp).get(
      '/media/1/watch_data'
    );

    assert.strictEqual(response.status, 403);
    assert.strictEqual(getMediaWatchStatsMock.mock.callCount(), 0);
    assert.strictEqual(getMediaWatchUsersMock.mock.callCount(), 0);
  });

  it('filters watcher entities at the response boundary', async () => {
    const settings = getSettings();
    settings.tautulli = {
      hostname: 'tautulli.local',
      port: 8181,
      apiKey: 'tautulli-key',
      useSsl: false,
    };
    const media = await getRepository(Media).save(
      new Media({
        tmdbId: 901,
        mediaType: MediaType.MOVIE,
        status: MediaStatus.AVAILABLE,
        ratingKey: 'standard-key',
      })
    );

    const agent = await loginAs('admin@seerr.dev', 'test1234');
    const res = await agent.get(`/media/${media.id}/watch_data`);

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.data.users.length, 1);
    assert.strictEqual(res.body.data.users[0].id, 1);
    assert.strictEqual(res.body.data.users[0].password, undefined);
    assert.strictEqual(res.body.data.users[0].plexToken, undefined);
    assert.strictEqual(res.body.data.users[0].settings, undefined);
    assert.deepStrictEqual(
      {
        playCount: res.body.data.playCount,
        playCount7Days: res.body.data.playCount7Days,
        playCount30Days: res.body.data.playCount30Days,
      },
      { playCount: 4, playCount7Days: 2, playCount30Days: 3 }
    );
  });
});

describe('POST /media/:id/:status', () => {
  it('rejects malformed media IDs before lookup', async () => {
    const agent = await loginAs('admin@seerr.dev', 'test1234');
    const res = await agent.post('/media/not-a-number/available').send();

    assert.strictEqual(res.status, 404);
  });

  it('rejects unknown media status transitions', async () => {
    const media = await getRepository(Media).save(
      new Media({
        tmdbId: 1,
        mediaType: MediaType.MOVIE,
        status: MediaStatus.PENDING,
        status4k: MediaStatus.UNKNOWN,
      })
    );

    const agent = await loginAs('admin@seerr.dev', 'test1234');
    const res = await agent.post(`/media/${media.id}/not-a-status`).send();

    assert.strictEqual(res.status, 404);

    const persisted = await getRepository(Media).findOneOrFail({
      where: { id: media.id },
    });
    assert.strictEqual(persisted.status, MediaStatus.PENDING);
  });

  it('rejects malformed season status update bodies', async () => {
    const media = await getRepository(Media).save(
      new Media({
        tmdbId: 2,
        mediaType: MediaType.TV,
        status: MediaStatus.PENDING,
        status4k: MediaStatus.UNKNOWN,
      })
    );

    const agent = await loginAs('admin@seerr.dev', 'test1234');
    const res = await agent.post(`/media/${media.id}/available`).send({
      seasons: [{ seasonNumber: 'not-a-number' }],
    });

    assert.strictEqual(res.status, 400);
    assert.match(res.body.message, /seasonNumber must be an integer/i);
  });

  it('rejects malformed media status update bodies', async () => {
    const media = await getRepository(Media).save(
      new Media({
        tmdbId: 4,
        mediaType: MediaType.MOVIE,
        status: MediaStatus.PENDING,
        status4k: MediaStatus.UNKNOWN,
      })
    );

    const agent = await loginAs('admin@seerr.dev', 'test1234');
    const res = await agent.post(`/media/${media.id}/available`).send([]);

    assert.strictEqual(res.status, 400);
    assert.match(res.body.message, /Media status body must be an object/);

    const persisted = await getRepository(Media).findOneOrFail({
      where: { id: media.id },
    });
    assert.strictEqual(persisted.status, MediaStatus.PENDING);
  });

  it('rejects string is4k status update bodies', async () => {
    const media = await getRepository(Media).save(
      new Media({
        tmdbId: 3,
        mediaType: MediaType.MOVIE,
        status: MediaStatus.PENDING,
        status4k: MediaStatus.UNKNOWN,
      })
    );

    const agent = await loginAs('admin@seerr.dev', 'test1234');
    const res = await agent
      .post(`/media/${media.id}/available`)
      .send({ is4k: 'true' });

    assert.strictEqual(res.status, 400);
    assert.match(res.body.message, /is4k must be a boolean/i);
  });

  it('rejects status updates for media in an administrator-disabled category', async () => {
    const settings = getSettings();
    const originalCategories = { ...settings.main.enabledMediaCategories };
    settings.main.enabledMediaCategories = {
      ...originalCategories,
      comic: false,
    };
    const media = await getRepository(Media).save(
      new Media({
        tmdbId: 0,
        mediaType: MediaType.COMIC,
        status: MediaStatus.PENDING,
        status4k: MediaStatus.UNKNOWN,
      })
    );

    try {
      const agent = await loginAs('admin@seerr.dev', 'test1234');
      const res = await agent.post(`/media/${media.id}/available`).send();

      assert.strictEqual(res.status, 404);

      const persisted = await getRepository(Media).findOneOrFail({
        where: { id: media.id },
      });
      assert.strictEqual(persisted.status, MediaStatus.PENDING);
    } finally {
      settings.main.enabledMediaCategories = originalCategories;
    }
  });
});

describe('DELETE /media/:id', () => {
  it('refuses to remove media belonging to an administrator-disabled category', async () => {
    const settings = getSettings();
    const originalCategories = { ...settings.main.enabledMediaCategories };
    settings.main.enabledMediaCategories = {
      ...originalCategories,
      comic: false,
    };
    const media = await getRepository(Media).save(
      new Media({
        tmdbId: 0,
        mediaType: MediaType.COMIC,
        status: MediaStatus.AVAILABLE,
      })
    );

    try {
      const agent = await loginAs('admin@seerr.dev', 'test1234');
      const res = await agent.delete(`/media/${media.id}`);

      assert.strictEqual(res.status, 404);
      assert.strictEqual(
        await getRepository(Media).countBy({ id: media.id }),
        1
      );
    } finally {
      settings.main.enabledMediaCategories = originalCategories;
    }
  });
});

describe('library deletion authorization', () => {
  it('reproduces stale available series blocking requests when no library copy remains', async () => {
    const tmdbId = 909999;
    const media = await getRepository(Media).save(
      new Media({
        tmdbId,
        tvdbId: 777,
        mediaType: MediaType.TV,
        status: MediaStatus.AVAILABLE,
        status4k: MediaStatus.UNKNOWN,
        ratingKey: 'stale-plex-key',
        jellyfinMediaId: 'stale-jellyfin-id',
        seasons: [
          new Season({
            seasonNumber: 1,
            status: MediaStatus.AVAILABLE,
            status4k: MediaStatus.UNKNOWN,
          }),
        ],
      })
    );
    const requester = await getRepository(User).findOneByOrFail({
      email: 'friend@seerr.dev',
    });

    await assert.rejects(
      MediaRequest.request(
        { mediaType: MediaType.TV, mediaId: tmdbId, seasons: [1] },
        requester
      ),
      DuplicateMediaRequestError
    );

    const agent = await loginAs('admin@seerr.dev', 'test1234');
    const plan = await agent.get(`/media/${media.id}/library`);
    assert.strictEqual(plan.status, 200);
    assert.deepStrictEqual(plan.body.targets, []);

    const cleared = await agent
      .post(`/media/${media.id}/library/clear-stale-availability`)
      .send({ token: plan.body.token, quality: 'HD' });
    assert.strictEqual(cleared.status, 204, cleared.body.message);

    const updated = await getRepository(Media).findOneOrFail({
      where: { id: media.id },
      relations: { seasons: true },
    });
    assert.strictEqual(updated.status, MediaStatus.UNKNOWN);
    assert.strictEqual(updated.seasons[0].status, MediaStatus.UNKNOWN);
    assert.strictEqual(updated.ratingKey, 'stale-plex-key');
    assert.strictEqual(updated.jellyfinMediaId, 'stale-jellyfin-id');

    const created = await MediaRequest.request(
      { mediaType: MediaType.TV, mediaId: tmdbId, seasons: [1] },
      requester
    );
    assert.ok(created.id);
    assert.strictEqual(created.status, MediaRequestStatus.PENDING);
  });

  it('does not clear availability when a fresh inventory finds a copy after the plan was issued', async () => {
    const media = await getRepository(Media).save(
      new Media({
        tmdbId: 909998,
        tvdbId: 777,
        mediaType: MediaType.TV,
        status: MediaStatus.AVAILABLE,
        seasons: [
          new Season({ seasonNumber: 1, status: MediaStatus.AVAILABLE }),
        ],
      })
    );
    const agent = await loginAs('admin@seerr.dev', 'test1234');
    const plan = await agent.get(`/media/${media.id}/library`);
    assert.deepStrictEqual(plan.body.targets, []);

    getSeriesMock.mock.mockImplementation(async () => [
      { id: 701, tvdbId: 777, titleSlug: 'anime' } as SonarrSeries,
    ]);
    const cleared = await agent
      .post(`/media/${media.id}/library/clear-stale-availability`)
      .send({ token: plan.body.token, quality: 'HD' });

    assert.strictEqual(cleared.status, 409);
    const unchanged = await getRepository(Media).findOneOrFail({
      where: { id: media.id },
      relations: { seasons: true },
    });
    assert.strictEqual(unchanged.status, MediaStatus.AVAILABLE);
    assert.strictEqual(unchanged.seasons[0].status, MediaStatus.AVAILABLE);
  });

  it('does not clear availability when no configured library service was checked', async () => {
    const settings = getSettings();
    const originalSonarr = settings.sonarr;
    settings.sonarr = [];
    const media = await getRepository(Media).save(
      new Media({
        tmdbId: 909997,
        tvdbId: 777,
        mediaType: MediaType.TV,
        status: MediaStatus.AVAILABLE,
      })
    );

    try {
      const agent = await loginAs('admin@seerr.dev', 'test1234');
      const plan = await agent.get(`/media/${media.id}/library`);
      assert.strictEqual(plan.body.verifiedServices, 0);
      const cleared = await agent
        .post(`/media/${media.id}/library/clear-stale-availability`)
        .send({ token: plan.body.token, quality: 'HD' });

      assert.strictEqual(cleared.status, 409);
      const unchanged = await getRepository(Media).findOneOrFail({
        where: { id: media.id },
      });
      assert.strictEqual(unchanged.status, MediaStatus.AVAILABLE);
    } finally {
      settings.sonarr = originalSonarr;
    }
  });

  it('hides library actions for administrator-disabled media categories', async () => {
    const settings = getSettings();
    const originalCategories = { ...settings.main.enabledMediaCategories };
    settings.main.enabledMediaCategories = {
      ...originalCategories,
      comic: false,
    };
    const media = await getRepository(Media).save(
      new Media({
        tmdbId: 903,
        mediaType: MediaType.COMIC,
        status: MediaStatus.AVAILABLE,
      })
    );

    try {
      const agent = await loginAs('admin@seerr.dev', 'test1234');
      const response = await agent.get(`/media/${media.id}/library`);

      assert.strictEqual(response.status, 404);
      assert.match(response.body.message, /Media not found/);
    } finally {
      settings.main.enabledMediaCategories = originalCategories;
    }
  });

  it('does not remove library copies for administrator-disabled media categories', async () => {
    const settings = getSettings();
    const originalCategories = { ...settings.main.enabledMediaCategories };
    settings.main.enabledMediaCategories = {
      ...originalCategories,
      comic: false,
    };
    const media = await getRepository(Media).save(
      new Media({
        tmdbId: 904,
        mediaType: MediaType.COMIC,
        status: MediaStatus.AVAILABLE,
      })
    );

    try {
      const agent = await loginAs('admin@seerr.dev', 'test1234');
      const response = await agent
        .delete(`/media/${media.id}/library`)
        .send({ token: 'a'.repeat(64) });

      assert.strictEqual(response.status, 404);
      assert.strictEqual(
        await getRepository(Media).countBy({ id: media.id }),
        1
      );
    } finally {
      settings.main.enabledMediaCategories = originalCategories;
    }
  });

  it('denies request managers who are not admins from listing or deleting library copies', async () => {
    const userRepository = getRepository(User);
    const friend = await userRepository.findOneByOrFail({
      email: 'friend@seerr.dev',
    });
    const originalPermissions = friend.permissions;
    friend.permissions = Permission.MANAGE_REQUESTS;
    await userRepository.save(friend);

    try {
      const agent = await loginAs('friend@seerr.dev', 'test1234');
      const plan = await agent.get('/media/not-a-number/library');
      const deletion = await agent
        .delete('/media/not-a-number/library')
        .send({ token: 'a'.repeat(64) });
      const clearStale = await agent
        .post('/media/not-a-number/library/clear-stale-availability')
        .send({ token: 'a'.repeat(64), quality: 'HD' });

      assert.strictEqual(plan.status, 403);
      assert.strictEqual(deletion.status, 403);
      assert.strictEqual(clearStale.status, 403);
    } finally {
      friend.permissions = originalPermissions;
      await userRepository.save(friend);
    }
  });
});

describe('DELETE /media/:id/file', () => {
  it('does not remove an ebook when its administrator-disabled category is selected', async () => {
    const settings = getSettings();
    const originalCategories = { ...settings.main.enabledMediaCategories };
    settings.main.enabledMediaCategories = {
      ...originalCategories,
      ebook: false,
      audiobook: true,
    };
    const media = await getRepository(Media).save(
      new Media({
        tmdbId: 905,
        mediaType: MediaType.BOOK,
        status: MediaStatus.AVAILABLE,
      })
    );

    try {
      const agent = await loginAs('admin@seerr.dev', 'test1234');
      const response = await agent.delete(
        `/media/${media.id}/file?format=ebook`
      );

      assert.strictEqual(response.status, 404);
      assert.strictEqual(removeBookMock.mock.callCount(), 0);
    } finally {
      settings.main.enabledMediaCategories = originalCategories;
    }
  });

  it('accepts book format removals through the production OpenAPI boundary', async () => {
    const validatedApp = express();
    validatedApp.use(express.json());
    validatedApp.use(
      session({
        secret: 'test-secret',
        cookie: { secure: 'auto' },
        resave: false,
        saveUninitialized: false,
      })
    );
    validatedApp.use(rateLimit({ windowMs: 60_000, limit: 10_000 }), checkUser);
    validatedApp.use('/api/v1/auth', authRoutes);
    validatedApp.use(
      OpenApiValidator.middleware({
        apiSpec: path.join(process.cwd(), 'seerr-api.yml'),
        validateRequests: true,
        validateSecurity: false,
      })
    );
    validatedApp.use('/api/v1/media', mediaRoutes);
    validatedApp.use(
      (
        err: { status?: number; message?: string; errors?: unknown[] },
        _req: express.Request,
        res: express.Response,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        _next: express.NextFunction
      ) => {
        res.status(err.status ?? 500).json({
          status: err.status ?? 500,
          message: err.message,
          errors: err.errors,
        });
      }
    );

    const settings = getSettings();
    const priorLocalLogin = settings.main.localLogin;
    settings.main.localLogin = true;

    try {
      const agent = request.agent(validatedApp);
      const loginResponse = await agent
        .post('/api/v1/auth/local')
        .send({ email: 'admin@seerr.dev', password: 'test1234' });
      assert.strictEqual(loginResponse.status, 200);

      const ebook = await getRepository(Media).save(
        new Media({
          tmdbId: 0,
          mediaType: MediaType.BOOK,
          status: MediaStatus.AVAILABLE,
          serviceId: 10,
          externalServiceId: 100,
          externalServiceSlug: 'ebook-slug',
        })
      );
      const audiobook = await getRepository(Media).save(
        new Media({
          tmdbId: 0,
          mediaType: MediaType.BOOK,
          status: MediaStatus.AVAILABLE,
          audiobookServiceId: 20,
          audiobookExternalServiceId: 200,
          audiobookExternalServiceSlug: 'audiobook-slug',
        })
      );
      const bothFormats = await getRepository(Media).save(
        new Media({
          tmdbId: 0,
          mediaType: MediaType.BOOK,
          status: MediaStatus.AVAILABLE,
          serviceId: 10,
          externalServiceId: 100,
          externalServiceSlug: 'ebook-slug',
          audiobookServiceId: 20,
          audiobookExternalServiceId: 200,
          audiobookExternalServiceSlug: 'audiobook-slug',
        })
      );

      const ebookResponse = await agent.delete(
        `/api/v1/media/${ebook.id}/file?format=ebook`
      );
      const audiobookResponse = await agent.delete(
        `/api/v1/media/${audiobook.id}/file?format=audiobook`
      );
      const bothResponse = await agent.delete(
        `/api/v1/media/${bothFormats.id}/file?format=both`
      );

      assert.strictEqual(ebookResponse.status, 204);
      assert.strictEqual(audiobookResponse.status, 204);
      assert.strictEqual(bothResponse.status, 204);
    } finally {
      settings.main.localLogin = priorLocalLogin;
    }
  });

  it('uses an explicitly linked zero-valued service instead of the default', async (t) => {
    const settings = getSettings();
    settings.radarr.unshift({
      ...settings.radarr[0],
      id: 0,
      name: 'Zero Radarr',
      hostname: 'zero-radarr.local',
      apiKey: 'zero-key',
      isDefault: false,
    });
    const observedServiceIds: number[] = [];
    const originalBuildUrl = RadarrAPI.buildUrl;
    const buildUrlMock = mock.method(
      RadarrAPI,
      'buildUrl',
      (
        server: Pick<
          DVRSettings,
          'id' | 'useSsl' | 'hostname' | 'port' | 'baseUrl'
        >,
        apiPath?: string
      ) => {
        observedServiceIds.push(server.id);
        return originalBuildUrl(server, apiPath);
      }
    );
    t.after(() => buildUrlMock.mock.restore());
    const media = await getRepository(Media).save(
      new Media({
        tmdbId: 1000,
        mediaType: MediaType.MOVIE,
        status: MediaStatus.AVAILABLE,
        serviceId: 0,
        externalServiceId: 2000,
      })
    );

    const agent = await loginAs('admin@seerr.dev', 'test1234');
    const response = await agent.delete(`/media/${media.id}/file`);

    assert.strictEqual(response.status, 204);
    assert.deepStrictEqual(observedServiceIds, [0]);
  });

  it('serializes a provider deletion with a concurrent status mutation', async () => {
    let deletionStarted!: () => void;
    let releaseDeletion!: () => void;
    const deletionStartedPromise = new Promise<void>((resolve) => {
      deletionStarted = resolve;
    });
    const releaseDeletionPromise = new Promise<void>((resolve) => {
      releaseDeletion = resolve;
    });
    removeMovieMock.mock.mockImplementation(async () => {
      deletionStarted();
      await releaseDeletionPromise;
    });
    const media = await getRepository(Media).save(
      new Media({
        tmdbId: 1001,
        mediaType: MediaType.MOVIE,
        status: MediaStatus.AVAILABLE,
        serviceId: 30,
        externalServiceId: 3001,
      })
    );
    const agent = await loginAs('admin@seerr.dev', 'test1234');

    const deletion = agent
      .delete(`/media/${media.id}/file`)
      .then((response) => response);
    await deletionStartedPromise;
    let statusFinished = false;
    const statusMutation = agent
      .post(`/media/${media.id}/processing`)
      .send()
      .then((response) => {
        statusFinished = true;
        return response;
      });
    await new Promise<void>((resolve) => setImmediate(resolve));

    assert.strictEqual(statusFinished, false);
    releaseDeletion();
    const [deletionResponse, statusResponse] = await Promise.all([
      deletion,
      statusMutation,
    ]);
    assert.strictEqual(deletionResponse.status, 204);
    assert.strictEqual(statusResponse.status, 200);
    const persisted = await getRepository(Media).findOneByOrFail({
      id: media.id,
    });
    assert.strictEqual(persisted.status, MediaStatus.PROCESSING);
    assert.strictEqual(persisted.serviceId, null);
    assert.strictEqual(persisted.externalServiceId, null);
  });

  it('persists standard movie deletion without clearing the 4K service link', async () => {
    const media = await getRepository(Media).save(
      new Media({
        tmdbId: 101,
        mediaType: MediaType.MOVIE,
        status: MediaStatus.AVAILABLE,
        status4k: MediaStatus.AVAILABLE,
        serviceId: 30,
        externalServiceId: 301,
        externalServiceSlug: 'movie',
        serviceId4k: 40,
        externalServiceId4k: 401,
        externalServiceSlug4k: 'movie-4k',
        ratingKey: 'standard-key',
        ratingKey4k: '4k-key',
      })
    );

    const agent = await loginAs('admin@seerr.dev', 'test1234');
    const res = await agent.delete(`/media/${media.id}/file`);

    assert.strictEqual(res.status, 204);
    assert.strictEqual(removeMovieMock.mock.callCount(), 1);
    assert.strictEqual(removeMovieMock.mock.calls[0].arguments[0], 101);
    const updated = await getRepository(Media).findOneOrFail({
      where: { id: media.id },
    });
    assert.strictEqual(updated.status, MediaStatus.DELETED);
    assert.strictEqual(updated.serviceId, null);
    assert.strictEqual(updated.externalServiceId, null);
    assert.strictEqual(updated.externalServiceSlug, null);
    assert.strictEqual(updated.ratingKey, null);
    assert.strictEqual(updated.status4k, MediaStatus.AVAILABLE);
    assert.strictEqual(updated.serviceId4k, 40);
    assert.strictEqual(updated.externalServiceId4k, 401);
    assert.strictEqual(updated.externalServiceSlug4k, 'movie-4k');
    assert.strictEqual(updated.ratingKey4k, '4k-key');
  });

  it('removes a comic from Mylar3 and clears its comic service links', async () => {
    const media = await getRepository(Media).save(
      new Media({
        tmdbId: 0,
        mediaType: MediaType.COMIC,
        status: MediaStatus.AVAILABLE,
        serviceId: 80,
        externalServiceId: 5678,
        externalServiceSlug: '5678',
        comicServiceType: 'mylar',
      })
    );

    const agent = await loginAs('admin@seerr.dev', 'test1234');
    const res = await agent.delete(`/media/${media.id}/file`);

    assert.strictEqual(res.status, 204);
    assert.strictEqual(removeComicMock.mock.callCount(), 1);
    assert.strictEqual(removeComicMock.mock.calls[0].arguments[0], '5678');
    assert.strictEqual(removeVolumeMock.mock.callCount(), 0);
    const updated = await getRepository(Media).findOneOrFail({
      where: { id: media.id },
    });
    assert.strictEqual(updated.status, MediaStatus.DELETED);
    assert.strictEqual(updated.serviceId, null);
    assert.strictEqual(updated.externalServiceId, null);
    assert.strictEqual(updated.externalServiceSlug, null);
    assert.strictEqual(updated.comicServiceType, null);
  });

  it('removes a comic from Kapowarr using its internal volume id', async () => {
    const media = await getRepository(Media).save(
      new Media({
        tmdbId: 0,
        mediaType: MediaType.COMIC,
        status: MediaStatus.AVAILABLE,
        serviceId: 90,
        externalServiceId: 1,
        externalServiceSlug: '1',
        comicServiceType: 'kapowarr',
      })
    );

    const agent = await loginAs('admin@seerr.dev', 'test1234');
    const res = await agent.delete(`/media/${media.id}/file`);

    assert.strictEqual(res.status, 204);
    assert.strictEqual(removeVolumeMock.mock.callCount(), 1);
    assert.strictEqual(removeVolumeMock.mock.calls[0].arguments[0], 1);
    assert.strictEqual(removeComicMock.mock.callCount(), 0);
    const updated = await getRepository(Media).findOneOrFail({
      where: { id: media.id },
    });
    assert.strictEqual(updated.status, MediaStatus.DELETED);
    assert.strictEqual(updated.comicServiceType, null);
  });

  it('reports a clear error when Kapowarr has a queued task for the volume', async () => {
    removeVolumeMock.mock.mockImplementationOnce(async () => {
      throw new KapowarrTaskRunningError(1);
    });
    const media = await getRepository(Media).save(
      new Media({
        tmdbId: 0,
        mediaType: MediaType.COMIC,
        status: MediaStatus.AVAILABLE,
        serviceId: 90,
        externalServiceId: 1,
        externalServiceSlug: '1',
        comicServiceType: 'kapowarr',
      })
    );

    const agent = await loginAs('admin@seerr.dev', 'test1234');
    const res = await agent.delete(`/media/${media.id}/file`);

    assert.strictEqual(res.status, 409);
    assert.match(res.body.message, /queued or running task/);
    const updated = await getRepository(Media).findOneOrFail({
      where: { id: media.id },
    });
    assert.strictEqual(updated.status, MediaStatus.AVAILABLE);
  });

  it('persists 4K series deletion and season state without clearing standard links', async () => {
    const media = await getRepository(Media).save(
      new Media({
        tmdbId: 202,
        tvdbId: 777,
        mediaType: MediaType.TV,
        status: MediaStatus.AVAILABLE,
        status4k: MediaStatus.AVAILABLE,
        serviceId: 50,
        externalServiceId: 501,
        serviceId4k: 60,
        externalServiceId4k: 601,
        seasons: [
          new Season({
            seasonNumber: 1,
            status: MediaStatus.AVAILABLE,
            status4k: MediaStatus.AVAILABLE,
          }),
        ],
      })
    );

    const agent = await loginAs('admin@seerr.dev', 'test1234');
    const res = await agent.delete(`/media/${media.id}/file?is4k=true`);

    assert.strictEqual(res.status, 204);
    assert.strictEqual(removeSeriesMock.mock.callCount(), 1);
    assert.strictEqual(removeSeriesMock.mock.calls[0].arguments[0], 777);
    const updated = await getRepository(Media).findOneOrFail({
      where: { id: media.id },
    });
    assert.strictEqual(updated.status, MediaStatus.AVAILABLE);
    assert.strictEqual(updated.serviceId, 50);
    assert.strictEqual(updated.externalServiceId, 501);
    assert.strictEqual(updated.status4k, MediaStatus.DELETED);
    assert.strictEqual(updated.serviceId4k, null);
    assert.strictEqual(updated.externalServiceId4k, null);
    assert.strictEqual(updated.seasons[0].status, MediaStatus.AVAILABLE);
    assert.strictEqual(updated.seasons[0].status4k, MediaStatus.DELETED);
  });

  it('rejects malformed is4k file deletion query values', async () => {
    const media = await getRepository(Media).save(
      new Media({
        tmdbId: 0,
        mediaType: MediaType.BOOK,
        status: MediaStatus.AVAILABLE,
        serviceId: 10,
        externalServiceId: 100,
        externalServiceSlug: 'ebook-slug',
      })
    );

    const agent = await loginAs('admin@seerr.dev', 'test1234');
    const res = await agent.delete(`/media/${media.id}/file?is4k=yes`);

    assert.strictEqual(res.status, 400);
    assert.match(res.body.message, /is4k must be valid/i);
    assert.strictEqual(removeBookMock.mock.callCount(), 0);
  });

  it('rejects unknown book format query values before deletion', async () => {
    const media = await getRepository(Media).save(
      new Media({
        tmdbId: 0,
        mediaType: MediaType.BOOK,
        status: MediaStatus.AVAILABLE,
        serviceId: 10,
        externalServiceId: 100,
        externalServiceSlug: 'ebook-slug',
      })
    );

    const agent = await loginAs('admin@seerr.dev', 'test1234');
    const res = await agent.delete(`/media/${media.id}/file?format=pdf`);

    assert.strictEqual(res.status, 400);
    assert.match(res.body.message, /Format must be valid/);
    assert.strictEqual(removeBookMock.mock.callCount(), 0);
  });

  it('removes only the ebook link when an audiobook link remains', async () => {
    const media = await getRepository(Media).save(
      new Media({
        tmdbId: 0,
        mediaType: MediaType.BOOK,
        status: MediaStatus.AVAILABLE,
        serviceId: 10,
        externalServiceId: 100,
        externalServiceSlug: 'ebook-slug',
        audiobookServiceId: 20,
        audiobookExternalServiceId: 200,
        audiobookExternalServiceSlug: 'audiobook-slug',
      })
    );

    const agent = await loginAs('admin@seerr.dev', 'test1234');
    const res = await agent.delete(`/media/${media.id}/file?format=ebook`);

    assert.strictEqual(res.status, 204);
    assert.strictEqual(removeBookMock.mock.callCount(), 1);
    assert.strictEqual(removeBookMock.mock.calls[0].arguments[0], 100);

    const updated = await getRepository(Media).findOneOrFail({
      where: { id: media.id },
    });
    assert.strictEqual(updated.serviceId, null);
    assert.strictEqual(updated.externalServiceId, null);
    assert.strictEqual(updated.externalServiceSlug, null);
    assert.strictEqual(updated.audiobookServiceId, 20);
    assert.strictEqual(updated.audiobookExternalServiceId, 200);
    assert.strictEqual(updated.audiobookExternalServiceSlug, 'audiobook-slug');
    assert.strictEqual(updated.status, MediaStatus.PARTIALLY_AVAILABLE);
  });

  it('removes only the audiobook link when an ebook link remains', async () => {
    const media = await getRepository(Media).save(
      new Media({
        tmdbId: 0,
        mediaType: MediaType.BOOK,
        status: MediaStatus.AVAILABLE,
        serviceId: 10,
        externalServiceId: 100,
        externalServiceSlug: 'ebook-slug',
        audiobookServiceId: 20,
        audiobookExternalServiceId: 200,
        audiobookExternalServiceSlug: 'audiobook-slug',
      })
    );

    const agent = await loginAs('admin@seerr.dev', 'test1234');
    const res = await agent.delete(`/media/${media.id}/file?format=audiobook`);

    assert.strictEqual(res.status, 204);
    assert.strictEqual(removeBookMock.mock.callCount(), 1);
    assert.strictEqual(removeBookMock.mock.calls[0].arguments[0], 200);

    const updated = await getRepository(Media).findOneOrFail({
      where: { id: media.id },
    });
    assert.strictEqual(updated.serviceId, 10);
    assert.strictEqual(updated.externalServiceId, 100);
    assert.strictEqual(updated.externalServiceSlug, 'ebook-slug');
    assert.strictEqual(updated.audiobookServiceId, null);
    assert.strictEqual(updated.audiobookExternalServiceId, null);
    assert.strictEqual(updated.audiobookExternalServiceSlug, null);
    assert.strictEqual(updated.status, MediaStatus.PARTIALLY_AVAILABLE);
  });

  it('persists successful book format removals when another format fails', async () => {
    removeBookMock.mock.mockImplementation(async (bookId: number) => {
      if (bookId === 200) {
        throw new Error('Audiobook removal failed');
      }
    });

    const media = await getRepository(Media).save(
      new Media({
        tmdbId: 0,
        mediaType: MediaType.BOOK,
        status: MediaStatus.AVAILABLE,
        serviceId: 10,
        externalServiceId: 100,
        externalServiceSlug: 'ebook-slug',
        audiobookServiceId: 20,
        audiobookExternalServiceId: 200,
        audiobookExternalServiceSlug: 'audiobook-slug',
      })
    );

    const agent = await loginAs('admin@seerr.dev', 'test1234');
    const res = await agent.delete(`/media/${media.id}/file?format=both`);

    assert.strictEqual(res.status, 404);
    assert.strictEqual(removeBookMock.mock.callCount(), 2);
    assert.strictEqual(removeBookMock.mock.calls[0].arguments[0], 100);
    assert.strictEqual(removeBookMock.mock.calls[1].arguments[0], 200);

    const updated = await getRepository(Media).findOneOrFail({
      where: { id: media.id },
    });
    assert.strictEqual(updated.serviceId, null);
    assert.strictEqual(updated.externalServiceId, null);
    assert.strictEqual(updated.externalServiceSlug, null);
    assert.strictEqual(updated.audiobookServiceId, 20);
    assert.strictEqual(updated.audiobookExternalServiceId, 200);
    assert.strictEqual(updated.audiobookExternalServiceSlug, 'audiobook-slug');
    assert.strictEqual(updated.status, MediaStatus.PARTIALLY_AVAILABLE);
  });

  it('persists audiobook removal when ebook removal fails', async () => {
    removeBookMock.mock.mockImplementation(async (bookId: number) => {
      if (bookId === 100) {
        throw new Error('Ebook removal failed');
      }
    });

    const media = await getRepository(Media).save(
      new Media({
        tmdbId: 0,
        mediaType: MediaType.BOOK,
        status: MediaStatus.AVAILABLE,
        serviceId: 10,
        externalServiceId: 100,
        externalServiceSlug: 'ebook-slug',
        audiobookServiceId: 20,
        audiobookExternalServiceId: 200,
        audiobookExternalServiceSlug: 'audiobook-slug',
      })
    );

    const agent = await loginAs('admin@seerr.dev', 'test1234');
    const res = await agent.delete(`/media/${media.id}/file?format=both`);

    assert.strictEqual(res.status, 404);
    assert.strictEqual(removeBookMock.mock.callCount(), 2);
    assert.strictEqual(removeBookMock.mock.calls[0].arguments[0], 100);
    assert.strictEqual(removeBookMock.mock.calls[1].arguments[0], 200);

    const updated = await getRepository(Media).findOneOrFail({
      where: { id: media.id },
    });
    assert.strictEqual(updated.serviceId, 10);
    assert.strictEqual(updated.externalServiceId, 100);
    assert.strictEqual(updated.externalServiceSlug, 'ebook-slug');
    assert.strictEqual(updated.audiobookServiceId, null);
    assert.strictEqual(updated.audiobookExternalServiceId, null);
    assert.strictEqual(updated.audiobookExternalServiceSlug, null);
    assert.strictEqual(updated.status, MediaStatus.PARTIALLY_AVAILABLE);
  });

  it('removes only the requested book when its author has another book', async () => {
    const media = await getRepository(Media).save(
      new Media({
        tmdbId: 0,
        mediaType: MediaType.BOOK,
        status: MediaStatus.AVAILABLE,
        serviceId: 10,
        externalServiceId: 100,
      })
    );

    const agent = await loginAs('admin@seerr.dev', 'test1234');
    const response = await agent.delete(`/media/${media.id}/file?format=ebook`);

    assert.strictEqual(response.status, 204);
    assert.deepStrictEqual(getBookMock.mock.calls[0].arguments, [100, 0]);
    assert.strictEqual(removeBookMock.mock.calls[0].arguments[0], 100);
    assert.deepStrictEqual(
      getBooksByAuthorMock.mock.calls[0].arguments,
      [700, 0]
    );
    assert.strictEqual(removeAuthorMock.mock.callCount(), 0);
  });

  it('removes the Bookshelf author after its last requested book', async () => {
    getBooksByAuthorMock.mock.mockImplementation(async () => []);
    const media = await getRepository(Media).save(
      new Media({
        tmdbId: 0,
        mediaType: MediaType.BOOK,
        status: MediaStatus.AVAILABLE,
        serviceId: 10,
        externalServiceId: 101,
      })
    );

    const agent = await loginAs('admin@seerr.dev', 'test1234');
    const response = await agent.delete(`/media/${media.id}/file?format=ebook`);

    assert.strictEqual(response.status, 204);
    assert.strictEqual(removeBookMock.mock.calls[0].arguments[0], 101);
    assert.strictEqual(removeAuthorMock.mock.callCount(), 1);
    assert.strictEqual(removeAuthorMock.mock.calls[0].arguments[0], 700);
  });

  it('removes only the requested album when its artist has another album', async () => {
    const media = await getRepository(Media).save(
      new Media({
        tmdbId: 0,
        mediaType: MediaType.MUSIC,
        status: MediaStatus.AVAILABLE,
        serviceId: 70,
        externalServiceId: 300,
      })
    );

    const agent = await loginAs('admin@seerr.dev', 'test1234');
    const response = await agent.delete(`/media/${media.id}/file`);

    assert.strictEqual(response.status, 204);
    assert.deepStrictEqual(getAlbumMock.mock.calls[0].arguments, [
      { id: 300 },
      0,
    ]);
    assert.strictEqual(removeAlbumMock.mock.calls[0].arguments[0], 300);
    assert.deepStrictEqual(
      getAlbumsByArtistMock.mock.calls[0].arguments,
      [800, 0]
    );
    assert.strictEqual(removeArtistMock.mock.callCount(), 0);
  });

  it('removes the Lidarr artist after its last requested album', async () => {
    getAlbumsByArtistMock.mock.mockImplementation(async () => []);
    const media = await getRepository(Media).save(
      new Media({
        tmdbId: 0,
        mediaType: MediaType.MUSIC,
        status: MediaStatus.AVAILABLE,
        serviceId: 70,
        externalServiceId: 301,
      })
    );

    const agent = await loginAs('admin@seerr.dev', 'test1234');
    const response = await agent.delete(`/media/${media.id}/file`);

    assert.strictEqual(response.status, 204);
    assert.strictEqual(removeAlbumMock.mock.calls[0].arguments[0], 301);
    assert.strictEqual(removeArtistMock.mock.callCount(), 1);
    assert.strictEqual(removeArtistMock.mock.calls[0].arguments[0], 800);
  });

  it('refuses to remove a file for media in an administrator-disabled category', async () => {
    const settings = getSettings();
    const originalCategories = { ...settings.main.enabledMediaCategories };
    settings.main.enabledMediaCategories = {
      ...originalCategories,
      comic: false,
    };
    const media = await getRepository(Media).save(
      new Media({
        tmdbId: 0,
        mediaType: MediaType.COMIC,
        status: MediaStatus.AVAILABLE,
      })
    );

    try {
      const agent = await loginAs('admin@seerr.dev', 'test1234');
      const res = await agent.delete(`/media/${media.id}/file`);

      assert.strictEqual(res.status, 404);
      assert.strictEqual(
        await getRepository(Media).countBy({ id: media.id }),
        1
      );
    } finally {
      settings.main.enabledMediaCategories = originalCategories;
    }
  });
});
