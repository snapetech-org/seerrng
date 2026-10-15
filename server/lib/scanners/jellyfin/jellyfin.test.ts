import animeList from '@server/api/animelist';
import type {
  JellyfinLibraryItem,
  JellyfinLibraryItemExtended,
} from '@server/api/jellyfin';
import JellyfinAPI from '@server/api/jellyfin';
import MusicBrainz from '@server/api/musicbrainz';
import type { TvShowProvider } from '@server/api/provider';
import TheMovieDb from '@server/api/themoviedb';
import type {
  TmdbTvDetails,
  TmdbTvSeasonResult,
} from '@server/api/themoviedb/interfaces';
import Tvdb from '@server/api/tvdb';
import { MediaStatus, MediaType } from '@server/constants/media';
import { MediaServerType } from '@server/constants/server';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import Season from '@server/entity/Season';
import { User } from '@server/entity/User';
import {
  jellyfinFullScanner,
  jellyfinRecentScanner,
} from '@server/lib/scanners/jellyfin';
import {
  getSettings,
  MetadataProviderType,
  type Library,
} from '@server/lib/settings';
import { setupTestDb } from '@server/test/db';
import { runWithMockTimers } from '@server/test/runWithMockTimers';
import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

// --- Mock animeList.sync to avoid filesystem/network I/O in tests ---
Object.defineProperty(animeList, 'sync', {
  value: async () => {},
  configurable: true,
  writable: true,
});

// --- Mock JellyfinAPI ---
let getLibraryContentsImpl: (
  id: string
) => Promise<JellyfinLibraryItem[]> = async () => [];
let getRecentlyAddedImpl: (
  id: string,
  libraryType?: Library['type']
) => Promise<JellyfinLibraryItem[]> = async () => [];
let getItemDataImpl: (
  id: string
) => Promise<JellyfinLibraryItemExtended | undefined> = async () => undefined;
let getSeasonsImpl: (
  seriesID: string
) => Promise<JellyfinLibraryItem[]> = async () => [];
let getEpisodesImpl: (
  seriesID: string,
  seasonID: string
) => Promise<JellyfinLibraryItem[]> = async () => [];
let getAudioChildrenWithMediaInfoImpl: (
  parentId: string
) => Promise<JellyfinLibraryItemExtended[]> = async () => [];
let getReleaseGroupImpl: (
  releaseId: string
) => Promise<string | null> = async () => null;

Object.defineProperty(JellyfinAPI.prototype, 'getLibraryContents', {
  get() {
    return async (id: string) => getLibraryContentsImpl(id);
  },
  set() {},
  configurable: true,
});

