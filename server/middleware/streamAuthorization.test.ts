import { getRepository } from '@server/datasource';
import { User } from '@server/entity/User';
import { Permission } from '@server/lib/permissions';
import { getSettings } from '@server/lib/settings';
import { setupTestDb } from '@server/test/db';
import express from 'express';
import session from 'express-session';
import assert from 'node:assert/strict';
import { it } from 'node:test';
import request from 'supertest';
import { checkUser } from './auth';

setupTestDb();
it('stream authorization observes permission changes, destroyed sessions and rotated keys', async () => {
  const app = express();
  app.use(
    session({
      secret: 'test-only-stream-session-secret',
      resave: false,
      saveUninitialized: false,
    })
  );
  app.post('/fixture-login', (req, res) => {
    req.session.userId = 2;
    req.session.credentialVersion = 0;
    res.sendStatus(204);
  });
  let revalidate: (() => Promise<User | null>) | undefined;
  app.use(checkUser);
  app.get('/capture', (req, res) => {
    revalidate = req.revalidateUser;
    res.sendStatus(204);
  });
  app.post('/fixture-logout', (req, res) =>
    req.session.destroy(() => res.sendStatus(204))
  );
  const agent = request.agent(app);
  await agent.post('/fixture-login');
  await agent.get('/capture');
  assert.ok(revalidate);
  assert.equal((await revalidate())?.id, 2);
  await getRepository(User).update(2, { permissions: Permission.NONE });
  assert.equal((await revalidate())?.hasPermission(Permission.REQUEST), false);
  await agent.post('/fixture-logout');
  assert.equal(await revalidate(), null);
  getSettings().main.apiKey = 'stream-service-key';
  await request(app).get('/capture').set('X-API-Key', 'stream-service-key');
  assert.equal((await revalidate())?.id, 1);
  getSettings().main.apiKey = 'rotated-stream-service-key';
  assert.equal(await revalidate(), null);
});
