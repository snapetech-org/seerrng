import { expect, test, type Page } from '@playwright/test';

// The server says stage "library" for a finished request pinned to one edition when another
// edition of the book is what the library has. That never settles, so it must not read as
// "Checking library" and must not sit in Active.
async function fixture(page: Page, preferredEditionId: string | null) {
  await page.route('https://**/*', (r) => r.abort());
  await page.route('**/lumen-config.json', (r) => r.fulfill({ json: {} }));
  await page.route('**/seerr-classic/**', (r) => r.fulfill({ status: 404 }));
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
                  ...(preferredEditionId ? { preferredEditionId } : {}),
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

test('a pinned edition that is not the one on disk reads as ready', async ({
  page,
}) => {
  await fixture(page, 'hardcover:98765');
  await page.goto('/requests?tab=ready');
  const row = page.locator('.rq').filter({ hasText: 'Pinned book' });
  await expect(row).toBeVisible();
  await expect(row.locator('.st')).toContainText(
    'Different edition in library'
  );
  await expect(row).toContainText(
    'This book is in your library in another edition than the one requested.'
  );
  await expect(row).not.toContainText('Checking library');
  await expect(
    page.getByRole('button', { name: /^Active\s*0$/ })
  ).toBeVisible();
  await expect(page.getByRole('button', { name: /^Ready\s*1$/ })).toBeVisible();
});

for (const [name, pin] of [
  ['unpinned', null],
  ['Open Library edition pinned', 'OL123M'],
] as const) {
  test(`${name} request still says checking library`, async ({ page }) => {
    await fixture(page, pin);
    await page.goto('/requests');
    const row = page.locator('.rq').filter({ hasText: 'Pinned book' });
    await expect(row.locator('.st')).toContainText('Checking library');
  });
}
