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
  await page.route('**/api/v1/**', (r) => {
    const url = new URL(r.request().url());
    const path = url.pathname.slice(7);
    if (path === '/request/status')
      return r.fulfill({
        status: 404,
        json: { message: 'Legacy fixture endpoint' },
      });
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
    await page.goto('/requests?tab=active');
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
  await page.goto('/requests?tab=active');
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
  await page.goto('/requests?tab=active');
  await expect(page.getByRole('alert')).toContainText('Couldn’t load requests');
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect.poll(() => calls.length).toBeGreaterThan(2);
  expect(calls.every((q) => q.includes('includeStatus=true'))).toBeTruthy();
  await expect(page.getByText('In library', { exact: true })).toHaveCount(0);
});

const lifecycleRequest = (id = 700) => ({
  id,
  type: 'book',
  status: 5,
  bookFormat: 'audiobook',
  is4k: false,
  createdAt: '2026-11-08T11:00:00Z',
  seasons: [],
  requestedBy: { id: 1, displayName: 'reader' },
  media: {
    mediaType: 'book',
    tmdbId: 0,
    status: 5,
    availableAudiobookServiceIds: [0],
    identifiers: [{ provider: 'openlibrary', value: `OL${id}W` }],
  },
});
const lifecyclePage = (results: unknown[]) => ({
  pageInfo: { pages: 1, results: results.length },
  results,
});
const availableFilter = (page: Page) =>
  page
    .getByRole('group', { name: 'Which requests' })
    .getByRole('button', { name: /Available/ });

test('Available uses lifecycle membership and its count instead of coarse flags', async ({
  page,
}) => {
  const calls = await fixture(page, { stage: 'approved', percent: null });
  await page.route('**/api/v1/request/count', (r) =>
    r.fulfill({ json: { total: 2, available: 999 } })
  );
  let lifecycleCalls = 0;
  await page.route('**/api/v1/request/status?**', (r) => {
    lifecycleCalls++;
    return r.fulfill({
      json: lifecyclePage([
        {
          request: lifecycleRequest(),
          status: { stage: 'available', percent: null },
        },
      ]),
    });
  });
  await page.goto('/requests?tab=everyone&show=available');
  const row = page.locator('.rq');
  await expect(row).toHaveCount(1);
  await expect(row.getByText('In library', { exact: true })).toBeVisible();
  await expect(availableFilter(page)).toHaveText('Available1');
  expect(lifecycleCalls).toBe(1);
  expect(
    calls.some((q) => new URLSearchParams(q).get('filter') === 'available')
  ).toBe(false);
});

test('a completed coarse flag cannot place missing audio in Available', async ({
  page,
}) => {
  const calls = await fixture(page, { stage: 'approved', percent: null });
  await page.route('**/api/v1/request/status?**', (r) =>
    r.fulfill({ json: lifecyclePage([]) })
  );
  await page.goto('/requests?tab=everyone&show=available');
  await expect(page.getByText('Nothing here', { exact: true })).toBeVisible();
  await expect(page.locator('.rq')).toHaveCount(0);
  await expect(availableFilter(page)).toHaveText('Available0');
  expect(
    calls.some((q) => new URLSearchParams(q).get('filter') === 'available')
  ).toBe(false);
});

for (const everyone of [false, true])
  test(`an audio download remains visible despite ebook aggregate availability (${everyone ? 'everyone' : 'own older request'})`, async ({
    page,
  }) => {
    await fixture(page, { stage: 'approved', percent: null });
    await page.route('**/api/v1/request/count', (r) =>
      r.fulfill({ json: { processing: 999 } })
    );
    const row = {
      ...lifecycleRequest(),
      status: 2,
      media: {
        ...lifecycleRequest().media,
        availableAudiobookServiceIds: [],
        availableEbookServiceIds: [0],
        audiobookDownloadStatus: [{ size: 100, sizeLeft: 58 }],
      },
    };
    await page.route('**/api/v1/request/status?**', (r) =>
      r.fulfill({
        json: lifecyclePage([
          { request: row, status: { stage: 'downloading', percent: 42 } },
        ]),
      })
    );
    await page.goto(
      everyone ? '/requests?tab=everyone&show=processing' : '/requests'
    );
    const download = page
      .locator('.rq')
      .filter({ has: page.locator('a[href="/book/OL700W?f=audio"]') });
    await expect(download).toBeVisible();
    await expect(download.locator('.st')).toContainText('Downloading 42%');
    await expect(download.getByText('In library', { exact: true })).toHaveCount(
      0
    );
    if (everyone)
      await expect(
        page
          .getByRole('group', { name: 'Which requests' })
          .getByRole('button', { name: /Downloading/ })
      ).toHaveText('Downloading1');
  });

