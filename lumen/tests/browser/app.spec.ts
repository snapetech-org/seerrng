import { expect, test, type Page } from '@playwright/test';

// These fixtures exercise the built frontend's API boundary, not provider credentials.
const movie = {
  posterPath: '/qa-poster.png',
  backdropPath: '/qa-backdrop.png',
  id: 101,
  title: 'The Test Film',
  mediaType: 'movie',
  releaseDate: '2020-01-01',
  overview:
    'A deterministic catalogue title for request and account isolation checks.',
  genres: [{ id: 18, name: 'Drama' }],
  releases: { results: [] },
  credits: { cast: [], crew: [] },
  runtime: 100,
  voteAverage: 7.5,
};
const available = {
  id: 10,
  status: 5,
  mediaUrl:
    'https://app.plex.tv/desktop/#!/server/test/details?key=%2Flibrary%2Fmetadata%2F101',
  iOSPlexUrl:
    'plex://preplay/?metadataKey=%2Flibrary%2Fmetadata%2F101&server=test',
};
const paged = (results: unknown[]) => ({
  page: 1,
  totalPages: 1,
  totalResults: results.length,
  results,
});

async function fixtures(page: Page) {
  let user = 'owner';
  let holdFriend = false;
  let release: (() => void) | undefined;
  let pending: Promise<void> | undefined;
  const unknown: string[] = [];
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('https://**/*', (route) => route.abort());
  await page.route(/(?:image\.tmdb\.org|\/imageproxy\/tmdb)\//, (route) =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="780" height="440"><rect width="780" height="440" fill="#30405c"/><circle cx="390" cy="220" r="100" fill="#526996"/></svg>',
    })
  );
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.slice('/api/v1'.length);
    let body: unknown;
    let status = 200;
    if (path === '/request/status')
      return route.fulfill({
        status: 404,
        json: { message: 'Legacy fixture endpoint' },
      });
    if (path === '/auth/me') {
      status = user ? 200 : 401;
      body = user
        ? { id: user === 'owner' ? 1 : 2, displayName: user, permissions: 2 }
        : { message: 'Sign in' };
    } else if (path === '/auth/logout') {
      user = '';
      status = 204;
    } else if (path === '/auth/local') {
      user = request.postDataJSON().email.startsWith('owner')
        ? 'owner'
        : 'friend';
      body = {};
    } else if (path === '/settings/public')
      body = {
        applicationTitle: 'SeerrNG',
        enabledMediaCategories: {},
        movie4kEnabled: false,
      };
    else if (/^\/user\/\d+\/quota$/.test(path)) body = {};
    else if (path === '/discover/genreslider/movie')
      body = [{ id: 18, name: 'Drama', backdrops: [] }];
    else if (/^\/discover\/(trending|movies|tv)(\/upcoming)?$/.test(path))
      body = paged(path === '/discover/tv' ? [] : [movie]);
    else if (path === '/discover/books') body = paged([]);
    else if (path === '/media') body = paged([]);
    else if (path === '/request')
      body = { pageInfo: { pages: 1, results: 0 }, results: [] };
    else if (path === '/request/count')
      body = { total: 0, pending: 0, approved: 0, processing: 0, available: 0 };
    else if (path === '/movie/101/recommendations') body = paged([]);
    else if (path === '/tv/202/recommendations') body = paged([]);
    else if (path === '/tv/202')
      body = {
        ...movie,
        id: 202,
        name: 'The Test Series',
        title: undefined,
        firstAirDate: '2020-01-01',
        status: 'Ended',
        seasons: [
          { id: 1, seasonNumber: 1, episodeCount: 2, name: 'Season 1' },
        ],
        mediaInfo: { ...available, seasons: [{ seasonNumber: 1, status: 5 }] },
      };
    else if (path === '/movie/101') {
      const current = user;
      if (current === 'friend' && holdFriend) await pending;
      body = {
        ...movie,
        mediaInfo: current === 'owner' ? available : { status: 1 },
      };
    } else if (path === '/service/radarr') body = [];
    else {
      unknown.push(`${request.method()} ${path}`);
      status = 404;
      body = { message: 'Unspecified QA endpoint' };
    }
    await route.fulfill({ status, ...(status === 204 ? {} : { json: body }) });
  });
  return {
    unknown,
    errors,
    hold() {
      holdFriend = true;
      pending = new Promise<void>((r) => {
        release = r;
      });
    },
    release() {
      holdFriend = false;
      release?.();
    },
  };
}

