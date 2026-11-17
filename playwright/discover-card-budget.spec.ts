import { expect, test } from '@playwright/test';
import { restoreAdminPresentation } from './helpers/presentation';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
test.afterEach(async ({ page }) => restoreAdminPresentation(page));
for (const kind of ['tv', 'movie']) {
  test(`Persius ${kind} discovery uses list payloads without per-card detail reads`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    expect(
      (
        await page.request.post('/api/v1/auth/local', {
          data: { email: 'admin@seerr.dev', password: 'test1234' },
        })
      ).status()
    ).toBe(200);
    expect(
      (
        await page.request.post('/api/v1/user/1/settings/interface-theme', {
          data: { theme: 'persiusNG' },
        })
      ).status()
    ).toBe(200);
    let detailReads = 0;
    page.on('request', (request) => {
      if (
        new RegExp(`/api/v1/${kind}/\\d+$`).test(
          new URL(request.url()).pathname
        )
      )
        detailReads++;
    });
    await page.route(`**/api/v1/discover/${kind}*`, (route) => {
      const pageNumber = Number(
        new URL(route.request().url()).searchParams.get('page') || 1
      );
      return route.fulfill({
        json: {
          page: pageNumber,
          totalPages: 4,
          totalResults: 80,
          results: Array.from({ length: 20 }, (_, index) => ({
            id: 90000 + (pageNumber - 1) * 20 + index,
            mediaType: kind,
            title: `Budget fixture ${(pageNumber - 1) * 20 + index}`,
            name: `Budget fixture ${(pageNumber - 1) * 20 + index}`,
            overview:
              'List metadata stays available without a full detail fetch.',
            releaseDate: '2020-01-01',
            firstAirDate: '2020-01-01',
            voteAverage: 7,
            voteCount: 10,
          })),
        },
      });
    });
    await page.goto(`/discover/${kind === 'movie' ? 'movies' : 'tv'}`);
    const cards = page.locator(`a[href^="/${kind}/9"]`);
    await expect(cards.first()).toBeVisible();
    for (let index = 0; index < 4; index++) {
      await cards.last().scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
    }
    expect(await cards.count()).toBeGreaterThanOrEqual(20);
    expect(detailReads).toBe(0);
    await page.screenshot({
      path: info.outputPath('discover-cards.png'),
      fullPage: true,
    });
  });
}
