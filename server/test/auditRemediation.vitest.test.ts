import JellyfinAPI from '@server/api/jellyfin';
import PlexAPI from '@server/api/plexapi';
import ReadarrAPI from '@server/api/servarr/readarr';
import TheMovieDb from '@server/api/themoviedb';
import { MediaType } from '@server/constants/media';
import { MediaServerType } from '@server/constants/server';
import { getRepository } from '@server/datasource';
import Follow from '@server/entity/Follow';
import Media from '@server/entity/Media';
import MediaRelation from '@server/entity/MediaRelation';
import { Session } from '@server/entity/Session';
import { User } from '@server/entity/User';
import { UserSettings } from '@server/entity/UserSettings';
import liveDownloadMonitor from '@server/lib/liveDownloads';
import { Permission } from '@server/lib/permissions';
import { getSettings } from '@server/lib/settings';
import migrateCsrf from '@server/lib/settings/migrations/0013_fix_csrf_protection_default';
import migrateHttp from '@server/lib/settings/migrations/0015_enable_default_http_auth';
import { checkUser, isAuthenticated } from '@server/middleware/auth';
import { contentRestrictionMiddleware } from '@server/middleware/contentRestriction';
import csrfProtection from '@server/middleware/csrfProtection';
import authRoutes from '@server/routes/auth';
import collectorRoutes from '@server/routes/collectors';
import desktopRoutes, {
  resetDesktopRateLimitsForTests,
} from '@server/routes/desktop';
import editionRoutes from '@server/routes/editions';
import franchiseRoutes from '@server/routes/franchise';
import liveRoutes from '@server/routes/live';
import playbackRoutes from '@server/routes/playback';
import resolveRoutes from '@server/routes/resolve';
import { createHttpsRedirectHandler } from '@server/utils/tls';
import { getTrustedProxyNetworks } from '@server/utils/trustedProxies';
import bcrypt from 'bcrypt';
import cookieParser from 'cookie-parser';
import express from 'express';
import { middleware as openApiMiddleware } from 'express-openapi-validator';
import session from 'express-session';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import request from 'supertest';
import { setupTestDb } from './db';

// Regression coverage for the November 2026 audit, including the form-login negative control.
// Providers are mocked; databases are isolated in memory by the repo test setup.
setupTestDb();
afterEach(() => mock.restoreAll());
beforeEach(() => {
  getSettings().main.localLogin = true;
  getSettings().network.restrictAdministratorSignInToNetworks = false;
  resetDesktopRateLimitsForTests();
});

const makeAuthApp = () => {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(
    session({
      secret: 'audit-fixture-only',
      resave: false,
      saveUninitialized: false,
    })
  );
  app.use(checkUser);
  app.use('/auth', authRoutes);
  return app;
};

