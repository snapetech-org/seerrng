import assert from 'node:assert/strict';
import { test } from 'node:test';
import { plexLink, plexPlatform } from '../src/plexLinks.ts';
const links = {
  mediaUrl: 'https://app.plex.tv/desktop/#!/server/server/details?key=1',
  mediaUrl4k: 'https://app.plex.tv/desktop/#!/server/server/details?key=2',
  iOSPlexUrl: 'plex://preplay/?metadataKey=1&server=server',
  iOSPlexUrl4k: 'plex://preplay/?metadataKey=2&server=server',
};
test('phones and tablets use native Plex; desktop keeps web', () => {
  assert.equal(plexPlatform({ userAgent: 'iPhone' }), 'ios');
  assert.equal(
    plexPlatform({ userAgent: 'Macintosh', maxTouchPoints: 5 }),
    'ios'
  );
  assert.equal(plexPlatform({ userAgent: 'Android Tablet' }), 'android');
  assert.equal(
    plexPlatform({ userAgent: 'Macintosh', maxTouchPoints: 0 }),
    'desktop'
  );
  assert.equal(plexLink(links, false, 'ios').href, links.iOSPlexUrl);
  assert.equal(plexLink(links, true, 'ios').href, links.iOSPlexUrl4k);
  assert.equal(plexLink(links, false, 'desktop').href, links.mediaUrl);
  const android = plexLink(links, true, 'android').href;
  assert.ok(android.startsWith('intent://preplay/?metadataKey=2'));
  assert.ok(android.includes('package=com.plexapp.android;'));
  assert.ok(
    android.includes(
      'S.browser_fallback_url=' + encodeURIComponent(links.mediaUrl4k) + ';'
    )
  );
});
test('an unavailable 4K app target falls back to web', () => {
  assert.equal(
    plexLink(
      { mediaUrl: links.mediaUrl, iOSPlexUrl: links.iOSPlexUrl },
      true,
      'ios'
    ).href,
    links.mediaUrl
  );
});
test('unsafe schemes, credentials and intent fragments cannot become playback targets', () => {
  for (const value of [
    'javascript:alert(1)',
    'data:text/html,unsafe',
    'plex://preplay/#Intent;package=evil;end',
    'plex://other/?key=1',
  ])
    assert.equal(
      plexLink({ mediaUrl: links.mediaUrl, iOSPlexUrl: value }, false, 'ios')
        .href,
      links.mediaUrl
    );
  for (const value of [
    'javascript:alert(1)',
    'data:text/html,unsafe',
    'https://user:password@example.com/',
  ])
    assert.equal(
      plexLink({ mediaUrl: value }, false, 'desktop').href,
      undefined
    );
});
