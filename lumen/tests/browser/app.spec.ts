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
