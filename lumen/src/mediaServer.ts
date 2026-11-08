import {
  createElement,
  Fragment,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

// Which media server the household watches on. SeerrNG reports its own server
// (Settings → General → media server), so Lumen follows it by default; admins can pin
// one with "mediaServer" in lumen-config.json ("auto", "plex", "jellyfin" or "emby").
export type MediaServerKind = 'plex' | 'jellyfin' | 'emby';
export type MediaServerSetting = 'auto' | MediaServerKind;

export interface MediaServer {
  kind: MediaServerKind;
  name: string; // name used in every label: "On Plex", "Watch on Jellyfin"… (admins can rename it)
  product: string; // what it really is: Plex, Jellyfin or Emby
  source: 'seerrng' | 'config'; // where the choice came from (shown on the Me page)
  localLogin: boolean; // SeerrNG allows email + password accounts
  serverLogin: boolean; // SeerrNG allows signing in with the media server account
  quickConnect: boolean; // Jellyfin Quick Connect is offered
  quickConnectOnly: boolean; // Jellyfin password sign-in is switched off
  forgotPasswordUrl?: string;
}

const NAMES: Record<MediaServerKind, string> = {
  plex: 'Plex',
  jellyfin: 'Jellyfin',
  emby: 'Emby',
};
// SeerrNG's MediaServerType enum: 1 Plex, 2 Jellyfin, 3 Emby, 4 not configured
const FROM_SEERRNG: Record<number, MediaServerKind> = {
  1: 'plex',
  2: 'jellyfin',
  3: 'emby',
};

export interface ServerPublicSettings {
  applicationTitle?: string;
  mediaServerType?: number;
  localLogin?: boolean;
  mediaServerLogin?: boolean;
  jellyfinQuickConnectOnly?: boolean;
  jellyfinHost?: string;
  jellyfinExternalHost?: string;
  jellyfinForgotPasswordUrl?: string;
}

const isSetting = (v: unknown): v is MediaServerSetting =>
  v === 'auto' || (typeof v === 'string' && Object.hasOwn(NAMES, v));

const httpUrl = (v?: string) => {
  if (!v) return undefined;
  try {
    const u = new URL(v);
    return ['http:', 'https:'].includes(u.protocol) &&
      !u.username &&
      !u.password
      ? u
      : undefined;
  } catch {
    return undefined;
  }
};

export function resolveMediaServer(
  setting: unknown,
  pub: ServerPublicSettings | null,
  // "mediaServerName" in lumen-config.json: what people call it, e.g. the server's own brand
  customName?: unknown
): MediaServer {
  const pinned = isSetting(setting) && setting !== 'auto' ? setting : null;
  const kind =
    pinned ||
    (typeof pub?.mediaServerType === 'number'
      ? FROM_SEERRNG[pub.mediaServerType]
      : undefined) ||
    ('plex' as const);
  const jellyfinLike = kind !== 'plex';
  // same forgot-password link SeerrNG's own Jellyfin/Emby login uses
  const host = httpUrl(pub?.jellyfinExternalHost || pub?.jellyfinHost);
  if (host) {
    host.pathname = `${host.pathname.replace(/\/$/, '')}/web/index.html`;
    host.search = '';
    host.hash = `!/${kind === 'emby' ? 'startup/' : ''}forgotpassword.html`;
  }
  const forgot = httpUrl(pub?.jellyfinForgotPasswordUrl)?.href || host?.href;
  return {
    kind,
    name:
      typeof customName === 'string' && customName.trim()
        ? customName.trim().slice(0, 40)
        : NAMES[kind],
    product: NAMES[kind],
    source: pinned ? 'config' : 'seerrng',
    localLogin: pub?.localLogin !== false,
    serverLogin:
      pub !== null &&
      pub?.mediaServerType !== 4 &&
      pub?.mediaServerLogin !== false,
    quickConnect: kind === 'jellyfin',
    quickConnectOnly: kind === 'jellyfin' && !!pub?.jellyfinQuickConnectOnly,
    forgotPasswordUrl: jellyfinLike ? forgot : undefined,
  };
}

// Look and sign-in style, also from lumen-config.json:
//   "branding": { "name": "Movie Night", "logo": "/branding/logo.png", "icon": "/branding/icon.png" }
//   "loginStyle": "form"  (Jellyfin/Emby: username + password on the sign-in page itself)
// rounded: in a rounded square (the default); circle: cropped to a circle; raw: the file as it
// is, transparent and uncropped, as wide as it needs (up to a limit)
export type LogoShape = 'rounded' | 'circle' | 'raw';
export const LOGO_SHAPES: LogoShape[] = ['rounded', 'circle', 'raw'];
export const logoShapeOf = (v: unknown): LogoShape =>
  LOGO_SHAPES.includes(v as LogoShape) ? (v as LogoShape) : 'rounded';
export interface Site {
  name: string; // shown next to the logo and in the tab title; "" hides the text
  logo?: string; // replaces the round play mark
  logoShape: LogoShape; // how the logo is framed
  icon?: string; // browser tab icon (and iOS home-screen icon)
  loginForm: boolean;
}
// only this site's own files or https images (the CSP allows nothing else for images)
const assetUrl = (v: unknown): string | undefined => {
  if (typeof v !== 'string' || !v || v.length > 2048) return undefined;
  if (v.startsWith('/') && !v.startsWith('//') && !v.includes('\\')) return v;
  try {
    const u = new URL(v);
    return u.protocol === 'https:' && !u.username && !u.password
      ? u.href
      : undefined;
  } catch {
    return undefined;
  }
};
export function resolveSite(
  config: unknown,
  pub: ServerPublicSettings | null
): Site {
  const c =
    config && typeof config === 'object' && !Array.isArray(config)
      ? (config as Record<string, unknown>)
      : {};
  const b =
    c.branding && typeof c.branding === 'object' && !Array.isArray(c.branding)
      ? (c.branding as Record<string, unknown>)
      : {};
  // SeerrNG's application title, unless it's still the stock "Seerr"
  const title =
    typeof pub?.applicationTitle === 'string'
      ? pub.applicationTitle.trim()
      : '';
  const fallback = title && title !== 'Seerr' ? title : 'SeerrNG';
  const name =
    typeof b.name === 'string' ? b.name.trim().slice(0, 60) : fallback;
  return {
    name,
    logo: assetUrl(b.logo),
    logoShape: logoShapeOf(b.logoShape),
    icon: assetUrl(b.icon),
    loginForm: c.loginStyle === 'form',
  };
}

// Plain module state so non-hook helpers (status words, labels) can read it. The provider
// resolves it once, before anything else renders.
let current: MediaServer = resolveMediaServer('auto', null);
let currentSite: Site = resolveSite(null, null);
// Which request services SeerrNG has behind its categories. A fresh SeerrNG turns every
// category on with nothing behind most of them; these flags say what actually works.
// Older SeerrNG builds don't send them, so a missing flag counts as "yes".
export interface Services {
  books: boolean;
  music: boolean;
  comics: boolean;
  magazines: boolean;
  sports: boolean;
  software: boolean; // QuestarrNG: PC games, and consoles unless ROMarrNG serves them
  romarr: boolean; // ROMarrNG (RomM): retro and modern consoles
}
export function resolveServices(pub: Record<string, unknown> | null): Services {
  const has = (k: string) => pub?.[k] !== false;
  return {
    books:
      has('booksEnabled') ||
      pub?.ebookServiceEnabled === true ||
      pub?.audiobookServiceEnabled === true,
    music: has('musicEnabled'),
    comics: has('comicsEnabled'),
    magazines: has('magazinesEnabled'),
    sports: has('sportsEnabled'),
    software: has('softwareEnabled'),
    romarr: pub?.romarrEnabled === true,
  };
}
let currentServices: Services = resolveServices(null);
export const services = () => currentServices;
export const mediaServer = () => current;
export const site = () => currentSite;

function applySite(s: Site) {
  const title = s.name || 'SeerrNG';
  document.title = title;
  document
    .querySelector('meta[name="apple-mobile-web-app-title"]')
    ?.setAttribute('content', title);
  if (s.icon)
    for (const rel of ['icon', 'apple-touch-icon']) {
      const link = document.querySelector(`link[rel="${rel}"]`);
      link?.setAttribute('href', s.icon);
      link?.removeAttribute('type');
      link?.removeAttribute('sizes');
    }
}
export const serverName = () => current.name;

// SeerrNG rate-limits per account and per address. One 429 on the public settings must
// not lock everyone out of Lumen: wait as asked and try again, and fall back to the last
// answer this tab saw.
const PUBLIC_KEY = 'lumen-public-settings';
const pause = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const done = () => {
      window.clearTimeout(t);
      signal.removeEventListener('abort', done);
      resolve();
    };
    const t = window.setTimeout(done, Math.min(ms, 2147483647));
    signal.addEventListener('abort', done, { once: true });
  });
