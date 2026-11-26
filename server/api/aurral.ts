import DeezerAPI from '@server/api/deezer';
import ExternalAPI from '@server/api/externalapi';
import cacheManager from '@server/lib/cache';
import {
  isValidMusicBrainzResourceId,
  normalizeMusicBrainzId,
} from '@server/lib/externalIds';
import { normalizeMusicSearchText } from '@server/lib/musicSearch';
import {
  createSafeHttpRequestOptions,
  isLocalOrPrivateAddress,
} from '@server/utils/security';
import { buildServiceUrl } from '@server/utils/serviceUrl';
import axios from 'axios';
import net from 'net';

const POPULAR_MUSIC_GENRES = [
  'pop',
  'hip hop',
  'rock',
  'r&b',
  'country',
  'electronic',
  'indie',
  'alternative rock',
  'dance',
  'latin',
  'metal',
  'k-pop',
  'jazz',
  'soul',
  'folk',
  'punk',
  'house',
  'classical',
  'reggae',
  'blues',
] as const;

export interface AurralHealthUser {
  id?: number;
  username: string;
  role?: string;
}

export interface AurralHealthResponse {
  status?: string;
  appVersion: string;
  user?: AurralHealthUser | null;
}

export interface AurralRequestAlbumPayload {
  albumMbid: string;
  albumName: string;
  artistMbid: string;
  artistName: string;
  releaseMbid?: string;
}

export interface AurralRequestAlbumResult {
  success: boolean;
  artist?: {
    id: number;
    mbid?: string;
    name?: string;
  };
  album: {
    id: number;
    mbid?: string;
    releaseGroupMbid?: string;
    title?: string;
  };
  status: 'available' | 'queued' | 'blocked' | 'inLibrary' | string;
  jobIds?: string[];
  requestGroupId?: string | null;
  queued?: boolean;
}

export type AurralAlbumDownloadStatus =
  | 'complete'
  | 'downloading'
  | 'queued'
  | 'blocked'
  | 'cancelled'
  | 'failed'
  | 'partial'
  | 'unreleased'
  | 'missing';

export interface AurralAlbumStatusResponse {
  libraryId: number;
  releaseDate?: string | null;
  status: AurralAlbumDownloadStatus;
  counts?: {
    totalTracks?: number;
    ownedTracks?: number;
    missingTracks?: number;
  };
  recovery?: unknown;
  requestGroupId?: string | null;
}

export interface AurralAlbumLookupItem {
  inLibrary: boolean;
  libraryAlbumId: number;
  libraryArtistId?: number;
  status: 'available' | 'partial' | string;
  monitored?: boolean;
  managed?: boolean;
  trackListComplete?: boolean;
  percentOfTracks?: number;
  sizeOnDisk?: number;
  trackCount?: number;
  trackFileCount?: number;
  ownedTrackMbids?: string[];
  albumName?: string;
  releaseDate?: string | null;
}

export interface AurralRequestTrackPayload {
  artistName: string;
  trackName: string;
  albumName?: string;
  artistMbid?: string;
  albumMbid?: string;
  releaseMbid?: string;
  trackMbid?: string;
  durationMs?: number;
  trackNumber?: number;
  discNumber?: number;
}

export interface AurralRequestTrackResult {
  success: boolean;
  alreadyOwned?: boolean;
  queued?: boolean;
  jobId?: string;
  reused?: boolean;
  alreadyQueued?: boolean;
  monitored?: boolean;
}

export interface AurralActiveDownloadsResponse {
  albums: string[];
  artists: string[];
  tracks: {
    mbid: string | null;
    artistName: string;
    trackName: string;
  }[];
}

export const AURRAL_LIBRARY_KINDS = ['albums', 'artists'] as const;
export type AurralLibraryKind = (typeof AURRAL_LIBRARY_KINDS)[number];

export const AURRAL_LIBRARY_SORTS = [
  'newest',
  'album',
  'artist',
  'released',
  'plays',
  'played',
  'random',
  'favorited',
] as const;
export type AurralLibrarySort = (typeof AURRAL_LIBRARY_SORTS)[number];

export interface AurralActivityCause {
  kind: string;
  name: string | null;
}

export interface AurralActivityItem {
  id: string;
  source?: string;
  type?: string;
  title?: string;
  subtitle?: string | null;
  status: string;
  statusLabel?: string;
  requestedAt?: string;
  completedAt?: string | null;
  kind?: string;
  jobId?: string | null;
  trackName?: string | null;
  artistName?: string | null;
  albumName?: string | null;
  albumMbid?: string | null;
  albumId?: number | null;
  libraryAlbumId?: number | null;
  requestGroupId?: string | null;
  requestedBy?: string | null;
  inQueue?: boolean;
  cause?: AurralActivityCause | null;
}

export interface AurralLibraryAlbumItem {
  id: number;
  mbid?: string | null;
  releaseGroupMbid?: string | null;
  title?: string;
  albumArtist?: string | null;
  releaseDate?: string | null;
  monitored?: boolean;
  trackCount?: number;
  availableTrackCount?: number;
  coverUrl?: string | null;
}

export interface AurralLibraryAlbumsPage {
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
  items: AurralLibraryAlbumItem[];
}

export interface AurralLibraryAlbumEntry {
  id: number;
  title: string;
  artistName: string | null;
  mbid: string | null;
  releaseGroupMbid: string | null;
  releaseDate: string | null;
  addedAt: string | null;
  trackCount: number;
  availableTrackCount: number;
  coverUrl: string;
}

export interface AurralLibraryArtistEntry {
  id: number;
  name: string;
  mbid: string | null;
  albumCount: number;
  trackCount: number;
  coverUrl: string;
}

export type AurralLibraryPage =
  | {
      kind: 'albums';
      page: number;
      pageSize: number;
      total: number;
      hasMore: boolean;
      items: AurralLibraryAlbumEntry[];
    }
  | {
      kind: 'artists';
      page: number;
      pageSize: number;
      total: number;
      hasMore: boolean;
      items: AurralLibraryArtistEntry[];
    };

export interface AurralLibraryArtwork {
  buffer: Buffer;
  contentType: string;
}

export interface AurralRecommendedArtist {
  mbid: string | null;
  name: string;
  image: string | null;
  because: string | null;
  matchPercent: number | null;
}

export interface AurralTrendingGlobalArtist {
  mbid: string | null;
  name: string;
  image: string | null;
  label: string | null;
}

export interface AurralDiscoverRecommendedResult {
  recommendations: AurralRecommendedArtist[];
  trending: AurralTrendingGlobalArtist[];
}

export interface AurralPlaylistSummary {
  id: string;
  name: string;
  curator: string | null;
  trackCount: number | null;
  artworkUrl: string | null;
  provider: string;
}

export interface AurralPlaylistCategory {
  id: string;
  name: string;
  playlists: AurralPlaylistSummary[];
}

export interface AurralDiscoverPlaylistsResult {
  categories: AurralPlaylistCategory[];
}

export interface AurralPlaylistTrack {
  title: string;
  artistName: string;
  albumTitle: string | null;
  albumMbid: string | null;
  artistMbid: string | null;
  durationMs: number | null;
  coverUrl: string | null;
  previewDeezerId: string | null;
  inLibrary: boolean;
}

export interface AurralPlaylistDetails {
  id: string;
  name: string;
  description: string | null;
  curator: string | null;
  artworkUrl: string | null;
  provider: string;
  tracks: AurralPlaylistTrack[];
}

export interface AurralNormalizedArtist {
  mbid: string | null;
  name: string;
  image: string | null;
  inLibrary: boolean;
}

export interface AurralNormalizedAlbum {
  mbid: string | null;
  title: string;
  artistName: string;
  artistMbid: string | null;
  primaryType: string;
  releaseDate: string | null;
  coverUrl: string | null;
  inLibrary: boolean;
  partial?: boolean;
}

export interface AurralNormalizedTrack {
  title: string;
  artistName: string;
  artistMbid: string | null;
  albumTitle: string | null;
  albumMbid: string | null;
  durationMs: number | null;
  coverUrl: string | null;
  previewDeezerId: string | null;
  inLibrary: boolean;
  /** The song's album is requested, downloading or partly in the library. */
  albumRequested?: boolean;
  /**
   * Internal: catalog popularity (Deezer rank) used to choose the top song.
   * Removed before a search answer is sent.
   */
  popularity?: number;
}

export type AurralNormalizedTopResult =
  | ({ type: 'artist' } & AurralNormalizedArtist)
  | ({ type: 'album' } & AurralNormalizedAlbum)
  | ({ type: 'track' } & AurralNormalizedTrack);

export interface AurralUnifiedSearchResult {
  artists: AurralNormalizedArtist[];
  albums: AurralNormalizedAlbum[];
  tracks: AurralNormalizedTrack[];
  top: AurralNormalizedTopResult | null;
  degraded: boolean;
}

/** A library song as the owned-song index needs it. */
export interface AurralLibraryTrackEntry {
  title: string;
  artistName: string;
}

export interface AurralLibraryTrackPage {
  page: number;
  total: number;
  hasMore: boolean;
  items: AurralLibraryTrackEntry[];
}

export interface AurralLibrarySearchResult {
  artists: AurralNormalizedArtist[];
  albums: AurralNormalizedAlbum[];
  tracks: AurralNormalizedTrack[];
}

export interface AurralResolvedLink {
  type: 'track' | 'album' | 'artist' | 'playlist';
  provider?: 'deezer' | 'spotify' | 'youtube' | string;
  id?: string | null;
  mbid: string | null;
  title: string | null;
  artistName: string | null;
  albumMbid: string | null;
}

export interface AurralSimilarArtist {
  mbid: string | null;
  name: string;
  image: string | null;
}

export interface AurralTrendingResult {
  artists: AurralNormalizedArtist[];
  albums: AurralNormalizedAlbum[];
  tracks: AurralNormalizedTrack[];
}

export interface AurralGenreDiscoveryResult {
  tag: string;
  artists: AurralNormalizedArtist[];
}

export type AurralArtistReleaseGroupPrimaryType =
  'Album' | 'EP' | 'Single' | 'Other';

export interface AurralArtistReleaseGroup {
  id: string;
  title: string;
  year: number | null;
  primaryType: AurralArtistReleaseGroupPrimaryType;
  secondaryTypes: string[];
  coverUrl: string | null;
  /** MusicBrainz release statuses (Official, Promotion, Bootleg), when given. */
  releaseStatuses?: string[];
  /** Artist MBIDs credited on the release group, when given. */
  artistCreditIds?: string[];
}

export interface AurralArtistDetails {
  mbid: string;
  name: string;
  type: string | null;
  country: string | null;
  beginYear: number | null;
  endYear: number | null;
  genres: string[];
  bio: string | null;
  releaseGroups: AurralArtistReleaseGroup[];
  incomplete?: boolean;
}

export interface AurralArtistFollowStatus {
  inLibrary: boolean;
  following: boolean;
  /**
   * Present (true) when Aurral monitors the artist with its default rules.
   * SeerrNG cannot see those rules, so "following" is an assumption then.
   */
  usesDefaultRules?: boolean;
}

type AurralArtistMonitoringState =
  | { inLibrary: false }
  | {
      inLibrary: true;
      monitored: boolean;
      useDefault: boolean;
      rules: Record<string, unknown> | null;
    };

export interface AurralLibraryArtistReleaseGroups {
  owned: Set<string>;
  partial: Set<string>;
}

export class AurralForbiddenError extends Error {
  public readonly status = 403;

  constructor(message = 'Aurral denied permission to change monitoring.') {
    super(message);
    this.name = 'AurralForbiddenError';
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const boundedInteger = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? value
    : undefined;

// Aurral serialises some ids (library album ids) as numeric strings.
const positiveInteger = (value: unknown): number | undefined => {
  const parsed =
    typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
  return typeof parsed === 'number' &&
    Number.isSafeInteger(parsed) &&
    parsed > 0
    ? parsed
    : undefined;
};

const parseLibraryNumericId = (value: unknown): string | undefined => {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value > 0 && value <= 9_999_999_999
      ? String(value)
      : undefined;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!/^\d{1,10}$/.test(trimmed)) return undefined;
    const numeric = Number(trimmed);
    return Number.isSafeInteger(numeric) && numeric > 0
      ? String(numeric)
      : undefined;
  }
  return undefined;
};

const boundedString = (value: unknown, maxLength = 512): string | undefined =>
  typeof value === 'string' && value.length > 0
    ? value.slice(0, maxLength)
    : undefined;

