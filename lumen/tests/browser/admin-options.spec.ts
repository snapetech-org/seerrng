import { expect, test, type Page } from '@playwright/test';

// Family-install feedback: plain sign-in form, 4K-only library glyphs, server and
// folder choice on poster quick requests, custom logo/tab icon, and the admin page
// that writes lumen-config.json.
const movie = (id: number, title: string, mediaInfo?: object) => ({
  id,
  title,
  mediaType: 'movie',
  releaseDate: '2020-01-01',
  posterPath: `/p${id}.png`,
  voteAverage: 7,
  mediaInfo,
});
const paged = (results: unknown[]) => ({
  page: 1,
  totalPages: 1,
  totalResults: results.length,
  results,
});

async function fixtures(
  page: Page,
  opts: { config?: object; permissions?: number; signedIn?: boolean } = {}
) {
  let signedIn = opts.signedIn ?? true;
  const posts: { path: string; body: Record<string, unknown> }[] = [];
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('https://**/*', (r) => r.abort());
  await page.route(/\/(imageproxy|branding)\//, (r) =>
    r.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#e05"/></svg>',
    })
  );
  await page.route('**/lumen-config.json', (r) =>
    r.fulfill({ json: opts.config || {} })
  );
  await page.route('**/api/v1/**', async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname.slice(7);
    if (req.method() === 'POST')
      posts.push({ path, body: req.postDataJSON() ?? {} });
    let status = 200;
    let json: unknown = {};
    if (path === '/settings/public')
      json = {
        applicationTitle: 'Seerr',
        mediaServerType: 2,
        mediaServerLogin: true,
        localLogin: true,
        enabledMediaCategories: {},
      };
    else if (path === '/auth/me') {
      status = signedIn ? 200 : 401;
      json = signedIn
        ? { id: 1, displayName: 'fam', permissions: opts.permissions ?? 2 }
        : {};
    } else if (path === '/auth/jellyfin') signedIn = true;
    else if (path === '/discover/movies' || path === '/discover/trending')
      json = paged([
        movie(301, 'Only In 4K', { id: 1, status: 1, status4k: 5 }),
        movie(302, 'Fresh Pick'),
      ]);
    else if (/^\/discover\//.test(path) || path === '/media') json = paged([]);
    else if (path === '/discover/genreslider/movie') json = [];
    else if (path === '/service/radarr')
      json = [
        { id: 0, name: 'Radarr HD', is4k: false, isDefault: true },
        { id: 1, name: 'Radarr Kids', is4k: false, isDefault: false },
      ];
    else if (/^\/service\/radarr\/\d$/.test(path))
      json = {
        profiles: [
          { id: 4, name: 'HD-1080p' },
          { id: 6, name: 'Any' },
        ],
        rootFolders: [
          { id: 1, path: '/movies' },
          { id: 2, path: '/movies-kids' },
        ],
        server: { activeProfileId: 4, activeDirectory: '/movies' },
      };
    else if (path === '/request' && req.method() === 'POST') json = { id: 9 };
    else if (path === '/request')
      json = { pageInfo: { pages: 1, results: 0 }, results: [] };
    else if (path === '/request/count') json = { total: 0 };
    else if (/^\/user\/\d+\/quota$/.test(path)) json = {};
    else if (!path.startsWith('/auth/')) {
      status = 404;
      json = { message: 'Unspecified QA endpoint' };
    }
    await route.fulfill({ status, json });
  });
  return { posts, errors };
}

async function quickRequest(page: Page, title: string) {
  const poster = page.locator('.poster', { hasText: title }).first();
  await poster.scrollIntoViewIfNeeded();
  await poster.hover();
  await poster
    .getByRole('button', { name: /^Request/ })
    .filter({ visible: true })
    .first()
    .click();
}

test('sign-in form without media server names', async ({ page }) => {
  const { posts } = await fixtures(page, {
    signedIn: false,
    config: { loginStyle: 'form' },
  });
  await page.goto('/');
  await expect(page.getByLabel('Username', { exact: true })).toBeVisible();
  await expect(page.getByText(/Jellyfin/)).toHaveCount(0);
  await page.getByLabel('Username', { exact: true }).fill('grandma');
  await page.getByLabel('Password').fill('pw');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Discover', exact: true })
  ).toBeVisible();
  expect(posts.find((p) => p.path === '/auth/jellyfin')?.body).toMatchObject({
    username: 'grandma',
  });
});

test('titles only in the 4K library still show the library glyph', async ({
  page,
}) => {
  await fixtures(page);
  await page.goto('/movies');
  const poster = page.locator('.poster', { hasText: 'Only In 4K' }).first();
  await expect(poster.locator('.glyph.ok')).toHaveCount(1);
  await expect(
    page.locator('.poster', { hasText: 'Fresh Pick' }).first().locator('.glyph')
  ).toHaveCount(0);
});

test('admins choose server, quality and folder on poster quick requests', async ({
  page,
}) => {
  const { posts, errors } = await fixtures(page, { permissions: 2 });
  await page.goto('/movies');
  await quickRequest(page, 'Fresh Pick');
  const sheet = page.getByRole('dialog', { name: 'Request Fresh Pick' });
  await expect(sheet).toBeVisible();
  await sheet.getByLabel('Server').selectOption('1');
  await expect(sheet.getByLabel('Folder')).toBeVisible();
  await sheet.getByLabel('Quality').selectOption('6');
  await sheet.getByLabel('Folder').selectOption('/movies-kids');
  expect(posts.some((p) => p.path === '/request')).toBe(false);
  await sheet.getByRole('button', { name: 'Request', exact: true }).click();
  await expect(sheet).toHaveCount(0);
  expect(posts.find((p) => p.path === '/request')?.body).toEqual({
    mediaType: 'movie',
    mediaId: 302,
    serverId: 1,
    profileId: 6,
    rootFolder: '/movies-kids',
  });
  expect(errors).toEqual([]);
});

