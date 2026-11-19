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
    } else if (/^\/user\/\d+\/settings\/main$/.test(path)) {
      body = {};
    } else if (path === '/auth/logout') {
      user = '';
      status = 204;
    } else if (path === '/auth/local') {
      user = request.postDataJSON().email.startsWith('owner')
        ? 'owner'
        : 'friend';
      body = {};
    } else if (path === '/settings/discover') body = [];
    else if (path === '/settings/public')
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
    else if (path === '/live-tv/status')
      body = { configured: false, guideReady: false, canRequest: false };
    else if (path === '/blocklist/count') body = { count: 0 };
    else if (
      /^\/blocklist\/(101|202)$/.test(path) &&
      request.method() === 'GET'
    ) {
      status = 404;
      body = { message: 'Title is not blocklisted' };
    } else if (path === '/request/status/users')
      body = { pageInfo: { page: 1, pages: 1 }, results: [] };
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

test('New on Plex keeps all recent videos when other media types share the library', async ({
  page,
}) => {
  const fixture = await fixtures(page);
  let requestedMedia: URL | undefined;
  let detailRequests = 0;
  await page.route('**/api/v1/media?**', async (route) => {
    requestedMedia = new URL(route.request().url());
    await route.fulfill({
      json: paged(
        Array.from({ length: 19 }, (_, index) => ({
          id: index + 1,
          tmdbId: index + 1001,
          mediaType: index % 2 ? 'tv' : 'movie',
          status: 5,
          title: `Recent title ${index + 1}`,
          posterPath: '/qa-poster.png',
          mediaAddedAt: '2026-11-10T00:00:00Z',
        }))
      ),
    });
  });
  await page.route(/\/api\/v1\/(movie|tv)\/\d+$/, async (route) => {
    detailRequests += 1;
    await route.fulfill({
      status: 500,
      json: { message: 'Unexpected lookup' },
    });
  });

  await page.goto('/');
  const recent = page.locator('section').filter({
    has: page.getByRole('heading', { name: 'New on Plex' }),
  });
  await expect(
    recent.getByRole('link', { name: 'Recent title 19' })
  ).toHaveCount(1);
  await expect(recent.locator('a[aria-label^="Recent title "]')).toHaveCount(
    19
  );
  expect(requestedMedia?.searchParams.get('mediaType')).toBe('movie,tv');
  expect(detailRequests).toBe(0);
  expect(fixture.errors).toEqual([]);
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
  const themeControls = page.getByRole('group', {
    name: 'Theme',
    exact: true,
  });
  const darkTheme = themeControls.getByRole('button', {
    name: 'Dark',
    exact: true,
  });
  const lightTheme = themeControls.getByRole('button', {
    name: 'Light',
    exact: true,
  });
  if ((await lightTheme.getAttribute('aria-pressed')) === 'true') {
    await darkTheme.click();
    await expect(darkTheme).toHaveAttribute('aria-pressed', 'true');
    await expect
      .poll(() =>
        page.evaluate(
          () => JSON.parse(localStorage.getItem('lumen-prefs:1') || '{}').theme
        )
      )
      .toBe('dark');
  }
  await lightTheme.click();
  await expect(lightTheme).toHaveAttribute('aria-pressed', 'true');
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
  // the saved answers survive a reload (written when the page goes away): drop them
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    for (const k of Object.keys(localStorage))
      if (k.startsWith('lumen-cache:')) localStorage.removeItem(k);
  });
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
  await page.route(
    /\/api\/v1\/discover\/(movies|tv)\/upcoming\?page=/,
    (route) =>
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
  const movies = page
    .getByRole('alert')
    .filter({ hasText: 'Couldn’t load upcoming movies' });
  const series = page
    .getByRole('alert')
    .filter({ hasText: 'Couldn’t load upcoming series' });
  await expect(movies).toBeVisible();
  await expect(series).toBeVisible();
  await expect(page.getByText('Loading upcoming titles…')).toHaveCount(0);
  fail = false;
  await movies.getByRole('button', { name: 'Retry' }).click();
  await series.getByRole('button', { name: 'Retry' }).click();
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

test('movie posters distinguish or hide shared copies without offering duplicate requests', async ({
  page,
}) => {
  await fixtures(page);
  await page.clock.install();
  let mode = 'distinguish';
  await page.route('**/api/v1/settings/public', (route) =>
    route.fulfill({ json: { otherUsersAvailability: mode } })
  );
  await page.route(/\/api\/v1\/discover\/movies(?:\?|$)/, (route) =>
    route.fulfill({
      json: {
        totalPages: 1,
        results: [
          {
            id: 90,
            title: 'Shared Movie',
            mediaType: 'movie',
            mediaInfo: {
              status: 5,
              viewerRequestCoverage: { standard: false },
              mediaUrl: 'https://plex.example.test/shared',
            },
          },
          {
            id: 91,
            title: 'Viewer Movie',
            mediaType: 'movie',
            mediaInfo: {
              status: 5,
              viewerRequestCoverage: { standard: true },
            },
          },
        ],
      },
    })
  );
  await page.goto('/movies');
  const poster = page.locator('.poster').filter({
    has: page.getByRole('link', { name: 'Shared Movie', exact: true }),
  });
  const own = page.locator('.poster').filter({
    has: page.getByRole('link', { name: 'Viewer Movie', exact: true }),
  });
  await expect(poster.getByTitle('Available to Other Users')).toBeVisible();
  await expect(
    poster.locator('a[href*="plex.example.test/shared"]')
  ).toHaveCount(0);
  await expect(poster.getByRole('button', { name: /request/i })).toHaveCount(0);
  await expect(own.locator('.glyph.ok')).toBeVisible();

  mode = 'hide';
  await page.clock.fastForward(16_000);
  await page.reload();
  await expect(own.locator('.glyph.ok')).toBeVisible();
  await expect(poster.locator('.glyph')).toHaveCount(0);
  await expect(
    poster.getByRole('link', { name: 'Shared Movie', exact: true })
  ).toHaveAttribute('href', '/movie/90');
  await expect(poster.getByRole('button', { name: /request/i })).toHaveCount(0);
});

test('movie details keep shared HD and viewer 4K availability separate', async ({
  page,
}) => {
  await fixtures(page);
  await page.clock.install();
  let mode = 'distinguish';
  let own4k = false;
  await page.route('**/api/v1/settings/public', (route) =>
    route.fulfill({
      json: { otherUsersAvailability: mode, movie4kEnabled: true },
    })
  );
  await page.route('**/api/v1/movie/101', (route) =>
    route.fulfill({
      json: {
        ...movie,
        mediaInfo: {
          ...available,
          status4k: 5,
          mediaUrl: 'https://plex.example.test/shared-hd',
          iOSPlexUrl: undefined,
          mediaUrl4k: 'https://plex.example.test/viewer-4k',
          viewerRequestCoverage: { standard: false, fourK: own4k },
        },
      },
    })
  );
  await page.goto('/movie/101');
  const status = page.locator('.dstatus');
  await expect(status.getByText('4K · Available to Other Users')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Watch on Plex' })).toHaveCount(
    0
  );
  await expect(
    page.getByRole('button', { name: 'Request', exact: true })
  ).toHaveCount(0);

  mode = 'hide';
  own4k = true;
  await page.clock.fastForward(181_000);
  await page.reload();
  await expect(status.getByText('4K on Plex', { exact: true })).toBeVisible();
  await expect(page.getByText('4K · Available to Other Users')).toHaveCount(0);
  await expect(page.locator('a[href*="shared-hd"]')).toHaveCount(0);
  await expect(
    page.getByRole('link', { name: 'Watch on Plex' }).first()
  ).toHaveAttribute('href', 'https://plex.example.test/viewer-4k');
  await expect(
    page.getByRole('button', { name: 'Request', exact: true })
  ).toHaveCount(0);
});

test('series details hide or mark shared seasons without reopening requests', async ({
  page,
}) => {
  await fixtures(page);
  await page.clock.install();
  let mode = 'distinguish';
  await page.route('**/api/v1/settings/public', (route) =>
    route.fulfill({
      json: { otherUsersAvailability: mode, trackEpisodeAvailability: true },
    })
  );
  await page.route('**/api/v1/tv/202', (route) =>
    route.fulfill({
      json: {
        ...movie,
        id: 202,
        name: 'The Test Series',
        firstAirDate: '2020-01-01',
        seasons: [1, 2, 3].map((seasonNumber) => ({
          id: seasonNumber,
          seasonNumber,
          episodeCount: 2,
          name: `Season ${seasonNumber}`,
        })),
        mediaInfo: {
          ...available,
          seasons: [
            { seasonNumber: 1, status: 5 },
            { seasonNumber: 2, status: 5 },
          ],
          viewerRequestCoverage: {
            standard: false,
            seasons: [
              { seasonNumber: 1, standard: true, fourK: false },
              { seasonNumber: 2, standard: false, fourK: true },
            ],
          },
        },
      },
    })
  );
  await page.route('**/api/v1/tv/202/season/*', (route) =>
    route.fulfill({
      json: {
        episodes: [
          {
            episodeNumber: 1,
            name: 'Fixture Episode',
            availabilitySources: [
              { sourceType: 'plex', hd: true, fourK: true },
              { sourceType: 'sonarr', hd: true, fourK: false },
            ],
          },
        ],
      },
    })
  );
  await page.goto('/tv/202');
  const shared = page.getByRole('checkbox', { name: /Season 2/ });
  const owned = page.getByRole('checkbox', { name: /Season 1/ });
  const missing = page.getByRole('checkbox', { name: /Season 3/ });
  await expect(shared.getByText('Available to Other Users')).toBeVisible();
  await expect(shared).toBeDisabled();
  await expect(owned.getByText('On Plex', { exact: true })).toBeVisible();
  await expect(missing).toBeEnabled();
  await expect(page.getByRole('link', { name: 'Watch on Plex' })).toHaveCount(
    0
  );
  const panel = page.getByText('Episode Availability', { exact: true });
  await panel.click();
  await page.getByLabel('Availability Season').selectOption('2');
  await expect(
    page.getByText('Plex 4K · Shared HD', { exact: true })
  ).toBeVisible();
  mode = 'hide';
  await page.clock.fastForward(181_000);
  await page.reload();
  await expect(owned.getByText('On Plex', { exact: true })).toBeVisible();
  await expect(shared.getByText('Available to Other Users')).toHaveCount(0);
  await expect(shared).toBeDisabled();
  await expect(missing).toBeEnabled();
  await panel.click();
  await page.getByLabel('Availability Season').selectOption('2');
  await expect(page.getByText('Plex 4K', { exact: true })).toBeVisible();
  await expect(page.getByText(/Shared HD|Plex HD|Sonarr HD/)).toHaveCount(0);
});

test('featured video cards distinguish and hide shared availability', async ({
  page,
}) => {
  await fixtures(page);
  await page.clock.install();
  let mode = 'distinguish';
  await page.route('**/api/v1/settings/public', (route) =>
    route.fulfill({ json: { otherUsersAvailability: mode } })
  );
  await page.route('**/api/v1/discover/trending', (route) =>
    route.fulfill({
      json: {
        totalPages: 1,
        results: [
          {
            id: 90,
            title: 'Shared Feature',
            mediaType: 'movie',
            backdropPath: '/qa-backdrop.png',
            mediaInfo: {
              status: 5,
              viewerRequestCoverage: { standard: false },
              mediaUrl: 'https://plex.example.test/shared',
            },
          },
        ],
      },
    })
  );
  await page.goto('/');
  const feature = page.locator('.feat').filter({
    has: page.getByRole('heading', { name: 'Shared Feature' }),
  });
  await expect(feature.getByText('Available to Other Users')).toBeVisible();
  await expect(feature.getByRole('link', { name: 'Watch' })).toHaveCount(0);
  await expect(feature.getByRole('button', { name: /request/i })).toHaveCount(
    0
  );
  mode = 'hide';
  await page.clock.fastForward(16_000);
  await page.reload();
  await expect(
    feature.getByRole('link', { name: 'Shared Feature' })
  ).toHaveAttribute('href', '/movie/90');
  await expect(feature.getByText('Available to Other Users')).toHaveCount(0);
  await expect(feature.getByRole('link', { name: 'Watch' })).toHaveCount(0);
  await expect(feature.getByRole('button', { name: /request/i })).toHaveCount(
    0
  );
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
  // the app reads the settings once when it opens and reuses that answer; a day later the saved
  // copy has expired, so opening Music asks again, and that read fails
  await page.clock.install();
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Discover' })).toBeVisible();
  await page.clock.fastForward(25 * 60 * 60 * 1000);
  await page.evaluate(() => {
    history.pushState({}, '', '/music');
    dispatchEvent(new PopStateEvent('popstate'));
  });
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

test('card title preferences save only changed categories and apply to posters', async ({
  page,
}) => {
  await fixtures(page);
  const settings: { movie?: string } = {};
  const writes: unknown[] = [];
  let reject = false;
  await page.route('**/api/v1/auth/me', (route) =>
    route.fulfill({
      json: {
        id: 1,
        displayName: 'Viewer',
        permissions: 2,
        settings: { cardTextVisibilityMovie: settings.movie },
      },
    })
  );
  await page.route('**/api/v1/user/1/settings/card-text', (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      writes.push(body);
      if (reject) return route.fulfill({ status: 503, json: {} });
      Object.assign(settings, body);
    }
    return route.fulfill({ json: settings });
  });

  await page.goto('/movies');
  const artLink = page.getByRole('link', {
    name: 'The Test Film',
    exact: true,
  });
  const card = page.locator('.poster').filter({ has: artLink });
  const title = card.locator('.t');
  await expect(title).toHaveText('The Test Film');
  const hoverCapable = await page.evaluate(
    () => matchMedia('(hover: hover) and (pointer: fine)').matches
  );
  if (hoverCapable) {
    await expect(title).toBeHidden();
    await artLink.focus();
    await expect(title).toBeVisible();
  } else {
    await expect(title).toBeVisible();
  }

  await page.goto('/me/account');
  const movieSetting = page.getByRole('combobox', {
    name: 'Movies',
    exact: true,
  });
  await expect(movieSetting).toHaveValue('hover');
  await expect(
    page.getByRole('combobox', { name: 'Books', exact: true })
  ).toHaveValue('always');
  await movieSetting.selectOption('always');
  await page.getByRole('button', { name: 'Save Card Titles' }).click();
  await expect(page.getByText('Card title settings saved.')).toBeVisible();
  expect(writes).toEqual([{ movie: 'always' }]);

  await page.goto('/movies');
  await expect(title).toBeVisible();
  const toggle = page.getByRole('button', {
    name: 'Title View: Always show poster titles',
  });
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  reject = true;
  await toggle.click();
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: 'Could not save card title settings' })
  ).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  reject = false;
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  expect(writes).toEqual([
    { movie: 'always' },
    { movie: 'hover' },
    { movie: 'hover' },
  ]);
  if (hoverCapable) await expect(title).toBeHidden();
  else await expect(title).toBeVisible();
});

test('video credits remember scoped pins and leave failed saves retryable', async ({
  page,
}) => {
  await fixtures(page);
  const cast = [
    { id: 10, name: 'Fixture Actor', character: 'Lead' },
    ...Array.from({ length: 10 }, (_, index) => ({
      id: 30 + index,
      name: `Supporting Actor ${index + 1}`,
      character: 'Pilot',
    })),
  ];
  const crew = [{ id: 11, name: 'Fixture Director', job: 'Director' }];
  const settings = {
    detailDisclosureCastPinned: true,
    detailDisclosurePins: {
      movie: { cast: false },
      tv: { cast: false },
    },
  };
  const writes: unknown[] = [];
  let reject = true;
  await page.route('**/api/v1/auth/me', (route) =>
    route.fulfill({
      json: { id: 1, displayName: 'Viewer', permissions: 2, settings },
    })
  );
  await page.route('**/api/v1/movie/101', (route) =>
    route.fulfill({ json: { ...movie, credits: { cast, crew } } })
  );
  await page.route('**/api/v1/tv/202', (route) =>
    route.fulfill({
      json: {
        ...movie,
        id: 202,
        title: undefined,
        name: 'Fixture Series',
        mediaType: 'tv',
        seasons: [],
        credits: { cast, crew },
      },
    })
  );
  await page.route(
    '**/api/v1/user/1/settings/detail-disclosures/movie',
    (route) => {
      const body = route.request().postDataJSON();
      writes.push(body);
      if (reject) return route.fulfill({ status: 503, json: {} });
      Object.assign(settings.detailDisclosurePins.movie, body);
      return route.fulfill({ json: settings.detailDisclosurePins.movie });
    }
  );

  await page.route('**/api/v1/person/39', (route) =>
    route.fulfill({ json: { id: 39, name: 'Supporting Actor 10' } })
  );
  await page.route('**/api/v1/person/39/combined_credits', (route) =>
    route.fulfill({ json: { cast: [], crew: [] } })
  );

  await page.goto('/movie/101');
  const actor = page.locator('.person').filter({ hasText: 'Fixture Actor' });
  await expect(actor).toBeHidden();
  await page.getByText('Starring', { exact: true }).click();
  await expect(actor).toBeVisible();
  const pin = page.getByRole('button', { name: 'Keep Starring Open' });
  await pin.click();
  await expect(
    page.getByText('Could not save the credit preference. Try again.')
  ).toBeVisible();
  await expect(pin).toHaveAttribute('aria-pressed', 'false');
  reject = false;
  await pin.click();
  await expect(pin).toHaveAttribute('aria-pressed', 'true');
  expect(writes).toEqual([{ cast: true }, { cast: true }]);
  await page.reload();
  await expect(actor).toBeVisible();
  await page.getByText('Crew', { exact: true }).click();
  await expect(
    page.locator('.person').filter({ hasText: 'Fixture Director' })
  ).toBeVisible();

  const lastCredit = page.getByRole('link', {
    name: 'Supporting Actor 10 Pilot',
  });
  await expect(lastCredit).toHaveCount(0);
  await page.getByRole('button', { name: 'Show All 11 Credits' }).click();
  await expect(lastCredit).toBeVisible();
  await page.getByRole('button', { name: 'Show Fewer Credits' }).click();
  await expect(lastCredit).toHaveCount(0);
  await page.getByRole('button', { name: 'Show All 11 Credits' }).click();
  await lastCredit.click();
  await expect(page).toHaveURL(/\/person\/39$/);
  await expect(
    page.getByRole('heading', { name: 'Supporting Actor 10' })
  ).toBeVisible();

  await page.goto('/tv/202');
  await expect(page.getByText('Starring', { exact: true })).toBeVisible();
  await expect(actor).toBeHidden();

  for (const path of ['/movie/101#crew', '/tv/202#crew', '/tv/202#cast']) {
    await page.goto(path);
    const credit = path.endsWith('#cast') ? 'Starring' : 'Crew';
    const summary = page.locator('summary').getByText(credit, { exact: true });
    const person = page.getByRole('link', {
      name:
        credit === 'Crew' ? 'Fixture Director Director' : 'Fixture Actor Lead',
    });
    await expect(summary).toBeInViewport();
    await expect(person).toBeVisible();
    await expect(
      page.getByRole('button', { name: `Keep ${credit} Open` })
    ).toHaveAttribute('aria-pressed', 'false');
    await summary.click();
    await expect(person).toBeHidden();
  }
  expect(writes).toHaveLength(2);
});

test('subject tags share browser visibility and open filtered video discovery', async ({
  page,
}) => {
  await fixtures(page);
  const keywords = [{ id: 73, name: 'Space travel' }];
  await page.route('**/api/v1/auth/me', (route) =>
    route.fulfill({
      json: {
        id: 1,
        displayName: 'Viewer',
        permissions: 2,
        settings: {
          detailDisclosureSubjectTagsPinned: true,
          detailDisclosurePins: { tv: { subjectTags: true } },
        },
      },
    })
  );
  await page.route('**/api/v1/movie/101', (route) =>
    route.fulfill({ json: { ...movie, keywords } })
  );
  await page.route('**/api/v1/tv/202', (route) =>
    route.fulfill({
      json: {
        ...movie,
        id: 202,
        mediaType: 'tv',
        name: 'Fixture Series',
        seasons: [],
        keywords,
      },
    })
  );
  await page.goto('/movie/101');
  const tag = page.getByRole('link', { name: 'Space travel' });
  const toggle = page.getByRole('button', { name: 'Show Subject Tags' });
  await expect(tag).toBeVisible();
  await toggle.click();
  await expect(tag).toBeHidden();
  await page.goto('/tv/202');
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await toggle.click();
  const filtered = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return (
      url.pathname.endsWith('/discover/tv') &&
      url.searchParams.get('keywords') === '73'
    );
  });
  await tag.click();
  await filtered;
  await expect(page).toHaveURL(/\/series\?keywords=73$/);
  const clear = page.getByRole('button', { name: 'Clear Subject Tag' });
  await clear.click();
  await expect(page).toHaveURL(/\/series$/);
});

test('person filmography keeps complete cast and crew groups and sorts before filtering', async ({
  page,
}) => {
  await fixtures(page);
  const cast = Array.from({ length: 26 }, (_, index) => ({
    id: 900 + index,
    title: `Film ${index + 1}`,
    mediaType: 'movie',
    voteCount: index + 1,
    character: 'Pilot',
  }));
  await page.route('**/api/v1/person/39', (route) =>
    route.fulfill({
      json: { id: 39, name: 'Fixture Person', knownForDepartment: 'Acting' },
    })
  );
  await page.route('**/api/v1/person/39/combined_credits', (route) =>
    route.fulfill({
      json: {
        cast: [
          ...cast,
          { ...cast[0], character: 'Captain' },
          { id: 900, name: 'Fixture Series', mediaType: 'tv' },
        ],
        crew: [{ ...cast[0], job: 'Director' }],
      },
    })
  );
  await page.goto('/person/39');
  const castSection = page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'Cast', exact: true }) })
    .filter({
      hasNot: page.getByRole('heading', { name: 'Credits', exact: true }),
    });
  await expect(castSection.locator('.poster')).toHaveCount(27);
  await expect(castSection.locator('a.hit').first()).toHaveAccessibleName(
    'Film 26'
  );
  await expect(castSection.locator('a.hit').last()).toHaveAccessibleName(
    'Fixture Series'
  );
  await expect(castSection.getByText('Pilot · Captain')).toBeVisible();
  await expect(page.getByText('Director', { exact: true })).toBeVisible();
  await page.getByLabel('Sort Credits').selectOption('title.asc');
  await expect(castSection.locator('a.hit').nth(1)).toHaveAccessibleName(
    'Film 2'
  );
  await page.getByLabel('Media Type').selectOption('tv');
  await expect(castSection.locator('a.hit')).toHaveCount(1);
  await expect(castSection.locator('a.hit')).toHaveAttribute('href', '/tv/900');
  await expect(
    page.getByRole('heading', { name: 'Crew', exact: true })
  ).toHaveCount(0);
});

test('person bulk requests confirm the exact unique movie list and stop on quota', async ({
  page,
}) => {
  await fixtures(page);
  const movies = Array.from({ length: 205 }, (_, index) => ({
    id: index + 200,
    title: `Film ${index + 1}`,
    mediaType: 'movie',
  }));
  const writes: number[][] = [];
  await page.route('**/api/v1/settings/public', (route) =>
    route.fulfill({
      json: {
        applicationTitle: 'SeerrNG',
        personMovieBulkRequestsEnabled: true,
      },
    })
  );
  await page.route('**/api/v1/person/39', (route) =>
    route.fulfill({ json: { id: 39, name: 'Fixture Person' } })
  );
  await page.route('**/api/v1/person/39/combined_credits', (route) =>
    route.fulfill({
      json: { cast: movies, crew: [movies[0], { id: 9999, mediaType: 'tv' }] },
    })
  );
  await page.route('**/api/v1/request/person-movies', (route) => {
    const { movieIds } = route.request().postDataJSON();
    writes.push(movieIds);
    return route.fulfill({
      json:
        writes.length === 1
          ? {
              created: movieIds.slice(0, 99),
              skipped: [{ movieId: movieIds[99] }],
              failed: [],
            }
          : {
              created: [],
              skipped: [],
              failed: movieIds.map((movieId: number) => ({ movieId })),
              stoppedReason: 'Quota exhausted',
            },
    });
  });

  await page.goto('/person/39');
  const open = page.getByRole('button', { name: 'Request All Movies' });
  await open.click();
  await expect(page.getByRole('alertdialog')).toContainText(
    '205 credited movies'
  );
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(writes).toHaveLength(0);
  await open.click();
  await page.getByRole('button', { name: 'Request All', exact: true }).click();
  await expect(
    page.locator('header .note').filter({
      hasText: '99 submitted · 1 skipped · 100 failed · 5 not submitted',
    })
  ).toBeVisible();
  expect(writes).toEqual([
    movies.slice(0, 100).map(({ id }) => id),
    movies.slice(100, 200).map(({ id }) => id),
  ]);
});

test('instance request settings save only changed policy flags and retain failed edits', async ({
  page,
}) => {
  await fixtures(page);
  let enabled = false;
  let enable4k = true;
  let admin = true;
  let reject = true;
  const writes: unknown[] = [];
  await page.route('**/api/v1/auth/me', (route) =>
    route.fulfill({
      json: { id: 1, displayName: 'Viewer', permissions: admin ? 2 : 32 },
    })
  );
  await page.route('**/api/v1/settings/public', (route) =>
    route.fulfill({
      json: {
        applicationTitle: 'SeerrNG',
        personMovieBulkRequestsEnabled: enabled,
        enable4k,
      },
    })
  );
  await page.route('**/api/v1/settings/main', (route) => {
    const body = route.request().postDataJSON();
    writes.push(body);
    if (reject) return route.fulfill({ status: 503, json: {} });
    enabled = body.personMovieBulkRequestsEnabled ?? enabled;
    enable4k = body.enable4k ?? enable4k;
    return route.fulfill({
      json: { personMovieBulkRequestsEnabled: enabled, enable4k },
    });
  });
  await page.goto('/me/lumen');
  const flag = page.getByRole('checkbox', {
    name: 'Bulk Movie Requests From Person Pages',
  });
  const save = page.getByRole('button', {
    name: 'Save Instance Request Settings',
  });
  await expect(flag).toBeVisible();
  await expect(flag).not.toBeChecked();
  await flag.check();
  await save.click();
  await expect(
    page.getByText('Could not save the instance request setting. Try again.')
  ).toBeVisible();
  await expect(flag).toBeChecked();
  reject = false;
  await save.click();
  await expect(
    page.getByText('Instance request settings saved.')
  ).toBeVisible();
  await expect(save).toBeDisabled();
  await flag.uncheck();
  await page
    .getByRole('checkbox', { name: 'Enable 4K', exact: true })
    .uncheck();
  await save.click();
  await expect(
    page.getByText('Instance request settings saved.')
  ).toBeVisible();
  expect(writes).toEqual([
    { personMovieBulkRequestsEnabled: true },
    { personMovieBulkRequestsEnabled: true },
    { personMovieBulkRequestsEnabled: false, enable4k: false },
  ]);
  admin = false;
  await page.reload();
  await expect(page.getByText('Admins only', { exact: true })).toBeVisible();
  await expect(flag).toHaveCount(0);
});

test('series specials follow the instance request policy', async ({ page }) => {
  await fixtures(page);
  let specials = false;
  await page.route('**/api/v1/settings/public', (route) =>
    route.fulfill({
      json: {
        applicationTitle: 'SeerrNG',
        enableSpecialEpisodes: specials,
        partialRequestsEnabled: true,
      },
    })
  );
  await page.route('**/api/v1/tv/202', (route) =>
    route.fulfill({
      json: {
        ...movie,
        id: 202,
        name: 'Fixture Series',
        mediaType: 'tv',
        seasons: [
          { id: 20, seasonNumber: 0, episodeCount: 1 },
          { id: 21, seasonNumber: 1, episodeCount: 2 },
        ],
      },
    })
  );
  await page.route('**/api/v1/settings/main', (route) => {
    const body = route.request().postDataJSON();
    expect(body).toEqual({ enableSpecialEpisodes: true });
    specials = true;
    return route.fulfill({ json: { enableSpecialEpisodes: specials } });
  });
  await page.goto('/tv/202');
  await expect(page.getByText('Season 1', { exact: true })).toBeVisible();
  await expect(page.getByText('Specials', { exact: true })).toHaveCount(0);
  await page.goto('/me/lumen');
  await page
    .getByRole('checkbox', { name: 'Allow Special Episode Requests' })
    .check();
  await page
    .getByRole('button', { name: 'Save Instance Request Settings' })
    .click();
  await expect(
    page.getByText('Instance request settings saved.')
  ).toBeVisible();
  await page.goto('/tv/202');
  await expect(page.getByText('Specials', { exact: true })).toBeVisible();
});

test('episode availability loads on demand and switches source results with the season', async ({
  page,
}) => {
  await fixtures(page);
  const reads: number[] = [];
  await page.route('**/api/v1/settings/public', (route) =>
    route.fulfill({
      json: { applicationTitle: 'SeerrNG', trackEpisodeAvailability: true },
    })
  );
  await page.route('**/api/v1/tv/202', (route) =>
    route.fulfill({
      json: {
        ...movie,
        id: 202,
        mediaType: 'tv',
        name: 'Fixture Series',
        seasons: [
          { id: 21, seasonNumber: 1, episodeCount: 2 },
          { id: 22, seasonNumber: 2, episodeCount: 1 },
        ],
      },
    })
  );
  await page.route('**/api/v1/tv/202/season/*', (route) => {
    const season = Number(
      new URL(route.request().url()).pathname.split('/').at(-1)
    );
    reads.push(season);
    return route.fulfill({
      json: {
        episodes:
          season === 1
            ? [
                {
                  episodeNumber: 1,
                  name: 'Pilot',
                  availabilitySources: [
                    { sourceType: 'plex', hd: true, fourK: false },
                  ],
                },
                { episodeNumber: 2, name: 'Second' },
              ]
            : [
                {
                  episodeNumber: 1,
                  name: 'Return',
                  sonarrAvailability: { hd: false, fourK: true },
                },
              ],
      },
    });
  });
  await page.goto('/tv/202');
  const summary = page.getByText('Episode Availability', { exact: true });
  await expect(summary).toBeVisible();
  expect(reads).toEqual([]);
  await summary.click();
  await expect(page.getByText('Plex HD', { exact: true })).toBeVisible();
  await expect(
    page.getByText('No file reported', { exact: true })
  ).toBeVisible();
  await page.getByLabel('Availability Season').selectOption('2');
  await expect(page.getByText('Sonarr 4K', { exact: true })).toBeVisible();
  await expect(page.getByText('Plex HD', { exact: true })).toHaveCount(0);
  expect(reads).toEqual([1, 2]);
});

test('series watch rule keeps the rejected selection and links playback accounts', async ({
  page,
}) => {
  await fixtures(page);
  await page.route('**/api/v1/auth/me', (route) =>
    route.fulfill({
      json: {
        id: 2,
        displayName: 'Viewer',
        permissions: 32,
        tvSeasonWatchGateStatus: 'enabled',
      },
    })
  );
  await page.route('**/api/v1/tv/202', (route) =>
    route.fulfill({
      json: {
        ...movie,
        id: 202,
        name: 'Fixture Series',
        mediaType: 'tv',
        seasons: [
          { id: 21, seasonNumber: 1, episodeCount: 2 },
          { id: 22, seasonNumber: 2, episodeCount: 2 },
        ],
      },
    })
  );
  let body: unknown;
  await page.route('**/api/v1/request', (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    body = route.request().postDataJSON();
    return route.fulfill({
      status: 403,
      json: {
        code: 'TV_SEASON_WATCH_GATE',
        reason: 'account-required',
        message: 'Link your playback account before requesting a later season.',
      },
    });
  });
  await page.goto('/tv/202');
  await expect(
    page.getByText('Later seasons may require', { exact: false })
  ).toBeVisible();
  const first = page.getByRole('checkbox', { name: /Season 1/ });
  const second = page.getByRole('checkbox', { name: /Season 2/ });
  await expect(second).toBeVisible();
  if ((await first.getAttribute('aria-checked')) === 'true')
    await first.click();
  if ((await second.getAttribute('aria-checked')) === 'false')
    await second.click();
  await page
    .getByRole('button', { name: 'Request 1 season', exact: true })
    .filter({ visible: true })
    .first()
    .click();
  const alert = page.getByRole('alert').filter({
    hasText: 'Link your playback account before requesting a later season.',
  });
  await expect(alert).toBeVisible();
  await expect(
    alert.getByRole('link', { name: 'Link Playback Account' })
  ).toHaveAttribute('href', '/me/account/linked-accounts');
  await expect(second).toHaveAttribute('aria-checked', 'true');
  expect(body).toMatchObject({ mediaType: 'tv', mediaId: 202, seasons: [2] });
  await second.click();
  await expect(alert).toHaveCount(0);
});

test('whole-series confirmation reports the seasons SeerrNG accepted', async ({
  page,
}) => {
  await fixtures(page);
  await page.route('**/api/v1/settings/public', (route) =>
    route.fulfill({
      json: {
        applicationTitle: 'SeerrNG',
        partialRequestsEnabled: false,
        tvSeasonWatchGateEnabled: true,
      },
    })
  );
  await page.route('**/api/v1/tv/202', (route) =>
    route.fulfill({
      json: {
        ...movie,
        id: 202,
        name: 'Fixture Series',
        mediaType: 'tv',
        seasons: [
          { id: 21, seasonNumber: 1, episodeCount: 2 },
          { id: 22, seasonNumber: 2, episodeCount: 2 },
        ],
        mediaInfo: { status: 4, seasons: [{ seasonNumber: 1, status: 5 }] },
      },
    })
  );
  let body: unknown;
  await page.route('**/api/v1/request', (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    body = route.request().postDataJSON();
    return route.fulfill({
      status: 201,
      json: { id: 77, seasons: [{ seasonNumber: 2 }] },
    });
  });
  await page.goto('/tv/202');
  await page
    .getByRole('button', { name: 'Request 1 season', exact: true })
    .filter({ visible: true })
    .first()
    .click();
  await expect(
    page.getByText('Requested Fixture Series · Season 2')
  ).toBeVisible();
  expect(body).toMatchObject({ mediaType: 'tv', mediaId: 202, seasons: 'all' });
});