export const retryAfterMs = (
  value: string | null,
  attempt: number,
  now = Date.now()
) => {
  if (value && /^\d+$/.test(value.trim())) {
    const seconds = Number(value);
    if (Number.isFinite(seconds)) return seconds * 1000;
  }
  const date = value ? Date.parse(value) : NaN;
  return Number.isFinite(date) ? Math.max(0, date - now) : 2000 * (attempt + 1);
};
async function loadPublicSettings(signal: AbortSignal): Promise<unknown> {
  for (let attempt = 0; attempt < 3 && !signal.aborted; attempt++) {
    const r = await fetch('/api/v1/settings/public', {
      cache: 'no-store',
      credentials: 'same-origin',
      signal,
    }).catch(() => null);
    if (r?.ok) {
      const body = await r.json().catch(() => null);
      if (body && typeof body === 'object' && !Array.isArray(body)) {
        try {
          sessionStorage.setItem(PUBLIC_KEY, JSON.stringify(body));
        } catch {
          // storage blocked: fine, just no fallback next time
        }
        return body;
      }
    }
    // only "slow down" is worth waiting for; anything else shows Retry straight away
    if (!r || r.status !== 429) break;
    if (attempt < 2)
      await pause(retryAfterMs(r.headers.get('Retry-After'), attempt), signal);
  }
  try {
    return JSON.parse(sessionStorage.getItem(PUBLIC_KEY) || 'null');
  } catch {
    return null;
  }
}

