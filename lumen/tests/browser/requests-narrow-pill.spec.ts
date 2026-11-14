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

test('a long status pill stays inside its Requests row on narrow screens', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop', 'sets its own viewport');
  await fixture(page);
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/requests?tab=all');
  const row = page.locator('.rq').filter({ hasText: 'Pinned book' });
  await expect(row.locator('.st .pill')).toBeVisible();
  for (const width of [360, 375, 390, 430, 768]) {
    await page.setViewportSize({ width, height: 800 });
    const spill = await row.locator('.st').evaluate((st) => {
      const outer = st.getBoundingClientRect();
      return Array.from(st.children).map(
        (c) => c.getBoundingClientRect().right - outer.right
      );
    });
    for (const s of spill)
      expect(s, `status pill past the row at ${width}px`).toBeLessThanOrEqual(
        1
      );
  }
});
