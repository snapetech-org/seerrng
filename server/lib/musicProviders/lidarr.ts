// SeerrNG music pages on Lidarr; maintained by snapetech and SeerrNG contributors.
//
// The Lumen music pages were built on Aurral. This provider answers the same
// questions for a Lidarr install: the library, downloads and following come
// from Lidarr; artist pages from ListenBrainz (the data the classic artist
// page uses); charts, genres, playlists, previews and song covers from
// Deezer's public API. Requests still go through SeerrNG's normal Lidarr
// request flow, so quotas, approval and the MP3/FLAC choice apply as before.
import {
  sanitizeAurralImageUrl,
  type AurralActivityItem,
  type AurralArtistDetails,
  type AurralArtistFollowStatus,
  type AurralArtistReleaseGroup,
  type AurralArtistReleaseGroupPrimaryType,
  type AurralDiscoverPlaylistsResult,
  type AurralDiscoverRecommendedResult,
  type AurralGenreDiscoveryResult,
  type AurralLibraryAlbumEntry,
  type AurralLibraryAlbumsPage,
  type AurralLibraryArtistEntry,
  type AurralLibraryArtistReleaseGroups,
  type AurralLibraryArtwork,
  type AurralLibraryKind,
  type AurralLibraryPage,
  type AurralLibrarySearchResult,
  type AurralLibrarySort,
  type AurralLibraryTrackPage,
  type AurralNormalizedAlbum,
  type AurralNormalizedArtist,
  type AurralNormalizedTopResult,
  type AurralNormalizedTrack,
  type AurralPlaylistDetails,
  type AurralResolvedLink,
  type AurralSimilarArtist,
  type AurralTrendingResult,
  type AurralUnifiedSearchResult,
} from '@server/api/aurral';
import DeezerAPI, {
  type DeezerArtistResult,
  type DeezerChartTrack,
} from '@server/api/deezer';
import ListenBrainzAPI from '@server/api/listenbrainz';
import LidarrAPI, { type LidarrAlbum } from '@server/api/servarr/lidarr';
import {
  isValidMusicBrainzResourceId,
  normalizeMusicBrainzId,
} from '@server/lib/externalIds';
import { musicMatchKey } from '@server/lib/musicSearch';
import type { LidarrSettings } from '@server/lib/settings';
import { createSafeHttpRequestOptions } from '@server/utils/security';
import axios from 'axios';

const LIBRARY_CACHE_TTL_SECONDS = 60;
const LOOKUP_CACHE_TTL_SECONDS = 600;
const MAX_LOOKUP_RESULTS = 50;
const MAX_ARTWORK_BYTES = 10 * 1024 * 1024;
const MAX_PREVIEW_BYTES = 5 * 1024 * 1024;
const PREVIEW_TIMEOUT_MS = 10_000;
const ALBUM_ART_TIMEOUT_MS = 3_000;
const ALBUM_ART_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const ALBUM_ART_MISS_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_ALBUM_ART_ENTRIES = 5_000;
// artist ids for chart names, looked up through Lidarr's metadata search
const MAX_RESOLVED_ARTISTS = 24;
const MAX_RECOMMENDATION_SEEDS = 6;
const MBID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface LidarrImageRecord {
  coverType?: string;
  url?: string;
  remoteUrl?: string;
}

interface LidarrArtistRecord {
  id: number;
  artistName: string;
  foreignArtistId: string;
  monitored: boolean;
  monitorNewItems?: string;
  added?: string;
  images?: LidarrImageRecord[];
  statistics?: {
    albumCount?: number;
    trackFileCount?: number;
    trackCount?: number;
    totalTrackCount?: number;
  };
  [key: string]: unknown;
}

interface LidarrLookupArtist {
  artistName?: string;
  foreignArtistId?: string;
  images?: LidarrImageRecord[];
}

interface LidarrLookupAlbum {
  title?: string;
  foreignAlbumId?: string;
  albumType?: string;
  releaseDate?: string;
  images?: LidarrImageRecord[];
  artist?: { artistName?: string; foreignArtistId?: string };
}

interface LidarrQueueRecord {
  id?: number;
  albumId?: number;
  title?: string;
  status?: string;
  trackedDownloadState?: string;
  trackedDownloadStatus?: string;
  errorMessage?: string;
  statusMessages?: { title?: string; messages?: string[] }[];
  added?: string;
  album?: LidarrAlbum;
  artist?: { artistName?: string };
}

