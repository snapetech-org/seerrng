import AurralAPI from '@server/api/aurral';
import ListenBrainzAPI from '@server/api/listenbrainz';
import MusicBrainz from '@server/api/musicbrainz';
import { MediaStatus, MediaType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import type { User } from '@server/entity/User';
import cacheManager from '@server/lib/cache';
import { hydrateMediaSummaryRelations } from '@server/lib/mediaSummaryHydration';
import { resetMusicReadCache } from '@server/lib/musicReadCache';
import { clearRequestAllTracklistCache } from '@server/lib/musicRequestAllPlan';
import { Permission, hasPermission } from '@server/lib/permissions';
import type * as settingsModule from '@server/lib/settings';
import { getSettings } from '@server/lib/settings';
import musicRoutes, { warmMusicReads } from '@server/routes/music';
import axios, { type AxiosResponse } from 'axios';
import express, { type Express } from 'express';
import * as OpenApiValidator from 'express-openapi-validator';
import path from 'node:path';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@server/lib/settings', async (importOriginal) => ({
  ...(await importOriginal<typeof settingsModule>()),
  getSettings: vi.fn(),
}));

const deezerSearchTracks = vi.hoisted(() => vi.fn());
vi.mock('@server/api/deezer', () => ({
  default: class {
    searchArtists = vi.fn().mockResolvedValue([]);
    searchTracks = deezerSearchTracks;
  },
}));

vi.mock('@server/datasource', () => ({
  getRepository: vi.fn(),
}));

vi.mock('@server/lib/mediaSummaryHydration', () => ({
  hydrateMediaSummaryRelations: vi.fn().mockResolvedValue([]),
}));

const ALBUM_MBID = 'f5093c06-23e3-404f-aeaa-40f72885ee3a';
const SINGLE_MBID = 'a1093c06-23e3-404f-aeaa-40f72885ee3b';
const ARTIST_MBID = 'b10bbbfc-cf9e-42e0-be17-e2c3e1d2600d';

const parseBinaryBody: Parameters<request.Test['parse']>[0] = (res, cb) => {
  const chunks: Buffer[] = [];
  res.on('data', (chunk: Buffer) => chunks.push(chunk));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};

const createMockUser = (permissions: number): User =>
  ({
    id: 7,
    permissions,
    hasPermission(
      required: Permission | Permission[],
      options?: { type: 'and' | 'or' }
    ) {
      return hasPermission(required, permissions, options);
    },
  }) as unknown as User;

const createTestApp = (user?: User): Express => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    if (user) {
      req.user = user;
    }
    next();
  });
  app.use('/api/v1/music', musicRoutes);
  app.use(
    (
      err: { status?: number; message?: string },
      _req: express.Request,
      res: express.Response,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      _next: express.NextFunction
    ) => {
      res
        .status(err.status ?? 500)
        .json({ message: err.message ?? 'Internal server error.' });
    }
  );
  return app;
};

const configureDefaultAurral = () => {
  vi.mocked(getSettings).mockReturnValue({
    aurral: [
      {
        id: 0,
        name: 'Aurral',
        hostname: 'aurral.local',
        port: 3001,
        apiKey: 'aurral-secret-key',
        useSsl: false,
        baseUrl: '',
        isDefault: true,
        trackRequestsEnabled: true,
      },
    ],
  } as unknown as ReturnType<typeof getSettings>);
};

