import express, { type Express } from 'express';
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import request from 'supertest';

import AurralAPI from '@server/api/aurral';
import {
  Permission,
  type PermissionCheckOptions,
} from '@server/lib/permissions';
import { getSettings } from '@server/lib/settings';
import { setupTestDb } from '@server/test/db';
import { REDACTED_SECRET } from '@server/utils/security';
import aurralRoutes from './aurral';

setupTestDb();

function createApp(permissions = Permission.ADMIN): Express {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = {
      id: 1,
      hasPermission: (
        required: Permission | Permission[],
        options: PermissionCheckOptions = { type: 'and' }
      ) => {
        const list = Array.isArray(required) ? required : [required];
        return options.type === 'or'
          ? list.some((perm) => Boolean(permissions & perm))
          : list.every((perm) => Boolean(permissions & perm));
      },
    } as Express.Request['user'];
    next();
  });
  app.use('/settings/aurral', aurralRoutes);
  app.use(
    (
      err: { status?: number; message?: string },
      _req: express.Request,
      res: express.Response,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      _next: express.NextFunction
    ) => {
      res.status(err.status ?? 500).json({ message: err.message });
    }
  );
  return app;
}

describe('Aurral settings routes', () => {
  beforeEach(() => {
    getSettings().aurral = [];
    getSettings().lidarr = [];
  });

  afterEach(() => {
    getSettings().aurral = [];
    getSettings().lidarr = [];
    mock.restoreAll();
  });

  it('creates, masks secrets, shares ID space and exclusivity with Lidarr, updates, and deletes', async () => {
    getSettings().lidarr = [
      {
        id: 5,
        name: 'Existing Lidarr',
        hostname: 'lidarr.local',
        port: 8686,
        apiKey: 'lidarr-key',
        baseUrl: '',
        useSsl: false,
        activeProfileId: 1,
        activeProfileName: 'Lossless',
        activeMetadataProfileId: 1,
        activeDirectory: '/music',
        is4k: false,
        isDefault: true,
        syncEnabled: true,
        preventSearch: false,
        tagRequests: false,
        overrideRule: [],
        externalUrl: '',
        tags: [],
      },
    ];

    const app = createApp();
    const createRes = await request(app)
      .post('/settings/aurral')
      .send({
        name: 'Primary Aurral',
        hostname: 'aurral.local',
        port: 3001,
        useSsl: false,
        apiKey: 'aurral-user-key',
        isDefault: true,
        syncEnabled: true,
      })
      .expect(201);

    assert.notStrictEqual(createRes.body.id, 5);
    assert.strictEqual(createRes.body.apiKey, REDACTED_SECRET);
    assert.strictEqual(createRes.body.isDefault, true);
    assert.strictEqual(getSettings().lidarr[0].isDefault, false);
    assert.strictEqual(getSettings().aurral[0].apiKey, 'aurral-user-key');

    const listRes = await request(app).get('/settings/aurral').expect(200);
    assert.strictEqual(listRes.body.length, 1);
    assert.strictEqual(listRes.body[0].apiKey, REDACTED_SECRET);

    const updateRes = await request(app)
      .put(`/settings/aurral/${createRes.body.id}`)
      .send({
        name: 'Renamed Aurral',
        hostname: 'aurral.local',
        port: 3001,
        useSsl: true,
        apiKey: REDACTED_SECRET,
        isDefault: true,
        syncEnabled: false,
      })
      .expect(200);

    assert.strictEqual(updateRes.body.name, 'Renamed Aurral');
    assert.strictEqual(updateRes.body.apiKey, REDACTED_SECRET);
    assert.strictEqual(getSettings().aurral[0].apiKey, 'aurral-user-key');
    assert.strictEqual(getSettings().aurral[0].syncEnabled, false);

    await request(app)
      .delete(`/settings/aurral/${createRes.body.id}`)
      .expect(200);
    assert.strictEqual(getSettings().aurral.length, 0);
  });

  it('validates user identity on POST /settings/aurral/test', async () => {
    const app = createApp();

    const testSpy = mock.method(
      AurralAPI.prototype,
      'testConnection',
      async () => ({
        appVersion: '1.12.0',
        user: { username: 'musicfan', role: 'user' },
      })
    );

    const okRes = await request(app)
      .post('/settings/aurral/test')
      .send({
        hostname: 'aurral.local',
        port: 3001,
        useSsl: false,
        apiKey: 'user-api-key',
      })
      .expect(200);

    assert.strictEqual(testSpy.mock.callCount(), 1);
    assert.strictEqual(okRes.body.appVersion, '1.12.0');
    assert.strictEqual(okRes.body.user.username, 'musicfan');

    testSpy.mock.mockImplementationOnce(async () => ({
      appVersion: '1.12.0',
      user: null,
    }));

    await request(app)
      .post('/settings/aurral/test')
      .send({
        hostname: 'aurral.local',
        port: 3001,
        useSsl: false,
        apiKey: 'admin-api-key',
      })
      .expect(403);
  });
});
