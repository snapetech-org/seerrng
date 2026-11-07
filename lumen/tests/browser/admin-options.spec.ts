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
    else if (path === '/discover/genreslider/movie') json = [];
    else if (/^\/discover\//.test(path) || path === '/media') json = paged([]);
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

async function settleVisuals(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      document
        .getAnimations()
        .filter((animation) =>
          Number.isFinite(animation.effect?.getComputedTiming().endTime)
        )
        .map((animation) => animation.finished.catch(() => {}))
    );
  });
}

for (const theme of ['light', 'dark'] as const) {
  test(`review settings, destination sheet and family sign-in in ${theme}`, async ({
    page,
  }, info) => {
    await fixtures(page, { config: { defaults: { theme } } });
    await page.goto('/me/lumen');
    await expect(
      page.getByRole('heading', { name: 'Lumen settings for everyone' })
    ).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await settleVisuals(page);
    await page.screenshot({
      path: info.outputPath('settings.png'),
      fullPage: true,
    });
    await page.goto('/movies');
    await quickRequest(page, 'Fresh Pick');
    const sheet = page.getByRole('dialog', { name: 'Request Fresh Pick' });
    await expect(sheet.getByLabel('Quality')).toBeVisible();
    await sheet.evaluate(async (element) => {
      await Promise.all(
        element
          .getAnimations({ subtree: true })
          .map((animation) => animation.finished.catch(() => {}))
      );
    });
    await expect(
      sheet.getByRole('button', { name: 'Request', exact: true })
    ).toBeInViewport();
    await expect(
      sheet.getByRole('button', { name: 'Cancel', exact: true })
    ).toBeInViewport();
    await settleVisuals(page);
    await page.screenshot({
      path: info.outputPath('request-sheet.png'),
      fullPage: true,
    });
    await sheet.getByRole('button', { name: 'Cancel', exact: true }).click();
    await fixtures(page, {
      signedIn: false,
      config: { loginStyle: 'form', defaults: { theme } },
    });
    await page.goto('/');
    await expect(page.getByLabel('Username', { exact: true })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await page.locator('.login-card').evaluate(async (element) => {
      await Promise.all(
        element
          .getAnimations({ subtree: true })
          .map((animation) => animation.finished.catch(() => {}))
      );
    });
    await settleVisuals(page);
    await page.screenshot({
      path: info.outputPath('family-sign-in.png'),
      fullPage: true,
    });
  });
}

test('quick request waits for destination details and ignores stale server replies', async ({
  page,
}) => {
  const { posts, errors } = await fixtures(page);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let firstStarted = false;
  await page.route('**/api/v1/service/radarr/0', async (route) => {
    firstStarted = true;
    await gate;
    await route.fulfill({
      json: {
        profiles: [{ id: 99, name: 'Old server quality' }],
        rootFolders: [{ id: 99, path: '/old-server' }],
        server: { activeProfileId: 99, activeDirectory: '/old-server' },
      },
    });
  });
  await page.goto('/movies');
  await quickRequest(page, 'Fresh Pick');
  const sheet = page.getByRole('dialog', { name: 'Request Fresh Pick' });
  await expect.poll(() => firstStarted).toBe(true);
  await expect(
    sheet.getByRole('button', { name: 'Request', exact: true })
  ).toBeDisabled();
  await sheet.getByLabel('Server').selectOption('1');
  await expect(sheet.getByLabel('Quality')).toHaveValue('4');
  release();
  await expect(sheet.getByLabel('Quality')).toHaveValue('4');
  await expect(sheet.getByLabel('Folder')).toHaveValue('/movies');
  await sheet.getByRole('button', { name: 'Request', exact: true }).click();
  await expect
    .poll(() => posts.filter((p) => p.path === '/request').length)
    .toBe(1);
  expect(posts.find((p) => p.path === '/request')?.body).toMatchObject({
    serverId: 1,
    profileId: 4,
    rootFolder: '/movies',
  });
  expect(errors).toEqual([]);
});

test('malformed admin preferences do not blank the application', async ({
  page,
}) => {
  const { errors } = await fixtures(page, {
    config: {
      locked: {},
      defaults: { rows: null, theme: {}, showBooks: 'false' },
    },
  });
  await page.goto('/movies');
  await expect(
    page.getByRole('heading', { name: 'Movies', exact: true })
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test('malformed category probe storage does not break navigation', async ({
  page,
}) => {
  const { errors } = await fixtures(page);
  await page.addInitScript(() =>
    sessionStorage.setItem('lumen-probes:1', 'null')
  );
  await page.route('**/api/v1/settings/public', (route) =>
    route.fulfill({
      json: {
        mediaServerType: 2,
        enabledMediaCategories: { comic: true },
        comicsEnabled: true,
      },
    })
  );
  await page.goto('/movies');
  await expect(
    page.getByRole('heading', { name: 'Movies', exact: true })
  ).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => sessionStorage.getItem('lumen-probes:1')))
    .not.toBe('null');
  expect(errors).toEqual([]);
});

test('late category probes remain scoped to the account that started them', async ({
  page,
}) => {
  await fixtures(page);
  let account = 1;
  let started = false;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/v1/settings/public', (route) =>
    route.fulfill({
      json: {
        mediaServerType: 2,
        enabledMediaCategories: { comic: true },
        comicsEnabled: true,
      },
    })
  );
  await page.route('**/api/v1/auth/me', (route) =>
    route.fulfill({
      json: { id: account, displayName: `viewer${account}`, permissions: 2 },
    })
  );
  await page.route('**/api/v1/auth/logout', (route) => {
    account = 2;
    return route.fulfill({ json: {} });
  });
  await page.route('**/api/v1/discover/comics', async (route) => {
    if (!started) {
      started = true;
      await gate;
      await route.fulfill({ status: 403, json: {} });
    } else
      await route.fulfill({ json: { results: [], comicVineConfigured: true } });
  });
  await page.goto('/me');
  await expect.poll(() => started).toBe(true);
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await page
    .getByRole('button', { name: 'Continue with Jellyfin', exact: true })
    .click();
  await page.getByLabel('Jellyfin username', { exact: true }).fill('viewer2');
  await page.getByLabel('Password', { exact: true }).fill('fixture-password');
  await page
    .getByRole('button', { name: 'Sign in with Jellyfin', exact: true })
    .click();
  const cached = (id: number) =>
    page.evaluate(
      (id) =>
        JSON.parse(sessionStorage.getItem(`lumen-probes:${id}`) || '{}')[
          '/discover/comics'
        ]?.[0],
      id
    );
  await expect.poll(() => cached(2)).toBe(true);
  release();
  await expect.poll(() => cached(1)).toBe(false);
  expect(await cached(2)).toBe(true);
});

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
  await expect(row.locator('select')).toHaveValue('on');
  await row.locator('select').selectOption('off-locked');
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

test('a rate-limited settings call is retried instead of blocking Lumen', async ({
  page,
}) => {
  await fixtures(page, { signedIn: false });
  let calls = 0;
  await page.route('**/api/v1/settings/public', (route) =>
    ++calls === 1
      ? route.fulfill({
          status: 429,
          headers: { 'Retry-After': '1' },
          body: 'Too many requests',
        })
      : route.fallback()
  );
  await page.goto('/');
  await expect(
    page.getByRole('button', { name: 'Continue with Jellyfin' })
  ).toBeVisible({ timeout: 8000 });
  await expect(page.getByText('Couldn’t load sign-in options.')).toHaveCount(0);
  expect(calls).toBe(2);
});

test('filtered Movies view stops after a few pages and offers to look further', async ({
  page,
}) => {
  await fixtures(page);
  let pages = 0;
  await page.route('**/api/v1/discover/movies?*', (route) => {
    pages++;
    const n = Number(new URL(route.request().url()).searchParams.get('page'));
    return route.fulfill({
      json: {
        page: n,
        totalPages: 500,
        totalResults: 10000,
        results: Array.from({ length: 20 }, (_, i) => ({
          id: n * 100 + i,
          title: `Popular ${n}-${i}`,
          mediaType: 'movie',
          releaseDate: '2020-01-01',
        })),
      },
    });
  });
  await page.goto('/movies?show=have');
  await expect(
    page.getByRole('button', { name: 'Look further' })
  ).toBeVisible();
  await page.waitForTimeout(1500);
  expect(pages).toBe(5);
  await page.getByRole('button', { name: 'Look further' }).click();
  await expect.poll(() => pages).toBe(10);
  await page.waitForTimeout(1000);
  expect(pages).toBe(10);
});

test('people without "View Recently Added" get no New on row and no 403s', async ({
  page,
}) => {
  const media: string[] = [];
  page.on('request', (r) => {
    if (new URL(r.url()).pathname === '/api/v1/media') media.push(r.url());
  });
  await fixtures(page, { permissions: 32 });
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Discover', exact: true })
  ).toBeVisible();
  await page.waitForTimeout(800);
  await expect(page.getByText('New on Jellyfin')).toHaveCount(0);
  expect(media).toEqual([]);
});

