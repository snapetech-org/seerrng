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
  hasPlexAudiobookFile?: boolean;
  availableEbookServiceIds?: number[] | null;
  availableAudiobookServiceIds?: number[] | null;
  ratingKey?: string | null;
  externalServiceId?: number | null;
  audiobookExternalServiceId?: number | null;
  audiobookLibraryServiceId?: number | null;
  audiobookLibraryItemId?: string | null;
  downloadStatus?: { size: number; sizeLeft: number }[];
  downloadStatus4k?: { size: number; sizeLeft: number }[];
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

// TMDB artwork goes through SeerrNG's image proxy, the same as SeerrNG's own UI
export const tmdbImg = (path: string | undefined | null, size = 'w342') =>
  !path
    ? ''
    : path.startsWith('http')
      ? path
      : `/imageproxy/tmdb/t/p/${size}${path}`;

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
      }[];
    }>(
      `/editions/book?format=audiobook&term=${encodeURIComponent('work:' + workId)}`
    );
    const en = d.editions.filter(
      (e) => englishLang(e.language) && e.narrators?.length
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
export const bookMediaForFormat = (
  media: MediaInfo | undefined,
  format: 'ebook' | 'audiobook'
): MediaInfo | undefined => {
  if (
    !media ||
    (media.status !== MediaStatus.AVAILABLE &&
      media.status !== MediaStatus.PARTIAL)
  )
    return media;
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
  return available
    ? { ...media, status: MediaStatus.AVAILABLE }
    : { ...media, status: undefined };
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
