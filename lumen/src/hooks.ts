import { useCallback, useEffect, useRef, useState } from 'react';
import { api, hardcoverWorkId, hcCovers } from './api';

// small response cache so going back to a page doesn't refetch everything
const cache = new Map<string, unknown>();

export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | null>(
    path ? ((cache.get(path) as T) ?? null) : null
  );
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!path) return;
    let live = true;
    setError(null);
    if (cache.has(path)) setData(cache.get(path) as T);
    else setData(null);
    api<T>(path)
      .then((d) => {
        cache.set(path, d);
        if (live) setData(d);
      })
      .catch(
        (e) =>
          live && setError(e instanceof Error ? e.message : 'Failed to load')
      );
    return () => {
      live = false;
    };
  }, [path, tick]);
  const reload = useCallback(() => {
    if (path) cache.delete(path);
    setTick((t) => t + 1);
  }, [path]);
  return { data, error, reload };
}

export const dropCache = (prefix: string) => {
  for (const k of cache.keys()) if (k.startsWith(prefix)) cache.delete(k);
};

export interface PublicSettings {
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
export function usePaged<T>(base: string) {
  const [items, setItems] = useState<T[]>([]);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // one page in flight at a time: scroll triggers can fire twice before state catches up
  const inFlight = useRef<string | null>(null);
  useEffect(() => {
    setItems([]);
    setPage(0);
    setTotal(1);
    inFlight.current = null;
  }, [base]);
  const more = useCallback(async () => {
    if (loading || page >= total) return;
    const key = `${base}#${page + 1}`;
    if (inFlight.current === key) return;
    inFlight.current = key;
    setLoading(true);
    try {
      const sep = base.includes('?') ? '&' : '?';
      const d = await api<{ page: number; totalPages: number; results: T[] }>(
        `${base}${sep}page=${page + 1}`
      );
      if (inFlight.current !== key) return; // the list changed (new filter) while this loaded
      // popular lists shift between pages, so a title can come back; show it once
      const idOf = (x: T) => String((x as { id?: unknown }).id);
      setItems((x) => {
        const seen = new Set(x.map(idOf));
        return x.concat(d.results.filter((r) => !seen.has(idOf(r))));
      });
      setPage(d.page);
      setTotal(d.totalPages || 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [base, page, total, loading]);
  useEffect(() => {
    if (page === 0 && !loading) void more();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, page]);
  return { items, more, loading, error, page, done: page >= total };
}

// ---- book library state ----
// SeerrNG's book lists carry no library status, and its media list has no book ids. Its request
// list has both, so one call tells us which works are in the library or requested, per format.
export type BookState = { ebook?: number; audiobook?: number }; // media status per format
let bookStates: Promise<Map<string, BookState>> | null = null;
let bookStatesAt = 0;
export function loadBookStates(): Promise<Map<string, BookState>> {
  if (bookStates && Date.now() - bookStatesAt < 60_000) return bookStates;
  bookStatesAt = Date.now();
  bookStates = api<{
    results: {
      status: number;
      bookFormat?: string;
      media: { status: number; identifiers?: { value: string }[] };
    }[];
  }>('/request?take=500&skip=0&filter=all&sort=added&mediaType=book')
    .then((d) => {
      const m = new Map<string, BookState>();
      for (const r of d.results) {
        if (r.status === 3) continue; // declined
        for (const i of r.media.identifiers || []) {
          const work = i.value.startsWith('bookshelf:')
            ? workOf(i.value)
            : null;
          if (!work) continue;
          const f =
            r.bookFormat === 'audiobook' || i.value.startsWith('bookshelf:1:')
              ? 'audiobook'
              : 'ebook';
          const cur = m.get(work) || {};
          // failed requests don't count as requested
          const st = r.status === 4 ? 0 : r.media.status === 5 ? 5 : 2;
          cur[f] = Math.max(cur[f] || 0, st);
          m.set(work, cur);
        }
      }
      return m;
    })
    .catch(() => new Map());
  return bookStates;
}
export const dropBookStates = () => {
  bookStates = null;
};
const workOf = (id: string) => {
  try {
    return atob(id.split(':')[2].replace(/-/g, '+').replace(/_/g, '/')).replace(
      /^hc:/,
      ''
    );
  } catch {
    return null;
  }
};
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