async function openMovie(page: Page) {
  await page
    .getByRole('link', { name: /The Test Film/ })
    .first()
    .click();
  await expect(
    page.getByRole('heading', { name: 'The Test Film' })
  ).toBeVisible();
}
async function profile(page: Page) {
  // Detail pages replace the phone tab bar with a playback action bar.
  if (await page.locator('.dback').isVisible()) {
    await page
      .getByRole('button', { name: 'Back', exact: true })
      .filter({ visible: true })
      .first()
      .click();
    await expect(
      page.getByRole('heading', { name: 'Discover', exact: true })
    ).toBeVisible();
  }
  await page.locator('a[href="/me"]').filter({ visible: true }).first().click();
  await expect(
    page.getByRole('heading', { name: 'You', exact: true })
  ).toBeVisible();
}

test('catalogue, Plex device links, requests and responsive layout', async ({
  page,
}, info) => {
  const fixture = await fixtures(page);
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Discover', exact: true })
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath('discover.png'),
    fullPage: true,
    animations: 'disabled',
  });
  await openMovie(page);
  const link = page
    .getByRole('link', { name: 'Watch on Plex', exact: true })
    .filter({ visible: true })
    .first();
  await expect(link).toHaveAttribute(
    'href',
    info.project.name === 'android'
      ? /^intent:\/\/watch\/video\?uri=/
      : ['iphone', 'tablet'].includes(info.project.name)
        ? /^plex:\/\//
        : /^https:\/\/app\.plex\.tv\//
  );
  if (info.project.name === 'desktop')
    await expect(link).toHaveAttribute('rel', 'noreferrer');
  await page.screenshot({
    path: info.outputPath('movie.png'),
    fullPage: true,
    animations: 'disabled',
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    )
  ).toBeTruthy();
  await profile(page);
  await page.screenshot({
    path: info.outputPath('profile.png'),
    fullPage: true,
    animations: 'disabled',
  });
  await page
    .locator('a[href="/requests"]')
    .filter({ visible: true })
    .first()
    .click();
  await expect(
    page.getByRole('heading', { name: 'Requests', exact: true })
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath('requests.png'),
    fullPage: true,
    animations: 'disabled',
  });
  expect(fixture.errors).toEqual([]);
  expect(fixture.unknown).toEqual([]);
});

test('account changes clear private API responses and preferences without reloading', async ({
  page,
}) => {
  const fixture = await fixtures(page);
  await page.goto('/');
  await openMovie(page);
  await expect(
    page
      .getByRole('link', { name: 'Watch on Plex', exact: true })
      .filter({ visible: true })
      .first()
  ).toBeVisible();
  await profile(page);
  await page
    .getByRole('group', { name: 'Theme', exact: true })
    .getByRole('button', { name: 'Light', exact: true })
    .click();
  await expect
    .poll(() =>
      page.evaluate(
        () => JSON.parse(localStorage.getItem('lumen-prefs:1') || '{}').theme
      )
    )
    .toBe('light');
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await page
    .getByRole('button', { name: 'Use an email and password instead' })
    .click();
  await page.getByLabel('Email', { exact: true }).fill('friend@example.test');
  await page.getByLabel('Password', { exact: true }).fill('fixture-only');
  fixture.hold();
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  // Login keeps the current route (/me); the new account must start with its own preferences.
  await expect(
    page
      .getByRole('group', { name: 'Theme', exact: true })
      .getByRole('button', { name: 'Dark', exact: true })
  ).toHaveAttribute('aria-pressed', 'true');
  await page.locator('a[href="/"]').filter({ visible: true }).first().click();
  await page
    .getByRole('link', { name: /The Test Film/ })
    .first()
    .click();
  await expect(page.locator('.detail-loading')).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Watch on Plex', exact: true })
  ).toHaveCount(0);
  fixture.release();
  await expect(
    page.getByRole('heading', { name: 'The Test Film' })
  ).toBeVisible();
  await expect(
    page
      .getByRole('button', { name: 'Request', exact: true })
      .filter({ visible: true })
      .first()
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Watch on Plex', exact: true })
  ).toHaveCount(0);
  expect(fixture.errors).toEqual([]);
  expect(fixture.unknown).toEqual([]);
});