test('quick series requests report accepted seasons', async ({ page }) => {
  await fixtures(page);
  await page.route('**/api/v1/auth/me', (route) =>
    route.fulfill({ json: { id: 3, displayName: 'Viewer', permissions: 32 } })
  );
  await page.route('**/api/v1/discover/tv?*', (route) =>
    route.fulfill({
      json: paged([
        {
          ...movie,
          id: 202,
          title: undefined,
          name: 'Fixture Series',
          mediaType: 'tv',
        },
      ]),
    })
  );
  await page.route('**/api/v1/request', (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    expect(route.request().postDataJSON()).toMatchObject({
      mediaId: 202,
      seasons: 'all',
    });
    return route.fulfill({
      status: 201,
      json: { id: 77, seasons: [{ seasonNumber: 1 }] },
    });
  });
  await page.goto('/series');
  const card = page.locator('.poster', { hasText: 'Fixture Series' }).first();
  await card.hover();
  const overlay = card.getByRole('button', { name: 'Request', exact: true });
  const touch = card.getByRole('button', {
    name: 'Request Fixture Series (entire series)',
  });
  await ((await overlay.isVisible()) ? overlay : touch).click();
  await expect(
    page.getByText('Requested Fixture Series · Season 1')
  ).toBeVisible();
});

for (const use4k of [false, true]) {
  test(`Coming Soon reports accepted seasons ${use4k ? 'through the 4K sheet' : 'from the row action'}`, async ({
    page,
  }) => {
    await fixtures(page);
    await page.route('**/api/v1/auth/me', (route) =>
      route.fulfill({
        json: {
          id: 3,
          displayName: 'Viewer',
          permissions: 32 | (use4k ? 4096 : 0),
        },
      })
    );
    await page.route('**/api/v1/settings/public', (route) =>
      route.fulfill({
        json: { applicationTitle: 'SeerrNG', series4kEnabled: use4k },
      })
    );
    await page.route('**/api/v1/discover/tv/upcoming?page=*', (route) =>
      route.fulfill({
        json: paged([
          {
            ...movie,
            id: 202,
            title: undefined,
            name: 'Upcoming Fixture',
            mediaType: 'tv',
            firstAirDate: '2099-01-01',
          },
        ]),
      })
    );
    const writes: unknown[] = [];
    await page.route('**/api/v1/request', (route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      writes.push(route.request().postDataJSON());
      return route.fulfill({
        status: 201,
        json: { id: 77, seasons: [{ seasonNumber: 1 }] },
      });
    });

    await page.goto('/soon');
    await page
      .locator('.si')
      .filter({ hasText: 'Upcoming Fixture' })
      .getByRole('button', { name: 'Request', exact: true })
      .click();
    if (use4k) {
      const sheet = page.getByRole('dialog', {
        name: 'Request Upcoming Fixture',
      });
      await sheet.getByRole('button', { name: '4K', exact: true }).click();
      await sheet.getByRole('button', { name: 'Request in 4K' }).click();
    }
    await expect(
      page.getByText(
        `Requested Upcoming Fixture${use4k ? ' in 4K' : ''} · Season 1`
      )
    ).toBeVisible();
    expect(writes).toEqual([
      {
        mediaType: 'tv',
        mediaId: 202,
        seasons: 'all',
        ...(use4k ? { is4k: true } : {}),
      },
    ]);
  });
}

test('featured series can retry a watch-rule rejection and confirm accepted seasons', async ({
  page,
}) => {
  await fixtures(page);
  await page.route('**/api/v1/auth/me', (route) =>
    route.fulfill({ json: { id: 3, displayName: 'Viewer', permissions: 32 } })
  );
  await page.route('**/api/v1/discover/trending', (route) =>
    route.fulfill({
      json: paged([
        {
          ...movie,
          id: 202,
          title: undefined,
          name: 'Featured Series',
          mediaType: 'tv',
        },
      ]),
    })
  );
  const writes: unknown[] = [];
  await page.route('**/api/v1/request', (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    writes.push(route.request().postDataJSON());
    return writes.length === 1
      ? route.fulfill({
          status: 403,
          json: {
            code: 'TV_SEASON_WATCH_GATE',
            message: 'Finish the previous season first.',
          },
        })
      : route.fulfill({
          status: 201,
          json: { id: 77, seasons: [{ seasonNumber: 2 }] },
        });
  });

  await page.goto('/');
  const card = page.locator('.feat').filter({ hasText: 'Featured Series' });
  const request = card.getByRole('button', {
    name: 'Request series',
    exact: true,
  });
  await request.click();
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: 'Finish the previous season first.' })
  ).toBeVisible();
  await expect(request).toBeEnabled();
  await request.click();
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: 'Requested Featured Series · Season 2' })
  ).toBeVisible();
  await expect(request).toHaveCount(0);
  const expected = { mediaType: 'tv', mediaId: 202, seasons: 'all' };
  expect(writes).toEqual([expected, expected]);
});

test('Coming Soon applies shared availability without reopening requests', async ({
  page,
}) => {
  await fixtures(page);
  await page.clock.install();
  let mode = 'distinguish';
  await page.route('**/api/v1/settings/public', (route) =>
    route.fulfill({ json: { otherUsersAvailability: mode } })
  );
  await page.route('**/api/v1/discover/movies/upcoming?page=*', (route) =>
    route.fulfill({
      json: paged([
        {
          ...movie,
          releaseDate: '2099-01-01',
          mediaInfo: {
            ...available,
            viewerRequestCoverage: { standard: false },
          },
        },
        {
          ...movie,
          id: 102,
          title: 'Unrequested Film',
          releaseDate: '2099-01-02',
        },
      ]),
    })
  );
  await page.goto('/soon?media=movie');
  const row = page
    .locator('.si')
    .filter({ has: page.getByRole('link', { name: movie.title }) });
  await expect(row.getByText('Available to Other Users')).toBeVisible();
  await expect(row.getByRole('button', { name: 'Request' })).toHaveCount(0);
  mode = 'hide';
  await page.clock.fastForward(16_000);
  await page.reload();
  await expect(row.getByRole('link', { name: movie.title })).toBeVisible();
  await expect(row.getByText('Available to Other Users')).toHaveCount(0);
  await expect(row.getByRole('button', { name: 'Request' })).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Request', exact: true })
  ).toBeVisible();
});

test('adult scene details keep the catalog and default request sources distinct', async ({
  page,
}) => {
  await fixtures(page);
  const scene = '12345678-1234-4123-8123-123456789abc';
  const writes: unknown[] = [];
  const reads: string[] = [];
  await page.route('**/api/v1/auth/me', (route) =>
    route.fulfill({
      json: { id: 3, displayName: 'Viewer', permissions: 140737488355328 },
    })
  );
  await page.route('**/api/v1/settings/public', (route) =>
    route.fulfill({
      json: { adultEnabled: true, enabledMediaCategories: { adult: true } },
    })
  );
  await page.route('**/api/v1/service/whisparr', (route) =>
    route.fulfill({
      json: [
        { id: 1, isDefault: true },
        { id: 2, isDefault: false },
      ],
    })
  );
  await page.route(`**/api/v1/adult/${scene}?*`, (route) => {
    const source =
      new URL(route.request().url()).searchParams.get('serverId') ?? '';
    reads.push(source);
    return route.fulfill({
      json: {
        id: scene,
        mediaType: 'adult',
        title: source === '2' ? 'Catalog Scene' : 'Default Scene',
        serviceId: Number(source),
        performers: [],
        mediaInfo: source === '2' ? { status: 5 } : undefined,
      },
    });
  });
  await page.route('**/api/v1/request', (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    writes.push(route.request().postDataJSON());
    return route.fulfill({ json: { id: 4 } });
  });
  await page.goto(`/adult/${scene}?serverId=2`);
  await expect(
    page.getByRole('heading', { name: 'Catalog Scene' })
  ).toBeVisible();
  const actions = page.getByRole('button', { name: 'Request', exact: true });
  await actions.filter({ visible: true }).click();
  await expect
    .poll(() => writes)
    .toEqual([{ mediaType: 'adult', mediaId: scene }]);
  expect(reads.sort()).toEqual(['1', '2']);
});

for (const format of ['audiobook', 'both'] as const) {
  test(`book requests reopen the Bookshelf title for ${format}`, async ({
    page,
  }) => {
    await fixtures(page);
    await page.route('**/api/v1/request?*', (route) =>
      route.fulfill({
        json: {
          pageInfo: { pages: 1, results: 1 },
          results: [
            {
              id: 615,
              type: 'book',
              status: 1,
              bookFormat: format,
              is4k: false,
              seasons: [],
              createdAt: '2026-11-08T12:00:00Z',
              requestedBy: { id: 1, displayName: 'Owner' },
              media: {
                mediaType: 'book',
                status: 1,
                identifiers: [
                  { provider: 'bookshelf', value: 'bookshelf:1:fixture' },
                ],
              },
            },
          ],
        },
      })
    );
    await page.route('**/api/v1/book/bookshelf%3A1%3Afixture', (route) =>
      route.fulfill({
        json: { id: 'bookshelf:1:fixture', title: 'Requested Audiobook' },
      })
    );
    await page.route('**/api/v1/request/status/615', (route) =>
      route.fulfill({
        json: {
          request: {
            id: 615,
            type: 'book',
            status: 1,
            bookFormat: format,
            seasons: [],
            requestedBy: { id: 1, displayName: 'Owner' },
            media: {
              mediaType: 'book',
              status: 1,
              identifiers: [
                { provider: 'bookshelf', value: 'bookshelf:1:fixture' },
              ],
            },
          },
          current: { stage: 'requested', attempt: 1 },
          history: { results: [], total: 0 },
        },
      })
    );
    await page.goto('/requests?tab=active');
    await expect(
      page.getByText(
        format === 'both' ? /^Ebook and Audiobook · / : /^Audiobook · /
      )
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Requested Audiobook', exact: true })
    ).toHaveAttribute(
      'href',
      `/book/bookshelf%3A1%3Afixture?${format === 'audiobook' ? 'f=audio&' : ''}lookupTitle=Requested+Audiobook`
    );
    await page.goto('/requests?requestId=615');
    const history = page.getByRole('dialog', { name: 'Request history' });
    await expect(
      history.getByRole('link', { name: 'Open Title' })
    ).toHaveAttribute(
      'href',
      `/book/bookshelf%3A1%3Afixture?${format === 'audiobook' ? 'f=audio&' : ''}lookupTitle=Requested+Audiobook`
    );
    await expect(
      history.getByText(
        format === 'both' ? 'Ebook and Audiobook' : 'Audiobook',
        { exact: true }
      )
    ).toBeVisible();
  });
}

test('adult request links use the saved Whisparr destination', async ({
  page,
}) => {
  await fixtures(page);
  const scene = '12345678-1234-4123-8123-123456789abc';
  await page.route('**/api/v1/request?*', (route) =>
    route.fulfill({
      json: {
        pageInfo: { pages: 1, results: 1 },
        results: [
          {
            id: 614,
            type: 'adult',
            status: 1,
            serverId: 2,
            is4k: false,
            seasons: [],
            createdAt: '2026-11-08T12:00:00Z',
            requestedBy: { id: 1, displayName: 'Owner' },
            media: {
              mediaType: 'adult',
              status: 1,
              identifiers: [{ provider: 'stashdb', value: scene }],
            },
          },
        ],
      },
    })
  );
  await page.route(`**/api/v1/adult/${scene}?serverId=2`, (route) =>
    route.fulfill({
      json: { id: scene, title: 'Destination Scene', serviceId: 2 },
    })
  );
  await page.goto('/requests?tab=active');
  await expect(
    page.getByRole('link', { name: 'Destination Scene', exact: true })
  ).toHaveAttribute('href', `/adult/${scene}?serverId=2`);
});

test('Sportarr league details show paginated event availability', async ({
  page,
}) => {
  await fixtures(page);
  await page.route('**/api/v1/settings/public', (route) =>
    route.fulfill({
      json: { sportsEnabled: true, enabledMediaCategories: { sports: true } },
    })
  );
  await page.route('**/api/v1/sportarr/lg-000123', (route) =>
    route.fulfill({
      json: {
        id: 'lg-000123',
        title: 'Fixture League',
        mediaType: 'sports',
        libraryState: 'monitored',
        eventsAvailable: true,
      },
    })
  );
  await page.route('**/api/v1/sportarr/lg-000123/events?*', (route) => {
    const requestedPage = Number(
      new URL(route.request().url()).searchParams.get('page')
    );
    const second = requestedPage === 2;
    return route.fulfill({
      json: {
        eventsAvailable: true,
        totalPages: 2,
        totalRecords: 51,
        results:
          requestedPage > 2
            ? []
            : [
                {
                  id: second ? 2 : 1,
                  title: second ? 'Final' : 'Opening Match',
                  monitored: true,
                  hasFile: !second,
                  fileCount: second ? 0 : 3,
                  quality: second ? undefined : 'HDTV',
                },
              ],
      },
    });
  });
  await page.goto('/sportarr/lg-000123');
  await expect(
    page.getByRole('heading', { name: 'Fixture League' })
  ).toBeVisible();
  await expect(page.getByText('Opening Match')).toBeVisible();
  await expect(page.getByText('In Library · 3 files · HDTV')).toBeVisible();
  await expect(page.getByText('51 events', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Next Page' }).click();
  await expect(page.getByText('Final', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Next Page' })).toBeDisabled();
  await expect(page).toHaveURL(/eventPage=2$/);
  await page.reload();
  await expect(page.getByText('Final', { exact: true })).toBeVisible();
  await page.goBack();
  await expect(page.getByText('Opening Match')).toBeVisible();
  await page.goto('/sportarr/lg-000123?eventPage=9');
  await expect(page).toHaveURL(/eventPage=2$/);
  await expect(page.getByText('Final', { exact: true })).toBeVisible();
});

test('Coming Soon restores its media scope and loads only the selected feeds', async ({
  page,
}) => {
  await fixtures(page);
  const reads: string[] = [];
  await page.route('**/api/v1/discover/*/upcoming?page=*', (route) => {
    const series = new URL(route.request().url()).pathname.includes('/tv/');
    reads.push(series ? 'tv' : 'movie');
    return route.fulfill({
      json: paged(
        series
          ? [
              {
                ...movie,
                id: 202,
                title: undefined,
                name: 'Upcoming Fixture Series',
                firstAirDate: '2099-01-01',
              },
            ]
          : [movie]
      ),
    });
  });
  await page.goto('/soon?media=tv');
  const filters = page.getByRole('navigation', { name: 'Upcoming Media' });
  const series = page.getByRole('link', { name: 'Upcoming Fixture Series' });
  const film = page.getByRole('link', { name: 'The Test Film', exact: true });
  await expect(series).toBeVisible();
  await expect(filters.getByRole('link', { name: 'Series' })).toHaveAttribute(
    'aria-current',
    'page'
  );
  expect(reads).toEqual(['tv']);
  await filters.getByRole('link', { name: 'Movies' }).click();
  await expect(page).toHaveURL(/media=movie$/);
  await expect(film).toBeVisible();
  await expect(series).toHaveCount(0);
  expect(reads).toEqual(['tv', 'movie']);
  await page.goBack();
  await expect(series).toBeVisible();
  await expect(film).toHaveCount(0);
  await filters.getByRole('link', { name: 'All', exact: true }).click();
  await expect(film).toBeVisible();
  await expect(series).toBeVisible();
});

test('Coming Soon retries a failed series feed without dropping movies', async ({
  page,
}) => {
  await fixtures(page);
  let seriesReads = 0;
  let movieReads = 0;
  await page.route('**/api/v1/discover/movies/upcoming?page=*', (route) => {
    movieReads++;
    return route.fulfill({ json: paged([movie]) });
  });
  await page.route('**/api/v1/discover/tv/upcoming?page=*', (route) => {
    seriesReads++;
    return seriesReads === 1
      ? route.fulfill({
          status: 503,
          json: { message: 'Series feed unavailable.' },
        })
      : route.fulfill({
          json: paged([
            {
              ...movie,
              id: 202,
              title: undefined,
              name: 'Recovered Series',
              firstAirDate: '2099-01-01',
            },
          ]),
        });
  });

  await page.goto('/soon');
  const title = page.getByRole('link', { name: 'The Test Film', exact: true });
  const alert = page
    .getByRole('alert')
    .filter({ hasText: 'Couldn’t load upcoming series' });
  await expect(title).toBeVisible();
  await expect(alert).toBeVisible();
  await expect(page.getByText('No upcoming titles found.')).toHaveCount(0);
  await alert.getByRole('button', { name: 'Retry' }).click();
  await expect(
    page.getByRole('link', { name: 'Recovered Series' })
  ).toBeVisible();
  await expect(title).toBeVisible();
  await expect(alert).toHaveCount(0);
  expect(movieReads).toBe(1);
});

test('movie genre exclusion survives reload and clears with All genres', async ({
  page,
}) => {
  await fixtures(page);
  await page.route('**/api/v1/genres/movie', (route) =>
    route.fulfill({ json: [{ id: 18, name: 'Drama' }] })
  );
  await page.goto('/movies?genre=18');
  await page.getByRole('button', { name: 'Genres: Drama' }).click();
  const exclude = page.getByRole('button', { name: 'Exclude Selected Genres' });
  const query = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return (
      url.pathname.endsWith('/discover/movies') &&
      url.searchParams.get('excludeGenre') === 'true' &&
      url.searchParams.get('genre') === '18'
    );
  });
  await exclude.click();
  await query;
  await page.reload();
  await page.getByRole('button', { name: 'Genres: Exclude Drama' }).click();
  await expect(exclude).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'All genres', exact: true }).click();
  await expect(exclude).toBeDisabled();
  await expect(page).toHaveURL(/\/movies$/);
});

test('series discovery applies and clears decimal rating bounds', async ({
  page,
}) => {
  await fixtures(page);
  await page.goto('/series?genre=18&excludeGenre=true');
  await page.getByLabel('Minimum Rating').fill('8.7');
  await page.getByLabel('Maximum Rating').fill('7.1');
  const apply = page.getByRole('button', { name: 'Apply Rating' });
  await expect(apply).toBeDisabled();
  await page.getByLabel('Minimum Rating').fill('6.2');
  const filtered = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return (
      url.pathname.endsWith('/discover/tv') &&
      url.searchParams.get('voteAverageGte') === '6.2' &&
      url.searchParams.get('voteAverageLte') === '7.1' &&
      url.searchParams.get('excludeGenre') === 'true'
    );
  });
  await apply.click();
  await filtered;
  await page.reload();
  await expect(page.getByLabel('Minimum Rating')).toHaveValue('6.2');
  await page.getByRole('button', { name: 'Clear Rating' }).click();
  await expect(page).toHaveURL(/\/series\?genre=18&excludeGenre=true$/);
});

test('series streaming exclusion sends the selected providers and region', async ({
  page,
}) => {
  await fixtures(page);
  await page.route('**/api/v1/user/*/settings/main', (route) =>
    route.fulfill({ json: { streamingRegion: 'GB' } })
  );
  await page.route('**/api/v1/watchproviders/tv?watchRegion=CA', (route) =>
    route.fulfill({
      json: [
        { id: 8, name: 'Fixture Stream' },
        { id: 9, name: 'Second Stream' },
      ],
    })
  );
  await page.goto('/series?genre=18');
  await page
    .getByRole('button', { name: 'Streaming Services', exact: true })
    .click();
  await expect(page.getByLabel('Streaming Region')).toHaveValue('GB');
  await page.getByLabel('Streaming Region').fill('ca');
  await page
    .getByLabel('Streaming Services', { exact: true })
    .selectOption(['8', '9']);
  await page.getByLabel('Provider Match').selectOption('exclude');
  const query = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return (
      url.pathname.endsWith('/discover/tv') &&
      url.searchParams.get('watchProviders') === '8|9' &&
      url.searchParams.get('watchRegion') === 'CA' &&
      url.searchParams.get('watchProviderMode') === 'exclude'
    );
  });
  await page.getByRole('button', { name: 'Apply Streaming Filter' }).click();
  await query;
  await page.reload();
  await page.getByRole('button', { name: 'Streaming Services (2)' }).click();
  await expect(page.getByLabel('Streaming Region')).toHaveValue('CA');
  await expect(page.getByLabel('Provider Match')).toHaveValue('exclude');
  await page.getByRole('button', { name: 'Clear Streaming Filter' }).click();
  await expect(page).toHaveURL(/\/series\?genre=18$/);
});

test('shared discovery links retain multiple included and excluded subject tags', async ({
  page,
}) => {
  await fixtures(page);
  const filtered = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return (
      url.pathname.endsWith('/discover/movies') &&
      url.searchParams.get('keywords') === '73,84' &&
      url.searchParams.get('excludeKeywords') === '99'
    );
  });
  await page.goto('/movies?keywords=73,84,73&excludeKeywords=99&genre=18');
  await filtered;
  await page.getByRole('button', { name: 'Clear Subject Tag' }).click();
  await expect(page).toHaveURL(/\/movies\?genre=18$/);
});

test('discovery searches for subject tags and moves a tag between include and exclude', async ({
  page,
}) => {
  await fixtures(page);
  await page.route('**/api/v1/search/keyword?query=space', (route) =>
    route.fulfill({
      json: { results: [{ id: 73, name: 'Space travel' }], total_pages: 2 },
    })
  );
  await page.route('**/api/v1/search/keyword?query=space&page=2', (route) =>
    route.fulfill({
      json: { results: [{ id: 84, name: 'Space station' }], total_pages: 2 },
    })
  );
  await page.goto('/movies?genre=18');
  await page.getByRole('button', { name: 'Subject Tags', exact: true }).click();
  await page.getByLabel('Find Subject Tags').fill('space');
  await page.getByRole('button', { name: 'Find Tags' }).click();
  const tag = page.getByRole('button', { name: 'Space travel', exact: true });
  await tag.click();
  await expect(page).toHaveURL(/keywords=73/);
  await expect(tag).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Next Tag Page' }).click();
  await expect(
    page.getByRole('button', { name: 'Space station' })
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Remove included Space travel' })
  ).toBeVisible();
  await page.getByRole('button', { name: 'Previous Tag Page' }).click();
  await expect(tag).toHaveAttribute('aria-pressed', 'true');
  await page.getByLabel('Tag Match').selectOption('exclude');
  await tag.click();
  await expect(page).toHaveURL(/\/movies\?genre=18&excludeKeywords=73$/);
  await page
    .getByRole('button', { name: 'Remove excluded Space travel' })
    .click();
  await expect(page).toHaveURL(/\/movies\?genre=18$/);
});

test('series status can be excluded and cleared without removing genre filters', async ({
  page,
}) => {
  await fixtures(page);
  await page.goto('/series?genre=18');
  const status = page.getByLabel('Series Status', { exact: true });
  await expect(status).toBeVisible();
  const exclude = page.getByRole('button', { name: 'Exclude Status' });
  await expect(exclude).toBeDisabled();
  await status.selectOption('0');
  const query = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return (
      url.pathname.endsWith('/discover/tv') &&
      url.searchParams.get('status') === '0' &&
      url.searchParams.get('excludeStatus') === 'true' &&
      url.searchParams.get('genre') === '18'
    );
  });
  await exclude.click();
  await query;
  await page.reload();
  await expect(exclude).toHaveAttribute('aria-pressed', 'true');
  await status.selectOption('');
  await expect(page).toHaveURL(/\/series\?genre=18$/);
});

test('series release dates use first-air bounds and clear independently', async ({
  page,
}) => {
  await fixtures(page);
  await page.goto('/series?genre=18');
  await page.getByLabel('Released On or After').fill('2024-01-01');
  await page.getByLabel('Released On or Before').fill('2023-12-31');
  const apply = page.getByRole('button', { name: 'Apply Release Dates' });
  await expect(apply).toBeDisabled();
  await page.getByLabel('Released On or Before').fill('2024-12-31');
  const query = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return (
      url.pathname.endsWith('/discover/tv') &&
      url.searchParams.get('firstAirDateGte') === '2024-01-01' &&
      url.searchParams.get('firstAirDateLte') === '2024-12-31'
    );
  });
  await apply.click();
  await query;
  await page.reload();
  await expect(page.getByLabel('Released On or After')).toHaveValue(
    '2024-01-01'
  );
  await page.getByRole('button', { name: 'Clear Release Dates' }).click();
  await expect(page).toHaveURL(/\/series\?genre=18$/);
});

test('movie runtime filters use minute bounds and clear independently', async ({
  page,
}) => {
  await fixtures(page);
  await page.goto('/movies?genre=18');
  await page.getByLabel('Minimum Runtime (Minutes)').fill('90');
  await page.getByLabel('Maximum Runtime (Minutes)').fill('120');
  const query = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return (
      url.pathname.endsWith('/discover/movies') &&
      url.searchParams.get('withRuntimeGte') === '90' &&
      url.searchParams.get('withRuntimeLte') === '120' &&
      url.searchParams.get('genre') === '18'
    );
  });
  await page.getByRole('button', { name: 'Apply Runtime' }).click();
  await query;
  await page.reload();
  await expect(page.getByLabel('Maximum Runtime (Minutes)')).toHaveValue('120');
  await page.getByRole('button', { name: 'Clear Runtime' }).click();
  await expect(page).toHaveURL(/\/movies\?genre=18$/);
});

test('explicit series vote counts override the Top rated default and reset cleanly', async ({
  page,
}) => {
  await fixtures(page);
  const defaultQuery = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return (
      url.pathname.endsWith('/discover/tv') &&
      url.searchParams.get('sortBy') === 'vote_average.desc' &&
      url.searchParams.get('voteCountGte') === '50'
    );
  });
  await page.goto('./series?sort=vote_average.desc');
  await defaultQuery;
  await page.getByLabel('Minimum Votes').fill('10');
  await page.getByLabel('Maximum Votes').fill('50');
  const query = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return (
      url.pathname.endsWith('/discover/tv') &&
      url.searchParams.get('voteCountGte') === '10' &&
      url.searchParams.get('voteCountLte') === '50'
    );
  });
  await page.getByRole('button', { name: 'Apply Vote Count' }).click();
  await query;
  await page.reload();
  await expect(page.getByLabel('Minimum Votes')).toHaveValue('10');
  await page.getByRole('button', { name: 'Clear Vote Count' }).click();
  await expect(page).toHaveURL(/\/series\?sort=vote_average.desc$/);
});

test('original language distinguishes all languages from the saved default', async ({
  page,
}) => {
  await fixtures(page);
  await page.route('**/api/v1/languages', (route) =>
    route.fulfill({ json: [{ iso_639_1: 'ja', english_name: 'Japanese' }] })
  );
  await page.goto('/series?genre=18');
  const language = page.getByLabel('Original Language', { exact: true });
  await language.selectOption({ label: 'Japanese' });
  await expect(page).toHaveURL(/language=ja/);
  await page.reload();
  await expect(language).toHaveValue('ja');
  const all = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return (
      url.pathname.endsWith('/discover/tv') &&
      url.searchParams.get('language') === 'all'
    );
  });
  await language.selectOption('all');
  await all;
  await language.selectOption('');
  await expect(page).toHaveURL(/\/series\?genre=18$/);
});

test('movie origin country sends the server filter and clears independently', async ({
  page,
}) => {
  await fixtures(page);
  await page.route('**/api/v1/watchproviders/regions', (route) =>
    route.fulfill({ json: [{ iso_3166_1: 'CA', english_name: 'Canada' }] })
  );
  await page.goto('/movies?genre=18');
  const country = page.getByLabel('Country of Origin', { exact: true });
  const query = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return (
      url.pathname.endsWith('/discover/movies') &&
      url.searchParams.get('country') === 'CA'
    );
  });
  await country.selectOption({ label: 'Canada' });
  await query;
  await page.reload();
  await expect(country).toHaveValue('CA');
  await country.selectOption('');
  await expect(page).toHaveURL(/\/movies\?genre=18$/);
});

test('production country links open the matching movie and series filters', async ({
  page,
}) => {
  await fixtures(page);
  const productionCountries = [
    { iso_3166_1: 'CA', name: 'Canada' },
    { iso_3166_1: 'JP', name: 'Japan' },
  ];
  await page.route('**/api/v1/movie/101', (route) =>
    route.fulfill({ json: { ...movie, productionCountries } })
  );
  await page.route('**/api/v1/tv/202', (route) =>
    route.fulfill({
      json: {
        ...movie,
        id: 202,
        name: 'Fixture Series',
        mediaType: 'tv',
        seasons: [],
        productionCountries,
      },
    })
  );
  await page.goto('/movie/101');
  await page.getByRole('link', { name: 'Canada', exact: true }).click();
  await expect(page).toHaveURL(/\/movies\?country=CA$/);
  await page.goto('/tv/202');
  await page.getByRole('link', { name: 'Japan', exact: true }).click();
  await expect(page).toHaveURL(/\/series\?country=JP$/);
});

test('series network details open the matching discovery query', async ({
  page,
}) => {
  await fixtures(page);
  await page.route('**/api/v1/tv/202', (route) =>
    route.fulfill({
      json: {
        ...movie,
        id: 202,
        name: 'Fixture Series',
        mediaType: 'tv',
        seasons: [],
        networks: [
          { id: 42, name: 'Fixture Network' },
          { name: 'Unmapped Network' },
        ],
      },
    })
  );
  await page.route('**/api/v1/network/42', (route) =>
    route.fulfill({ json: { id: 42, name: 'Fixture Network' } })
  );
  await page.goto('/tv/202');
  await expect(
    page.getByText('Unmapped Network', { exact: false })
  ).toBeVisible();
  const query = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return (
      url.pathname.endsWith('/discover/tv') &&
      url.searchParams.get('network') === '42'
    );
  });
  await page
    .getByRole('link', { name: 'Fixture Network', exact: true })
    .click();
  await query;
  await expect(page).toHaveURL(/\/series\?network=42$/);
  await page
    .getByRole('button', { name: 'Clear Network Fixture Network' })
    .click();
  await expect(page).toHaveURL(/\/series$/);
});

test('series discovery selects a network from the native catalog', async ({
  page,
}) => {
  await fixtures(page);
  await page.goto('/series?genre=18');
  const network = page.getByLabel('Network', { exact: true });
  const query = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return (
      url.pathname.endsWith('/discover/tv') &&
      url.searchParams.get('network') === '213' &&
      url.searchParams.get('genre') === '18'
    );
  });
  await network.selectOption({ label: 'Netflix' });
  await query;
  await page.reload();
  await expect(network).toHaveValue('213');
  await network.selectOption('');
  await expect(page).toHaveURL(/\/series\?genre=18$/);
});

test('movie studio details open the matching discovery query', async ({
  page,
}) => {
  await fixtures(page);
  await page.route('**/api/v1/movie/101', (route) =>
    route.fulfill({
      json: {
        ...movie,
        productionCompanies: [{ id: 42, name: 'Fixture Studio' }],
      },
    })
  );
  await page.route('**/api/v1/studio/42', (route) =>
    route.fulfill({ json: { id: 42, name: 'Fixture Studio' } })
  );
  await page.goto('/movie/101');
  const query = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return (
      url.pathname.endsWith('/discover/movies') &&
      url.searchParams.get('studio') === '42'
    );
  });
  await page.getByRole('link', { name: 'Fixture Studio', exact: true }).click();
  await query;
  await expect(page).toHaveURL(/\/movies\?studio=42$/);
  await page
    .getByRole('button', { name: 'Clear Studio Fixture Studio' })
    .click();
  await expect(page).toHaveURL(/\/movies$/);
});

test('movie studio search can select and exclude a studio', async ({
  page,
}) => {
  await fixtures(page);
  await page.route('**/api/v1/search/company?query=fixture&page=1', (route) =>
    route.fulfill({
      json: { results: [{ id: 42, name: 'Fixture Studio' }], total_pages: 1 },
    })
  );
  await page.route('**/api/v1/studio/42', (route) =>
    route.fulfill({ json: { id: 42, name: 'Fixture Studio' } })
  );
  await page.goto('/movies?genre=18');
  await page.getByRole('button', { name: 'Production Studios' }).click();
  await page.getByLabel('Find Production Studios').fill('fixture');
  await page.getByRole('button', { name: 'Find Studios' }).click();
  await page
    .getByRole('button', { name: 'Fixture Studio', exact: true })
    .click();
  const query = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return (
      url.pathname.endsWith('/discover/movies') &&
      url.searchParams.get('studio') === '42' &&
      url.searchParams.get('excludeStudio') === 'true'
    );
  });
  await page
    .getByRole('button', { name: 'Exclude Studio', exact: true })
    .click();
  await query;
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'Exclude Studio', exact: true })
  ).toHaveAttribute('aria-pressed', 'true');
  await page
    .getByRole('button', { name: 'Clear Studio Fixture Studio' })
    .click();
  await expect(page).toHaveURL(/\/movies\?genre=18$/);
});