describe('2026-11-09 security regressions', () => {
  it('SNG-01 rejects blocked guesses before bcrypt', async () => {
    await getRepository(User).update(1, {
      failedLoginAttempts: 10,
      lastFailedLoginAt: new Date(),
      loginBlockedUntil: new Date(Date.now() + 15 * 60_000),
    });
    const compare = mock.method(bcrypt, 'compare', async () => false);
    const app = makeAuthApp();
    for (let n = 0; n < 3; n++) {
      const res = await request(app)
        .post('/auth/local')
        .send({ email: 'admin@seerr.dev', password: `incorrect-${n}` });
      assert.equal(res.status, 403);
    }
    assert.equal(compare.mock.callCount(), 0);
  });

  it('SNG-02 preserves explicit CSRF opt-in', () => {
    const settings = { network: { csrfProtection: true }, migrations: [] };
    migrateCsrf(settings as never);
    assert.equal(settings.network.csrfProtection, true);
  });

  it('SNG-03 preserves HTTPS-only authentication', () => {
    const settings = {
      network: {
        tls: {
          mode: 'disabled',
          allowHttpAuth: false,
          httpAuthAcknowledged: false,
        },
      },
      migrations: [],
    };
    migrateHttp(settings as never);
    assert.equal(settings.network.tls.allowHttpAuth, false);
    assert.equal(settings.network.tls.httpAuthAcknowledged, false);
  });

  it('A04 negative control: OpenAPI rejects cross-origin form login before the handler', async () => {
    const app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));
    app.use(
      openApiMiddleware({ apiSpec: 'seerr-api.yml', validateRequests: true })
    );
    let reached = false;
    app.post('/api/v1/auth/local', (_req, res) => {
      reached = true;
      res.json({ ok: true });
    });
    app.use(
      (error: any, _req: any, res: any, next: any) => (
        void next,
        res.status(error.status || 500).json({ message: error.message })
      )
    );
    const res = await request(app)
      .post('/api/v1/auth/local')
      .set('Origin', 'https://untrusted.example')
      .set('Sec-Fetch-Site', 'cross-site')
      .type('form')
      .send({ email: 'friend@seerr.dev', password: 'test1234' });
    assert.equal(res.status, 415);
    assert.equal(reached, false);
    assert.equal(res.headers['set-cookie'], undefined);
  });

  it('SNG-05 admits form_post only to the state-validating callback', async () => {
    const app = express();
    app.use(express.urlencoded({ extended: false }));
    app.use(cookieParser());
    app.use(csrfProtection());
    let reached = false;
    app.post('/api/v1/auth/oidc/callback/apple', (_req, res) => {
      reached = true;
      res.sendStatus(204);
    });
    app.use(
      (err: any, _req: any, res: any, next: any) => (
        void next,
        res.status(err.status ?? 500).json({ code: err.code })
      )
    );
    const res = await request(app)
      .post('/api/v1/auth/oidc/callback/apple')
      .set('Origin', 'https://appleid.apple.com')
      .type('form')
      .send({ code: 'fixture-code', state: 'fixture-state' });
    assert.equal(res.status, 204);
    assert.equal(reached, true);
  });

  it('SNG-06 ignores forwarding headers from an untrusted peer', async () => {
    const app = express();
    app.set('trust proxy', getTrustedProxyNetworks('192.0.2.10/32'));
    app.get('/', (req, res) => res.json({ ip: req.ip }));
    const res = await request(app).get('/').set('X-Forwarded-For', '10.0.0.25');
    assert.notEqual(res.body.ip, '10.0.0.25');
  });

  it('SNG-07 counts one authenticated request once', async () => {
    const app = express();
    app.use(checkUser);
    app.use((req, _res, next) => {
      req.user = new User({ id: 2, permissions: Permission.REQUEST });
      next();
    });
    app.get('/', isAuthenticated(), (_req, res) => res.json({ ok: true }));
    const prior = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const res = await request(app).get('/');
      assert.equal(res.status, 200);
      assert.equal(res.headers['ratelimit-remaining'], '599');
    } finally {
      process.env.NODE_ENV = prior;
    }
  });

  it('SNG-08 hides resolver matches outside account policy', async () => {
    const settings = getSettings();
    settings.recognition.enabled = true;
    const actor = new User({
      id: 2,
      permissions: Permission.REQUEST,
      contentRestricted: true,
      settings: new UserSettings({
        enabledMediaCategories: { movie: false } as never,
      }),
    });
    mock.method(TheMovieDb.prototype as any, 'get', async () => ({
      id: 123,
      title: 'Restricted fixture',
      adult: true,
      poster_path: '/fixture.jpg',
      release_date: '2020-01-01',
    }));
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.user = actor;
      next();
    });
    app.use(contentRestrictionMiddleware);
    app.use('/resolve', resolveRoutes);
    const res = await request(app)
      .post('/resolve')
      .send({ url: 'https://www.themoviedb.org/movie/123' });
    assert.equal(res.status, 200);
    assert.doesNotMatch(JSON.stringify(res.body), /Restricted fixture/);
  });

  it('SNG-09 blocks playback by known ID outside category policy', async () => {
    const settings = getSettings();
    settings.main.mediaServerType = MediaServerType.PLEX;
    const userRepo = getRepository(User);
    const actor = await userRepo.findOneByOrFail({ id: 2 });
    actor.contentRestricted = true;
    actor.settings = new UserSettings({
      enabledMediaCategories: { movie: false } as never,
    });
    await userRepo.save(actor);
    const media = await getRepository(Media).save(
      new Media({ mediaType: MediaType.MOVIE, tmdbId: 123, ratingKey: '456' })
    );
    mock.method(PlexAPI.prototype, 'getMetadata', async () => ({
      ratingKey: '456',
      title: 'Restricted fixture',
      type: 'movie',
      contentRating: 'R',
    }));
    const app = express();
    app.use((req, _res, next) => {
      req.user = actor;
      next();
    });
    app.use(contentRestrictionMiddleware);
    app.use('/playback', playbackRoutes);
    const res = await request(app).get(`/playback/media/${media.id}`);
    assert.equal(res.status, 403);
    assert.equal(res.body.rootItem, undefined);
  });

  it('SNG-10 rejects credentials revoked during redemption', async () => {
    const settings = getSettings();
    settings.main.mediaServerType = MediaServerType.JELLYFIN;
    Object.assign(settings.jellyfin, {
      ip: 'jellyfin.internal',
      port: 8096,
      useSsl: false,
      urlBase: '',
      externalHostname: '',
      serverId: 'fixture-server',
    });
    const repo = getRepository(User);
    await repo.update(1, {
      jellyfinUserId: '00112233445566778899aabbccddeeff',
      jellyfinAuthToken: 'fixture-token',
      jellyfinDeviceId: 'fixture-device',
    });
    const app = makeAuthApp();
    app.use(async (req, _res, next) => {
      if (req.session?.userId)
        await getRepository(Session).save({
          id: req.sessionID,
          json: JSON.stringify(req.session),
          expiredAt: Date.now() + 60_000,
        });
      next();
    });
    app.use('/desktop', desktopRoutes);
    const agent = request.agent(app);
    assert.equal(
      (
        await agent
          .post('/auth/local')
          .send({ email: 'admin@seerr.dev', password: 'test1234' })
      ).status,
      200
    );
    const verifier = randomBytes(32).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('hex');
    const issued = await agent
      .post('/desktop/auth-tickets')
      .set('X-Forwarded-Proto', 'https')
      .send({ challenge, protocolVersion: 1 });
    assert.equal(issued.status, 201);
    mock.method(JellyfinAPI.prototype, 'getUser', async () => {
      await repo.update(1, {
        jellyfinAuthToken: null,
        jellyfinUserId: null,
        jellyfinDeviceId: null,
        passwordChangedAt: new Date(Date.now() + 1_000),
      });
      await getRepository(Session).clear();
      return {
        Id: '00112233445566778899aabbccddeeff',
        ServerId: 'fixture-server',
      };
    });
    const res = await request(app)
      .post('/desktop/auth-tickets/redeem')
      .set('X-Forwarded-Proto', 'https')
      .send({ ticket: issued.body.ticket, verifier, protocolVersion: 1 });
    assert.equal(res.status, 401);
    assert.equal(res.body.accessToken, undefined);
    assert.equal(await getRepository(Session).count(), 0);
  });

  it('SNG-11 denies unauthorized collector follows', async () => {
    getSettings().slskdn.hostname = '';
    await getRepository(User).update(2, { permissions: Permission.NONE });
    const actor = new User({ id: 2, permissions: Permission.NONE });
    const repo = getRepository(Follow);
    await repo.save(
      Array.from({ length: 200 }, (_, n) =>
        repo.create({
          user: actor,
          kind: 'artist-release-type',
          subjectKey: `fixture:${n}`,
          subjectLabel: `Fixture ${n}`,
        })
      )
    );
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.user = actor;
      next();
    });
    app.use('/collectors', collectorRoutes);
    const res = await request(app).post('/collectors/radar').send({
      artistId: '00000000-0000-0000-0000-000000000001',
      artist: 'Fixture artist',
    });
    assert.equal(res.status, 403);
    assert.equal(await repo.count({ where: { user: { id: 2 } } }), 200);
  });

  const openFixtureStream = (writeResult = true) => {
    const hash = 'c'.repeat(40);
    let update: (updates: any[], missing: string[]) => void = () => undefined;
    mock.method(liveDownloadMonitor, 'hasEnabledClients', () => true);
    mock.method(
      liveDownloadMonitor,
      'subscribe',
      (_hashes: string[], listener: typeof update) => {
        update = listener;
        return () => undefined;
      }
    );
    let admin = true;
    const req = Object.assign(new EventEmitter(), {
      user: { id: 1, hasPermission: () => admin },
      query: { ids: hash },
      revalidateUser: async () => ({ id: 1, hasPermission: () => admin }),
    });
    const writes: string[] = [];
    let ended = false;
    const res: any = Object.assign(new EventEmitter(), {
      status: () => res,
      setHeader: () => res,
      flushHeaders: () => undefined,
      write: (value: string) => {
        writes.push(value);
        return writeResult;
      },
      end: () => {
        ended = true;
      },
      destroy: () => {
        ended = true;
      },
    });
    const layer = (liveRoutes as any).stack.find(
      (entry: any) => entry.route?.path === '/downloads'
    );
    layer.route.stack[0].handle(req, res);
    return {
      writes,
      revokeAdmin: () => {
        admin = false;
      },
      ended: () => ended,
      emit: () =>
        update(
          [{ hash, clientName: 'restricted-client', message: 'admin-detail' }],
          []
        ),
      close: () => req.emit('close'),
    };
  };

  it('SNG-14 closes a live stream after administrator revocation', async () => {
    const stream = openFixtureStream();
    try {
      stream.revokeAdmin();
      stream.emit();
      await new Promise((resolve) => setImmediate(resolve));
      assert.doesNotMatch(
        stream.writes.join(''),
        /restricted-client|admin-detail/
      );
      assert.equal(stream.ended(), true);
    } finally {
      stream.close();
    }
  });

  it('SNG-15 closes a stalled writable', () => {
    const stream = openFixtureStream(false);
    try {
      stream.emit();
      stream.emit();
      stream.emit();
      assert.equal(stream.writes.length, 1);
      assert.equal(stream.ended(), true);
    } finally {
      stream.close();
    }
  });

  it('SNG-18 keeps the redirect listener strict; probes must use the TLS-aware script', async () => {
    const app = express();
    app.use(createHttpsRedirectHandler(5056, ['seerr.example']));
    const res = await request(app)
      .get('/api/v1/status/ready')
      .set('Host', '10.42.0.20:5055');
    assert.equal(res.status, 421);
  });

  it('SNG-23 rejects protocol-relative curated links', async () => {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.user = new User({ id: 2, permissions: Permission.MANAGE_REQUESTS });
      next();
    });
    app.use('/franchise', franchiseRoutes);
    const res = await request(app).post('/franchise/relations').send({
      fromType: 'anime',
      fromId: '123',
      toType: 'game',
      toId: '456',
      relation: 'same-franchise',
      href: '//untrusted.example/share',
      title: 'Fixture title',
    });
    assert.equal(res.status, 400);
    assert.equal(await getRepository(MediaRelation).count(), 0);
  });

  it('SNG-24 denies requester library-wide preference mutations', async () => {
    const settings = getSettings();
    const previous = settings.readarr;
    settings.readarr = [
      {
        id: 0,
        name: 'Fixture',
        hostname: 'chaptarr.internal',
        port: 8787,
        apiKey: 'fixture',
        useSsl: false,
        baseUrl: '',
        backend: 'chaptarr',
        serviceType: 'audiobook',
      },
    ] as never;
    mock.method(
      ReadarrAPI.prototype,
      'getSeriesNarratorMatrix',
      async () => ({ seriesId: 42 }) as never
    );
    const mutate = mock.method(
      ReadarrAPI.prototype,
      'setSeriesPreferredNarrator',
      async () => undefined
    );
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.user = new User({ id: 2, permissions: Permission.REQUEST_ADVANCED });
      next();
    });
    app.use('/editions', editionRoutes);
    try {
      const res = await request(app)
        .post('/editions/series-narrators/prefer')
        .send({
          title: 'Unowned fixture series',
          narrator: 'Fixture narrator',
        });
      assert.equal(res.status, 403);
      assert.equal(mutate.mock.callCount(), 0);
    } finally {
      settings.readarr = previous;
    }
  });
});
