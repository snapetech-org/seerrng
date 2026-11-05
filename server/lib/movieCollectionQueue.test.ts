import TheMovieDb from '@server/api/themoviedb';
import {
  MediaRequestStatus,
  MediaStatus,
  MediaType,
} from '@server/constants/media';
import { MediaServerType } from '@server/constants/server';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import MediaRequest from '@server/entity/MediaRequest';
import { MovieCollectionQueue } from '@server/entity/MovieCollectionQueue';
import { User } from '@server/entity/User';
import * as watch from '@server/lib/mediaServerWatchStatus';
import { Permission } from '@server/lib/permissions';
import { getSettings } from '@server/lib/settings';
import { setupTestDb } from '@server/test/db';
import assert from 'node:assert/strict';
import { afterEach, beforeEach, it, mock } from 'node:test';
import queues from './movieCollectionQueue';
setupTestDb();
let restore: () => void;
beforeEach(async () => {
  const settings = getSettings();
  const main = { ...settings.main };
  const plex = { ...settings.plex };
  restore = () => {
    settings.main = main;
    settings.plex = plex;
  };
  settings.main.mediaServerType = MediaServerType.PLEX;
  settings.main.enable4k = true;
  settings.main.enabledMediaCategories = {
    ...settings.main.enabledMediaCategories,
    movie: true,
  };
  await getRepository(User).update(1, {
    plexToken: 'fixture',
    plexId: 1,
    permissions: Permission.ADMIN,
  });
  mock.method(
    TheMovieDb.prototype,
    'getCollection',
    async ({ collectionId }: { collectionId: number }) => ({
      id: collectionId,
      name: 'Fixture',
      parts: [
        { id: 103, release_date: '2020-01-01' },
        { id: 101, release_date: '2000-01-01' },
        { id: 102, release_date: '2010-01-01' },
      ],
    })
  );
});
afterEach(() => {
  restore();
  mock.restoreAll();
});
const start = async (bufferSize = 1) =>
  queues.start(
    await getRepository(User)
      .createQueryBuilder('user')
      .addSelect(['user.plexToken', 'user.jellyfinAuthToken'])
      .where('user.id = :id', { id: 1 })
      .getOneOrFail(),
    55,
    false,
    bufferSize
  );
const movie = (id: number) =>
  getRepository(Media).save(
    new Media({
      tmdbId: id,
      mediaType: MediaType.MOVIE,
      status: MediaStatus.AVAILABLE,
      ratingKey: String(id),
    })
  );