test('clearing discovery resets applied filters and unapplied range edits', async ({
  page,
}) => {
  await fixtures(page);
  await page.goto(
    '/series?genre=18&excludeGenre=true&network=213&status=3&excludeStatus=true&sort=vote_average.desc&watchProviders=8&watchRegion=CA&watchProviderMode=exclude&firstAirDateGte=2024-01-01&keep=1'
  );
  const rating = page.getByLabel('Minimum Rating');
  await rating.fill('7.1');
  const clear = page.getByRole('button', { name: 'Clear Discovery Filters' });
  await clear.click();
  await expect(page).toHaveURL(/\/series\?keep=1$/);
  await expect(clear).toHaveAttribute('aria-disabled', 'true');
  await expect(page.getByLabel('Network', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('Released On or After')).toHaveValue('');
  await expect(rating).toHaveValue('');
});

test('movie discovery gives a single retry for a failed initial page', async ({
  page,
}) => {
  await fixtures(page);
  let reads = 0;
  await page.route('**/api/v1/discover/movies?*', (route) => {
    reads++;
    return reads === 1
      ? route.fulfill({
          status: 503,
          json: { message: 'Discovery is temporarily unavailable.' },
        })
      : route.fulfill({ json: paged([movie]) });
  });
  await page.goto('/movies?genre=18');
  const alert = page
    .getByRole('alert')
    .filter({ hasText: 'Couldn’t load movies' });
  await expect(alert).toBeVisible();
  await expect(
    page.getByText('Couldn’t load more.', { exact: false })
  ).toHaveCount(0);
  await alert.getByRole('button', { name: 'Retry' }).click();
  await expect(
    page.getByRole('link', { name: 'The Test Film', exact: true })
  ).toBeVisible();
  await expect(alert).toHaveCount(0);
  expect(reads).toBe(2);
});

test('movie availability can distinguish HD and 4K', async ({ page }) => {
  await fixtures(page);
  await page.route('**/api/v1/settings/public', (route) =>
    route.fulfill({ json: { applicationTitle: 'SeerrNG', enable4k: true } })
  );
  const queries: (string | null)[] = [];
  await page.route('**/api/v1/discover/movies?*', (route) => {
    const quality = new URL(route.request().url()).searchParams.get(
      'availability'
    );
    queries.push(quality);
    return route.fulfill({
      json: paged(
        [
          {
            ...movie,
            id: 201,
            title: 'HD Fixture',
            mediaInfo: { status: 5, status4k: 1 },
          },
          {
            ...movie,
            id: 202,
            title: '4K Fixture',
            mediaInfo: { status: 1, status4k: 5 },
          },
        ].filter(({ mediaInfo }) =>
          quality === 'hd'
            ? mediaInfo.status === 5
            : quality === '4k'
              ? mediaInfo.status4k === 5
              : true
        )
      ),
    });
  });
  await page.goto('/movies?show=have');
  const hd = page.getByRole('link', { name: 'HD Fixture', exact: true });
  const fourK = page.getByRole('link', { name: '4K Fixture', exact: true });
  const quality = page.getByLabel('Availability Quality');
  await expect(hd).toBeVisible();
  await expect(fourK).toHaveCount(0);
  await quality.selectOption('4k');
  await expect(fourK).toBeVisible();
  await expect(hd).toHaveCount(0);
  await page.reload();
  await expect(quality).toHaveValue('4k');
  await expect(fourK).toBeVisible();
  await page.getByRole('button', { name: /^Not on / }).click();
  await expect(hd).toBeVisible();
  await expect(fourK).toHaveCount(0);
  expect(queries).toEqual(expect.arrayContaining(['hd', '4k', null]));
});

test('available series use the library query and retain quality with catalog filters', async ({
  page,
}) => {
  await fixtures(page);
  await page.route('**/api/v1/settings/public', (route) =>
    route.fulfill({ json: { applicationTitle: 'SeerrNG', enable4k: true } })
  );
  const queries: [string | null, string | null][] = [];
  await page.route('**/api/v1/discover/tv?*', (route) => {
    const params = new URL(route.request().url()).searchParams;
    const availability = params.get('availability');
    queries.push([availability, params.get('status')]);
    const series = { ...movie, title: undefined, mediaType: 'tv' };
    return route.fulfill({
      json: paged(
        availability
          ? [
              {
                ...series,
                id: 201,
                name: 'Library Series',
                mediaInfo: { status: 1, status4k: 5 },
              },
            ]
          : [
              {
                ...series,
                id: 202,
                name: 'Catalog 4K Series',
                mediaInfo: { status: 1, status4k: 5 },
              },
              {
                ...series,
                id: 203,
                name: 'Catalog HD Series',
                mediaInfo: { status: 5, status4k: 1 },
              },
            ]
      ),
    });
  });
  await page.goto('/series?show=have&quality=4k');
  const library = page.getByRole('link', {
    name: 'Library Series',
    exact: true,
  });
  await expect(library).toBeVisible();
  await expect.poll(() => queries).toContainEqual(['4k', null]);
  const status = page.getByLabel('Series Status', { exact: true });
  await status.selectOption('0');
  await expect(
    page.getByRole('link', { name: 'Catalog 4K Series', exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Catalog HD Series', exact: true })
  ).toHaveCount(0);
  await expect(library).toHaveCount(0);
  expect(queries).toContainEqual([null, '0']);
  await status.selectOption('');
  await expect(library).toBeVisible();
  await expect(page.getByLabel('Availability Quality')).toHaveValue('4k');
});

test('discovery retries a failed second page without replacing existing titles', async ({
  page,
}) => {
  await fixtures(page);
  const reads: number[] = [];
  await page.route('**/api/v1/discover/movies?*', (route) => {
    const number = Number(
      new URL(route.request().url()).searchParams.get('page')
    );
    reads.push(number);
    if (number === 2 && reads.filter((read) => read === 2).length === 1)
      return route.fulfill({
        status: 503,
        json: { message: 'Page unavailable.' },
      });
    return route.fulfill({
      json: {
        page: number,
        totalPages: 2,
        results:
          number === 1
            ? [movie]
            : [{ ...movie, id: 202, title: 'Second Page Film' }],
      },
    });
  });
  await page.goto('/movies');
  const first = page.getByRole('link', { name: 'The Test Film', exact: true });
  const alert = page
    .getByRole('alert')
    .filter({ hasText: 'Couldn’t load more.' });
  await expect(first).toBeVisible();
  await page.evaluate(() =>
    window.scrollTo(0, document.documentElement.scrollHeight)
  );
  await expect(alert).toBeVisible();
  await expect(first).toBeVisible();
  await alert.getByRole('button', { name: 'Retry' }).click();
  await expect(
    page.getByRole('link', { name: 'Second Page Film', exact: true })
  ).toBeVisible();
  await expect(first).toBeVisible();
  expect(reads).toEqual([1, 2, 2]);
});

test('Discover restores a movie shelf offset after browser Back', async ({
  page,
}) => {
  await fixtures(page);
  const movies = Array.from({ length: 20 }, (_, index) => ({
    ...movie,
    id: 100 + index,
    title: `Shelf Movie ${index}`,
  }));
  await page.route('**/api/v1/discover/movies', (route) =>
    route.fulfill({ json: paged(movies) })
  );
  await page.goto('/');
  const rail = page
    .locator('section')
    .filter({
      has: page.getByRole('heading', { name: 'Trending movies', exact: true }),
    })
    .locator('.rail');
  await expect(
    rail.getByRole('link', { name: 'Shelf Movie 1', exact: true })
  ).toBeVisible();
  await rail.evaluate((element) => {
    element.scrollLeft = 460;
  });
  await expect
    .poll(() => rail.evaluate((element) => element.scrollLeft))
    .toBeGreaterThan(0);
  const offset = await rail.evaluate((element) => element.scrollLeft);
  await rail.evaluate((element) => {
    element
      .querySelector<HTMLAnchorElement>('a.hit[href="/movie/101"]')
      ?.click();
  });
  await expect(page).toHaveURL(/\/movie\/101$/);
  await page.goBack();
  await expect
    .poll(() => rail.evaluate((element) => element.scrollLeft))
    .toBeCloseTo(offset, 0);
});

test('related video lists preserve media type, paginate, and retry', async ({
  page,
}) => {
  await fixtures(page);
  await page.route('**/api/v1/tv/202', (route) =>
    route.fulfill({ json: { id: 202, name: 'Fixture Series', seasons: [] } })
  );
  let pageTwoAttempts = 0;
  await page.route(
    /\/api\/v1\/(movie\/101|tv\/202)\/(similar|recommendations)(?:\?|$)/,
    (route) => {
      const url = new URL(route.request().url());
      const tv = url.pathname.includes('/tv/');
      const relation = url.pathname.endsWith('/similar')
        ? 'Similar'
        : 'Recommended';
      const number = Number(url.searchParams.get('page') || 1);
      if (
        !tv &&
        relation === 'Similar' &&
        number === 2 &&
        ++pageTwoAttempts === 1
      ) {
        return route.fulfill({ status: 503, json: {} });
      }
      const label = `${relation} ${tv ? 'Series' : 'Film'} ${number}`;
      return route.fulfill({
        json: {
          ...paged([
            { id: 300 + number, ...(tv ? { name: label } : { title: label }) },
          ]),
          page: number,
          totalPages: !tv && relation === 'Similar' ? 2 : 1,
        },
      });
    }
  );

  await page.goto('/movie/101');
  await page.getByRole('link', { name: 'Similar Movies' }).click();
  await expect(
    page.getByRole('heading', { name: 'Similar Movies' })
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Similar Film 1' })
  ).toHaveAttribute('href', '/movie/301');
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(
    page.getByRole('link', { name: 'Similar Film 2' })
  ).toBeVisible();
  expect(pageTwoAttempts).toBe(2);
  await page.getByRole('link', { name: 'Back to Details' }).click();
  await page
    .getByRole('link', { name: 'Recommendations', exact: true })
    .click();
  await expect(
    page.getByRole('link', { name: 'Recommended Film 1' })
  ).toBeVisible();

  await page.goto('/tv/202/recommendations');
  await expect(
    page.getByRole('link', { name: 'Recommended Series 1' })
  ).toHaveAttribute('href', '/tv/301');
  await page.goto('/tv/202/similar');
  await expect(
    page.getByRole('link', { name: 'Similar Series 1' })
  ).toHaveAttribute('href', '/tv/301');
});

test('Coming soon scopes results and network requests by media', async ({
  page,
}) => {
  await fixtures(page);
  let movieLoads = 0;
  await page.route('**/api/v1/discover/movies/upcoming?page=*', (route) => {
    movieLoads++;
    return route.fulfill({
      json: paged([{ ...movie, title: 'Upcoming Film' }]),
    });
  });
  await page.route('**/api/v1/discover/tv/upcoming?page=*', (route) =>
    route.fulfill({
      json: paged([
        { id: 202, name: 'Upcoming Series', firstAirDate: '2030-01-01' },
      ]),
    })
  );
  await page.goto('/soon?media=tv');
  await expect(
    page.getByRole('link', { name: 'Upcoming Series' })
  ).toBeVisible();
  expect(movieLoads).toBe(0);
  const media = page.getByRole('navigation', { name: 'Upcoming Media' });
  await media.getByRole('link', { name: 'Movies' }).click();
  await expect(page.getByRole('link', { name: 'Upcoming Film' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Upcoming Series' })).toHaveCount(
    0
  );
  await media.getByRole('link', { name: 'All' }).click();
  await expect(page.getByRole('link', { name: 'Upcoming Film' })).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Upcoming Series' })
  ).toBeVisible();
});

test('Trending preserves mixed title identities and sends scoped filters', async ({
  page,
}) => {
  await fixtures(page);
  const requests: URLSearchParams[] = [];
  await page.route(/\/api\/v1\/discover\/trending\?/, (route) => {
    const query = new URL(route.request().url()).searchParams;
    requests.push(query);
    const number = Number(query.get('page'));
    const tv = { id: movie.id, name: 'Trending Series', mediaType: 'tv' };
    const mixed = query.get('mediaType') === 'all';
    const results =
      mixed && number === 1
        ? [
            { ...movie, title: 'Trending Film' },
            {
              id: movie.id,
              mediaType: 'collection',
              title: 'Trending Collection',
            },
          ]
        : [tv];
    return route.fulfill({
      json: { ...paged(results), page: number, totalPages: mixed ? 2 : 1 },
    });
  });

  await page.goto('/trending');
  await expect(page.getByRole('link', { name: 'Trending Film' })).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Trending Collection' })
  ).toHaveAttribute('href', '/collection/101');
  await expect(
    page.getByRole('link', { name: 'Trending Series' })
  ).toHaveAttribute('href', '/tv/101');
  await page.getByRole('button', { name: 'Series', exact: true }).click();
  await page.getByRole('button', { name: 'Weekly', exact: true }).click();
  await expect
    .poll(() => Object.fromEntries(requests.at(-1) ?? []))
    .toMatchObject({ mediaType: 'tv', timeWindow: 'week', page: '1' });
  await expect(page.getByRole('link', { name: 'Trending Film' })).toHaveCount(
    0
  );
  await expect(
    page.getByRole('link', { name: 'Trending Series' })
  ).toBeVisible();
});

test('public TMDB lists show the named list and retain exact identities across pages', async ({
  page,
}) => {
  await fixtures(page);
  let secondPage = 0;
  await page.route('**/api/v1/discover/list/12345?*', (route) => {
    const number = Number(
      new URL(route.request().url()).searchParams.get('page')
    );
    if (number === 2 && ++secondPage === 1) {
      return route.fulfill({
        status: 502,
        json: { message: 'Unable to retrieve TMDB list.' },
      });
    }
    return route.fulfill({
      json: {
        ...paged(
          number === 1
            ? [
                { ...movie, title: 'List Film' },
                { id: movie.id, name: 'List Series', mediaType: 'tv' },
              ]
            : []
        ),
        page: number,
        totalPages: 2,
        list: { name: 'Public Fixture List', description: 'A curated list' },
      },
    });
  });
  await page.goto('/list/12345');
  await expect(
    page.getByRole('heading', { name: 'Public Fixture List' })
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'List Film' })).toHaveAttribute(
    'href',
    '/movie/101'
  );
  await expect(page.getByRole('link', { name: 'List Series' })).toHaveAttribute(
    'href',
    '/tv/101'
  );
  await page.getByRole('button', { name: 'Next Page' }).click();
  await expect(page.getByRole('link', { name: 'List Film' })).toHaveCount(0);
  const error = page
    .getByRole('alert')
    .filter({ hasText: 'Unable to retrieve TMDB list.' });
  await error.getByRole('button', { name: 'Retry' }).click();
  await expect(page.getByText('No titles on this page.')).toBeVisible();
  await expect(page).toHaveURL(/\?page=2$/);
  expect(secondPage).toBe(2);
  await page.getByRole('button', { name: 'Previous Page' }).click();
  await expect(page.getByRole('link', { name: 'List Series' })).toBeVisible();
});

test('Discover displays enabled TMDB list shelves in configured order', async ({
  page,
}) => {
  await fixtures(page);
  const requests: string[] = [];
  await page.route('**/api/v1/settings/discover', (route) =>
    route.fulfill({
      json: [
        {
          id: 2,
          type: 28,
          order: 20,
          enabled: true,
          title: 'Second Curated Shelf',
          data: '22',
        },
        {
          id: 3,
          type: 28,
          order: 5,
          enabled: false,
          title: 'Disabled Shelf',
          data: '33',
        },
        {
          id: 1,
          type: 28,
          order: 10,
          enabled: true,
          title: 'First Curated Shelf',
          data: '11',
        },
      ],
    })
  );
  await page.route(/\/api\/v1\/discover\/list\//, (route) => {
    const listId = new URL(route.request().url()).pathname.split('/').at(-1)!;
    requests.push(listId);
    return route.fulfill({
      json: {
        ...paged([{ ...movie, title: `Curated Film ${listId}` }]),
        list: { name: `Public List ${listId}`, description: '' },
      },
    });
  });
  await page.goto('/');
  const first = page.locator('section').filter({
    has: page.getByRole('heading', { name: 'First Curated Shelf' }),
  });
  const second = page.locator('section').filter({
    has: page.getByRole('heading', { name: 'Second Curated Shelf' }),
  });
  await first.scrollIntoViewIfNeeded();
  await expect(
    first.getByRole('link', { name: 'Curated Film 11' })
  ).toBeVisible();
  await second.scrollIntoViewIfNeeded();
  await expect(
    second.getByRole('link', { name: 'Curated Film 22' })
  ).toBeVisible();
  expect(
    await page.getByRole('heading', { name: /Curated Shelf/ }).allTextContents()
  ).toEqual(['First Curated Shelf', 'Second Curated Shelf']);
  expect(requests).not.toContain('33');
  await first.getByRole('link', { name: 'See all' }).click();
  await expect(
    page.getByRole('heading', { name: 'Public List 11' })
  ).toBeVisible();
});

test('configured video shelves preserve keyword and streaming filters', async ({
  page,
}) => {
  await fixtures(page);
  const reads: string[] = [];
  await page.route('**/api/v1/settings/discover', (route) =>
    route.fulfill({
      json: [
        {
          id: 1,
          type: 13,
          title: 'Keyword Shelf',
          enabled: true,
          data: '12,34',
          order: 2,
        },
        {
          id: 2,
          type: 21,
          title: 'Streaming Shelf',
          enabled: true,
          data: 'US,8|9',
          order: 1,
        },
        {
          id: 3,
          type: 18,
          title: 'Invalid Shelf',
          enabled: true,
          data: '42?extra=true',
          order: 3,
        },
      ],
    })
  );
  await page.route(/\/api\/v1\/discover\/(movies|tv)\?/, (route) => {
    const url = new URL(route.request().url());
    reads.push(url.pathname + url.search);
    return route.fulfill({
      json: paged([
        url.pathname.endsWith('/tv')
          ? { id: 88, mediaType: 'tv', name: 'Streaming Fixture' }
          : { ...movie, title: 'Keyword Fixture' },
      ]),
    });
  });
  await page.goto('/');
  const streaming = page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'Streaming Shelf' }) });
  const keywords = page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'Keyword Shelf' }) });
  await streaming.scrollIntoViewIfNeeded();
  await expect(
    streaming.getByRole('link', { name: 'Streaming Fixture' })
  ).toHaveAttribute('href', '/tv/88');
  await expect(
    streaming.getByRole('link', { name: 'See all' })
  ).toHaveAttribute('href', '/series?watchRegion=US&watchProviders=8%7C9');
  await keywords.scrollIntoViewIfNeeded();
  await expect(
    keywords.getByRole('link', { name: 'Keyword Fixture' })
  ).toBeVisible();
  await expect(keywords.getByRole('link', { name: 'See all' })).toHaveAttribute(
    'href',
    '/movies?keywords=12%2C34'
  );
  expect(reads).toContain('/api/v1/discover/movies?keywords=12%2C34&page=1');
  expect(reads).toContain(
    '/api/v1/discover/tv?watchRegion=US&watchProviders=8%7C9&page=1'
  );
  await expect(
    page.getByRole('heading', { name: 'Invalid Shelf' })
  ).toHaveCount(0);
});

test('configured search shelves link mixed results and preserve the search term', async ({
  page,
}) => {
  await fixtures(page);
  await page.route('**/api/v1/settings/discover', (route) =>
    route.fulfill({
      json: [
        {
          id: 9,
          type: 17,
          order: 1,
          enabled: true,
          title: 'Search Shelf',
          data: 'A & B',
        },
      ],
    })
  );
  const queries: string[] = [];
  await page.route(/\/api\/v1\/search\?/, (route) => {
    const term = new URL(route.request().url()).searchParams.get('query');
    queries.push(term ?? '');
    return route.fulfill({
      json: paged([
        { ...movie, title: 'Shelf Film' },
        { id: 101, mediaType: 'tv', name: 'Shelf Series' },
        { id: 101, mediaType: 'person', name: 'Shelf Person' },
        { id: 101, mediaType: 'collection', title: 'Shelf Collection' },
        { id: 101, mediaType: 'artist', name: 'Other Category' },
      ]),
    });
  });
  await page.goto('/');
  const shelf = page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'Search Shelf' }) });
  await shelf.scrollIntoViewIfNeeded();
  for (const [label, path] of [
    ['Shelf Film', '/movie/101'],
    ['Shelf Series', '/tv/101'],
    ['Shelf Person', '/person/101'],
    ['Shelf Collection', '/collection/101'],
  ]) {
    await expect(shelf.getByRole('link', { name: label })).toHaveAttribute(
      'href',
      path
    );
  }
  await expect(shelf.getByText('Other Category')).toHaveCount(0);
  expect(queries).toEqual(['A & B']);
  const all = shelf.getByRole('link', { name: 'See all' });
  await expect(all).toHaveAttribute('href', '/search?q=A+%26+B');
  await all.click();
  await expect(page).toHaveURL(/\/search\?q=A\+%26\+B$/);
  await expect(
    page.getByRole('link', { name: 'Shelf Collection' })
  ).toBeVisible();
});

test('configured book shelves carry an arbitrary subject into both book formats', async ({
  page,
}) => {
  await fixtures(page);
  await page.route('**/api/v1/settings/public', (route) =>
    route.fulfill({
      json: {
        booksEnabled: true,
        ebookServiceEnabled: true,
        audiobookServiceEnabled: true,
      },
    })
  );
  await page.route('**/api/v1/settings/discover', (route) =>
    route.fulfill({
      json: [
        {
          id: 24,
          type: 24,
          order: 1,
          enabled: true,
          title: 'Local History Shelf',
          data: 'local history',
        },
      ],
    })
  );
  const reads: URLSearchParams[] = [];
  await page.route(/\/api\/v1\/discover\/books\?/, (route) => {
    const query = new URL(route.request().url()).searchParams;
    reads.push(query);
    const audio = query.get('format') === 'audiobook';
    return route.fulfill({
      json: paged(
        query.has('subject')
          ? [
              {
                id: 'OL123W',
                title: audio ? 'Local History Audio' : 'Local History Book',
                mediaType: 'book',
                bookFormat: audio ? 'audiobook' : 'ebook',
              },
            ]
          : []
      ),
    });
  });
  await page.goto('/');
  const shelf = page.locator('section').filter({
    has: page.getByRole('heading', { name: 'Local History Shelf' }),
  });
  await shelf.scrollIntoViewIfNeeded();
  await expect(
    shelf.getByRole('link', { name: 'Local History Book' })
  ).toBeVisible();
  await shelf.getByRole('link', { name: 'See all' }).click();
  await expect(page).toHaveURL(/\/books\?subject=local\+history$/);
  await expect(
    page.getByRole('link', { name: 'Local History Book' })
  ).toBeVisible();
  await page
    .getByRole('group', { name: 'Format' })
    .getByRole('link', { name: 'Audiobooks' })
    .click();
  await expect(
    page.getByRole('link', { name: 'Local History Audio' })
  ).toBeVisible();
  expect(
    reads.some(
      (q) =>
        q.get('subject') === 'local history' && q.get('format') === 'audiobook'
    )
  ).toBe(true);
  await page.getByRole('button', { name: 'Clear Subject' }).click();
  await expect(page).toHaveURL(/\/audiobooks\?sort=ranked$/);
});

test('comic catalogue indexing refreshes into filtered results', async ({
  page,
}) => {
  await fixtures(page);
  await page.route('**/api/v1/settings/public', (route) =>
    route.fulfill({ json: { enabledMediaCategories: { comic: true } } })
  );
  await page.route('**/api/v1/user/1/settings/main', (route) =>
    route.fulfill({ json: { enabledMediaCategories: { comic: true } } })
  );
  let reads = 0;
  await page.route('**/api/v1/discover/comics?*', (route) => {
    const params = new URL(route.request().url()).searchParams;
    expect(params.get('publisher')).toBe('Image');
    expect(params.get('page')).toBe('1');
    reads += 1;
    if (reads < 3) {
      return route.fulfill({
        json: {
          ...paged([]),
          totalPages: 0,
          indexing: true,
          indexedResults: 6 * reads,
          expectedResults: 20,
          indexError: reads === 1 ? 'unstable-order' : undefined,
        },
      });
    }
    return route.fulfill({
      json: paged([{ id: '1234', mediaType: 'comic', title: 'Indexed Comic' }]),
    });
  });
  await page.clock.install();
  await page.goto('/comics?publisher=Image');
  await expect(
    page.getByRole('status').filter({ hasText: 'Comic catalogue indexing' })
  ).toContainText('6 of 20 volumes indexed');
  await expect(page.getByText('No comics found')).toHaveCount(0);
  await page.getByRole('button', { name: 'Check Again' }).click();
  await expect(
    page.getByText('12 of 20 volumes indexed', { exact: false })
  ).toBeVisible();
  await page.clock.fastForward(15000);
  await expect(
    page.getByRole('link', { name: 'Indexed Comic' })
  ).toHaveAttribute('href', '/comic/1234');
  await expect(page.getByText('Comic catalogue indexing')).toHaveCount(0);
});

test('Classic comic discovery bookmarks restore catalogue filters and results', async ({
  page,
}) => {
  await fixtures(page);
  await page.route('**/api/v1/settings/public', (route) =>
    route.fulfill({ json: { enabledMediaCategories: { comic: true } } })
  );
  await page.route('**/api/v1/user/1/settings/main', (route) =>
    route.fulfill({ json: { enabledMediaCategories: { comic: true } } })
  );
  const reads: URLSearchParams[] = [];
  await page.route('**/api/v1/discover/comics?*', (route) => {
    const params = new URL(route.request().url()).searchParams;
    reads.push(params);
    if (params.get('group') === 'works') {
      return route.fulfill({
        json: paged([
          {
            id: 'al-42',
            mediaType: 'comic',
            kind: 'manga',
            title: 'Fixture Manga',
            editions: [],
            editionsResolved: false,
          },
        ]),
      });
    }
    return route.fulfill({
      json: paged([
        {
          id: '1234',
          mediaType: 'comic',
          title: 'Night Tales',
          publisher: 'Image',
        },
      ]),
    });
  });
  await page.goto(
    '/comics?query=Night&publisher=Image&startYear=2010&minIssues=1&maxIssues=12'
  );
  const filterForm = page.getByRole('form', {
    name: 'Comics Catalogue Filters',
  });
  await expect(page.getByRole('link', { name: 'Night Tales' })).toHaveAttribute(
    'href',
    '/comic/1234'
  );
  await expect(
    filterForm.getByRole('searchbox', { name: 'Publisher' })
  ).toHaveValue('Image');
  expect(Object.fromEntries(reads[0])).toMatchObject({
    query: 'Night',
    publisher: 'Image',
    startYear: '2010',
    minIssues: '1',
    maxIssues: '12',
  });
  await filterForm
    .getByRole('spinbutton', { name: 'Maximum Issues' })
    .fill('20');
  await filterForm
    .getByRole('button', { name: 'Search Comics Catalogue' })
    .click();
  await expect.poll(() => reads.at(-1)?.get('maxIssues')).toBe('20');
  await filterForm
    .getByRole('button', { name: 'Back to Comics and Manga' })
    .click();
  await expect(page).toHaveURL(/\/comics$/);
  await expect(
    filterForm.getByRole('searchbox', { name: 'Publisher' })
  ).toHaveValue('');
  await expect(
    page.getByRole('heading', { name: 'Comics Catalogue', exact: true })
  ).toHaveCount(0);
  await filterForm
    .getByRole('searchbox', { name: 'Title', exact: true })
    .fill('Fixture Manga');
  await filterForm
    .getByRole('button', { name: 'Search Comics Catalogue' })
    .click();
  await expect(
    page.getByRole('link', { name: 'Fixture Manga' })
  ).toHaveAttribute('href', '/comic/al-42');
  expect(reads.at(-1)?.get('group')).toBe('works');
});

test('Classic music discovery bookmarks retain catalogue filters', async ({
  page,
}) => {
  await fixtures(page);
  await page.route('**/api/v1/settings/public', (route) =>
    route.fulfill({
      json: { musicEnabled: true, enabledMediaCategories: { music: true } },
    })
  );
  await page.route('**/api/v1/user/1/settings/main', (route) =>
    route.fulfill({ json: { enabledMediaCategories: { music: true } } })
  );
  const artistId = '5b36cb67-befa-41ca-a91d-a6dcf1f68062';
  const filters = {
    query: 'Jazz',
    artist: 'Fixture Artist',
    artistId,
    availability: 'flac',
    primaryReleaseDateGte: '1990-01-01',
    primaryReleaseDateLte: '2000-12-31',
    genre: 'jazz',
    sortBy: 'release_date.asc',
  };
  const observed: URLSearchParams[] = [];
  await page.route('**/api/v1/discover/music?*', (route) => {
    observed.push(new URL(route.request().url()).searchParams);
    return route.fulfill({ json: paged([]) });
  });
  const { query, ...bookmark } = filters;
  const params = new URLSearchParams({
    ...bookmark,
    search: query,
    releaseType: 'EP,Soundtrack',
  });
  await page.goto('/music?' + params);
  await expect(page.getByPlaceholder('Search albums and artists…')).toHaveValue(
    query
  );
  await expect(
    page.getByRole('combobox', { name: 'Sort', exact: true })
  ).toHaveValue(filters.sortBy);
  await expect
    .poll(() =>
      observed.some(
        (read) =>
          read.get('releaseType') === 'ep,soundtrack' &&
          Object.entries(filters).every(
            ([key, value]) => read.get(key) === value
          )
      )
    )
    .toBe(true);
  await page
    .getByRole('button', { name: 'Release Types: EP + 1', exact: true })
    .click();
  const releaseTypes = page.getByRole('dialog', { name: 'Release Types' });
  await expect(
    releaseTypes.getByRole('button', { name: 'EP', exact: true })
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(
    releaseTypes.getByRole('button', { name: 'Soundtrack', exact: true })
  ).toHaveAttribute('aria-pressed', 'true');
  await releaseTypes
    .getByRole('button', { name: 'Compilation', exact: true })
    .click();
  await expect
    .poll(() => observed.at(-1)?.get('releaseType'))
    .toBe('ep,soundtrack,compilation');
  await releaseTypes
    .getByRole('button', { name: 'Any Release Type', exact: true })
    .click();
  await expect.poll(() => observed.at(-1)?.get('releaseType')).toBeNull();
  await releaseTypes.getByRole('button', { name: 'Done', exact: true }).click();
  const form = page.getByRole('form', { name: 'Music Discovery Filters' });
  await expect(form.getByRole('searchbox', { name: 'Artist' })).toHaveValue(
    filters.artist
  );
  await expect(form.getByRole('combobox', { name: 'In Library' })).toHaveValue(
    'flac'
  );
  await form.getByRole('searchbox', { name: 'Artist' }).fill('New Artist');
  await form.getByLabel('Released From').fill('2001-01-01');
  await form.getByLabel('Released Through').fill('2010-12-31');
  await form.getByRole('combobox', { name: 'In Library' }).selectOption('mp3');
  await form.getByRole('button', { name: 'Apply Music Filters' }).click();
  await expect
    .poll(() => Object.fromEntries(observed.at(-1) ?? []))
    .toMatchObject({
      artist: 'New Artist',
      availability: 'mp3',
      primaryReleaseDateGte: '2001-01-01',
      primaryReleaseDateLte: '2010-12-31',
      query,
    });
  expect(observed.at(-1)?.has('artistId')).toBe(false);
  await form.getByRole('button', { name: 'Clear Music Filters' }).click();
  await expect.poll(() => observed.at(-1)?.has('availability')).toBe(false);
  expect(observed.at(-1)?.get('query')).toBe(query);
});

test('configured music shelves preserve genre and yearly chart in Music', async ({
  page,
}) => {
  await fixtures(page);
  await page.route('**/api/v1/settings/public', (route) =>
    route.fulfill({
      json: { musicEnabled: true, enabledMediaCategories: { music: true } },
    })
  );
  await page.route('**/api/v1/user/1/settings/main', (route) =>
    route.fulfill({ json: { enabledMediaCategories: { music: true } } })
  );
  await page.route('**/api/v1/settings/discover', (route) =>
    route.fulfill({
      json: [
        {
          id: 25,
          type: 25,
          order: 1,
          enabled: true,
          title: 'Music Genre Shelf',
          data: 'drum & bass',
        },
        {
          id: 26,
          type: 26,
          order: 2,
          enabled: true,
          title: 'Yearly Chart Shelf',
          data: 'popular.year',
        },
      ],
    })
  );
  const reads: URLSearchParams[] = [];
  await page.route(/\/api\/v1\/discover\/music\?/, (route) => {
    const query = new URL(route.request().url()).searchParams;
    reads.push(query);
    return route.fulfill({
      json: paged([
        {
          id: 'album-fixture',
          mediaType: 'album',
          title: query.has('genre') ? 'Genre Fixture' : 'Chart Fixture',
        },
      ]),
    });
  });
  await page.goto('/');
  const genre = page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'Music Genre Shelf' }) });
  const chart = page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'Yearly Chart Shelf' }) });
  await genre.scrollIntoViewIfNeeded();
  await expect(
    genre.getByRole('link', { name: 'Genre Fixture' })
  ).toBeVisible();
  await chart.scrollIntoViewIfNeeded();
  await expect(
    chart.getByRole('link', { name: 'Chart Fixture' })
  ).toBeVisible();
  expect(reads.some((q) => q.get('sortBy') === 'popular.year')).toBe(true);
  await expect(chart.getByRole('link', { name: 'See all' })).toHaveAttribute(
    'href',
    '/music?sort=popular.year'
  );
  await genre.getByRole('link', { name: 'See all' }).click();
  await expect(
    page.getByRole('button', { name: 'Clear Genre: drum & bass' })
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Genre Fixture' })).toBeVisible();
  await page.getByRole('button', { name: 'Clear Genre: drum & bass' }).click();
  await expect(page).toHaveURL(/\/music\?sort=ranked$/);
  await expect(page.getByRole('link', { name: 'Chart Fixture' })).toBeVisible();
});

test('movie associations preserve related identities and explanations', async ({
  page,
}) => {
  await fixtures(page);
  await page.route(
    '**/api/v1/association/movie/101?includeWeak=true',
    (route) =>
      route.fulfill({
        json: {
          root: { title: 'The Test Film' },
          edges: [
            {
              type: 'recommended',
              reason: 'Often recommended together',
              node: { mediaType: 'tv', id: 101, name: 'Related Series' },
            },
            {
              type: 'shared-person',
              reason: 'Worked on the soundtrack',
              node: { mediaType: 'person', id: 101, name: 'Related Person' },
            },
          ],
        },
      })
  );
  await page.goto('/movie/101');
  await page.getByRole('link', { name: 'Explore Associations' }).click();
  await expect(
    page.getByRole('heading', { name: 'Associations for The Test Film' })
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Related Series' })
  ).toHaveAttribute('href', '/tv/101');
  await expect(
    page.getByRole('link', { name: 'Related Person' })
  ).toHaveAttribute('href', '/person/101');
  await page.getByLabel('Relationship').selectOption('shared-person');
  await expect(page.getByRole('link', { name: 'Related Series' })).toHaveCount(
    0
  );
  await expect(page.getByText('Worked on the soundtrack')).toBeVisible();
  await expect(page).toHaveURL(/type=shared-person$/);
  if (page.viewportSize()!.width >= 640) {
    await page.getByRole('button', { name: 'Graph', exact: true }).click();
    const graph = page.getByRole('region', { name: 'Association Graph' });
    const node = graph.getByRole('button', {
      name: 'Related Person, Shared People',
    });
    await expect(graph.getByRole('button')).toHaveCount(1);
    await node.focus();
    await page.keyboard.press('Enter');
    await expect(node).toHaveAttribute('aria-pressed', 'true');
    await expect(
      graph.getByRole('link', { name: 'Related Person' })
    ).toHaveAttribute('href', '/person/101');
    await expect(graph.getByText('Worked on the soundtrack')).toBeVisible();
    await page.getByRole('button', { name: 'List', exact: true }).click();
    await expect(graph).toHaveCount(0);
    await expect(
      page.getByRole('link', { name: 'Related Person' })
    ).toBeVisible();
  } else {
    await expect(
      page.getByRole('button', { name: 'Graph', exact: true })
    ).toHaveCount(0);
    await page.goto('/associations/movie/101?view=graph');
    await expect(
      page.getByRole('link', { name: 'Related Person' })
    ).toBeVisible();
  }
});

