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
export function loadLumenConfig(signal?: AbortSignal): Promise<unknown> {
  if (!configLoad || Date.now() - configLoad.at > 10_000) {
    const p = fetch(lumenConfigUrl, {
      cache: 'no-store',
      credentials: 'same-origin',
    })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    const load = { at: Date.now(), p };
    configLoad = load;
    // a failed read is not kept for the next caller
    void p.then((v) => {
      if (v == null && configLoad === load) configLoad = undefined;
    });
  }
  const p = configLoad.p;
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