interface LidarrHistoryRecord {
  id?: number;
  albumId?: number;
  eventType?: string;
  date?: string;
  sourceTitle?: string;
  data?: Record<string, unknown>;
  album?: LidarrAlbum;
  artist?: { artistName?: string };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const text = (value: unknown, max = 512): string =>
  typeof value === 'string' ? value.slice(0, max).trim() : '';

// a real MusicBrainz id (a UUID), never just any id-shaped text
const mbidOf = (value: unknown): string | null => {
  const normalized = text(value, 64) ? normalizeMusicBrainzId(text(value)) : '';
  return MBID_PATTERN.test(normalized) &&
    isValidMusicBrainzResourceId(normalized)
    ? normalized
    : null;
};

const dateOnly = (value: unknown): string | null => {
  const raw = text(value, 40);
  return /^\d{4}(-\d{2}(-\d{2})?)?/.test(raw) ? raw.slice(0, 10) : null;
};

const primaryTypeOf = (value: unknown): AurralArtistReleaseGroupPrimaryType => {
  const type = text(value, 32).toLowerCase();
  return type === 'album'
    ? 'Album'
    : type === 'ep'
      ? 'EP'
      : type === 'single'
        ? 'Single'
        : 'Other';
};

const remoteImage = (
  images: LidarrImageRecord[] | undefined,
  types: string[]
): string | null => {
  for (const type of types) {
    const image = images?.find(
      (candidate) => candidate.coverType?.toLowerCase() === type
    );
    const url = sanitizeAurralImageUrl(image?.remoteUrl ?? image?.url);
    if (url) return url;
  }
  return null;
};

/** Owned (every song), partly owned, or neither, from Lidarr's counts. */
const albumState = (album: LidarrAlbum): 'owned' | 'partial' | null => {
  const files = album.statistics?.trackFileCount ?? 0;
  const total = album.statistics?.trackCount ?? 0;
  if (files <= 0) return null;
  return total > 0 && files < total ? 'partial' : 'owned';
};

const albumArtCache = new Map<string, { url: string | null; at: number }>();

class LidarrMusicApi extends LidarrAPI {
  /** Artists in Lidarr; `fresh` skips the short cache (before a change). */
  public async getArtists(fresh = false): Promise<LidarrArtistRecord[]> {
    const data = await this.get<unknown>(
      '/artist',
      undefined,
      fresh ? 0 : LIBRARY_CACHE_TTL_SECONDS
    );
    return Array.isArray(data)
      ? data.filter(
          (artist): artist is LidarrArtistRecord =>
            isRecord(artist) &&
            Number.isSafeInteger(artist.id) &&
            typeof artist.artistName === 'string' &&
            typeof artist.foreignArtistId === 'string'
        )
      : [];
  }

  public async getLibraryAlbums(): Promise<LidarrAlbum[]> {
    return this.getAlbums(LIBRARY_CACHE_TTL_SECONDS);
  }

  public async lookupArtists(term: string): Promise<LidarrLookupArtist[]> {
    const data = await this.get<unknown>(
      '/artist/lookup',
      { params: { term } },
      LOOKUP_CACHE_TTL_SECONDS
    );
    return Array.isArray(data)
      ? data.filter(isRecord).slice(0, MAX_LOOKUP_RESULTS)
      : [];
  }

  public async lookupAlbums(term: string): Promise<LidarrLookupAlbum[]> {
    const data = await this.get<unknown>(
      '/album/lookup',
      { params: { term } },
      LOOKUP_CACHE_TTL_SECONDS
    );
    return Array.isArray(data)
      ? data.filter(isRecord).slice(0, MAX_LOOKUP_RESULTS)
      : [];
  }

  public async updateArtist(
    artist: LidarrArtistRecord
  ): Promise<LidarrArtistRecord> {
    const response = await this.request<LidarrArtistRecord>(
      'PUT',
      `/artist/${artist.id}`,
      artist
    );
    this.removeCache('/artist');
    return response.data;
  }

  public async addArtist(
    body: Record<string, unknown>
  ): Promise<LidarrArtistRecord> {
    const added = await this.post<LidarrArtistRecord>('/artist', body);
    this.removeCache('/artist');
    return added;
  }

  public async getQueueRecords(): Promise<LidarrQueueRecord[]> {
    const data = await this.get<{ records?: unknown[] }>(
      '/queue',
      {
        params: {
          page: 1,
          pageSize: 200,
          includeAlbum: true,
          includeArtist: true,
        },
      },
      0
    );
    return Array.isArray(data?.records)
      ? (data.records.filter(isRecord) as LidarrQueueRecord[])
      : [];
  }

  public async getHistoryRecords(): Promise<LidarrHistoryRecord[]> {
    const data = await this.get<{ records?: unknown[] }>(
      '/history',
      {
        params: {
          page: 1,
          pageSize: 100,
          sortKey: 'date',
          sortDirection: 'descending',
          includeAlbum: true,
          includeArtist: true,
        },
      },
      0
    );
    return Array.isArray(data?.records)
      ? (data.records.filter(isRecord) as LidarrHistoryRecord[])
      : [];
  }

  public async getCover(
    kind: AurralLibraryKind,
    id: number
  ): Promise<AurralLibraryArtwork | null> {
    const path =
      kind === 'albums'
        ? `/mediacover/album/${id}/cover-250.jpg`
        : `/mediacover/artist/${id}/poster-250.jpg`;
    // through request(), so the path resolves against Lidarr's own address
    const response = await this.request<ArrayBuffer>('GET', path, undefined, {
      responseType: 'arraybuffer',
      maxContentLength: MAX_ARTWORK_BYTES,
      headers: { Accept: 'image/*' },
      validateStatus: (status) => status === 200 || status === 404,
    });
    const contentType = String(response.headers['content-type'] ?? '');
    if (response.status !== 200 || !/^image\//i.test(contentType)) return null;
    return { buffer: Buffer.from(response.data), contentType };
  }
}

export class LidarrMusicProvider {
  public readonly kind = 'lidarr' as const;
  private readonly api: LidarrMusicApi;
  private readonly deezer = new DeezerAPI();
  private readonly listenbrainz = new ListenBrainzAPI();

