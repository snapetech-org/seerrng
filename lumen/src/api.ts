// Thin client for the SeerrNG API. Everything goes through the same origin (the Lumen
// container or the Vite dev proxy), so SeerrNG's session cookie does the auth.
import { markAllStale } from './apiCache';

export function csrfHeaders(): Record<string, string> {
  const token = document.cookie
    .split('; ')
    .find((cookie) => cookie.startsWith('XSRF-TOKEN='))
    ?.slice('XSRF-TOKEN='.length);
  if (!token) return {};
  try {
    return { 'X-XSRF-TOKEN': decodeURIComponent(token) };
  } catch {
    return {};
  }
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public confirmationRequired?: string,
    public code?: string,
    public reason?: string,
    public retryAt?: number,
    public testResults?: unknown,
    public allowOverride = false
  ) {
    super(message);
  }
}

export async function api<T>(
  path: string,
  {
    invalidateCache = true,
    ...init
  }: RequestInit & { invalidateCache?: boolean } = {},
  response: 'json' | 'empty' = 'json'
): Promise<T> {
  const res = await fetch('/api/v1' + path, {
    credentials: 'same-origin',
    // SeerrNG marks detail responses cacheable for 5 minutes (stale for 30), which would hide
    // a request someone just made. Revalidate every time; unchanged answers come back as 304.
    cache: 'no-cache',
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...csrfHeaders(),
      ...(init.headers || {}),
    },
  });
  if (!res.ok) {
    let msg = res.statusText;
    let confirmationRequired: string | undefined;
    let code: string | undefined;
    let reason: string | undefined;
    let testResults: unknown;
    let allowOverride = false;
    try {
      const b = await res.json();
      msg = b.message || b.error || msg;
      testResults = b.tests;
      allowOverride = b.allowOverride === true;
      if (typeof b.code === 'string') code = b.code;
      if (typeof b.reason === 'string') reason = b.reason;
      if (typeof b.confirmationRequired === 'string')
        confirmationRequired = b.confirmationRequired;
    } catch {
      // body wasn't JSON
    }
    const retryAfter =
      res.status === 429 ? res.headers.get('Retry-After') : null;
    const now = Date.now();
    const target =
      retryAfter && /^\d+$/.test(retryAfter)
        ? now + Number(retryAfter) * 1000
        : retryAfter
          ? Date.parse(retryAfter)
          : NaN;
    const retryAt = Number.isFinite(target)
      ? Math.max(now, Math.min(target, now + 3_600_000))
      : code === 'PROVIDER_RATE_LIMITED' && res.status === 429
        ? now + 60_000
        : undefined;
    throw new ApiError(
      res.status,
      msg,
      confirmationRequired,
      code,
      reason,
      retryAt,
      testResults,
      allowOverride
    );
  }
  // a request or other change: saved answers may now be out of date
  if (invalidateCache && init.method && init.method !== 'GET') markAllStale();
  return response === 'empty' || res.status === 204
    ? (undefined as T)
    : res.json();
}

// ---- shapes we use (subset of SeerrNG's) ----
export const MediaStatus = {
  UNKNOWN: 1,
  PENDING: 2,
  PROCESSING: 3,
  PARTIAL: 4,
  AVAILABLE: 5,
  BLOCKLISTED: 6,
} as const;

