import PlexTvAPI from '@server/api/plextv';
import {
  MediaRequestStatus,
  MediaStatus,
  MediaType,
} from '@server/constants/media';
import * as datasource from '@server/datasource';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import { MediaRequest } from '@server/entity/MediaRequest';
import { PlexWatchlistSyncEntry } from '@server/entity/PlexWatchlistSyncEntry';
import { User } from '@server/entity/User';
import { UserSettings } from '@server/entity/UserSettings';
import { Permission } from '@server/lib/permissions';
import { runUserSecurityMutation } from '@server/lib/userSecurityMutation';
import watchlistSync, {
  fetchPlexWatchlistForSync,
  MAX_PLEX_WATCHLIST_SYNC_ITEMS,
  WatchlistSync,
} from '@server/lib/watchlistsync';
import { setupTestDb } from '@server/test/db';
import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';

setupTestDb();

afterEach(() => {
  mock.restoreAll();
});

describe('Plex watchlist credential admission', () => {
  it('does not overlap scheduled sync runs', async () => {
    await configureAutoRequestUser('movie');
    let markStarted!: () => void;
    let finishFetch!: () => void;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const fetchGate = new Promise<void>((resolve) => {
      finishFetch = resolve;
    });
    const getWatchlist = mock.method(
      PlexTvAPI.prototype,
      'getWatchlist',
      async () => {
        markStarted();
        await fetchGate;
        return { offset: 0, size: 20, totalSize: 0, items: [] };
      }
    );

    const firstSync = watchlistSync.syncWatchlist();
    await started;
    await watchlistSync.syncWatchlist();
    finishFetch();
    await firstSync;

    assert.equal(getWatchlist.mock.callCount(), 1);
  });

  it('does not use a token removed after user enumeration', async () => {
    let queryCount = 0;
    const createQueryBuilder = () => {
      queryCount += 1;
      return {
        select() {
          return this;
        },
        addSelect() {
          return this;
        },
        leftJoinAndSelect() {
          return this;
        },
        where() {
          return this;
        },
        andWhere() {
          return this;
        },
        orderBy() {
          return this;
        },
        take() {
          return this;
        },
        async getMany() {
          return [
            {
              id: 9,
              plexToken: 'retired-token',
              permissions: Permission.AUTO_REQUEST,
              settings: { watchlistSyncMovies: true },
            },
          ];
        },
        async getOne() {
          return { id: 9, plexToken: null };
        },
      };
    };
    mock.method(datasource, 'getRepository', () => ({ createQueryBuilder }));
    const getWatchlist = mock.method(
      PlexTvAPI.prototype,
      'getWatchlist',
      async () => ({ items: [], totalSize: 0 }) as never
    );

    await watchlistSync.syncWatchlist();

    assert.strictEqual(queryCount, 2);
    assert.strictEqual(getWatchlist.mock.callCount(), 0);
  });

  it('does not create requests from a token retired after the watchlist fetch', async () => {
    const userRepository = getRepository(User);
    const settingsRepository = getRepository(UserSettings);
    const requestRepository = getRepository(MediaRequest);
    const user = await userRepository.findOneByOrFail({ id: 1 });
    const friend = await userRepository.findOneByOrFail({ id: 2 });

    user.permissions = Permission.AUTO_REQUEST_MOVIE;
    user.plexToken = 'active-watchlist-token';
    user.settings = await settingsRepository.save(
      new UserSettings({ user, watchlistSyncMovies: true })
    );
    friend.plexToken = null;
    await userRepository.save([user, friend]);

    mock.method(PlexTvAPI.prototype, 'getWatchlist', async () => ({
      items: [
        {
          ratingKey: 'plex-movie-1',
          tmdbId: 101,
          type: 'movie',
          title: 'Retired Token Movie',
        },
      ],
      totalSize: 1,
    }));
    mock.method(Media, 'getRelatedMedia', async () => {
      await runUserSecurityMutation(user.id, () =>
        userRepository
          .update(user.id, { plexToken: null })
          .then(() => undefined)
      );
      return [];
    });
    mock.method(
      PlexTvAPI.prototype,
      'getWatchlistedAt',
      async () => new Date('2026-10-12T10:00:00.000Z')
    );

    await watchlistSync.syncWatchlist();

    assert.strictEqual(await requestRepository.count(), 0);
  });

  it('does not recreate a deleted movie request for the same Plex list entry', async () => {
    const user = await configureAutoRequestUser('movie');
    const item = {
      ratingKey: '93001',
      tmdbId: 93001,
      type: 'movie' as const,
      title: 'Kept Deleted Movie',
    };
    const addedAt = new Date('2026-10-12T11:00:00.000Z');
    mock.method(PlexTvAPI.prototype, 'getWatchlist', async () => ({
      offset: 0,
      size: 20,
      totalSize: 1,
      items: [item],
    }));
    mock.method(PlexTvAPI.prototype, 'getWatchlistedAt', async () => addedAt);
    mock.method(Media, 'getRelatedMedia', async () => []);
    const requestMock = mock.method(
      MediaRequest,
      'request',
      async () => ({ id: 1 }) as never
    );

    await watchlistSync.syncWatchlist();
    await watchlistSync.syncWatchlist();

    assert.equal(requestMock.mock.callCount(), 1);
    const entry = await getRepository(PlexWatchlistSyncEntry).findOneByOrFail({
      requestedBy: { id: user.id },
      sourcePlexId: user.plexId ?? 0,
      tmdbId: item.tmdbId,
      mediaType: MediaType.MOVIE,
    });
    assert.equal(entry.watchlistedAt.getTime(), addedAt.getTime());
  });

  it('uses existing auto-request history to avoid a duplicate on upgrade', async () => {
    const user = await configureAutoRequestUser('movie');
    const item = {
      ratingKey: '93004',
      tmdbId: 93004,
      type: 'movie' as const,
      title: 'Previously Requested Movie',
    };
    const addedAt = new Date('2026-10-12T11:00:00.000Z');
    const media = await getRepository(Media).save(
      new Media({
        tmdbId: item.tmdbId,
        mediaType: MediaType.MOVIE,
        status: MediaStatus.DELETED,
      })
    );
    await getRepository(MediaRequest).save(
      new MediaRequest({
        media,
        requestedBy: user,
        status: MediaRequestStatus.FAILED,
        type: MediaType.MOVIE,
        isAutoRequest: true,
        createdAt: new Date(addedAt.getTime() + 30_000),
      })
    );
    mock.method(PlexTvAPI.prototype, 'getWatchlist', async () => ({
      offset: 0,
      size: 20,
      totalSize: 1,
      items: [item],
    }));
    mock.method(PlexTvAPI.prototype, 'getWatchlistedAt', async () => addedAt);
    mock.method(Media, 'getRelatedMedia', async () => []);
    const requestMock = mock.method(
      MediaRequest,
      'request',
      async () => ({ id: 1 }) as never
    );

    await watchlistSync.syncWatchlist();

    assert.equal(requestMock.mock.callCount(), 0);
    const entry = await getRepository(PlexWatchlistSyncEntry).findOneByOrFail({
      requestedBy: { id: user.id },
      sourcePlexId: user.plexId ?? 0,
      tmdbId: item.tmdbId,
      mediaType: MediaType.MOVIE,
    });
    assert.equal(entry.watchlistedAt.getTime(), addedAt.getTime());
  });

  it('keeps tracking separate when a Seerr user changes Plex accounts', async () => {
    const user = await configureAutoRequestUser('movie');
    const item = {
      ratingKey: '93005',
      tmdbId: 93005,
      type: 'movie' as const,
      title: 'Account-specific Movie',
    };
    const addedAt = new Date('2026-10-12T11:00:00.000Z');
    mock.method(PlexTvAPI.prototype, 'getWatchlist', async () => ({
      offset: 0,
      size: 20,
      totalSize: 1,
      items: [item],
    }));
    mock.method(PlexTvAPI.prototype, 'getWatchlistedAt', async () => addedAt);
    mock.method(Media, 'getRelatedMedia', async () => []);
    const requestMock = mock.method(
      MediaRequest,
      'request',
      async () => ({ id: 1 }) as never
    );

    await watchlistSync.syncWatchlist();
    const firstPlexId = user.plexId;
    assert.ok(firstPlexId);
    const media = await getRepository(Media).save(
      new Media({
        tmdbId: item.tmdbId,
        mediaType: MediaType.MOVIE,
        status: MediaStatus.DELETED,
      })
    );
    await getRepository(MediaRequest).save(
      new MediaRequest({
        media,
        requestedBy: user,
        status: MediaRequestStatus.FAILED,
        type: MediaType.MOVIE,
        isAutoRequest: true,
        createdAt: new Date(addedAt.getTime() + 30_000),
      })
    );
    user.plexId = (firstPlexId ?? 0) + 100;
    user.plexToken = 'second-watchlist-token';
    await getRepository(User).save(user);
    await watchlistSync.syncWatchlist();

    assert.equal(requestMock.mock.callCount(), 2);
    const entries = await getRepository(PlexWatchlistSyncEntry).find({
      where: { requestedBy: { id: user.id }, tmdbId: item.tmdbId },
    });
    assert.deepEqual(
      entries.map((entry) => entry.sourcePlexId).sort(),
      [firstPlexId, user.plexId].sort()
    );
  });

  it('starts a new request cycle when a Plex Watchlist entry is re-added', async () => {
    await configureAutoRequestUser('movie');
    const item = {
      ratingKey: '93002',
      tmdbId: 93002,
      type: 'movie' as const,
      title: 'Re-added Movie',
    };
    let addedAt = new Date('2026-10-12T11:00:00.000Z');
    mock.method(PlexTvAPI.prototype, 'getWatchlist', async () => ({
      offset: 0,
      size: 20,
      totalSize: 1,
      items: [item],
    }));
    mock.method(PlexTvAPI.prototype, 'getWatchlistedAt', async () => addedAt);
    mock.method(Media, 'getRelatedMedia', async () => []);
    const requestMock = mock.method(
      MediaRequest,
      'request',
      async () => ({ id: 1 }) as never
    );

    await watchlistSync.syncWatchlist();
    addedAt = new Date('2026-10-12T12:00:00.000Z');
    await watchlistSync.syncWatchlist();

    assert.equal(requestMock.mock.callCount(), 2);
  });

  it('tracks TV seasons separately so new seasons are requested without restoring deleted ones', async () => {
    await configureAutoRequestUser('tv');
    const item = {
      ratingKey: '93003',
      tmdbId: 93003,
      tvdbId: 193003,
      type: 'show' as const,
      title: 'Tracked Series',
    };
    const addedAt = new Date('2026-10-12T11:00:00.000Z');
    let seasons = [1, 2];
    const sync = new WatchlistSync(async () => seasons);
    const requestBodies: Parameters<typeof MediaRequest.request>[0][] = [];
    mock.method(PlexTvAPI.prototype, 'getWatchlist', async () => ({
      offset: 0,
      size: 20,
      totalSize: 1,
      items: [item],
    }));
    mock.method(PlexTvAPI.prototype, 'getWatchlistedAt', async () => addedAt);
    mock.method(Media, 'getRelatedMedia', async () => []);
    mock.method(
      MediaRequest,
      'request',
      async (body: Parameters<typeof MediaRequest.request>[0]) => {
        requestBodies.push(body);
        return { id: requestBodies.length } as never;
      }
    );

    await sync.syncWatchlist();
    seasons = [1, 2, 3];
    await sync.syncWatchlist();

    assert.deepEqual(
      requestBodies.map((body) => body.seasons),
      [[1, 2], [3]]
    );
    const entry = await getRepository(PlexWatchlistSyncEntry).findOneByOrFail({
      tmdbId: item.tmdbId,
      mediaType: MediaType.TV,
    });
    assert.deepEqual(entry.processedSeasonNumbers, [1, 2, 3]);
  });
});

