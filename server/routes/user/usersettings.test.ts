import * as OpenApiValidator from 'express-openapi-validator';
import assert from 'node:assert/strict';
import { before, beforeEach, describe, it, mock } from 'node:test';

import JellyfinAPI from '@server/api/jellyfin';
import { MediaRequestStatus, MediaType } from '@server/constants/media';
import { MediaServerType } from '@server/constants/server';
import { UserType } from '@server/constants/user';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import { MediaRequest } from '@server/entity/MediaRequest';
import { User } from '@server/entity/User';
import { Permission } from '@server/lib/permissions';
import { getSettings } from '@server/lib/settings';
import { checkUser, isAuthenticated } from '@server/middleware/auth';
import authRoutes from '@server/routes/auth';
import { setupTestDb } from '@server/test/db';
import type { Express } from 'express';
import express from 'express';
import rateLimit from 'express-rate-limit';
import session from 'express-session';
import path from 'node:path';
import request from 'supertest';
import userRoutes from '.';

const defaultAuthenticateResponse = {
  User: {
    Id: 'jf-link-user-001',
    Name: 'linkeduser',
    ServerId: 'server-1',
    Policy: { IsAdministrator: false },
  },
  AccessToken: 'fake-qc-access-token',
};

const authenticateQCMock = mock.method(
  JellyfinAPI.prototype,
  'authenticateQuickConnect',
  async () => ({ ...defaultAuthenticateResponse })
);

let app: Express;
const API_SPEC_PATH = path.resolve(process.cwd(), 'seerr-api.yml');

