// The Lumen music pages on a Lidarr install: every music route the pages use,
// answered from Lidarr (library, downloads, following), ListenBrainz (artist
// pages) and Deezer (charts, genres, playlists, previews), checked against the
// real OpenAPI contract.
import ListenBrainzAPI from '@server/api/listenbrainz';
import MusicBrainz from '@server/api/musicbrainz';
import LidarrAPI from '@server/api/servarr/lidarr';
import { getRepository } from '@server/datasource';
import type { User } from '@server/entity/User';
import cacheManager from '@server/lib/cache';
import { hydrateMediaSummaryRelations } from '@server/lib/mediaSummaryHydration';
import { clearRequestAllTracklistCache } from '@server/lib/musicRequestAllPlan';
import { Permission, hasPermission } from '@server/lib/permissions';
import type * as settingsModule from '@server/lib/settings';
import { getSettings } from '@server/lib/settings';
import musicRoutes from '@server/routes/music';
import express from 'express';
import * as OpenApiValidator from 'express-openapi-validator';
import path from 'node:path';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@server/lib/settings', async (importOriginal) => ({
  ...(await importOriginal<typeof settingsModule>()),
  getSettings: vi.fn(),
}));
vi.mock('@server/datasource', () => ({ getRepository: vi.fn() }));
vi.mock('@server/lib/mediaSummaryHydration', () => ({
  hydrateMediaSummaryRelations: vi.fn().mockResolvedValue([]),
}));

