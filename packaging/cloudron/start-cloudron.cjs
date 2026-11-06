'use strict';

const { execFileSync } = require('node:child_process');
const { lstatSync, mkdirSync, chownSync, chmodSync } = require('node:fs');

// Cloudron restores storage permissions on restart. Keep privileged setup
// confined to these fixed locations, then load the application without root.
const data = '/app/data';
const cache = '/tmp/seerrng-next-cache';
for (const directory of [data, cache]) {
  mkdirSync(directory, { recursive: true });
  if (!lstatSync(directory).isDirectory()) {
    throw new Error('Cloudron storage must be a directory, not a symlink.');
  }
}
if (process.getuid() === 0) {
  // -h does not follow stored symlinks; never change their external targets.
  execFileSync('/bin/chown', ['-hR', '1000:1000', data]);
  chownSync(cache, 1000, 1000);
  process.setgroups([]);
  process.setgid(1000);
  process.setuid(1000);
}
if (process.getuid() !== 1000 || process.getgid() !== 1000) {
  throw new Error('SeerrNG must run as its unprivileged container user.');
}
chmodSync(data, 0o700);
chmodSync(cache, 0o700);
process.env.CONFIG_DIRECTORY = data;
process.chdir('/app');
(async () => {
  if (process.env.CLOUDRON_APP_ORIGIN) {
    let origin;
    try {
      origin = new URL(process.env.CLOUDRON_APP_ORIGIN);
    } catch {
      throw new Error('Cloudron must supply a valid HTTPS application origin.');
    }
    if (
      origin.protocol !== 'https:' ||
      origin.username ||
      origin.password ||
      origin.pathname !== '/' ||
      origin.search ||
      origin.hash
    ) {
      throw new Error('Cloudron must supply a valid HTTPS application origin.');
    }
    // Cloudron's managed proxy owns the external origin. Configure the native
    // single-hop proxy support before serving secure cookies or OAuth callbacks.
    const settings = await require('/app/dist/lib/settings')
      .getSettings()
      .load();
    settings.main.applicationUrl = origin.origin;
    settings.network = { ...settings.network, trustProxy: true };
    await settings.save();
  }
  require('/app/dist/index.js');
})();
