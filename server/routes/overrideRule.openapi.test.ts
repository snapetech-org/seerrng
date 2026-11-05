import { getRepository } from '@server/datasource';
import OverrideRule from '@server/entity/OverrideRule';
import { User } from '@server/entity/User';
import { getSettings, type SonarrSettings } from '@server/lib/settings';
import { setupTestDb } from '@server/test/db';
import express from 'express';
import * as OpenApiValidator from 'express-openapi-validator';
import assert from 'node:assert/strict';
import path from 'node:path';
import { it } from 'node:test';
import request from 'supertest';
import overrideRuleRoutes from './overrideRule';

setupTestDb();

it('accepts and returns country and language-profile rules through the real OpenAPI validator', async () => {
  getSettings().sonarr = [
    {
      id: 0,
      name: 'Fixture Sonarr',
      hostname: '127.0.0.1',
      port: 8989,
      apiKey: 'fixture',
      useSsl: false,
      isDefault: true,
      is4k: false,
      activeProfileId: 0,
      activeDirectory: '/tv',
    } as SonarrSettings,
  ];
  const app = express();
  app.use(express.json());
  // Synthetic owner session: the production route still enforces ADMIN.
  app.use(async (req, _res, next) => {
    req.user = await getRepository(User).findOneByOrFail({ id: 1 });
    next();
  });
  app.use(
    OpenApiValidator.middleware({
      apiSpec: path.resolve('seerr-api.yml'),
      validateSecurity: false,
      validateRequests: true,
      validateResponses: true,
    })
  );
  app.use('/api/v1/overrideRule', overrideRuleRoutes);
  app.use(
    (
      error: { status?: number; message?: string },
      _req: express.Request,
      res: express.Response,
      next: express.NextFunction
    ) => {
      void next;
      return res.status(error.status ?? 500).json({ message: error.message });
    }
  );
  const created = await request(app).post('/api/v1/overrideRule').send({
    sonarrServiceId: 0,
    productionCountries: 'CA|US',
    languageProfileId: 0,
  });
  assert.equal(created.status, 200, created.body.message);
  assert.equal(created.body.productionCountries, 'CA|US');
  assert.equal(created.body.languageProfileId, 0);
  const listed = await request(app).get('/api/v1/overrideRule');
  assert.equal(listed.status, 200, listed.body.message);
  assert.equal(
    listed.body.find((rule: { id: number }) => rule.id === created.body.id)
      ?.languageProfileId,
    0
  );
  const updated = await request(app)
    .put(`/api/v1/overrideRule/${created.body.id}`)
    .send({ productionCountries: 'US' });
  assert.equal(updated.status, 200, updated.body.message);
  assert.equal(
    (await getRepository(OverrideRule).findOneByOrFail({ id: created.body.id }))
      .productionCountries,
    'US'
  );
  assert.equal(
    (
      await request(app).post('/api/v1/overrideRule').send({
        sonarrServiceId: 0,
        productionCountries: 'USA',
        languageProfileId: 0,
      })
    ).status,
    400
  );
});
