import { expect, test } from '@playwright/test';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
const baseline = process.env.SEERR_SETTINGS_GRID_BASELINE === 'true';
for (const width of [1440, 390, 640]) {
  for (const routePath of [
    '/settings/users',
    '/settings/services',
    '/settings/network',
    '/settings/main',
  ]) {
    test(`settings grid ${routePath} remains usable at ${width}px`, async ({
      page,
      baseURL,
    }, info) => {
      await page.setViewportSize({ width, height: 900 });
      expect(
        (
          await page.request.post(`${baseURL}/api/v1/auth/local`, {
            data: { email: 'admin@seerr.dev', password: 'test1234' },
          })
        ).status()
      ).toBe(200);
      expect(
        (
          await page.request.post(
            `${baseURL}/api/v1/user/1/settings/interface-theme`,
            {
              data: { theme: 'seerrNGJ' },
            }
          )
        ).status()
      ).toBe(200);
      if (routePath === '/settings/services') {
        await page.route(
          /\/api\/v1\/settings\/(?:radarr|sonarr|lidarr|readarr|whisparr|sportarr)(?:\?.*)?$/,
          (route) => route.fulfill({ json: [] })
        );
      }
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(routePath);
      await expect(page.locator('.settings-page-content')).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute(
        'data-interface-theme',
        'seerrNGJ'
      );
      const stylesheet = page.locator(
        'link[data-interface-theme-stylesheet][media="all"]'
      );
      await expect(stylesheet).toHaveAttribute('href', /seerrNGJ\/theme\.css/);
      await expect
        .poll(() =>
          page.evaluate(() =>
            Boolean(
              (
                document.querySelector(
                  'link[data-interface-theme-stylesheet][media="all"]'
                ) as HTMLLinkElement
              )?.sheet
            )
          )
        )
        .toBe(true);
      await page.evaluate(() => document.fonts.ready);
      const dimensions = await page.evaluate(() => ({
        viewport: innerWidth,
        document: document.documentElement.scrollWidth,
      }));
      await info.attach('viewport.json', {
        body: JSON.stringify(dimensions),
        contentType: 'application/json',
      });
      await page.screenshot({
        path: info.outputPath(`${routePath.replaceAll('/', '-')}-${width}.png`),
        animations: 'disabled',
      });
      if (!baseline)
        expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport);
      expect(errors).toEqual([]);
    });
  }
}
