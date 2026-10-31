// Thin client for the SeerrNG API. Everything goes through the same origin (the Lumen
// container or the Vite dev proxy), so SeerrNG's session cookie does the auth.

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
    headers: { 'Content-Type': 'application/json', ...(init.headers || {}) },
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
  downloadStatus?: { size: number; sizeLeft: number }[];
  status?: number;
  status4k?: number;
  mediaAddedAt?: string;
  mediaUrl?: string;
  mediaUrl4k?: string;
}
// the title in Plex (Plex's web app, which hands off to the Plex app on phones)
export const plexUrl = (
  m?: { mediaUrl?: string; mediaUrl4k?: string },
  is4k = false
) => (is4k && m?.mediaUrl4k) || m?.mediaUrl;
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

// ---- book ids: bookshelf:<server>:<base64 work id>; server 0 = ebooks, 1 = audiobooks ----
export const isBookshelf = (id: string) => id.startsWith('bookshelf:');
const b64url = (s: string) =>
  btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const hardcoverWorkId = (id: string) => {
  if (!isBookshelf(id)) return null;
  try {
    const raw = atob(
      id.split(':')[2].replace(/-/g, '+').replace(/_/g, '/')
    ).replace(/^hc:/, '');
    return /^\d+$/.test(raw) ? raw : null;
  } catch {
    return null;
  }
};
// Ids stay in SeerrNG's plain form (bookshelf:<server>:<base64 work id>) so they match the
// media it already has. Newer SeerrNG builds look plain ebook ids up in the Goodreads catalogue
// (404); hardcoverEbookId() is the fallback that names Hardcover explicitly.
export const bookIdFor = (id: string, format: 'ebook' | 'audiobook') => {
  if (!isBookshelf(id)) return id;
  const work = hardcoverWorkId(id);
  const server = format === 'audiobook' ? 1 : 0;
  return work
    ? `bookshelf:${server}:${b64url(work)}`
    : id.replace(/^bookshelf:\d+:/, `bookshelf:${server}:`);
};
export const hardcoverEbookId = (id: string) => {
  const work = hardcoverWorkId(id);
  return work ? `bookshelf:0:${b64url('hc:' + work)}` : null;
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
    seasons?: { seasonNumber: number; status: number }[];
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
  id: number;
  status: number; // 1 pending approval, 2 approved, 3 declined, 4 failed, 5 completed
  type: string;
  is4k: boolean;
  createdAt: string;
  bookFormat?: string;
  seasons: { seasonNumber: number }[];
  requestedBy: { id: number; displayName: string };
  media: {
    mediaType: string;
    tmdbId: number;
    status: number;
    status4k?: number;
    mediaUrl?: string;
    mediaUrl4k?: string;
    downloadStatus?: DownloadItem[];
    downloadStatus4k?: DownloadItem[];
    audiobookDownloadStatus?: DownloadItem[];
    identifiers?: { provider: string; value: string }[];
    mbId?: string | null;
  };
}

// ---- book search through the companion (ChaptarrNG's Hardcover search) ----
// SeerrNG's book search mixes Open Library listings with ChaptarrNG works keyed by Goodreads
// numbers, so narrators, library status and request ids come out wrong. ChaptarrNG's own
// Hardcover search returns Hardcover ids and knows which copies the library has.
export interface HcBook {
  work: string;
  title: string;
  author?: string;
  year?: number;
  cover?: string;
  ebook?: number; // 5 in library, 2 requested
  audiobook?: number;
}
const JUNK =
  /\b(trivia|lined journal|journal|summary|summaries|study guide|workbook|colou?ring|notebook|fan ?fiction|pov|split edition|dramati[sz]ed adaptation|part \d+ of \d+|box ?set|boxed set|collection set)\b/i;
const localState = (copies?: { hasFiles: boolean; monitored?: boolean }[]) =>
  copies?.some((c) => c.hasFiles)
    ? 5
    : copies?.some((c) => c.monitored)
      ? 2
      : undefined;

export async function hcBookSearch(q: string): Promise<HcBook[] | null> {
  const res = await fetch(
    `/seerr-classic/hcsearch?q=${encodeURIComponent(q)}`,
    { credentials: 'same-origin', cache: 'no-cache' }
  ).catch(() => null);
  if (!res || !res.ok) return null;
  const rows:
    | {
        book?: {
          foreignBookId?: string;
          title?: string;
          releaseDate?: string;
          author?: { authorName?: string };
          localAudiobookBooks?: { hasFiles: boolean; monitored?: boolean }[];
          localEbookBooks?: { hasFiles: boolean; monitored?: boolean }[];
        };
      }[]
    | null = await res.json().catch(() => null);
  // no companion: the path falls through to the app page, which isn't JSON
  if (!Array.isArray(rows)) return null;
  const askedForJunk = JUNK.test(q);
  const seen = new Set<string>();
  const books: HcBook[] = [];
  for (const r of rows) {
    const b = r.book;
    const work = /^hc:(\d+)$/.exec(b?.foreignBookId || '')?.[1];
    if (!b || !work || !b.title) continue;
    if (!askedForJunk && JUNK.test(b.title)) continue;
    const key =
      b.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim() +
      '|' +
      (b.author?.authorName || '').toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    books.push({
      work,
      title: b.title,
      author: b.author?.authorName,
      year: b.releaseDate ? +b.releaseDate.slice(0, 4) : undefined,
      ebook: localState(b.localEbookBooks),
      audiobook: localState(b.localAudiobookBooks),
    });
  }
  const covers = await hcCovers(books.map((b) => b.work));
  for (const b of books) b.cover = covers.get(b.work);
  return books;
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
export const hcBookToResult = (
  b: HcBook,
  format: 'ebook' | 'audiobook'
): BookResult => ({
  id: `bookshelf:${format === 'audiobook' ? 1 : 0}:${b64url(b.work)}`,
  mediaType: 'book',
  title: b.title,
  author: b.author,
  posterPath: b.cover || null,
  bookFormat: format,
  firstPublishYear: b.year,
  mediaInfo: b[format] ? { status: b[format] } : undefined,
});
