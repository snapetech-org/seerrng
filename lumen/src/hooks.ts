import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  api,
  ApiError,
  bookMediaForFormat,
  hardcoverWorkId,
  hcCovers,
  MediaStatus,
  type BookResult,
  type MediaInfo,
  type Paged,
} from './api';
import {
  cached,
  cacheGeneration,
  forget,
  FRESH_MS,
  isFresh,
  onMarkStale,
  RECHECK_MS,
  remember,
  shared,
} from './apiCache';
import { friendlyError } from './errors';
import { recentPublicSettings } from './mediaServer';
import { onSessionReset, sessionGeneration } from './sessionState';

const PUBLIC_PATH = '/settings/public';

// A saved answer shows at once; a fresh one isn't asked for again (see apiCache.ts).
export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | null>(
    path ? (cached<T>(path) ?? null) : null
  );
  const [error, setError] = useState<string | null>(null);
  // the HTTP status of that error (0 when the server wasn't reached)
  const [errorStatus, setErrorStatus] = useState(0);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!path) return;
    let live = true;
    const generation = sessionGeneration();
    setError(null);
    setErrorStatus(0);
    const saved = cached<T>(path);
    setData(saved ?? null);
    if (saved !== undefined && isFresh(path)) return;
    fetchShared<T>(path)
      .then((d) => {
        if (generation !== sessionGeneration()) return;
        if (live) setData(d);
      })
      .catch((e) => {
        // a saved answer stays up if refreshing it fails
        if (live && saved === undefined) {
          setError(friendlyError(e, 'Failed to load'));
          setErrorStatus(e instanceof ApiError ? e.status : 0);
        }
      });
    return () => {
      live = false;
    };
  }, [path, tick]);
  const reload = useCallback(() => {
    if (path) forget(path);
    setTick((t) => t + 1);
  }, [path]);
  // ask again but keep what is on screen meanwhile (after a request the saved copy is already
  // marked stale, so the page updates in place instead of blanking)
  const refresh = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, errorStatus, reload, refresh };
}

// one call for everyone asking for the same path at once; the answer is saved
function fetchShared<T>(path: string): Promise<T> {
  return shared(path, async () => {
    const generation = sessionGeneration();
    const cacheVersion = cacheGeneration();
    const d =
      path === PUBLIC_PATH
        ? ((recentPublicSettings(RECHECK_MS) as T | null) ??
          (await api<T>(path)))
        : await api<T>(path);
    if (generation === sessionGeneration()) remember(path, d, cacheVersion);
    return d;
  });
}

// one answer, from the saved copy while it's fresh
export async function cachedApi<T>(path: string): Promise<T> {
  if (isFresh(path)) return cached<T>(path) as T;
  return fetchShared<T>(path);
}

export interface PublicSettings {
  lockLumenForNonAdmins?: boolean;
  softwareEnabled?: boolean;
  romarrEnabled?: boolean;
  applicationTitle: string;
  movie4kEnabled: boolean;
  series4kEnabled: boolean;
  partialRequestsEnabled: boolean;
  booksEnabled: boolean;
  ebookServiceEnabled: boolean;
  audiobookServiceEnabled: boolean;
  enabledMediaCategories?: Record<string, boolean>;
  adultEnabled?: boolean;
}
export const usePublicSettings = () =>
  useApi<PublicSettings>('/settings/public').data;

// page-at-a-time lists (discover endpoints return { page, totalPages, results })
// each history entry keeps what it had loaded, so Back lands on the same rows (and scroll spot)
const pagedSnap = new Map<
  string,
  { items: unknown[]; page: number; total: number; gen: number }
