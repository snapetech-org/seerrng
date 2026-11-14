import { expect, test, type Page } from '@playwright/test';

// Narrow phones: the four Requests tabs must all be on screen without scrolling the tab bar, and a
// long status pill must stay inside its row.
async function fixture(page: Page) {
  await page.route('https://**/*', (r) => r.abort());
  await page.route('**/lumen-config.json', (r) => r.fulfill({ json: {} }));
  await page.route('**/api/v1/**', (r) => {
    const url = new URL(r.request().url());
    const path = url.pathname.slice(7);
    if (path === '/auth/me')
      return r.fulfill({
        json: { id: 1, displayName: 'reader', permissions: 2 },
      });
    if (path === '/settings/public')
      return r.fulfill({
        json: {
          booksEnabled: true,
          ebookServiceEnabled: true,
          enabledMediaCategories: { ebook: true },
        },
      });
    if (path.startsWith('/book/'))
      return r.fulfill({
        json: { id: 'OL614W', title: 'Pinned book', author: 'Reader' },
      });
    if (path === '/request') {
      const processing = url.searchParams.get('filter') === 'processing';
      return r.fulfill({
        json: {
          pageInfo: { pages: 1, results: processing ? 0 : 1 },
          results: processing
            ? []
            : [
                {
                  id: 614,
                  type: 'book',
                  status: 5,
                  bookFormat: 'ebook',
                  is4k: false,
                  createdAt: '2026-11-08T12:00:00Z',
                  requestedBy: { id: 1, displayName: 'reader' },
                  preferredEditionId: 'hardcover:98765',
                  currentStatus: {
                    stage: 'library',
                    percent: null,
                    message: 'The media is being added to your library.',
                  },
                  media: {
                    mediaType: 'book',
                    status: 5,
                    availableEbookServiceIds: [3],
                    availableAudiobookServiceIds: [],
                    identifiers: [{ provider: 'openlibrary', value: 'OL614W' }],
                  },
                },
              ],
        },
      });
    }
    return r.fulfill({ json: {} });
  });
}

test('all four Requests tabs fit on narrow screens without scrolling the tab bar', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop', 'sets its own viewport');
  await fixture(page);
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/requests?tab=all');
  await expect(page.locator('.seg button')).toHaveCount(4);
  for (const width of [360, 375, 390, 430, 768]) {
    await page.setViewportSize({ width, height: 800 });
    const seg = await page
      .locator('.seg')
      .first()
      .evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }));
    expect(seg.scroll, `tabs cut off at ${width}px`).toBeLessThanOrEqual(
      seg.client
    );
  }
});
