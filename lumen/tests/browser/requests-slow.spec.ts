import { expect, test, type Page } from '@playwright/test';

// One title SeerrNG is slow to look up must not keep the whole Requests list on "Loading…"
async function fixture(page: Page, everyone = false) {
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route('https://**/*', (r) => r.abort());
  await page.route('**/lumen-config.json', (r) => r.fulfill({ json: {} }));
  await page.route('**/seerr-classic/**', (r) => r.fulfill({ status: 404 }));
  const request = (id: number, tmdbId: number) => ({
    id,
    type: 'movie',
    status: 2,
    is4k: false,
    createdAt: `2026-11-0${id % 9}T12:00:00Z`,
    requestedBy: { id: 1, displayName: 'viewer' },
    media: { mediaType: 'movie', tmdbId, status: 3 },
  });
  await page.route('**/api/v1/**', async (r) => {
    const url = new URL(r.request().url());
    const path = url.pathname.slice(7);
    if (path === '/auth/me')
      return r.fulfill({
        json: { id: 1, displayName: 'viewer', permissions: everyone ? 2 : 32 },
      });
    if (path === '/settings/public')
      return r.fulfill({ json: { mediaServerType: 1 } });
    if (path === '/request')
      return r.fulfill({
        json: {
          pageInfo: { pages: 1, results: 2 },
          results:
            url.searchParams.get('filter') === 'pending'
              ? []
              : [request(1, 101), request(2, 202)],
        },
      });
    if (path === '/movie/101')
      return r.fulfill({ json: { id: 101, title: 'Quick Title' } });
    if (path === '/movie/202') {
      await held;
      return r.fulfill({ json: { id: 202, title: 'Slow Title' } });
    }
    return r.fulfill({ json: {} });
  });
  return release;
}

for (const everyone of [false, true]) {
  test(`${everyone ? 'Everyone' : 'My requests'} shows the list while one title is still loading`, async ({
    page,
  }) => {
    const release = await fixture(page, everyone);
    await page.goto(everyone ? '/requests?tab=everyone' : '/requests');
    const rows = page.locator('.rq');
    await expect(rows).toHaveCount(2, { timeout: 3000 });
    await expect(rows.filter({ hasText: 'Quick Title' })).toBeVisible();
    await expect(
      page.getByText(/^Loading (your|everyone’s) requests/)
    ).toHaveCount(0);
    release();
    await expect(rows.filter({ hasText: 'Slow Title' })).toBeVisible();
  });
}