test('empty and failed trending feeds finish loading', async ({ page }) => {
  const fixture = await fixtures(page);
  await page.route('**/api/v1/discover/trending', (route) =>
    route.fulfill({ json: paged([]) })
  );
  await page.goto('/');
  await expect(
    page.getByText('No popular titles available', { exact: true })
  ).toBeVisible();
  await page.route('**/api/v1/discover/trending', (route) =>
    route.fulfill({ status: 503, json: { message: 'Provider unavailable' } })
  );
  await page.reload();
  await expect(
    page.getByText('Couldn’t load popular titles', { exact: true })
  ).toBeVisible();
  expect(fixture.errors).toEqual([]);
});

test('a failed Discover row can be retried', async ({ page }) => {
  const fixture = await fixtures(page);
  let fail = true;
  await page.route('**/api/v1/discover/trending', (route) =>
    fail
      ? route.fulfill({
          status: 503,
          json: { message: 'Provider unavailable' },
        })
      : route.fallback()
  );
  await page.goto('/');
  const failed = page.getByText('Couldn’t load popular titles', {
    exact: true,
  });
  await expect(failed).toBeVisible();
  fail = false;
  await page
    .locator('.empty', { hasText: 'Couldn’t load popular titles' })
    .getByRole('button', { name: 'Retry', exact: true })
    .click();
  await expect(failed).toHaveCount(0);
  expect(fixture.errors).toEqual([]);
});

test('series details use the Android series route and retain iOS and desktop links', async ({
  page,
}, info) => {
  const fixture = await fixtures(page);
  await page.goto('/tv/202');
  await expect(
    page.getByRole('heading', { name: 'The Test Series', exact: true })
  ).toBeVisible();
  const link = page
    .getByRole('link', { name: 'Watch on Plex', exact: true })
    .filter({ visible: true })
    .first();
  await expect(link).toHaveAttribute(
    'href',
    info.project.name === 'android'
      ? /^intent:\/\/libraries\/test\/show\/x\/101#Intent;/
      : ['iphone', 'tablet'].includes(info.project.name)
        ? /^plex:\/\/preplay\//
        : /^https:\/\/app\.plex\.tv\//
  );
  await page.screenshot({
    path: info.outputPath('series.png'),
    fullPage: true,
    animations: 'disabled',
  });
  expect(fixture.errors).toEqual([]);
  expect(fixture.unknown).toEqual([]);
});

test('recent searches discard shared history and stay with their account', async ({
  page,
}, info) => {
  const fixture = await fixtures(page);
  await page.addInitScript(() => {
    if (!localStorage.getItem('history-fixture-seeded')) {
      localStorage.setItem('history-fixture-seeded', 'true');
      localStorage.setItem(
        'lumen-recent-searches',
        JSON.stringify(['Legacy private query'])
      );
      localStorage.setItem(
        'lumen-recent-searches:1',
        JSON.stringify(['Owner private query'])
      );
      localStorage.setItem(
        'lumen-recent-searches:2',
        JSON.stringify(['Friend private query'])
      );
    }
  });
  await page.goto('/search');
  await expect(
    page.getByRole('heading', { name: 'Search', exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Legacy private query', exact: true })
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Owner private query', exact: true })
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath('owner-search.png'),
    animations: 'disabled',
  });
  await profile(page);
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await page
    .getByRole('button', { name: 'Use an email and password instead' })
    .click();
  await page.getByLabel('Email', { exact: true }).fill('friend@example.test');
  await page.getByLabel('Password', { exact: true }).fill('fixture-only');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'You', exact: true })
  ).toBeVisible();
  await page.goto('/search');
  await expect(
    page.getByRole('button', { name: 'Friend private query', exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Owner private query', exact: true })
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Legacy private query', exact: true })
  ).toHaveCount(0);
  await page.route('**/api/v1/search?**', (route) =>
    route.fulfill({ json: paged([]) })
  );
  await page.route('**/seerr-classic/hcsearch?**', (route) =>
    route.fulfill({ json: [] })
  );
  const search = page
    .locator('input[type="search"]')
    .filter({ visible: true })
    .first();
  await search.fill('Friend new query');
  await search.press('Enter');
  await expect
    .poll(() =>
      page.evaluate(() =>
        JSON.parse(localStorage.getItem('lumen-recent-searches:2') || '[]')
      )
    )
    .toEqual(['Friend new query', 'Friend private query']);
  await page.goto('/search');
  await expect(
    page.getByRole('button', { name: 'Friend new query', exact: true })
  ).toBeVisible();
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Recent searches', exact: true })
  ).toHaveCount(0);
  expect(
    await page.evaluate(() => localStorage.getItem('lumen-recent-searches:1'))
  ).toContain('Owner private query');
  expect(
    await page.evaluate(() => localStorage.getItem('lumen-recent-searches'))
  ).toBeNull();
  await page.screenshot({
    path: info.outputPath('friend-cleared-search.png'),
    animations: 'disabled',
  });
  expect(fixture.errors).toEqual([]);
  expect(fixture.unknown).toEqual([]);
});

