// The companion container keeps its existing root routes. The app bundle lives
// below /lumen and uses SeerrNG's own authenticated API and configuration volume.
export const embedded = import.meta.env?.VITE_LUMEN_EMBEDDED === 'true';
export const lumenConfigUrl = embedded
  ? '/api/v1/lumen/configuration'
  : '/lumen-config.json';
export const lumenAdminUrl = embedded ? '/api/v1/lumen' : '/lumen';

// The configuration is read by the media-server check and then by the preferences; one
// download serves both when they land close together.
let configLoad: { at: number; p: Promise<unknown> } | undefined;
// null when there is no file (404, empty, or the app page served in its place); rejects
// when it couldn't be read (server error, network, broken JSON). The admin page must tell
// these apart: saving over a config it never saw would erase it.
export function readLumenConfig(): Promise<unknown> {
  if (!configLoad || Date.now() - configLoad.at > 10_000) {
    const p = fetch(lumenConfigUrl, {
      cache: 'no-store',
      credentials: 'same-origin',
    }).then(async (r) => {
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(`lumen-config.json: ${r.status}`);
      if ((r.headers.get('Content-Type') || '').includes('text/html'))
        return null;
      const text = await r.text();
      return text.trim() ? (JSON.parse(text) as unknown) : null;
    });
    const load = { at: Date.now(), p };
    configLoad = load;
    // a failed read is not kept for the next caller
    p.catch(() => {
      if (configLoad === load) configLoad = undefined;
    });
  }
  return configLoad.p;
}
// for readers that treat a failed read like no file
export function loadLumenConfig(signal?: AbortSignal): Promise<unknown> {
  const p = readLumenConfig().catch(() => null);
  if (!signal) return p;
  return Promise.race([
    p,
    new Promise<null>((resolve) => {
      if (signal.aborted) resolve(null);
      else
        signal.addEventListener('abort', () => resolve(null), { once: true });
    }),
  ]);
}
// the admin page saved a new configuration
export const forgetLumenConfig = () => {
  configLoad = undefined;
};
