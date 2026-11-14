import { expect, test, type Page } from '@playwright/test';

// A ready request's "Watch on Plex" button must stay inside its card on narrow cards (two columns on
// a folded phone, a 360px-wide short phone).
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
      return r.fulfill({ json: { mediaServerType: 1 } });
    if (path.startsWith('/movie/'))
      return r.fulfill({ json: { id: 603, title: 'Ready movie' } });
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
    return r.fulfill({ json: {} });
  });
}

test('the Watch on Plex button stays inside a narrow request card', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop', 'sets its own viewport');
  await fixture(page);
  await page.emulateMedia({ media: 'screen' });
  for (const [width, height] of [
    [701, 685],
    [360, 800],
    [320, 640],
    [360, 288],
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto('/requests?tab=all');
    const card = page.locator('.rq').filter({ hasText: 'Ready movie' });
    const btn = card.locator('.rqa a.btn');
    await expect(btn).toBeVisible();
    const spill = await card.evaluate((c) => {
      const outer = c.getBoundingClientRect();
      return Array.from(c.querySelectorAll<HTMLElement>('.rqa .btn')).map(
        (b) => b.getBoundingClientRect().right - outer.right
      );
    });
    for (const s of spill)
      expect(
        s,
        `button past its card at ${width}x${height}`
      ).toBeLessThanOrEqual(0.5);
  }
});
