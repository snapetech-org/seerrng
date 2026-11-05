import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';

import cacheManager from '@server/lib/cache';

import PlexTvAPI, {
  MAX_PLEX_RESOURCE_CONNECTIONS,
  MAX_PLEX_RESOURCE_DEVICES,
  MAX_PLEX_SHARED_USERS,
  MAX_PLEX_WATCHLIST_PAGE_SIZE,
  PLEXTV_HTTP_OPTIONS,
  PLEX_WATCHLIST_HYDRATION_CONCURRENCY,
  createPlexWatchlistPageCacheKey,
  isCacheablePlexWatchlistPage,
  normalizePlexWatchlistPage,
  parsePlexDevices,
  parsePlexSharedUsers,
  parsePlexWatchlistedAt,
  plexUserHasServerAccess,
  preparePlexWatchlistRatingKeys,
} from './plextv';

afterEach(() => {
  mock.restoreAll();
  cacheManager.getCache('plexwatchlist').data.flushAll();
});

describe('PLEXTV_HTTP_OPTIONS', () => {
  it('bounds outbound Plex.tv requests', () => {
    assert.equal(PLEXTV_HTTP_OPTIONS.timeout, 10_000);
    assert.equal(PLEXTV_HTTP_OPTIONS.maxContentLength, 1024 * 1024);
    assert.equal(PLEXTV_HTTP_OPTIONS.maxBodyLength, 1024);
    assert.equal(MAX_PLEX_SHARED_USERS, 250);
    assert.equal(MAX_PLEX_WATCHLIST_PAGE_SIZE, 100);
    assert.equal(PLEX_WATCHLIST_HYDRATION_CONCURRENCY, 10);
  });
});

describe('Plex resource response normalization', () => {
  it('drops device access tokens and bounds devices and connections', () => {
    const devices = parsePlexDevices({
      MediaContainer: {
        Device: Array.from(
          { length: MAX_PLEX_RESOURCE_DEVICES + 10 },
          (_, deviceIndex) => ({
            $: {
              name: `Server ${deviceIndex}`,
              product: 'Plex Media Server',
              clientIdentifier: `server-${deviceIndex}`,
              provides: 'server',
              owned: '1',
              accessToken: 'provider-device-secret',
            },
            Connection: Array.from(
              { length: MAX_PLEX_RESOURCE_CONNECTIONS + 10 },
              (_, connectionIndex) => ({
                $: {
                  protocol: 'https',
                  address: '192.0.2.1',
                  port: '32400',
                  uri: `https://server-${connectionIndex}.example.com:32400`,
                  local: '1',
                },
              })
            ),
          })
        ),
      },
    });

    assert.strictEqual(devices.length, MAX_PLEX_RESOURCE_DEVICES);
    assert.strictEqual(
      devices[0].connection.length,
      MAX_PLEX_RESOURCE_CONNECTIONS
    );
    assert.ok(!('accessToken' in devices[0]));
  });

  it('bounds shared users and exposes only selected account fields', () => {
    const response = parsePlexSharedUsers({
      MediaContainer: {
        User: Array.from(
          { length: MAX_PLEX_SHARED_USERS + 10 },
          (_, index) => ({
            $: {
              id: String(index + 1),
              title: `User ${index}`,
              username: `user-${index}`,
              email: `user-${index}@example.com`,
              thumb: 'https://example.com/avatar.jpg',
              authToken: 'provider-user-secret',
            },
            Server: [{ $: { machineIdentifier: 'machine' } }],
          })
        ),
      },
    });

    assert.strictEqual(
      response.MediaContainer.User.length,
      MAX_PLEX_SHARED_USERS
    );
    assert.ok(!('authToken' in response.MediaContainer.User[0].$));
    assert.deepStrictEqual(
      Object.keys(response.MediaContainer.User[0].$).sort(),
      ['email', 'id', 'thumb', 'title', 'username']
    );
  });
});

