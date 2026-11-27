import { expect, test, type Page } from '@playwright/test';

async function bookFixture(
  page: Page,
  permissions: number,
  requesterId: number
) {
  const statusReads: string[] = [];
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname
      .replace(/^\/lumen/, '')
      .slice(7);
    if (path === '/auth/me')
      return route.fulfill({ json: { id: 1, permissions, settings: {} } });
    if (path === '/user/1/settings/main')
      return route.fulfill({ json: { locale: 'en' } });
    if (path === '/settings/public')
      return route.fulfill({
        json: {
          ebookServiceEnabled: true,
          audiobookServiceEnabled: true,
          booksEnabled: true,
          enabledMediaCategories: { ebook: true, audiobook: true },
        },
      });
    if (path === '/book/bookshelf%3A42%3AaGM6MTIzNDU')
      return route.fulfill({
        json: {
          id: 'bookshelf:42:aGM6MTIzNDU',
          mediaType: 'book',
          title: 'Current Book',
          provider: 'bookshelf',
          mediaInfo: {
            status: 2,
            requests: [
              {
                id: 321,
                status: 2,
                bookFormat: 'ebook',
                requestedBy: { id: requesterId, displayName: 'reader' },
              },
            ],
          },
        },
      });
    if (path === '/user/1/quota')
      return route.fulfill({ json: { book: { limit: 0, restricted: false } } });
    if (path === '/request/status/321') {
      statusReads.push(path);
      return route.fulfill({
        json: {
          id: 321,
          status: 2,
          requestedBy: { id: requesterId, displayName: 'reader' },
          media: { mediaType: 'book', title: 'Current Book' },
        },
      });
    }
    return route.fulfill({ json: {} });
  });
  return statusReads;
}

test('book details link an authorized viewer to their active format request', async ({
  page,
}) => {
  const statusReads = await bookFixture(page, 32, 1);
  await page.goto('/book/bookshelf%3A42%3AaGM6MTIzNDU');
  const link = page.getByRole('link', { name: 'View Ebook request' });
  await expect(link).toBeVisible();
  await link.click();
  await expect(page).toHaveURL(/\/requests\?requestId=321$/);
  await expect.poll(() => statusReads).toContain('/request/status/321');
});

test('book details do not reveal another requester’s active request to an ordinary viewer', async ({
  page,
}) => {
  const statusReads = await bookFixture(page, 0, 2);
  await page.goto('/book/bookshelf%3A42%3AaGM6MTIzNDU');
  await expect(
    page.getByRole('link', { name: 'View Ebook request' })
  ).toHaveCount(0);
  expect(statusReads).toEqual([]);
});
