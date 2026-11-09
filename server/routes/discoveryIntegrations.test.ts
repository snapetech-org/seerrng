import AnilistAPI from '@server/api/anilist';
import ExternalAPI from '@server/api/externalapi';
import MdblistAPI, {
  MdblistListNotFoundError,
  MdblistQuotaExceededError,
} from '@server/api/mdblist';
import SimklAPI from '@server/api/simkl';
import TheMovieDb from '@server/api/themoviedb';
import TraktAPI from '@server/api/trakt';
import { getRepository } from '@server/datasource';
import DiscoveryAccount from '@server/entity/DiscoveryAccount';
import DiscoveryIdentityMapping from '@server/entity/DiscoveryIdentityMapping';
import { User } from '@server/entity/User';
import { getSettings } from '@server/lib/settings';
import { checkUser } from '@server/middleware/auth';
import { setupTestDb } from '@server/test/db';
import cookieParser from 'cookie-parser';
import express from 'express';
import session from 'express-session';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { afterEach, before, beforeEach, describe, it, mock } from 'node:test';
import request from 'supertest';
import authRoutes from './auth';
import discoveryRoutes from './discoveryIntegrations';

const app = express();
const testSessionSecret = randomBytes(32).toString('base64url');
app.use(express.json());
app.use(cookieParser(testSessionSecret));
app.use(
  // This Supertest-only session never listens on a network socket.
  // codeql[js/clear-text-cookie]
  session({
    secret: testSessionSecret,
    resave: false,
    saveUninitialized: false,
  })
);
// Production checkUser includes the authenticated-route limiter; this in-memory
// test app has no network listener and only exercises authorization behavior.
// codeql[js/missing-rate-limiting]
app.use(checkUser);
app.use('/auth', authRoutes);
app.use('/seerr/api/v1/integrations/discovery', discoveryRoutes);
app.use('/integrations/discovery', discoveryRoutes);
setupTestDb();
let savedConfiguration: typeof getSettings extends () => infer S
  ? S extends { discoveryIntegrations: infer C }
    ? C
    : never
  : never;
let savedApplicationUrl: string;
let savedApiKey: string;
before(() => {
  savedConfiguration = structuredClone(getSettings().discoveryIntegrations);
  savedApplicationUrl = getSettings().main.applicationUrl;
  savedApiKey = getSettings().main.apiKey;
});
beforeEach(() => {
  getSettings().main.apiKey = 'discovery-session-only-test-key';
});
afterEach(() => {
  mock.restoreAll();
  Object.assign(
    getSettings().discoveryIntegrations,
    structuredClone(savedConfiguration)
  );
  getSettings().main.applicationUrl = savedApplicationUrl;
  getSettings().main.apiKey = savedApiKey;
});
async function login() {
  const agent = request.agent(app);
  getSettings().main.localLogin = true;
  getSettings().main.applicationUrl = 'https://seerr.example';
  const result = await agent
    .post('/auth/local')
    .send({ email: 'admin@seerr.dev', password: 'test1234' });
  assert.equal(result.status, 200);
  loginSessionCookies.set(
    agent,
    cookieHeader(result.headers['set-cookie'], ['connect.sid'])
  );
  return agent;
}
const loginSessionCookies = new WeakMap<object, string>();
const cookieHeader = (
  headers: string | string[] | undefined,
  names: string[]
): string =>
  names
    .map((name) => {
      const values = Array.isArray(headers)
        ? headers
        : headers
          ? [headers]
          : [];
      const cookie = values.find((value) => value.startsWith(`${name}=`));
      assert.ok(cookie, `Expected the ${name} cookie.`);
      return cookie.split(';', 1)[0];
    })
    .join('; ');

