import JellyfinAPI, {
  type JellyfinLibraryItemExtended,
} from '@server/api/jellyfin';
import PlexAPI, { type PlexMetadata } from '@server/api/plexapi';
import { MediaStatus, MediaType } from '@server/constants/media';
import { MediaServerType } from '@server/constants/server';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import Season from '@server/entity/Season';
import { User } from '@server/entity/User';
import cacheManager from '@server/lib/cache';
import type { EpisodeAvailabilityForEpisode } from '@server/lib/episodeAvailability';
import { getSettings } from '@server/lib/settings';
import { resetTestDb, seedTestDb } from '@server/utils/seedTestDb';
import assert from 'node:assert/strict';
import { afterEach, before, beforeEach, describe, it, mock } from 'node:test';
import {
  applyUserMediaServerAvailability,
  getMediaServerAccessContext,
  getPresentationMediaServerAccessContext,
  restrictEpisodeAvailabilityForUser,
} from './mediaServerAvailability';

const media = (id = 1, tmdbId = 550) =>
  new Media({
    id,
    tmdbId,
    mediaType: MediaType.MOVIE,
    status: MediaStatus.AVAILABLE,
    status4k: MediaStatus.UNKNOWN,
    ratingKey: '42',
    serviceId: 1,
    requests: [],
    serviceStatuses: [],
  });
const metadata = (ratingKey = '42', tmdbId = 550) =>
  ({
    ratingKey,
    type: 'movie',
    Guid: [{ id: `tmdb://${tmdbId}` }],
  }) as PlexMetadata;
const context = async () => {
  const user = await getRepository(User).findOneByOrFail({ id: 1 });
  const scope = await getMediaServerAccessContext(user);
  assert.ok(scope);
  return scope;
};

before(async () => {
  await seedTestDb();
});
beforeEach(async () => {
  await resetTestDb();
  const settings = getSettings();
  settings.main.mediaServerType = MediaServerType.PLEX;
  settings.plex = {
    ...settings.plex,
    ip: '127.0.0.1',
    port: 32400,
    useSsl: false,
    machineId: 'availability-fixture',
  };
  cacheManager.getCache('mediaavailability').data.flushAll();
});
afterEach(() => {
  mock.restoreAll();
  cacheManager.getCache('mediaavailability').data.flushAll();
});

