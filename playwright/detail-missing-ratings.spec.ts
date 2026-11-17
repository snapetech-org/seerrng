import { expect, test } from '@playwright/test';
import metadata from './fixtures/video-metadata.json';
import { restoreAdminPresentation } from './helpers/presentation';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
test.afterEach(async ({ page }) => restoreAdminPresentation(page));
for (const kind of ['movie', 'tv'] as const) {
  for (const width of [390, 1440]) {
    test(`${kind} detail hides missing ratings at ${width}px`, async ({
      page,
    }, info) => {
      await page.setViewportSize({ width, height: 900 });
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
      await page.route(`**/api/v1/${kind}/424242`, (route) =>
        route.fulfill({ json: metadata[kind] })
      );
      await page.route(`**/api/v1/${kind}/424242/ratingscombined`, (route) =>
        route.fulfill({ json: {} })
      );
      await page.goto(`/${kind}/424242`);
      await expect(
        page
          .getByRole('heading', {
            name:
              kind === 'movie'
                ? 'QA Recovery Movie'
                : 'QA Recovery Series (2020)',
            exact: true,
          })
          .first()
      ).toBeVisible();
      const ratings = page.locator('.media-rating-link:visible');
      await expect(ratings).toHaveCount(
        process.env.SEERR_RATINGS_BASELINE ? 6 : 1
      );
      await page.screenshot({
        path: info.outputPath('detail-ratings.png'),
        fullPage: true,
      });
    });
  }
}
