import {
  createContext,
  Fragment,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { api, ApiError, type User } from './api';
import { serverName } from './mediaServer';
import { resetSessionState } from './sessionState';

interface AuthState {
  user: User | null | undefined; // undefined = still checking
  unreachable: boolean; // /auth/me couldn't be answered (not the same as signed out)
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}
const Ctx = createContext<AuthState>({
  user: undefined,
  unreachable: false,
  refresh: async () => {},
  signOut: async () => {},
});
export const useAuth = () => useContext(Ctx);
export const isAdministrator = (permissions: unknown): boolean =>
  typeof permissions === 'number' &&
  Number.isSafeInteger(permissions) &&
  permissions >= 0 &&
  (BigInt(permissions) & 2n) !== 0n;
export const useMediaServerName = () => serverName();

// the page-load check of who is signed in: one call even if two providers start it together
let meInFlight: Promise<User> | null = null;
const sharedMe = () =>
  (meInFlight ??= api<User>('/auth/me').finally(() => {
    meInFlight = null;
  }));

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [unreachable, setUnreachable] = useState(false);
  const principal = useRef<number | null | undefined>(undefined);
  const authRequest = useRef(0);
  const setPrincipal = useCallback((next: User | null) => {
    const id = next?.id ?? null;
    if (principal.current !== id) resetSessionState(id);
    principal.current = id;
    setUser(next);
  }, []);
  const check = useCallback(
    async (share: boolean) => {
      const request = ++authRequest.current;
      try {
        const next = await (share ? sharedMe() : api<User>('/auth/me'));
        if (request === authRequest.current) {
          setUnreachable(false);
          setPrincipal(next);
        }
      } catch (e) {
        if (request !== authRequest.current) return;
        // only an answer from the server means signed out; a network drop or 5xx must not
        // sign anyone out (whoever was signed in stays, otherwise a retry screen is shown)
        if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
          setUnreachable(false);
          setPrincipal(null);
        } else setUnreachable(true);
      }
    },
    [setPrincipal]
  );
  const refresh = useCallback(() => check(false), [check]);
  const signOut = useCallback(async () => {
    ++authRequest.current;
    try {
      await api('/auth/logout', { method: 'POST' });
    } catch (e) {
      // already signed out on the server: finish here too. Anything else is reported by the caller.
      if (!(e instanceof ApiError && e.status === 401)) throw e;
    }
    setPrincipal(null);
  }, [setPrincipal]);
  useEffect(() => {
    // the first check is shared, so a remounted provider (StrictMode in development) doesn't ask twice
    void check(true);
  }, [check]);
  return (
    <Ctx.Provider value={{ user, unreachable, refresh, signOut }}>
      <Fragment key={user?.id ?? 'signed-out'}>{children}</Fragment>
    </Ctx.Provider>
  );
}