describe('viewer-scoped media-server availability', () => {
  it('keeps the scanned library state visible to an administrator', async () => {
    const admin = await getRepository(User).findOneByOrFail({ id: 1 });
    assert.equal(
      await getPresentationMediaServerAccessContext(admin),
      undefined
    );
    const item = media();
    await applyUserMediaServerAvailability(
      [item],
      await getPresentationMediaServerAccessContext(admin)
    );
    assert.equal(item.status, MediaStatus.AVAILABLE);
  });

  it('masks a denied TV response even when its season relation was not loaded', async () => {
    mock.method(PlexAPI.prototype, 'getMetadata', async () => {
      throw new Error('Fixture access denied');
    });
    const item = new Media({
      id: 1,
      tmdbId: 550,
      mediaType: MediaType.TV,
      status: MediaStatus.AVAILABLE,
      status4k: MediaStatus.UNKNOWN,
      ratingKey: '42',
    });
    await applyUserMediaServerAvailability([item], await context());
    assert.equal(item.status, MediaStatus.UNKNOWN);
    assert.equal(item.ratingKey, undefined);
  });

  it('does not reuse a cached native item for a different external media identity', async () => {
    const lookup = mock.method(PlexAPI.prototype, 'getMetadata', async () =>
      metadata()
    );
    const first = media(1, 550);
    const mismatched = media(2, 551);
    await applyUserMediaServerAvailability(
      [first, mismatched],
      await context()
    );
    assert.equal(first.status, MediaStatus.AVAILABLE);
    assert.equal(mismatched.status, MediaStatus.UNKNOWN);
    assert.equal(mismatched.ratingKey, undefined);
    assert.equal(lookup.mock.callCount(), 2);
  });

  it('fails closed when provider metadata cannot corroborate the requested identity', async () => {
    mock.method(PlexAPI.prototype, 'getMetadata', async () => ({
      ...metadata(),
      Guid: [],
    }));
    const item = media();
    await applyUserMediaServerAvailability([item], await context());
    assert.equal(item.status, MediaStatus.UNKNOWN);
  });

  it('keeps standard and 4K access independent', async () => {
    mock.method(PlexAPI.prototype, 'getMetadata', async (key: string) => {
      if (key === '43') throw new Error('Fixture 4K access denied');
      return metadata(key);
    });
    const item = media();
    item.status4k = MediaStatus.AVAILABLE;
    item.ratingKey4k = '43';
    await applyUserMediaServerAvailability([item], await context());
    assert.equal(item.status, MediaStatus.AVAILABLE);
    assert.equal(item.ratingKey, '42');
    assert.equal(item.status4k, MediaStatus.UNKNOWN);
    assert.equal(item.ratingKey4k, undefined);
  });

  it('bounds concurrent checks and hides items beyond the response budget', async () => {
    let active = 0;
    let peak = 0;
    const lookup = mock.method(
      PlexAPI.prototype,
      'getMetadata',
      async (key: string) => {
        active++;
        peak = Math.max(peak, active);
        await new Promise<void>((resolve) => setImmediate(resolve));
        active--;
        return metadata(key, Number(key));
      }
    );
    const items = Array.from({ length: 33 }, (_, i) => {
      const item = media(i + 1, i + 550);
      item.ratingKey = String(i + 550);
      return item;
    });
    await applyUserMediaServerAvailability(items, await context());
    assert.equal(lookup.mock.callCount(), 32);
    assert.ok(peak <= 8);
    assert.equal(items[31].status, MediaStatus.AVAILABLE);
    assert.equal(items[32].status, MediaStatus.UNKNOWN);
  });

  it('uses the current viewer credential and invalidates cached access after rotation', async () => {
    const seen: unknown[] = [];
    const firstScope = await context();
    mock.method(
      PlexAPI.prototype,
      'getMetadata',
      async function (this: PlexAPI) {
        const client = Reflect.get(this, 'axios') as {
          defaults: { headers: Record<string, unknown> };
        };
        const token = client.defaults.headers['X-Plex-Token'];
        seen.push(token);
        if (token === 'rotated-fixture-token')
          throw new Error('Fixture revoked access');
        return metadata();
      }
    );
    const allowed = media();
    await applyUserMediaServerAvailability([allowed], firstScope);
    assert.equal(allowed.status, MediaStatus.AVAILABLE);
    await getRepository(User).update(
      { id: 1 },
      { plexToken: 'rotated-fixture-token' }
    );
    const denied = media();
    await applyUserMediaServerAvailability([denied], await context());
    assert.equal(denied.status, MediaStatus.UNKNOWN);
    assert.deepEqual(seen, [firstScope.credential, 'rotated-fixture-token']);
  });

  it('snapshots Plex connection settings before asynchronous checks', async () => {
    const scope = await context();
    const originalHost = scope.plexSettings?.ip;
    getSettings().plex.ip = 'changed.example.test';
    assert.equal(scope.plexSettings?.ip, originalHost);
  });

  it('preserves unprojected local-account state when no linked context exists', async () => {
    const item = media();
    assert.equal(
      await applyUserMediaServerAvailability([item], undefined),
      false
    );
    assert.equal(item.status, MediaStatus.AVAILABLE);
  });
});

