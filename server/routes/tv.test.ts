import assert from 'node:assert/strict';
import { afterEach, before, describe, it, mock } from 'node:test';

import path from 'node:path';

import ExternalAPI from '@server/api/externalapi';
import SonarrAPI from '@server/api/servarr/sonarr';
import Tvdb from '@server/api/tvdb';
import { MediaType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import { User } from '@server/entity/User';
import { UserSettings } from '@server/entity/UserSettings';
import {
  getSettings,
  MetadataProviderType,
  type SonarrSettings,
} from '@server/lib/settings';
import { setupTestDb } from '@server/test/db';
import type { Express } from 'express';
import express from 'express';
import * as OpenApiValidator from 'express-openapi-validator';
import request from 'supertest';
import tvRoutes from './tv';

let app: Express;

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/tv', tvRoutes);
  return app;
}

before(() => {
  app = createApp();
});

afterEach(() => {
  mock.restoreAll();
});

setupTestDb();

describe('GET /tv/:id/cover', () => {
  it('serves linked Sonarr covers through the configured service', async () => {
    const settings = getSettings();
    const priorSonarr = settings.sonarr;
    settings.sonarr = [
      {
        id: 9,
        name: 'Sonarr',
        hostname: 'sonarr.test',
        port: 8989,
        apiKey: 'sonarr-key',
        useSsl: false,
        baseUrl: '',
        activeProfileId: 1,
        activeProfileName: 'Any',
        activeDirectory: '/tv',
        tags: [],
        is4k: false,
        isDefault: true,
        externalUrl: '',
        syncEnabled: true,
        preventSearch: false,
        tagRequests: false,
        overrideRule: [],
        seriesType: 'standard',
        animeSeriesType: 'anime',
        enableSeasonFolders: true,
        monitorNewItems: 'all',
      },
    ];
    const getSeriesCoverMock = mock.method(
      SonarrAPI.prototype,
      'getSeriesCover',
      async () => ({
        imageBuffer: Buffer.from('series-cover'),
        contentType: 'image/jpeg',
      })
    );
    const originalBuildUrl = SonarrAPI.buildUrl;
    const buildUrlMock = mock.method(
      SonarrAPI,
      'buildUrl',
      (server: SonarrSettings, path?: string) => originalBuildUrl(server, path)
    );

    try {
      const media = await getRepository(Media).save(
        new Media({
          tmdbId: 100,
          mediaType: MediaType.TV,
          serviceId: 9,
          externalServiceId: 44,
          externalServiceSlug: 'test-series',
        })
      );

      const res = await request(app).get(
        `/tv/100/cover?mediaId=${media.id}&is4k=false`
      );

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.headers['content-type'], 'image/jpeg');
      assert.deepStrictEqual(res.body, Buffer.from('series-cover'));
      assert.strictEqual(getSeriesCoverMock.mock.calls[0].arguments[0], 44);
      assert(
        buildUrlMock.mock.calls.some((call) => call.arguments[1] === '/api/v3')
      );
    } finally {
      settings.sonarr = priorSonarr;
    }
  });
});