describe('personal discovery account boundaries', () => {
  it('saves and removes a TMDB-confirmed match for a linked personal library', async () => {
    const agent = await login();
    const admin = await getRepository(User).findOneByOrFail({
      email: 'admin@seerr.dev',
    });
    getSettings().discoveryIntegrations.trakt.clientId = 'test-trakt-app';
    await getRepository(DiscoveryAccount).save({
      userId: admin.id,
      provider: 'trakt',
      clientId: 'test-trakt-app',
      accessToken: 'private-token',
      refreshToken: null,
      expiresAt: null,
      username: 'viewer',
      providerUserId: 'viewer-id',
      allowWrites: false,
    });
    const catalogLookup = mock.method(
      ExternalAPI.prototype as unknown as {
        get: (endpoint: string, ...args: unknown[]) => Promise<unknown>;
      },
      'get',
      async (endpoint: string) => ({
        id: endpoint === '/movie/456' ? 456 : 0,
        title: 'Confirmed title',
      })
    );

    const saved = await agent
      .put('/integrations/discovery/mappings')
      .send({ identity: 'trakt:movie:123', tmdbId: 456, mediaType: 'movie' });
    assert.equal(saved.status, 200);
    assert.equal(saved.body.tmdbId, 456);
    assert.equal(saved.body.mediaType, 'movie');
    assert.equal(catalogLookup.mock.callCount(), 1);

    const publicCatalogMatch = await agent
      .put('/integrations/discovery/mappings')
      .send({ identity: 'anilist:123', tmdbId: 456, mediaType: 'movie' });
    assert.equal(publicCatalogMatch.status, 200);
    assert.equal(catalogLookup.mock.callCount(), 2);

    const publicListMatch = await agent
      .put('/integrations/discovery/mappings')
      .send({
        identity: 'mdblist:unknown:tt1234567',
        tmdbId: 456,
        mediaType: 'movie',
      });
    assert.equal(publicListMatch.status, 200);
    assert.equal(catalogLookup.mock.callCount(), 3);

    const unlinked = await agent
      .put('/integrations/discovery/mappings')
      .send({ identity: 'simkl:movies:123', tmdbId: 456, mediaType: 'movie' });
    assert.equal(unlinked.status, 409);

    const removed = await agent.delete(
      `/integrations/discovery/mappings/${encodeURIComponent('trakt:movie:123')}`
    );
    assert.equal(removed.status, 200);
    assert.equal(removed.body.removed, true);
  });

  it('saves only exact provider-ID repairs and preserves personal overrides', async () => {
    const agent = await login();
    const admin = await getRepository(User).findOneByOrFail({
      email: 'admin@seerr.dev',
    });
    getSettings().discoveryIntegrations.simkl.clientId = 'test-simkl-app';
    await getRepository(DiscoveryAccount).save({
      userId: admin.id,
      provider: 'simkl',
      clientId: 'test-simkl-app',
      accessToken: 'private-simkl-token',
      refreshToken: null,
      expiresAt: null,
      username: 'viewer',
      providerUserId: 'viewer-id',
      allowWrites: false,
    });
    await getRepository(DiscoveryIdentityMapping).save({
      userId: admin.id,
      identity: 'simkl:movies:2',
      tmdbId: 222,
      mediaType: 'movie',
      updatedAt: new Date(),
    });
    mock.method(SimklAPI.prototype, 'getAllItems', async () => ({
      movies: [
        {
          movie: {
            title: 'Exact external match',
            ids: { simkl: 1, imdb: 'tt0000001' },
          },
          status: 'completed',
        },
        {
          movie: {
            title: 'Keep manual override',
            ids: { simkl: 2, imdb: 'tt0000002' },
          },
          status: 'completed',
        },
        {
          movie: {
            title: 'No external ID',
            ids: { simkl: 3 },
          },
          status: 'completed',
        },
      ],
    }));
    const externalLookup = mock.method(
      TheMovieDb.prototype,
      'getByExternalId',
      async () =>
        ({
          movie_results: [{ id: 456 }],
          tv_results: [],
          person_results: [],
        }) as never
    );
    mock.method(
      ExternalAPI.prototype as unknown as {
        get: (endpoint: string, ...args: unknown[]) => Promise<unknown>;
      },
      'get',
      async (endpoint: string) => ({
        id: endpoint === '/movie/456' ? 456 : 0,
        title: 'Exact external match',
      })
    );

    const result = await agent
      .post('/integrations/discovery/library/simkl/repair')
      .send({ shelf: 'all', startPage: 1, pageCount: 5, mediaType: 'movie' });

    assert.equal(result.status, 200);
    assert.deepEqual(result.body, {
      startPage: 1,
      nextPage: 2,
      pagesScanned: 1,
      scanned: 3,
      matched: 1,
      saved: 1,
      hasMore: false,
      truncated: false,
      limitReached: false,
    });
    assert.equal(externalLookup.mock.callCount(), 1);
    const mappings = await getRepository(DiscoveryIdentityMapping).findBy({
      userId: admin.id,
    });
    assert.equal(
      mappings.find(({ identity }) => identity === 'simkl:movies:1')?.tmdbId,
      456
    );
    assert.equal(
      mappings.find(({ identity }) => identity === 'simkl:movies:2')?.tmdbId,
      222
    );
  });

  it('imports and exports private title matches without provider credentials', async () => {
    const agent = await login();
    const pack = {
      format: 'seerrng.personal-title-matches',
      version: 1,
      exportedAt: new Date().toISOString(),
      entries: [
        {
          identity: 'anilist:123',
          tmdbId: 456,
          mediaType: 'movie',
        },
      ],
    };

    const imported = await agent
      .post('/integrations/discovery/mappings/pack')
      .type('text')
      .send(JSON.stringify(pack));
    assert.equal(imported.status, 200);
    assert.deepEqual(imported.body, {
      imported: 1,
      updated: 0,
      unchanged: 0,
      total: 1,
    });

    const exported = await agent.get('/integrations/discovery/mappings/pack');
    assert.equal(exported.status, 200);
    assert.equal(exported.body.format, 'seerrng.personal-title-matches');
    assert.deepEqual(exported.body.entries, pack.entries);
    assert.equal(
      JSON.stringify(exported.body).includes('private-token'),
      false
    );
  });

  it('publishes, lists, exports, and deletes administrator-shared title packs', async () => {
    const agent = await login();
    const pack = {
      format: 'seerrng.curated-title-matches',
      version: 1,
      packId: 'route-test-pack',
      name: 'Route test pack',
      exportedAt: new Date().toISOString(),
      entries: [{ identity: 'anilist:901234', tmdbId: 987, mediaType: 'tv' }],
    };

    const imported = await agent
      .post('/integrations/discovery/mappings/packs')
      .type('text')
      .send(JSON.stringify(pack));
    assert.equal(imported.status, 200);
    assert.deepEqual(imported.body, {
      packId: 'route-test-pack',
      name: 'Route test pack',
      imported: 1,
      updated: 0,
      unchanged: 0,
      removed: 0,
      total: 1,
    });

    const listed = await agent.get('/integrations/discovery/mappings/packs');
    assert.equal(listed.status, 200);
    assert.equal(
      listed.body.packs.find(
        (entry: { packId: string }) => entry.packId === 'route-test-pack'
      ).count,
      1
    );

    const exported = await agent.get(
      '/integrations/discovery/mappings/packs/route-test-pack'
    );
    assert.equal(exported.status, 200);
    assert.equal(exported.body.entries[0].identity, 'anilist:901234');
    assert.equal(exported.body.entries[0].tmdbId, 987);

    const apiKeyWrite = await request(app)
      .post('/integrations/discovery/mappings/packs')
      .set('X-API-Key', getSettings().main.apiKey)
      .type('text')
      .send(JSON.stringify({ ...pack, packId: 'api-key-pack' }));
    assert.equal(apiKeyWrite.status, 403);

    const removed = await agent.delete(
      '/integrations/discovery/mappings/packs/route-test-pack'
    );
    assert.equal(removed.status, 200);
    assert.deepEqual(removed.body, { removed: true });
    const missing = await agent.get(
      '/integrations/discovery/mappings/packs/route-test-pack'
    );
    assert.equal(missing.status, 404);
  });

  it('omits stored tokens and client secrets from account and configuration responses', async () => {
    const agent = await login();
    const admin = await getRepository(User).findOneByOrFail({
      email: 'admin@seerr.dev',
    });
    await getRepository(DiscoveryAccount).save({
      userId: admin.id,
      provider: 'trakt',
      clientId: getSettings().discoveryIntegrations.trakt.clientId,
      accessToken: 'private-access-token',
      refreshToken: 'private-refresh-token',
      username: 'viewer',
      providerUserId: '123',
      allowWrites: false,
    });
    const accounts = await agent.get('/integrations/discovery/accounts');
    assert.equal(accounts.status, 200);
    assert.equal(accounts.body.accounts[0].username, 'viewer');
    assert.equal(JSON.stringify(accounts.body).includes('private-'), false);
    const config = await agent.get('/integrations/discovery/configuration');
    assert.equal(config.status, 200);
    for (const provider of Object.values(config.body) as Record<
      string,
      unknown
    >[]) {
      assert.equal('clientSecret' in provider, false);
      assert.equal('apiKey' in provider, false);
    }
  });
  it('removes a legacy Trakt client secret when integration settings are saved', async () => {
    const agent = await login();
    const trakt = getSettings().discoveryIntegrations.trakt as {
      clientId: string;
      clientSecret?: string;
    };
    trakt.clientSecret = 'obsolete-trakt-secret';

    try {
      const result = await agent
        .put('/integrations/discovery/configuration')
        .send({ trakt: { clientId: 'replacement-trakt-app' } });

      assert.equal(result.status, 200, JSON.stringify(result.body));
      assert.deepEqual(getSettings().discoveryIntegrations.trakt, {
        clientId: 'replacement-trakt-app',
      });
    } finally {
      delete trakt.clientSecret;
    }
  });
  it('rejects personal mutations originating at another site', async () => {
    const agent = await login();
    const result = await agent
      .delete('/integrations/discovery/accounts/trakt')
      .set('Origin', 'https://attacker.example');
    assert.equal(result.status, 403);
  });
  it('rejects unknown providers and malformed write consent', async () => {
    const agent = await login();
    assert.equal(
      (await agent.delete('/integrations/discovery/accounts/other')).status,
      400
    );
    assert.equal(
      (
        await agent
          .put('/integrations/discovery/accounts/trakt/preferences')
          .send({ allowWrites: 'yes' })
      ).status,
      400
    );
  });
  it('rejects repeated MDBList list query parameters', async () => {
    const agent = await login();
    const result = await agent.get(
      '/integrations/discovery/feeds/mdblist/list?list=hdlists%2Fhorror&list=another%2Flist'
    );
    assert.equal(result.status, 400);
  });
  it('requires a browser session and validates episode watch-state queries', async () => {
    const url =
      '/integrations/discovery/tracking/trakt/episodes?sourceId=123&tmdbId=456&season=1';
    const apiKeyRead = await request(app)
      .get(url)
      .set('X-API-Key', getSettings().main.apiKey);
    assert.equal(apiKeyRead.status, 403);

    const agent = await login();
    const invalidSource = await agent.get(
      '/integrations/discovery/tracking/trakt/episodes?sourceId=bad&tmdbId=456&season=1'
    );
    assert.equal(invalidSource.status, 400);
    const invalidTmdbId = await agent.get(
      '/integrations/discovery/tracking/trakt/episodes?sourceId=123&tmdbId=2147483648&season=1'
    );
    assert.equal(invalidTmdbId.status, 400);
  });
  it('returns a bounded Retry-After when MDBList quota is exhausted', async () => {
    const agent = await login();
    mock.method(MdblistAPI.prototype, 'getListItems', async () => {
      throw new MdblistQuotaExceededError(120);
    });

    const result = await agent.get(
      '/integrations/discovery/feeds/mdblist/list?list=123'
    );

    assert.equal(result.status, 429);
    assert.equal(result.headers['retry-after'], '120');
    assert.equal(result.body.code, 'PROVIDER_RATE_LIMITED');
  });
  it('reports a missing MDBList list as a not-found result', async () => {
    const agent = await login();
    mock.method(MdblistAPI.prototype, 'getListItems', async () => {
      throw new MdblistListNotFoundError();
    });

    const result = await agent.get(
      '/integrations/discovery/feeds/mdblist/list?list=123'
    );

    assert.equal(result.status, 404);
    assert.equal(result.body.code, 'PROVIDER_LIST_NOT_FOUND');
  });
  it('rejects a Trakt callback with a mismatched state', async () => {
    const agent = await login();
    const result = await agent.get(
      '/integrations/discovery/trakt/callback?code=auth-code&state=bogus'
    );
    assert.equal(result.status, 303);
    assert.ok(result.headers.location.includes('traktError=expired'));
  });
  it('rejects missing AniList PINs before contacting the provider', async () => {
    const agent = await login();
    const exchange = mock.method(AnilistAPI, 'exchangePinCode', async () => ({
      accessToken: 'token',
      expiresAt: 1,
    }));
    assert.equal(
      (
        await agent
          .post('/integrations/discovery/accounts/anilist/complete')
          .send({ code: '' })
      ).status,
      400
    );
    assert.equal(exchange.mock.callCount(), 0);
  });
});