  constructor(private readonly settings: LidarrSettings) {
    this.api = new LidarrMusicApi({
      url: LidarrAPI.buildUrl(settings, '/api/v1'),
      apiKey: settings.apiKey,
    });
  }

  // --- library ---------------------------------------------------------------

  private async library() {
    const [artists, albums] = await Promise.all([
      this.api.getArtists(),
      this.api.getLibraryAlbums(),
    ]);
    const artistNames = new Map(
      artists.map((artist) => [artist.id, artist.artistName])
    );
    const owned = new Set<string>();
    const partial = new Set<string>();
    for (const album of albums) {
      const id = mbidOf(album.foreignAlbumId);
      const state = albumState(album);
      if (id && state === 'owned') owned.add(id);
      if (id && state === 'partial') partial.add(id);
    }
    const ownedArtists = new Set(
      artists
        .filter((artist) => (artist.statistics?.trackFileCount ?? 0) > 0)
        .map((artist) => mbidOf(artist.foreignArtistId))
        .filter((id): id is string => Boolean(id))
    );
    return { artists, albums, artistNames, owned, partial, ownedArtists };
  }

  private albumArtist(
    album: LidarrAlbum,
    artistNames: Map<number, string>
  ): string {
    return (
      text(album.artist?.artistName) ||
      text(album.artistName) ||
      artistNames.get(album.artistId) ||
      ''
    );
  }

  public async getLibraryPage(
    kind: 'albums',
    sort?: AurralLibrarySort,
    page?: number,
    pageSize?: number,
    query?: string
  ): Promise<Extract<AurralLibraryPage, { kind: 'albums' }>>;
  public async getLibraryPage(
    kind: 'artists',
    sort?: AurralLibrarySort,
    page?: number,
    pageSize?: number,
    query?: string
  ): Promise<Extract<AurralLibraryPage, { kind: 'artists' }>>;
  public async getLibraryPage(
    kind: AurralLibraryKind,
    sort?: AurralLibrarySort,
    page?: number,
    pageSize?: number,
    query?: string
  ): Promise<AurralLibraryPage>;
  public async getLibraryPage(
    kind: AurralLibraryKind,
    sort: AurralLibrarySort = 'newest',
    page = 1,
    pageSize = 30,
    query?: string
  ): Promise<AurralLibraryPage> {
    const { artists, albums, artistNames } = await this.library();
    const filter = query ? musicMatchKey(query) : '';
    const start = (Math.max(1, page) - 1) * pageSize;
    if (kind === 'artists') {
      const matching = artists
        .filter((artist) => (artist.statistics?.trackFileCount ?? 0) > 0)
        .filter(
          (artist) =>
            !filter || musicMatchKey(artist.artistName).includes(filter)
        )
        .sort((left, right) =>
          sort === 'artist'
            ? left.artistName.localeCompare(right.artistName)
            : Date.parse(right.added ?? '') - Date.parse(left.added ?? '') || 0
        );
      const items = matching
        .slice(start, start + pageSize)
        .map((artist): AurralLibraryArtistEntry => ({
          id: artist.id,
          name: artist.artistName,
          mbid: mbidOf(artist.foreignArtistId),
          albumCount: artist.statistics?.albumCount ?? 0,
          trackCount: artist.statistics?.trackFileCount ?? 0,
          coverUrl: `/api/v1/music/library-art/artists/${artist.id}`,
        }));
      return {
        kind: 'artists',
        page,
        pageSize,
        total: matching.length,
        hasMore: start + pageSize < matching.length,
        items,
      };
    }
    const matching = albums
      .filter((album) => albumState(album) !== null)
      .filter((album) => {
        if (!filter) return true;
        return (
          musicMatchKey(album.title).includes(filter) ||
          musicMatchKey(this.albumArtist(album, artistNames)).includes(filter)
        );
      })
      .sort((left, right) => {
        if (sort === 'album') return left.title.localeCompare(right.title);
        if (sort === 'artist')
          return this.albumArtist(left, artistNames).localeCompare(
            this.albumArtist(right, artistNames)
          );
        if (sort === 'released')
          return (
            Date.parse(right.releaseDate ?? '') -
              Date.parse(left.releaseDate ?? '') || 0
          );
        return (
          Date.parse(right.added ?? '') - Date.parse(left.added ?? '') || 0
        );
      });
    const items = matching
      .slice(start, start + pageSize)
      .map((album): AurralLibraryAlbumEntry => ({
        id: album.id,
        title: album.title,
        artistName: this.albumArtist(album, artistNames) || null,
        mbid: mbidOf(album.foreignAlbumId),
        releaseGroupMbid: mbidOf(album.foreignAlbumId),
        releaseDate: dateOnly(album.releaseDate),
        addedAt: album.added ?? null,
        trackCount: album.statistics?.trackCount ?? 0,
        availableTrackCount: album.statistics?.trackFileCount ?? 0,
        coverUrl: `/api/v1/music/library-art/albums/${album.id}`,
      }));
    return {
      kind: 'albums',
      page,
      pageSize,
      total: matching.length,
      hasMore: start + pageSize < matching.length,
      items,
    };
  }

  public async getLibraryAlbumPage(
    page: number,
    pageSize: number,
    sort: 'album' | 'newest'
  ): Promise<Extract<AurralLibraryPage, { kind: 'albums' }>> {
    return this.getLibraryPage('albums', sort, page, pageSize);
  }