export function MediaServerProvider({ children }: { children: ReactNode }) {
  const [server, setServer] = useState<MediaServer | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    setFailed(false);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 20000);
    const json = (url: string) =>
      fetch(url, {
        cache: 'no-store',
        credentials: 'same-origin',
        signal: controller.signal,
      })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null);
    Promise.all([
      json('/lumen-config.json'),
      loadPublicSettings(controller.signal),
    ])
      .then(([config, pub]) => {
        if (!live) return;
        if (!pub || typeof pub !== 'object' || Array.isArray(pub)) {
          setFailed(true);
          return;
        }
        current = resolveMediaServer(
          config?.mediaServer,
          pub as ServerPublicSettings | null,
          config?.mediaServerName
        );
        currentSite = resolveSite(config, pub as ServerPublicSettings);
        currentServices = resolveServices(pub as Record<string, unknown>);
        applySite(currentSite);
        setServer(current);
      })
      .catch(() => live && setFailed(true))
      .finally(() => window.clearTimeout(timeout));
    return () => {
      live = false;
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [attempt]);
  if (failed)
    return createElement(
      'div',
      { className: 'login' },
      createElement(
        'div',
        { className: 'login-card' },
        createElement(
          'p',
          { className: 'login-err', role: 'alert' },
          'Couldn’t load sign-in options.'
        ),
        createElement(
          'button',
          {
            className: 'btn btn-tonal',
            onClick: () => setAttempt((value) => value + 1),
          },
          'Retry'
        )
      )
    );
  // a moment's blank page beats flashing the wrong server name on every label
  if (!server)
    return createElement('div', { className: 'boot', 'aria-busy': 'true' });
  return createElement(Fragment, null, children);
}
