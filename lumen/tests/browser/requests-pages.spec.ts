import { expect, test, type Page } from '@playwright/test';

// SeerrNG verifies at most 32 title variants per answer and reports the rest as not available,
// so request lists are fetched in pages small enough that every title keeps its real status.
async function fixture(page: Page) {
  const takes: number[] = [];
  const all = Array.from({ length: 40 }, (_, i) => ({
    id: i + 1,
    type: 'movie',
    status: 2,
    is4k: false,
    createdAt: new Date(Date.UTC(2026, 10, 8, 12) - i * 60_000).toISOString(),
    requestedBy: { id: 1, displayName: 'viewer' },
    media: { mediaType: 'movie', tmdbId: 1000 + i, status: 5 },
  }));
  await page.route('https://**/*', (r) => r.abort());
  await page.route('**/lumen-config.json', (r) => r.fulfill({ json: {} }));
  await page.route('**/seerr-classic/**', (r) => r.fulfill({ status: 404 }));
  await page.route('**/api/v1/**', (r) => {
    const url = new URL(r.request().url());
    const path = url.pathname.slice(7);
    if (path === '/auth/me')
      return r.fulfill({
        json: { id: 1, displayName: 'viewer', permissions: 2 },
      });
    if (path === '/settings/public')
      return r.fulfill({ json: { mediaServerType: 1 } });
    if (path === '/request' || path === '/request/status') {
      const take = Number(url.searchParams.get('take') || 20);
      const skip = Number(url.searchParams.get('skip') || 0);
      takes.push(take);
      const filter = url.searchParams.get('filter');
      const list = filter === 'pending' || filter === 'processing' ? [] : all;
      return r.fulfill({
        json: {
          pageInfo: {
            pages: Math.ceil(list.length / take),
            results: list.length,
          },
          results: list.slice(skip, skip + take),
        },
      });
    }
    if (path.startsWith('/movie/'))
      return r.fulfill({
        json: { id: Number(path.slice(7)), title: `Title ${path.slice(7)}` },
      });
    return r.fulfill({ json: {} });
  });
  return takes;
}

for (const everyone of [false, true]) {
  test(`${everyone ? 'Everyone' : 'My requests'} asks for small pages so availability stays verified`, async ({
    page,
  }) => {
    const takes = await fixture(page);
    await page.goto(everyone ? '/requests?tab=everyone' : '/requests?tab=all');
    await expect(page.locator('.rq').first()).toBeVisible();
    await expect
      .poll(() => page.locator('.rq').count())
      .toBeGreaterThanOrEqual(everyone ? 20 : 40);
    expect(takes.length).toBeGreaterThan(1);
    expect(Math.max(...takes)).toBeLessThanOrEqual(15);
  });
}