it('snapshots release order and only admits the first movie through normal request policy', async () => {
  const request = mock.method(
    MediaRequest,
    'request',
    async () => new MediaRequest({ id: 100 })
  );
  const queue = await start();
  assert.deepEqual(queue.movieIds, [101, 102, 103]);
  await queues.reconcile(queue.id);
  assert.equal(request.mock.callCount(), 1);
  assert.deepEqual(request.mock.calls[0].arguments[0], {
    mediaType: 'movie',
    mediaId: 101,
    is4k: false,
  });
  const options = request.mock.calls[0].arguments[2];
  assert.equal(options?.expectedMediaServerUserAuthority?.userId, 1);
  assert.equal(options?.isAutoRequest, undefined);
  assert.deepEqual(
    (
      await getRepository(MovieCollectionQueue).findOneByOrFail({
        id: queue.id,
      })
    ).requestedIds,
    [101]
  );
});
it('keeps one unwatched movie ahead and advances only after the owner watch history confirms it', async () => {
  const queue = await start();
  await movie(101);
  let played = false;
  const watched = mock.method(watch, 'getMediaServerWatchStatus', async () => ({
    serverType: MediaServerType.PLEX,
    availableCount: 1,
    watchedCount: played ? 1 : 0,
    unwatchedCount: played ? 0 : 1,
  }));
  const request = mock.method(
    MediaRequest,
    'request',
    async () => new MediaRequest({ id: 100 })
  );
  await queues.reconcile(queue.id);
  assert.equal(request.mock.callCount(), 0);
  played = true;
  await queues.reconcile(queue.id);
  assert.equal(request.mock.callCount(), 1);
  assert.equal(request.mock.calls[0].arguments[0]?.mediaId, 102);
  assert.equal(watched.mock.calls[0].arguments[1]?.id, 1);
  assert.deepEqual(
    (
      await getRepository(MovieCollectionQueue).findOneByOrFail({
        id: queue.id,
      })
    ).watchedIds,
    [101]
  );
});
it('fills a two-movie buffer and counts pending approval as buffered', async () => {
  const queue = await start(2);
  const item = await movie(101);
  await getRepository(Media).update(item.id, {
    status: MediaStatus.PENDING,
    ratingKey: null,
  });
  await getRepository(MediaRequest).save(
    new MediaRequest({
      type: MediaType.MOVIE,
      media: item,
      requestedBy: await getRepository(User).findOneByOrFail({ id: 2 }),
      status: MediaRequestStatus.PENDING,
      is4k: false,
    })
  );
  mock.method(watch, 'getMediaServerWatchStatus', async () => ({
    serverType: MediaServerType.PLEX,
    availableCount: 0,
    watchedCount: 0,
    unwatchedCount: 0,
  }));
  const request = mock.method(
    MediaRequest,
    'request',
    async () => new MediaRequest({ id: 100 })
  );
  await queues.reconcile(queue.id);
  assert.equal(request.mock.callCount(), 1);
  assert.equal(request.mock.calls[0].arguments[0]?.mediaId, 102);
});
it('waits when normal request admission refuses quota, permissions or destinations', async () => {
  const queue = await start();
  mock.method(MediaRequest, 'request', async () => {
    throw Error('policy refused');
  });
  await queues.reconcile(queue.id);
  const stored = await getRepository(MovieCollectionQueue).findOneByOrFail({
    id: queue.id,
  });
  assert.equal(stored.status, 'waiting');
  assert.equal(stored.reason, 'request-policy');
  assert.deepEqual(stored.requestedIds, []);
});
it('preserves deliberate cancellation instead of re-requesting a processed movie', async () => {
  const queue = await start();
  await getRepository(MovieCollectionQueue).update(queue.id, {
    requestedIds: [101],
  });
  const request = mock.method(
    MediaRequest,
    'request',
    async () => new MediaRequest({ id: 100 })
  );
  await queues.reconcile(queue.id);
  const stored = await getRepository(MovieCollectionQueue).findOneByOrFail({
    id: queue.id,
  });
  assert.equal(stored.status, 'stopped');
  assert.equal(stored.reason, 'request-cancelled');
  assert.equal(request.mock.callCount(), 0);
});
for (const scenario of [
  'unlinked',
  'revoked',
  'stopped',
  'changed-server',
  'changed-token',
  'history-unavailable',
] as const) {
  it(`does not request the next movie when ${scenario}`, async () => {
    const queue = await start();
    const request = mock.method(
      MediaRequest,
      'request',
      async () => new MediaRequest({ id: 100 })
    );
    if (scenario === 'unlinked')
      await getRepository(User).update(1, { plexToken: null });
    if (scenario === 'revoked')
      await getRepository(User).update(1, { permissions: Permission.NONE });
    if (scenario === 'stopped')
      await getRepository(MovieCollectionQueue).update(queue.id, {
        status: 'stopped',
      });
    if (scenario.startsWith('changed-') || scenario === 'history-unavailable') {
      await movie(101);
      mock.method(watch, 'getMediaServerWatchStatus', async () => {
        if (scenario === 'changed-server')
          getSettings().plex.machineId = 'other-server';
        if (scenario === 'changed-token')
          await getRepository(User).update(1, { plexToken: 'rotated' });
        if (scenario === 'history-unavailable') throw Error('unavailable');
        return {
          serverType: MediaServerType.PLEX,
          availableCount: 1,
          watchedCount: 1,
          unwatchedCount: 0,
        };
      });
    }
    await queues.reconcile(queue.id);
    assert.equal(request.mock.callCount(), 0);
  });
}
it('bounds watched-history reads and persists progress for later checks', async () => {
  const queue = await start();
  await getRepository(MovieCollectionQueue).update(queue.id, {
    movieIds: [101, 102, 103],
  });
  await Promise.all([101, 102, 103].map(movie));
  const history = mock.method(watch, 'getMediaServerWatchStatus', async () => ({
    serverType: MediaServerType.PLEX,
    availableCount: 1,
    watchedCount: 1,
    unwatchedCount: 0,
  }));
  await queues.reconcile(queue.id, { remaining: 2 });
  assert.equal(history.mock.callCount(), 2);
  let stored = await getRepository(MovieCollectionQueue).findOneByOrFail({
    id: queue.id,
  });
  assert.deepEqual(stored.watchedIds, [101, 102]);
  assert.equal(stored.status, 'active');
  await queues.reconcile(queue.id, { remaining: 2 });
  stored = await getRepository(MovieCollectionQueue).findOneByOrFail({
    id: queue.id,
  });
  assert.equal(history.mock.callCount(), 3);
  assert.equal(stored.status, 'completed');
});
it('refuses an overlapping enrollment and permits an explicit restart after stopping', async () => {
  const queue = await start();
  await assert.rejects(start(), /Stop the existing/);
  await getRepository(MovieCollectionQueue).update(queue.id, {
    status: 'stopped',
    requestedIds: [101],
  });
  const restarted = await start(2);
  assert.equal(restarted.id, queue.id);
  assert.equal(restarted.bufferSize, 2);
  assert.deepEqual(restarted.requestedIds, []);
});