  public async getLibraryAlbumsPage(
    page = 1,
    pageSize = 100
  ): Promise<AurralLibraryAlbumsPage> {
    const albums = await this.getLibraryAlbumPage(page, pageSize, 'newest');
    return {
      page: albums.page,
      pageSize: albums.pageSize,
      total: albums.total,
      hasMore: albums.hasMore,
      items: albums.items.map((album) => ({
        id: album.id,
        mbid: album.mbid,
        releaseGroupMbid: album.releaseGroupMbid,
        title: album.title,
        albumArtist: album.artistName,
        releaseDate: album.releaseDate,
        trackCount: album.trackCount,
        availableTrackCount: album.availableTrackCount,
        coverUrl: album.coverUrl,
      })),
    };
  }

  /**
   * Lidarr has no cheap list of every song, so the song-level "owned
   * elsewhere" matching falls back to albums on Lidarr.
   */
  public async getLibraryTrackPage(
    page: number
  ): Promise<AurralLibraryTrackPage> {
    return { page, total: 0, hasMore: false, items: [] };
  }

  public async getLibraryArtistReleaseGroups(
    mbid: string
  ): Promise<AurralLibraryArtistReleaseGroups> {
    const wanted = mbidOf(mbid);
    const { artists, albums } = await this.library();
    const artist = artists.find(
      (candidate) => mbidOf(candidate.foreignArtistId) === wanted
    );
    const owned = new Set<string>();
    const partial = new Set<string>();
    if (!artist) return { owned, partial };
    for (const album of albums) {
      if (album.artistId !== artist.id) continue;
      const id = mbidOf(album.foreignAlbumId);
      const state = albumState(album);
      if (id && state === 'owned') owned.add(id);
      if (id && state === 'partial') partial.add(id);
    }
    return { owned, partial };
  }

  public async searchLibrary(
    query: string,
    limit = 8
  ): Promise<AurralLibrarySearchResult> {
    const filter = musicMatchKey(query);
    if (!filter) return { artists: [], albums: [], tracks: [] };
    const { artists, albums, artistNames } = await this.library();
    return {
      artists: artists
        .filter(
          (artist) =>
            (artist.statistics?.trackFileCount ?? 0) > 0 &&
            musicMatchKey(artist.artistName).includes(filter)
        )
        .slice(0, limit)
        .map((artist) => ({
          mbid: mbidOf(artist.foreignArtistId),
          name: artist.artistName,
          image: remoteImage(artist.images, ['poster', 'fanart']),
          inLibrary: true,
        })),
      albums: albums
        .filter(
          (album) =>
            albumState(album) !== null &&
            (musicMatchKey(album.title).includes(filter) ||
              musicMatchKey(this.albumArtist(album, artistNames)).includes(
                filter
              ))
        )
        .slice(0, limit)
        .map((album) => ({
          mbid: mbidOf(album.foreignAlbumId),
          title: album.title,
          artistName: this.albumArtist(album, artistNames),
          artistMbid: mbidOf(album.artist?.foreignArtistId),
          primaryType: primaryTypeOf(album.albumType),
          releaseDate: dateOnly(album.releaseDate),
          coverUrl: `/api/v1/music/library-art/albums/${album.id}`,
          inLibrary: albumState(album) === 'owned',
          partial: albumState(album) === 'partial',
        })),
      tracks: [],
    };
  }

  public async getLibraryArtwork(
    kind: AurralLibraryKind,
    id: number
  ): Promise<AurralLibraryArtwork | null> {
    return this.api.getCover(kind, id);
  }

  // --- following -------------------------------------------------------------

  private async findArtist(mbid: string, fresh = false) {
    const wanted = mbidOf(mbid);
    return (await this.api.getArtists(fresh)).find(
      (artist) => mbidOf(artist.foreignArtistId) === wanted
    );
  }

  private static followStatus(
    artist: LidarrArtistRecord | undefined
  ): AurralArtistFollowStatus {
    return {
      inLibrary: Boolean(artist),
      // following = new releases are fetched as they come out
      following: Boolean(
        artist?.monitored && (artist.monitorNewItems ?? 'all') === 'all'
      ),
    };
  }

  public async getArtistFollowStatus(
    mbid: string
  ): Promise<AurralArtistFollowStatus> {
    // read fresh: the answer right after a Follow must show it
    return LidarrMusicProvider.followStatus(await this.findArtist(mbid, true));
  }

  public async setArtistFollowing(
    mbid: string,
    name: string,
    follow: boolean
  ): Promise<AurralArtistFollowStatus> {
    const artist = await this.findArtist(mbid, true);
    if (artist) {
      // Unfollowing stops new releases only: albums already asked for keep
      // their own monitoring, so open requests still download.
      const updated = await this.api.updateArtist({
        ...artist,
        monitored: follow ? true : artist.monitored,
        monitorNewItems: follow ? 'all' : 'none',
      });
      return LidarrMusicProvider.followStatus(updated);
    }
    if (!follow) return { inLibrary: false, following: false };
    const normalized = mbidOf(mbid);
    if (!normalized || !this.settings.activeDirectory) {
      throw new Error('Lidarr needs an artist id and a root folder to follow.');
    }
    const added = await this.api.addArtist({
      artistName: name,
      foreignArtistId: normalized,
      qualityProfileId: this.settings.activeProfileId,
      metadataProfileId: this.settings.activeMetadataProfileId,
      rootFolderPath: this.settings.activeDirectory,
      monitored: true,
      monitorNewItems: 'all',
      tags: this.settings.tags ?? [],
      // future releases only ("monitor none" would leave the artist
      // unmonitored); nothing already out is fetched by following
      addOptions: { monitor: 'future', searchForMissingAlbums: false },
    });
    return LidarrMusicProvider.followStatus(added);
  }

