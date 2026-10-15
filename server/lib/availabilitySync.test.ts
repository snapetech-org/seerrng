import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';

import type {
  JellyfinLibraryItem,
  JellyfinLibraryItemExtended,
} from '@server/api/jellyfin';
import JellyfinAPI from '@server/api/jellyfin';
import type { PlexMetadata } from '@server/api/plexapi';
import PlexAPI from '@server/api/plexapi';
import RadarrAPI from '@server/api/servarr/radarr';
import type { SonarrSeason, SonarrSeries } from '@server/api/servarr/sonarr';
import SonarrAPI from '@server/api/servarr/sonarr';
import type { TmdbTvScanDetails } from '@server/api/themoviedb/interfaces';
import { MediaStatus, MediaType } from '@server/constants/media';
import { MediaServerType } from '@server/constants/server';
import dataSource, { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import MediaIdentifier, {
  MediaIdentifierProvider,
} from '@server/entity/MediaIdentifier';
import MediaIdentifierSeasonMapping from '@server/entity/MediaIdentifierSeasonMapping';
import Season from '@server/entity/Season';
import { User } from '@server/entity/User';
import { findTvdbSeasonMappings } from '@server/lib/seasonNumberMapping';
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
let getSeasonsImpl: (
  seriesID: string
) => Promise<JellyfinLibraryItem[]> = async () => [];
let getEpisodesImpl: (
  seriesID: string,
  seasonID: string
) => Promise<JellyfinLibraryItem[]> = async () => [];

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
    return async (seriesID: string) => getSeasonsImpl(seriesID);
  },
  set() {},
  configurable: true,
});

Object.defineProperty(JellyfinAPI.prototype, 'getEpisodes', {
  get() {
    return async (seriesID: string, seasonID: string) =>
      getEpisodesImpl(seriesID, seasonID);
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
    return async (key: string) => getChildrenMetadataImpl(key);
  },
  set() {},
  configurable: true,
});

// --- Mock SonarrAPI ---
let getSeriesByIdImpl: (id: number) => Promise<SonarrSeries> = async () => {
  throw new Error('404');
};

Object.defineProperty(SonarrAPI.prototype, 'getSeriesById', {
  get() {
    return async (id: number) => getSeriesByIdImpl(id);
  },
  set() {},
  configurable: true,
});

import availabilitySync from '@server/lib/availabilitySync';

setupTestDb();

// AvailabilitySync also enriches season counts through TMDB. Stub the actual
// singleton client's scan method: its arrow function shadows prototype mocks.
// Keep the external-network guard enabled and the real scan/reconciler intact.
const scanSeasonCounts = new Map([
  [1408, 8],
  [1409, 8],
  [1410, 8],
  [1411, 1],
  [2000, 8],
  [2001, 1],
  [2002, 4],
  [2003, 1],
]);
let unexpectedScanIds: number[] = [];
let scanIds: number[] = [];
let unexpectedTvdbIds: number[] = [];

function fakeTmdbShow(tvId: number, seasonCount: number): TmdbTvScanDetails {
  return {
    id: tvId,
    name: 'Test Show',
    original_name: 'Test Show',
    first_air_date: '2001-01-01',
    external_ids: {},
    keywords: { results: [] },
    genres: [],
    episode_run_time: [45],
    created_by: [],
    production_companies: [],
    networks: [],
    seasons: Array.from({ length: seasonCount }, (_, index) => ({
      id: index + 1,
      season_number: index + 1,
      episode_count: 22,
      name: `Season ${index + 1}`,
      overview: '',
      air_date: '2001-01-01',
    })),
  };
}

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

// --- Jellyfin helpers ---
function fakeJellyfinSeason(
  seasonNumber: number,
  id?: string
): JellyfinLibraryItem {
  return {
    Name: `Season ${seasonNumber}`,
    Id: id ?? `jellyfin-season-${seasonNumber}-id`,
    IndexNumber: seasonNumber,
    Type: 'Season' as const,
    HasSubtitles: false,
    LocationType: 'FileSystem' as const,
    MediaType: 'Video',
  };
}

function fakeJellyfinEpisodes(count: number): JellyfinLibraryItem[] {
  return Array.from({ length: count }, (_, i) => ({
    Name: `Episode ${i + 1}`,
    Id: `ep-${i}`,
    IndexNumber: i + 1,
    Type: 'Episode' as const,
    HasSubtitles: false,
    LocationType: 'FileSystem' as const,
    MediaType: 'Video',
  }));
}

