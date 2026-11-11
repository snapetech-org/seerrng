import { expect, test, type Page } from '@playwright/test';

// A short, narrow screen (360x288) is landscape by shape, but there is no room to give a third of
// its width to a side rail: it keeps the bottom tab bar and its pages must not scroll sideways.
async function fixture(page: Page) {
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
      return r.fulfill({ json: { mediaServerType: 1 } });
    if (path.startsWith('/movie/'))
      return r.fulfill({ json: { id: 603, title: 'Ready movie' } });
    if (path === '/discover/movies/upcoming')
      return r.fulfill({
        json: {
          page: 1,
          totalPages: 1,
          totalResults: 2,
          results: [1, 2].map((i) => ({
            id: 900 + i,
            title: `Victorian Psychosis Stories ${i}`,
            mediaType: 'movie',
            releaseDate: '2027-03-15',
          })),
        },
      });
    if (path === '/request')
      return r.fulfill({
        json: {
          pageInfo: { pages: 1, results: 1 },
          results: [
            {
              id: 1,
              type: 'movie',
              status: 2,
              is4k: false,
              createdAt: '2026-11-08T12:00:00Z',
              requestedBy: { id: 1, displayName: 'reader' },
              media: {
                mediaType: 'movie',
                tmdbId: 603,
                status: 5,
                mediaUrl: 'https://plex.example/web/index.html#!/server/x',
              },
            },
          ],
        },
      });
    return r.fulfill({
      json: { page: 1, totalPages: 1, totalResults: 0, results: [] },
    });
  });
}

test('a short narrow screen keeps the bottom tab bar and never scrolls sideways', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop', 'sets its own viewport');
  await fixture(page);
  await page.setViewportSize({ width: 360, height: 288 });
  for (const path of ['/requests?tab=all', '/soon', '/me/lumen']) {
    await page.goto(path);
    await expect(page.locator('.view')).toBeVisible();
    await page.waitForTimeout(400);
    const m = await page.evaluate(() => {
      const bar = document.querySelector('.tabbar')!.getBoundingClientRect();
      return {
        barIsRow: bar.width > bar.height,
        scroll: document.documentElement.scrollWidth,
        client: document.documentElement.clientWidth,
        content: document.querySelector('.view')!.getBoundingClientRect().left,
      };
    });
    expect(m.barIsRow, `${path}: tab bar should be along the bottom`).toBe(
      true
    );
    expect(m.scroll, `${path}: page wider than the screen`).toBeLessThanOrEqual(
      m.client
    );
    expect(m.content, `${path}: no rail gutter`).toBeLessThan(40);
  }
  // a wide short phone still gets the side rail
  await page.setViewportSize({ width: 740, height: 360 });
  await page.goto('/soon');
  const rail = await page.locator('.tabbar').boundingBox();
  expect(rail!.height).toBeGreaterThan(rail!.width);
});