test('legacy Available fallback rejects missing-format rows and withholds its coarse count', async ({
  page,
}) => {
  const calls = await fixture(page, undefined);
  await page.route('**/api/v1/request/count', (r) =>
    r.fulfill({ json: { available: 999 } })
  );
  await page.goto('/requests?tab=everyone&show=available');
  await expect(page.getByText('Nothing here', { exact: true })).toBeVisible();
  await expect(page.locator('.rq')).toHaveCount(0);
  await expect(availableFilter(page)).toHaveText('Available');
  expect(
    calls.some((q) => new URLSearchParams(q).get('filter') === 'available')
  ).toBe(true);
});

for (const status of [401, 403, 503])
  test(`lifecycle filter ${status} cannot downgrade to coarse availability`, async ({
    page,
  }) => {
    const calls = await fixture(page, { stage: 'approved', percent: null });
    let lifecycleCalls = 0;
    await page.route('**/api/v1/request/status?**', (r) => {
      lifecycleCalls++;
      return r.fulfill({ status, json: { message: 'Unavailable' } });
    });
    await page.goto('/requests?tab=everyone&show=available');
    await expect(page.getByRole('alert')).toContainText(
      'Couldn’t load requests'
    );
    await page.getByRole('button', { name: 'Retry', exact: true }).click();
    await expect.poll(() => lifecycleCalls).toBeGreaterThan(1);
    expect(
      calls.some((q) => new URLSearchParams(q).get('filter') === 'available')
    ).toBe(false);
    await expect(page.locator('.rq')).toHaveCount(0);
  });

test('malformed successful lifecycle data does not become legacy availability', async ({
  page,
}) => {
  const calls = await fixture(page, { stage: 'approved', percent: null });
  await page.route('**/api/v1/request/status?**', (r) =>
    r.fulfill({
      json: lifecyclePage([
        {
          request: lifecycleRequest(),
          status: { stage: 'approved', percent: null },
        },
      ]),
    })
  );
  await page.goto('/requests?tab=everyone&show=available');
  await expect(page.getByRole('alert')).toContainText('Couldn’t load requests');
  expect(
    calls.some((q) => new URLSearchParams(q).get('filter') === 'available')
  ).toBe(false);
  await expect(page.locator('.rq')).toHaveCount(0);
});

test('a double click on Cancel cancels the request once', async ({ page }) => {
  await fixture(page, undefined);
  let cancelled = false;
  let deletes = 0;
  await page.route('**/api/v1/request?**', (route) =>
    route.fulfill({
      json: {
        pageInfo: { pages: 1, results: cancelled ? 0 : 1 },
        results:
          cancelled || route.request().url().includes('filter=processing')
            ? []
            : [
                {
                  id: 614,
                  type: 'book',
                  status: 1,
                  bookFormat: 'ebook',
                  is4k: false,
                  createdAt: '2026-11-08T12:00:00Z',
                  requestedBy: { id: 1, displayName: 'reader' },
                  media: {
                    mediaType: 'book',
                    status: 2,
                    identifiers: [{ provider: 'openlibrary', value: 'OL614W' }],
                  },
                },
              ],
      },
    })
  );
  await page.route('**/api/v1/request/614', async (route) => {
    if (route.request().method() !== 'DELETE') return route.fallback();
    deletes += 1;
    if (cancelled)
      return route.fulfill({ status: 404, json: { message: 'Not found' } });
    cancelled = true;
    await new Promise((resolve) => setTimeout(resolve, 300));
    await route.fulfill({ status: 204 });
  });
  await page.goto('/requests?tab=active');
  const row = page.locator('.rq').filter({ hasText: 'Requested audio' });
  await row.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Cancel request' }).dblclick();
  await expect(page.getByText('Request cancelled')).toBeVisible();
  await expect(row).toHaveCount(0);
  await expect(page.getByText('Not found')).toHaveCount(0);
  expect(deletes).toBe(1);
});