>();
export function usePaged<T>(base: string) {
  const entry = useLocation().key;
  const snapKey = `${entry}|${base}`;
  const snap = pagedSnap.get(snapKey);
  const [items, setItems] = useState<T[]>((snap?.items as T[]) || []);
  const [page, setPage] = useState(snap?.page || 0);
  const [total, setTotal] = useState(snap?.total || 1);
  const [loading, setLoading] = useState(false);
  const [loadedBase, setLoadedBase] = useState(base);
  const [error, setError] = useState<string | null>(null);
  // the cache generation these rows were fetched under: a request made since then means the
  // restored rows may show a title as not requested
  const rowsGen = useRef(snap?.gen ?? cacheGeneration());
  // one page in flight at a time: scroll triggers can fire twice before state catches up
  const inFlight = useRef<string | null>(null);
  const generation = useRef(0);
  const shownBase = useRef(base);
  useEffect(() => {
    if (shownBase.current === base) return; // first render: state already set above
    shownBase.current = base;
    setLoadedBase(base);
    generation.current += 1;
    setLoading(false);
    const s = pagedSnap.get(`${entry}|${base}`);
    setItems((s?.items as T[]) || []);
    setPage(s?.page || 0);
    setTotal(s?.total || 1);
    setError(null);
    rowsGen.current = s?.gen ?? cacheGeneration();
    inFlight.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base]);
  // Back to a list after something changed (a request): quietly re-read the pages that were
  // shown and swap them in place, so scroll position holds and statuses are current
  useEffect(() => {
    const s = pagedSnap.get(snapKey);
    if (!s || s.gen === cacheGeneration()) return;
    let live = true;
    const gen = cacheGeneration();
    const sep = base.includes('?') ? '&' : '?';
    (async () => {
      const rows: T[] = [];
      const seen = new Set<string>();
      let totalPages = s.total;
      for (let p = 1; p <= s.page; p++) {
        const d = await cachedApi<{
          page: number;
          totalPages: number;
          results: T[];
        }>(`${base}${sep}page=${p}`);
        totalPages = d.totalPages || 1;
        for (const r of d.results) {
          const id = String((r as { id?: unknown }).id);
          if (!seen.has(id)) {
            seen.add(id);
            rows.push(r);
          }
        }
        if (!live) return;
      }
      rowsGen.current = gen;
      // pages scrolled in while this ran stay after the refreshed ones
      setItems((cur) => {
        const idOf = (x: T) => String((x as { id?: unknown }).id);
        return rows.concat(cur.filter((x) => !seen.has(idOf(x))));
      });
      setTotal(totalPages);
    })().catch(() => {
      // the restored rows stay up if refreshing them fails
    });
    return () => {
      live = false;
    };
  }, [snapKey, base]);
  useEffect(() => {
    if (loadedBase === base && page > 0)
      pagedSnap.set(snapKey, { items, page, total, gen: rowsGen.current });
    // keep memory bounded: a long session visits many lists
    if (pagedSnap.size > 30)
      pagedSnap.delete(pagedSnap.keys().next().value as string);
  }, [base, loadedBase, snapKey, items, page, total]);
  const more = useCallback(async () => {
    // after a failure only Retry asks again: retrying by itself would hammer the rate limit
    if (loadedBase !== base || loading || page >= total || error) return;
    const key = `${base}#${page + 1}`;
    if (inFlight.current === key) return;
    inFlight.current = key;
    if (page === 0) rowsGen.current = cacheGeneration();
    const requestGeneration = generation.current;
    const ownsRequest = () =>
      generation.current === requestGeneration && inFlight.current === key;
    setLoading(true);
    try {
      const sep = base.includes('?') ? '&' : '?';
      const d = await cachedApi<{
        page: number;
        totalPages: number;
        results: T[];
      }>(`${base}${sep}page=${page + 1}`);
      if (!ownsRequest()) return; // an old filter must not replace the current list
      // popular lists shift between pages, so a title can come back; show it once
      const idOf = (x: T) => String((x as { id?: unknown }).id);
      setItems((x) => {
        const seen = new Set(x.map(idOf));
        return x.concat(d.results.filter((r) => !seen.has(idOf(r))));
      });
      setPage(d.page);
      setTotal(d.totalPages || 1);
    } catch (e) {
      if (ownsRequest()) setError(friendlyError(e, 'Failed to load'));
    } finally {
      if (ownsRequest()) {
        inFlight.current = null;
        setLoading(false);
      }
    }
  }, [base, loadedBase, page, total, loading, error]);
  useEffect(() => {
    if (page === 0 && !loading && !error) void more();
  }, [base, page, loading, error, more]);
  const retry = useCallback(() => {
    inFlight.current = null;
    setError(null);
  }, []);
  return {
    items,
    more,
    retry,
    loading,
    error,
    page,
    // a failed page also stops endless scrolling until Retry
    done: page >= total || !!error,
  };
}

