import { expect, test, type Page } from '@playwright/test';

// Jellyfin/Emby households: sign-in, Quick Connect and the media-server wording.
const movie = {
  id: 101,
  title: 'The Test Film',
  mediaType: 'movie',
  releaseDate: '2020-01-01',
  overview: 'A deterministic catalogue title.',
  genres: [],
  releases: { results: [] },
  credits: { cast: [], crew: [] },
  runtime: 100,
};
const jellyfinUrl =
  'https://jf.example.com/web/index.html#!/details?id=abc&context=home&serverId=s1';
const paged = (results: unknown[]) => ({
  page: 1,
  totalPages: 1,
  totalResults: results.length,
  results,
});

async function fixtures(
  page: Page,
  opts: {
    serverType: number;
    config?: Record<string, unknown>;
    quickConnectOnly?: boolean;
  }
) {
  let signedIn = false;
  const calls: { path: string; body?: unknown }[] = [];
  let checks = 0;
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: opts.config || {} })
  );
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.slice('/api/v1'.length);
    calls.push({
      path,
      body: request.method() === 'POST' ? request.postDataJSON() : undefined,
    });
    let status = 200;
    let body: unknown = {};
    if (path === '/auth/me') {
      status = signedIn ? 200 : 401;
      body = signedIn ? { id: 1, displayName: 'jf user', permissions: 2 } : {};
    } else if (path === '/auth/jellyfin' || path === '/auth/local') {
      signedIn = true;
    } else if (path === '/auth/jellyfin/quickconnect/initiate') {
      body = { code: '123456', secret: 'a'.repeat(64) };
    } else if (path === '/auth/jellyfin/quickconnect/check') {
      body = { authenticated: ++checks >= 2 };
    } else if (path === '/auth/jellyfin/quickconnect/authenticate') {
      signedIn = true;
    } else if (path === '/settings/public') {
      body = {
        applicationTitle: 'SeerrNG',
        mediaServerType: opts.serverType,
        localLogin: true,
        mediaServerLogin: true,
        jellyfinQuickConnectOnly: !!opts.quickConnectOnly,
        jellyfinExternalHost: 'https://jf.example.com',
        enabledMediaCategories: {},
      };
    } else if (/^\/discover\/(trending|movies|tv)(\/upcoming)?$/.test(path))
      body = paged(path === '/discover/tv' ? [] : [movie]);
    else if (path === '/movie/101')
      body = {
        ...movie,
        mediaInfo: { id: 10, status: 5, mediaUrl: jellyfinUrl },
      };
    else if (path === '/discover/genreslider/movie') body = [];
    else if (path === '/movie/101/recommendations') body = paged([]);
    else if (path === '/media' || path === '/discover/books') body = paged([]);
    else if (path === '/request')
      body = { pageInfo: { pages: 1, results: 0 }, results: [] };
    else if (path === '/request/count') body = { total: 0 };
    else if (/^\/user\/\d+\/quota$/.test(path)) body = {};
    else if (path === '/service/radarr') body = [];
    else if (!path.startsWith('/auth/')) {
      status = 404;
      body = { message: 'Unspecified QA endpoint' };
    }
    await route.fulfill({ status, json: body });
  });
  return { calls, errors };
}