test('music and Open Library book details open Associations with exact identity', async ({
  page,
}) => {
  await fixtures(page);
  const album = '397b4ce9-89a1-41f8-9599-68983ee4a767';
  const artist = '934ebb1e-9e64-4a2d-abc2-8aea39d7b50c';
  await page.route('**/api/v1/settings/public', (route) =>
    route.fulfill({
      json: {
        musicEnabled: true,
        booksEnabled: true,
        enabledMediaCategories: { music: true },
      },
    })
  );
  await page.route('**/api/v1/user/1/settings/main', (route) =>
    route.fulfill({ json: { enabledMediaCategories: { music: true } } })
  );
  await page.route(`**/api/v1/music/${album}`, (route) =>
    route.fulfill({
      json: {
        id: album,
        title: 'Fixture Album',
        artist: { id: artist, name: 'Fixture Artist' },
        tracks: [],
      },
    })
  );
  await page.route(`**/api/v1/artist/${artist}`, (route) =>
    route.fulfill({
      json: { artist: { name: 'Fixture Artist' }, releaseGroups: [] },
    })
  );
  await page.route('**/api/v1/book/OL123W', (route) =>
    route.fulfill({
      json: { id: 'OL123W', title: 'Fixture Book', description: 'Description' },
    })
  );
  await page.route(
    '**/api/v1/book/bookshelf%3A1%3Afixture?lookupTitle=Local+Book',
    (route) =>
      route.fulfill({
        json: {
          id: 'bookshelf:1:fixture',
          title: 'Local Book',
          description: 'Description',
        },
      })
  );
  await page.route(
    '**/api/v1/association/book/OL123W?includeWeak=true',
    (route) =>
      route.fulfill({ json: { root: { title: 'Fixture Book' }, edges: [] } })
  );

  const association = page.getByRole('link', { name: 'Explore Associations' });
  await page.goto(`/music/${album}`);
  await expect(association).toHaveAttribute(
    'href',
    `/associations/album/${album}`
  );
  await page.goto(`/artist/${artist}`);
  await expect(association).toHaveAttribute(
    'href',
    `/associations/artist/${artist}`
  );
  await page.goto('/book/OL123W?format=audiobook');
  await association.click();
  await expect(
    page.getByRole('heading', { name: 'Associations for Fixture Book' })
  ).toBeVisible();
  await page.getByLabel('Relationship').selectOption('recommended');
  await expect(
    page.getByRole('link', { name: 'Back to Details' })
  ).toHaveAttribute('href', '/book/OL123W?f=audio');
  await page.route('**/api/v1/book/bookshelf%3A1%3Afixture', (route) =>
    route.fulfill({
      json: {
        id: 'bookshelf:1:fixture',
        title: 'Local Book',
        description: 'Description',
      },
    })
  );
  await page.goto('/book/bookshelf%3A1%3Afixture');
  await expect(page.getByRole('link', { name: /^Audiobook / })).toHaveAttribute(
    'href',
    '/book/bookshelf%3A1%3Afixture?f=audio&lookupTitle=Local+Book'
  );
  await page.route(
    '**/api/v1/book/bookshelf%3A1%3Afixture/ratings?lookupTitle=Local+Book',
    (route) =>
      route.fulfill({
        json: {
          average: 4.2,
          count: 24,
          source: 'openlibrary',
          workId: 'OL123W',
        },
      })
  );
  await page.goto('/book/bookshelf%3A1%3Afixture?lookupTitle=Local+Book');
  await expect(page.getByRole('heading', { name: 'Local Book' })).toBeVisible();
  await expect(
    page.getByRole('link', { name: '4.2/5 · Open Library' })
  ).toHaveAttribute('href', 'https://openlibrary.org/works/OL123W');
  await expect(association).toHaveCount(0);
  await page.getByRole('link', { name: /^Audiobook / }).click();
  const audio = new URL(page.url());
  expect(audio.searchParams.get('f')).toBe('audio');
  expect(audio.searchParams.get('lookupTitle')).toBe('Local Book');
  await expect(page.getByRole('heading', { name: 'Local Book' })).toBeVisible();
  await page.getByRole('link', { name: /Ebook.*EPUB/i }).click();
  const ebook = new URL(page.url());
  expect(ebook.searchParams.has('f')).toBe(false);
  expect(ebook.searchParams.get('lookupTitle')).toBe('Local Book');
});

test('native companion discovery filters retain genre matching and clear without reapplying aliases', async ({
  page,
}) => {
  await fixtures(page);
  const reads: URLSearchParams[] = [];
  await page.route(/\/api\/v1\/discover\/movies\?/, (route) => {
    reads.push(new URL(route.request().url()).searchParams);
    return route.fulfill({ json: paged([movie]) });
  });
  await page.goto(
    './movies?nativeFilters=1&genre=18%2C35&sortBy=vote_average.desc&keywords=12&search=The+Film'
  );
  await expect
    .poll(() => Object.fromEntries(reads.at(-1) ?? []))
    .toMatchObject({
      genre: '18,35',
      sortBy: 'vote_average.desc',
      keywords: '12',
      voteCountGte: '50',
      search: 'The Film',
    });
  const title = page.getByRole('searchbox', { name: 'Title', exact: true });
  await expect(title).toHaveValue('The Film');
  await title.fill('all');
  await page.getByRole('button', { name: 'Apply Title' }).click();
  await expect.poll(() => reads.at(-1)?.get('search')).toBe('all');
  expect(reads.at(-1)?.get('genre')).toBe('18,35');
  await page.getByRole('button', { name: /clear discovery filters/i }).click();
  await expect.poll(() => reads.at(-1)?.get('sortBy')).toBe('popularity.desc');
  expect(reads.at(-1)?.has('genre')).toBe(false);
  expect(reads.at(-1)?.has('keywords')).toBe(false);
  expect(reads.at(-1)?.has('voteCountGte')).toBe(false);
  expect(reads.at(-1)?.has('search')).toBe(false);
  await expect(page).toHaveURL(/\/movies$/);
});

test('native companion discovery bookmarks retain library availability', async ({
  page,
}) => {
  await fixtures(page);
  const queries: (string | null)[] = [];
  await page.route('**/api/v1/settings/public', (route) =>
    route.fulfill({ json: { enable4k: false, movie4kEnabled: true } })
  );
  await page.route('**/api/v1/discover/movies?**', (route) => {
    queries.push(
      new URL(route.request().url()).searchParams.get('availability')
    );
    return route.fulfill({ json: paged([movie]) });
  });
  for (const [search, selected] of [
    ['libraryView=missing', /^Not on /],
    ['libraryView=available', /^On /],
    ['libraryView=missing&availability=4k&search=Test', /^On /],
  ] as const) {
    queries.length = 0;
    await page.goto(`./movies?nativeFilters=1&${search}`);
    const availability = page.getByRole('group', { name: 'Availability' });
    await expect(
      availability.getByRole('button', { name: selected })
    ).toHaveAttribute('aria-pressed', 'true');
    if (search.includes('availability=4k')) {
      await expect(page.getByText('4K discovery is unavailable')).toBeVisible();
      expect(queries).toEqual([]);
      await page.getByRole('button', { name: 'Show HD Results' }).click();
      await expect(page.getByRole('link', { name: movie.title })).toBeVisible();
      expect(queries).toEqual(['hd']);
      expect(new URL(page.url()).searchParams.has('quality')).toBe(false);
    }
    const all = availability.getByRole('button', { name: 'All', exact: true });
    await all.click();
    await expect(all).toHaveAttribute('aria-pressed', 'true');
    expect(new URL(page.url()).searchParams.has('libraryView')).toBe(false);
  }
});

test('a saved 4K discovery filter waits for availability settings and retries failures', async ({
  page,
}) => {
  await fixtures(page);
  let settingsAvailable = false;
  const queries: (string | null)[] = [];
  await page.route('**/api/v1/settings/public', (route) =>
    settingsAvailable
      ? route.fulfill({ json: { enable4k: true } })
      : route.fulfill({
          status: 503,
          json: { message: 'Settings unavailable' },
        })
  );
  await page.route('**/api/v1/discover/movies?**', (route) => {
    queries.push(
      new URL(route.request().url()).searchParams.get('availability')
    );
    return route.fulfill({ json: paged([movie]) });
  });
  await page.goto('./movies?nativeFilters=1&availability=4k');
  const error = page.getByRole('alert').filter({ hasText: 'sign-in options' });
  await expect(error).toBeVisible();
  expect(queries).toEqual([]);
  await expect(page.getByText('Nothing here', { exact: true })).toHaveCount(0);
  settingsAvailable = true;
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.getByLabel('Availability Quality')).toHaveValue('4k');
  await expect(page.getByRole('link', { name: movie.title })).toBeVisible();
  expect(queries).toEqual(['4k']);
});

test('native search bookmarks retain the decoded term and media scope', async ({
  page,
}) => {
  await fixtures(page);
  const queries: string[] = [];
  const types: (string | null)[] = [];
  const creditFlags: (string | null)[] = [];
  await page.route(/\/api\/v1\/search\?/, (route) => {
    const params = new URL(route.request().url()).searchParams;
    queries.push(params.get('query') ?? '');
    const type = params.get('type');
    types.push(type);
    const includeCredits = params.get('includeCredits');
    creditFlags.push(includeCredits);
    return route.fulfill({
      json: paged([
        { ...movie, title: 'Bookmark Film' },
        {
          id: 202,
          mediaType: 'tv',
          name: 'Bookmark Series',
          firstAirDate: '2020-03-01',
          voteAverage: 7.12,
          ...(type === 'tv' && includeCredits !== 'false'
            ? { writers: ['Zara'], directors: ['Ada'] }
            : {}),
        },
        {
          id: 203,
          mediaType: 'tv',
          name: 'Another Series',
          firstAirDate: '2024-03-01',
          voteAverage: 7.9,
          ...(type === 'tv' && includeCredits !== 'false'
            ? { writers: ['Ada'], directors: ['Zara'] }
            : {}),
        },
        { id: 204, mediaType: 'tv', name: 'Undated Series' },
      ]),
    });
  });
  await page.goto('./search?query=A+%26+B&type=tv&sort=title&order=desc');
  await expect(page.getByRole('searchbox')).toHaveValue('A & B');
  await expect(
    page.getByRole('button', { name: 'Series', exact: true })
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(
    page.getByRole('link', { name: 'Bookmark Series' })
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Bookmark Film' })).toHaveCount(
    0
  );
  expect(queries).toContain('A & B');
  expect(types.at(-1)).toBe('tv');
  expect(creditFlags.at(-1)).toBe('false');
  const seriesLinks = page.getByRole('link', {
    name: /^(Bookmark|Another|Undated) Series$/,
  });
  await expect(seriesLinks.first()).toHaveAccessibleName('Undated Series');
  await page.getByLabel('Sort Results').selectOption('title:asc');
  await expect(seriesLinks.first()).toHaveAccessibleName('Another Series');
  await page.getByLabel('Sort Results').selectOption('date:asc');
  await expect(seriesLinks.first()).toHaveAccessibleName('Bookmark Series');
  await expect(seriesLinks.last()).toHaveAccessibleName('Undated Series');
  await page.getByLabel('Sort Results').selectOption('date:desc');
  await expect(seriesLinks.first()).toHaveAccessibleName('Another Series');
  await expect(seriesLinks.last()).toHaveAccessibleName('Undated Series');
  await page.getByLabel('Sort Results').selectOption('rating:desc');
  await expect(seriesLinks.first()).toHaveAccessibleName('Another Series');
  await expect(seriesLinks.last()).toHaveAccessibleName('Undated Series');
  await page.getByLabel('Sort Results').selectOption('rating:asc');
  await expect(seriesLinks.first()).toHaveAccessibleName('Bookmark Series');
  await expect(seriesLinks.last()).toHaveAccessibleName('Undated Series');
  await page.getByLabel('Sort Results').selectOption('writer:asc');
  await expect(seriesLinks.first()).toHaveAccessibleName('Another Series');
  expect(types.at(-1)).toBe('tv');
  expect(creditFlags.at(-1)).toBeNull();
  await page.getByLabel('Sort Results').selectOption('director:asc');
  await expect(seriesLinks.first()).toHaveAccessibleName('Bookmark Series');
  await expect(seriesLinks.last()).toHaveAccessibleName('Undated Series');
  await page.getByLabel('Sort Results').selectOption('');
  await page.getByRole('button', { name: 'Movies', exact: true }).click();
  await expect(page).toHaveURL(/\/search\?q=A\+%26\+B&f=movie$/);
  await expect(page.getByRole('link', { name: 'Bookmark Film' })).toBeVisible();
});

test('Franchise opens related titles and confirms a server-authorized relationship', async ({
  page,
}) => {
  await fixtures(page);
  let verified = false;
  let additions = 0;
  await page.route('**/api/v1/tv/202', (route) =>
    route.fulfill({
      json: {
        ...movie,
        id: 202,
        title: undefined,
        name: 'Fixture Series',
        mediaType: 'tv',
        seasons: [],
      },
    })
  );
  await page.route('**/api/v1/franchise/tv/202', (route) =>
    route.fulfill({
      json: {
        anchor: { title: 'Fixture Series' },
        canCurate: true,
        notes: [],
        items: [
          {
            group: 'sequel',
            title: 'Fixture Sequel',
            mediaType: 'tv',
            href: '/tv/203',
            confidence: 'high',
            evidence: 'Catalogue relation',
            verified,
            relationId: 9,
          },
          ...(additions > 1
            ? [
                {
                  group: 'soundtrack',
                  title: 'Fixture Soundtrack',
                  mediaType: 'album',
                  href: '/music/album-22',
                  confidence: 'high',
                  verified: true,
                  relationId: 10,
                },
              ]
            : []),
        ],
      },
    })
  );
  await page.route('**/api/v1/franchise/relations/9', (route) => {
    expect(route.request().method()).toBe('PATCH');
    expect(route.request().postDataJSON()).toEqual({ verified: true });
    verified = true;
    return route.fulfill({ json: {} });
  });
  await page.route('**/api/v1/franchise/relations', (route) => {
    expect(route.request().method()).toBe('POST');
    expect(route.request().postDataJSON()).toEqual({
      fromType: 'tv',
      fromId: '202',
      toType: 'album',
      toId: 'album-22',
      title: 'Fixture Soundtrack',
      relation: 'soundtrack',
      href: '/music/album-22',
    });
    if (++additions === 1)
      return route.fulfill({
        status: 503,
        json: { message: 'Relationship save unavailable.' },
      });
    return route.fulfill({ status: 201, json: { ok: true } });
  });
  await page.route('**/api/v1/follow', (route) =>
    route.fulfill({ json: { results: [] } })
  );
  await page.goto('/tv/202');
  await page.getByRole('link', { name: 'Franchise', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Franchise for Fixture Series' })
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Fixture Sequel' })
  ).toHaveAttribute('href', '/tv/203');
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.getByText('tv · Verified')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Confirm', exact: true })
  ).toHaveCount(0);
  await page
    .getByRole('button', { name: 'Add Relationship', exact: true })
    .click();
  await page.getByLabel('Related Title').fill('Fixture Soundtrack');
  await page.getByLabel('Catalogue ID').fill('album-22');
  await page.getByLabel('Media Type').selectOption('album');
  await page
    .getByLabel('Relationship', { exact: true })
    .selectOption('soundtrack');
  const save = page.getByRole('button', { name: 'Save Relationship' });
  await save.click();
  await expect(page.getByText('Relationship save unavailable.')).toBeVisible();
  await expect(page.getByLabel('Catalogue ID')).toHaveValue('album-22');
  await save.click();
  await expect(
    page.getByRole('link', { name: 'Fixture Soundtrack' })
  ).toHaveAttribute('href', '/music/album-22');
  expect(additions).toBe(2);
});

test('Following opens the exact anime franchise from a relationship update', async ({
  page,
}) => {
  await fixtures(page);
  await page.route('**/api/v1/auth/me', (route) =>
    route.fulfill({ json: { id: 1, displayName: 'Viewer', permissions: 32 } })
  );
  await page.route(/\/api\/v1\/follow\/events\?/, (route) =>
    route.fulfill({
      json: {
        total: 1,
        results: [
          {
            id: 1,
            title: 'Franchise Fixture',
            seen: true,
            follow: { kind: 'franchise', subjectLabel: 'Franchise Fixture' },
            reasonValues: { relation: 'side-story' },
            target: { mediaType: 'anime', id: '713' },
          },
        ],
      },
    })
  );
  await page.route('**/api/v1/franchise/anime/713', (route) =>
    route.fulfill({
      json: {
        anchor: { title: 'Anime Side Story' },
        items: [],
        notes: [],
        canCurate: false,
      },
    })
  );
  await page.goto('/following');
  const event = page.getByRole('link', {
    name: 'Franchise Fixture',
    exact: true,
  });
  await expect(event).toHaveAttribute('href', '/franchise/anime/713');
  await expect(page.getByText('side story', { exact: true })).toBeVisible();
  await event.click();
  await expect(
    page.getByRole('heading', { name: 'Franchise for Anime Side Story' })
  ).toBeVisible();
});

test('Provider Discovery filters unmatched rows and opens a bookmarked MDBList feed', async ({
  page,
  baseURL,
}) => {
  await fixtures(page);
  const requests: URLSearchParams[] = [];
  await page.route(
    /\/api\/v1\/integrations\/discovery\/feeds\/mdblist\/list\?/,
    (route) => {
      const query = new URL(route.request().url()).searchParams;
      requests.push(query);
      const number = Number(query.get('page'));
      return route.fulfill({
        json: {
          page: number,
          hasMore: number === 1,
          missingMappings: number === 1 ? 1 : 0,
          items:
            number === 1
              ? [
                  {
                    id: 'matched',
                    title: 'Matched Fixture',
                    mediaType: 'movie',
                    tmdbId: 101,
                    identityResolution: 'curated',
                  },
                  {
                    id: 'external',
                    title: 'External Fixture',
                    mediaType: 'tv',
                    tmdbId: 202,
                    identityResolution: 'external-id',
                  },
                  { id: 'unmatched', title: 'Unmatched Fixture' },
                ]
              : [],
        },
      });
    }
  );
  await page.goto('./providers?feed=mdblist%2Flist&list=viewer%2Ffixture');
  await expect(
    page.getByRole('link', { name: 'Matched Fixture' })
  ).toHaveAttribute('href', new URL('./movie/101', baseURL).pathname);
  expect(requests[0].get('list')).toBe('viewer/fixture');
  await expect(page.getByText(/Curated match/)).toBeVisible();
  await expect(page.getByText(/Matched by catalog ID/)).toBeVisible();
  await expect(page.getByText('1 unmatched title on this page')).toBeVisible();
  const unmatched = page.getByRole('checkbox', { name: 'Unmatched Only' });
  await unmatched.click();
  await expect(unmatched).toBeChecked();
  await expect(page.getByText('Unmatched Fixture')).toBeVisible();
  await expect(
    page.getByText('This title has no stable provider ID for saving a match.')
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Matched Fixture' })).toHaveCount(
    0
  );
  await page.getByRole('button', { name: 'Next Page' }).click();
  await expect(
    page.getByText('No unmatched titles on this page.')
  ).toBeVisible();
  expect(requests.at(-1)?.get('page')).toBe('2');
  await expect(page.getByText('1 unmatched title on this page')).toHaveCount(0);
});

test('Provider Discovery saves and resets an exact viewer title match', async ({
  page,
  baseURL,
}) => {
  await fixtures(page);
  let matched = false;
  let writes = 0;
  await page.route(
    /\/api\/v1\/integrations\/discovery\/feeds\/anilist\/trending\?/,
    (route) =>
      route.fulfill({
        json: {
          page: 1,
          hasMore: false,
          items: [
            {
              id: 'anilist:42',
              title: 'Provider Fixture',
              mappingAvailable: true,
              ...(matched
                ? { mediaType: 'tv', tmdbId: 202, identityMapped: true }
                : {}),
            },
          ],
        },
      })
  );
  await page.route(/\/api\/v1\/search\?/, (route) => {
    const params = new URL(route.request().url()).searchParams;
    expect(params.get('query')).toBe('Provider Fixture');
    expect(params.get('type')).toBe('tv');
    return route.fulfill({
      json: paged([{ id: 202, mediaType: 'tv', name: 'Catalogue Series' }]),
    });
  });
  await page.route('**/api/v1/integrations/discovery/mappings', (route) => {
    expect(route.request().method()).toBe('PUT');
    expect(route.request().postDataJSON()).toEqual({
      identity: 'anilist:42',
      tmdbId: 202,
      mediaType: 'tv',
    });
    matched = true;
    writes++;
    return route.fulfill({ json: {} });
  });
  await page.route(
    '**/api/v1/integrations/discovery/mappings/anilist%3A42',
    (route) => {
      expect(route.request().method()).toBe('DELETE');
      matched = false;
      writes++;
      return route.fulfill({ status: 204 });
    }
  );

  await page.goto('./providers');
  await page.getByRole('button', { name: 'Match Title', exact: true }).click();
  await page.getByLabel('Match Media Type').selectOption('tv');
  await page.getByRole('button', { name: 'Search Matches' }).click();
  await page.getByRole('button', { name: 'Match Catalogue Series' }).click();
  await expect(
    page.getByRole('link', { name: 'Provider Fixture', exact: true })
  ).toHaveAttribute('href', new URL('./tv/202', baseURL).pathname);
  await expect(page.getByText(/Personal match/)).toBeVisible();
  await page.getByRole('button', { name: 'Reset Match' }).click();
  await expect(
    page.getByRole('link', { name: 'Provider Fixture', exact: true })
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Match Title', exact: true })
  ).toBeVisible();
  expect(writes).toBe(2);
});

test('Provider Discovery waits for Retry-After and offers provider reconnect', async ({
  page,
  baseURL,
}) => {
  await fixtures(page);
  let attempts = 0;
  await page.route(
    /\/api\/v1\/integrations\/discovery\/feeds\/anilist\/trending\?/,
    (route) => {
      if (++attempts === 1) {
        return route.fulfill({
          status: 429,
          headers: { 'Retry-After': '2' },
          json: {
            code: 'PROVIDER_RATE_LIMITED',
            message: 'The provider request limit was reached.',
          },
        });
      }
      return route.fulfill({ json: { page: 1, items: [], hasMore: false } });
    }
  );
  await page.route(
    /\/api\/v1\/integrations\/discovery\/feeds\/trakt\/watchlist\?/,
    (route) =>
      route.fulfill({
        status: 409,
        json: {
          code: 'RECONNECT_REQUIRED',
          message: 'Reconnect your provider account under Linked Accounts.',
        },
      })
  );
  await page.goto('./providers');
  const retry = page.getByRole('button', { name: 'Retry', exact: true });
  await expect(retry).toBeDisabled();
  await expect(page.getByRole('alert')).toContainText('Retry in');
  expect(attempts).toBe(1);
  await expect(retry).toBeEnabled();
  await retry.click();
  await expect(page.getByText('No titles on this page.')).toBeVisible();
  expect(attempts).toBe(2);
  await page.getByLabel('Provider Feed').selectOption('trakt/watchlist');
  await expect(
    page.getByRole('link', { name: 'Reconnect Provider' })
  ).toHaveAttribute(
    'href',
    new URL('./me/account/linked-accounts', baseURL).pathname +
      '?reconnect=trakt'
  );
  await expect(retry).toHaveCount(0);
});

test('TV access review confirms a decision and respects manager permissions', async ({
  page,
}) => {
  await fixtures(page);
  let requests = [
    { id: 1, displayName: 'Owner', requestedAt: null },
    { id: 9, displayName: 'Household Member', requestedAt: null },
    { id: 10, displayName: 'Another Member', requestedAt: null },
    { id: 11, displayName: 'Already Reviewed', requestedAt: null },
  ];
  let reads = 0;
  let decision: unknown;
  let declined: unknown;
  await page.route('**/api/v1/user/tv-season-watch-gate-requests', (route) => {
    reads++;
    return route.fulfill({ json: requests });
  });
  await page.route('**/api/v1/user/1/settings/tv-season-watch-gate', (route) =>
    route.fulfill({ json: { status: 'off', globallyEnabled: false } })
  );
  await page.route('**/api/v1/user/1/settings/episode-queue', (route) =>
    route.fulfill({ json: { defaultEpisodeCount: 0 } })
  );
  await page.route(
    '**/api/v1/user/9/settings/tv-season-watch-gate/review',
    (route) => {
      decision = route.request().postDataJSON();
      requests = requests.filter(({ id }) => id !== 9);
      return route.fulfill({ json: { status: 'approved' } });
    }
  );
  await page.route(
    '**/api/v1/user/10/settings/tv-season-watch-gate/review',
    (route) => {
      declined = route.request().postDataJSON();
      requests = requests.filter(({ id }) => id !== 10);
      return route.fulfill({ json: { status: 'denied' } });
    }
  );
  await page.route(
    '**/api/v1/user/11/settings/tv-season-watch-gate/review',
    (route) => {
      requests = requests.filter(({ id }) => id !== 11);
      return route.fulfill({
        status: 409,
        json: { message: 'This access request is no longer pending.' },
      });
    }
  );
  await page.goto('/me/account/tv-requests');
  await expect(
    page.getByText('Another user manager must review your request.')
  ).toBeVisible();
  await page
    .getByRole('listitem')
    .filter({ hasText: 'Household Member' })
    .getByRole('button', { name: 'Approve' })
    .click();
  const dialog = page.getByRole('alertdialog', {
    name: 'Approve access for Household Member?',
  });
  await expect(dialog).toBeVisible();
  expect(decision).toBeUndefined();
  await dialog.getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByText('Request approved.')).toBeVisible();
  await expect(page.getByText('Household Member')).toHaveCount(0);
  expect(decision).toEqual({ decision: 'approve' });
  const decline = page
    .getByRole('listitem')
    .filter({ hasText: 'Another Member' })
    .getByRole('button', { name: 'Decline' });
  await decline.click();
  const declineDialog = page.getByRole('alertdialog', {
    name: 'Decline access for Another Member?',
  });
  await declineDialog.getByRole('button', { name: 'Cancel' }).click();
  expect(declined).toBeUndefined();
  await decline.click();
  await declineDialog.getByRole('button', { name: 'Decline' }).click();
  await expect(page.getByText('Request declined.')).toBeVisible();
  await expect(page.getByText('Another Member')).toHaveCount(0);
  expect(declined).toEqual({ decision: 'deny' });

  await page
    .getByRole('listitem')
    .filter({ hasText: 'Already Reviewed' })
    .getByRole('button', { name: 'Approve' })
    .click();
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Approve' })
    .click();
  await expect(page.getByRole('alert')).toContainText(
    'This access request is no longer pending.'
  );
  await expect(
    page.getByRole('listitem').filter({ hasText: 'Already Reviewed' })
  ).toHaveCount(0);
  const managerReads = reads;
  await page.route('**/api/v1/auth/me', (route) =>
    route.fulfill({ json: { id: 1, displayName: 'Owner', permissions: 32 } })
  );
  await page.reload();
  await expect(page.getByText('Approval needed')).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Previous-Season Watch Requests' })
  ).toHaveCount(0);
  expect(reads).toBe(managerReads);
});

test('Share opens a recognized title and requests the selected seasons', async ({
  page,
}) => {
  await fixtures(page);
  const requests: unknown[] = [];
  await page.route('**/api/v1/resolve/capabilities', (route) =>
    route.fulfill({ json: { enabled: true } })
  );
  await page.route('**/api/v1/resolve', (route) => {
    expect(route.request().postDataJSON()).toEqual({
      text: 'Example Series',
      formatHint: 'ebook',
    });
    return route.fulfill({
      json: {
        groups: [
          {
            input: 'Example Series',
            autoSelected: 0,
            candidates: [
              {
                mediaType: 'tv',
                id: '42',
                title: 'Example Series',
                evidence: 'Title match',
              },
            ],
          },
        ],
      },
    });
  });
  await page.route('**/api/v1/request', (route) => {
    requests.push(route.request().postDataJSON());
    return route.fulfill({ json: { id: 1 } });
  });

  await page.goto('/share?title=Example+Series');
  await expect(page.getByLabel('Titles, links, or ISBNs')).toHaveValue(
    'Example Series'
  );
  await page.getByRole('button', { name: 'Find Matches' }).click();
  await expect(page.getByRole('link', { name: 'Open Title' })).toHaveAttribute(
    'href',
    '/tv/42'
  );
  await page.getByLabel('Series Seasons').selectOption('all');
  expect(requests).toHaveLength(0);
  await page.getByRole('button', { name: 'Request Selected (1)' }).click();
  await expect(page.getByText('Submitted 1 request.')).toBeVisible();
  expect(requests).toEqual([{ mediaType: 'tv', mediaId: 42, seasons: 'all' }]);
  await expect(
    page.getByRole('button', { name: 'Request Selected' })
  ).toHaveCount(0);
});

test('Share uploads image bytes and can fall back to typed text', async ({
  page,
}) => {
  await fixtures(page);
  const image = Buffer.from('mock image bytes');
  const candidate = {
    mediaType: 'movie',
    id: '101',
    title: 'The Test Film',
    evidence: 'Title match',
  };
  let uploads = 0;
  await page.route('**/api/v1/resolve/capabilities', (route) =>
    route.fulfill({ json: { enabled: true, image: true, maxImageBytes: 100 } })
  );
  await page.route('**/api/v1/resolve/image?formatHint=ebook', (route) => {
    expect(route.request().headers()['content-type']).toBe('image/png');
    expect(route.request().postDataBuffer()).toEqual(image);
    if (++uploads === 2)
      return route.fulfill({
        status: 422,
        json: { message: 'Unreadable image' },
      });
    return route.fulfill({
      json: {
        groups: [
          { input: 'From image', autoSelected: 0, candidates: [candidate] },
        ],
      },
    });
  });
  await page.route('**/api/v1/resolve', (route) =>
    route.fulfill({
      json: {
        groups: [
          { input: 'From text', autoSelected: 0, candidates: [candidate] },
        ],
      },
    })
  );
  await page.goto('/share');
  await page.getByLabel('Image', { exact: true }).setInputFiles({
    name: 'oversized.png',
    mimeType: 'image/png',
    buffer: Buffer.alloc(101),
  });
  await expect(page.getByRole('alert')).toContainText('upload limit');
  const find = page.getByRole('button', { name: 'Find Matches' });
  await expect(find).toBeDisabled();
  await page.getByLabel('Image', { exact: true }).setInputFiles({
    name: 'poster.png',
    mimeType: 'image/png',
    buffer: image,
  });
  expect(uploads).toBe(0);
  await find.click();
  await expect(page.getByRole('link', { name: 'Open Title' })).toHaveAttribute(
    'href',
    '/movie/101'
  );
  await page.getByLabel('Titles, links, or ISBNs').fill('The Test Film');
  await find.click();
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: 'Showing matches from the text' })
  ).toBeVisible();
  await expect(page.getByText('From text', { exact: true })).toBeVisible();
  await expect(page.getByText('From image', { exact: true })).toHaveCount(0);
});

test('Share reads an ISBN locally when server OCR is disabled', async ({
  page,
}) => {
  await fixtures(page);
  await page.addInitScript(() => {
    Object.defineProperty(window, 'BarcodeDetector', {
      configurable: true,
      value: class {
        async detect() {
          return [{ rawValue: '9780140328721' }];
        }
      },
    });
    window.createImageBitmap = async () => ({ close() {} }) as ImageBitmap;
  });
  await page.route('**/api/v1/resolve/capabilities', (route) =>
    route.fulfill({ json: { enabled: true, image: false, maxImageBytes: 100 } })
  );
  let uploads = 0;
  await page.route('**/api/v1/resolve/image?*', (route) => {
    uploads++;
    return route.abort();
  });
  await page.route('**/api/v1/resolve', (route) => {
    expect(route.request().postDataJSON()).toEqual({
      text: '9780140328721',
      formatHint: 'ebook',
    });
    return route.fulfill({ json: { groups: [] } });
  });

  await page.goto('/share');
  await page.getByLabel('Image', { exact: true }).setInputFiles({
    name: 'barcode.png',
    mimeType: 'image/png',
    buffer: Buffer.from('fixture'),
  });
  await expect(page.getByLabel('Titles, links, or ISBNs')).toHaveValue(
    '9780140328721'
  );
  await expect(page.getByText('Found ISBN 9780140328721.')).toBeVisible();
  await page.getByRole('button', { name: 'Find Matches' }).click();
  await expect(page.getByText('No matches found.')).toBeVisible();
  expect(uploads).toBe(0);
});