  // --- activity --------------------------------------------------------------

  public async getActivity(): Promise<AurralActivityItem[]> {
    const [queue, history] = await Promise.all([
      this.api.getQueueRecords(),
      this.api.getHistoryRecords(),
    ]);
    const items: AurralActivityItem[] = [];
    for (const record of queue) {
      const state = text(record.trackedDownloadState, 32).toLowerCase();
      const status = text(record.status, 32).toLowerCase();
      const failed =
        state === 'importfailed' ||
        state === 'failedpending' ||
        status === 'failed' ||
        status === 'warning';
      const working =
        !failed &&
        (status === 'downloading' ||
          state === 'importpending' ||
          state === 'importing');
      const reason = [
        text(record.errorMessage, 300),
        ...(record.statusMessages ?? []).flatMap((message) =>
          (message.messages ?? []).map((line) => text(line, 200))
        ),
      ]
        .filter(Boolean)
        .join('; ');
      items.push({
        id: `lidarr-queue-${record.id ?? items.length}`,
        source: 'lidarr',
        title: text(record.album?.title) || text(record.title),
        subtitle: failed && reason ? reason : null,
        status: failed ? 'failed' : working ? 'processing' : 'pending',
        requestedAt: text(record.added, 40) || undefined,
        albumName: text(record.album?.title) || null,
        artistName:
          text(record.artist?.artistName) ||
          text(record.album?.artist?.artistName) ||
          null,
        albumMbid: mbidOf(record.album?.foreignAlbumId),
        albumId: record.albumId ?? null,
        cause: null,
      });
    }
    for (const record of history) {
      const event = text(record.eventType, 40);
      const completed = event === 'downloadImported';
      const failed =
        event === 'downloadFailed' || event === 'albumImportIncomplete';
      if (!completed && !failed) continue;
      const data = isRecord(record.data) ? record.data : {};
      items.push({
        id: `lidarr-history-${record.id ?? items.length}`,
        source: 'lidarr',
        title: text(record.album?.title) || text(record.sourceTitle),
        subtitle: failed
          ? text(data.message, 300) || text(data.statusMessages, 300) || null
          : null,
        status: completed ? 'completed' : 'failed',
        requestedAt: text(record.date, 40) || undefined,
        completedAt: text(record.date, 40) || null,
        albumName: text(record.album?.title) || null,
        artistName:
          text(record.artist?.artistName) ||
          text(record.album?.artist?.artistName) ||
          null,
        albumMbid: mbidOf(record.album?.foreignAlbumId),
        albumId: record.albumId ?? null,
        cause: null,
      });
    }
    return items;
  }

  // --- artists and search ----------------------------------------------------

  public async getArtistDetails(
    mbid: string
  ): Promise<AurralArtistDetails | null> {
    const normalized = mbidOf(mbid);
    if (!normalized) return null;
    const details = await this.listenbrainz
      .getArtist(normalized)
      .catch(() => null);
    if (!details?.artist) return null;
    const tags = [...(details.artist.tag?.artist ?? [])]
      .sort((left, right) => (right.count ?? 0) - (left.count ?? 0))
      .slice(0, 8)
      .map((tag) => text(tag.tag, 64))
      .filter(Boolean);
    const releaseGroups = (details.releaseGroups ?? []).flatMap(
      (group): AurralArtistReleaseGroup[] => {
        const id = mbidOf(group.mbid ?? group.release_group_mbid);
        const title = text(group.name ?? group.release_group_name);
        if (!id || !title) return [];
        const year = Number.parseInt(text(group.date, 10).slice(0, 4), 10);
        const coverRelease = mbidOf(group.caa_release_mbid);
        return [
          {
            id,
            title,
            year: Number.isFinite(year) ? year : null,
            primaryType: primaryTypeOf(group.type),
            secondaryTypes: (group.secondary_types ?? []).map((type) =>
              text(type, 32)
            ),
            coverUrl: coverRelease
              ? `https://coverartarchive.org/release/${coverRelease}/front-250`
              : null,
            artistCreditIds: (group.artist_mbids ?? [])
              .map((artistId) => mbidOf(artistId))
              .filter((artistId): artistId is string => Boolean(artistId)),
          },
        ];
      }
    );
    return {
      mbid: normalized,
      name: text(details.artist.name),
      type: text(details.artist.type, 64) || null,
      country: text(details.artist.area, 128) || null,
      beginYear:
        typeof details.artist.begin_year === 'number'
          ? details.artist.begin_year
          : null,
      endYear: null,
      genres: tags,
      bio: null,
      releaseGroups,
    };
  }

