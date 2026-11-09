import JellyfinAPI from '@server/api/jellyfin';
import { MediaServerType } from '@server/constants/server';
import { getRepository } from '@server/datasource';
import { DesktopAuthTicket } from '@server/entity/DesktopAuthTicket';
import { Session } from '@server/entity/Session';
import { User } from '@server/entity/User';
import { getSettings } from '@server/lib/settings';
import { checkUser } from '@server/middleware/auth';
import { setupTestDb } from '@server/test/db';
import { normalizeJellyfinGuid } from '@server/utils/jellyfin';
import express from 'express';
import session from 'express-session';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import {
  after,
  afterEach,
  before,
  beforeEach,
  describe,
  it,
  mock,
} from 'node:test';
import request from 'supertest';
import authRoutes from './auth';
import desktopRoutes, { resetDesktopRateLimitsForTests } from './desktop';

const app = express();
app.set('trust proxy', 1);
app.use(express.json());
app.use(
  // Test-only sessions never listen outside Supertest's loopback socket.
  // codeql[js/clear-text-cookie]
  session({
    secret: 'desktop-tests',
    resave: false,
    saveUninitialized: false,
  })
);
// This test app mirrors the durable production store so native redemption can
// check the exact active session without receiving the browser's cookie.
app.use(checkUser);
app.use((req, _res, next) => {
  const currentSession = req.session;
  if (!currentSession?.userId || !req.sessionID) return next();

  const expiresAt = currentSession.cookie.expires
    ? new Date(currentSession.cookie.expires).getTime()
    : Date.now() + 60 * 60 * 1000;
  void getRepository(Session)
    .save({
      id: req.sessionID,
      json: JSON.stringify(currentSession),
      expiredAt: expiresAt,
    })
    .then(() => next())
    .catch(next);
});
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/desktop', desktopRoutes);
setupTestDb();

const verifier = (): string => randomBytes(32).toString('base64url');
const challengeFor = (value: string): string =>
  createHash('sha256').update(value, 'utf8').digest('hex');

let previousSettings: {
  main: ReturnType<typeof getSettings>['main'];
  jellyfin: ReturnType<typeof getSettings>['jellyfin'];
};

before(() => {
  previousSettings = {
    main: structuredClone(getSettings().main),
    jellyfin: structuredClone(getSettings().jellyfin),
  };
});

beforeEach(() => {
  resetDesktopRateLimitsForTests();
  getSettings().main.apiKey = 'desktop-session-only-test-key';
  getSettings().main.localLogin = true;
  getSettings().main.mediaServerType = MediaServerType.JELLYFIN;
  Object.assign(getSettings().jellyfin, {
    ip: 'jellyfin.internal',
    port: 8096,
    useSsl: false,
    urlBase: '',
    externalHostname: 'https://jellyfin.example.test',
    serverId: 'configured-server',
  });
});

afterEach(() => {
  mock.restoreAll();
});

after(() => {
  Object.assign(getSettings().main, previousSettings.main);
  Object.assign(getSettings().jellyfin, previousSettings.jellyfin);
});

async function login() {
  const agent = request.agent(app);
  const response = await agent
    .post('/api/v1/auth/local')
    .send({ email: 'admin@seerr.dev', password: 'test1234' });
  assert.equal(response.status, 200);
  return agent;
}

async function loginWithLinkedJellyfin() {
  const agent = await login();
  const user = await getRepository(User).findOneByOrFail({
    email: 'admin@seerr.dev',
  });
  user.jellyfinUserId = '00112233-4455-6677-8899-aabbccddeeff';
  user.jellyfinAuthToken = 'private-jellyfin-token';
  user.jellyfinDeviceId = 'private-jellyfin-device';
  await getRepository(User).save(user);
  return { agent, user };
}

async function issueTicket(agent: ReturnType<typeof request.agent>) {
  const verifierValue = verifier();
  const response = await agent
    .post('/api/v1/desktop/auth-tickets')
    .set('X-Forwarded-Proto', 'https')
    .send({
      challenge: challengeFor(verifierValue),
      protocolVersion: 1,
    });
  assert.equal(response.status, 201);
  return { verifier: verifierValue, ticket: response.body.ticket as string };
}

const securePost = (path: string) =>
  request(app).post(path).set('X-Forwarded-Proto', 'https');