test('installed Share Target hands text and image to Share once', async ({
  page,
}) => {
  await fixtures(page);
  await page.route('**/api/v1/resolve/capabilities', (route) =>
    route.fulfill({ json: { enabled: true, image: true, maxImageBytes: 100 } })
  );
  const base = process.env.LUMEN_TEST_SHARE_BASE ?? '/';
  await page.goto(base + 'share');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(href).toBe(base + 'manifest.webmanifest');
  const manifestUrl = new URL(href!, page.url());
  const response = await page.request.get(manifestUrl.href);
  expect(response.ok()).toBe(true);
  const { share_target: target } = await response.json();
  expect(target.method).toBe('POST');
  expect(target.enctype).toBe('multipart/form-data');
  const action = new URL(target.action, manifestUrl);
  expect(action.pathname).toBe(base + 'share-target');
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          new URL(
            navigator.serviceWorker.controller?.scriptURL ?? location.href
          ).pathname
      )
    )
    .toBe(base + 'share-worker.js');
  await page.evaluate((actionUrl) => {
    const form = document.createElement('form');
    form.action = actionUrl;
    form.method = 'post';
    form.enctype = 'multipart/form-data';
    const text = document.createElement('input');
    text.name = 'text';
    text.value = 'From the OS';
    const image = document.createElement('input');
    image.type = 'file';
    image.name = 'image';
    const files = new DataTransfer();
    files.items.add(
      new File(['fixture'], 'from-os.png', { type: 'image/png' })
    );
    image.files = files.files;
    form.append(text, image);
    document.body.append(form);
    form.submit();
  }, action.href);
  await expect(page.getByLabel('Titles, links, or ISBNs')).toHaveValue(
    'From the OS'
  );
  await expect(page.getByText('from-os.png', { exact: true })).toBeVisible();
  await expect(page).toHaveURL(new URL(base + 'share', manifestUrl).href);
  expect(
    await page.evaluate(
      async () => (await (await caches.open('lumen-share-inbox')).keys()).length
    )
  ).toBe(0);
});