test('regular users and admins who turn it off keep one-click requests', async ({
  page,
}) => {
  const { posts } = await fixtures(page, {
    permissions: 32, // REQUEST only
  });
  await page.goto('/movies');
  await quickRequest(page, 'Fresh Pick');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect
    .poll(() => posts.filter((p) => p.path === '/request').length)
    .toBe(1);
});

test('admin default can switch the request sheet off', async ({ page }) => {
  const { posts } = await fixtures(page, {
    permissions: 2,
    config: { defaults: { requestOptions: false } },
  });
  await page.goto('/movies');
  await quickRequest(page, 'Fresh Pick');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect
    .poll(() => posts.filter((p) => p.path === '/request').length)
    .toBe(1);
});

test('custom name, logo and tab icon', async ({ page }) => {
  await fixtures(page, {
    signedIn: false,
    config: {
      branding: {
        name: 'Movie Night',
        logo: '/branding/logo.svg',
        icon: '/branding/icon.svg',
      },
    },
  });
  await page.goto('/');
  await expect(page.locator('.login-card .brand')).toHaveText('Movie Night');
  await expect(page.locator('.login-card .brand img')).toHaveAttribute(
    'src',
    '/branding/logo.svg'
  );
  await expect(page).toHaveTitle('Movie Night');
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute(
    'href',
    '/branding/icon.svg'
  );
});

test('unsafe branding addresses are ignored', async ({ page }) => {
  await fixtures(page, {
    signedIn: false,
    config: {
      branding: { logo: 'javascript:alert(1)', icon: '//evil.example/x.png' },
    },
  });
  await page.goto('/');
  await expect(page.locator('.login-card .brand img')).toHaveCount(0);
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute(
    'href',
    '/favicon-32.png'
  );
  await expect(page).toHaveTitle('SeerrNG');
});

test('admin settings page builds lumen-config.json', async ({ page }) => {
  await fixtures(page, {
    permissions: 2,
    config: { seerrPublicUrl: 'https://seerr.example.com', custom: 1 },
  });
  await page.goto('/me');
  await page.getByRole('link', { name: /Open/ }).first().click();
  await expect(
    page.getByRole('heading', { name: 'Lumen settings for everyone' })
  ).toBeVisible();
  await page
    .locator('label', { has: page.getByText('Sign-in page', { exact: true }) })
    .locator('select')
    .selectOption('form');
  await page
    .locator('label', { has: page.getByText('Media server', { exact: true }) })
    .locator('select')
    .selectOption('jellyfin');
  await page.getByPlaceholder('/branding/logo.png').fill('/branding/logo.png');
  const row = page.locator('.cfg-row', {
    hasText: 'Show books and audiobooks',
  });
  await row.getByLabel('On').uncheck();
  await row.getByLabel('Lock').check();
  const json = JSON.parse(
    await page.getByLabel('lumen-config.json').inputValue()
  );
  expect(json).toEqual({
    seerrPublicUrl: 'https://seerr.example.com',
    custom: 1,
    loginStyle: 'form',
    mediaServer: 'jellyfin',
    branding: { logo: '/branding/logo.png' },
    defaults: { showBooks: false },
    locked: ['showBooks'],
  });
  const download = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Download lumen-config.json' })
    .click();
  expect((await download).suggestedFilename()).toBe('lumen-config.json');
});

test('admin settings page is admins only', async ({ page }) => {
  await fixtures(page, { permissions: 32 });
  await page.goto('/me');
  await expect(page.getByText('Lumen settings for everyone')).toHaveCount(0);
  await page.goto('/me/lumen');
  await expect(page.getByText('Admins only')).toBeVisible();
});

test('admin settings page opened directly starts from the current config', async ({
  page,
}) => {
  await fixtures(page, {
    permissions: 2,
    config: { loginStyle: 'form', locked: ['theme'] },
  });
  await page.goto('/me/lumen');
  await expect
    .poll(async () =>
      JSON.parse(await page.getByLabel('lumen-config.json').inputValue())
    )
    .toEqual({ loginStyle: 'form', locked: ['theme'] });
  await expect(
    page
      .locator('label', {
        has: page.getByText('Sign-in page', { exact: true }),
      })
      .locator('select')
  ).toHaveValue('form');
});

test('request sheet buttons do not overlap', async ({ page }) => {
  await fixtures(page, { permissions: 2 });
  await page.goto('/movies');
  await quickRequest(page, 'Fresh Pick');
  const sheet = page.getByRole('dialog');
  await sheet.getByLabel('Folder').waitFor();
  // measure both buttons in one frame, after the sheet's slide-up animation
  await sheet.evaluate((el) =>
    Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished))
  );
  const overlap = await sheet.evaluate((el) => {
    const [a, b] = [...el.querySelectorAll('.pk-foot button')].map((x) =>
      x.getBoundingClientRect()
    );
    return (
      !(b.top >= a.bottom || b.bottom <= a.top) &&
      !(b.left >= a.right || b.right <= a.left)
    );
  });
  expect(overlap).toBe(false);
  await sheet.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(sheet).toHaveCount(0);
});

test('sign-in card fits narrow phones', async ({ page }) => {
  await fixtures(page, { signedIn: false });
  await page.goto('/');
  await page.locator('.login-card').waitFor();
  const box = await page.locator('.login-card').boundingBox();
  const width = page.viewportSize()!.width;
  expect(box!.x + box!.width).toBeLessThanOrEqual(width);
});