function fakeJellyfinShow(
  id: string,
  tmdbId: string
): JellyfinLibraryItemExtended {
  return {
    Name: 'Test Show',
    Id: id,
    Type: 'Series',
    HasSubtitles: false,
    LocationType: 'FileSystem',
    MediaType: 'Video',
    ProviderIds: { Tmdb: tmdbId },
  };
}

// --- Plex helpers ---
function fakePlexSeason(seasonNumber: number, ratingKey: string): PlexMetadata {
  return {
    ratingKey,
    guid: `plex://season/${ratingKey}`,
    type: 'season',
    title: `Season ${seasonNumber}`,
    Guid: [],
    index: seasonNumber,
    leafCount: 0,
    viewedLeafCount: 0,
    viewCount: 0,
    addedAt: 0,
    updatedAt: 0,
    Media: [],
  };
}

function fakePlexEpisodes(count: number): PlexMetadata[] {
  return Array.from({ length: count }, (_, i) => ({
    ratingKey: `ep-${i}`,
    guid: `plex://episode/ep-${i}`,
    type: 'movie' as const,
    title: `Episode ${i + 1}`,
    Guid: [],
    index: i + 1,
    leafCount: 0,
    viewedLeafCount: 0,
    viewCount: 0,
    addedAt: 0,
    updatedAt: 0,
    Media: [
      {
        id: i,
        duration: 2400,
        bitrate: 4000,
        width: 1920,
        height: 1080,
        aspectRatio: 1.78,
        audioChannels: 2,
        audioCodec: 'aac',
        videoCodec: 'h264',
        videoResolution: '1080',
        container: 'mkv',
        videoFrameRate: '24p',
        videoProfile: 'high',
      },
    ],
  }));
}

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

// --- Sonarr helpers ---
function fakeSonarrSeasons(
  totalSeasons: number,
  seasonsWithFiles: Record<number, number>
): SonarrSeason[] {
  return Array.from({ length: totalSeasons }, (_, i) => ({
    seasonNumber: i + 1,
    monitored: true,
    statistics: {
      episodeFileCount: seasonsWithFiles[i + 1] ?? 0,
      totalEpisodeCount: 22,
      episodeCount: 22,
      percentOfEpisodes: seasonsWithFiles[i + 1] ? 100 : 0,
      sizeOnDisk: seasonsWithFiles[i + 1] ? 7516192768 : 0,
      previousAiring: undefined,
    },
  }));
}

