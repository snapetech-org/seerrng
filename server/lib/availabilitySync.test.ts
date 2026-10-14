import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import type {
  JellyfinLibraryItem,
  JellyfinLibraryItemExtended,
} from '@server/api/jellyfin';
import JellyfinAPI from '@server/api/jellyfin';
import type { PlexMetadata } from '@server/api/plexapi';
import PlexAPI from '@server/api/plexapi';
import RadarrAPI from '@server/api/servarr/radarr';
import SonarrAPI from '@server/api/servarr/sonarr';
import { MediaStatus, MediaType } from '@server/constants/media';
import { MediaServerType } from '@server/constants/server';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import Season from '@server/entity/Season';
import { User } from '@server/entity/User';
import type { RadarrSettings, SonarrSettings } from '@server/lib/settings';
import { getSettings } from '@server/lib/settings';
import { runUserSecurityMutation } from '@server/lib/userSecurityMutation';
import { setupTestDb } from '@server/test/db';
import { In } from 'typeorm';

// --- Mock JellyfinAPI ---
let getSystemInfoImpl: () => Promise<Record<string, unknown>> = async () => ({
  ServerName: 'Test',
});
let getItemDataImpl: (
  id: string
) => Promise<JellyfinLibraryItemExtended | undefined> = async () => undefined;
let jellyfinSeasonLookupIds: string[] = [];
let jellyfinEpisodeLookupIds: string[] = [];
let getDeletionItemImpl: (
  id: string
) => Promise<JellyfinLibraryItemExtended | undefined> = async () => undefined;
let deletionMovieIds: number[] = [];
Object.defineProperty(RadarrAPI.prototype, 'getMovies', {
  get: () => async () => deletionMovieIds.map((tmdbId) => ({ tmdbId })),
  set() {},
  configurable: true,
});
Object.defineProperty(SonarrAPI.prototype, 'getSeries', {
  get: () => async () => [],
  set() {},
  configurable: true,
});
Object.defineProperty(JellyfinAPI.prototype, 'getItemDataForDeletionCheck', {
  get: () => async (id: string) => getDeletionItemImpl(id),
  set() {},
  configurable: true,
});
Object.defineProperty(JellyfinAPI.prototype, 'getSystemInfo', {
  get() {
    return async () => getSystemInfoImpl();
  },
  set() {},
  configurable: true,
});

Object.defineProperty(JellyfinAPI.prototype, 'getItemData', {
  get() {
    return async (id: string) => getItemDataImpl(id);
  },
  set() {},
  configurable: true,
});

Object.defineProperty(JellyfinAPI.prototype, 'getSeasons', {
  get() {
    return async (seriesId: string): Promise<JellyfinLibraryItem[]> => {
      jellyfinSeasonLookupIds.push(seriesId);
      return [];
    };
  },
  set() {},
  configurable: true,
});

Object.defineProperty(JellyfinAPI.prototype, 'getEpisodes', {
  get() {
    return async (
      seriesId: string,
      seasonId: string
    ): Promise<JellyfinLibraryItem[]> => {
      void seasonId;
      jellyfinEpisodeLookupIds.push(seriesId);
      return [];
    };
  },
  set() {},
  configurable: true,
});

Object.defineProperty(JellyfinAPI.prototype, 'setUserId', {
  get() {
    return () => {};
  },
  set() {},
  configurable: true,
});

// --- Mock PlexAPI ---
let getMetadataImpl: (
  key: string,
  options?: { includeChildren?: boolean }
) => Promise<PlexMetadata> = async () => {
  throw new Error('404');
};
let getChildrenMetadataImpl: (
  key: string
) => Promise<PlexMetadata[]> = async () => [];
let getChildrenMetadataCalls: string[] = [];

Object.defineProperty(PlexAPI.prototype, 'getMetadata', {
  get() {
    return async (key: string, options?: { includeChildren?: boolean }) =>
      getMetadataImpl(key, options);
  },
  set() {},
  configurable: true,
});

Object.defineProperty(PlexAPI.prototype, 'getChildrenMetadata', {
  get() {
    return async (key: string) => {
      getChildrenMetadataCalls.push(key);
      return getChildrenMetadataImpl(key);
    };
  },
  set() {},
  configurable: true,
});

import availabilitySync from '@server/lib/availabilitySync';

setupTestDb();