test('category checks are not repeated on every page load', async ({
  page,
}) => {
  await fixtures(page);
  const probes: string[] = [];
  await page.route(/\/api\/v1\/discover\/sports/, (route) => {
    probes.push(route.request().url());
    return route.fulfill({ status: 503, json: {} });
  });
  await page.route('**/api/v1/settings/public', (route) =>
    route.fulfill({
      json: {
        applicationTitle: 'Seerr',
        mediaServerType: 2,
        mediaServerLogin: true,
        localLogin: true,
        enabledMediaCategories: { movie: true, tv: true, sports: true },
      },
    })
  );
  await page.goto('/');
  await expect.poll(() => probes.length).toBe(1);
  await page.goto('/movies');
  await page.goto('/me');
  await page.waitForTimeout(800);
  expect(probes.length).toBe(1);
});

test('a page that crashes keeps the menus and offers a reload', async ({
  page,
}) => {
  await fixtures(page);
  // a malformed answer that makes the Discover genre row throw
  await page.route('**/api/v1/discover/genreslider/movie', (route) =>
    route.fulfill({ json: { not: 'a list' } })
  );
  await page.goto('/');
  await expect(
    page.getByText('Something went wrong on this page')
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reload' })).toBeVisible();
  // navigation still works
  await page.locator('a[href="/me"]').filter({ visible: true }).first().click();
  await expect(
    page.getByRole('heading', { name: 'You', exact: true })
  ).toBeVisible();
});

test('categories without a connected service stay out of the menus', async ({
  page,
}) => {
  await fixtures(page);
  // a fresh SeerrNG: every category on, no book/music/magazine service connected
  await page.route('**/api/v1/settings/public', (route) =>
    route.fulfill({
      json: {
        applicationTitle: 'Seerr',
        mediaServerType: 2,
        mediaServerLogin: true,
        localLogin: true,
        booksEnabled: false,
        ebookServiceEnabled: false,
        audiobookServiceEnabled: false,
        musicEnabled: false,
        magazinesEnabled: false,
        comicsEnabled: false,
        sportsEnabled: false,
        softwareEnabled: false,
        enabledMediaCategories: {
          movie: true,
          tv: true,
          music: true,
          ebook: true,
          audiobook: true,
          comic: true,
          magazine: true,
          sports: true,
          game: true,
          retro: true,
          modern: true,
        },
      },
    })
  );
  const extraCalls: string[] = [];
  page.on('request', (r) => {
    if (
      /discover\/(sports|comics|magazines|books)|software\/catalog/.test(
        r.url()
      )
    )
      extraCalls.push(r.url());
  });
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Discover', exact: true })
  ).toBeVisible();
  await page.waitForTimeout(800);
  for (const href of [
    '/books',
    '/audiobooks',
    '/music',
    '/magazines',
    '/comics',
    '/sports',
    '/games',
  ])
    await expect(
      page.locator(`a[href="${href}"]`).filter({ visible: true })
    ).toHaveCount(0);
  expect(extraCalls).toEqual([]);
  await page.goto('/me');
  await expect(page.getByText('Show books and audiobooks')).toHaveCount(0);
  await expect(page.locator('.quota').getByText('Books')).toHaveCount(0);
});