describe('music Aurral proxy routes', () => {
  beforeEach(() => {
    resetMusicReadCache();
    cacheManager.getCache('aurral').flush();
    // the track lists that decide which singles an album covers
    clearRequestAllTracklistCache();
    vi.spyOn(ListenBrainzAPI.prototype, 'getAlbum').mockRejectedValue(
      new Error('No track lists in these tests.')
    );
    vi.spyOn(MusicBrainz.prototype, 'getReleaseGroupDetails').mockRejectedValue(
      new Error('Request failed with status code 404')
    );
    // album fallback when Aurral's search fails
    vi.spyOn(MusicBrainz.prototype, 'searchAlbum').mockResolvedValue([]);
    vi.mocked(hydrateMediaSummaryRelations).mockResolvedValue([]);
    vi.mocked(getRepository).mockReturnValue({
      find: vi.fn().mockResolvedValue([]),
    } as unknown as ReturnType<typeof getRepository>);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('normalizes search results and attaches SeerrNG Media availability/request status', async () => {
    configureDefaultAurral();
    const existingMedia = new Media({
      id: 42,
      mbId: ALBUM_MBID,
      mediaType: MediaType.MUSIC,
      status: MediaStatus.AVAILABLE,
      status4k: MediaStatus.UNKNOWN,
    });
    const requestedMedia = new Media({
      id: 43,
      mbId: SINGLE_MBID,
      mediaType: MediaType.MUSIC,
      status: MediaStatus.PENDING,
      status4k: MediaStatus.UNKNOWN,
    });
    const findMock = vi.fn().mockResolvedValue([existingMedia, requestedMedia]);
    vi.mocked(getRepository).mockReturnValue({
      find: findMock,
    } as unknown as ReturnType<typeof getRepository>);

    const getSpy = vi
      .spyOn(
        AurralAPI.prototype as unknown as {
          get: (
            endpoint: string,
            config?: { params?: Record<string, unknown> },
            ttl?: number
          ) => Promise<unknown>;
        },
        'get'
      )
      .mockImplementation(async (endpoint: string) =>
        endpoint !== '/api/search/unified'
          ? {}
          : {
              status: 'ok',
              top: {
                type: 'artist',
                id: ARTIST_MBID,
                name: 'Radiohead',
                image:
                  '/api/image-proxy?src=https%3A%2F%2Fe-cdns-images.dzcdn.net%2Fimages%2Fradiohead.jpg',
                inLibrary: true,
              },
              artists: [
                {
                  type: 'artist',
                  id: ARTIST_MBID,
                  name: 'Radiohead',
                  image:
                    '/api/image-proxy?src=https%3A%2F%2Fe-cdns-images.dzcdn.net%2Fimages%2Fradiohead.jpg',
                  inLibrary: true,
                },
                {
                  type: 'artist',
                  id: 'lib:99',
                  name: 'Local Artist Only',
                  image: null,
                  inLibrary: false,
                },
              ],
              albums: [
                {
                  type: 'album',
                  id: ALBUM_MBID,
                  title: 'In Rainbows',
                  artistName: 'Radiohead',
                  artistMbid: ARTIST_MBID,
                  primaryType: 'album',
                  releaseDate: '2007-10-10',
                  coverUrl:
                    'https://coverartarchive.org/release-group/in-rainbows/front',
                  inLibrary: false,
                },
                {
                  type: 'album',
                  id: SINGLE_MBID,
                  title: 'Jigsaw Falling Into Place',
                  artistName: 'Radiohead',
                  artistMbid: ARTIST_MBID,
                  primaryType: 'single',
                  releaseDate: '2008-01-14',
                  coverUrl: null,
                  inLibrary: false,
                },
              ],
              tracks: [
                {
                  type: 'track',
                  title: 'Weird Fishes/Arpeggi',
                  artistName: 'Radiohead',
                  artistMbid: ARTIST_MBID,
                  albumTitle: 'In Rainbows',
                  albumMbid: ALBUM_MBID,
                  durationMs: 318000,
                  previewDeezerId: null,
                  coverUrl:
                    'https://cdn-images.dzcdn.net/images/cover/abc/500x500.jpg',
                  inLibrary: false,
                },
              ],
            }
      );

    const app = createTestApp(createMockUser(Permission.REQUEST_MUSIC));
    const response = await request(app).get(
      '/api/v1/music/search?q=Radiohead&limit=8'
    );

    expect(response.status).toBe(200);
    expect(getSpy).toHaveBeenCalledWith(
      '/api/search/unified',
      { params: { q: 'Radiohead', limit: 8 } },
      0
    );
    expect(findMock).toHaveBeenCalledTimes(1);
    expect(response.body).toMatchObject({
      top: {
        type: 'artist',
        mbid: ARTIST_MBID,
        name: 'Radiohead',
        image: 'https://e-cdns-images.dzcdn.net/images/radiohead.jpg',
        inLibrary: true,
      },
      artists: [
        {
          mbid: ARTIST_MBID,
          name: 'Radiohead',
          image: 'https://e-cdns-images.dzcdn.net/images/radiohead.jpg',
          inLibrary: true,
        },
        {
          mbid: null,
          name: 'Local Artist Only',
          image: null,
          inLibrary: false,
        },
      ],
      albums: [
        expect.objectContaining({
          mbid: ALBUM_MBID,
          title: 'In Rainbows',
          artistName: 'Radiohead',
          artistMbid: ARTIST_MBID,
          primaryType: 'Album',
          releaseDate: '2007-10-10',
          coverUrl:
            'https://coverartarchive.org/release-group/in-rainbows/front',
          inLibrary: true,
          mediaInfo: expect.objectContaining({
            id: 42,
            status: MediaStatus.AVAILABLE,
          }),
        }),
        expect.objectContaining({
          mbid: SINGLE_MBID,
          title: 'Jigsaw Falling Into Place',
          artistName: 'Radiohead',
          artistMbid: ARTIST_MBID,
          primaryType: 'Single',
          releaseDate: '2008-01-14',
          coverUrl: null,
          inLibrary: false,
          mediaInfo: expect.objectContaining({
            id: 43,
            status: MediaStatus.PENDING,
          }),
        }),
      ],
      tracks: [
        {
          title: 'Weird Fishes/Arpeggi',
          artistName: 'Radiohead',
          artistMbid: ARTIST_MBID,
          albumTitle: 'In Rainbows',
          albumMbid: ALBUM_MBID,
          durationMs: 318000,
          previewDeezerId: null,
          coverUrl: 'https://cdn-images.dzcdn.net/images/cover/abc/500x500.jpg',
          inLibrary: true,
        },
      ],
    });
  });

  it('normalizes trending charts, genres, and genre artist discovery', async () => {
    configureDefaultAurral();
    const getSpy = vi
      .spyOn(
        AurralAPI.prototype as unknown as {
          get: (
            endpoint: string,
            config?: { params?: Record<string, unknown> },
            ttl?: number
          ) => Promise<unknown>;
        },
        'get'
      )
      .mockImplementation(async (endpoint) => {
        if (endpoint === '/api/discover/trending') {
          return {
            songs: {
              items: [
                {
                  key: 'dz:1',
                  trackName: 'End of Beginning',
                  artistName: 'Djo',
                  albumName: 'DECIDE',
                  durationMs: 159000,
                  previewDeezerId: null,
                  largeArtworkUrl: 'https://cdn-images.dzcdn.net/cover/500.jpg',
                },
              ],
            },
            albums: [
              {
                key: 'apple:1',
                name: 'Hit Me Hard and Soft',
                artistName: 'Billie Eilish',
                artworkUrl:
                  'https://is1-ssl.mzstatic.com/image/thumb/cover.jpg',
                releaseDate: '2024-05-17',
              },
            ],
            artists: [
              {
                key: 'mb:1',
                mbid: ARTIST_MBID,
                name: 'Radiohead',
                imageUrl:
                  'https://e-cdns-images.dzcdn.net/images/radiohead.jpg',
              },
            ],
          };
        }
        if (endpoint === '/api/discover/tags') {
          return { tags: ['shoegaze', 'post-punk', 'shoegaze'] };
        }
        if (endpoint === '/api/discover') {
          return { topGenres: ['shoegaze', 'Pop'] };
        }
        return {
          tag: 'shoegaze',
          recommendations: [
            {
              id: ARTIST_MBID,
              name: 'My Bloody Valentine',
              image: 'https://e-cdns-images.dzcdn.net/images/mbv.jpg',
            },
          ],
        };
      });

    const app = createTestApp(createMockUser(Permission.REQUEST));

    const trending = await request(app).get('/api/v1/music/discover/trending');
    expect(trending.status).toBe(200);
    expect(trending.body).toEqual({
      artists: [
        {
          mbid: ARTIST_MBID,
          name: 'Radiohead',
          image: 'https://e-cdns-images.dzcdn.net/images/radiohead.jpg',
          inLibrary: false,
        },
      ],
      albums: [
        {
          mbid: null,
          title: 'Hit Me Hard and Soft',
          artistName: 'Billie Eilish',
          artistMbid: null,
          primaryType: 'Album',
          releaseDate: '2024-05-17',
          coverUrl: 'https://is1-ssl.mzstatic.com/image/thumb/cover.jpg',
          inLibrary: false,
        },
      ],
      tracks: [
        {
          title: 'End of Beginning',
          artistName: 'Djo',
          artistMbid: null,
          albumTitle: 'DECIDE',
          albumMbid: null,
          durationMs: 159000,
          previewDeezerId: null,
          coverUrl: 'https://cdn-images.dzcdn.net/cover/500.jpg',
          inLibrary: false,
        },
      ],
    });
    expect(getSpy).toHaveBeenCalledWith('/api/discover/trending', {}, 900);

    // No query: the user's top genres first, then popular genres (not A-Z).
    const genres = await request(app).get(
      '/api/v1/music/discover/genres?limit=4'
    );
    expect(genres.status).toBe(200);
    expect(genres.body).toEqual({
      tags: ['shoegaze', 'Pop', 'hip hop', 'rock'],
    });
    expect(getSpy).toHaveBeenCalledWith('/api/discover', {}, 900);

    const searched = await request(app).get(
      '/api/v1/music/discover/genres?q=shoe'
    );
    expect(searched.status).toBe(200);
    expect(searched.body).toEqual({ tags: ['shoegaze', 'post-punk'] });
    expect(getSpy).toHaveBeenCalledWith(
      '/api/discover/tags',
      { params: { genres: '1', limit: 20, q: 'shoe' } },
      900
    );

    const genre = await request(app).get(
      '/api/v1/music/discover/genre?tag=shoegaze'
    );
    expect(genre.status).toBe(200);
    expect(genre.body).toEqual({
      tag: 'shoegaze',
      artists: [
        {
          mbid: ARTIST_MBID,
          name: 'My Bloody Valentine',
          image: 'https://e-cdns-images.dzcdn.net/images/mbv.jpg',
          inLibrary: false,
        },
      ],
    });
    expect(getSpy).toHaveBeenCalledWith(
      '/api/discover/by-tag',
      { params: { tag: 'shoegaze', limit: 24, offset: 0, scope: 'all' } },
      900
    );
  });

  it('returns 404 with message when no Aurral service is configured', async () => {
    vi.mocked(getSettings).mockReturnValue({
      aurral: [],
    } as unknown as ReturnType<typeof getSettings>);

    const app = createTestApp(createMockUser(Permission.REQUEST_MUSIC));

    const search = await request(app).get('/api/v1/music/search?q=Radiohead');
    expect(search.status).toBe(404);
    expect(search.body).toEqual({ message: 'No music service is configured.' });

    const trending = await request(app).get('/api/v1/music/discover/trending');
    expect(trending.status).toBe(404);
    expect(trending.body).toEqual({
      message: 'No music service is configured.',
    });

    const genres = await request(app).get('/api/v1/music/discover/genres');
    expect(genres.status).toBe(404);
    expect(genres.body).toEqual({ message: 'No music service is configured.' });

    const genre = await request(app).get(
      '/api/v1/music/discover/genre?tag=jazz'
    );
    expect(genre.status).toBe(404);
    expect(genre.body).toEqual({ message: 'No music service is configured.' });

    const preview = await request(app).get(
      '/api/v1/music/preview?artist=Radiohead&track=Reckoner'
    );
    expect(preview.status).toBe(404);
    expect(preview.body).toEqual({
      message: 'No music service is configured.',
    });

    const libraryOverview = await request(app).get(
      '/api/v1/music/library-overview'
    );
    expect(libraryOverview.status).toBe(404);
    expect(libraryOverview.body).toEqual({
      message: 'No music service is configured.',
    });

    for (const url of [
      '/api/v1/music/library?kind=albums',
      '/api/v1/music/library-art/albums/1',
      '/api/v1/music/activity',
      '/api/v1/music/discover/recommended',
      '/api/v1/music/discover/playlists',
      '/api/v1/music/discover/playlists/deezer/12345',
      `/api/v1/music/artist-image/${ARTIST_MBID}`,
      `/api/v1/music/artist/${ARTIST_MBID}`,
      `/api/v1/music/artist/${ARTIST_MBID}/follow`,
    ]) {
      const res = await request(app).get(url);
      expect(res.status, url).toBe(404);
      expect(res.body).toEqual({ message: 'No music service is configured.' });
    }

    const followPut = await request(app)
      .put(`/api/v1/music/artist/${ARTIST_MBID}/follow`)
      .send({ follow: true, name: 'Radiohead' });
    expect(followPut.status).toBe(404);
    expect(followPut.body).toEqual({
      message: 'No music service is configured.',
    });
  });

  it('requires authentication and music request permission', async () => {
    configureDefaultAurral();

    const protectedPaths = [
      '/api/v1/music/search?q=Radiohead',
      '/api/v1/music/discover/trending',
      '/api/v1/music/discover/genres',
      '/api/v1/music/discover/genre?tag=jazz',
      '/api/v1/music/discover/recommended',
      '/api/v1/music/discover/playlists',
      '/api/v1/music/discover/playlists/deezer/12345',
      '/api/v1/music/preview?artist=Radiohead&track=Reckoner',
      '/api/v1/music/library-art/albums/1',
      '/api/v1/music/library?kind=albums',
      '/api/v1/music/activity',
      '/api/v1/music/library-overview',
      `/api/v1/music/artist-image/${ARTIST_MBID}`,
      `/api/v1/music/artist/${ARTIST_MBID}`,
      `/api/v1/music/artist/${ARTIST_MBID}/follow`,
    ];

    const unauthApp = createTestApp();
    for (const url of protectedPaths) {
      const unauthRes = await request(unauthApp).get(url);
      expect(unauthRes.status, url).toBe(401);
    }
    const unauthPutRes = await request(unauthApp)
      .put(`/api/v1/music/artist/${ARTIST_MBID}/follow`)
      .send({ follow: true, name: 'Radiohead' });
    expect(unauthPutRes.status).toBe(401);

    const forbiddenApp = createTestApp(createMockUser(Permission.VOTE));
    for (const url of protectedPaths) {
      const res = await request(forbiddenApp).get(url);
      expect(res.status, url).toBe(403);
    }
    const forbiddenPutRes = await request(forbiddenApp)
      .put(`/api/v1/music/artist/${ARTIST_MBID}/follow`)
      .send({ follow: true, name: 'Radiohead' });
    expect(forbiddenPutRes.status).toBe(403);
  });

  it('streams track previews for artist/track and deezerId, handles missing previews and validation', async () => {
    configureDefaultAurral();
    const requestSpy = vi.spyOn(
      AurralAPI.prototype as unknown as {
        request: (
          method: string,
          endpoint: string,
          data?: unknown,
          config?: Record<string, unknown>
        ) => Promise<{
          status: number;
          headers: Record<string, unknown>;
          data: unknown;
        }>;
      },
      'request'
    );
    const axiosGetSpy = vi.spyOn(axios, 'get');

    const app = createTestApp(createMockUser(Permission.REQUEST_MUSIC));
    const mp3Bytes = Buffer.from('ID3-mock-mp3-audio-bytes');
    const deezerMp3Bytes = Buffer.from('ID3-deezer-clip-bytes');

    requestSpy.mockResolvedValueOnce({
      status: 302,
      headers: {
        location: 'https://cdnt-preview.dzcdn.net/api/1/1/a/b/c.mp3',
      },
      data: '',
    });
    axiosGetSpy.mockResolvedValueOnce({
      status: 200,
      headers: { 'content-type': 'audio/mpeg' },
      data: mp3Bytes,
    } as unknown as AxiosResponse);

    const byArtistTrack = await request(app)
      .get('/api/v1/music/preview?artist=Radiohead&track=Reckoner')
      .buffer(true)
      .parse(parseBinaryBody);
    expect(byArtistTrack.status).toBe(200);
    expect(byArtistTrack.headers['content-type']).toMatch(/^audio\/mpeg/);
    expect(byArtistTrack.headers['cache-control']).toBe('private, max-age=600');
    expect(Buffer.isBuffer(byArtistTrack.body)).toBe(true);
    expect(byArtistTrack.body.equals(mp3Bytes)).toBe(true);
    expect(requestSpy).toHaveBeenCalledWith(
      'GET',
      '/api/deezer/preview',
      undefined,
      expect.objectContaining({
        params: { artist: 'Radiohead', track: 'Reckoner' },
        maxRedirects: 0,
        validateStatus: expect.any(Function),
      })
    );
    expect(axiosGetSpy).toHaveBeenCalledWith(
      'https://cdnt-preview.dzcdn.net/api/1/1/a/b/c.mp3',
      expect.objectContaining({
        responseType: 'arraybuffer',
        timeout: 15_000,
        maxContentLength: 5 * 1024 * 1024,
        maxBodyLength: 5 * 1024 * 1024,
      })
    );
    const callConfig = requestSpy.mock.calls[0]?.[3] as {
      validateStatus?: (status: number) => boolean;
    };
    expect(callConfig?.validateStatus?.(302)).toBe(true);
    expect(callConfig?.validateStatus?.(404)).toBe(true);
    expect(callConfig?.validateStatus?.(500)).toBe(false);

    requestSpy.mockResolvedValueOnce({
      status: 200,
      headers: { 'content-type': 'audio/mpeg' },
      data: deezerMp3Bytes,
    });
    const byDeezerId = await request(app)
      .get('/api/v1/music/preview?deezerId=4417978021')
      .buffer(true)
      .parse(parseBinaryBody);
    expect(byDeezerId.status).toBe(200);
    expect(byDeezerId.headers['content-type']).toMatch(/^audio\/mpeg/);
    expect(byDeezerId.headers['cache-control']).toBe('private, max-age=600');
    expect(byDeezerId.body.equals(deezerMp3Bytes)).toBe(true);
    expect(requestSpy).toHaveBeenLastCalledWith(
      'GET',
      '/api/deezer/preview/4417978021.mp3?download',
      undefined,
      expect.objectContaining({
        responseType: 'arraybuffer',
        timeout: 15_000,
        maxContentLength: 5 * 1024 * 1024,
      })
    );

    requestSpy.mockResolvedValueOnce({
      status: 404,
      headers: {},
      data: { message: 'Not found' },
    });
    const notFound = await request(app).get(
      '/api/v1/music/preview?artist=Radiohead&track=Unknown'
    );
    expect(notFound.status).toBe(404);
    expect(notFound.body).toEqual({ message: 'No preview for this song.' });

    requestSpy.mockResolvedValueOnce({
      status: 404,
      headers: { 'content-type': 'application/json' },
      data: Buffer.from(JSON.stringify({ message: 'No preview' })),
    });
    const deezerNotFound = await request(app).get(
      '/api/v1/music/preview?deezerId=999'
    );
    expect(deezerNotFound.status).toBe(404);
    expect(deezerNotFound.body).toEqual({
      message: 'No preview for this song.',
    });

    requestSpy.mockResolvedValueOnce({
      status: 302,
      headers: {
        location: 'https://evil.example.com/track.mp3',
      },
      data: '',
    });
    const disallowedHost = await request(app).get(
      '/api/v1/music/preview?artist=Radiohead&track=Reckoner'
    );
    expect(disallowedHost.status).toBe(404);
    expect(disallowedHost.body).toEqual({
      message: 'No preview for this song.',
    });

    for (const invalidUrl of [
      '/api/v1/music/preview',
      '/api/v1/music/preview?track=Reckoner',
      '/api/v1/music/preview?deezerId=abc',
      `/api/v1/music/preview?deezerId=${'1'.repeat(21)}`,
    ]) {
      const invalidRes = await request(app).get(invalidUrl);
      expect(invalidRes.status, invalidUrl).toBe(400);
    }

    requestSpy.mockRejectedValueOnce(new Error('Aurral connection refused'));
    const upstreamFailure = await request(app).get(
      '/api/v1/music/preview?artist=Radiohead&track=Reckoner'
    );
    expect(upstreamFailure.status).toBe(502);
    expect(upstreamFailure.body).toEqual({
      message: 'Unable to load a preview.',
    });

    requestSpy.mockResolvedValueOnce({
      status: 302,
      headers: {
        location: 'https://cdnt-preview.dzcdn.net/api/1/1/a/b/c.mp3',
      },
      data: '',
    });
    axiosGetSpy.mockRejectedValueOnce(new Error('Deezer CDN timeout'));
    const cdnFailure = await request(app).get(
      '/api/v1/music/preview?artist=Radiohead&track=Reckoner'
    );
    expect(cdnFailure.status).toBe(502);
    expect(cdnFailure.body).toEqual({
      message: 'Unable to load a preview.',
    });
  });

  it('proxies library artwork with image content-type filtering and validation', async () => {
    configureDefaultAurral();
    const requestSpy = vi.spyOn(
      AurralAPI.prototype as unknown as {
        request: (
          method: string,
          endpoint: string,
          data?: unknown,
          config?: Record<string, unknown>
        ) => Promise<{
          status: number;
          headers: Record<string, unknown>;
          data: unknown;
        }>;
      },
      'request'
    );

    const app = createTestApp(createMockUser(Permission.REQUEST_MUSIC));
    const webpBytes = Buffer.from('RIFF-webp-bytes');
    const jpegBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);

    requestSpy.mockResolvedValueOnce({
      status: 200,
      headers: { 'content-type': 'image/webp' },
      data: webpBytes,
    });
    const albumArt = await request(app)
      .get('/api/v1/music/library-art/albums/271')
      .buffer(true)
      .parse(parseBinaryBody);
    expect(albumArt.status).toBe(200);
    expect(albumArt.headers['content-type']).toMatch(/^image\/webp/);
    expect(albumArt.headers['cache-control']).toBe('private, max-age=86400');
    expect(albumArt.body.equals(webpBytes)).toBe(true);
    expect(requestSpy).toHaveBeenCalledWith(
      'GET',
      '/api/library/albums/271/cover',
      undefined,
      expect.objectContaining({ responseType: 'arraybuffer' })
    );

    resetMusicReadCache();
    requestSpy.mockResolvedValueOnce({
      status: 200,
      headers: { 'content-type': 'image/jpeg; charset=binary' },
      data: jpegBytes,
    });
    const artistArt = await request(app)
      .get('/api/v1/music/library-art/artists/15')
      .buffer(true)
      .parse(parseBinaryBody);
    expect(artistArt.status).toBe(200);
    expect(artistArt.headers['content-type']).toMatch(/^image\/jpeg/);
    expect(artistArt.body.equals(jpegBytes)).toBe(true);

    resetMusicReadCache();
    requestSpy.mockResolvedValueOnce({
      status: 200,
      headers: { 'content-type': 'text/html' },
      data: Buffer.from('<html>nope</html>'),
    });
    const nonImage = await request(app).get(
      '/api/v1/music/library-art/albums/271'
    );
    expect(nonImage.status).toBe(404);
    expect(nonImage.body).toEqual({ message: 'Artwork not found.' });

    resetMusicReadCache();
    requestSpy.mockResolvedValueOnce({
      status: 404,
      headers: {},
      data: Buffer.from('{}'),
    });
    const missing = await request(app).get(
      '/api/v1/music/library-art/artists/999'
    );
    expect(missing.status).toBe(404);
    expect(missing.body).toEqual({ message: 'Artwork not found.' });

    for (const badUrl of [
      '/api/v1/music/library-art/tracks/1',
      '/api/v1/music/library-art/albums/0',
      '/api/v1/music/library-art/albums/-1',
      '/api/v1/music/library-art/albums/abc',
      '/api/v1/music/library-art/albums/2147483649',
    ]) {
      const res = await request(app).get(badUrl);
      expect(res.status, badUrl).toBe(400);
    }

    resetMusicReadCache();
    requestSpy.mockRejectedValueOnce(new Error('Aurral unreachable'));
    const failed = await request(app).get(
      '/api/v1/music/library-art/albums/271'
    );
    expect(failed.status).toBe(502);
    expect(failed.body).toEqual({ message: 'Unable to load library artwork.' });
  });

  it('returns normalized paged library albums and artists with validation', async () => {
    configureDefaultAurral();
    const getSpy = vi
      .spyOn(
        AurralAPI.prototype as unknown as {
          get: (
            endpoint: string,
            config?: { params?: Record<string, unknown> },
            ttl?: number
          ) => Promise<unknown>;
        },
        'get'
      )
      .mockResolvedValueOnce({
        kind: 'albums',
        page: 2,
        pageSize: 20,
        total: 45,
        hasMore: true,
        items: [
          {
            id: 271,
            title: 'In Rainbows',
            albumArtist: 'Radiohead',
            mbid: ALBUM_MBID,
            releaseGroupMbid: SINGLE_MBID,
            releaseDate: '2007-10-10',
            createdAt: 1700000000000,
            trackCount: 10,
            availableTrackCount: 10,
            coverUrl: '/api/library/albums/271/cover?v=1',
          },
          {
            id: 272,
            title: 'Untitled',
            albumArtist: null,
            mbid: 'not-valid!',
            releaseGroupMbid: null,
            releaseDate: null,
            createdAt: null,
            coverUrl: '/api/library/albums/272/cover',
          },
        ],
      })
      .mockResolvedValueOnce({
        kind: 'artists',
        page: 1,
        pageSize: 30,
        total: 1,
        hasMore: false,
        items: [
          {
            id: 15,
            name: 'Radiohead',
            mbid: ARTIST_MBID,
            albumCount: 9,
            trackCount: 112,
            coverUrl: '/api/library/artists/15/cover?v=2',
          },
        ],
      });

    const app = createTestApp(createMockUser(Permission.REQUEST_MUSIC));

    const albumsRes = await request(app).get(
      '/api/v1/music/library?kind=albums&sort=artist&page=2&pageSize=20'
    );
    expect(albumsRes.status).toBe(200);
    expect(getSpy).toHaveBeenNthCalledWith(
      1,
      '/api/library',
      {
        params: {
          kind: 'albums',
          page: 2,
          pageSize: 20,
          sort: 'artist',
          compact: 'true',
        },
      },
      0
    );
    expect(albumsRes.body).toEqual({
      kind: 'albums',
      page: 2,
      pageSize: 20,
      total: 45,
      hasMore: true,
      items: [
        {
          id: 271,
          title: 'In Rainbows',
          artistName: 'Radiohead',
          mbid: ALBUM_MBID,
          releaseGroupMbid: SINGLE_MBID,
          releaseDate: '2007-10-10',
          addedAt: new Date(1700000000000).toISOString(),
          trackCount: 10,
          availableTrackCount: 10,
          coverUrl: '/api/v1/music/library-art/albums/271',
        },
        {
          id: 272,
          title: 'Untitled',
          artistName: null,
          mbid: null,
          releaseGroupMbid: null,
          releaseDate: null,
          addedAt: null,
          trackCount: 0,
          availableTrackCount: 0,
          coverUrl: '/api/v1/music/library-art/albums/272',
        },
      ],
    });

    const artistsRes = await request(app).get(
      '/api/v1/music/library?kind=artists'
    );
    expect(artistsRes.status).toBe(200);
    expect(getSpy).toHaveBeenNthCalledWith(
      2,
      '/api/library',
      {
        params: {
          kind: 'artists',
          page: 1,
          pageSize: 30,
          sort: 'newest',
          compact: 'true',
        },
      },
      0
    );
    expect(artistsRes.body).toEqual({
      kind: 'artists',
      page: 1,
      pageSize: 30,
      total: 1,
      hasMore: false,
      items: [
        {
          id: 15,
          name: 'Radiohead',
          mbid: ARTIST_MBID,
          albumCount: 9,
          trackCount: 112,
          coverUrl: '/api/v1/music/library-art/artists/15',
        },
      ],
    });

    for (const badUrl of [
      '/api/v1/music/library',
      '/api/v1/music/library?kind=tracks',
      '/api/v1/music/library?kind=albums&sort=bogus',
      '/api/v1/music/library?kind=albums&page=0',
      '/api/v1/music/library?kind=albums&pageSize=61',
    ]) {
      const badRes = await request(app).get(badUrl);
      expect(badRes.status, badUrl).toBe(400);
    }

    getSpy.mockRejectedValueOnce(new Error('Aurral library down'));
    const failed = await request(app).get('/api/v1/music/library?kind=albums');
    expect(failed.status).toBe(502);
    expect(failed.body).toEqual({
      message: 'Unable to load your music library.',
    });
  });

  it('groups and orders music activity items and handles upstream failure', async () => {
    configureDefaultAurral();
    const pendingItems = Array.from({ length: 55 }, (_, idx) => ({
      id: `q-${idx}`,
      status: 'pending',
      statusLabel: 'Queued',
      source: 'request',
      trackName: `Queued Track ${idx}`,
      artistName: 'Artist',
      albumName: 'Album',
      requestedAt: new Date(Date.UTC(2026, 0, 1, 0, 54 - idx)).toISOString(),
    }));
    const completedItems = Array.from({ length: 25 }, (_, idx) => ({
      id: `c-${idx}`,
      status: 'completed',
      statusLabel: 'Downloaded',
      source: 'playlist',
      albumName: `Completed Album ${idx}`,
      artistName: 'Artist',
      requestedAt: new Date(Date.UTC(2026, 0, 2, 0, idx)).toISOString(),
      completedAt: new Date(Date.UTC(2026, 0, 2, 1, idx)).toISOString(),
      cause: { kind: 'playlist', playlistId: 9, name: 'Daily Mix' },
    }));

    const getSpy = vi
      .spyOn(
        AurralAPI.prototype as unknown as {
          get: (endpoint: string) => Promise<unknown>;
        },
        'get'
      )
      .mockResolvedValueOnce([
        {
          id: 'p-new',
          status: 'processing',
          statusLabel: 'Downloading',
          source: 'request',
          title: 'Fallback Title',
          artistName: 'Artist B',
          albumName: null,
          requestedAt: '2026-01-03T12:00:00.000Z',
          cause: { kind: 'request', name: 'Manual' },
        },
        {
          id: 'p-old',
          status: 'processing',
          statusLabel: 'Searching',
          source: 'request',
          trackName: 'Oldest Active',
          artistName: 'Artist A',
          albumName: 'Album A',
          requestedAt: '2026-01-03T10:00:00.000Z',
          cause: null,
        },
        ...pendingItems,
        ...completedItems,
        { id: 'f-1', status: 'failed', title: 'Failed 1' },
        { id: 'f-2', status: 'failed', title: 'Failed 2' },
        { id: 'u-1', status: 'unchanged', title: 'No upgrade' },
      ]);

    const app = createTestApp(createMockUser(Permission.REQUEST_MUSIC));
    const res = await request(app).get('/api/v1/music/activity');

    expect(res.status).toBe(200);
    expect(res.body.active).toEqual([
      {
        id: 'p-old',
        title: 'Oldest Active',
        artistName: 'Artist A',
        albumName: 'Album A',
        status: 'processing',
        statusLabel: 'Searching',
        source: 'request',
        requestedAt: '2026-01-03T10:00:00.000Z',
        cause: null,
      },
      {
        id: 'p-new',
        title: 'Fallback Title',
        artistName: 'Artist B',
        albumName: null,
        status: 'processing',
        statusLabel: 'Downloading',
        source: 'request',
        requestedAt: '2026-01-03T12:00:00.000Z',
        cause: { kind: 'request', name: 'Manual' },
      },
    ]);
    expect(res.body.queued).toHaveLength(50);
    expect(res.body.queuedTotal).toBe(55);
    expect(res.body.queued[0].id).toBe('q-54');
    expect(res.body.queued[49].id).toBe('q-5');
    expect(res.body.recent).toHaveLength(20);
    expect(res.body.recent[0]).toEqual({
      id: 'c-24',
      title: 'Completed Album 24',
      artistName: 'Artist',
      albumName: 'Completed Album 24',
      status: 'completed',
      statusLabel: 'Downloaded',
      source: 'playlist',
      requestedAt: new Date(Date.UTC(2026, 0, 2, 0, 24)).toISOString(),
      cause: { kind: 'playlist', name: 'Daily Mix' },
    });
    expect(res.body.failedTotal).toBe(2);

    // a busy or failing Aurral answers from the last read while it is recent
    getSpy.mockRejectedValueOnce(new Error('Aurral requests failed'));
    const fromCopy = await request(app).get('/api/v1/music/activity');
    expect(fromCopy.status).toBe(200);
    expect(fromCopy.body.failedTotal).toBe(2);

    resetMusicReadCache();
    getSpy.mockRejectedValueOnce(new Error('Aurral requests failed'));
    const failed = await request(app).get('/api/v1/music/activity');
    expect(failed.status).toBe(502);
    expect(failed.body).toEqual({ message: 'Unable to load music activity.' });
  });

  it('filters the library by name and passes the filter on to Aurral', async () => {
    configureDefaultAurral();
    const getSpy = vi
      .spyOn(
        AurralAPI.prototype as unknown as {
          get: (
            endpoint: string,
            config?: { params?: Record<string, unknown> },
            ttl?: number
          ) => Promise<unknown>;
        },
        'get'
      )
      .mockResolvedValue({
        kind: 'albums',
        page: 1,
        pageSize: 36,
        total: 0,
        hasMore: false,
        items: [],
      });
    const app = createTestApp(createMockUser(Permission.REQUEST_MUSIC));

    const filtered = await request(app).get(
      '/api/v1/music/library?kind=albums&q=%20In%20Rainbows%20'
    );
    expect(filtered.status).toBe(200);
    expect(getSpy).toHaveBeenLastCalledWith(
      '/api/library',
      {
        params: {
          kind: 'albums',
          page: 1,
          pageSize: 30,
          sort: 'newest',
          query: 'In Rainbows',
          compact: 'true',
        },
      },
      0
    );
    // an empty filter is no filter
    await request(app).get('/api/v1/music/library?kind=albums&q=');
    expect(getSpy).toHaveBeenLastCalledWith(
      '/api/library',
      {
        params: {
          kind: 'albums',
          page: 1,
          pageSize: 30,
          sort: 'newest',
          compact: 'true',
        },
      },
      0
    );
    const tooLong = await request(app).get(
      `/api/v1/music/library?kind=albums&q=${'a'.repeat(101)}`
    );
    expect(tooLong.status).toBe(400);
  });

  it('says why a download failed when Aurral gives a reason', async () => {
    configureDefaultAurral();
    vi.spyOn(
      AurralAPI.prototype as unknown as {
        get: (endpoint: string) => Promise<unknown>;
      },
      'get'
    ).mockResolvedValue([
      {
        id: 'f-reason',
        status: 'failed',
        trackName: 'Song A',
        artistName: 'Artist A',
        subtitle: 'No matching files found on Soulseek',
        completedAt: '2026-01-02T00:00:00.000Z',
      },
      {
        id: 'f-label',
        status: 'failed',
        trackName: 'Song B',
        artistName: 'Artist B',
        subtitle: 'Artist B · Daily Mix',
        completedAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'c-1',
        status: 'completed',
        trackName: 'Song C',
        artistName: 'Artist C',
        subtitle: 'Something that is not a failure',
      },
    ]);
    const app = createTestApp(createMockUser(Permission.REQUEST_MUSIC));
    const res = await request(app).get('/api/v1/music/activity');
    expect(res.status).toBe(200);
    expect(
      res.body.failed.map((item: { id: string; reason?: string | null }) => [
        item.id,
        item.reason ?? null,
      ])
    ).toEqual([
      ['f-reason', 'No matching files found on Soulseek'],
      ['f-label', null],
    ]);
    // no reason, no field
    expect(res.body.failed[1]).not.toHaveProperty('reason');
    expect(res.body.recent[0]).not.toHaveProperty('reason');
  });

  it('finds song covers by artist and title once, and album names in one call', async () => {
    configureDefaultAurral();
    deezerSearchTracks.mockReset();
    deezerSearchTracks.mockResolvedValue([
      {
        id: 2,
        title: 'Karma Police',
        artistName: 'Some Cover Band',
        rank: 9,
        coverUrl:
          'https://e-cdns-images.dzcdn.net/images/cover/other/250x250.jpg',
      },
      {
        id: 1,
        title: 'Karma Police',
        artistName: 'Radiohead',
        rank: 5,
        coverUrl:
          'https://e-cdns-images.dzcdn.net/images/cover/abc/250x250-000000-80-0-0.jpg',
      },
    ]);
    const app = createTestApp(createMockUser(Permission.REQUEST_MUSIC));

    const first = await request(app).get(
      '/api/v1/music/song-art?artist=Radiohead&title=Karma%20%22Police%22'
    );
    expect(first.status).toBe(302);
    // the artist's own song, not the most popular cover version
    expect(first.headers.location).toBe(
      'https://e-cdns-images.dzcdn.net/images/cover/abc/250x250-000000-80-0-0.jpg'
    );
    // a plain "artist title" search (Deezer's field search misses songs)
    expect(deezerSearchTracks).toHaveBeenCalledWith(
      'Radiohead Karma Police',
      10
    );
    const again = await request(app).get(
      '/api/v1/music/song-art?artist=radiohead&title=karma%20%22police%22'
    );
    expect(again.status).toBe(302);
    expect(deezerSearchTracks).toHaveBeenCalledTimes(1);

    deezerSearchTracks.mockResolvedValueOnce([]);
    const none = await request(app).get(
      '/api/v1/music/song-art?artist=Nobody&title=Nothing'
    );
    expect(none.status).toBe(404);
    // another artist's song is no cover for this one
    deezerSearchTracks.mockResolvedValueOnce([
      {
        id: 3,
        title: 'Lighthouse',
        artistName: 'Someone Else',
        rank: 9,
        coverUrl: 'https://e-cdns-images.dzcdn.net/images/cover/x/250x250.jpg',
      },
    ]);
    const wrongArtist = await request(app).get(
      '/api/v1/music/song-art?artist=Noah%20Kahan&title=Lighthouse'
    );
    expect(wrongArtist.status).toBe(404);

    // album names: unknown albums are left out; bad lists are refused
    const summaries = await request(app).get(
      `/api/v1/music/album-summaries?ids=${ALBUM_MBID},${SINGLE_MBID}`
    );
    expect(summaries.status).toBe(200);
    expect(summaries.body).toEqual({ results: [] });
    for (const bad of [
      '/api/v1/music/album-summaries',
      '/api/v1/music/album-summaries?ids=not-an-id',
      `/api/v1/music/album-summaries?ids=${Array.from({ length: 13 }, (_, i) => `${i.toString(16).padStart(8, '0')}-0000-4000-8000-000000000000`).join(',')}`,
    ]) {
      const res = await request(app).get(bad);
      expect(res.status, bad).toBe(400);
    }
  });

  it('puts the album of a top song first, but only when Aurral names that album', async () => {
    configureDefaultAurral();
    // same-title songs are ranked by Deezer popularity: none known here
    deezerSearchTracks.mockReset();
    deezerSearchTracks.mockResolvedValue([]);
    let albumTitle = 'In Rainbows';
    let albumMbid: string | null = ALBUM_MBID;
    vi.spyOn(
      AurralAPI.prototype as unknown as {
        get: (endpoint: string) => Promise<unknown>;
      },
      'get'
    ).mockImplementation(async (endpoint) => {
      if (endpoint === '/api/search/unified') {
        return {
          top: {
            type: 'track',
            title: 'Reckoner',
            artistName: 'Radiohead',
            albumTitle,
            albumMbid,
          },
          artists: [{ id: ARTIST_MBID, name: 'Radiohead' }],
          albums: [
            {
              id: SINGLE_MBID,
              title: 'Reckoner EP',
              artistName: 'Radiohead',
              primaryType: 'EP',
            },
            {
              id: ALBUM_MBID,
              title: 'In Rainbows',
              artistName: 'Radiohead',
              primaryType: 'Album',
            },
          ],
          // the same song three times: the song is the top result
          tracks: [1, 2, 3].map((n) => ({
            title: 'Reckoner',
            artistName: n === 1 ? 'Radiohead' : `Cover Band ${n}`,
            albumTitle: 'In Rainbows',
            albumMbid: ALBUM_MBID,
          })),
        };
      }
      return { songs: { items: [] }, albums: null, artists: null };
    });
    const app = createTestApp(createMockUser(Permission.REQUEST_MUSIC));

    const named = await request(app).get('/api/v1/music/search?q=reckoner');
    expect(named.status).toBe(200);
    expect(named.body.albums[0]?.mbid).toBe(ALBUM_MBID);

    // the order a song with no album id gets
    albumMbid = null;
    cacheManager.getCache('aurral').flush();
    const plain = await request(app).get('/api/v1/music/search?q=reckoner');
    const plainOrder = plain.body.albums.map(
      (album: { mbid: string }) => album.mbid
    );
    // the id points at an album with another name: that same order
    albumMbid = SINGLE_MBID;
    albumTitle = 'In Rainbows';
    cacheManager.getCache('aurral').flush();
    const other = await request(app).get('/api/v1/music/search?q=reckoner');
    expect(other.status).toBe(200);
    expect(
      other.body.albums.map((album: { mbid: string }) => album.mbid)
    ).toEqual(plainOrder);
  });

  it('warms the shared music answers so the first page view does not ask Aurral again', async () => {
    configureDefaultAurral();
    const emptyPage = {
      kind: 'albums' as const,
      page: 1,
      pageSize: 12,
      total: 0,
      hasMore: false,
      items: [],
    };
    vi.spyOn(AurralAPI.prototype, 'getLibraryTrackPage').mockResolvedValue({
      page: 1,
      total: 0,
      hasMore: false,
      items: [],
    } as unknown as Awaited<ReturnType<AurralAPI['getLibraryTrackPage']>>);
    vi.spyOn(AurralAPI.prototype, 'getLibraryPage').mockResolvedValue(
      emptyPage as unknown as Awaited<ReturnType<AurralAPI['getLibraryPage']>>
    );
    const recommended = vi
      .spyOn(AurralAPI.prototype, 'getDiscoverRecommended')
      .mockResolvedValue({
        recommendations: [],
        trending: [],
      } as unknown as Awaited<ReturnType<AurralAPI['getDiscoverRecommended']>>);
    const trending = vi
      .spyOn(AurralAPI.prototype, 'getTrending')
      .mockResolvedValue({
        artists: [],
        albums: [],
        tracks: [],
      } as unknown as Awaited<ReturnType<AurralAPI['getTrending']>>);
    vi.spyOn(AurralAPI.prototype, 'getDiscoverPlaylists').mockResolvedValue({
      categories: [],
    } as unknown as Awaited<ReturnType<AurralAPI['getDiscoverPlaylists']>>);

    await warmMusicReads();
    expect(trending).toHaveBeenCalledTimes(1);
    expect(recommended).toHaveBeenCalledTimes(1);

    const app = createTestApp(createMockUser(Permission.REQUEST_MUSIC));
    const res = await request(app).get('/api/v1/music/discover/recommended');
    expect(res.status).toBe(200);
    expect(recommended).toHaveBeenCalledTimes(1);
  });

  it('normalizes recommended artists, playlists, and playlist details with caching and 404/400/502 handling', async () => {
    configureDefaultAurral();
    const recs = Array.from({ length: 30 }, (_, idx) => ({
      id: idx === 0 ? ARTIST_MBID : 'not-mbid',
      name: `Rec Artist ${idx}`,
      image:
        idx === 0
          ? 'https://e-cdns-images.dzcdn.net/images/rec0.jpg'
          : 'http://insecure.example/img.jpg',
      sourceArtist: idx === 0 ? 'Bella Poarch, GAYLE +1 more' : undefined,
      matchPercent: idx === 0 ? 92 : undefined,
    }));

    const getSpy = vi
      .spyOn(
        AurralAPI.prototype as unknown as {
          get: (
            endpoint: string,
            config?: Record<string, unknown>,
            ttl?: number
          ) => Promise<unknown>;
        },
        'get'
      )
      .mockImplementation(async (endpoint) => {
        if (endpoint === '/api/discover') {
          return {
            recommendations: recs,
            globalTop: [
              {
                id: ARTIST_MBID,
                name: 'Top Artist',
                image: 'https://e-cdns-images.dzcdn.net/images/top.jpg',
                popularityLabel: 'Trending #1',
              },
            ],
          };
        }
        if (endpoint === '/api/discover/playlists') {
          return {
            categories: [
              {
                id: 'moods',
                name: 'Moods',
                group: 'Curated',
                playlists: [
                  {
                    id: 'pl-1',
                    name: 'Chill Mix',
                    curator: 'Aurral',
                    trackCount: 40,
                    artworkUrl:
                      'https://e-cdns-images.dzcdn.net/images/chill.jpg',
                    provider: 'deezer',
                  },
                ],
              },
            ],
          };
        }
        if (endpoint === '/api/discover/playlists/deezer/pl-1') {
          return {
            id: 'pl-1',
            name: 'Chill Mix',
            description: 'Relaxing tracks',
            curator: 'Aurral',
            artworkUrl: 'https://e-cdns-images.dzcdn.net/images/chill.jpg',
            provider: 'deezer',
            tracks: [
              {
                artistName: 'Radiohead',
                trackName: 'Nude',
                albumName: 'In Rainbows',
                artistMbid: ARTIST_MBID,
                albumMbid: ALBUM_MBID,
                durationMs: 255000,
                preview_url: '/api/deezer/preview/4417978021.mp3',
                artworkUrl: 'https://e-cdns-images.dzcdn.net/images/nude.jpg',
                owned: true,
              },
              {
                artistName: 'Other',
                trackName: 'Song Two',
                albumName: null,
                artistMbid: null,
                albumMbid: null,
                durationMs: 180000,
                preview_url: null,
                artworkUrl: 'http://insecure.example/cover.jpg',
                owned: null,
              },
            ],
          };
        }
        const notFoundError = Object.assign(new Error('Not found'), {
          response: { status: 404 },
        });
        throw notFoundError;
      });

    const app = createTestApp(createMockUser(Permission.REQUEST_MUSIC));

    const recommended = await request(app).get(
      '/api/v1/music/discover/recommended'
    );
    expect(recommended.status).toBe(200);
    expect(recommended.body.recommendations).toHaveLength(24);
    expect(recommended.body.recommendations[0]).toEqual({
      mbid: ARTIST_MBID,
      name: 'Rec Artist 0',
      image: 'https://e-cdns-images.dzcdn.net/images/rec0.jpg',
      because: 'Bella Poarch, GAYLE +1 more',
      matchPercent: 92,
    });
    expect(recommended.body.recommendations[1]).toEqual({
      mbid: null,
      name: 'Rec Artist 1',
      image: null,
      because: null,
      matchPercent: null,
    });
    expect(recommended.body.trending).toEqual([
      {
        mbid: ARTIST_MBID,
        name: 'Top Artist',
        image: 'https://e-cdns-images.dzcdn.net/images/top.jpg',
        label: 'Trending #1',
      },
    ]);
    expect(getSpy).toHaveBeenCalledWith('/api/discover', {}, 900);

    const playlists = await request(app).get(
      '/api/v1/music/discover/playlists'
    );
    expect(playlists.status).toBe(200);
    expect(playlists.body).toEqual({
      categories: [
        {
          id: 'moods',
          name: 'Moods',
          playlists: [
            {
              id: 'pl-1',
              name: 'Chill Mix',
              curator: 'Aurral',
              trackCount: 40,
              artworkUrl: 'https://e-cdns-images.dzcdn.net/images/chill.jpg',
              provider: 'deezer',
            },
          ],
        },
      ],
    });
    expect(getSpy).toHaveBeenCalledWith('/api/discover/playlists', {}, 3600);

    const playlist = await request(app).get(
      '/api/v1/music/discover/playlists/deezer/pl-1'
    );
    expect(playlist.status).toBe(200);
    expect(playlist.body).toEqual({
      id: 'pl-1',
      name: 'Chill Mix',
      description: 'Relaxing tracks',
      curator: 'Aurral',
      artworkUrl: 'https://e-cdns-images.dzcdn.net/images/chill.jpg',
      provider: 'deezer',
      tracks: [
        {
          title: 'Nude',
          artistName: 'Radiohead',
          albumTitle: 'In Rainbows',
          albumMbid: ALBUM_MBID,
          artistMbid: ARTIST_MBID,
          durationMs: 255000,
          coverUrl: 'https://e-cdns-images.dzcdn.net/images/nude.jpg',
          previewDeezerId: '4417978021',
          inLibrary: true,
        },
        {
          title: 'Song Two',
          artistName: 'Other',
          albumTitle: null,
          albumMbid: null,
          artistMbid: null,
          durationMs: 180000,
          coverUrl: null,
          previewDeezerId: null,
          inLibrary: false,
        },
      ],
    });
    expect(getSpy).toHaveBeenCalledWith(
      '/api/discover/playlists/deezer/pl-1',
      {},
      600
    );

    const playlist404 = await request(app).get(
      '/api/v1/music/discover/playlists/deezer/missing-id'
    );
    expect(playlist404.status).toBe(404);
    expect(playlist404.body).toEqual({ message: 'Playlist not found.' });

    for (const badPlaylistUrl of [
      '/api/v1/music/discover/playlists/BadProvider/pl-1',
      '/api/v1/music/discover/playlists/deezer/bad!id',
      `/api/v1/music/discover/playlists/deezer/${'a'.repeat(65)}`,
    ]) {
      const badRes = await request(app).get(badPlaylistUrl);
      expect(badRes.status, badPlaylistUrl).toBe(400);
    }

    getSpy.mockRejectedValue(new Error('Aurral error'));
    // a recent copy answers a failing Aurral; without one the route fails
    const fromCopy = await request(app).get(
      '/api/v1/music/discover/recommended'
    );
    expect(fromCopy.status).toBe(200);
    resetMusicReadCache();
    for (const url of [
      '/api/v1/music/discover/recommended',
      '/api/v1/music/discover/playlists',
      '/api/v1/music/discover/playlists/deezer/pl-1',
    ]) {
      const errRes = await request(app).get(url);
      expect(errRes.status, url).toBe(502);
    }
  });

  it('redirects artist images to https URLs and handles 404/400/502', async () => {
    configureDefaultAurral();
    const getSpy = vi
      .spyOn(
        AurralAPI.prototype as unknown as {
          get: (
            endpoint: string,
            config?: { params?: Record<string, unknown> },
            ttl?: number
          ) => Promise<unknown>;
        },
        'get'
      )
      .mockResolvedValueOnce({
        images: [
          {
            image: 'https://e-cdns-images.dzcdn.net/images/banner.jpg',
            front: false,
            types: ['Banner'],
          },
          { image: 'http://insecure.example/artist.jpg', front: true },
          {
            image: 'https://e-cdns-images.dzcdn.net/images/artist.jpg',
            front: true,
            types: ['Poster'],
          },
        ],
      })
      .mockResolvedValueOnce({ images: [] })
      .mockRejectedValueOnce(
        Object.assign(new Error('Not found'), { response: { status: 404 } })
      );

    const app = createTestApp(createMockUser(Permission.REQUEST_MUSIC));

    const found = await request(app).get(
      `/api/v1/music/artist-image/${ARTIST_MBID}?name=Radiohead`
    );
    expect(found.status).toBe(302);
    expect(found.headers.location).toBe(
      'https://e-cdns-images.dzcdn.net/images/artist.jpg'
    );
    expect(found.headers['cache-control']).toBe('private, max-age=86400');
    expect(getSpy).toHaveBeenCalledWith(
      `/api/artists/${ARTIST_MBID}/cover`,
      { params: { artistName: 'Radiohead' } },
      0
    );

    const empty = await request(app).get(
      `/api/v1/music/artist-image/${ARTIST_MBID}`
    );
    expect(empty.status).toBe(404);
    expect(empty.body).toEqual({ message: 'Artist image not found.' });

    cacheManager.getCache('aurral').flush();
    const upstream404 = await request(app).get(
      `/api/v1/music/artist-image/${ARTIST_MBID}`
    );
    expect(upstream404.status).toBe(404);
    expect(upstream404.body).toEqual({ message: 'Artist image not found.' });

    const badUuid = await request(app).get(
      '/api/v1/music/artist-image/not-a-uuid'
    );
    expect(badUuid.status).toBe(400);

    const longName = await request(app).get(
      `/api/v1/music/artist-image/${ARTIST_MBID}?name=${'a'.repeat(257)}`
    );
    expect(longName.status).toBe(400);

    // a remembered miss must not hide an upstream failure
    cacheManager.getCache('aurral').flush();
    getSpy.mockRejectedValueOnce(new Error('Aurral down'));
    const failed = await request(app).get(
      `/api/v1/music/artist-image/${ARTIST_MBID}`
    );
    expect(failed.status).toBe(502);
    expect(failed.body).toEqual({ message: 'Unable to load artist image.' });
  });

  it('returns the music library overview: count, newest albums, download count, partial failures', async () => {
    configureDefaultAurral();
    const app = createTestApp(createMockUser(Permission.REQUEST_MUSIC));
    const newestAlbumsPage = {
      kind: 'albums' as const,
      page: 1,
      pageSize: 12,
      total: 42,
      hasMore: true,
      items: [
        {
          id: 271,
          title: 'In Rainbows',
          artistName: 'Radiohead',
          mbid: ALBUM_MBID,
          releaseGroupMbid: SINGLE_MBID,
          releaseDate: '2007-10-10',
          addedAt: '2026-11-21T12:00:00.000Z',
          trackCount: 10,
          availableTrackCount: 10,
          coverUrl: '/api/v1/music/library-art/albums/271',
        },
      ],
    };
    const libraryPage = vi
      .spyOn(AurralAPI.prototype, 'getLibraryPage')
      .mockResolvedValue(newestAlbumsPage);

    const happy = await request(app).get('/api/v1/music/library-overview');
    expect(happy.status).toBe(200);
    expect(libraryPage).toHaveBeenCalledWith('albums', 'newest', 1, 12);
    expect(happy.body).toEqual({
      totalAlbums: 42,
      recentlyAdded: newestAlbumsPage.items,
    });

    libraryPage.mockRejectedValue(new Error('Aurral down'));
    const fromCopy = await request(app).get('/api/v1/music/library-overview');
    expect(fromCopy.status).toBe(200);
    expect(fromCopy.body.totalAlbums).toBe(42);

    resetMusicReadCache();
    const allFailed = await request(app).get('/api/v1/music/library-overview');
    expect(allFailed.status).toBe(502);
    expect(allFailed.body).toEqual({
      message: 'Unable to load your music library.',
    });
  });

  it('normalizes Aurral artist details, filters invalid MBIDs, merges library & Media state, and handles 400/404/502', async () => {
    configureDefaultAurral();
    const EP_MBID = 'c2093c06-23e3-404f-aeaa-40f72885ee3c';
    const OTHER_MBID = 'd3093c06-23e3-404f-aeaa-40f72885ee3d';
    const PARTIAL_MBID = 'e4093c06-23e3-404f-aeaa-40f72885ee3e';
    const MISSING_ARTIST_MBID = '11111111-1111-4111-8111-111111111111';

    const mediaPartial = new Media({
      id: 51,
      mbId: PARTIAL_MBID,
      mediaType: MediaType.MUSIC,
      status: MediaStatus.PARTIALLY_AVAILABLE,
      status4k: MediaStatus.UNKNOWN,
    });
    const mediaPending = new Media({
      id: 52,
      mbId: EP_MBID,
      mediaType: MediaType.MUSIC,
      status: MediaStatus.PENDING,
      status4k: MediaStatus.UNKNOWN,
    });
    const mediaProcessing = new Media({
      id: 53,
      mbId: OTHER_MBID,
      mediaType: MediaType.MUSIC,
      status: MediaStatus.PROCESSING,
      status4k: MediaStatus.UNKNOWN,
    });
    const findMock = vi
      .fn()
      .mockResolvedValue([mediaPartial, mediaPending, mediaProcessing]);
    vi.mocked(getRepository).mockReturnValue({
      find: findMock,
    } as unknown as ReturnType<typeof getRepository>);

    const longBio = `  ${'A'.repeat(4100)}  `;
    const getSpy = vi
      .spyOn(
        AurralAPI.prototype as unknown as {
          get: (
            endpoint: string,
            config?: Record<string, unknown>,
            ttl?: number
          ) => Promise<unknown>;
        },
        'get'
      )
      .mockImplementation(async (endpoint) => {
        if (endpoint === `/api/artists/${ARTIST_MBID}`) {
          return {
            id: ARTIST_MBID.toUpperCase(),
            name: 'Radiohead',
            type: 'Group',
            country: 'GB',
            'life-span': { begin: '1985', end: null, ended: false },
            genres: [
              { name: 'alternative rock', count: 12 },
              'art rock',
              { name: 'electronic', count: 8 },
              { name: 'experimental rock', count: 5 },
              { name: 'indie rock', count: 4 },
            ],
            tags: [
              { name: 'Alternative Rock', count: 10 },
              { name: 'british', count: 7 },
              'post-britpop',
              'ambient',
              'oxford',
            ],
            bio: longBio,
            'release-groups': [
              {
                id: 'not-a-uuid',
                title: 'Invalid Entry',
                'first-release-date': '2025-01-01',
                'primary-type': 'Album',
                'secondary-types': [],
                coverUrl: 'https://e-cdns-images.dzcdn.net/images/invalid.jpg',
              },
              {
                id: ALBUM_MBID,
                title: 'In Rainbows',
                'first-release-date': '2007-10-10',
                'primary-type': 'Album',
                'secondary-types': [],
                coverUrl:
                  'http://coverartarchive.org/release-group/in-rainbows/front',
              },
              {
                id: EP_MBID,
                title: 'My Iron Lung',
                'first-release-date': '1994',
                'primary-type': 'EP',
                'secondary-types': ['Live'],
                coverUrl:
                  '/api/image-proxy?src=https%3A%2F%2Fe-cdns-images.dzcdn.net%2Fimages%2Fep.jpg',
              },
              {
                id: SINGLE_MBID,
                title: 'Creep',
                'first-release-date': '',
                'primary-type': 'Single',
                'secondary-types': [],
                coverUrl: 'http://insecure.example/creep.jpg',
              },
              {
                id: OTHER_MBID,
                title: 'Interview',
                'first-release-date': '2016-05-08',
                'primary-type': null,
                'secondary-types': ['Spokenword'],
                coverUrl: null,
              },
              {
                id: PARTIAL_MBID,
                title: 'A Moon Shaped Pool',
                'first-release-date': '2016-05-08',
                'primary-type': 'album',
                'secondary-types': [],
                coverUrl: 'https://e-cdns-images.dzcdn.net/images/amsp.jpg',
              },
            ],
          };
        }
        if (endpoint === `/api/library/artists/${ARTIST_MBID}`) {
          return {
            albums: [
              {
                releaseGroupMbid: ALBUM_MBID.toUpperCase(),
                trackCount: 10,
                availableTrackCount: 10,
              },
            ],
            releaseGroups: [{ id: 'not-a-uuid' }],
          };
        }
        if (endpoint === `/api/artists/${MISSING_ARTIST_MBID}`) {
          throw Object.assign(new Error('Not found'), {
            response: { status: 404 },
          });
        }
        if (endpoint === `/api/library/artists/${MISSING_ARTIST_MBID}`) {
          throw Object.assign(new Error('Not found'), {
            response: { status: 404 },
          });
        }
        throw new Error(`Unexpected endpoint: ${endpoint}`);
      });

    const app = createTestApp(createMockUser(Permission.REQUEST_MUSIC));

    const happy = await request(app).get(`/api/v1/music/artist/${ARTIST_MBID}`);
    expect(happy.status).toBe(200);
    expect(getSpy).toHaveBeenCalledWith(
      `/api/artists/${ARTIST_MBID}`,
      {},
      1800
    );
    expect(getSpy).toHaveBeenCalledWith(
      `/api/library/artists/${ARTIST_MBID}`,
      {},
      0
    );
    expect(happy.body).toEqual({
      mbid: ARTIST_MBID,
      name: 'Radiohead',
      type: 'Group',
      country: 'GB',
      beginYear: 1985,
      endYear: null,
      genres: [
        'alternative rock',
        'art rock',
        'electronic',
        'experimental rock',
        'indie rock',
        'british',
        'post-britpop',
        'ambient',
      ],
      bio: 'A'.repeat(4000),
      releaseGroups: [
        {
          id: OTHER_MBID,
          title: 'Interview',
          year: 2016,
          primaryType: 'Other',
          secondaryTypes: ['Spokenword'],
          coverUrl: null,
          inLibrary: false,
          requested: true,
          partial: false,
        },
        {
          id: PARTIAL_MBID,
          title: 'A Moon Shaped Pool',
          year: 2016,
          primaryType: 'Album',
          secondaryTypes: [],
          coverUrl: 'https://e-cdns-images.dzcdn.net/images/amsp.jpg',
          inLibrary: false,
          partial: true,
          requested: false,
        },
        {
          id: ALBUM_MBID,
          title: 'In Rainbows',
          year: 2007,
          primaryType: 'Album',
          secondaryTypes: [],
          coverUrl:
            'https://coverartarchive.org/release-group/in-rainbows/front',
          inLibrary: true,
          requested: false,
          partial: false,
        },
        {
          id: EP_MBID,
          title: 'My Iron Lung',
          year: 1994,
          primaryType: 'EP',
          secondaryTypes: ['Live'],
          coverUrl: 'https://e-cdns-images.dzcdn.net/images/ep.jpg',
          inLibrary: false,
          requested: true,
          partial: false,
        },
        {
          id: SINGLE_MBID,
          title: 'Creep',
          year: null,
          primaryType: 'Single',
          secondaryTypes: [],
          coverUrl: null,
          inLibrary: false,
          requested: false,
          partial: false,
        },
      ],
    });

    const notFound = await request(app).get(
      `/api/v1/music/artist/${MISSING_ARTIST_MBID}`
    );
    expect(notFound.status).toBe(404);
    expect(notFound.body).toEqual({ message: 'Artist not found.' });

    const badMbid = await request(app).get('/api/v1/music/artist/not-a-uuid');
    expect(badMbid.status).toBe(400);

    getSpy.mockRejectedValueOnce(new Error('Aurral error'));
    const failed = await request(app).get(
      `/api/v1/music/artist/${ARTIST_MBID}`
    );
    expect(failed.status).toBe(502);
    expect(failed.body).toEqual({ message: 'Unable to load this artist.' });
  });

  it('caps big catalogs at 400 newest first, always keeps studio albums, and degrades gracefully if library lookup fails', async () => {
    configureDefaultAurral();
    const releaseGroups = [
      ...Array.from({ length: 405 }, (_, idx) => ({
        id: `00000000-0000-4000-8000-${String(idx + 1).padStart(12, '0')}`,
        title: `Release ${idx}`,
        'first-release-date': `${1900 + (idx % 120)}`,
        'primary-type': 'Single',
        'secondary-types': [],
        coverUrl: null,
      })),
      // the oldest release is a studio album: it must survive the cut
      {
        id: '00000000-0000-4000-8000-999999999999',
        title: 'The Classic',
        'first-release-date': '1850',
        'primary-type': 'Album',
        'secondary-types': [],
        coverUrl: null,
      },
    ];

    vi.spyOn(
      AurralAPI.prototype as unknown as {
        get: (endpoint: string) => Promise<unknown>;
      },
      'get'
    ).mockImplementation(async (endpoint) => {
      if (endpoint === `/api/artists/${ARTIST_MBID}`) {
        return {
          id: ARTIST_MBID,
          name: 'Prolific Artist',
          type: null,
          country: null,
          'life-span': { begin: '', end: '2020-01-01', ended: true },
          genres: [],
          tags: [],
          bio: '   ',
          'release-groups': releaseGroups,
        };
      }
      throw new Error('Library endpoint failed');
    });

    const app = createTestApp(createMockUser(Permission.REQUEST_MUSIC));
    const res = await request(app).get(`/api/v1/music/artist/${ARTIST_MBID}`);

    expect(res.status).toBe(200);
    expect(res.body.bio).toBeNull();
    expect(res.body.beginYear).toBeNull();
    expect(res.body.endYear).toBe(2020);
    expect(res.body.releaseGroups).toHaveLength(400);
    expect(res.body.releaseGroups[0].year).toBe(2019);
    expect(res.body.releaseGroups[398].year).toBe(1901);
    expect(res.body.releaseGroups[399].title).toBe('The Classic');
  });

  it('reads artist follow status from Aurral monitoring endpoint without caching', async () => {
    configureDefaultAurral();
    const getSpy = vi
      .spyOn(
        AurralAPI.prototype as unknown as {
          get: (
            endpoint: string,
            config?: Record<string, unknown>,
            ttl?: number
          ) => Promise<unknown>;
        },
        'get'
      )
      .mockResolvedValueOnce({
        monitored: true,
        rules: { catalog: 'none', newReleases: true, types: ['album'] },
      })
      .mockResolvedValueOnce({
        monitored: true,
        rules: { catalog: 'all', newReleases: false, types: ['album'] },
      })
      .mockResolvedValueOnce({
        monitored: false,
        rules: { catalog: 'none', newReleases: true },
      })
      .mockRejectedValueOnce(
        Object.assign(new Error('Not found'), { response: { status: 404 } })
      )
      .mockRejectedValueOnce(new Error('Aurral unreachable'));

    const app = createTestApp(createMockUser(Permission.REQUEST_MUSIC));

    const following = await request(app).get(
      `/api/v1/music/artist/${ARTIST_MBID}/follow`
    );
    expect(following.status).toBe(200);
    // a plain music requester may not follow: the client hides the button
    expect(following.body).toEqual({
      inLibrary: true,
      following: true,
      canFollow: false,
    });
    expect(getSpy).toHaveBeenCalledWith(
      `/api/library/artists/${ARTIST_MBID}/monitoring`,
      {},
      0
    );

    const notFollowingRule = await request(app).get(
      `/api/v1/music/artist/${ARTIST_MBID}/follow`
    );
    expect(notFollowingRule.status).toBe(200);
    expect(notFollowingRule.body).toEqual({
      inLibrary: true,
      following: false,
      canFollow: false,
    });

    const unmonitored = await request(app).get(
      `/api/v1/music/artist/${ARTIST_MBID}/follow`
    );
    expect(unmonitored.status).toBe(200);
    expect(unmonitored.body).toEqual({
      inLibrary: true,
      following: false,
      canFollow: false,
    });

    const notInLibrary = await request(app).get(
      `/api/v1/music/artist/${ARTIST_MBID}/follow`
    );
    expect(notInLibrary.status).toBe(200);
    expect(notInLibrary.body).toEqual({
      inLibrary: false,
      following: false,
      canFollow: false,
    });

    const failed = await request(app).get(
      `/api/v1/music/artist/${ARTIST_MBID}/follow`
    );
    expect(failed.status).toBe(502);

    const badMbid = await request(app).get(
      '/api/v1/music/artist/not-a-uuid/follow'
    );
    expect(badMbid.status).toBe(400);
  });

  it('follows and unfollows artists via Aurral library endpoints and validates bodies and permissions', async () => {
    configureDefaultAurral();
    const expectedFollowMonitoring = {
      monitored: true,
      useDefault: false,
      rules: {
        catalog: 'none',
        newReleases: true,
        types: ['album', 'ep', 'single'],
        extraTypes: [],
        edition: 'standard',
        topTracks: 0,
      },
    };

    const requestSpy = vi.spyOn(
      AurralAPI.prototype as unknown as {
        request: (
          method: string,
          endpoint: string,
          data?: unknown,
          config?: Record<string, unknown>
        ) => Promise<{
          status: number;
          headers: Record<string, unknown>;
          data: unknown;
        }>;
      },
      'request'
    );

    const app = createTestApp(
      createMockUser(Permission.REQUEST_MUSIC + Permission.AUTO_APPROVE_MUSIC)
    );

    // 1. Add path: Aurral reports added: false -> one PUT with the name and
    //    explicit new-release rules adds and follows -> fresh GET
    requestSpy
      .mockResolvedValueOnce({
        status: 200,
        headers: {},
        data: { added: false, monitored: false, useDefault: true, rules: null },
      })
      .mockResolvedValueOnce({ status: 200, headers: {}, data: { id: 1 } })
      .mockResolvedValueOnce({
        status: 200,
        headers: {},
        data: { monitored: true, rules: { newReleases: true } },
      });

    const added = await request(app)
      .put(`/api/v1/music/artist/${ARTIST_MBID}/follow`)
      .send({ follow: true, name: '  Radiohead  ' });
    expect(added.status).toBe(200);
    expect(added.body).toEqual({
      inLibrary: true,
      following: true,
      canFollow: true,
    });
    expect(requestSpy).toHaveBeenNthCalledWith(
      2,
      'PUT',
      `/api/library/artists/${ARTIST_MBID}`,
      {
        artistName: 'Radiohead',
        monitoring: expectedFollowMonitoring,
      }
    );

    // 2. Update path: already in library -> PUT /api/library/artists/:mbid -> fresh GET
    requestSpy.mockClear();
    requestSpy
      .mockResolvedValueOnce({
        status: 200,
        headers: {},
        data: { monitored: false, rules: null },
      })
      .mockResolvedValueOnce({ status: 200, headers: {}, data: {} })
      .mockResolvedValueOnce({
        status: 200,
        headers: {},
        data: { monitored: true, rules: { newReleases: true } },
      });

    const updated = await request(app)
      .put(`/api/v1/music/artist/${ARTIST_MBID}/follow`)
      .send({ follow: true, name: 'Radiohead' });
    expect(updated.status).toBe(200);
    expect(updated.body).toEqual({
      inLibrary: true,
      following: true,
      canFollow: true,
    });
    expect(requestSpy).toHaveBeenNthCalledWith(
      2,
      'PUT',
      `/api/library/artists/${ARTIST_MBID}`,
      { artistName: 'Radiohead', monitoring: expectedFollowMonitoring }
    );

    // 3. Unfollow when in library -> PUT { monitoring: { monitored: false } }
    requestSpy.mockClear();
    requestSpy
      .mockResolvedValueOnce({
        status: 200,
        headers: {},
        data: { monitored: true, rules: { newReleases: true } },
      })
      .mockResolvedValueOnce({ status: 200, headers: {}, data: {} })
      .mockResolvedValueOnce({
        status: 200,
        headers: {},
        data: { monitored: false, rules: null },
      });

    const unfollowed = await request(app)
      .put(`/api/v1/music/artist/${ARTIST_MBID}/follow`)
      .send({ follow: false, name: 'Radiohead' });
    expect(unfollowed.status).toBe(200);
    expect(unfollowed.body).toEqual({
      inLibrary: true,
      following: false,
      canFollow: true,
    });
    expect(requestSpy).toHaveBeenNthCalledWith(
      2,
      'PUT',
      `/api/library/artists/${ARTIST_MBID}`,
      { artistName: 'Radiohead', monitoring: { monitored: false } }
    );

    // 4. Unfollow when not in library -> no PUT, answers { inLibrary: false, following: false }
    requestSpy.mockClear();
    requestSpy.mockRejectedValueOnce(
      Object.assign(new Error('Not found'), { response: { status: 404 } })
    );

    const unfollowedMissing = await request(app)
      .put(`/api/v1/music/artist/${ARTIST_MBID}/follow`)
      .send({ follow: false, name: 'Radiohead' });
    expect(unfollowedMissing.status).toBe(200);
    expect(unfollowedMissing.body).toEqual({
      inLibrary: false,
      following: false,
      canFollow: true,
    });
    expect(requestSpy).toHaveBeenCalledTimes(1);

    // 5. Aurral 403 -> exact 403 message
    requestSpy.mockClear();
    requestSpy
      .mockResolvedValueOnce({
        status: 200,
        headers: {},
        data: { monitored: false, rules: null },
      })
      .mockRejectedValueOnce(
        Object.assign(new Error('Forbidden'), { response: { status: 403 } })
      );

    const forbiddenMonitoring = await request(app)
      .put(`/api/v1/music/artist/${ARTIST_MBID}/follow`)
      .send({ follow: true, name: 'Radiohead' });
    expect(forbiddenMonitoring.status).toBe(403);
    expect(forbiddenMonitoring.body).toEqual({
      message:
        'Aurral does not allow SeerrNG to change monitoring. Give the SeerrNG user the Change monitoring permission in Aurral.',
    });

    // 6. Other Aurral failure -> 502
    requestSpy.mockClear();
    requestSpy
      .mockResolvedValueOnce({
        status: 200,
        headers: {},
        data: { monitored: false, rules: null },
      })
      .mockRejectedValueOnce(new Error('Aurral internal error'));

    const failed = await request(app)
      .put(`/api/v1/music/artist/${ARTIST_MBID}/follow`)
      .send({ follow: true, name: 'Radiohead' });
    expect(failed.status).toBe(502);
    expect(failed.body).toEqual({ message: 'Unable to update following.' });

    // 7. Strict body & mbid validation -> 400
    for (const badBody of [
      {},
      { follow: 'true', name: 'Radiohead' },
      { follow: true },
      { follow: true, name: '' },
      { follow: true, name: '   ' },
      { follow: true, name: 'a'.repeat(257) },
      { follow: true, name: 'Radiohead', extra: 'nope' },
      ['not-an-object'],
    ]) {
      const badRes = await request(app)
        .put(`/api/v1/music/artist/${ARTIST_MBID}/follow`)
        .send(badBody as object);
      expect(badRes.status, JSON.stringify(badBody)).toBe(400);
    }

    const badMbidRes = await request(app)
      .put('/api/v1/music/artist/not-a-uuid/follow')
      .send({ follow: true, name: 'Radiohead' });
    expect(badMbidRes.status).toBe(400);

    // 8. Also allowed for ADMIN and REQUEST permissions
    requestSpy.mockClear();
    requestSpy
      .mockResolvedValueOnce({
        status: 200,
        headers: {},
        data: { monitored: false, rules: null },
      })
      .mockResolvedValueOnce({ status: 200, headers: {}, data: {} })
      .mockResolvedValueOnce({
        status: 200,
        headers: {},
        data: { monitored: true, rules: { newReleases: true } },
      });
    const adminRes = await request(
      createTestApp(createMockUser(Permission.ADMIN))
    )
      .put(`/api/v1/music/artist/${ARTIST_MBID}/follow`)
      .send({ follow: true, name: 'Radiohead' });
    expect(adminRes.status).toBe(200);
  });

  it('answers a degraded search instead of 502 when Aurral search fails, and caps the lists', async () => {
    configureDefaultAurral();
    const albumSearchItems = Array.from({ length: 30 }, (_, index) => ({
      id: `aaaaaaaa-0000-4000-8000-${String(index).padStart(12, '0')}`,
      title: `Fallback Album ${index}`,
      'artist-credit': [{ name: 'Fallback Artist' }],
    }));
    vi.spyOn(
      AurralAPI.prototype as unknown as {
        get: (endpoint: string) => Promise<unknown>;
      },
      'get'
    ).mockImplementation(async (endpoint: string) => {
      if (endpoint === '/api/search/unified') {
        throw Object.assign(new Error('Too Many Requests'), {
          response: { status: 429 },
        });
      }
      if (endpoint.includes('album')) {
        return {
          albums: albumSearchItems,
          'release-groups': albumSearchItems,
          items: albumSearchItems,
        };
      }
      return {};
    });

    const res = await request(
      createTestApp(createMockUser(Permission.REQUEST_MUSIC))
    ).get('/api/v1/music/search?q=Radiohead&limit=5');

    expect(res.status).toBe(200);
    expect(res.body.degraded).toBe(true);
    expect(res.body.artists.length).toBeLessThanOrEqual(5);
    expect(res.body.albums.length).toBeLessThanOrEqual(5);
    expect(res.body.tracks.length).toBeLessThanOrEqual(5);
  });

  it('requires music auto-approve to follow or unfollow, and says so in the follow status', async () => {
    configureDefaultAurral();
    const requestSpy = vi.spyOn(
      AurralAPI.prototype as unknown as {
        request: (
          method: string,
          endpoint: string,
          data?: unknown
        ) => Promise<{
          status: number;
          headers: Record<string, unknown>;
          data: unknown;
        }>;
      },
      'request'
    );

    for (const permissions of [Permission.REQUEST_MUSIC, Permission.REQUEST]) {
      const app = createTestApp(createMockUser(permissions));
      for (const follow of [true, false]) {
        const res = await request(app)
          .put(`/api/v1/music/artist/${ARTIST_MBID}/follow`)
          .send({ follow, name: 'Radiohead' });
        expect(res.status).toBe(403);
        expect(res.body.message).toMatch(/permission to follow artists/);
      }
    }
    expect(requestSpy).not.toHaveBeenCalled();

    for (const permissions of [
      Permission.REQUEST_MUSIC + Permission.AUTO_APPROVE_MUSIC,
      Permission.REQUEST + Permission.AUTO_APPROVE,
      Permission.REQUEST_MUSIC + Permission.MANAGE_REQUESTS,
      Permission.ADMIN,
    ]) {
      requestSpy.mockResolvedValueOnce({
        status: 200,
        headers: {},
        data: { monitored: false, rules: null },
      });
      const res = await request(createTestApp(createMockUser(permissions))).get(
        `/api/v1/music/artist/${ARTIST_MBID}/follow`
      );
      expect(res.status).toBe(200);
      expect(res.body.canFollow, String(permissions)).toBe(true);
    }
  });

  it('never sends useDefault or resurrects old rules when following', async () => {
    configureDefaultAurral();
    const followOnly = {
      monitored: true,
      useDefault: false,
      rules: {
        catalog: 'none',
        newReleases: true,
        types: ['album', 'ep', 'single'],
        extraTypes: [],
        edition: 'standard',
        topTracks: 0,
      },
    };
    const requestSpy = vi.spyOn(
      AurralAPI.prototype as unknown as {
        request: (
          method: string,
          endpoint: string,
          data?: unknown
        ) => Promise<{
          status: number;
          headers: Record<string, unknown>;
          data: unknown;
        }>;
      },
      'request'
    );
    const app = createTestApp(
      createMockUser(Permission.REQUEST_MUSIC + Permission.AUTO_APPROVE_MUSIC)
    );
    const follow = () =>
      request(app)
        .put(`/api/v1/music/artist/${ARTIST_MBID}/follow`)
        .send({ follow: true, name: 'Elton John' });
    const putBody = () =>
      requestSpy.mock.calls.find(([method]) => method === 'PUT')?.[2];
    const answer = (data: unknown) => ({ status: 200, headers: {}, data });

    // In the library after an album request, on Aurral's default rules but
    // not monitored: a new follow sends "new releases only", not useDefault.
    requestSpy
      .mockResolvedValueOnce(
        answer({ added: true, monitored: false, useDefault: true, rules: null })
      )
      .mockResolvedValueOnce(answer({}))
      .mockResolvedValueOnce(
        answer({ monitored: true, rules: { newReleases: true } })
      );
    expect((await follow()).status).toBe(200);
    expect(putBody()).toEqual({
      artistName: 'Elton John',
      monitoring: followOnly,
    });

    // Unmonitored with old inline rules that say catalog "all": re-following
    // must not bring the whole-catalog rule back.
    requestSpy.mockClear();
    requestSpy
      .mockResolvedValueOnce(
        answer({
          monitored: false,
          useDefault: false,
          rules: { catalog: 'all', newReleases: false, topTracks: 10 },
        })
      )
      .mockResolvedValueOnce(answer({}))
      .mockResolvedValueOnce(
        answer({ monitored: true, rules: { newReleases: true } })
      );
    expect((await follow()).status).toBe(200);
    expect(putBody()).toEqual({
      artistName: 'Elton John',
      monitoring: followOnly,
    });

    // Monitored right now with explicit rules an admin set: keep them and
    // switch new releases on.
    requestSpy.mockClear();
    requestSpy
      .mockResolvedValueOnce(
        answer({
          monitored: true,
          useDefault: false,
          rules: { catalog: 'all', newReleases: false, types: ['album'] },
        })
      )
      .mockResolvedValueOnce(answer({}))
      .mockResolvedValueOnce(
        answer({ monitored: true, rules: { newReleases: true } })
      );
    expect((await follow()).status).toBe(200);
    expect(putBody()).toEqual({
      artistName: 'Elton John',
      monitoring: {
        monitored: true,
        useDefault: false,
        rules: { catalog: 'all', newReleases: true, types: ['album'] },
      },
    });

    // Already followed through Aurral's defaults: nothing is sent, and the
    // status says the defaults are in use.
    requestSpy.mockClear();
    requestSpy.mockResolvedValueOnce(
      answer({ monitored: true, useDefault: true, rules: null })
    );
    const already = await follow();
    expect(already.status).toBe(200);
    expect(already.body).toEqual({
      inLibrary: true,
      following: true,
      usesDefaultRules: true,
      canFollow: true,
    });
    expect(putBody()).toBeUndefined();
    for (const [, , data] of requestSpy.mock.calls) {
      expect(JSON.stringify(data ?? {})).not.toContain('"useDefault":true');
    }
  });

  it('admits the new endpoints through the real OpenAPI contract', async () => {
    configureDefaultAurral();
    vi.spyOn(
      AurralAPI.prototype as unknown as {
        get: (
          endpoint: string,
          config?: { params?: { kind?: string } }
        ) => Promise<unknown>;
      },
      'get'
    ).mockImplementation(async (endpoint, config) => {
      if (endpoint === '/api/search/unified') {
        return {
          top: { type: 'track', title: 'Reckoner', artistName: 'Radiohead' },
          artists: [{ id: ARTIST_MBID, name: 'Radiohead' }],
          albums: [{ id: ALBUM_MBID, title: 'In Rainbows' }],
          tracks: [{ title: 'Reckoner', artistName: 'Radiohead' }],
        };
      }
      if (endpoint === '/api/discover/tags') return { tags: ['jazz'] };
      if (endpoint === '/api/discover/by-tag') {
        return {
          tag: 'jazz',
          recommendations: [{ id: ARTIST_MBID, name: 'X' }],
        };
      }
      if (endpoint === '/api/discover') {
        return {
          recommendations: [
            {
              id: ARTIST_MBID,
              name: 'Radiohead',
              image: 'https://e-cdns-images.dzcdn.net/images/radiohead.jpg',
              sourceArtist: 'Thom Yorke',
              matchPercent: 95,
            },
          ],
          globalTop: [
            {
              id: ARTIST_MBID,
              name: 'Radiohead',
              image: 'https://e-cdns-images.dzcdn.net/images/radiohead.jpg',
              popularityLabel: '#1',
            },
          ],
        };
      }
      if (endpoint === '/api/discover/playlists') {
        return {
          categories: [
            {
              id: 'cat-1',
              name: 'Featured',
              playlists: [
                {
                  id: '12345',
                  name: 'Essentials',
                  curator: 'Aurral',
                  trackCount: 25,
                  artworkUrl: 'https://e-cdns-images.dzcdn.net/images/pl.jpg',
                  provider: 'deezer',
                },
              ],
            },
          ],
        };
      }
      if (endpoint === '/api/discover/playlists/deezer/12345') {
        return {
          id: '12345',
          name: 'Essentials',
          description: 'Top tracks',
          curator: 'Aurral',
          artworkUrl: 'https://e-cdns-images.dzcdn.net/images/pl.jpg',
          provider: 'deezer',
          tracks: [
            {
              artistName: 'Radiohead',
              trackName: 'Reckoner',
              albumName: 'In Rainbows',
              artistMbid: ARTIST_MBID,
              albumMbid: ALBUM_MBID,
              durationMs: 290000,
              preview_url: '/api/deezer/preview/4417978021.mp3',
              artworkUrl: 'https://e-cdns-images.dzcdn.net/images/album.jpg',
              owned: true,
            },
          ],
        };
      }
      if (endpoint === '/api/requests') {
        return [
          {
            id: 'req-1',
            source: 'request',
            status: 'processing',
            statusLabel: 'Downloading',
            trackName: 'Nude',
            artistName: 'Radiohead',
            albumName: 'In Rainbows',
            requestedAt: '2026-11-21T10:00:00.000Z',
            cause: { kind: 'request', name: 'Manual' },
          },
        ];
      }
      if (endpoint === '/api/library') {
        if (config?.params?.kind === 'artists') {
          return {
            kind: 'artists',
            page: 1,
            pageSize: 30,
            total: 1,
            hasMore: false,
            items: [
              {
                id: 15,
                name: 'Radiohead',
                mbid: ARTIST_MBID,
                albumCount: 9,
                trackCount: 112,
                coverUrl: '/api/library/artists/15/cover',
              },
            ],
          };
        }
        return {
          kind: 'albums',
          page: 1,
          pageSize: 12,
          total: 1,
          hasMore: false,
          items: [
            {
              id: 1,
              mbid: ALBUM_MBID,
              releaseGroupMbid: ALBUM_MBID,
              title: 'In Rainbows',
              albumArtist: 'Radiohead',
              releaseDate: '2007-10-10',
              createdAt: 1700000000000,
              trackCount: 10,
              availableTrackCount: 10,
              coverUrl: '/api/library/albums/1/cover',
            },
          ],
        };
      }
      if (endpoint === '/api/library/downloads/active') {
        return {
          albums: [ALBUM_MBID],
          artists: [],
          tracks: [{ mbid: null, artistName: 'Radiohead', trackName: 'Nude' }],
        };
      }
      if (endpoint === `/api/artists/${ARTIST_MBID}/cover`) {
        return {
          images: [
            { url: 'https://e-cdns-images.dzcdn.net/images/radiohead.jpg' },
          ],
        };
      }
      if (endpoint === `/api/artists/${ARTIST_MBID}`) {
        return {
          id: ARTIST_MBID,
          name: 'Radiohead',
          type: 'Group',
          country: 'GB',
          'life-span': { begin: '1985', end: null, ended: false },
          genres: [{ name: 'alternative rock', count: 10 }],
          tags: ['art rock'],
          bio: 'English rock band.',
          'release-groups': [
            {
              id: ALBUM_MBID,
              title: 'In Rainbows',
              'first-release-date': '2007-10-10',
              'primary-type': 'Album',
              'secondary-types': [],
              coverUrl:
                'https://e-cdns-images.dzcdn.net/images/in-rainbows.jpg',
            },
          ],
        };
      }
      if (endpoint === `/api/library/artists/${ARTIST_MBID}`) {
        return { albums: [{ releaseGroupMbid: ALBUM_MBID }] };
      }
      if (endpoint === `/api/library/artists/${ARTIST_MBID}/monitoring`) {
        return {
          monitored: true,
          rules: { catalog: 'none', newReleases: true, types: ['album'] },
        };
      }
      if (endpoint === `/api/library/artists/${SINGLE_MBID}/monitoring`) {
        return { monitored: false, rules: null };
      }
      if (endpoint.startsWith('/api/artists/')) {
        throw Object.assign(new Error('Not found'), {
          response: { status: 404 },
        });
      }
      return { songs: { items: [] }, albums: null, artists: null };
    });
    vi.spyOn(
      AurralAPI.prototype as unknown as {
        request: (
          method: string,
          endpoint: string,
          data?: unknown,
          config?: { params?: { track?: string } }
        ) => Promise<{
          status: number;
          headers: Record<string, unknown>;
          data: unknown;
        }>;
      },
      'request'
    ).mockImplementation(async (method, endpoint, _data, config) => {
      if (
        method === 'PUT' &&
        endpoint === `/api/library/artists/${SINGLE_MBID}`
      ) {
        throw Object.assign(new Error('Forbidden'), {
          response: { status: 403 },
        });
      }
      if (
        (method === 'POST' && endpoint === '/api/library/artists') ||
        (method === 'PUT' && endpoint.startsWith('/api/library/artists/'))
      ) {
        return { status: 200, headers: {}, data: {} };
      }
      if (endpoint.startsWith('/api/library/')) {
        return {
          status: 200,
          headers: { 'content-type': 'image/webp' },
          data: Buffer.from('RIFF-webp'),
        };
      }
      if (config?.params?.track === 'Missing') {
        return { status: 404, headers: {}, data: { message: 'Not found' } };
      }
      return {
        status: 302,
        headers: {
          location: 'https://cdnt-preview.dzcdn.net/api/1/1/a/b/c.mp3',
        },
        data: '',
      };
    });
    vi.spyOn(axios, 'get').mockResolvedValue({
      status: 200,
      headers: { 'content-type': 'audio/mpeg' },
      data: Buffer.from('ID3-mp3'),
    } as unknown as AxiosResponse);

    const app = express();
    app.use(express.json());
    app.use(
      OpenApiValidator.middleware({
        apiSpec: path.join(process.cwd(), 'seerr-api.yml'),
        validateRequests: true,
        validateResponses: true,
        validateSecurity: false,
      })
    );
    app.use((req, _res, next) => {
      req.user = createMockUser(
        Permission.REQUEST_MUSIC + Permission.AUTO_APPROVE_MUSIC
      );
      next();
    });
    app.use('/api/v1/music', musicRoutes);
    app.use(
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

    for (const url of [
      '/api/v1/music/search?q=Radiohead&limit=8',
      '/api/v1/music/discover/trending',
      '/api/v1/music/discover/genres?limit=5',
      '/api/v1/music/discover/genre?tag=jazz&limit=10&offset=0',
      '/api/v1/music/discover/recommended',
      '/api/v1/music/discover/playlists',
      '/api/v1/music/discover/playlists/deezer/12345',
      '/api/v1/music/library?kind=albums',
      '/api/v1/music/library?kind=albums&q=rain',
      '/api/v1/music/library?kind=artists',
      '/api/v1/music/activity',
      // two ids: the list separator must be sent encoded (%2C), as Lumen does
      `/api/v1/music/album-summaries?ids=${ALBUM_MBID}%2C${SINGLE_MBID}`,
      '/api/v1/music/library-overview',
      `/api/v1/music/artist/${ARTIST_MBID}`,
      `/api/v1/music/artist/${ARTIST_MBID}/follow`,
    ]) {
      const response = await request(app).get(url);
      expect(response.status, `${url}: ${JSON.stringify(response.body)}`).toBe(
        200
      );
    }
    const artistFollowPut = await request(app)
      .put(`/api/v1/music/artist/${ARTIST_MBID}/follow`)
      .send({ follow: true, name: 'Radiohead' });
    expect(artistFollowPut.status).toBe(200);
    const artistUnfollowPut = await request(app)
      .put(`/api/v1/music/artist/${ARTIST_MBID}/follow`)
      .send({ follow: false, name: 'Radiohead' });
    expect(artistUnfollowPut.status).toBe(200);
    const artistNotFound = await request(app).get(
      `/api/v1/music/artist/${SINGLE_MBID}`
    );
    expect(artistNotFound.status).toBe(404);
    const badArtistMbid = await request(app).get(
      '/api/v1/music/artist/not-a-uuid'
    );
    expect(badArtistMbid.status).toBe(400);
    const badFollowPut = await request(app)
      .put(`/api/v1/music/artist/${ARTIST_MBID}/follow`)
      .send({ follow: 'yes', name: '' });
    expect(badFollowPut.status).toBe(400);
    const forbiddenFollowPut = await request(app)
      .put(`/api/v1/music/artist/${SINGLE_MBID}/follow`)
      .send({ follow: true, name: 'Radiohead' });
    expect(forbiddenFollowPut.status).toBe(403);
    const artistImageRedirect = await request(app).get(
      `/api/v1/music/artist-image/${ARTIST_MBID}?name=Radiohead`
    );
    expect(artistImageRedirect.status).toBe(302);
    deezerSearchTracks.mockResolvedValueOnce([
      {
        id: 1,
        title: 'Reckoner',
        artistName: 'Radiohead',
        rank: 1,
        coverUrl:
          'https://e-cdns-images.dzcdn.net/images/cover/abc/250x250-000000-80-0-0.jpg',
      },
    ]);
    const songArtRedirect = await request(app).get(
      '/api/v1/music/song-art?artist=Radiohead&title=Reckoner%20%28contract%29'
    );
    expect(songArtRedirect.status).toBe(302);
    const songArtMissingTitle = await request(app).get(
      '/api/v1/music/song-art?artist=Radiohead'
    );
    expect(songArtMissingTitle.status).toBe(400);
    const previewNotFound = await request(app).get(
      '/api/v1/music/preview?artist=Radiohead&track=Missing'
    );
    expect(previewNotFound.status).toBe(404);
    const missingPreviewArtist = await request(app).get(
      '/api/v1/music/preview?track=Reckoner'
    );
    expect(missingPreviewArtist.status).toBe(400);
    const missingQuery = await request(app).get('/api/v1/music/search');
    expect(missingQuery.status).toBe(400);
  });

  it('validates AurralAPI search, tag, library, preview, playlist, and artist inputs', async () => {
    const client = new AurralAPI({
      url: 'http://aurral.local:3001',
      apiKey: 'secret',
    });

    await expect(client.searchUnified('   ')).rejects.toThrow(
      /between 1 and 256/
    );
    await expect(client.getDiscoverByTag('')).rejects.toThrow(
      /between 1 and 128/
    );
    await expect(
      client.getDiscoverTags({ q: 'x'.repeat(101) })
    ).rejects.toThrow(/up to 100 characters/);
    await expect(
      client.getLibraryPage('albums', 'newest', 0, 30)
    ).rejects.toThrow(/positive integer/);
    await expect(
      client.getLibraryPage('albums', 'newest', 1, 61)
    ).rejects.toThrow(/between 1 and 60/);
    await expect(client.getLibraryArtwork('albums', 0)).rejects.toThrow(
      /between 1 and/
    );
    await expect(client.getDeezerPreviewClip('not-digits')).rejects.toThrow(
      /1 to 20 digits/
    );
    await expect(
      client.downloadPreview('https://evil.example.com/a.mp3')
    ).rejects.toThrow(/not allowed/);
    await expect(
      client.getDiscoverPlaylist('BadProvider', '123')
    ).rejects.toThrow(/provider is invalid/);
    await expect(
      client.getDiscoverPlaylist('deezer', 'bad!id')
    ).rejects.toThrow(/ID is invalid/);
    await expect(client.getArtistImageUrl('not-a-uuid')).rejects.toThrow(
      /valid UUID/
    );
    await expect(client.getArtistDetails('not-a-uuid')).rejects.toThrow(
      /valid UUID/
    );
    await expect(
      client.getLibraryArtistReleaseGroups('not-a-uuid')
    ).rejects.toThrow(/valid UUID/);
    await expect(client.getArtistFollowStatus('not-a-uuid')).rejects.toThrow(
      /valid UUID/
    );
    await expect(
      client.setArtistFollowing('not-a-uuid', 'Radiohead', true)
    ).rejects.toThrow(/valid UUID/);
    await expect(
      client.setArtistFollowing(ARTIST_MBID, '   ', true)
    ).rejects.toThrow(/between 1 and 256/);
    await expect(
      client.setArtistFollowing(ARTIST_MBID, 'a'.repeat(257), true)
    ).rejects.toThrow(/between 1 and 256/);
  });
});