it('exchanges a Trakt authorization code via PKCE and stores tokens server-side', async () => {
  const agent = await login();
  getSettings().main.applicationUrl = 'https://seerr.example/seerr';
  Object.assign(getSettings().discoveryIntegrations.trakt, {
    clientId: 'test-app',
  });
  const exchange = mock.method(
    TraktAPI.prototype,
    'exchangeCodeForTokens',
    async (code: string, verifier: string, redirectUri: string) => {
      assert.equal(code, 'auth-code');
      assert.ok(verifier.length >= 43);
      assert.equal(
        redirectUri,
        'https://seerr.example/seerr/api/v1/integrations/discovery/trakt/callback'
      );
      return {
        access_token: 'linked-access',
        refresh_token: 'linked-refresh',
        token_type: 'bearer',
        expires_in: 3600,
        created_at: Math.floor(Date.now() / 1000),
        scope: 'public',
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
      };
    }
  );
  mock.method(TraktAPI.prototype, 'getUserSettings', async () => ({
    username: 'connected-viewer',
    traktUserId: 'viewer-id',
  }));
  const begin = await agent
    .post('/integrations/discovery/accounts/trakt/connect')
    .set('X-Forwarded-Host', 'attacker.example')
    .set('X-Forwarded-Proto', 'http');
  assert.equal(begin.status, 200);
  assert.equal(typeof begin.body.authorizeUrl, 'string');
  assert.ok(
    begin.body.authorizeUrl.startsWith('https://auth.trakt.tv/oauth/authorize')
  );
  assert.ok(begin.body.authorizeUrl.includes('code_challenge_method=S256'));
  assert.equal(
    new URL(begin.body.authorizeUrl).searchParams.get('redirect_uri'),
    'https://seerr.example/seerr/api/v1/integrations/discovery/trakt/callback'
  );
  assert.equal(JSON.stringify(begin.body).includes('code_verifier'), false);
  assert.equal(exchange.mock.callCount(), 0);
  // A Trakt session cannot be completed until the provider callback returns.
  const legacyAgent = await login();
  getSettings().main.applicationUrl = 'https://seerr.example/seerr';
  assert.equal(
    (await legacyAgent.post('/integrations/discovery/accounts/trakt/connect'))
      .status,
    200
  );
  assert.equal(
    (
      await legacyAgent
        .post('/integrations/discovery/accounts/trakt/complete')
        .send({})
    ).status,
    409
  );
  const state = new URL(begin.body.authorizeUrl).searchParams.get('state');
  assert.ok(state);
  const callbackUrl = `/seerr/api/v1/integrations/discovery/trakt/callback?code=auth-code&state=${encodeURIComponent(
    state!
  )}`;
  const callback = await agent
    .get(callbackUrl)
    .set('Sec-Fetch-Site', 'cross-site')
    .set('X-Forwarded-Host', 'attacker.example');
  assert.equal(callback.status, 303);
  const callbackSetCookieHeaders = callback.headers['set-cookie'];
  const callbackSetCookieValues = Array.isArray(callbackSetCookieHeaders)
    ? callbackSetCookieHeaders
    : callbackSetCookieHeaders
      ? [callbackSetCookieHeaders]
      : [];
  const callbackSetCookie = callbackSetCookieValues.find((value) =>
    value.startsWith(`trakt-discovery-oauth-callback-${state}=`)
  );
  assert.ok(callbackSetCookie);
  assert.match(
    callbackSetCookie,
    /; Path=\/seerr\/api\/v1\/integrations\/discovery/iu
  );
  assert.match(callbackSetCookie, /; HttpOnly/iu);
  assert.match(callbackSetCookie, /; Secure/iu);
  assert.match(callbackSetCookie, /; SameSite=Lax/iu);
  assert.equal(callback.headers['referrer-policy'], 'no-referrer');
  assert.equal(
    callback.headers.location,
    'https://seerr.example/seerr/settings/discovery?traktComplete=1'
  );
  assert.equal(callback.headers.location.includes('auth-code'), false);
  assert.equal(exchange.mock.callCount(), 0);
  const sessionCookie = loginSessionCookies.get(agent);
  assert.ok(sessionCookie);
  const callbackCookie = cookieHeader(callback.headers['set-cookie'], [
    `trakt-discovery-oauth-callback-${state}`,
  ]);
  assert.match(callbackCookie, /trakt-discovery-oauth-callback/u);
  const done = await request(app)
    .post('/seerr/api/v1/integrations/discovery/accounts/trakt/complete')
    .set('Cookie', `${sessionCookie}; ${callbackCookie}`)
    .send({});
  assert.equal(done.status, 200, JSON.stringify(done.body));
  assert.equal(done.body.status, 'authorized');
  assert.equal(exchange.mock.callCount(), 1);
  const account = await getRepository(DiscoveryAccount)
    .createQueryBuilder('account')
    .addSelect(['account.accessToken', 'account.refreshToken'])
    .where('account.provider = :provider', { provider: 'trakt' })
    .getOneOrFail();
  assert.equal(account.accessToken, 'linked-access');
  assert.equal(account.refreshToken, 'linked-refresh');
  assert.equal(account.allowWrites, false);
});

