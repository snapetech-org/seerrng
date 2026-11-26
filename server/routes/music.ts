import AurralAPI, {
  AURRAL_LIBRARY_KINDS,
  AURRAL_LIBRARY_SORTS,
  AurralForbiddenError,
  MAX_LIBRARY_QUERY_LENGTH,
  sanitizeAurralImageUrl,
  type AurralActivityItem,
  type AurralArtistReleaseGroup,
  type AurralLibraryKind,
  type AurralLibrarySearchResult,
  type AurralNormalizedAlbum,
  type AurralNormalizedArtist,
  type AurralNormalizedTopResult,
  type AurralNormalizedTrack,
  type AurralResolvedLink,
} from '@server/api/aurral';
import CoverArtArchive from '@server/api/coverartarchive';
import DeezerAPI, {
  type DeezerArtistResult,
  type DeezerTrackResult,
} from '@server/api/deezer';
import Discogs from '@server/api/discogs';
import ListenBrainzAPI from '@server/api/listenbrainz';
import MusicBrainz, { escapeMusicBrainzQuery } from '@server/api/musicbrainz';
import type {
  MbAlbumDetails,
  MbLink,
  MbRecordingDetails,
} from '@server/api/musicbrainz/interfaces';
import LidarrAPI from '@server/api/servarr/lidarr';
import TheAudioDb from '@server/api/theaudiodb';
import TmdbPersonMapper from '@server/api/themoviedb/personMapper';
import {
  MediaRequestStatus,
  MediaStatus,
  MediaType,
} from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import {
  BlocklistedMediaError,
  DuplicateMediaRequestError,
  hasMediaRequestPermission,
  MediaRequest,
  QuotaExceptionAlreadyPendingError,
  QuotaRestrictedError,
  RequestPermissionError,
  ServiceConfigurationError,
} from '@server/entity/MediaRequest';
import MetadataArtist from '@server/entity/MetadataArtist';
import TrackRequest, {
  ACTIVE_TRACK_STATUSES,
} from '@server/entity/TrackRequest';
import type { User } from '@server/entity/User';
import { Watchlist } from '@server/entity/Watchlist';
import {
  isValidMusicBrainzResourceId,
  MAX_MUSICBRAINZ_BATCH_IDS,
  normalizeMusicBrainzId,
  prepareMusicBrainzBatchIds,
} from '@server/lib/externalIds';
import { getExternalRuntimeConfig } from '@server/lib/externalRuntimeConfig';
import { upsertMediaSearchMetadata } from '@server/lib/mediaSearchMetadata';
import { hydrateMediaSummaryRelations } from '@server/lib/mediaSummaryHydration';
import {
  AlbumDetailsNotFoundError,
  getAlbumDetails,
  mapMusicBrainzReleaseGroupToListenBrainzAlbum,
} from '@server/lib/musicAlbumDetails';
import {
  getOwnedAlbums,
  getOwnedSongKeys,
  isOwnedArtist,
  loadDefaultOwnedAlbums,
  markOwnedSongs,
  OWNED_INDEX_MUST_KNOW_WAIT_MS,
  ownedAlbumState,
  ownedSongKey,
  type OwnedAlbumLookup,
  type OwnedIndexOptions,
} from '@server/lib/musicOwnedSongs';
import {
  getDefaultLidarrServer,
  getMusicProvider,
  type MusicProvider,
} from '@server/lib/musicProviders';
import {
  getAvailableMusicQualities,
  getAvailableMusicServices,
  getMusicQualityStatuses,
} from '@server/lib/musicQualityAvailability';
import {
  cachedMusicCover,
  cachedMusicRead,
  invalidateMusicReads,
  type MusicReadOptions,
} from '@server/lib/musicReadCache';
import {
  buildRequestAllPlan,
  classifyArtistReleaseGroups,
  collapseRedundantAlbumResults,
  loadReleaseGroupEditions,
  loadReleaseGroupTracks,
  peekReleaseGroupTracks,
  releaseGroupsToInspect,
  requestAllSongKey,
  warmReleaseGroupTracks,
  type ReleaseRedundancy,
  type RequestAllPlanItem,
} from '@server/lib/musicRequestAllPlan';
import {
  albumPopularityKey,
  applyTrackPopularity,
  fillTrackArtistMbids,
  filterLibraryHits,
  findDominantTrackArtist,
  formatParsedMusicQuery,
  hasTrackMatchingArtistAndTitle,
  isMusicLinkQuery,
  isSameTitleTrack,
  mergeAlbums,
  mergeArtists,
  musicMatchKey,
  musicNamesEqual,
  normalizeMusicSearchText,
  parseMusicPlaylistLink,
  parseMusicQuery,
  pickCatalogTrackArtist,
  pickTrackArtistMatch,
  planTrackArtistResolution,
  promoteArtist,
  rankAndDedupeTracks,
  resolveMusicQuerySplit,
  selectTopResult,
  sortAlbumsForSearch,
  sortArtistsForSearch,
  stripEditionWords,
  stripMusicSearchFiller,
  stripTrackPopularity,
  type DominantTrackArtist,
  type MusicQueryParseDetails,
} from '@server/lib/musicSearch';
import {
  getMusicTrackAvailability,
  type MusicTrackAvailability,
} from '@server/lib/musicTrackAvailability';
import { hasAutoApprovePermission, Permission } from '@server/lib/permissions';
import { runWithServarrServiceSnapshot } from '@server/lib/serviceAdmission';
import { getSettings } from '@server/lib/settings';
import {
  canRequestTracks,
  createTrackRequests,
  getDefaultAurralServer,
  isTrackRequestsConfigured,
  TrackRequestError,
} from '@server/lib/soulseek/trackRequests';
import { isUserMediaCategoryEnabled } from '@server/lib/userMediaCategories';
import { UserMutationActorUnauthorizedError } from '@server/lib/userSecurityMutation';
import logger from '@server/logger';
import {
  mapMusicDetails,
  type MusicRatingResponse,
} from '@server/models/Music';
import { mapWithConcurrency } from '@server/utils/concurrency';
import { filterEntityResponse } from '@server/utils/entityResponse';
import { parsePositiveInt } from '@server/utils/pagination';
import { getRateLimitKey } from '@server/utils/security';
import {
  parseBoundedString,
  parseOptionalAllowedString,
  parseOptionalBoundedString,
  parseOptionalQueryBoolean,
} from '@server/utils/validation';
import { Router, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { In } from 'typeorm';

const musicRoutes = Router();

// the album lookup moved to lib; tests and callers still import it from here
export { getAlbumDetails };

// Library and activity reads are shared for a few seconds (see musicReadCache);
// anything that changes the library or the queue drops those copies.
musicRoutes.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.on('finish', () => {
      if (res.statusCode < 400) invalidateMusicReads('library:', 'activity:');
    });
  }
  next();
});

// the queue moves every few seconds: a copy under 20 s old answers at once
// (the tab polls every 10 s) while a new one is read; an older one waits
// briefly for the new read, so a busy Aurral never blanks the Activity tab
const ACTIVITY_READ: MusicReadOptions = {
  ttlMs: 5_000,
  revalidateMs: 20_000,
  maxStaleMs: 30 * 60_000,
  waitMs: 1_500,
};
// charts and recommendations are the same for everyone and slow to build
// (the trending chart searches Aurral for each album's MBID): 15 minutes
// fresh, then served at once while a new copy is built
const DISCOVER_READ: MusicReadOptions = {
  ttlMs: 15 * 60_000,
  revalidateMs: 12 * 60 * 60_000,
  maxStaleMs: 48 * 60 * 60_000,
  waitMs: 2_000,
};
// covers rarely change: an hour fresh, then served while a new copy is read
const MAX_CACHED_COVER_BYTES = 512 * 1024;
const COVER_READ: MusicReadOptions = {
  ttlMs: 60 * 60_000,
  revalidateMs: 7 * 24 * 60 * 60_000,
  maxStaleMs: 7 * 24 * 60 * 60_000,
  // small covers only (at most ~100 MB for the 200 kept), and no "no cover"
  // answers: a newly added album gets its cover on the next view
  store: (value) => {
    const buffer = (value as { buffer?: { length?: number } } | null)?.buffer;
    return (
      typeof buffer?.length === 'number' &&
      buffer.length <= MAX_CACHED_COVER_BYTES
    );
  },
};
// library pages change when a download finishes: a copy up to 5 minutes old
// answers at once while a new one is read
const LIBRARY_READ: MusicReadOptions = {
  ttlMs: 30_000,
  revalidateMs: 5 * 60_000,
  maxStaleMs: 24 * 60 * 60_000,
  waitMs: 1_500,
};
const discogsRatings = new Discogs();
// MusicBrainz allows about one request per second per client. The limiter
// lives on each instance, so routes share one instance instead of creating a
// new (separately limited) client per request.
let sharedMusicBrainz: MusicBrainz | undefined;
const getSharedMusicBrainz = (): MusicBrainz =>
  (sharedMusicBrainz ??= new MusicBrainz());
// Chart albums without an MBID are matched through Aurral search; keep the
// burst small on a cold cache.
const CHART_ALBUM_RESOLVE_CONCURRENCY = 4;
const MAX_MUSICBRAINZ_ID_LENGTH = 128;
const MAX_PAGE = 500;
export const MAX_ALBUM_MEDIA = 50;
export const MAX_ALBUM_TRACKS = 1_000;
export const MAX_ALBUM_TRACK_ARTISTS = 20;
export const MUSIC_IMAGE_RATE_LIMIT = {
  windowMs: 60 * 1000,
  limit: 600,
} as const;
const musicImageRateLimit = rateLimit({
  ...MUSIC_IMAGE_RATE_LIMIT,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () =>
    process.env.NODE_ENV === 'test' || process.env.E2E_TESTS === 'true',
  keyGenerator: (req) =>
    req.user ? `user:${req.user.id}` : getRateLimitKey(req),
});
export const MUSIC_SEARCH_RATE_LIMIT = {
  windowMs: 60 * 1000,
  limit: 120,
} as const;
const musicSearchRateLimit = rateLimit({
  ...MUSIC_SEARCH_RATE_LIMIT,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () =>
    process.env.NODE_ENV === 'test' || process.env.E2E_TESTS === 'true',
  keyGenerator: (req) =>
    req.user ? `user:${req.user.id}` : getRateLimitKey(req),
});

// ListenBrainz answers 404 for artists and albums it has no data for
const isNotFoundError = (error: unknown) =>
  error instanceof Error && /status code 404/.test(error.message);

const MUSICBRAINZ_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const parseMusicBrainzId = (value: unknown) =>
  parseBoundedString(value, {
    fieldName: 'MusicBrainz ID',
    maxLength: MAX_MUSICBRAINZ_ID_LENGTH,
  });

const normalizeParsedMusicBrainzId = (
  parsed: ReturnType<typeof parseMusicBrainzId>
) => {
  if ('error' in parsed) {
    return parsed;
  }

  // Album ids are MusicBrainz release-group UUIDs: "/music/playlists" and
  // other words must not reach the providers.
  const value = normalizeMusicBrainzId(parsed.value);
  return isValidMusicBrainzResourceId(value) &&
    MUSICBRAINZ_UUID_PATTERN.test(value)
    ? { value }
    : { error: 'MusicBrainz ID is invalid.' };
};

const normalizeMusicBrainzIds = (ids: string[]): string[] => [
  ...prepareMusicBrainzBatchIds(ids),
];

export const collectAlbumTrackArtists = (
  value: unknown
): { artistId: string; artistName: string }[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const artists = new Map<string, string>();
  let inspectedTracks = 0;
  outer: for (const medium of value.slice(0, MAX_ALBUM_MEDIA)) {
    if (!medium || typeof medium !== 'object') continue;
    const tracks = (medium as { tracks?: unknown }).tracks;
    if (!Array.isArray(tracks)) continue;

    for (const track of tracks) {
      if (inspectedTracks >= MAX_ALBUM_TRACKS) {
        break outer;
      }
      inspectedTracks += 1;
      if (!track || typeof track !== 'object') continue;
      const credits = (track as { artists?: unknown }).artists;
      if (!Array.isArray(credits)) continue;

      for (const credit of credits.slice(0, MAX_ALBUM_TRACK_ARTISTS)) {
        if (!credit || typeof credit !== 'object') continue;
        const { artist_mbid: rawId, artist_credit_name: rawName } = credit as {
          artist_mbid?: unknown;
          artist_credit_name?: unknown;
        };
        if (
          typeof rawId !== 'string' ||
          rawId.length > 128 ||
          typeof rawName !== 'string' ||
          rawName.length > 512
        ) {
          continue;
        }
        const artistId = normalizeMusicBrainzId(rawId);
        const artistName = rawName.trim();
        if (artistId && artistName && !artists.has(artistId)) {
          artists.set(artistId, artistName);
        }
        if (artists.size >= MAX_MUSICBRAINZ_BATCH_IDS) {
          break outer;
        }
      }
    }
  }

  return [...artists].map(([artistId, artistName]) => ({
    artistId,
    artistName,
  }));
};

const parseBoundedIntegerParam = (
  value: unknown,
  options: {
    fieldName: string;
    min: number;
    max: number;
    defaultValue: number;
  }
): { value: number } | { error: string } => {
  if (value === undefined || value === null || value === '') {
    return { value: options.defaultValue };
  }

  const parsed =
    typeof value === 'string' && /^-?\d+$/.test(value.trim())
      ? Number(value.trim())
      : typeof value === 'number'
        ? value
        : Number.NaN;

  if (
    !Number.isSafeInteger(parsed) ||
    parsed < options.min ||
    parsed > options.max
  ) {
    return {
      error: `${options.fieldName} must be an integer between ${options.min} and ${options.max}.`,
    };
  }

  return { value: parsed };
};

// The owned-song and owned-album indexes belong to the music service in use:
// the default Aurral server, else the default Lidarr server.
const ownedSongServerKey = () => {
  const settings = getSettings();
  const server = getDefaultAurralServer(settings.aurral);
  if (server?.hostname) return AurralAPI.buildUrl(server);
  const lidarr = getDefaultLidarrServer(settings.lidarr);
  return lidarr ? `lidarr:${lidarr.id}` : '';
};

const loadOwnedSongKeys = (
  aurral: MusicProvider,
  options?: OwnedIndexOptions
) => getOwnedSongKeys(aurral, ownedSongServerKey(), options);

const loadOwnedAlbums = (aurral: MusicProvider, options?: OwnedIndexOptions) =>
  getOwnedAlbums(aurral, ownedSongServerKey(), options);

/**
 * The library's own count of an album's songs decides whether it is owned or
 * partly owned (the Library tab's "x of y songs"). Without an index entry the
 * album keeps what it had: nothing is marked on a failed read.
 */
export const withOwnedAlbum = <
  T extends {
    mbid?: string | null;
    artistName?: string | null;
    title?: string | null;
    inLibrary?: boolean;
  },
>(
  album: T,
  lookup: OwnedAlbumLookup | null | undefined
): T & {
  partial?: boolean;
  libraryTrackCount?: number;
  libraryAvailableTrackCount?: number;
} => {
  const state = ownedAlbumState(lookup, album);
  if (!state) return album;
  return {
    ...album,
    inLibrary: state.status === 'owned',
    partial: state.status === 'partial',
    libraryTrackCount: state.trackCount,
    libraryAvailableTrackCount: state.availableTrackCount,
  };
};

/** Marks artists with songs in the library (by normalised name). */
const withOwnedArtists = <T extends { name: string; inLibrary?: boolean }>(
  artists: T[],
  lookup: OwnedAlbumLookup | null
): T[] =>
  lookup
    ? artists.map((artist) =>
        !artist.inLibrary && isOwnedArtist(lookup, artist.name)
          ? { ...artist, inLibrary: true }
          : artist
      )
    : artists;

// The album page needs the index without the music-permission gate the other
// music routes use: build a client when Aurral is configured.
const loadOwnedSongKeysForAlbum = async () => {
  const server = getDefaultAurralServer(getSettings().aurral);
  if (!server?.hostname || !server.apiKey) return null;
  return getOwnedSongKeys(
    new AurralAPI({ url: AurralAPI.buildUrl(server), apiKey: server.apiKey }),
    AurralAPI.buildUrl(server)
  );
};

const requireAurralMusicContext = (
  req: Request,
  res: Response
): MusicProvider | undefined => {
  if (!req.user) {
    res.status(401).json({ message: 'Authentication required.' });
    return undefined;
  }

  if (
    !req.user.hasPermission(
      [Permission.ADMIN, Permission.REQUEST, Permission.REQUEST_MUSIC],
      { type: 'or' }
    )
  ) {
    res
      .status(403)
      .json({ message: 'You do not have permission to access music.' });
    return undefined;
  }

  // Aurral when it is set up, otherwise Lidarr (see musicProviders)
  const music = getMusicProvider();
  if (!music) {
    res.status(404).json({ message: 'No music service is configured.' });
    return undefined;
  }
  return music.provider;
};

const loadRelatedMusicMediaMap = async (
  mbIds: (string | null | undefined)[],
  user?: User
): Promise<Map<string, Media>> => {
  const normalizedIds = [
    ...new Set(
      mbIds
        .filter(
          (id): id is string =>
            typeof id === 'string' && id.length <= MAX_MUSICBRAINZ_ID_LENGTH
        )
        .map(normalizeMusicBrainzId)
        .filter(isValidMusicBrainzResourceId)
    ),
  ];

  if (!normalizedIds.length) {
    return new Map();
  }

  const mediaItems: Media[] = [];
  for (
    let offset = 0;
    offset < normalizedIds.length;
    offset += MAX_MUSICBRAINZ_BATCH_IDS
  ) {
    const batch = normalizedIds.slice(
      offset,
      offset + MAX_MUSICBRAINZ_BATCH_IDS
    );
    const batchItems = await getRepository(Media).find({
      where: { mbId: In(batch), mediaType: MediaType.MUSIC },
    });
    mediaItems.push(...batchItems);
  }
  await hydrateMediaSummaryRelations(mediaItems, user);

  return new Map(
    mediaItems
      .filter((media): media is Media & { mbId: string } => Boolean(media.mbId))
      .map((media) => [normalizeMusicBrainzId(media.mbId), media])
  );
};

// Chart albums (Deezer) arrive without MusicBrainz ids, so they could not be
// requested in one tap or opened on their own page. Look each one up in
// Aurral's album search (cached) and keep the match on title and artist.
const comparableTitle = (value: string) =>
  normalizeMusicSearchText(value.replace(/\s*[([][^)\]]*[)\]]\s*/g, ' '));

