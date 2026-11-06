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
  name: string; // product name used in every label: "On Plex", "Watch on Jellyfin"…
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
  pub: ServerPublicSettings | null
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
    name: NAMES[kind],
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

// Plain module state so non-hook helpers (status words, labels) can read it. The provider
// resolves it once, before anything else renders.
let current: MediaServer = resolveMediaServer('auto', null);
export const mediaServer = () => current;
export const serverName = () => current.name;

export function MediaServerProvider({ children }: { children: ReactNode }) {
  const [server, setServer] = useState<MediaServer | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    setFailed(false);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    const json = (url: string) =>
      fetch(url, {
        cache: 'no-store',
        credentials: 'same-origin',
        signal: controller.signal,
      })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null);
    Promise.all([json('/lumen-config.json'), json('/api/v1/settings/public')])
      .then(([config, pub]) => {
        if (!live) return;
        if (!pub || typeof pub !== 'object' || Array.isArray(pub)) {
          setFailed(true);
          return;
        }
        current = resolveMediaServer(
          config?.mediaServer,
          pub as ServerPublicSettings | null
        );
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