it('requires a public HTTPS application URL before starting Trakt authorization', async () => {
  const agent = await login();
  getSettings().discoveryIntegrations.trakt.clientId = 'test-app';
  getSettings().main.applicationUrl = 'http://seerr.example';
  const result = await agent.post(
    '/integrations/discovery/accounts/trakt/connect'
  );
  assert.equal(result.status, 409);
  assert.match(result.body.message, /public HTTPS application URL/i);
});

it('rejects a Trakt callback when the configured application client changes', async () => {
  const agent = await login();
  getSettings().main.applicationUrl = 'https://seerr.example/seerr';
  getSettings().discoveryIntegrations.trakt.clientId = 'original-app';
  const begin = await agent.post(
    '/integrations/discovery/accounts/trakt/connect'
  );
  assert.equal(begin.status, 200);
  const state = new URL(begin.body.authorizeUrl).searchParams.get('state');
  assert.ok(state);

  getSettings().discoveryIntegrations.trakt.clientId = 'replacement-app';
  const exchange = mock.method(
    TraktAPI.prototype,
    'exchangeCodeForTokens',
    async () => {
      throw new Error('Should not exchange with changed app credentials');
    }
  );
  const done = await agent
    .get(
      `/seerr/api/v1/integrations/discovery/trakt/callback?code=auth-code&state=${encodeURIComponent(
        state!
      )}`
    )
    .set('Sec-Fetch-Site', 'cross-site');
  assert.equal(done.status, 303);
  const sessionCookie = loginSessionCookies.get(agent);
  assert.ok(sessionCookie);
  const callbackCookie = cookieHeader(done.headers['set-cookie'], [
    `trakt-discovery-oauth-callback-${state}`,
  ]);
  const completed = await request(app)
    .post('/seerr/api/v1/integrations/discovery/accounts/trakt/complete')
    .set('Cookie', `${sessionCookie}; ${callbackCookie}`)
    .send({});
  assert.equal(completed.status, 409);
  assert.match(completed.body.message, /Connection expired/u);
  assert.equal(exchange.mock.callCount(), 0);
});