function configureSonarr(overrides: Partial<SonarrSettings>[] = [{}]): void {
  const settings = getSettings();
  settings.sonarr = overrides.map((o, i) => ({
    id: i,
    name: `Sonarr ${i}`,
    hostname: 'localhost',
    port: 8989,
    apiKey: 'test-key',
    baseUrl: '',
    useSsl: false,
    activeProfileId: 1,
    activeDirectory: '/tv',
    activeLanguageProfileId: 1,
    activeAnimeProfileId: undefined,
    activeAnimeDirectory: '',
    activeAnimeLanguageProfileId: undefined,
    animeTags: [],
    is4k: false,
    enableSeasonFolders: true,
    tags: [],
    isDefault: i === 0,
    syncEnabled: true,
    preventSearch: false,
    externalUrl: '',
    ...o,
  })) as SonarrSettings[];
  settings.radarr = [];
}

function configureJellyfin(): void {
  const settings = getSettings();
  settings.main.mediaServerType = MediaServerType.JELLYFIN;
  settings.jellyfin = {
    ...settings.jellyfin,
    apiKey: 'test-api-key',
  };
}

function configurePlex(): void {
  const settings = getSettings();
  settings.main.mediaServerType = MediaServerType.PLEX;
}

// --- Plex helpers ---
function fakePlexShow(ratingKey: string): PlexMetadata {
  return {
    ratingKey,
    guid: `plex://show/${ratingKey}`,
    type: 'show',
    title: 'Test Show',
    Guid: [],
    index: 1,
    leafCount: 0,
    viewedLeafCount: 0,
    viewCount: 0,
    addedAt: 0,
    updatedAt: 0,
    Media: [],
  };
}