  public async getSimilarArtists(mbid: string): Promise<AurralSimilarArtist[]> {
    const normalized = mbidOf(mbid);
    if (!normalized) return [];
    const details = await this.listenbrainz
      .getArtist(normalized)
      .catch(() => null);
    return (details?.similarArtists?.artists ?? [])
      .slice(0, 12)
      .flatMap((artist): AurralSimilarArtist[] => {
        const name = text(artist.name);
        return name
          ? [{ mbid: mbidOf(artist.artist_mbid), name, image: null }]
          : [];
      });
  }

  public async getArtistImageUrl(
    mbid: string,
    name?: string
  ): Promise<string | null> {
    const artist = await this.findArtist(mbid).catch(() => undefined);
    const fromLidarr = remoteImage(artist?.images, ['poster', 'fanart']);
    if (fromLidarr) return fromLidarr;
    const lookupName = name?.trim() || artist?.artistName;
    if (!lookupName) return null;
    const found = await this.deezer.findArtist(lookupName).catch(() => null);
    return found?.pictureXl ?? null;
  }

  private toAlbum(
    album: LidarrLookupAlbum,
    owned: Set<string>,
    partial: Set<string>
  ): AurralNormalizedAlbum | null {
    const id = mbidOf(album.foreignAlbumId);
    const title = text(album.title);
    if (!title) return null;
    return {
      mbid: id,
      title,
      artistName: text(album.artist?.artistName),
      artistMbid: mbidOf(album.artist?.foreignArtistId),
      primaryType: primaryTypeOf(album.albumType),
      releaseDate: dateOnly(album.releaseDate),
      coverUrl: remoteImage(album.images, ['cover']),
      inLibrary: Boolean(id && owned.has(id)),
      partial: Boolean(id && partial.has(id)),
    };
  }

  public async searchAlbums(
    query: string,
    limit = 12
  ): Promise<AurralNormalizedAlbum[]> {
    const [found, { owned, partial }] = await Promise.all([
      this.api.lookupAlbums(query),
      this.library(),
    ]);
    return found
      .map((album) => this.toAlbum(album, owned, partial))
      .filter((album): album is AurralNormalizedAlbum => album !== null)
      .slice(0, limit);
  }

  private static toTrack(track: {
    id: number;
    title: string;
    artistName: string;
    coverUrl?: string | null;
    albumTitle?: string | null;
    durationMs?: number | null;
    rank?: number;
  }): AurralNormalizedTrack {
    return {
      title: track.title,
      artistName: track.artistName,
      artistMbid: null,
      albumTitle: track.albumTitle ?? null,
      albumMbid: null,
      durationMs: track.durationMs ?? null,
      coverUrl: track.coverUrl ?? null,
      previewDeezerId: String(track.id),
      inLibrary: false,
      popularity: track.rank,
    };
  }

  public async searchUnified(
    query: string,
    limit = 12
  ): Promise<AurralUnifiedSearchResult> {
    const [artists, albums, tracks, library] = await Promise.allSettled([
      this.api.lookupArtists(query),
      this.api.lookupAlbums(query),
      this.deezer.searchTracks(query, limit),
      this.library(),
    ]);
    const ownedArtists =
      library.status === 'fulfilled' ? library.value.ownedArtists : new Set();
    const owned =
      library.status === 'fulfilled' ? library.value.owned : new Set<string>();
    const partial =
      library.status === 'fulfilled'
        ? library.value.partial
        : new Set<string>();
    const artistResults: AurralNormalizedArtist[] =
      artists.status === 'fulfilled'
        ? artists.value.slice(0, limit).flatMap((artist) => {
            const name = text(artist.artistName);
            const id = mbidOf(artist.foreignArtistId);
            return name
              ? [
                  {
                    mbid: id,
                    name,
                    image: remoteImage(artist.images, ['poster', 'fanart']),
                    inLibrary: Boolean(id && ownedArtists.has(id)),
                  },
                ]
              : [];
          })
        : [];
    const albumResults =
      albums.status === 'fulfilled'
        ? albums.value
            .map((album) => this.toAlbum(album, owned, partial))
            .filter((album): album is AurralNormalizedAlbum => album !== null)
            .slice(0, limit)
        : [];
    const trackResults =
      tracks.status === 'fulfilled'
        ? tracks.value.slice(0, limit).map(LidarrMusicProvider.toTrack)
        : [];
    const wanted = musicMatchKey(query);
    const exactArtist = artistResults.find(
      (artist) => musicMatchKey(artist.name) === wanted
    );
    const exactAlbum = albumResults.find(
      (album) => musicMatchKey(album.title) === wanted
    );
    const top: AurralNormalizedTopResult | null = exactArtist
      ? { type: 'artist', ...exactArtist }
      : exactAlbum
        ? { type: 'album', ...exactAlbum }
        : trackResults[0]
          ? { type: 'track', ...trackResults[0] }
          : artistResults[0]
            ? { type: 'artist', ...artistResults[0] }
            : null;
    return {
      artists: artistResults,
      albums: albumResults,
      tracks: trackResults,
      top,
      degraded: [artists, albums, tracks].some(
        (result) => result.status === 'rejected'
      ),
    };
  }