it('holds an unconfirmed interrupted admission instead of automatically recreating a possibly cancelled request', async () => {
  const queue = await start();
  await getRepository(MovieCollectionQueue).update(queue.id, {
    admittingMovieId: 101,
  });
  const request = mock.method(
    MediaRequest,
    'request',
    async () => new MediaRequest({ id: 100 })
  );
  await queues.reconcile(queue.id);
  const stored = await getRepository(MovieCollectionQueue).findOneByOrFail({
    id: queue.id,
  });
  assert.equal(stored.status, 'stopped');
  assert.equal(request.mock.callCount(), 0);
});

it('serializes stop with in-flight work and makes no later admissions after stop returns', async () => {
  const queue = await start();
  let entered!: () => void;
  let release!: () => void;
  const began = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  const request = mock.method(MediaRequest, 'request', async () => {
    entered();
    await hold;
    return new MediaRequest({ id: 100 });
  });
  const running = queues.reconcile(queue.id);
  await began;
  const stopped = queues.stop(1, 55, false);
  release();
  await Promise.all([running, stopped]);
  await queues.reconcile(queue.id);
  assert.equal(request.mock.callCount(), 1);
  assert.equal(
    (
      await getRepository(MovieCollectionQueue).findOneByOrFail({
        id: queue.id,
      })
    ).status,
    'stopped'
  );
});

it('waits for a failed queued request to be repaired without treating it as cancellation', async () => {
  const queue = await start();
  const item = await movie(101);
  await getRepository(Media).update(item.id, {
    status: MediaStatus.UNKNOWN,
    ratingKey: null,
  });
  await getRepository(MediaRequest).save(
    new MediaRequest({
      type: MediaType.MOVIE,
      media: item,
      requestedBy: await getRepository(User).findOneByOrFail({ id: 1 }),
      status: MediaRequestStatus.FAILED,
      is4k: false,
    })
  );
  await getRepository(MovieCollectionQueue).update(queue.id, {
    requestedIds: [101],
  });
  const request = mock.method(
    MediaRequest,
    'request',
    async () => new MediaRequest({ id: 100 })
  );
  await queues.reconcile(queue.id);
  const stored = await getRepository(MovieCollectionQueue).findOneByOrFail({
    id: queue.id,
  });
  assert.equal(stored.status, 'waiting');
  assert.equal(stored.reason, 'request-policy');
  assert.equal(request.mock.callCount(), 0);
});
