import { getSettings } from '@server/lib/settings';
import logger from '@server/logger';
import { after, before } from 'node:test';
import { installTestNetworkGuard } from './network-guard.mjs';

// This blocks common HTTP client paths while preserving loopback requests used
// by tests. It is not an OS sandbox; raw sockets, subprocesses, and filesystem
// access remain available to test code.
const blocked = installTestNetworkGuard();

Reflect.set(
  globalThis,
  Symbol.for('seerrng.test.externalRuntimeConfig'),
  () => {
    const settings = getSettings();
    return {
      clientId: settings.clientId,
      vapidPublic: settings.vapidPublic,
      vapidPrivate: settings.vapidPrivate,
      main: settings.main,
      plex: settings.plex,
      jellyfin: settings.jellyfin,
      oidc: settings.oidc,
      tautulli: settings.tautulli,
      radarr: settings.radarr,
      sonarr: settings.sonarr,
      sportarr: settings.sportarr,
      lidarr: settings.lidarr,
      readarr: settings.readarr,
      mylar: settings.mylar,
      kapowarr: settings.kapowarr,
      backissue: settings.backissue,
      lazylibrarian: settings.lazylibrarian,
      notifications: settings.notifications,
      network: settings.network,
    };
  }
);

before(() => {
  if (process.env.VERBOSE != 'true') logger.silent = true;
});

after(() => {
  if (process.env.VERBOSE != 'true') logger.silent = false;

  // callers that swallow the error would otherwise leave the suite green
  if (blocked.size && process.env.SEERR_TEST_FAIL_ON_NETWORK === 'true') {
    throw new Error(
      `Test reached the network: ${[...blocked].join(', ')}. Stub the API client this test uses.`
    );
  }
});
