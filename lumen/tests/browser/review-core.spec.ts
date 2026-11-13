import { expect, test, type Page, type Route } from '@playwright/test';

// Review fixes: admin settings never save over a config they couldn't read, settings
// controls keep focus, a 4K-only request leaves HD requestable, Back to a long list
// re-reads only a few pages, cover addresses are checked, and Plex sign-in fails fast.
const paged = (results: unknown[], page = 1, totalPages = 1) => ({
  page,
  totalPages,
  totalResults: results.length,
  results,
});
const svg = {
  contentType: 'image/svg+xml',
  body: '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"/>',
};

async function fixtures(
  page: Page,
  opts: {
    permissions?: number;
    config?: (route: Route) => Promise<void> | void;
    api?: (path: string, url: URL, route: Route) => unknown;
  } = {}
) {
  const posts: string[] = [];
  await page.route('https://**/*', (r) => r.abort());
  await page.route(/\/(imageproxy|branding)\//, (r) => r.fulfill(svg));
  await page.route('**/lumen-config.json', (r) =>
    opts.config ? opts.config(r) : r.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname.slice(7);
    if (req.method() === 'POST') posts.push(path);
    const own = opts.api?.(path, url, route);
    if (own === true) return;
    if (own !== undefined) return route.fulfill({ json: own });
    if (path === '/auth/me')
      return route.fulfill({
        json: { id: 1, displayName: 'fam', permissions: opts.permissions ?? 2 },
      });
    if (path === '/settings/public')
      return route.fulfill({
        json: {
          applicationTitle: 'Seerr',
          mediaServerType: 1,
          enabledMediaCategories: {},
        },
      });
    if (path === '/request' && req.method() === 'POST')
      return route.fulfill({ json: { id: 9 } });
    if (path === '/request')
      return route.fulfill({
        json: { pageInfo: { pages: 1, results: 0 }, results: [] },
      });
    if (path === '/request/count') return route.fulfill({ json: { total: 0 } });
    if (path.startsWith('/discover/genreslider/'))
      return route.fulfill({ json: [] });
    if (/^\/discover\//.test(path) || path === '/media')
      return route.fulfill({ json: paged([]) });
    if (/^\/user\/\d+\/quota$/.test(path)) return route.fulfill({ json: {} });
    return route.fulfill({ status: 404, json: { message: 'Not in fixture' } });
  });
  return { posts };
}

async function writableStorage(page: Page) {
  const puts: string[] = [];
  await page.route('**/lumen/config', (route) => {
    const req = route.request();
    if (req.method() === 'PUT') {
      puts.push(req.postData() || '');
      return route.fulfill({ json: { saved: true } });
    }
    return route.fulfill({ json: { canSave: true, folder: 'ok' } });
  });
  await page.route('**/lumen/branding/*', (route) => {
    puts.push(route.request().url());
    return route.fulfill({ json: { url: '/branding/logo-1.png' } });
  });
  return puts;
}

const settingsRow = (page: Page, title: string) =>
  page.locator('.cfg-row', { hasText: title });

test('a config that fails to load keeps Save and Upload off', async ({
  page,
}) => {
  let ok = false;
  await fixtures(page, {
    config: (r) =>
      ok
        ? r.fulfill({ json: { seerrPublicUrl: 'https://seerr.example' } })
        : r.fulfill({ status: 500, body: 'upstream down' }),
  });
  const puts = await writableStorage(page);
  await page.goto('/me/lumen');
  await expect(page.getByRole('alert')).toContainText(
    'Couldn’t load the current settings'
  );
  const save = page.getByRole('button', { name: 'Save for everyone' });
  await expect(save).toBeDisabled();
  const uploads = page.getByRole('button', { name: 'Upload', exact: true });
  await expect(uploads).toHaveCount(2);
  for (const upload of await uploads.all()) await expect(upload).toBeDisabled();
  await expect(page.getByLabel('Upload logo')).toHaveCount(0);
  await settingsRow(page, 'Show books and audiobooks')
    .locator('select')
    .selectOption('off');
  await expect(save).toBeDisabled();
  await save.click({ force: true });
  await page.waitForTimeout(300);
  expect(puts).toEqual([]);

  // it loads on a retry: the change made meanwhile is kept, on top of the real file
  ok = true;
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(save).toBeEnabled();
  await save.click();
  await expect(page.getByText(/^Saved\./)).toBeVisible();
  expect(puts).toHaveLength(1);
  expect(JSON.parse(puts[0])).toEqual({
    seerrPublicUrl: 'https://seerr.example',
    defaults: { showBooks: false },
    locked: [],
  });
});

test('changes made while the config is still loading are saved on top of it', async ({
  page,
}) => {
  let calls = 0;
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await fixtures(page, {
    config: async (r) => {
      // the first read fails (the app starts on defaults), the retry is slow
      if (++calls === 1) return r.fulfill({ status: 503, body: '' });
      await held;
      await r.fulfill({
        json: {
          custom: 1,
          seerrPublicUrl: 'https://seerr.example',
          locked: ['theme'],
        },
      });
    },
  });
  const puts = await writableStorage(page);
  await page.goto('/me/lumen');
  // the settings are read again after sign-in; should that share the failed read, retry
  const retry = page.getByRole('button', { name: 'Try again' });
  const loading = page.getByText('Loading the current settings…');
  await expect(retry.or(loading)).toBeVisible();
  if (await retry.isVisible()) await retry.click();
  await expect(loading).toBeVisible();
  await page.getByPlaceholder('SeerrNG').fill('Movie Night');
  await expect(
    page.getByRole('button', { name: 'Save for everyone' })
  ).toBeDisabled();
  release();
  const save = page.getByRole('button', { name: 'Save for everyone' });
  await expect(save).toBeEnabled();
  await expect(page.getByPlaceholder('SeerrNG')).toHaveValue('Movie Night');
  await save.click();
  await expect(page.getByText(/^Saved\./)).toBeVisible();
  expect(JSON.parse(puts[0])).toEqual({
    custom: 1,
    seerrPublicUrl: 'https://seerr.example',
    locked: ['theme'],
    branding: { name: 'Movie Night' },
  });
});

test('settings controls keep focus while they change', async ({ page }) => {
  await fixtures(page);
  await writableStorage(page);
  await page.goto('/me/lumen');
  await expect(
    page.getByRole('button', { name: 'Save for everyone' })
  ).toBeEnabled();
  const select = settingsRow(page, 'Show books and audiobooks').locator(
    'select'
  );
  await select.focus();
  await select.selectOption('off-locked');
  await expect(select).toHaveValue('off-locked');
  await expect(select).toBeFocused();
  await select.selectOption('on');
  await expect(select).toBeFocused();
  const lock = page.getByRole('checkbox', { name: 'Let people change it' });
  await lock.focus();
  await lock.press('Space');
  await expect(lock).not.toBeChecked();
  await expect(lock).toBeFocused();
});

test('a 4K-only request leaves the HD request open on posters', async ({
  page,
}) => {
  await fixtures(page, {
    permissions: 32,
    api: (path) =>
      path === '/discover/movies'
        ? paged([
            {
              id: 501,
              title: 'Pending In 4K',
              mediaType: 'movie',
              releaseDate: '2020-01-01',
              posterPath: '/p501.png',
              mediaInfo: { id: 5, status: 1, status4k: 2 },
            },
          ])
        : undefined,
  });
  await page.goto('/movies');
  const poster = page.locator('.poster', { hasText: 'Pending In 4K' });
  // the corner glyph still says something is on its way
  await expect(poster.locator('.glyph')).toHaveAttribute('title', 'Requested');
  await poster.hover();
  const hd = poster
    .getByRole('button', { name: /^Request/ })
    .filter({ visible: true })
    .first();
  await expect(hd).toBeEnabled();
  await expect(
    poster.getByRole('button', { name: 'Requested', exact: true })
  ).toHaveCount(0);
});

test('Back to a long list after a request re-reads only a few pages', async ({
  page,
}) => {
  test.slow();
  let requested = false;
  const asked: number[] = [];
  const { posts } = await fixtures(page, {
    permissions: 32,
    api: (path, url) => {
      if (path !== '/discover/movies') return undefined;
      const n = Number(url.searchParams.get('page') || 1);
      asked.push(n);
      return {
        page: n,
        totalPages: 30,
        totalResults: 600,
        results: Array.from({ length: 20 }, (_, i) => ({
          id: n * 100 + i,
          title: `Popular ${n}-${i}`,
          mediaType: 'movie',
          releaseDate: '2020-01-01',
          mediaInfo:
            requested && i === 0 ? { id: n, status: 2 } : { id: n, status: 1 },
        })),
      };
    },
  });
  await page.goto('/movies');
  await expect(page.getByRole('link', { name: 'Popular 1-0' })).toBeVisible();
  // scroll until at least six pages are in (a tall screen may pull in more at once)
  await expect
    .poll(
      async () => {
        await page.locator('.poster').last().scrollIntoViewIfNeeded();
        await page.mouse.wheel(0, 4000);
        return Math.max(...asked);
      },
      { timeout: 30_000 }
    )
    .toBeGreaterThanOrEqual(6);
  await page.waitForTimeout(500);
  // a request marks everything stale
  const poster = page.locator('.poster', { hasText: 'Popular 3-0' }).first();
  await poster.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  requested = true;
  // the overlay button, whatever the screen (the list may still be settling under a hover)
  await poster.locator('.qbtn.go').dispatchEvent('click');
  await expect.poll(() => posts.includes('/request')).toBe(true);
  await page.waitForTimeout(300);
  const last = Math.max(...asked);
  await page.getByRole('link', { name: 'Popular 3-1', exact: true }).click();
  await expect(page).toHaveURL(/\/movie\/301$/);
  asked.length = 0;
  await page.goBack();
  await expect(page).toHaveURL(/\/movies$/);
  // the top of the list shows the new status
  await expect(
    page
      .locator('.poster', { hasText: 'Popular 1-0' })
      .first()
      .locator('.glyph')
  ).toHaveAttribute('title', 'Requested');
  await page.waitForTimeout(500);
  // the first two pages and at most the last two are read again, not every page shown
  // (endless scrolling may go on to a new page, which is not a re-read)
  const reread = asked.filter((n) => n <= last);
  expect(reread).toContain(1);
  expect(reread).toContain(2);
  expect(reread.filter((n) => n > 2 && n < last - 1)).toEqual([]);
  expect(reread.length).toBeLessThanOrEqual(4);
  // the rows in between are still there
  await expect(
    page.getByRole('link', { name: 'Popular 3-3', exact: true })
  ).toBeAttached();
});

test('cover addresses: known hosts go through the proxy, unsafe ones are dropped', async ({
  page,
}) => {
  const book = (n: number, posterPath: string) => ({
    id: `OL${n}W`,
    mediaType: 'book',
    provider: 'openlibrary',
    bookFormat: 'ebook',
    title: `Cover ${n}`,
    author: 'Writer',
    posterPath,
  });
  const hc = (n: number) =>
    `bookshelf:1:${Buffer.from(`hc:${n}`).toString('base64url')}`;
  const hcBook = (n: number) => ({
    ...book(n, ''),
    id: hc(n),
    provider: 'bookshelf',
  });
  await fixtures(page, {
    api: (path) => {
      if (path === '/settings/public')
        return {
          mediaServerType: 1,
          booksEnabled: true,
          ebookServiceEnabled: true,
          audiobookServiceEnabled: true,
          enabledMediaCategories: { ebook: true, audiobook: true },
        };
      if (path === '/book/library') return paged([]);
      if (path === '/discover/books')
        return paged([
          book(1, 'https://covers.openlibrary.org/b/id/1-L.jpg?x=1#top'),
          book(2, 'https://covers.openlibrary.org.evil.example/b/id/2-L.jpg'),
          book(3, 'https://covers.openlibrary.org/b/%2e%2e/admin.jpg'),
          book(4, 'https://covers.openlibrary.org/b/..%2Fadmin.jpg'),
          book(5, 'https://user:pw@m.media-amazon.com/images/I/5.jpg'),
          book(6, 'https://m.media-amazon.com/images/I/6.jpg'),
          book(7, 'javascript:alert(1)'),
          book(8, 'https://covers.openlibrary.org\\b\\8.jpg'),
          hcBook(11),
          hcBook(12),
          hcBook(13),
        ]);
      return undefined;
    },
  });
  await page.route('**/seerr-classic/hccovers*', (r) =>
    r.fulfill({
      json: {
        data: {
          books: [
            {
              id: 11,
              image: { url: 'https://assets.hardcover.app/books/11/c.jpg?w=1' },
            },
            {
              id: 12,
              image: {
                url: 'https://assets.hardcover.app.evil.example/12.jpg',
              },
            },
            {
              id: 13,
              image: { url: 'https://assets.hardcover.app/a/%2E%2E/13.jpg' },
            },
          ],
        },
      },
    })
  );
  await page.route('**/seerr-classic/hcimg/**', (r) => r.fulfill(svg));
  for (const host of [
    'm.media-amazon.com',
    'covers.openlibrary.org.evil.example',
  ])
    await page.route(`https://${host}/**`, (r) => r.fulfill(svg));
  await page.goto('/books?sort=ranked');
  const src = (n: number) =>
    page
      .locator('.poster', {
        has: page.getByRole('link', { name: `Cover ${n}`, exact: true }),
      })
      .locator('.art');
  await expect(src(1).locator('img')).toHaveAttribute(
    'src',
    '/imageproxy/openlibrarycovers/b/id/1-M.jpg'
  );
  await expect(src(2).locator('img')).toHaveAttribute(
    'src',
    'https://covers.openlibrary.org.evil.example/b/id/2-L.jpg'
  );
  await expect(src(6).locator('img')).toHaveAttribute(
    'src',
    'https://m.media-amazon.com/images/I/6.jpg'
  );
  for (const n of [3, 4, 5, 7, 8]) {
    await expect(src(n).locator('.nocover')).toHaveCount(1);
    await expect(src(n).locator('img')).toHaveCount(0);
  }
  await expect(src(11).locator('img')).toHaveAttribute(
    'src',
    '/seerr-classic/hcimg/books/11/c.jpg'
  );
  for (const n of [12, 13]) await expect(src(n).locator('img')).toHaveCount(0);
});

test('a blocked Plex window fails at once instead of waiting on plex.tv', async ({
  page,
}) => {
  const plexCalls: string[] = [];
  await page.addInitScript(() => {
    window.open = () => null;
  });
  await fixtures(page, {
    api: (path, _url, route) =>
      path === '/auth/me'
        ? (void route.fulfill({ status: 401, json: {} }), true)
        : undefined,
  });
  await page.route('https://plex.tv/**', (r) => {
    plexCalls.push(r.request().url());
    return r.fulfill({ json: { id: 1, code: 'x' } });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Continue with Plex' }).click();
  await expect(page.getByRole('alert')).toContainText(
    'blocked the Plex sign-in window'
  );
  await expect(
    page.getByRole('button', { name: 'Continue with Plex' })
  ).toBeEnabled();
  expect(plexCalls).toEqual([]);
});

test('Plex sign-in rides out a couple of failed checks', async ({
  page,
  context,
}) => {
  let checks = 0;
  let signIns = 0;
  await context.route('https://app.plex.tv/**', (r) =>
    r.fulfill({ body: 'Fixture Plex sign-in' })
  );
  await fixtures(page, {
    api: (path, _url, route) => {
      if (path === '/auth/plex') {
        signIns++;
        return {};
      }
      if (path === '/auth/me' && !signIns)
        return (void route.fulfill({ status: 401, json: {} }), true);
      return undefined;
    },
  });
  await page.route('https://plex.tv/api/v2/pins?strong=true', (r) =>
    r.fulfill({ json: { id: 7, code: 'fixture' } })
  );
  await page.route('https://plex.tv/api/v2/pins/7', (r) =>
    ++checks <= 2
      ? r.fulfill({ status: 502, body: 'bad gateway' })
      : r.fulfill({ json: { authToken: 'token' } })
  );
  await page.goto('/');
  const popup = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Continue with Plex' }).click();
  await popup;
  await expect.poll(() => signIns, { timeout: 15_000 }).toBe(1);
  expect(checks).toBe(3);
  await expect(page.getByRole('alert')).toHaveCount(0);
});
