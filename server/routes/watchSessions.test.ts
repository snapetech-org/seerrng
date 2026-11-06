import ExternalAPI from '@server/api/externalapi';
import { getRepository } from '@server/datasource';
import { User } from '@server/entity/User';
import { UserSettings } from '@server/entity/UserSettings';
import { WatchSession } from '@server/entity/WatchSession';
import { WatchSessionBallot } from '@server/entity/WatchSessionBallot';
import { WatchSessionCandidate } from '@server/entity/WatchSessionCandidate';
import { WatchSessionMember } from '@server/entity/WatchSessionMember';
import { Permission } from '@server/lib/permissions';
import { getSettings } from '@server/lib/settings';
import { checkUser, isAuthenticated } from '@server/middleware/auth';
import { setupTestDb } from '@server/test/db';
import express, { type Express } from 'express';
import session from 'express-session';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { afterEach, before, beforeEach, describe, it, mock } from 'node:test';
import request from 'supertest';
import authRoutes from './auth';
import watchSessionRoutes from './watchSessions';

let app: Express;
const originalAgeGate = getSettings().main.ageGate;
before(() => {
  app = express();
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
  app.use('/watch-sessions', isAuthenticated(), watchSessionRoutes);
  app.use(
    (
      error: { status?: number; message?: string },
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction
    ) => {
      void _next; // Express identifies error middleware by its four arguments.
      res.status(error.status ?? 500).json({ message: error.message });
    }
  );
});
setupTestDb();
beforeEach(() => {
  getSettings().main.localLogin = true;
});
afterEach(() => {
  mock.restoreAll();
  getSettings().main.ageGate = originalAgeGate;
});
const login = async (email: string) => {
  const agent = request.agent(app);
  assert.equal(
    (await agent.post('/auth/local').send({ email, password: 'test1234' }))
      .status,
    200
  );
  return agent;
};
const users = async () => ({
  owner: await getRepository(User).findOneByOrFail({
    email: 'admin@seerr.dev',
  }),
  member: await getRepository(User).findOneByOrFail({
    email: 'friend@seerr.dev',
  }),
});
const activeSession = async (owner: User, members: User[]) => {
  const group = await getRepository(WatchSession).save(
    new WatchSession({
      ownerId: owner.id,
      title: 'Private fixture',
      status: 'active',
      memberCount: members.length,
      filters: { genreIds: [], ranking: 'popularity.desc' },
      nextDiscoverPage: 6,
      watchlistCandidatesLoaded: true,
      expiresAt: new Date(Date.now() + 60_000),
    })
  );
  await getRepository(WatchSessionMember).save(
    members.map(
      (user) =>
        new WatchSessionMember({
          sessionId: group.id,
          userId: user.id,
          role: user.id === owner.id ? 'owner' : 'member',
          includeWatchlistContributions: false,
        })
    )
  );
  const candidate = await getRepository(WatchSessionCandidate).save(
    new WatchSessionCandidate({ sessionId: group.id, tmdbId: 970001 })
  );
  return { group, candidate };
};
const movieResponse = (id = 970001, certification = 'R') => {
  mock.method(
    ExternalAPI.prototype as unknown as {
      get: (...args: unknown[]) => Promise<unknown>;
    },
    'get',
    async () => ({
      id,
      title: 'Restricted fixture',
      original_title: 'Restricted fixture',
      adult: false,
      release_date: '2020-01-01',
      genres: [],
      release_dates: {
        results: [{ iso_3166_1: 'US', release_dates: [{ certification }] }],
      },
      videos: { results: [] },
    })
  );
};

