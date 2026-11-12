import requestDispatchManager from '@server/lib/requestDispatch';
import assert from 'node:assert/strict';
import path from 'node:path';
import { afterEach, before, describe, it, mock } from 'node:test';

import ExternalAPI from '@server/api/externalapi';
import PushoverAPI from '@server/api/pushover';
import TheMovieDb from '@server/api/themoviedb';
import { DiscoverSliderType } from '@server/constants/discover';
import {
  MediaRequestStatus,
  MediaStatus,
  MediaType,
} from '@server/constants/media';
import dataSource, { getRepository } from '@server/datasource';
import DiscoverSlider from '@server/entity/DiscoverSlider';
import Media from '@server/entity/Media';
import { MediaRequest } from '@server/entity/MediaRequest';
import { User } from '@server/entity/User';
import { UserSettings } from '@server/entity/UserSettings';
import { Watchlist } from '@server/entity/Watchlist';
import { Permission } from '@server/lib/permissions';
import { getSettings } from '@server/lib/settings';
import { runUserSecurityMutation } from '@server/lib/userSecurityMutation';
import { setupTestDb } from '@server/test/db';
import type { Express } from 'express';
import express from 'express';
import * as OpenApiValidator from 'express-openapi-validator';
import session from 'express-session';
import request from 'supertest';
import router, {
  EXTERNAL_METADATA_RATE_LIMIT,
  PUBLIC_BACKDROPS_RATE_LIMIT,
  getCommitUpdateStatus,
  getReleaseUpdateStatus,
} from './index';

let app: Express;

