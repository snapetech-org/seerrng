import { MediaStatus, MediaType } from '@server/constants/media';
import type Media from '@server/entity/Media';
import { MediaIdentifierProvider } from '@server/entity/MediaIdentifier';
import { beforeEach, expect, it, vi } from 'vitest';
import {
  libraryPlanToken,
  libraryServiceType,
  resolveLibraryRemoval,
} from './libraryRemoval';

const fixture = vi.hoisted(() => ({
  albums: [] as { id?: number; foreignAlbumId: string }[],
  series: [] as { id?: number; tvdbId: number }[],
  comics: [] as { id: string }[],
  volumes: [] as { id: number; comicvine_id: number; title: string }[],
  magazines: [] as { title: string }[],
  appApiKey: 'test-app-key',
  hasFiles: vi.fn(),
  remove: vi.fn(),
  movies: vi.fn(),
}));
vi.mock('@server/lib/externalRuntimeConfig', () => ({
  getExternalRuntimeConfig: () => ({
    main: { apiKey: fixture.appApiKey },
    radarr: [
      {
        id: 0,
        name: 'Radarr-HD',
        apiKey: 'test',
        externalUrl: 'http://test.invalid',
        is4k: false,
      },
      {
        id: 1,
        name: 'Radarr-4K',
        apiKey: 'test',
        externalUrl: 'http://test.invalid',
        is4k: true,
      },
    ],
    lidarr: [
      {
        id: 0,
        name: 'Lidarr Test',
        apiKey: 'test',
        externalUrl: 'http://test.invalid',
      },
    ],
    sonarr: [
      {
        id: 1,
        name: 'Sonarr Test',
        apiKey: 'test',
        externalUrl: 'http://test.invalid',
      },
    ],
    readarr: [],
    mylar: [
      {
        id: 2,
        name: 'Mylar Test',
        apiKey: 'test',
        externalUrl: 'http://test.invalid',
      },
    ],
    kapowarr: [
      {
        id: 3,
        name: 'Kapowarr Test',
        apiKey: 'test',
        externalUrl: 'http://test.invalid',
      },
    ],
    lazylibrarian: [
      {
        id: 4,
        name: 'LazyLibrarian Test',
        apiKey: 'test',
        externalUrl: 'http://test.invalid',
      },
    ],
  }),
}));
vi.mock('@server/api/servarr/lidarr', () => ({
  default: class {
    static buildUrl() {
      return 'http://test.invalid/api/v1';
    }
    getAlbums() {
      return Promise.resolve(fixture.albums);
    }
    removeAlbum(id: number) {
      return fixture.remove(id);
    }
  },
}));
vi.mock('@server/api/servarr/radarr', () => ({
  default: class {
    static buildUrl() {
      return 'http://test.invalid/api/v3';
    }
    getMovies(options: unknown) {
      return fixture.movies(options);
    }
    removeMovieById(id: number) {
      return fixture.remove(id);
    }
  },
}));
vi.mock('@server/api/servarr/sonarr', () => ({
  default: class {
    static buildUrl() {
      return 'http://test.invalid/api/v3';
    }
    getSeries() {
      return Promise.resolve(fixture.series);
    }
    hasEpisodeFiles(id: number) {
      return fixture.hasFiles(id);
    }
    removeSeriesById(id: number) {
      return fixture.remove(id);
    }
  },
}));
vi.mock('@server/api/servarr/readarr', () => ({ default: class {} }));
vi.mock('@server/api/comics/mylar', () => ({
  default: class {
    static buildUrl() {
      return 'http://test.invalid';
    }
    getIndex() {
      return Promise.resolve(fixture.comics);
    }
    removeComic(id: string) {
      return fixture.remove(id);
    }
  },
}));
vi.mock('@server/api/comics/kapowarr', () => ({
  default: class {
    static buildUrl() {
      return 'http://test.invalid';
    }
    getVolumes() {
      return Promise.resolve(fixture.volumes);
    }
    removeVolume(id: number) {
      return fixture.remove(id);
    }
  },
}));
vi.mock('@server/api/lazylibrarian', () => ({
  default: class {
    static buildUrl() {
      return 'http://test.invalid';
    }
    getMagazines() {
      return Promise.resolve(fixture.magazines);
    }
    removeMagazine(title: string) {
      return fixture.remove(title);
    }
  },
}));

