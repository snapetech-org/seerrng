import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mediaLink, plexLink, plexPlatform } from '../src/plexLinks.ts';

test('Jellyfin and Emby ignore stale Plex app metadata and keep safe server URLs', () => {
  for (const name of ['Jellyfin', 'Emby']) {
    assert.equal(
      mediaLink(
        {
          mediaUrl: 'https://media.example/web/#!/details?id=1',
          iOSPlexUrl: 'plex://preplay/?server=old',
        },
        false,
        'movie',
        name
      ).href,
      'https://media.example/web/#!/details?id=1'
    );
    for (const url of ['javascript:alert(1)', 'https://secret@media.example/'])
      assert.equal(
        mediaLink({ mediaUrl: url }, false, 'movie', name).href,
        undefined
      );
  }
});
const links = {
  mediaUrl: 'https://app.plex.tv/desktop/#!/server/server/details?key=1',
  mediaUrl4k: 'https://app.plex.tv/desktop/#!/server/server/details?key=2',
  iOSPlexUrl:
    'plex://preplay/?metadataKey=%2Flibrary%2Fmetadata%2F1&server=server',
  iOSPlexUrl4k:
    'plex://preplay/?metadataKey=%2Flibrary%2Fmetadata%2F2&server=server',
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
  assert.equal(plexLink(links, false, 'movie', 'ios').href, links.iOSPlexUrl);
  assert.equal(plexLink(links, true, 'movie', 'ios').href, links.iOSPlexUrl4k);
  assert.equal(plexLink(links, false, 'movie', 'desktop').href, links.mediaUrl);
  const android = plexLink(links, true, 'movie', 'android').href;
  assert.ok(android.startsWith('intent://watch/video?uri='));
  assert.ok(
    android.includes(
      encodeURIComponent(
        'server://server/com.plexapp.plugins.library/library/metadata/2'
      )
    )
  );
  assert.ok(
    plexLink(links, false, 'tv', 'android').href.startsWith(
      'intent://libraries/server/show/x/1#Intent;'
    )
  );
  assert.equal(plexLink(links, false, 'music', 'android').href, links.mediaUrl);
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
      'movie',
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
      plexLink(
        { mediaUrl: links.mediaUrl, iOSPlexUrl: value },
        false,
        'movie',
        'ios'
      ).href,
      links.mediaUrl
    );
  for (const value of [
    'javascript:alert(1)',
    'data:text/html,unsafe',
    'https://user:password@example.com/',
  ])
    assert.equal(
      plexLink({ mediaUrl: value }, false, 'movie', 'desktop').href,
      undefined
    );
});

test('Android rejects decoded routing delimiters and malformed metadata keys', () => {
  for (const server of [
    'bad/route',
    'bad#Intent;package=evil',
    'user@other',
    'x'.repeat(129),
  ]) {
    const app = `plex://preplay/?server=${encodeURIComponent(server)}&metadataKey=%2Flibrary%2Fmetadata%2F1`;
    assert.equal(
      plexLink({ ...links, iOSPlexUrl: app }, false, 'tv', 'android').href,
      links.mediaUrl
    );
  }
  for (const key of [
    '/library/metadata/../users',
    '/library/metadata/1?x=1',
    '1',
    '/library/metadata/' + '1'.repeat(21),
  ]) {
    const app = `plex://preplay/?server=server&metadataKey=${encodeURIComponent(key)}`;
    assert.equal(
      plexLink({ ...links, iOSPlexUrl: app }, false, 'movie', 'android').href,
      links.mediaUrl
    );
  }
});

test('a title that only exists in 4K still links to it', () => {
  const only4k = {
    mediaUrl4k: links.mediaUrl4k,
    iOSPlexUrl4k: links.iOSPlexUrl4k,
  };
  assert.equal(
    plexLink(only4k, false, 'movie', 'desktop').href,
    links.mediaUrl4k
  );
  assert.equal(
    plexLink(only4k, false, 'movie', 'ios').href,
    links.iOSPlexUrl4k
  );
  // an HD-only title never borrows a 4K link it doesn't have
  assert.equal(
    plexLink({ mediaUrl: links.mediaUrl }, true, 'movie', 'desktop').href,
    links.mediaUrl
  );
});
