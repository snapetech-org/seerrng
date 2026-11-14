import assert from 'node:assert/strict';
import { afterEach, before, describe, it, mock } from 'node:test';

import path from 'node:path';

import ExternalAPI from '@server/api/externalapi';
import SonarrAPI from '@server/api/servarr/sonarr';
import { MediaType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
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

  it('returns successful seasons through the OpenAPI route after a provider failure', async () => {
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
    mockGet.call(mock, ExternalAPI.prototype, 'get', async (url) => {
      if (url === '/tv/1413') {
        showLookups++;
        return {
          id: 1413,
          videos: { results: [{ type: 'Trailer', key: 'test' }] },
        };
      }
      const number = Number(url.split('/').at(-1));
      activeSeasons++;
      maxActiveSeasons = Math.max(maxActiveSeasons, activeSeasons);
      await new Promise<void>((resolve) => setImmediate(resolve));
      activeSeasons--;
      if (number === 2) throw new Error('Season fixture unavailable');
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
        .query({ seasonNumbers: '0,1,2,3,4,4' });
      assert.strictEqual(response.status, 200, JSON.stringify(response.body));
      assert.deepStrictEqual(
        response.body.map(
          (season: { seasonNumber: number }) => season.seasonNumber
        ),
        [0, 1, 3, 4]
      );
      assert.strictEqual(showLookups, 1);
      assert.strictEqual(maxActiveSeasons, 3);

      const invalid = await request(validatedApp)
        .get('/api/v1/tv/1413/seasons')
        .query({ seasonNumbers: '1,10001' });
      assert.strictEqual(invalid.status, 400);
      assert.strictEqual(showLookups, 1);
    } finally {
      settings.metadataSettings.tv = priorProvider;
    }
  });
});