// ---- book library state ----
// Active requests supplement the native book response while acquisition is pending.
// Availability always comes from scanned, format-specific library evidence.
export type BookState = { ebook?: number; audiobook?: number };
let bookStates: Promise<Map<string, BookState>> | null = null;
let bookStatesAt = 0;
export function loadBookStates(): Promise<Map<string, BookState>> {
  if (bookStates && Date.now() - bookStatesAt < 60_000) return bookStates;
  bookStatesAt = Date.now();
  const p: Promise<Map<string, BookState>> = api<{
    results: {
      status: number;
      bookFormat?: string;
      media: { status: number; identifiers?: { value: string }[] };
    }[];
  }>('/request?take=500&skip=0&filter=all&sort=added&mediaType=book')
    .then((d) => {
      const m = new Map<string, BookState>();
      for (const r of d.results) {
        // Request history is not file availability. Completed/declined/failed
        // requests must not turn deleted or other-format files into ownership.
        if (r.status !== 1 && r.status !== 2) continue;
        for (const i of r.media.identifiers || []) {
          if (!i.value.startsWith('bookshelf:') && !/^OL\d+W$/.test(i.value))
            continue;
          const work = i.value;
          // a request for both formats counts for each
          const formats: ('ebook' | 'audiobook')[] =
            r.bookFormat === 'both'
              ? ['ebook', 'audiobook']
              : [r.bookFormat === 'audiobook' ? 'audiobook' : 'ebook'];
          const cur = m.get(work) || {};
          for (const f of formats) cur[f] = Math.max(cur[f] || 0, 2);
          m.set(work, cur);
        }
      }
      return m;
    })
    .catch(() => {
      // a failed read shows nothing for now but isn't kept: the next ask tries again
      if (bookStates === p) bookStates = null;
      return new Map<string, BookState>();
    });
  bookStates = p;
  return p;
}
export const dropBookStates = () => {
  bookStates = null;
};
// cancelling, declining or removing a request (any change) must not leave "Requested" up
onMarkStale(dropBookStates);
export function useBookStates() {
  const [m, setM] = useState<Map<string, BookState> | null>(null);
  useEffect(() => {
    let live = true;
    loadBookStates().then((x) => live && setM(x));
    return () => {
      live = false;
    };
  }, []);
  return m;
}

// ---- books already in the library ----
// The catalogue feeds don't say which books are owned (SeerrNG before the fix sends no
// mediaInfo on them), so book cards also check the owned list: the same /book/library answer
// the "In library" filter shows, from the shared answer cache. SeerrNG lists only books with
// that format's files, and bookMediaForFormat checks the file evidence again.
type BookFormat = 'ebook' | 'audiobook';
export type OwnedBooks = {
  byId: Map<string, MediaInfo>;
  byWork: Map<string, MediaInfo>;
  // null: two different owned books share the title and author, so neither is matched
  byTitle: Map<string, MediaInfo | null>;
};
// SeerrNG pages the owned list 50 at a time; past this the rest is left to the server
const MAX_LIBRARY_PAGES = 20;
const owned = new Map<BookFormat, { at: number; p: Promise<OwnedBooks> }>();
// Open Library and the manager spell titles differently; compare letters and digits only,
// without the subtitle, a parenthesised edition note or a trailing "Book 4"
const titleKey = (title?: string, author?: string) => {
  const norm = (x: string) =>
    x
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/&/g, ' and ');
  if (!title || !author) return '';
  const t = norm(title)
    .split(':')[0]
    .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
    .replace(/,?\s*(?:book|volume|vol\.?)\s*\d+\s*$/, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  const a = norm(author).replace(/[^a-z0-9]+/g, '');
  return t && a ? `${t}|${a}` : '';
};
const isOpenLibraryWork = (id: string) => /^OL[1-9]\d*W$/.test(id);
// The Hardcover work number of a Bookshelf id, for matching owned rows only: rows from
// older installs carry the bare number, newer ones "hc:<n>", so accept both spellings
const ownedWorkKey = (id: string): string | null => {
  if (!id.startsWith('bookshelf:')) return null;
  try {
    const raw = atob(
      (id.split(':')[2] ?? '').replace(/-/g, '+').replace(/_/g, '/')
    );
    return /^(?:hc:)?(\d+)$/.exec(raw)?.[1] ?? null;
  } catch {
    return null;
  }
};
async function fetchOwnedBooks(format: BookFormat): Promise<OwnedBooks> {
  const rows: BookResult[] = [];
  for (let page = 1; page <= MAX_LIBRARY_PAGES; page++) {
    const d = await cachedApi<Partial<Paged<BookResult>>>(
      `/book/library?format=${format}&page=${page}`
    );
    rows.push(...(Array.isArray(d?.results) ? d.results : []));
    if (!d || page >= (d.totalPages || 1)) break;
  }
  const out: OwnedBooks = {
    byId: new Map(),
    byWork: new Map(),
    byTitle: new Map(),
  };
  for (const b of rows) {
    const mi = bookMediaForFormat(b.mediaInfo, format);
    if (!b?.id || !mi || mi.status !== MediaStatus.AVAILABLE) continue;
    out.byId.set(b.id, mi);
    const work = ownedWorkKey(b.id);
    if (work) out.byWork.set(work, mi);
    const key = titleKey(b.title, b.author);
    if (!key) continue;
    const seen = out.byTitle.get(key);
    out.byTitle.set(key, seen === undefined || seen === mi ? mi : null);
  }
  return out;
}
export function loadOwnedBooks(format: BookFormat): Promise<OwnedBooks> {
  const cur = owned.get(format);
  if (cur && Date.now() - cur.at < FRESH_MS) return cur.p;
  const p = fetchOwnedBooks(format).catch(() => {
    // no access to the category, or the library is down: nothing is marked, and the next
    // look asks again
    if (owned.get(format)?.p === p) owned.delete(format);
    return { byId: new Map(), byWork: new Map(), byTitle: new Map() };
  });
  owned.set(format, { at: Date.now(), p });
  return p;
}
// a request, an import or another account: ask again next time
onMarkStale(() => owned.clear());
onSessionReset(() => owned.clear());
// null while the owned list loads
export function useOwnedBooks(format: BookFormat | null) {
  const [m, setM] = useState<OwnedBooks | null>(null);
  useEffect(() => {
    if (!format) return;
    let live = true;
    loadOwnedBooks(format).then((x) => live && setM(x));
    return () => {
      live = false;
    };
  }, [format]);
  return m;
}
// The book's state in one format: SeerrNG's own answer when it says the book is there,
// else the matching owned-list row (same book id, same Hardcover work, or for an Open
// Library work an unambiguous title and author)
export function bookMediaWithLibrary(
  b: Pick<BookResult, 'id' | 'title' | 'author' | 'mediaInfo'>,
  format: BookFormat,
  lib: OwnedBooks | null
): MediaInfo | undefined {
  const mi = bookMediaForFormat(b.mediaInfo, format);
  if (mi?.status === MediaStatus.AVAILABLE || !lib) return mi;
  const work = ownedWorkKey(b.id);
  const match =
    lib.byId.get(b.id) ??
    (work ? lib.byWork.get(work) : undefined) ??
    (isOpenLibraryWork(b.id)
      ? lib.byTitle.get(titleKey(b.title, b.author)) || undefined
      : undefined);
  return match ?? mi;
}

