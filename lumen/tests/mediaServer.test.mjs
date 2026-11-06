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

test('inherited configuration names cannot select a media server', () => {
  for (const value of ['constructor', 'toString', '__proto__'])
    assert.equal(
      resolveMediaServer(value, { mediaServerType: 2 }).kind,
      'jellyfin'
    );
});

test('recovery links reject credentials and preserve only the configured base path', () => {
  for (const key of ['jellyfinExternalHost', 'jellyfinForgotPasswordUrl'])
    assert.equal(
      resolveMediaServer('auto', {
        mediaServerType: 2,
        [key]: 'https://secret:password@jf.example/reset',
      }).forgotPasswordUrl,
      undefined
    );
  assert.equal(
    resolveMediaServer('auto', {
      mediaServerType: 2,
      jellyfinExternalHost: 'https://jf.example/jellyfin/?token=discard#old',
    }).forgotPasswordUrl,
    'https://jf.example/jellyfin/web/index.html#!/forgotpassword.html'
  );
});

test('unavailable settings and an unconfigured server do not enable media sign-in', () => {
  assert.equal(resolveMediaServer('auto', null).serverLogin, false);
  assert.equal(
    resolveMediaServer('auto', { mediaServerType: 4, mediaServerLogin: true })
      .serverLogin,
    false
  );
});

test('branding and sign-in style come from lumen-config.json', async () => {
  const { resolveSite } = await import('../src/mediaServer.ts');
  assert.deepEqual(resolveSite(null, null), {
    name: 'SeerrNG',
    logo: undefined,
    icon: undefined,
    loginForm: false,
  });
  // SeerrNG's application title is used unless it's the stock "Seerr"
  assert.equal(resolveSite({}, { applicationTitle: 'Seerr' }).name, 'SeerrNG');
  assert.equal(
    resolveSite({}, { applicationTitle: 'Family Films' }).name,
    'Family Films'
  );
  const s = resolveSite(
    {
      loginStyle: 'form',
      branding: {
        name: 'Movie Night',
        logo: '/branding/logo.png',
        icon: 'https://cdn.example.com/i.png',
      },
    },
    { applicationTitle: 'Family Films' }
  );
  assert.equal(s.name, 'Movie Night');
  assert.equal(s.logo, '/branding/logo.png');
  assert.equal(s.icon, 'https://cdn.example.com/i.png');
  assert.equal(s.loginForm, true);
  assert.equal(resolveSite({ branding: { name: '' } }, null).name, '');
  for (const bad of [
    'javascript:alert(1)',
    '//evil.example/x.png',
    'http://plain.example/x.png',
    'https://user:pw@example.com/x.png',
    '/\\evil',
    42,
  ])
    assert.equal(
      resolveSite({ branding: { logo: bad } }, null).logo,
      undefined
    );
  assert.equal(resolveSite({ loginStyle: 'other' }, null).loginForm, false);
});
