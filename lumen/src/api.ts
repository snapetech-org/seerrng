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
    message: string
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
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
    try {
      const b = await res.json();
      msg = b.message || b.error || msg;
    } catch {
      // body wasn't JSON
    }
    throw new ApiError(res.status, msg);
  }
  // a request or other change: saved answers may now be out of date
  if (init.method && init.method !== 'GET') markAllStale();
  return res.status === 204 ? (undefined as T) : res.json();
}

// ---- shapes we use (subset of SeerrNG's) ----
export const MediaStatus = {
  UNKNOWN: 1,
  PENDING: 2,
  PROCESSING: 3,
  PARTIAL: 4,
  AVAILABLE: 5,
} as const;

export interface MediaInfo {
  requests?: {
    id: number;
    status: number;
    bookFormat?: string;
    is4k?: boolean;
    createdAt?: string;
    requestedBy?: { displayName?: string };
    seasons?: { seasonNumber: number; status?: number }[];
  }[];
  hasPlexAudiobookFile?: boolean;
  availableEbookServiceIds?: number[] | null;
  availableAudiobookServiceIds?: number[] | null;
  ratingKey?: string | null;
  externalServiceId?: number | null;
  audiobookExternalServiceId?: number | null;
  audiobookLibraryServiceId?: number | null;
  audiobookLibraryItemId?: string | null;
  downloadStatus?: { size: number; sizeLeft: number; percent?: number }[];
  downloadStatus4k?: { size: number; sizeLeft: number }[];
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
  genreIds?: number[];
  mediaInfo?: MediaInfo;
}
export interface BookResult {
  id: string;
  mediaType: 'book';
  provider?: 'openlibrary' | 'bookshelf';
  title: string;
  author?: string;
  posterPath?: string | null;
  bookFormat?: 'ebook' | 'audiobook' | string;
  firstPublishYear?: number;
  series?: { title?: string; position?: string }[];
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
export interface User {
  id: number;
  displayName: string;
  avatar?: string;
  permissions: number;
  warnings?: string[];
}
export interface Genre {
  id: number;
  name: string;
  backdrops: string[];
}

// TMDB artwork goes through SeerrNG's image proxy, the same as SeerrNG's own UI.
// Treat provider paths as untrusted input: accepting an arbitrary absolute URL here
// would turn metadata into a browser-side tracking/request primitive.
const TMDB_IMAGE_SIZES = new Set(['w342', 'w500', 'w780', 'w1280']);
const THEAUDIODB_IMAGE_HOST = 'theaudiodb.com';
const isSafeImagePath = (path: string) => {
  if (
    path.length > 2048 ||
    !path.startsWith('/') ||
    path.startsWith('//') ||
    path.includes('//') ||
    path.includes('\\') ||
    /[\u0000-\u001f\u007f?#]/.test(path)
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
          /[\u0000-\u001f\u007f?#]/.test(decoded)
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

// ComicVine, AniList and Open Library covers through SeerrNG's image proxy (cached on the
// server, and no third-party requests from the browser); anything else is used as given
const PROXIED_ART: [string, string][] = [
  ['https://comicvine.gamespot.com/', '/imageproxy/comicvine/'],
  ['https://comicvine.cbsistatic.com/', '/imageproxy/comicvinestatic/'],
  ['https://comicvine1.cbsistatic.com/', '/imageproxy/comicvinestatic1/'],
  ['https://s4.anilist.co/', '/imageproxy/anilist/'],
  ['https://covers.openlibrary.org/', '/imageproxy/openlibrarycovers/'],
];
export const artUrl = (url?: string | null) => {
  if (!url) return undefined;
  for (const [from, to] of PROXIED_ART)
    if (url.startsWith(from)) return to + url.slice(from.length);
  return url;
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
export interface RequestOptions {
  is4k?: boolean;
  serverId?: number;
  profileId?: number;
  rootFolder?: string;
  userId?: number; // request on someone else's behalf (admins)
}
const post = (body: object) =>
  api<{ id: number }>('/request', {
    method: 'POST',
    body: JSON.stringify(body),
  });
// movies are one click
export const requestMovie = (id: number, o: RequestOptions = {}) =>
  post({ mediaType: 'movie', mediaId: id, ...o });
// series default to the whole show; a list asks for just those seasons
export const requestSeries = (
  id: number,
  seasons: number[] | 'all' = 'all',
  o: RequestOptions = {}
) => post({ mediaType: 'tv', mediaId: id, seasons, ...o });
// books: the format decides which ChaptarrNG server; an edition pins one narration
// policy 'only' = exactly that narration; 'either' = that edition is the target, other copies OK
export const requestBook = (
  id: string,
  format: 'ebook' | 'audiobook',
  editionId?: string,
  policy: 'only' | 'either' = 'only'
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

// ---- ChaptarrNG extras (served by the SeerrNG companion proxy at /seerr-classic/) ----
// SeerrNG refuses a second request once an audiobook is in the library, and its edition list
// doesn't say which narrations are already there. ChaptarrNG's own lookup does, and the
// companion's /narration endpoint adds another narration as a separate copy.
export interface ChaptarrEdition {
  id: number;
  bookId: number;
  foreignEditionId: string;
  narratorNames?: string[];
  narrator?: string;
  language?: string;
  durationSeconds?: number;
  publisher?: string;
  releaseDate?: string;
  format?: string;
  bookFileCount?: number;
}
export interface ChaptarrWork {
  id?: number;
  title: string;
  editions?: ChaptarrEdition[];
  localAudiobookBooks?: {
    id: number;
    title: string;
    narrator?: string;
    hasFiles: boolean;
    monitored?: boolean;
  }[];
}
export async function chaptarrWork(
  workId: string
): Promise<ChaptarrWork[] | null> {
  const res = await fetch(
    `/seerr-classic/lookup?f=audiobook&d=hc&id=${encodeURIComponent(workId)}`,
    { credentials: 'same-origin', cache: 'no-cache' }
  );
  if (!res.ok) return null; // companion not installed: Lumen falls back to SeerrNG alone
  return res.json();
}
export async function requestAnotherNarration(
  bookId: number,
  editionId: number
) {
  const res = await fetch('/seerr-classic/narration', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bookId, editionId }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok)
    throw new ApiError(res.status, body.error || 'The request failed.');
  markAllStale();
  return body as {
    ok: true;
    bookId: number;
    narrators: string;
    alreadyTracked: boolean;
  };
}
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
export const hardcoverWorkId = (id: string) => {
  if (!isBookshelf(id)) return null;
  try {
    const raw = atob(id.split(':')[2].replace(/-/g, '+').replace(/_/g, '/'));
    return /^hc:(\d+)$/.exec(raw)?.[1] ?? null;
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
  const web = (raw: string) => {
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
  const link = readerUrl ? web(readerUrl) : null;
  if (!link) return null;
  const series = /\/library\/(\d+)\/series\/(\d+)\/?$/.exec(link.pathname);
  const own = base ? web(base) : null;
  if (own && series) {
    own.search = '';
    own.hash = '';
    own.pathname = `${own.pathname.replace(/\/+$/, '')}/library/${series[1]}/series/${series[2]}`;
    return own.href;
  }
  return link.href;
};

// The admin's Audiobookshelf address (http/https only), opening the item when SeerrNG knows it
export const audiobookshelfLink = (
  base?: string,
  itemId?: string | null
): string | null => {
  if (!base) return null;
  try {
    const url = new URL(base);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password
    )
      return null;
    url.search = '';
    url.hash = '';
    if (
      itemId &&
      itemId !== '.' &&
      itemId !== '..' &&
      // eslint-disable-next-line no-control-regex
      !/[\x00-\x1f]/.test(itemId)
    ) {
      url.pathname = `${url.pathname.replace(/\/+$/, '')}/item/${encodeURIComponent(itemId)}`;
    }
    return url.href;
  } catch {
    return null;
  }
};
export const bookMediaForFormat = (
  media: MediaInfo | undefined,
  format: 'ebook' | 'audiobook'
): MediaInfo | undefined => {
  if (!media) return media;
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
export interface MovieDetails extends TitleResult {
  runtime?: number;
  tagline?: string;
  overview?: string;
  genres: { id: number; name: string }[];
  credits?: Credits;
  relatedVideos?: { site: string; key: string; type: string; url: string }[];
  releases?: {
    results: {
      iso_3166_1: string;
      release_dates: { certification: string; type: number }[];
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
  overview?: string;
  genres: { id: number; name: string }[];
  seasons: Season[];
  numberOfSeasons: number;
  episodeRunTime?: number[];
  networks?: { name: string }[];
  status?: string;
  credits?: Credits;
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
  description?: string;
  subjects?: string[];
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
export interface DownloadItem {
  size: number;
  sizeLeft: number;
  timeLeft?: string; // "hh:mm:ss"
  status?: string;
}
export interface RequestItem {
  currentStatus?: {
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
  seasons: { seasonNumber: number }[];
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

// Hardcover book covers through the companion (one GraphQL call per 30 ids, images cached on
// the server). Ebook lists otherwise show square audiobook art cropped into a book shape.
const coverCache = new Map<string, string | undefined>();
export async function hcCovers(
  works: string[]
): Promise<Map<string, string | undefined>> {
  const missing = [...new Set(works)].filter((w) => !coverCache.has(w));
  for (let i = 0; i < missing.length; i += 30) {
    const ids = missing.slice(i, i + 30);
    try {
      const c = await fetch(`/seerr-classic/hccovers?ids=${ids.join(',')}`, {
        credentials: 'same-origin',
      });
      if (!c.ok) break; // no companion: keep the covers SeerrNG gave
      const d: {
        data?: { books?: { id: number; image?: { url?: string } }[] };
      } = await c.json();
      const byId = new Map(
        (d.data?.books || []).map((x) => [String(x.id), x.image?.url || ''])
      );
      for (const w of ids) {
        const path = /^https:\/\/assets\.hardcover\.app\/(.+)$/.exec(
          byId.get(w) || ''
        )?.[1];
        coverCache.set(w, path ? `/seerr-classic/hcimg/${path}` : undefined);
      }
    } catch {
      break;
    }
  }
  return new Map(works.map((w) => [w, coverCache.get(w)]));
}