describe('GET /tv/:id/seasons', () => {
  const validatedApp = express();
  validatedApp.use(
    OpenApiValidator.middleware({
      apiSpec: path.join(process.cwd(), 'seerr-api.yml'),
      validateRequests: true,
      validateSecurity: false,
    })
  );
  validatedApp.use('/api/v1/tv', tvRoutes);

  it('recovers seasons rejected by concurrent provider lookups', async () => {
    const settings = getSettings();
    const priorProvider = settings.metadataSettings.tv;
    settings.metadataSettings.tv = MetadataProviderType.TMDB;
    const mockGet = mock.method as (
      object: object,
      key: string,
      callback: (url: string) => Promise<unknown>
    ) => unknown;
    let showLookups = 0;
    let activeSeasons = 0;
    let maxActiveSeasons = 0;
    const seasonAttempts = new Map<number, number>();
    mockGet.call(mock, ExternalAPI.prototype, 'get', async (url) => {
      if (url === '/tv/1413') {
        showLookups++;
        return {
          id: 1413,
          videos: { results: [{ type: 'Trailer', key: 'test' }] },
        };
      }
      const number = Number(url.split('/').at(-1));
      seasonAttempts.set(number, (seasonAttempts.get(number) ?? 0) + 1);
      activeSeasons++;
      maxActiveSeasons = Math.max(maxActiveSeasons, activeSeasons);
      const concurrent = activeSeasons > 1;
      await new Promise<void>((resolve) => setImmediate(resolve));
      activeSeasons--;
      if (concurrent) {
        throw new Error('Provider throttled concurrent season lookups');
      }
      return {
        id: 100 + number,
        season_number: number,
        episodes: [
          { id: 500 + number, episode_number: 1, season_number: number },
        ],
      };
    });
    try {
      const response = await request(validatedApp)
        .get('/api/v1/tv/1413/seasons')
        .query({
          seasonNumbers: `${Array.from({ length: 15 }, (_, index) => index).join(',')},14`,
        });
      assert.strictEqual(response.status, 200, JSON.stringify(response.body));
      assert.deepStrictEqual(
        response.body.map(
          (season: { seasonNumber: number }) => season.seasonNumber
        ),
        Array.from({ length: 15 }, (_, index) => index)
      );
      assert.strictEqual(showLookups, 1);
      assert.strictEqual(maxActiveSeasons, 3);
      assert.strictEqual(seasonAttempts.size, 15);
      assert([...seasonAttempts.values()].every((attempts) => attempts <= 2));
      assert([...seasonAttempts.values()].some((attempts) => attempts === 2));

      const invalid = await request(validatedApp)
        .get('/api/v1/tv/1413/seasons')
        .query({ seasonNumbers: '1,10001' });
      assert.strictEqual(invalid.status, 400);
      assert.strictEqual(showLookups, 1);
    } finally {
      settings.metadataSettings.tv = priorProvider;
    }
  });

  it('loads seasons when the series lookup used for provider classification is unavailable', async () => {
    const settings = getSettings();
    const priorProvider = settings.metadataSettings.tv;
    settings.metadataSettings.tv = MetadataProviderType.TMDB;
    const mockGet = mock.method as (
      object: object,
      key: string,
      callback: (url: string) => Promise<unknown>
    ) => unknown;
    mockGet.call(mock, ExternalAPI.prototype, 'get', async (url) => {
      if (url === '/tv/1413') {
        throw new Error('Temporary series metadata failure');
      }
      if (url === '/tv/1413/season/2') {
        return {
          id: 102,
          season_number: 2,
          episodes: [
            {
              id: 502,
              episode_number: 1,
              season_number: 2,
              name: 'Recovered episode',
            },
          ],
        };
      }
      throw new Error(`Unexpected TMDB request: ${url}`);
    });

    try {
      const response = await request(validatedApp)
        .get('/api/v1/tv/1413/seasons')
        .query({ seasonNumbers: '2' });
      assert.strictEqual(response.status, 200, JSON.stringify(response.body));
      assert.strictEqual(response.body[0].seasonNumber, 2);
      assert.strictEqual(
        response.body[0].episodes[0].name,
        'Recovered episode'
      );
    } finally {
      settings.metadataSettings.tv = priorProvider;
    }
  });

  it('fails closed for a TV maturity-limited user when series metadata is unavailable', async () => {
    const settings = getSettings();
    const priorProvider = settings.metadataSettings.tv;
    settings.metadataSettings.tv = MetadataProviderType.TMDB;
    const user = await getRepository(User).save(
      new User({
        email: 'tv-maturity-fallback@example.test',
        avatar: 'avatar',
      })
    );
    await getRepository(UserSettings).save(
      new UserSettings({ user, tvMaturityRatingLimit: 'TV-14' })
    );
    const restrictedApp = express();
    restrictedApp.use((req, _res, next) => {
      req.user = user;
      next();
    });
    restrictedApp.use('/api/v1/tv', tvRoutes);

    const requests: string[] = [];
    const mockGet = mock.method as (
      object: object,
      key: string,
      callback: (url: string) => Promise<unknown>
    ) => unknown;
    mockGet.call(mock, ExternalAPI.prototype, 'get', async (url) => {
      requests.push(url);
      throw new Error('Temporary series metadata failure');
    });

    try {
      const response = await request(restrictedApp)
        .get('/api/v1/tv/1413/seasons')
        .query({ seasonNumbers: '2' });
      assert.strictEqual(response.status, 500);
      assert.deepStrictEqual(requests, ['/tv/1413']);
    } finally {
      settings.metadataSettings.tv = priorProvider;
    }
  });

  it('returns valid season metadata when the provider reports no episodes', async () => {
    const settings = getSettings();
    const priorProvider = settings.metadataSettings.tv;
    settings.metadataSettings.tv = MetadataProviderType.TMDB;
    const mockGet = mock.method as (
      object: object,
      key: string,
      callback: (url: string) => Promise<unknown>
    ) => unknown;
    mockGet.call(mock, ExternalAPI.prototype, 'get', async (url) => {
      if (url === '/tv/1413')
        return {
          id: 1413,
          videos: { results: [] },
        };
      if (url === '/tv/1413/season/14')
        return {
          id: 114,
          season_number: 14,
          episodes: [],
        };
      throw new Error(`Unexpected TMDB request: ${url}`);
    });
    try {
      const response = await request(validatedApp)
        .get('/api/v1/tv/1413/seasons')
        .query({ seasonNumbers: '14' });
      assert.strictEqual(response.status, 200, JSON.stringify(response.body));
      assert.strictEqual(response.body.length, 1);
      assert.strictEqual(response.body[0].seasonNumber, 14);
      assert.deepStrictEqual(response.body[0].episodes, []);
    } finally {
      settings.metadataSettings.tv = priorProvider;
    }
  });

  it('falls back to TMDB when the configured provider cannot load a season', async () => {
    const settings = getSettings();
    const priorProvider = settings.metadataSettings.tv;
    settings.metadataSettings.tv = MetadataProviderType.TVDB;
    mock.method(
      Tvdb,
      'getInstance',
      async () =>
        ({
          getTvSeason: async () => {
            throw new Error('Configured provider unavailable');
          },
        }) as unknown as Tvdb
    );
    const mockGet = mock.method as (
      object: object,
      key: string,
      callback: (url: string) => Promise<unknown>
    ) => unknown;
    mockGet.call(mock, ExternalAPI.prototype, 'get', async (url) => {
      if (url === '/tv/1413') {
        return {
          id: 1413,
          keywords: { results: [] },
          videos: { results: [] },
        };
      }
      if (url === '/tv/1413/season/2') {
        return {
          id: 102,
          season_number: 2,
          episodes: [
            {
              id: 502,
              episode_number: 1,
              season_number: 2,
              name: 'Fallback episode',
            },
          ],
        };
      }
      throw new Error(`Unexpected TMDB request: ${url}`);
    });

    try {
      const response = await request(validatedApp)
        .get('/api/v1/tv/1413/seasons')
        .query({ seasonNumbers: '2' });
      assert.strictEqual(response.status, 200, JSON.stringify(response.body));
      assert.deepStrictEqual(
        response.body.map(
          (season: { seasonNumber: number }) => season.seasonNumber
        ),
        [2]
      );
      assert.strictEqual(response.body[0].episodes[0].name, 'Fallback episode');
    } finally {
      settings.metadataSettings.tv = priorProvider;
    }
  });
});
