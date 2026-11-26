import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { api } from './api';
import { useAuth } from './auth';
import { forgetLumenConfig, readLumenConfig } from './deployment';
import { serverName, services, type MediaServerSetting } from './mediaServer';
import { MUSIC_PLAYERS, type MusicPlayer } from './musicPlayback';
import { isThemeColor, themeColors } from './themeOverrides';

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
  requestOptions: boolean; // poster quick requests ask for server/quality/folder when the account permits advanced requests
  theme: 'dark' | 'light' | 'system';
  musicPlayer: MusicPlayer; // where Play on music goes
  musicPreviews: boolean; // 30-second previews of songs not downloaded yet
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
  musicPlayer: 'aurral',
  musicPreviews: true,
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

// 'failed': lumen-config.json couldn't be read, which is not the same as having none
export type AdminConfigState = 'loading' | 'ready' | 'failed';
interface Ctx {
  prefs: Prefs;
  adminConfig: AdminConfig; // lumen-config.json as loaded (the admin settings page starts from it)
  adminConfigState: AdminConfigState;
  retryAdminConfig: () => void;
  locked: Set<string>;
  seerrPublicUrl?: string;
  audiobookshelfUrl?: string;
  kavitaUrl?: string;
  set: (path: string, value: boolean | string) => Promise<void>;
  reset: () => Promise<void>;
  // the admin page saved a new lumen-config.json: use it now, without a reload
  adminSaved: (c: AdminConfig) => void;
  preferenceSaveError: string | null;
  retryPreferenceSave: () => void;
}
const C = createContext<Ctx>({
  prefs: DEFAULT_PREFS,
  adminConfig: {},
  adminConfigState: 'loading',
  retryAdminConfig: () => {},
  locked: new Set(),
  set: async () => {},
  reset: async () => {},
  adminSaved: () => {},
  preferenceSaveError: null,
  retryPreferenceSave: () => {},
});
export const usePrefs = () => useContext(C);

const preferenceKey = (userId: number) => `lumen-prefs:${userId}`;
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const cleanPrefs = (value: unknown): Partial<Prefs> => {
  const source = record(value);
  const clean: Partial<Prefs> = {};
  for (const key of [
    'narratorChoice',
    'hoverRequest',
    'wholeSeriesDefault',
    'showBooks',
    'requestOptions',
    'musicPreviews',
  ] as const)
    if (typeof source[key] === 'boolean') clean[key] = source[key];
  if (['dark', 'light', 'system'].includes(source.theme as string))
    clean.theme = source.theme as Prefs['theme'];
  if (MUSIC_PLAYERS.includes(source.musicPlayer as MusicPlayer))
    clean.musicPlayer = source.musicPlayer as MusicPlayer;
  if (source.rows && typeof source.rows === 'object') {
    const rows = record(source.rows);
    clean.rows = Object.fromEntries(
      (Object.keys(DEFAULT_PREFS.rows) as DiscoverRow[])
        .filter((key) => typeof rows[key] === 'boolean')
        .map((key) => [key, rows[key]])
    ) as Partial<Prefs>['rows'];
  }
  return clean;
};
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
    } else if (key === 'musicPlayer') {
      if (MUSIC_PLAYERS.includes(values.musicPlayer as MusicPlayer))
        next.musicPlayer = values.musicPlayer as MusicPlayer;
    } else if (typeof values[key] === 'boolean') next[key] = values[key];
  }
  return next;
};

