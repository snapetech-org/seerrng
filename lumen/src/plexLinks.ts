export type PlexLinks = {
  mediaUrl?: string;
  mediaUrl4k?: string;
  iOSPlexUrl?: string;
  iOSPlexUrl4k?: string;
};
// the title in Plex's web app
export const plexUrl = (m?: PlexLinks, is4k = false) =>
  safeUrl((is4k && m?.mediaUrl4k) || m?.mediaUrl, false);

export type PlexPlatform = 'ios' | 'android' | 'desktop';
export function plexPlatform(
  device:
    | { userAgent: string; maxTouchPoints?: number }
    | undefined = typeof navigator === 'undefined' ? undefined : navigator
): PlexPlatform {
  const ua = device?.userAgent ?? '';
  if (
    /iPad|iPhone|iPod/.test(ua) ||
    (ua.includes('Mac') && (device?.maxTouchPoints ?? 0) > 1)
  )
    return 'ios';
  return /Android/i.test(ua) ? 'android' : 'desktop';
}
const safeUrl = (
  value: string | undefined,
  app: boolean
): string | undefined => {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (url.username || url.password) return undefined;
    if (
      app
        ? url.protocol !== 'plex:' || url.hostname !== 'preplay' || !!url.hash
        : !['http:', 'https:'].includes(url.protocol)
    )
      return undefined;
    return url.href;
  } catch {
    return undefined;
  }
};
// iOS uses Plex preplay links. Android needs movie playback or series-library routes;
// preplay opens its home screen. Package-bound intents retain a web fallback.
export const plexLink = (
  m?: PlexLinks,
  is4k = false,
  kind: string = 'movie',
  platform = plexPlatform()
) => {
  const web = plexUrl(m, is4k);
  const app = safeUrl(
    (is4k && m?.iOSPlexUrl4k) || (!is4k && m?.iOSPlexUrl) || undefined,
    true
  );
  if (app && platform === 'android' && (kind === 'movie' || kind === 'tv')) {
    const query = new URL(app).searchParams;
    const server = query.get('server');
    const key = query
      .get('metadataKey')
      ?.match(/^\/library\/metadata\/(\d{1,20})$/)?.[1];
    // Query decoding must not introduce path/intent delimiters into native routes.
    if (server && /^[a-z\d_-]{1,128}$/i.test(server) && key) {
      const path =
        kind === 'movie'
          ? `watch/video?uri=${encodeURIComponent(`server://${server}/com.plexapp.plugins.library/library/metadata/${key}`)}`
          : `libraries/${server}/show/x/${key}`;
      const fallback = web
        ? `S.browser_fallback_url=${encodeURIComponent(web)};`
        : '';
      return {
        href: `intent://${path}#Intent;scheme=plex;package=com.plexapp.android;${fallback}end`,
      };
    }
  }
  if (app && platform === 'ios') return { href: app };
  return { href: web, target: '_blank', rel: 'noreferrer' };
};