function createApp() {
  const app = express();
  app.use(express.json());
  app.use(
    session({
      secret: 'test-secret',
      resave: false,
      saveUninitialized: false,
      cookie: { secure: true },
      proxy: true,
    })
  );
  app.use(rateLimit({ windowMs: 60_000, limit: 10_000 }), checkUser);
  app.use('/auth', authRoutes);
  app.use(
    OpenApiValidator.middleware({
      apiSpec: API_SPEC_PATH,
      validateRequests: true,
    })
  );
  app.use('/user', isAuthenticated(), userRoutes);
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

setupTestDb();

function configureJellyfin() {
  const settings = getSettings();
  settings.main.mediaServerType = MediaServerType.JELLYFIN;
  settings.jellyfin.ip = 'localhost';
  settings.jellyfin.port = 8096;
  settings.jellyfin.useSsl = false;
  settings.jellyfin.urlBase = '';
}

async function loginAs(email: string, password: string) {
  const settings = getSettings();
  settings.main.localLogin = true;

  const res = await request(app)
    .post('/auth/local')
    .set('X-Forwarded-Proto', 'https')
    .send({ email, password });

  assert.strictEqual(res.status, 200);
  const setCookie = res.headers['set-cookie']?.[0];
  assert.ok(setCookie?.includes('; Secure'));
  const sessionCookie = setCookie.split(';', 1)[0];
  return { sessionCookie, userId: res.body.id as number };
}

describe('POST /user/:id/settings/linked-accounts/jellyfin/quickconnect', () => {
  beforeEach(() => {
    authenticateQCMock.mock.resetCalls();
    authenticateQCMock.mock.mockImplementation(async () => ({
      ...defaultAuthenticateResponse,
    }));
    configureJellyfin();
  });

  it('links the account when the media server is Jellyfin', async () => {
    const { sessionCookie, userId } = await loginAs(
      'demo@seerr.dev',
      'test1234'
    );

    const res = await request(app)
      .post(`/user/${userId}/settings/linked-accounts/jellyfin/quickconnect`)
      .set('X-Forwarded-Proto', 'https')
      .set('Cookie', sessionCookie)
      .send({ secret: 'abc123def456abc123def456' });

    assert.strictEqual(res.status, 204);
    assert.strictEqual(authenticateQCMock.mock.callCount(), 1);

    const user = await getRepository(User).findOneOrFail({
      where: { id: userId },
    });
    assert.strictEqual(user.jellyfinUserId, 'jf-link-user-001');
    assert.strictEqual(user.userType, UserType.JELLYFIN);
  });

  it('returns 403 when the media server is Emby', async () => {
    const { sessionCookie, userId } = await loginAs(
      'demo@seerr.dev',
      'test1234'
    );
    getSettings().main.mediaServerType = MediaServerType.EMBY;

    const res = await request(app)
      .post(`/user/${userId}/settings/linked-accounts/jellyfin/quickconnect`)
      .set('X-Forwarded-Proto', 'https')
      .set('Cookie', sessionCookie)
      .send({ secret: 'abc123def456abc123def456' });

    assert.strictEqual(res.status, 403);
    assert.strictEqual(authenticateQCMock.mock.callCount(), 0);

    const user = await getRepository(User).findOneOrFail({
      where: { id: userId },
    });
    assert.strictEqual(user.jellyfinUserId, null);
  });
});

describe('TV season watch-rule access', () => {
  it('supports a user request, manager approval, and personal enable/disable', async (t) => {
    const settings = getSettings();
    const previousGateSetting = settings.main.tvSeasonWatchGateEnabled;
    settings.main.tvSeasonWatchGateEnabled = false;
    t.after(() => {
      settings.main.tvSeasonWatchGateEnabled = previousGateSetting;
    });

    const friendSession = await loginAs('friend@seerr.dev', 'test1234');
    const friend = await getRepository(User).findOneByOrFail({
      email: 'friend@seerr.dev',
    });
    const admin = await loginAs('admin@seerr.dev', 'test1234');
    const accessRoute = `/user/${friend.id}/settings/tv-season-watch-gate`;

    const initial = await request(app)
      .get(accessRoute)
      .set('X-Forwarded-Proto', 'https')
      .set('Cookie', friendSession.sessionCookie);
    assert.equal(initial.status, 200);
    assert.deepEqual(initial.body, {
      status: 'off',
      requestedAt: null,
      globallyEnabled: false,
    });

    const requested = await request(app)
      .post(accessRoute)
      .set('X-Forwarded-Proto', 'https')
      .set('Cookie', friendSession.sessionCookie)
      .send({ action: 'request' });
    assert.equal(requested.status, 200);
    assert.equal(requested.body.status, 'pending');
    assert.ok(requested.body.requestedAt);

    const queue = await request(app)
      .get('/user/tv-season-watch-gate-requests')
      .set('X-Forwarded-Proto', 'https')
      .set('Cookie', admin.sessionCookie);
    assert.equal(queue.status, 200);
    assert.ok(queue.body.some((item: { id: number }) => item.id === friend.id));

    const reviewed = await request(app)
      .post(`${accessRoute}/review`)
      .set('X-Forwarded-Proto', 'https')
      .set('Cookie', admin.sessionCookie)
      .send({ decision: 'approve' });
    assert.equal(reviewed.status, 200);
    assert.equal(reviewed.body.status, 'approved');

    const enabled = await request(app)
      .post(accessRoute)
      .set('X-Forwarded-Proto', 'https')
      .set('Cookie', friendSession.sessionCookie)
      .send({ action: 'enable' });
    assert.equal(enabled.status, 200);
    assert.equal(enabled.body.status, 'enabled');

    const disabled = await request(app)
      .post(accessRoute)
      .set('X-Forwarded-Proto', 'https')
      .set('Cookie', friendSession.sessionCookie)
      .send({ action: 'disable' });
    assert.equal(disabled.status, 200);
    assert.equal(disabled.body.status, 'approved');

    const repeatedReview = await request(app)
      .post(`${accessRoute}/review`)
      .set('X-Forwarded-Proto', 'https')
      .set('Cookie', admin.sessionCookie)
      .send({ decision: 'approve' });
    assert.equal(repeatedReview.status, 409);
  });
});

describe('administrator-managed Episode Queue defaults', () => {
  it('lets a user manager set their own default without requesting approval', async () => {
    const { sessionCookie, userId } = await loginAs(
      'admin@seerr.dev',
      'test1234'
    );
    const accessRoute = `/user/${userId}/settings/episode-queue`;

    const response = await request(app)
      .post(accessRoute)
      .set('X-Forwarded-Proto', 'https')
      .set('Cookie', sessionCookie)
      .send({ defaultEpisodeCount: 3 });

    assert.equal(response.status, 200);
    assert.deepEqual(response.body, {
      status: 'approved',
      defaultEpisodeCount: 3,
    });

    const persistedAccess = await request(app)
      .get(accessRoute)
      .set('X-Forwarded-Proto', 'https')
      .set('Cookie', sessionCookie);
    assert.deepEqual(persistedAccess.body, {
      status: 'approved',
      defaultEpisodeCount: 3,
    });

    const manager = await getRepository(User).findOneByOrFail({ id: userId });
    assert.equal(manager.episodeQueueAccessRequestedAt, null);
  });

  it('lets only user managers set one default across all of a user’s root TV requests', async () => {
    const friendSession = await loginAs('friend@seerr.dev', 'test1234');
    const friend = await getRepository(User).findOneByOrFail({
      email: 'friend@seerr.dev',
    });
    const media = await getRepository(Media).save(
      new Media({ mediaType: MediaType.TV, tmdbId: 987654 })
    );
    const requestRepository = getRepository(MediaRequest);
    const firstRoot = await requestRepository.save(
      new MediaRequest({
        type: MediaType.TV,
        status: MediaRequestStatus.PENDING,
        media,
        requestedBy: friend,
        watchAheadEpisodeCount: 1,
        watchAheadUsesUserDefault: false,
      })
    );
    const secondRoot = await requestRepository.save(
      new MediaRequest({
        type: MediaType.TV,
        status: MediaRequestStatus.PENDING,
        media,
        requestedBy: friend,
        watchAheadEpisodeCount: 4,
        watchAheadUsesUserDefault: false,
      })
    );
    const autoRoot = await requestRepository.save(
      new MediaRequest({
        type: MediaType.TV,
        status: MediaRequestStatus.PENDING,
        media,
        requestedBy: friend,
        isAutoRequest: true,
        watchAheadEpisodeCount: 4,
        watchAheadUsesUserDefault: false,
      })
    );
    const childRequest = await requestRepository.save(
      new MediaRequest({
        type: MediaType.TV,
        status: MediaRequestStatus.PENDING,
        media,
        requestedBy: friend,
        watchAheadEpisodeCount: 1,
        watchAheadUsesUserDefault: false,
        watchAheadParent: firstRoot,
      })
    );
    const admin = await loginAs('admin@seerr.dev', 'test1234');
    const accessRoute = `/user/${friend.id}/settings/episode-queue`;

    const initial = await request(app)
      .get(accessRoute)
      .set('X-Forwarded-Proto', 'https')
      .set('Cookie', friendSession.sessionCookie);
    assert.equal(initial.status, 200);
    assert.deepEqual(initial.body, {
      status: 'off',
      defaultEpisodeCount: 0,
    });

    const userWrite = await request(app)
      .post(accessRoute)
      .set('X-Forwarded-Proto', 'https')
      .set('Cookie', friendSession.sessionCookie)
      .send({ defaultEpisodeCount: 2 });
    assert.equal(userWrite.status, 403);

    const managerDefault = await request(app)
      .post(accessRoute)
      .set('X-Forwarded-Proto', 'https')
      .set('Cookie', admin.sessionCookie)
      .send({ defaultEpisodeCount: 3 });
    assert.equal(managerDefault.status, 200);
    assert.deepEqual(managerDefault.body, {
      status: 'approved',
      defaultEpisodeCount: 3,
    });
    for (const rootId of [firstRoot.id, secondRoot.id]) {
      const root = await requestRepository.findOneByOrFail({ id: rootId });
      assert.equal(root.watchAheadEpisodeCount, 3);
      assert.equal(root.watchAheadUsesUserDefault, true);
    }
    const autoRequest = await requestRepository.findOneByOrFail({
      id: autoRoot.id,
    });
    assert.equal(autoRequest.watchAheadEpisodeCount, 0);
    assert.equal(autoRequest.watchAheadUsesUserDefault, true);
    const child = await requestRepository.findOneByOrFail({
      id: childRequest.id,
    });
    assert.equal(child.watchAheadEpisodeCount, 1);
    assert.equal(child.watchAheadUsesUserDefault, false);

    const userViewAfterSave = await request(app)
      .get(accessRoute)
      .set('X-Forwarded-Proto', 'https')
      .set('Cookie', friendSession.sessionCookie);
    assert.deepEqual(userViewAfterSave.body, {
      status: 'approved',
      defaultEpisodeCount: 3,
    });

    const adminDisabled = await request(app)
      .post(accessRoute)
      .set('X-Forwarded-Proto', 'https')
      .set('Cookie', admin.sessionCookie)
      .send({ defaultEpisodeCount: 0 });
    assert.equal(adminDisabled.status, 200);
    assert.deepEqual(adminDisabled.body, {
      status: 'off',
      defaultEpisodeCount: 0,
    });
    for (const rootId of [firstRoot.id, secondRoot.id]) {
      const root = await requestRepository.findOneByOrFail({ id: rootId });
      assert.equal(root.watchAheadEpisodeCount, 0);
      assert.equal(root.watchAheadUsesUserDefault, true);
    }
    const autoRequestAfterDisable = await requestRepository.findOneByOrFail({
      id: autoRoot.id,
    });
    assert.equal(autoRequestAfterDisable.watchAheadEpisodeCount, 0);
    assert.equal(autoRequestAfterDisable.watchAheadUsesUserDefault, true);
    assert.equal(
      (await requestRepository.findOneByOrFail({ id: childRequest.id }))
        .watchAheadEpisodeCount,
      1
    );

    const oldQueueRoute = await request(app)
      .get('/user/episode-queue-requests')
      .set('X-Forwarded-Proto', 'https')
      .set('Cookie', admin.sessionCookie);
    assert.equal(oldQueueRoute.status, 404);
    const oldReviewRoute = await request(app)
      .post(`${accessRoute}/review`)
      .set('X-Forwarded-Proto', 'https')
      .set('Cookie', admin.sessionCookie)
      .send({ decision: 'approve' });
    assert.equal(oldReviewRoute.status, 404);
  });

  it('lets request managers read another user’s assigned default without changing it', async () => {
    const friend = await getRepository(User).findOneByOrFail({
      email: 'friend@seerr.dev',
    });
    const admin = await loginAs('admin@seerr.dev', 'test1234');
    const accessRoute = `/user/${friend.id}/settings/episode-queue`;
    const enabled = await request(app)
      .post(accessRoute)
      .set('X-Forwarded-Proto', 'https')
      .set('Cookie', admin.sessionCookie)
      .send({ defaultEpisodeCount: 2 });
    assert.equal(enabled.status, 200);

    const requestManagerUser = await getRepository(User).findOneByOrFail({
      email: 'demo@seerr.dev',
    });
    const originalPermissions = requestManagerUser.permissions;
    requestManagerUser.permissions = Permission.MANAGE_REQUESTS;
    await getRepository(User).save(requestManagerUser);

    try {
      const requestManager = await loginAs('demo@seerr.dev', 'test1234');
      const read = await request(app)
        .get(accessRoute)
        .set('X-Forwarded-Proto', 'https')
        .set('Cookie', requestManager.sessionCookie);
      assert.equal(read.status, 200);
      assert.deepEqual(read.body, {
        status: 'approved',
        defaultEpisodeCount: 2,
      });

      const write = await request(app)
        .post(accessRoute)
        .set('X-Forwarded-Proto', 'https')
        .set('Cookie', requestManager.sessionCookie)
        .send({ defaultEpisodeCount: 5 });
      assert.equal(write.status, 403);
    } finally {
      requestManagerUser.permissions = originalPermissions;
      await getRepository(User).save(requestManagerUser);
    }
  });
});

describe('user request destination permissions', () => {
  it('saves and returns grants for configured service instances', async (t) => {
    const settings = getSettings();
    const previousRadarr = settings.radarr;
    settings.radarr = [
      {
        id: 42,
        name: 'Anime Radarr',
        hostname: 'localhost',
        port: 7878,
        apiKey: 'test-key',
        useSsl: false,
        baseUrl: '',
        activeProfileId: 1,
        activeProfileName: 'HD',
        activeDirectory: '/movies/anime',
        minimumAvailability: 'released',
        is4k: false,
        isDefault: false,
        syncEnabled: true,
        preventSearch: false,
        externalUrl: '',
        tagRequests: false,
        tags: [],
        overrideRule: [],
        requestButtonLabel: 'Anime',
      },
    ];
    t.after(() => {
      settings.radarr = previousRadarr;
    });

    const admin = await loginAs('admin@seerr.dev', 'test1234');
    const friend = await getRepository(User).findOneByOrFail({
      email: 'friend@seerr.dev',
    });
    const response = await request(app)
      .post(`/user/${friend.id}/settings/permissions`)
      .set('X-Forwarded-Proto', 'https')
      .set('Cookie', admin.sessionCookie)
      .send({
        permissions: friend.permissions,
        requestServices: ['radarr:42'],
      });

    assert.strictEqual(response.status, 200);
    assert.deepStrictEqual(response.body.requestServices, ['radarr:42']);

    const updatedUser = await getRepository(User).findOneByOrFail({
      id: friend.id,
    });
    assert.deepStrictEqual(updatedUser.requestServices, ['radarr:42']);
    const read = await request(app)
      .get(`/user/${friend.id}/settings/permissions`)
      .set('X-Forwarded-Proto', 'https')
      .set('Cookie', admin.sessionCookie);
    assert.strictEqual(read.status, 200);
    assert.deepStrictEqual(read.body.requestServices, ['radarr:42']);

    const friendSession = await loginAs('friend@seerr.dev', 'test1234');
    const currentUser = await request(app)
      .get('/auth/me')
      .set('X-Forwarded-Proto', 'https')
      .set('Cookie', friendSession.sessionCookie);
    assert.strictEqual(currentUser.status, 200);
    assert.deepStrictEqual(currentUser.body.requestServices, ['radarr:42']);
  });

  it('rejects unknown and duplicate service grants', async () => {
    const admin = await loginAs('admin@seerr.dev', 'test1234');
    const friend = await getRepository(User).findOneByOrFail({
      email: 'friend@seerr.dev',
    });
    const unknown = await request(app)
      .post(`/user/${friend.id}/settings/permissions`)
      .set('X-Forwarded-Proto', 'https')
      .set('Cookie', admin.sessionCookie)
      .send({
        permissions: friend.permissions,
        requestServices: ['radarr:99'],
      });
    const duplicate = await request(app)
      .post(`/user/${friend.id}/settings/permissions`)
      .set('X-Forwarded-Proto', 'https')
      .set('Cookie', admin.sessionCookie)
      .send({
        permissions: friend.permissions,
        requestServices: ['radarr:99', 'radarr:99'],
      });

    assert.strictEqual(unknown.status, 400);
    assert.strictEqual(duplicate.status, 400);
  });
});

describe('POST /user/:id/settings/theme', () => {
  it('starts on SeerrNG and preserves a newly saved account theme through later logins', async () => {
    const { sessionCookie, userId } = await loginAs(
      'demo@seerr.dev',
      'test1234'
    );
    const repository = getRepository(User);
    const initial = await repository.findOneOrFail({ where: { id: userId } });
    assert.equal(initial.settings?.themePalette ?? 'seerr', 'seerr');
    const response = await request(app)
      .post(`/user/${userId}/settings/theme`)
      .set('X-Forwarded-Proto', 'https')
      .set('Cookie', sessionCookie)
      .send({ palette: 'aurora' });
    assert.equal(response.status, 200, JSON.stringify(response.body));
    assert.deepEqual(response.body, { themePalette: 'aurora' });
    const secondLogin = await loginAs('demo@seerr.dev', 'test1234');
    const current = await request(app)
      .get('/auth/me')
      .set('X-Forwarded-Proto', 'https')
      .set('Cookie', secondLogin.sessionCookie);
    assert.equal(current.status, 200);
    assert.equal(current.body.settings.themePalette, 'aurora');
    const saved = await repository.findOneOrFail({ where: { id: userId } });
    assert.equal(saved.settings?.themePalette, 'aurora');
  });

  it('rejects malformed and unsupported choices without changing the saved theme', async () => {
    const { sessionCookie, userId } = await loginAs(
      'demo@seerr.dev',
      'test1234'
    );
    for (const body of [
      {},
      { palette: 'unknown' },
      { palette: 1 },
      { palette: 'classic', extra: true },
      { palette: 'x'.repeat(100) },
    ]) {
      const response = await request(app)
        .post(`/user/${userId}/settings/theme`)
        .set('X-Forwarded-Proto', 'https')
        .set('Cookie', sessionCookie)
        .send(body);
      assert.equal(response.status, 400);
    }
    const saved = await getRepository(User).findOneOrFail({
      where: { id: userId },
    });
    assert.equal(saved.settings?.themePalette ?? 'seerr', 'seerr');
  });

  it('does not allow one user to set another user theme', async () => {
    const { sessionCookie, userId } = await loginAs(
      'demo@seerr.dev',
      'test1234'
    );
    const response = await request(app)
      .post(`/user/${userId + 1}/settings/theme`)
      .set('X-Forwarded-Proto', 'https')
      .set('Cookie', sessionCookie)
      .send({ palette: 'classic' });
    assert.equal(response.status, 403);
  });
});

describe('POST /user/:id/settings/interface-theme', () => {
  it('saves a complete interface profile on the account and restores it after login', async () => {
    const { sessionCookie, userId } = await loginAs(
      'demo@seerr.dev',
      'test1234'
    );
    const response = await request(app)
      .post(`/user/${userId}/settings/interface-theme`)
      .set('X-Forwarded-Proto', 'https')
      .set('Cookie', sessionCookie)
      .send({ theme: 'seerrNGJ' });
    assert.equal(response.status, 200, JSON.stringify(response.body));
    assert.deepEqual(response.body, { interfaceTheme: 'seerrNGJ' });

    const secondLogin = await loginAs('demo@seerr.dev', 'test1234');
    const current = await request(app)
      .get('/auth/me')
      .set('X-Forwarded-Proto', 'https')
      .set('Cookie', secondLogin.sessionCookie);
    assert.equal(current.status, 200);
    assert.equal(current.body.settings.interfaceTheme, 'seerrNGJ');
  });

  it('rejects unknown themes and prevents changing another account', async () => {
    const { sessionCookie, userId } = await loginAs(
      'demo@seerr.dev',
      'test1234'
    );
    for (const body of [
      {},
      { theme: 'unknown' },
      { theme: 'seerrOrig', extra: true },
      { theme: 1 },
    ]) {
      const response = await request(app)
        .post(`/user/${userId}/settings/interface-theme`)
        .set('X-Forwarded-Proto', 'https')
        .set('Cookie', sessionCookie)
        .send(body);
      assert.equal(response.status, 400);
    }
    const crossAccount = await request(app)
      .post(`/user/${userId + 1}/settings/interface-theme`)
      .set('X-Forwarded-Proto', 'https')
      .set('Cookie', sessionCookie)
      .send({ theme: 'seerrNGJ' });
    assert.equal(crossAccount.status, 403);
  });
});

describe('user maturity rating limits', () => {
  it('saves independent limits for a managed profile without adding them to auth payloads', async () => {
    const { sessionCookie } = await loginAs('admin@seerr.dev', 'test1234');
    const user = await getRepository(User).findOneOrFail({
      where: { email: 'friend@seerr.dev' },
      relations: { settings: true },
    });
    const userId = user.id;
    const actor = await getRepository(User).findOneOrFail({
      where: { email: 'admin@seerr.dev' },
    });
    assert.equal(actor.hasPermission(Permission.MANAGE_USERS), true);

    const route = `/user/${userId}/settings/maturity`;
    const initial = await request(app)
      .get(route)
      .set('X-Forwarded-Proto', 'https')
      .set('Cookie', sessionCookie);
    assert.equal(initial.status, 200, JSON.stringify(initial.body));
    assert.deepEqual(initial.body, {
      movieMaturityRatingLimit: null,
      tvMaturityRatingLimit: null,
    });

    const saved = await request(app)
      .post(route)
      .set('X-Forwarded-Proto', 'https')
      .set('Cookie', sessionCookie)
      .send({
        movieMaturityRatingLimit: 'PG',
        tvMaturityRatingLimit: 'TV-PG',
      });
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    assert.deepEqual(saved.body, {
      movieMaturityRatingLimit: 'PG',
      tvMaturityRatingLimit: 'TV-PG',
    });

    const partialSave = await request(app)
      .post(route)
      .set('X-Forwarded-Proto', 'https')
      .set('Cookie', sessionCookie)
      .send({ movieMaturityRatingLimit: 'G' });
    assert.equal(partialSave.status, 200, JSON.stringify(partialSave.body));
    assert.deepEqual(partialSave.body, {
      movieMaturityRatingLimit: 'G',
      tvMaturityRatingLimit: 'TV-PG',
    });

    const auth = await request(app)
      .get('/auth/me')
      .set('X-Forwarded-Proto', 'https')
      .set(
        'Cookie',
        (await loginAs('friend@seerr.dev', 'test1234')).sessionCookie
      );
    assert.equal(auth.status, 200);
    assert.equal(
      Object.hasOwn(auth.body.settings, 'movieMaturityRatingLimit'),
      false
    );
    assert.equal(
      Object.hasOwn(auth.body.settings, 'tvMaturityRatingLimit'),
      false
    );
  });

  it('rejects unsupported ratings without changing a saved limit', async () => {
    const { sessionCookie } = await loginAs('admin@seerr.dev', 'test1234');
    const target = await getRepository(User).findOneOrFail({
      where: { email: 'friend@seerr.dev' },
    });
    const route = `/user/${target.id}/settings/maturity`;

    for (const body of [
      {},
      { movieMaturityRatingLimit: 'NC-18' },
      { tvMaturityRatingLimit: 'TV-15' },
      { movieMaturityRatingLimit: 'PG', extra: true },
    ]) {
      const response = await request(app)
        .post(route)
        .set('X-Forwarded-Proto', 'https')
        .set('Cookie', sessionCookie)
        .send(body);
      assert.equal(response.status, 400, JSON.stringify(response.body));
    }

    const current = await request(app)
      .get(route)
      .set('X-Forwarded-Proto', 'https')
      .set('Cookie', sessionCookie);
    assert.deepEqual(current.body, {
      movieMaturityRatingLimit: null,
      tvMaturityRatingLimit: null,
    });
  });
});

describe('POST /user/:id/settings/advanced-theme', () => {
  it('saves validated overrides for the signed-in user and clears them on reset', async () => {
    const { sessionCookie, userId } = await loginAs(
      'demo@seerr.dev',
      'test1234'
    );
    const route = `/user/${userId}/settings/advanced-theme`;

    const saved = await request(app)
      .post(route)
      .set('X-Forwarded-Proto', 'https')
      .set('Cookie', sessionCookie)
      .send({
        overrides: {
          '--theme-page-bg': '#123456',
          '--theme-page-spotlight-strength': 0.5,
        },
      });

    assert.strictEqual(saved.status, 200);
    assert.deepEqual(saved.body.advancedThemeOverrides, {
      '--theme-page-bg': '#123456',
      '--theme-page-spotlight-strength': 0.5,
    });

    const user = await getRepository(User).findOneOrFail({
      where: { id: userId },
      relations: { settings: true },
    });
    assert.deepEqual(user.settings?.advancedThemeOverrides, {
      '--theme-page-bg': '#123456',
      '--theme-page-spotlight-strength': 0.5,
    });

    const invalid = await request(app)
      .post(route)
      .set('X-Forwarded-Proto', 'https')
      .set('Cookie', sessionCookie)
      .send({
        overrides: { '--theme-page-bg': 'url(https://example.invalid)' },
      });
    assert.strictEqual(invalid.status, 400);

    const reset = await request(app)
      .post(route)
      .set('X-Forwarded-Proto', 'https')
      .set('Cookie', sessionCookie)
      .send({ overrides: null });
    assert.strictEqual(reset.status, 200);
    assert.strictEqual(reset.body.advancedThemeOverrides, null);
  });
});

describe('request root folder settings', () => {
  it('saves and returns per-service defaults, including long cross-platform paths', async () => {
    const { sessionCookie, userId } = await loginAs(
      'demo@seerr.dev',
      'test1234'
    );
    const route = `/user/${userId}/settings/main`;
    const user = await getRepository(User).findOneOrFail({
      where: { id: userId },
    });
    const requestRootFolders = {
      'radarr:0': '/media/Movies/David',
      'sonarr:2': 'D:\\Media\\Series\\David',
      'lidarr:3': '\\\\nas\\media\\Music',
      'comic-kapowarr:4': `/${'x'.repeat(4095)}`,
    };

    const saved = await request(app)
      .post(route)
      .set('X-Forwarded-Proto', 'https')
      .set('Cookie', sessionCookie)
      .send({ username: user.username, requestRootFolders });

    assert.strictEqual(saved.status, 200, JSON.stringify(saved.body));
    assert.deepEqual(saved.body.requestRootFolders, requestRootFolders);

    const loaded = await request(app)
      .get(`/user/${userId}/settings/request-root-folders`)
      .set('X-Forwarded-Proto', 'https')
      .set('Cookie', sessionCookie);

    assert.strictEqual(loaded.status, 200);
    assert.deepEqual(loaded.body, requestRootFolders);
  });

  it('rejects invalid service keys and malformed or oversized paths', async () => {
    const { sessionCookie, userId } = await loginAs(
      'demo@seerr.dev',
      'test1234'
    );
    const route = `/user/${userId}/settings/main`;
    const user = await getRepository(User).findOneOrFail({
      where: { id: userId },
    });
    const invalidValues = [
      { 'plex:0': '/media/Movies' },
      { 'radarr:0': '' },
      { 'radarr:0': '/media/Movies\n' },
      { 'radarr:0': `/${'x'.repeat(4096)}` },
      Object.fromEntries(
        Array.from({ length: 101 }, (_, index) => [
          `radarr:${index}`,
          `/media/${index}`,
        ])
      ),
    ];

    for (const requestRootFolders of invalidValues) {
      const response = await request(app)
        .post(route)
        .set('X-Forwarded-Proto', 'https')
        .set('Cookie', sessionCookie)
        .send({ username: user.username, requestRootFolders });

      assert.strictEqual(response.status, 400);
    }
  });

  it('does not expose another user’s folder defaults to an ordinary user', async () => {
    const { sessionCookie } = await loginAs('friend@seerr.dev', 'test1234');
    const targetUser = await getRepository(User).findOneOrFail({
      where: { email: 'demo@seerr.dev' },
    });

    const response = await request(app)
      .get(`/user/${targetUser.id}/settings/request-root-folders`)
      .set('X-Forwarded-Proto', 'https')
      .set('Cookie', sessionCookie);

    assert.strictEqual(response.status, 403);
  });

  it("saves the current user's ordered book and audiobook home sections", async () => {
    const { sessionCookie, userId } = await loginAs(
      'friend@seerr.dev',
      'test1234'
    );
    const route = `/user/${userId}/settings/discover-book-sections`;
    const sections = [
      { key: 'subject:fantasy:audiobook', enabled: true },
      { key: 'popular:ebook', enabled: false },
      { key: 'new:ebook', enabled: true },
    ];

    const saved = await request(app)
      .post(route)
      .set('X-Forwarded-Proto', 'https')
      .set('Cookie', sessionCookie)
      .send({ sections });
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    assert.deepEqual(saved.body.sections, sections);

    const loaded = await request(app)
      .get(route)
      .set('X-Forwarded-Proto', 'https')
      .set('Cookie', sessionCookie);
    assert.equal(loaded.status, 200);
    assert.deepEqual(loaded.body.sections, sections);

    const invalid = await request(app)
      .post(route)
      .set('X-Forwarded-Proto', 'https')
      .set('Cookie', sessionCookie)
      .send({ sections: [{ key: 'javascript:bad', enabled: true }] });
    assert.equal(invalid.status, 400);
  });
});