export function PrefsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id;
  const key = userId ? preferenceKey(userId) : null;
  const [admin, setAdmin] = useState<AdminConfig>({});
  const [mine, setMine] = useState<Partial<Prefs>>(() => {
    try {
      return cleanPrefs(
        JSON.parse((key ? localStorage.getItem(key) : null) || '{}')
      );
    } catch {
      return {};
    }
  });
  const mineRef = useRef(mine);
  const latestSaveRef = useRef<Partial<Prefs> | 'load' | 'reset' | null>(null);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const preferenceRevisionRef = useRef(0);
  const [preferenceSaveError, setPreferenceSaveError] = useState<string | null>(
    null
  );
  const [preferenceLoadAttempt, setPreferenceLoadAttempt] = useState(0);
  const [adminState, setAdminState] = useState<AdminConfigState>('loading');
  const [adminAttempt, setAdminAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    setAdminState('loading');
    readLumenConfig()
      .then((value) => {
        if (!live) return;
        setAdmin(record(value ?? {}) as AdminConfig);
        setAdminState('ready');
      })
      // everyone carries on with the built-in defaults; only the admin page cares
      .catch(() => live && setAdminState('failed'));
    return () => {
      live = false;
    };
  }, [adminAttempt]);
  const retryAdminConfig = useCallback(() => {
    forgetLumenConfig();
    setAdminAttempt((n) => n + 1);
  }, []);

  const persistMine = useCallback(
    (next: Partial<Prefs> | null): Promise<void> => {
      if (!userId || !key) return Promise.resolve();
      const marker = next ?? 'reset';
      latestSaveRef.current = marker;
      setPreferenceSaveError(null);
      const write = saveQueueRef.current
        .catch(() => {})
        .then(async () => {
          await api(`/user/${userId}/settings/main`, {
            method: 'POST',
            body: JSON.stringify({ lumenPreferences: next }),
          });
        })
        .catch((error: unknown) => {
          if (latestSaveRef.current === marker)
            setPreferenceSaveError(
              error instanceof Error
                ? error.message
                : 'Could not save Lumen preferences.'
            );
          throw error;
        });
      saveQueueRef.current = write;
      return write;
    },
    [key, userId]
  );

  const retryPreferenceSave = useCallback(() => {
    if (latestSaveRef.current === 'load') {
      setPreferenceLoadAttempt((attempt) => attempt + 1);
      return;
    }
    if (latestSaveRef.current === 'reset') {
      void persistMine(null).catch(() => {});
      return;
    }
    if (latestSaveRef.current)
      void persistMine(latestSaveRef.current).catch(() => {});
  }, [persistMine]);

  useEffect(() => {
    if (!key || !userId) {
      mineRef.current = {};
      setMine({});
      latestSaveRef.current = null;
      setPreferenceSaveError(null);
      return;
    }

    let live = true;
    const revision = preferenceRevisionRef.current;
    let local: Partial<Prefs> = {};
    try {
      const stored = localStorage.getItem(key);
      if (stored) local = cleanPrefs(JSON.parse(stored));
    } catch {
      local = {};
    }
    mineRef.current = local;
    setMine(local);
    latestSaveRef.current = null;
    setPreferenceSaveError(null);

    void api<{ lumenPreferences?: unknown }>(`/user/${userId}/settings/main`)
      .then(async (settings) => {
        if (!live || revision !== preferenceRevisionRef.current) return;
        if (settings.lumenPreferences != null) {
          const saved = cleanPrefs(settings.lumenPreferences);
          mineRef.current = saved;
          latestSaveRef.current = saved;
          setMine(saved);
          try {
            localStorage.setItem(key, JSON.stringify(saved));
          } catch {
            // The authenticated server copy remains authoritative.
          }
          return;
        }

        // Upgrade preferences saved by earlier Lumen versions in this browser.
        if (Object.keys(local).length) await persistMine(local);
        else latestSaveRef.current = {};
      })
      .catch((error: unknown) => {
        if (live && revision === preferenceRevisionRef.current) {
          latestSaveRef.current = 'load';
          setPreferenceSaveError(
            error instanceof Error
              ? error.message
              : 'Could not load Lumen preferences.'
          );
        }
      });

    return () => {
      live = false;
    };
  }, [key, persistMine, preferenceLoadAttempt, userId]);

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
    (path: string, value: boolean | string): Promise<void> => {
      const next: Partial<Prefs> = { ...mineRef.current };
      if (path.startsWith('rows.'))
        next.rows = {
          ...(mineRef.current.rows || {}),
          [path.slice(5)]: value,
        } as Prefs['rows'];
      else (next as Record<string, unknown>)[path] = value;
      mineRef.current = next;
      preferenceRevisionRef.current += 1;
      setMine(next);
      try {
        if (key) localStorage.setItem(key, JSON.stringify(next));
      } catch {
        /* Keep in-memory preferences when browser storage is blocked. */
      }
      return persistMine(next);
    },
    [key, persistMine]
  );
  const reset = useCallback((): Promise<void> => {
    mineRef.current = {};
    preferenceRevisionRef.current += 1;
    setMine({});
    try {
      if (key) localStorage.removeItem(key);
    } catch {
      /* Storage may be blocked. */
    }
    return persistMine(null);
  }, [key, persistMine]);

  const overrides = user?.settings?.advancedThemeOverrides;

  // theme lives on <html>, the same switch the mockup used
  // and the browser's own bar (address bar, phone status bar) follows the page, including
  // when "Device" is picked and the phone flips between light and dark
  useEffect(() => {
    const root = document.documentElement;
    for (const [key, property] of themeColors) {
      const value = overrides?.[key];
      if (isThemeColor(value)) root.style.setProperty(property, value);
    }
    root.toggleAttribute(
      'data-sidebar-gradient',
      isThemeColor(overrides?.['--theme-sidebar-start']) ||
        isThemeColor(overrides?.['--theme-sidebar-end'])
    );
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
    return () => {
      media?.removeEventListener('change', paintBar);
      root.removeAttribute('data-sidebar-gradient');
      for (const [, property] of themeColors)
        root.style.removeProperty(property);
    };
  }, [prefs.theme, overrides]);

  return (
    <C.Provider
      value={{
        prefs,
        adminConfig: admin,
        adminConfigState: adminState,
        retryAdminConfig,
        locked,
        seerrPublicUrl: admin.seerrPublicUrl,
        audiobookshelfUrl: admin.audiobookshelfUrl,
        kavitaUrl: admin.kavitaUrl,
        set,
        reset,
        preferenceSaveError,
        retryPreferenceSave,
        adminSaved: (c: AdminConfig) => {
          forgetLumenConfig();
          setAdmin(c);
          setAdminState('ready');
        },
      }}
    >
      {children}
    </C.Provider>
  );
}
