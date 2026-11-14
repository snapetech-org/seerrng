import { expect, test, type Page } from '@playwright/test';

// base64url of the bare Hardcover work id "260468" and of "hc:260468"
const bareId = 'bookshelf:1:MjYwNDY4';
const hcId = 'bookshelf:1:aGM6MjYwNDY4';
const blurb = 'In a ruined and toxic world, people live in a silo.';

const book = (id: string, description?: string) => ({
  id,
  mediaType: 'book',
  bookFormat: 'ebook',
  title: 'Wool',
  author: 'Hugh Howey',
  posterPath: null,
  ...(description ? { description } : {}),
});

async function mocks(page: Page, bare: unknown, hc: unknown) {
  const lookups: string[] = [];
  await page.route('https://**/*', (r) => r.abort());
  await page.route('**/lumen-config.json', (r) => r.fulfill({ json: {} }));
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname.slice(7);
    if (path === '/auth/me')
      return route.fulfill({
        json: { id: 1, displayName: 'viewer', permissions: 2 },
      });
    if (path === '/settings/public')
      return route.fulfill({
        json: {
          mediaServerType: 2,
          booksEnabled: true,
          ebookServiceEnabled: true,
          audiobookServiceEnabled: true,
          enabledMediaCategories: { ebook: true, audiobook: true },
        },
      });
    if (path.startsWith('/book/bookshelf')) {
      lookups.push(decodeURIComponent(path.slice(6)));
      const body = path.endsWith(encodeURIComponent(hcId)) ? hc : bare;
      return body
        ? route.fulfill({ json: body })
        : route.fulfill({ status: 404, json: { message: 'nope' } });
    }
    return route.fulfill({ json: {} });
  });
  return lookups;
}

test('a book stored under a bare Hardcover id gets its description from the hc: form', async ({
  page,
}) => {
  const lookups = await mocks(page, book(bareId), book(hcId, blurb));
  await page.goto(`/book/${encodeURIComponent(bareId)}`);
  await expect(page.locator('h1')).toContainText('Wool');
  await expect(page.getByText(blurb)).toBeVisible();
  // exactly one extra lookup, and the page keeps addressing the original id
  expect(lookups.sort()).toEqual([bareId, hcId].sort());
  await expect(page).toHaveURL(new RegExp(encodeURIComponent(bareId)));
});

test('a book that already has a description makes no second lookup', async ({
  page,
}) => {
  const lookups = await mocks(
    page,
    book(bareId, 'Own blurb.'),
    book(hcId, blurb)
  );
  await page.goto(`/book/${encodeURIComponent(bareId)}`);
  await expect(page.getByText('Own blurb.')).toBeVisible();
  await expect(page.getByText(blurb)).toHaveCount(0);
  expect(lookups).toEqual([bareId]);
});

test('an hc: id or a failing second lookup does not retry or break the page', async ({
  page,
}) => {
  const lookups = await mocks(page, book(bareId), null);
  await page.goto(`/book/${encodeURIComponent(bareId)}`);
  await expect(page.locator('h1')).toContainText('Wool');
  await expect(page.locator('p.ov.long')).toHaveCount(0);
  expect(lookups.filter((l) => l === hcId)).toHaveLength(1);

  const again = await mocks(page, book(hcId), book(hcId));
  await page.goto(`/book/${encodeURIComponent(hcId)}`);
  await expect(page.locator('h1')).toContainText('Wool');
  expect(again).toEqual([hcId]);
});
