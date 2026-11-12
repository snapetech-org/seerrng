import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useAuth } from './auth';
import { forgetLumenConfig, loadLumenConfig } from './deployment';
import { serverName, services, type MediaServerSetting } from './mediaServer';

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
// the "newOnPlex" key predates Jellyfin support; it stays so saved prefs and locks still apply
export const discoverRowLabel = (r: DiscoverRow): string =>
  r === 'newOnPlex' ? `New on ${serverName()}` : DISCOVER_ROWS[r];

export interface Prefs {
  rows: Record<DiscoverRow, boolean>;
  narratorChoice: boolean; // off = audiobooks get one straight "Request audiobook" button
  hoverRequest: boolean; // quick request buttons on poster hover
  wholeSeriesDefault: boolean; // series requests start with every missing season ticked
  showBooks: boolean; // Books + Audiobooks in navigation and Discover
  requestOptions: boolean; // poster quick requests ask for server/quality/folder (admins and request managers only)
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
  requestOptions: true,
  theme: 'dark',
};

export interface AdminConfig {
  defaults?: Partial<Omit<Prefs, 'rows'>> & {
    rows?: Partial<Record<DiscoverRow, boolean>>;
  };
  locked?: string[]; // e.g. ["narratorChoice", "rows.genres"]
  seerrPublicUrl?: string;
  audiobookshelfUrl?: string; // where "Listen/Read in Audiobookshelf" go
  kavitaUrl?: string; // where "Read in Kavita" goes, instead of SeerrNG's Kavita address
  mediaServer?: MediaServerSetting; // read by mediaServer.ts before sign-in
  loginStyle?: 'buttons' | 'form'; // read by mediaServer.ts before sign-in
  branding?: {
    name?: string;
    logo?: string;
    icon?: string;
    logoShape?: 'rounded' | 'circle' | 'raw';
  };
  mediaServerName?: string; // replaces Plex / Jellyfin / Emby in every label
  [other: string]: unknown;
}

interface Ctx {
  prefs: Prefs;
  adminConfig: AdminConfig; // lumen-config.json as loaded (the admin settings page starts from it)
  locked: Set<string>;
  seerrPublicUrl?: string;
  audiobookshelfUrl?: string;
  kavitaUrl?: string;
  set: (path: string, value: boolean | string) => void;
  reset: () => void;
  // the admin page saved a new lumen-config.json: use it now, without a reload
  adminSaved: (c: AdminConfig) => void;
}
const C = createContext<Ctx>({
  prefs: DEFAULT_PREFS,
  adminConfig: {},
  locked: new Set(),
  set: () => {},
  reset: () => {},
  adminSaved: () => {},
});
export const usePrefs = () => useContext(C);

const preferenceKey = (userId: number) => `lumen-prefs:${userId}`;
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const merge = (
  base: Prefs,
  over?: AdminConfig['defaults'] | Partial<Prefs>
): Prefs => {
  const next = { ...base, rows: { ...base.rows } };
  const values = record(over);
  for (const key of Object.keys(base) as (keyof Prefs)[]) {
    if (key === 'rows') {
      const rows = record(values.rows);
      for (const row of Object.keys(base.rows) as DiscoverRow[])
        if (typeof rows[row] === 'boolean') next.rows[row] = rows[row];
    } else if (key === 'theme') {
      if (['dark', 'light', 'system'].includes(values.theme as string))
        next.theme = values.theme as Prefs['theme'];
    } else if (typeof values[key] === 'boolean') next[key] = values[key];
  }
  return next;
};

export function PrefsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const key = user ? preferenceKey(user.id) : null;
  const [admin, setAdmin] = useState<AdminConfig>({});
  const [mine, setMine] = useState<Partial<Prefs>>(() => {
    try {
      return JSON.parse((key ? localStorage.getItem(key) : null) || '{}');
    } catch {
      return {};
    }
  });
  useEffect(() => {
    loadLumenConfig()
      .then((value) => setAdmin(record(value ?? {}) as AdminConfig))
      .catch(() => setAdmin({}));
  }, []);

  const locked = useMemo(
    () =>
      new Set(
        Array.isArray(admin.locked)
          ? admin.locked.filter(
              (key) =>
                typeof key === 'string' &&
                (Object.hasOwn(DEFAULT_PREFS, key) ||
                  (key.startsWith('rows.') &&
                    Object.hasOwn(DEFAULT_PREFS.rows, key.slice(5))))
            )
          : []
      ),
    [admin]
  );
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
    // no ebook or audiobook service in SeerrNG: nothing to show, whatever the setting says
    if (!services().books) withMine.showBooks = false;
    return withMine;
  }, [admin, mine, locked]);

  const set = useCallback(
    (path: string, value: boolean | string) => {
      setMine((m) => {
        const next: Partial<Prefs> = { ...m };
        if (path.startsWith('rows.'))
          next.rows = {
            ...(m.rows || {}),
            [path.slice(5)]: value,
          } as Prefs['rows'];
        else (next as Record<string, unknown>)[path] = value;
        try {
          if (key) localStorage.setItem(key, JSON.stringify(next));
        } catch {
          /* Keep in-memory preferences when browser storage is blocked. */
        }
        return next;
      });
    },
    [key]
  );
  const reset = useCallback(() => {
    try {
      if (key) localStorage.removeItem(key);
    } catch {
      /* Storage may be blocked. */
    }
    setMine({});
  }, [key]);

  // theme lives on <html>, the same switch the mockup used
  // and the browser's own bar (address bar, phone status bar) follows the page, including
  // when "Device" is picked and the phone flips between light and dark
  useEffect(() => {
    const root = document.documentElement;
    if (prefs.theme === 'system') delete root.dataset.theme;
    else root.dataset.theme = prefs.theme;
    const paintBar = () =>
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute(
          'content',
          getComputedStyle(root).getPropertyValue('--bg').trim() || '#0b0d11'
        );
    paintBar();
    const media = window.matchMedia?.('(prefers-color-scheme: dark)');
    media?.addEventListener('change', paintBar);
    return () => media?.removeEventListener('change', paintBar);
  }, [prefs.theme]);

  return (
    <C.Provider
      value={{
        prefs,
        adminConfig: admin,
        locked,
        seerrPublicUrl: admin.seerrPublicUrl,
        audiobookshelfUrl: admin.audiobookshelfUrl,
        kavitaUrl: admin.kavitaUrl,
        set,
        reset,
        adminSaved: (c: AdminConfig) => {
          forgetLumenConfig();
          setAdmin(c);
        },
      }}
    >
      {children}
    </C.Provider>
  );
}