const media = { id: 42, mediaType: MediaType.MUSIC, mbId: 'album-id' } as Media;
it('does not assume a comic backend when its service type is unknown', () => {
  expect(() => libraryServiceType(MediaType.COMIC)).toThrow(
    'Cannot safely identify the comic backend.'
  );
  expect(libraryServiceType(MediaType.COMIC, 'mylar')).toBe('mylar');
});

beforeEach(() => {
  fixture.appApiKey = 'test-app-key';
  fixture.albums = [];
  fixture.series = [];
  fixture.comics = [];
  fixture.volumes = [];
  fixture.magazines = [];
  fixture.remove.mockReset();
  fixture.movies.mockReset();
});

it('signs destructive library plans with the application API key', () => {
  const authority = { serviceApiKey: 'service-key' };
  const token = libraryPlanToken(42, [], authority);
  fixture.appApiKey = 'rotated-app-key';
  expect(libraryPlanToken(42, [], authority)).not.toBe(token);
});

it('queries only the exact movie with strict verification across every Radarr service', async () => {
  fixture.movies.mockResolvedValue([{ id: 9, tmdbId: 123 }]);
  const resolved = await resolveLibraryRemoval({
    id: 44,
    mediaType: MediaType.MOVIE,
    tmdbId: 123,
  } as Media);
  expect(fixture.movies.mock.calls).toEqual([
    [{ tmdbId: 123, strict: true }],
    [{ tmdbId: 123, strict: true }],
  ]);
  expect(
    resolved.plan.targets.map(({ service, quality }) => ({ service, quality }))
  ).toEqual([
    { service: 'Radarr-HD', quality: 'HD' },
    { service: 'Radarr-4K', quality: '4K' },
  ]);
  expect(fixture.remove).not.toHaveBeenCalled();
});

it('fails the whole movie preflight if one service cannot be verified', async () => {
  fixture.movies
    .mockResolvedValueOnce([{ id: 9, tmdbId: 123 }])
    .mockRejectedValueOnce(new Error('Unavailable'));
  await expect(
    resolveLibraryRemoval({
      id: 44,
      mediaType: MediaType.MOVIE,
      tmdbId: 123,
    } as Media)
  ).rejects.toThrow(
    'Unable to verify library copies in Radarr-4K. No deletion has started.'
  );
  expect(fixture.remove).not.toHaveBeenCalled();
});

it.each([undefined, 0, -1, 1.5])(
  'rejects a matched series with invalid ID %s without removal',
  async (id) => {
    fixture.series = [{ id, tvdbId: 123 }];
    await expect(
      resolveLibraryRemoval({
        id: 43,
        mediaType: MediaType.TV,
        tvdbId: 123,
      } as Media)
    ).rejects.toThrow(
      'Unable to verify library copies in Sonarr Test. No deletion has started.'
    );
    expect(fixture.remove).not.toHaveBeenCalled();
  }
);

it('resolves the exact series without removing it during a lookup', async () => {
  fixture.series = [
    { id: 9, tvdbId: 123 },
    { id: 10, tvdbId: 124 },
  ];
  const resolved = await resolveLibraryRemoval({
    id: 43,
    mediaType: MediaType.TV,
    tvdbId: 123,
  } as Media);
  expect(resolved.plan.targets).toHaveLength(1);
  expect(resolved.plan.targets[0]).toMatchObject({
    externalId: 9,
    service: 'Sonarr Test',
  });
  expect(fixture.remove).not.toHaveBeenCalled();
  await resolved.remove(resolved.plan.targets[0]);
  expect(fixture.remove).toHaveBeenCalledExactlyOnceWith(9);
});

it.each([undefined, 0, -1, 1.5])(
  'rejects a matched album with invalid ID %s without any removal',
  async (id) => {
    fixture.albums = [{ id, foreignAlbumId: 'album-id' }];
    await expect(resolveLibraryRemoval(media)).rejects.toThrow(
      'Unable to verify library copies in Lidarr Test. No deletion has started.'
    );
    expect(fixture.remove).not.toHaveBeenCalled();
  }
);

it('resolves the exact album and keeps reading separate from removal', async () => {
  fixture.albums = [
    { id: 9, foreignAlbumId: 'album-id' },
    { id: 10, foreignAlbumId: 'other' },
  ];
  const resolved = await resolveLibraryRemoval(media);
  expect(resolved.plan.targets).toHaveLength(1);
  expect(resolved.plan.targets[0]).toMatchObject({
    externalId: 9,
    serviceId: 0,
    service: 'Lidarr Test',
  });
  expect(fixture.remove).not.toHaveBeenCalled();
  await resolved.remove(resolved.plan.targets[0]);
  expect(fixture.remove).toHaveBeenCalledExactlyOnceWith(9);
});

