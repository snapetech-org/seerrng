import { expect, test } from '@playwright/test';

const baseline = process.env.SEERR_LOCALE_QA_BASELINE === 'true';
const locales = baseline ? ['en'] : ['en', 'ar'];
test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });

for (const theme of ['seerrNGJ', 'seerrOrig', 'persiusNG']) {
  for (const width of [390, 1440]) {
    for (const locale of locales) {
      test(`${theme} ${locale} shared settings at ${width}px`, async ({
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
              data: { locale },
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
        for (const [name, route] of [
          ['profile', '/profile/settings/main'],
          ['general', '/settings/main'],
          ['permissions', '/settings/users'],
          ['services', '/settings/services'],
        ]) {
          await page.goto(route, { waitUntil: 'domcontentloaded' });
          await expect(page.locator('html')).toHaveAttribute(
            'data-interface-theme',
            theme
          );
          await expect(page.locator('html')).toHaveAttribute('lang', locale);
          if (!baseline) {
            await expect(page.locator('html')).toHaveAttribute(
              'dir',
              locale === 'ar' ? 'rtl' : 'ltr'
            );
          }
          await expect
            .poll(() =>
              page.evaluate(
                () => getComputedStyle(document.documentElement).direction
              )
            )
            .toBe(locale === 'ar' ? 'rtl' : 'ltr');
          await expect(
            page
              .locator(
                name === 'profile' ? 'main form' : '.settings-page-content'
              )
              .first()
          ).toBeVisible();
          await expect
            .poll(() =>
              page.evaluate(
                () => document.documentElement.scrollWidth <= window.innerWidth
              )
            )
            .toBe(true);
          await page.evaluate(() => document.fonts.ready);
          await page.screenshot({
            path: info.outputPath(`${theme}-${locale}-${width}-${name}.png`),
            fullPage: true,
          });
        }
      });
    }
  }
}