export interface MediaInfo {
  hasActiveRequest?: boolean;
  viewerRequestCoverage?: {
    standard?: boolean;
    fourK?: boolean;
    seasons?: { seasonNumber: number; standard: boolean; fourK: boolean }[];
  };
  id?: number;
  requests?: {
    id: number;
    status: number;
    bookFormat?: string;
    is4k?: boolean;
    createdAt?: string;
    requestedBy?: { displayName?: string };
    seasons?: {
      seasonNumber: number;
      status?: number;
      episodeNumbers?: number[] | null;
    }[];
  }[];
  hasPlexAudiobookFile?: boolean;
  availableEbookServiceIds?: number[] | null;
  availableAudiobookServiceIds?: number[] | null;
  ratingKey?: string | null;
  externalServiceId?: number | null;
  audiobookExternalServiceId?: number | null;
  audiobookLibraryServiceId?: number | null;
  audiobookLibraryItemId?: string | null;
  downloadStatus?: DownloadItem[];
  audiobookDownloadStatus?: DownloadItem[];
  downloadStatus4k?: DownloadItem[];
  // comics: issues/volumes in the library out of those known (BackIssue)
  comicProgress?: { owned: number; total: number };
  // comics: the series in the reading server (Kavita), once any of it is in
  readerUrl?: string;
  status?: number;
  status4k?: number;
  mediaAddedAt?: string;
  mediaUrl?: string;
  mediaUrl4k?: string;
  iOSPlexUrl?: string;
  iOSPlexUrl4k?: string;
}
export { mediaLink, plexLink, plexUrl } from './plexLinks';
export interface TitleResult {
  id: number;
  mediaType: 'movie' | 'tv' | 'person';
  title?: string;
  name?: string;
  posterPath?: string;
  profilePath?: string;
  backdropPath?: string;
  releaseDate?: string;
  firstAirDate?: string;
  voteAverage?: number;
  directors?: string[];
  writers?: string[];
  genreIds?: number[];
  originalLanguage?: string;
  mediaInfo?: MediaInfo;
}
export interface CollectionResult {
  id: number;
  mediaType: 'collection';
  title: string;
  posterPath?: string;
  backdropPath?: string;
}

export type VideoSearchResult = TitleResult | CollectionResult;

export interface BookResult {
  id: string;
  mediaType: 'book';
  provider?: 'openlibrary' | 'bookshelf';
  title: string;
  author?: string;
  publisher?: string;
  authorId?: string;
  isbn13?: string;
  editionId?: string;
  posterPath?: string | null;
  bookFormat?: 'ebook' | 'audiobook' | string;
  firstPublishYear?: number;
  languages?: string[];
  ratingsAverage?: number;
  ratingsCount?: number;
  subjects?: string[];
  series?: { id?: string; title?: string; position?: string }[];
  mediaInfo?: MediaInfo;
}
export interface Paged<T> {
  page: number;
  totalPages: number;
  results: T[];
}
export interface MediaRow {
  id: number;
  tmdbId: number;
  mediaType: string;
  status: number;
  status4k?: number;
  title?: string;
  posterPath?: string;
  releaseDate?: string;
  mediaAddedAt?: string;
}
export type CardTitleMode = 'hover' | 'always';
export type CardTitleKind = 'movie' | 'tv' | 'album' | 'book';
export type CardTitleSettings = Partial<Record<CardTitleKind, CardTitleMode>>;
export const defaultCardTitleModes = {
  movie: 'hover',
  tv: 'hover',
  album: 'always',
  book: 'always',
} satisfies Record<CardTitleKind, CardTitleMode>;

export type VideoDetailPins = Partial<
  Record<'cast' | 'crew' | 'subjectTags', boolean>
>;

export interface User {
  plexUsername?: string | null;
  jellyfinUsername?: string | null;
  id: number;
  displayName: string;
  avatar?: string;
  permissions: number;
  userType?: 1 | 2 | 3 | 4;
  warnings?: string[];
  tvSeasonWatchGateStatus?: string;
  settings?: {
    advancedThemeOverrides?: Record<string, string | number> | null;
    detailDisclosureCastPinned?: boolean;
    detailDisclosureCrewPinned?: boolean;
    detailDisclosureSubjectTagsPinned?: boolean;
    detailDisclosurePins?: Partial<Record<'movie' | 'tv', VideoDetailPins>>;
    cardTextVisibilityMovie?: CardTitleMode;
    cardTextVisibilityTv?: CardTitleMode;
    cardTextVisibilityAlbum?: CardTitleMode;
    cardTextVisibilityBook?: CardTitleMode;
  };
}
export interface Genre {
  id: number;
  name: string;
  backdrops: string[];
}