test('sign-in errors are written in words', async ({ page }) => {
  await fixtures(page, { signedIn: false, config: { loginStyle: 'form' } });
  await page.route('**/api/v1/auth/jellyfin', (route) =>
    route.fulfill({ status: 401, json: { message: 'INVALID_CREDENTIALS' } })
  );
  await page.goto('/');
  await page.getByLabel('Username', { exact: true }).fill('grandma');
  await page.getByLabel('Password').fill('nope');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText(
    'That username or password isn’t right.'
  );
});

test('fast typing in search keeps every letter', async ({ page }) => {
  // desktop searches from the top bar; this box is the phone/tablet one
  test.skip(page.viewportSize()!.width >= 1040, 'phone and tablet search box');
  await fixtures(page);
  await page.goto('/search');
  const box = page.locator('#sq');
  await box.click();
  await box.pressSequentially('night of the living dead', { delay: 0 });
  await page.waitForTimeout(800);
  await expect(box).toHaveValue('night of the living dead');
  // A history entry may repeat a query already typed in this mounted component.
  // POP must restore it even though stale REPLACE updates are ignored.
  await page.evaluate(() =>
    history.pushState(history.state, '', location.href)
  );
  await box.fill('second search');
  await expect(page).toHaveURL(/q=second\+search/);
  await page.goBack();
  await expect(box).toHaveValue('night of the living dead');
  // Back to an empty search still clears the box (the address drives it then)
  await page.goto('/search?q=sintel');
  await expect(box).toHaveValue('sintel');
});