describe('Plex watchlist input bounds', () => {
  it('normalizes Plex watchlistedAt timestamps from seconds or milliseconds', () => {
    const milliseconds = Date.parse('2026-10-12T12:30:00.000Z');
    const seconds = milliseconds / 1000;

    assert.equal(parsePlexWatchlistedAt(seconds)?.getTime(), milliseconds);
    assert.equal(
      parsePlexWatchlistedAt(String(seconds))?.getTime(),
      milliseconds
    );
    assert.equal(parsePlexWatchlistedAt(milliseconds)?.getTime(), milliseconds);
    assert.equal(parsePlexWatchlistedAt(undefined), null);
    assert.equal(parsePlexWatchlistedAt(0), null);
    assert.equal(parsePlexWatchlistedAt(-1), null);
    assert.equal(parsePlexWatchlistedAt('not-a-timestamp'), null);
    assert.equal(parsePlexWatchlistedAt('9007199254740992'), null);
    assert.equal(parsePlexWatchlistedAt(9_000_000_000_000_000), null);
  });

  it('normalizes invalid and oversized page controls', () => {
    assert.deepEqual(normalizePlexWatchlistPage(-1, 0), {
      offset: 0,
      size: 20,
    });
    assert.deepEqual(normalizePlexWatchlistPage(2_000_000, 1_000), {
      offset: 1_000_000,
      size: 100,
    });
  });

  it('bounds and deduplicates untrusted upstream rating keys', () => {
    assert.deepEqual(
      preparePlexWatchlistRatingKeys(
        [
          { ratingKey: '1' },
          { ratingKey: '../users' },
          { ratingKey: '1' },
          { ratingKey: '2' },
          { ratingKey: '3' },
        ],
        2
      ),
      ['1', '2']
    );
    assert.deepEqual(preparePlexWatchlistRatingKeys({}), []);
  });

  it('uses separate conditional-response cache entries for every page', () => {
    assert.notEqual(
      createPlexWatchlistPageCacheKey('account', 0, 20),
      createPlexWatchlistPageCacheKey('account', 20, 20)
    );
  });

  it('caches watchlist timestamps by Plex credential without exposing tokens in cache keys', async () => {
    const response = {
      data: {
        MediaContainer: {
          UserState: [{ watchlistedAt: 1_792_103_400 }],
        },
      },
    };
    const firstAccount = new PlexTvAPI('first-private-token');
    const sameAccount = new PlexTvAPI('first-private-token');
    const otherAccount = new PlexTvAPI('second-private-token');
    type PlexRequestShape = {
      request: (...args: unknown[]) => Promise<{ data: unknown }>;
    };
    const firstRequest = mock.method(
      firstAccount as unknown as PlexRequestShape,
      'request',
      async () => response
    );
    const sameAccountRequest = mock.method(
      sameAccount as unknown as PlexRequestShape,
      'request',
      async () => response
    );
    const otherAccountRequest = mock.method(
      otherAccount as unknown as PlexRequestShape,
      'request',
      async () => ({
        data: {
          MediaContainer: {
            UserState: { watchlistedAt: 1_792_103_400 },
          },
        },
      })
    );

    const firstTimestamp = await firstAccount.getWatchlistedAt('93001');
    const cachedTimestamp = await sameAccount.getWatchlistedAt('93001');
    const otherAccountTimestamp = await otherAccount.getWatchlistedAt('93001');

    assert.equal(firstTimestamp?.getTime(), 1_792_103_400_000);
    assert.equal(cachedTimestamp?.getTime(), firstTimestamp?.getTime());
    assert.equal(otherAccountTimestamp?.getTime(), firstTimestamp?.getTime());
    assert.equal(firstRequest.mock.callCount(), 1);
    assert.equal(sameAccountRequest.mock.callCount(), 0);
    assert.equal(otherAccountRequest.mock.callCount(), 1);
    assert.equal(
      firstRequest.mock.calls[0].arguments[1],
      '/library/metadata/93001/userState'
    );
    assert.equal(
      (
        firstRequest.mock.calls[0].arguments[3] as
          { baseURL: string } | undefined
      )?.baseURL,
      'https://metadata.provider.plex.tv'
    );
    assert.ok(
      ![...cacheManager.getCache('plexwatchlist').data.keys()].some((key) =>
        key.includes('private-token')
      )
    );
  });

  it('rejects malformed rating keys before contacting Plex', async () => {
    const plexTv = new PlexTvAPI('test-token');
    const requestMock = mock.method(
      plexTv as unknown as {
        request: () => Promise<{ data: unknown }>;
      },
      'request',
      async () => ({ data: {} })
    );

    assert.equal(await plexTv.getWatchlistedAt('../users'), null);
    assert.equal(requestMock.mock.callCount(), 0);
  });
});

