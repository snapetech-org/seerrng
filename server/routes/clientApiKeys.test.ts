import { getRepository } from '@server/datasource';
import { ClientApiKey } from '@server/entity/ClientApiKey';
import { User } from '@server/entity/User';
import { clientApiKeyAllows } from '@server/lib/clientApiKeys';
import { Permission } from '@server/lib/permissions';
import { runAuthorizedUserSecurityMutation } from '@server/lib/userSecurityMutation';
import {
  checkUser,
  isAuthenticated,
  matchesApiKey,
} from '@server/middleware/auth';
import { setupTestDb } from '@server/test/db';
import express from 'express';
import session from 'express-session';
import assert from 'node:assert/strict';
import { it } from 'node:test';
import request from 'supertest';
import tokenRoutes from './clientApiKeys';

setupTestDb();
it('an empty service-key configuration never authenticates an empty header', () => {
  assert.equal(matchesApiKey('', ''), false);
  assert.equal(matchesApiKey('configured-key', 'configured-key'), true);
  assert.equal(matchesApiKey('incorrect-key', 'configured-key'), false);
});
const app = () => {
  const server = express();
  server.use(express.json());
  server.use(
    session({
      secret: 'test-only-client-token-session-secret',
      resave: false,
      saveUninitialized: false,
    })
  );
  server.post('/fixture-session', (req, res) => {
    req.session.userId = 2;
    req.session.credentialVersion = 0;
    res.sendStatus(204);
  });
  const api = express.Router();
  api.use(checkUser);
  api.use('/auth/client-tokens', isAuthenticated(), tokenRoutes);
  api.get('/auth/me', isAuthenticated(), (req, res) =>
    res.json({ id: req.user!.id })
  );
  api.post('/resolve', isAuthenticated(), (req, res) =>
    res.json({ id: req.user!.id })
  );
  const nestedRequests = express.Router();
  nestedRequests.post('/', isAuthenticated(), async (req, res) =>
    runAuthorizedUserSecurityMutation(
      req.user!.id,
      req.user!.id,
      Permission.REQUEST,
      async (actor) => res.json({ id: actor.id })
    )
  );
  api.use('/request', nestedRequests);
  api.get('/settings/main', isAuthenticated(Permission.ADMIN), (_req, res) =>
    res.json({ secret: 'must-not-escape' })
  );
  server.use('/api/v1', api);
  return server;
};
it('scopes tokens to their user and rejects management and token minting', async () => {
  const server = app();
  const browser = request.agent(server);
  await browser.post('/fixture-session').expect(204);
  const created = await browser
    .post('/api/v1/auth/client-tokens')
    .send({ name: 'Browser', scopes: ['discover'] })
    .expect(201);
  assert.match(created.body.token, /^sngc_/);
  await request(server)
    .post('/api/v1/resolve')
    .set('X-API-Key', created.body.token)
    .send({})
    .expect(200, { id: 2 });
  await request(server)
    .get('/api/v1/settings/main')
    .set('X-API-Key', created.body.token)
    .expect(401);
  await request(server)
    .post('/api/v1/auth/client-tokens')
    .set('X-API-Key', created.body.token)
    .send({ name: 'escalate' })
    .expect(401);
  await browser.get('/api/v1/auth/me').set('X-API-Key', 'invalid').expect(401);
  const listed = await browser.get('/api/v1/auth/client-tokens').expect(200);
  assert.doesNotMatch(
    JSON.stringify(listed.body),
    /tokenHash|sngc_|credentialVersion/
  );
  const stored = await getRepository(ClientApiKey)
    .createQueryBuilder('key')
    .addSelect('key.tokenHash')
    .getOneOrFail();
  assert.notEqual(stored.tokenHash, created.body.token);
  assert.equal(stored.tokenHash.length, 64);
});
it('retains the originally authorized path inside a nested mutation router', async () => {
  const server = app();
  const browser = request.agent(server);
  await browser.post('/fixture-session');
  const created = await browser
    .post('/api/v1/auth/client-tokens')
    .send({ name: 'Requester', scopes: ['request'] })
    .expect(201);
  await request(server)
    .post('/api/v1/request')
    .set('X-API-Key', created.body.token)
    .send({})
    .expect(200, { id: 2 });
  await browser
    .delete(`/api/v1/auth/client-tokens/${created.body.id}`)
    .expect(204);
  await request(server)
    .post('/api/v1/request')
    .set('X-API-Key', created.body.token)
    .send({})
    .expect(401);
});
it('revokes one client independently and invalidates all clients on credential rotation', async () => {
  const server = app();
  const browser = request.agent(server);
  await browser.post('/fixture-session');
  const first = (
    await browser
      .post('/api/v1/auth/client-tokens')
      .send({ name: 'First' })
      .expect(201)
  ).body;
  const second = (
    await browser
      .post('/api/v1/auth/client-tokens')
      .send({ name: 'Second' })
      .expect(201)
  ).body;
  await browser.delete(`/api/v1/auth/client-tokens/${first.id}`).expect(204);
  await request(server)
    .get('/api/v1/auth/me')
    .set('X-API-Key', first.token)
    .expect(401);
  await request(server)
    .get('/api/v1/auth/me')
    .set('X-API-Key', second.token)
    .expect(200);
  await getRepository(User).update(2, { passwordChangedAt: new Date() });
  await request(server)
    .get('/api/v1/auth/me')
    .set('X-API-Key', second.token)
    .expect(401);
});
it('enforces token expiry, active count and exact method/path scopes', async () => {
  const server = app();
  const browser = request.agent(server);
  await browser.post('/fixture-session');
  const tokens = await Promise.all(
    Array.from({ length: 11 }, (_, i) =>
      browser.post('/api/v1/auth/client-tokens').send({ name: `Client ${i}` })
    )
  );
  assert.equal(tokens.filter((r) => r.status === 201).length, 10);
  assert.equal(tokens.filter((r) => r.status === 409).length, 1);
  const token = tokens.find((r) => r.status === 201)!.body;
  await getRepository(ClientApiKey).update(token.id, {
    expiresAt: new Date(0),
  });
  await request(server)
    .get('/api/v1/auth/me')
    .set('X-API-Key', token.token)
    .expect(401);
  assert.equal(clientApiKeyAllows(['request'], 'POST', '/request'), true);
  for (const path of [
    '/request/1/approve',
    '/request/software',
    '/user',
    '/settings/main',
    '/editions/series-narrators/prefer',
    '/auth/client-tokens',
  ])
    assert.equal(
      clientApiKeyAllows(['request', 'discover'], 'POST', path),
      false,
      path
    );
  assert.equal(clientApiKeyAllows(['discover'], 'DELETE', '/resolve'), false);
});