test('Back closes the request sheet and stays on the page', async ({
  page,
}) => {
  await fixtures(page, { permissions: 2 });
  await page.goto('/movies');
  await quickRequest(page, 'Fresh Pick');
  const sheet = page.getByRole('dialog');
  await expect(sheet).toBeVisible();
  await page.goBack();
  await expect(sheet).toHaveCount(0);
  await expect(page).toHaveURL(/\/movies$/);
  // closing with Cancel leaves no extra history entry behind
  await quickRequest(page, 'Fresh Pick');
  await sheet.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(sheet).toHaveCount(0);
  await page.waitForTimeout(300);
  await expect(page).toHaveURL(/\/movies$/);
});

test('a failed page stops endless scrolling until Retry', async ({ page }) => {
  await fixtures(page);
  const asked: number[] = [];
  let failed = false;
  await page.route('**/api/v1/discover/movies?*', (route) => {
    const n = Number(new URL(route.request().url()).searchParams.get('page'));
    asked.push(n);
    if (n === 2 && !failed) {
      failed = true;
      return route.fulfill({ status: 429, body: 'Too many requests' });
    }
    return route.fulfill({
      json: {
        page: n,
        totalPages: 2,
        totalResults: 40,
        results: Array.from({ length: 20 }, (_, i) => ({
          id: n * 100 + i,
          title: `Popular ${n}-${i}`,
          mediaType: 'movie',
          releaseDate: '2020-01-01',
        })),
      },
    });
  });
  await page.goto('/movies');
  await expect(page.getByRole('link', { name: 'Popular 1-0' })).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
  await page.waitForTimeout(1500);
  // asked for page 2 once, not over and over
  expect(asked.filter((n) => n === 2)).toHaveLength(1);
  await page.getByRole('button', { name: 'Retry' }).click();
  await expect(page.getByRole('link', { name: 'Popular 2-0' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry' })).toHaveCount(0);
  expect(asked.filter((n) => n === 2)).toHaveLength(2);
});

test('a Discover row that fails to load says so', async ({ page }) => {
  await fixtures(page);
  await page.route('**/api/v1/discover/tv', (route) =>
    route.fulfill({ status: 500, json: { message: 'Server error' } })
  );
  await page.goto('/');
  const row = page.locator('section', {
    has: page.getByRole('heading', { name: 'Popular series' }),
  });
  await expect(row.getByText('Couldn’t load this row')).toBeVisible();
  await expect(row.locator('.skel')).toHaveCount(0);
});

test('"open full SeerrNG" works without a configured address', async ({
  page,
}) => {
  await fixtures(page);
  await page.goto('/no-such-page');
  await expect(
    page.getByRole('link', { name: 'open full SeerrNG' })
  ).toHaveAttribute('href', '/seerrng');
});

test('a stale failed page cannot block a newly selected filter', async ({
  page,
}) => {
  await fixtures(page);
  let releaseOld: (() => Promise<void>) | undefined;
  let oldStarted: (() => void) | undefined;
  const oldRequest = new Promise<void>((resolve) => {
    oldStarted = resolve;
  });
  await page.route('**/api/v1/discover/movies?*', async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get('sortBy') === 'popularity.desc') {
      releaseOld = () =>
        route.fulfill({ status: 429, body: 'Old filter failed' });
      oldStarted?.();
      return;
    }
    await route.fulfill({ json: paged([movie(901, 'New filter result')]) });
  });
  await page.goto('/movies');
  await oldRequest;
  await page
    .getByRole('combobox', { name: 'Sort', exact: true })
    .selectOption('vote_average.desc');
  // The new filter must start without waiting for the obsolete request.
  await expect(
    page.getByRole('link', { name: 'New filter result', exact: true })
  ).toBeVisible();
  await releaseOld?.();
  await page.waitForTimeout(200);
  await expect(
    page.getByRole('link', { name: 'New filter result', exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Retry', exact: true })
  ).toHaveCount(0);
});

test('a stale game page cannot overwrite loading or errors after a new search', async ({
  page,
}) => {
  await fixtures(page);
  await page.route('**/api/v1/settings/public', (route) =>
    route.fulfill({
      json: {
        applicationTitle: 'SeerrNG',
        enabledMediaCategories: { game: true },
        softwareEnabled: true,
        mediaServerType: 2,
        localLogin: true,
      },
    })
  );
  let releaseOld: (() => Promise<void>) | undefined;
  let started: (() => void) | undefined;
  const old = new Promise<void>((resolve) => {
    started = resolve;
  });
  await page.route('**/api/v1/request/software/catalog/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get('limit') === '1')
      return route.fulfill({ json: { results: [] } });
    if (url.pathname.endsWith('/popular')) {
      releaseOld = () =>
        route.fulfill({ status: 429, body: 'Old games failed' });
      started?.();
      return;
    }
    return route.fulfill({
      json: {
        results: [
          {
            id: '901',
            catalogProvider: 'igdb',
            catalogId: '901',
            title: 'New game search',
            summary: '',
            coverUrl: '',
            releaseDate: '2026-01-01',
            platforms: [],
            genres: [],
          },
        ],
        nextCursor: null,
      },
    });
  });
  await page.goto('/games');
  await old;
  await page.getByPlaceholder('Search PC games…').fill('new');
  await expect(
    page.getByRole('link', { name: 'New game search', exact: true })
  ).toBeVisible();
  await releaseOld?.();
  await page.waitForTimeout(200);
  await expect(
    page.getByRole('link', { name: 'New game search', exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Retry', exact: true })
  ).toHaveCount(0);
});
