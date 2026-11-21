import assert from 'node:assert/strict';
import path from 'node:path';
import { afterEach, before, describe, it, mock } from 'node:test';

import RadarrAPI from '@server/api/servarr/radarr';
import { getSettings } from '@server/lib/settings';
import { setupTestDb } from '@server/test/db';
import type { Express } from 'express';
import express from 'express';
import * as OpenApiValidator from 'express-openapi-validator';
import request from 'supertest';
import movieRoutes from './movie';

let app: Express;

// Library listings link posters to /movie/:id/cover with the Radarr server and movie IDs.
// The real app validates every request against seerr-api.yml first, so test through it.
function createOpenApiValidatedApp(): Express {
  const testApp = express();
  testApp.use(express.json());
  testApp.use(
    OpenApiValidator.middleware({
      apiSpec: path.join(process.cwd(), 'seerr-api.yml'),
      validateRequests: true,
      validateSecurity: false,
    })
  );
  testApp.use('/api/v1/movie', movieRoutes);
  testApp.use(
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
  return testApp;
}

before(() => {
  app = createOpenApiValidatedApp();
});

afterEach(() => {
  mock.restoreAll();
});

setupTestDb();

describe('Movie cover route behind the OpenAPI validator', () => {
  for (const is4k of [true, false]) {
    it(`serves a library listing cover by Radarr server and movie ID (is4k: ${is4k})`, async () => {
      const settings = getSettings();
      const priorRadarr = settings.radarr;
      settings.radarr = [
        {
          id: 0,
          name: is4k ? 'Radarr-4K' : 'Radarr',
          hostname: 'radarr.test',
          port: 7878,
          apiKey: 'radarr-key',
          useSsl: false,
          baseUrl: '',
          activeProfileId: 1,
          activeProfileName: 'Any',
          activeDirectory: '/movies',
          tags: [],
          is4k,
          isDefault: true,
          externalUrl: '',
          syncEnabled: true,
          preventSearch: false,
          tagRequests: false,
          overrideRule: [],
          minimumAvailability: 'released',
        },
      ];
      const getMovieCoverMock = mock.method(
        RadarrAPI.prototype,
        'getMovieCover',
        async () => ({
          imageBuffer: Buffer.from('library-cover'),
          contentType: 'image/jpeg',
        })
      );

      try {
        const res = await request(app).get(
          `/api/v1/movie/19913/cover?serviceId=0&externalServiceId=584&is4k=${is4k}`
        );

        assert.strictEqual(res.status, 200, JSON.stringify(res.body));
        assert.strictEqual(res.headers['content-type'], 'image/jpeg');
        assert.deepStrictEqual(res.body, Buffer.from('library-cover'));
        assert.strictEqual(getMovieCoverMock.mock.calls[0].arguments[0], 584);
      } finally {
        settings.radarr = priorRadarr;
      }
    });
  }

  it('still rejects a server ID that is not a whole number', async () => {
    const res = await request(app).get(
      '/api/v1/movie/19913/cover?serviceId=abc&externalServiceId=584&is4k=false'
    );
    assert.strictEqual(res.status, 400);
  });
});