Object.defineProperty(JellyfinAPI.prototype, 'getRecentlyAdded', {
  get() {
    return async (id: string, libraryType?: Library['type']) =>
      getRecentlyAddedImpl(id, libraryType);
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

Object.defineProperty(JellyfinAPI.prototype, 'getAudioChildrenWithMediaInfo', {
  get() {
    return async (parentId: string) =>
      getAudioChildrenWithMediaInfoImpl(parentId);
  },
  set() {},
  configurable: true,
});

Object.defineProperty(MusicBrainz.prototype, 'getReleaseGroup', {
  get() {
    return async ({ releaseId }: { releaseId: string }) =>
      getReleaseGroupImpl(releaseId);
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

// --- Mock TheMovieDb ---
let getTvShowImpl: (args: {
  tvId: number;
  language?: string;
}) => Promise<TmdbTvDetails> = async () => fakeTmdbShow(1);

Object.defineProperty(TheMovieDb.prototype, 'getTvShow', {
  get() {
    return async (args: { tvId: number; language?: string }) =>
      getTvShowImpl(args);
  },
  set() {},
  configurable: true,
});

Object.defineProperty(TheMovieDb.prototype, 'getTvShowForScan', {
  get() {
    return async (args: { tvId: number; language?: string }) =>
      getTvShowImpl(args);
  },
  set() {},
  configurable: true,
});

// Both scanners construct their TMDB clients before the prototype stubs above.
for (const scanner of [jellyfinFullScanner, jellyfinRecentScanner]) {
  for (const method of ['getTvShow', 'getTvShowForScan'] as const) {
    Object.defineProperty(scanner.tmdb, method, {
      value: async (args: { tvId: number; language?: string }) =>
        getTvShowImpl(args),
      configurable: true,
    });
  }
}

setupTestDb();

// BaseScanner constructs its TMDB client during module evaluation, before the
// prototype getter above is installed. Override that retained instance too so
// the fixture remains deterministic under both Node and Vitest loaders.
Object.defineProperty((jellyfinFullScanner as any).tmdb, 'getTvShow', {
  get() {
    return async (args: { tvId: number; language?: string }) =>
      getTvShowImpl(args);
  },
  set() {},
  configurable: true,
});

// --- Helpers ---

function fakeTmdbShow(
  tmdbId: number,
  seasons: TmdbTvSeasonResult[] = [
    {
      id: 1,
      air_date: '2024-01-01',
      episode_count: 10,
      name: 'Season 1',
      overview: '',
      season_number: 1,
    },
  ]
): TmdbTvDetails {
  return {
    id: tmdbId,
    content_ratings: { results: [] },
    created_by: [],
    episode_run_time: [],
    first_air_date: '2024-01-01',
    genres: [],
    homepage: '',
    in_production: false,
    languages: ['en'],
    last_air_date: '2024-01-01',
    name: 'Test Show',
    networks: [],
    number_of_episodes: 10,
    number_of_seasons: seasons.length,
    origin_country: ['US'],
    original_language: 'en',
    original_name: 'Test Show',
    overview: '',
    popularity: 0,
    production_companies: [],
    production_countries: [],
    spoken_languages: [],
    seasons,
    status: 'Ended',
    type: 'Scripted',
    vote_average: 0,
    vote_count: 0,
    aggregate_credits: { cast: [] },
    credits: { crew: [] },
    external_ids: {},
    keywords: { results: [] },
    videos: { results: [] },
  };
}

function fakeJellyfinSeriesItem(id: string): JellyfinLibraryItem {
  return {
    Name: 'Test Show',
    Id: id,
    Type: 'Series',
    HasSubtitles: false,
    LocationType: 'FileSystem',
    MediaType: 'Video',
  };
}

function fakeJellyfinRecentTvItem(
  type: 'Season' | 'Episode',
  id: string,
  seriesId?: string
): JellyfinLibraryItem {
  return {
    Name: type === 'Season' ? 'Season 1' : 'Episode 1',
    Id: id,
    Type: type,
    HasSubtitles: false,
    LocationType: 'FileSystem',
    ...(seriesId ? { SeriesId: seriesId } : {}),
    MediaType: 'Video',
  };
}

function fakeJellyfinMusicAlbumItem(id: string): JellyfinLibraryItem {
  return {
    Name: 'Test Album',
    Id: id,
    Type: 'MusicAlbum',
    HasSubtitles: false,
    LocationType: 'FileSystem',
    MediaType: 'Audio',
  };
}

function fakeJellyfinShowMetadata(
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

function fakeJellyfinSeason(
  seasonNumber: number,
  id: string
): JellyfinLibraryItem {
  return {
    Name: `Season ${seasonNumber}`,
    Id: id,
    IndexNumber: seasonNumber,
    Type: 'Season',
    HasSubtitles: false,
    LocationType: 'FileSystem',
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

function configureJellyfinWithLibrary(
  libraries: Library[] = [
    { id: 'test-library-id', name: 'TV Shows', enabled: true, type: 'show' },
  ]
): void {
  const settings = getSettings();
  settings.main.mediaServerType = MediaServerType.JELLYFIN;
  settings.jellyfin = {
    ...settings.jellyfin,
    ip: 'jellyfin.local',
    port: 8096,
    useSsl: false,
    apiKey: 'test-api-key',
    libraries,
  };
  settings.metadataSettings = {
    ...settings.metadataSettings,
    tv: MetadataProviderType.TMDB,
  };
}

describe('Jellyfin Scanner', () => {
  beforeEach(async () => {
    getLibraryContentsImpl = async () => [];
    getRecentlyAddedImpl = async () => [];
    getItemDataImpl = async () => undefined;
    getSeasonsImpl = async () => [];
    getEpisodesImpl = async () => [];
    getAudioChildrenWithMediaInfoImpl = async () => [];
    getReleaseGroupImpl = async () => null;
    getTvShowImpl = async () => fakeTmdbShow(1);

    await getRepository(User).update(1, {
      jellyfinUserId: 'admin-user-id',
      jellyfinDeviceId: 'admin-device-id',
    });
  });

  it('passes the resolved TMDB id to a TVDB-only provider', async () => {
    const resolvedTmdbId = 987;
    const requestedIds: number[] = [];
    const tvdbProvider: TvShowProvider = {
      getTvShow: async ({ tvId }) => {
        requestedIds.push(tvId);
        return fakeTmdbShow(resolvedTmdbId);
      },
      getTvSeason: async () => {
        throw new Error('not used');
      },
      getShowByTvdbId: async () => {
        throw new Error('not used');
      },
    };
    const originalGetInstance = Tvdb.getInstance;

    configureJellyfinWithLibrary();
    getTvShowImpl = async () => fakeTmdbShow(resolvedTmdbId);
    getSettings().metadataSettings.tv = MetadataProviderType.TVDB;
    Object.defineProperty(Tvdb, 'getInstance', {
      value: async () => tvdbProvider,
      configurable: true,
    });

    try {
      await (jellyfinFullScanner as any).getTvShow({ tmdbId: 123 });
    } finally {
      Object.defineProperty(Tvdb, 'getInstance', {
        value: originalGetInstance,
        configurable: true,
      });
    }

    assert.deepStrictEqual(requestedIds, [resolvedTmdbId]);
  });

  async function expectRecentlyAddedTvItemToUpdateItsSeries(
    itemType: 'Season' | 'Episode',
    tmdbId: number
  ): Promise<void> {
    const seriesId = `jf-recent-series-${tmdbId}`;
    const seasonId = `jf-recent-season-${tmdbId}`;
    const metadataLookups: string[] = [];

    configureJellyfinWithLibrary();
    getRecentlyAddedImpl = async (libraryId, libraryType) => {
      assert.strictEqual(libraryId, 'test-library-id');
      assert.strictEqual(libraryType, 'show');
      return [
        fakeJellyfinRecentTvItem(
          itemType,
          `jf-recent-item-${tmdbId}`,
          seriesId
        ),
      ];
    };
    getItemDataImpl = async (id) => {
      metadataLookups.push(id);
      return id === seriesId
        ? fakeJellyfinShowMetadata(seriesId, String(tmdbId))
        : undefined;
    };
    getTvShowImpl = async ({ tvId }) =>
      fakeTmdbShow(tvId, [
        {
          id: 1,
          air_date: '2024-01-01',
          episode_count: 2,
          name: 'Season 1',
          overview: '',
          season_number: 1,
        },
      ]);
    getSeasonsImpl = async (id) =>
      id === seriesId ? [fakeJellyfinSeason(1, seasonId)] : [];
    getEpisodesImpl = async (_seriesID, id) =>
      id === seasonId ? fakeJellyfinEpisodes(2) : [];

    await runWithMockTimers(() => jellyfinRecentScanner.run());

    const media = await getRepository(Media).findOneOrFail({
      where: { tmdbId, mediaType: MediaType.TV },
    });
    assert.strictEqual(media.status, MediaStatus.AVAILABLE);
    assert.deepStrictEqual(metadataLookups, [seriesId]);
  }

  it('processes recently added seasons through their parent series', async () => {
    await expectRecentlyAddedTvItemToUpdateItsSeries('Season', 800001);
  });

  it('processes recently added episodes through their parent series', async () => {
    await expectRecentlyAddedTvItemToUpdateItsSeries('Episode', 800002);
  });

  it('skips recently added TV items that have no parent series ID', async () => {
    configureJellyfinWithLibrary();
    getRecentlyAddedImpl = async () => [
      fakeJellyfinRecentTvItem('Episode', 'jf-recent-orphan-episode'),
    ];
    const metadataLookups: string[] = [];
    getItemDataImpl = async (id) => {
      metadataLookups.push(id);
      return undefined;
    };

    await runWithMockTimers(() => jellyfinRecentScanner.run());

    assert.deepStrictEqual(metadataLookups, []);
    assert.strictEqual(
      await getRepository(Media).findOneBy({ tmdbId: 800003 }),
      null
    );
  });

  it('marks Jellyfin music albums available using their release-group ID', async () => {
    const releaseGroupId = 'jellyfin-music-release-group';
    configureJellyfinWithLibrary([
      { id: 'music', name: 'Music', enabled: true, type: 'music' },
    ]);
    getLibraryContentsImpl = async () => [
      fakeJellyfinMusicAlbumItem('jellyfin-album-id'),
    ];
    getItemDataImpl = async () => ({
      ...fakeJellyfinMusicAlbumItem('jellyfin-album-id'),
      ProviderIds: { MusicBrainzReleaseGroup: releaseGroupId },
      DateCreated: '2026-08-04T00:00:00.000Z',
    });

    await jellyfinFullScanner.run();

    const media = await getRepository(Media).findOneOrFail({
      where: { mbId: releaseGroupId, mediaType: MediaType.MUSIC },
    });
    assert.strictEqual(media.status, MediaStatus.AVAILABLE);
    assert.strictEqual(media.jellyfinMediaId, 'jellyfin-album-id');
  });

  it('resolves Jellyfin album IDs to release-group IDs', async () => {
    const releaseGroupId = 'resolved-jellyfin-release-group';
    configureJellyfinWithLibrary([
      { id: 'music', name: 'Music', enabled: true, type: 'music' },
    ]);
    getLibraryContentsImpl = async () => [
      fakeJellyfinMusicAlbumItem('jellyfin-release-id'),
    ];
    getItemDataImpl = async () => ({
      ...fakeJellyfinMusicAlbumItem('jellyfin-release-id'),
      ProviderIds: { MusicBrainzAlbum: 'jellyfin-release-id' },
    });
    getReleaseGroupImpl = async (releaseId) => {
      assert.strictEqual(releaseId, 'jellyfin-release-id');
      return releaseGroupId;
    };

    await jellyfinFullScanner.run();

    const media = await getRepository(Media).findOneOrFail({
      where: { mbId: releaseGroupId, mediaType: MediaType.MUSIC },
    });
    assert.strictEqual(media.status, MediaStatus.AVAILABLE);
  });

  it('retains separate MP3 and FLAC album identifiers for the same release group', async () => {
    const releaseGroupId = 'jellyfin-audio-variants';
    configureJellyfinWithLibrary([
      { id: 'mp3', name: 'MP3', enabled: true, type: 'music' },
      { id: 'flac', name: 'FLAC', enabled: true, type: 'music' },
    ]);
    getLibraryContentsImpl = async (libraryId) => [
      fakeJellyfinMusicAlbumItem(`${libraryId}-album`),
    ];
    getItemDataImpl = async (itemId) => ({
      ...fakeJellyfinMusicAlbumItem(itemId),
      ProviderIds: { MusicBrainzReleaseGroup: releaseGroupId },
      MediaSources: [
        {
          Protocol: 'File',
          Id: `${itemId}-source`,
          Path: `/music/${itemId}`,
          Type: 'Default',
          VideoType: 'None',
          MediaStreams: [
            {
              Codec: itemId.startsWith('flac') ? 'flac' : 'mp3',
              Type: 'Audio',
              DisplayTitle: 'Audio',
            },
          ],
        },
      ],
    });

    await jellyfinFullScanner.run();

    const media = await getRepository(Media).findOneOrFail({
      where: { mbId: releaseGroupId, mediaType: MediaType.MUSIC },
    });
    assert.strictEqual(media.jellyfinMediaIdMp3, 'mp3-album');
    assert.strictEqual(media.jellyfinMediaIdFlac, 'flac-album');
  });

  describe('empty TMDB season handling', () => {
    it('should mark show as available when all non-empty TMDB seasons are fully scanned and an empty placeholder season exists in the DB', async () => {
      configureJellyfinWithLibrary();

      const mediaRepository = getRepository(Media);

      const media = new Media();
      media.tmdbId = 5000;
      media.mediaType = MediaType.TV;
      media.status = MediaStatus.PARTIALLY_AVAILABLE;
      media.jellyfinMediaId = 'jf-scanner-show-id';
      media.seasons = [
        new Season({
          seasonNumber: 1,
          status: MediaStatus.AVAILABLE,
          status4k: MediaStatus.UNKNOWN,
        }),
        new Season({
          seasonNumber: 2,
          status: MediaStatus.AVAILABLE,
          status4k: MediaStatus.UNKNOWN,
        }),
        new Season({
          seasonNumber: 3,
          status: MediaStatus.UNKNOWN,
          status4k: MediaStatus.UNKNOWN,
        }),
      ];

      await mediaRepository.save(media);

      getTvShowImpl = async () =>
        fakeTmdbShow(5000, [
          {
            id: 1,
            air_date: '2024-01-01',
            episode_count: 10,
            name: 'Season 1',
            overview: '',
            season_number: 1,
          },
          {
            id: 2,
            air_date: '2024-01-01',
            episode_count: 10,
            name: 'Season 2',
            overview: '',
            season_number: 2,
          },
          {
            id: 3,
            air_date: '2024-01-01',
            episode_count: 0,
            name: 'Season 3',
            overview: '',
            season_number: 3,
          },
        ]);

      // Jellyfin: S1 and S2 are fully scanned; S3 has no files.
      getLibraryContentsImpl = async (id: string) => {
        if (id === 'test-library-id') {
          return [fakeJellyfinSeriesItem('jf-scanner-show-id')];
        }
        return [];
      };

      getItemDataImpl = async (id: string) => {
        if (id === 'jf-scanner-show-id') {
          return fakeJellyfinShowMetadata('jf-scanner-show-id', '5000');
        }
        return undefined;
      };

      getSeasonsImpl = async (seriesID: string) => {
        if (seriesID === 'jf-scanner-show-id') {
          return [
            fakeJellyfinSeason(1, 'jf-scanner-s1-id'),
            fakeJellyfinSeason(2, 'jf-scanner-s2-id'),
          ];
        }
        return [];
      };

      getEpisodesImpl = async (_seriesID: string, seasonID: string) => {
        if (seasonID === 'jf-scanner-s1-id') return fakeJellyfinEpisodes(10);
        if (seasonID === 'jf-scanner-s2-id') return fakeJellyfinEpisodes(10);
        return [];
      };

      await runWithMockTimers(() => jellyfinFullScanner.run());

      const updated = await mediaRepository.findOneOrFail({
        where: { tmdbId: 5000 },
        relations: { seasons: true },
      });

      assert.strictEqual(
        updated.status,
        MediaStatus.AVAILABLE,
        'Show should be AVAILABLE when all non-empty TMDB seasons are fully scanned, ignoring empty placeholder seasons'
      );
    });

    it('should mark show as available when an orphan UNKNOWN season exists in the DB but not in TMDB', async () => {
      configureJellyfinWithLibrary();

      const mediaRepository = getRepository(Media);

      const media = new Media();
      media.tmdbId = 5001;
      media.mediaType = MediaType.TV;
      media.status = MediaStatus.PARTIALLY_AVAILABLE;
      media.jellyfinMediaId = 'jf-orphan-show-id';
      media.seasons = [
        new Season({
          seasonNumber: 1,
          status: MediaStatus.AVAILABLE,
          status4k: MediaStatus.UNKNOWN,
        }),
        // Not present in the TMDB season list below
        new Season({
          seasonNumber: 2,
          status: MediaStatus.UNKNOWN,
          status4k: MediaStatus.UNKNOWN,
        }),
      ];

      await mediaRepository.save(media);

      getTvShowImpl = async () =>
        fakeTmdbShow(5001, [
          {
            id: 1,
            air_date: '2024-01-01',
            episode_count: 10,
            name: 'Season 1',
            overview: '',
            season_number: 1,
          },
        ]);

      getLibraryContentsImpl = async (id: string) => {
        if (id === 'test-library-id') {
          return [fakeJellyfinSeriesItem('jf-orphan-show-id')];
        }
        return [];
      };

      getItemDataImpl = async (id: string) => {
        if (id === 'jf-orphan-show-id') {
          return fakeJellyfinShowMetadata('jf-orphan-show-id', '5001');
        }
        return undefined;
      };

      getSeasonsImpl = async (seriesID: string) => {
        if (seriesID === 'jf-orphan-show-id') {
          return [fakeJellyfinSeason(1, 'jf-orphan-s1-id')];
        }
        return [];
      };

      getEpisodesImpl = async (_seriesID: string, seasonID: string) => {
        if (seasonID === 'jf-orphan-s1-id') return fakeJellyfinEpisodes(10);
        return [];
      };

      await runWithMockTimers(() => jellyfinFullScanner.run());

      const updated = await mediaRepository.findOneOrFail({
        where: { tmdbId: 5001 },
        relations: { seasons: true },
      });

      assert.strictEqual(
        updated.status,
        MediaStatus.AVAILABLE,
        'Show should be AVAILABLE when the only DB season missing from TMDB is an UNKNOWN orphan placeholder'
      );
    });

    it('should keep show partially available when a season missing from TMDB was previously available', async () => {
      configureJellyfinWithLibrary();

      const mediaRepository = getRepository(Media);

      const media = new Media();
      media.tmdbId = 5002;
      media.mediaType = MediaType.TV;
      media.status = MediaStatus.PARTIALLY_AVAILABLE;
      media.jellyfinMediaId = 'jf-deleted-show-id';
      media.seasons = [
        new Season({
          seasonNumber: 1,
          status: MediaStatus.AVAILABLE,
          status4k: MediaStatus.UNKNOWN,
        }),
        new Season({
          seasonNumber: 2,
          status: MediaStatus.DELETED,
          status4k: MediaStatus.UNKNOWN,
        }),
      ];

      await mediaRepository.save(media);

      getTvShowImpl = async () =>
        fakeTmdbShow(5002, [
          {
            id: 1,
            air_date: '2024-01-01',
            episode_count: 10,
            name: 'Season 1',
            overview: '',
            season_number: 1,
          },
        ]);

      getLibraryContentsImpl = async (id: string) => {
        if (id === 'test-library-id') {
          return [fakeJellyfinSeriesItem('jf-deleted-show-id')];
        }
        return [];
      };

      getItemDataImpl = async (id: string) => {
        if (id === 'jf-deleted-show-id') {
          return fakeJellyfinShowMetadata('jf-deleted-show-id', '5002');
        }
        return undefined;
      };

      getSeasonsImpl = async (seriesID: string) => {
        if (seriesID === 'jf-deleted-show-id') {
          return [fakeJellyfinSeason(1, 'jf-deleted-s1-id')];
        }
        return [];
      };

      getEpisodesImpl = async (_seriesID: string, seasonID: string) => {
        if (seasonID === 'jf-deleted-s1-id') return fakeJellyfinEpisodes(10);
        return [];
      };

      await runWithMockTimers(() => jellyfinFullScanner.run());

      const updated = await mediaRepository.findOneOrFail({
        where: { tmdbId: 5002 },
        relations: { seasons: true },
      });

      assert.strictEqual(
        updated.status,
        MediaStatus.PARTIALLY_AVAILABLE,
        'Show should stay PARTIALLY_AVAILABLE when a DELETED season is missing from the metadata provider'
      );
    });
  });
});