describe('AvailabilitySync', () => {
  beforeEach(async () => {
    unexpectedScanIds = [];
    scanIds = [];
    unexpectedTvdbIds = [];
    mock.method(
      availabilitySync.tmdb,
      'getTvShowForScan',
      async ({
        tvId,
      }: Parameters<typeof availabilitySync.tmdb.getTvShowForScan>[0]) => {
        scanIds.push(tvId);
        const seasonCount = scanSeasonCounts.get(tvId);
        if (seasonCount === undefined) {
          unexpectedScanIds.push(tvId);
          throw new Error(`Unexpected TMDB scan fixture: ${tvId}`);
        }
        return fakeTmdbShow(tvId, seasonCount);
      }
    );
    mock.method(
      availabilitySync.tmdb,
      'getShowByTvdbIdForScan',
      async ({
        tvdbId,
      }: Parameters<
        typeof availabilitySync.tmdb.getShowByTvdbIdForScan
      >[0]) => {
        unexpectedTvdbIds.push(tvdbId);
        throw new Error(`Unexpected TVDB scan fixture: ${tvdbId}`);
      }
    );
    deletionMovieIds = [];
    getDeletionItemImpl = async () => undefined;
    getSystemInfoImpl = async () => ({ ServerName: 'Test' });
    getItemDataImpl = async () => undefined;
    getSeasonsImpl = async () => [];
    getEpisodesImpl = async () => [];
    getMetadataImpl = async () => {
      throw new Error('404');
    };
    getChildrenMetadataImpl = async () => [];
    getSeriesByIdImpl = async () => {
      throw new Error('404');
    };

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

  afterEach(() => {
    try {
      // The scan catches metadata failures. Assert outside that catch so an
      // accidental new lookup cannot silently pass with an unrelated fixture.
      assert.deepEqual(unexpectedScanIds, []);
      assert.deepEqual(unexpectedTvdbIds, []);
    } finally {
      mock.restoreAll();
    }
  });

  describe('TV season availability - Jellyfin', () => {
    it('preserves season status when only some seasons exist in Jellyfin and Sonarr', async () => {
      configureJellyfin();
      configureSonarr([{ syncEnabled: true }]);

      const mediaRepository = getRepository(Media);

      const media = new Media();
      media.tmdbId = 1408;
      media.mediaType = MediaType.TV;
      media.status = MediaStatus.AVAILABLE;
      media.jellyfinMediaId = 'jellyfin-house-id';
      media.externalServiceId = 100;
      media.seasons = [];

      for (let i = 1; i <= 8; i++) {
        media.seasons.push(
          new Season({
            seasonNumber: i,
            status: MediaStatus.AVAILABLE,
            status4k: MediaStatus.UNKNOWN,
          })
        );
      }

      await mediaRepository.save(media);

      getItemDataImpl = async (id: string) => {
        if (id === 'jellyfin-house-id') {
          return fakeJellyfinShow('jellyfin-house-id', '1408');
        }
        return undefined;
      };

      getSeasonsImpl = async (seriesID: string) => {
        if (seriesID === 'jellyfin-house-id') {
          return [fakeJellyfinSeason(6)];
        }
        return [];
      };

      getEpisodesImpl = async (_seriesID: string, seasonID: string) => {
        if (seasonID === 'jellyfin-season-6-id') {
          return fakeJellyfinEpisodes(21);
        }
        return [];
      };

      getSeriesByIdImpl = async (id: number) => {
        if (id === 100) {
          return {
            tvdbId: 73255,
            id: 100,
            title: 'House',
            titleSlug: 'house',
            monitored: true,
            statistics: {
              episodeFileCount: 21,
              totalEpisodeCount: 177,
              episodeCount: 177,
              percentOfEpisodes: 11.86,
              sizeOnDisk: 0,
              seasonCount: 8,
            },
            seasons: fakeSonarrSeasons(8, { 6: 21 }),
          } as unknown as SonarrSeries;
        }
        throw new Error('404');
      };

      await availabilitySync.run();

      assert.deepEqual(scanIds, [1408]);

      const updated = await mediaRepository.findOneOrFail({
        where: { tmdbId: 1408 },
        relations: { seasons: true },
      });

      const s6 = updated.seasons.find((s) => s.seasonNumber === 6);
      assert.strictEqual(
        s6?.status,
        MediaStatus.AVAILABLE,
        'Season 6 should remain AVAILABLE'
      );

      assert.ok(
        updated.seasons.every(
          (season) => season.status === MediaStatus.AVAILABLE
        ),
        'Availability sync must not mark missing seasons as DELETED'
      );
      assert.strictEqual(updated.status, MediaStatus.AVAILABLE);
    });

    it('preserves season status when externalServiceId is null (no Sonarr link)', async () => {
      configureJellyfin();
      configureSonarr([{ syncEnabled: true }]);

      const mediaRepository = getRepository(Media);

      const media = new Media();
      media.tmdbId = 1409;
      media.mediaType = MediaType.TV;
      media.status = MediaStatus.AVAILABLE;
      media.jellyfinMediaId = 'jellyfin-house2-id';
      media.externalServiceId = undefined as unknown as number;
      media.seasons = [];

      for (let i = 1; i <= 8; i++) {
        media.seasons.push(
          new Season({
            seasonNumber: i,
            status: MediaStatus.AVAILABLE,
            status4k: MediaStatus.UNKNOWN,
          })
        );
      }

      await mediaRepository.save(media);

      getItemDataImpl = async (id: string) => {
        if (id === 'jellyfin-house2-id') {
          return fakeJellyfinShow('jellyfin-house2-id', '1409');
        }
        return undefined;
      };

      getSeasonsImpl = async (seriesID: string) => {
        if (seriesID === 'jellyfin-house2-id') {
          return [fakeJellyfinSeason(6, 'jellyfin-house2-s6-id')];
        }
        return [];
      };

      getEpisodesImpl = async (_seriesID: string, seasonID: string) => {
        if (seasonID === 'jellyfin-house2-s6-id') {
          return fakeJellyfinEpisodes(21);
        }
        return [];
      };

      getSeriesByIdImpl = async () => {
        throw new Error('404');
      };

      await availabilitySync.run();

      const updated = await mediaRepository.findOneOrFail({
        where: { tmdbId: 1409 },
        relations: { seasons: true },
      });
      assert.deepEqual(scanIds, [1409]);

      const s6 = updated.seasons.find((s) => s.seasonNumber === 6);
      assert.strictEqual(
        s6?.status,
        MediaStatus.AVAILABLE,
        'Season 6 should remain AVAILABLE'
      );

      assert.ok(
        updated.seasons.every(
          (season) => season.status === MediaStatus.AVAILABLE
        ),
        'Availability sync must not mark missing seasons as DELETED'
      );
      assert.strictEqual(updated.status, MediaStatus.AVAILABLE);
    });

    it('preserves season status when Jellyfin returns empty season metadata entries', async () => {
      configureJellyfin();
      configureSonarr([{ syncEnabled: true }]);

      const mediaRepository = getRepository(Media);

      const media = new Media();
      media.tmdbId = 1410;
      media.mediaType = MediaType.TV;
      media.status = MediaStatus.AVAILABLE;
      media.jellyfinMediaId = 'jellyfin-house3-id';
      media.externalServiceId = 101;
      media.seasons = [];

      for (let i = 1; i <= 8; i++) {
        media.seasons.push(
          new Season({
            seasonNumber: i,
            status: MediaStatus.AVAILABLE,
            status4k: MediaStatus.UNKNOWN,
          })
        );
      }

      await mediaRepository.save(media);

      getItemDataImpl = async (id: string) => {
        if (id === 'jellyfin-house3-id') {
          return fakeJellyfinShow('jellyfin-house3-id', '1410');
        }
        return undefined;
      };

      // MOCK REAL BEHAVIOR: Jellyfin returns ALL 8 season metadata entries
      // even though only season 6 has actual episode files.
      getSeasonsImpl = async (seriesID: string) => {
        if (seriesID === 'jellyfin-house3-id') {
          return Array.from({ length: 8 }, (_, i) =>
            fakeJellyfinSeason(i + 1, `jellyfin-house3-s${i + 1}-id`)
          );
        }
        return [];
      };

      // Only season 6 has actual episodes
      getEpisodesImpl = async (_seriesID: string, seasonID: string) => {
        if (seasonID === 'jellyfin-house3-s6-id') {
          return fakeJellyfinEpisodes(21);
        }
        return [];
      };

      getSeriesByIdImpl = async (id: number) => {
        if (id === 101) {
          return {
            tvdbId: 73255,
            id: 101,
            title: 'House',
            titleSlug: 'house',
            monitored: true,
            statistics: {
              episodeFileCount: 21,
              totalEpisodeCount: 177,
              episodeCount: 177,
              percentOfEpisodes: 11.86,
              sizeOnDisk: 0,
              seasonCount: 8,
            },
            seasons: fakeSonarrSeasons(8, { 6: 21 }),
          } as unknown as SonarrSeries;
        }
        throw new Error('404');
      };

      await availabilitySync.run();

      const updated = await mediaRepository.findOneOrFail({
        where: { tmdbId: 1410 },
        relations: { seasons: true },
      });
      assert.deepEqual(scanIds, [1410]);

      const s6 = updated.seasons.find((s) => s.seasonNumber === 6);
      assert.strictEqual(
        s6?.status,
        MediaStatus.AVAILABLE,
        'Season 6 should remain AVAILABLE'
      );

      assert.ok(
        updated.seasons.every(
          (season) => season.status === MediaStatus.AVAILABLE
        ),
        'Availability sync must not mark missing seasons as DELETED'
      );
      assert.strictEqual(updated.status, MediaStatus.AVAILABLE);
    });

    it('should assume season exists when getEpisodes fails (safe fallback)', async () => {
      configureJellyfin();
      configureSonarr([{ syncEnabled: true }]);

      const mediaRepository = getRepository(Media);

      const media = new Media();
      media.tmdbId = 1411;
      media.mediaType = MediaType.TV;
      media.status = MediaStatus.AVAILABLE;
      media.jellyfinMediaId = 'jellyfin-house4-id';
      media.externalServiceId = 102;
      media.seasons = [
        new Season({
          seasonNumber: 1,
          status: MediaStatus.AVAILABLE,
          status4k: MediaStatus.UNKNOWN,
        }),
      ];

      await mediaRepository.save(media);

      getItemDataImpl = async (id: string) => {
        if (id === 'jellyfin-house4-id') {
          return fakeJellyfinShow('jellyfin-house4-id', '1411');
        }
        return undefined;
      };

      getSeasonsImpl = async (seriesID: string) => {
        if (seriesID === 'jellyfin-house4-id') {
          return [fakeJellyfinSeason(1, 'jellyfin-house4-s1-id')];
        }
        return [];
      };

      getEpisodesImpl = async () => {
        throw new Error('Connection refused');
      };

      getSeriesByIdImpl = async (id: number) => {
        if (id === 102) {
          return {
            tvdbId: 99999,
            id: 102,
            title: 'House 4',
            titleSlug: 'house-4',
            monitored: true,
            statistics: {
              episodeFileCount: 10,
              totalEpisodeCount: 10,
              episodeCount: 10,
              percentOfEpisodes: 100,
              sizeOnDisk: 0,
              seasonCount: 1,
            },
            seasons: fakeSonarrSeasons(1, { 1: 10 }),
          } as unknown as SonarrSeries;
        }
        throw new Error('404');
      };

      await availabilitySync.run();

      const updated = await mediaRepository.findOneOrFail({
        where: { tmdbId: 1411 },
        relations: { seasons: true },
      });
      assert.deepEqual(scanIds, [1411]);

      assert.strictEqual(
        updated.seasons[0].status,
        MediaStatus.AVAILABLE,
        'Season should remain AVAILABLE when getEpisodes fails'
      );
      assert.strictEqual(
        updated.status,
        MediaStatus.AVAILABLE,
        'Show should remain AVAILABLE when getEpisodes fails'
      );
    });
  });

  describe('TV season availability - Plex', () => {
    it('treats a legacy standard Sonarr setting without is4k as non-4K', async () => {
      configurePlex();
      configureSonarr([{ syncEnabled: true, is4k: undefined }]);

      const mediaRepository = getRepository(Media);
      const media = await mediaRepository.save(
        new Media({
          tmdbId: 2003,
          tvdbId: 73255,
          mediaType: MediaType.TV,
          status: MediaStatus.AVAILABLE,
          externalServiceId: 203,
          seasons: [
            new Season({
              seasonNumber: 1,
              status: MediaStatus.AVAILABLE,
              status4k: MediaStatus.UNKNOWN,
            }),
          ],
        })
      );

      getSeriesByIdImpl = async (id: number) => {
        if (id === 203) {
          return {
            tvdbId: 73255,
            id: 203,
            title: 'House',
            titleSlug: 'house',
            monitored: true,
            statistics: {
              episodeFileCount: 22,
              totalEpisodeCount: 22,
              episodeCount: 22,
              percentOfEpisodes: 100,
              sizeOnDisk: 0,
              seasonCount: 1,
            },
            seasons: fakeSonarrSeasons(1, { 1: 22 }),
          } as unknown as SonarrSeries;
        }
        throw new Error('404');
      };

      await availabilitySync.run();

      const updated = await mediaRepository.findOneOrFail({
        where: { id: media.id },
        relations: { seasons: true },
      });

      assert.strictEqual(updated.status, MediaStatus.AVAILABLE);
      assert.strictEqual(updated.seasons[0].status, MediaStatus.AVAILABLE);
      assert.deepEqual(scanIds, [2003]);
    });

    it('preserves season status when Plex returns empty season metadata entries', async () => {
      configurePlex();
      configureSonarr([{ syncEnabled: true }]);

      const mediaRepository = getRepository(Media);

      const media = new Media();
      media.tmdbId = 2000;
      media.mediaType = MediaType.TV;
      media.status = MediaStatus.AVAILABLE;
      media.ratingKey = 'plex-house-rk';
      media.externalServiceId = 200;
      media.seasons = [];

      for (let i = 1; i <= 8; i++) {
        media.seasons.push(
          new Season({
            seasonNumber: i,
            status: MediaStatus.AVAILABLE,
            status4k: MediaStatus.UNKNOWN,
          })
        );
      }

      await mediaRepository.save(media);

      getMetadataImpl = async (key: string) => {
        if (key === 'plex-house-rk') {
          return fakePlexShow('plex-house-rk');
        }
        throw new Error('404');
      };

      // Plex returns ALL 8 season metadata entries,
      // but only season 6 has episode files
      getChildrenMetadataImpl = async (key: string) => {
        if (key === 'plex-house-rk') {
          return Array.from({ length: 8 }, (_, i) =>
            fakePlexSeason(i + 1, `plex-house-s${i + 1}-rk`)
          );
        }
        if (key === 'plex-house-s6-rk') {
          return fakePlexEpisodes(21);
        }
        return [];
      };

      // Sonarr: only season 6 has files
      getSeriesByIdImpl = async (id: number) => {
        if (id === 200) {
          return {
            tvdbId: 73255,
            id: 200,
            title: 'House',
            titleSlug: 'house',
            monitored: true,
            statistics: {
              episodeFileCount: 21,
              totalEpisodeCount: 177,
              episodeCount: 177,
              percentOfEpisodes: 11.86,
              sizeOnDisk: 0,
              seasonCount: 8,
            },
            seasons: fakeSonarrSeasons(8, { 6: 21 }),
          } as unknown as SonarrSeries;
        }
        throw new Error('404');
      };

      await availabilitySync.run();

      const updated = await mediaRepository.findOneOrFail({
        where: { tmdbId: 2000 },
        relations: { seasons: true },
      });
      assert.deepEqual(scanIds, [2000]);

      const s6 = updated.seasons.find((s) => s.seasonNumber === 6);
      assert.strictEqual(
        s6?.status,
        MediaStatus.AVAILABLE,
        'Season 6 should remain AVAILABLE'
      );

      assert.ok(
        updated.seasons.every(
          (season) => season.status === MediaStatus.AVAILABLE
        ),
        'Availability sync must not mark missing seasons as DELETED'
      );
      assert.strictEqual(updated.status, MediaStatus.AVAILABLE);
    });

    it('should assume season exists when getChildrenMetadata fails for episodes (safe fallback)', async () => {
      configurePlex();
      configureSonarr([{ syncEnabled: true }]);

      const mediaRepository = getRepository(Media);

      const media = new Media();
      media.tmdbId = 2001;
      media.mediaType = MediaType.TV;
      media.status = MediaStatus.AVAILABLE;
      media.ratingKey = 'plex-house2-rk';
      media.externalServiceId = 201;
      media.seasons = [
        new Season({
          seasonNumber: 1,
          status: MediaStatus.AVAILABLE,
          status4k: MediaStatus.UNKNOWN,
        }),
      ];

      await mediaRepository.save(media);

      getMetadataImpl = async (key: string) => {
        if (key === 'plex-house2-rk') {
          return fakePlexShow('plex-house2-rk');
        }
        throw new Error('404');
      };

      getChildrenMetadataImpl = async (key: string) => {
        if (key === 'plex-house2-rk') {
          return [fakePlexSeason(1, 'plex-house2-s1-rk')];
        }
        throw new Error('Connection refused');
      };

      getSeriesByIdImpl = async (id: number) => {
        if (id === 201) {
          return {
            tvdbId: 99999,
            id: 201,
            title: 'House 2',
            titleSlug: 'house-2',
            monitored: true,
            statistics: {
              episodeFileCount: 10,
              totalEpisodeCount: 10,
              episodeCount: 10,
              percentOfEpisodes: 100,
              sizeOnDisk: 0,
              seasonCount: 1,
            },
            seasons: fakeSonarrSeasons(1, { 1: 10 }),
          } as unknown as SonarrSeries;
        }
        throw new Error('404');
      };

      await availabilitySync.run();

      const updated = await mediaRepository.findOneOrFail({
        where: { tmdbId: 2001 },
        relations: { seasons: true },
      });
      assert.deepEqual(scanIds, [2001]);

      assert.strictEqual(
        updated.seasons[0].status,
        MediaStatus.AVAILABLE,
        'Season should remain AVAILABLE when getChildrenMetadata fails'
      );
      assert.strictEqual(
        updated.status,
        MediaStatus.AVAILABLE,
        'Show should remain AVAILABLE when getChildrenMetadata fails'
      );
    });

    it('preserves season status when only some seasons have episodes in Plex', async () => {
      configurePlex();
      configureSonarr([{ syncEnabled: true }]);

      const mediaRepository = getRepository(Media);

      const media = new Media();
      media.tmdbId = 2002;
      media.mediaType = MediaType.TV;
      media.status = MediaStatus.AVAILABLE;
      media.ratingKey = 'plex-house3-rk';
      media.externalServiceId = undefined as unknown as number;
      media.seasons = [];

      for (let i = 1; i <= 4; i++) {
        media.seasons.push(
          new Season({
            seasonNumber: i,
            status: MediaStatus.AVAILABLE,
            status4k: MediaStatus.UNKNOWN,
          })
        );
      }

      await mediaRepository.save(media);

      getMetadataImpl = async (key: string) => {
        if (key === 'plex-house3-rk') {
          return fakePlexShow('plex-house3-rk');
        }
        throw new Error('404');
      };

      getChildrenMetadataImpl = async (key: string) => {
        if (key === 'plex-house3-rk') {
          return Array.from({ length: 4 }, (_, i) =>
            fakePlexSeason(i + 1, `plex-house3-s${i + 1}-rk`)
          );
        }
        // Only seasons 2 and 4 have episodes
        if (key === 'plex-house3-s2-rk' || key === 'plex-house3-s4-rk') {
          return fakePlexEpisodes(10);
        }
        return [];
      };

      getSeriesByIdImpl = async () => {
        throw new Error('404');
      };

      await availabilitySync.run();

      const updated = await mediaRepository.findOneOrFail({
        where: { tmdbId: 2002 },
        relations: { seasons: true },
      });
      assert.deepEqual(scanIds, [2002]);

      const s2 = updated.seasons.find((s) => s.seasonNumber === 2);
      const s4 = updated.seasons.find((s) => s.seasonNumber === 4);
      assert.strictEqual(
        s2?.status,
        MediaStatus.AVAILABLE,
        'Season 2 should remain AVAILABLE'
      );
      assert.strictEqual(
        s4?.status,
        MediaStatus.AVAILABLE,
        'Season 4 should remain AVAILABLE'
      );

      const s1 = updated.seasons.find((s) => s.seasonNumber === 1);
      const s3 = updated.seasons.find((s) => s.seasonNumber === 3);
      assert.strictEqual(s1?.status, MediaStatus.AVAILABLE);
      assert.strictEqual(s3?.status, MediaStatus.AVAILABLE);
      assert.strictEqual(updated.status, MediaStatus.AVAILABLE);
    });
  });

  describe('Sonarr season-map scope', () => {
    it('loads only the selected server and quality mapping', async () => {
      const media = await getRepository(Media).save(
        new Media({
          tmdbId: 2100,
          tvdbId: 73255,
          mediaType: MediaType.TV,
        })
      );
      const identifier = await getRepository(MediaIdentifier).save(
        new MediaIdentifier({
          media,
          provider: MediaIdentifierProvider.TVDB,
          value: '184881',
          canonical: false,
        })
      );
      await getRepository(MediaIdentifierSeasonMapping).save([
        new MediaIdentifierSeasonMapping({
          mediaIdentifier: identifier,
          sonarrServerId: 32,
          is4k: false,
          seasonNumber: 1,
          externalSeasonNumber: 4,
        }),
        new MediaIdentifierSeasonMapping({
          mediaIdentifier: identifier,
          sonarrServerId: 31,
          is4k: true,
          seasonNumber: 1,
          externalSeasonNumber: 5,
        }),
        new MediaIdentifierSeasonMapping({
          mediaIdentifier: identifier,
          sonarrServerId: 31,
          is4k: false,
          seasonNumber: 1,
          externalSeasonNumber: 2,
        }),
      ]);

      assert.deepStrictEqual(
        await findTvdbSeasonMappings(
          dataSource.manager,
          media.id,
          184_881,
          31,
          false
        ),
        [{ seasonNumber: 1, externalSeasonNumber: 2 }]
      );
    });
  });

  describe('scan lifecycle and pagination', () => {
    it('preserves available seasons when TMDB enrichment is unavailable', async () => {
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
      getChildrenMetadataImpl = async (key) =>
        key === 'metadata-unavailable-show'
          ? [fakePlexSeason(1, 'metadata-unavailable-season')]
          : fakePlexEpisodes(22);
      const lookup = mock.method(
        availabilitySync.tmdb,
        'getTvShowForScan',
        async () => {
          throw new Error('TMDB fixture unavailable');
        }
      );

      await availabilitySync.run();

      assert.equal(lookup.mock.callCount(), 1);
      assert.deepEqual(lookup.mock.calls[0].arguments, [{ tvId: 2003 }]);
      const updated = await mediaRepository.findOneOrFail({
        where: { id: media.id },
        relations: { seasons: true },
      });
      assert.equal(updated.status, MediaStatus.AVAILABLE);
      assert.equal(updated.seasons[0].status, MediaStatus.AVAILABLE);
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