  /** A pasted playlist link, so the search can open the playlist pages. */
  public async resolveLink(url: string): Promise<AurralResolvedLink | null> {
    const match =
      /deezer\.com\/(?:[a-z]{2}\/)?playlist\/(\d{1,20})/i.exec(url) ??
      /open\.spotify\.com\/playlist\/([A-Za-z0-9]{1,64})/i.exec(url) ??
      /youtube\.com\/playlist\?list=([\w-]{1,64})/i.exec(url);
    if (!match) return null;
    const provider = /deezer/i.test(url)
      ? 'deezer'
      : /spotify/i.test(url)
        ? 'spotify'
        : 'youtube';
    return {
      type: 'playlist',
      provider,
      id: match[1],
      mbid: null,
      title: null,
      artistName: null,
      albumMbid: null,
    };
  }

  // --- discovery (Deezer and ListenBrainz) -----------------------------------

  /** MusicBrainz ids for chart artists, through Lidarr's metadata search. */
  private async withArtistIds<T extends { mbid: string | null; name: string }>(
    artists: T[]
  ): Promise<T[]> {
    const resolved = await Promise.all(
      artists.slice(0, MAX_RESOLVED_ARTISTS).map(async (artist) => {
        if (artist.mbid) return artist;
        const found = await this.api
          .lookupArtists(artist.name)
          .catch(() => [] as LidarrLookupArtist[]);
        const wanted = musicMatchKey(artist.name);
        const match = found.find(
          (candidate) => musicMatchKey(text(candidate.artistName)) === wanted
        );
        return { ...artist, mbid: mbidOf(match?.foreignArtistId) };
      })
    );
    return [...resolved, ...artists.slice(MAX_RESOLVED_ARTISTS)];
  }

  private static fromDeezerArtist(
    artist: DeezerArtistResult,
    ownedNames: Set<string>
  ): AurralNormalizedArtist {
    return {
      mbid: null,
      name: artist.name,
      image: artist.pictureXl,
      inLibrary: ownedNames.has(musicMatchKey(artist.name)),
    };
  }

  private async ownedArtistNames(): Promise<Set<string>> {
    const artists = await this.api.getArtists().catch(() => []);
    return new Set(
      artists
        .filter((artist) => (artist.statistics?.trackFileCount ?? 0) > 0)
        .map((artist) => musicMatchKey(artist.artistName))
    );
  }

  public async getTrending(): Promise<AurralTrendingResult> {
    const [chart, ownedNames] = await Promise.all([
      this.deezer.getChart(25),
      this.ownedArtistNames(),
    ]);
    return {
      artists: await this.withArtistIds(
        chart.artists.map((artist) =>
          LidarrMusicProvider.fromDeezerArtist(artist, ownedNames)
        )
      ),
      albums: chart.albums.map((album) => ({
        mbid: null,
        title: album.title,
        artistName: album.artistName,
        artistMbid: null,
        primaryType:
          album.recordType === 'single'
            ? 'Single'
            : album.recordType === 'ep'
              ? 'EP'
              : 'Album',
        releaseDate: null,
        coverUrl: album.coverUrl,
        inLibrary: false,
      })),
      tracks: chart.tracks.map(LidarrMusicProvider.toTrack),
    };
  }

  public async getDiscoverTags(options?: {
    q?: string;
    limit?: number;
  }): Promise<string[]> {
    const limit = Math.min(20, Math.max(1, Math.trunc(options?.limit ?? 20)));
    const query = options?.q ? musicMatchKey(options.q) : '';
    const genres = await this.deezer.getGenres().catch(() => []);
    return genres
      .map((genre) => genre.name)
      .filter(
        (name) =>
          name.toLowerCase() !== 'all' &&
          (!query || musicMatchKey(name).includes(query))
      )
      .slice(0, limit);
  }

  public async getDiscoverByTag(
    tag: string,
    options?: { limit?: number; offset?: number }
  ): Promise<AurralGenreDiscoveryResult> {
    const limit = Math.min(50, Math.max(1, options?.limit ?? 24));
    const offset = Math.max(0, options?.offset ?? 0);
    const [artists, ownedNames] = await Promise.all([
      this.deezer.getArtistsForGenreTag(tag),
      this.ownedArtistNames(),
    ]);
    return {
      tag,
      artists: await this.withArtistIds(
        artists
          .slice(offset, offset + limit)
          .map((artist) =>
            LidarrMusicProvider.fromDeezerArtist(artist, ownedNames)
          )
      ),
    };
  }

  /**
   * Recommendations: artists Deezer relates to the newest artists in the
   * library, minus the ones already there.
   */
  public async getDiscoverRecommended(): Promise<AurralDiscoverRecommendedResult> {
    const artists = await this.api.getArtists();
    const seeds = artists
      .filter((artist) => (artist.statistics?.trackFileCount ?? 0) > 0)
      .sort(
        (left, right) =>
          Date.parse(right.added ?? '') - Date.parse(left.added ?? '') || 0
      )
      .slice(0, MAX_RECOMMENDATION_SEEDS);
    const ownedNames = new Set(
      artists.map((artist) => musicMatchKey(artist.artistName))
    );
    const seen = new Set<string>();
    const recommendations: {
      mbid: string | null;
      name: string;
      image: string | null;
      because: string | null;
      matchPercent: number | null;
    }[] = [];
    const related = await Promise.all(
      seeds.map(async (seed) => {
        const deezerArtist = await this.deezer
          .findArtist(seed.artistName)
          .catch(() => null);
        const list = deezerArtist
          ? await this.deezer
              .getRelatedArtists(deezerArtist.id, 8)
              .catch(() => [])
          : [];
        return { seed, list };
      })
    );
    for (const { seed, list } of related) {
      for (const artist of list) {
        const key = musicMatchKey(artist.name);
        if (ownedNames.has(key) || seen.has(key)) continue;
        seen.add(key);
        recommendations.push({
          mbid: null,
          name: artist.name,
          image: artist.pictureXl,
          because: seed.artistName,
          matchPercent: null,
        });
      }
    }
    const chart = await this.deezer.getChart(20).catch(() => null);
    return {
      recommendations: await this.withArtistIds(recommendations),
      trending: (chart?.artists ?? []).map((artist) => ({
        mbid: null,
        name: artist.name,
        image: artist.pictureXl,
        label: null,
      })),
    };
  }

