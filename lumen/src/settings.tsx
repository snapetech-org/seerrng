import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

// Every switchable part of Lumen. Admins set defaults (and can lock them) in
// lumen-config.json next to the app; each person can change whatever isn't locked.
export const DISCOVER_ROWS = {
  hero: 'Popular right now',
  newOnPlex: 'New on Plex',
  trendingMovies: 'Trending movies',
  popularSeries: 'Popular series',
  audiobooks: 'Popular audiobooks',
  books: 'Popular books',
  comingSoon: 'Coming soon',
  genres: 'Browse by genre',
} as const;
export type DiscoverRow = keyof typeof DISCOVER_ROWS;

export interface Prefs {
  rows: Record<DiscoverRow, boolean>;
  narratorChoice: boolean; // off = audiobooks get one straight "Request audiobook" button
  hoverRequest: boolean; // quick request buttons on poster hover
  wholeSeriesDefault: boolean; // series requests start with every missing season ticked
  showBooks: boolean; // Books + Audiobooks in navigation and Discover
  theme: 'dark' | 'light' | 'system';
}

export const DEFAULT_PREFS: Prefs = {
  rows: {
    hero: true,
    newOnPlex: true,
    trendingMovies: true,
    popularSeries: true,
    audiobooks: true,
    books: true,
    comingSoon: true,
    genres: true,
  },
  narratorChoice: true,
  hoverRequest: true,
  wholeSeriesDefault: true,
  showBooks: true,
  theme: 'dark',
};

interface AdminConfig {
  defaults?: Partial<Omit<Prefs, 'rows'>> & {
    rows?: Partial<Record<DiscoverRow, boolean>>;
  };
  locked?: string[]; // e.g. ["narratorChoice", "rows.genres"]
  seerrPublicUrl?: string;
}

interface Ctx {
  prefs: Prefs;
  locked: Set<string>;
  seerrPublicUrl?: string;
  set: (path: string, value: boolean | string) => void;
  reset: () => void;
}
const C = createContext<Ctx>({
  prefs: DEFAULT_PREFS,
  locked: new Set(),
  set: () => {},
  reset: () => {},
});
export const usePrefs = () => useContext(C);

const KEY = 'lumen-prefs';
const merge = (
  base: Prefs,
  over?: AdminConfig['defaults'] | Partial<Prefs>
): Prefs => ({
  ...base,
  ...(over || {}),
  rows: { ...base.rows, ...((over && over.rows) || {}) },
});

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [admin, setAdmin] = useState<AdminConfig>({});
  const [mine, setMine] = useState<Partial<Prefs>>(() => {
    try {
      return JSON.parse(localStorage.getItem(KEY) || '{}');
    } catch {
      return {};
    }
  });
  useEffect(() => {
    fetch('/lumen-config.json', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : {}))
      .then(setAdmin)
      .catch(() => setAdmin({}));
  }, []);

  const locked = useMemo(() => new Set(admin.locked || []), [admin]);
  const prefs = useMemo(() => {
    const withAdmin = merge(DEFAULT_PREFS, admin.defaults);
    const withMine = merge(withAdmin, mine);
    // locked settings always follow the admin default
    for (const k of locked) {
      if (k.startsWith('rows.')) {
        const r = k.slice(5) as DiscoverRow;
        withMine.rows[r] = withAdmin.rows[r];
      } else if (k in withAdmin)
        (withMine as unknown as Record<string, unknown>)[k] = (
          withAdmin as unknown as Record<string, unknown>
        )[k];
    }
    return withMine;
  }, [admin, mine, locked]);

  const set = useCallback((path: string, value: boolean | string) => {
    setMine((m) => {
      const next: Partial<Prefs> = { ...m };
      if (path.startsWith('rows.'))
        next.rows = {
          ...(m.rows || {}),
          [path.slice(5)]: value,
        } as Prefs['rows'];
      else (next as Record<string, unknown>)[path] = value;
      localStorage.setItem(KEY, JSON.stringify(next));
      return next;
    });
  }, []);
  const reset = useCallback(() => {
    localStorage.removeItem(KEY);
    setMine({});
  }, []);

  // theme lives on <html>, the same switch the mockup used
  useEffect(() => {
    const root = document.documentElement;
    if (prefs.theme === 'system') delete root.dataset.theme;
    else root.dataset.theme = prefs.theme;
  }, [prefs.theme]);

  return (
    <C.Provider
      value={{
        prefs,
        locked,
        seerrPublicUrl: admin.seerrPublicUrl,
        set,
        reset,
      }}
    >
      {children}
    </C.Provider>
  );
}