describe('Plex watchlist sync pagination', () => {
  it('fetches subsequent pages and deduplicates items across them', async () => {
    const offsets: number[] = [];
    const item = (ratingKey: string, tmdbId: number) => ({
      ratingKey,
      tmdbId,
      type: 'movie' as const,
      title: `Movie ${tmdbId}`,
    });
    const response = await fetchPlexWatchlistForSync({
      getWatchlist: async ({ offset = 0, size = 20 } = {}) => {
        offsets.push(offset);
        return {
          offset,
          size,
          totalSize: 150,
          items:
            offset === 0
              ? [item('first', 1), item('duplicate', 2)]
              : [item('duplicate-again', 2), item('second-page', 3)],
        };
      },
    });

    assert.deepStrictEqual(offsets, [0, 100]);
    assert.deepStrictEqual(
      response.items.map(({ tmdbId }) => tmdbId),
      [1, 2, 3]
    );
    assert.strictEqual(response.truncated, false);
  });

  it('caps provider pagination at the scheduled sync item limit', async () => {
    const offsets: number[] = [];
    const response = await fetchPlexWatchlistForSync({
      getWatchlist: async ({ offset = 0, size = 20 } = {}) => {
        offsets.push(offset);
        return {
          offset,
          size,
          totalSize: 1_000_000,
          items: Array.from({ length: size }, (_, index) => ({
            ratingKey: `${offset + index}`,
            tmdbId: offset + index + 1,
            type: 'movie' as const,
            title: `Movie ${offset + index + 1}`,
          })),
        };
      },
    });

    assert.deepStrictEqual(offsets, [0, 100]);
    assert.strictEqual(response.items.length, MAX_PLEX_WATCHLIST_SYNC_ITEMS);
    assert.strictEqual(response.truncated, true);
  });
});

async function configureAutoRequestUser(mediaType: 'movie' | 'tv') {
  const userRepository = getRepository(User);
  const settingsRepository = getRepository(UserSettings);
  const users = await userRepository
    .createQueryBuilder('user')
    .addSelect('user.plexToken')
    .getMany();
  const user = users.find((candidate) => candidate.id === 1);
  assert.ok(user);

  for (const candidate of users) {
    if (candidate.id !== user.id) {
      candidate.plexToken = null;
      await userRepository.save(candidate);
    }
  }

  user.plexId = 9_300_000 + (mediaType === 'movie' ? 1 : 2);
  user.plexToken = 'active-watchlist-token';
  user.permissions =
    mediaType === 'movie'
      ? Permission.AUTO_REQUEST_MOVIE
      : Permission.AUTO_REQUEST_TV;
  user.settings = await settingsRepository.save(
    new UserSettings({
      user,
      watchlistSyncMovies: mediaType === 'movie',
      watchlistSyncTv: mediaType === 'tv',
    })
  );
  return userRepository.save(user);
}
