import { expect, test, type Page } from '@playwright/test';

async function fixture(
  page: Page,
  status: Record<string, unknown> | undefined,
  legacy = false,
  unavailable = false
) {
  const calls: string[] = [];
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
          audiobookServiceEnabled: true,
          enabledMediaCategories: { ebook: true, audiobook: true },
        },
      });
    if (path.startsWith('/book/'))
      return r.fulfill({
        json: { id: 'OL614W', title: 'Requested audio', author: 'Reader' },
      });
    if (path === '/request') {
      calls.push(url.search);
      if (unavailable)
        return r.fulfill({ status: 503, json: { message: 'Unavailable' } });
      if (legacy && url.searchParams.has('includeStatus'))
        return r.fulfill({
          status: 400,
          json: { message: 'Unknown parameter' },
        });
      return r.fulfill({
        json: {
          pageInfo: { pages: 1, results: 1 },
          results:
            url.searchParams.get('filter') === 'processing'
              ? []
              : [
                  {
                    id: 614,
                    type: 'book',
                    status: 2,
                    bookFormat: 'audiobook',
                    is4k: false,
                    createdAt: '2026-11-08T12:00:00Z',
                    requestedBy: { id: 1, displayName: 'reader' },
                    media: {
                      mediaType: 'book',
                      status: 5,
                      availableEbookServiceIds: [0],
                      availableAudiobookServiceIds: [],
                      identifiers: [
                        { provider: 'openlibrary', value: 'OL614W' },
                      ],
                    },
                    ...(status ? { currentStatus: status } : {}),
                  },
                ],
        },
      });
    }
    return r.fulfill({ json: {} });
  });
  return calls;
}

for (const [stage, percent, word] of [
  ['searching', null, 'Searching'],
  ['library', null, 'Checking library'],
  ['downloading', 0, 'Queued'],
  ['downloading', null, 'Downloading'],
  ['downloading', -1, 'Downloading'],
  ['future-stage', null, 'Status unavailable'],
] as const) {
  test(`${stage} ${percent} uses current request truth`, async ({ page }) => {
    const calls = await fixture(page, { stage, percent });
    await page.goto('/requests');
    const row = page.locator('.rq').filter({ hasText: 'Requested audio' });
    await expect(row).toBeVisible();
    await expect(row.locator('.st')).toContainText(word);
    await expect(row.getByText('In library', { exact: true })).toHaveCount(0);
    expect(calls.some((q) => q.includes('includeStatus=true'))).toBeTruthy();
  });
}

test('older backend falls back without treating an ebook as audio', async ({
  page,
}) => {
  const calls = await fixture(page, undefined, true);
  await page.goto('/requests');
  const row = page.locator('.rq').filter({ hasText: 'Requested audio' });
  await expect(row).toBeVisible();
  await expect(row.getByText('In library', { exact: true })).toHaveCount(0);
  expect(calls.some((q) => q.includes('includeStatus=true'))).toBeTruthy();
  expect(calls.some((q) => !q.includes('includeStatus='))).toBeTruthy();
});

test('an outage does not downgrade to coarse legacy status', async ({
  page,
}) => {
  const calls = await fixture(page, undefined, false, true);
  await page.goto('/requests');
  await expect(page.getByRole('alert')).toContainText('Couldn’t load requests');
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect.poll(() => calls.length).toBeGreaterThan(2);
  expect(calls.every((q) => q.includes('includeStatus=true'))).toBeTruthy();
  await expect(page.getByText('In library', { exact: true })).toHaveCount(0);
});
