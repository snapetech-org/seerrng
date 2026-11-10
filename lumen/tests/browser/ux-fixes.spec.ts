import { expect, test, type Page } from '@playwright/test';

// Phone-pass and audit fixes: whole book covers, author and description, empty narrator list,
// drawn covers on requests, dialog focus handling, confirmations and plain error messages.
const paged = (results: unknown[]) => ({
  page: 1,
  totalPages: 1,
  totalResults: results.length,
  results,
});
const audioId = 'bookshelf:42:aGM6MTIzNDU';

async function fixtures(
  page: Page,
  handle: (path: string, method: string) => Promise<unknown> | unknown = () =>
    undefined,
  permissions = 2
) {
  await page.route('https://**/*', (r) => r.abort());
  await page.route('**/lumen-config.json', (r) => r.fulfill({ json: {} }));
  await page.route('**/seerr-classic/**', (r) => r.fulfill({ status: 404 }));
  await page.route('**/api/v1/**', async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname.slice(7);
    const custom = await handle(path, req.method());
    if (custom !== undefined)
      return route.fulfill(custom as Parameters<typeof route.fulfill>[0]);
    if (path === '/settings/public')
      return route.fulfill({
        json: {
          mediaServerType: 1,
          localLogin: true,
          booksEnabled: true,
          ebookServiceEnabled: true,
          audiobookServiceEnabled: true,
          enabledMediaCategories: { ebook: true, audiobook: true },
        },
      });
    if (path === '/auth/me')
      return route.fulfill({
        json: { id: 1, displayName: 'fam', permissions },
      });
    if (path === '/editions/book')
      return route.fulfill({ json: { editions: [] } });
    if (path.startsWith('/service/') || path.startsWith('/genres/'))
      return route.fulfill({ json: [] });
    return route.fulfill({ json: paged([]) });
  });
}

const bookJson = (extra: object = {}) => ({
  id: audioId,
  mediaType: 'book',
  bookFormat: 'audiobook',
  title: 'Whole Cover Book',
  author: 'Ada Writer',
  description: 'A story about covers.\n\nSecond paragraph.',
  posterPath: '/cover.jpg',
  subjects: ['Fantasy'],
  ...extra,
});

const ownRequest = {
  pageInfo: { pages: 1, results: 1 },
  results: [
    {
      id: 5,
      type: 'movie',
      status: 1,
      is4k: false,
      createdAt: '2026-10-28T12:00:00Z',
      seasons: [],
      requestedBy: { id: 1, displayName: 'fam' },
      media: { mediaType: 'movie', tmdbId: 77, status: 3 },
    },
  ],
};

test('book detail shows author, description and the whole cover', async ({
  page,
}) => {
  await fixtures(page, (path) =>
    path.startsWith('/book/') ? { json: bookJson() } : undefined
  );
  await page.goto(`/book/${encodeURIComponent(audioId)}?f=audio`);
  await expect(
    page.getByRole('heading', { name: 'Whole Cover Book' })
  ).toBeVisible();
  await expect(page.locator('.dtitle .by')).toHaveText('Ada Writer');
  await expect(page.getByText('A story about covers.')).toBeVisible();
  await expect(page.locator('.dposter img')).toHaveCSS('object-fit', 'contain');
});

test('an audiobook with no recordings does not offer a choice of narrator', async ({
  page,
}) => {
  await fixtures(page, (path) =>
    path.startsWith('/book/') ? { json: bookJson() } : undefined
  );
  await page.goto(`/book/${encodeURIComponent(audioId)}?f=audio`);
  await expect(page.getByRole('heading', { name: 'Narrator' })).toBeVisible();
  await expect(page.getByText('Choose a narrator')).toHaveCount(0);
  await expect(page.getByText('0 English recordings')).toHaveCount(0);
  await expect(page.getByText(/No English recordings/)).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Request audiobook' }).first()
  ).toBeVisible();
});

