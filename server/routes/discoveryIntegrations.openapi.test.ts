import express from 'express';
import * as OpenApiValidator from 'express-openapi-validator';
import assert from 'node:assert/strict';
import path from 'node:path';
import { describe, it } from 'node:test';
import request from 'supertest';
function createApp() {
  const app = express();
  app.use(express.json());
  app.use(
    OpenApiValidator.middleware({
      apiSpec: path.join(process.cwd(), 'seerr-api.yml'),
      validateRequests: true,
      validateSecurity: false,
    })
  );
  app.use('/api/v1/integrations/discovery', (_req, res) =>
    res.json({ validated: true })
  );
  app.use(
    (
      error: { status?: number },
      _req: express.Request,
      res: express.Response,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      _next: express.NextFunction
    ) => res.status(error.status ?? 500).json({ failed: true })
  );
  return app;
}
describe('discovery integration OpenAPI contracts', () => {
  it('allows each implemented endpoint through validation', async () => {
    const app = createApp();
    assert.equal(
      (await request(app).get('/api/v1/integrations/discovery/configuration'))
        .status,
      200
    );
    assert.equal(
      (await request(app).get('/api/v1/integrations/discovery/accounts'))
        .status,
      200
    );
    assert.equal(
      (
        await request(app)
          .put('/api/v1/integrations/discovery/configuration')
          .send({ trakt: { clientId: 'id' } })
      ).status,
      200
    );
    assert.equal(
      (
        await request(app)
          .post('/api/v1/integrations/discovery/accounts/trakt/connect')
          .send({})
      ).status,
      200
    );
    assert.equal(
      (
        await request(app)
          .post('/api/v1/integrations/discovery/accounts/trakt/complete')
          .send({})
      ).status,
      200
    );
    assert.equal(
      (
        await request(app)
          .post('/api/v1/integrations/discovery/accounts/anilist/complete')
          .send({ code: 'pin' })
      ).status,
      200
    );
    assert.equal(
      (
        await request(app)
          .put('/api/v1/integrations/discovery/accounts/simkl/preferences')
          .send({ allowWrites: true })
      ).status,
      200
    );
    assert.equal(
      (
        await request(app).delete(
          '/api/v1/integrations/discovery/accounts/simkl'
        )
      ).status,
      200
    );
    assert.equal(
      (
        await request(app).get(
          '/api/v1/integrations/discovery/library/trakt?shelf=watched&page=2&mediaType=tv'
        )
      ).status,
      200
    );
    assert.equal(
      (
        await request(app)
          .post('/api/v1/integrations/discovery/library/anilist/repair')
          .send({
            shelf: 'all',
            startPage: 1,
            pageCount: 5,
            mediaType: 'tv',
          })
      ).status,
      200
    );
    assert.equal(
      (
        await request(app).get(
          '/api/v1/integrations/discovery/tracking/trakt/episodes?sourceId=123&tmdbId=456&season=1'
        )
      ).status,
      200
    );
    assert.equal(
      (
        await request(app).get(
          '/api/v1/integrations/discovery/library/plex?shelf=unwatched&page=2&libraryId=7'
        )
      ).status,
      200
    );
    assert.equal(
      (
        await request(app).get(
          '/api/v1/integrations/discovery/library/plex?shelf=unwatched&page=2&libraryId=3'
        )
      ).status,
      200
    );
    assert.equal(
      (
        await request(app).get(
          '/api/v1/integrations/discovery/library/jellyfin?shelf=watched&libraryId=movies-id'
        )
      ).status,
      200
    );
    assert.equal(
      (
        await request(app).get(
          '/api/v1/integrations/discovery/library/jellyfin?shelf=in-progress&page=2&cursor=40&libraryId=movies-id'
        )
      ).status,
      200
    );
    assert.equal(
      (
        await request(app).put('/api/v1/integrations/discovery/mappings').send({
          identity: 'trakt:movie:123',
          tmdbId: 456,
          mediaType: 'movie',
        })
      ).status,
      200
    );
    assert.equal(
      (
        await request(app).delete(
          '/api/v1/integrations/discovery/mappings/trakt:movie:123'
        )
      ).status,
      200
    );
    assert.equal(
      (await request(app).get('/api/v1/integrations/discovery/mappings/pack'))
        .status,
      200
    );
    assert.equal(
      (
        await request(app)
          .post('/api/v1/integrations/discovery/mappings/pack')
          .type('text')
          .send('{"format":"seerrng.personal-title-matches","version":1}')
      ).status,
      200
    );
    assert.equal(
      (await request(app).get('/api/v1/integrations/discovery/mappings/packs'))
        .status,
      200
    );
    assert.equal(
      (
        await request(app).get(
          '/api/v1/integrations/discovery/mappings/packs/anime-core'
        )
      ).status,
      200
    );
    assert.equal(
      (
        await request(app)
          .post('/api/v1/integrations/discovery/mappings/packs')
          .type('text')
          .send(
            JSON.stringify({
              format: 'seerrng.curated-title-matches',
              version: 1,
              packId: 'anime-core',
              name: 'Anime core',
              exportedAt: new Date().toISOString(),
              entries: [
                { identity: 'anilist:123', tmdbId: 456, mediaType: 'tv' },
              ],
            })
          )
      ).status,
      200
    );
    assert.equal(
      (
        await request(app).delete(
          '/api/v1/integrations/discovery/mappings/packs/anime-core'
        )
      ).status,
      200
    );
    assert.equal(
      (
        await request(app)
          .post('/api/v1/integrations/discovery/tracking/trakt')
          .send({
            requestId: '00000000-0000-4000-8000-000000000001',
            action: 'watched',
            value: true,
            mediaType: 'movie',
            tmdbId: 55,
          })
      ).status,
      200
    );
    assert.equal(
      (
        await request(app).get(
          '/api/v1/integrations/discovery/tracking/actions/00000000-0000-4000-8000-000000000001'
        )
      ).status,
      200
    );
  });
  it('rejects arbitrary credentials and unknown providers', async () => {
    const app = createApp();
    assert.equal(
      (
        await request(app)
          .put('/api/v1/integrations/discovery/configuration')
          .send({ trakt: { accessToken: 'secret' } })
      ).status,
      400
    );
    assert.equal(
      (
        await request(app).put('/api/v1/integrations/discovery/mappings').send({
          identity: 'trakt:movie:123',
          tmdbId: 456,
          mediaType: 'movie',
          userId: 1,
        })
      ).status,
      400
    );
    assert.equal(
      (
        await request(app)
          .post('/api/v1/integrations/discovery/accounts/other/connect')
          .send({})
      ).status,
      400
    );
    assert.equal(
      (
        await request(app)
          .post('/api/v1/integrations/discovery/accounts/trakt/complete')
          .send({ deviceCode: 'injected' })
      ).status,
      400
    );
    assert.equal(
      (
        await request(app).get(
          '/api/v1/integrations/discovery/library/trakt?page=not-a-page'
        )
      ).status,
      400
    );
    assert.equal(
      (
        await request(app)
          .post('/api/v1/integrations/discovery/tracking/trakt')
          .send({
            requestId: '00000000-0000-4000-8000-000000000001',
            action: 'watched',
            value: true,
            mediaType: 'movie',
            tmdbId: 55,
            accessToken: 'must-not-pass',
          })
      ).status,
      400
    );
  });
  it('rejects oversized provider-library repair batches', async () => {
    const app = createApp();
    assert.equal(
      (
        await request(app)
          .post('/api/v1/integrations/discovery/library/anilist/repair')
          .send({ shelf: 'all', startPage: 1, pageCount: 6 })
      ).status,
      400
    );
  });
});
