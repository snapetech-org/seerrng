import { expect, test } from '@playwright/test';
import { restoreAdminPresentation } from './helpers/presentation';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
test.afterEach(async ({ page }) => restoreAdminPresentation(page));

for (const theme of ['seerrNGJ', 'seerrOrig', 'persiusNG']) {
  for (const width of [390, 1440]) {
    for (const [query, destination, target] of [
      ['API', '/settings/main', '#apiKey'],
      ['NZBHydra2', '/settings/prowlarr', '#prowlarr-settings-title'],
    ]) {
      test(`${query} search in ${theme} at ${width}px reaches its indexed destination`, async ({
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
            await page.request.post('/api/v1/user/1/settings/main', {
              data: { locale: 'en' },
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
        await page.goto('/settings/services', {
          waitUntil: 'domcontentloaded',
        });
        await expect(page.locator('html')).toHaveAttribute('lang', 'en');
        await expect(page.locator('html')).toHaveAttribute(
          'data-interface-theme',
          theme
        );
        await page.screenshot({
          path: info.outputPath('before-search.png'),
          fullPage: true,
        });
        const input = page.locator('input[aria-label="Search Settings"]');
        await input.fill(query);
        await input.press('Enter');
        try {
          await expect(page).toHaveURL(new RegExp(`${destination}[?#]?`));
          await expect(page.locator(target)).toBeVisible();
          if (query === 'API') {
            await expect(page.locator(target)).toBeFocused();
          } else {
            // Heading searches focus the first control in their shared row.
            await expect
              .poll(() =>
                page
                  .locator(target)
                  .evaluate((element) =>
                    element
                      .closest('.form-row, .settings-group-card, section')
                      ?.contains(document.activeElement)
                  )
              )
              .toBe(true);
          }
          await expect
            .poll(() =>
              page.evaluate(
                () => document.documentElement.scrollWidth <= innerWidth
              )
            )
            .toBe(true);
        } finally {
          await page.screenshot({
            path: info.outputPath('after-search.png'),
            fullPage: true,
          });
        }
      });
    }
  }
}