test('malformed recent search storage does not crash Search', async ({
  page,
}) => {
  const fixture = await fixtures(page);
  await page.addInitScript(() => {
    localStorage.setItem('lumen-recent-searches', '{broken');
    localStorage.setItem('lumen-recent-searches:1', '{broken');
  });
  await page.goto('/search');
  await expect(
    page.getByRole('heading', { name: 'Search', exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Browse', exact: true })
  ).toBeVisible();
  expect(fixture.errors).toEqual([]);
});

test('unavailable history storage still permits searching', async ({
  page,
}) => {
  const fixture = await fixtures(page);
  await page.addInitScript(() => {
    const originalGet = Storage.prototype.getItem;
    const originalSet = Storage.prototype.setItem;
    const originalRemove = Storage.prototype.removeItem;
    Storage.prototype.getItem = function (key) {
      if (key.startsWith('lumen-recent-searches'))
        throw new DOMException('Blocked fixture storage', 'SecurityError');
      return originalGet.call(this, key);
    };
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith('lumen-recent-searches'))
        throw new DOMException('Blocked fixture storage', 'SecurityError');
      originalSet.call(this, key, value);
    };
    Storage.prototype.removeItem = function (key) {
      if (key.startsWith('lumen-recent-searches'))
        throw new DOMException('Blocked fixture storage', 'SecurityError');
      originalRemove.call(this, key);
    };
  });
  await page.route('**/api/v1/search?**', (route) =>
    route.fulfill({ json: paged([]) })
  );
  await page.route('**/seerr-classic/hcsearch?**', (route) =>
    route.fulfill({ json: [] })
  );
  await page.goto('/search');
  await expect(
    page.getByRole('heading', { name: 'Search', exact: true })
  ).toBeVisible();
  const search = page
    .locator('input[type="search"]')
    .filter({ visible: true })
    .first();
  await search.fill('Available search');
  await search.press('Enter');
  await expect(page).toHaveURL(/q=Available/);
  await expect(
    page.getByRole('heading', { name: 'Search', exact: true })
  ).toBeVisible();
  expect(fixture.errors).toEqual([]);
});

test('a partly available series can still be watched', async ({ page }) => {
  await fixtures(page);
  await page.route('**/api/v1/tv/202', (route) =>
    route.fulfill({
      json: {
        ...movie,
        id: 202,
        name: 'The Test Series',
        title: undefined,
        firstAirDate: '2020-01-01',
        status: 'Returning Series',
        seasons: [
          { id: 1, seasonNumber: 1, episodeCount: 8, name: 'Season 1' },
          { id: 2, seasonNumber: 2, episodeCount: 8, name: 'Season 2' },
        ],
        mediaInfo: {
          ...available,
          status: 4,
          seasons: [{ seasonNumber: 1, status: 4 }],
        },
      },
    })
  );
  await page.goto('/tv/202');
  await expect(
    page.getByRole('heading', { name: 'The Test Series' })
  ).toBeVisible();
  await expect(
    page
      .getByRole('link', { name: 'Watch on Plex' })
      .filter({ visible: true })
      .first()
  ).toBeVisible();
  await expect(page.getByText('Partly on Plex').first()).toBeVisible();
});

