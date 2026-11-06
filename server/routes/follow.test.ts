import ExternalAPI from '@server/api/externalapi';
import { getRepository } from '@server/datasource';
import Follow from '@server/entity/Follow';
import FollowEvent from '@server/entity/FollowEvent';
import { User } from '@server/entity/User';
import { UserSettings } from '@server/entity/UserSettings';
import { getSettings } from '@server/lib/settings';
import { checkUser, isAuthenticated } from '@server/middleware/auth';
import { setupTestDb } from '@server/test/db';
import express from 'express';
import session from 'express-session';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { afterEach, before, describe, it, mock } from 'node:test';
import request from 'supertest';
import authRoutes from './auth';
import followRoutes from './follow';

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
  app.use('/follow', isAuthenticated(), followRoutes);
});
setupTestDb();
afterEach(() => mock.restoreAll());
const login = async (email = 'friend@seerr.dev') => {
  getSettings().main.localLogin = true;
  const agent = request.agent(app);
  assert.equal(
    (await agent.post('/auth/local').send({ email, password: 'test1234' }))
      .status,
    200
  );
  return agent;
};
const seedEvent = async () => {
  const user = await getRepository(User).findOneByOrFail({
    email: 'friend@seerr.dev',
  });
  const follow = await getRepository(Follow).save(
    new Follow({
      user,
      kind: 'tmdb-person',
      subjectKey: 'tmdb:person:99',
      subjectLabel: 'Person fixture',
    })
  );
  const event = await getRepository(FollowEvent).save(
    new FollowEvent({
      user,
      follow,
      dedupeKey: 'fixture-movie',
      reasonKey: 'upcomingVideoTitle',
      title: 'Private fixture film',
      reasonValues: { title: 'Private fixture film' },
      target: { mediaType: 'movie', id: '970001' },
    })
  );
  return { user, event };
};
const metadata = () =>
  mock.method(
    ExternalAPI.prototype as unknown as {
      get: (...args: unknown[]) => Promise<unknown>;
    },
    'get',
    async () => ({
      id: 970001,
      title: 'Private fixture film',
      adult: false,
      genres: [],
      keywords: { keywords: [] },
      release_dates: {
        results: [
          { iso_3166_1: 'US', release_dates: [{ certification: 'R' }] },
        ],
      },
      videos: { results: [] },
    })
  );
describe('personal follow feed policy', () => {
  it('rechecks the current account cap without erasing stored events', async () => {
    const { user, event } = await seedEvent();
    metadata();
    const agent = await login();
    const before = await agent.get('/follow/events');
    assert.equal(before.status, 200);
    assert.equal(before.body.results[0].id, event.id);
    await getRepository(UserSettings).save({
      user,
      movieMaturityRatingLimit: 'PG',
    });
    const after = await agent.get('/follow/events');
    assert.equal(after.status, 200);
    assert.deepEqual(after.body.results, []);
    assert(await getRepository(FollowEvent).findOneBy({ id: event.id }));
  });
  it('does not expose another account’s events to an administrator', async () => {
    await seedEvent();
    metadata();
    const res = await (await login('admin@seerr.dev')).get('/follow/events');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.results, []);
  });
  for (const query of [
    'take=invalid',
    'take=1&take=2',
    'skip=-1',
    'skip=Infinity',
  ]) {
    it(`bounds malformed pagination (${query})`, async () => {
      const { user, event } = await seedEvent();
      await getRepository(FollowEvent).save(
        Array.from(
          { length: 35 },
          (_, index) =>
            new FollowEvent({
              user,
              follow: event.follow,
              dedupeKey: `page-${index}`,
              title: 'Bounded page fixture',
              reasonKey: 'newVideoTitle',
            })
        )
      );
      const res = await (await login()).get(`/follow/events?${query}`);
      assert.equal(res.status, 200);
      assert.equal(res.body.results.length, 30);
      assert.equal(res.body.total, 36);
    });
  }
});