describe('native desktop authentication ticket flow', () => {
  it('requires HTTPS for ticket issue and redemption', async () => {
    const agent = await login();
    const issue = await agent
      .post('/api/v1/desktop/auth-tickets')
      .send({ challenge: 'a'.repeat(64), protocolVersion: 1 });
    const redeem = await request(app)
      .post('/api/v1/desktop/auth-tickets/redeem')
      .send({
        ticket: 'a'.repeat(43),
        verifier: 'b'.repeat(43),
        protocolVersion: 1,
      });

    assert.equal(issue.status, 403);
    assert.equal(issue.body.code, 'https_required');
    assert.equal(redeem.status, 403);
    assert.equal(redeem.body.code, 'https_required');
  });

  it('issues a session-bound opaque ticket and returns Jellyfin credentials only to native redemption', async () => {
    const { agent, user } = await loginWithLinkedJellyfin();
    mock.method(JellyfinAPI.prototype, 'getUser', async () => ({
      Id: user.jellyfinUserId,
      ServerId: 'actual-server',
    }));

    const { verifier: ticketVerifier, ticket: ticketValue } =
      await issueTicket(agent);
    const stored = await getRepository(DesktopAuthTicket)
      .createQueryBuilder('ticket')
      .addSelect('ticket.sessionId')
      .where('ticket.ticketDigest = :digest', {
        digest: challengeFor(ticketValue),
      })
      .getOneOrFail();
    assert.notEqual(stored.ticketDigest, ticketValue);
    assert.equal(stored.challengeDigest, challengeFor(ticketVerifier));
    assert.equal(
      stored.jellyfinUserId,
      normalizeJellyfinGuid(user.jellyfinUserId)
    );
    assert.equal(stored.jellyfinAuthorityKey.length, 16);

    const redemption = {
      ticket: ticketValue,
      verifier: ticketVerifier,
      protocolVersion: 1,
    };
    const browserAttempt = await securePost(
      '/api/v1/desktop/auth-tickets/redeem'
    )
      .set('Origin', 'https://seerrng.example.test')
      .send(redemption);
    assert.equal(browserAttempt.status, 403);
    assert.equal(browserAttempt.body.code, 'native_client_required');

    const redeemed = await securePost(
      '/api/v1/desktop/auth-tickets/redeem'
    ).send(redemption);
    assert.equal(redeemed.status, 200);
    assert.equal(redeemed.headers['cache-control'], 'no-store');
    assert.equal(redeemed.body.accessToken, user.jellyfinAuthToken);
    assert.equal(redeemed.body.deviceId, user.jellyfinDeviceId);
    assert.equal(redeemed.body.serverId, 'actual-server');
    assert.equal(redeemed.body.serverUrl, 'http://jellyfin.internal:8096');
    assert.equal(
      redeemed.body.fallbackServerUrl,
      'https://jellyfin.example.test'
    );

    const replay = await securePost('/api/v1/desktop/auth-tickets/redeem').send(
      redemption
    );
    assert.equal(replay.status, 409);
    assert.equal(replay.body.code, 'ticket_used');
  });

  it('does not consume a ticket for a bad verifier or an invalid linked Jellyfin identity', async () => {
    const { agent, user } = await loginWithLinkedJellyfin();
    mock.method(JellyfinAPI.prototype, 'getUser', async () => ({
      Id: 'ffeeddcc-bbaa-9988-7766-554433221100',
      ServerId: 'actual-server',
    }));
    const { verifier: ticketVerifier, ticket: ticketValue } =
      await issueTicket(agent);

    const wrongVerifier = await securePost(
      '/api/v1/desktop/auth-tickets/redeem'
    ).send({ ticket: ticketValue, verifier: verifier(), protocolVersion: 1 });
    assert.equal(wrongVerifier.status, 401);
    assert.equal(wrongVerifier.body.code, 'invalid_verifier');

    const wrongIdentity = await securePost(
      '/api/v1/desktop/auth-tickets/redeem'
    ).send({
      ticket: ticketValue,
      verifier: ticketVerifier,
      protocolVersion: 1,
    });
    assert.equal(wrongIdentity.status, 401);
    assert.equal(wrongIdentity.body.code, 'token_invalid');
    assert.equal(user.jellyfinUserId, '00112233-4455-6677-8899-aabbccddeeff');
  });

  it('invalidates a ticket when its browser session credential version changes', async () => {
    const { agent, user } = await loginWithLinkedJellyfin();
    mock.method(JellyfinAPI.prototype, 'getUser', async () => ({
      Id: user.jellyfinUserId,
      ServerId: 'actual-server',
    }));
    const { verifier: ticketVerifier, ticket: ticketValue } =
      await issueTicket(agent);

    user.passwordChangedAt = new Date(Date.now() + 5_000);
    await getRepository(User).save(user);
    const stale = await securePost('/api/v1/desktop/auth-tickets/redeem').send({
      ticket: ticketValue,
      verifier: ticketVerifier,
      protocolVersion: 1,
    });
    assert.equal(stale.status, 401);
    assert.equal(stale.body.code, 'session_expired');
  });

  it('invalidates tickets after the linked Jellyfin identity or server authority changes', async () => {
    const { agent, user } = await loginWithLinkedJellyfin();
    const first = await issueTicket(agent);

    user.jellyfinUserId = 'ffeeddcc-bbaa-9988-7766-554433221100';
    await getRepository(User).save(user);
    const changedIdentity = await securePost(
      '/api/v1/desktop/auth-tickets/redeem'
    ).send({
      ticket: first.ticket,
      verifier: first.verifier,
      protocolVersion: 1,
    });
    assert.equal(changedIdentity.status, 401);
    assert.equal(changedIdentity.body.code, 'session_expired');

    const second = await issueTicket(agent);
    getSettings().jellyfin.externalHostname =
      'https://replacement.example.test';
    const changedServer = await securePost(
      '/api/v1/desktop/auth-tickets/redeem'
    ).send({
      ticket: second.ticket,
      verifier: second.verifier,
      protocolVersion: 1,
    });
    assert.equal(changedServer.status, 409);
    assert.equal(changedServer.body.code, 'unsupported_media_server');
  });

  it('rejects API-key ticket issuance because the flow requires a browser session', async () => {
    const response = await securePost('/api/v1/desktop/auth-tickets')
      .set('X-API-Key', getSettings().main.apiKey)
      .send({ challenge: 'a'.repeat(64), protocolVersion: 1 });

    assert.equal(response.status, 403);
    assert.equal(response.body.code, 'session_required');
  });
});