const MAX_DISCOVERY_ITEMS = 50;
const MAX_RECOMMENDED_ITEMS = 24;
const MAX_PLAYLIST_TRACKS = 200;
const MAX_LIBRARY_PAGE_SIZE = 60;
export const MAX_LIBRARY_QUERY_LENGTH = 100;
const MAX_LIBRARY_ART_ID = 2 ** 31;
const MAX_PREVIEW_BYTES = 5 * 1024 * 1024;
const MAX_ARTWORK_BYTES = 10 * 1024 * 1024;
const PREVIEW_DOWNLOAD_TIMEOUT_MS = 15_000;
const SEARCH_TIMEOUT_MS = 3_000;
// Asking for a song or an album: a busy Aurral often takes longer than the
// 10 s default and still queues the job, so a short timeout reported a
// failure for a request that went through.
const REQUEST_TIMEOUT_MS = 30_000;
const SEARCH_CACHE_TTL_SECONDS = 60;
const SEARCH_AUX_CACHE_TTL_SECONDS = 600;
const DISCOVERY_CACHE_TTL_SECONDS = 900;
// An empty genre answer is usually Aurral still warming up: ask again soon.
const EMPTY_DISCOVERY_CACHE_TTL_SECONDS = 60;
const PLAYLISTS_CACHE_TTL_SECONDS = 3600;
const SIMILAR_ARTISTS_CACHE_TTL_SECONDS = 3600;
const PLAYLIST_DETAILS_CACHE_TTL_SECONDS = 600;
const ARTIST_DETAILS_CACHE_TTL_SECONDS = 1800;
const ARTIST_IMAGE_CACHE_TTL_SECONDS = 86_400;
const ARTIST_IMAGE_MISS_CACHE_TTL_SECONDS = 600;
// A Deezer photo found only by name may belong to a different artist with the
// same name, so that guess is kept for a shorter time than Aurral's own cover.
const ARTIST_IMAGE_NAME_MATCH_CACHE_TTL_SECONDS = 3_600;
const MAX_ARTIST_GENRES = 8;
const MAX_ARTIST_BIO_LENGTH = 4000;
const MAX_ARTIST_RELEASE_GROUPS = 400;

// Big catalogs (Elton John has 370+ release groups) are cut to a size the page can
// show. The list is sorted newest first, so a plain slice dropped an artist's oldest
// work: their classic studio albums. Studio albums are always kept; singles, live
// albums and compilations fill the rest, newest first. Order is preserved.
const isStudioAlbum = (group: {
  primaryType?: string | null;
  secondaryTypes?: readonly string[] | null;
}) =>
  group.primaryType === 'Album' && (group.secondaryTypes?.length ?? 0) === 0;

export const capReleaseGroups = <
  T extends {
    group: {
      primaryType?: string | null;
      secondaryTypes?: readonly string[] | null;
    };
  },
>(
  entries: T[],
  max = MAX_ARTIST_RELEASE_GROUPS
): T[] => {
  if (entries.length <= max) return entries;
  const studio = entries.filter((entry) => isStudioAlbum(entry.group)).length;
  let others = Math.max(0, max - studio);
  return entries.filter((entry) => {
    if (isStudioAlbum(entry.group)) return true;
    if (others <= 0) return false;
    others -= 1;
    return true;
  });
};
const AURRAL_FOLLOW_MONITORING = {
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
} as const;
const ALLOWED_PREVIEW_HOSTS = ['dzcdn.net', 'deezer.com'] as const;
const ALLOWED_IMAGE_HOSTS = [
  'coverartarchive.org',
  'archive.org',
  'dzcdn.net',
  'deezer.com',
  'fanart.tv',
  'theaudiodb.com',
  'brainzmash.cc',
  'scdn.co',
  'mzstatic.com',
  'lastfm.freetls.fastly.net',
  'last.fm',
  'akamaized.net',
  'ytimg.com',
  'googleusercontent.com',
  'discogs.com',
  'wikimedia.org',
  // Lidarr's metadata image cache (artist and album art in Lidarr lookups)
  'lidarr.audio',
] as const;
const ALBUM_ART_TIMEOUT_MS = 6_000;
const ALBUM_ART_CACHE_TTL_SECONDS = 7 * 24 * 60 * 60;
const ALBUM_ART_MISS_CACHE_TTL_SECONDS = 6 * 60 * 60;
const DEEZER_TRACK_ID_PATTERN = /^\d{1,20}$/;
const PLAYLIST_PROVIDER_PATTERN = /^[a-z][a-z0-9-]{0,31}$/;
const PLAYLIST_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const matchesDomain = (hostname: string, domain: string): boolean => {
  const lower = hostname.toLowerCase();
  return lower === domain || lower.endsWith(`.${domain}`);
};

const isAllowedPreviewHost = (hostname: string): boolean =>
  ALLOWED_PREVIEW_HOSTS.some((domain) => matchesDomain(hostname, domain));

const isAllowedImageHost = (hostname: string): boolean => {
  const normalized = hostname
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '');
  if (
    !normalized ||
    net.isIP(normalized) ||
    isLocalOrPrivateAddress(normalized)
  ) {
    return false;
  }
  return ALLOWED_IMAGE_HOSTS.some((domain) =>
    matchesDomain(normalized, domain)
  );
};

const extractHeader = (headers: unknown, name: string): string | undefined => {
  if (!headers || typeof headers !== 'object') return undefined;
  const record = headers as Record<string, unknown> & {
    get?: (headerName: string) => unknown;
  };
  const lower = name.toLowerCase();
  const matchedKey = Object.keys(record).find((k) => k.toLowerCase() === lower);
  const raw =
    (typeof record.get === 'function' ? record.get(lower) : undefined) ??
    (matchedKey ? record[matchedKey] : undefined);
  const first = Array.isArray(raw) ? raw[0] : raw;
  return typeof first === 'string' ? first : undefined;
};

const toBuffer = (data: unknown): Buffer | null => {
  if (Buffer.isBuffer(data)) return data;
  if (data instanceof ArrayBuffer) return Buffer.from(new Uint8Array(data));
  if (ArrayBuffer.isView(data)) {
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  }
  if (typeof data === 'string') return Buffer.from(data, 'binary');
  return null;
};

const extractAudioBuffer = (response: {
  status: number;
  headers: unknown;
  data: unknown;
}): Buffer | null => {
  if (response.status !== 200) {
    return null;
  }

  const contentType = extractHeader(response.headers, 'content-type')
    ?.split(';', 1)[0]
    .trim()
    .toLowerCase();
  if (
    contentType &&
    (contentType.startsWith('text/') || contentType === 'application/json')
  ) {
    return null;
  }

  const buffer = toBuffer(response.data);
  if (!buffer || buffer.length === 0) {
    return null;
  }
  if (buffer.length > MAX_PREVIEW_BYTES) {
    throw new Error('Preview audio exceeds maximum allowed size.');
  }
  return buffer;
};

const isPassThroughImageContentType = (contentType: string): boolean =>
  /^image\/[a-z0-9.+-]+$/i.test(contentType) && contentType !== 'image/svg+xml';

const toIsoTimestamp = (value: unknown): string | null => {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (/^\d+$/.test(trimmed)) {
      const numeric = Number(trimmed);
      if (Number.isFinite(numeric) && numeric > 0) {
        const date = new Date(numeric);
        return Number.isNaN(date.getTime()) ? null : date.toISOString();
      }
      return null;
    }
    const date = new Date(trimmed);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  return null;
};

const boundedIdString = (
  value: unknown,
  maxLength = 128
): string | undefined => {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) {
    return String(value);
  }
  return boundedString(value, maxLength)?.trim() || undefined;
};

