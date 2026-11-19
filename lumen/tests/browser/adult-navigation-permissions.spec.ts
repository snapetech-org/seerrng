import { expect, test } from '@playwright/test';

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
      if (path === '/adult/search')
        return visible
          ? route.fulfill({ json: {} })
          : route.fulfill({
              status: 403,
              json: {
                status: 403,
                message: 'You do not have permission to access adult media.',
              },
            });
      return route.fulfill({ json: { page: 1, totalPages: 1, results: [] } });
    });
    await page.goto('/');
    const adult =
      info.project.name === 'desktop'
        ? page
            .getByRole('navigation', { name: 'Main' })
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
