import assert from 'node:assert/strict';
import path from 'node:path';
import { before, describe, it } from 'node:test';

import { User } from '@server/entity/User';
import { initI18n } from '@server/i18n';
import { Permission } from '@server/lib/permissions';
import adultRoutes from '@server/routes/adult';
import serviceRoutes from '@server/routes/service';
import { setupTestDb } from '@server/test/db';
import type { Express } from 'express';
import express from 'express';
import * as OpenApiValidator from 'express-openapi-validator';
import request from 'supertest';

import settingsRoutes from '@server/routes/settings';

const createOpenApiValidatedApp = (): Express => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = new User({ id: 1, permissions: Permission.ADMIN });
    next();
  });
  app.use(
    OpenApiValidator.middleware({
      apiSpec: path.join(process.cwd(), 'seerr-api.yml'),
      validateRequests: true,
      validateSecurity: false,
    })
  );
  app.use('/api/v1/settings', settingsRoutes);
  app.use('/api/v1/adult', adultRoutes);
  app.use('/api/v1/service', serviceRoutes);
  app.use(
    (
      error: { status?: number; message?: string; errors?: unknown[] },
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction
    ) => {
      void _next;
      return res.status(error.status ?? 500).json({
        status: error.status ?? 500,
        message: error.message,
        errors: error.errors,
      });
    }
  );
  return app;
};

setupTestDb();

before(() => {
  initI18n();
});

describe('external media-service settings behind the OpenAPI validator', () => {
  it('serves Apprise settings and test routes through the OpenAPI validator', async () => {
    const app = createOpenApiValidatedApp();
    await request(app)
      .get('/api/v1/settings/notifications/apprise')
      .expect(200);

    const invalidKeySettings = {
      enabled: true,
      embedPoster: false,
      types: 0,
      options: {
        url: 'https://apprise.example.test',
        configKey: 'bad/key',
        locale: 'en',
      },
    };

    for (const path of [
      '/api/v1/settings/notifications/apprise',
      '/api/v1/settings/notifications/apprise/test',
    ]) {
      const response = await request(app).post(path).send(invalidKeySettings);
      assert.equal(response.status, 400, path);
      assert.match(response.body.message, /configuration key/i, path);
    }
  });

  it('lets Whisparr, Navidrome, and Jellystat settings reads reach their handlers', async () => {
    const app = createOpenApiValidatedApp();

    const whisparr = await request(app)
      .get('/api/v1/settings/whisparr')
      .expect(200);
    const navidrome = await request(app)
      .get('/api/v1/settings/navidrome')
      .expect(200);
    const jellystat = await request(app)
      .get('/api/v1/settings/jellystat')
      .expect(200);

    assert.deepEqual(whisparr.body, []);
    assert.ok(navidrome.body === null || typeof navidrome.body === 'object');
    assert.ok(jellystat.body === null || typeof jellystat.body === 'object');
  });

  it('accepts a Sportarr connection without an optional external URL', async () => {
    const app = createOpenApiValidatedApp();

    const response = await request(app).post('/api/v1/settings/sportarr').send({
      name: 'Sportarr',
      hostname: 'sportarr.example.test',
      port: 1867,
      apiKey: 'test-api-key',
      useSsl: false,
      baseUrl: '',
      activeProfileId: 12,
      activeProfileName: 'HD',
      isDefault: true,
    });

    assert.equal(response.status, 201, JSON.stringify(response.body));
    assert.equal(response.body.name, 'Sportarr');
    assert.equal(response.body.externalUrl, undefined);
    assert.equal(response.body.backend, undefined);
    assert.equal(response.body.serviceType, undefined);
  });

  it('recognizes the connection-test and Whisparr profile routes', async () => {
    const app = createOpenApiValidatedApp();

    for (const service of ['whisparr', 'navidrome', 'jellystat']) {
      const response = await request(app)
        .post(`/api/v1/settings/${service}/test`)
        .send({});
      assert.equal(response.status, 400, `${service} test route`);
      assert.notEqual(response.body.message, 'not found');
    }

    const profiles = await request(app).get(
      '/api/v1/settings/whisparr/999/profiles'
    );
    assert.equal(profiles.status, 404);
    assert.equal(profiles.body.message, 'Settings instance not found');
  });

  it('serves the Kavita reader settings behind the OpenAPI validator', async () => {
    const app = createOpenApiValidatedApp();

    const empty = await request(app).get('/api/v1/settings/kavita').expect(200);
    assert.equal(empty.body, null);

    const invalid = await request(app)
      .post('/api/v1/settings/kavita/test')
      .send({});
    assert.equal(invalid.status, 400);
    assert.notEqual(invalid.body.message, 'not found');

    const badUrl = await request(app).put('/api/v1/settings/kavita').send({
      hostname: '127.0.0.1',
      port: 5000,
      apiKey: 'kavita-auth-key',
      useSsl: false,
      externalUrl: 'not a url',
    });
    assert.equal(badUrl.status, 400);

    const saved = await request(app)
      .put('/api/v1/settings/kavita')
      .send({
        hostname: '127.0.0.1',
        port: 5000,
        apiKey: 'kavita-auth-key',
        useSsl: false,
        baseUrl: '',
        externalUrl: 'https://manga.example.test/',
      })
      .expect(200);
    assert.equal(saved.body.externalUrl, 'https://manga.example.test');
    assert.notEqual(saved.body.apiKey, 'kavita-auth-key');

    // a redacted key keeps the saved one
    const again = await request(app)
      .put('/api/v1/settings/kavita')
      .send({ ...saved.body, port: 5001 })
      .expect(200);
    assert.equal(again.body.port, 5001);
    const { getSettings } = await import('@server/lib/settings');
    assert.equal(getSettings().kavita?.apiKey, 'kavita-auth-key');

    const read = await request(app).get('/api/v1/settings/kavita').expect(200);
    assert.equal(read.body.hostname, '127.0.0.1');
    assert.notEqual(read.body.apiKey, 'kavita-auth-key');

    await request(app).delete('/api/v1/settings/kavita').expect(204);
    assert.equal(getSettings().kavita, null);
  });

  it('lets Whisparr discovery and service routes reach their handlers', async () => {
    const app = createOpenApiValidatedApp();

    const services = await request(app)
      .get('/api/v1/service/whisparr')
      .expect(200);
    assert.deepEqual(services.body, []);

    const search = await request(app).get('/api/v1/adult/search?serverId=999');
    assert.equal(search.status, 404, JSON.stringify(search.body));
    assert.equal(search.body.message, 'Whisparr server was not found.');

    const details = await request(app).get('/api/v1/adult/not-a-stash-scene');
    assert.equal(details.status, 404);
    assert.equal(details.body.message, 'Adult scene not found.');

    const cover = await request(app).get(
      '/api/v1/adult/not-a-stash-scene/cover'
    );
    assert.equal(cover.status, 404);
    assert.equal(cover.text, 'Adult scene cover not found.');
  });
});