// ---- Plex sign-in: the same PIN flow SeerrNG's own login uses, then SeerrNG's /auth/plex ----
// kept for this page when browser storage is blocked
let plexClientId: string | undefined;
const PLEX_HEADERS = () => {
  let id: string | null = null;
  try {
    id = localStorage.getItem('lumen-plex-client');
  } catch {
    // blocked storage: use this page's id
  }
  id ||= plexClientId ?? null;
  if (!id) {
    // crypto.randomUUID only exists on https/localhost pages; getRandomValues works everywhere
    const b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
    id = `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
    try {
      localStorage.setItem('lumen-plex-client', id);
    } catch {
      // blocked storage: remembered for this page only
    }
  }
  plexClientId = id;
  return {
    Accept: 'application/json',
    'X-Plex-Product': 'SeerrNG (Lumen)',
    'X-Plex-Client-Identifier': id,
    'X-Plex-Device-Name': 'Lumen',
    'X-Plex-Platform': 'Web',
  };
};

export async function signInWithPlex(): Promise<void> {
  // open the window first so popup blockers treat it as a click result
  const win = window.open('', 'plex-auth', 'width=600,height=700');
  // without the window there is nothing to sign in with: say so now, not after 5 minutes
  if (!win)
    throw new Error(
      'Your browser blocked the Plex sign-in window. Allow pop-ups for this site, then try again.'
    );
  win.opener = null;
  try {
    await plexPinFlow(win);
  } catch (e) {
    win.close(); // never leave a blank Plex window behind
    throw e;
  }
}

async function plexPinFlow(win: Window): Promise<void> {
  const created = await fetch('https://plex.tv/api/v2/pins?strong=true', {
    method: 'POST',
    headers: PLEX_HEADERS(),
  });
  if (!created.ok)
    throw new Error(
      `Plex didn’t start the sign-in (${created.status}). Try again in a moment.`
    );
  const pin = await created.json();
  const params = new URLSearchParams({
    clientID: PLEX_HEADERS()['X-Plex-Client-Identifier'],
    code: pin.code,
    'context[device][product]': 'SeerrNG (Lumen)',
  });
  win.location.href = `https://app.plex.tv/auth#?${params}`;
  const deadline = Date.now() + 5 * 60_000;
  // a dropped connection or a Plex hiccup now and then is not a failed sign-in
  let failures = 0;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1500));
    if (win.closed) break;
    let p: { authToken?: string };
    try {
      const res = await fetch(`https://plex.tv/api/v2/pins/${pin.id}`, {
        headers: PLEX_HEADERS(),
      });
      if (!res.ok) throw new Error(`Plex ${res.status}`);
      p = await res.json();
      failures = 0;
    } catch {
      if (++failures >= 3)
        throw new Error('Couldn’t reach Plex to finish signing in. Try again.');
      continue;
    }
    // Closing Plex cancels even when an already-started poll returns a token.
    if (win.closed) break;
    if (p.authToken) {
      win.close();
      await api('/auth/plex', {
        method: 'POST',
        body: JSON.stringify({ authToken: p.authToken }),
      });
      return;
    }
    if (win.closed) break;
  }
  throw new Error('Plex sign-in was cancelled or timed out.');
}

// ---- Jellyfin / Emby sign-in: SeerrNG checks the account against the media server ----
export async function signInWithJellyfin(
  username: string,
  password: string
): Promise<void> {
  await api('/auth/jellyfin', {
    method: 'POST',
    // SeerrNG's own login sends the username as the email too (used for new accounts)
    body: JSON.stringify({ username, password, email: username }),
  });
}

// Jellyfin Quick Connect: show a code, the person approves it in a signed-in Jellyfin
// app, then SeerrNG trades the secret for a session. Same endpoints as SeerrNG's modal.
export async function startQuickConnect(signal?: AbortSignal): Promise<{
  code: string;
  secret: string;
}> {
  return api('/auth/jellyfin/quickconnect/initiate', {
    method: 'POST',
    signal,
  });
}

export async function finishQuickConnect(
  secret: string,
  cancelled: () => boolean,
  signal?: AbortSignal
): Promise<void> {
  const deadline = Date.now() + 10 * 60_000;
  let errors = 0;
  while (Date.now() < deadline) {
    await new Promise<void>((resolve) => {
      if (signal?.aborted) {
        resolve();
        return;
      }
      const finish = () => {
        clearTimeout(timer);
        signal?.removeEventListener('abort', finish);
        resolve();
      };
      const timer = window.setTimeout(finish, 2000);
      signal?.addEventListener('abort', finish, { once: true });
    });
    if (cancelled() || signal?.aborted) throw new QuickConnectCancelled();
    let ok = false;
    try {
      const r = await api<{ authenticated: boolean }>(
        `/auth/jellyfin/quickconnect/check?secret=${encodeURIComponent(secret)}`,
        { signal }
      );
      ok = r.authenticated;
      errors = 0;
    } catch (e) {
      if (cancelled() || signal?.aborted) throw new QuickConnectCancelled();
      if (e instanceof ApiError && e.status === 404)
        throw new Error('This code has expired. Try again for a new one.');
      if (++errors >= 5) throw e;
    }
    if (cancelled() || signal?.aborted) throw new QuickConnectCancelled();
    if (ok) {
      await api('/auth/jellyfin/quickconnect/authenticate', {
        method: 'POST',
        signal,
        body: JSON.stringify({ secret }),
      });
      return;
    }
  }
  throw new Error('This code has expired. Try again for a new one.');
}
export class QuickConnectCancelled extends Error {
  constructor() {
    super('Quick Connect was cancelled.');
  }
}
