import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { api, ApiError, type User } from './api';

interface AuthState {
  user: User | null | undefined; // undefined = still checking
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}
const Ctx = createContext<AuthState>({
  user: undefined,
  refresh: async () => {},
  signOut: async () => {},
});
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const refresh = useCallback(async () => {
    try {
      setUser(await api<User>('/auth/me'));
    } catch (e) {
      if (e instanceof ApiError && (e.status === 401 || e.status === 403))
        setUser(null);
      else setUser(null);
    }
  }, []);
  const signOut = useCallback(async () => {
    try {
      await api('/auth/logout', { method: 'POST' });
    } finally {
      setUser(null);
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  return (
    <Ctx.Provider value={{ user, refresh, signOut }}>{children}</Ctx.Provider>
  );
}

// ---- Plex sign-in: the same PIN flow SeerrNG's own login uses, then SeerrNG's /auth/plex ----
const PLEX_HEADERS = () => {
  let id = localStorage.getItem('lumen-plex-client');
  if (!id) {
    // crypto.randomUUID only exists on https/localhost pages; getRandomValues works everywhere
    const b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
    id = `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
    localStorage.setItem('lumen-plex-client', id);
  }
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
  try {
    await plexPinFlow(win);
  } catch (e) {
    win?.close(); // never leave a blank Plex window behind
    throw e;
  }
}

async function plexPinFlow(win: Window | null): Promise<void> {
  const pin = await (
    await fetch('https://plex.tv/api/v2/pins?strong=true', {
      method: 'POST',
      headers: PLEX_HEADERS(),
    })
  ).json();
  const params = new URLSearchParams({
    clientID: PLEX_HEADERS()['X-Plex-Client-Identifier'],
    code: pin.code,
    'context[device][product]': 'SeerrNG (Lumen)',
  });
  if (win) win.location.href = `https://app.plex.tv/auth#?${params}`;
  const deadline = Date.now() + 5 * 60_000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1500));
    const p = await (
      await fetch(`https://plex.tv/api/v2/pins/${pin.id}`, {
        headers: PLEX_HEADERS(),
      })
    ).json();
    if (p.authToken) {
      win?.close();
      await api('/auth/plex', {
        method: 'POST',
        body: JSON.stringify({ authToken: p.authToken }),
      });
      return;
    }
    if (win?.closed) break;
  }
  throw new Error('Plex sign-in was cancelled or timed out.');
}
