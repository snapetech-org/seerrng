import { sanitizeAurralImageUrl } from '@server/api/aurral';
import ExternalAPI from '@server/api/externalapi';
import cacheManager from '@server/lib/cache';
import { musicMatchKey } from '@server/lib/musicSearch';

export interface DeezerAlbumResult {
  id: number;
  title: string;
  artistName: string;
  coverXl: string | null;
}

export interface DeezerArtistResult {
  id: number;
  name: string;
  pictureXl: string | null;
  nbFan: number;
}

export interface DeezerTrackResult {
  id: number;
  title: string;
  artistName: string;
  rank: number;
  // the track's album cover (HTTPS, Deezer's CDN), when Deezer has one
  coverUrl?: string | null;
}

export interface DeezerGenre {
  id: number;
  name: string;
}

/** A song from a chart or playlist. */
export interface DeezerChartTrack {
  id: number;
  title: string;
  artistName: string;
  albumTitle: string | null;
  durationMs: number | null;
  coverUrl: string | null;
  rank: number;
}

export interface DeezerChartAlbum {
  id: number;
  title: string;
  artistName: string;
  coverUrl: string | null;
  /** album, single, ep or compile, as Deezer labels it */
  recordType: string | null;
}

export interface DeezerChart {
  tracks: DeezerChartTrack[];
  albums: DeezerChartAlbum[];
  artists: DeezerArtistResult[];
}

export interface DeezerPlaylistSummary {
  id: string;
  name: string;
  curator: string | null;
  trackCount: number | null;
  artworkUrl: string | null;
}

export interface DeezerPlaylistDetails extends DeezerPlaylistSummary {
  description: string | null;
  tracks: DeezerChartTrack[];
}

const DEEZER_TIMEOUT_MS = 3_000;
const DEEZER_CACHE_TTL_SECONDS = 600;
const DEEZER_GENRE_CACHE_TTL_SECONDS = 6 * 60 * 60;
const DEEZER_CHART_CACHE_TTL_SECONDS = 60 * 60;
// Deezer's preview links are signed and expire after a while
const DEEZER_PREVIEW_CACHE_TTL_SECONDS = 10 * 60;

/** Deezer's 30-second preview: HTTPS on Deezer's own CDN only. */
const safePreviewUrl = (value: unknown): string | null => {
  if (typeof value !== 'string' || !value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      /(^|\.)dzcdn\.net$/i.test(url.hostname)
      ? url.href
      : null;
  } catch {
    return null;
  }
};
const MAX_DEEZER_ARTISTS = 25;
const MAX_DEEZER_GENRE_ARTISTS = 50;

const genreKey = (value: string): string =>
  value
    .toLocaleLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '');

/**
 * Genre tags (as the music library and Last.fm write them) mapped to Deezer
 * genre names, best first. Keys are genreKey() of the tag. A tag whose own
 * name is a Deezer genre needs no entry.
 */
export const DEEZER_GENRE_ALIASES: Record<string, string[]> = {
  pop: ['Pop'],
  rock: ['Rock'],
  hiphop: ['Rap/Hip Hop'],
  rap: ['Rap/Hip Hop'],
  randb: ['R&B'],
  rnb: ['R&B'],
  electronic: ['Electro'],
  electronica: ['Electro'],
  edm: ['Electro'],
  soul: ['Soul & Funk'],
  funk: ['Soul & Funk'],
  folk: ['Folk'],
  metal: ['Metal'],
  heavymetal: ['Metal'],
  country: ['Country'],
  latin: ['Latin Music'],
  jazz: ['Jazz'],
  dance: ['Dance'],
  alternative: ['Alternative'],
  alternativerock: ['Alternative'],
  indie: ['Alternative'],
  indierock: ['Alternative'],
  classical: ['Classical'],
  reggae: ['Reggae'],
  blues: ['Blues'],
  kpop: ['K-Pop', 'Asian Music'],
};

