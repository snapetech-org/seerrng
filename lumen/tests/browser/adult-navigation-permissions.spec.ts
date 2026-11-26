import { expect, test } from '@playwright/test';

const mount = process.env.LUMEN_TEST_MOUNT === '/lumen' ? '/lumen' : '';
const appPath = (path: string) => `${mount}${path}`;

for (const [permissions, visible] of [
  [0, false],
  [2, true],
  [16, true],
  [32, false],
  [140737488355328, true],
] as const) {
  test(`Adult navigation follows its native permissions (${permissions})`, async ({
    page,
  }, info) => {
    let adultSearchCalls = 0;
    await page.route('https://**/*', (route) => route.abort());
    await page.route('**/lumen-config.json', (route) =>
      route.fulfill({ json: {} })
    );
    await page.route('**/api/v1/**', (route) => {
      const path = new URL(route.request().url()).pathname.slice(
        '/api/v1'.length
      );
      if (path === '/auth/me')
        return route.fulfill({
          json: { id: 1, displayName: 'Viewer', permissions },
        });
      if (path === '/settings/public')
        return route.fulfill({
          json: {
            adultEnabled: true,
            enabledMediaCategories: { adult: true },
          },
        });
      if (path === '/user/1/settings/main')
        return route.fulfill({
          json: { enabledMediaCategories: { adult: true } },
        });
      if (path === '/settings/discover') return route.fulfill({ json: [] });
      if (
        path === '/discover/genreslider/movie' ||
        path === '/discover/genreslider/tv'
      )
        return route.fulfill({ json: [] });
      if (path === '/languages')
        return route.fulfill({
          json: [{ iso_639_1: 'en', english_name: 'English' }],
        });
      if (path === '/watchproviders/regions')
        return route.fulfill({
          json: [{ iso_3166_1: 'US', english_name: 'United States' }],
        });
      if (path === '/adult/search') {
        adultSearchCalls++;
        return visible
          ? route.fulfill({ json: {} })
          : route.fulfill({
              status: 403,
              json: {
                status: 403,
                message: 'You do not have permission to access adult media.',
              },
            });
      }
      return route.fulfill({ json: { page: 1, totalPages: 1, results: [] } });
    });
    await page.goto(appPath('/'));
    await page.waitForLoadState('networkidle');
    expect(adultSearchCalls).toBe(visible ? 1 : 0);
    const adult =
      info.project.name === 'desktop'
        ? page
            .getByRole('navigation', { name: 'Main navigation' })
            .getByRole('link', { name: 'Adult', exact: true })
        : page
            .locator('.navchips')
            .getByRole('link', { name: 'Adult', exact: true });
    await expect(adult).toHaveCount(visible ? 1 : 0);
    if (info.project.name === 'desktop')
      await page.screenshot({
        path: info.outputPath(`adult-navigation-${permissions}.png`),
        fullPage: true,
        animations: 'disabled',
      });
  });
}

for (const [name, permissions, ageDefault, contentRestricted, visible] of [
  ['instance default restriction', 16, true, undefined, false],
  ['explicit per-user allowance', 16, true, false, true],
  ['explicit per-user restriction', 16, false, true, false],
  ['administrator default exemption', 2, true, undefined, true],
] as const) {
  test(`Adult navigation honors ${name}`, async ({ page }, info) => {
    const baseline = process.env.LUMEN_CAPTURE_MODE === 'baseline';
    let adultSearchCalls = 0;
    await page.route('https://**/*', (route) => route.abort());
    await page.route('**/lumen-config.json', (route) =>
      route.fulfill({ json: {} })
    );
    await page.route('**/api/v1/**', (route) => {
      const path = new URL(route.request().url()).pathname.slice(
        '/api/v1'.length
      );
      if (path === '/auth/me')
        return route.fulfill({
          json: {
            id: 1,
            displayName: 'Viewer',
            permissions,
            ...(contentRestricted === undefined ? {} : { contentRestricted }),
          },
        });
      if (path === '/settings/public')
        return route.fulfill({
          json: {
            adultEnabled: true,
            enabledMediaCategories: { adult: true },
            ageGate: { defaultRestricted: ageDefault },
          },
        });
      if (path === '/user/1/settings/main')
        return route.fulfill({
          json: { enabledMediaCategories: { adult: true } },
        });
      if (path === '/settings/discover') return route.fulfill({ json: [] });
      if (
        path === '/discover/genreslider/movie' ||
        path === '/discover/genreslider/tv'
      )
        return route.fulfill({ json: [] });
      if (path === '/languages')
        return route.fulfill({
          json: [{ iso_639_1: 'en', english_name: 'English' }],
        });
      if (path === '/watchproviders/regions')
        return route.fulfill({
          json: [{ iso_3166_1: 'US', english_name: 'United States' }],
        });
      if (path === '/adult/search') {
        adultSearchCalls++;
        return route.fulfill({ json: {} });
      }
      return route.fulfill({ json: { page: 1, totalPages: 1, results: [] } });
    });
    await page.goto(appPath('/'));
    await page.waitForLoadState('networkidle');
    expect(adultSearchCalls).toBe(visible ? 1 : 0);
    const adult =
      info.project.name === 'desktop'
        ? page
            .getByRole('navigation', { name: 'Main navigation' })
            .getByRole('link', { name: 'Adult', exact: true })
        : page
            .locator('.navchips')
            .getByRole('link', { name: 'Adult', exact: true });
    if (baseline) await expect(adult).toHaveCount(1);
    else await expect(adult).toHaveCount(visible ? 1 : 0);
    const adultShortcut = page
      .locator('main')
      .getByRole('link', { name: 'Adult', exact: true });
    if (baseline) await expect(adultShortcut).toHaveCount(1);
    else await expect(adultShortcut).toHaveCount(visible ? 1 : 0);
    const captureDir = process.env.LUMEN_VISUAL_CAPTURE_DIR;
    if (captureDir && ['desktop', 'iphone'].includes(info.project.name))
      await page.screenshot({
        path: `${captureDir}/adult-nav-${name.replaceAll(' ', '-')}-${baseline ? 'baseline' : 'candidate'}-${info.project.name}.png`,
        fullPage: true,
        animations: 'disabled',
      });
  });
}
