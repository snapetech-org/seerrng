import {
  MediaRequestStatus,
  MediaStatus,
  MediaType,
} from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import { MediaAvailabilitySubscription } from '@server/entity/MediaAvailabilitySubscription';
import { MediaRequest } from '@server/entity/MediaRequest';
import Season from '@server/entity/Season';
import SeasonRequest from '@server/entity/SeasonRequest';
import { User } from '@server/entity/User';
import requestDispatchManager from '@server/lib/requestDispatch';
import { getSettings } from '@server/lib/settings';
import { checkUser } from '@server/middleware/auth';
import { setupTestDb } from '@server/test/db';
import express from 'express';
import session from 'express-session';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import request from 'supertest';
import authRoutes from './auth';
import requestIntentRoutes from './requestIntent';

setupTestDb();

const app = express();
app.use(express.json());
app.use(
  session({
    secret: 'request-intent-test',
    resave: false,
    saveUninitialized: false,
  })
);
app.use(checkUser);
app.use('/auth', authRoutes);
app.use('/request/intent', requestIntentRoutes);

async function login(email: string) {
  getSettings().main.localLogin = true;
  const agent = request.agent(app);
  assert.equal(
    (await agent.post('/auth/local').send({ email, password: 'test1234' }))
      .status,
    200
  );
  return agent;
}

describe('small title request projection', () => {
  it('masks disabled categories even when the caller knows an exact TMDB id', async (t) => {
    const settings = getSettings();
    const old = settings.main.enabledMediaCategories?.movie;
    settings.main.enabledMediaCategories = {
      ...settings.main.enabledMediaCategories,
      movie: false,
    } as typeof settings.main.enabledMediaCategories;
    t.after(() => {
      settings.main.enabledMediaCategories = {
        ...settings.main.enabledMediaCategories,
        movie: old ?? true,
      } as typeof settings.main.enabledMediaCategories;
    });
    const movie = await getRepository(Media).save(
      new Media({
        mediaType: MediaType.MOVIE,
        tmdbId: 918,
        status: MediaStatus.AVAILABLE,
        status4k: MediaStatus.UNKNOWN,
      })
    );
    assert.ok(movie.id);
    const agent = await login('friend@seerr.dev');
    const response = await agent
      .post('/request/intent/state')
      .send({ items: [{ mediaType: 'movie', tmdbId: 918 }] });
    assert.equal(response.status, 200);
    assert.equal(response.body.items[0].status, null);
    assert.equal(response.body.items[0].canRequest, false);
  });
  it('requires authentication and rejects unbounded or invalid identities', async () => {
    assert.equal(
      (
        await request(app)
          .post('/request/intent/state')
          .send({ items: [{ mediaType: 'movie', tmdbId: 1 }] })
      ).status,
      403
    );
    const agent = await login('friend@seerr.dev');
    assert.equal(
      (
        await agent
          .post('/request/intent/state')
          .send({ items: Array(41).fill({ mediaType: 'movie', tmdbId: 1 }) })
      ).status,
      400
    );
    assert.equal(
      (
        await agent
          .post('/request/intent/state')
          .send({ items: [{ mediaType: 'book', tmdbId: 1 }] })
      ).status,
      400
    );
  });

  it('separates overlapping movie/TV IDs and exposes only viewer-specific claims', async (t) => {
    t.mock.method(requestDispatchManager, 'enqueue', async () => undefined);
    const owner = await getRepository(User).findOneByOrFail({
      email: 'friend@seerr.dev',
    });
    const other = await getRepository(User).findOneByOrFail({
      email: 'demo@seerr.dev',
    });
    const movie = await getRepository(Media).save(
      new Media({
        mediaType: MediaType.MOVIE,
        tmdbId: 911,
        status: MediaStatus.PENDING,
        status4k: MediaStatus.UNKNOWN,
      })
    );
    const tv = await getRepository(Media).save(
      new Media({
        mediaType: MediaType.TV,
        tmdbId: 911,
        status: MediaStatus.UNKNOWN,
        status4k: MediaStatus.UNKNOWN,
      })
    );
    await getRepository(Season).save(
      new Season({
        media: Promise.resolve(tv),
        seasonNumber: 2,
        status: MediaStatus.UNKNOWN,
      })
    );
    await getRepository(MediaRequest).save(
      new MediaRequest({
        type: MediaType.MOVIE,
        media: movie,
        requestedBy: other,
        status: MediaRequestStatus.PENDING,
        is4k: false,
      })
    );
    await getRepository(MediaRequest).save(
      new MediaRequest({
        type: MediaType.TV,
        media: tv,
        requestedBy: owner,
        status: MediaRequestStatus.APPROVED,
        is4k: false,
        seasons: [
          new SeasonRequest({
            seasonNumber: 2,
            status: MediaRequestStatus.APPROVED,
          }),
        ],
      })
    );
    await getRepository(MediaAvailabilitySubscription).save(
      new MediaAvailabilitySubscription({ media: movie, user: owner })
    );
    assert.equal(
      (
        await getRepository(MediaRequest).findOneByOrFail({
          media: { id: tv.id },
        })
      ).status,
      MediaRequestStatus.APPROVED
    );

    const agent = await login('friend@seerr.dev');
    const response = await agent.post('/request/intent/state').send({
      items: [
        { mediaType: 'tv', tmdbId: 911 },
        { mediaType: 'movie', tmdbId: 911 },
        { mediaType: 'tv', tmdbId: 911 },
      ],
    });
    assert.equal(response.status, 200);
    assert.equal(response.body.items.length, 2);
    assert.equal(
      response.body.items[0].standard.own,
      'approved',
      JSON.stringify(response.body)
    );
    assert.equal(response.body.items[0].seasons[0].standard.own, 'approved');
    assert.equal(response.body.items[0].standard.other, null);
    assert.equal(response.body.items[1].standard.own, null);
    assert.equal(response.body.items[1].standard.other, 'pending');
    assert.equal(response.body.items[1].subscribed, true);
    assert.equal(response.body.items[1].canSubscribe, true);
    assert.equal(JSON.stringify(response.body).includes(other.email), false);
    assert.equal(JSON.stringify(response.body).includes('requestedBy'), false);
  });

  it('offers a standard alert when only the 4K copy is available', async (t) => {
    t.mock.method(requestDispatchManager, 'enqueue', async () => undefined);
    const other = await getRepository(User).findOneByOrFail({
      email: 'demo@seerr.dev',
    });
    const movie = await getRepository(Media).save(
      new Media({
        mediaType: MediaType.MOVIE,
        tmdbId: 912,
        status: MediaStatus.PENDING,
        status4k: MediaStatus.AVAILABLE,
      })
    );
    await getRepository(MediaRequest).save(
      new MediaRequest({
        type: MediaType.MOVIE,
        media: movie,
        requestedBy: other,
        status: MediaRequestStatus.PENDING,
        is4k: false,
      })
    );
    const agent = await login('friend@seerr.dev');
    const response = await agent.post('/request/intent/state').send({
      items: [{ mediaType: 'movie', tmdbId: 912 }],
    });
    assert.equal(response.status, 200);
    assert.equal(response.body.items[0].canSubscribe, true);
    assert.equal(response.body.items[0].standard.other, 'pending');
  });
});