// When the search clearly found one album or song, the Artists row leads with
// its artist and keeps only artists whose whole name is in the query: "YFN Lucci
// everything i said i am." should not list "Everything Everything".
export const focusArtistsOnTop = <
  T extends {
    mbid: string | null;
    name: string;
    image: string | null;
    inLibrary: boolean;
  },
>(
  artists: T[],
  top: { artistName: string; artistMbid: string | null },
  query: string
): (
  T | { mbid: string | null; name: string; image: null; inLibrary: boolean }
)[] => {
  const topName = normalizeMusicSearchText(top.artistName);
  if (!topName || topName === 'various artists') return artists;
  const padded = ` ${normalizeMusicSearchText(query)} `;
  const kept = artists.filter((artist) => {
    const name = normalizeMusicSearchText(artist.name);
    return (
      name === topName || (name.length > 2 && padded.includes(` ${name} `))
    );
  });
  const topArtist = kept.find(
    (artist) => normalizeMusicSearchText(artist.name) === topName
  );
  if (topArtist) {
    return [topArtist, ...kept.filter((artist) => artist !== topArtist)];
  }
  return [
    {
      mbid: top.artistMbid,
      name: top.artistName,
      image: null,
      inLibrary: false,
    },
    ...kept,
  ];
};

// Charts carry sleep and noise filler ("Rain Sounds For Sleep"): not new music.
const FILLER_ALBUM =
  /\b(?:white|brown|pink|green)\s+noise\b|\b(?:rain|ocean|nature|sleep|wave)\s+sounds?\b|\bfor\s+(?:deep\s+)?sleep(?:ing)?\b|\bsleep\s+(?:music|aid)\b|\b(?:loops?|music)\s+for\s+(?:relaxation|meditation|studying|babies)\b/i;

export const isFillerAlbum = (album: { title: string; artistName: string }) =>
  FILLER_ALBUM.test(album.title) || FILLER_ALBUM.test(album.artistName);

export const resolveChartAlbumIds = async (
  aurral: MusicProvider,
  albums: AurralNormalizedAlbum[]
): Promise<AurralNormalizedAlbum[]> =>
  mapWithConcurrency(
    albums,
    CHART_ALBUM_RESOLVE_CONCURRENCY,
    async (album, index) => {
      if (album.mbid || index >= 24 || !album.title || !album.artistName) {
        return album;
      }
      try {
        const title = comparableTitle(album.title);
        const artist = normalizeMusicSearchText(album.artistName);
        const found = await aurral.searchAlbums(
          `${album.artistName} ${album.title}`.slice(0, 256),
          8
        );
        const match = found.find((candidate) => {
          if (!candidate.mbid) return false;
          const candidateTitle = comparableTitle(candidate.title);
          const candidateArtist = normalizeMusicSearchText(
            candidate.artistName
          );
          const artistOk =
            artist === candidateArtist ||
            artist === 'various artists' ||
            candidateArtist.includes(artist) ||
            artist.includes(candidateArtist);
          return (
            artistOk &&
            (candidateTitle === title ||
              candidateTitle.startsWith(title) ||
              title.startsWith(candidateTitle))
          );
        });
        if (!match) return album;
        return {
          ...album,
          mbid: match.mbid,
          artistMbid: album.artistMbid ?? match.artistMbid,
          coverUrl: album.coverUrl ?? match.coverUrl,
        };
      } catch {
        return album;
      }
    }
  );

const enrichAurralAlbum = (
  album: AurralNormalizedAlbum,
  mediaMap: Map<string, Media>,
  user?: User,
  owned?: OwnedAlbumLookup | null
) => {
  const media = album.mbid
    ? mediaMap.get(normalizeMusicBrainzId(album.mbid))
    : undefined;
  return withOwnedAlbum(
    {
      ...album,
      inLibrary: album.inLibrary || media?.status === MediaStatus.AVAILABLE,
      ...(media ? { mediaInfo: filterEntityResponse(media, user) } : {}),
    },
    owned
  );
};

// An album request still open: Media pending or processing. A partly
// available album whose request completed is not "requested" any more.
const isAlbumRequestOpen = (media: Media | undefined): boolean =>
  media?.status === MediaStatus.PENDING ||
  media?.status === MediaStatus.PROCESSING;

/** Album-level state for a song: owned with its album, or asked for with it. */
const withAlbumMedia = <
  T extends { albumMbid?: string | null; inLibrary: boolean },
>(
  track: T,
  mediaMap: Map<string, Media>
): T & { albumRequested?: boolean } => {
  const media = track.albumMbid
    ? mediaMap.get(normalizeMusicBrainzId(track.albumMbid))
    : undefined;
  const inLibrary = track.inLibrary || media?.status === MediaStatus.AVAILABLE;
  return {
    ...track,
    inLibrary,
    // asking for the album asks for its songs: show them as requested too
    ...(!inLibrary && isAlbumRequestOpen(media)
      ? { albumRequested: true }
      : {}),
  };
};

const enrichAurralTrack = (
  track: AurralNormalizedTrack,
  mediaMap: Map<string, Media>
): AurralNormalizedTrack => withAlbumMedia(track, mediaMap);

const enrichAurralTopResult = (
  top: AurralNormalizedTopResult | null,
  mediaMap: Map<string, Media>,
  user?: User,
  owned?: OwnedAlbumLookup | null
) => {
  if (!top) return null;
  if (top.type === 'album') {
    const { type, ...album } = top;
    return {
      type,
      ...enrichAurralAlbum(album, mediaMap, user, owned),
    };
  }
  if (top.type === 'track') {
    const { type, ...track } = top;
    return {
      type,
      ...enrichAurralTrack(stripTrackPopularity(track), mediaMap),
    };
  }
  return top;
};

const SEARCH_AUX_TIMEOUT_MS = 3_000;
// The main Aurral search gets a little longer than the side lookups, but not
// the 10 s client default: the fallbacks below still have to run after it.
const SEARCH_PRIMARY_TIMEOUT_MS = 5_000;
// Album pages wait for per-track availability; a slow Aurral must not hold
// the whole page.
const ALBUM_TRACK_AVAILABILITY_TIMEOUT_MS = 3_000;

const withShortTimeout = <T>(
  promise: Promise<T>,
  timeoutMs = SEARCH_AUX_TIMEOUT_MS
): Promise<T> => {
  let timer: NodeJS.Timeout | undefined;
  return Promise.race([
    promise,
    new Promise<never>((_resolve, reject) => {
      timer = setTimeout(
        () => reject(new Error('Music search auxiliary request timed out.')),
        timeoutMs
      );
      timer.unref?.();
    }),
  ]).finally(() => {
    if (timer) clearTimeout(timer);
  });
};

// Extra lookups that only refine an answer (the artist the top songs belong
// to, a same-name artist with releases) get a tight cap and never fail it.
const REFINE_LOOKUP_TIMEOUT_MS = 1_500;

// The whole artist-of-the-top-songs lookup (Aurral, then MusicBrainz).
const TRACK_ARTIST_LOOKUP_BUDGET_MS = 2_000;
const MIN_LOOKUP_STEP_MS = 200;

// Looks up the artist of the top songs by their exact display name ("P!nk")
// when the catalog search for the typed name ("pink") did not list them.
// Aurral's search (local metadata mirror, fast) goes first; MusicBrainz, which
// is often busy, only when Aurral has no match. Artists already listed under
// another display name are never the answer.
const lookupTrackArtist = async (
  aurral: MusicProvider,
  musicbrainz: MusicBrainz,
  dominant: DominantTrackArtist,
  listedArtists: AurralNormalizedArtist[]
): Promise<AurralNormalizedArtist | null> => {
  const deadline = Date.now() + TRACK_ARTIST_LOOKUP_BUDGET_MS;
  const lowerName = dominant.name.trim().toLocaleLowerCase();
  const excluded = new Set(
    listedArtists.flatMap((artist) =>
      artist.mbid && artist.name.trim().toLocaleLowerCase() !== lowerName
        ? [normalizeMusicBrainzId(artist.mbid)]
        : []
    )
  );

  const fromAurral = await withShortTimeout(
    Promise.resolve().then(() =>
      aurral.searchUnified(dominant.name.slice(0, 256), 10)
    ),
    REFINE_LOOKUP_TIMEOUT_MS
  )
    .then((found) =>
      pickCatalogTrackArtist(
        [
          ...found.artists,
          ...(found.top?.type === 'artist' ? [found.top] : []),
        ],
        dominant,
        excluded
      )
    )
    .catch(() => null);
  if (fromAurral) return fromAurral;

  const remaining = deadline - Date.now();
  if (remaining < MIN_LOOKUP_STEP_MS) return null;
  const found = await withShortTimeout(
    musicbrainz.searchArtist({
      query: `artist:"${escapeMusicBrainzQuery(dominant.name)}"`,
      limit: 10,
    }),
    remaining
  ).catch(() => []);
  return pickTrackArtistMatch(
    found.flatMap((artist) => {
      const mbid = normalizeMusicBrainzId(artist.id);
      return isValidMusicBrainzResourceId(mbid) && !excluded.has(mbid)
        ? [
            {
              mbid,
              name: artist.name,
              score: typeof artist.score === 'number' ? artist.score : 0,
            },
          ]
        : [];
    }),
    dominant
  );
};

// An artist MBID with no releases (a band member who shares a solo artist's
// name) often has a same-name artist that does: search the name and return
// that one so the page can offer it. Bounded and best effort.
export const findSameNameArtist = async (
  aurral: MusicProvider,
  artist: { mbid: string; name: string }
): Promise<{ mbid: string; name: string; releaseCount: number } | null> => {
  const name = artist.name?.trim();
  if (!name || name.toLowerCase() === 'unknown artist') return null;
  const target = musicMatchKey(name);
  if (!target) return null;
  const self = normalizeMusicBrainzId(artist.mbid);
  try {
    const found = await withShortTimeout(
      aurral.searchUnified(name.slice(0, 256), 10),
      REFINE_LOOKUP_TIMEOUT_MS
    );
    const candidates = [
      ...found.artists,
      ...(found.top?.type === 'artist' ? [found.top] : []),
    ];
    const candidate = candidates.find(
      (entry) =>
        entry.mbid &&
        normalizeMusicBrainzId(entry.mbid) !== self &&
        musicNamesEqual(musicMatchKey(entry.name), target)
    );
    if (!candidate?.mbid) return null;
    const candidateMbid = normalizeMusicBrainzId(candidate.mbid);
    if (!isValidMusicBrainzResourceId(candidateMbid)) return null;
    const details = await withShortTimeout(
      aurral.getArtistDetails(candidateMbid),
      REFINE_LOOKUP_TIMEOUT_MS
    );
    if (!details || details.releaseGroups.length === 0) return null;
    return {
      mbid: candidateMbid,
      name:
        details.name && details.name.toLowerCase() !== 'unknown artist'
          ? details.name
          : candidate.name,
      releaseCount: details.releaseGroups.length,
    };
  } catch {
    return null;
  }
};

const mapDeezerFallbackArtists = async (
  deezerArtists: DeezerArtistResult[],
  musicbrainz: MusicBrainz
): Promise<AurralNormalizedArtist[]> => {
  if (deezerArtists.length === 0) {
    return [];
  }

  const query = deezerArtists
    .slice(0, 5)
    .map((artist) => `artist:"${escapeMusicBrainzQuery(artist.name)}"`)
    .join(' OR ');

  const mbArtists = await withShortTimeout(
    musicbrainz.searchArtist({ query, limit: 25 })
  ).catch(() => []);

  const exactByLower = new Map<string, { id: string; score: number }>();
  const exactByNorm = new Map<string, { id: string; score: number }>();
  for (const mbArtist of mbArtists) {
    const id = normalizeMusicBrainzId(mbArtist.id);
    if (!isValidMusicBrainzResourceId(id)) continue;
    const score = typeof mbArtist.score === 'number' ? mbArtist.score : 0;
    const lowerKey = mbArtist.name.trim().toLocaleLowerCase();
    const existingLower = exactByLower.get(lowerKey);
    if (!existingLower || score > existingLower.score) {
      exactByLower.set(lowerKey, { id, score });
    }
    const normKey = normalizeMusicSearchText(mbArtist.name);
    if (normKey) {
      const existingNorm = exactByNorm.get(normKey);
      if (!existingNorm || score > existingNorm.score) {
        exactByNorm.set(normKey, { id, score });
      }
    }
  }

  return deezerArtists.map((artist) => {
    const lowerKey = artist.name.trim().toLocaleLowerCase();
    const normKey = normalizeMusicSearchText(artist.name);
    const matched = exactByLower.get(lowerKey) ?? exactByNorm.get(normKey);
    return {
      mbid: matched?.id ?? null,
      name: artist.name,
      image: artist.pictureXl,
      inLibrary: false,
    };
  });
};

const pickBestRecordingRelease = (
  releases: MbRecordingDetails['releases']
): MbRecordingDetails['releases'][number] | undefined => {
  if (!releases.length) return undefined;
  const scoreRelease = (release: MbRecordingDetails['releases'][number]) => {
    const group = release['release-group'];
    let score = 0;
    if (release.status === 'Official') score += 20;
    if (group['primary-type'] === 'Album') score += 12;
    else if (group['primary-type'] === 'Single') score += 10;
    else if (group['primary-type'] === 'EP') score += 8;
    if (group['secondary-types'].includes('Compilation')) score -= 15;
    if (group['secondary-types'].includes('Live')) score -= 5;
    return score;
  };
  return [...releases].sort((a, b) => scoreRelease(b) - scoreRelease(a))[0];
};

/** Deezer songs for a search Aurral could not answer (no MBIDs). */
const mapDeezerFallbackTracks = (
  results: DeezerTrackResult[]
): AurralNormalizedTrack[] =>
  results.map((result) => ({
    title: result.title,
    artistName: result.artistName,
    artistMbid: null,
    albumTitle: null,
    albumMbid: null,
    durationMs: null,
    coverUrl: result.coverUrl ?? null,
    previewDeezerId: String(result.id),
    inLibrary: false,
    ...(typeof result.rank === 'number' ? { popularity: result.rank } : {}),
  }));

/** MusicBrainz release groups for a search Aurral could not answer. */
const mapMusicBrainzFallbackAlbums = (
  results: MbAlbumDetails[]
): AurralNormalizedAlbum[] =>
  results.flatMap((album): AurralNormalizedAlbum[] => {
    const mbid = normalizeMusicBrainzId(album.id);
    if (!isValidMusicBrainzResourceId(mbid) || !album.title) return [];
    const credit = album['artist-credit']?.[0];
    const rawArtistId = credit?.artist?.id
      ? normalizeMusicBrainzId(credit.artist.id)
      : '';
    return [
      {
        mbid,
        title: album.title,
        artistName: credit?.name || credit?.artist?.name || '',
        artistMbid: isValidMusicBrainzResourceId(rawArtistId)
          ? rawArtistId
          : null,
        primaryType: album['primary-type'] || 'Album',
        releaseDate: album['first-release-date'] || null,
        coverUrl: `https://coverartarchive.org/release-group/${encodeURIComponent(mbid)}/front-250`,
        inLibrary: false,
      },
    ];
  });

const mapRecordingFallbackTracks = (
  recordings: MbRecordingDetails[]
): AurralNormalizedTrack[] =>
  recordings.slice(0, 3).map((recording) => {
    const bestRelease = pickBestRecordingRelease(recording.releases ?? []);
    const rawAlbumMbid = bestRelease?.['release-group']?.id
      ? normalizeMusicBrainzId(bestRelease['release-group'].id)
      : '';
    const albumMbid = isValidMusicBrainzResourceId(rawAlbumMbid)
      ? rawAlbumMbid
      : null;
    const rawArtistId = recording['artist-credit']?.[0]?.artist?.id
      ? normalizeMusicBrainzId(recording['artist-credit'][0].artist.id)
      : '';
    const artistMbid = isValidMusicBrainzResourceId(rawArtistId)
      ? rawArtistId
      : null;
    const artistName =
      recording['artist-credit']?.[0]?.artist?.name ||
      recording['artist-credit']?.[0]?.name ||
      '';

    return {
      title: recording.title,
      artistName,
      artistMbid,
      albumTitle:
        bestRelease?.['release-group']?.title ?? bestRelease?.title ?? null,
      albumMbid,
      durationMs:
        typeof recording.length === 'number' && recording.length > 0
          ? recording.length
          : null,
      coverUrl: albumMbid
        ? `https://coverartarchive.org/release-group/${encodeURIComponent(albumMbid)}/front`
        : null,
      previewDeezerId: null,
      inLibrary: false,
    };
  });

