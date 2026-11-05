import TheMovieDb from '@server/api/themoviedb';
import type { TmdbMovieResult } from '@server/api/themoviedb/interfaces';
import { getRepository } from '@server/datasource';
import { MovieCollectionQueue } from '@server/entity/MovieCollectionQueue';
import { User } from '@server/entity/User';
import { Permission } from '@server/lib/permissions';
import { getSettings } from '@server/lib/settings';
import { setupTestDb } from '@server/test/db';
import * as tasks from '@server/utils/backgroundTasks';
import express from 'express';
import * as OpenApiValidator from 'express-openapi-validator';
import path from 'node:path';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import collectionRoutes from './collection';
setupTestDb();
const part = (id: number, release_date: string): TmdbMovieResult => ({
  id,
  release_date,
  media_type: 'movie',
  title: 'Fixture',
  original_title: 'Fixture',
  adult: false,
  video: false,
  popularity: 0,
  vote_count: 0,
  vote_average: 0,
  genre_ids: [],
  overview: '',
  original_language: 'en',
});
const app = (actorId = 1, version?: number) => {
  const instance = express();
  instance.use(express.json());
  instance.use(async (req, _res, next) => {
    req.user = new User({ id: actorId, permissions: Permission.ADMIN });
    if (version !== undefined)
      req.session = {
        userId: actorId,
        credentialVersion: version,
      } as express.Request['session'];
    next();
  });
  instance.use(
    OpenApiValidator.middleware({
      apiSpec: path.join(process.cwd(), 'seerr-api.yml'),
      validateRequests: true,
      validateResponses: true,
      validateSecurity: false,
    })
  );
  instance.use('/api/v1/collection', collectionRoutes);
  instance.use(
    (
      error: { status?: number; message?: string },
      _req: express.Request,
      res: express.Response,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      _next: express.NextFunction
    ) => res.status(error.status ?? 500).json({ message: error.message })
  );
  return instance;
};
let restore: () => void;
beforeEach(async () => {
  const settings = getSettings();
  const original = { ...settings.main };
  restore = () => {
    settings.main = original;
  };
  settings.main.mediaServerType = 1;
  settings.main.enabledMediaCategories = {
    ...settings.main.enabledMediaCategories,
    movie: true,
  };
  await getRepository(User).update(1, {
    plexId: 1,
    plexToken: 'fixture',
    permissions: Permission.ADMIN,
  });
  vi.spyOn(TheMovieDb.prototype, 'getCollection').mockResolvedValue({
    id: 55,
    name: 'Fixture',
    parts: [
      part(103, '2020-01-01'),
      part(101, '2000-01-01'),
      part(102, '2010-01-01'),
    ],
  });
  vi.spyOn(tasks, 'trackBackgroundTask').mockImplementation(() => undefined);
});
afterEach(() => {
  restore();
  vi.restoreAllMocks();
});
describe('progressive collection queue API', () => {
  it('enrolls only the current owner through the real schema and returns bounded progress', async () => {
    const created = await request(app())
      .post('/api/v1/collection/55/queue')
      .send({ is4k: false, bufferSize: 2 });
    expect(created.status).toBe(202);
    expect(created.body.queue.bufferSize).toBe(2);
    const stored = await getRepository(MovieCollectionQueue).findOneOrFail({
      where: { collectionId: 55 },
      relations: { user: true },
    });
    expect(stored.user.id).toBe(1);
    expect(stored.movieIds).toEqual([101, 102, 103]);
    const read = await request(app()).get(
      '/api/v1/collection/55/queue?is4k=false'
    );
    expect(read.status).toBe(200);
    expect(read.body.queue.total).toBe(3);
    expect(read.body.queue).not.toHaveProperty('movieIds');
  });
  it('does not expose or stop another user enrollment', async () => {
    await request(app())
      .post('/api/v1/collection/55/queue')
      .send({ is4k: false, bufferSize: 1 });
    const read = await request(app(2)).get('/api/v1/collection/55/queue');
    expect(read.body.queue).toBeNull();
    expect(
      (await request(app(2)).delete('/api/v1/collection/55/queue')).status
    ).toBe(204);
    expect(
      (
        await getRepository(MovieCollectionQueue).findOneByOrFail({
          collectionId: 55,
        })
      ).status
    ).toBe('active');
  });
  it('rejects malformed buffers, qualities and client-supplied ownership or destinations', async () => {
    for (const body of [
      { is4k: false, bufferSize: 0 },
      { is4k: false, bufferSize: 3 },
      { is4k: 'false', bufferSize: 1 },
      { is4k: false, bufferSize: '1' },
      { is4k: false, bufferSize: 1, userId: 2 },
      { is4k: false, bufferSize: 1, ignoreQuota: true },
      { is4k: false, bufferSize: 1, serverId: 3 },
    ]) {
      expect(
        (await request(app()).post('/api/v1/collection/55/queue').send(body))
          .status,
        JSON.stringify(body)
      ).toBe(400);
    }
    expect(await getRepository(MovieCollectionQueue).count()).toBe(0);
  });
  it('rechecks persisted request access instead of trusting the middleware snapshot', async () => {
    await getRepository(User).update(1, { permissions: Permission.NONE });
    expect(
      (
        await request(app())
          .post('/api/v1/collection/55/queue')
          .send({ is4k: false, bufferSize: 1 })
      ).status
    ).toBe(403);
  });
  it('rejects a stale credential version at mutation admission', async () => {
    await getRepository(User).update(1, { passwordChangedAt: new Date(1000) });
    expect(
      (
        await request(app(1, 0))
          .post('/api/v1/collection/55/queue')
          .send({ is4k: false, bufferSize: 1 })
      ).status
    ).toBe(403);
  });
  it('keeps a stopped enrollment and permits an explicit restart', async () => {
    await request(app())
      .post('/api/v1/collection/55/queue')
      .send({ is4k: false, bufferSize: 1 });
    expect(
      (
        await request(app())
          .post('/api/v1/collection/55/queue')
          .send({ is4k: false, bufferSize: 2 })
      ).status
    ).toBe(409);
    expect(
      (await request(app()).delete('/api/v1/collection/55/queue?is4k=false'))
        .status
    ).toBe(204);
    expect(
      (
        await request(app())
          .post('/api/v1/collection/55/queue')
          .send({ is4k: false, bufferSize: 2 })
      ).status
    ).toBe(202);
    expect(await getRepository(MovieCollectionQueue).count()).toBe(1);
  });
});