it('resolves a Mylar comic only by its canonical ComicVine identifier', async () => {
  fixture.comics = [{ id: '5678' }, { id: '9999' }];
  const resolved = await resolveLibraryRemoval({
    id: 45,
    mediaType: MediaType.COMIC,
    comicServiceType: 'mylar',
    identifiers: [
      { provider: MediaIdentifierProvider.COMICVINE, value: '5678' },
    ],
  } as Media);

  expect(resolved.plan.targets).toHaveLength(1);
  expect(resolved.plan.targets[0]).toMatchObject({
    externalId: '5678',
    service: 'Mylar Test',
    serviceType: 'mylar',
  });
  expect(fixture.remove).not.toHaveBeenCalled();
  await resolved.remove(resolved.plan.targets[0]);
  expect(fixture.remove).toHaveBeenCalledExactlyOnceWith('5678');
});

it('resolves a Kapowarr comic only by its canonical ComicVine identifier', async () => {
  fixture.volumes = [
    { id: 7, comicvine_id: 5678, title: 'Matched Comic' },
    { id: 8, comicvine_id: 9999, title: 'Other Comic' },
  ];
  const resolved = await resolveLibraryRemoval({
    id: 46,
    mediaType: MediaType.COMIC,
    comicServiceType: 'kapowarr',
    identifiers: [
      { provider: MediaIdentifierProvider.COMICVINE, value: '5678' },
    ],
  } as Media);

  expect(resolved.plan.targets).toHaveLength(1);
  expect(resolved.plan.targets[0]).toMatchObject({
    externalId: 7,
    service: 'Kapowarr Test',
    serviceType: 'kapowarr',
  });
  expect(fixture.remove).not.toHaveBeenCalled();
  await resolved.remove(resolved.plan.targets[0]);
  expect(fixture.remove).toHaveBeenCalledExactlyOnceWith(7);
});

it('resolves a magazine by its normalized LazyLibrarian identity', async () => {
  fixture.magazines = [{ title: 'The Atlantic' }, { title: 'Other' }];
  const resolved = await resolveLibraryRemoval({
    id: 47,
    mediaType: MediaType.MAGAZINE,
    identifiers: [
      {
        provider: MediaIdentifierProvider.LAZYLIBRARIAN,
        value: '  THE   ATLANTIC ',
      },
    ],
  } as Media);

  expect(resolved.plan.targets).toHaveLength(1);
  expect(resolved.plan.targets[0]).toMatchObject({
    externalId: 'The Atlantic',
    service: 'LazyLibrarian Test',
    serviceType: 'lazylibrarian',
  });
  expect(fixture.remove).not.toHaveBeenCalled();
  await resolved.remove(resolved.plan.targets[0]);
  expect(fixture.remove).toHaveBeenCalledExactlyOnceWith('The Atlantic');
});

it('keeps an empty Sonarr tracking record removable while exposing stale availability recovery', async () => {
  fixture.series = [{ id: 17, tvdbId: 81189 }];
  fixture.hasFiles.mockResolvedValue(false);
  const resolved = await resolveLibraryRemoval({
    id: 42,
    mediaType: MediaType.TV,
    tvdbId: 81189,
    status: MediaStatus.AVAILABLE,
    status4k: MediaStatus.AVAILABLE,
  } as Media);
  expect(resolved.plan.targets).toHaveLength(1);
  expect(resolved.plan.staleAvailabilityQualities).toEqual(['HD']);
  expect(fixture.hasFiles).toHaveBeenCalledWith(17);
  expect(fixture.remove).not.toHaveBeenCalled();
  fixture.hasFiles.mockResolvedValue(true);
  const changed = await resolveLibraryRemoval({
    id: 42,
    mediaType: MediaType.TV,
    tvdbId: 81189,
    status: MediaStatus.AVAILABLE,
  } as Media);
  expect(changed.plan.staleAvailabilityQualities).toEqual([]);
  expect(changed.plan.token).not.toBe(resolved.plan.token);
});

it('fails closed when the Sonarr file inventory cannot be verified', async () => {
  fixture.series = [{ id: 17, tvdbId: 81189 }];
  fixture.hasFiles.mockRejectedValue(new Error('unavailable'));
  await expect(
    resolveLibraryRemoval({
      id: 42,
      mediaType: MediaType.TV,
      tvdbId: 81189,
      status: MediaStatus.AVAILABLE,
    } as Media)
  ).rejects.toThrow('Unable to verify library copies');
});
