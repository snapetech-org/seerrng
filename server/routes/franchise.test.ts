import { getRepository } from '@server/datasource';
import MediaRelation from '@server/entity/MediaRelation';
import { getSettings } from '@server/lib/settings';
import { checkUser, isAuthenticated } from '@server/middleware/auth';
import { setupTestDb } from '@server/test/db';
import express from 'express';
import session from 'express-session';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { before, it } from 'node:test';
import request from 'supertest';
import authRoutes from './auth';
import franchiseRoutes from './franchise';

setupTestDb();

const app = express();
before(() => {
  app.use(express.json());
  app.use(
    session({
      secret: randomBytes(32).toString('hex'),
      resave: false,
      saveUninitialized: false,
    })
  );
  app.use(checkUser);
  app.use('/auth', authRoutes);
  app.use('/franchise', isAuthenticated(), franchiseRoutes);
});

async function signIn(email: string) {
  const agent = request.agent(app);
  await agent
    .post('/auth/local')
    .send({ email, password: 'test1234' })
    .expect(200);
  return agent;
}

it('persists exact Lumen links for an authorized franchise curator', async () => {
  getSettings().main.localLogin = true;
  const curator = await signIn('admin@seerr.dev');
  const viewer = await signIn('friend@seerr.dev');
  const repository = getRepository(MediaRelation);
  for (const target of [
    {
      toType: 'game',
      toId: '42',
      href: '/game/game/42',
      title: 'Fixture Game',
    },
    {
      toType: 'book',
      toId: 'bookshelf:1:aGM6MjYwNDY4',
      href: '/book/bookshelf%3A1%3AaGM6MjYwNDY4',
      title: 'Fixture Volume',
    },
  ]) {
    const { href, title, ...identity } = target;
    const relation = {
      fromType: 'anime',
      fromId: '712',
      relation: 'same-franchise' as const,
      ...identity,
    };
    await viewer
      .post('/franchise/relations')
      .send({ ...relation, href, title })
      .expect(403);
    assert.equal(await repository.existsBy(relation), false);
    await curator
      .post('/franchise/relations')
      .send({ ...relation, href, title })
      .expect(201);
    const persisted = await repository.findOneByOrFail(relation);
    assert.equal(persisted.data?.href, href);
    assert.equal(persisted.verified, true);
  }
});
