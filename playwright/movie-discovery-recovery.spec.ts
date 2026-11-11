import { expect, test } from '@playwright/test';
import { restoreAdminPresentation } from './helpers/presentation';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
test.afterEach(async ({ page }) => restoreAdminPresentation(page));
const baseline = process.env.SEERR_MOVIES_RECOVERY_BASELINE === 'true';

for (const theme of ['persiusNG', 'seerrOrig', 'seerrNGJ']) {
  for (const width of [390, 1630]) {
    test(`movie discovery retry preserves filters ${theme} ${width}`, async ({
      page,
    }, info) => {
      await page.setViewportSize({ width, height: 1088 });
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
            data: { theme },
          })
        ).status()
      ).toBe(200);
      let unavailable = true;
      const requests: URL[] = [];
      await page.route('**/api/v1/discover/movies?*', async (route) => {
        requests.push(new URL(route.request().url()));
        await route.fulfill(
          unavailable
            ? {
                status: 503,
                json: { message: 'Fixture discovery unavailable' },
              }
            : {
                json: {
                  page: 1,
                  totalPages: 1,
                  totalResults: 1,
                  results: [
                    {
                      id: 991001,
                      mediaType: 'movie',
                      title: 'Recovered Discovery Movie',
                      releaseDate: '2026-01-01',
                      voteAverage: 8,
                      voteCount: 100,
                    },
                  ],
                },
              }
        );
      });
      await page.goto('/discover/movies?sortBy=vote_average.desc');
      await expect(page.locator('html')).toHaveAttribute(
        'data-interface-theme',
        theme
      );
      await expect(
        page.getByRole('heading', { name: 'Movies', exact: true })
      ).toBeVisible();
      if (baseline) {
        await expect(
          page.getByText('500 - Internal Server Error', { exact: true })
        ).toBeVisible();
        await expect(
          page.getByRole('button', { name: 'Retry', exact: true })
        ).toHaveCount(0);
        await page.screenshot({
          path: info.outputPath('failed.png'),
          fullPage: true,
        });
        return;
      }
      await expect(
        page
          .getByRole('alert')
          .filter({ hasText: 'Movies Could Not Be Loaded' })
      ).toBeVisible();
      await expect(
        page.getByText('500 - Internal Server Error', { exact: true })
      ).toHaveCount(0);
      const retry = page.getByRole('button', { name: 'Retry', exact: true });
      await expect(retry).toBeEnabled();
      await page.screenshot({
        path: info.outputPath('failed.png'),
        fullPage: true,
      });
      unavailable = false;
      const successfulRequest = page.waitForResponse(
        (response) =>
          response.url().includes('/api/v1/discover/movies?') &&
          response.status() === 200
      );
      await retry.click();
      await successfulRequest;
      await expect(
        page.getByText('Recovered Discovery Movie', { exact: true }).first()
      ).toBeVisible();
      await expect(retry).toHaveCount(0);
      expect(requests.at(-1)?.searchParams.get('sortBy')).toBe(
        'vote_average.desc'
      );
      expect(requests.at(-1)?.searchParams.get('voteCountGte')).toBe('50');
      await expect(page).toHaveURL(/sortBy=vote_average.desc/);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth
        )
      ).toBe(true);
      await page.screenshot({
        path: info.outputPath('recovered.png'),
        fullPage: true,
      });
    });
  }
}

test('movie discovery retains loaded titles when revalidation is denied', async ({
  page,
}, info) => {
  expect(
    (
      await page.request.post('/api/v1/auth/local', {
        data: { email: 'admin@seerr.dev', password: 'test1234' },
      })
    ).status()
  ).toBe(200);
  let denied = false;
  let failures = 0;
  await page.route('**/api/v1/discover/movies?*', async (route) => {
    if (denied) {
      failures++;
      return route.fulfill({
        status: 403,
        json: { message: 'Fixture permission denied' },
      });
    }
    return route.fulfill({
      json: {
        page: 1,
        totalPages: 1,
        totalResults: 1,
        results: [
          {
            id: 991002,
            mediaType: 'movie',
            title: 'Retained Discovery Movie',
            releaseDate: '2026-01-01',
          },
        ],
      },
    });
  });
  await page.goto('/discover/movies?sortBy=popularity.desc');
  const title = page
    .getByText('Retained Discovery Movie', { exact: true })
    .first();
  await expect(title).toBeVisible();
  denied = true;
  // Reconnection revalidates the same cache key after SWR's de-duplication window.
  await expect
    .poll(
      async () => {
        await page.context().setOffline(true);
        await page.context().setOffline(false);
        return failures;
      },
      { timeout: 10_000, intervals: [250, 500, 1000] }
    )
    .toBeGreaterThan(0);
  await expect(
    page.getByRole('alert').filter({ hasText: 'Movies Could Not Be Loaded' })
  ).toBeVisible();
  await expect(title).toBeVisible();
  await expect(
    page.getByText('500 - Internal Server Error', { exact: true })
  ).toHaveCount(0);
  await page.screenshot({
    path: info.outputPath('retained-results.png'),
    fullPage: true,
  });
});