const deezer = vi.hoisted(() => ({
  searchTracks: vi.fn(),
  searchArtists: vi.fn(),
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
    searchArtists = deezer.searchArtists;
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

const ARTIST = 'a74b1b7f-71a5-4011-9441-d0b5e4122711';
const ALBUM = 'b1392450-e666-3926-a536-22c65f834433';
const OTHER = 'c1392450-e666-3926-a536-22c65f834434';

const user = (): User =>
  ({
    id: 7,
    permissions: Permission.REQUEST_MUSIC + Permission.AUTO_APPROVE_MUSIC,
    hasPermission(
      required: Permission | Permission[],
      options?: { type: 'and' | 'or' }
    ) {
      return hasPermission(
        required,
        Permission.REQUEST_MUSIC + Permission.AUTO_APPROVE_MUSIC,
        options
      );
    },
  }) as unknown as User;

const app = () => {
  const server = express();
  server.use(express.json());
  server.use(
    OpenApiValidator.middleware({
      apiSpec: path.join(process.cwd(), 'seerr-api.yml'),
      validateRequests: true,
      validateResponses: true,
      validateSecurity: false,
    })
  );
  server.use((req, _res, next) => {
    req.user = user();
    next();
  });
  server.use('/api/v1/music', musicRoutes);
  server.use(
    (
      err: { status?: number; message?: string },
      _req: express.Request,
      res: express.Response,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      _next: express.NextFunction
    ) => {
      res.status(err.status ?? 500).json({ message: err.message });
    }
  );
  return server;
};

let lidarrArtists: Record<string, unknown>[] = [];

describe('music routes on a Lidarr install', () => {
  beforeEach(() => {
    cacheManager.getCache('lidarr').flush();
    cacheManager.getCache('aurral').flush();
    clearRequestAllTracklistCache();
    vi.mocked(getSettings).mockReturnValue({
      aurral: [],
      lidarr: [
        {
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
          tags: [],
        },
      ],
    } as unknown as ReturnType<typeof getSettings>);
    vi.mocked(hydrateMediaSummaryRelations).mockResolvedValue([]);
    vi.mocked(getRepository).mockReturnValue({
      find: vi.fn().mockResolvedValue([]),
      findOne: vi.fn().mockResolvedValue(null),
    } as unknown as ReturnType<typeof getRepository>);
    vi.spyOn(MusicBrainz.prototype, 'getReleaseGroupDetails').mockRejectedValue(
      new Error('Request failed with status code 404')
    );
    lidarrArtists = [
      {
        id: 11,
        artistName: 'Radiohead',
        foreignArtistId: ARTIST,
        monitored: true,
        monitorNewItems: 'none',
        added: '2026-01-01T00:00:00Z',
        statistics: { albumCount: 1, trackFileCount: 12, trackCount: 12 },
      },
    ];
    vi.spyOn(
      LidarrAPI.prototype as unknown as {
        get: (endpoint: string, config?: unknown) => Promise<unknown>;
      },
      'get'
    ).mockImplementation(async (endpoint) => {
      if (endpoint === '/artist') return lidarrArtists;
      if (endpoint === '/album')
        return [
          {
            id: 21,
            title: 'OK Computer',
            foreignAlbumId: ALBUM,
            artistId: 11,
            artist: { artistName: 'Radiohead', foreignArtistId: ARTIST },
            albumType: 'Album',
            releaseDate: '1997-05-21T00:00:00Z',
            added: '2026-02-01T00:00:00Z',
            monitored: true,
            statistics: { trackFileCount: 12, trackCount: 12 },
          },
        ];
      if (endpoint === '/queue')
        return {
          records: [
            {
              id: 1,
              albumId: 22,
              status: 'downloading',
              trackedDownloadState: 'downloading',
              added: '2026-05-01T00:00:00Z',
              album: { title: 'Kid A', foreignAlbumId: OTHER },
              artist: { artistName: 'Radiohead' },
            },
          ],
        };
      if (endpoint === '/history')
        return {
          records: [
            {
              id: 5,
              eventType: 'downloadFailed',
              date: '2026-04-28T00:00:00Z',
              data: { message: 'No indexer found the album' },
              album: { title: 'Amnesiac' },
              artist: { artistName: 'Radiohead' },
            },
          ],
        };
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
          },
        ];
      throw new Error(`unexpected Lidarr call ${endpoint}`);
    });
    vi.spyOn(
      LidarrAPI.prototype as unknown as {
        request: (
          method: string,
          endpoint: string,
          body: unknown
        ) => Promise<{ data: unknown }>;
      },
      'request'
    ).mockImplementation(async (_method, _endpoint, body) => {
      lidarrArtists = [body as Record<string, unknown>];
      return { data: body };
    });
    vi.spyOn(ListenBrainzAPI.prototype, 'getAlbum').mockRejectedValue(
      new Error('No track lists in these tests.')
    );
    vi.spyOn(ListenBrainzAPI.prototype, 'getArtist').mockResolvedValue({
      artist: {
        name: 'Radiohead',
        type: 'Group',
        area: 'United Kingdom',
        begin_year: 1985,
        tag: { artist: [] },
      },
      releaseGroups: [
        {
          mbid: ALBUM,
          name: 'OK Computer',
          date: '1997-05-21',
          type: 'Album',
          secondary_types: [],
        },
        {
          mbid: OTHER,
          name: 'Kid A',
          date: '2000-10-02',
          type: 'Album',
          secondary_types: [],
        },
      ],
      similarArtists: { artists: [{ artist_mbid: OTHER, name: 'Portishead' }] },
    } as never);
    deezer.searchTracks.mockResolvedValue([
      {
        id: 42,
        title: 'Karma Police',
        artistName: 'Radiohead',
        rank: 900,
        coverUrl: null,
      },
    ]);
    deezer.searchArtists.mockResolvedValue([]);
    deezer.getChart.mockResolvedValue({
      tracks: [
        {
          id: 42,
          title: 'Karma Police',
          artistName: 'Radiohead',
          albumTitle: 'OK Computer',
          durationMs: 264000,
          coverUrl: null,
          rank: 900,
        },
      ],
      albums: [
        {
          id: 7,
          title: 'OK Computer',
          artistName: 'Radiohead',
          coverUrl: null,
          recordType: 'album',
        },
      ],
      artists: [{ id: 3, name: 'Radiohead', pictureXl: null, nbFan: 1 }],
    });
    deezer.findArtist.mockResolvedValue({
      id: 3,
      name: 'Radiohead',
      pictureXl: null,
      nbFan: 1,
    });
    deezer.getRelatedArtists.mockResolvedValue([
      { id: 4, name: 'Portishead', pictureXl: null, nbFan: 1 },
    ]);
    deezer.getGenres.mockResolvedValue([
      { id: 0, name: 'All' },
      { id: 152, name: 'Rock' },
    ]);
    deezer.getArtistsForGenreTag.mockResolvedValue([
      { id: 3, name: 'Radiohead', pictureXl: null, nbFan: 1 },
    ]);
    deezer.getChartPlaylists.mockResolvedValue([
      {
        id: '1479458365',
        name: 'Rock Hits',
        curator: 'Deezer',
        trackCount: 50,
        artworkUrl: null,
      },
    ]);
    deezer.getPlaylist.mockResolvedValue({
      id: '1479458365',
      name: 'Rock Hits',
      curator: 'Deezer',
      trackCount: 1,
      artworkUrl: null,
      description: null,
      tracks: [
        {
          id: 42,
          title: 'Karma Police',
          artistName: 'Radiohead',
          albumTitle: 'OK Computer',
          durationMs: 264000,
          coverUrl: null,
          rank: 900,
        },
      ],
    });
    deezer.searchAlbums.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('answers every music page route through the OpenAPI contract', async () => {
    const server = app();
    for (const url of [
      '/api/v1/music/search?q=radiohead&limit=8',
      '/api/v1/music/discover/trending',
      '/api/v1/music/discover/genres?limit=5',
      '/api/v1/music/discover/genre?tag=rock&limit=10&offset=0',
      '/api/v1/music/discover/recommended',
      '/api/v1/music/discover/playlists',
      '/api/v1/music/discover/playlists/deezer/1479458365',
      '/api/v1/music/library?kind=albums',
      '/api/v1/music/library?kind=albums&q=ok%20computer',
      '/api/v1/music/library?kind=artists',
      '/api/v1/music/activity',
      '/api/v1/music/library-overview',
      `/api/v1/music/artist/${ARTIST}`,
      `/api/v1/music/artist/${ARTIST}/similar`,
      `/api/v1/music/artist/${ARTIST}/follow`,
    ]) {
      const response = await request(server).get(url);
      expect(
        response.status,
        `${url}: ${JSON.stringify(response.body).slice(0, 300)}`
      ).toBe(200);
    }
  });

  it('shows the Lidarr library, downloads and failures', async () => {
    const server = app();
    const library = await request(server).get(
      '/api/v1/music/library?kind=albums'
    );
    expect(library.body.items).toEqual([
      expect.objectContaining({
        title: 'OK Computer',
        artistName: 'Radiohead',
        mbid: ALBUM,
        availableTrackCount: 12,
        coverUrl: '/api/v1/music/library-art/albums/21',
      }),
    ]);
    const activity = await request(server).get('/api/v1/music/activity');
    expect(
      activity.body.active.map((item: { title: string }) => item.title)
    ).toEqual(['Kid A']);
    expect(activity.body.failed).toEqual([
      expect.objectContaining({
        title: 'Amnesiac',
        reason: 'No indexer found the album',
      }),
    ]);
    const search = await request(server).get(
      '/api/v1/music/search?q=radiohead&limit=8'
    );
    expect(search.body.top).toMatchObject({
      type: 'artist',
      name: 'Radiohead',
      inLibrary: true,
    });
    expect(search.body.tracks[0]).toMatchObject({
      title: 'Karma Police',
      previewDeezerId: '42',
    });
    const artist = await request(server).get(`/api/v1/music/artist/${ARTIST}`);
    expect(artist.status).toBe(200);
    expect(JSON.stringify(artist.body)).toContain('OK Computer');
  });

  it('follows an artist in Lidarr: new releases only', async () => {
    const server = app();
    const before = await request(server).get(
      `/api/v1/music/artist/${ARTIST}/follow`
    );
    expect(before.body).toMatchObject({ inLibrary: true, following: false });
    const followed = await request(server)
      .put(`/api/v1/music/artist/${ARTIST}/follow`)
      .send({ follow: true, name: 'Radiohead' });
    expect(followed.status).toBe(200);
    expect(followed.body).toMatchObject({ following: true });
    expect(lidarrArtists[0]).toMatchObject({
      monitored: true,
      monitorNewItems: 'all',
    });
  });
});