// ebook covers: Hardcover's book cover when the companion has one, else what SeerrNG gave
export function useEbookCovers<
  T extends { id: string; posterPath?: string | null },
>(books: T[]): T[] {
  const [covers, setCovers] = useState<Map<string, string | undefined>>(
    new Map()
  );
  const key = books.map((b) => b.id).join(',');
  useEffect(() => {
    const works = books
      .map((b) => hardcoverWorkId(b.id))
      .filter(Boolean) as string[];
    if (!works.length) return;
    let live = true;
    hcCovers(works).then((m) => live && setCovers(m));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return books.map((b) => {
    const c = covers.get(hardcoverWorkId(b.id) || '');
    return c ? { ...b, posterPath: c } : b;
  });
}

// Back inside the app; a page opened straight from a link has nothing behind it, so go to Discover
// instead of leaving the site (detail pages hide the tab bar, so this is the only way out)
export function useBack() {
  const nav = useNavigate();
  const { key } = useLocation();
  return useCallback(() => {
    if (key === 'default') nav('/', { replace: true });
    else nav(-1);
  }, [key, nav]);
}

// pull down at the top of the page to refresh (touch only). The page's own overscroll is turned
// off meanwhile so Android Chrome doesn't also reload the whole app.
export function usePullToRefresh(onRefresh: () => void) {
  const [dist, setDist] = useState(0);
  const fire = useRef(onRefresh);
  fire.current = onRefresh;
  useEffect(() => {
    const ARM = 70;
    let startY: number | null = null;
    let d = 0;
    const start = (e: TouchEvent) => {
      startY =
        window.scrollY <= 0 && e.touches.length === 1
          ? e.touches[0].clientY
          : null;
      d = 0;
    };
    const move = (e: TouchEvent) => {
      if (startY == null) return;
      const dy = e.touches[0].clientY - startY;
      if (dy <= 0 || window.scrollY > 0) {
        if (d) setDist((d = 0));
        return;
      }
      d = Math.min(110, dy * 0.5); // resistance
      setDist(d);
    };
    const end = () => {
      if (startY != null && d >= ARM) fire.current();
      startY = null;
      d = 0;
      setDist(0);
    };
    document.documentElement.classList.add('no-overscroll');
    window.addEventListener('touchstart', start, { passive: true });
    window.addEventListener('touchmove', move, { passive: true });
    window.addEventListener('touchend', end, { passive: true });
    window.addEventListener('touchcancel', end, { passive: true });
    return () => {
      document.documentElement.classList.remove('no-overscroll');
      window.removeEventListener('touchstart', start);
      window.removeEventListener('touchmove', move);
      window.removeEventListener('touchend', end);
      window.removeEventListener('touchcancel', end);
    };
  }, []);
  return { dist, state: dist >= 70 ? 'armed' : dist > 0 ? 'pull' : 'idle' };
}

// a mouse (or trackpad) that can hover; phones and tablets get tap versions of hover controls
export const CAN_HOVER =
  typeof window !== 'undefined' &&
  window.matchMedia('(hover: hover) and (pointer: fine)').matches;

// In-flight responses from an earlier principal cannot refill the new cache.
onSessionReset(() => {
  pagedSnap.clear();
  bookStates = null;
  bookStatesAt = 0;
});
