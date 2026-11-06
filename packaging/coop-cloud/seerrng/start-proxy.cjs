'use strict';

(async () => {
  if (process.getuid() !== 1000 || process.getgid() !== 1000) {
    throw new Error('SeerrNG must run as its unprivileged container user.');
  }
  let origin;
  try {
    origin = new URL(process.env.SEERR_PUBLIC_ORIGIN);
  } catch {
    throw new Error('The recipe must supply a valid HTTPS application origin.');
  }
  if (
    origin.protocol !== 'https:' ||
    origin.username ||
    origin.password ||
    origin.pathname !== '/' ||
    origin.search ||
    origin.hash
  ) {
    throw new Error('The recipe must supply a valid HTTPS application origin.');
  }
  process.env.CONFIG_DIRECTORY = '/app/config';
  const settings = await require('/app/dist/lib/settings').getSettings().load();
  settings.main.applicationUrl = origin.origin;
  settings.network = { ...settings.network, trustProxy: true };
  await settings.save();
  require('/app/dist/index.js');
})();