test('Jellyfin password sign-in and Jellyfin wording', async ({ page }) => {
  const { calls, errors } = await fixtures(page, { serverType: 2 });
  await page.goto('/');
  await expect(
    page.getByText('Use the same account you use for Jellyfin.')
  ).toBeVisible();
  await expect(page.getByRole('button', { name: /Plex/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Continue with Jellyfin' }).click();
  await expect(
    page.getByRole('link', { name: 'Forgot password?' })
  ).toHaveAttribute(
    'href',
    'https://jf.example.com/web/index.html#!/forgotpassword.html'
  );
  await page.getByLabel('Jellyfin username').fill('alice');
  await page.getByLabel('Password').fill('secret');
  await page.getByRole('button', { name: 'Sign in with Jellyfin' }).click();
  await expect(
    page.getByRole('heading', { name: 'Discover', exact: true })
  ).toBeVisible();
  expect(calls.find((c) => c.path === '/auth/jellyfin')?.body).toEqual({
    username: 'alice',
    password: 'secret',
    email: 'alice',
  });
  expect(calls.some((c) => c.path === '/auth/plex')).toBe(false);

  await page.goto('/movie/101');
  const watch = page
    .getByRole('link', { name: 'Watch on Jellyfin', exact: true })
    .filter({ visible: true })
    .first();
  await expect(watch).toHaveAttribute('href', jellyfinUrl);
  await expect(page.getByText(/Plex/)).toHaveCount(0);

  await page.goto('/movies');
  await expect(
    page.getByRole('button', { name: 'On Jellyfin', exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Not on Jellyfin', exact: true })
  ).toBeVisible();

  await page.goto('/me');
  await expect(page.getByText('Media server: Jellyfin')).toBeVisible();
  await expect(page.getByText('New on Jellyfin')).toBeVisible();
  expect(errors).toEqual([]);
});

test('the next sign-in opens the way this device last signed in', async ({
  page,
}) => {
  await fixtures(page, { serverType: 2 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Continue with Jellyfin' }).click();
  await page.getByLabel('Jellyfin username').fill('alice');
  await page.getByLabel('Password').fill('secret');
  await page.getByRole('button', { name: 'Sign in with Jellyfin' }).click();
  await expect(
    page.getByRole('heading', { name: 'Discover', exact: true })
  ).toBeVisible();

  // signed out again (fresh fixtures): straight to the Jellyfin boxes, other ways still there
  await fixtures(page, { serverType: 2 });
  await page.goto('/');
  await expect(page.getByLabel('Jellyfin username')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Continue with Jellyfin' })
  ).toHaveCount(0);
  await page
    .getByRole('button', { name: 'Use an email and password instead' })
    .click();
  await page.getByLabel('Email').fill('alice@example.com');
  await page.getByLabel('Password').fill('secret');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Discover', exact: true })
  ).toBeVisible();

  // now email it is, with a way back to Jellyfin
  await fixtures(page, { serverType: 2 });
  await page.goto('/');
  await expect(page.getByLabel('Email')).toBeVisible();
  await page
    .getByRole('button', { name: 'Use your Jellyfin account instead' })
    .click();
  await expect(
    page.getByRole('button', { name: 'Continue with Jellyfin' })
  ).toBeVisible();
});

test('a failed sign-in is not remembered', async ({ page }) => {
  const { calls } = await fixtures(page, { serverType: 2 });
  await page.route('**/api/v1/auth/jellyfin', (route) =>
    route.fulfill({ status: 401, json: { message: 'INVALID_CREDENTIALS' } })
  );
  await page.goto('/');
  await page.getByRole('button', { name: 'Continue with Jellyfin' }).click();
  await page.getByLabel('Jellyfin username').fill('alice');
  await page.getByLabel('Password').fill('wrong');
  await page.getByRole('button', { name: 'Sign in with Jellyfin' }).click();
  await expect(page.getByRole('alert')).toContainText('isn’t right');
  await page.goto('/');
  await expect(
    page.getByRole('button', { name: 'Continue with Jellyfin' })
  ).toBeVisible();
  expect(calls.length).toBeGreaterThan(0);
});

test('Jellyfin Quick Connect sign-in', async ({ page }) => {
  const { calls } = await fixtures(page, {
    serverType: 2,
    quickConnectOnly: true,
  });
  await page.goto('/');
  // password sign-in is off, so the main button goes straight to Quick Connect
  await page.getByRole('button', { name: 'Continue with Jellyfin' }).click();
  await expect(page.locator('.login-code')).toHaveText('123456');
  await expect(
    page.getByRole('heading', { name: 'Discover', exact: true })
  ).toBeVisible({ timeout: 15_000 });
  expect(
    calls.find((c) => c.path === '/auth/jellyfin/quickconnect/authenticate')
      ?.body
  ).toEqual({ secret: 'a'.repeat(64) });
  expect(calls.some((c) => c.path === '/auth/jellyfin')).toBe(false);
});

test('cancelling Quick Connect stops polling', async ({ page }) => {
  const { calls } = await fixtures(page, { serverType: 2 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Continue with Jellyfin' }).click();
  await page.getByRole('button', { name: 'Use Quick Connect instead' }).click();
  await expect(page.locator('.login-code')).toHaveText('123456');
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(
    page.getByRole('button', { name: 'Continue with Jellyfin' })
  ).toBeVisible();
  await page.waitForTimeout(4500);
  expect(
    calls.some((c) => c.path === '/auth/jellyfin/quickconnect/authenticate')
  ).toBe(false);
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('admin can pin the media server in lumen-config.json', async ({
  page,
}) => {
  await fixtures(page, { serverType: 1, config: { mediaServer: 'jellyfin' } });
  await page.goto('/');
  await expect(
    page.getByRole('button', { name: 'Continue with Jellyfin' })
  ).toBeVisible();
});

test('Emby uses its own name and has no Quick Connect', async ({ page }) => {
  await fixtures(page, { serverType: 3 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Continue with Emby' }).click();
  await expect(page.getByLabel('Emby username')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Use Quick Connect instead' })
  ).toHaveCount(0);
  await expect(
    page.getByRole('link', { name: 'Forgot password?' })
  ).toHaveAttribute(
    'href',
    'https://jf.example.com/web/index.html#!/startup/forgotpassword.html'
  );
});