describe('private watch-session permission and maturity boundaries', () => {
  it('allows a movie-only requester to create a private session', async () => {
    const { member } = await users();
    member.permissions = Permission.REQUEST_MOVIE;
    await getRepository(User).save(member);
    const agent = await login(member.email);
    const res = await agent.post('/watch-sessions').send({
      title: 'Movie-only session',
      filters: { genreIds: [], ranking: 'popularity.desc' },
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.session.ownerId, member.id);
  });
  it("does not expose another member's restricted title in the shared deck", async () => {
    const { owner, member } = await users();
    await getRepository(UserSettings).save({
      user: member,
      movieMaturityRatingLimit: 'PG',
    });
    const { group } = await activeSession(owner, [owner, member]);
    movieResponse();
    const res = await (
      await login(owner.email)
    ).get(`/watch-sessions/${group.id}/deck`);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.candidates, []);
  });
  it('preserves candidate identities and ballots when the group temporarily blocks a title', async () => {
    const { owner, member } = await users();
    member.contentRestricted = true;
    await getRepository(User).save(member);
    getSettings().main.ageGate = {
      ...originalAgeGate,
      maxMovieCertification: 'PG',
      maxTvCertification: 'TV-PG',
      certificationCountry: 'US',
      defaultRestricted: false,
    };
    const { group, candidate } = await activeSession(owner, [owner, member]);
    await getRepository(WatchSessionBallot).save(
      new WatchSessionBallot({
        sessionId: group.id,
        candidateId: candidate.id,
        userId: member.id,
        decision: 'want',
      })
    );
    movieResponse();
    const res = await (
      await login(owner.email)
    ).get(`/watch-sessions/${group.id}/deck`);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.candidates, []);
    assert(
      await getRepository(WatchSessionCandidate).findOneBy({
        id: candidate.id,
      }),
      'temporary policy filtering must preserve the shared candidate'
    );
    assert.equal(
      await getRepository(WatchSessionBallot).count(),
      1,
      'temporary policy filtering must preserve private ballots'
    );
  });
  it('fails closed on mismatched provider identity and preserves the stored candidate', async () => {
    const { owner } = await users();
    const { group, candidate } = await activeSession(owner, [owner]);
    movieResponse(970002);
    const res = await (
      await login(owner.email)
    ).get(`/watch-sessions/${group.id}/deck`);
    assert.equal(res.status, 500);
    assert(
      await getRepository(WatchSessionCandidate).findOneBy({ id: candidate.id })
    );
  });
  it('keeps sessions private even from administrators who are not members', async () => {
    const { owner, member } = await users();
    const { group } = await activeSession(member, [member]);
    const res = await (
      await login(owner.email)
    ).get(`/watch-sessions/${group.id}`);
    assert.equal(res.status, 404);
  });
  for (const endpoint of ['deck', 'my-ballots', 'matches']) {
    it(`applies the strictest participant cap on ${endpoint} without deleting votes`, async () => {
      const { owner, member } = await users();
      await getRepository(UserSettings).save({
        user: member,
        movieMaturityRatingLimit: 'PG',
      });
      const { group, candidate } = await activeSession(owner, [owner, member]);
      await getRepository(WatchSessionBallot).save(
        [owner, member].map(
          (user) =>
            new WatchSessionBallot({
              sessionId: group.id,
              candidateId: candidate.id,
              userId: user.id,
              decision: 'want',
            })
        )
      );
      movieResponse();
      const res = await (
        await login(owner.email)
      ).get(`/watch-sessions/${group.id}/${endpoint}`);
      assert.equal(res.status, 200);
      assert.deepEqual(
        res.body[
          endpoint === 'deck'
            ? 'candidates'
            : endpoint === 'my-ballots'
              ? 'ballots'
              : 'matches'
        ],
        []
      );
      assert.equal(await getRepository(WatchSessionBallot).count(), 2);
    });
  }
  it('rejects a restricted ballot without revealing the candidate', async () => {
    const { owner, member } = await users();
    await getRepository(UserSettings).save({
      user: member,
      movieMaturityRatingLimit: 'PG',
    });
    const { group, candidate } = await activeSession(owner, [owner, member]);
    movieResponse();
    const res = await (
      await login(owner.email)
    )
      .put(`/watch-sessions/${group.id}/candidates/${candidate.id}/ballot`)
      .send({ decision: 'want' });
    assert.equal(res.status, 404);
    assert.equal(await getRepository(WatchSessionBallot).count(), 0);
  });
  it('fails closed on unknown certification for a capped participant', async () => {
    const { owner, member } = await users();
    await getRepository(UserSettings).save({
      user: member,
      movieMaturityRatingLimit: 'PG',
    });
    const { group } = await activeSession(owner, [owner, member]);
    movieResponse(970001, '');
    const res = await (
      await login(owner.email)
    ).get(`/watch-sessions/${group.id}/deck`);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.candidates, []);
    assert.equal(res.body.hasMore, false);
  });
  it('reveals a preserved title after a temporary maturity cap is removed', async () => {
    const { owner, member } = await users();
    const settings = await getRepository(UserSettings).save({
      user: member,
      movieMaturityRatingLimit: 'PG',
    });
    const { group, candidate } = await activeSession(owner, [owner, member]);
    movieResponse();
    const agent = await login(owner.email);
    assert.deepEqual(
      (await agent.get(`/watch-sessions/${group.id}/deck`)).body.candidates,
      []
    );
    await getRepository(UserSettings).update(settings.id, {
      movieMaturityRatingLimit: null,
    });
    const res = await agent.get(`/watch-sessions/${group.id}/deck`);
    assert.equal(res.status, 200);
    assert.equal(res.body.candidates[0].candidateId, candidate.id);
    assert.equal(res.body.hasMore, false);
  });
  for (const permission of [Permission.NONE, Permission.REQUEST_TV]) {
    it(`denies non-movie request access (${permission})`, async () => {
      const { member } = await users();
      member.permissions = permission;
      await getRepository(User).save(member);
      const res = await (
        await login(member.email)
      )
        .post('/watch-sessions')
        .send({
          title: 'Forbidden',
          filters: { genreIds: [], ranking: 'popularity.desc' },
        });
      assert.equal(res.status, 403);
    });
  }
  it('fills the deck past hidden candidates without falsely advertising more pages', async () => {
    const { owner, member } = await users();
    await getRepository(UserSettings).save({
      user: member,
      movieMaturityRatingLimit: 'PG',
    });
    const { group } = await activeSession(owner, [owner, member]);
    await getRepository(WatchSessionCandidate).save(
      Array.from(
        { length: 25 },
        (_, index) =>
          new WatchSessionCandidate({
            sessionId: group.id,
            tmdbId: 980000 + index,
          })
      )
    );
    mock.method(
      ExternalAPI.prototype as unknown as {
        get: (...args: unknown[]) => Promise<unknown>;
      },
      'get',
      async (endpoint: string) => ({
        id: Number(endpoint.split('/').at(-1)),
        title: 'Safe fixture',
        adult: false,
        genres: [],
        videos: { results: [] },
        release_dates: {
          results: [
            {
              iso_3166_1: 'US',
              release_dates: [
                { certification: endpoint.endsWith('970001') ? 'R' : 'PG' },
              ],
            },
          ],
        },
      })
    );
    const agent = await login(owner.email);
    const first = await agent.get(`/watch-sessions/${group.id}/deck`);
    assert.equal(first.status, 200);
    assert.equal(first.body.candidates.length, 20);
    assert.equal(first.body.hasMore, true);
    for (const card of first.body.candidates) {
      assert.notEqual(card.id, 970001);
      assert.equal(
        (
          await agent
            .put(
              `/watch-sessions/${group.id}/candidates/${card.candidateId}/ballot`
            )
            .send({ decision: 'pass' })
        ).status,
        200
      );
    }
    const last = await agent.get(`/watch-sessions/${group.id}/deck`);
    assert.equal(last.status, 200);
    assert.equal(last.body.candidates.length, 5);
    assert.equal(last.body.hasMore, false);
    assert.equal(await getRepository(WatchSessionCandidate).count(), 26);
  });
  it('keeps invite digests private, consumes invitations once and locks draft preferences at start', async () => {
    const { owner, member } = await users();
    const ownerAgent = await login(owner.email);
    const memberAgent = await login(member.email);
    const created = await ownerAgent.post('/watch-sessions').send({
      title: 'Invitation lifecycle',
      filters: { genreIds: [], ranking: 'popularity.desc' },
    });
    assert.equal(created.status, 201);
    const id = created.body.session.id;
    const invite = await ownerAgent
      .post(`/watch-sessions/${id}/invites`)
      .send({});
    assert.equal(invite.status, 201);
    assert.match(invite.body.token, /^[A-Za-z0-9_-]{43}$/);
    const listed = await ownerAgent.get(`/watch-sessions/${id}/invites`);
    assert.equal(listed.status, 200);
    assert(!JSON.stringify(listed.body).includes(invite.body.token));
    assert(!JSON.stringify(listed.body).includes('tokenHash'));
    assert.equal(
      (
        await memberAgent
          .post('/watch-sessions/invites/accept')
          .send({ token: invite.body.token })
      ).status,
      200
    );
    assert.equal(
      (
        await memberAgent
          .post('/watch-sessions/invites/accept')
          .send({ token: invite.body.token })
      ).status,
      404
    );
    assert.equal(
      (
        await memberAgent
          .put(`/watch-sessions/${id}/preferences`)
          .send({ includeWatchlistContributions: true })
      ).status,
      200
    );
    assert.equal(
      (await ownerAgent.post(`/watch-sessions/${id}/start`).send({})).status,
      200
    );
    assert.equal(
      (
        await ownerAgent.put(`/watch-sessions/${id}`).send({
          title: 'Late change',
          filters: { genreIds: [], ranking: 'popularity.desc' },
        })
      ).status,
      409
    );
    assert.equal(
      (
        await memberAgent
          .put(`/watch-sessions/${id}/preferences`)
          .send({ includeWatchlistContributions: false })
      ).status,
      409
    );
    const current = await ownerAgent.get(`/watch-sessions/${id}`);
    assert.equal(current.body.session.status, 'active');
    assert.equal(current.body.session.title, 'Invitation lifecycle');
    assert(!JSON.stringify(current.body).includes(member.email));
    assert.equal(
      (await ownerAgent.post(`/watch-sessions/${id}/invites`).send({})).status,
      409
    );
  });
});