const parsePreviewDeezerId = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const match = value
    .trim()
    .match(/\/api\/deezer\/preview\/(\d{1,20})\.mp3(?:[?#]|$)/);
  return match?.[1] ?? null;
};

const getHttpErrorStatus = (error: unknown): number | undefined =>
  error && typeof error === 'object' && 'response' in error
    ? (error as { response?: { status?: number } }).response?.status
    : undefined;

const sanitizeMusicBrainzId = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const normalized = normalizeMusicBrainzId(value);
  return normalized && isValidMusicBrainzResourceId(normalized)
    ? normalized
    : null;
};

const normalizePrimaryType = (value: unknown): string => {
  if (typeof value !== 'string') return 'Album';
  const trimmed = value.trim();
  if (!trimmed) return 'Album';
  const lower = trimmed.toLowerCase();
  if (lower === 'single') return 'Single';
  if (lower === 'ep') return 'EP';
  if (lower === 'album') return 'Album';
  return trimmed.slice(0, 64);
};

export const sanitizeAurralImageUrl = (value: unknown): string | null => {
  const raw = boundedString(value, 2048)?.trim();
  if (!raw) return null;

  let candidate = raw;
  const proxyMatch = raw.match(/^\/api\/image-proxy\?src=([^&]+)/i);
  if (proxyMatch?.[1]) {
    try {
      candidate = decodeURIComponent(proxyMatch[1]);
    } catch {
      return null;
    }
  }

  try {
    const parsed = new URL(candidate);
    if (
      parsed.protocol === 'http:' &&
      matchesDomain(parsed.hostname, 'coverartarchive.org')
    ) {
      parsed.protocol = 'https:';
    }
    if (
      parsed.protocol !== 'https:' ||
      parsed.username ||
      parsed.password ||
      parsed.port ||
      !isAllowedImageHost(parsed.hostname)
    ) {
      return null;
    }
    return parsed.href;
  } catch {
    return null;
  }
};

const normalizeArtistItem = (
  entry: unknown
): AurralNormalizedArtist | undefined => {
  if (!isRecord(entry)) return undefined;
  const name = boundedString(entry.name, 512)?.trim();
  if (!name) return undefined;

  const mbid =
    sanitizeMusicBrainzId(entry.mbid) ??
    sanitizeMusicBrainzId(entry.artistMbid) ??
    sanitizeMusicBrainzId(entry.id);

  return {
    mbid,
    name,
    image: sanitizeAurralImageUrl(entry.image ?? entry.imageUrl),
    inLibrary: entry.inLibrary === true,
  };
};

const normalizeAlbumItem = (
  entry: unknown
): AurralNormalizedAlbum | undefined => {
  if (!isRecord(entry)) return undefined;
  const title = boundedString(entry.title ?? entry.name, 512)?.trim();
  if (!title) return undefined;

  const creditName =
    Array.isArray(entry['artist-credit']) && isRecord(entry['artist-credit'][0])
      ? entry['artist-credit'][0].name
      : undefined;
  const artistName =
    boundedString(
      entry.artistName ??
        entry.albumArtist ??
        entry.album_artist ??
        (typeof entry.artist === 'string' ? entry.artist : undefined) ??
        creditName,
      512
    )?.trim() ?? '';
  const mbid =
    sanitizeMusicBrainzId(entry.releaseGroupMbid ?? entry.release_group_mbid) ??
    sanitizeMusicBrainzId(entry.albumMbid ?? entry.album_mbid) ??
    sanitizeMusicBrainzId(entry.mbid) ??
    sanitizeMusicBrainzId(entry.id);

  return {
    mbid,
    title,
    artistName,
    artistMbid: sanitizeMusicBrainzId(entry.artistMbid ?? entry.artist_mbid),
    primaryType: normalizePrimaryType(
      entry.primaryType ?? entry['primary-type']
    ),
    releaseDate:
      boundedString(
        entry.releaseDate ?? entry['first-release-date'],
        64
      )?.trim() ?? null,
    coverUrl: sanitizeAurralImageUrl(
      entry.coverUrl ?? entry.largeArtworkUrl ?? entry.artworkUrl
    ),
    inLibrary: entry.inLibrary === true || entry.status === 'available',
  };
};

const normalizeTrackItem = (
  entry: unknown
): AurralNormalizedTrack | undefined => {
  if (!isRecord(entry)) return undefined;
  const title = boundedString(entry.title ?? entry.trackName, 512)?.trim();
  if (!title) return undefined;

  const artistName =
    boundedString(entry.artistName ?? entry.artist_name, 512)?.trim() ?? '';
  const durationMs =
    positiveInteger(entry.durationMs ?? entry.duration_ms) ?? null;

  return {
    title,
    artistName,
    artistMbid: sanitizeMusicBrainzId(entry.artistMbid ?? entry.artist_mbid),
    albumTitle:
      boundedString(
        entry.albumTitle ?? entry.albumName ?? entry.album_name,
        512
      )?.trim() ?? null,
    albumMbid: sanitizeMusicBrainzId(
      entry.albumMbid ??
        entry.album_mbid ??
        entry.releaseGroupMbid ??
        entry.release_group_mbid
    ),
    durationMs,
    coverUrl: sanitizeAurralImageUrl(
      entry.coverUrl ?? entry.largeArtworkUrl ?? entry.artworkUrl
    ),
    previewDeezerId: parsePreviewDeezerId(entry.preview_url),
    inLibrary: entry.inLibrary === true,
  };
};

const normalizeTopResult = (
  entry: unknown
): AurralNormalizedTopResult | null => {
  if (!isRecord(entry)) return null;
  const type = boundedString(entry.type, 32)?.toLowerCase();
  if (type === 'artist') {
    const normalized = normalizeArtistItem(entry);
    return normalized ? { type: 'artist', ...normalized } : null;
  }
  if (type === 'album') {
    const normalized = normalizeAlbumItem(entry);
    return normalized ? { type: 'album', ...normalized } : null;
  }
  if (type === 'track') {
    const normalized = normalizeTrackItem(entry);
    return normalized ? { type: 'track', ...normalized } : null;
  }
  return null;
};

const normalizeLibraryAlbumEntry = (
  entry: unknown
): AurralLibraryAlbumEntry | undefined => {
  if (!isRecord(entry)) return undefined;
  const id = positiveInteger(entry.id);
  const title = boundedString(entry.title, 512)?.trim();
  if (id === undefined || !title) return undefined;

  return {
    id,
    title,
    artistName:
      boundedString(
        entry.albumArtist ?? entry.album_artist ?? entry.artistName,
        512
      )?.trim() ?? null,
    mbid: sanitizeMusicBrainzId(entry.mbid),
    releaseGroupMbid: sanitizeMusicBrainzId(
      entry.releaseGroupMbid ?? entry.release_group_mbid
    ),
    releaseDate:
      boundedString(entry.releaseDate ?? entry.release_date, 64)?.trim() ??
      null,
    addedAt: toIsoTimestamp(entry.createdAt ?? entry.addedAt),
    trackCount: boundedInteger(entry.trackCount) ?? 0,
    availableTrackCount: boundedInteger(entry.availableTrackCount) ?? 0,
    coverUrl: `/api/v1/music/library-art/albums/${id}`,
  };
};

const normalizeLibraryArtistEntry = (
  entry: unknown
): AurralLibraryArtistEntry | undefined => {
  if (!isRecord(entry)) return undefined;
  const id = positiveInteger(entry.id);
  const name = boundedString(entry.name, 512)?.trim();
  if (id === undefined || !name) return undefined;

  return {
    id,
    name,
    mbid: sanitizeMusicBrainzId(entry.mbid),
    albumCount: boundedInteger(entry.albumCount) ?? 0,
    trackCount: boundedInteger(entry.trackCount) ?? 0,
    coverUrl: `/api/v1/music/library-art/artists/${id}`,
  };
};

// Lumen builds artist links from these, so only real MusicBrainz IDs pass.
const MBID_FORMAT =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const strictMusicBrainzId = (value: string | null | undefined) =>
  value && MBID_FORMAT.test(value) ? value : null;

const normalizeRecommendedArtist = (
  entry: unknown
): AurralRecommendedArtist | undefined => {
  if (!isRecord(entry)) return undefined;
  const name = boundedString(entry.name, 512)?.trim();
  if (!name) return undefined;

  return {
    mbid: strictMusicBrainzId(
      sanitizeMusicBrainzId(entry.mbid) ??
        sanitizeMusicBrainzId(entry.artistMbid) ??
        sanitizeMusicBrainzId(entry.id)
    ),
    name,
    image: sanitizeAurralImageUrl(entry.image ?? entry.imageUrl),
    because: boundedString(entry.sourceArtist, 512)?.trim() ?? null,
    matchPercent:
      typeof entry.matchPercent === 'number' &&
      Number.isFinite(entry.matchPercent)
        ? entry.matchPercent
        : null,
  };
};

const normalizeTrendingGlobalArtist = (
  entry: unknown
): AurralTrendingGlobalArtist | undefined => {
  if (!isRecord(entry)) return undefined;
  const name = boundedString(entry.name, 512)?.trim();
  if (!name) return undefined;

  return {
    mbid: strictMusicBrainzId(
      sanitizeMusicBrainzId(entry.mbid) ??
        sanitizeMusicBrainzId(entry.artistMbid) ??
        sanitizeMusicBrainzId(entry.id)
    ),
    name,
    image: sanitizeAurralImageUrl(entry.image ?? entry.imageUrl),
    label: boundedString(entry.popularityLabel, 256)?.trim() ?? null,
  };
};

const normalizePlaylistSummary = (
  entry: unknown
): AurralPlaylistSummary | undefined => {
  if (!isRecord(entry)) return undefined;
  const id = boundedIdString(entry.id, 128);
  const name = boundedString(entry.name, 512)?.trim();
  const provider = boundedString(entry.provider, 64)?.trim();
  if (!id || !name || !provider) return undefined;
  // Only list playlists the detail route can open.
  if (
    !PLAYLIST_PROVIDER_PATTERN.test(provider) ||
    !PLAYLIST_ID_PATTERN.test(id)
  )
    return undefined;

  return {
    id,
    name,
    curator: boundedString(entry.curator, 256)?.trim() ?? null,
    trackCount: boundedInteger(entry.trackCount) ?? null,
    artworkUrl: sanitizeAurralImageUrl(entry.artworkUrl),
    provider,
  };
};

const normalizePlaylistTrack = (
  entry: unknown
): AurralPlaylistTrack | undefined => {
  if (!isRecord(entry)) return undefined;
  const title = boundedString(entry.trackName ?? entry.title, 512)?.trim();
  if (!title) return undefined;

  return {
    title,
    artistName: boundedString(entry.artistName, 512)?.trim() ?? '',
    albumTitle:
      boundedString(entry.albumName ?? entry.albumTitle, 512)?.trim() ?? null,
    albumMbid: sanitizeMusicBrainzId(entry.albumMbid),
    artistMbid: sanitizeMusicBrainzId(entry.artistMbid),
    durationMs: positiveInteger(entry.durationMs) ?? null,
    coverUrl: sanitizeAurralImageUrl(entry.artworkUrl ?? entry.coverUrl),
    previewDeezerId: parsePreviewDeezerId(entry.preview_url),
    inLibrary: entry.owned === true,
  };
};

const parseArtistYear = (value: unknown): number | null => {
  if (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value > 0 &&
    value <= 9999
  ) {
    return value;
  }
  if (typeof value !== 'string') {
    return null;
  }
  const match = value.trim().match(/^(\d{4})(?:\D|$)/);
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  return Number.isSafeInteger(year) && year > 0 ? year : null;
};

const parseArtistSortDate = (value: unknown): string | null => {
  if (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value > 0 &&
    value <= 9999
  ) {
    return `${String(value).padStart(4, '0')}-00-00`;
  }
  if (typeof value !== 'string') {
    return null;
  }
  const match = value
    .trim()
    .match(/^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?(?:\D|$)/);
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  if (!Number.isSafeInteger(year) || year <= 0) {
    return null;
  }
  return `${match[1]}-${match[2] ?? '00'}-${match[3] ?? '00'}`;
};

const normalizeArtistReleaseGroupPrimaryType = (
  value: unknown
): AurralArtistReleaseGroupPrimaryType => {
  if (typeof value !== 'string') return 'Other';
  switch (value.trim().toLowerCase()) {
    case 'album':
      return 'Album';
    case 'ep':
      return 'EP';
    case 'single':
      return 'Single';
    default:
      return 'Other';
  }
};

const extractArtistTagName = (entry: unknown): string | undefined => {
  if (typeof entry === 'string') {
    return boundedString(entry, 128)?.trim() || undefined;
  }
  if (isRecord(entry)) {
    return boundedString(entry.name, 128)?.trim() || undefined;
  }
  return undefined;
};

const MUSICBRAINZ_RELEASE_STATUSES = new Set([
  'official',
  'promotion',
  'bootleg',
  'pseudo-release',
  'withdrawn',
  'cancelled',
]);

const normalizeArtistDetails = (
  response: Record<string, unknown>,
  fallbackMbid: string
): AurralArtistDetails => {
  const lifeSpan = isRecord(response['life-span'])
    ? response['life-span']
    : isRecord(response.lifeSpan)
      ? response.lifeSpan
      : undefined;

  const rawGenreEntries = [
    ...(Array.isArray(response.genres) ? response.genres : []),
    ...(Array.isArray(response.tags) ? response.tags : []),
  ];
  const seenGenres = new Set<string>();
  const genres: string[] = [];
  for (const entry of rawGenreEntries) {
    const tagName = extractArtistTagName(entry);
    if (!tagName) continue;
    const key = tagName.toLowerCase();
    if (seenGenres.has(key)) continue;
    seenGenres.add(key);
    genres.push(tagName);
    if (genres.length >= MAX_ARTIST_GENRES) break;
  }

  const trimmedBio =
    typeof response.bio === 'string' ? response.bio.trim() : '';
  const bio = trimmedBio ? trimmedBio.slice(0, MAX_ARTIST_BIO_LENGTH) : null;

  const rawReleaseGroups = Array.isArray(response['release-groups'])
    ? response['release-groups']
    : Array.isArray(response.releaseGroups)
      ? response.releaseGroups
      : [];
  const seenReleaseGroupIds = new Set<string>();
  const releaseGroupEntries: {
    group: AurralArtistReleaseGroup;
    sortDate: string | null;
    index: number;
  }[] = [];
  for (const rawGroup of rawReleaseGroups) {
    if (!isRecord(rawGroup)) continue;
    const id = strictMusicBrainzId(sanitizeMusicBrainzId(rawGroup.id));
    if (!id || seenReleaseGroupIds.has(id)) continue;
    const title = boundedString(rawGroup.title, 512)?.trim();
    if (!title) continue;
    seenReleaseGroupIds.add(id);

    const rawSecondaryTypes =
      rawGroup['secondary-types'] ?? rawGroup.secondaryTypes;
    const secondaryTypes = Array.isArray(rawSecondaryTypes)
      ? rawSecondaryTypes
          .map((type) => boundedString(type, 64)?.trim())
          .filter((type): type is string => Boolean(type))
      : [];
    const rawReleaseDate =
      rawGroup['first-release-date'] ?? rawGroup.firstReleaseDate;
    // only MusicBrainz release statuses: any other "status" (a download or
    // library state) must not make a release look unofficial
    const rawStatuses =
      rawGroup.releaseStatuses ?? rawGroup['release-statuses'];
    const releaseStatuses = Array.isArray(rawStatuses)
      ? rawStatuses
          .map((status) => boundedString(status, 64)?.trim())
          .filter((status): status is string =>
            Boolean(
              status && MUSICBRAINZ_RELEASE_STATUSES.has(status.toLowerCase())
            )
          )
          .slice(0, 8)
      : [];
    const rawCredit = rawGroup['artist-credit'] ?? rawGroup.artistCredit;
    const artistCreditIds = Array.isArray(rawCredit)
      ? rawCredit
          .map((credit) =>
            isRecord(credit) && isRecord(credit.artist)
              ? strictMusicBrainzId(sanitizeMusicBrainzId(credit.artist.id))
              : null
          )
          .filter((creditId): creditId is string => Boolean(creditId))
          .slice(0, 16)
      : [];

    releaseGroupEntries.push({
      group: {
        id,
        title,
        year: parseArtistYear(rawReleaseDate),
        primaryType: normalizeArtistReleaseGroupPrimaryType(
          rawGroup['primary-type'] ?? rawGroup.primaryType
        ),
        secondaryTypes,
        coverUrl: sanitizeAurralImageUrl(rawGroup.coverUrl),
        ...(releaseStatuses.length ? { releaseStatuses } : {}),
        ...(artistCreditIds.length ? { artistCreditIds } : {}),
      },
      sortDate: parseArtistSortDate(rawReleaseDate),
      index: releaseGroupEntries.length,
    });
  }

  releaseGroupEntries.sort((a, b) => {
    if (a.sortDate !== null && b.sortDate !== null) {
      if (a.sortDate !== b.sortDate) {
        return a.sortDate < b.sortDate ? 1 : -1;
      }
      return a.index - b.index;
    }
    if (a.sortDate !== null) return -1;
    if (b.sortDate !== null) return 1;
    return a.index - b.index;
  });

  return {
    mbid:
      strictMusicBrainzId(sanitizeMusicBrainzId(response.id)) ?? fallbackMbid,
    name: boundedString(response.name, 512)?.trim() ?? '',
    type: boundedString(response.type, 64)?.trim() || null,
    country: boundedString(response.country, 64)?.trim() || null,
    beginYear: parseArtistYear(lifeSpan?.begin),
    endYear: parseArtistYear(lifeSpan?.end),
    genres,
    bio,
    releaseGroups: capReleaseGroups(releaseGroupEntries).map(
      (entry) => entry.group
    ),
  };
};

export const collectLibraryReleaseGroupMbids = (
  items: unknown,
  output: Set<string>,
  partialOutput?: Set<string>
): void => {
  if (!Array.isArray(items)) return;
  for (const item of items) {
    if (typeof item === 'string') {
      const id = strictMusicBrainzId(sanitizeMusicBrainzId(item));
      if (id) output.add(id);
      continue;
    }
    if (!isRecord(item)) continue;

    const trackCount = boundedInteger(item.trackCount);
    const availableTrackCount = boundedInteger(item.availableTrackCount);
    const hasPartialTracks =
      availableTrackCount !== undefined &&
      availableTrackCount > 0 &&
      trackCount !== undefined &&
      trackCount > 0 &&
      availableTrackCount < trackCount;
    const isFullByCounts =
      availableTrackCount !== undefined &&
      availableTrackCount > 0 &&
      (!trackCount || availableTrackCount >= trackCount);
    const isExplicitAvailable =
      item.inLibrary === true ||
      item.available === true ||
      item.status === 'available';
    const isOwned =
      !hasPartialTracks && (isFullByCounts || isExplicitAvailable);
    const isPartial =
      !isOwned && (hasPartialTracks || item.status === 'partial');

    const target = isOwned ? output : isPartial ? partialOutput : undefined;
    if (!target) continue;

    const nestedRg = isRecord(item.releaseGroup)
      ? item.releaseGroup
      : isRecord(item.release_group)
        ? item.release_group
        : undefined;
    const candidates = [
      item.releaseGroupMbid,
      item.release_group_mbid,
      item.releaseGroupId,
      item.release_group_id,
      item.mbid,
      item.albumMbid,
      item.album_mbid,
      item.id,
      nestedRg?.id,
      nestedRg?.mbid,
    ];
    for (const candidate of candidates) {
      const id = strictMusicBrainzId(sanitizeMusicBrainzId(candidate));
      if (id) target.add(id);
    }
  }
};

class AurralAPI extends ExternalAPI {
  public static buildUrl(
    settings: {
      hostname: string;
      port: number;
      useSsl?: boolean;
      baseUrl?: string;
    },
    path?: string
  ): string {
    return buildServiceUrl({
      useSsl: settings.useSsl,
      hostname: settings.hostname,
      port: settings.port,
      urlBase: settings.baseUrl,
      path,
    });
  }

  constructor({ url, apiKey }: { url: string; apiKey: string }) {
    super(
      url,
      {},
      {
        headers: {
          'X-Api-Key': apiKey,
        },
        allowPrivateAddresses: true,
        nodeCache: cacheManager.getCache('aurral').data,
      }
    );
  }

  public async testConnection(): Promise<AurralHealthResponse> {
    const response = await this.get<unknown>('/api/health', {}, 0);
    if (!isRecord(response)) {
      throw new Error('Aurral returned an invalid health response.');
    }

    const appVersion = boundedString(response.appVersion, 128);
    if (!appVersion) {
      throw new Error('Aurral health response is missing appVersion.');
    }

    const rawUser = isRecord(response.user) ? response.user : undefined;
    const username = rawUser ? boundedString(rawUser.username, 256) : undefined;
    const user: AurralHealthUser | null = username
      ? {
          id: boundedInteger(rawUser?.id),
          username,
          role: boundedString(rawUser?.role, 64),
        }
      : null;

    return {
      status: boundedString(response.status, 64),
      appVersion,
      user,
    };
  }

  public async requestAlbum(
    payload: AurralRequestAlbumPayload
  ): Promise<AurralRequestAlbumResult> {
    const response = await this.post<unknown>(
      '/api/library/albums/request',
      {
        albumMbid: payload.albumMbid,
        albumName: payload.albumName,
        artistMbid: payload.artistMbid,
        artistName: payload.artistName,
        ...(payload.releaseMbid ? { releaseMbid: payload.releaseMbid } : {}),
      },
      { timeout: REQUEST_TIMEOUT_MS }
    );

    if (!isRecord(response) || !isRecord(response.album)) {
      throw new Error('Aurral returned an invalid album request response.');
    }

    const albumId = positiveInteger(response.album.id);
    if (albumId === undefined) {
      throw new Error(
        'Aurral album request response did not include album.id.'
      );
    }

    const artistRecord = isRecord(response.artist)
      ? {
          id: positiveInteger(response.artist.id) ?? 0,
          mbid: boundedString(response.artist.mbid, 128),
          name: boundedString(response.artist.name, 512),
        }
      : undefined;

    return {
      success: response.success !== false,
      ...(artistRecord ? { artist: artistRecord } : {}),
      album: {
        id: albumId,
        mbid: boundedString(response.album.mbid, 128),
        releaseGroupMbid: boundedString(
          response.album.releaseGroupMbid ?? response.album.release_group_mbid,
          128
        ),
        title: boundedString(response.album.title, 512),
      },
      status: boundedString(response.status, 64) ?? 'queued',
      jobIds: Array.isArray(response.jobIds)
        ? response.jobIds
            .map((id) => boundedString(id, 128))
            .filter((id): id is string => !!id)
        : undefined,
      requestGroupId:
        typeof response.requestGroupId === 'string'
          ? response.requestGroupId.slice(0, 128)
          : null,
      queued:
        typeof response.queued === 'boolean' ? response.queued : undefined,
    };
  }

  public async getAlbumStatus(
    albumId: number
  ): Promise<AurralAlbumStatusResponse> {
    const response = await this.get<unknown>(
      `/api/library/albums/${albumId}/status`,
      {},
      0
    );
    if (!isRecord(response)) {
      throw new Error('Aurral returned an invalid album status response.');
    }

    const counts = isRecord(response.counts)
      ? {
          totalTracks: boundedInteger(
            response.counts.total ?? response.counts.totalTracks
          ),
          ownedTracks: boundedInteger(
            response.counts.available ?? response.counts.ownedTracks
          ),
          missingTracks: boundedInteger(
            response.counts.missing ?? response.counts.missingTracks
          ),
        }
      : undefined;

    return {
      libraryId: positiveInteger(response.libraryId) ?? albumId,
      releaseDate:
        typeof response.releaseDate === 'string'
          ? response.releaseDate.slice(0, 64)
          : null,
      status:
        (boundedString(response.status, 64) as AurralAlbumDownloadStatus) ??
        'missing',
      counts,
      recovery: response.recovery,
      requestGroupId:
        typeof response.requestGroupId === 'string'
          ? response.requestGroupId.slice(0, 128)
          : null,
    };
  }

  public async lookupAlbums(
    mbids: string[]
  ): Promise<Record<string, AurralAlbumLookupItem | null>> {
    const uniqueMbids = [
      ...new Set(mbids.map((id) => id.trim()).filter(Boolean)),
    ];
    if (uniqueMbids.length === 0) {
      return {};
    }

    const merged: Record<string, AurralAlbumLookupItem | null> = {};
    for (let offset = 0; offset < uniqueMbids.length; offset += 100) {
      const batch = uniqueMbids.slice(offset, offset + 100);
      const response = await this.post<unknown>(
        '/api/library/albums/lookup/batch',
        { mbids: batch }
      );
      if (!isRecord(response)) {
        continue;
      }

      for (const [key, rawItem] of Object.entries(response)) {
        if (rawItem === null) {
          merged[key] = null;
          continue;
        }
        if (!isRecord(rawItem)) {
          continue;
        }
        const libraryAlbumId = positiveInteger(rawItem.libraryAlbumId);
        if (libraryAlbumId === undefined) {
          continue;
        }
        merged[key] = {
          inLibrary: rawItem.inLibrary !== false,
          libraryAlbumId,
          libraryArtistId: positiveInteger(rawItem.libraryArtistId),
          status: boundedString(rawItem.status, 64) ?? 'partial',
          monitored:
            typeof rawItem.monitored === 'boolean'
              ? rawItem.monitored
              : undefined,
          managed:
            typeof rawItem.managed === 'boolean' ? rawItem.managed : undefined,
          trackListComplete:
            typeof rawItem.trackListComplete === 'boolean'
              ? rawItem.trackListComplete
              : undefined,
          percentOfTracks:
            typeof rawItem.percentOfTracks === 'number' &&
            Number.isFinite(rawItem.percentOfTracks)
              ? rawItem.percentOfTracks
              : undefined,
          sizeOnDisk: boundedInteger(rawItem.sizeOnDisk),
          trackCount: boundedInteger(rawItem.trackCount),
          trackFileCount: boundedInteger(rawItem.trackFileCount),
          ownedTrackMbids: Array.isArray(rawItem.ownedTrackMbids)
            ? rawItem.ownedTrackMbids
                .map((id) => boundedString(id, 128))
                .filter((id): id is string => !!id)
            : [],
          albumName: boundedString(rawItem.albumName, 512),
          releaseDate:
            typeof rawItem.releaseDate === 'string'
              ? rawItem.releaseDate.slice(0, 64)
              : null,
        };
      }
    }

    return merged;
  }

  public async requestTrack(
    payload: AurralRequestTrackPayload
  ): Promise<AurralRequestTrackResult> {
    const response = await this.post<unknown>(
      '/api/library/downloads/track',
      {
        artistName: payload.artistName,
        trackName: payload.trackName,
        ...(payload.albumName ? { albumName: payload.albumName } : {}),
        ...(payload.artistMbid ? { artistMbid: payload.artistMbid } : {}),
        ...(payload.albumMbid ? { albumMbid: payload.albumMbid } : {}),
        ...(payload.releaseMbid ? { releaseMbid: payload.releaseMbid } : {}),
        ...(payload.trackMbid ? { trackMbid: payload.trackMbid } : {}),
        ...(typeof payload.durationMs === 'number' &&
        Number.isFinite(payload.durationMs) &&
        payload.durationMs > 0
          ? { durationMs: Math.round(payload.durationMs) }
          : {}),
        ...(typeof payload.trackNumber === 'number' &&
        Number.isSafeInteger(payload.trackNumber) &&
        payload.trackNumber > 0
          ? { trackNumber: payload.trackNumber }
          : {}),
        ...(typeof payload.discNumber === 'number' &&
        Number.isSafeInteger(payload.discNumber) &&
        payload.discNumber > 0
          ? { discNumber: payload.discNumber }
          : {}),
      },
      { timeout: REQUEST_TIMEOUT_MS }
    );

    if (!isRecord(response)) {
      throw new Error('Aurral returned an invalid track request response.');
    }

    return {
      success: response.success !== false,
      alreadyOwned: response.alreadyOwned === true,
      queued: response.queued === true,
      jobId: boundedString(response.jobId, 128),
      reused: response.reused === true,
      alreadyQueued: response.alreadyQueued === true,
      monitored:
        typeof response.monitored === 'boolean'
          ? response.monitored
          : undefined,
    };
  }

  public async getActiveDownloads(): Promise<AurralActiveDownloadsResponse> {
    const response = await this.get<unknown>(
      '/api/library/downloads/active',
      {},
      0
    );
    if (!isRecord(response)) {
      return { albums: [], artists: [], tracks: [] };
    }

    return {
      albums: Array.isArray(response.albums)
        ? response.albums
            .map((id) => boundedString(id, 128))
            .filter((id): id is string => !!id)
        : [],
      artists: Array.isArray(response.artists)
        ? response.artists
            .map((id) => boundedString(id, 128))
            .filter((id): id is string => !!id)
        : [],
      tracks: Array.isArray(response.tracks)
        ? response.tracks.flatMap((entry) => {
            if (!isRecord(entry)) return [];
            const artistName = boundedString(entry.artistName, 512) ?? '';
            const trackName = boundedString(entry.trackName, 512) ?? '';
            if (!artistName && !trackName) return [];
            return [
              {
                mbid: boundedString(entry.mbid, 128) ?? null,
                artistName,
                trackName,
              },
            ];
          })
        : [],
    };
  }

  public async getActivity(): Promise<AurralActivityItem[]> {
    const response = await this.get<unknown>('/api/requests', {}, 0);
    const items = Array.isArray(response)
      ? response
      : isRecord(response) && Array.isArray(response.items)
        ? response.items
        : [];

    return items.flatMap((item): AurralActivityItem[] => {
      if (!isRecord(item)) return [];
      const id = boundedIdString(item.id, 128);
      const status = boundedString(item.status, 64)?.trim();
      if (!id || !status) return [];
      const rawCause = isRecord(item.cause) ? item.cause : null;
      const causeKind = rawCause
        ? boundedString(rawCause.kind, 64)?.trim()
        : undefined;
      const cause: AurralActivityCause | null = causeKind
        ? {
            kind: causeKind,
            name: boundedString(rawCause?.name, 512)?.trim() ?? null,
          }
        : null;
      return [
        {
          id,
          source: boundedString(item.source, 64)?.trim(),
          type: boundedString(item.type, 64),
          title: boundedString(item.title, 512),
          subtitle: boundedString(item.subtitle, 512) ?? null,
          status,
          statusLabel: boundedString(item.statusLabel, 256)?.trim(),
          requestedAt: boundedString(item.requestedAt, 64)?.trim(),
          completedAt: boundedString(item.completedAt, 64)?.trim() ?? null,
          kind: boundedString(item.kind, 64),
          jobId: boundedString(item.jobId, 128) ?? null,
          trackName: boundedString(item.trackName, 512) ?? null,
          artistName: boundedString(item.artistName, 512) ?? null,
          albumName: boundedString(item.albumName, 512) ?? null,
          albumMbid: boundedString(item.albumMbid, 128) ?? null,
          albumId: boundedInteger(item.albumId) ?? null,
          libraryAlbumId: boundedInteger(item.libraryAlbumId) ?? null,
          requestGroupId: boundedString(item.requestGroupId, 128) ?? null,
          requestedBy: boundedString(item.requestedBy, 256) ?? null,
          inQueue: typeof item.inQueue === 'boolean' ? item.inQueue : undefined,
          cause,
        },
      ];
    });
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
    if (!AURRAL_LIBRARY_KINDS.includes(kind)) {
      throw new Error('Aurral library kind must be albums or artists.');
    }
    if (!AURRAL_LIBRARY_SORTS.includes(sort)) {
      throw new Error('Aurral library sort value is invalid.');
    }
    if (!Number.isSafeInteger(page) || page < 1) {
      throw new Error('Aurral library page must be a positive integer.');
    }
    if (
      !Number.isSafeInteger(pageSize) ||
      pageSize < 1 ||
      pageSize > MAX_LIBRARY_PAGE_SIZE
    ) {
      throw new Error(
        `Aurral library pageSize must be between 1 and ${MAX_LIBRARY_PAGE_SIZE}.`
      );
    }

    const filter = query?.trim().slice(0, MAX_LIBRARY_QUERY_LENGTH);
    const response = await this.get<unknown>(
      '/api/library',
      {
        params: {
          kind,
          page,
          pageSize,
          sort,
          // Aurral matches album, artist and song names
          ...(filter ? { query: filter } : {}),
          // the page comes back as albums/artists only (no duplicate `items`
          // list, no genre stats): about half the JSON for Aurral to write
          compact: 'true',
        },
      },
      0
    );

    const record = isRecord(response) ? response : undefined;
    const rawItems = record
      ? Array.isArray(record.items)
        ? record.items
        : kind === 'albums' && Array.isArray(record.albums)
          ? record.albums
          : kind === 'artists' && Array.isArray(record.artists)
            ? record.artists
            : []
      : [];

    const resolvedPage = (record && positiveInteger(record.page)) ?? page;
    const resolvedPageSize =
      (record && positiveInteger(record.pageSize)) ?? pageSize;
    const hasMore = record?.hasMore === true;

    if (kind === 'artists') {
      const items = rawItems
        .map(normalizeLibraryArtistEntry)
        .filter((item): item is AurralLibraryArtistEntry => Boolean(item));
      return {
        kind: 'artists',
        page: resolvedPage,
        pageSize: resolvedPageSize,
        total: (record && boundedInteger(record.total)) ?? items.length,
        hasMore,
        items,
      };
    }

    const items = rawItems
      .map(normalizeLibraryAlbumEntry)
      .filter((item): item is AurralLibraryAlbumEntry => Boolean(item));
    return {
      kind: 'albums',
      page: resolvedPage,
      pageSize: resolvedPageSize,
      total: (record && boundedInteger(record.total)) ?? items.length,
      hasMore,
      items,
    };
  }

  /**
   * One page of the library's albums with their song counts, for the owned-
   * album index (the same read the Library tab shows).
   */
  public async getLibraryAlbumPage(
    page: number,
    pageSize: number,
    sort: 'album' | 'newest'
  ): Promise<Extract<AurralLibraryPage, { kind: 'albums' }>> {
    return this.getLibraryPage('albums', sort, page, pageSize);
  }

  /**
   * One page of the library's available songs (title + artist). A song on a
   * compilation keeps its own artist; one without falls back to its album's.
   */
  public async getLibraryTrackPage(
    page: number,
    pageSize: number,
    sort: 'name' | 'newest'
  ): Promise<AurralLibraryTrackPage> {
    if (!Number.isSafeInteger(page) || page < 1) {
      throw new Error('Aurral library page must be a positive integer.');
    }
    const size = Math.min(MAX_DISCOVERY_ITEMS * 2, Math.max(1, pageSize));
    const response = await this.get<unknown>(
      '/api/library',
      {
        params: {
          kind: 'tracks',
          page,
          pageSize: size,
          sort,
          availableOnly: 'true',
          // without the duplicate `items` list and the genre stats
          compact: 'true',
        },
      },
      0
    );
    if (!isRecord(response)) {
      throw new Error('Aurral returned an invalid library track page.');
    }
    const albumArtists = new Map<string, string>();
    if (Array.isArray(response.albums)) {
      for (const album of response.albums) {
        if (!isRecord(album)) continue;
        const id = boundedIdString(album.id, 64);
        const artistName = boundedString(album.artistName, 512)?.trim();
        if (id && artistName) albumArtists.set(id, artistName);
      }
    }
    const rawItems = Array.isArray(response.items)
      ? response.items
      : Array.isArray(response.tracks)
        ? response.tracks
        : [];
    const items = rawItems.flatMap((entry): AurralLibraryTrackEntry[] => {
      if (!isRecord(entry)) return [];
      const title = boundedString(entry.title, 512)?.trim();
      if (!title) return [];
      const firstAlbum =
        Array.isArray(entry.albums) && isRecord(entry.albums[0])
          ? boundedIdString(entry.albums[0].albumId, 64)
          : undefined;
      const artistName =
        boundedString(entry.artistName, 512)?.trim() ||
        (firstAlbum ? albumArtists.get(firstAlbum) : undefined) ||
        '';
      return artistName ? [{ title, artistName }] : [];
    });
    return {
      page: positiveInteger(response.page) ?? page,
      total: boundedInteger(response.total) ?? items.length,
      hasMore: response.hasMore === true,
      items,
    };
  }

  public async getLibraryArtwork(
    kind: AurralLibraryKind,
    id: number
  ): Promise<AurralLibraryArtwork | null> {
    if (!AURRAL_LIBRARY_KINDS.includes(kind)) {
      throw new Error('Aurral library artwork kind must be albums or artists.');
    }
    if (
      typeof id !== 'number' ||
      !Number.isSafeInteger(id) ||
      id < 1 ||
      id > MAX_LIBRARY_ART_ID
    ) {
      throw new Error(
        `Aurral library artwork id must be an integer between 1 and ${MAX_LIBRARY_ART_ID}.`
      );
    }

    const response = await this.request<ArrayBuffer>(
      'GET',
      `/api/library/${kind}/${id}/cover`,
      undefined,
      {
        responseType: 'arraybuffer',
        timeout: PREVIEW_DOWNLOAD_TIMEOUT_MS,
        maxContentLength: MAX_ARTWORK_BYTES,
        maxBodyLength: MAX_ARTWORK_BYTES,
        headers: { Accept: 'image/*' },
        validateStatus: (status) => status === 200 || status === 404,
      }
    );

    if (response.status !== 200) {
      return null;
    }

    const contentType = extractHeader(response.headers, 'content-type')
      ?.split(';', 1)[0]
      .trim()
      .toLowerCase();
    if (!contentType || !isPassThroughImageContentType(contentType)) {
      return null;
    }

    const buffer = toBuffer(response.data);
    if (!buffer || buffer.length === 0) {
      return null;
    }
    if (buffer.length > MAX_ARTWORK_BYTES) {
      throw new Error('Library artwork exceeds maximum allowed size.');
    }

    return { buffer, contentType };
  }

  public async getLibraryAlbumsPage(
    page = 1,
    pageSize = 100
  ): Promise<AurralLibraryAlbumsPage> {
    const response = await this.get<unknown>(
      '/api/library',
      {
        params: {
          kind: 'albums',
          page,
          pageSize,
        },
      },
      0
    );

    if (!isRecord(response)) {
      return {
        page,
        pageSize,
        total: 0,
        hasMore: false,
        items: [],
      };
    }

    const rawItems = Array.isArray(response.items)
      ? response.items
      : Array.isArray(response.albums)
        ? response.albums
        : [];

    const items: AurralLibraryAlbumItem[] = rawItems.flatMap((entry) => {
      if (!isRecord(entry)) return [];
      const id = positiveInteger(entry.id);
      if (id === undefined) return [];
      const rawCoverUrl =
        entry.coverUrl ??
        entry.cover_url ??
        entry.largeArtworkUrl ??
        entry.artworkUrl ??
        entry.image ??
        entry.imageUrl;
      return [
        {
          id,
          mbid: boundedString(entry.mbid, 128) ?? null,
          releaseGroupMbid:
            boundedString(
              entry.releaseGroupMbid ?? entry.release_group_mbid,
              128
            ) ?? null,
          title: boundedString(entry.title, 512),
          albumArtist:
            boundedString(entry.albumArtist ?? entry.album_artist, 512) ?? null,
          releaseDate:
            boundedString(entry.releaseDate ?? entry.release_date, 64) ?? null,
          monitored:
            typeof entry.monitored === 'boolean' ? entry.monitored : undefined,
          trackCount: boundedInteger(entry.trackCount),
          availableTrackCount: boundedInteger(entry.availableTrackCount),
          ...(rawCoverUrl !== undefined
            ? { coverUrl: sanitizeAurralImageUrl(rawCoverUrl) }
            : {}),
        },
      ];
    });

    return {
      page: positiveInteger(response.page) ?? page,
      pageSize: positiveInteger(response.pageSize) ?? pageSize,
      total: boundedInteger(response.total) ?? items.length,
      hasMore: response.hasMore === true,
      items,
    };
  }

  public async getPreviewLink(
    artist: string,
    track: string
  ): Promise<string | null> {
    if (typeof artist !== 'string' || typeof track !== 'string') {
      throw new Error('Aurral preview artist and track must be strings.');
    }
    const trimmedArtist = artist.trim();
    const trimmedTrack = track.trim();
    if (
      !trimmedArtist ||
      trimmedArtist.length > 256 ||
      !trimmedTrack ||
      trimmedTrack.length > 256
    ) {
      throw new Error(
        'Aurral preview artist and track must be between 1 and 256 characters.'
      );
    }

    const response = await this.request<unknown>(
      'GET',
      '/api/deezer/preview',
      undefined,
      {
        params: {
          artist: trimmedArtist,
          track: trimmedTrack,
        },
        maxRedirects: 0,
        validateStatus: (status) => status === 302 || status === 404,
      }
    );

    if (response.status !== 302) {
      return null;
    }

    const location = extractHeader(response.headers, 'location')?.trim();
    if (!location) {
      return null;
    }

    try {
      const parsed = new URL(location);
      if (
        parsed.protocol !== 'https:' ||
        parsed.username ||
        parsed.password ||
        !isAllowedPreviewHost(parsed.hostname)
      ) {
        return null;
      }
      return parsed.href;
    } catch {
      return null;
    }
  }

  public async downloadPreview(url: string): Promise<Buffer | null> {
    if (typeof url !== 'string' || !url.trim()) {
      throw new Error('Aurral preview URL must be a non-empty string.');
    }

    let parsed: URL;
    try {
      parsed = new URL(url.trim());
    } catch {
      throw new Error('Aurral preview URL is invalid.');
    }

    if (
      parsed.protocol !== 'https:' ||
      parsed.username ||
      parsed.password ||
      !isAllowedPreviewHost(parsed.hostname)
    ) {
      throw new Error('Aurral preview URL host is not allowed.');
    }

    const safeOptions = createSafeHttpRequestOptions(false, true);
    const baseBeforeRedirect = safeOptions.beforeRedirect;
    const response = await axios.get<ArrayBuffer>(parsed.href, {
      ...safeOptions,
      beforeRedirect: (options: Record<string, unknown>, res?: unknown) => {
        baseBeforeRedirect(options, res);
        const redirectHost =
          typeof options.hostname === 'string' ? options.hostname : '';
        if (
          options.protocol !== 'https:' ||
          !redirectHost ||
          !isAllowedPreviewHost(redirectHost)
        ) {
          throw new Error(
            'Refusing to follow preview redirect outside allow-list.'
          );
        }
      },
      responseType: 'arraybuffer',
      timeout: PREVIEW_DOWNLOAD_TIMEOUT_MS,
      maxContentLength: MAX_PREVIEW_BYTES,
      maxBodyLength: MAX_PREVIEW_BYTES,
      headers: { Accept: 'audio/mpeg, audio/*' },
      validateStatus: (status) => status === 200 || status === 404,
    });

    return extractAudioBuffer(response);
  }

  public async getDeezerPreviewClip(
    deezerTrackId: string
  ): Promise<Buffer | null> {
    if (
      typeof deezerTrackId !== 'string' ||
      !DEEZER_TRACK_ID_PATTERN.test(deezerTrackId.trim())
    ) {
      throw new Error('Aurral Deezer track ID must be 1 to 20 digits.');
    }

    const id = deezerTrackId.trim();
    const response = await this.request<ArrayBuffer>(
      'GET',
      `/api/deezer/preview/${id}.mp3?download`,
      undefined,
      {
        responseType: 'arraybuffer',
        timeout: PREVIEW_DOWNLOAD_TIMEOUT_MS,
        maxContentLength: MAX_PREVIEW_BYTES,
        maxBodyLength: MAX_PREVIEW_BYTES,
        maxRedirects: 0,
        headers: { Accept: 'audio/mpeg, audio/*' },
        validateStatus: (status) =>
          status === 200 || status === 302 || status === 404,
      }
    );

    if (response.status === 302) {
      const location = extractHeader(response.headers, 'location')?.trim();
      if (!location) {
        return null;
      }
      return this.downloadPreview(location);
    }

    return extractAudioBuffer(response);
  }

  public async searchUnified(
    query: string,
    limit = 12
  ): Promise<AurralUnifiedSearchResult> {
    if (typeof query !== 'string') {
      throw new Error('Aurral search query must be a string.');
    }
    const trimmedQuery = query.trim();
    if (!trimmedQuery || trimmedQuery.length > 256) {
      throw new Error(
        'Aurral search query must be between 1 and 256 characters.'
      );
    }
    const clampedLimit =
      typeof limit === 'number' && Number.isFinite(limit)
        ? Math.min(MAX_DISCOVERY_ITEMS, Math.max(1, Math.trunc(limit)))
        : 12;

    const requestConfig = {
      params: {
        q: trimmedQuery,
        limit: clampedLimit,
      },
    };
    const cached = this.getCached<unknown>(
      '/api/search/unified',
      requestConfig
    );
    const response =
      isRecord(cached) && cached.status === 'ok'
        ? cached
        : await this.get<unknown>('/api/search/unified', requestConfig, 0);

    if (!isRecord(response)) {
      this.removeCache('/api/search/unified', requestConfig.params);
      return {
        artists: [],
        albums: [],
        tracks: [],
        top: null,
        degraded: true,
      };
    }

    const degraded = response.status !== 'ok';
    if (degraded) {
      this.removeCache('/api/search/unified', requestConfig.params);
    } else if (!(isRecord(cached) && cached.status === 'ok')) {
      this.setCached(
        '/api/search/unified',
        response,
        SEARCH_CACHE_TTL_SECONDS,
        requestConfig
      );
    }

    const artists = Array.isArray(response.artists)
      ? response.artists
          .slice(0, MAX_DISCOVERY_ITEMS)
          .map(normalizeArtistItem)
          .filter((item): item is AurralNormalizedArtist => Boolean(item))
      : [];
    const albums = Array.isArray(response.albums)
      ? response.albums
          .slice(0, MAX_DISCOVERY_ITEMS)
          .map(normalizeAlbumItem)
          .filter((item): item is AurralNormalizedAlbum => Boolean(item))
      : [];
    const tracks = Array.isArray(response.tracks)
      ? response.tracks
          .slice(0, MAX_DISCOVERY_ITEMS)
          .map(normalizeTrackItem)
          .filter((item): item is AurralNormalizedTrack => Boolean(item))
      : [];

    return {
      artists,
      albums,
      tracks,
      top: normalizeTopResult(response.top),
      degraded,
    };
  }

  public async searchAlbums(
    query: string,
    limit = 12
  ): Promise<AurralNormalizedAlbum[]> {
    if (typeof query !== 'string') {
      return [];
    }
    const trimmedQuery = query.trim();
    if (!trimmedQuery || trimmedQuery.length > 256) {
      return [];
    }
    const clampedLimit =
      typeof limit === 'number' && Number.isFinite(limit)
        ? Math.min(MAX_DISCOVERY_ITEMS, Math.max(1, Math.trunc(limit)))
        : 12;

    const response = await this.get<unknown>(
      '/api/search',
      {
        params: {
          q: trimmedQuery,
          scope: 'album',
          limit: clampedLimit,
        },
        timeout: SEARCH_TIMEOUT_MS,
      },
      SEARCH_AUX_CACHE_TTL_SECONDS
    );

    const rawItems = Array.isArray(response)
      ? response
      : isRecord(response)
        ? Array.isArray(response.albums)
          ? response.albums
          : Array.isArray(response.results)
            ? response.results
            : Array.isArray(response.items)
              ? response.items
              : []
        : [];

    return rawItems
      .slice(0, clampedLimit)
      .map(normalizeAlbumItem)
      .filter((item): item is AurralNormalizedAlbum => Boolean(item));
  }

  public async searchLibrary(
    query: string,
    limit = 8
  ): Promise<AurralLibrarySearchResult> {
    if (typeof query !== 'string') {
      return { artists: [], albums: [], tracks: [] };
    }
    const trimmedQuery = query.trim();
    if (!trimmedQuery || trimmedQuery.length > 256) {
      return { artists: [], albums: [], tracks: [] };
    }
    const clampedLimit =
      typeof limit === 'number' && Number.isFinite(limit)
        ? Math.min(MAX_DISCOVERY_ITEMS, Math.max(1, Math.trunc(limit)))
        : 8;

    const response = await this.get<unknown>(
      '/api/search/library',
      {
        params: {
          q: trimmedQuery,
          limit: clampedLimit,
        },
        timeout: SEARCH_TIMEOUT_MS,
      },
      0
    );

    if (!isRecord(response)) {
      return { artists: [], albums: [], tracks: [] };
    }

    const artists = Array.isArray(response.artists)
      ? response.artists
          .slice(0, clampedLimit)
          .flatMap((entry): AurralNormalizedArtist[] => {
            if (!isRecord(entry)) return [];
            const name = boundedString(entry.name, 512)?.trim();
            if (!name) return [];
            const libId =
              parseLibraryNumericId(entry.libraryId ?? entry.library_id) ??
              parseLibraryNumericId(entry.id);
            const mbid =
              sanitizeMusicBrainzId(entry.mbid ?? entry.artistMbid) ??
              strictMusicBrainzId(sanitizeMusicBrainzId(entry.id));
            return [
              {
                mbid,
                name,
                image:
                  (libId !== undefined
                    ? `/api/v1/music/library-art/artists/${libId}`
                    : null) ??
                  sanitizeAurralImageUrl(
                    entry.image ?? entry.imageUrl ?? entry.coverUrl
                  ),
                inLibrary: true,
              },
            ];
          })
      : [];

    const albums = Array.isArray(response.albums)
      ? response.albums
          .slice(0, clampedLimit)
          .flatMap((entry): AurralNormalizedAlbum[] => {
            const base = normalizeAlbumItem(entry);
            if (!base || !isRecord(entry)) return [];
            const libId =
              parseLibraryNumericId(entry.libraryId ?? entry.library_id) ??
              parseLibraryNumericId(entry.id);
            const mbid =
              sanitizeMusicBrainzId(
                entry.releaseGroupMbid ??
                  entry.release_group_mbid ??
                  entry.albumMbid ??
                  entry.album_mbid ??
                  entry.mbid
              ) ?? strictMusicBrainzId(sanitizeMusicBrainzId(entry.id));
            return [
              {
                ...base,
                mbid,
                coverUrl:
                  (libId !== undefined
                    ? `/api/v1/music/library-art/albums/${libId}`
                    : null) ?? base.coverUrl,
                inLibrary: true,
              },
            ];
          })
      : [];

    const tracks = Array.isArray(response.tracks)
      ? response.tracks
          .slice(0, clampedLimit)
          .flatMap((entry): AurralNormalizedTrack[] => {
            const base = normalizeTrackItem(entry);
            if (!base || !isRecord(entry)) return [];
            const libAlbumId = parseLibraryNumericId(
              entry.libraryAlbumId ??
                entry.library_album_id ??
                entry.albumId ??
                entry.album_id
            );
            return [
              {
                ...base,
                coverUrl:
                  (libAlbumId !== undefined
                    ? `/api/v1/music/library-art/albums/${libAlbumId}`
                    : null) ?? base.coverUrl,
                inLibrary: true,
              },
            ];
          })
      : [];

    return { artists, albums, tracks };
  }

  public async resolveLink(url: string): Promise<AurralResolvedLink | null> {
    if (typeof url !== 'string') {
      return null;
    }
    const trimmed = url.trim();
    if (!trimmed || trimmed.length > 2048) {
      return null;
    }

    let response: unknown;
    try {
      response = await this.get<unknown>(
        '/api/search/link',
        {
          params: { url: trimmed },
          timeout: SEARCH_TIMEOUT_MS,
        },
        SEARCH_AUX_CACHE_TTL_SECONDS
      );
    } catch (error) {
      if (getHttpErrorStatus(error) === 404) {
        return null;
      }
      throw error;
    }

    if (!isRecord(response)) {
      return null;
    }

    const rawType = boundedString(response.type, 32)?.trim().toLowerCase();
    if (rawType !== 'track' && rawType !== 'album' && rawType !== 'artist') {
      return null;
    }

    const title = boundedString(response.title ?? response.name, 512)?.trim();
    if (!title) {
      return null;
    }

    return {
      type: rawType,
      mbid: sanitizeMusicBrainzId(response.mbid ?? response.id),
      title,
      artistName:
        boundedString(response.artistName ?? response.artist, 512)?.trim() ??
        null,
      albumMbid: sanitizeMusicBrainzId(
        response.albumMbid ?? response.releaseGroupMbid
      ),
    };
  }

  public async getSimilarArtists(mbid: string): Promise<AurralSimilarArtist[]> {
    if (typeof mbid !== 'string' || !UUID_PATTERN.test(mbid.trim())) {
      throw new Error('Aurral artist MBID must be a valid UUID.');
    }
    const normalizedMbid = mbid.trim().toLowerCase();

    const endpoint = `/api/artists/${encodeURIComponent(normalizedMbid)}/similar`;
    let response: unknown;
    try {
      response = await this.get<unknown>(
        endpoint,
        { timeout: SEARCH_TIMEOUT_MS },
        SIMILAR_ARTISTS_CACHE_TTL_SECONDS
      );
    } catch (error) {
      if (getHttpErrorStatus(error) === 404) {
        return [];
      }
      throw error;
    }

    const rawArtists = Array.isArray(response)
      ? response
      : isRecord(response) && Array.isArray(response.artists)
        ? response.artists
        : [];

    const parsed = rawArtists.flatMap(
      (
        entry,
        index
      ): {
        artist: AurralSimilarArtist;
        score: number | null;
        index: number;
      }[] => {
        if (!isRecord(entry)) return [];
        const name = boundedString(entry.name, 512)?.trim();
        if (!name) return [];
        const resolvedMbid = strictMusicBrainzId(
          sanitizeMusicBrainzId(entry.mbid ?? entry.artistMbid ?? entry.id)
        );
        const rawScore =
          typeof entry.match === 'number' && Number.isFinite(entry.match)
            ? entry.match
            : typeof entry.score === 'number' && Number.isFinite(entry.score)
              ? entry.score
              : null;

        return [
          {
            artist: {
              mbid: resolvedMbid,
              name,
              image: sanitizeAurralImageUrl(entry.image ?? entry.imageUrl),
            },
            score: rawScore,
            index,
          },
        ];
      }
    );

    parsed.sort((a, b) => {
      if (a.score !== null && b.score !== null && b.score !== a.score) {
        return b.score - a.score;
      }
      return a.index - b.index;
    });

    const seen = new Set<string>();
    const results: AurralSimilarArtist[] = [];
    for (const item of parsed) {
      const key = item.artist.mbid ?? `name:${item.artist.name.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      results.push(item.artist);
      if (results.length >= 12) break;
    }

    if (results.length === 0) {
      this.removeCache(endpoint);
    }

    return results;
  }

  public async getTrending(): Promise<AurralTrendingResult> {
    const response = await this.get<unknown>(
      '/api/discover/trending',
      {},
      DISCOVERY_CACHE_TTL_SECONDS
    );

    if (!isRecord(response)) {
      return { artists: [], albums: [], tracks: [] };
    }

    const rawSongs = isRecord(response.songs)
      ? response.songs.items
      : response.tracks;
    const tracks = Array.isArray(rawSongs)
      ? rawSongs
          .slice(0, MAX_DISCOVERY_ITEMS)
          .map(normalizeTrackItem)
          .filter((item): item is AurralNormalizedTrack => Boolean(item))
      : [];
    const albums = Array.isArray(response.albums)
      ? response.albums
          .slice(0, MAX_DISCOVERY_ITEMS)
          .map(normalizeAlbumItem)
          .filter((item): item is AurralNormalizedAlbum => Boolean(item))
      : [];
    const artists = Array.isArray(response.artists)
      ? response.artists
          .slice(0, MAX_DISCOVERY_ITEMS)
          .map(normalizeArtistItem)
          .filter((item): item is AurralNormalizedArtist => Boolean(item))
      : [];

    return { artists, albums, tracks };
  }

  public async getDiscoverTags(options?: {
    q?: string;
    limit?: number;
  }): Promise<string[]> {
    const limit =
      typeof options?.limit === 'number' && Number.isFinite(options.limit)
        ? Math.min(20, Math.max(1, Math.trunc(options.limit)))
        : 20;
    const rawQuery = options?.q;
    if (
      rawQuery !== undefined &&
      (typeof rawQuery !== 'string' || rawQuery.length > 100)
    ) {
      throw new Error(
        'Aurral tag query must be a string up to 100 characters.'
      );
    }
    const q = rawQuery?.trim();

    // With no query, Aurral returns the user's top genres followed by every
    // MusicBrainz genre in A-Z order ("2 tone", "2-step", ...). Show the
    // user's top genres first, then well-known genres, instead.
    if (!q) {
      return this.getPopularGenres(limit);
    }

    const response = await this.get<unknown>(
      '/api/discover/tags',
      {
        params: {
          genres: '1',
          limit,
          ...(q ? { q } : {}),
        },
      },
      DISCOVERY_CACHE_TTL_SECONDS
    );

    if (!isRecord(response) || !Array.isArray(response.tags)) {
      return [];
    }

    const seen = new Set<string>();
    const tags: string[] = [];
    for (const rawTag of response.tags.slice(0, MAX_DISCOVERY_ITEMS)) {
      const tag = boundedString(rawTag, 128)?.trim();
      if (!tag) continue;
      const key = tag.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      tags.push(tag);
    }

    return tags;
  }

  private async getPopularGenres(limit: number): Promise<string[]> {
    let topGenres: unknown[] = [];
    try {
      const discover = await this.get<unknown>(
        '/api/discover',
        {},
        DISCOVERY_CACHE_TTL_SECONDS
      );
      if (isRecord(discover) && Array.isArray(discover.topGenres)) {
        topGenres = discover.topGenres;
      }
    } catch {
      // Fall back to the built-in list when discovery is unavailable.
    }

    const seen = new Set<string>();
    const tags: string[] = [];
    for (const rawTag of [...topGenres, ...POPULAR_MUSIC_GENRES]) {
      const tag = boundedString(rawTag, 128)?.trim();
      if (!tag) continue;
      const key = tag.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      tags.push(tag);
      if (tags.length >= limit) break;
    }
    return tags;
  }

  public async getDiscoverByTag(
    tag: string,
    options?: { limit?: number; offset?: number }
  ): Promise<AurralGenreDiscoveryResult> {
    if (typeof tag !== 'string') {
      throw new Error('Aurral genre tag must be a string.');
    }
    const trimmedTag = tag.trim();
    if (!trimmedTag || trimmedTag.length > 128) {
      throw new Error('Aurral genre tag must be between 1 and 128 characters.');
    }
    const limit =
      typeof options?.limit === 'number' && Number.isFinite(options.limit)
        ? Math.min(MAX_DISCOVERY_ITEMS, Math.max(1, Math.trunc(options.limit)))
        : 24;
    const offset =
      typeof options?.offset === 'number' && Number.isFinite(options.offset)
        ? Math.min(1000, Math.max(0, Math.trunc(options.offset)))
        : 0;

    const endpoint = '/api/discover/by-tag';
    const params = {
      tag: trimmedTag,
      limit,
      offset,
      scope: 'all',
    };
    const response = await this.get<unknown>(
      endpoint,
      { params },
      DISCOVERY_CACHE_TTL_SECONDS
    );
    const shortenEmptyCache = () => {
      this.removeCache(endpoint, params);
      this.setCached(endpoint, response, EMPTY_DISCOVERY_CACHE_TTL_SECONDS, {
        params,
      });
    };

    if (!isRecord(response)) {
      shortenEmptyCache();
      return { tag: trimmedTag, artists: [] };
    }

    const rawList = Array.isArray(response.recommendations)
      ? response.recommendations
      : Array.isArray(response.artists)
        ? response.artists
        : [];

    const artists = rawList
      .slice(0, MAX_DISCOVERY_ITEMS)
      .map(normalizeArtistItem)
      .filter((item): item is AurralNormalizedArtist => Boolean(item));

    if (artists.length === 0) {
      shortenEmptyCache();
    }

    return {
      tag: boundedString(response.tag, 128)?.trim() || trimmedTag,
      artists,
    };
  }

  public async getDiscoverRecommended(): Promise<AurralDiscoverRecommendedResult> {
    const response = await this.get<unknown>(
      '/api/discover',
      {},
      DISCOVERY_CACHE_TTL_SECONDS
    );

    if (!isRecord(response)) {
      return { recommendations: [], trending: [] };
    }

    const recommendations = Array.isArray(response.recommendations)
      ? response.recommendations
          .map(normalizeRecommendedArtist)
          .filter((item): item is AurralRecommendedArtist => Boolean(item))
          .slice(0, MAX_RECOMMENDED_ITEMS)
      : [];

    const trending = Array.isArray(response.globalTop)
      ? response.globalTop
          .slice(0, MAX_DISCOVERY_ITEMS)
          .map(normalizeTrendingGlobalArtist)
          .filter((item): item is AurralTrendingGlobalArtist => Boolean(item))
      : [];

    return { recommendations, trending };
  }

  public async getDiscoverPlaylists(): Promise<AurralDiscoverPlaylistsResult> {
    const response = await this.get<unknown>(
      '/api/discover/playlists',
      {},
      PLAYLISTS_CACHE_TTL_SECONDS
    );

    if (!isRecord(response) || !Array.isArray(response.categories)) {
      return { categories: [] };
    }

    const categories: AurralPlaylistCategory[] = [];
    for (const rawCategory of response.categories.slice(
      0,
      MAX_DISCOVERY_ITEMS
    )) {
      if (!isRecord(rawCategory)) continue;
      const id = boundedIdString(rawCategory.id, 128);
      const name = boundedString(rawCategory.name, 256)?.trim();
      if (!id || !name) continue;

      const playlists = Array.isArray(rawCategory.playlists)
        ? rawCategory.playlists
            .slice(0, MAX_DISCOVERY_ITEMS)
            .map(normalizePlaylistSummary)
            .filter((item): item is AurralPlaylistSummary => Boolean(item))
        : [];

      categories.push({ id, name, playlists });
    }

    return { categories };
  }

  public async getDiscoverPlaylist(
    provider: string,
    playlistId: string
  ): Promise<AurralPlaylistDetails | null> {
    if (
      typeof provider !== 'string' ||
      !PLAYLIST_PROVIDER_PATTERN.test(provider)
    ) {
      throw new Error('Aurral playlist provider is invalid.');
    }
    if (
      typeof playlistId !== 'string' ||
      !PLAYLIST_ID_PATTERN.test(playlistId)
    ) {
      throw new Error('Aurral playlist ID is invalid.');
    }

    let response: unknown;
    try {
      response = await this.get<unknown>(
        `/api/discover/playlists/${encodeURIComponent(provider)}/${encodeURIComponent(playlistId)}`,
        {},
        PLAYLIST_DETAILS_CACHE_TTL_SECONDS
      );
    } catch (error) {
      if (getHttpErrorStatus(error) === 404) {
        return null;
      }
      throw error;
    }

    if (!isRecord(response)) {
      return null;
    }

    const tracks = Array.isArray(response.tracks)
      ? response.tracks
          .slice(0, MAX_PLAYLIST_TRACKS)
          .map(normalizePlaylistTrack)
          .filter((item): item is AurralPlaylistTrack => Boolean(item))
      : [];

    return {
      id: boundedIdString(response.id, 128) || playlistId,
      name: boundedString(response.name, 512)?.trim() || '',
      description: boundedString(response.description, 2048)?.trim() ?? null,
      curator: boundedString(response.curator, 256)?.trim() ?? null,
      artworkUrl: sanitizeAurralImageUrl(response.artworkUrl),
      provider: boundedString(response.provider, 64)?.trim() || provider,
      tracks,
    };
  }

  public async getArtistImageUrl(
    mbid: string,
    name?: string
  ): Promise<string | null> {
    if (typeof mbid !== 'string' || !UUID_PATTERN.test(mbid.trim())) {
      throw new Error('Aurral artist MBID must be a valid UUID.');
    }
    if (name !== undefined && (typeof name !== 'string' || name.length > 256)) {
      throw new Error('Aurral artist name must be 256 characters or fewer.');
    }

    const normalizedMbid = mbid.trim().toLowerCase();
    const trimmedName = name?.trim();
    const normalizedName = trimmedName
      ? normalizeMusicSearchText(trimmedName)
      : '';
    const cacheEndpoint = `/api/artists/${encodeURIComponent(normalizedMbid)}/cover-resolved`;
    const cacheConfig = normalizedName
      ? { params: { name: normalizedName } }
      : undefined;
    const cached = this.getCached<{ url: string | null }>(
      cacheEndpoint,
      cacheConfig
    );
    if (cached !== undefined) {
      return cached.url;
    }

    let response: unknown = null;
    try {
      response = await this.get<unknown>(
        `/api/artists/${encodeURIComponent(normalizedMbid)}/cover`,
        trimmedName ? { params: { artistName: trimmedName } } : {},
        0
      );
    } catch (error) {
      if (getHttpErrorStatus(error) !== 404) {
        throw error;
      }
    }

    let resolvedUrl: string | null = null;
    if (isRecord(response) && Array.isArray(response.images)) {
      // Aurral lists { image, front, types }; the front poster comes first,
      // then any other image. Older builds used `url`.
      const entries = response.images.filter(isRecord);
      const ordered = [
        ...entries.filter((entry) => entry.front === true),
        ...entries.filter((entry) => entry.front !== true),
      ];
      for (const entry of ordered) {
        const safeUrl = sanitizeAurralImageUrl(entry.image ?? entry.url);
        if (safeUrl) {
          resolvedUrl = safeUrl;
          break;
        }
      }
    }

    let deezerFailed = false;
    let fromNameMatch = false;
    if (!resolvedUrl && trimmedName && normalizedName) {
      const deezerArtists = await new DeezerAPI()
        .searchArtists(trimmedName, 3)
        .catch(() => {
          deezerFailed = true;
          return [];
        });
      const matched = deezerArtists.find(
        (artist) => normalizeMusicSearchText(artist.name) === normalizedName
      );
      resolvedUrl = matched?.pictureXl ?? null;
      fromNameMatch = resolvedUrl !== null;
    }

    if (resolvedUrl) {
      this.setCached(
        cacheEndpoint,
        { url: resolvedUrl },
        fromNameMatch
          ? ARTIST_IMAGE_NAME_MATCH_CACHE_TTL_SECONDS
          : ARTIST_IMAGE_CACHE_TTL_SECONDS,
        cacheConfig
      );
    } else if (!deezerFailed) {
      this.setCached(
        cacheEndpoint,
        { url: null },
        ARTIST_IMAGE_MISS_CACHE_TTL_SECONDS,
        cacheConfig
      );
    }

    return resolvedUrl;
  }

  /**
   * A cover for an album (release group) that actually loads. Cover Art Archive
   * first; new and less-known releases are often missing there, so then Deezer
   * and iTunes, matched on artist and title. Answers are cached.
   */
  public async getAlbumArtUrl(
    mbid: string,
    artist?: string,
    title?: string
  ): Promise<string | null> {
    if (typeof mbid !== 'string' || !UUID_PATTERN.test(mbid.trim())) {
      throw new Error('Aurral album MBID must be a valid UUID.');
    }
    for (const value of [artist, title]) {
      if (
        value !== undefined &&
        (typeof value !== 'string' || value.length > 256)
      ) {
        throw new Error(
          'Album artist and title must be 256 characters or fewer.'
        );
      }
    }
    const normalizedMbid = mbid.trim().toLowerCase();
    const artistName = artist?.trim() || '';
    const albumTitle = title?.trim() || '';
    const normArtist = artistName ? normalizeMusicSearchText(artistName) : '';
    const normTitle = albumTitle ? normalizeMusicSearchText(albumTitle) : '';
    const cacheEndpoint = `/album-art/${encodeURIComponent(normalizedMbid)}`;
    const cacheConfig = { params: { a: normArtist, t: normTitle } };
    const cached = this.getCached<{ url: string | null }>(
      cacheEndpoint,
      cacheConfig
    );
    if (cached !== undefined) {
      return cached.url;
    }

    let failures = 0;
    let attempts = 0;
    const matches = (candidateTitle: string, candidateArtist: string) => {
      const ct = normalizeMusicSearchText(candidateTitle);
      const ca = normalizeMusicSearchText(candidateArtist);
      if (!ct || ca !== normArtist) return false;
      return (
        ct === normTitle || ct.startsWith(normTitle) || normTitle.startsWith(ct)
      );
    };

    let resolvedUrl: string | null = null;

    // 1. Cover Art Archive
    const caaUrl = `https://coverartarchive.org/release-group/${encodeURIComponent(normalizedMbid)}/front-500`;
    attempts += 1;
    try {
      const head = await axios.head(caaUrl, {
        timeout: ALBUM_ART_TIMEOUT_MS,
        maxRedirects: 5,
        validateStatus: () => true,
      });
      if (head.status >= 200 && head.status < 400) {
        resolvedUrl = caaUrl;
      } else if (head.status === 429 || head.status >= 500) {
        // Rate limited or down: a failure, not "this album has no art".
        failures += 1;
      }
    } catch {
      failures += 1;
    }

    // 2. Deezer, 3. iTunes: only with an artist and title to match against
    if (!resolvedUrl && normArtist && normTitle) {
      attempts += 1;
      try {
        // Deezer's advanced syntax has no escape for quotes, so drop them.
        const quoteFree = (value: string) =>
          value.replace(/"/g, ' ').replace(/\s+/g, ' ').trim();
        const albums = await new DeezerAPI().searchAlbums(
          `artist:"${quoteFree(artistName)}" album:"${quoteFree(albumTitle)}"`,
          5
        );
        const hit = albums.find(
          (album) => album.coverXl && matches(album.title, album.artistName)
        );
        resolvedUrl = hit?.coverXl ?? null;
      } catch {
        failures += 1;
      }
    }
    if (!resolvedUrl && normArtist && normTitle) {
      attempts += 1;
      try {
        const response = await axios.get<unknown>(
          'https://itunes.apple.com/search',
          {
            params: {
              term: `${artistName} ${albumTitle}`.slice(0, 300),
              entity: 'album',
              limit: 5,
            },
            timeout: ALBUM_ART_TIMEOUT_MS,
            maxContentLength: 2 * 1024 * 1024,
          }
        );
        const results =
          isRecord(response.data) && Array.isArray(response.data.results)
            ? response.data.results.filter(isRecord)
            : [];
        for (const entry of results) {
          if (
            typeof entry.collectionName !== 'string' ||
            typeof entry.artistName !== 'string' ||
            typeof entry.artworkUrl100 !== 'string'
          ) {
            continue;
          }
          if (!matches(entry.collectionName, entry.artistName)) continue;
          const safe = sanitizeAurralImageUrl(
            entry.artworkUrl100.replace('100x100bb', '600x600bb')
          );
          if (safe) {
            resolvedUrl = safe;
            break;
          }
        }
      } catch {
        failures += 1;
      }
    }

    if (resolvedUrl) {
      this.setCached(
        cacheEndpoint,
        { url: resolvedUrl },
        ALBUM_ART_CACHE_TTL_SECONDS,
        cacheConfig
      );
      return resolvedUrl;
    }
    if (failures === attempts) {
      throw new Error('Album art sources could not be reached.');
    }
    // Only remember "no art" when every source really answered; a source
    // that failed may have the art once it is back.
    if (failures === 0) {
      this.setCached(
        cacheEndpoint,
        { url: null },
        ALBUM_ART_MISS_CACHE_TTL_SECONDS,
        cacheConfig
      );
    }
    return null;
  }

  public async getArtistDetails(
    mbid: string
  ): Promise<AurralArtistDetails | null> {
    if (typeof mbid !== 'string' || !UUID_PATTERN.test(mbid.trim())) {
      throw new Error('Aurral artist MBID must be a valid UUID.');
    }
    const normalizedMbid = mbid.trim().toLowerCase();
    const endpoint = `/api/artists/${encodeURIComponent(normalizedMbid)}`;

    let response: unknown;
    try {
      response = await this.get<unknown>(
        endpoint,
        {},
        ARTIST_DETAILS_CACHE_TTL_SECONDS
      );
    } catch (error) {
      if (getHttpErrorStatus(error) === 404) {
        return null;
      }
      throw error;
    }

    if (!isRecord(response)) {
      throw new Error('Aurral returned an invalid artist response.');
    }

    const details = normalizeArtistDetails(response, normalizedMbid);
    const isIncomplete =
      !details.name ||
      details.name.toLowerCase() === 'unknown artist' ||
      details.releaseGroups.length === 0;
    if (isIncomplete) {
      this.removeCache(endpoint);
      return {
        ...details,
        incomplete: true,
      };
    }

    return details;
  }

  public async getLibraryArtistReleaseGroups(
    mbid: string
  ): Promise<AurralLibraryArtistReleaseGroups> {
    if (typeof mbid !== 'string' || !UUID_PATTERN.test(mbid.trim())) {
      throw new Error('Aurral artist MBID must be a valid UUID.');
    }
    const normalizedMbid = mbid.trim().toLowerCase();

    let response: unknown;
    try {
      response = await this.get<unknown>(
        `/api/library/artists/${encodeURIComponent(normalizedMbid)}`,
        {},
        0
      );
    } catch (error) {
      if (getHttpErrorStatus(error) === 404) {
        return { owned: new Set(), partial: new Set() };
      }
      throw error;
    }

    const owned = new Set<string>();
    const partial = new Set<string>();
    if (!isRecord(response)) {
      return { owned, partial };
    }

    const containers = [
      response,
      isRecord(response.artist) ? response.artist : undefined,
      isRecord(response.data) ? response.data : undefined,
    ].filter((container): container is Record<string, unknown> =>
      Boolean(container)
    );

    for (const container of containers) {
      collectLibraryReleaseGroupMbids(container.albums, owned, partial);
      collectLibraryReleaseGroupMbids(container.releaseGroups, owned, partial);
      collectLibraryReleaseGroupMbids(
        container['release-groups'],
        owned,
        partial
      );
      collectLibraryReleaseGroupMbids(container.releases, owned, partial);
      collectLibraryReleaseGroupMbids(container.items, owned, partial);
    }

    for (const id of owned) {
      partial.delete(id);
    }

    return { owned, partial };
  }

  private async getArtistMonitoringState(
    normalizedMbid: string
  ): Promise<AurralArtistMonitoringState> {
    let response: unknown;
    try {
      response = await this.get<unknown>(
        `/api/library/artists/${encodeURIComponent(normalizedMbid)}/monitoring`,
        {},
        0
      );
    } catch (error) {
      if (getHttpErrorStatus(error) === 404) {
        return { inLibrary: false };
      }
      throw error;
    }

    if (!isRecord(response)) {
      throw new Error('Aurral returned an invalid monitoring response.');
    }
    // Aurral answers for artists it has not added too, with added: false.
    if (response.added === false) {
      return { inLibrary: false };
    }

    return {
      inLibrary: true,
      monitored: response.monitored === true,
      useDefault: response.useDefault === true,
      rules: isRecord(response.rules) ? response.rules : null,
    };
  }

  private static toFollowStatus(
    state: AurralArtistMonitoringState
  ): AurralArtistFollowStatus {
    if (!state.inLibrary) {
      return { inLibrary: false, following: false };
    }

    return {
      inLibrary: true,
      following:
        state.monitored &&
        (state.useDefault || state.rules?.newReleases === true),
      ...(state.monitored && state.useDefault
        ? { usesDefaultRules: true }
        : {}),
    };
  }

  public async getArtistFollowStatus(
    mbid: string
  ): Promise<AurralArtistFollowStatus> {
    if (typeof mbid !== 'string' || !UUID_PATTERN.test(mbid.trim())) {
      throw new Error('Aurral artist MBID must be a valid UUID.');
    }
    const normalizedMbid = mbid.trim().toLowerCase();
    const state = await this.getArtistMonitoringState(normalizedMbid);
    return AurralAPI.toFollowStatus(state);
  }

  public async setArtistFollowing(
    mbid: string,
    name: string,
    follow: boolean
  ): Promise<AurralArtistFollowStatus> {
    if (typeof mbid !== 'string' || !UUID_PATTERN.test(mbid.trim())) {
      throw new Error('Aurral artist MBID must be a valid UUID.');
    }
    if (typeof follow !== 'boolean') {
      throw new Error('Aurral follow flag must be a boolean.');
    }
    if (typeof name !== 'string' || name.length > 256 || !name.trim()) {
      throw new Error(
        'Aurral artist name must be between 1 and 256 characters.'
      );
    }

    const normalizedMbid = mbid.trim().toLowerCase();
    const trimmedName = name.trim();
    const current = await this.getArtistMonitoringState(normalizedMbid);

    if (!follow) {
      if (!current.inLibrary) {
        return { inLibrary: false, following: false };
      }
      const hasOtherInlineRules =
        !current.useDefault &&
        current.rules !== null &&
        ((typeof current.rules.catalog === 'string' &&
          current.rules.catalog.trim() !== '' &&
          current.rules.catalog !== 'none') ||
          (typeof current.rules.topTracks === 'number' &&
            Number.isFinite(current.rules.topTracks) &&
            current.rules.topTracks > 0));
      const monitoring = hasOtherInlineRules
        ? {
            monitored: true,
            useDefault: false,
            rules: { ...current.rules, newReleases: false },
          }
        : { monitored: false };

      try {
        await this.request<unknown>(
          'PUT',
          `/api/library/artists/${encodeURIComponent(normalizedMbid)}`,
          { artistName: trimmedName, monitoring }
        );
      } catch (error) {
        const status = getHttpErrorStatus(error);
        if (status === 403) {
          throw new AurralForbiddenError();
        }
        if (status === 404) {
          return { inLibrary: false, following: false };
        }
        throw error;
      }
      return this.getArtistFollowStatus(normalizedMbid);
    }

    const currentStatus = AurralAPI.toFollowStatus(current);
    if (currentStatus.following) {
      // Already following: nothing to change, and re-sending rules could
      // only widen what Aurral fetches.
      return currentStatus;
    }

    try {
      // One call adds the artist when needed. Aurral requires the name.
      // Following means "get future releases" only: SeerrNG never sends
      // useDefault (Aurral's defaults may fetch a whole catalog), and it
      // never resurrects old rules of an unmonitored artist (they may say
      // catalog "all"). Only an artist that is monitored right now with
      // explicit rules keeps them, with new releases switched on.
      const keepCurrentRules =
        current.inLibrary &&
        current.monitored &&
        !current.useDefault &&
        current.rules !== null;
      const monitoring =
        keepCurrentRules && current.rules
          ? {
              monitored: true,
              useDefault: false,
              rules: {
                ...current.rules,
                newReleases: true,
                types:
                  Array.isArray(current.rules.types) &&
                  current.rules.types.length > 0
                    ? current.rules.types
                    : [...AURRAL_FOLLOW_MONITORING.rules.types],
              },
            }
          : AURRAL_FOLLOW_MONITORING;
      await this.request<unknown>(
        'PUT',
        `/api/library/artists/${encodeURIComponent(normalizedMbid)}`,
        { artistName: trimmedName, monitoring }
      );
    } catch (error) {
      if (getHttpErrorStatus(error) === 403) {
        throw new AurralForbiddenError();
      }
      throw error;
    }

    return this.getArtistFollowStatus(normalizedMbid);
  }
}

export default AurralAPI;
