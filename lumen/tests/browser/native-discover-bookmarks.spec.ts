import { expect, test } from '@playwright/test';

const mount = process.env.LUMEN_TEST_MOUNT === '/lumen' ? '/lumen' : '';

const cases = [
  ['/discover/movies', '/movies'],
  ['/discover/tv', '/series'],
  ['/discover/movies/genres', '/movies/genres'],
  ['/discover/tv/genres', '/series/genres'],
  ['/discover/trending', '/trending'],
  ['/discover/watchlist', '/watchlist/discover'],
  ['/discover/providers', '/providers'],
  ['/discover/book-recommendations', '/books/recommendations'],
  ['/discover/collectors', '/music/collectors'],
  ['/discover/music', '/music'],
  ['/discover/comics', '/comics'],
  ['/discover/magazines?catalog=tracked', '/magazines?catalog=tracked'],
  ['/discover/sports', '/sports'],
  ['/discover/adult', '/adult'],
  ['/discover/patches', '/patches'],
  ['/discover/audiobooks', '/audiobooks'],
  ['/discover/books?format=ebook', '/books?format=ebook'],
  ['/discover/movies/genre/28', '/movies?genre=28'],
  ['/discover/tv/genre/18', '/series?genre=18'],
  ['/discover/movies/studio/34', '/movies?studio=34'],
  ['/discover/tv/network/213', '/series?network=213'],
  ['/discover/movies/language/fr', '/movies?language=fr'],
  ['/discover/tv/language/ja', '/series?language=ja'],
  ['/discover/tv/keyword?keywords=123', '/series?keywords=123'],
  ['/discover/movies/upcoming', '/soon?media=movie'],
  ['/discover/tv/upcoming', '/soon?media=tv'],
  ['/discover/games', '/games/discovery'],
  ['/discover/books?format=audiobook', '/audiobooks?format=audiobook'],
  ['/discover/list/42?page=3', '/list/42?page=3'],
  [
    '/discover/movies/studio/34?sort=popularity.desc&show=plex#results',
    '/movies?sort=popularity.desc&show=plex&studio=34#results',
  ],
] as const;

for (const [source, destination] of cases) {
  test(`native Discover bookmark ${source} opens ${destination}`, async ({
    page,
  }) => {
    await page.route('https://**/*', (route) => route.abort());
    await page.route('**/lumen-config.json', (route) =>
      route.fulfill({ json: {} })
    );
    await page.route('**/api/v1/**', (route) => {
      const path = new URL(route.request().url()).pathname
        .replace(/^\/lumen/, '')
        .replace(/^\/api\/v1/, '');
      if (path === '/auth/me')
        return route.fulfill({
          json: { id: 1, displayName: 'Player', permissions: 2, userType: 2 },
        });
      if (path === '/settings/public')
        return route.fulfill({
          json: {
            initialized: true,
            enabledMediaCategories: {
              movie: true,
              tv: true,
              ebook: true,
              audiobook: true,
              game: true,
              retro: true,
              modern: true,
            },
            softwareEnabled: true,
            romarrEnabled: true,
          },
        });
      if (path === '/user/1/settings/main')
        return route.fulfill({ json: { enabledMediaCategories: {} } });
      return route.fulfill({ json: { results: [], page: 1, totalPages: 1 } });
    });

    await page.goto(`${mount}${source}`);
    await page.waitForFunction(
      (expected) =>
        window.location.pathname.replace('/lumen', '') +
          window.location.search +
          window.location.hash ===
        expected,
      destination
    );
    const url = new URL(page.url());
    const actual = url.pathname.replace(mount, '') + url.search + url.hash;
    expect(actual).toBe(destination);
  });
}

test('malformed native Discover identifiers fall back safely', async ({
  page,
}) => {
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname
      .replace(/^\/lumen/, '')
      .replace(/^\/api\/v1/, '');
    if (path === '/auth/me')
      return route.fulfill({ json: { id: 1, permissions: 2, userType: 2 } });
    if (path === '/settings/public')
      return route.fulfill({ json: { initialized: true } });
    if (path === '/user/1/settings/main') return route.fulfill({ json: {} });
    return route.fulfill({ json: { results: [] } });
  });
  await page.goto(`${mount}/discover/movies/studio/not-an-id`);
  await expect(page).toHaveURL(new RegExp(`${mount}/$`));
});

test('native Coming Soon bookmark opens Lumen Coming Soon and keeps URL state', async ({
  page,
}) => {
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname
      .replace(/^\/lumen/, '')
      .replace(/^\/api\/v1/, '');
    if (path === '/auth/me')
      return route.fulfill({ json: { id: 1, permissions: 2, userType: 2 } });
    if (path === '/settings/public')
      return route.fulfill({
        json: {
          initialized: true,
          enabledMediaCategories: { movie: true, tv: true },
        },
      });
    if (path === '/user/1/settings/main') return route.fulfill({ json: {} });
    return route.fulfill({ json: { results: [], page: 1, totalPages: 1 } });
  });

  await page.goto(`${mount}/coming-soon?media=movie#releases`);
  await page.waitForFunction(
    (expected) =>
      window.location.pathname.replace('/lumen', '') +
        window.location.search +
        window.location.hash ===
      expected,
    '/soon?media=movie#releases'
  );
});

for (const scenario of [
  { name: 'a user manager', permissions: 2, expected: '/admin/users' },
  { name: 'a standard user', permissions: 0, expected: '/me' },
]) {
  test(`native user-list bookmark keeps the Lumen permission gate for ${scenario.name}`, async ({
    page,
  }) => {
    await page.route('https://**/*', (route) => route.abort());
    await page.route('**/lumen-config.json', (route) =>
      route.fulfill({ json: {} })
    );
    await page.route('**/api/v1/**', (route) => {
      const path = new URL(route.request().url()).pathname
        .replace(/^\/lumen/, '')
        .replace(/^\/api\/v1/, '');
      if (path === '/auth/me')
        return route.fulfill({
          json: {
            id: 1,
            displayName: 'Player',
            permissions: scenario.permissions,
            userType: 2,
          },
        });
      if (path === '/settings/public')
        return route.fulfill({ json: { initialized: true } });
      if (path === '/user/1/settings/main') return route.fulfill({ json: {} });
      return route.fulfill({ json: { results: [], page: 1, totalPages: 1 } });
    });

    await page.goto(`${mount}/users?sort=displayName#user-list`);
    await page.waitForFunction(
      (expected) =>
        window.location.pathname.replace('/lumen', '') +
          window.location.search +
          window.location.hash ===
        expected,
      `${scenario.expected}${scenario.permissions ? '?sort=displayName#user-list' : ''}`
    );
  });
}