/** The Deezer genre for a tag: its own name first, then the alias table. */
export const matchDeezerGenre = (
  tag: string,
  genres: DeezerGenre[]
): DeezerGenre | null => {
  const key = genreKey(tag);
  if (!key) return null;
  const byKey = new Map(genres.map((genre) => [genreKey(genre.name), genre]));
  const direct = byKey.get(key);
  if (direct) return direct;
  for (const name of DEEZER_GENRE_ALIASES[key] ?? []) {
    const genre = byKey.get(genreKey(name));
    if (genre) return genre;
  }
  return null;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

/**
 * Deezer answers rate limiting ("Quota limit exceeded") and other API errors
 * with HTTP 200 and an `error` object. That is a failure, not "no results".
 */
export class DeezerResponseError extends Error {
  public readonly code: number | undefined;

  constructor(code: number | undefined, message: string | undefined) {
    super(
      `Deezer returned an error${code !== undefined ? ` (code ${code})` : ''}${
        message ? `: ${message.slice(0, 200)}` : ''
      }`
    );
    this.name = 'DeezerResponseError';
    this.code = code;
  }
}

const isDeezerErrorBody = (value: unknown): value is Record<string, unknown> =>
  isRecord(value) && 'error' in value && value.error !== undefined;

const positiveInteger = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0
    ? value
    : undefined;

const nonNegativeInteger = (value: unknown): number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? value
    : 0;

class DeezerAPI extends ExternalAPI {
  constructor() {
    super(
      'https://api.deezer.com',
      {},
      {
        nodeCache: cacheManager.getCache('deezer').data,
        timeout: DEEZER_TIMEOUT_MS,
      }
    );
  }

  /**
   * GET with a cache that only keeps real answers: an error body (quota or
   * otherwise) is thrown so callers count it as a failure, and it is never
   * cached as an empty result.
   */
  private async searchGet(
    endpoint: string,
    params: Record<string, unknown>,
    ttl = DEEZER_CACHE_TTL_SECONDS
  ): Promise<unknown> {
    const config = { params, timeout: DEEZER_TIMEOUT_MS };
    const cached = this.getCached<unknown>(endpoint, config);
    if (cached !== undefined && !isDeezerErrorBody(cached)) {
      return cached;
    }
    const response = await this.get<unknown>(endpoint, config, 0);
    if (isDeezerErrorBody(response)) {
      const error = isRecord(response.error) ? response.error : {};
      throw new DeezerResponseError(
        typeof error.code === 'number' ? error.code : undefined,
        typeof error.message === 'string' ? error.message : undefined
      );
    }
    this.setCached(endpoint, response, ttl, config);
    return response;
  }

  private static mapArtists(
    response: unknown,
    limit: number
  ): DeezerArtistResult[] {
    if (!isRecord(response) || !Array.isArray(response.data)) {
      return [];
    }
    return response.data
      .slice(0, limit)
      .flatMap((entry): DeezerArtistResult[] => {
        if (!isRecord(entry)) return [];
        const id = positiveInteger(entry.id);
        const name =
          typeof entry.name === 'string' ? entry.name.slice(0, 512).trim() : '';
        if (id === undefined || !name) return [];

        return [
          {
            id,
            name,
            pictureXl: sanitizeAurralImageUrl(entry.picture_xl),
            nbFan: nonNegativeInteger(entry.nb_fan),
          },
        ];
      });
  }

  /** Deezer's genre list ({ id, name }), cached for 6 hours. */
  public async getGenres(): Promise<DeezerGenre[]> {
    const response = await this.searchGet(
      '/genre',
      {},
      DEEZER_GENRE_CACHE_TTL_SECONDS
    );
    if (!isRecord(response) || !Array.isArray(response.data)) {
      return [];
    }
    return response.data.flatMap((entry): DeezerGenre[] => {
      if (!isRecord(entry)) return [];
      const id = positiveInteger(entry.id);
      const name =
        typeof entry.name === 'string' ? entry.name.slice(0, 128).trim() : '';
      return id === undefined || !name ? [] : [{ id, name }];
    });
  }

  /** First-ten signatures of recent genre answers, to spot one global list. */
  private static genreSignatures = new Map<number, string>();

  /** Test hook. */
  public static resetGenreSignatures() {
    DeezerAPI.genreSignatures.clear();
  }

  /**
   * The artists of a genre: distinct artists of the genre chart's tracks in
   * chart order, topped up from the genre's first two radios, up to 50.
   * (Deezer's /genre/{id}/artists now answers one global list for every
   * genre.) Cached for 6 hours. An answer whose first ten artists match
   * another genre's is the global list again: unusable, not cached, empty.
   */
  public async getGenreArtists(genreId: number): Promise<DeezerArtistResult[]> {
    const id = positiveInteger(genreId);
    if (id === undefined) return [];
    const cacheEndpoint = `/genre/${id}/composed-artists`;
    const cached = this.getCached<DeezerArtistResult[]>(cacheEndpoint);
    if (Array.isArray(cached)) return cached;

    const artists: DeezerArtistResult[] = [];
    const seenIds = new Set<number>();
    const seenNames = new Set<string>();
    const addFromTracks = (response: unknown) => {
      if (!isRecord(response) || !Array.isArray(response.data)) return;
      for (const entry of response.data) {
        if (artists.length >= MAX_DEEZER_GENRE_ARTISTS) return;
        if (!isRecord(entry) || !isRecord(entry.artist)) continue;
        const [artist] = DeezerAPI.mapArtists({ data: [entry.artist] }, 1);
        if (!artist) continue;
        const nameKey = musicMatchKey(artist.name);
        if (
          nameKey === 'various artists' ||
          seenIds.has(artist.id) ||
          seenNames.has(nameKey)
        )
          continue;
        seenIds.add(artist.id);
        seenNames.add(nameKey);
        artists.push(artist);
      }
    };

    addFromTracks(
      await this.searchGet(`/chart/${id}/tracks`, { limit: 100 }, 0)
    );
    if (artists.length < MAX_DEEZER_GENRE_ARTISTS) {
      const radios = await this.searchGet(
        `/genre/${id}/radios`,
        {},
        DEEZER_GENRE_CACHE_TTL_SECONDS
      ).catch(() => null);
      const radioIds =
        isRecord(radios) && Array.isArray(radios.data)
          ? radios.data
              .map((radio) =>
                isRecord(radio) ? positiveInteger(radio.id) : undefined
              )
              .filter((radioId): radioId is number => radioId !== undefined)
              .slice(0, 2)
          : [];
      const radioTracks = await Promise.all(
        radioIds.map((radioId) =>
          this.searchGet(`/radio/${radioId}/tracks`, { limit: 40 }, 0).catch(
            () => null
          )
        )
      );
      for (const tracks of radioTracks) addFromTracks(tracks);
    }

    // chart and radio artists carry pictures; look up the few that do not
    const missing = artists.filter((artist) => !artist.pictureXl).slice(0, 10);
    await Promise.all(
      missing.map(async (artist) => {
        const details = await this.searchGet(
          `/artist/${artist.id}`,
          {},
          DEEZER_GENRE_CACHE_TTL_SECONDS
        ).catch(() => null);
        if (isRecord(details)) {
          artist.pictureXl = sanitizeAurralImageUrl(details.picture_xl);
        }
      })
    );

    if (artists.length >= 5) {
      const signature = artists
        .slice(0, 10)
        .map((artist) => artist.id)
        .join(',');
      for (const [otherId, otherSignature] of DeezerAPI.genreSignatures) {
        if (otherId !== id && otherSignature === signature) {
          DeezerAPI.genreSignatures.delete(otherId);
          this.removeCache(`/genre/${otherId}/composed-artists`);
          return [];
        }
      }
      if (DeezerAPI.genreSignatures.size >= 200) {
        DeezerAPI.genreSignatures.clear();
      }
      DeezerAPI.genreSignatures.set(id, signature);
    }
    if (artists.length > 0) {
      this.setCached(cacheEndpoint, artists, DEEZER_GENRE_CACHE_TTL_SECONDS);
    }
    return artists;
  }

  /**
   * Artists for a genre tag through the matching Deezer genre ("hip hop" ->
   * "Rap/Hip Hop"). Empty when Deezer has no such genre (no name search).
   */
  public async getArtistsForGenreTag(
    tag: string
  ): Promise<DeezerArtistResult[]> {
    if (typeof tag !== 'string' || !tag.trim()) return [];
    const genre = matchDeezerGenre(tag, await this.getGenres());
    return genre ? this.getGenreArtists(genre.id) : [];
  }

  public async searchArtists(
    query: string,
    limit = 5
  ): Promise<DeezerArtistResult[]> {
    if (typeof query !== 'string') {
      return [];
    }
    const trimmed = query.trim().slice(0, 256);
    if (!trimmed) {
      return [];
    }
    const clampedLimit =
      typeof limit === 'number' && Number.isFinite(limit)
        ? Math.min(MAX_DEEZER_ARTISTS, Math.max(1, Math.trunc(limit)))
        : 5;

    const response = await this.searchGet('/search/artist', {
      q: trimmed,
      limit: clampedLimit,
    });

    return DeezerAPI.mapArtists(response, clampedLimit);
  }

  /** Track search with Deezer's popularity rank, cached for 10 minutes. */
  public async searchTracks(
    query: string,
    limit = 25
  ): Promise<DeezerTrackResult[]> {
    if (typeof query !== 'string') return [];
    const trimmed = query.trim().slice(0, 256);
    if (!trimmed) return [];
    const clampedLimit =
      typeof limit === 'number' && Number.isFinite(limit)
        ? Math.min(MAX_DEEZER_ARTISTS, Math.max(1, Math.trunc(limit)))
        : 25;
    const response = await this.searchGet('/search/track', {
      q: trimmed,
      limit: clampedLimit,
    });
    if (!isRecord(response) || !Array.isArray(response.data)) return [];
    return response.data
      .slice(0, clampedLimit)
      .flatMap((entry): DeezerTrackResult[] => {
        if (!isRecord(entry)) return [];
        const id = positiveInteger(entry.id);
        const rawTitle =
          typeof entry.title_short === 'string' && entry.title_short.trim()
            ? entry.title_short
            : entry.title;
        const title =
          typeof rawTitle === 'string' ? rawTitle.slice(0, 512).trim() : '';
        const artist = isRecord(entry.artist) ? entry.artist : {};
        const artistName =
          typeof artist.name === 'string'
            ? artist.name.slice(0, 512).trim()
            : '';
        if (id === undefined || !title || !artistName) return [];
        const album = isRecord(entry.album) ? entry.album : {};
        const coverUrl =
          sanitizeAurralImageUrl(album.cover_medium) ??
          sanitizeAurralImageUrl(album.cover_xl);
        return [
          {
            id,
            title,
            artistName,
            rank: nonNegativeInteger(entry.rank),
            ...(coverUrl ? { coverUrl } : {}),
          },
        ];
      });
  }

  public async searchAlbums(
    query: string,
    limit = 5
  ): Promise<DeezerAlbumResult[]> {
    if (typeof query !== 'string') {
      return [];
    }
    const trimmed = query.trim().slice(0, 512);
    if (!trimmed) {
      return [];
    }
    const clampedLimit =
      typeof limit === 'number' && Number.isFinite(limit)
        ? Math.min(MAX_DEEZER_ARTISTS, Math.max(1, Math.trunc(limit)))
        : 5;

    const response = await this.searchGet('/search/album', {
      q: trimmed,
      limit: clampedLimit,
    });

    if (!isRecord(response) || !Array.isArray(response.data)) {
      return [];
    }

    return response.data
      .slice(0, clampedLimit)
      .flatMap((entry): DeezerAlbumResult[] => {
        if (!isRecord(entry)) return [];
        const id = positiveInteger(entry.id);
        const title =
          typeof entry.title === 'string'
            ? entry.title.slice(0, 512).trim()
            : '';
        const artist = isRecord(entry.artist) ? entry.artist : {};
        const artistName =
          typeof artist.name === 'string'
            ? artist.name.slice(0, 512).trim()
            : '';
        if (id === undefined || !title) return [];
        return [
          {
            id,
            title,
            artistName,
            coverXl:
              sanitizeAurralImageUrl(entry.cover_xl) ??
              sanitizeAurralImageUrl(entry.cover_big),
          },
        ];
      });
  }

  private static mapChartTrack(entry: unknown): DeezerChartTrack[] {
    if (!isRecord(entry)) return [];
    const id = positiveInteger(entry.id);
    const rawTitle =
      typeof entry.title_short === 'string' && entry.title_short.trim()
        ? entry.title_short
        : entry.title;
    const title =
      typeof rawTitle === 'string' ? rawTitle.slice(0, 512).trim() : '';
    const artist = isRecord(entry.artist) ? entry.artist : {};
    const artistName =
      typeof artist.name === 'string' ? artist.name.slice(0, 512).trim() : '';
    if (id === undefined || !title || !artistName) return [];
    const album = isRecord(entry.album) ? entry.album : {};
    const duration = positiveInteger(entry.duration);
    return [
      {
        id,
        title,
        artistName,
        albumTitle:
          typeof album.title === 'string'
            ? album.title.slice(0, 512).trim() || null
            : null,
        durationMs: duration ? duration * 1000 : null,
        coverUrl:
          sanitizeAurralImageUrl(album.cover_medium) ??
          sanitizeAurralImageUrl(album.cover_xl),
        rank: nonNegativeInteger(entry.rank),
      },
    ];
  }

  /**
   * Deezer's overall chart (songs, albums and artists), cached for an hour.
   * The same for everyone: no account or key.
   */
  public async getChart(limit = 25): Promise<DeezerChart> {
    const clamped = Math.min(50, Math.max(1, Math.trunc(limit) || 25));
    const response = await this.searchGet(
      '/chart/0',
      { limit: clamped },
      DEEZER_CHART_CACHE_TTL_SECONDS
    );
    const section = (key: string): unknown[] =>
      isRecord(response) &&
      isRecord(response[key]) &&
      Array.isArray((response[key] as Record<string, unknown>).data)
        ? ((response[key] as Record<string, unknown>).data as unknown[])
        : [];
    return {
      tracks: section('tracks')
        .slice(0, clamped)
        .flatMap((entry) => DeezerAPI.mapChartTrack(entry)),
      albums: section('albums')
        .slice(0, clamped)
        .flatMap((entry): DeezerChartAlbum[] => {
          if (!isRecord(entry)) return [];
          const id = positiveInteger(entry.id);
          const title =
            typeof entry.title === 'string'
              ? entry.title.slice(0, 512).trim()
              : '';
          const artist = isRecord(entry.artist) ? entry.artist : {};
          const artistName =
            typeof artist.name === 'string'
              ? artist.name.slice(0, 512).trim()
              : '';
          if (id === undefined || !title || !artistName) return [];
          return [
            {
              id,
              title,
              artistName,
              coverUrl:
                sanitizeAurralImageUrl(entry.cover_xl) ??
                sanitizeAurralImageUrl(entry.cover_big),
              recordType:
                typeof entry.record_type === 'string'
                  ? entry.record_type.slice(0, 32)
                  : null,
            },
          ];
        }),
      artists: DeezerAPI.mapArtists({ data: section('artists') }, clamped),
    };
  }

  /** Deezer's chart playlists (editorial and popular), cached for 6 hours. */
  public async getChartPlaylists(limit = 25): Promise<DeezerPlaylistSummary[]> {
    const clamped = Math.min(100, Math.max(1, Math.trunc(limit) || 25));
    const response = await this.searchGet(
      '/chart/0/playlists',
      { limit: clamped },
      DEEZER_GENRE_CACHE_TTL_SECONDS
    );
    if (!isRecord(response) || !Array.isArray(response.data)) return [];
    return response.data
      .slice(0, clamped)
      .flatMap((entry): DeezerPlaylistSummary[] =>
        DeezerAPI.mapPlaylist(entry)
      );
  }

  private static mapPlaylist(entry: unknown): DeezerPlaylistSummary[] {
    if (!isRecord(entry)) return [];
    const id = positiveInteger(entry.id);
    const name =
      typeof entry.title === 'string' ? entry.title.slice(0, 256).trim() : '';
    if (id === undefined || !name) return [];
    const user = isRecord(entry.user)
      ? entry.user
      : isRecord(entry.creator)
        ? entry.creator
        : {};
    return [
      {
        id: String(id),
        name,
        curator:
          typeof user.name === 'string'
            ? user.name.slice(0, 256).trim() || null
            : null,
        trackCount: positiveInteger(entry.nb_tracks) ?? null,
        artworkUrl:
          sanitizeAurralImageUrl(entry.picture_xl) ??
          sanitizeAurralImageUrl(entry.picture_big),
      },
    ];
  }

  /** A public Deezer playlist with up to 200 of its songs, cached for an hour. */
  public async getPlaylist(
    playlistId: string
  ): Promise<DeezerPlaylistDetails | null> {
    if (typeof playlistId !== 'string' || !/^\d{1,20}$/.test(playlistId)) {
      return null;
    }
    const response = await this.searchGet(
      `/playlist/${playlistId}`,
      { limit: 200 },
      DEEZER_CHART_CACHE_TTL_SECONDS
    );
    const [summary] = DeezerAPI.mapPlaylist(response);
    if (!summary || !isRecord(response)) return null;
    const tracks =
      isRecord(response.tracks) && Array.isArray(response.tracks.data)
        ? response.tracks.data
        : [];
    return {
      ...summary,
      description:
        typeof response.description === 'string'
          ? response.description.slice(0, 1000).trim() || null
          : null,
      tracks: tracks
        .slice(0, 200)
        .flatMap((entry) => DeezerAPI.mapChartTrack(entry)),
    };
  }

  /** The Deezer artist with exactly this name (id and picture), else null. */
  public async findArtist(name: string): Promise<DeezerArtistResult | null> {
    if (typeof name !== 'string' || !name.trim()) return null;
    const response = await this.searchGet(
      '/search/artist',
      { q: name.trim().slice(0, 256), limit: 5 },
      DEEZER_GENRE_CACHE_TTL_SECONDS
    );
    const wanted = musicMatchKey(name);
    return (
      DeezerAPI.mapArtists(response, 5).find(
        (artist) => musicMatchKey(artist.name) === wanted
      ) ?? null
    );
  }

  /** Artists Deezer lists as related to one (by Deezer id), cached 6 hours. */
  public async getRelatedArtists(
    artistId: number,
    limit = 10
  ): Promise<DeezerArtistResult[]> {
    const id = positiveInteger(artistId);
    if (id === undefined) return [];
    const clamped = Math.min(MAX_DEEZER_ARTISTS, Math.max(1, limit));
    const response = await this.searchGet(
      `/artist/${id}/related`,
      { limit: clamped },
      DEEZER_GENRE_CACHE_TTL_SECONDS
    );
    return DeezerAPI.mapArtists(response, clamped);
  }

  /** The 30-second preview of a Deezer track, as an HTTPS CDN URL. */
  public async getTrackPreviewUrl(trackId: string): Promise<string | null> {
    if (typeof trackId !== 'string' || !/^\d{1,20}$/.test(trackId)) {
      return null;
    }
    const response = await this.searchGet(
      `/track/${trackId}`,
      {},
      // preview links are signed and expire: keep them only briefly
      DEEZER_PREVIEW_CACHE_TTL_SECONDS
    );
    return isRecord(response) ? safePreviewUrl(response.preview) : null;
  }

  /** The preview of a song found by artist and title (the artist's own). */
  public async findTrackPreviewUrl(
    artist: string,
    title: string
  ): Promise<string | null> {
    if (!artist?.trim() || !title?.trim()) return null;
    const response = await this.searchGet(
      '/search/track',
      {
        q: `${artist} ${title}`.replace(/\s+/g, ' ').trim().slice(0, 256),
        limit: 10,
      },
      DEEZER_PREVIEW_CACHE_TTL_SECONDS
    );
    if (!isRecord(response) || !Array.isArray(response.data)) return null;
    const wantedArtist = musicMatchKey(artist);
    const wantedTitle = musicMatchKey(title);
    for (const entry of response.data) {
      if (!isRecord(entry) || !isRecord(entry.artist)) continue;
      if (musicMatchKey(String(entry.artist.name ?? '')) !== wantedArtist)
        continue;
      const entryTitle = musicMatchKey(
        String(entry.title_short ?? entry.title ?? '')
      );
      // the same song ("Song" and "Song (Remastered)"), never another one
      const sameSong =
        entryTitle === wantedTitle ||
        entryTitle.startsWith(wantedTitle) ||
        wantedTitle.startsWith(entryTitle);
      const preview = sameSong ? safePreviewUrl(entry.preview) : null;
      if (preview) return preview;
    }
    return null;
  }
}

export default DeezerAPI;