test('info panels fill the last row instead of leaving an empty cell', async ({
  page,
}) => {
  await fixtures(page, (path) =>
    path.startsWith('/book/')
      ? {
          json: bookJson({
            firstPublishYear: 2001,
            subjects: ['Fantasy'],
            series: [],
          }),
        }
      : undefined
  );
  await page.goto(`/book/${encodeURIComponent(audioId)}?f=audio`);
  const cells = page.locator('.facts2 > div');
  await expect(cells).toHaveCount(2);
  const [a, b] = await Promise.all([
    cells.nth(0).boundingBox(),
    cells.nth(1).boundingBox(),
  ]);
  // two facts share one row and stretch across it, nothing is left over
  expect(Math.abs(a!.y - b!.y)).toBeLessThan(2);
  const box = await page.locator('.facts2').boundingBox();
  expect(a!.width + b!.width).toBeGreaterThan(box!.width - 4);

  // an odd count: the last cell takes the whole row
  await page.route('**/api/v1/book/**', (r) =>
    r.fulfill({
      json: bookJson({
        firstPublishYear: 2001,
        subjects: ['Fantasy'],
        series: [{ title: 'Saga', position: '1' }],
      }),
    })
  );
  await page.goto(`/book/${encodeURIComponent(audioId)}?f=audio&x=1`);
  await expect(cells).toHaveCount(3);
  const last = await cells.nth(2).boundingBox();
  const all = await page.locator('.facts2').boundingBox();
  expect(last!.width).toBeGreaterThan(all!.width - 4);
});

test('a request without artwork gets a drawn cover', async ({ page }) => {
  await fixtures(page, (path) => {
    if (path === '/request') return { json: ownRequest };
    if (path === '/movie/77')
      return { json: { id: 77, title: 'No Poster Movie' } };
  });
  await page.goto('/requests?tab=all');
  await expect(page.locator('.rq .art .nocover')).toHaveCount(1);
});

test('Escape closes the change-request sheet, focus returns and the page does not scroll behind it', async ({
  page,
}) => {
  await fixtures(page, (path) => {
    if (path === '/request') return { json: ownRequest };
    if (path === '/movie/77')
      return { json: { id: 77, title: 'Waiting Film' } };
  });
  await page.goto('/requests?tab=everyone');
  const open = page.getByRole('button', { name: 'Change', exact: true });
  await open.focus();
  await page.keyboard.press('Enter');
  const sheet = page.getByRole('dialog');
  await expect(sheet).toBeVisible();
  await expect(page.locator('body')).toHaveCSS('overflow', 'hidden');
  expect(
    await page.locator('#root').evaluate((e) => (e as HTMLElement).inert)
  ).toBe(true);
  // Tab never leaves the dialog
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('Tab');
    expect(
      await page.evaluate(() => !!document.activeElement?.closest('.sheet'))
    ).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
  await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden');
  expect(
    await page.locator('#root').evaluate((e) => (e as HTMLElement).inert)
  ).toBe(false);
  await expect(open).toBeFocused();
});

test('cancelling your own request asks first', async ({ page }) => {
  let cancelled = false;
  await fixtures(page, (path, method) => {
    if (path === '/request' && method === 'GET') return { json: ownRequest };
    if (path === '/request/5' && method === 'DELETE') {
      cancelled = true;
      return { json: {} };
    }
    if (path === '/movie/77')
      return { json: { id: 77, title: 'Waiting Film' } };
  });
  await page.goto('/requests?tab=all');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  const ask = page.getByRole('alertdialog', { name: 'Cancel this request?' });
  await expect(ask).toBeVisible();
  expect(cancelled).toBe(false);
  await ask.getByRole('button', { name: 'Keep it' }).click();
  await expect(ask).toHaveCount(0);
  expect(cancelled).toBe(false);
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await ask.getByRole('button', { name: 'Cancel request' }).click();
  await expect.poll(() => cancelled).toBe(true);
});

test('Reset to defaults asks first', async ({ page }) => {
  await fixtures(page);
  await page.goto('/me');
  await page.getByRole('button', { name: 'Reset to defaults' }).click();
  const ask = page.getByRole('alertdialog', { name: 'Reset to defaults?' });
  await expect(ask).toBeVisible();
  await ask.getByRole('button', { name: 'Keep it' }).click();
  await expect(ask).toHaveCount(0);
});

test('a server error shows a plain message', async ({ page }) => {
  await fixtures(
    page,
    (path, method) => {
      if (path === '/movie/50')
        return { json: { id: 50, title: 'Failing Movie', genres: [] } };
      if (path === '/request' && method === 'POST')
        return { status: 500, json: { message: 'Internal Server Error' } };
    },
    32
  );
  await page.goto('/movie/50');
  await page.getByRole('button', { name: 'Request', exact: true }).click();
  await expect(
    page.getByRole('status').getByText(/server had a problem/)
  ).toBeVisible();
});

test.describe('touch screens', () => {
  test.use({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 390, height: 844 },
  });
  test('chips and small buttons have a 44px hit area', async ({ page }) => {
    await fixtures(page);
    await page.goto('/search');
    const chip = page.locator('.chip').first();
    await expect(chip).toBeVisible();
    expect((await chip.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  });
});