// TMDB artwork goes through SeerrNG's image proxy, the same as SeerrNG's own UI.
// Treat provider paths as untrusted input: accepting an arbitrary absolute URL here
// would turn metadata into a browser-side tracking/request primitive.
const TMDB_IMAGE_SIZES = new Set(['w185', 'w342', 'w500', 'w780', 'w1280']);
const THEAUDIODB_IMAGE_HOST = 'theaudiodb.com';
// eslint-disable-next-line no-control-regex -- Reject control characters in provider URL paths.
const IMAGE_URL_CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;
const UNSAFE_IMAGE_PATH_CHARACTERS = /[?#]/;
const isSafeImagePath = (path: string) => {
  if (
    path.length > 2048 ||
    !path.startsWith('/') ||
    path.startsWith('//') ||
    path.includes('//') ||
    path.includes('\\') ||
    IMAGE_URL_CONTROL_CHARACTERS.test(path) ||
    UNSAFE_IMAGE_PATH_CHARACTERS.test(path)
  ) {
    return false;
  }

  return path
    .slice(1)
    .split('/')
    .every((segment) => {
      let decoded = segment;
      // URL and proxy layers can decode more than one percent-encoding layer.
      // Check every layer so encoded dot segments and separators cannot become
      // traversal after the browser has canonicalized the URL.
      for (let layer = 0; layer < 8; layer++) {
        let next: string;
        try {
          next = decodeURIComponent(decoded);
        } catch {
          return false;
        }
        if (
          decoded === '.' ||
          decoded === '..' ||
          decoded.includes('/') ||
          decoded.includes('\\') ||
          IMAGE_URL_CONTROL_CHARACTERS.test(decoded) ||
          UNSAFE_IMAGE_PATH_CHARACTERS.test(decoded)
        ) {
          return false;
        }
        if (next === decoded) return true;
        decoded = next;
      }
      // Excessive nested encodings are unnecessary for provider image paths.
      return false;
    });
};
const theAudioDbImg = (value: string) => {
  if (
    value.length > 2048 ||
    value.includes('?') ||
    value.includes('#') ||
    value.includes('\\')
  ) {
    return '';
  }
  // Validate the original path before WHATWG URL parsing normalizes literal or
  // percent-encoded dot segments. The image proxy receives a path, never a
  // provider-selected origin.
  const rawPath = value.match(/^https:\/\/[^/?#]+(\/[^?#]*)?$/i)?.[1];
  if (!rawPath || !isSafeImagePath(rawPath)) return '';
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    if (
      url.protocol !== 'https:' ||
      (url.port && url.port !== '443') ||
      url.username ||
      url.password ||
      (hostname !== THEAUDIODB_IMAGE_HOST &&
        !hostname.endsWith(`.${THEAUDIODB_IMAGE_HOST}`)) ||
      url.search ||
      url.hash ||
      !isSafeImagePath(url.pathname)
    ) {
      return '';
    }
    return `/imageproxy/theaudiodb${url.pathname}`;
  } catch {
    return '';
  }
};
export const tmdbImg = (path: string | undefined | null, size = 'w342') => {
  if (typeof path !== 'string' || !path) return '';
  if (path.startsWith('https://')) return theAudioDbImg(path);
  if (!isSafeImagePath(path)) return '';
  const safeSize = TMDB_IMAGE_SIZES.has(size) ? size : 'w342';
  return `/imageproxy/tmdb/t/p/${safeSize}${path}`;
};

// ComicVine, AniList, Hardcover and Open Library covers through SeerrNG's image proxy (cached on the
// server, and no third-party requests from the browser); other https covers are used as given
const PROXIED_ART: Record<string, string> = {
  'comicvine.gamespot.com': '/imageproxy/comicvine/',
  'comicvine.cbsistatic.com': '/imageproxy/comicvinestatic/',
  'comicvine1.cbsistatic.com': '/imageproxy/comicvinestatic1/',
  's4.anilist.co': '/imageproxy/anilist/',
  'covers.openlibrary.org': '/imageproxy/openlibrarycovers/',
  'assets.hardcover.app': '/imageproxy/hardcover/',
};
// an https address without a user name or password, or undefined
const httpsArt = (raw: string) => {
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' && !u.username && !u.password
      ? u
      : undefined;
  } catch {
    return undefined;
  }
};
// The path of a cover on exactly this host, for a proxy route on this side. The raw path is
// checked before URL parsing tidies it: nothing that could climb out of the route (dot
// segments or backslashes, plain or encoded). Query and fragment are dropped.
export function proxiedArtPath(raw: string, host: string): string | undefined {
  const u = httpsArt(raw);
  if (!u || u.hostname !== host || (u.port && u.port !== '443'))
    return undefined;
  const rawPath = raw.match(/^https:\/\/[^/?#\\]+(\/[^?#]*)/i)?.[1];
  if (!rawPath || rawPath === '/' || !isSafeImagePath(rawPath))
    return undefined;
  return u.pathname.slice(1) || undefined;
}
const LOCAL_ART_ROUTE =
  /^(?:\/imageproxy\/.+|\/api\/v1\/(?:(?:sportarr|magazine)\/cover\/[^/]+\/[^/]+|(?:movie|author|adult)\/[^/]+\/cover|book-series\/covers\/image))$/;

function localArt(raw: string) {
  const path = raw.split(/[?#]/, 1)[0];
  return LOCAL_ART_ROUTE.test(path) &&
    !raw.includes('\\') &&
    isSafeImagePath(path)
    ? raw
    : undefined;
}

export const artUrl = (url?: string | null) => {
  if (typeof url !== 'string' || !url || IMAGE_URL_CONTROL_CHARACTERS.test(url))
    return undefined;
  // Preserve the query string on valid same-origin proxy paths.
  if (url.startsWith('/')) return localArt(url);
  const u = httpsArt(url);
  if (!u) return undefined;
  if (typeof location !== 'undefined' && u.origin === location.origin)
    return localArt(u.pathname + u.search);
  const to = Object.hasOwn(PROXIED_ART, u.hostname)
    ? PROXIED_ART[u.hostname]
    : undefined;
  if (!to) return u.href;
  const path = proxiedArtPath(url, u.hostname);
  return path ? to + path : undefined;
};

// a book cover through the image proxy; Open Library covers come in the medium size for
// cards (about half the bytes of the large one, which the book page keeps)
export const bookArt = (url?: string | null, size: 'M' | 'L' = 'M') => {
  const u = artUrl(url);
  return u?.startsWith('/imageproxy/openlibrarycovers/')
    ? u.replace(/-[SML](\.jpg)(?=$|\?)/i, `-${size}$1`)
    : u;
};

export const titleOf = (r: TitleResult) => r.title || r.name || '';
export const yearOf = (r: TitleResult) =>
  (r.releaseDate || r.firstAirDate || '').slice(0, 4);

// ---- requests ----
export interface SeasonRequestSelection {
  seasonNumber: number;
  episodeNumbers?: number[];
}

export interface RequestOptions {
  is4k?: boolean;
  serverId?: number;
  profileId?: number;
  rootFolder?: string;
  languageProfileId?: number;
  metadataLanguageId?: number | null;
  sonarrSeasonType?: string | null;
  tags?: number[] | null;
  requesterSelectedOptions?: {
    tags: boolean;
    profile?: boolean;
    rootFolder?: boolean;
    languageProfile?: boolean;
  };
  ignoreQuota?: boolean;
  requestQuotaApproval?: boolean;
  bypassStreamingRequestPolicy?: boolean;
  userId?: number; // request on someone else's behalf (admins)
}
const post = <T = { id: number }>(body: object) =>
  api<T>('/request', {
    method: 'POST',
    body: JSON.stringify(body),
  });
// movies are one click
export const requestMovie = (id: number, o: RequestOptions = {}) =>
  post<{ id: number; quotaException?: boolean }>({
    mediaType: 'movie',
    mediaId: id,
    ...o,
  });
// series default to the whole show; a list asks for just those seasons
export const requestSeries = async (
  id: number,
  seasons: number[] | 'all' = 'all',
  o: RequestOptions & {
    tvdbId?: number;
    seasonRequests?: SeasonRequestSelection[];
  } = {}
) => {
  const result = await post<{
    id: number;
    quotaException?: boolean;
    seasons?: { seasonNumber: number }[];
  }>({
    mediaType: 'tv',
    mediaId: id,
    seasons,
    ...o,
  });
  if (!Number.isSafeInteger(result?.id) || result.id <= 0) {
    const unit = o.seasonRequests?.some(
      ({ episodeNumbers }) => episodeNumbers?.length
    )
      ? 'episodes'
      : 'seasons';
    throw new ApiError(
      202,
      `No selected ${unit} were added.`,
      undefined,
      'REQUEST_NOT_CONFIRMED'
    );
  }
  return result;
};
// books: the format decides which ChaptarrNG server; an edition pins one narration
// policy 'only' = exactly that narration; 'either' = that edition is the target, other copies OK;
// 'alongside' = add that narration as a separate copy next to the one already in the library
export const requestBook = (
  id: string,
  format: 'ebook' | 'audiobook',
  editionId?: string,
  policy: 'only' | 'either' | 'alongside' = 'only'
) =>
  post({
    mediaType: 'book',
    mediaId: bookIdFor(id, format),
    format,
    ...(editionId
      ? { preferredEditionId: editionId, editionPolicy: policy }
      : {}),
  });

// An audiobook request with no edition lets ChaptarrNG pick one, and it has picked foreign
// editions (an Italian Project Hail Mary). "Any narrator" therefore still names an English one.
const englishLang = (l?: string) => !l || /^(en|eng|english)$/i.test(l);
// SeerrNG only looks editions up when it also has an identity (or title), so pass the Hardcover
// work as foreignBookId alongside the search term
export const audiobookEditionsPath = (workId: string) =>
  `/editions/book?format=audiobook&term=${encodeURIComponent('work:' + workId)}&foreignBookId=${encodeURIComponent('hc:' + workId)}`;
export async function englishAudioEdition(
  workId: string | null
): Promise<string | undefined> {
  if (!workId) return undefined;
  try {
    const d = await api<{
      editions: {
        id: string;
        language?: string;
        narrators?: string[] | null;
        selected?: boolean;
        durationSeconds?: number | null;
        requestable?: boolean;
      }[];
    }>(audiobookEditionsPath(workId));
    // copies SeerrNG can't pin come with an empty id; naming one would pin nothing
    const en = d.editions.filter(
      (e) =>
        englishLang(e.language) &&
        e.narrators?.length &&
        e.id &&
        e.requestable !== false
    );
    return (
      en.find((e) => e.selected) ||
      en.find((e) => e.durationSeconds) ||
      en[0]
    )?.id;
  } catch {
    return undefined;
  }
}
export const cancelRequest = (id: number) =>
  api(`/request/${id}`, { method: 'DELETE' });

// "Tracy-Ann Oberman" and "Tracy Ann Oberman" are the same person
export const narratorKey = (names?: (string | null | undefined)[] | null) =>
  (names || [])
    .map((n) =>
      String(n || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
    )
    .filter(Boolean)
    .sort()
    .join('|');

// Book identities belong to SeerrNG's configured provider and service, not a
// frontend-assigned format/server number. Keep opaque IDs byte-for-byte.
export const isBookshelf = (id: string) => id.startsWith('bookshelf:');
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const bookIdFor = (id: string, _format: 'ebook' | 'audiobook') => id;
export function bookRequestLabel(format?: string) {
  if (format === 'both') return 'Ebook and Audiobook';
  return format === 'audiobook' ? 'Audiobook' : 'Ebook';
}

export function videoDetailPath(
  kind: 'movie' | 'tv',
  id: number,
  is4k: boolean,
  season?: number,
  episode?: number
) {
  const anchor =
    kind === 'tv' &&
    season !== undefined &&
    Number.isSafeInteger(season) &&
    season >= 0
      ? `#season-${season}`
      : '';
  const query = new URLSearchParams();
  if (is4k) query.set('quality', '4k');
  if (
    anchor &&
    episode !== undefined &&
    Number.isSafeInteger(episode) &&
    episode > 0
  )
    query.set('episode', String(episode));
  return `/${kind}/${id}${query.size ? `?${query}` : ''}${anchor}`;
}

export function bookDetailPath(
  id: string,
  format: 'ebook' | 'audiobook',
  lookupTitle?: string | null
) {
  const params = new URLSearchParams();
  if (format === 'audiobook') params.set('f', 'audio');
  const title = lookupTitle?.trim();
  if (isBookshelf(id) && title && title.length <= 512)
    params.set('lookupTitle', title);
  const suffix = params.toString();
  return `/book/${encodeURIComponent(bookIdFor(id, format))}${suffix ? `?${suffix}` : ''}`;
}
export const hardcoverWorkId = (id: string) => {
  if (!isBookshelf(id)) return null;
  try {
    const raw = atob(id.split(':')[2].replace(/-/g, '+').replace(/_/g, '/'));
    return /^hc:(\d+)$/.exec(raw)?.[1] ?? null;
  } catch {
    return null;
  }
};
export const readerServiceUrl = (raw: string) => {
  if (
    typeof raw !== 'string' ||
    IMAGE_URL_CONTROL_CHARACTERS.test(raw) ||
    !/^https?:\/\//i.test(raw) ||
    raw.includes('\\')
  )
    return null;
  try {
    const url = new URL(raw);
    return ['http:', 'https:'].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url
      : null;
  } catch {
    return null;
  }
};

// "Read in Kavita": SeerrNG's link to the series (http/https only), moved onto the admin's
// Kavita address when Lumen has one, the way the Audiobookshelf address works
export const kavitaLink = (
  readerUrl?: string | null,
  base?: string
): string | null => {
  const link = readerUrl ? readerServiceUrl(readerUrl) : null;
  if (!link) return null;
  const series = /\/library\/(\d+)\/series\/(\d+)\/?$/.exec(link.pathname);
  if (!series) return null;
  const own = base ? readerServiceUrl(base) : null;
  const target = own ?? link;
  target.search = '';
  target.hash = '';
  if (own) {
    own.pathname = `${own.pathname.replace(/\/+$/, '')}/library/${series[1]}/series/${series[2]}`;
  }
  return target.href;
};

// The admin's Audiobookshelf address (http/https only), opening the item when SeerrNG knows it
export const audiobookshelfLink = (
  base?: string,
  itemId?: string | null
): string | null => {
  const url = base ? readerServiceUrl(base) : null;
  if (!url) return null;
  url.search = '';
  url.hash = '';
  if (
    typeof itemId === 'string' &&
    itemId &&
    itemId !== '.' &&
    itemId !== '..' &&
    !IMAGE_URL_CONTROL_CHARACTERS.test(itemId)
  ) {
    try {
      url.pathname = `${url.pathname.replace(/\/+$/, '')}/item/${encodeURIComponent(itemId)}`;
    } catch {
      return null;
    }
  }
  return url.href;
};
export const bookMediaForFormat = (
  media: MediaInfo | undefined,
  format: 'ebook' | 'audiobook'
): MediaInfo | undefined => {
  if (!media || media.status === MediaStatus.BLOCKLISTED) return media;
  if (format === 'audiobook') {
    media = { ...media, downloadStatus: media.audiobookDownloadStatus };
  }
  const hasRequests = Array.isArray((media as { requests?: unknown }).requests);
  if (
    media.status !== MediaStatus.AVAILABLE &&
    media.status !== MediaStatus.PARTIAL
  )
    // the aggregate says requested/processing: with the requests at hand, say it only for the
    // format that was actually asked for
    return hasRequests
      ? { ...media, status: requestedStatus(media, format) }
      : media;
  const hasFiles = (ids: unknown) =>
    Array.isArray(ids) && ids.some((id) => Number.isSafeInteger(id) && id >= 0);
  const available =
    format === 'ebook'
      ? hasFiles(media.availableEbookServiceIds)
      : media.hasPlexAudiobookFile === true ||
        hasFiles(media.availableAudiobookServiceIds) ||
        !!media.ratingKey ||
        (media.audiobookLibraryServiceId != null &&
          !!media.audiobookLibraryItemId);
  if (available) return { ...media, status: MediaStatus.AVAILABLE };
  return { ...media, status: requestedStatus(media, format) };
};
// not in the library in this format: a request for it that's waiting for approval or already
// handed to the book service still counts, so the page doesn't offer to request it again
const requestedStatus = (
  media: MediaInfo,
  format: 'ebook' | 'audiobook'
): number | undefined => {
  const requests =
    (
      media as {
        requests?: {
          status?: number;
          bookFormat?: string;
          serviceTargets?: {
            serviceType?: string;
            format?: string;
            status?: number;
          }[];
        }[];
      }
    ).requests || [];
  const active = requests.filter((r) => {
    if ((r.bookFormat ?? 'ebook') !== format && r.bookFormat !== 'both')
      return false;
    if (r.status === 1 || r.status === 2) return true;
    return (
      r.status === 5 &&
      r.serviceTargets?.some(
        (target) =>
          target.serviceType === 'readarr' &&
          target.format === format &&
          (target.status === MediaStatus.PENDING ||
            target.status === MediaStatus.PROCESSING)
      )
    );
  });
  if (active.some((r) => r.status === 2 || r.status === 5))
    return MediaStatus.PROCESSING;
  if (active.length) return MediaStatus.PENDING;
  return undefined;
};

// ---- detail shapes ----
export interface Person {
  id: number;
  name: string;
  character?: string;
  job?: string;
  profilePath?: string;
}
export interface Credits {
  cast: Person[];
  crew: Person[];
}
type RelatedVideo = { site: string; key: string; type: string };

export function youtubeTrailerUrl(
  videos?: RelatedVideo[],
  configuredBase?: string
) {
  const trailer = videos?.find(
    (video) =>
      video?.type === 'Trailer' &&
      video.site === 'YouTube' &&
      typeof video.key === 'string' &&
      /^[a-zA-Z0-9_-]{11}$/.test(video.key)
  );
  if (!trailer) return;
  if (configuredBase) {
    try {
      const base = new URL(configuredBase);
      const destination = new URL(configuredBase + trailer.key);
      if (
        (base.protocol === 'https:' || base.protocol === 'http:') &&
        !base.username &&
        !base.password &&
        !base.hash &&
        destination.origin === base.origin
      ) {
        return destination.href;
      }
    } catch {
      // An invalid configuration leaves the standard trailer destination usable.
    }
  }
  return `https://www.youtube.com/watch?v=${trailer.key}`;
}

export interface SubjectTag {
  id: number;
  name: string;
}

export interface ProductionCountry {
  iso_3166_1: string;
  name: string;
}

export interface WatchProviderRegion {
  iso_3166_1: string;
  flatrate?: { id: number; name: string }[];
}

export interface MovieDetails extends TitleResult {
  watchProviders?: WatchProviderRegion[];
  originalTitle?: string;
  status?: string;
  budget?: number;
  revenue?: number;
  onUserWatchlist?: boolean;
  runtime?: number;
  tagline?: string;
  overview?: string;
  genres: { id: number; name: string }[];
  credits?: Credits;
  keywords?: SubjectTag[];
  productionCompanies?: { id: number; name: string }[];
  productionCountries?: ProductionCountry[];
  relatedVideos?: RelatedVideo[];
  releases?: {
    results: {
      iso_3166_1: string;
      release_dates: {
        certification: string;
        type: number;
        release_date?: string;
      }[];
    }[];
  };
  collection?: { id: number; name: string };
}
export interface Season {
  seasonNumber: number;
  episodeCount: number;
  airDate?: string;
  name: string;
}
export interface TvDetails extends TitleResult {
  watchProviders?: WatchProviderRegion[];
  relatedVideos?: RelatedVideo[];
  externalIds?: { tvdbId?: number | null };
  originalName?: string;
  onUserWatchlist?: boolean;
  overview?: string;
  genres: { id: number; name: string }[];
  seasons: Season[];
  numberOfSeasons: number;
  episodeRunTime?: number[];
  networks?: { id?: number; name: string }[];
  status?: string;
  credits?: Credits;
  keywords?: SubjectTag[];
  productionCountries?: ProductionCountry[];
  createdBy?: { name: string }[];
  contentRatings?: { results: { iso_3166_1: string; rating: string }[] };
  lastEpisodeToAir?: {
    airDate: string;
    seasonNumber: number;
    episodeNumber: number;
  };
  nextEpisodeToAir?: {
    airDate: string;
    seasonNumber: number;
    episodeNumber: number;
  };
  mediaInfo?: MediaInfo & {
    seasons?: { seasonNumber: number; status: number; status4k?: number }[];
  };
}
export interface BookDetails extends BookResult {
  onUserWatchlist?: boolean;
  description?: string;
  isbnCandidates?: string[];
}
export interface Edition {
  id: string;
  title: string;
  format: string;
  language?: string;
  narrators?: string[] | null;
  production?: string;
  durationSeconds?: number | null;
  publisher?: string;
  releaseDate?: string;
  owned?: boolean;
  selected?: boolean;
  requestable?: boolean; // false: no edition id SeerrNG can pin a request to
}
// GET /editions/book: 'library' lists what the book service tracks (owned / selected are real);
// 'lookup' is a catalogue preview where selected is only the suggested pick
export interface EditionList {
  editions: Edition[];
  supportsAlongside?: boolean;
  source?: 'library' | 'lookup' | 'none';
}
export interface DownloadItem {
  percent?: number;
  liveDownloadToken?: string;
  downloadId?: string;
  size: number;
  sizeLeft: number;
  timeLeft?: string; // "hh:mm:ss"
  status?: string;
}
export interface RequestItem {
  quotaException?: boolean;
  serverId?: number | null;
  languageProfileId?: number | null;
  metadataLanguageId?: number | null;
  sonarrSeasonType?: string | null;
  tags?: number[] | null;
  isAutoRequest?: boolean;
  watchAheadParentRequestId?: number | null;
  watchAheadEpisodeCount?: number;
  watchAheadUsesUserDefault?: boolean;
  failureReason?: string | null;
  currentStatus?: {
    retryable?: boolean;
    stage: string;
    percent: number | null;
    message?: string;
  };
  id: number;
  status: number; // 1 pending approval, 2 approved, 3 declined, 4 failed, 5 completed
  type: string;
  is4k: boolean;
  createdAt: string;
  bookFormat?: string;
  preferredEditionId?: string | null;
  seasons: {
    seasonNumber: number;
    status?: number;
    episodeNumbers?: number[] | null;
  }[];
  requestedBy: { id: number; displayName: string };
  media: MediaInfo & {
    mediaType: string;
    tmdbId: number;
    status: number;
    status4k?: number;
    mediaUrl?: string;
    mediaUrl4k?: string;
    iOSPlexUrl?: string;
    iOSPlexUrl4k?: string;
    downloadStatus?: DownloadItem[];
    downloadStatus4k?: DownloadItem[];
    audiobookDownloadStatus?: DownloadItem[];
    seasons?: { seasonNumber: number; status: number; status4k?: number }[];
    identifiers?: { provider: string; value: string }[];
    mbId?: string | null;
  };
}

// A book with no cover in a list gets the one on its own detail page. SeerrNG's book lookup
// has it (Hardcover art, served through /imageproxy/hardcover), so no extra service is needed.
// Answers are kept for the session; a failed lookup is not retried.
const coverCache = new Map<string, Promise<string | undefined>>();
export function bookCover(id: string): Promise<string | undefined> {
  let hit = coverCache.get(id);
  if (!hit) {
    hit = api<BookDetails>(`/book/${encodeURIComponent(id)}`)
      .then((d) => bookArt(d.posterPath))
      .catch(() => undefined);
    coverCache.set(id, hit);
  }
  return hit;
}
export async function bookCovers(
  ids: string[]
): Promise<Map<string, string | undefined>> {
  const out = new Map<string, string | undefined>();
  const queue = [...new Set(ids)];
  const worker = async () => {
    for (let id = queue.shift(); id; id = queue.shift())
      out.set(id, await bookCover(id));
  };
  await Promise.all([worker(), worker(), worker()]);
  return out;
}

export const connectionHostsPath = '/settings/connection-hosts';
export interface Host {
  name: string;
  hostname: string;
}