test('Discover leaves out rows that came back empty', async ({ page }) => {
  await fixtures(page);
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Trending movies' })
  ).toBeVisible();
  // the fixtures have no series and no books
  await expect(
    page.getByRole('heading', { name: 'Popular series' })
  ).toHaveCount(0);
  await expect(
    page.getByRole('heading', { name: 'Popular books' })
  ).toHaveCount(0);
});

test('Coming soon says when its lists fail and retries them', async ({
  page,
}) => {
  const fixture = await fixtures(page);
  let fail = true;
  await page.route(/\/api\/v1\/discover\/(movies|tv)\/upcoming$/, (route) =>
    fail
      ? route.fulfill({
          status: 503,
          json: { message: 'Provider unavailable' },
        })
      : route.fulfill({
          json: paged([{ ...movie, releaseDate: '2099-03-04' }]),
        })
  );
  await page.goto('/soon');
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('Couldn’t load upcoming titles');
  await expect(page.getByText('Loading…', { exact: true })).toHaveCount(0);
  fail = false;
  await alert.getByRole('button', { name: 'Retry' }).click();
  await expect(
    page.getByRole('link', { name: 'The Test Film' }).first()
  ).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(fixture.errors).toEqual([]);
});

test('a failed search offers Retry instead of saying nothing matched', async ({
  page,
}) => {
  const fixture = await fixtures(page);
  let fail = true;
  await page.route('**/api/v1/search?**', (route) =>
    fail
      ? route.fulfill({ status: 429, json: { message: 'Too many requests' } })
      : route.fulfill({ json: paged([movie]) })
  );
  await page.goto('/search?q=Test');
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('Couldn’t load search results');
  await expect(alert).toContainText('Too many requests');
  await expect(page.getByText(/No matches for/)).toHaveCount(0);
  fail = false;
  await alert.getByRole('button', { name: 'Retry' }).click();
  await expect(
    page.getByRole('heading', { name: 'Movies', exact: true })
  ).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(fixture.errors).toEqual([]);
});

test('a double click on a poster’s Request sends one request', async ({
  page,
}) => {
  const fixture = await fixtures(page);
  // a plain requester: one-click requests, no options sheet
  await page.route('**/api/v1/auth/me', (route) =>
    route.fulfill({ json: { id: 3, displayName: 'viewer', permissions: 32 } })
  );
  const posts: unknown[] = [];
  await page.route('**/api/v1/request', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    posts.push(route.request().postDataJSON());
    await new Promise((resolve) => setTimeout(resolve, 300));
    await route.fulfill({ json: { id: 1 } });
  });
  await page.goto('/movies');
  const card = page.locator('.poster', { hasText: 'The Test Film' }).first();
  await card.hover();
  const overlay = card.getByRole('button', { name: 'Request', exact: true });
  const touch = card.getByRole('button', { name: 'Request The Test Film' });
  await ((await overlay.isVisible()) ? overlay : touch).dblclick();
  await expect(page.getByText('Requested The Test Film').first()).toBeVisible();
  await page.waitForTimeout(400);
  expect(posts).toHaveLength(1);
  expect(fixture.errors).toEqual([]);
});

test('a category page says when SeerrNG’s settings fail and retries', async ({
  page,
}) => {
  const fixture = await fixtures(page);
  // the app's first read (which picks the media server) works; the page's own read fails
  let calls = 0;
  let fail = true;
  await page.route('**/api/v1/settings/public', (route) =>
    ++calls > 1 && fail
      ? route.fulfill({ status: 503, json: { message: 'Starting up' } })
      : route.fallback()
  );
  await page.goto('/music');
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('Couldn’t load this page');
  fail = false;
  await alert.getByRole('button', { name: 'Retry' }).click();
  await expect(
    page.getByText('Music is turned off on this server')
  ).toBeVisible();
  expect(fixture.errors).toEqual([]);
});

test('the companion sign-in screen offers native access before authentication', async ({
  page,
}) => {
  await fixtures(page);
  await page.route('**/api/v1/auth/me', (r) =>
    r.fulfill({ status: 401, json: { message: 'Not signed in' } })
  );
  await page.goto('/');
  await expect(
    page.getByRole('link', { name: 'Open full SeerrNG', exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Open full SeerrNG', exact: true })
  ).toHaveAttribute('href', '/seerrng');
  await expect(
    page.getByText('Lumen companion', { exact: true })
  ).toBeVisible();
});