describe('AvailabilitySync', () => {
  beforeEach(async () => {
    deletionMovieIds = [];
    getDeletionItemImpl = async () => undefined;
    getSystemInfoImpl = async () => ({ ServerName: 'Test' });
    getItemDataImpl = async () => undefined;
    jellyfinSeasonLookupIds = [];
    jellyfinEpisodeLookupIds = [];
    getMetadataImpl = async () => {
      throw new Error('404');
    };
    getChildrenMetadataImpl = async () => [];
    getChildrenMetadataCalls = [];

    const userRepository = getRepository(User);
    const admin =
      (await userRepository.findOne({ where: { id: 1 } })) ?? new User();
    admin.id = 1;
    admin.plexToken = 'test-plex-token';
    admin.jellyfinUserId = '0123456789abcdef0123456789abcdef';
    admin.jellyfinDeviceId = 'admin-device-id';
    admin.email = 'admin@test.com';
    admin.permissions = 2;
    admin.username = 'admin';
    await userRepository.save(admin);
  });

  describe('scan lifecycle and pagination', () => {
    it('avoids unused Plex season lookups during availability sync', async () => {
      configurePlex();
      configureSonarr([]);
      const mediaRepository = getRepository(Media);
      const media = await mediaRepository.save(
        new Media({
          tmdbId: 2003,
          mediaType: MediaType.TV,
          status: MediaStatus.AVAILABLE,
          ratingKey: 'metadata-unavailable-show',
          seasons: [
            new Season({
              seasonNumber: 1,
              status: MediaStatus.AVAILABLE,
              status4k: MediaStatus.UNKNOWN,
            }),
          ],
        })
      );
      getMetadataImpl = async () => fakePlexShow('metadata-unavailable-show');
      await availabilitySync.run();

      const updated = await mediaRepository.findOneOrFail({
        where: { id: media.id },
        relations: { seasons: true },
      });
      assert.equal(updated.status, MediaStatus.AVAILABLE);
      assert.equal(updated.seasons[0].status, MediaStatus.AVAILABLE);
      assert.deepEqual(getChildrenMetadataCalls, []);
    });

    it('avoids unused Jellyfin season lookups during availability sync', async () => {
      configureJellyfin();
      configureSonarr([]);
      const mediaRepository = getRepository(Media);
      const media = await mediaRepository.save(
        new Media({
          tmdbId: 2004,
          mediaType: MediaType.TV,
          status: MediaStatus.AVAILABLE,
          jellyfinMediaId: 'jellyfin-live-show',
          seasons: [
            new Season({
              seasonNumber: 1,
              status: MediaStatus.AVAILABLE,
              status4k: MediaStatus.UNKNOWN,
            }),
          ],
        })
      );
      getItemDataImpl = async (id) => ({
        Name: 'Test Show',
        Id: id,
        Type: 'Series',
        HasSubtitles: false,
        LocationType: 'FileSystem',
        MediaType: 'Video',
        ProviderIds: { Tmdb: '2004' },
      });

      await availabilitySync.run();

      const updated = await mediaRepository.findOneOrFail({
        where: { id: media.id },
        relations: { seasons: true },
      });
      assert.equal(updated.status, MediaStatus.AVAILABLE);
      assert.equal(updated.seasons[0].status, MediaStatus.AVAILABLE);
      assert.deepEqual(jellyfinSeasonLookupIds, []);
      assert.deepEqual(jellyfinEpisodeLookupIds, []);
    });

    it('cleans up a movie after both Arr and the media server confirm deletion', async () => {
      configureJellyfin();
      configureSonarr([]);
      getSettings().radarr = [
        {
          id: 0,
          name: 'Radarr',
          hostname: 'localhost',
          port: 7878,
          apiKey: 'test',
          syncEnabled: true,
          is4k: false,
        },
      ] as RadarrSettings[];
      getSystemInfoImpl = async () => ({
        Id: 'test-server',
        ServerName: 'Test',
      });
      const media = await getRepository(Media).save(
        new Media({
          tmdbId: 88001,
          mediaType: MediaType.MOVIE,
          status: MediaStatus.AVAILABLE,
          jellyfinMediaId: 'removed-id',
        })
      );
      await availabilitySync.run();
      assert.equal(
        await getRepository(Media).existsBy({ id: media.id }),
        false
      );
    });
    it('preserves the database when strict deletion checks encounter a server error', async () => {
      configureJellyfin();
      configureSonarr([]);
      getSettings().radarr = [
        {
          id: 0,
          name: 'Radarr',
          hostname: 'localhost',
          port: 7878,
          apiKey: 'test',
          syncEnabled: true,
          is4k: false,
        },
      ] as RadarrSettings[];
      getSystemInfoImpl = async () => ({
        Id: 'test-server',
        ServerName: 'Test',
      });
      getDeletionItemImpl = async () => {
        throw { response: { status: 500 } };
      };
      const media = await getRepository(Media).save(
        new Media({
          tmdbId: 88002,
          mediaType: MediaType.MOVIE,
          status: MediaStatus.AVAILABLE,
          jellyfinMediaId: 'unreachable-id',
        })
      );
      await availabilitySync.run();
      assert.equal(
        (await getRepository(Media).findOneByOrFail({ id: media.id })).status,
        MediaStatus.AVAILABLE
      );
    });
    it('does not delete media refreshed while an availability probe is in flight', async () => {
      configurePlex();
      configureSonarr([]);
      const mediaRepository = getRepository(Media);
      const media = await mediaRepository.save(
        new Media({
          tmdbId: 2899,
          mediaType: MediaType.MOVIE,
          status: MediaStatus.AVAILABLE,
          status4k: MediaStatus.UNKNOWN,
          ratingKey: 'stale-rating-key',
          seasons: [],
        })
      );
      let probeStarted!: () => void;
      let releaseProbe!: () => void;
      const probeStartedPromise = new Promise<void>((resolve) => {
        probeStarted = resolve;
      });
      const releaseProbePromise = new Promise<void>((resolve) => {
        releaseProbe = resolve;
      });
      getMetadataImpl = async () => {
        probeStarted();
        await releaseProbePromise;
        throw new Error('404');
      };

      const scan = availabilitySync.run();
      await probeStartedPromise;
      await mediaRepository.update(media.id, {
        status: MediaStatus.PROCESSING,
        ratingKey: 'fresh-rating-key',
      });
      releaseProbe();
      await scan;

      const current = await mediaRepository.findOneByOrFail({ id: media.id });
      assert.strictEqual(current.status, MediaStatus.PROCESSING);
      assert.strictEqual(current.ratingKey, 'fresh-rating-key');
    });

    it('preserves media status even when Jellyfin reports a missing item', async () => {
      configureJellyfin();
      configureSonarr([]);
      const mediaRepository = getRepository(Media);
      const [unavailableBackendMedia, missingMedia] =
        await mediaRepository.save([
          new Media({
            tmdbId: 2900,
            mediaType: MediaType.MOVIE,
            status: MediaStatus.AVAILABLE,
            status4k: MediaStatus.UNKNOWN,
            jellyfinMediaId: 'jellyfin-500',
            seasons: [],
          }),
          new Media({
            tmdbId: 2901,
            mediaType: MediaType.MOVIE,
            status: MediaStatus.AVAILABLE,
            status4k: MediaStatus.UNKNOWN,
            jellyfinMediaId: 'jellyfin-404',
            seasons: [],
          }),
        ]);
      getItemDataImpl = async (id: string) => {
        throw new Error(
          id === 'jellyfin-500'
            ? 'Request failed with status code 500'
            : 'Request failed with status code 404'
        );
      };

      await availabilitySync.run();

      const [preserved, missing] = await Promise.all([
        mediaRepository.findOneByOrFail({ id: unavailableBackendMedia.id }),
        mediaRepository.findOneByOrFail({ id: missingMedia.id }),
      ]);
      assert.strictEqual(preserved.status, MediaStatus.AVAILABLE);
      assert.strictEqual(missing.status, MediaStatus.AVAILABLE);
    });

    it('does not delete media using results from rotated Jellyfin credentials', async () => {
      configureJellyfin();
      configureSonarr([]);
      const settings = getSettings();
      const mediaRepository = getRepository(Media);
      const media = await mediaRepository.save(
        new Media({
          tmdbId: 2902,
          mediaType: MediaType.MOVIE,
          status: MediaStatus.AVAILABLE,
          status4k: MediaStatus.UNKNOWN,
          jellyfinMediaId: 'stale-jellyfin-id',
          seasons: [],
        })
      );
      getItemDataImpl = async () => {
        settings.jellyfin = {
          ...settings.jellyfin,
          apiKey: 'rotated-during-probe',
        };
        throw new Error('Request failed with status code 404');
      };

      await availabilitySync.run();

      const current = await mediaRepository.findOneByOrFail({ id: media.id });
      assert.strictEqual(current.status, MediaStatus.AVAILABLE);
      assert.strictEqual(current.jellyfinMediaId, 'stale-jellyfin-id');
    });

    it('does not delete media after the owner Jellyfin identity changes', async () => {
      configureJellyfin();
      configureSonarr([]);
      const mediaRepository = getRepository(Media);
      const media = await mediaRepository.save(
        new Media({
          tmdbId: 2903,
          mediaType: MediaType.MOVIE,
          status: MediaStatus.AVAILABLE,
          status4k: MediaStatus.UNKNOWN,
          jellyfinMediaId: 'owner-stale-jellyfin-id',
          seasons: [],
        })
      );
      getItemDataImpl = async () => {
        await runUserSecurityMutation(1, () =>
          getRepository(User)
            .update(1, { jellyfinDeviceId: 'rotated-during-probe' })
            .then(() => undefined)
        );
        throw new Error('Request failed with status code 404');
      };

      await availabilitySync.run();

      const current = await mediaRepository.findOneByOrFail({ id: media.id });
      assert.strictEqual(current.status, MediaStatus.AVAILABLE);
      assert.strictEqual(current.jellyfinMediaId, 'owner-stale-jellyfin-id');
    });

    it('processes every matching row when earlier pages stop matching', async () => {
      configurePlex();
      configureSonarr([]);
      const mediaRepository = getRepository(Media);
      const media = await mediaRepository.save(
        Array.from(
          { length: 55 },
          (_, index) =>
            new Media({
              tmdbId: 3000 + index,
              mediaType: MediaType.MOVIE,
              status: MediaStatus.AVAILABLE,
              status4k: MediaStatus.UNKNOWN,
              seasons: [],
            })
        )
      );

      await availabilitySync.run();

      const updated = await mediaRepository.findBy({
        id: In(media.map((item) => item.id)),
      });
      assert.strictEqual(updated.length, 55);
      assert.ok(
        updated.every((item) => item.status === MediaStatus.AVAILABLE),
        'availability sync changed media status during pagination'
      );
    });

    it('fails closed without deleting media when the Plex admin is unavailable', async () => {
      configurePlex();
      configureSonarr([]);
      const userRepository = getRepository(User);
      const admin = await userRepository.findOneByOrFail({ id: 1 });
      admin.plexToken = null;
      await userRepository.save(admin);
      const mediaRepository = getRepository(Media);
      const media = await mediaRepository.save(
        new Media({
          tmdbId: 4000,
          mediaType: MediaType.MOVIE,
          status: MediaStatus.AVAILABLE,
          status4k: MediaStatus.UNKNOWN,
          ratingKey: 'plex-movie',
          seasons: [],
        })
      );

      await availabilitySync.run();

      const updated = await mediaRepository.findOneByOrFail({ id: media.id });
      assert.strictEqual(updated.status, MediaStatus.AVAILABLE);
    });

    it('skips overlapping availability runs', async () => {
      configurePlex();
      configureSonarr([]);
      const mediaRepository = getRepository(Media);
      await mediaRepository.save(
        new Media({
          tmdbId: 5000,
          mediaType: MediaType.MOVIE,
          status: MediaStatus.AVAILABLE,
          status4k: MediaStatus.UNKNOWN,
          ratingKey: 'slow-plex-movie',
          seasons: [],
        })
      );
      let releaseLookup: (() => void) | undefined;
      let lookupCount = 0;
      const lookupStarted = new Promise<void>((resolve) => {
        getMetadataImpl = async () => {
          lookupCount += 1;
          resolve();
          await new Promise<void>((release) => {
            releaseLookup = release;
          });
          throw new Error('404');
        };
      });

      const firstRun = availabilitySync.run();
      await lookupStarted;
      await availabilitySync.run();
      releaseLookup?.();
      await firstRun;

      assert.strictEqual(lookupCount, 1);
    });
  });
});