describe('Jellyfin viewer library projection', () => {
  const viewer = 'a'.repeat(32);
  const nativeId = 'b'.repeat(32);
  const setup = async () => {
    getSettings().main.mediaServerType = MediaServerType.JELLYFIN;
    await getRepository(User).update(
      { id: 1 },
      {
        jellyfinUserId: viewer,
        jellyfinAuthToken: 'viewer-fixture-token',
        jellyfinDeviceId: 'fixture-device',
      }
    );
    const entry = media();
    entry.jellyfinMediaId = nativeId;
    return entry;
  };
  it('does not count a user-visible native item belonging to another TMDB title', async () => {
    const entry = await setup();
    mock.method(
      JellyfinAPI.prototype,
      'getUserItemForAvailabilityCheck',
      async (id: string, userId: string) => {
        assert.equal(id, nativeId);
        assert.equal(userId, viewer);
        return {
          Id: nativeId,
          Type: 'Movie',
          ProviderIds: { Tmdb: '551' },
        } as JellyfinLibraryItemExtended;
      }
    );
    await applyUserMediaServerAvailability([entry], await context());
    assert.equal(entry.status, MediaStatus.UNKNOWN);
    assert.equal(entry.jellyfinMediaId, undefined);
  });
  it('does not replace a missing viewer token with the server key', async () => {
    const entry = await setup();
    await getRepository(User).update({ id: 1 }, { jellyfinAuthToken: null });
    getSettings().jellyfin.apiKey = 'server-fixture-key';
    const scope = await context();
    assert.equal(scope.credential, undefined);
    const lookup = mock.method(
      JellyfinAPI.prototype,
      'getUserItemForAvailabilityCheck',
      async (id: string, userId: string) => {
        assert.equal(id, nativeId);
        assert.equal(userId, viewer);
        return {
          Id: nativeId,
          Type: 'Movie',
          ProviderIds: { Tmdb: '550' },
        } as JellyfinLibraryItemExtended;
      }
    );
    await applyUserMediaServerAvailability([entry], scope);
    assert.equal(lookup.mock.callCount(), 0);
    assert.equal(entry.status, MediaStatus.UNKNOWN);
    assert.equal(entry.jellyfinMediaId, undefined);
  });
  it('only exposes seasons visible through the linked viewer account', async () => {
    const entry = await setup();
    entry.mediaType = MediaType.TV;
    entry.seasons = [1, 2].map(
      (seasonNumber) =>
        new Season({
          seasonNumber,
          status: MediaStatus.AVAILABLE,
          status4k: MediaStatus.UNKNOWN,
        })
    );
    mock.method(
      JellyfinAPI.prototype,
      'getUserItemForAvailabilityCheck',
      async () =>
        ({
          Id: nativeId,
          Type: 'Series',
          ProviderIds: { Tmdb: '550' },
        }) as JellyfinLibraryItemExtended
    );
    mock.method(
      JellyfinAPI.prototype,
      'getUserSeasons',
      async (id: string, userId: string) => {
        assert.equal(id, nativeId);
        assert.equal(userId, viewer);
        return [
          {
            Id: 'c'.repeat(32),
            Type: 'Season',
            IndexNumber: 1,
            Name: 'Season 1',
            ProviderIds: {},
          },
        ];
      }
    );
    await applyUserMediaServerAvailability([entry], await context());
    assert.equal(entry.status, MediaStatus.PARTIALLY_AVAILABLE);
    assert.equal(entry.seasons[0].status, MediaStatus.AVAILABLE);
    assert.equal(entry.seasons[1].status, MediaStatus.UNKNOWN);
  });
});

const episodeBadges = (): Map<number, EpisodeAvailabilityForEpisode> =>
  new Map(
    [1, 2].map((number) => [
      number,
      {
        sources: [
          { sourceType: 'plex', hd: true, fourK: true },
          { sourceType: 'sonarr', hd: true, fourK: false },
        ],
      },
    ])
  );
it('projects episode badges through viewer-visible episode files and quality', async () => {
  const show = new Media({ ...media(), mediaType: MediaType.TV });
  mock.method(
    PlexAPI.prototype,
    'getMetadata',
    async () =>
      ({
        ...metadata(),
        type: 'show',
        Children: { Metadata: [{ type: 'season', index: 1 }] },
      }) as PlexMetadata
  );
  mock.method(
    PlexAPI.prototype,
    'getAllLeavesMetadata',
    async () =>
      [
        {
          type: 'episode',
          parentIndex: 1,
          index: 1,
          Media: [{ width: 1920, height: 1080 }],
        },
      ] as PlexMetadata[]
  );
  const badges = episodeBadges();
  await restrictEpisodeAvailabilityForUser(badges, show, await context(), 1);
  assert.deepEqual(badges.get(1)?.sources, [
    { sourceType: 'plex', hd: true, fourK: false },
    { sourceType: 'sonarr', hd: true, fourK: false },
  ]);
  assert.deepEqual(badges.get(2)?.sources, [
    { sourceType: 'sonarr', hd: true, fourK: false },
  ]);
});
it('does not reveal global episode files after viewer access fails', async () => {
  mock.method(PlexAPI.prototype, 'getMetadata', async () => {
    throw new Error('Fixture denied');
  });
  const badges = episodeBadges();
  await restrictEpisodeAvailabilityForUser(
    badges,
    new Media({ ...media(), mediaType: MediaType.TV }),
    await context(),
    1
  );
  for (const episode of badges.values())
    assert.deepEqual(episode.sources, [
      { sourceType: 'sonarr', hd: true, fourK: false },
    ]);
});