const executeMusicCatalogSearch = async ({
  aurral,
  deezer,
  musicbrainz,
  query,
  limit,
}: {
  aurral: MusicProvider;
  deezer: DeezerAPI;
  musicbrainz: MusicBrainz;
  query: string;
  limit: number;
}): Promise<{
  artists: AurralNormalizedArtist[];
  albums: AurralNormalizedAlbum[];
  tracks: AurralNormalizedTrack[];
  upstreamTop: AurralNormalizedTopResult | null;
  degraded: boolean;
  parsed: MusicQueryParseDetails;
}> => {
  const parsed = parseMusicQuery(query);
  const trimmed = query.trim();
  const structuredQuery =
    parsed.artist && parsed.title
      ? `${parsed.artist} ${parsed.title}`.trim()
      : parsed.cleanQuery &&
          parsed.cleanQuery.toLowerCase() !== trimmed.toLowerCase() &&
          (parsed.extraArtists.length > 0 || parsed.year !== null)
        ? parsed.cleanQuery
        : null;

  const secondaryPromise =
    structuredQuery && structuredQuery.toLowerCase() !== trimmed.toLowerCase()
      ? withShortTimeout(
          aurral.searchUnified(structuredQuery, limit),
          SEARCH_PRIMARY_TIMEOUT_MS
        ).catch(() => null)
      : Promise.resolve(null);

  // A failing Aurral search (network, timeout, 5xx, 429) must not fail the
  // whole search: answer as degraded so the Deezer / MusicBrainz fallbacks run.
  let primaryFailed = false;
  const [primary, secondary] = await Promise.all([
    withShortTimeout(
      aurral.searchUnified(trimmed, limit),
      SEARCH_PRIMARY_TIMEOUT_MS
    ).catch((error: unknown) => {
      primaryFailed = true;
      logger.warn('Aurral unified music search failed; using fallbacks', {
        label: 'Music API',
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      return {
        artists: [] as AurralNormalizedArtist[],
        albums: [] as AurralNormalizedAlbum[],
        tracks: [] as AurralNormalizedTrack[],
        top: null as AurralNormalizedTopResult | null,
        degraded: true,
      };
    }),
    secondaryPromise,
  ]);

  const degraded = primary.degraded || Boolean(secondary?.degraded);
  let artists = secondary
    ? mergeArtists(primary.artists, secondary.artists)
    : [...primary.artists];
  let albums = secondary
    ? mergeAlbums(primary.albums, secondary.albums)
    : [...primary.albums];
  let tracks = secondary
    ? [...primary.tracks, ...secondary.tracks]
    : [...primary.tracks];

  const needArtistFallback = degraded || artists.length === 0;
  const needAlbumFallback = degraded || albums.length === 0;
  const needTrackFallback = degraded || tracks.length === 0;

  if (needArtistFallback || needAlbumFallback || needTrackFallback) {
    const artistFallbackQuery = parsed.artist ?? (parsed.cleanQuery || trimmed);
    const albumFallbackQuery = parsed.cleanQuery || trimmed;

    // Deezer answers in well under a second even while Aurral is busy
    const [fallbackArtists, fallbackAlbums, fallbackTracks] = await Promise.all(
      [
        needArtistFallback
          ? withShortTimeout(deezer.searchArtists(artistFallbackQuery, 5))
              .then((items) => mapDeezerFallbackArtists(items, musicbrainz))
              .catch(() => [])
          : Promise.resolve([]),
        !needAlbumFallback
          ? Promise.resolve([])
          : primaryFailed
            ? // Aurral just failed: asking it again only waits out another
              // timeout, so albums come from MusicBrainz
              withShortTimeout(
                musicbrainz.searchAlbum({
                  query: escapeMusicBrainzQuery(albumFallbackQuery),
                  limit: Math.min(limit, 10),
                })
              )
                .then(mapMusicBrainzFallbackAlbums)
                .catch(() => [])
            : withShortTimeout(
                aurral.searchAlbums(albumFallbackQuery, limit)
              ).catch(() => []),
        needTrackFallback
          ? withShortTimeout(deezer.searchTracks(albumFallbackQuery, 10))
              .then(mapDeezerFallbackTracks)
              .catch(() => [])
          : Promise.resolve([]),
      ]
    );

    if (fallbackArtists.length > 0) {
      artists = mergeArtists(artists, fallbackArtists);
    }
    if (fallbackAlbums.length > 0) {
      albums = mergeAlbums(albums, fallbackAlbums);
    }
    if (fallbackTracks.length > 0) {
      // the song's artist page link, when that artist is among the results
      const artistIds = new Map(
        artists
          .filter((artist) => artist.mbid)
          .map((artist) => [normalizeMusicSearchText(artist.name), artist.mbid])
      );
      tracks = [
        ...tracks,
        ...fallbackTracks.map((track) => ({
          ...track,
          artistMbid:
            artistIds.get(normalizeMusicSearchText(track.artistName)) ?? null,
        })),
      ];
    }
  }

  // "Stand by Me" is a title, "kyoto by phoebe bridgers" is title + artist:
  // keep a guessed split only when the results back it up.
  const resolvedParsed = resolveMusicQuerySplit(parsed, {
    artists,
    albums,
    tracks,
  });

  if (
    resolvedParsed.artist &&
    resolvedParsed.title &&
    !hasTrackMatchingArtistAndTitle(tracks, resolvedParsed)
  ) {
    const recordings = await withShortTimeout(
      musicbrainz.searchRecording({
        query: `recording:"${escapeMusicBrainzQuery(resolvedParsed.title)}" AND artist:"${escapeMusicBrainzQuery(resolvedParsed.artist)}"`,
        limit: 10,
      })
    ).catch(() => []);
    if (recordings.length > 0) {
      tracks = [...tracks, ...mapRecordingFallbackTracks(recordings)];
    }
  }

  return {
    artists,
    albums,
    tracks,
    upstreamTop: primary.top ?? secondary?.top ?? null,
    degraded,
    parsed: resolvedParsed,
  };
};

const getReleaseGroupSearchTier = (
  group: AurralArtistReleaseGroup
): number | null => {
  if (group.primaryType === 'Album' && group.secondaryTypes.length === 0) {
    return 0;
  }
  if (group.primaryType === 'EP') {
    return 1;
  }
  if (group.primaryType === 'Single') {
    return 2;
  }
  return null;
};

const selectArtistTopReleaseGroups = (
  releaseGroups: AurralArtistReleaseGroup[],
  limit: number
): AurralArtistReleaseGroup[] =>
  releaseGroups
    .flatMap((group, index) => {
      const tier = getReleaseGroupSearchTier(group);
      return tier === null ? [] : [{ group, tier, index }];
    })
    .sort((a, b) => {
      if (a.tier !== b.tier) {
        return a.tier - b.tier;
      }
      if (a.group.year !== null && b.group.year !== null) {
        if (a.group.year !== b.group.year) {
          return b.group.year - a.group.year;
        }
        return a.index - b.index;
      }
      if (a.group.year !== null) return -1;
      if (b.group.year !== null) return 1;
      return a.index - b.index;
    })
    .slice(0, limit)
    .map((entry) => entry.group);

musicRoutes.get('/search', musicSearchRateLimit, async (req, res, next) => {
  const aurral = requireAurralMusicContext(req, res);
  if (!aurral) return;

  const parsedQuery = parseBoundedString(req.query.q, {
    fieldName: 'Query',
    maxLength: 256,
  });
  if ('error' in parsedQuery) {
    return res.status(400).json({ message: parsedQuery.error });
  }

  const parsedLimit = parseBoundedIntegerParam(req.query.limit, {
    fieldName: 'Limit',
    min: 1,
    max: 50,
    defaultValue: 12,
  });
  if ('error' in parsedLimit) {
    return res.status(400).json({ message: parsedLimit.error });
  }

  const limit = parsedLimit.value;
  const deezer = new DeezerAPI();
  const musicbrainz = getSharedMusicBrainz();

  try {
    let searchQuery = parsedQuery.value;
    const playlistLink = parseMusicPlaylistLink(searchQuery);
    if (playlistLink) {
      return res.status(200).json({
        artists: [],
        albums: [],
        tracks: [],
        top: null,
        degraded: false,
        library: { artists: [], albums: [], tracks: [] },
        link: playlistLink,
        correctedQuery: null,
        parsed: null,
        topArtistAlbumsFromArtist: false,
      });
    }

    let resolvedLink: AurralResolvedLink | null = null;
    const linkUrl = isMusicLinkQuery(searchQuery);

    if (linkUrl) {
      resolvedLink = await withShortTimeout(aurral.resolveLink(linkUrl)).catch(
        () => null
      );
      if (!resolvedLink || !resolvedLink.title) {
        return res.status(200).json({
          artists: [],
          albums: [],
          tracks: [],
          top: null,
          degraded: false,
          library: { artists: [], albums: [], tracks: [] },
          link: resolvedLink,
          correctedQuery: null,
          parsed: null,
          topArtistAlbumsFromArtist: false,
        });
      }
      searchQuery =
        resolvedLink.artistName && resolvedLink.type !== 'artist'
          ? `${resolvedLink.artistName} - ${resolvedLink.title}`
          : resolvedLink.title;
    }

    const emptyLibrary: AurralLibrarySearchResult = {
      artists: [],
      albums: [],
      tracks: [],
    };
    const ownedKeysPromise = loadOwnedSongKeys(aurral);
    const ownedAlbumsPromise = loadOwnedAlbums(aurral);
    const [initialCatalog, rawInitialLibrary] = await Promise.all([
      executeMusicCatalogSearch({
        aurral,
        deezer,
        musicbrainz,
        query: searchQuery,
        limit,
      }),
      withShortTimeout(aurral.searchLibrary(searchQuery, 8)).catch(
        () => emptyLibrary
      ),
    ]);

    let catalog = initialCatalog;
    let library = filterLibraryHits(searchQuery, rawInitialLibrary);
    let effectiveQuery = searchQuery;
    let correctedQuery: string | null = null;

    // A degraded first pass already ran the fallbacks; retrying with the
    // stripped query would repeat the slow chain against a failing Aurral.
    if (
      !catalog.degraded &&
      catalog.artists.length === 0 &&
      catalog.albums.length === 0 &&
      catalog.tracks.length === 0
    ) {
      const stripped = stripMusicSearchFiller(searchQuery);
      if (stripped) {
        effectiveQuery = stripped;
        correctedQuery = stripped;
        const [retriedCatalog, rawRetriedLibrary] = await Promise.all([
          executeMusicCatalogSearch({
            aurral,
            deezer,
            musicbrainz,
            query: stripped,
            limit,
          }),
          library.artists.length === 0 &&
          library.albums.length === 0 &&
          library.tracks.length === 0
            ? withShortTimeout(aurral.searchLibrary(stripped, 8))
                .then((hits) => filterLibraryHits(stripped, hits))
                .catch(() => emptyLibrary)
            : Promise.resolve(library),
        ]);
        catalog = retriedCatalog;
        library = rawRetriedLibrary;
      }
    }

    const topAlbumMbid =
      catalog.upstreamTop?.type === 'album'
        ? catalog.upstreamTop.mbid
        : catalog.upstreamTop?.type === 'track'
          ? catalog.upstreamTop.albumMbid
          : null;
    const mediaMap = await loadRelatedMusicMediaMap(
      [
        ...catalog.albums.map((album) => album.mbid),
        ...catalog.tracks.map((track) => track.albumMbid),
        ...library.albums.map((album) => album.mbid),
        ...library.tracks.map((track) => track.albumMbid),
        topAlbumMbid,
      ],
      req.user
    );

    const ownedAlbums = await ownedAlbumsPromise;
    // a library hit is in the library; the index says whether all of it is
    const enrichedLibraryAlbums = library.albums.map((album) =>
      withOwnedAlbum(
        { ...enrichAurralAlbum(album, mediaMap, req.user), inLibrary: true },
        ownedAlbums
      )
    );
    const enrichedLibraryTracks = library.tracks.map((track) => ({
      ...enrichAurralTrack(track, mediaMap),
      inLibrary: true,
    }));
    // several albums with exactly the searched title: Deezer's album search
    // (cached) says which one people mean
    const albumTitleQuery = stripEditionWords(
      catalog.parsed.cleanQuery || effectiveQuery
    );
    const sameTitleAlbums = catalog.albums.filter(
      (album) =>
        albumTitleQuery && stripEditionWords(album.title) === albumTitleQuery
    );
    const albumPopularity = new Map<string, number>();
    if (
      sameTitleAlbums.length >= 2 &&
      !(catalog.parsed.artist && catalog.parsed.title)
    ) {
      const deezerAlbums = await withShortTimeout(
        Promise.resolve().then(() => deezer.searchAlbums(effectiveQuery, 10)),
        REFINE_LOOKUP_TIMEOUT_MS
      ).catch(() => []);
      deezerAlbums.forEach((album, position) => {
        const key = albumPopularityKey(album.artistName, album.title);
        if (!albumPopularity.has(key)) albumPopularity.set(key, position);
      });
    }
    const enrichedCatalogAlbums = sortAlbumsForSearch(
      catalog.albums.map((album) =>
        enrichAurralAlbum(album, mediaMap, req.user, ownedAlbums)
      ),
      effectiveQuery,
      catalog.parsed,
      albumPopularity
    );
    const leadAlbum = enrichedCatalogAlbums[0];
    const popularAlbum =
      leadAlbum &&
      leadAlbum.mbid &&
      leadAlbum.primaryType === 'Album' &&
      stripEditionWords(leadAlbum.title) === albumTitleQuery &&
      albumPopularity.get(
        albumPopularityKey(leadAlbum.artistName, leadAlbum.title)
      ) === 0
        ? leadAlbum
        : null;
    const enrichedCatalogArtists = sortArtistsForSearch(
      catalog.artists,
      effectiveQuery,
      catalog.parsed
    );

    const matchingYearAlbumTitles =
      catalog.parsed.year !== null
        ? new Set(
            enrichedCatalogAlbums
              .filter((album) =>
                album.releaseDate?.startsWith(String(catalog.parsed.year))
              )
              .map((album) => normalizeMusicSearchText(album.title))
              .filter(Boolean)
          )
        : undefined;

    const ownedKeys = await ownedKeysPromise;
    let rankedTracks = rankAndDedupeTracks(
      markOwnedSongs(
        catalog.tracks.map((track) => enrichAurralTrack(track, mediaMap)),
        ownedKeys
      ),
      effectiveQuery,
      catalog.parsed,
      matchingYearAlbumTitles
    ).slice(0, limit);

    // "i wanna dance with somebody": several songs carry the title and the
    // famous one is not first. Aurral's songs have no popularity, so ask
    // Deezer's track search (cached) for its rank when the title rule applies.
    const titleKey = musicMatchKey(catalog.parsed.cleanQuery || effectiveQuery);
    if (
      !(catalog.parsed.artist && catalog.parsed.title) &&
      rankedTracks
        .slice(0, 5)
        .filter((track) => isSameTitleTrack(track, titleKey)).length >= 3
    ) {
      const deezerTracks = await withShortTimeout(
        Promise.resolve().then(() => deezer.searchTracks(effectiveQuery, 25)),
        REFINE_LOOKUP_TIMEOUT_MS
      ).catch(() => []);
      rankedTracks = applyTrackPopularity(rankedTracks, deezerTracks);
    }

    // "pink": the songs are all by P!nk but the artist search only listed an
    // obscure "PINK". Lead with the artist the songs belong to.
    let rankedArtists = enrichedCatalogArtists;
    let promotedArtist: AurralNormalizedArtist | null = null;
    const dominantTrackArtist = findDominantTrackArtist({
      query: effectiveQuery,
      parsed: catalog.parsed,
      tracks: rankedTracks,
    });
    if (dominantTrackArtist) {
      const plan = planTrackArtistResolution({
        query: effectiveQuery,
        parsed: catalog.parsed,
        artists: enrichedCatalogArtists,
        libraryArtists: library.artists,
        dominant: dominantTrackArtist,
      });
      promotedArtist =
        plan.kind === 'promote'
          ? plan.artist
          : plan.kind === 'lookup'
            ? await lookupTrackArtist(
                aurral,
                musicbrainz,
                dominantTrackArtist,
                enrichedCatalogArtists
              )
            : null;
      if (promotedArtist) {
        rankedArtists = promoteArtist(rankedArtists, promotedArtist);
      }
    }

    const chosenTop = selectTopResult({
      query: effectiveQuery,
      parsed: catalog.parsed,
      artists: rankedArtists,
      albums: enrichedCatalogAlbums,
      tracks: rankedTracks,
      upstreamTop: catalog.upstreamTop,
      popularAlbum,
    });
    const selectedTop: AurralNormalizedTopResult | null =
      promotedArtist &&
      chosenTop?.type === 'artist' &&
      musicNamesEqual(
        musicMatchKey(chosenTop.name),
        musicMatchKey(promotedArtist.name)
      )
        ? { type: 'artist', ...rankedArtists[0] }
        : chosenTop;

    let finalArtists = rankedArtists;
    let finalAlbums: ReturnType<typeof enrichAurralAlbum>[] =
      enrichedCatalogAlbums;
    let finalTop = selectedTop;
    let topArtistAlbumsFromArtist = false;

    if (selectedTop?.type === 'artist' && selectedTop.mbid) {
      const topArtistMbid = normalizeMusicBrainzId(selectedTop.mbid);
      const needsTopImage = !selectedTop.image;
      const needsArtistListImage = finalArtists.some(
        (artist) =>
          artist.mbid !== null &&
          normalizeMusicBrainzId(artist.mbid) === topArtistMbid &&
          !artist.image
      );

      const [artistDetails, libraryReleaseGroups, resolvedArtistImage] =
        await Promise.all([
          withShortTimeout(
            aurral.getArtistDetails(topArtistMbid),
            SEARCH_AUX_TIMEOUT_MS
          ).catch(() => null),
          withShortTimeout(
            aurral.getLibraryArtistReleaseGroups(topArtistMbid),
            SEARCH_AUX_TIMEOUT_MS
          ).catch(() => null),
          needsTopImage || needsArtistListImage
            ? withShortTimeout(
                aurral.getArtistImageUrl(topArtistMbid, selectedTop.name),
                SEARCH_AUX_TIMEOUT_MS
              ).catch(() => null)
            : Promise.resolve(null),
        ]);

      if (resolvedArtistImage) {
        if (needsTopImage) {
          finalTop = {
            ...selectedTop,
            image: resolvedArtistImage,
          };
        }
        if (needsArtistListImage) {
          finalArtists = finalArtists.map((artist) =>
            artist.mbid !== null &&
            normalizeMusicBrainzId(artist.mbid) === topArtistMbid &&
            !artist.image
              ? { ...artist, image: resolvedArtistImage }
              : artist
          );
        }
      }

      if (artistDetails && artistDetails.releaseGroups.length > 0) {
        const selectedGroups = selectArtistTopReleaseGroups(
          artistDetails.releaseGroups,
          limit
        );
        if (selectedGroups.length > 0) {
          const detailsMediaMap = await loadRelatedMusicMediaMap(
            selectedGroups.map((group) => group.id),
            req.user
          );
          const ownedGroupIds = new Set(
            [
              ...(libraryReleaseGroups?.owned ?? []),
              ...library.albums
                .map((album) => album.mbid)
                .filter((id): id is string => Boolean(id)),
            ].map(normalizeMusicBrainzId)
          );
          const partialGroupIds = new Set(
            [...(libraryReleaseGroups?.partial ?? [])].map(
              normalizeMusicBrainzId
            )
          );
          const resolvedArtistName =
            artistDetails.name &&
            artistDetails.name.toLowerCase() !== 'unknown artist'
              ? artistDetails.name
              : selectedTop.name;
          const resolvedArtistMbid = artistDetails.mbid || topArtistMbid;

          finalAlbums = selectedGroups.map((group) => {
            const normalizedGroupId = normalizeMusicBrainzId(group.id);
            const media = detailsMediaMap.get(normalizedGroupId);
            const groupFlags = group as AurralArtistReleaseGroup & {
              inLibrary?: boolean;
              partial?: boolean;
            };
            const inLibrary =
              groupFlags.inLibrary === true ||
              ownedGroupIds.has(normalizedGroupId) ||
              media?.status === MediaStatus.AVAILABLE;
            const partial =
              !inLibrary &&
              (groupFlags.partial === true ||
                partialGroupIds.has(normalizedGroupId) ||
                media?.status === MediaStatus.PARTIALLY_AVAILABLE);

            return withOwnedAlbum(
              {
                mbid: group.id,
                title: group.title,
                artistName: resolvedArtistName,
                artistMbid: resolvedArtistMbid,
                primaryType: group.primaryType,
                releaseDate: group.year !== null ? String(group.year) : null,
                coverUrl:
                  group.coverUrl ??
                  `https://coverartarchive.org/release-group/${encodeURIComponent(group.id)}/front-250`,
                inLibrary,
                partial,
                ...(media
                  ? { mediaInfo: filterEntityResponse(media, req.user) }
                  : {}),
              },
              ownedAlbums
            );
          });
          topArtistAlbumsFromArtist = true;
        }
      }
    }

    const focusedArtists =
      finalTop &&
      (finalTop.type === 'album' || finalTop.type === 'track') &&
      finalTop.artistName
        ? focusArtistsOnTop(finalArtists, finalTop, effectiveQuery)
        : finalArtists;

    // Songs with no artist MBID by the exact-name artist link to that artist.
    const queryArtistKey = musicMatchKey(
      catalog.parsed.cleanQuery || effectiveQuery
    );
    const trackArtistAnchor =
      finalTop?.type === 'artist' && finalTop.mbid
        ? finalTop
        : (focusedArtists.find(
            (artist) =>
              artist.mbid &&
              musicNamesEqual(musicMatchKey(artist.name), queryArtistKey)
          ) ?? null);
    // Normalised-name matches ("P!nk" songs, "Pink" anchor) only take the
    // MBID of the artist resolved from these songs.
    const anchorIsResolvedArtist = Boolean(
      promotedArtist?.mbid &&
      trackArtistAnchor?.mbid &&
      normalizeMusicBrainzId(promotedArtist.mbid) ===
        normalizeMusicBrainzId(trackArtistAnchor.mbid)
    );

    // a song as the top result: its album leads the albums row
    const topSongAlbumId =
      finalTop?.type === 'track' && finalTop.albumMbid
        ? normalizeMusicBrainzId(finalTop.albumMbid)
        : null;
    const collapsedAlbums = collapseRedundantAlbumResults(finalAlbums, {
      query: catalog.parsed.cleanQuery || effectiveQuery,
      keepMbids: [
        finalTop?.type === 'album' ? finalTop.mbid : null,
        topSongAlbumId,
      ],
      ownedAlbums: enrichedLibraryAlbums,
      tracks: rankedTracks,
    });
    // the id alone is not enough: Aurral can name the album ("A Night at the
    // Opera") while the id is a single's, and the single must not jump ahead
    const topSongAlbumTitle =
      finalTop?.type === 'track' && finalTop.albumTitle
        ? musicMatchKey(finalTop.albumTitle)
        : null;
    const isTopSongAlbum = (album: { mbid: string | null; title: string }) =>
      Boolean(
        topSongAlbumId &&
        album.mbid &&
        normalizeMusicBrainzId(album.mbid) === topSongAlbumId &&
        (!topSongAlbumTitle || musicMatchKey(album.title) === topSongAlbumTitle)
      );
    const shownAlbums = [
      ...collapsedAlbums.filter(isTopSongAlbum),
      ...collapsedAlbums.filter((album) => !isTopSongAlbum(album)),
    ].slice(0, limit);
    // An album listed in the catalog rails (or as the top result) is not
    // listed again under "In your library": one card, with its real state.
    const shownAlbumIds = new Set(
      [
        ...shownAlbums.map((album) => album.mbid),
        finalTop?.type === 'album' ? finalTop.mbid : null,
      ]
        .filter((id): id is string => Boolean(id))
        .map(normalizeMusicBrainzId)
    );
    const libraryAlbumsShown = enrichedLibraryAlbums.filter(
      (album) =>
        !album.mbid || !shownAlbumIds.has(normalizeMusicBrainzId(album.mbid))
    );
    // two library artists with one name (a band member's MBID) are one row
    const seenLibraryArtists = new Set<string>();
    const libraryArtistsShown = library.artists.filter((artist) => {
      const key = musicMatchKey(artist.name);
      if (!key) return true;
      if (seenLibraryArtists.has(key)) return false;
      seenLibraryArtists.add(key);
      return true;
    });

    return res.status(200).json({
      artists: withOwnedArtists(focusedArtists.slice(0, limit), ownedAlbums),
      albums: shownAlbums,
      tracks: fillTrackArtistMbids(rankedTracks, trackArtistAnchor, {
        allowNormalized: anchorIsResolvedArtist,
      }).map(stripTrackPopularity),
      top:
        finalTop?.type === 'artist'
          ? withOwnedArtists([finalTop], ownedAlbums)[0]
          : enrichAurralTopResult(finalTop, mediaMap, req.user, ownedAlbums),
      degraded: catalog.degraded,
      library: {
        artists: libraryArtistsShown,
        albums: libraryAlbumsShown,
        tracks: enrichedLibraryTracks,
      },
      link: resolvedLink,
      correctedQuery,
      parsed: formatParsedMusicQuery(catalog.parsed),
      topArtistAlbumsFromArtist,
    });
  } catch (error) {
    logger.warn('Aurral unified music search failed', {
      label: 'Music API',
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    });
    return next({
      status: 502,
      message: 'Unable to search music.',
    });
  }
});

// The trending chart for everyone: chart albums get their MBIDs through Aurral
// searches, so it is built once and shared (see DISCOVER_READ).
const readTrendingChart = (aurral: MusicProvider) =>
  cachedMusicRead(
    `discover:${ownedSongServerKey()}:trending`,
    DISCOVER_READ,
    async () => {
      const chart = await aurral.getTrending();
      return {
        ...chart,
        albums: (await resolveChartAlbumIds(aurral, chart.albums)).filter(
          (album) => !isFillerAlbum(album)
        ),
      };
    }
  );

/**
 * Reads the shared music answers once after a start, so the first person on
 * the music page after an update does not wait for a cold chart (about 9 s
 * while Aurral is busy) or library page. Aurral only; never throws.
 */
export const warmMusicReads = async (): Promise<void> => {
  try {
    const server = getDefaultAurralServer(getSettings().aurral);
    if (!server?.hostname || !server.apiKey) return;
    const aurral = new AurralAPI({
      url: AurralAPI.buildUrl(server),
      apiKey: server.apiKey,
    });
    const key = ownedSongServerKey();
    // one at a time: a warm-up must not add a burst to a busy Aurral
    const steps: (() => Promise<unknown>)[] = [
      () => loadOwnedSongKeys(aurral, { firstBuildWaitMs: 60_000 }),
      () => loadOwnedAlbums(aurral, { firstBuildWaitMs: 60_000 }),
      () =>
        cachedMusicRead(`library:${key}:overview`, LIBRARY_READ, () =>
          aurral.getLibraryPage('albums', 'newest', 1, 12)
        ),
      () => readTrendingChart(aurral),
      () =>
        cachedMusicRead(`discover:${key}:recommended`, DISCOVER_READ, () =>
          aurral.getDiscoverRecommended()
        ),
      () =>
        cachedMusicRead(`discover:${key}:playlists`, DISCOVER_READ, () =>
          aurral.getDiscoverPlaylists()
        ),
    ];
    for (const step of steps) await step().catch(() => undefined);
  } catch (error) {
    logger.debug('Music warm-up skipped', {
      label: 'Music API',
      errorMessage: error instanceof Error ? error.message : String(error),
    });
  }
};

musicRoutes.get('/discover/trending', async (req, res, next) => {
  const aurral = requireAurralMusicContext(req, res);
  if (!aurral) return;

  try {
    const [trending, ownedKeys, ownedAlbums] = await Promise.all([
      readTrendingChart(aurral),
      loadOwnedSongKeys(aurral),
      loadOwnedAlbums(aurral),
    ]);
    const mediaMap = await loadRelatedMusicMediaMap(
      [
        ...trending.albums.map((album) => album.mbid),
        ...trending.tracks.map((track) => track.albumMbid),
      ],
      req.user
    );

    return res.status(200).json({
      artists: withOwnedArtists(trending.artists, ownedAlbums),
      // each album once, without singles whose song a listed album has
      albums: collapseRedundantAlbumResults(
        trending.albums.map((album) =>
          enrichAurralAlbum(album, mediaMap, req.user, ownedAlbums)
        ),
        { tracks: trending.tracks }
      ),
      // a song owned on another release (a compilation) is owned here too
      tracks: markOwnedSongs(
        trending.tracks.map((track) => enrichAurralTrack(track, mediaMap)),
        ownedKeys
      ),
    });
  } catch (error) {
    logger.warn('Aurral trending music discovery failed', {
      label: 'Music API',
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    });
    return next({
      status: 502,
      message: 'Unable to load trending music.',
    });
  }
});

musicRoutes.get('/discover/genres', async (req, res, next) => {
  const aurral = requireAurralMusicContext(req, res);
  if (!aurral) return;

  const parsedQuery = parseOptionalBoundedString(req.query.q, {
    fieldName: 'Query',
    maxLength: 100,
  });
  if ('error' in parsedQuery) {
    return res.status(400).json({ message: parsedQuery.error });
  }

  const parsedLimit = parseBoundedIntegerParam(req.query.limit, {
    fieldName: 'Limit',
    min: 1,
    max: 20,
    defaultValue: 20,
  });
  if ('error' in parsedLimit) {
    return res.status(400).json({ message: parsedLimit.error });
  }

  try {
    const tags = await aurral.getDiscoverTags({
      q: parsedQuery.value,
      limit: parsedLimit.value,
    });
    return res.status(200).json({ tags });
  } catch (error) {
    logger.warn('Aurral music genre list failed', {
      label: 'Music API',
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    });
    return next({
      status: 502,
      message: 'Unable to load music genres.',
    });
  }
});

musicRoutes.get('/discover/genre', async (req, res, next) => {
  const aurral = requireAurralMusicContext(req, res);
  if (!aurral) return;

  const parsedTag = parseBoundedString(req.query.tag, {
    fieldName: 'Tag',
    maxLength: 128,
  });
  if ('error' in parsedTag) {
    return res.status(400).json({ message: parsedTag.error });
  }

  const parsedLimit = parseBoundedIntegerParam(req.query.limit, {
    fieldName: 'Limit',
    min: 1,
    max: 50,
    defaultValue: 24,
  });
  if ('error' in parsedLimit) {
    return res.status(400).json({ message: parsedLimit.error });
  }

  const parsedOffset = parseBoundedIntegerParam(req.query.offset, {
    fieldName: 'Offset',
    min: 0,
    max: 1000,
    defaultValue: 0,
  });
  if ('error' in parsedOffset) {
    return res.status(400).json({ message: parsedOffset.error });
  }

  // Aurral's tag discovery answers the big genres with unrelated artists
  // (hip hop -> Nirvana). When the tag is a Deezer genre its artists come
  // first; Aurral answers tags Deezer has no genre for, or when Deezer fails.
  // Deezer artists carry no MBID: the owned-album index knows them by name.
  const ownedAlbumsPromise = loadOwnedAlbums(aurral);
  const deezerArtists = await withShortTimeout(
    Promise.resolve().then(() =>
      new DeezerAPI().getArtistsForGenreTag(parsedTag.value)
    )
  ).catch((error: unknown) => {
    logger.debug('Deezer genre artists failed; using Aurral', {
      label: 'Music API',
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return [] as DeezerArtistResult[];
  });
  const ownedAlbums = await ownedAlbumsPromise;
  if (deezerArtists.length > 0) {
    return res.status(200).json({
      tag: parsedTag.value.trim(),
      artists: deezerArtists
        .slice(parsedOffset.value, parsedOffset.value + parsedLimit.value)
        .map((artist) => ({
          mbid: null,
          name: artist.name,
          image: artist.pictureXl,
          inLibrary: false,
        }))
        .map((artist) => withOwnedArtists([artist], ownedAlbums)[0]),
    });
  }

  try {
    const genre = await aurral.getDiscoverByTag(parsedTag.value, {
      limit: parsedLimit.value,
      offset: parsedOffset.value,
    });
    return res.status(200).json(genre);
  } catch (error) {
    logger.warn('Aurral music genre discovery failed', {
      label: 'Music API',
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    });
    return next({
      status: 502,
      message: 'Unable to load artists for this genre.',
    });
  }
});

const MAX_LIBRARY_ART_ID = 2 ** 31;
const MAX_LIBRARY_PAGE = 10_000;
const MAX_LIBRARY_PAGE_SIZE = 60;
const MAX_ACTIVITY_QUEUED = 50;
const MAX_ACTIVITY_RECENT = 20;
const PLAYLIST_PROVIDER_PATTERN = /^[a-z][a-z0-9-]{0,31}$/;
const PLAYLIST_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const parseTimestampMs = (value: string | null | undefined): number | null => {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
};

const compareRequestedAtAsc = (
  a: AurralActivityItem,
  b: AurralActivityItem
): number => {
  const ta = parseTimestampMs(a.requestedAt);
  const tb = parseTimestampMs(b.requestedAt);
  if (ta !== null && tb !== null) return ta - tb;
  if (ta !== null) return -1;
  if (tb !== null) return 1;
  return 0;
};

const compareCompletedDesc = (
  a: AurralActivityItem,
  b: AurralActivityItem
): number => {
  const ta = parseTimestampMs(a.completedAt ?? a.requestedAt);
  const tb = parseTimestampMs(b.completedAt ?? b.requestedAt);
  if (ta !== null && tb !== null) return tb - ta;
  if (ta !== null) return -1;
  if (tb !== null) return 1;
  return 0;
};

/**
 * Albums with songs downloading or waiting, so album cards and pages can say
 * "Downloading" while Aurral works through them (Aurral reports songs, and a
 * SeerrNG album request carries no download of its own).
 */
const summarizeActivityAlbums = (
  active: AurralActivityItem[],
  pending: AurralActivityItem[]
) => {
  const albums = new Map<
    string,
    {
      albumMbid: string | null;
      albumName: string | null;
      artistName: string | null;
      downloading: number;
      queued: number;
    }
  >();
  const add = (item: AurralActivityItem, downloading: boolean) => {
    const mbid = item.albumMbid?.trim()
      ? normalizeMusicBrainzId(item.albumMbid.trim())
      : '';
    const albumName = item.albumName?.trim() || null;
    const artistName = item.artistName?.trim() || null;
    const key = mbid || (albumName ? `${artistName ?? ''}|${albumName}` : '');
    if (!key) return;
    const entry = albums.get(key) ?? {
      albumMbid: isValidMusicBrainzResourceId(mbid) ? mbid : null,
      albumName,
      artistName,
      downloading: 0,
      queued: 0,
    };
    if (downloading) entry.downloading += 1;
    else entry.queued += 1;
    albums.set(key, entry);
  };
  for (const item of active) add(item, true);
  for (const item of pending) add(item, false);
  return [...albums.values()].slice(0, 100);
};

const activityAlbumMbid = (item: AurralActivityItem): string | null => {
  const mbid = item.albumMbid?.trim()
    ? normalizeMusicBrainzId(item.albumMbid.trim())
    : '';
  return isValidMusicBrainzResourceId(mbid) ? mbid : null;
};

const activityFailureReason = (item: AurralActivityItem): string | null => {
  if (item.status !== 'failed') return null;
  const text = item.subtitle?.replace(/\s+/g, ' ').trim();
  if (!text) return null;
  const artist = item.artistName?.trim().toLowerCase();
  // "Artist · Playlist" is the plain label, not a reason
  if (artist && text.toLowerCase().startsWith(artist)) return null;
  return text.length > 200 ? `${text.slice(0, 199)}…` : text;
};

const mapMusicActivityItem = (item: AurralActivityItem) => ({
  // the song's album, when Aurral names it (album-aware "Downloading")
  ...(activityAlbumMbid(item) ? { albumMbid: activityAlbumMbid(item) } : {}),
  id: item.id,
  title:
    item.trackName?.trim() ||
    item.albumName?.trim() ||
    item.title?.trim() ||
    '',
  artistName: item.artistName?.trim() || null,
  albumName: item.albumName?.trim() || null,
  status: item.status,
  statusLabel: item.statusLabel?.trim() || null,
  source: item.source?.trim() || null,
  requestedAt: item.requestedAt?.trim() || null,
  cause: item.cause ?? null,
  // Aurral puts why a download failed in the subtitle (or just the artist)
  ...(activityFailureReason(item)
    ? { reason: activityFailureReason(item) }
    : {}),
});

musicRoutes.get('/discover/recommended', async (req, res, next) => {
  const aurral = requireAurralMusicContext(req, res);
  if (!aurral) return;

  try {
    const [result, ownedAlbums] = await Promise.all([
      cachedMusicRead(
        `discover:${ownedSongServerKey()}:recommended`,
        DISCOVER_READ,
        () => aurral.getDiscoverRecommended()
      ),
      loadOwnedAlbums(aurral),
    ]);
    return res.status(200).json({
      ...result,
      recommendations: withOwnedArtists(result.recommendations, ownedAlbums),
      trending: withOwnedArtists(result.trending, ownedAlbums),
    });
  } catch (error) {
    logger.warn('Aurral recommended music discovery failed', {
      label: 'Music API',
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    });
    return next({
      status: 502,
      message: 'Unable to load recommended music.',
    });
  }
});

musicRoutes.get('/discover/playlists', async (req, res, next) => {
  const aurral = requireAurralMusicContext(req, res);
  if (!aurral) return;

  try {
    const result = await cachedMusicRead(
      `discover:${ownedSongServerKey()}:playlists`,
      DISCOVER_READ,
      () => aurral.getDiscoverPlaylists()
    );
    return res.status(200).json(result);
  } catch (error) {
    logger.warn('Aurral playlist discovery failed', {
      label: 'Music API',
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    });
    return next({
      status: 502,
      message: 'Unable to load music playlists.',
    });
  }
});

musicRoutes.get(
  '/discover/playlists/:provider/:playlistId',
  async (req, res, next) => {
    const aurral = requireAurralMusicContext(req, res);
    if (!aurral) return;

    const provider =
      typeof req.params.provider === 'string' ? req.params.provider : '';
    const playlistId =
      typeof req.params.playlistId === 'string' ? req.params.playlistId : '';

    if (!PLAYLIST_PROVIDER_PATTERN.test(provider)) {
      return res.status(400).json({ message: 'Playlist provider is invalid.' });
    }
    if (!PLAYLIST_ID_PATTERN.test(playlistId)) {
      return res.status(400).json({ message: 'Playlist ID is invalid.' });
    }

    try {
      const [playlist, ownedKeys] = await Promise.all([
        aurral.getDiscoverPlaylist(provider, playlistId),
        loadOwnedSongKeys(aurral),
      ]);
      if (!playlist) {
        return res.status(404).json({ message: 'Playlist not found.' });
      }
      // the same album-level state search and charts give a song: owned with
      // its album, or asked for with an album request still open
      const mediaMap = await loadRelatedMusicMediaMap(
        playlist.tracks.map((track) => track.albumMbid),
        req.user
      ).catch(() => new Map<string, Media>());
      return res.status(200).json({
        ...playlist,
        tracks: markOwnedSongs(
          playlist.tracks.map((track) => withAlbumMedia(track, mediaMap)),
          ownedKeys
        ),
      });
    } catch (error) {
      logger.warn('Aurral playlist detail lookup failed', {
        label: 'Music API',
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      });
      return next({
        status: 502,
        message: 'Unable to load playlist.',
      });
    }
  }
);

musicRoutes.get('/preview', async (req, res, next) => {
  const aurral = requireAurralMusicContext(req, res);
  if (!aurral) return;

  const hasDeezerId = req.query.deezerId !== undefined;
  let deezerId: string | undefined;
  let artist: string | undefined;
  let track: string | undefined;

  if (hasDeezerId) {
    if (
      typeof req.query.deezerId !== 'string' ||
      !/^\d{1,20}$/.test(req.query.deezerId.trim())
    ) {
      return res
        .status(400)
        .json({ message: 'Deezer ID must be 1 to 20 digits.' });
    }
    deezerId = req.query.deezerId.trim();
  } else {
    const parsedArtist = parseBoundedString(req.query.artist, {
      fieldName: 'Artist',
      maxLength: 256,
    });
    if ('error' in parsedArtist) {
      return res.status(400).json({ message: parsedArtist.error });
    }

    const parsedTrack = parseBoundedString(req.query.track, {
      fieldName: 'Track',
      maxLength: 256,
    });
    if ('error' in parsedTrack) {
      return res.status(400).json({ message: parsedTrack.error });
    }

    artist = parsedArtist.value;
    track = parsedTrack.value;
  }

  try {
    let audio: Buffer | null;
    if (deezerId !== undefined) {
      audio = await aurral.getDeezerPreviewClip(deezerId);
    } else if (artist !== undefined && track !== undefined) {
      const link = await aurral.getPreviewLink(artist, track);
      if (!link) {
        return res.status(404).json({ message: 'No preview for this song.' });
      }
      audio = await aurral.downloadPreview(link);
    } else {
      return res.status(400).json({ message: 'Invalid preview parameters.' });
    }

    if (!audio) {
      return res.status(404).json({ message: 'No preview for this song.' });
    }

    res.set('Content-Type', 'audio/mpeg');
    res.set('Cache-Control', 'private, max-age=600');
    res.set('X-Content-Type-Options', 'nosniff');
    return res.status(200).send(audio);
  } catch (error) {
    logger.warn('Aurral track preview failed', {
      label: 'Music API',
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    });
    return next({
      status: 502,
      message: 'Unable to load a preview.',
    });
  }
});

musicRoutes.get(
  '/library-art/:kind/:id',
  musicImageRateLimit,
  async (req, res, next) => {
    const aurral = requireAurralMusicContext(req, res);
    if (!aurral) return;

    const rawKind = req.params.kind;
    if (rawKind !== 'albums' && rawKind !== 'artists') {
      return res
        .status(400)
        .json({ message: 'Kind must be albums or artists.' });
    }
    const kind: AurralLibraryKind = rawKind;

    const rawId = typeof req.params.id === 'string' ? req.params.id.trim() : '';
    const id = /^\d+$/.test(rawId) ? Number(rawId) : Number.NaN;
    if (!Number.isSafeInteger(id) || id < 1 || id > MAX_LIBRARY_ART_ID) {
      return res.status(400).json({
        message: `ID must be an integer between 1 and ${MAX_LIBRARY_ART_ID}.`,
      });
    }

    try {
      const artwork = await cachedMusicCover(
        `cover:${ownedSongServerKey()}:${kind}:${id}`,
        COVER_READ,
        () => aurral.getLibraryArtwork(kind, id)
      );
      if (!artwork) {
        return res.status(404).json({ message: 'Artwork not found.' });
      }

      res.set('Content-Type', artwork.contentType);
      res.set('Cache-Control', 'private, max-age=86400');
      res.set('X-Content-Type-Options', 'nosniff');
      return res.status(200).send(artwork.buffer);
    } catch (error) {
      logger.warn('Aurral library artwork lookup failed', {
        label: 'Music API',
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      });
      return next({
        status: 502,
        message: 'Unable to load library artwork.',
      });
    }
  }
);

musicRoutes.get('/library', async (req, res, next) => {
  const aurral = requireAurralMusicContext(req, res);
  if (!aurral) return;

  const parsedKind = parseBoundedString(req.query.kind, {
    fieldName: 'Kind',
    maxLength: 16,
  });
  if (
    'error' in parsedKind ||
    !AURRAL_LIBRARY_KINDS.includes(parsedKind.value as AurralLibraryKind)
  ) {
    return res.status(400).json({ message: 'Kind must be albums or artists.' });
  }
  const kind = parsedKind.value as AurralLibraryKind;

  const parsedSort = parseOptionalAllowedString(req.query.sort, {
    fieldName: 'Sort',
    allowedValues: AURRAL_LIBRARY_SORTS,
    maxLength: 32,
  });
  if ('error' in parsedSort) {
    return res.status(400).json({ message: parsedSort.error });
  }
  const sort = parsedSort.value ?? 'newest';

  const parsedPage = parseBoundedIntegerParam(req.query.page, {
    fieldName: 'Page',
    min: 1,
    max: MAX_LIBRARY_PAGE,
    defaultValue: 1,
  });
  if ('error' in parsedPage) {
    return res.status(400).json({ message: parsedPage.error });
  }

  const parsedPageSize = parseBoundedIntegerParam(req.query.pageSize, {
    fieldName: 'Page size',
    min: 1,
    max: MAX_LIBRARY_PAGE_SIZE,
    defaultValue: 30,
  });
  if ('error' in parsedPageSize) {
    return res.status(400).json({ message: parsedPageSize.error });
  }

  // a name filter: albums, artists or songs whose names match
  const parsedQuery = parseOptionalBoundedString(req.query.q, {
    fieldName: 'Query',
    maxLength: MAX_LIBRARY_QUERY_LENGTH,
  });
  if ('error' in parsedQuery) {
    return res.status(400).json({ message: parsedQuery.error });
  }

  try {
    const filter = parsedQuery.value?.trim() || undefined;
    const libraryPage = await cachedMusicRead(
      `library:${ownedSongServerKey()}:${JSON.stringify([
        kind,
        sort,
        parsedPage.value,
        parsedPageSize.value,
        filter ?? '',
      ])}`,
      LIBRARY_READ,
      () =>
        aurral.getLibraryPage(
          kind,
          sort,
          parsedPage.value,
          parsedPageSize.value,
          filter
        )
    );
    return res.status(200).json(libraryPage);
  } catch (error) {
    logger.warn('Aurral library page lookup failed', {
      label: 'Music API',
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    });
    return next({
      status: 502,
      message: 'Unable to load your music library.',
    });
  }
});

musicRoutes.get('/activity', async (req, res, next) => {
  const aurral = requireAurralMusicContext(req, res);
  if (!aurral) return;

  try {
    const [items, ownedKeys] = await Promise.all([
      cachedMusicRead(`activity:${ownedSongServerKey()}`, ACTIVITY_READ, () =>
        aurral.getActivity()
      ),
      loadOwnedSongKeys(aurral).catch(() => null),
    ]);
    const activeItems = items
      .filter((item) => item.status === 'processing')
      .sort(compareRequestedAtAsc);
    const active = activeItems.map(mapMusicActivityItem);
    const pending = items
      .filter((item) => item.status === 'pending')
      .sort(compareRequestedAtAsc);
    const queued = pending
      .slice(0, MAX_ACTIVITY_QUEUED)
      .map(mapMusicActivityItem);
    const recent = items
      .filter((item) => item.status === 'completed')
      .sort(compareCompletedDesc)
      .slice(0, MAX_ACTIVITY_RECENT)
      .map(mapMusicActivityItem);
    // A song that failed once but is in the library now (a later grab or its
    // album brought it) is not a failure any more.
    const songKeyOf = (item: AurralActivityItem) =>
      item.trackName?.trim() && item.artistName?.trim()
        ? ownedSongKey(item.artistName, item.trackName)
        : '';
    const doneSongs = new Set(
      items
        .filter((item) => item.status === 'completed')
        .map(songKeyOf)
        .filter(Boolean)
    );
    const failedItems = items
      .filter((item) => {
        if (item.status !== 'failed') return false;
        const key = songKeyOf(item);
        return !key || !(doneSongs.has(key) || ownedKeys?.has(key));
      })
      .sort(compareCompletedDesc);
    const failed = failedItems
      .slice(0, MAX_ACTIVITY_RECENT)
      .map(mapMusicActivityItem);

    return res.status(200).json({
      active,
      queued,
      queuedTotal: pending.length,
      recent,
      failed,
      failedTotal: failedItems.length,
      albums: summarizeActivityAlbums(activeItems, pending),
    });
  } catch (error) {
    logger.warn('Aurral music activity lookup failed', {
      label: 'Music API',
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    });
    return next({
      status: 502,
      message: 'Unable to load music activity.',
    });
  }
});

// Library at a glance for the music home: album count and the 12 newest library albums.
musicRoutes.get('/library-overview', async (req, res, next) => {
  const aurral = requireAurralMusicContext(req, res);
  if (!aurral) return;

  try {
    const library = await cachedMusicRead(
      `library:${ownedSongServerKey()}:overview`,
      LIBRARY_READ,
      () => aurral.getLibraryPage('albums', 'newest', 1, 12)
    );
    return res.status(200).json({
      totalAlbums: library.total,
      recentlyAdded: library.items,
    });
  } catch (error) {
    logger.warn('Aurral library albums overview failed', {
      label: 'Music API',
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    });
    return next({
      status: 502,
      message: 'Unable to load your music library.',
    });
  }
});

musicRoutes.get(
  '/artist-image/:mbid',
  musicImageRateLimit,
  async (req, res, next) => {
    const aurral = requireAurralMusicContext(req, res);
    if (!aurral) return;

    const rawMbid =
      typeof req.params.mbid === 'string' ? req.params.mbid.trim() : '';
    if (!UUID_PATTERN.test(rawMbid)) {
      return res
        .status(400)
        .json({ message: 'Artist MBID must be a valid UUID.' });
    }
    const mbid = rawMbid.toLowerCase();

    const parsedName = parseOptionalBoundedString(req.query.name, {
      fieldName: 'Name',
      maxLength: 200,
    });
    if ('error' in parsedName) {
      return res.status(400).json({ message: parsedName.error });
    }

    try {
      const imageUrl = await aurral.getArtistImageUrl(mbid, parsedName.value);
      const safeImageUrl = sanitizeAurralImageUrl(imageUrl);
      if (!safeImageUrl) {
        return res.status(404).json({ message: 'Artist image not found.' });
      }

      res.set('Cache-Control', 'private, max-age=86400');
      return res.redirect(302, safeImageUrl);
    } catch (error) {
      logger.warn('Aurral artist image lookup failed', {
        label: 'Music API',
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      });
      return next({
        status: 502,
        message: 'Unable to load artist image.',
      });
    }
  }
);

musicRoutes.get(
  '/album-art/:mbid',
  musicImageRateLimit,
  async (req, res, next) => {
    const aurral = requireAurralMusicContext(req, res);
    if (!aurral) return;

    const rawMbid =
      typeof req.params.mbid === 'string' ? req.params.mbid.trim() : '';
    if (!UUID_PATTERN.test(rawMbid)) {
      return res
        .status(400)
        .json({ message: 'Album MBID must be a valid UUID.' });
    }
    const parsedArtist = parseOptionalBoundedString(req.query.artist, {
      fieldName: 'Artist',
      maxLength: 200,
    });
    if ('error' in parsedArtist) {
      return res.status(400).json({ message: parsedArtist.error });
    }
    const parsedTitle = parseOptionalBoundedString(req.query.title, {
      fieldName: 'Title',
      maxLength: 200,
    });
    if ('error' in parsedTitle) {
      return res.status(400).json({ message: parsedTitle.error });
    }

    try {
      const url = await aurral.getAlbumArtUrl(
        rawMbid.toLowerCase(),
        parsedArtist.value,
        parsedTitle.value
      );
      const safeUrl = sanitizeAurralImageUrl(url);
      if (!safeUrl) {
        return res.status(404).json({ message: 'Album art not found.' });
      }
      res.set('Cache-Control', 'private, max-age=86400');
      return res.redirect(302, safeUrl);
    } catch (error) {
      logger.warn('Album art lookup failed', {
        label: 'Music API',
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      });
      return next({ status: 502, message: 'Unable to load album art.' });
    }
  }
);

// Song requests carry no album id, so their covers are found by artist and
// title (Deezer), once a week per song.
const SONG_ART_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const SONG_ART_MISS_TTL_MS = 6 * 60 * 60 * 1000;
const SONG_ART_MAX_ENTRIES = 2_000;
const songArtCache = new Map<string, { url: string | null; at: number }>();
const songArtLookups = new Map<string, Promise<string | null>>();

const lookUpSongArt = async (
  artist: string,
  title: string
): Promise<string | null> => {
  const key = `${artist.toLowerCase()}\u0000${title.toLowerCase()}`;
  const cached = songArtCache.get(key);
  // a miss is asked again sooner: Deezer's search can be briefly unhelpful
  if (
    cached &&
    Date.now() - cached.at <
      (cached.url ? SONG_ART_TTL_MS : SONG_ART_MISS_TTL_MS)
  )
    return cached.url;
  const running = songArtLookups.get(key);
  if (running) return running;
  const lookup = (async () => {
    // a plain "artist title" search: Deezer's field search (artist:"…"
    // track:"…") answers nothing for many songs it has
    const found = await new DeezerAPI().searchTracks(
      `${artist} ${title}`.replace(/"/g, ' ').replace(/\s+/g, ' ').trim(),
      10
    );
    const wantedArtist = musicMatchKey(artist);
    const wantedTitle = musicMatchKey(title);
    const byArtist = found.filter(
      (track) =>
        track.coverUrl && musicMatchKey(track.artistName) === wantedArtist
    );
    // the artist's own song; no cover rather than another artist's
    const match =
      byArtist.find((track) => musicMatchKey(track.title) === wantedTitle) ??
      byArtist[0];
    const url = sanitizeAurralImageUrl(match?.coverUrl);
    if (songArtCache.size >= SONG_ART_MAX_ENTRIES) {
      const oldest = songArtCache.keys().next().value;
      if (oldest !== undefined) songArtCache.delete(oldest);
    }
    songArtCache.set(key, { url, at: Date.now() });
    return url;
  })().finally(() => songArtLookups.delete(key));
  songArtLookups.set(key, lookup);
  return lookup;
};

musicRoutes.get('/song-art', musicImageRateLimit, async (req, res, next) => {
  const aurral = requireAurralMusicContext(req, res);
  if (!aurral) return;

  const parsedArtist = parseBoundedString(req.query.artist, {
    fieldName: 'Artist',
    maxLength: 200,
  });
  if ('error' in parsedArtist) {
    return res.status(400).json({ message: parsedArtist.error });
  }
  const parsedTitle = parseBoundedString(req.query.title, {
    fieldName: 'Title',
    maxLength: 200,
  });
  if ('error' in parsedTitle) {
    return res.status(400).json({ message: parsedTitle.error });
  }

  try {
    const url = await lookUpSongArt(parsedArtist.value, parsedTitle.value);
    if (!url) {
      return res.status(404).json({ message: 'Song art not found.' });
    }
    res.set('Cache-Control', 'private, max-age=86400');
    return res.redirect(302, url);
  } catch (error) {
    logger.warn('Song art lookup failed', {
      label: 'Music API',
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    });
    return next({ status: 502, message: 'Unable to load song art.' });
  }
});

const MAX_ALBUM_SUMMARIES = 12;
const ALBUM_SUMMARY_TIMEOUT_MS = 4_000;

// Names of several albums at once, for lists of requests: none of the
// library, artwork or artist lookups a full album page makes.
musicRoutes.get('/album-summaries', async (req, res) => {
  const raw = typeof req.query.ids === 'string' ? req.query.ids : '';
  const ids = [
    ...new Set(
      raw
        .split(',')
        .map((id) => id.trim().toLowerCase())
        .filter(Boolean)
    ),
  ];
  if (
    !ids.length ||
    ids.length > MAX_ALBUM_SUMMARIES ||
    ids.some((id) => !UUID_PATTERN.test(id))
  ) {
    return res.status(400).json({
      message: `IDs must be 1 to ${MAX_ALBUM_SUMMARIES} comma-separated album MBIDs.`,
    });
  }

  const listenbrainz = new ListenBrainzAPI();
  const musicbrainz = getSharedMusicBrainz();
  // ListenBrainz alone names an album; MusicBrainz (one call a second) only
  // when ListenBrainz does not know it
  const lookUp = async (id: string) => {
    try {
      return await listenbrainz.getAlbum(id);
    } catch {
      return mapMusicBrainzReleaseGroupToListenBrainzAlbum(
        await musicbrainz.getReleaseGroupDetails({ releaseGroupId: id })
      );
    }
  };
  const found = await Promise.allSettled(
    ids.map(async (id) => {
      const details = await withShortTimeout(
        lookUp(id),
        ALBUM_SUMMARY_TIMEOUT_MS
      );
      const mapped = mapMusicDetails(details, undefined, false);
      return { id, title: mapped.title, artistName: mapped.artist.name };
    })
  );
  const results = found.flatMap((result) =>
    result.status === 'fulfilled' && result.value.title ? [result.value] : []
  );
  // album names do not change: a complete answer is kept for an hour (one
  // with a lookup that failed is asked again next time)
  if (results.length === ids.length)
    res.set('Cache-Control', 'private, max-age=3600');
  return res.status(200).json({
    results,
  });
});

const parseArtistMbidParam = (
  raw: unknown
): { value: string } | { error: string } => {
  const rawMbid = typeof raw === 'string' ? raw.trim() : '';
  if (!UUID_PATTERN.test(rawMbid)) {
    return { error: 'Artist MBID must be a valid UUID.' };
  }
  return { value: rawMbid.toLowerCase() };
};

const hasPendingOrProcessingMusicRequest = (
  media: Media | undefined
): boolean => {
  if (!media) return false;
  if (
    media.status === MediaStatus.PENDING ||
    media.status === MediaStatus.PROCESSING
  ) {
    return true;
  }
  return Boolean(
    media.requests?.some(
      (request) =>
        request.status === MediaRequestStatus.PENDING ||
        request.status === MediaRequestStatus.APPROVED
    )
  );
};

/**
 * Following makes Aurral fetch every future release with no SeerrNG request,
 * approval or quota, and unfollowing changes shared Aurral library state. So
 * both need music auto-approve (or AUTO_APPROVE / MANAGE_REQUESTS / ADMIN)
 * on top of permission to request music.
 */
export const canFollowMusicArtists = (user: User | undefined): boolean =>
  Boolean(
    user &&
    hasAutoApprovePermission(user.permissions, 'music') &&
    (hasMediaRequestPermission(user, MediaType.MUSIC) ||
      user.hasPermission(Permission.MANAGE_REQUESTS))
  );

musicRoutes.get('/artist/:mbid/follow', async (req, res, next) => {
  const aurral = requireAurralMusicContext(req, res);
  if (!aurral) return;

  const parsedMbid = parseArtistMbidParam(req.params.mbid);
  if ('error' in parsedMbid) {
    return res.status(400).json({ message: parsedMbid.error });
  }

  try {
    const status = await aurral.getArtistFollowStatus(parsedMbid.value);
    return res
      .status(200)
      .json({ ...status, canFollow: canFollowMusicArtists(req.user) });
  } catch (error) {
    logger.warn('Aurral artist follow status lookup failed', {
      label: 'Music API',
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    });
    return next({
      status: 502,
      message: 'Unable to load following status.',
    });
  }
});

musicRoutes.put('/artist/:mbid/follow', async (req, res, next) => {
  const aurral = requireAurralMusicContext(req, res);
  if (!aurral) return;

  if (!req.user || !hasMediaRequestPermission(req.user, MediaType.MUSIC)) {
    return res
      .status(403)
      .json({ message: 'You do not have permission to request music.' });
  }
  if (!canFollowMusicArtists(req.user)) {
    return res.status(403).json({
      message:
        'You do not have permission to follow artists. Following needs permission to auto-approve music requests.',
    });
  }

  const parsedMbid = parseArtistMbidParam(req.params.mbid);
  if ('error' in parsedMbid) {
    return res.status(400).json({ message: parsedMbid.error });
  }

  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return res
      .status(400)
      .json({ message: 'Request body must be a JSON object.' });
  }

  const bodyRecord = body as Record<string, unknown>;
  if (
    Object.keys(bodyRecord).some((key) => key !== 'follow' && key !== 'name')
  ) {
    return res
      .status(400)
      .json({ message: 'Unexpected field in request body.' });
  }

  if (typeof bodyRecord.follow !== 'boolean') {
    return res.status(400).json({ message: 'Follow must be a boolean.' });
  }

  const parsedName = parseBoundedString(bodyRecord.name, {
    fieldName: 'Name',
    maxLength: 256,
  });
  if ('error' in parsedName) {
    return res.status(400).json({ message: parsedName.error });
  }

  try {
    const status = await aurral.setArtistFollowing(
      parsedMbid.value,
      parsedName.value,
      bodyRecord.follow
    );
    return res.status(200).json({ ...status, canFollow: true });
  } catch (error) {
    const httpStatus =
      error && typeof error === 'object' && 'response' in error
        ? (error as { response?: { status?: number } }).response?.status
        : undefined;
    if (error instanceof AurralForbiddenError || httpStatus === 403) {
      return res.status(403).json({
        message:
          'Aurral does not allow SeerrNG to change monitoring. Give the SeerrNG user the Change monitoring permission in Aurral.',
      });
    }
    logger.warn('Aurral artist follow update failed', {
      label: 'Music API',
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    });
    return next({
      status: 502,
      message: 'Unable to update following.',
    });
  }
});

musicRoutes.get('/artist/:mbid/similar', async (req, res, next) => {
  const aurral = requireAurralMusicContext(req, res);
  if (!aurral) return;

  const parsedMbid = parseArtistMbidParam(req.params.mbid);
  if ('error' in parsedMbid) {
    return res.status(400).json({ message: parsedMbid.error });
  }

  try {
    const [artists, ownedAlbums] = await Promise.all([
      aurral.getSimilarArtists(parsedMbid.value),
      loadOwnedAlbums(aurral),
    ]);
    return res
      .status(200)
      .json({ artists: withOwnedArtists(artists, ownedAlbums) });
  } catch (error) {
    logger.warn('Aurral similar artists lookup failed', {
      label: 'Music API',
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    });
    return next({
      status: 502,
      message: 'Unable to load similar artists.',
    });
  }
});

type ArtistReleaseGroups = NonNullable<
  Awaited<ReturnType<AurralAPI['getArtistDetails']>>
>['releaseGroups'];

/**
 * An artist's release groups with the library's and SeerrNG's state of each:
 * owned, partly owned, requested, blocklisted. One rule for the artist page
 * and for "Get all releases".
 */
const annotateArtistReleaseGroups = (
  releaseGroups: ArtistReleaseGroups,
  library: Awaited<
    ReturnType<AurralAPI['getLibraryArtistReleaseGroups']>
  > | null,
  ownedAlbums: Awaited<ReturnType<typeof loadOwnedAlbums>> | null,
  mediaMap: Map<string, Media>
) => {
  const libraryReleaseGroupIds = new Set(
    [...(library?.owned ?? [])].map(normalizeMusicBrainzId)
  );
  const partialReleaseGroupIds = new Set(
    [...(library?.partial ?? [])].map(normalizeMusicBrainzId)
  );
  return releaseGroups.map((group) => {
    const normalizedId = normalizeMusicBrainzId(group.id);
    const media = mediaMap.get(normalizedId);
    const inLibrary =
      libraryReleaseGroupIds.has(normalizedId) ||
      media?.status === MediaStatus.AVAILABLE;
    const partial =
      !inLibrary &&
      (partialReleaseGroupIds.has(normalizedId) ||
        media?.status === MediaStatus.PARTIALLY_AVAILABLE);
    // the library's own song count decides (the Library tab's "x of y")
    const owned = withOwnedAlbum(
      { mbid: group.id, title: group.title, inLibrary, partial },
      ownedAlbums
    );
    return {
      ...group,
      inLibrary: owned.inLibrary,
      partial: owned.partial,
      ...(owned.libraryTrackCount !== undefined
        ? {
            libraryTrackCount: owned.libraryTrackCount,
            libraryAvailableTrackCount: owned.libraryAvailableTrackCount,
          }
        : {}),
      ...(media?.status === MediaStatus.BLOCKLISTED
        ? { blocklisted: true as const }
        : {}),
      requested: hasPendingOrProcessingMusicRequest(media),
    };
  });
};

type AnnotatedReleaseGroup = ReturnType<
  typeof annotateArtistReleaseGroups
>[number];

// How long a page waits for studio-album track lists on a cold cache before it
// answers with the title-only classification (the cache warms meanwhile).
const REDUNDANCY_TRACKLIST_WAIT_MS = 1_200;

const waitAtMost = (promise: Promise<unknown>, ms: number) => {
  let timer: NodeJS.Timeout | undefined;
  return Promise.race([
    promise.catch(() => undefined),
    new Promise<void>((resolve) => {
      timer = setTimeout(resolve, ms);
      timer.unref?.();
    }),
  ]).finally(() => {
    if (timer) clearTimeout(timer);
  });
};

/**
 * Which release groups are redundant (another edition, a single whose songs
 * are on a studio album, a promo or bootleg), with the same rules as "Get all
 * releases". Track lists that are not cached yet are loaded in the
 * background; until then the titles decide.
 */
const classifyReleaseGroups = async (
  groups: AnnotatedReleaseGroup[],
  artistMbid: string,
  waitMs = REDUNDANCY_TRACKLIST_WAIT_MS
) => {
  const classifiable = groups.map((group) => ({
    ...group,
    blocklisted: group.blocklisted === true,
  }));
  const inspect = releaseGroupsToInspect(classifiable, undefined, artistMbid);
  const albums = warmReleaseGroupTracks(inspect.albums);
  // singles and compilations after the albums, never holding up the page
  // (not in tests: a request after the test ended would reach a later
  // test's stubs)
  if (process.env.NODE_ENV !== 'test') {
    void albums
      .then(() => warmReleaseGroupTracks(inspect.singles))
      .then(() => warmReleaseGroupTracks(inspect.extras));
  } else {
    await warmReleaseGroupTracks([...inspect.singles, ...inspect.extras]);
  }
  if (waitMs > 0) await waitAtMost(albums, waitMs);
  return classifyArtistReleaseGroups({
    releaseGroups: classifiable,
    tracksOf: peekReleaseGroupTracks,
    artistMbid,
  });
};

/**
 * True while some album track lists the page's Get buttons depend on are
 * still loading (an artist nobody opened for a while): the page asks again
 * shortly, so a single whose songs are on an album stops offering Get.
 */
const releaseTracklistsPending = (
  groups: AnnotatedReleaseGroup[],
  artistMbid: string
): boolean =>
  releaseGroupsToInspect(
    groups.map((group) => ({
      ...group,
      blocklisted: group.blocklisted === true,
    })),
    undefined,
    artistMbid
  ).albums.some((mbid) => peekReleaseGroupTracks(mbid) === undefined);

const publicRedundancy = (redundancy: ReleaseRedundancy | undefined) =>
  redundancy
    ? {
        redundant: {
          code: redundancy.code,
          reason: redundancy.reason,
          ...(redundancy.coveredBy ? { coveredBy: redundancy.coveredBy } : {}),
          ...(redundancy.alsoOn ? { alsoOn: redundancy.alsoOn } : {}),
        },
      }
    : {};

/**
 * An artist's release groups with their state for this user and whether each
 * is redundant. Null when the artist is unknown.
 */
export const loadArtistReleaseClassification = async (
  aurral: MusicProvider,
  artistMbid: string,
  user: User | undefined,
  waitMs = REDUNDANCY_TRACKLIST_WAIT_MS
) => {
  const [artist, library, ownedAlbums] = await Promise.all([
    aurral.getArtistDetails(artistMbid),
    aurral.getLibraryArtistReleaseGroups(artistMbid).catch(() => null),
    loadOwnedAlbums(aurral).catch(() => null),
  ]);
  if (!artist) return null;
  const mediaMap = await loadRelatedMusicMediaMap(
    artist.releaseGroups.map((group) => group.id),
    user
  );
  const groups = annotateArtistReleaseGroups(
    artist.releaseGroups,
    library,
    ownedAlbums,
    mediaMap
  );
  const redundancy = await classifyReleaseGroups(
    groups,
    artist.mbid || artistMbid,
    waitMs
  );
  return { artist, groups, redundancy };
};

const REDUNDANT_REQUEST_CHECK_TIMEOUT_MS = 3_000;

/**
 * Whether a music request would bring nothing new: the release is another
 * edition of, or a single whose songs are all on, a release the user already
 * owns or has requested. Null when it adds something, or when that cannot be
 * told in time (the request then goes ahead).
 */
export const findRedundantMusicRequest = async (
  releaseGroupId: string,
  user: User | undefined
): Promise<{
  code: 'sameAlbum' | 'covered';
  reason: string;
  coveredBy: { mbid: string; title: string };
} | null> => {
  const server = getDefaultAurralServer(getSettings().aurral);
  if (!server?.hostname || !server.apiKey) return null;
  const aurral = new AurralAPI({
    url: AurralAPI.buildUrl(server),
    apiKey: server.apiKey,
  });
  const id = normalizeMusicBrainzId(releaseGroupId);
  const check = async () => {
    const releaseGroup = await getSharedMusicBrainz().getReleaseGroupDetails({
      releaseGroupId: id,
    });
    const primaryType = releaseGroup['primary-type'];
    const artistMbid = releaseGroup['artist-credit']?.[0]?.artist?.id;
    if (!artistMbid || !UUID_PATTERN.test(artistMbid)) return null;
    if (primaryType && !['Album', 'EP', 'Single'].includes(primaryType)) {
      return null;
    }
    const classification = await loadArtistReleaseClassification(
      aurral,
      artistMbid.toLowerCase(),
      user
    );
    const redundancy = classification?.redundancy.get(
      classification.groups.find(
        (group) => normalizeMusicBrainzId(group.id) === id
      )?.id ?? ''
    );
    if (
      !redundancy ||
      redundancy.code === 'unofficial' ||
      !redundancy.coveredBy ||
      !redundancy.coveredByHave
    ) {
      return null;
    }
    return {
      code: redundancy.code,
      reason: redundancy.reason,
      coveredBy: redundancy.coveredBy,
    };
  };
  try {
    return await withShortTimeout(check(), REDUNDANT_REQUEST_CHECK_TIMEOUT_MS);
  } catch (error) {
    logger.debug('Redundant music request check skipped', {
      label: 'Music API',
      releaseGroupId: id,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
};

interface RequestAllResult {
  mbid: string;
  title: string;
  primaryType: RequestAllPlanItem['primaryType'];
  status: 'requested' | 'skipped' | 'failed';
  reason?: string;
}

interface RequestAllSongResult {
  title: string;
  fromReleaseMbid: string;
  fromReleaseTitle: string;
  status: 'requested' | 'failed';
  reason?: string;
}

/**
 * "Get all releases": every missing album, plus each single or EP that adds a
 * song no album brings (see musicRequestAllPlan). A single or EP that is only
 * partly new becomes song requests for just its new songs, when the user may
 * request songs. Each release is requested through the normal request path,
 * so approval and quotas apply as for one album. With dryRun the plan comes
 * back and nothing is requested.
 */
musicRoutes.post('/artist/:mbid/request-all', async (req, res, next) => {
  const aurral = requireAurralMusicContext(req, res);
  if (!aurral || !req.user) return;
  const user = req.user;

  if (!hasMediaRequestPermission(user, MediaType.MUSIC)) {
    return res
      .status(403)
      .json({ message: 'You do not have permission to request music.' });
  }
  if (!isUserMediaCategoryEnabled(user, 'music')) {
    return res
      .status(403)
      .json({ message: 'Music requests are unavailable for this user.' });
  }

  const parsedMbid = parseArtistMbidParam(req.params.mbid);
  if ('error' in parsedMbid) {
    return res.status(400).json({ message: parsedMbid.error });
  }

  const body: unknown = req.body ?? {};
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return res
      .status(400)
      .json({ message: 'Request body must be a JSON object.' });
  }
  const bodyRecord = body as Record<string, unknown>;
  if (Object.keys(bodyRecord).some((key) => key !== 'dryRun')) {
    return res
      .status(400)
      .json({ message: 'Unexpected field in request body.' });
  }
  if (
    bodyRecord.dryRun !== undefined &&
    typeof bodyRecord.dryRun !== 'boolean'
  ) {
    return res.status(400).json({ message: 'dryRun must be a boolean.' });
  }
  const dryRun = bodyRecord.dryRun === true;

  const [detailsResult, libraryResult, ownedAlbumsResult, ownedSongsResult] =
    await Promise.allSettled([
      aurral.getArtistDetails(parsedMbid.value),
      aurral.getLibraryArtistReleaseGroups(parsedMbid.value),
      // Get all must know what the library has, never guess: it waits for
      // a first read of the library instead of planning without it
      loadOwnedAlbums(aurral, {
        firstBuildWaitMs: OWNED_INDEX_MUST_KNOW_WAIT_MS,
      }),
      loadOwnedSongKeys(aurral, {
        firstBuildWaitMs: OWNED_INDEX_MUST_KNOW_WAIT_MS,
      }),
    ]);
  if (detailsResult.status === 'rejected') {
    logger.warn('Aurral artist details lookup failed', {
      label: 'Music API',
      errorMessage:
        detailsResult.reason instanceof Error
          ? detailsResult.reason.message
          : 'Unknown error',
    });
    return next({ status: 502, message: 'Unable to load this artist.' });
  }
  const artist = detailsResult.value;
  if (!artist) {
    return res.status(404).json({ message: 'Artist not found.' });
  }

  const mediaMap = await loadRelatedMusicMediaMap(
    artist.releaseGroups.map((group) => group.id),
    user
  );
  const releaseGroups = annotateArtistReleaseGroups(
    artist.releaseGroups,
    libraryResult.status === 'fulfilled' ? libraryResult.value : null,
    ownedAlbumsResult.status === 'fulfilled' ? ownedAlbumsResult.value : null,
    mediaMap
  );
  // a partly new single becomes song requests only for people who may make
  // them; everyone else gets the single as before
  const canRequestSongs = canRequestTracks(user) && isTrackRequestsConfigured();
  // songs this user already asked for (a B-side from an earlier Get all)
  const artistKey = musicMatchKey(artist.name);
  const requestedSongKeys = new Set(
    (
      await getRepository(TrackRequest).find({
        select: { id: true, artist: true, title: true },
        where: {
          requestedById: user.id,
          status: In(ACTIVE_TRACK_STATUSES),
        },
        take: 1_000,
      })
    )
      .filter((request) => musicMatchKey(request.artist) === artistKey)
      .map((request) => requestAllSongKey(request.title))
      .filter(Boolean)
  );
  const plan = await buildRequestAllPlan({
    artistName: artist.name,
    releaseGroups: releaseGroups.map((group) => ({
      ...group,
      blocklisted: group.blocklisted === true,
    })),
    loadTracks: loadReleaseGroupTracks,
    ownedSongKeys:
      ownedSongsResult.status === 'fulfilled' ? ownedSongsResult.value : null,
    requestedSongKeys,
    // songs only when the library's songs are known, so none it has is asked for
    canRequestSongs:
      canRequestSongs &&
      ownedSongsResult.status === 'fulfilled' &&
      ownedSongsResult.value !== null,
    artistMbid: artist.mbid || parsedMbid.value,
    // bonus tracks of larger editions of albums the user has
    loadEditions: (releaseGroupId) =>
      loadReleaseGroupEditions(getSharedMusicBrainz(), releaseGroupId),
  });

  if (dryRun) {
    return res.status(200).json({ dryRun: true, ...plan });
  }

  const items = [...plan.albums, ...plan.epsAndSingles];
  const results: RequestAllResult[] = [];
  let stoppedReason: string | undefined;
  const expectedCredentialVersion =
    req.session?.userId === user.id
      ? (req.session.credentialVersion ?? 0)
      : undefined;
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    const result = {
      mbid: item.mbid,
      title: item.title,
      primaryType: item.primaryType,
    };
    try {
      await MediaRequest.request(
        { mediaType: MediaType.MUSIC, mediaId: item.mbid },
        user,
        { expectedCredentialVersion }
      );
      results.push({ ...result, status: 'requested' });
    } catch (error) {
      if (
        error instanceof DuplicateMediaRequestError ||
        error instanceof BlocklistedMediaError
      ) {
        results.push({ ...result, status: 'skipped', reason: error.message });
        continue;
      }
      if (
        error instanceof QuotaRestrictedError ||
        error instanceof QuotaExceptionAlreadyPendingError ||
        error instanceof ServiceConfigurationError
      ) {
        // the rest would fail the same way
        stoppedReason = error.message;
        for (const remaining of items.slice(index)) {
          results.push({
            mbid: remaining.mbid,
            title: remaining.title,
            primaryType: remaining.primaryType,
            status: 'failed',
            reason: error.message,
          });
        }
        break;
      }
      if (
        error instanceof UserMutationActorUnauthorizedError ||
        error instanceof RequestPermissionError
      ) {
        return res.status(403).json({ message: error.message });
      }
      logger.error('Failed to request a release for Get all releases', {
        label: 'Music API',
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        releaseGroupId: item.mbid,
        userId: user.id,
      });
      results.push({
        ...result,
        status: 'failed',
        reason: 'Unable to request this release.',
      });
    }
  }

  // the new songs of partly new singles: one song request each, the same
  // path as asking for a song (its approval and its limit apply)
  const songResults: RequestAllSongResult[] = [];
  let songsStoppedReason: string | undefined;
  for (const song of plan.songs) {
    const result = {
      title: song.title,
      fromReleaseMbid: song.fromReleaseMbid,
      fromReleaseTitle: song.fromReleaseTitle,
    };
    if (songsStoppedReason) {
      songResults.push({
        ...result,
        status: 'failed',
        reason: songsStoppedReason,
      });
      continue;
    }
    try {
      await createTrackRequests(user, [
        {
          artist: song.artistName,
          title: song.title,
          albumMbid: song.fromReleaseMbid,
          albumName: song.fromReleaseTitle,
          ...(song.releaseMbid ? { releaseMbid: song.releaseMbid } : {}),
          artistMbid: artist.mbid || parsedMbid.value,
          ...(song.durationMs ? { durationMs: song.durationMs } : {}),
          source: 'album',
        },
      ]);
      songResults.push({ ...result, status: 'requested' });
    } catch (error) {
      const reason =
        error instanceof Error ? error.message : 'Unable to request this song.';
      // the song-request limit: the rest would fail the same way
      if (error instanceof TrackRequestError && error.status === 409) {
        songsStoppedReason = reason;
        stoppedReason ??= reason;
      }
      songResults.push({ ...result, status: 'failed', reason });
    }
  }

  const releasesRequested = results.filter(
    (result) => result.status === 'requested'
  ).length;
  const songsRequested = songResults.filter(
    (result) => result.status === 'requested'
  ).length;
  return res.status(200).json({
    dryRun: false,
    ...plan,
    counts: {
      ...plan.counts,
      requested: releasesRequested + songsRequested,
      failed:
        results.filter((result) => result.status === 'failed').length +
        songResults.filter((result) => result.status === 'failed').length,
      songsRequested,
    },
    results,
    songResults,
    ...(stoppedReason ? { stoppedReason } : {}),
  });
});

musicRoutes.get('/artist/:mbid', async (req, res, next) => {
  const aurral = requireAurralMusicContext(req, res);
  if (!aurral) return;

  const parsedMbid = parseArtistMbidParam(req.params.mbid);
  if ('error' in parsedMbid) {
    return res.status(400).json({ message: parsedMbid.error });
  }

  const [detailsResult, libraryResult, ownedAlbumsResult] =
    await Promise.allSettled([
      aurral.getArtistDetails(parsedMbid.value),
      aurral.getLibraryArtistReleaseGroups(parsedMbid.value),
      loadOwnedAlbums(aurral),
    ]);
  const ownedAlbums =
    ownedAlbumsResult.status === 'fulfilled' ? ownedAlbumsResult.value : null;

  if (detailsResult.status === 'rejected') {
    logger.warn('Aurral artist details lookup failed', {
      label: 'Music API',
      errorMessage:
        detailsResult.reason instanceof Error
          ? detailsResult.reason.message
          : 'Unknown error',
    });
    return next({
      status: 502,
      message: 'Unable to load this artist.',
    });
  }

  const artist = detailsResult.value;
  if (!artist) {
    return res.status(404).json({ message: 'Artist not found.' });
  }

  if (libraryResult.status === 'rejected') {
    logger.warn('Aurral artist library release groups lookup failed', {
      label: 'Music API',
      errorMessage:
        libraryResult.reason instanceof Error
          ? libraryResult.reason.message
          : 'Unknown error',
    });
  }

  const [mediaMap, sameNameArtist] = await Promise.all([
    loadRelatedMusicMediaMap(
      artist.releaseGroups.map((group) => group.id),
      req.user
    ),
    // The payload stays this MBID's own; the page can offer the other one.
    artist.releaseGroups.length === 0
      ? findSameNameArtist(aurral, {
          mbid: artist.mbid || parsedMbid.value,
          name: artist.name,
        })
      : Promise.resolve(null),
  ]);

  const groups = annotateArtistReleaseGroups(
    artist.releaseGroups,
    libraryResult.status === 'fulfilled' ? libraryResult.value : null,
    ownedAlbums,
    mediaMap
  );
  const redundancy = await classifyReleaseGroups(
    groups,
    artist.mbid || parsedMbid.value
  );
  const redundancyPending = releaseTracklistsPending(
    groups,
    artist.mbid || parsedMbid.value
  );

  return res.status(200).json({
    mbid: artist.mbid,
    name: artist.name,
    type: artist.type,
    country: artist.country,
    beginYear: artist.beginYear,
    endYear: artist.endYear,
    genres: artist.genres,
    bio: artist.bio,
    ...(artist.incomplete !== undefined
      ? { incomplete: artist.incomplete }
      : {}),
    ...(redundancyPending ? { redundancyPending: true } : {}),
    releaseGroups: groups.map((group) => ({
      ...group,
      ...publicRedundancy(redundancy.get(group.id)),
    })),
    ...(sameNameArtist ? { sameNameArtist } : {}),
  });
});

musicRoutes.get('/:id/rating', async (req, res) => {
  const parsedMbId = normalizeParsedMusicBrainzId(
    parseMusicBrainzId(req.params.id)
  );
  if ('error' in parsedMbId) {
    return res.status(404).json({ status: 404, message: 'Album not found' });
  }

  const failedSources = new Set<
    NonNullable<MusicRatingResponse['rating']>['source']
  >();
  let links: MbLink[] = [];
  const audioTask = new TheAudioDb()
    .getAlbumRating(parsedMbId.value)
    .catch(() => {
      failedSources.add('theaudiodb');
      return undefined;
    });
  const respond = async (rating?: MusicRatingResponse['rating']) => {
    const [audio, discogs] = await Promise.all([
      audioTask,
      discogsRatings.getAlbumRating(links).catch(() => {
        failedSources.add('discogs');
        return undefined;
      }),
    ]);
    return res.status(200).json({
      rating,
      ratings: [rating, audio, discogs].filter(Boolean),
      failedSources: [...failedSources],
    });
  };

  try {
    const album = await new MusicBrainz().getReleaseGroupDetails({
      releaseGroupId: parsedMbId.value,
    });
    links = album.links ?? [];
    if (album.rating && album.rating['votes-count'] > 0) {
      const response: MusicRatingResponse = {
        rating: {
          score: Math.round(album.rating.value * 20) / 10,
          votes: album.rating['votes-count'],
          url: `https://musicbrainz.org/release-group/${encodeURIComponent(
            parsedMbId.value
          )}`,
          source: 'musicbrainz',
        },
      };
      return respond(response.rating);
    }
  } catch (e) {
    failedSources.add('musicbrainz');
    failedSources.add('discogs');
    logger.warn('MusicBrainz album rating unavailable', {
      label: 'Music API',
      errorMessage: e instanceof Error ? e.message : 'Unknown error',
      mbId: parsedMbId.value,
    });
  }

  try {
    const media = await getRepository(Media).findOne({
      where: { mbId: parsedMbId.value, mediaType: MediaType.MUSIC },
    });
    const service =
      media?.serviceId !== undefined && media?.serviceId !== null
        ? getExternalRuntimeConfig().lidarr.find(
            (candidate) => candidate.id === media.serviceId
          )
        : undefined;
    if (service && media?.externalServiceId) {
      const album = await runWithServarrServiceSnapshot(
        'lidarr',
        service,
        (currentService) =>
          new LidarrAPI({
            apiKey: currentService.apiKey,
            url: LidarrAPI.buildUrl(currentService, '/api/v1'),
          }).getAlbum({ id: media.externalServiceId! }, 300)
      );
      const ratings = album.ratings;
      if (
        ratings &&
        Number.isFinite(ratings.value) &&
        ratings.value >= 0 &&
        ratings.value <= 10 &&
        Number.isSafeInteger(ratings.votes) &&
        ratings.votes > 0
      ) {
        return respond({
          score: Math.round(ratings.value * 10) / 10,
          votes: ratings.votes,
          url:
            service.externalUrl ||
            `https://musicbrainz.org/release-group/${encodeURIComponent(
              parsedMbId.value
            )}`,
          source: 'lidarr',
        });
      }
    }
  } catch (e) {
    failedSources.add('lidarr');
    logger.warn('Lidarr album rating unavailable', {
      label: 'Music API',
      errorMessage: e instanceof Error ? e.message : 'Unknown error',
      mbId: parsedMbId.value,
    });
  }

  return respond();
});

musicRoutes.get('/:id/artwork', async (req, res, next) => {
  const parsed = normalizeParsedMusicBrainzId(
    parseMusicBrainzId(req.params.id)
  );
  if ('error' in parsed || !parsed.value) return res.sendStatus(400);
  try {
    const covers = new CoverArtArchive();
    const response = await covers.getCoverArt(parsed.value);
    const posterPath =
      response.images.find((image) => image.front)?.thumbnails?.[250] ?? null;
    // Do not turn an upstream timeout into a permanent "no artwork" result.
    if (
      !posterPath &&
      (await covers.getCoverArtFromCache(parsed.value)) === undefined
    ) {
      return res
        .status(503)
        .json({ message: 'Artwork is temporarily unavailable.' });
    }
    return res.json({ posterPath });
  } catch {
    return next({
      status: 503,
      message: 'Artwork is temporarily unavailable.',
    });
  }
});

const ALBUM_PAGE_REDUNDANCY_TIMEOUT_MS = 1_500;

/**
 * For a single or EP whose songs are all on a studio album (or another
 * edition of a release): what covers it, so the page can point there. Only
 * with Aurral; never slows the page by more than a moment.
 */
export const albumPageRedundancy = async (
  mbId: string,
  type: string | undefined,
  artistMbid: string | undefined,
  user: User | undefined
) => {
  const server = getDefaultAurralServer(getSettings().aurral);
  if (
    !server?.hostname ||
    !server.apiKey ||
    !artistMbid ||
    !UUID_PATTERN.test(artistMbid) ||
    (type && !['Single', 'EP', 'Album'].includes(type))
  ) {
    return null;
  }
  const aurral = new AurralAPI({
    url: AurralAPI.buildUrl(server),
    apiKey: server.apiKey,
  });
  try {
    const classification = await withShortTimeout(
      loadArtistReleaseClassification(
        aurral,
        artistMbid.toLowerCase(),
        user,
        ALBUM_PAGE_REDUNDANCY_TIMEOUT_MS - 400
      ),
      ALBUM_PAGE_REDUNDANCY_TIMEOUT_MS
    );
    const group = classification?.groups.find(
      (candidate) =>
        normalizeMusicBrainzId(candidate.id) === normalizeMusicBrainzId(mbId)
    );
    const redundancy = group
      ? classification?.redundancy.get(group.id)
      : undefined;
    if (!redundancy?.coveredBy || redundancy.code === 'unofficial') {
      return null;
    }
    return {
      code: redundancy.code,
      reason: redundancy.reason,
      coveredBy: redundancy.coveredBy,
    };
  } catch {
    return null;
  }
};

musicRoutes.get('/:id', async (req, res, next) => {
  const parsedMbId = normalizeParsedMusicBrainzId(
    parseMusicBrainzId(req.params.id)
  );
  if ('error' in parsedMbId) {
    return res.status(404).json({ message: 'Album not found.' });
  }

  const mbId = parsedMbId.value;
  const listenbrainz = new ListenBrainzAPI();
  const musicbrainz = getSharedMusicBrainz();
  const personMapper = new TmdbPersonMapper();
  const theAudioDb = new TheAudioDb();
  const coverArtArchive = new CoverArtArchive();

  try {
    // The library lookups need only the album id: start them now, so they run
    // alongside the MusicBrainz ones instead of after them.
    const runtimeConfig = getExternalRuntimeConfig();
    const trackAvailabilityPromise = withShortTimeout(
      getMusicTrackAvailability(
        mbId,
        runtimeConfig.lidarr,
        runtimeConfig.aurral
      ),
      ALBUM_TRACK_AVAILABILITY_TIMEOUT_MS
    ).catch((): MusicTrackAvailability => ({}));
    const ownedKeysPromise = loadOwnedSongKeysForAlbum().catch(() => null);
    const ownedAlbumsPromise = loadDefaultOwnedAlbums();
    // read later; a failure here must not become an unhandled rejection meanwhile
    ownedAlbumsPromise.catch(() => undefined);

    const [albumDetails, media, onUserWatchlist] = await Promise.all([
      getAlbumDetails(mbId, listenbrainz, musicbrainz),
      getRepository(Media)
        .findOne({
          where: { mbId, mediaType: MediaType.MUSIC },
          relations: {
            issues: {
              createdBy: true,
              modifiedBy: true,
              comments: { user: true },
            },
          },
          // Requests, issues, and comments are independent one-to-many
          // relations. Joined hydration multiplies their row counts before
          // TypeORM can reconstruct the entities.
          relationLoadStrategy: 'query',
        })
        .then(async (media) => {
          if (media) {
            await hydrateMediaSummaryRelations([media], req.user);
          }
          return media ?? undefined;
        }),
      req.user
        ? getRepository(Watchlist).exists({
            where: {
              mbId,
              requestedBy: { id: req.user.id },
            },
          })
        : false,
    ]);

    const artistId = albumDetails.release_group_metadata?.artist?.artists?.[0]
      ?.artist_mbid
      ? normalizeMusicBrainzId(
          albumDetails.release_group_metadata.artist.artists[0].artist_mbid
        )
      : undefined;
    const isPerson =
      albumDetails.release_group_metadata?.artist?.artists?.[0]?.type ===
      'Person';
    const trackArtists = collectAlbumTrackArtists(albumDetails.mediums);
    const trackArtistIds = trackArtists.map((artist) => artist.artistId);
    const releaseId = [
      albumDetails.caa_release_mbid,
      albumDetails.recordings_release_mbid,
      albumDetails.release_group_metadata?.release?.caa_release_mbid,
    ]
      .map((id) => (id ? normalizeMusicBrainzId(id) : ''))
      .find((id) => isValidMusicBrainzResourceId(id));

    const mappedDetails = mapMusicDetails(albumDetails, media, onUserWatchlist);
    // up to 1.5 s with Aurral: run it alongside the artwork and artist lookups
    const redundancyPromise = albumPageRedundancy(
      mbId,
      mappedDetails.type,
      mappedDetails.artist.id,
      req.user
    );

    const [
      coverArt,
      metadataArtist,
      trackArtistMetadata,
      artistWikipedia,
      recordLabels,
    ] = await Promise.allSettled([
      coverArtArchive.getCoverArt(mbId),
      artistId
        ? getRepository(MetadataArtist).findOne({
            where: { mbArtistId: artistId },
          })
        : Promise.resolve(undefined),
      getRepository(MetadataArtist).find({
        where: { mbArtistId: In(trackArtistIds) },
      }),
      artistId && isPerson
        ? musicbrainz
            .getArtistWikipediaExtract({
              artistMbid: artistId,
            })
            .catch(() => null)
        : Promise.resolve(null),
      releaseId
        ? musicbrainz.getReleaseLabels({ releaseId })
        : Promise.resolve([]),
    ]);

    const resolvedCoverArtUrl =
      coverArt.status === 'fulfilled'
        ? (coverArt.value.images.find((image) => image.front)
            ?.thumbnails[250] ?? null)
        : null;
    const resolvedMetadataArtist =
      metadataArtist.status === 'fulfilled' ? metadataArtist.value : undefined;
    const resolvedTrackArtistMetadata =
      trackArtistMetadata.status === 'fulfilled'
        ? trackArtistMetadata.value
        : [];
    const resolvedArtistWikipedia =
      artistWikipedia.status === 'fulfilled' ? artistWikipedia.value : null;
    const resolvedRecordLabels =
      recordLabels.status === 'fulfilled' ? recordLabels.value : [];

    const trackArtistsToMap = trackArtists.filter(
      (artist) =>
        !resolvedTrackArtistMetadata.some(
          (metadata) =>
            normalizeMusicBrainzId(metadata.mbArtistId) === artist.artistId &&
            metadata.tmdbPersonId
        )
    );

    const responses = await Promise.allSettled([
      artistId &&
      !resolvedMetadataArtist?.tadbThumb &&
      !resolvedMetadataArtist?.tadbCover
        ? theAudioDb.getArtistImages(artistId)
        : Promise.resolve(null),
      artistId && isPerson && !resolvedMetadataArtist?.tmdbPersonId
        ? personMapper
            .getMapping(
              artistId,
              albumDetails.release_group_metadata?.artist?.artists?.[0]?.name ??
                albumDetails.release_group_metadata?.artist?.name ??
                ''
            )
            .catch(() => null)
        : Promise.resolve(null),
      trackArtistsToMap.length > 0
        ? personMapper.batchGetMappings(trackArtistsToMap).then(() =>
            getRepository(MetadataArtist).find({
              where: { mbArtistId: In(trackArtistIds) },
            })
          )
        : Promise.resolve(resolvedTrackArtistMetadata),
    ]);

    const artistImages =
      responses[0].status === 'fulfilled' ? responses[0].value : null;
    const personMappingResult =
      responses[1].status === 'fulfilled' ? responses[1].value : null;
    const updatedArtistMetadata =
      responses[2].status === 'fulfilled'
        ? responses[2].value
        : resolvedTrackArtistMetadata;

    const updatedMetadataArtist =
      personMappingResult && artistId
        ? await getRepository(MetadataArtist).findOne({
            where: { mbArtistId: artistId },
          })
        : resolvedMetadataArtist;

    const musicServices = [...runtimeConfig.lidarr, ...runtimeConfig.aurral];
    const destinationRequests = media?.id
      ? await getRepository(MediaRequest)
          .createQueryBuilder('request')
          .select(['request.id', 'request.serviceTargets'])
          .innerJoin('request.media', 'requestMedia')
          .where('requestMedia.id = :mediaId', { mediaId: media.id })
          .getMany()
      : [];
    const availableServices = getAvailableMusicServices(
      media,
      destinationRequests,
      musicServices
    );
    const albumTrackAvailability: MusicTrackAvailability =
      await trackAvailabilityPromise;
    // Songs owned on another release (a single's song on a compilation):
    // matched by artist + title, listed apart from this release's own files.
    const ownedKeys = await ownedKeysPromise;
    const ownedHere = new Set(
      [
        ...(albumTrackAvailability.mp3 ?? []),
        ...(albumTrackAvailability.flac ?? []),
      ].map(normalizeMusicBrainzId)
    );
    const elsewhere = ownedKeys?.size
      ? mappedDetails.tracks
          .filter(
            (track) =>
              track.recordingMbid &&
              !ownedHere.has(normalizeMusicBrainzId(track.recordingMbid)) &&
              [track.artists[0]?.name, mappedDetails.artist.name].some(
                (artistName) =>
                  artistName &&
                  ownedKeys.has(ownedSongKey(artistName, track.name))
              )
          )
          .map((track) => normalizeMusicBrainzId(track.recordingMbid))
      : [];
    const trackAvailability: MusicTrackAvailability = elsewhere.length
      ? { ...albumTrackAvailability, elsewhere: [...new Set(elsewhere)] }
      : albumTrackAvailability;
    // the library's own count of this album's songs (the Library tab's
    // "x of y"), which decides the header and the "x of y songs" line
    const libraryAlbumState = ownedAlbumState(await ownedAlbumsPromise, {
      mbid: mbId,
      artistName: mappedDetails.artist.name,
      title: mappedDetails.title,
    });
    // An album Aurral now has in full that is still marked as on its way:
    // the scan saw it mid-download (a song request brings its whole album)
    // and nothing else looks at it again before the nightly scan. With no
    // request open, the library's own count settles it.
    if (
      media?.id &&
      (media.status === MediaStatus.PROCESSING ||
        media.status === MediaStatus.PENDING) &&
      libraryAlbumState?.status === 'owned' &&
      !(media.requests ?? []).some(
        (request) =>
          request.status === MediaRequestStatus.PENDING ||
          request.status === MediaRequestStatus.APPROVED
      )
    ) {
      media.status = MediaStatus.AVAILABLE;
      if (mappedDetails.mediaInfo) {
        mappedDetails.mediaInfo.status = MediaStatus.AVAILABLE;
      }
      await getRepository(Media)
        .update(media.id, { status: MediaStatus.AVAILABLE })
        .catch((error: unknown) => {
          logger.warn('Could not mark an owned Aurral album available', {
            label: 'Music API',
            mediaId: media.id,
            errorMessage:
              error instanceof Error ? error.message : String(error),
          });
        });
    }
    const finalTrackArtistMetadata =
      updatedArtistMetadata || resolvedTrackArtistMetadata;
    const redundancy = await redundancyPromise;

    await upsertMediaSearchMetadata(media?.id, {
      title: mappedDetails.title,
      releaseDate: mappedDetails.releaseDate,
      genres: mappedDetails.tags?.releaseGroup.map((tag) => tag.tag).join(', '),
      runtime: mappedDetails.tracks.length
        ? `${mappedDetails.tracks.length} tracks`
        : undefined,
      artist: mappedDetails.artist.name,
      albumType: mappedDetails.type,
      format: 'Music Album',
      provider: 'MusicBrainz',
      externalIds: mappedDetails.mbId,
    });

    return res.status(200).json(
      filterEntityResponse(
        {
          ...mappedDetails,
          posterPath: resolvedCoverArtUrl,
          needsCoverArt: !resolvedCoverArtUrl,
          artistWikipedia: resolvedArtistWikipedia,
          recordLabel: resolvedRecordLabels.length
            ? resolvedRecordLabels.join(', ')
            : undefined,
          artistThumb:
            updatedMetadataArtist?.tmdbThumb ??
            updatedMetadataArtist?.tadbThumb ??
            artistImages?.artistThumb ??
            null,
          artistBackdrop:
            updatedMetadataArtist?.tadbCover ??
            artistImages?.artistBackground ??
            null,
          tmdbPersonId: updatedMetadataArtist?.tmdbPersonId
            ? Number(updatedMetadataArtist.tmdbPersonId)
            : null,
          availableServices,
          trackAvailability,
          ...(libraryAlbumState ? { libraryAlbum: libraryAlbumState } : {}),
          ...(redundancy ? { redundant: redundancy } : {}),

          tracks: mappedDetails.tracks.map((track) => ({
            ...track,
            artists: track.artists.map((artist) => {
              const metadata = finalTrackArtistMetadata.find(
                (m) =>
                  normalizeMusicBrainzId(m.mbArtistId) ===
                  normalizeMusicBrainzId(artist.mbid)
              );
              return {
                ...artist,
                tmdbMapping: metadata?.tmdbPersonId
                  ? {
                      personId: Number(metadata.tmdbPersonId),
                      profilePath: metadata.tmdbThumb,
                    }
                  : null,
              };
            }),
          })),
        },
        req.user
      )
    );
  } catch (e) {
    if (e instanceof AlbumDetailsNotFoundError) {
      return next({
        status: 404,
        message: 'Album not found',
      });
    }

    logger.error('Something went wrong retrieving album details', {
      label: 'Music API',
      errorMessage: e.message,
      mbId,
    });
    return next({
      status: 500,
      message: 'Unable to retrieve album details.',
    });
  }
});

musicRoutes.get('/:id/artist', async (req, res, next) => {
  const parsedMbId = normalizeParsedMusicBrainzId(
    parseMusicBrainzId(req.params.id)
  );
  if ('error' in parsedMbId) {
    return res.status(404).json({ status: 404, message: 'Album not found' });
  }

  const mbId = parsedMbId.value;

  try {
    const listenbrainzApi = new ListenBrainzAPI();
    const theAudioDb = new TheAudioDb();
    const metadataArtistRepository = getRepository(MetadataArtist);

    // the album page's own lookup: ListenBrainz, else MusicBrainz (ListenBrainz
    // answers 404 for albums it has no listens for)
    const albumData = await getAlbumDetails(
      mbId,
      listenbrainzApi,
      getSharedMusicBrainz(),
      // only the artist is needed: no extra MusicBrainz calls
      { askMusicBrainzAlongside: false, withSongs: false }
    );
    const artistData = albumData?.release_group_metadata?.artist?.artists?.[0];
    const artistId = artistData?.artist_mbid
      ? normalizeMusicBrainzId(artistData.artist_mbid)
      : undefined;
    const artistType = artistData?.type;

    if (!artistId || artistType === 'Other') {
      return res.status(404).json({
        status: 404,
        message: 'Artist details not available for this type',
      });
    }

    const responses = await Promise.allSettled([
      listenbrainzApi.getArtist(artistId),
      theAudioDb.getArtistImagesFromCache(artistId),
      metadataArtistRepository.findOne({
        where: { mbArtistId: artistId },
      }),
    ]);

    const artistDetails =
      responses[0].status === 'fulfilled' ? responses[0].value : null;
    const cachedTheAudioDb =
      responses[1].status === 'fulfilled' ? responses[1].value : null;
    const metadataArtist =
      responses[2].status === 'fulfilled' ? responses[2].value : null;

    if (!artistDetails) {
      return res.status(404).json({ status: 404, message: 'Artist not found' });
    }

    const [artistImagesResult] = await Promise.allSettled([
      !cachedTheAudioDb &&
      !metadataArtist?.tadbThumb &&
      !metadataArtist?.tadbCover
        ? theAudioDb.getArtistImages(artistId)
        : Promise.resolve(null),
    ]);

    const artistImages =
      artistImagesResult.status === 'fulfilled'
        ? artistImagesResult.value
        : null;

    return res.status(200).json({
      artist: {
        ...artistDetails,
        artistThumb:
          cachedTheAudioDb?.artistThumb ??
          metadataArtist?.tadbThumb ??
          artistImages?.artistThumb ??
          null,
        artistBackdrop:
          cachedTheAudioDb?.artistBackground ??
          metadataArtist?.tadbCover ??
          artistImages?.artistBackground ??
          null,
      },
    });
  } catch (error) {
    if (error instanceof AlbumDetailsNotFoundError) {
      return res.status(404).json({ status: 404, message: 'Album not found' });
    }
    logger.error('Something went wrong retrieving artist details', {
      label: 'Music API',
      errorMessage: error.message,
      mbId,
    });
    return next({ status: 500, message: 'Unable to retrieve artist details.' });
  }
});

musicRoutes.get('/:id/artist-discography', async (req, res, next) => {
  const parsedMbId = normalizeParsedMusicBrainzId(
    parseMusicBrainzId(req.params.id)
  );
  if ('error' in parsedMbId) {
    return res.status(404).json({ status: 404, message: 'Album not found' });
  }

  const mbId = parsedMbId.value;

  try {
    const listenbrainzApi = new ListenBrainzAPI();
    const coverArtArchive = new CoverArtArchive();

    const page = parsePositiveInt(req.query.page, 1, MAX_PAGE);
    const pageSize = parsePositiveInt(req.query.pageSize, 20, 50);
    const parsedSlider = parseOptionalQueryBoolean(req.query.slider, 'Slider');
    if ('error' in parsedSlider) {
      return res.status(400).json({ status: 400, message: parsedSlider.error });
    }
    const isSlider = parsedSlider.value ?? false;

    // the album page's own lookup: ListenBrainz, else MusicBrainz (ListenBrainz
    // answers 404 for albums it has no listens for)
    const albumData = await getAlbumDetails(
      mbId,
      listenbrainzApi,
      getSharedMusicBrainz(),
      // only the artist is needed: no extra MusicBrainz calls
      { askMusicBrainzAlongside: false, withSongs: false }
    );
    const artistData = albumData?.release_group_metadata?.artist?.artists?.[0];
    const artistId = artistData?.artist_mbid
      ? normalizeMusicBrainzId(artistData.artist_mbid)
      : undefined;
    const artistType = artistData?.type;

    if (!artistId || artistType === 'Other') {
      return res.status(404).json({
        status: 404,
        message: 'Artist details not available for this type',
      });
    }

    const artistDetails = await listenbrainzApi
      .getArtist(artistId)
      .catch((error: unknown) => {
        if (isNotFoundError(error)) return null;
        throw error;
      });

    if (!artistDetails) {
      return res.status(404).json({ status: 404, message: 'Artist not found' });
    }

    const totalReleaseGroups = artistDetails.releaseGroups.length;
    const paginatedReleaseGroups =
      isSlider || page === 1
        ? artistDetails.releaseGroups.slice(0, pageSize)
        : artistDetails.releaseGroups.slice(
            (page - 1) * pageSize,
            page * pageSize
          );

    const releaseGroupIds = [
      ...new Set(
        paginatedReleaseGroups.map((rg) => normalizeMusicBrainzId(rg.mbid))
      ),
    ];

    const mediaResponses = await Promise.allSettled([
      Media.getRelatedMedia(req.user, releaseGroupIds),
      coverArtArchive.batchGetCoverArt(releaseGroupIds),
    ]);

    const relatedMedia =
      mediaResponses[0].status === 'fulfilled' ? mediaResponses[0].value : [];
    const coverArtByAlbumId =
      mediaResponses[1].status === 'fulfilled' ? mediaResponses[1].value : {};

    const relatedMediaMap = new Map(
      relatedMedia
        .filter((media) => media.mbId)
        .map((media) => [normalizeMusicBrainzId(media.mbId as string), media])
    );
    const runtimeConfig = getExternalRuntimeConfig();
    const musicServices = [...runtimeConfig.lidarr, ...runtimeConfig.aurral];

    const transformedReleaseGroups = paginatedReleaseGroups.map(
      (releaseGroup) => {
        const releaseGroupId = normalizeMusicBrainzId(releaseGroup.mbid);
        const posterPath = coverArtByAlbumId[releaseGroupId] ?? null;
        const media = relatedMediaMap.get(releaseGroupId);
        return {
          id: releaseGroupId,
          mediaType: 'album',
          title: releaseGroup.name,
          'first-release-date': releaseGroup.date,
          'artist-credit': [{ name: releaseGroup.artist_credit_name }],
          'primary-type': releaseGroup.type || 'Other',
          posterPath,
          needsCoverArt: !posterPath,
          mediaInfo: media,
          availableQualities: getAvailableMusicQualities(
            media,
            media?.requests ?? [],
            musicServices
          ),
          qualityStatuses: getMusicQualityStatuses(
            media,
            media?.requests ?? [],
            musicServices
          ),
        };
      }
    );

    return res.status(200).json({
      page,
      totalPages: Math.max(Math.ceil(totalReleaseGroups / pageSize), 1),
      totalResults: totalReleaseGroups,
      results: transformedReleaseGroups,
    });
  } catch (error) {
    if (error instanceof AlbumDetailsNotFoundError) {
      return res.status(404).json({ status: 404, message: 'Album not found' });
    }
    logger.error('Something went wrong retrieving artist discography', {
      label: 'Music API',
      errorMessage: error.message,
      mbId,
    });
    return next({
      status: 500,
      message: 'Unable to retrieve artist discography.',
    });
  }
});

musicRoutes.get('/:id/artist-similar', async (req, res, next) => {
  const parsedMbId = normalizeParsedMusicBrainzId(
    parseMusicBrainzId(req.params.id)
  );
  if ('error' in parsedMbId) {
    return res.status(404).json({ status: 404, message: 'Album not found' });
  }

  const mbId = parsedMbId.value;

  try {
    const listenbrainzApi = new ListenBrainzAPI();
    const personMapper = new TmdbPersonMapper();
    const theAudioDb = new TheAudioDb();
    const metadataArtistRepository = getRepository(MetadataArtist);

    const page = parsePositiveInt(req.query.page, 1, MAX_PAGE);
    const pageSize = parsePositiveInt(req.query.pageSize, 20, 50);

    // the album page's own lookup: ListenBrainz, else MusicBrainz (ListenBrainz
    // answers 404 for albums it has no listens for)
    const albumData = await getAlbumDetails(
      mbId,
      listenbrainzApi,
      getSharedMusicBrainz(),
      // only the artist is needed: no extra MusicBrainz calls
      { askMusicBrainzAlongside: false, withSongs: false }
    );
    const artistData = albumData?.release_group_metadata?.artist?.artists?.[0];
    const artistId = artistData?.artist_mbid
      ? normalizeMusicBrainzId(artistData.artist_mbid)
      : undefined;
    const artistType = artistData?.type;

    if (!artistId || artistType === 'Other') {
      return res.status(404).json({
        status: 404,
        message: 'Artist details not available for this type',
      });
    }

    // an artist ListenBrainz doesn't know has no similar artists: an empty row
    const artistDetails = await listenbrainzApi
      .getArtist(artistId)
      .catch((error: unknown) => {
        if (isNotFoundError(error)) return null;
        throw error;
      });

    if (!artistDetails) {
      return res
        .status(200)
        .json({ page, totalPages: 1, totalResults: 0, results: [] });
    }

    const allSimilarArtists = [
      ...(artistDetails.similarArtists?.artists ?? []),
    ].sort((a, b) => b.score - a.score);

    const totalResults = allSimilarArtists.length;
    const totalPages = Math.max(Math.ceil(totalResults / pageSize), 1);

    const paginatedSimilarArtists = allSimilarArtists.slice(
      (page - 1) * pageSize,
      page * pageSize
    );

    const similarArtistIds = normalizeMusicBrainzIds(
      paginatedSimilarArtists.map((a) => a.artist_mbid)
    );

    if (similarArtistIds.length === 0) {
      return res.status(200).json({
        page,
        totalPages,
        totalResults,
        results: [],
      });
    }

    const [similarArtistMetadataResult] = await Promise.allSettled([
      metadataArtistRepository.find({
        where: { mbArtistId: In(similarArtistIds) },
      }),
    ]);

    const similarArtistMetadata =
      similarArtistMetadataResult.status === 'fulfilled'
        ? similarArtistMetadataResult.value
        : [];

    const similarArtistMetadataMap = new Map(
      similarArtistMetadata.map((metadata) => [
        normalizeMusicBrainzId(metadata.mbArtistId),
        metadata,
      ])
    );

    const artistsNeedingImages = similarArtistIds.filter((id) => {
      const metadata = similarArtistMetadataMap.get(id);
      return !metadata?.tadbThumb && !metadata?.tadbCover;
    });

    const personArtists =
      paginatedSimilarArtists
        .filter((artist) => artist.type === 'Person')
        .filter((artist) => {
          const metadata = similarArtistMetadataMap.get(
            normalizeMusicBrainzId(artist.artist_mbid)
          );
          return !metadata?.tmdbPersonId;
        })
        .map((artist) => ({
          artistId: normalizeMusicBrainzId(artist.artist_mbid),
          artistName: artist.name,
        })) ?? [];

    type ArtistImageResults = Record<
      string,
      { artistThumb: string | null; artistBackground: string | null }
    >;

    const artistResponses = await Promise.allSettled([
      artistsNeedingImages.length > 0
        ? theAudioDb.batchGetArtistImages(artistsNeedingImages)
        : ({} as ArtistImageResults),
      personArtists.length > 0
        ? personMapper.batchGetMappings(personArtists).then(() =>
            metadataArtistRepository.find({
              where: { mbArtistId: In(similarArtistIds) },
            })
          )
        : Promise.resolve(similarArtistMetadata),
    ]);

    const artistImageResults =
      artistResponses[0].status === 'fulfilled' ? artistResponses[0].value : {};
    const updatedArtistMetadata =
      artistResponses[1].status === 'fulfilled'
        ? artistResponses[1].value
        : similarArtistMetadata;

    const finalArtistMetadataMap = new Map(
      (updatedArtistMetadata || similarArtistMetadata).map((metadata) => [
        normalizeMusicBrainzId(metadata.mbArtistId),
        metadata,
      ])
    );

    const transformedSimilarArtists = paginatedSimilarArtists.map((artist) => {
      const normalizedArtistId = normalizeMusicBrainzId(artist.artist_mbid);
      const metadata = finalArtistMetadataMap.get(normalizedArtistId);
      const artistImageResult = artistImageResults[normalizedArtistId];

      const artistThumb =
        metadata?.tadbThumb || (artistImageResult?.artistThumb ?? null);

      return {
        id: normalizedArtistId,
        mediaType: 'artist',
        name: artist.name,
        type: artist.type as 'Group' | 'Person',
        artistThumb: metadata?.tmdbThumb ?? artistThumb,
        score: artist.score,
        tmdbPersonId: metadata?.tmdbPersonId
          ? Number(metadata.tmdbPersonId)
          : null,
        'sort-name': artist.name,
      };
    });

    return res.status(200).json({
      page,
      totalPages,
      totalResults,
      results: transformedSimilarArtists,
    });
  } catch (error) {
    if (error instanceof AlbumDetailsNotFoundError) {
      return res.status(404).json({ status: 404, message: 'Album not found' });
    }
    logger.error('Something went wrong retrieving similar artists', {
      label: 'Music API',
      errorMessage: error.message,
      mbId,
    });
    return next({
      status: 500,
      message: 'Unable to retrieve similar artists.',
    });
  }
});

export default musicRoutes;
