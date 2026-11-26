import ListenBrainzAPI from '@server/api/listenbrainz';
import LidarrAPI from '@server/api/servarr/lidarr';
import type * as settingsModule from '@server/lib/settings';
import { getSettings, type LidarrSettings } from '@server/lib/settings';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@server/lib/settings', async (importOriginal) => ({
  ...(await importOriginal<typeof settingsModule>()),
  getSettings: vi.fn(),
}));

const deezer = vi.hoisted(() => ({
  searchTracks: vi.fn(),
  getChart: vi.fn(),
  findArtist: vi.fn(),
  getRelatedArtists: vi.fn(),
  getGenres: vi.fn(),
  getArtistsForGenreTag: vi.fn(),
  getChartPlaylists: vi.fn(),
  getPlaylist: vi.fn(),
  findTrackPreviewUrl: vi.fn(),
  getTrackPreviewUrl: vi.fn(),
  searchAlbums: vi.fn(),
}));
vi.mock('@server/api/deezer', () => ({
  default: class {
    searchTracks = deezer.searchTracks;
    getChart = deezer.getChart;
    findArtist = deezer.findArtist;
    getRelatedArtists = deezer.getRelatedArtists;
    getGenres = deezer.getGenres;
    getArtistsForGenreTag = deezer.getArtistsForGenreTag;
    getChartPlaylists = deezer.getChartPlaylists;
    getPlaylist = deezer.getPlaylist;
    findTrackPreviewUrl = deezer.findTrackPreviewUrl;
    getTrackPreviewUrl = deezer.getTrackPreviewUrl;
    searchAlbums = deezer.searchAlbums;
  },
}));

const { default: LidarrMusicProvider } =
  await import('@server/lib/musicProviders/lidarr');
const { getMusicProvider, getDefaultLidarrServer } =
  await import('@server/lib/musicProviders');

const ARTIST = 'a74b1b7f-71a5-4011-9441-d0b5e4122711';
const ALBUM = 'b1392450-e666-3926-a536-22c65f834433';
const PARTIAL = 'c1392450-e666-3926-a536-22c65f834434';

const lidarrSettings = (overrides: Partial<LidarrSettings> = {}) =>
  ({
    id: 3,
    name: 'Lidarr',
    hostname: 'lidarr.local',
    port: 8686,
    apiKey: 'lidarr-key',
    useSsl: false,
    baseUrl: '',
    activeProfileId: 2,
    activeProfileName: 'Lossless',
    activeDirectory: '/music',
    activeMetadataProfileId: 1,
    is4k: false,
    isDefault: true,
    syncEnabled: false,
    preventSearch: false,
    tags: [7],
    ...overrides,
  }) as unknown as LidarrSettings;

const artistRecord = (overrides: Record<string, unknown> = {}) => ({
  id: 11,
  artistName: 'Radiohead',
  foreignArtistId: ARTIST,
  monitored: true,
  monitorNewItems: 'all',
  added: '2026-01-01T00:00:00Z',
  images: [
    {
      coverType: 'poster',
      remoteUrl: 'https://imagecache.lidarr.audio/v1/p.jpg',
    },
  ],
  statistics: { albumCount: 2, trackFileCount: 15, trackCount: 22 },
  ...overrides,
});

const albumRecord = (
  id: number,
  foreignAlbumId: string,
  title: string,
  files: number,
  tracks: number,
  added: string
) => ({
  id,
  title,
  foreignAlbumId,
  artistId: 11,
  artist: { artistName: 'Radiohead', foreignArtistId: ARTIST },
  albumType: 'Album',
  releaseDate: '1997-05-21T00:00:00Z',
  added,
  monitored: true,
  statistics: { trackFileCount: files, trackCount: tracks },
});

type GetMock = (
  endpoint: string,
  config?: { params?: Record<string, unknown> }
) => unknown;

const mockLidarr = (routes: GetMock) =>
  vi
    .spyOn(
      LidarrAPI.prototype as unknown as {
        get: (
          endpoint: string,
          config?: unknown,
          ttl?: number
        ) => Promise<unknown>;
      },
      'get'
    )
    .mockImplementation(async (endpoint, config) =>
      routes(endpoint, config as { params?: Record<string, unknown> })
    );