function createApp() {
  const app = express();
  app.use(express.json());
  app.use(
    // Test-only session middleware has no network listener or real secret.
    // codeql[js/clear-text-cookie]
    session({
      secret: 'test-secret',
      resave: false,
      saveUninitialized: false,
    })
  );
  app.use('/api/v1', router);
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

function createOpenApiValidatedApp() {
  const app = express();
  app.use(express.json());
  app.set('trust proxy', 1);
  app.use(
    // The in-memory test app uses the same Secure cookie policy as HTTPS.
    session({
      secret: 'test-secret',
      resave: false,
      saveUninitialized: false,
      cookie: { secure: true },
    })
  );
  app.use(
    OpenApiValidator.middleware({
      apiSpec: path.join(process.cwd(), 'seerr-api.yml'),
      validateRequests: true,
      validateSecurity: false,
    })
  );
  app.use('/api/v1', router);
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

before(() => {
  app = createApp();
});

afterEach(() => {
  mock.restoreAll();
});

setupTestDb();

const mockPrivateMethod = mock.method as (
  object: object,
  methodName: string,
  implementation: (...args: unknown[]) => unknown
) => unknown;
const mockPrivate = (
  object: object,
  methodName: string,
  implementation: (...args: unknown[]) => unknown
) => mockPrivateMethod.call(mock, object, methodName, implementation);

describe('Public endpoint resource boundaries', () => {
  it('bounds unauthenticated backdrop provider requests', () => {
    assert.deepStrictEqual(PUBLIC_BACKDROPS_RATE_LIMIT, {
      windowMs: 60 * 1000,
      limit: 30,
    });
  });

  it('reports readiness only while the database responds', async () => {
    const ready = await request(app).get('/api/v1/status/ready');
    assert.strictEqual(ready.status, 204);

    mock.method(dataSource, 'query', async () => {
      throw new Error('database unavailable');
    });
    const unavailable = await request(app).get('/api/v1/status/ready');
    assert.strictEqual(unavailable.status, 503);
    assert.strictEqual(unavailable.text, '');
  });

  it('honors an explicit false version-check query value', async () => {
    const response = await request(app).get(
      '/api/v1/status?checkUpdateAvailable=false'
    );

    assert.strictEqual(response.status, 200);
    assert.equal('updateAvailable' in response.body, false);
  });

  it('reports active and saved transport state without exposing certificate paths', async () => {
    const settings = getSettings();
    const originalTls = structuredClone(settings.network.tls);
    settings.network.tls = {
      ...originalTls,
      mode: 'self-signed',
      redirectHttpToHttps: false,
      allowHttpAuth: false,
      httpAuthAcknowledged: false,
    };

    try {
      const response = await request(app).get('/api/v1/status/tls');

      assert.strictEqual(response.status, 200);
      assert.strictEqual(response.body.configuredMode, 'self-signed');
      assert.strictEqual(response.body.configuredRedirectsHttpToHttps, false);
      assert.ok(Array.isArray(response.body.environmentOverrides));
      assert.equal('certificateFile' in response.body, false);
      assert.equal('keyFile' in response.body, false);
    } finally {
      settings.network.tls = originalTls;
    }
  });
});

describe('Authenticated metadata resource boundaries', () => {
  it('shares a bounded upstream request budget across detail route families', () => {
    assert.deepStrictEqual(EXTERNAL_METADATA_RATE_LIMIT, {
      windowMs: 60 * 1000,
      limit: 60,
    });
  });

  it('cannot reset the metadata budget by switching route families', async () => {
    const agent = await login();
    const settings = getSettings();
    const previousCategories = { ...settings.main.enabledMediaCategories };
    settings.main.enabledMediaCategories = {
      ...previousCategories,
      comic: true,
    };
    const environment = process.env as Record<string, string | undefined>;
    const previousNodeEnv = environment.NODE_ENV;
    environment.NODE_ENV = 'production';

    try {
      for (let index = 0; index < EXTERNAL_METADATA_RATE_LIMIT.limit; index++) {
        const route = ['/movie/0', '/tv/0', '/comic/work/not-a-key'][index % 3];
        const response = await agent.get(`/api/v1${route}`);
        assert.notStrictEqual(response.status, 429);
      }

      const limited = await agent.get('/api/v1/comic/work/not-a-key');
      assert.strictEqual(limited.status, 429);
    } finally {
      settings.main.enabledMediaCategories = previousCategories;
      if (previousNodeEnv === undefined) {
        delete environment.NODE_ENV;
      } else {
        environment.NODE_ENV = previousNodeEnv;
      }
    }
  });

  it('hides person detail and credits when both video categories are disabled', async () => {
    const settings = getSettings();
    const originalCategories = { ...settings.main.enabledMediaCategories };
    settings.main.enabledMediaCategories = {
      ...originalCategories,
      movie: false,
      tv: false,
    };
    const providerLookup = mockPrivate(
      ExternalAPI.prototype,
      'get',
      async () => {
        throw new Error('Person provider should not be called');
      }
    ) as ReturnType<typeof mock.method>;

    try {
      const agent = await loginAs('friend@seerr.dev');
      const person = await agent.get('/api/v1/person/123');
      const credits = await agent.get(
        '/api/v1/person/123/combined_credits'
      );

      assert.strictEqual(person.status, 404);
      assert.strictEqual(credits.status, 404);
      assert.strictEqual(providerLookup.mock.callCount(), 0);
    } finally {
      settings.main.enabledMediaCategories = originalCategories;
    }
  });

  it('hides person detail and credits for a user with both video categories disabled', async () => {
    const user = await getRepository(User).findOneByOrFail({
      email: 'friend@seerr.dev',
    });
    const userSettings = user.settings ?? new UserSettings({ user });
    const originalCategories = userSettings.enabledMediaCategories;
    userSettings.enabledMediaCategories = {
      ...originalCategories,
      movie: false,
      tv: false,
    };
    await getRepository(UserSettings).save(userSettings);
    const providerLookup = mockPrivate(
      ExternalAPI.prototype,
      'get',
      async () => {
        throw new Error('Person provider should not be called');
      }
    ) as ReturnType<typeof mock.method>;

    try {
      const agent = await loginAs('friend@seerr.dev');
      const person = await agent.get('/api/v1/person/123');
      const credits = await agent.get(
        '/api/v1/person/123/combined_credits'
      );

      assert.strictEqual(person.status, 404);
      assert.strictEqual(credits.status, 404);
      assert.strictEqual(providerLookup.mock.callCount(), 0);
    } finally {
      userSettings.enabledMediaCategories = originalCategories;
      await getRepository(UserSettings).save(userSettings);
    }
  });
});

async function login() {
  return loginAs('admin@seerr.dev');
}

async function loginAs(email: string) {
  const settings = getSettings();
  const priorLocalLogin = settings.main.localLogin;
  settings.main.localLogin = true;

  try {
    const agent = request.agent(app);
    const res = await agent
      .post('/api/v1/auth/local')
      .send({ email, password: 'test1234' });
    assert.strictEqual(res.status, 200);
    return agent;
  } finally {
    settings.main.localLogin = priorLocalLogin;
  }
}

describe('commit update status', () => {
  const commit = (sha: string, message = 'change') => ({
    sha,
    commit: { message },
  });

  it('treats pages containing only skipped commits as an unknown check', () => {
    assert.deepEqual(
      getCommitUpdateStatus(
        [commit('a', '[skip ci] docs'), commit('b', 'build [skip ci]')],
        'older'
      ),
      null
    );
  });

  it('reports the exact index when the current commit is in the window', () => {
    assert.deepEqual(
      getCommitUpdateStatus(
        [commit('latest'), commit('skipped', '[skip ci]'), commit('current')],
        'current'
      ),
      { updateAvailable: true, commitsBehind: 1 }
    );
  });

  it('uses the fetched count as a lower bound for older commits', () => {
    assert.deepEqual(
      getCommitUpdateStatus([commit('a'), commit('b')], 'older'),
      { updateAvailable: true, commitsBehind: 2 }
    );
  });
});

describe('stable release update status', () => {
  const release = (
    tag_name: string,
    options: { prerelease?: boolean; draft?: boolean } = {}
  ) => ({
    tag_name,
    prerelease: options.prerelease ?? false,
    draft: options.draft ?? false,
  });

  it('does not flag a fork build that is newer than its public release feed', () => {
    assert.equal(getReleaseUpdateStatus([release('v3.17.0')], '3.18.0'), false);
  });

  it('flags a semver-newer stable fork release', () => {
    assert.equal(
      getReleaseUpdateStatus(
        [release('v3.18.0'), release('v3.19.0')],
        '3.18.0'
      ),
      true
    );
  });

  it('recognizes the current published release as newer than version 3.53.0', () => {
    assert.equal(getReleaseUpdateStatus([release('v3.71.3')], '3.53.0'), true);
  });

  it('ignores prerelease and draft releases', () => {
    assert.equal(
      getReleaseUpdateStatus(
        [
          release('v4.0.0-rc.1', { prerelease: true }),
          release('v4.0.0', { draft: true }),
        ],
        '3.18.0'
      ),
      null
    );
  });

  it('ignores invalid installed versions and release tags', () => {
    assert.equal(
      getReleaseUpdateStatus([release('not-a-version')], 'main-abc123'),
      null
    );
  });

  it('treats an empty or unusable release feed as an unknown check', () => {
    assert.equal(getReleaseUpdateStatus([], '3.53.0'), null);
    assert.equal(
      getReleaseUpdateStatus([release('not-a-version')], '3.53.0'),
      null
    );
  });
});

describe('Discover homepage synchronization API', () => {
  it('requires authentication for manifest and state endpoints', async () => {
    const [manifest, state] = await Promise.all([
      request(app).get('/api/v1/discover/home/manifest'),
      request(app)
        .post('/api/v1/discover/home/state')
        .send({ items: [{ mediaType: MediaType.MOVIE, id: 1 }] }),
    ]);

    assert.strictEqual(manifest.status, 403);
    assert.strictEqual(state.status, 403);
  });

  it('returns stable descriptor revisions and conditionally revalidates the manifest', async () => {
    const slider = await getRepository(DiscoverSlider).save(
      new DiscoverSlider({
        type: DiscoverSliderType.TRENDING,
        order: 0,
        enabled: true,
        isBuiltIn: true,
      })
    );
    const agent = await login();
    const first = await agent.get('/api/v1/discover/home/manifest');
    const second = await agent.get('/api/v1/discover/home/manifest');
    const unchanged = await agent
      .get('/api/v1/discover/home/manifest')
      .set('If-None-Match', first.headers.etag);
    slider.title = 'Changed descriptor';
    await getRepository(DiscoverSlider).save(slider);
    const changed = await agent.get('/api/v1/discover/home/manifest');

    assert.strictEqual(first.status, 200);
    assert.strictEqual(first.body.layoutRevision, second.body.layoutRevision);
    assert.strictEqual(
      first.body.userStateRevision,
      second.body.userStateRevision
    );
    assert.strictEqual(
      first.body.rows[0].descriptorRevision,
      second.body.rows[0].descriptorRevision
    );
    assert.strictEqual(first.body.rows[0].revision, undefined);
    assert.strictEqual(first.body.freshness.rowMaxAgeSeconds, 300);
    assert.match(first.headers['cache-control'], /private/);
    assert.strictEqual(unchanged.status, 304);
    assert.notStrictEqual(
      first.body.layoutRevision,
      changed.body.layoutRevision
    );
    assert.notStrictEqual(
      first.body.rows[0].descriptorRevision,
      changed.body.rows[0].descriptorRevision
    );
  });

  it('rejects malformed and oversized personalized state item lists', async () => {
    const agent = await login();
    const malformed = await agent
      .post('/api/v1/discover/home/state')
      .send({ items: [{ mediaType: MediaType.MOVIE, id: '1' }] });
    const oversized = await agent.post('/api/v1/discover/home/state').send({
      items: Array.from({ length: 101 }, (_, index) => ({
        mediaType: MediaType.MOVIE,
        id: index + 1,
      })),
    });

    assert.strictEqual(malformed.status, 400);
    assert.strictEqual(oversized.status, 400);
  });

  it('isolates request and watchlist overlays by authenticated user', async () => {
    mock.method(requestDispatchManager, 'enqueue', async () => undefined);
    const [admin, friend] = await Promise.all([
      getRepository(User).findOneOrFail({
        where: { email: 'admin@seerr.dev' },
      }),
      getRepository(User).findOneOrFail({
        where: { email: 'friend@seerr.dev' },
      }),
    ]);
    const media = await getRepository(Media).save(
      new Media({
        mediaType: MediaType.MOVIE,
        tmdbId: 4242,
        status: MediaStatus.PENDING,
        status4k: MediaStatus.UNKNOWN,
      })
    );
    await getRepository(MediaRequest).save(
      new MediaRequest({
        media,
        requestedBy: admin,
        status: MediaRequestStatus.APPROVED,
        type: MediaType.MOVIE,
        is4k: false,
      })
    );
    await getRepository(Watchlist).save(
      new Watchlist({
        media,
        requestedBy: admin,
        mediaType: MediaType.MOVIE,
        tmdbId: 4242,
        title: 'Private Movie',
        ratingKey: '4242',
      })
    );

    const [adminAgent, friendAgent] = await Promise.all([
      loginAs(admin.email),
      loginAs(friend.email),
    ]);
    const body = { items: [{ mediaType: MediaType.MOVIE, id: 4242 }] };
    const [adminState, friendState] = await Promise.all([
      adminAgent.post('/api/v1/discover/home/state').send(body),
      friendAgent.post('/api/v1/discover/home/state').send(body),
    ]);

    assert.strictEqual(adminState.status, 200);
    assert.strictEqual(
      adminState.body.items[0].request.status,
      MediaRequestStatus.APPROVED
    );
    assert.strictEqual(adminState.body.items[0].watchlisted, true);
    assert.strictEqual(friendState.status, 200);
    assert.strictEqual(
      friendState.body.items[0].media.status,
      MediaStatus.PROCESSING
    );
    assert.strictEqual(friendState.body.items[0].request, null);
    assert.strictEqual(friendState.body.items[0].watchlisted, false);
    assert.notStrictEqual(adminState.body.revision, friendState.body.revision);

    const [adminManifest, friendManifest] = await Promise.all([
      adminAgent.get('/api/v1/discover/home/manifest'),
      friendAgent.get('/api/v1/discover/home/manifest'),
    ]);
    assert.notStrictEqual(
      adminManifest.body.userStateRevision,
      friendManifest.body.userStateRevision
    );
  });
});

describe('Top-level API route validation', () => {
  it('exposes cache warming only to authenticated API clients', async () => {
    const body = {
      urls: ['https://image.tmdb.org/t/p/w300/poster.jpg'],
    };
    const anonymous = await request(app)
      .post('/api/v1/imageproxy/warm')
      .send(body);
    const agent = await login();
    const authenticated = await agent
      .post('/api/v1/imageproxy/warm')
      .send(body);

    assert.strictEqual(anonymous.status, 403);
    assert.strictEqual(authenticated.status, 202);
  });

  it('keeps cache warming reachable through the OpenAPI request validator', async () => {
    const validatedApp = createOpenApiValidatedApp();
    const loginResponse = await request(validatedApp)
      .post('/api/v1/auth/local')
      .set('X-Forwarded-Proto', 'https')
      .send({ email: 'admin@seerr.dev', password: 'test1234' });
    assert.strictEqual(loginResponse.status, 200);
    const sessionCookie = loginResponse
      .get('set-cookie')?.[0]
      ?.split(';', 1)[0];
    assert.ok(sessionCookie);
    assert.match(loginResponse.get('set-cookie')?.[0] ?? '', /; Secure(?:;|$)/);

    const response = await request(validatedApp)
      .post('/api/v1/imageproxy/warm')
      .set('X-Forwarded-Proto', 'https')
      .set('Cookie', sessionCookie)
      .send({ urls: [] });

    assert.strictEqual(response.status, 202, JSON.stringify(response.body));
    assert.deepStrictEqual(response.body, { accepted: true });
  });

  it('allows unauthenticated login backdrop requests', async () => {
    const calls: unknown[][] = [];
    const get = mock.method(
      TheMovieDb.prototype as unknown as {
        get: (...args: unknown[]) => Promise<unknown>;
      },
      'get',
      async (...args: unknown[]) => {
        calls.push(args);
        assert.strictEqual(args[0], '/trending/all/week');
        return {
          page: 1,
          total_pages: 1,
          total_results: 1,
          results: [
            {
              id: 100,
              media_type: 'movie',
              title: 'Fixture Movie',
              backdrop_path: '/fixture-backdrop.jpg',
              release_date: '2026-01-01',
            },
          ],
        };
      }
    );
    const res = await request(app).get('/api/v1/backdrops');

    assert.notStrictEqual(res.status, 403);
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(res.body, [
      {
        path: '/fixture-backdrop.jpg',
        title: 'Fixture Movie',
        mediaType: 'movie',
        year: '2026',
      },
    ]);
    assert.strictEqual(get.mock.callCount(), 1);
    assert.strictEqual(calls[0][0], '/trending/all/week');
    assert.strictEqual(
      (calls[0][1] as { params: { page: number } }).params.page,
      1
    );
  });

  it('rejects malformed keyword detail IDs before provider lookup', async () => {
    const agent = await login();
    const res = await agent.get('/api/v1/keyword/not-a-number');

    assert.strictEqual(res.status, 404);
  });

  it('rejects missing Pushover sound tokens before provider lookup', async () => {
    const agent = await login();
    const res = await agent.get(
      '/api/v1/settings/notifications/pushover/sounds'
    );

    assert.strictEqual(res.status, 400);
    assert.match(res.body.message, /Pushover application token/);
  });

  it('loads Pushover sounds from the authenticated user stored token', async () => {
    const userRepository = getRepository(User);
    const target = await userRepository.findOneByOrFail({ id: 2 });
    target.settings = new UserSettings({
      ...target.settings,
      user: target,
      pushoverApplicationToken: 'a'.repeat(30),
      notificationTypes: target.settings?.notificationTypes ?? {},
    });
    await userRepository.save(target);

    mock.method(PushoverAPI.prototype, 'getSounds', async (token: string) => {
      assert.strictEqual(token, 'a'.repeat(30));
      return [{ name: 'pushover', description: 'Pushover' }];
    });

    const agent = await loginAs('friend@seerr.dev');
    const res = await agent
      .get('/api/v1/settings/notifications/pushover/sounds')
      .query({ userId: 2 });

    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(res.body, [
      { name: 'pushover', description: 'Pushover' },
    ]);
  });

  it("prevents users from loading another user's Pushover sounds", async () => {
    const agent = await loginAs('friend@seerr.dev');
    const res = await agent
      .get('/api/v1/settings/notifications/pushover/sounds')
      .query({ userId: 1 });

    assert.strictEqual(res.status, 403);
  });

  it('revalidates administrator authority before using the global Pushover token', async () => {
    const settings = getSettings();
    settings.notifications.agents.pushover.options.accessToken = 'a'.repeat(30);
    const userRepository = getRepository(User);
    const agent = await login();
    const provider = mock.method(
      PushoverAPI.prototype,
      'getSounds',
      async () => []
    );
    let revocationStarted!: () => void;
    let releaseRevocation!: () => void;
    const revocationStartedPromise = new Promise<void>((resolve) => {
      revocationStarted = resolve;
    });
    const releaseRevocationPromise = new Promise<void>((resolve) => {
      releaseRevocation = resolve;
    });
    const revocation = runUserSecurityMutation(1, async () => {
      await userRepository.update(1, { permissions: Permission.REQUEST });
      revocationStarted();
      await releaseRevocationPromise;
    });
    await revocationStartedPromise;

    const responsePromise = agent
      .get('/api/v1/settings/notifications/pushover/sounds')
      .then((response) => response);
    await new Promise<void>((resolve) => setImmediate(resolve));
    releaseRevocation();
    await revocation;

    const response = await responsePromise;
    assert.strictEqual(response.status, 403);
    assert.strictEqual(provider.mock.callCount(), 0);
  });

  it('rejects oversized watch provider regions before provider lookup', async () => {
    const agent = await login();
    const res = await agent
      .get('/api/v1/watchproviders/movies')
      .query({ watchRegion: 'x'.repeat(17) });

    assert.strictEqual(res.status, 400);
    assert.match(res.body.message, /Watch region/);
  });
});

describe('comics follow the per-user media category', () => {
  const settings = getSettings();
  let prior: {
    cats: typeof settings.main.enabledMediaCategories;
    defaults: typeof settings.main.defaultEnabledMediaCategories;
    key: typeof settings.main.comicVineApiKey;
  };
  const setFriendComic = async (value: boolean | null) => {
    const friend = await getRepository(User).findOneOrFail({
      where: { email: 'friend@seerr.dev' },
      relations: { settings: true },
    });
    const row = friend.settings ?? new UserSettings({ user: friend });
    row.enabledMediaCategories = value === null ? null : { comic: value };
    await getRepository(UserSettings).save(row);
  };
  const paths = [
    '/api/v1/discover/comics',
    '/api/v1/discover/comics/landing',
    '/api/v1/discover/comics/browse?type=manga',
    '/api/v1/comic/work/al-1',
    '/api/v1/comic/1',
    '/api/v1/comic/1/issues',
  ];

  before(() => {
    prior = {
      cats: { ...settings.main.enabledMediaCategories },
      defaults: { ...settings.main.defaultEnabledMediaCategories },
      key: settings.main.comicVineApiKey,
    };
  });
  afterEach(async () => {
    settings.main.enabledMediaCategories = { ...prior.cats };
    settings.main.defaultEnabledMediaCategories = { ...prior.defaults };
    settings.main.comicVineApiKey = prior.key;
    await setFriendComic(null);
  });
  const configure = () => {
    settings.main.enabledMediaCategories = {
      ...settings.main.enabledMediaCategories,
      comic: true,
    };
    settings.main.defaultEnabledMediaCategories = {
      ...settings.main.defaultEnabledMediaCategories,
      comic: false,
    };
    settings.main.comicVineApiKey = '';
  };

  it('hides every comics route from a user without the category', async () => {
    configure();
    const agent = await loginAs('friend@seerr.dev');
    for (const path of paths) {
      const res = await agent.get(path);
      assert.strictEqual(res.status, 404, path);
      assert.strictEqual(res.body.message, 'Not found.', path);
    }
  });

  it('returns no comic results in search and refuses comic requests', async () => {
    configure();
    settings.main.comicVineApiKey = 'key';
    const agent = await loginAs('friend@seerr.dev');
    const search = await agent
      .get('/api/v1/search')
      .query({ query: 'batman', type: 'comic' });
    assert.strictEqual(search.status, 200);
    assert.deepStrictEqual(search.body.results, []);
    const req = await agent
      .post('/api/v1/request')
      .send({ mediaType: 'comic', mediaId: 1 });
    assert.strictEqual(req.status, 403);
    assert.match(req.body.message, /unavailable for this user/);
  });

  it('lets a user whose own setting turns comics on through', async () => {
    configure();
    await setFriendComic(true);
    const agent = await loginAs('friend@seerr.dev');
    const discover = await agent.get('/api/v1/discover/comics');
    assert.strictEqual(discover.status, 200);
    const work = await agent.get('/api/v1/comic/work/not-a-key');
    assert.strictEqual(work.status, 404);
    assert.strictEqual(work.body.message, 'Comic not found');
  });

  it('keeps comics for an administrator', async () => {
    configure();
    const agent = await login();
    const res = await agent.get('/api/v1/discover/comics');
    assert.strictEqual(res.status, 200);
  });
});
