import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveMediaServer } from '../src/mediaServer.ts';

test('follows SeerrNG media server type unless the admin pins one', () => {
  assert.equal(resolveMediaServer('auto', { mediaServerType: 1 }).name, 'Plex');
  assert.equal(
    resolveMediaServer(undefined, { mediaServerType: 2 }).name,
    'Jellyfin'
  );
  assert.equal(resolveMediaServer('auto', { mediaServerType: 3 }).name, 'Emby');
  assert.equal(resolveMediaServer('auto', { mediaServerType: 4 }).kind, 'plex');
  assert.equal(resolveMediaServer('auto', null).kind, 'plex');
  const pinned = resolveMediaServer('jellyfin', { mediaServerType: 1 });
  assert.equal(pinned.kind, 'jellyfin');
  assert.equal(pinned.source, 'config');
  assert.equal(
    resolveMediaServer('auto', { mediaServerType: 2 }).source,
    'seerrng'
  );
  // unknown values fall back to SeerrNG
  assert.equal(
    resolveMediaServer('kodi', { mediaServerType: 2 }).kind,
    'jellyfin'
  );
});

test('sign-in options mirror SeerrNG public settings', () => {
  const jf = resolveMediaServer('auto', {
    mediaServerType: 2,
    jellyfinQuickConnectOnly: true,
    localLogin: false,
    mediaServerLogin: true,
  });
  assert.equal(jf.quickConnect, true);
  assert.equal(jf.quickConnectOnly, true);
  assert.equal(jf.localLogin, false);
  const emby = resolveMediaServer('auto', {
    mediaServerType: 3,
    jellyfinQuickConnectOnly: true,
  });
  assert.equal(emby.quickConnect, false);
  assert.equal(emby.quickConnectOnly, false);
  const plex = resolveMediaServer('auto', { mediaServerType: 1 });
  assert.equal(plex.forgotPasswordUrl, undefined);
  assert.equal(plex.localLogin, true);
});

test('forgot-password links match SeerrNG and only allow http(s)', () => {
  assert.equal(
    resolveMediaServer('auto', {
      mediaServerType: 2,
      jellyfinExternalHost: 'https://jf.example.com/',
    }).forgotPasswordUrl,
    'https://jf.example.com/web/index.html#!/forgotpassword.html'
  );
  assert.equal(
    resolveMediaServer('auto', {
      mediaServerType: 3,
      jellyfinHost: 'http://10.0.0.5:8096',
    }).forgotPasswordUrl,
    'http://10.0.0.5:8096/web/index.html#!/startup/forgotpassword.html'
  );
  assert.equal(
    resolveMediaServer('auto', {
      mediaServerType: 2,
      jellyfinExternalHost: 'https://jf.example.com',
      jellyfinForgotPasswordUrl: 'https://help.example.com/reset',
    }).forgotPasswordUrl,
    'https://help.example.com/reset'
  );
  assert.equal(
    resolveMediaServer('auto', {
      mediaServerType: 2,
      jellyfinForgotPasswordUrl: 'javascript:alert(1)',
    }).forgotPasswordUrl,
    undefined
  );
});