describe('plexUserHasServerAccess', () => {
  const sharedUser = {
    $: {
      id: '42',
      title: 'Friend',
      username: 'friend',
      email: 'friend@example.com',
      thumb: 'https://example.com/avatar.png',
    },
    Server: [
      {
        $: {
          id: '1',
          serverId: '1',
          machineIdentifier: 'target-machine',
          name: 'Plex',
          lastSeenAt: '0',
          numLibraries: '1',
          owned: '0',
        },
      },
    ],
  };

  it('uses the already-fetched shared-server list', () => {
    assert.equal(plexUserHasServerAccess(sharedUser, 'target-machine'), true);
    assert.equal(plexUserHasServerAccess(sharedUser, 'other-machine'), false);
    assert.equal(plexUserHasServerAccess(sharedUser, undefined), false);
    assert.equal(
      plexUserHasServerAccess({ ...sharedUser, Server: undefined }, 'target'),
      false
    );
  });
});

describe('Plex watchlist page caching guard', () => {
  it('accepts well-formed watchlist containers', () => {
    assert.equal(
      isCacheablePlexWatchlistPage({
        MediaContainer: { totalSize: 2, Metadata: [{ ratingKey: '1' }] },
      }),
      true
    );
    assert.equal(isCacheablePlexWatchlistPage({ MediaContainer: {} }), true);
  });

  it('rejects bodies that would pin a bad page behind an ETag', () => {
    for (const body of [
      undefined,
      null,
      '<html>gateway error</html>',
      [],
      {},
      { MediaContainer: 'oops' },
      { MediaContainer: { Metadata: 'nope' } },
      { MediaContainer: { totalSize: '3' } },
    ]) {
      assert.equal(isCacheablePlexWatchlistPage(body), false);
    }
  });
});

describe('Plex Discover hexadecimal watchlist keys', () => {
  const key = '5d7768244de0ee001fcc7fed';
  it('keeps numeric library keys and bounded hexadecimal Discover keys', () => {
    assert.deepEqual(
      preparePlexWatchlistRatingKeys([
        { ratingKey: key },
        { ratingKey: '123' },
        { ratingKey: key },
        { ratingKey: key.toUpperCase() },
        { ratingKey: '../users' },
        { ratingKey: `${key}/userState` },
        { ratingKey: `${key}?x=1` },
        { ratingKey: 'g'.repeat(24) },
        { ratingKey: 'a'.repeat(1000) },
      ]),
      [key, '123', key.toUpperCase()]
    );
  });

  it('hydrates and parses a Discover key and reads its watchlisted timestamp', async () => {
    const plexTv = new PlexTvAPI('fixture-only-token');
    type RequestShape = {
      request: (...args: unknown[]) => Promise<unknown>;
      getRolling: (...args: unknown[]) => Promise<unknown>;
    };
    const client = plexTv as unknown as RequestShape;
    const requestMock = mock.method(
      client,
      'request',
      async (_method: unknown, path: unknown) => {
        if (path === '/library/sections/watchlist/all')
          return {
            status: 200,
            headers: { etag: 'hex-key' },
            data: {
              MediaContainer: { totalSize: 1, Metadata: [{ ratingKey: key }] },
            },
          };
        assert.equal(path, `/library/metadata/${key}/userState`);
        return {
          data: {
            MediaContainer: { UserState: { watchlistedAt: 1792103400 } },
          },
        };
      }
    );
    const details = mock.method(client, 'getRolling', async (path: unknown) => {
      assert.equal(path, `/library/metadata/${key}`);
      return {
        MediaContainer: {
          Metadata: [
            {
              ratingKey: key,
              type: 'movie',
              title: 'Watchlist fixture',
              Guid: [{ id: 'tmdb://101' }],
            },
          ],
        },
      };
    });
    const result = await plexTv.getWatchlist();
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].ratingKey, key);
    assert.equal(result.items[0].tmdbId, 101);
    assert.equal(details.mock.callCount(), 1);
    assert.equal(
      (await plexTv.getWatchlistedAt(key))?.getTime(),
      1792103400000
    );
    assert.equal(requestMock.mock.callCount(), 2);
  });
});