  public async getDiscoverPlaylists(): Promise<AurralDiscoverPlaylistsResult> {
    const playlists = await this.deezer.getChartPlaylists(30);
    return {
      categories: playlists.length
        ? [
            {
              id: 'deezer-chart',
              name: 'Popular playlists',
              playlists: playlists.map((playlist) => ({
                ...playlist,
                provider: 'deezer',
              })),
            },
          ]
        : [],
    };
  }

  public async getDiscoverPlaylist(
    provider: string,
    playlistId: string
  ): Promise<AurralPlaylistDetails | null> {
    if (provider !== 'deezer') return null;
    const playlist = await this.deezer.getPlaylist(playlistId);
    if (!playlist) return null;
    return {
      id: playlist.id,
      name: playlist.name,
      description: playlist.description,
      curator: playlist.curator,
      artworkUrl: playlist.artworkUrl,
      provider: 'deezer',
      tracks: playlist.tracks.map((track: DeezerChartTrack) => ({
        title: track.title,
        artistName: track.artistName,
        albumTitle: track.albumTitle,
        albumMbid: null,
        artistMbid: null,
        durationMs: track.durationMs,
        coverUrl: track.coverUrl,
        previewDeezerId: String(track.id),
        inLibrary: false,
      })),
    };
  }

  // --- previews and artwork --------------------------------------------------

  public async getPreviewLink(
    artist: string,
    track: string
  ): Promise<string | null> {
    return this.deezer.findTrackPreviewUrl(artist, track);
  }

  public async getDeezerPreviewClip(
    deezerTrackId: string
  ): Promise<Buffer | null> {
    const url = await this.deezer.getTrackPreviewUrl(deezerTrackId.trim());
    return url ? this.downloadPreview(url) : null;
  }

  /** A preview clip from Deezer's CDN (HTTPS, size-capped, no redirects off it). */
  public async downloadPreview(url: string): Promise<Buffer | null> {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return null;
    }
    if (
      parsed.protocol !== 'https:' ||
      parsed.username ||
      parsed.password ||
      !/(^|\.)dzcdn\.net$/i.test(parsed.hostname)
    ) {
      return null;
    }
    const response = await axios.get<ArrayBuffer>(parsed.href, {
      ...createSafeHttpRequestOptions(false, true),
      responseType: 'arraybuffer',
      timeout: PREVIEW_TIMEOUT_MS,
      maxContentLength: MAX_PREVIEW_BYTES,
      maxBodyLength: MAX_PREVIEW_BYTES,
      maxRedirects: 0,
      validateStatus: (status) => status === 200 || status === 404,
    });
    return response.status === 200 ? Buffer.from(response.data) : null;
  }

  /** Cover Art Archive first, then Deezer by artist and title. */
  public async getAlbumArtUrl(
    mbid: string,
    artist?: string,
    title?: string
  ): Promise<string | null> {
    if (!MBID_PATTERN.test(mbid.trim())) return null;
    const key = `${mbid.trim().toLowerCase()}\u0000${musicMatchKey(
      artist ?? ''
    )}\u0000${musicMatchKey(title ?? '')}`;
    const cached = albumArtCache.get(key);
    if (
      cached &&
      Date.now() - cached.at <
        (cached.url ? ALBUM_ART_TTL_MS : ALBUM_ART_MISS_TTL_MS)
    ) {
      return cached.url;
    }
    let url: string | null = null;
    const caa = `https://coverartarchive.org/release-group/${encodeURIComponent(
      mbid.trim().toLowerCase()
    )}/front-500`;
    const head = await axios
      .head(caa, {
        timeout: ALBUM_ART_TIMEOUT_MS,
        maxRedirects: 5,
        validateStatus: () => true,
      })
      .catch(() => null);
    if (head && head.status >= 200 && head.status < 400) url = caa;
    if (!url && artist && title) {
      const albums = await this.deezer
        .searchAlbums(`${artist} ${title}`, 5)
        .catch(() => []);
      const wantedArtist = musicMatchKey(artist);
      const wantedTitle = musicMatchKey(title);
      url =
        albums.find(
          (album) =>
            musicMatchKey(album.artistName) === wantedArtist &&
            musicMatchKey(album.title).startsWith(wantedTitle)
        )?.coverXl ?? null;
    }
    if (albumArtCache.size >= MAX_ALBUM_ART_ENTRIES) {
      const oldest = albumArtCache.keys().next().value;
      if (oldest !== undefined) albumArtCache.delete(oldest);
    }
    albumArtCache.set(key, { url, at: Date.now() });
    return url;
  }
}

export default LidarrMusicProvider;
