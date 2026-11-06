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
  v === 'auto' || (typeof v === 'string' && v in NAMES);

const httpUrl = (v?: string) => {
  if (!v) return undefined;
  try {
    const u = new URL(v);
    return ['http:', 'https:'].includes(u.protocol) ? u : undefined;
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
    pinned || FROM_SEERRNG[pub?.mediaServerType ?? 0] || ('plex' as const);
  const jellyfinLike = kind !== 'plex';
  // same forgot-password link SeerrNG's own Jellyfin/Emby login uses
  const host = httpUrl(pub?.jellyfinExternalHost || pub?.jellyfinHost);
  const forgot =
    httpUrl(pub?.jellyfinForgotPasswordUrl)?.href ||
    (host
      ? `${host.href.replace(/\/$/, '')}/web/index.html#!/${kind === 'emby' ? 'startup/' : ''}forgotpassword.html`
      : undefined);
  return {
    kind,
    name: NAMES[kind],
    source: pinned ? 'config' : 'seerrng',
    localLogin: pub?.localLogin ?? true,
    serverLogin: pub?.mediaServerLogin ?? true,
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
  useEffect(() => {
    let live = true;
    const json = (url: string) =>
      fetch(url, { cache: 'no-store', credentials: 'same-origin' })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null);
    Promise.all([json('/lumen-config.json'), json('/api/v1/settings/public')])
      .then(([config, pub]) => {
        if (!live) return;
        current = resolveMediaServer(
          config?.mediaServer,
          pub as ServerPublicSettings | null
        );
        setServer(current);
      })
      .catch(() => live && setServer(current));
    return () => {
      live = false;
    };
  }, []);
  // a moment's blank page beats flashing the wrong server name on every label
  if (!server)
    return createElement('div', { className: 'boot', 'aria-busy': 'true' });
  return createElement(Fragment, null, children);
}
