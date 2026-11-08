// The companion container keeps its existing root routes. The app bundle lives
// below /lumen and uses SeerrNG's own authenticated API and configuration volume.
export const embedded = import.meta.env?.VITE_LUMEN_EMBEDDED === 'true';
export const lumenConfigUrl = embedded
  ? '/api/v1/lumen/configuration'
  : '/lumen-config.json';
export const lumenAdminUrl = embedded ? '/api/v1/lumen' : '/lumen';