const library = (endpoint: string) => {
  if (endpoint === '/artist') return [artistRecord()];
  if (endpoint === '/album')
    return [
      albumRecord(21, ALBUM, 'OK Computer', 12, 12, '2026-02-01T00:00:00Z'),
      albumRecord(22, PARTIAL, 'Kid A', 3, 10, '2026-03-01T00:00:00Z'),
      albumRecord(
        23,
        'd1392450-e666-3926-a536-22c65f834435',
        'Amnesiac',
        0,
        11,
        '2026-04-01T00:00:00Z'
      ),
    ];
  return undefined;
};

describe('LidarrMusicProvider', () => {
  beforeEach(() => {
    for (const fn of Object.values(deezer)) fn.mockReset();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('lists only albums with files, filters by name, sorts, and owns or part-owns them', async () => {
    mockLidarr(library);
    const provider = new LidarrMusicProvider(lidarrSettings());

    const albums = await provider.getLibraryPage('albums', 'newest', 1, 10);
    expect(
      albums.items.map((album) => [
        album.title,
        album.availableTrackCount,
        album.trackCount,
      ])
    ).toEqual([
      ['Kid A', 3, 10],
      ['OK Computer', 12, 12],
    ]);
    expect(albums.items[1]).toMatchObject({
      artistName: 'Radiohead',
      mbid: ALBUM,
      releaseDate: '1997-05-21',
      coverUrl: '/api/v1/music/library-art/albums/21',
    });

    const filtered = await provider.getLibraryPage(
      'albums',
      'album',
      1,
      10,
      'ok comp'
    );
    expect(filtered.items.map((album) => album.title)).toEqual(['OK Computer']);

    const artists = await provider.getLibraryPage('artists', 'newest', 1, 10);
    expect(artists.items[0]).toMatchObject({
      name: 'Radiohead',
      mbid: ARTIST,
      coverUrl: '/api/v1/music/library-art/artists/11',
    });

    const groups = await provider.getLibraryArtistReleaseGroups(ARTIST);
    expect([...groups.owned]).toEqual([ALBUM]);
    expect([...groups.partial]).toEqual([PARTIAL]);
  });

  it("maps Lidarr's queue and history to activity, with the failure reason", async () => {
    mockLidarr((endpoint) => {
      if (endpoint === '/queue')
        return {
          records: [
            {
              id: 1,
              albumId: 21,
              status: 'downloading',
              trackedDownloadState: 'downloading',
              added: '2026-05-01T00:00:00Z',
              album: { title: 'OK Computer', foreignAlbumId: ALBUM },
              artist: { artistName: 'Radiohead' },
            },
            {
              id: 2,
              albumId: 22,
              status: 'completed',
              trackedDownloadState: 'importFailed',
              statusMessages: [
                {
                  title: 'Kid A',
                  messages: ['No files found are eligible for import'],
                },
              ],
              album: { title: 'Kid A', foreignAlbumId: PARTIAL },
              artist: { artistName: 'Radiohead' },
            },
          ],
        };
      if (endpoint === '/history')
        return {
          records: [
            {
              id: 9,
              eventType: 'downloadImported',
              date: '2026-04-30T00:00:00Z',
              album: { title: 'The Bends', foreignAlbumId: null },
              artist: { artistName: 'Radiohead' },
            },
            { id: 10, eventType: 'grabbed', date: '2026-04-29T00:00:00Z' },
            {
              id: 11,
              eventType: 'downloadFailed',
              date: '2026-04-28T00:00:00Z',
              data: { message: 'Download client unreachable' },
              album: { title: 'Amnesiac' },
              artist: { artistName: 'Radiohead' },
            },
          ],
        };
      return undefined;
    });
    const provider = new LidarrMusicProvider(lidarrSettings());
    const items = await provider.getActivity();
    expect(
      items.map((item) => [item.title, item.status, item.subtitle])
    ).toEqual([
      ['OK Computer', 'processing', null],
      ['Kid A', 'failed', 'No files found are eligible for import'],
      ['The Bends', 'completed', null],
      ['Amnesiac', 'failed', 'Download client unreachable'],
    ]);
    expect(items[0]).toMatchObject({
      albumMbid: ALBUM,
      artistName: 'Radiohead',
      source: 'lidarr',
    });
  });

  it('follows by watching new releases, adding the artist when needed, and unfollows without dropping requests', async () => {
    let artists: Record<string, unknown>[] = [];
    mockLidarr((endpoint) => (endpoint === '/artist' ? artists : undefined));
    const post = vi
      .spyOn(
        LidarrAPI.prototype as unknown as {
          post: (endpoint: string, body: unknown) => Promise<unknown>;
        },
        'post'
      )
      .mockImplementation(async (_endpoint, body) => {
        const added = { id: 11, ...(body as Record<string, unknown>) };
        artists = [added];
        return added;
      });
    const put = vi
      .spyOn(
        LidarrAPI.prototype as unknown as {
          request: (
            method: string,
            endpoint: string,
            body: unknown
          ) => Promise<{ data: unknown }>;
        },
        'request'
      )
      .mockImplementation(async (_method, _endpoint, body) => ({ data: body }));
    const provider = new LidarrMusicProvider(lidarrSettings());

    expect(await provider.getArtistFollowStatus(ARTIST)).toEqual({
      inLibrary: false,
      following: false,
    });
    expect(
      await provider.setArtistFollowing(ARTIST, 'Radiohead', true)
    ).toEqual({
      inLibrary: true,
      following: true,
    });
    expect(post).toHaveBeenCalledWith(
      '/artist',
      expect.objectContaining({
        foreignArtistId: ARTIST,
        qualityProfileId: 2,
        metadataProfileId: 1,
        rootFolderPath: '/music',
        monitored: true,
        monitorNewItems: 'all',
        tags: [7],
        addOptions: { monitor: 'future', searchForMissingAlbums: false },
      })
    );

    artists = [artistRecord()];
    expect(
      await provider.setArtistFollowing(ARTIST, 'Radiohead', false)
    ).toEqual({
      inLibrary: true,
      following: false,
    });
    expect(put).toHaveBeenLastCalledWith(
      'PUT',
      '/artist/11',
      expect.objectContaining({ monitored: true, monitorNewItems: 'none' })
    );
    // not in Lidarr and asked to unfollow: nothing to change
    artists = [];
    expect(
      await provider.setArtistFollowing(ARTIST, 'Radiohead', false)
    ).toEqual({
      inLibrary: false,
      following: false,
    });
  });

  it('searches artists and albums in Lidarr and songs on Deezer, marking what is owned', async () => {
    mockLidarr((endpoint, config) => {
      if (endpoint === '/artist/lookup')
        return [{ artistName: 'Radiohead', foreignArtistId: ARTIST }];
      if (endpoint === '/album/lookup')
        return [
          {
            title: 'OK Computer',
            foreignAlbumId: ALBUM,
            albumType: 'Album',
            releaseDate: '1997-05-21T00:00:00Z',
            artist: { artistName: 'Radiohead', foreignArtistId: ARTIST },
            images: [
              {
                coverType: 'cover',
                remoteUrl: 'https://imagecache.lidarr.audio/v1/c.jpg',
              },
            ],
          },
        ];
      expect(config?.params?.term).toBeUndefined();
      return library(endpoint);
    });
    deezer.searchTracks.mockResolvedValue([
      {
        id: 42,
        title: 'Karma Police',
        artistName: 'Radiohead',
        rank: 900,
        coverUrl: null,
      },
    ]);
    const provider = new LidarrMusicProvider(lidarrSettings());
    const result = await provider.searchUnified('radiohead', 8);
    expect(result.top).toMatchObject({
      type: 'artist',
      name: 'Radiohead',
      inLibrary: true,
    });
    expect(result.albums[0]).toMatchObject({
      title: 'OK Computer',
      mbid: ALBUM,
      inLibrary: true,
      coverUrl: 'https://imagecache.lidarr.audio/v1/c.jpg',
    });
    expect(result.tracks[0]).toMatchObject({
      title: 'Karma Police',
      previewDeezerId: '42',
    });
    expect(result.degraded).toBe(false);
  });

  it('builds artist pages and similar artists from ListenBrainz', async () => {
    vi.spyOn(ListenBrainzAPI.prototype, 'getArtist').mockResolvedValue({
      artist: {
        name: 'Radiohead',
        type: 'Group',
        area: 'United Kingdom',
        begin_year: 1985,
        tag: {
          artist: [
            { tag: 'rock', count: 5, artist_mbid: ARTIST },
            { tag: 'art rock', count: 9, artist_mbid: ARTIST },
          ],
        },
      },
      releaseGroups: [
        {
          mbid: ALBUM,
          name: 'OK Computer',
          date: '1997-05-21',
          type: 'Album',
          secondary_types: [],
          caa_release_mbid: PARTIAL,
          artist_mbids: [ARTIST],
        },
        {
          mbid: PARTIAL,
          name: 'Live at Somewhere',
          date: '',
          type: 'Other',
          secondary_types: ['Live'],
        },
      ],
      similarArtists: { artists: [{ artist_mbid: ALBUM, name: 'Portishead' }] },
    } as never);
    const provider = new LidarrMusicProvider(lidarrSettings());
    const details = await provider.getArtistDetails(ARTIST);
    expect(details).toMatchObject({
      name: 'Radiohead',
      country: 'United Kingdom',
      beginYear: 1985,
      genres: ['art rock', 'rock'],
    });
    expect(details?.releaseGroups[0]).toMatchObject({
      id: ALBUM,
      year: 1997,
      primaryType: 'Album',
      coverUrl: `https://coverartarchive.org/release/${PARTIAL}/front-250`,
    });
    expect(details?.releaseGroups[1]).toMatchObject({
      primaryType: 'Other',
      secondaryTypes: ['Live'],
      year: null,
    });
    expect(await provider.getSimilarArtists(ARTIST)).toEqual([
      { mbid: ALBUM, name: 'Portishead', image: null },
    ]);
    expect(await provider.getArtistDetails('not-an-id')).toBeNull();
  });

  it("serves library artwork from Lidarr's media covers", async () => {
    const request = vi
      .spyOn(
        LidarrAPI.prototype as unknown as {
          request: (
            method: string,
            endpoint: string,
            body: unknown,
            config: unknown
          ) => Promise<unknown>;
        },
        'request'
      )
      .mockImplementation(async (_method, endpoint) =>
        String(endpoint).includes('/album/')
          ? {
              status: 200,
              headers: { 'content-type': 'image/jpeg' },
              data: Buffer.from('jpeg'),
            }
          : { status: 404, headers: {}, data: Buffer.alloc(0) }
      );
    const provider = new LidarrMusicProvider(lidarrSettings());
    const art = await provider.getLibraryArtwork('albums', 21);
    expect(art).toMatchObject({ contentType: 'image/jpeg' });
    expect(request).toHaveBeenCalledWith(
      'GET',
      '/mediacover/album/21/cover-250.jpg',
      undefined,
      expect.objectContaining({ responseType: 'arraybuffer' })
    );
    expect(await provider.getLibraryArtwork('artists', 11)).toBeNull();
  });

  it('turns pasted playlist links into playlist hits and nothing else', async () => {
    const provider = new LidarrMusicProvider(lidarrSettings());
    expect(
      await provider.resolveLink(
        'https://www.deezer.com/en/playlist/1479458365'
      )
    ).toMatchObject({
      type: 'playlist',
      provider: 'deezer',
      id: '1479458365',
    });
    expect(
      await provider.resolveLink(
        'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M'
      )
    ).toMatchObject({
      provider: 'spotify',
    });
    expect(
      await provider.resolveLink('https://example.com/album/1')
    ).toBeNull();
  });

  it('only downloads previews from Deezer over HTTPS', async () => {
    const provider = new LidarrMusicProvider(lidarrSettings());
    expect(
      await provider.downloadPreview('http://cdns-preview-1.dzcdn.net/a.mp3')
    ).toBeNull();
    expect(
      await provider.downloadPreview('https://evil.example.com/a.mp3')
    ).toBeNull();
    expect(await provider.downloadPreview('not a url')).toBeNull();
  });
});

describe('getMusicProvider', () => {
  it('uses Aurral when it is set up, else the default non-4K Lidarr, else nothing', () => {
    const settings = vi.mocked(getSettings);
    settings.mockReturnValue({
      aurral: [
        {
          id: 1,
          hostname: 'aurral.local',
          port: 3001,
          apiKey: 'k',
          useSsl: false,
          isDefault: true,
        },
      ],
      lidarr: [lidarrSettings()],
    } as unknown as ReturnType<typeof getSettings>);
    expect(getMusicProvider()?.kind).toBe('aurral');

    settings.mockReturnValue({
      aurral: [],
      lidarr: [
        lidarrSettings({ id: 1, is4k: true, isDefault: true }),
        lidarrSettings({ id: 2, isDefault: false }),
      ],
    } as unknown as ReturnType<typeof getSettings>);
    expect(getMusicProvider()?.kind).toBe('lidarr');
    expect(getDefaultLidarrServer()?.id).toBe(2);

    settings.mockReturnValue({
      aurral: [],
      lidarr: [],
    } as unknown as ReturnType<typeof getSettings>);
    expect(getMusicProvider()).toBeUndefined();
  });
});