it('rejects a Trakt callback when the configured application URL changes', async () => {
  const agent = await login();
  getSettings().main.applicationUrl = 'https://seerr.example/seerr';
  getSettings().discoveryIntegrations.trakt.clientId = 'test-app';
  const begin = await agent.post(
    '/integrations/discovery/accounts/trakt/connect'
  );
  assert.equal(begin.status, 200);
  const state = new URL(begin.body.authorizeUrl).searchParams.get('state');
  assert.ok(state);

  getSettings().main.applicationUrl = 'https://new-seerr.example/seerr';
  const exchange = mock.method(
    TraktAPI.prototype,
    'exchangeCodeForTokens',
    async () => {
      throw new Error('Should not exchange with a changed application URL');
    }
  );
  const callback = await agent.get(
    `/seerr/api/v1/integrations/discovery/trakt/callback?code=auth-code&state=${encodeURIComponent(
      state!
    )}`
  );
  assert.equal(callback.status, 303);
  assert.equal(
    callback.headers.location,
    'https://new-seerr.example/seerr/settings/discovery?traktComplete=1'
  );
  const sessionCookie = loginSessionCookies.get(agent);
  assert.ok(sessionCookie);
  const callbackCookie = cookieHeader(callback.headers['set-cookie'], [
    `trakt-discovery-oauth-callback-${state}`,
  ]);
  const completed = await request(app)
    .post('/seerr/api/v1/integrations/discovery/accounts/trakt/complete')
    .set('Cookie', `${sessionCookie}; ${callbackCookie}`)
    .send({});
  assert.equal(completed.status, 409);
  assert.match(completed.body.message, /Connection expired/u);
  assert.equal(exchange.mock.callCount(), 0);
});