test('bundled Share consumes a native image handoff', async ({ page }) => {
  const base = process.env.LUMEN_TEST_SHARE_BASE;
  test.skip(base !== '/lumen/', 'Native shares use the bundled deployment');
  await fixtures(page);
  await page.route('**/api/v1/resolve/capabilities', (route) =>
    route.fulfill({ json: { enabled: true, image: true, maxImageBytes: 100 } })
  );
  await page.goto('/lumen/share');
  await page.evaluate(async () => {
    const cache = await caches.open('seerrng-share-inbox');
    await cache.put(
      '/__share-inbox/image',
      new Response('fixture', {
        headers: { 'Content-Type': 'image/png' },
      })
    );
  });
  await page.goto('/lumen/share?text=Native+share&image=1');
  await expect(page.getByLabel('Titles, links, or ISBNs')).toHaveValue(
    'Native share'
  );
  await expect(page.getByText('shared-image', { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/lumen\/share\?text=Native\+share$/);
  expect(
    await page.evaluate(
      async () =>
        (await (await caches.open('seerrng-share-inbox')).keys()).length
    )
  ).toBe(0);
});

test('Track Requests scopes the queue and confirms manager approval and cancellation', async ({
  page,
}) => {
  await fixtures(page);
  let approved = false;
  let cancelled = false;
  await page.route('**/api/v1/soulseek/status', (route) =>
    route.fulfill({ json: { configured: true } })
  );
  await page.route(/\/api\/v1\/soulseek\/track-requests\?/, (route) =>
    route.fulfill({
      json: {
        results:
          !cancelled &&
          new URL(route.request().url()).searchParams.get('scope') === 'all'
            ? [
                {
                  id: 7,
                  title: 'Example Track',
                  artist: 'Example Artist',
                  status: approved ? 'searching' : 'pending',
                  searchCount: 1,
                  lastMatchCount: 2,
                  requestedBy: { id: 9, displayName: 'Member' },
                },
              ]
            : [],
      },
    })
  );
  await page.route('**/api/v1/soulseek/track-requests/7/approve', (route) => {
    expect(route.request().method()).toBe('POST');
    approved = true;
    return route.fulfill({ json: { status: 'searching' } });
  });
  await page.route('**/api/v1/soulseek/track-requests/7', (route) => {
    expect(route.request().method()).toBe('DELETE');
    cancelled = true;
    return route.fulfill({ json: { status: 'cancelled' } });
  });
  const base = process.env.LUMEN_TEST_SHARE_BASE ?? '/';
  await page.goto(base + 'track-requests');
  await expect(
    page.getByRole('link', { name: 'Identify a Song' })
  ).toHaveAttribute('href', base + 'identify');
  await expect(
    page.getByText('No track requests match these filters.')
  ).toBeVisible();
  await page.getByLabel('Scope').selectOption('all');
  await expect(page.getByText('Requested by Member')).toBeVisible();
  await page.getByRole('button', { name: 'Approve', exact: true }).click();
  expect(approved).toBe(false);
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Approve' })
    .click();
  await expect(page.getByText('Searches: 1 · Last matches: 2')).toBeVisible();
  expect(approved).toBe(true);
  await page
    .getByRole('button', { name: 'Cancel Request', exact: true })
    .click();
  expect(cancelled).toBe(false);
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Cancel Request' })
    .click();
  await expect(
    page.getByText('No track requests match these filters.')
  ).toBeVisible();
  expect(cancelled).toBe(true);
});

test('Song identification polls and requests the exact recording', async ({
  page,
}) => {
  await fixtures(page);
  const empty = { id: 'run-1', albums: [], tracks: [] };
  let submitted: unknown;
  await page.route('**/api/v1/soulseek/status', (route) =>
    route.fulfill({ json: { configured: true, canRequest: true } })
  );
  await page.route('**/api/v1/soulseek/songid', (route) => {
    expect(route.request().postDataJSON()).toEqual({
      source: 'A song description',
    });
    return route.fulfill({
      status: 202,
      json: { ...empty, status: 'queued', queuePosition: 2 },
    });
  });
  await page.route('**/api/v1/soulseek/songid/run-1', (route) =>
    route.fulfill({
      json: {
        ...empty,
        status: 'completed',
        tracks: [
          {
            recordingId: 'exact-id',
            title: 'A track',
            artist: 'An artist',
            isExact: true,
          },
        ],
      },
    })
  );
  await page.route('**/api/v1/soulseek/track-requests', (route) => {
    submitted = route.request().postDataJSON();
    return route.fulfill({ json: { results: [] } });
  });
  await page.goto('/identify?source=A+song+description');
  await expect(page.getByLabel('Link or Description')).toHaveValue(
    'A song description'
  );
  await page.getByRole('button', { name: 'Identify', exact: true }).click();
  await expect(page.getByText('Waiting in queue (position 2)')).toBeVisible();
  await page
    .getByRole('button', { name: 'Request Track', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Track Requested' })
  ).toBeDisabled();
  expect(submitted).toEqual({
    tracks: [
      {
        artist: 'An artist',
        title: 'A track',
        recordingMbid: 'exact-id',
        source: 'songid',
      },
    ],
  });
});

test('Playlist Import reviews matches and retries only failed requests', async ({
  page,
}) => {
  await fixtures(page);
  const submitted: unknown[] = [];
  let trackAttempts = 0;
  await page.route('**/api/v1/playlist/spotify/status', (route) =>
    route.fulfill({ json: { connected: false } })
  );
  await page.route('**/api/v1/soulseek/status', (route) =>
    route.fulfill({ json: { configured: true, canRequest: true } })
  );
  await page.route('**/api/v1/playlist/resolve', (route) =>
    route.fulfill({
      json: {
        name: 'Fixture Playlist',
        totalItems: 2,
        items: [
          {
            id: 'album-id',
            title: 'Matched Album',
            sourceTitle: 'Source song',
            matchStatus: 'matched',
          },
          {
            id: 'row-2',
            title: 'Unmatched Track',
            artist: 'Artist',
            sourceTitle: 'Unmatched Track',
            matchStatus: 'unmatched',
          },
        ],
      },
    })
  );
  await page.route(
    /\/api\/v1\/(request|soulseek\/track-requests)$/,
    (route) => {
      submitted.push(route.request().postDataJSON());
      if (
        route.request().url().endsWith('/track-requests') &&
        ++trackAttempts === 1
      ) {
        return route.fulfill({
          status: 503,
          json: { message: 'Track service temporarily unavailable.' },
        });
      }
      return route.fulfill({ json: {} });
    }
  );
  await page.goto('/music/playlist-import');
  await page
    .getByLabel('Spotify or YouTube Playlist URL')
    .fill('https://www.youtube.com/playlist?list=fixture');
  await page.getByRole('button', { name: 'Preview Matches' }).click();
  await page.getByRole('checkbox', { name: 'Request Album' }).check();
  await page.getByRole('checkbox', { name: 'Request Track' }).check();
  expect(submitted).toEqual([]);
  await page.getByRole('button', { name: 'Request Selected (2)' }).click();
  await expect(page.getByRole('alert')).toContainText(
    'Track service temporarily unavailable.'
  );
  await expect(page.getByText('Requested', { exact: true })).toHaveCount(1);
  await expect(
    page.getByRole('checkbox', { name: 'Request Track' })
  ).toBeChecked();
  await page.getByRole('button', { name: 'Request Selected (1)' }).click();
  await expect(page.getByText('Requested', { exact: true })).toHaveCount(2);
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(submitted).toEqual([
    { mediaType: 'music', mediaId: 'album-id' },
    {
      tracks: [
        { title: 'Unmatched Track', artist: 'Artist', source: 'playlist' },
      ],
    },
    submitted[1],
  ]);
});

test('Playlist Import reflects Spotify callback and disconnects the account', async ({
  page,
}) => {
  await fixtures(page);
  let connected = true;
  await page.route('**/api/v1/soulseek/status', (route) =>
    route.fulfill({ json: { configured: false } })
  );
  await page.route('**/api/v1/playlist/spotify/status', (route) =>
    route.fulfill({
      json: { connected, displayName: connected ? 'Spotify Member' : null },
    })
  );
  await page.route('**/api/v1/playlist/spotify/disconnect', (route) => {
    expect(route.request().method()).toBe('POST');
    connected = false;
    return route.fulfill({ status: 204 });
  });
  await page.goto('/music/playlist-import?playlist=connected');
  await expect(
    page.getByText('Spotify connected.', { exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Reconnect Spotify' })
  ).toHaveAttribute(
    'href',
    '/api/v1/playlist/spotify/connect?frontend=companion'
  );
  await page.getByRole('button', { name: 'Disconnect Spotify' }).click();
  await expect(
    page.getByText('Spotify disconnected.', { exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Connect Spotify', exact: true })
  ).toBeVisible();
  await expect(page).toHaveURL(/\/music\/playlist-import$/);
});

test('Track Requests can browse history beyond the first page', async ({
  page,
}) => {
  await fixtures(page);
  await page.route('**/api/v1/soulseek/status', (route) =>
    route.fulfill({ json: { configured: true } })
  );
  await page.route(/\/api\/v1\/soulseek\/track-requests\?/, (route) => {
    const params = new URL(route.request().url()).searchParams;
    const skip = Number(params.get('skip'));
    const history = params.get('filter') === 'all';
    return route.fulfill({
      json: {
        pageInfo: { total: history ? 101 : 0, skip, take: 100 },
        results: history
          ? [
              {
                id: skip + 1,
                title: skip ? 'Older track' : 'Recent track',
                artist: 'Artist',
                status: 'completed',
              },
            ]
          : [],
      },
    });
  });
  await page.goto('/track-requests');
  await page.getByLabel('Status').selectOption('all');
  await expect(page.getByText('Recent track')).toBeVisible();
  await page.getByRole('button', { name: 'Next Page' }).click();
  await expect(page.getByText('Older track')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Next Page' })).toBeDisabled();
  await page.getByLabel('Status').selectOption('active');
  await expect(
    page.getByText('No track requests match these filters.')
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Previous Page' })).toHaveCount(
    0
  );
});

test('Provider Discovery clears feed rows when the next feed needs a list', async ({
  page,
}) => {
  await fixtures(page);
  await page.route(
    /\/api\/v1\/integrations\/discovery\/feeds\/anilist\/trending\?/,
    (route) =>
      route.fulfill({
        json: {
          page: 1,
          hasMore: false,
          items: [{ id: 'one', title: 'Prior Feed Title' }],
        },
      })
  );
  await page.goto('./providers');
  await expect(page.getByText('Prior Feed Title')).toBeVisible();
  await page.getByLabel('Provider Feed').selectOption('mdblist/list');
  await expect(page.getByText('Prior Feed Title')).toHaveCount(0);
  await expect(page.getByText('Loading feed…')).toHaveCount(0);
});

test('System Logs filters server entries and excludes non-admins', async ({
  page,
}) => {
  await fixtures(page);
  let reads = 0;
  await page.route(/\/api\/v1\/settings\/logs\?/, (route) => {
    reads++;
    const query = new URL(route.request().url()).searchParams;
    return route.fulfill({
      json: {
        pageInfo: { pages: 1 },
        results: [
          {
            timestamp: '2026-11-18T00:00:00Z',
            level: 'error',
            label: 'Fixture',
            message:
              query.get('search') === 'a&b'
                ? 'Filtered result'
                : 'Initial result',
            data: { attempts: 2 },
          },
        ],
      },
    });
  });
  await page.goto('/me');
  await page.getByRole('link', { name: 'Open System Logs' }).click();
  await expect(page.getByText('Initial result')).toBeVisible();
  await page.getByLabel('Search Logs').fill('a&b');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByText('Filtered result')).toBeVisible();
  await page.getByText('Details', { exact: true }).click();
  await expect(page.getByText('{"attempts":2}', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain(
    'Filtered result'
  );
  let releaseRefresh!: () => void;
  const holdRefresh = new Promise<void>((resolve) => {
    releaseRefresh = resolve;
  });
  await page.route(/\/api\/v1\/settings\/logs\?/, async (route) => {
    reads++;
    await holdRefresh;
    return route.fulfill({ status: 403, json: { message: 'Access denied.' } });
  });
  const refreshing = page.waitForRequest(/\/api\/v1\/settings\/logs\?/);
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await refreshing;
  await expect(page.getByText('Filtered result')).toBeVisible();
  releaseRefresh();
  await expect(page.getByRole('alert')).toContainText('Access denied');
  await expect(page.getByText('Filtered result')).toHaveCount(0);
  const adminReads = reads;
  await page.route('**/api/v1/auth/me', (route) =>
    route.fulfill({ json: { id: 1, displayName: 'Member', permissions: 32 } })
  );
  await page.goto('/admin/logs');
  await expect(page).toHaveURL(/\/me$/);
  await expect(
    page.getByRole('link', { name: 'Open System Logs' })
  ).toHaveCount(0);
  expect(reads).toBe(adminReads);
});

test('Media Categories saves only changed instance switches and excludes non-admins', async ({
  page,
}) => {
  await fixtures(page);
  let permissions = 2;
  let reads = 0;
  const writes: unknown[] = [];
  const categories = { movie: true, tv: true, adult: false };
  await page.route('**/api/v1/auth/me', (route) =>
    route.fulfill({ json: { id: 1, displayName: 'Viewer', permissions } })
  );
  await page.route('**/api/v1/settings/main', (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      writes.push(body);
      Object.assign(categories, body.enabledMediaCategories);
    } else reads++;
    return route.fulfill({ json: { enabledMediaCategories: categories } });
  });
  await page.goto('/me');
  await page.getByRole('link', { name: 'Open Media Categories' }).click();
  await page.getByRole('checkbox', { name: 'Movies', exact: true }).uncheck();
  await page.getByRole('button', { name: 'Save Categories' }).click();
  await expect(page.getByText('Category settings saved.')).toBeVisible();
  expect(writes).toEqual([{ enabledMediaCategories: { movie: false } }]);
  await expect(page.getByRole('checkbox', { name: 'Series' })).toBeChecked();
  await page.reload();
  await expect(
    page.getByRole('checkbox', { name: 'Movies', exact: true })
  ).not.toBeChecked();

  const adminReads = reads;
  permissions = 8;
  await page.goto('/admin/categories');
  await expect(page).toHaveURL(/\/me$/);
  expect(reads).toBe(adminReads);
});

test('Default user categories save independently of instance availability', async ({
  page,
}) => {
  await fixtures(page);
  const response = {
    enabledMediaCategories: { movie: true, tv: true },
    defaultEnabledMediaCategories: { movie: true, tv: true },
  };
  const writes: unknown[] = [];
  await page.route('**/api/v1/settings/main', (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      writes.push(body);
      Object.assign(
        response.defaultEnabledMediaCategories,
        body.defaultEnabledMediaCategories
      );
    }
    return route.fulfill({ json: response });
  });
  await page.goto('/admin/categories');
  const available = page.locator('section').filter({
    has: page.getByRole('heading', { name: 'Available Categories' }),
  });
  const defaults = page.locator('section').filter({
    has: page.getByRole('heading', { name: 'Default User Categories' }),
  });
  await available.getByRole('checkbox', { name: 'Series' }).uncheck();
  await defaults
    .getByRole('checkbox', { name: 'Movies', exact: true })
    .uncheck();
  await defaults
    .getByRole('button', { name: 'Save Default Categories' })
    .click();
  await expect(defaults.getByText('Default categories saved.')).toBeVisible();
  expect(writes).toEqual([{ defaultEnabledMediaCategories: { movie: false } }]);
  await expect(
    available.getByRole('button', { name: 'Save Categories' })
  ).toBeEnabled();
  await page.reload();
  await expect(
    defaults.getByRole('checkbox', { name: 'Movies', exact: true })
  ).not.toBeChecked();
  await expect(
    available.getByRole('checkbox', { name: 'Series' })
  ).toBeChecked();
});

test('Instance Age Gate saves changed settings without submitting category drafts', async ({
  page,
}) => {
  await fixtures(page);
  const ageGate = {
    defaultRestricted: false,
    maxMovieCertification: 'PG-13',
    maxTvCertification: 'TV-14',
    certificationCountry: 'US',
  };
  const writes: unknown[] = [];
  await page.route('**/api/v1/settings/main', (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      writes.push(body);
      if (writes.length === 1) {
        return route.fulfill({
          status: 503,
          json: { message: 'Could not save settings.' },
        });
      }
      Object.assign(ageGate, body.ageGate);
    }
    return route.fulfill({
      json: { enabledMediaCategories: { movie: true }, ageGate },
    });
  });
  await page.goto('/admin/categories');
  const movies = page.getByRole('checkbox', { name: 'Movies', exact: true });
  const restricted = page.getByRole('checkbox', {
    name: 'Restrict Accounts by Default',
  });
  const movieLimit = page.getByLabel('Highest Movie Rating');
  const country = page.getByLabel('Rating Country');
  const save = page.getByRole('button', { name: 'Save Age Gate' });
  await movies.uncheck();
  await restricted.check();
  await movieLimit.selectOption('PG');
  await country.fill('c');
  await expect(save).toBeDisabled();
  await country.fill('ca');
  await save.click();
  await expect(page.getByRole('alert')).toContainText(
    'Could not save settings.'
  );
  await expect(restricted).toBeChecked();
  await expect(country).toHaveValue('ca');
  await save.click();
  await expect(page.getByText('Age Gate settings saved.')).toBeVisible();
  await expect(country).toHaveValue('CA');
  await expect(movies).not.toBeChecked();
  await expect(
    page.getByRole('button', { name: 'Save Categories' })
  ).toBeEnabled();
  const patch = {
    ageGate: {
      defaultRestricted: true,
      maxMovieCertification: 'PG',
      certificationCountry: 'CA',
    },
  };
  expect(writes).toEqual([patch, patch]);
  await page.reload();
  await expect(restricted).toBeChecked();
  await expect(movieLimit).toHaveValue('PG');
  await expect(page.getByLabel('Highest Series Rating')).toHaveValue('TV-14');
  await expect(movies).toBeChecked();
});

test('General Settings retains application edits after failure and saves only changed fields', async ({
  page,
}) => {
  await fixtures(page);
  const saved = {
    applicationTitle: 'SeerrNG',
    applicationUrl: 'https://seerr.example.test',
    cacheImages: true,
    versionCheck: true,
    otherUsersAvailability: 'show',
  };
  const writes: unknown[] = [];
  await page.route('**/api/v1/settings/main', (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      writes.push(body);
      if (writes.length === 1) {
        return route.fulfill({
          status: 503,
          json: { message: 'Could not save settings.' },
        });
      }
      Object.assign(saved, body);
    }
    return route.fulfill({ json: saved });
  });
  await page.goto('/me');
  await page.getByRole('link', { name: 'Open General Settings' }).click();
  const title = page.getByLabel('Application Title');
  const save = page.getByRole('button', { name: 'Save Application Settings' });
  await expect(title).toHaveValue('SeerrNG');
  await expect(save).toBeDisabled();
  await title.fill('Family Library');
  await save.click();
  await expect(page.getByRole('alert')).toContainText(
    'Could not save settings.'
  );
  await expect(title).toHaveValue('Family Library');
  await save.click();
  await expect(page.getByText('Application settings saved.')).toBeVisible();
  await expect(save).toBeDisabled();
  const address = page.getByLabel('Application URL');
  await expect(address).toHaveValue('https://seerr.example.test');
  await address.clear();
  await page.getByRole('checkbox', { name: 'Cache Images' }).uncheck();
  await page.getByRole('checkbox', { name: 'Version Check' }).uncheck();
  await page
    .getByLabel('Other Users’ Availability')
    .selectOption('distinguish');
  await save.click();
  await expect(page.getByText('Application settings saved.')).toBeVisible();
  await expect(save).toBeDisabled();
  expect(writes).toEqual([
    { applicationTitle: 'Family Library' },
    { applicationTitle: 'Family Library' },
    {
      applicationUrl: '',
      cacheImages: false,
      versionCheck: false,
      otherUsersAvailability: 'distinguish',
    },
  ]);
  await page.reload();
  await expect(
    page.getByRole('checkbox', { name: 'Cache Images' })
  ).not.toBeChecked();
  await expect(
    page.getByRole('checkbox', { name: 'Version Check' })
  ).not.toBeChecked();
  await expect(page.getByLabel('Other Users’ Availability')).toHaveValue(
    'distinguish'
  );
});

test('General Settings selects bundled or standalone Lumen and scopes the native lock', async ({
  page,
}) => {
  await fixtures(page);
  const saved = {
    applicationTitle: 'SeerrNG',
    defaultFrontend: 'native',
    enforceDefaultFrontend: false,
    lockLumenForNonAdmins: false,
    lumenPublicUrl: '',
  };
  const writes: unknown[] = [];
  await page.route('**/api/v1/settings/main', (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      writes.push(body);
      Object.assign(saved, body);
    }
    return route.fulfill({ json: saved });
  });
  await page.goto('/admin/general');
  const frontend = page.getByLabel('Default Interface', { exact: true });
  const lock = page.getByRole('checkbox', {
    name: 'Keep Non-Administrators in Lumen',
  });
  const save = page.getByRole('button', { name: 'Save Application Settings' });
  await frontend.selectOption('lumen');
  await lock.check();
  await page
    .getByRole('checkbox', { name: 'Enforce Default Interface' })
    .check();
  await save.click();
  await expect(page.getByText('Application settings saved.')).toBeVisible();
  await frontend.selectOption('external');
  await expect(lock).toHaveCount(0);
  await expect(save).toBeDisabled();
  await page
    .getByLabel('Lumen Companion URL')
    .fill('https://lumen.example.test');
  await save.click();
  await expect(page.getByText('Application settings saved.')).toBeVisible();
  expect(writes).toEqual([
    {
      defaultFrontend: 'lumen',
      enforceDefaultFrontend: true,
      lockLumenForNonAdmins: true,
    },
    {
      defaultFrontend: 'external',
      lockLumenForNonAdmins: false,
      lumenPublicUrl: 'https://lumen.example.test',
    },
  ]);
  await page.reload();
  await expect(frontend).toHaveValue('external');
  await expect(page.getByLabel('Lumen Companion URL')).toHaveValue(
    'https://lumen.example.test'
  );
});

test('General Settings preserves a sign-in method and saves Jellyfin Quick Connect policy', async ({
  page,
}) => {
  await fixtures(page);
  const saved = {
    applicationTitle: 'SeerrNG',
    mediaServerType: 2,
    localLogin: true,
    mediaServerLogin: true,
    newPlexLogin: true,
    jellyfinQuickConnectOnly: false,
  };
  const writes: unknown[] = [];
  await page.route('**/api/v1/settings/main', (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      writes.push(body);
      Object.assign(saved, body);
    }
    return route.fulfill({ json: saved });
  });
  await page.goto('/admin/general');
  const local = page.getByRole('checkbox', { name: 'Local Sign-In' });
  const media = page.getByRole('checkbox', { name: 'Media Server Sign-In' });
  const admission = page.getByRole('checkbox', {
    name: 'Allow New Media Server Users',
  });
  const quick = page.getByRole('checkbox', {
    name: 'Require Jellyfin Quick Connect',
  });
  const save = page.getByRole('button', { name: 'Save Application Settings' });
  await local.uncheck();
  await media.uncheck();
  await expect(save).toBeDisabled();
  await expect(page.getByRole('alert')).toContainText(
    'Keep at least one sign-in method enabled.'
  );
  await expect(quick).toHaveCount(0);
  await expect(admission).toHaveCount(0);
  expect(writes).toEqual([]);
  await media.check();
  await quick.check();
  await admission.uncheck();
  await save.click();
  await expect(page.getByText('Application settings saved.')).toBeVisible();
  expect(writes).toEqual([
    { localLogin: false, newPlexLogin: false, jellyfinQuickConnectOnly: true },
  ]);
  await page.reload();
  await expect(local).not.toBeChecked();
  await expect(media).toBeChecked();
  await expect(quick).toBeChecked();
  await expect(admission).not.toBeChecked();
});

test('Share opens a Bookshelf match with the title and format', async ({
  page,
}) => {
  await fixtures(page);
  await page.route('**/api/v1/resolve/capabilities', (route) =>
    route.fulfill({ json: { enabled: true } })
  );
  await page.route('**/api/v1/resolve', (route) =>
    route.fulfill({
      json: {
        groups: [
          {
            input: 'Fixture Book',
            autoSelected: 0,
            candidates: [
              {
                id: 'bookshelf:1:fixture',
                mediaType: 'book',
                title: 'Fixture Book',
                formatHint: 'audiobook',
                evidence: 'Title match',
                href: '/book/bookshelf%3A1%3Afixture',
              },
            ],
          },
        ],
      },
    })
  );
  await page.goto('/share?title=Fixture+Book');
  await page.getByRole('button', { name: 'Find Matches' }).click();
  const open = page.getByRole('link', { name: 'Open Title' });
  await expect(open).toHaveAttribute(
    'href',
    '/book/bookshelf%3A1%3Afixture?f=audio&lookupTitle=Fixture+Book'
  );
});

test('book recommendations recover an unavailable feed bookmark', async ({
  page,
}) => {
  await fixtures(page);
  let reads = 0;
  let opened = 0;
  await page.route('**/api/v1/book-recommendations', (route) =>
    route.fulfill({
      json: {
        available: true,
        results:
          ++reads > 1
            ? [{ id: 18, title: 'Personal Picks', source: 'mine', likes: 0 }]
            : [],
      },
    })
  );
  await page.route('**/api/v1/book-recommendations/18/books', (route) => {
    opened += 1;
    return route.fulfill({
      json: {
        available: true,
        books: [{ id: 44, title: 'Recovered Book' }],
        total: 1,
      },
    });
  });
  await page.goto('/books/recommendations?format=audiobook&feed=18');
  await expect(
    page.getByText('This recommendation feed is unavailable.')
  ).toBeVisible();
  expect(opened).toBe(0);
  await page.getByRole('button', { name: 'Refresh Feeds' }).click();
  await expect(page.getByText('Recovered Book', { exact: true })).toBeVisible();
  expect(opened).toBe(1);
  await page.goto('/books/recommendations?format=audiobook&feed=999');
  await page.getByRole('button', { name: 'Clear Feed Selection' }).click();
  await expect(page).toHaveURL(/format=audiobook$/);
  await expect(
    page.getByText('This recommendation feed is unavailable.')
  ).toHaveCount(0);
});

test('book recommendations open a newly created feed', async ({ page }) => {
  await fixtures(page);
  const posts: unknown[] = [];
  await page.route('**/api/v1/book-recommendations', (route) => {
    if (route.request().method() === 'POST') {
      posts.push(route.request().postDataJSON());
      if (posts.length === 1)
        return route.fulfill({ json: { available: false, code: 'rejected' } });
      return route.fulfill({ status: 201, json: { id: 18 } });
    }
    return route.fulfill({
      json: {
        available: true,
        results:
          posts.length > 1
            ? [{ id: 18, title: 'Personal Picks', source: 'mine', likes: 0 }]
            : [],
      },
    });
  });
  await page.route('**/api/v1/book-recommendations/18/books', (route) =>
    route.fulfill({
      json: {
        available: true,
        books: [{ id: 44, title: 'Recommended Book' }],
        total: 1,
      },
    })
  );
  await page.goto('/books/recommendations?format=audiobook');
  const title = page.getByRole('textbox', { name: 'Title', exact: true });
  const create = page.getByRole('button', { name: 'Create on Hardcover' });
  await title.fill('Personal Picks');
  await page.getByLabel('Description (optional)').fill('My reading list');
  await page.getByLabel('Genres to Include').fill('Fantasy, History');
  await page.getByLabel('Genres to Avoid').fill('Horror');
  await page.getByLabel('Series Position').selectOption('standalone');
  await page.getByLabel('Prefer Less Popular Books').check();
  await create.click();
  await expect(page.getByRole('alert')).toHaveText(
    'Hardcover rejected your API token.'
  );
  await expect(title).toHaveValue('Personal Picks');
  await create.click();
  await expect(page).toHaveURL(/format=audiobook&feed=18$/);
  await expect(
    page.getByText('Recommended Book', { exact: true })
  ).toBeVisible();
  expect(posts).toHaveLength(2);
  expect(posts[1]).toMatchObject({
    title: 'Personal Picks',
    description: 'My reading list',
    genres: ['Fantasy', 'History'],
    avoidGenres: ['Horror'],
    seriesPosition: 'standalone',
    lessPopular: true,
  });
});

test('book recommendations preserve results when a feedback refresh fails', async ({
  page,
}) => {
  await fixtures(page);
  await page.route('**/api/v1/book-recommendations', (route) =>
    route.fulfill({
      json: {
        available: true,
        results: [
          { id: 11, title: 'Fixture Feed', source: 'featured', likes: 1 },
        ],
      },
    })
  );
  let feedbackReads = 0;
  await page.route('**/api/v1/book-recommendations/11/books', (route) => {
    const { tuning } = route.request().postDataJSON();
    if (tuning.moreLike.length && ++feedbackReads === 1)
      return route.fulfill({ json: { available: false, code: 'rejected' } });
    return route.fulfill({
      json: {
        available: true,
        books: [{ id: 44, title: 'Fixture Book' }],
        total: 1,
      },
    });
  });
  await page.goto('/books/recommendations');
  await page.getByRole('button', { name: 'Show Books: Fixture Feed' }).click();
  await expect(page).toHaveURL(/feed=11$/);
  const format = page.getByRole('combobox', { name: 'Format', exact: true });
  await format.selectOption('audiobook');
  await expect(page).toHaveURL(/format=audiobook$/);
  await page.reload();
  await expect(page.getByText('Fixture Book', { exact: true })).toBeVisible();
  await expect(format).toHaveValue('audiobook');
  const vote = page.getByRole('button', { name: 'More Like This' });
  await vote.click();
  await expect(page.getByRole('alert')).toHaveText(
    'Hardcover rejected your API token.'
  );
  await expect(page.getByText('Fixture Book', { exact: true })).toBeVisible();
  await expect(vote).toHaveAttribute('aria-pressed', 'false');
  await vote.click();
  await expect(vote).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(feedbackReads).toBe(2);
  await page.route('**/api/v1/resolve', (route) => {
    expect(route.request().postDataJSON()).toMatchObject({
      text: 'Fixture Book',
      types: ['book'],
      formatHint: 'audiobook',
    });
    return route.fulfill({
      json: {
        groups: [
          {
            candidates: [
              {
                id: 'bookshelf:1:fixture',
                mediaType: 'book',
                title: 'Matched Book',
              },
            ],
          },
        ],
      },
    });
  });
  const detailRead = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return (
      url.pathname.endsWith('/book/bookshelf%3A1%3Afixture') &&
      url.searchParams.get('lookupTitle') === 'Matched Book'
    );
  });
  await page.getByRole('button', { name: 'Open Book' }).click();
  await expect(page).toHaveURL(/f=audio&lookupTitle=Matched\+Book$/);
  await detailRead;
});

test('standalone user request bookmarks keep the user from the path', async ({
  page,
}) => {
  await fixtures(page);
  const pendingReads: URLSearchParams[] = [];
  await page.route('**/api/v1/request/status?*', (route) => {
    const params = new URL(route.request().url()).searchParams;
    if (params.get('filter') === 'pending') pendingReads.push(params);
    return route.fulfill({
      json: { pageInfo: { pages: 1, results: 0 }, results: [] },
    });
  });
  await page.goto(
    '/requests/by-user/19?userId=12&requestedBy=11&filter=pending&mediaType=audiobook&bookFormat=ebook&search=Night+%26+Day'
  );
  await expect(page).toHaveURL(/\/requests\?/);
  const params = new URL(page.url()).searchParams;
  expect(params.getAll('requestedBy')).toEqual(['19']);
  expect(params.has('userId')).toBe(false);
  expect(params.get('show') ?? params.get('filter')).toBe('pending');
  await expect.poll(() => pendingReads.length).toBeGreaterThan(0);
  for (const request of pendingReads) {
    expect(request.getAll('requestedBy')).toEqual(['19']);
    expect(request.has('userId')).toBe(false);
    expect(request.get('mediaType')).toBe('book');
    expect(request.get('bookFormat')).toBe('ebook');
    expect(request.get('search')).toBe('Night & Day');
  }
});

test('standalone request bookmarks preserve explicit software category and status', async ({
  page,
}) => {
  await fixtures(page);
  const reads: URLSearchParams[] = [];
  await page.route('**/api/v1/request/software/status?*', (route) => {
    reads.push(new URL(route.request().url()).searchParams);
    return route.fulfill({
      json: { pageInfo: { pages: 1, results: 0 }, results: [] },
    });
  });
  await page.goto(
    '/requests/by-user/19?mediaType=retro&category=modern&filter=pending&softwareStatus=failed'
  );
  await expect.poll(() => reads.length).toBeGreaterThan(0);
  for (const read of reads) {
    expect(read.get('requestedBy')).toBe('19');
    expect(read.get('category')).toBe('modern');
    expect(read.get('filter')).toBe('failed');
  }
});

test('account permissions bookmarks show the signed-in users assigned permissions', async ({
  page,
}) => {
  await fixtures(page);
  await page.route('**/api/v1/auth/me', (route) =>
    route.fulfill({
      json: { id: 1, displayName: 'Viewer', permissions: 2199023255552 },
    })
  );
  await page.route('**/api/v1/user/1/settings/password', (route) =>
    route.fulfill({ json: { hasPassword: true } })
  );
  await page.goto('/me/account#account-permissions');
  const section = page.locator('#account-permissions');
  await expect(section.getByRole('heading')).toBeInViewport();
  await expect(
    section.getByText('Request Magazine', { exact: true })
  ).toBeVisible();
  await expect(section.getByRole('checkbox')).toHaveCount(0);
});

test('Classic service category bookmarks filter the Lumen administration menu', async ({
  page,
}) => {
  await fixtures(page);
  await page.goto('/admin?serviceCategory=music');
  await expect(
    page.getByRole('heading', { name: 'Music', exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Open Lidarr Services' })
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Open Radarr Services' })
  ).toHaveCount(0);
  await page.getByRole('link', { name: 'All Settings and Tools' }).click();
  await expect(
    page.getByRole('link', { name: 'Open Radarr Services' })
  ).toBeVisible();
  const categories = page.getByRole('navigation', {
    name: 'Administration Categories',
  });
  await categories.getByRole('link', { name: 'TV and Movies' }).click();
  await expect(page).toHaveURL(/serviceCategory=tv-movies$/);
  await expect(
    categories.getByRole('link', { name: 'TV and Movies' })
  ).toHaveAttribute('aria-current', 'page');
  await expect(
    page.getByRole('link', { name: 'Open Jellystat Settings' })
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Open Lidarr Services' })
  ).toHaveCount(0);
});

test('Steam settings bookmark brings the key field into view', async ({
  page,
}) => {
  await fixtures(page);
  await page.route('**/api/v1/settings/software-acquisition', (route) =>
    route.fulfill({
      json: {
        romarr: { hostname: '', port: 8080, useSsl: false, baseUrl: '' },
        questarr: { hostname: '', port: 8080, useSsl: false, baseUrl: '' },
        steamApiKeyConfigured: true,
      },
    })
  );
  await page.goto('/admin/software-acquisition#steam-library-import');
  await expect(
    page.getByRole('heading', { name: 'Steam Library Import' })
  ).toBeInViewport();
  const key = page.getByLabel('Steam Web API Key', { exact: true });
  await expect(key).toBeInViewport();
  await expect(key).toHaveValue('');
});

test('General Settings saves default request quotas without changing other media drafts', async ({
  page,
}) => {
  await fixtures(page);
  const defaultQuotas = {
    movie: { quotaLimit: 4, quotaDays: 7 },
    adult: { quotaLimit: 1, quotaDays: 14 },
  };
  const writes: unknown[] = [];
  await page.route('**/api/v1/settings/main', (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      writes.push(body);
      Object.assign(defaultQuotas.adult, body.defaultQuotas.adult);
    }
    return route.fulfill({
      json: {
        applicationTitle: 'SeerrNG',
        defaultQuotas,
        defaultEnabledMediaCategories: { movie: true },
      },
    });
  });
  await page.goto('/admin/general#default-request-quotas');
  await expect(
    page.getByRole('heading', { name: 'Default Request Quotas' })
  ).toBeInViewport();
  const category = page.getByLabel('Quota Media Type');
  const limit = page.getByLabel('Request Limit', { exact: true });
  const days = page.getByLabel('Quota Days');
  const save = page.getByRole('button', { name: 'Save Default Quota' });
  await limit.fill('5');
  await category.selectOption('adult');
  await expect(days).toHaveValue('14');
  await limit.fill('10001');
  await expect(save).toBeDisabled();
  await limit.fill('1');
  await days.fill('0');
  await expect(
    page.getByText('counts requests across all time', { exact: false })
  ).toBeVisible();
  await save.click();
  await expect(page.getByText('Default request quota saved.')).toBeVisible();
  expect(writes).toEqual([{ defaultQuotas: { adult: { quotaDays: 0 } } }]);
  await limit.fill('0');
  await save.click();
  await expect(page.getByText('Default request quota saved.')).toBeVisible();
  expect(writes).toEqual([
    { defaultQuotas: { adult: { quotaDays: 0 } } },
    { defaultQuotas: { adult: { quotaLimit: 0 } } },
  ]);
  await category.selectOption('movie');
  await expect(limit).toHaveValue('5');
  await page.reload();
  await expect(limit).toHaveValue('4');
  await category.selectOption('adult');
  await expect(limit).toHaveValue('0');
  await expect(days).toHaveValue('0');
  await page.getByRole('link', { name: 'Default User Categories' }).click();
  await expect(page).toHaveURL(/\/admin\/categories#default-user-categories$/);
  await expect(
    page.getByRole('heading', { name: 'Default User Categories' })
  ).toBeInViewport();
});

test('General Settings confirms default permissions and preserves higher permission bits', async ({
  page,
}) => {
  await fixtures(page);
  let defaultPermissions = 4398046511104 + 32;
  const writes: unknown[] = [];
  await page.route('**/api/v1/settings/main', (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      writes.push(body);
      defaultPermissions = body.defaultPermissions;
    }
    return route.fulfill({
      json: {
        applicationTitle: 'SeerrNG',
        defaultPermissions,
        defaultQuotas: { movie: { quotaLimit: 4, quotaDays: 7 } },
      },
    });
  });
  await page.goto('/admin/general#default-request-quotas');
  await page.getByRole('link', { name: 'Default User Permissions' }).click();
  await expect(page).toHaveURL(/#default-user-permissions$/);
  await expect(
    page.getByRole('heading', { name: 'Default User Permissions' })
  ).toBeInViewport();
  await expect(
    page.getByRole('checkbox', { name: 'Admin', exact: true })
  ).toBeDisabled();
  await expect(
    page.getByRole('checkbox', { name: 'Auto Request Magazine' })
  ).toBeChecked();
  await page
    .getByRole('checkbox', { name: 'Request Book', exact: true })
    .check();
  await page.getByRole('button', { name: 'Save Default Permissions' }).click();
  expect(writes).toEqual([]);
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Save Default Permissions' })
    .click();
  await expect(page.getByText('Default permissions saved.')).toBeVisible();
  expect(writes).toEqual([
    { defaultPermissions: 4398046511104 + 34359738368 + 32 },
  ]);
  await page.reload();
  await expect(
    page.getByRole('checkbox', { name: 'Request Book', exact: true })
  ).toBeChecked();
});

test('Scheduled Jobs confirms a run and saves an edited schedule', async ({
  page,
}) => {
  await fixtures(page);
  const job = {
    id: 'sample',
    name: 'Fixture Job',
    type: 'process',
    interval: 'minutes',
    cronSchedule: '0 */15 * * * *',
    enabled: true,
    running: false,
  };
  let runs = 0;
  await page.route('**/api/v1/settings/jobs', (route) =>
    route.fulfill({ json: [job] })
  );
  await page.route('**/api/v1/settings/jobs/sample/run', (route) => {
    expect(route.request().method()).toBe('POST');
    runs++;
    job.running = true;
    return route.fulfill({ json: job });
  });
  await page.route('**/api/v1/settings/jobs/sample/schedule', (route) => {
    const { schedule } = route.request().postDataJSON();
    expect(schedule).toBe('0 */20 * * * *');
    job.cronSchedule = schedule;
    return route.fulfill({ json: job });
  });
  await page.goto('/me');
  await page.getByRole('link', { name: 'Open Scheduled Jobs' }).click();
  await page.getByRole('button', { name: 'Run Now' }).click();
  expect(runs).toBe(0);
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Run Now' })
    .click();
  await expect(page.getByRole('button', { name: 'Cancel Job' })).toBeVisible();
  expect(runs).toBe(1);
  await page.getByRole('button', { name: 'Edit Schedule' }).click();
  await expect(page.getByLabel('Frequency')).toHaveValue('15');
  await page.getByLabel('Frequency').selectOption('20');
  await expect(page.getByLabel('Cron Schedule')).toHaveValue('0 */20 * * * *');
  await page.getByRole('button', { name: 'Save Schedule' }).click();
  await expect(page.getByText('0 */20 * * * *', { exact: true })).toBeVisible();
});

test('Scheduled Jobs describes calendar presets and preserves existing custom schedules', async ({
  page,
}) => {
  await fixtures(page);
  await page.route('**/api/v1/settings/jobs', (route) =>
    route.fulfill({
      json: [
        ['Seconds Job', 'seconds', '*/45 * * * * *'],
        ['Hours Job', 'hours', '0 0 */48 * * *'],
        ['Days Job', 'days', '0 0 1 */7 * *'],
      ].map(([name, interval, cronSchedule]) => ({
        id: interval,
        name,
        type: 'process',
        interval,
        cronSchedule,
        enabled: true,
        running: false,
      })),
    })
  );
  await page.goto('/admin/jobs');
  for (const [name, label, schedule] of [
    ['Seconds Job', 'At Seconds 0 and 45 Each Minute', '*/45 * * * * *'],
    ['Hours Job', 'Custom Schedule', '0 0 */48 * * *'],
    ['Days Job', 'Every 7 Days of the Month', '0 0 1 */7 * *'],
  ]) {
    const row = page.getByRole('listitem').filter({ hasText: name });
    await row.getByRole('button', { name: 'Edit Schedule' }).click();
    await expect(row.locator('select option:checked')).toHaveText(label);
    await expect(row.getByLabel('Cron Schedule')).toHaveValue(schedule);
    await expect(
      row.getByRole('button', { name: 'Save Schedule' })
    ).toBeDisabled();
    await row.getByRole('button', { name: 'Cancel Editing' }).click();
  }
});

test('System Caches confirms and refreshes a DNS flush', async ({ page }) => {
  await fixtures(page);
  let flushed = false;
  let status = 200;
  await page.route('**/api/v1/status/appdata', (route) =>
    route.fulfill({ json: { appDataPath: '/data/fixture/' } })
  );
  await page.route('**/api/v1/settings/cache', (route) =>
    status !== 200
      ? route.fulfill({ status, json: { message: 'Cache read failed.' } })
      : route.fulfill({
          json: {
            apiCaches: [
              {
                id: 'tmdb',
                name: 'TMDB',
                stats: { hits: 1, misses: 2, keys: 3, ksize: 4, vsize: 5 },
              },
            ],
            imageCache: {
              tmdb: { imageCount: 1, size: 42 },
              avatar: { imageCount: 0, size: 0 },
            },
            dnsCache: {
              entries: flushed
                ? {}
                : {
                    'cache.example': {
                      activeAddress: '192.0.2.1',
                      hits: 2,
                      misses: 1,
                      age: 3000,
                    },
                  },
            },
          },
        })
  );
  await page.route(
    '**/api/v1/settings/cache/dns/cache.example/flush',
    (route) => {
      expect(route.request().method()).toBe('POST');
      flushed = true;
      return route.fulfill({ status: 204 });
    }
  );
  await page.goto('/admin/caches');
  await expect(page.getByText('cache.example', { exact: true })).toBeVisible();
  await expect(page.getByText('/data/fixture/cache/images')).toBeVisible();
  await page.getByRole('button', { name: 'Flush DNS Entry' }).click();
  expect(flushed).toBe(false);
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Flush', exact: true })
    .click();
  await expect(page.getByText('Flushed cache.example.')).toBeVisible();
  await expect(page.getByText('No DNS cache entries.')).toBeVisible();
  expect(flushed).toBe(true);
  const refresh = page.getByRole('button', { name: 'Refresh', exact: true });
  status = 503;
  await refresh.click();
  await expect(page.getByText('Cache read failed.')).toBeVisible();
  await expect(page.getByText('TMDB Images')).toBeVisible();
  status = 403;
  await refresh.click();
  await expect(page.getByText('Cache read failed.')).toBeVisible();
  await expect(page.getByText('TMDB Images')).toHaveCount(0);
  await expect(page.getByText('/data/fixture/cache/images')).toHaveCount(0);
});

test('About SeerrNG shows installed version and respects disabled update checks', async ({
  page,
}) => {
  await fixtures(page);
  let checks = 0;
  await page.route('**/api/v1/settings/public', (route) =>
    route.fulfill({
      json: { applicationTitle: 'SeerrNG', versionCheck: false },
    })
  );
  await page.route('**/api/v1/status', (route) => {
    checks++;
    return route.fulfill({ json: {} });
  });
  await page.route('**/api/v1/settings/about', (route) =>
    route.fulfill({
      json: {
        version: 'v3.72.38',
        totalMediaItems: 32,
        totalRequests: 7,
        tz: 'UTC',
        appDataPath: '/fixture/config',
      },
    })
  );
  await page.goto('/me');
  await page.getByRole('link', { name: 'Open About SeerrNG' }).click();
  await expect(page.getByText('v3.72.38', { exact: true })).toBeVisible();
  await expect(
    page.getByText('/fixture/config', { exact: true })
  ).toBeVisible();
  await expect(
    page.getByText('Version check disabled', { exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Release Notes' })
  ).toHaveAttribute(
    'href',
    'https://github.com/snapetech-org/seerrng/releases'
  );
  expect(checks).toBe(0);
});

test('Users lets delegated managers search without exposing the directory to members', async ({
  page,
}) => {
  await fixtures(page);
  let permissions = 8;
  let reads = 0;
  await page.route('**/api/v1/auth/me', (route) =>
    route.fulfill({ json: { id: 9, displayName: 'Viewer', permissions } })
  );
  await page.route(/\/api\/v1\/user\?/, (route) => {
    reads++;
    const query = new URL(route.request().url()).searchParams;
    return route.fulfill({
      json: {
        pageInfo: { pages: 1, results: 1 },
        results: [
          {
            id: 1,
            displayName:
              query.get('q') === 'Owner & admin'
                ? 'Owner Match'
                : 'Owner Initial',
            permissions: 2,
            requestCount: 3,
          },
        ],
      },
    });
  });
  await page.goto('/me');
  await page.getByRole('link', { name: 'Open Users', exact: true }).click();
  await expect(page.getByText('Owner Initial')).toBeVisible();
  await page.getByLabel('Search Users').fill('Owner & admin');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByText('Owner Match')).toBeVisible();
  expect(reads).toBe(2);
  permissions = 32;
  await page.goto('/admin/users');
  await expect(page).toHaveURL(/\/me$/);
  await expect(
    page.getByRole('link', { name: 'Open Users', exact: true })
  ).toHaveCount(0);
  expect(reads).toBe(2);
});

test('Users creates a local account with a password setup link', async ({
  page,
}) => {
  await fixtures(page);
  let attempts = 0;
  const account = {
    id: 9,
    displayName: 'New Member',
    email: 'member@example.test',
    permissions: 32,
  };
  await page.route(/\/api\/v1\/user\?/, (route) =>
    route.fulfill({
      json: {
        pageInfo: { pages: 1, results: 1 },
        results: attempts === 2 ? [account] : [],
      },
    })
  );
  await page.route('**/api/v1/user', (route) => {
    expect(route.request().method()).toBe('POST');
    expect(route.request().postDataJSON()).toEqual({
      username: 'New Member',
      email: 'member@example.test',
    });
    if (++attempts === 1)
      return route.fulfill({
        status: 503,
        json: { message: 'Email service unavailable.' },
      });
    return route.fulfill({ status: 201, json: account });
  });
  await page.goto('/admin/users');
  await page.getByRole('button', { name: 'Create Local User' }).click();
  await page.getByLabel('Username', { exact: true }).fill('New Member');
  await page.getByLabel('Email', { exact: true }).fill('member@example.test');
  await page.getByLabel('Email a password setup link').check();
  await page.getByRole('button', { name: 'Create User', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText(
    'Email service unavailable.'
  );
  await expect(page.getByLabel('Email', { exact: true })).toHaveValue(
    'member@example.test'
  );
  await page.getByRole('button', { name: 'Create User', exact: true }).click();
  await expect(page.getByText('Created New Member.')).toBeVisible();
  await expect(page.getByText('New Member', { exact: true })).toBeVisible();
});

test('Users sets an Episode Queue default for the selected account', async ({
  page,
}) => {
  await fixtures(page);
  await page.route('**/api/v1/auth/me', (route) =>
    route.fulfill({ json: { id: 8, displayName: 'Manager', permissions: 8 } })
  );
  await page.route(/\/api\/v1\/user\?/, (route) =>
    route.fulfill({
      json: {
        pageInfo: { pages: 1, results: 1 },
        results: [{ id: 19, displayName: 'Viewer', permissions: 32 }],
      },
    })
  );
  let count = 1;
  await page.route('**/api/v1/user/19/settings/episode-queue', (route) => {
    if (route.request().method() === 'POST') {
      expect(route.request().postDataJSON()).toEqual({
        defaultEpisodeCount: 4,
      });
      count = 4;
    }
    return route.fulfill({ json: { defaultEpisodeCount: count } });
  });
  await page.goto('/admin/users');
  await page
    .getByRole('button', { name: 'Episode Queue', exact: true })
    .click();
  await expect(page.getByLabel('Episodes Ahead')).toHaveValue('1');
  await page.getByLabel('Episodes Ahead').selectOption('4');
  await page.getByRole('button', { name: 'Save Default', exact: true }).click();
  expect(count).toBe(1);
  const dialog = page.getByRole('alertdialog', {
    name: 'Save Episode Queue default for Viewer?',
  });
  await dialog.getByRole('button', { name: 'Save Default' }).click();
  await expect(page.getByText('Episode Queue default saved.')).toBeVisible();
  await expect(page.getByLabel('Episodes Ahead')).toHaveValue('4');
  await expect(
    page.getByRole('button', { name: 'Save Default', exact: true })
  ).toBeDisabled();
});

test('Users saves and resets a selected media quota', async ({ page }) => {
  await fixtures(page);
  await page.route(/\/api\/v1\/user\?/, (route) =>
    route.fulfill({
      json: {
        pageInfo: { pages: 1, results: 1 },
        results: [{ id: 19, displayName: 'Viewer', permissions: 32 }],
      },
    })
  );
  const writes: unknown[] = [];
  let quotas: Record<string, number | null> = {
    globalMusicQuotaLimit: 4,
    globalMusicQuotaDays: 7,
  };
  await page.route('**/api/v1/user/19/settings/main', (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      writes.push(body);
      quotas = { ...quotas, ...body };
    }
    return route.fulfill({ json: quotas });
  });
  await page.goto('/admin/users');
  await page.getByRole('button', { name: 'Request Quotas' }).click();
  await page.getByLabel('Media Type').selectOption('music');
  await expect(
    page.getByText('Server default 4 requests per 7 days')
  ).toBeVisible();
  await page.getByLabel('Request Limit').fill('2');
  await page.getByLabel('Quota Days').fill('14');
  await page.getByRole('button', { name: 'Save Quota' }).click();
  await expect(page.getByText('Request quota saved.')).toBeVisible();
  await expect(page.getByLabel('Request Limit')).toHaveValue('2');
  await page.getByLabel('Request Limit').fill('');
  await page.getByLabel('Quota Days').fill('');
  await page.getByRole('button', { name: 'Save Quota' }).click();
  await expect(page.getByText('Request quota saved.')).toBeVisible();
  expect(writes).toEqual([
    { musicQuotaLimit: 2, musicQuotaDays: 14 },
    { musicQuotaLimit: null, musicQuotaDays: null },
  ]);
});

test('Users changes media categories and indexer visibility independently', async ({
  page,
}) => {
  await fixtures(page);
  await page.route(/\/api\/v1\/user\?/, (route) =>
    route.fulfill({
      json: {
        pageInfo: { pages: 1 },
        results: [{ id: 19, displayName: 'Viewer', permissions: 32 }],
      },
    })
  );
  const writes: unknown[] = [];
  let indexer: boolean | null = null;
  let override: Record<string, boolean> | null = null;
  await page.route('**/api/v1/user/19/settings/main', (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      writes.push(body);
      if ('enabledMediaCategories' in body)
        override = body.enabledMediaCategories;
      if ('showIndexerDetails' in body) indexer = body.showIndexerDetails;
    }
    return route.fulfill({
      json: {
        enabledMediaCategories: { movie: true, tv: true, ...override },
        usesDefaultEnabledMediaCategories: override === null,
        defaultShowIndexerDetails: true,
        usesDefaultShowIndexerDetails: indexer === null,
        showIndexerDetails: indexer ?? true,
      },
    });
  });
  await page.goto('/admin/users');
  await page
    .getByRole('button', { name: 'Media Categories', exact: true })
    .click();
  await expect(page.getByText('Using server defaults.')).toBeVisible();
  const movies = page.getByRole('checkbox', { name: 'Movies', exact: true });
  await movies.uncheck();
  await page.getByRole('button', { name: 'Save Categories' }).click();
  await expect(page.getByText('Using account overrides.')).toBeVisible();
  await expect(movies).not.toBeChecked();
  await page.getByRole('button', { name: 'Restore Server Defaults' }).click();
  await expect(page.getByText('Using server defaults.')).toBeVisible();
  await expect(movies).toBeChecked();
  const indexerDetails = page.getByLabel('Indexer Details');
  await expect(indexerDetails).toHaveValue('default');
  await movies.uncheck();
  await indexerDetails.selectOption('hide');
  await expect(page.getByText('Indexer visibility saved.')).toBeVisible();
  await expect(indexerDetails).toHaveValue('hide');
  await expect(movies).not.toBeChecked();
  await indexerDetails.selectOption('default');
  await expect(indexerDetails).toHaveValue('default');
  expect(writes).toEqual([
    { enabledMediaCategories: { movie: false } },
    { enabledMediaCategories: null },
    { showIndexerDetails: false },
    { showIndexerDetails: null },
  ]);
});

test('Users clears one maturity limit and preserves the other', async ({
  page,
}) => {
  await fixtures(page);
  await page.route(/\/api\/v1\/user\?/, (route) => {
    expect(new URL(route.request().url()).searchParams.get('includeIds')).toBe(
      '19'
    );
    return route.fulfill({
      json: {
        pageInfo: { pages: 1 },
        results: [{ id: 19, displayName: 'Viewer', permissions: 32 }],
      },
    });
  });
  const policy = {
    movieMaturityRatingLimit: 'PG' as string | null,
    tvMaturityRatingLimit: 'TV-14',
  };
  await page.route('**/api/v1/user/19/settings/maturity', (route) => {
    if (route.request().method() === 'POST') {
      expect(route.request().postDataJSON()).toEqual({
        movieMaturityRatingLimit: null,
      });
      policy.movieMaturityRatingLimit = null;
    }
    return route.fulfill({ json: policy });
  });
  await page.goto('/admin/users/19/maturity');
  await expect(page.getByLabel('Movie Rating Limit')).toHaveValue('PG');
  await page.getByLabel('Movie Rating Limit').selectOption('');
  await page.getByRole('button', { name: 'Save Maturity Limits' }).click();
  await expect(page.getByText('Maturity limits saved.')).toBeVisible();
  await expect(page.getByLabel('Movie Rating Limit')).toHaveValue('');
  await expect(page.getByLabel('Series Rating Limit')).toHaveValue('TV-14');
  await expect(
    page.getByRole('button', { name: 'Save Maturity Limits' })
  ).toBeDisabled();
});

test('Users delegates only held permissions and preserves high permission bits', async ({
  page,
}) => {
  await fixtures(page);
  const requestMusic = 4294967296;
  const target = {
    id: 19,
    displayName: 'Viewer',
    permissions: 32,
    requestServices: ['sonarr:3'],
    contentRestricted: null as boolean | null,
  };
  await page.route('**/api/v1/service/radarr', (route) =>
    route.fulfill({
      json: [
        {
          id: 4,
          name: 'Movies West',
          isDefault: false,
          requestButtonLabel: 'West',
        },
      ],
    })
  );
  await page.route('**/api/v1/service/sonarr', (route) =>
    route.fulfill({
      json: [{ id: 3, name: 'Default Series', isDefault: true }],
    })
  );
  await page.route('**/api/v1/auth/me', (route) =>
    route.fulfill({
      json: {
        id: 8,
        displayName: 'Manager',
        permissions: 8 + 32 + requestMusic,
      },
    })
  );
  await page.route(/\/api\/v1\/user\?/, (route) =>
    route.fulfill({ json: { pageInfo: { pages: 1 }, results: [target] } })
  );
  await page.route('**/api/v1/user/19/settings/permissions', (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      expect(body).toEqual(
        target.permissions === 32
          ? { permissions: 32 + requestMusic }
          : {
              permissions: 32 + requestMusic,
              requestServices: ['radarr:4', 'sonarr:3'],
              contentRestricted: true,
            }
      );
      Object.assign(target, body);
    }
    return route.fulfill({ json: target });
  });
  await page.goto('/admin/users');
  await page.getByRole('button', { name: 'Permissions', exact: true }).click();
  await expect(
    page.getByRole('checkbox', { name: 'Manage Settings', exact: true })
  ).toBeDisabled();
  const music = page.getByRole('checkbox', {
    name: 'Request Music',
    exact: true,
  });
  await music.check();
  await page
    .getByRole('button', { name: 'Save Permissions', exact: true })
    .click();
  expect(target.permissions).toBe(32);
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Save Permissions' })
    .click();
  await expect(page.getByText('Permissions saved.')).toBeVisible();
  await expect(music).toBeChecked();
  expect(target.permissions).toBe(32 + requestMusic);
  const west = page.getByRole('checkbox', {
    name: 'West (Movies West)',
    exact: true,
  });
  await west.check();
  await page.getByLabel('Age Gate').selectOption('restricted');
  await page
    .getByRole('button', { name: 'Save Permissions', exact: true })
    .click();
  expect(target.contentRestricted).toBeNull();
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Save Permissions' })
    .click();
  await expect(page.getByText('Permissions saved.')).toBeVisible();
  await expect(west).toBeChecked();
  expect(target.requestServices).toEqual(['radarr:4', 'sonarr:3']);
  expect(target.contentRestricted).toBe(true);
});

test('Users protects administrators and confirms deletion of the selected member', async ({
  page,
}) => {
  await fixtures(page);
  await page.route('**/api/v1/auth/me', (route) =>
    route.fulfill({ json: { id: 8, displayName: 'Manager', permissions: 8 } })
  );
  const people = [
    { id: 1, displayName: 'Owner', permissions: 2 },
    { id: 2, displayName: 'Second Admin', permissions: 2 },
    { id: 19, displayName: 'Viewer', permissions: 32 },
  ];
  let deleted = false;
  await page.route(/\/api\/v1\/user\?/, (route) =>
    route.fulfill({
      json: {
        pageInfo: { pages: 1 },
        results: deleted ? people.slice(0, 2) : people,
      },
    })
  );
  await page.route('**/api/v1/user/19', (route) => {
    expect(route.request().method()).toBe('DELETE');
    deleted = true;
    return route.fulfill({ status: 200, json: people[2] });
  });
  await page.goto('/admin/users');
  await expect(page.getByText('Second Admin')).toBeVisible();
  const remove = page.getByRole('button', { name: 'Delete User', exact: true });
  await expect(remove).toHaveCount(1);
  await remove.click();
  const dialog = page.getByRole('alertdialog', { name: 'Delete Viewer?' });
  await dialog.getByRole('button', { name: 'Keep User' }).click();
  expect(deleted).toBe(false);
  await remove.click();
  await dialog.getByRole('button', { name: 'Delete User' }).click();
  await expect(page.getByText('Deleted Viewer.')).toBeVisible();
  await expect(
    page.getByRole('listitem').filter({ hasText: 'Viewer' })
  ).toHaveCount(0);
  expect(deleted).toBe(true);
});

test('Users imports and syncs selected Emby accounts', async ({ page }) => {
  await fixtures(page);
  await page.route('**/api/v1/settings/public', (route) =>
    route.fulfill({ json: { applicationTitle: 'SeerrNG', mediaServerType: 3 } })
  );
  await page.route(/\/api\/v1\/user\?/, (route) =>
    route.fulfill({ json: { pageInfo: { pages: 0 }, results: [] } })
  );
  await page.route('**/api/v1/settings/jellyfin/users', (route) =>
    route.fulfill({
      json: [
        { id: 'existing', username: 'Existing Viewer', isImported: true },
        { id: 'new', username: 'New Viewer', isImported: false },
      ],
    })
  );
  let writes = 0;
  await page.route('**/api/v1/user/import-from-jellyfin', (route) => {
    expect(route.request().postDataJSON()).toEqual({
      jellyfinUserIds: ['new', 'existing'],
      syncExisting: true,
    });
    writes++;
    return route.fulfill({ json: { createdUsers: [{}], refreshedUsers: 1 } });
  });
  await page.goto('/admin/users');
  await page.getByRole('button', { name: 'Import Emby Users' }).click();
  await page.getByRole('checkbox', { name: 'New Viewer' }).check();
  await expect(page.getByText('Existing Viewer')).toHaveCount(0);
  await page.getByRole('checkbox', { name: 'Sync Existing Users' }).check();
  await page.getByRole('checkbox', { name: /Existing Viewer/ }).check();
  await page
    .getByRole('button', { name: 'Import Selected Users', exact: true })
    .click();
  expect(writes).toBe(0);
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Import Selected Users' })
    .click();
  await expect(page.getByText('Imported 1, refreshed 1.')).toBeVisible();
  expect(writes).toBe(1);
});

test('Users sends exact Plex selections and confirms the all-account sync', async ({
  page,
}) => {
  await fixtures(page);
  await page.route('**/api/v1/settings/public', (route) =>
    route.fulfill({ json: { applicationTitle: 'SeerrNG', mediaServerType: 1 } })
  );
  await page.route(/\/api\/v1\/user\?/, (route) =>
    route.fulfill({ json: { pageInfo: { pages: 0 }, results: [] } })
  );
  const writes: unknown[] = [];
  await page.route('**/api/v1/settings/plex/users', (route) =>
    route.fulfill({
      json: writes.length
        ? []
        : [
            { id: '42', title: 'Plex Friend', username: 'friend' },
            { id: '43', username: 'other' },
          ],
    })
  );
  await page.route('**/api/v1/user/import-from-plex', (route) => {
    writes.push(route.request().postDataJSON());
    return route.fulfill({
      json:
        writes.length === 1
          ? { createdUsers: [{}], refreshedUsers: 0 }
          : { createdUsers: [], refreshedUsers: 1 },
    });
  });
  await page.goto('/admin/users');
  await page.getByRole('button', { name: 'Import Plex Users' }).click();
  await page.getByRole('checkbox', { name: 'Plex Friend' }).check();
  await page
    .getByRole('button', { name: 'Import Selected Users', exact: true })
    .click();
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Import Selected Users' })
    .click();
  await expect(page.getByText('Imported 1, refreshed 0.')).toBeVisible();
  await page
    .getByRole('button', { name: 'Sync Existing Users', exact: true })
    .click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toContainText('import any newly eligible Plex users');
  expect(writes).toEqual([{ plexIds: ['42'] }]);
  await dialog.getByRole('button', { name: 'Sync Existing Users' }).click();
  await expect(page.getByText('Imported 0, refreshed 1.')).toBeVisible();
  expect(writes).toEqual([{ plexIds: ['42'] }, { plexIds: [] }]);
});

test('Users edits a username without writing other profile settings', async ({
  page,
}) => {
  await fixtures(page);
  let username = 'Existing Viewer';
  await page.route(/\/api\/v1\/user\?/, (route) =>
    route.fulfill({
      json: {
        pageInfo: { pages: 1 },
        results: [{ id: 19, displayName: username, permissions: 32 }],
      },
    })
  );
  await page.route('**/api/v1/user/19/settings/main', (route) => {
    if (route.request().method() === 'POST') {
      expect(route.request().postDataJSON()).toEqual({
        username: 'Renamed Viewer',
      });
      username = 'Renamed Viewer';
    }
    return route.fulfill({ json: { username } });
  });
  await page.goto('/admin/users');
  await page.getByRole('button', { name: 'Edit Profile' }).click();
  await expect(page.getByLabel('Username')).toHaveValue('Existing Viewer');
  await page.getByLabel('Username').fill(' Renamed Viewer ');
  await page.getByRole('button', { name: 'Save Profile' }).click();
  await expect(page.getByText('Profile saved.')).toBeVisible();
  await expect(page.getByText('Renamed Viewer', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Username')).toHaveValue('Renamed Viewer');
});

test('Users edits local email and keeps Plex email provider-managed', async ({
  page,
}) => {
  await fixtures(page);
  let email = 'old@example.test';
  await page.route(/\/api\/v1\/user\?/, (route) =>
    route.fulfill({
      json: {
        pageInfo: { pages: 1 },
        results: [
          {
            id: 19,
            displayName: 'Local Viewer',
            email,
            permissions: 32,
            userType: 2,
          },
          {
            id: 20,
            displayName: 'Plex Viewer',
            email: 'plex@example.test',
            permissions: 32,
            userType: 1,
          },
        ],
      },
    })
  );
  await page.route('**/api/v1/user/19/settings/main', (route) => {
    if (route.request().method() === 'POST') {
      expect(route.request().postDataJSON()).toEqual({
        email: 'new@example.test',
      });
      email = 'new@example.test';
    }
    return route.fulfill({ json: { username: 'Local Viewer', email } });
  });
  await page.route('**/api/v1/user/20/settings/main', (route) =>
    route.fulfill({
      json: { username: 'Plex Viewer', email: 'plex@example.test' },
    })
  );
  await page.goto('/admin/users');
  const plex = page.getByRole('listitem').filter({ hasText: 'Plex Viewer' });
  await plex.getByRole('button', { name: 'Edit Profile' }).click();
  await expect(plex.getByLabel('Username')).toHaveValue('Plex Viewer');
  await expect(plex.getByLabel('Email', { exact: true })).toHaveCount(0);
  const local = page.getByRole('listitem').filter({ hasText: 'Local Viewer' });
  await local.getByRole('button', { name: 'Edit Profile' }).click();
  await local.getByLabel('Email', { exact: true }).fill('new@example.test');
  await local.getByRole('button', { name: 'Save Profile' }).click();
  await expect(local.getByText('Profile saved.')).toBeVisible();
  await expect(
    local.getByText('new@example.test', { exact: true })
  ).toBeVisible();
});

test('Users confirms a managed local password and clears the form after saving', async ({
  page,
}) => {
  await fixtures(page);
  await page.route(/\/api\/v1\/user\?/, (route) =>
    route.fulfill({
      json: {
        pageInfo: { pages: 1 },
        results: [
          { id: 19, displayName: 'Viewer', permissions: 32 },
          { id: 20, displayName: 'Admin', permissions: 2 },
        ],
      },
    })
  );
  let saves = 0;
  await page.route('**/api/v1/user/19/settings/password', (route) => {
    expect(route.request().method()).toBe('POST');
    expect(route.request().postDataJSON()).toEqual({
      newPassword: 'fixture-password',
    });
    saves++;
    return route.fulfill({ status: 204 });
  });
  const action = page.getByRole('button', {
    name: 'Set Local Password',
    exact: true,
  });
  await page.goto('/admin/users');
  await expect(action).toHaveCount(1);
  await action.click();
  const password = page.getByLabel('New Local Password', { exact: true });
  const confirm = page.getByLabel('Confirm New Local Password', {
    exact: true,
  });
  await password.fill('fixture-password');
  await confirm.fill('mismatch-password');
  await page.getByRole('button', { name: 'Save Local Password' }).click();
  await expect(page.getByRole('alert')).toContainText(
    'Enter matching passwords'
  );
  expect(saves).toBe(0);
  await confirm.fill('fixture-password');
  await page.getByRole('button', { name: 'Save Local Password' }).click();
  await expect(page.getByText('Local password saved.')).toBeVisible();
  await expect(password).toHaveValue('');
  await expect(confirm).toHaveValue('');
  expect(saves).toBe(1);
});

test('Managed TV access bookmark opens the selected user and the review queue', async ({
  page,
}) => {
  await fixtures(page);
  await page.route(/\/api\/v1\/user\?/, (route) => {
    expect(new URL(route.request().url()).searchParams.get('includeIds')).toBe(
      '19'
    );
    return route.fulfill({
      json: {
        pageInfo: { pages: 1 },
        results: [{ id: 19, displayName: 'Viewer', permissions: 32 }],
      },
    });
  });
  await page.route('**/api/v1/user/19/settings/tv-season-watch-gate', (route) =>
    route.fulfill({
      json: { status: 'pending', globallyEnabled: false, requestedAt: null },
    })
  );
  await page.goto('/admin/users/19/tv-request-access');
  await expect(page.getByText('Waiting for approval')).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Review TV Access Requests' })
  ).toHaveAttribute('href', '/me/account/tv-requests');
});

test('Managed Linked Accounts preserves a last sign-in method', async ({
  page,
}) => {
  await fixtures(page);
  await page.route(/\/api\/v1\/user\?/, (route) =>
    route.fulfill({
      json: {
        pageInfo: { pages: 1 },
        results: [{ id: 19, displayName: 'Viewer', permissions: 32 }],
      },
    })
  );
  let accounts = [
    { id: 4, username: 'viewer', provider: { name: 'Provider One' } },
    { id: 8, username: 'viewer', provider: { name: 'Provider Two' } },
  ];
  await page.route('**/api/v1/user/19/settings/linked-accounts', (route) =>
    route.fulfill({ json: accounts })
  );
  await page.route('**/api/v1/user/19/settings/password', (route) =>
    route.fulfill({ json: { hasPassword: false } })
  );
  await page.route('**/api/v1/user/19/settings/linked-accounts/4', (route) => {
    expect(route.request().method()).toBe('DELETE');
    accounts = accounts.filter((account) => account.id !== 4);
    return route.fulfill({ status: 204 });
  });
  await page.goto('/admin/users/19/linked-accounts');
  await page.getByRole('button', { name: 'Unlink Provider One' }).click();
  expect(accounts).toHaveLength(2);
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Unlink Account' })
    .click();
  await expect(page.getByText('Account unlinked.')).toBeVisible();
  await expect(page.getByText('Provider Two', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Unlink Provider Two' })
  ).toHaveCount(0);
});

test('Managed notifications save for the selected user without touching browser devices', async ({
  page,
}) => {
  await fixtures(page);
  await page.route(/\/api\/v1\/user\?/, (route) =>
    route.fulfill({
      json: {
        pageInfo: { pages: 1 },
        results: [{ id: 19, displayName: 'Viewer', permissions: 32 }],
      },
    })
  );
  let mask = 0;
  await page.route('**/api/v1/user/19/settings/notifications', (route) => {
    if (route.request().method() === 'POST') {
      expect(route.request().postDataJSON()).toEqual({
        notificationTypes: { email: 4 },
      });
      mask = 4;
    }
    return route.fulfill({
      json: {
        emailEnabled: true,
        webPushEnabled: true,
        notificationTypes: { email: mask, webpush: 0 },
      },
    });
  });
  let deviceReads = 0;
  await page.route('**/api/v1/user/19/pushSubscriptions', (route) => {
    deviceReads++;
    return route.fulfill({ json: [] });
  });
  await page.addInitScript(() => {
    const originalScroll = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function (options) {
      if (this.id.startsWith('notification-')) {
        this.setAttribute('data-bookmark-target', 'true');
      }
      originalScroll.call(this, options);
    };
  });
  await page.goto('/admin/users/19/notifications#notification-webpush');
  await expect(page.locator('#notification-webpush')).toHaveAttribute(
    'data-bookmark-target',
    'true'
  );
  await page
    .getByRole('checkbox', { name: 'Request approved', exact: true })
    .first()
    .check();
  await page.getByRole('button', { name: 'Save Email Preferences' }).click();
  await expect(page.getByText('Email preferences saved.')).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Registered Browser Devices' })
  ).toHaveCount(0);
  expect(deviceReads).toBe(0);
});

test('administrators create and revoke a one-time Lumen sign-in link for a selected user', async ({
  page,
}, info) => {
  await fixtures(page);
  await page.route(/\/api\/v1\/user\?/, (route) =>
    route.fulfill({
      json: {
        pageInfo: { pages: 1 },
        results: [{ id: 19, displayName: 'Viewer', permissions: 32 }],
      },
    })
  );
  let link: { id: number; status: string; expiresAt: string } | undefined;
  const token = 'A'.repeat(43);
  await page.route('**/api/v1/settings/login-links?userId=19', (route) =>
    route.fulfill({ json: link ? [link] : [] })
  );
  await page.route('**/api/v1/settings/login-links', (route) => {
    expect(route.request().postDataJSON()).toEqual({ userId: 19 });
    link = { id: 42, status: 'active', expiresAt: '2027-03-01T12:30:00Z' };
    return route.fulfill({ status: 201, json: { ...link, token } });
  });
  await page.route('**/api/v1/settings/login-links/42/revoke', (route) => {
    expect(route.request().method()).toBe('POST');
    link = { id: 42, status: 'revoked', expiresAt: '2027-03-01T12:30:00Z' };
    return route.fulfill({ json: link });
  });

  await page.goto('/admin/users/19');
  await page
    .getByRole('button', { name: 'Sign-in Links', exact: true })
    .click();
  await expect(page.getByText('No sign-in links yet.')).toBeVisible();
  await page.getByRole('button', { name: 'Create Sign-in Link' }).click();
  await expect(page.getByLabel('New sign-in link')).toHaveValue(
    `${new URL(page.url()).origin}/#loginToken=${token}`
  );
  await expect(page.getByRole('button', { name: 'Revoke Link' })).toBeVisible();
  await page.screenshot({ path: info.outputPath('managed-login-link.png') });
  await page.getByRole('button', { name: 'Revoke Link' }).click();
  await expect(
    page.getByText('Sign-in link revoked.', { exact: true })
  ).toBeVisible();
  await expect(page.getByLabel('New sign-in link')).toHaveCount(0);
  await expect(page.getByText('Revoked', { exact: true })).toBeVisible();
});

test('Spotify credentials retain a saved secret on ID changes and allow explicit removal', async ({
  page,
}, info) => {
  await fixtures(page);
  const saved = {
    applicationTitle: 'SeerrNG',
    applicationUrl: 'https://seerr.example.test',
    spotifyClientId: 'previous-client',
    spotifyClientSecret: '********',
  };
  const writes: unknown[] = [];
  await page.route('**/api/v1/settings/main', (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      writes.push(body);
      if (writes.length === 1)
        return route.fulfill({
          status: 503,
          json: { message: 'Temporary Spotify settings error.' },
        });
      Object.assign(saved, body);
    }
    return route.fulfill({ json: saved });
  });
  await page.goto('/admin/general#spotifyClientId');
  const id = page.getByLabel('Spotify Client ID', { exact: true });
  const secret = page.getByLabel('Spotify Client Secret');
  const save = page.getByRole('button', { name: 'Save Spotify Credentials' });
  await expect(secret).toHaveValue('');
  await id.fill('replacement-client');
  await save.click();
  await expect(
    page.getByText('Temporary Spotify settings error.')
  ).toBeVisible();
  await expect(id).toHaveValue('replacement-client');
  await save.click();
  await expect(page.getByText('Spotify credentials saved.')).toBeVisible();
  expect(writes).toEqual([
    { spotifyClientId: 'replacement-client' },
    { spotifyClientId: 'replacement-client' },
  ]);
  await save.scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('spotify-credentials.png') });
  await page.getByLabel('Remove saved Spotify secret').check();
  await save.click();
  await expect(page.getByLabel('Remove saved Spotify secret')).toHaveCount(0);
  expect(writes.at(-1)).toEqual({ spotifyClientSecret: '' });
});

test('application API key is masked and regeneration requires confirmation', async ({
  page,
}, info) => {
  await fixtures(page);
  await page.route('**/api/v1/settings/main', (route) =>
    route.fulfill({
      json: { applicationTitle: 'SeerrNG', apiKey: 'fixture-original-key' },
    })
  );
  let rotations = 0;
  await page.route('**/api/v1/settings/main/regenerate', (route) => {
    expect(route.request().method()).toBe('POST');
    rotations++;
    return route.fulfill({ json: { apiKey: 'fixture-replacement-key' } });
  });

  await page.goto('/admin/general#apiKey');
  const input = page.getByLabel('API Key', { exact: true });
  await expect(input).toHaveValue('••••••••••••••••');
  const regenerate = page.getByRole('button', { name: 'Regenerate Key' });
  await regenerate.click();
  const confirmation = page.getByRole('alertdialog');
  await confirmation.getByRole('button', { name: 'Keep Current Key' }).click();
  expect(rotations).toBe(0);
  await page.getByRole('button', { name: 'Reveal Key' }).click();
  await expect(input).toHaveValue('fixture-original-key');
  await regenerate.click();
  await confirmation.getByRole('button', { name: 'Regenerate Key' }).click();
  await expect(input).toHaveValue('••••••••••••••••');
  await expect(
    page.getByText('Application API key regenerated.')
  ).toBeVisible();
  await page.screenshot({ path: info.outputPath('application-api-key.png') });
  await page.getByRole('button', { name: 'Reveal Key' }).click();
  await expect(input).toHaveValue('fixture-replacement-key');
  expect(rotations).toBe(1);
});

test('General Settings shortcuts scroll to their controls after settings load', async ({
  page,
}, info) => {
  await fixtures(page);
  await page.route('**/api/v1/settings/main', (route) =>
    route.fulfill({
      json: {
        applicationTitle: 'SeerrNG',
        apiKey: 'fixture-masked-key',
        spotifyClientId: 'fixture-client',
      },
    })
  );
  for (const [anchor, label] of [
    ['enable4k', 'Enable 4K'],
    ['spotifyClientId', 'Spotify Client ID'],
    ['apiKey', 'API Key'],
  ] as const) {
    await page.goto(`/admin/general#${anchor}`);
    const control = page.getByLabel(label, { exact: true });
    await expect(control).toBeInViewport({ ratio: 1 });
    await page.screenshot({ path: info.outputPath(`settings-${anchor}.png`) });
  }
});

test('Library Path Mappings retains rejected edits and uses the server-normalized mappings', async ({
  page,
}, info) => {
  await fixtures(page);
  const writes: unknown[] = [];
  const mapping = {
    serviceType: 'radarr',
    serviceId: 1,
    remoteRoot: '/movies',
    localRoot: '/mnt/media/movies',
  };
  await page.route('**/api/v1/settings/main', (route) => {
    if (route.request().method() === 'GET')
      return route.fulfill({
        json: { applicationTitle: 'SeerrNG', downloadPathMappings: [] },
      });
    const body = route.request().postDataJSON();
    writes.push(body);
    if (writes.length === 1)
      return route.fulfill({
        status: 400,
        json: { message: 'The selected library path is invalid.' },
      });
    return route.fulfill({ json: { downloadPathMappings: [mapping] } });
  });

  await page.goto('/admin/general');
  const editor = page.getByLabel('Library Path Mappings', { exact: true });
  const save = page.getByRole('button', { name: 'Save Library Path Mappings' });
  await editor.fill('{');
  await save.click();
  await expect(
    page.getByText('Enter a JSON array of path mappings.')
  ).toBeVisible();
  expect(writes).toHaveLength(0);

  const draft = [{ ...mapping, remoteRoot: '/movies/' }];
  await editor.fill(JSON.stringify(draft));
  await save.click();
  await expect(
    page.getByText('The selected library path is invalid.')
  ).toBeVisible();
  await expect(editor).toHaveValue(JSON.stringify(draft));
  await save.click();
  await expect(page.getByText('Library path mappings saved.')).toBeVisible();
  await expect(editor).toHaveValue(JSON.stringify([mapping], null, 2));
  await expect(save).toBeDisabled();
  expect(writes).toEqual([
    { downloadPathMappings: draft },
    { downloadPathMappings: draft },
  ]);
  await page.screenshot({
    path: info.outputPath('download-path-mappings.png'),
  });
});

test('Metadata Credentials preserves untouched credentials and retries replacements', async ({
  page,
}, info) => {
  await fixtures(page);
  const saved = {
    comicVineApiKey: '********',
    metronToken: '********',
    googleBooksApiKey: '',
    youtubeApiKey: '********',
  };
  const writes: unknown[] = [];
  await page.route('**/api/v1/settings/main', (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      writes.push(body);
      if (writes.length === 1)
        return route.fulfill({
          status: 503,
          json: { message: 'Metadata settings are temporarily unavailable.' },
        });
      if (body.comicVineApiKey) saved.comicVineApiKey = '********';
      if (body.metronToken === '') saved.metronToken = '';
    }
    return route.fulfill({ json: saved });
  });
  await page.goto('/admin/metadata');
  const comicVine = page.getByLabel('ComicVine API Key', { exact: true });
  const metron = page.getByLabel('Metron API Token', { exact: true });
  const youtube = page.getByLabel('YouTube Data API Key', { exact: true });
  const save = page.getByRole('button', { name: 'Save Metadata Credentials' });
  await expect(comicVine).toHaveValue('');
  await expect(metron).toHaveValue('');
  await expect(youtube).toHaveValue('');
  await comicVine.fill('fixture-new-key');
  await page.getByLabel('Remove saved Metron API Token').check();
  await save.click();
  await expect(
    page.getByText('Metadata settings are temporarily unavailable.')
  ).toBeVisible();
  await expect(comicVine).toHaveValue('fixture-new-key');
  await expect(page.getByLabel('Remove saved Metron API Token')).toBeChecked();
  await save.click();
  await expect(page.getByText('Metadata credentials saved.')).toBeVisible();
  await expect(comicVine).toHaveValue('');
  await expect(page.getByLabel('Remove saved Metron API Token')).toHaveCount(0);
  await expect(
    page.getByLabel('Remove saved YouTube Data API Key')
  ).toBeVisible();
  expect(writes).toEqual([
    { comicVineApiKey: 'fixture-new-key', metronToken: '' },
    { comicVineApiKey: 'fixture-new-key', metronToken: '' },
  ]);
  await page.screenshot({ path: info.outputPath('metadata-credentials.png') });
});

