import { expect, test } from '@playwright/test';

const bookId = 'bookshelf:42:aGM6MTIzNDU';

test('request managers see the pending count and can approve a book in place', async ({
  page,
}, testInfo) => {
  let approved = false;
  await page.route('**/lumen-config.json', (route) => route.fulfill({ json: {} }));
  await page.route('**/seerr-classic/**', (route) => route.fulfill({ status: 404 }));
  await page.route('**/api/v1/**', (route) => {
    const { pathname } = new URL(route.request().url());
    const path = pathname.slice('/api/v1'.length);
    if (path === '/settings/public')
      return route.fulfill({
        json: {
          localLogin: true,
          mediaServerType: 1,
          booksEnabled: true,
          ebookServiceEnabled: true,
          audiobookServiceEnabled: true,
          enabledMediaCategories: { ebook: true, audiobook: true },
        },
      });
    if (path === '/auth/me')
      return route.fulfill({
        json: { id: 1, displayName: 'Manager', permissions: 16 },
      });
    if (path === '/request/count')
      return route.fulfill({ json: { pending: approved ? 0 : 1 } });
    if (path === '/request/17/approve' && route.request().method() === 'POST') {
      approved = true;
      return route.fulfill({ json: { id: 17, status: 2 } });
    }
    if (path.startsWith('/book/'))
      return route.fulfill({
        json: {
          id: bookId,
          mediaType: 'book',
          title: 'Winteraustern',
          author: 'Ada Writer',
          mediaInfo: {
            status: approved ? 3 : 2,
            requests: [{ id: 17, status: approved ? 2 : 1, bookFormat: 'ebook' }],
          },
        },
      });
    return route.fulfill({ json: { page: 1, totalPages: 1, results: [] } });
  });

  await page.goto('/requests');
  await expect(page.locator('[aria-label="1 pending requests"]:visible')).toHaveCount(1);
  if (process.env.UI_EVIDENCE_DIR)
    await page.screenshot({
      path: `${process.env.UI_EVIDENCE_DIR}/${testInfo.project.name}-requests.png`,
      fullPage: true,
    });
  await page.goto(`/book/${encodeURIComponent(bookId)}`);
  await expect(page.getByRole('button', { name: 'Approve request' })).toBeVisible();
  if (process.env.UI_EVIDENCE_DIR)
    await page.screenshot({
      path: `${process.env.UI_EVIDENCE_DIR}/${testInfo.project.name}-book.png`,
      fullPage: true,
    });
  await page.getByRole('button', { name: 'Approve request' }).click();
  await expect.poll(() => approved).toBe(true);
  await expect(page.getByRole('button', { name: 'Approve request' })).toHaveCount(0);
});
