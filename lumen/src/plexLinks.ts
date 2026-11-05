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
// Props for a "Watch on Plex" link. Phones and tablets open the Plex app at the title (SeerrNG's
// plex://preplay link); Android goes through an intent so Chrome falls back to Plex's web app
// when the app isn't installed. Everywhere else: Plex's web app in a new tab.
export const plexLink = (
  m?: PlexLinks,
  is4k = false,
  platform = plexPlatform()
) => {
  const web = plexUrl(m, is4k);
  const app = safeUrl(
    (is4k && m?.iOSPlexUrl4k) || (!is4k && m?.iOSPlexUrl) || undefined,
    true
  );
  if (app?.startsWith('plex://') && platform === 'android') {
    const fallback = web
      ? `S.browser_fallback_url=${encodeURIComponent(web)};`
      : '';
    return {
      href: `intent://${app.slice('plex://'.length)}#Intent;scheme=plex;package=com.plexapp.android;${fallback}end`,
    };
  }
  if (app && platform === 'ios') return { href: app };
  return { href: web, target: '_blank', rel: 'noreferrer' };
};