test('Discovery region settings preserve legacy values and retry only changed fields', async ({
  page,
}, info) => {
  await fixtures(page);
  await page.route('**/api/v1/regions', (route) =>
    route.fulfill({
      json: [
        { iso_3166_1: 'CA', english_name: 'Canada' },
        { iso_3166_1: 'US', english_name: 'United States' },
      ],
    })
  );
  await page.route('**/api/v1/languages', (route) =>
    route.fulfill({
      json: [
        { iso_639_1: 'en', english_name: 'English' },
        { iso_639_1: 'fr', english_name: 'French' },
      ],
    })
  );
  const saved = {
    discoverRegion: 'ZZ',
    streamingRegion: 'US',
    originalLanguage: 'en',
  };
  const writes: unknown[] = [];
  await page.route('**/api/v1/settings/main', (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      writes.push(body);
      if (writes.length === 1)
        return route.fulfill({
          status: 503,
          json: { message: 'Could not save regions.' },
        });
      Object.assign(saved, body);
    }
    return route.fulfill({ json: saved });
  });
  await page.goto('/admin/discovery');
  const discover = page.getByLabel('Discover Region', { exact: true });
  const streaming = page.getByLabel('Streaming Region', { exact: true });
  const language = page.getByLabel('Original Language', { exact: true });
  const save = page.getByRole('button', {
    name: 'Save Discovery Region Settings',
  });
  const includeAdult = page.getByRole('checkbox', {
    name: 'Include Adult Content in TMDB Search and Discovery',
  });
  await expect(includeAdult).not.toBeChecked();
  await expect(discover).toHaveValue('ZZ');
  await discover.selectOption('CA');
  await discover.selectOption('ZZ');
  await expect(save).toBeDisabled();
  await streaming.selectOption('CA');
  await language.selectOption('fr');
  await includeAdult.check();
  await page.getByLabel('Hide Requested Titles', { exact: true }).check();
  await save.click();
  await expect(page.getByText('Could not save regions.')).toBeVisible();
  await expect(streaming).toHaveValue('CA');
  await expect(language).toHaveValue('fr');
  await expect(includeAdult).toBeChecked();
  await save.click();
  await expect(
    page.getByText('Discovery region settings saved.')
  ).toBeVisible();
  expect(writes).toEqual([
    {
      streamingRegion: 'CA',
      originalLanguage: 'fr',
      hideRequested: true,
      includeAdult: true,
    },
    {
      streamingRegion: 'CA',
      originalLanguage: 'fr',
      hideRequested: true,
      includeAdult: true,
    },
  ]);
  await page.reload();
  await expect(includeAdult).toBeChecked();
  await page.screenshot({
    path: info.outputPath('discovery-region-settings.png'),
  });
});

test('Discover and Movies apply visibility defaults while the library view still shows owned titles', async ({
  page,
}) => {
  await fixtures(page);
  await page.route('**/api/v1/settings/public', (route) =>
    route.fulfill({
      json: { hideAvailable: true, hideRequested: true, hideBlocklisted: true },
    })
  );
  const titles = [
    { ...movie, id: 101, title: 'Owned fixture', mediaInfo: { status: 5 } },
    {
      ...movie,
      id: 102,
      title: 'Requested fixture',
      mediaInfo: { hasActiveRequest: true },
    },
    { ...movie, id: 103, title: 'Blocked fixture', mediaInfo: { status: 6 } },
    { ...movie, id: 104, title: 'Visible fixture', mediaInfo: undefined },
  ];
  await page.route(
    /\/api\/v1\/discover\/(movies|trending)(?:\?|$)/,
    (route) => {
      const library = new URL(route.request().url()).searchParams.has(
        'availability'
      );
      return route.fulfill({
        json: paged(library ? titles.slice(0, 1) : titles),
      });
    }
  );
  await page.goto('./');
  const rail = page.getByRole('heading', {
    name: 'Trending movies',
    exact: true,
  });
  await expect(rail).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Visible fixture' }).first()
  ).toBeVisible();
  for (const title of [
    'Owned fixture',
    'Requested fixture',
    'Blocked fixture',
  ]) {
    await expect(page.getByRole('link', { name: title })).toHaveCount(0);
  }
  await page.goto('./movies');
  await expect(
    page.getByRole('link', { name: 'Visible fixture' })
  ).toBeVisible();
  for (const title of [
    'Owned fixture',
    'Requested fixture',
    'Blocked fixture',
  ]) {
    await expect(page.getByRole('link', { name: title })).toHaveCount(0);
  }
  await page.getByRole('button', { name: /^On / }).click();
  await expect(page.getByRole('link', { name: 'Owned fixture' })).toBeVisible();
  const librarySearch = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return (
      url.pathname === '/api/v1/discover/movies' &&
      url.searchParams.get('availability') === 'hd' &&
      url.searchParams.get('search') === 'fixture'
    );
  });
  await page
    .getByRole('searchbox', { name: 'Title', exact: true })
    .fill('fixture');
  await page.getByRole('button', { name: 'Apply Title' }).click();
  await librarySearch;
  await expect(page.getByRole('link', { name: 'Owned fixture' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Visible fixture' })).toHaveCount(
    0
  );
  const sortedLibrarySearch = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return (
      url.pathname === '/api/v1/discover/movies' &&
      url.searchParams.get('availability') === 'hd' &&
      url.searchParams.get('search') === 'fixture' &&
      url.searchParams.get('sortBy') === 'original_title.asc'
    );
  });
  await page
    .getByRole('combobox', { name: 'Sort', exact: true })
    .selectOption('original_title.asc');
  await sortedLibrarySearch;
  await expect(page.getByRole('link', { name: 'Owned fixture' })).toBeVisible();
  await page.getByRole('button', { name: 'All', exact: true }).click();
  await expect(
    page.getByRole('link', { name: 'Requested fixture' })
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Blocked fixture' })).toHaveCount(
    0
  );
  const seriesSort = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === '/api/v1/discover/tv' &&
      url.searchParams.get('availability') === 'hd' &&
      url.searchParams.get('firstAirDateGte') === '2020-01-01' &&
      url.searchParams.get('sortBy') === 'first_air_date.desc'
    );
  });
  await page.goto(
    './series?show=have&sort=first_air_date.desc&firstAirDateGte=2020-01-01'
  );
  await seriesSort;
  const invertedQueries: string[] = [];
  await page.route('**/api/v1/discover/tv?**', (route) => {
    invertedQueries.push(route.request().url());
    return route.fulfill({ json: paged([]) });
  });
  await page.goto(
    './series?show=have&firstAirDateGte=2025-12-31&firstAirDateLte=2025-01-01'
  );
  await expect(
    page.getByRole('alert').filter({ hasText: 'lower bound' })
  ).toBeVisible();
  await expect(page.getByText('Nothing here', { exact: true })).toHaveCount(0);
  expect(invertedQueries).toEqual([]);
  await page.goto('./series?show=have&firstAirDateGte=2025-02-29');
  await expect(
    page.getByRole('alert').filter({ hasText: 'invalid date' })
  ).toBeVisible();
  expect(invertedQueries).toEqual([]);
  await page.getByRole('button', { name: 'Clear Release Dates' }).click();
  await expect(page).toHaveURL(/series\?show=have$/);
  await expect.poll(() => invertedQueries.length).toBe(1);
});

test('Trending and Coming Soon apply discovery visibility and keep later pages reachable', async ({
  page,
}) => {
  await fixtures(page);
  await page.route('**/api/v1/settings/public', (route) =>
    route.fulfill({ json: { hideRequested: true } })
  );
  const seen: string[] = [];
  await page.route(
    /\/api\/v1\/discover\/(trending|movies\/upcoming)\?/,
    (route) => {
      const url = new URL(route.request().url());
      const number = Number(url.searchParams.get('page'));
      seen.push(`${url.pathname}:${number}`);
      return route.fulfill({
        json: {
          page: number,
          totalPages: 2,
          totalResults: 2,
          results: [
            number === 1
              ? {
                  ...movie,
                  title: 'Requested fixture',
                  releaseDate: '2099-01-01',
                  mediaInfo: { hasActiveRequest: true },
                }
              : {
                  ...movie,
                  id: movie.id + 1,
                  title: 'Later fixture',
                  releaseDate: '2099-01-02',
                },
          ],
        },
      });
    }
  );
  for (const [path, button] of [
    ['/trending?mediaType=movie', 'Show more trending titles'],
    ['/soon?media=movie', 'Show more upcoming movies'],
  ] as const) {
    await page.goto(path);
    const more = page.getByRole('button', { name: button });
    await expect(more).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Requested fixture' })
    ).toHaveCount(0);
    await expect(page.getByText('No upcoming titles found.')).toHaveCount(0);
    await more.click();
    await expect(
      page.getByRole('link', { name: 'Later fixture' })
    ).toBeVisible();
  }
  expect(seen).toEqual([
    '/api/v1/discover/trending:1',
    '/api/v1/discover/trending:2',
    '/api/v1/discover/movies/upcoming:1',
    '/api/v1/discover/movies/upcoming:2',
  ]);
});

test('Streaming Request Policy preserves edits across a failed save', async ({
  page,
}, info) => {
  await fixtures(page);
  let policy = {
    enabled: false,
    condition: 'available',
    action: 'reject',
    rejectionMessage: '',
    allowUserOverride: false,
  };
  const writes: unknown[] = [];
  await page.route('**/api/v1/settings/main', (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      writes.push(body);
      if (writes.length === 1)
        return route.fulfill({
          status: 503,
          json: { message: 'Policy settings temporarily unavailable.' },
        });
      policy = body.streamingRequestPolicy;
    }
    return route.fulfill({ json: { streamingRequestPolicy: policy } });
  });

  await page.goto('/admin/discovery');
  const enable = page.getByLabel('Enable Streaming Request Policy');
  await expect(enable).not.toBeChecked();
  await enable.check();
  const condition = page.getByLabel('When the title is');
  await condition.selectOption('unavailable');
  await page.getByLabel('Allow per-user overrides').check();
  await page.getByLabel('Rejection message').fill('Review your subscriptions.');
  const save = page.getByRole('button', {
    name: 'Save Streaming Request Policy',
  });
  await save.click();
  await expect(
    page.getByText('Policy settings temporarily unavailable.')
  ).toBeVisible();
  await expect(condition).toHaveValue('unavailable');
  await expect(page.getByLabel('Rejection message')).toHaveValue(
    'Review your subscriptions.'
  );
  await save.click();
  await expect(page.getByText('Streaming request policy saved.')).toBeVisible();
  expect(writes).toEqual([
    { streamingRequestPolicy: policy },
    { streamingRequestPolicy: policy },
  ]);
  expect(policy).toEqual({
    enabled: true,
    condition: 'unavailable',
    action: 'reject',
    rejectionMessage: 'Review your subscriptions.',
    allowUserOverride: true,
  });
  await expect(save).toBeDisabled();
  await page.screenshot({
    path: info.outputPath('streaming-request-policy.png'),
  });
});

test('movie and series details use separate account regions for providers and ratings', async ({
  page,
}, info) => {
  await fixtures(page);
  const watchProviders = [
    { iso_3166_1: 'US', flatrate: [{ id: 3, name: 'US Stream' }] },
    { iso_3166_1: 'CA', flatrate: [{ id: 7, name: 'Canada Stream' }] },
  ];
  await page.route('**/api/v1/user/*/settings/main', (route) =>
    route.fulfill({ json: { streamingRegion: 'CA', discoverRegion: 'GB' } })
  );
  await page.route('**/api/v1/movie/101', (route) =>
    route.fulfill({
      json: {
        ...movie,
        originalLanguage: 'fr',
        status: 'Released',
        budget: 1_000_000,
        revenue: 4_500_000,
        genres: [],
        watchProviders,
        releases: {
          results: [
            {
              iso_3166_1: 'US',
              release_dates: [
                {
                  certification: 'PG-13',
                  type: 3,
                  release_date: '2020-05-01T00:00:00Z',
                },
              ],
            },
            {
              iso_3166_1: 'GB',
              release_dates: [
                {
                  certification: '12A',
                  type: 3,
                  release_date: '2020-05-08T00:00:00Z',
                },
                {
                  certification: '',
                  type: 4,
                  release_date: '2020-06-01T00:00:00Z',
                },
                {
                  certification: '',
                  type: 1,
                  release_date: '2020-04-22T00:00:00Z',
                },
              ],
            },
          ],
        },
      },
    })
  );
  await page.route('**/api/v1/tv/202', (route) =>
    route.fulfill({
      json: {
        id: 202,
        name: 'Series Fixture',
        originalLanguage: 'fr',
        genres: [],
        seasons: [],
        watchProviders,
        contentRatings: {
          results: [
            { iso_3166_1: 'US', rating: 'TV-MA' },
            { iso_3166_1: 'GB', rating: '15' },
          ],
        },
      },
    })
  );
  for (const [path, rating, wrongRating, capture] of [
    ['/movie/101', '12A', 'PG-13', 'movie'],
    ['/tv/202', '15', 'TV-MA', 'series'],
  ]) {
    await page.goto(path);
    await expect(
      page.getByText('Streaming Providers', { exact: true })
    ).toBeVisible();
    await expect(
      page.getByText('Canada Stream', { exact: true })
    ).toBeVisible();
    await expect(page.getByText('US Stream', { exact: true })).toHaveCount(0);
    await expect(page.locator('.cert')).toHaveText(rating);
    await expect(
      page.getByRole('link', { name: 'French', exact: true })
    ).toHaveAttribute(
      'href',
      capture === 'movie' ? '/movies?language=fr' : '/series?language=fr'
    );
    if (capture === 'movie') {
      await expect(page.getByText('$1,000,000', { exact: true })).toBeVisible();
      await expect(page.getByText('$4,500,000', { exact: true })).toBeVisible();
      await expect(page.getByText('Theatrical · May 8, 2020')).toBeVisible();
      await expect(page.getByText('Digital · Jun 1, 2020')).toBeVisible();
      await expect(page.getByText('Theatrical · May 1, 2020')).toHaveCount(0);
      await expect(page.getByText(/Apr 22, 2020/)).toHaveCount(0);
    }
    await expect(page.getByText(wrongRating, { exact: true })).toHaveCount(0);
    await page.screenshot({
      path: info.outputPath(capture + '-regional-details.png'),
    });
  }
});

test('discovery sort displays Classic bookmark orders and sends changes to the catalog', async ({
  page,
}) => {
  await fixtures(page);
  for (const [route, apiPath, initial, next] of [
    ['/movies', '/discover/movies', 'original_title.asc', 'release_date.asc'],
    ['/series', '/discover/tv', 'original_name.asc', 'first_air_date.asc'],
  ]) {
    await page.goto(`${route}?nativeFilters=1&sortBy=${initial}&language=fr`);
    const sort = page.getByRole('combobox', { name: 'Sort', exact: true });
    await expect(sort).toHaveValue(initial);
    const request = page.waitForRequest((item) => {
      const url = new URL(item.url());
      return (
        url.pathname === '/api/v1' + apiPath &&
        url.searchParams.get('sortBy') === next &&
        url.searchParams.get('language') === 'fr'
      );
    });
    await sort.selectOption(next);
    await request;
    await page.reload();
    await expect(sort).toHaveValue(next);
  }
});

test('discovery content ratings preserve Classic filters and apply exact ratings', async ({
  page,
}) => {
  await fixtures(page);
  await page.goto(
    '/movies?nativeFilters=1&certificationGte=PG&certificationLte=R&certificationCountry=US&genre=18'
  );
  const select = page.getByRole('combobox', { name: 'Content Rating' });
  await expect(select).toHaveValue('range');
  const exact = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return (
      url.pathname === '/api/v1/discover/movies' &&
      url.searchParams.get('certification') === 'PG-13' &&
      url.searchParams.get('certificationCountry') === 'US' &&
      !url.searchParams.has('certificationGte') &&
      url.searchParams.get('genre') === '18'
    );
  });
  await select.selectOption('PG-13');
  await exact;
  await page.reload();
  await expect(select).toHaveValue('PG-13');
  await select.selectOption('');
  await expect(page).toHaveURL(/\/movies\?genre=18$/);
});

test('Classic video search bookmarks apply discovery constraints until cleared', async ({
  page,
}) => {
  await fixtures(page);
  const filtered = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return (
      url.pathname === '/api/v1/discover/movies' &&
      url.searchParams.get('search') === 'Test' &&
      url.searchParams.get('genre') === '18' &&
      url.searchParams.get('language') === 'fr'
    );
  });
  await page.goto('/search?query=Test&type=movie&genre=18&language=fr');
  await filtered;
  const unfiltered = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return (
      url.pathname === '/api/v1/search' &&
      url.searchParams.get('query') === 'Test'
    );
  });
  await page.getByRole('button', { name: 'Clear Discovery Filters' }).click();
  await unfiltered;
  await expect(page).toHaveURL(/\/search\?q=Test&f=movie$/);
});

