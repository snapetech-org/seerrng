import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
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
  plexUserHasServerAccess,
  preparePlexWatchlistRatingKeys,
} from './plextv';

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