test('a filter-only Classic series bookmark shows matching titles without a search term', async ({
  page,
}) => {
  await fixtures(page);
  await page.route('**/api/v1/discover/tv?*', (route) => {
    const url = new URL(route.request().url());
    expect(url.searchParams.get('genre')).toBe('18');
    expect(url.searchParams.get('language')).toBe('fr');
    expect(url.searchParams.has('search')).toBe(false);
    const second = url.searchParams.get('page') === '2';
    return route.fulfill({
      json: {
        ...paged([
          {
            mediaType: 'tv',
            id: second ? 92 : 91,
            name: second ? 'Second Filtered Series' : 'Filtered Series Fixture',
            directors: ['Zara'],
          },
          ...(url.searchParams.get('includeCredits') === 'true'
            ? [
                {
                  mediaType: 'tv',
                  id: 93,
                  name: 'Directed Series',
                  directors: ['Ada'],
                },
              ]
            : []),
        ]),
        totalPages: 2,
      },
    });
  });
  await page.goto('./search?type=tv&genre=18&language=fr');
  await expect(
    page.getByRole('link', { name: 'Filtered Series Fixture' })
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Trending this week' })
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Next Page' }).click();
  await expect(
    page.getByRole('link', { name: 'Second Filtered Series' })
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('link', { name: 'Second Filtered Series' })
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Next Page' })).toBeDisabled();
  await page.getByRole('button', { name: 'Clear Discovery Filters' }).click();
  await expect(
    page.getByRole('link', { name: 'Filtered Series Fixture' })
  ).toHaveCount(0);
  await expect(page).toHaveURL(/\/search\?f=tv$/);
  await page.goto('./search?type=tv&genre=18&language=fr&sort=director');
  const series = page.getByRole('link', {
    name: /^(Directed Series|Filtered Series Fixture)$/,
  });
  await expect(series.first()).toHaveAccessibleName('Directed Series');
  await page.getByLabel('Sort Results').selectOption('director:desc');
  await expect(series.first()).toHaveAccessibleName('Filtered Series Fixture');
});

test('regular video search links to later pages and resets on scope change', async ({
  page,
}) => {
  await fixtures(page);
  await page.route('**/api/v1/search?**', (route) => {
    const query = new URL(route.request().url()).searchParams;
    const second = query.get('page') === '2';
    return route.fulfill({
      json: {
        ...paged([
          {
            ...movie,
            id: second ? 102 : 101,
            title: second ? 'Second Page Film' : 'First Page Film',
          },
        ]),
        totalPages: 2,
      },
    });
  });
  await page.goto('./search?q=Test&sort=title&order=desc');
  await expect(
    page.getByRole('link', { name: 'First Page Film' })
  ).toBeVisible();
  await page.getByRole('button', { name: 'Next Page' }).click();
  await expect(
    page.getByRole('link', { name: 'Second Page Film' })
  ).toBeVisible();
  await expect(page).toHaveURL(/page=2$/);
  await expect(page.getByLabel('Sort Results')).toHaveValue('title:desc');
  await page.reload();
  await expect(
    page.getByRole('link', { name: 'Second Page Film' })
  ).toBeVisible();
  await expect(page.getByLabel('Sort Results')).toHaveValue('title:desc');
  await page
    .getByRole('group', { name: 'Search in' })
    .getByRole('button', { name: 'Movies' })
    .click();
  await expect(
    page.getByRole('link', { name: 'First Page Film' })
  ).toBeVisible();
  await expect(page).toHaveURL(/q=Test&sort=title&order=desc&f=movie$/);
});

test('All search reaches later book pages after the video results end', async ({
  page,
}) => {
  await fixtures(page);
  await page.route('**/api/v1/search?**', (route) =>
    route.fulfill({ json: paged([{ ...movie, title: 'Only Film' }]) })
  );
  await page.route('**/api/v1/discover/books?**', (route) => {
    const params = new URL(route.request().url()).searchParams;
    const audio = params.get('format') === 'audiobook';
    const current = Number(params.get('page'));
    const title = audio ? 'Only Audiobook' : `Book Page ${current}`;
    return route.fulfill({
      json: {
        ...paged([
          { id: audio ? 'audio' : `book-${current}`, mediaType: 'book', title },
        ]),
        totalPages: audio ? 1 : 2,
      },
    });
  });
  await page.goto('./search?q=Test');
  await expect(page.getByRole('link', { name: 'Book Page 1' })).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Only Audiobook' })
  ).toBeVisible();
  await page.getByRole('button', { name: 'Next Page' }).click();
  await expect(page.getByRole('link', { name: 'Book Page 2' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Only Film' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Only Audiobook' })).toHaveCount(
    0
  );
  await expect(page.getByRole('button', { name: 'Next Page' })).toBeDisabled();
  await page.goBack();
  await expect(page.getByRole('link', { name: 'Book Page 1' })).toBeVisible();
});

test('All search keeps successful results and retries a failed book catalog', async ({
  page,
}) => {
  await fixtures(page);
  let bookCatalogUnavailable = true;
  let videoPartial = false;
  await page.route('**/api/v1/search?**', (route) =>
    route.fulfill({
      json: {
        ...paged([{ ...movie, title: 'Available Film' }]),
        partial: videoPartial,
      },
    })
  );
  await page.route('**/api/v1/discover/books?**', (route) => {
    const audio =
      new URL(route.request().url()).searchParams.get('format') === 'audiobook';
    if (audio) return route.fulfill({ json: paged([]) });
    if (bookCatalogUnavailable) return route.fulfill({ status: 503, json: {} });
    return route.fulfill({
      json: paged([
        { id: 'recovered', mediaType: 'book', title: 'Recovered Book' },
      ]),
    });
  });
  await page.goto('./search?q=Test');
  const film = page.getByRole('link', { name: 'Available Film' });
  const warning = page
    .getByRole('alert')
    .filter({ hasText: 'some search results' });
  await expect(film).toBeVisible();
  await expect(warning).toBeVisible();
  bookCatalogUnavailable = false;
  await warning.getByRole('button', { name: 'Retry' }).click();
  await expect(film).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Recovered Book' })
  ).toBeVisible();
  await expect(warning).toHaveCount(0);
  videoPartial = true;
  await page.goto('./search?q=Other');
  await expect(film).toBeVisible();
  await expect(warning).toContainText('A search provider did not respond.');
  videoPartial = false;
  await warning.getByRole('button', { name: 'Retry' }).click();
  await expect(warning).toHaveCount(0);
  await expect(film).toBeVisible();
});

test('scoped book and comic searches retain their catalogue page in the URL', async ({
  page,
}) => {
  await fixtures(page);
  await page.route('**/api/v1/book/search?*', (route) =>
    route.fulfill({ json: paged([]) })
  );
  for (const [scope, endpoint, format] of [
    ['ebook', 'books', 'ebook'],
    ['audio', 'books', 'audiobook'],
    ['comic', 'comics', ''],
  ]) {
    const matches = (request: { url: () => string }, number: string) => {
      const url = new URL(request.url());
      return (
        url.pathname === '/api/v1/discover/' + endpoint &&
        url.searchParams.get('query') === 'Fixture' &&
        url.searchParams.get('page') === number &&
        (format
          ? url.searchParams.get('format') === format
          : url.searchParams.get('group') === 'works')
      );
    };
    await page.route(
      (url) => url.pathname === '/api/v1/discover/' + endpoint,
      (route) => route.fulfill({ json: { ...paged([]), totalPages: 2 } })
    );
    const first = page.waitForRequest((request) => matches(request, '1'));
    await page.goto('./search?q=Fixture&f=' + scope);
    await first;
    const second = page.waitForRequest((request) => matches(request, '2'));
    await page.getByRole('button', { name: 'Next Page' }).click();
    await second;
    await expect(page).toHaveURL(/page=2$/);
    await expect(
      page.getByRole('button', { name: 'Next Page' })
    ).toBeDisabled();
    await page.reload();
    await expect(
      page.getByRole('navigation', { name: 'Search Result Pages' })
    ).toContainText('Page 2');
  }
});

test('Classic author search bookmarks open the Authors scope and link to author details', async ({
  page,
}) => {
  await fixtures(page);
  const requests: string[] = [];
  await page.route('**/api/v1/search?*', (route) => {
    const type = new URL(route.request().url()).searchParams.get('type');
    requests.push(type ?? '');
    return route.fulfill({
      json: paged([
        { mediaType: 'author', id: 'OL123A', name: 'Fixture Author' },
      ]),
    });
  });
  await page.goto('/search?query=Fixture&type=author');
  await expect(page.getByRole('button', { name: 'Authors' })).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  await expect(
    page.getByRole('link', { name: 'Fixture Author' })
  ).toHaveAttribute('href', '/author/OL123A');
  expect(requests).toEqual(['author']);
  await page.getByRole('button', { name: 'All', exact: true }).click();
  await expect.poll(() => requests.at(-1)).toBe('');
  await expect(
    page.getByRole('link', { name: 'Fixture Author' })
  ).toBeVisible();
});

test('Classic music search bookmarks open the Music scope with album and artist results', async ({
  page,
}) => {
  await fixtures(page);
  const albumId = 'ca52c0ec-764d-4705-9fac-6315533215a2';
  const artistId = '8a7ca096-0778-49cb-8a0e-02cdabd91735';
  const secondAlbumId = 'a9ac219a-1d5c-4844-ab4b-9164f779c5e8';
  await page.route('**/api/v1/search?*', (route) => {
    const query = new URL(route.request().url()).searchParams;
    expect(query.get('type')).toBe('music');
    expect(query.get('genre')).toBe('jazz');
    return route.fulfill({
      json: paged([
        {
          mediaType: 'album',
          id: albumId,
          title: 'Fixture Album',
          'artist-credit': [{ name: 'Zara' }],
        },
        {
          mediaType: 'album',
          id: secondAlbumId,
          title: 'Second Album',
          'artist-credit': [{ name: 'Ada' }],
        },
        { mediaType: 'artist', id: artistId, name: 'Fixture Artist' },
      ]),
    });
  });
  await page.goto('./search?query=Fixture&type=music&genre=jazz&sort=artist');
  await expect(
    page.getByRole('button', { name: 'Music', exact: true })
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(
    page.getByRole('link', { name: 'Fixture Album' })
  ).toHaveAttribute('href', new RegExp('/music/' + albumId + '$'));
  await expect(
    page.getByRole('link', { name: 'Fixture Artist' })
  ).toHaveAttribute('href', new RegExp('/artist/' + artistId + '$'));
  const albums = page.getByRole('link', { name: /^(Fixture|Second) Album$/ });
  await expect(albums.first()).toHaveAccessibleName('Second Album');
  await page.getByLabel('Sort Results').selectOption('artist:desc');
  await expect(albums.first()).toHaveAccessibleName('Fixture Album');
  await page.route('**/api/v1/discover/music?*', (route) => {
    const query = new URL(route.request().url()).searchParams;
    expect(query.get('genre')).toBe('jazz');
    expect(query.get('page')).toBe('2');
    expect(query.has('query')).toBe(false);
    return route.fulfill({
      json: {
        ...paged([
          { mediaType: 'album', id: albumId, title: 'Jazz Catalogue Album' },
        ]),
        page: 2,
        totalPages: 2,
      },
    });
  });
  await page.goto('./search?type=music&genre=jazz&page=2');
  await expect(
    page.getByRole('link', { name: 'Jazz Catalogue Album' })
  ).toBeVisible();
  await page.getByRole('button', { name: 'Clear Discovery Filters' }).click();
  await expect(page).toHaveURL(/\/search\?f=music$/);
  await expect(
    page.getByRole('link', { name: 'Jazz Catalogue Album' })
  ).toHaveCount(0);
});

test('Classic book bookmarks sort search results by author and publisher', async ({
  page,
}) => {
  await fixtures(page);
  await page.route('**/api/v1/discover/books?**', (route) =>
    route.fulfill({
      json: paged([
        {
          id: 'first',
          mediaType: 'book',
          title: 'First Book',
          author: 'Zara',
          publisher: 'Alpha Press',
          bookFormat: 'ebook',
        },
        {
          id: 'second',
          mediaType: 'book',
          title: 'Second Book',
          author: 'Ada',
          publisher: 'Zeta Press',
          bookFormat: 'ebook',
        },
        {
          id: 'third',
          mediaType: 'book',
          title: 'Third Book',
          bookFormat: 'ebook',
        },
      ]),
    })
  );
  await page.goto('./search?query=Fixture&type=book&sort=author');
  const books = page.getByRole('link', { name: /^(First|Second|Third) Book$/ });
  await expect(books.first()).toHaveAccessibleName('Second Book');
  await expect(books.last()).toHaveAccessibleName('Third Book');
  await page.getByLabel('Sort Results').selectOption('author:desc');
  await expect(books.first()).toHaveAccessibleName('First Book');
  await expect(books.last()).toHaveAccessibleName('Third Book');
  await page.goto('./search?query=Fixture&type=book&sort=publisher&order=desc');
  await expect(books.first()).toHaveAccessibleName('Second Book');
  await expect(books.last()).toHaveAccessibleName('Third Book');
  await page.getByLabel('Sort Results').selectOption('publisher:asc');
  await expect(books.first()).toHaveAccessibleName('First Book');
  await expect(books.last()).toHaveAccessibleName('Third Book');
});

for (const { advanced, detail } of [
  { advanced: false, detail: false },
  { advanced: true, detail: false },
  { advanced: true, detail: true },
]) {
  test(`magazine ${detail ? 'detail' : 'discovery'} requests a title with ${advanced ? 'a selected service' : 'the default service'}`, async ({
    page,
  }) => {
    await fixtures(page);
    await page.route('**/api/v1/auth/me', (route) =>
      route.fulfill({
        json: {
          id: 1,
          displayName: 'Subscriber',
          permissions: 2199023255552 + (advanced ? 8192 : 0),
        },
      })
    );
    await page.route('**/api/v1/settings/public', (route) =>
      route.fulfill({ json: { enabledMediaCategories: { magazine: true } } })
    );
    await page.route('**/api/v1/user/1/settings/main', (route) =>
      route.fulfill({ json: { enabledMediaCategories: { magazine: true } } })
    );
    await page.route('**/api/v1/discover/magazines?*', (route) =>
      route.fulfill({ json: paged([]) })
    );
    let restricted = true;
    await page.route('**/api/v1/user/1/quota', (route) =>
      route.fulfill({
        json: {
          magazine: {
            limit: 3,
            remaining: restricted ? 0 : 2,
            days: 7,
            restricted,
          },
        },
      })
    );
    let serviceReads = 0;
    await page.route('**/api/v1/service/magazine', (route) => {
      serviceReads += 1;
      return route.fulfill({
        json: [
          { id: 3, name: 'Default Library', isDefault: true },
          { id: 7, name: 'Alternate Library', isDefault: false },
        ],
      });
    });
    const posts: unknown[] = [];
    await page.route('**/api/v1/request', (route) => {
      expect(route.request().method()).toBe('POST');
      posts.push(route.request().postDataJSON());
      return route.fulfill({ json: { id: 123, status: 1 } });
    });
    await page.route('**/api/v1/magazine/Unlisted', (route) =>
      route.fulfill({
        json: {
          id: 'Unlisted',
          title: 'Unlisted',
          mediaType: 'magazine',
          provider: 'googlebooks',
          requestable: true,
        },
      })
    );
    await page.goto(
      detail ? '/magazine/Unlisted' : '/magazines?query=Unlisted'
    );
    const request = page.getByRole('button', {
      name: detail ? 'Request magazine' : 'Request “Unlisted”',
      exact: true,
    });
    await request.click();
    const sheet = page.getByRole('alertdialog', { name: 'Request Magazine' });
    await expect(sheet).toContainText('Unlisted');
    await expect(sheet).toContainText('Approval required');
    await expect(
      sheet.getByText('Magazine request quota reached.', { exact: false })
    ).toBeVisible();
    await expect(
      sheet.getByRole('button', { name: 'Send Request' })
    ).toBeDisabled();
    await sheet.getByRole('button', { name: 'Cancel' }).click();
    expect(posts).toHaveLength(0);
    restricted = false;
    await request.click();
    await sheet.getByRole('button', { name: 'Recheck Quota' }).click();
    await expect(sheet).toContainText('2 of 3 magazine requests remaining.');
    const service = sheet.getByRole('combobox', { name: 'Magazine Service' });
    if (advanced) await service.selectOption('7');
    else await expect(service).toHaveCount(0);
    await sheet.getByRole('button', { name: 'Send Request' }).click();
    await expect(
      page.getByRole('button', {
        name: detail ? 'Requested' : 'Requested Unlisted',
        exact: true,
      })
    ).toBeDisabled();
    expect(posts).toEqual([
      {
        mediaType: 'magazine',
        mediaId: 'Unlisted',
        ...(advanced ? { serverId: 7 } : {}),
      },
    ]);
    expect(serviceReads > 0).toBe(advanced);
  });
}

test('magazine discovery prevents duplicate title requests', async ({
  page,
}) => {
  await fixtures(page);
  await page.route('**/api/v1/settings/public', (route) =>
    route.fulfill({ json: { enabledMediaCategories: { magazine: true } } })
  );
  await page.route('**/api/v1/discover/magazines?*', (route) =>
    route.fulfill({ json: paged([]) })
  );
  await page.route('**/api/v1/user/1/quota', (route) =>
    route.fulfill({ json: { magazine: { restricted: false } } })
  );
  let reads = 0;
  await page.route('**/api/v1/magazine/Existing', (route) => {
    reads += 1;
    return route.fulfill({
      json: {
        id: 'Existing',
        title: 'Existing',
        mediaType: 'magazine',
        mediaInfo: { hasActiveRequest: true },
      },
    });
  });
  await page.goto('/magazines?query=Existing');
  await page.getByRole('button', { name: 'Request “Existing”' }).click();
  const sheet = page.getByRole('alertdialog', { name: 'Request Magazine' });
  await expect(sheet.getByRole('status')).toHaveText(
    'This magazine has already been requested'
  );
  await expect(
    sheet.getByRole('button', { name: 'Send Request' })
  ).toBeDisabled();
  expect(reads).toBe(1);
});

test('magazine discovery bookmarks keep the catalogue when editing a search', async ({
  page,
}) => {
  await fixtures(page);
  await page.route('**/api/v1/settings/public', (route) =>
    route.fulfill({ json: { enabledMediaCategories: { magazine: true } } })
  );
  await page.route('**/api/v1/user/1/settings/main', (route) =>
    route.fulfill({ json: { enabledMediaCategories: { magazine: true } } })
  );
  const reads: URLSearchParams[] = [];
  await page.route('**/api/v1/discover/magazines?*', (route) => {
    const params = new URL(route.request().url()).searchParams;
    reads.push(params);
    return route.fulfill({ json: paged([]) });
  });
  await page.goto('/magazines?query=Garden');
  const search = page.getByPlaceholder('Search magazines…');
  await expect(search).toHaveValue('Garden');
  await expect.poll(() => reads.at(-1)?.get('catalog')).toBe('tracked');
  await search.fill('Garden Design');
  await expect
    .poll(() => Object.fromEntries(reads.at(-1) ?? []))
    .toMatchObject({ catalog: 'tracked', query: 'Garden Design' });
  await page.getByRole('button', { name: 'Public Catalogue' }).click();
  await expect
    .poll(() => Object.fromEntries(reads.at(-1) ?? []))
    .toMatchObject({ catalog: 'public', query: 'Garden Design' });
  await expect(search).toHaveValue('Garden Design');
  await search.fill('');
  const suggestions = page.getByRole('group', {
    name: 'Suggested Magazine Searches',
  });
  await expect(
    suggestions.getByRole('button', { name: 'National Geographic' })
  ).toBeVisible();
  await expect(page.getByText('No magazines yet')).toHaveCount(0);
  await expect(page).toHaveURL(/\/magazines\?catalog=public$/);
  expect(
    reads.some((read) => read.get('catalog') === 'public' && !read.has('query'))
  ).toBe(false);
  await suggestions
    .getByRole('button', { name: 'National Geographic' })
    .click();
  await expect(search).toHaveValue('National Geographic');
  await expect
    .poll(() => Object.fromEntries(reads.at(-1) ?? []))
    .toMatchObject({
      catalog: 'public',
      query: 'National Geographic',
    });
  await expect(suggestions).toHaveCount(0);
});

test('Classic magazine bookmarks keep the search scope and link to magazine details', async ({
  page,
}) => {
  await fixtures(page);
  await page.route('**/api/v1/search?*', (route) => {
    const query = new URL(route.request().url()).searchParams;
    expect(query.get('type')).toBe('magazine');
    expect(query.get('page')).toBe('2');
    return route.fulfill({
      json: {
        ...paged([
          {
            mediaType: 'magazine',
            id: 'fixture',
            provider: 'googlebooks',
            title: 'Fixture Magazine',
          },
        ]),
        page: 2,
        totalPages: 2,
      },
    });
  });
  await page.goto('/search?query=Fixture&type=magazine&page=2');
  await expect(
    page.getByRole('button', { name: 'Magazines', exact: true })
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(
    page.getByRole('link', { name: 'Fixture Magazine' })
  ).toHaveAttribute('href', '/magazine/Fixture%20Magazine');
});

test('adult discovery bookmarks retain the selected Whisparr service', async ({
  page,
}) => {
  await fixtures(page);
  await page.route('**/api/v1/settings/public', (route) =>
    route.fulfill({
      json: { adultEnabled: true, enabledMediaCategories: { adult: true } },
    })
  );
  await page.route('**/api/v1/service/whisparr', (route) =>
    route.fulfill({
      json: [
        { id: 1, name: 'First Service' },
        { id: 2, name: 'Second Service' },
      ],
    })
  );
  const reads: URLSearchParams[] = [];
  await page.route('**/api/v1/adult/search?*', (route) => {
    const params = new URL(route.request().url()).searchParams;
    reads.push(params);
    const partial = !params.has('serverId');
    return route.fulfill({
      json: {
        ...paged(
          partial
            ? [
                {
                  id: '12345678-1234-4123-8123-123456789abc',
                  mediaType: 'adult',
                  title: 'Fixture Result',
                  serviceId: 1,
                },
              ]
            : []
        ),
        partial,
      },
    });
  });
  await page.goto('/adult?query=Fixture&serverId=2');
  const service = page.getByRole('combobox', { name: 'Whisparr Service' });
  await expect(service).toHaveValue('2');
  await expect
    .poll(() => Object.fromEntries(reads.at(-1) ?? []))
    .toMatchObject({ query: 'Fixture', serverId: '2' });
  await service.selectOption('');
  await expect.poll(() => reads.at(-1)?.has('serverId')).toBe(false);
  expect(reads.at(-1)?.get('query')).toBe('Fixture');
  const notice = page.getByText('Whisparr returned partial results.', {
    exact: false,
  });
  await expect(notice).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Fixture Result' })
  ).toBeVisible();
  await service.selectOption('2');
  await expect(notice).toHaveCount(0);
  await expect(page.getByText('Nothing found')).toBeVisible();
});

test('Sportarr league details explain unmonitored schedules and show event dates', async ({
  page,
}) => {
  await fixtures(page);
  await page.route('**/api/v1/settings/public', (route) =>
    route.fulfill({ json: { enabledMediaCategories: { sports: true } } })
  );
  await page.route(/\/api\/v1\/sportarr\/lg-12345[67]$/, (route) => {
    const monitored = route.request().url().endsWith('7');
    return route.fulfill({
      json: {
        id: monitored ? 'lg-123457' : 'lg-123456',
        title: 'Fixture League',
        mediaType: 'sports',
        requestable: false,
        eventsAvailable: monitored,
        libraryState: monitored ? 'monitored' : 'unmonitored',
      },
    });
  });
  let eventReads = 0;
  await page.route('**/api/v1/sportarr/*/events?*', (route) => {
    eventReads += 1;
    return route.fulfill({
      json: {
        eventsAvailable: true,
        totalPages: 1,
        results: [
          {
            id: 1,
            title: 'Scheduled Event',
            season: 2026,
            broadcastDate: '2026-06-01T01:00:00Z',
            broadcastTimezone: 'America/New_York',
            monitored: true,
            hasFile: false,
          },
          {
            id: 2,
            title: 'Unscheduled Event',
            monitored: false,
            hasFile: false,
          },
        ],
      },
    });
  });
  await page.goto('/sportarr/lg-123456');
  await expect(
    page.getByText('Enable monitoring in Sportarr', { exact: false })
  ).toBeVisible();
  expect(eventReads).toBe(0);
  await page.goto('/sportarr/lg-123457');
  const scheduled = page
    .getByRole('listitem')
    .filter({ has: page.getByText('Scheduled Event', { exact: true }) });
  await expect(scheduled.locator('time')).toHaveAttribute(
    'datetime',
    '2026-06-01T01:00:00Z'
  );
  await expect(scheduled).toContainText('Season 2026');
  await expect(scheduled).toContainText('May 31');
  await expect(page.getByText('Date not announced')).toBeVisible();
});

for (const autoApprove of [false, true]) {
  test(`Sportarr league follow checks the selected destination and ${autoApprove ? 'automatic approval' : 'required approval'}`, async ({
    page,
  }) => {
    await fixtures(page);
    await page.route('**/api/v1/auth/me', (route) =>
      route.fulfill({
        json: {
          id: 1,
          displayName: 'Viewer',
          permissions: 32 + 8192 + (autoApprove ? 2 ** 44 : 0),
        },
      })
    );
    let restricted = true;
    await page.route('**/api/v1/user/1/quota', (route) =>
      route.fulfill({
        json: { tv: { limit: 4, remaining: restricted ? 0 : 2, restricted } },
      })
    );
    await page.route('**/api/v1/settings/public', (route) =>
      route.fulfill({ json: { enabledMediaCategories: { sports: true } } })
    );
    await page.route('**/api/v1/service/sportarr', (route) =>
      route.fulfill({
        json: [
          { id: 1, name: 'Already Following' },
          { id: 2, name: 'Alternate Service' },
        ],
      })
    );
    await page.route(/\/api\/v1\/sportarr\/lg-123456(?:\?|$)/, (route) => {
      const source = new URL(route.request().url()).searchParams.get(
        'serverId'
      );
      return route.fulfill({
        json: {
          id: 'lg-123456',
          title: 'Fixture League',
          mediaType: 'sports',
          requestable: source === '2',
          libraryState: source === '2' ? 'not-added' : 'monitored',
          mediaInfo: { status: 5 },
        },
      });
    });
    const writes: unknown[] = [];
    await page.route('**/api/v1/request', (route) => {
      writes.push(route.request().postDataJSON());
      return route.fulfill({
        json: { id: 8, status: writes.length === 1 ? 4 : 1 },
      });
    });
    await page.goto('/sportarr/lg-123456');
    await page
      .getByRole('button', { name: 'Choose Sportarr Service', exact: true })
      .click();
    const sheet = page.getByRole('alertdialog', { name: 'Follow League' });
    const choice = sheet.getByRole('combobox', { name: 'Sportarr Service' });
    await choice.selectOption('1');
    await expect(
      sheet.getByRole('status').filter({ hasText: /In library|Followed/i })
    ).toBeVisible();
    await expect(
      sheet.getByRole('button', { name: 'Send Request' })
    ).toBeDisabled();
    expect(writes).toHaveLength(0);
    await choice.selectOption('2');
    await expect(
      sheet.getByText(
        autoApprove ? 'Automatically approved' : 'Approval required',
        { exact: true }
      )
    ).toBeVisible();
    await expect(
      sheet.getByText('TV request quota reached.', { exact: false })
    ).toBeVisible();
    await expect(
      sheet.getByRole('button', { name: 'Send Request' })
    ).toBeDisabled();
    restricted = false;
    await sheet.getByRole('button', { name: 'Recheck Quota' }).click();
    await expect(
      sheet.getByText('2 of 4 TV requests remaining.', { exact: false })
    ).toBeVisible();
    await sheet.getByRole('button', { name: 'Send Request' }).click();
    await expect(sheet.getByRole('alert')).toHaveText(
      'The league request failed.'
    );
    await expect(choice).toHaveValue('2');
    await sheet.getByRole('button', { name: 'Send Request' }).click();
    await expect(sheet).toHaveCount(0);
    expect(writes).toEqual([
      { mediaType: 'sports', mediaId: 'lg-123456', serverId: 2 },
      { mediaType: 'sports', mediaId: 'lg-123456', serverId: 2 },
    ]);
  });
}

test('Classic sports discovery bookmarks preserve the editable league search', async ({
  page,
}) => {
  await fixtures(page);
  await page.route('**/api/v1/settings/public', (route) =>
    route.fulfill({ json: { enabledMediaCategories: { sports: true } } })
  );
  const queries: string[] = [];
  await page.route('**/api/v1/discover/sports?*', (route) => {
    const query = new URL(route.request().url()).searchParams.get('query');
    if (query) queries.push(query);
    return route.fulfill({
      json: paged(
        query
          ? [
              {
                mediaType: 'sports',
                id: 'lg-123456',
                title: query,
              },
            ]
          : []
      ),
    });
  });
  await page.goto('/sports?query=Fixture+League');
  const search = page.getByPlaceholder(
    'Search leagues — Premier League, NFL, F1…'
  );
  await expect(search).toHaveValue('Fixture League');
  await expect(
    page.getByRole('link', { name: 'Fixture League' })
  ).toHaveAttribute('href', '/sportarr/lg-123456');
  await search.fill('Another League');
  await expect(
    page.getByRole('link', { name: 'Another League' })
  ).toBeVisible();
  await search.fill('');
  await expect(page).toHaveURL(/\/sports$/);
  await expect(page.getByRole('link', { name: 'Fixture League' })).toHaveCount(
    0
  );
  expect(queries).toContain('Another League');
});

test('Classic sports search bookmarks open the requested page of Sportarr leagues', async ({
  page,
}) => {
  await fixtures(page);
  await page.route('**/api/v1/discover/sports?*', (route) => {
    const query = new URL(route.request().url()).searchParams;
    expect(query.get('query')).toBe('Fixture');
    expect(query.get('page')).toBe('2');
    return route.fulfill({
      json: {
        ...paged([
          {
            mediaType: 'sports',
            id: '42',
            title: 'Fixture League',
            libraryState: 'monitored',
          },
        ]),
        page: 2,
        totalPages: 2,
      },
    });
  });
  await page.goto('/search?query=Fixture&type=sports&page=2');
  await expect(
    page.getByRole('button', { name: 'Sports', exact: true })
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(
    page.getByRole('link', { name: 'Fixture League' })
  ).toHaveAttribute('href', '/sportarr/42');
  await expect(
    page.getByRole('navigation', { name: 'Search Result Pages' })
  ).toContainText('Page 2');
});

test('Classic Software search bookmarks open the matching Lumen catalog and query', async ({
  page,
}) => {
  await fixtures(page);
  await page.goto('/search?type=software&query=Fixture+Game&category=retro');
  await expect(page).toHaveURL(/\/games\?c=retro&q=Fixture\+Game$/);
});

test('audiobook search includes exact series matches and a format-preserving results link', async ({
  page,
}) => {
  await fixtures(page);
  await page.route('**/api/v1/settings/public', (route) =>
    route.fulfill({
      json: {
        initialized: true,
        booksEnabled: true,
        audiobookServiceEnabled: true,
      },
    })
  );
  await page.route('**/api/v1/book-series/search?*', (route) => {
    const query = new URL(route.request().url()).searchParams;
    expect(query.get('format')).toBe('audiobook');
    expect(query.get('query')).toBe('Fixture Series');
    return route.fulfill({
      json: {
        status: 'ok',
        results: [
          {
            key: 'fixture',
            title: 'Fixture Series',
            serverName: 'Book Service',
            format: 'audiobook',
            source: 'library',
            href: '/book-series/42',
          },
        ],
      },
    });
  });
  await page.goto('/search?type=book&format=audiobook&query=Fixture+Series');
  await expect(
    page.getByRole('link', { name: 'Open Fixture Series from Book Service' })
  ).toHaveAttribute('href', '/book-series/42');
  await expect(
    page.getByRole('link', { name: 'View All Series Results' })
  ).toHaveAttribute(
    'href',
    '/book-series?query=Fixture+Series&format=audiobook'
  );
});

test('book series catalog preserves matched Bookshelf lookup titles', async ({
  page,
}) => {
  await fixtures(page);
  await page.route('**/api/v1/book-series/catalog?*', (route) =>
    route.fulfill({
      json: {
        title: 'Fixture Series',
        serverName: 'Fixture Bookshelf',
        format: 'audiobook',
        bookCount: 1,
        resolutionTruncated: false,
        entries: [
          {
            title: 'Series Listing Title',
            matchStatus: 'matched',
            book: { id: 'bookshelf:1:fixture', title: 'Matched Book Title' },
          },
        ],
      },
    })
  );
  await page.route('**/api/v1/book-series/watch?*', (route) =>
    route.fulfill({ json: { supported: false } })
  );
  await page.goto(
    '/book-series/catalog?serverId=1&scope=series&providerId=hc:42'
  );
  await expect(page.getByRole('link', { name: 'View Book' })).toHaveAttribute(
    'href',
    '/book/bookshelf%3A1%3Afixture?f=audio&lookupTitle=Matched+Book+Title'
  );
});

test('audiobook discovery bookmarks apply search, author and narrator and show series matches', async ({
  page,
}) => {
  await fixtures(page);
  await page.route('**/api/v1/book-series/search?*', (route) =>
    route.fulfill({ json: { status: 'ok', results: [] } })
  );
  await page.route('**/api/v1/discover/books?*', (route) =>
    route.fulfill({
      json: paged([
        {
          id: 'bookshelf:1:fixture',
          title: 'Fixture Audiobook',
          mediaType: 'book',
          bookFormat: 'audiobook',
        },
      ]),
    })
  );
  const filtered = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return (
      url.pathname === '/api/v1/discover/books' &&
      url.searchParams.get('format') === 'audiobook' &&
      url.searchParams.get('query') === 'Fixture Series' &&
      url.searchParams.get('author') === 'Author' &&
      url.searchParams.get('narrator') === 'Reader' &&
      url.searchParams.get('firstPublishYear') === 'before-1970' &&
      url.searchParams.get('language') === 'eng' &&
      url.searchParams.get('minRating') === '3.5' &&
      url.searchParams.get('sortBy') === 'oldest'
    );
  });
  await page.goto(
    '/books?format=audiobook&sortBy=oldest&search=Fixture+Series&author=Author&narrator=Reader&firstPublishYear=before-1970&language=eng&minRating=3.5'
  );
  await filtered;
  await expect(
    page.getByRole('link', { name: 'Fixture Audiobook', exact: true })
  ).toHaveAttribute(
    'href',
    '/book/bookshelf%3A1%3Afixture?f=audio&lookupTitle=Fixture+Audiobook'
  );
  await expect(page).toHaveURL(/\/audiobooks\?sortBy=oldest/);
  await expect(
    page.getByRole('link', { name: 'View All Series Results' })
  ).toHaveAttribute(
    'href',
    '/book-series?query=Fixture+Series&format=audiobook'
  );
  const form = page.getByRole('form', { name: 'Book Discovery Search' });
  await expect(form.getByLabel('Narrator')).toHaveValue('Reader');
  await form.getByLabel('Narrator').fill('Another Reader');
  await form.getByLabel('Minimum Book Rating').fill('4.5');
  const edited = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return (
      url.pathname === '/api/v1/discover/books' &&
      url.searchParams.get('narrator') === 'Another Reader' &&
      url.searchParams.get('minRating') === '4.5' &&
      url.searchParams.get('author') === 'Author'
    );
  });
  await form.getByRole('button', { name: 'Search Books' }).click();
  await edited;
  await page.reload();
  await expect(form.getByLabel('Narrator')).toHaveValue('Another Reader');
  await page.getByRole('button', { name: 'Clear Book Search' }).click();
  await expect(page).not.toHaveURL(
    /search=|author=|narrator=|firstPublishYear=|language=|minRating=/
  );
});
