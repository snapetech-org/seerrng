import { expect, test } from '@playwright/test';

const paged = { page: 1, totalPages: 1, totalResults: 0, results: [] };

test('Lumen renders saved Studios and Networks on desktop and mobile', async ({
  page,
}, info) => {
  const includeShelves = true;
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/imageproxy/tmdb/**', (route) =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="80"><rect width="240" height="80" rx="12" fill="#30405c"/></svg>',
    })
  );
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname.slice(
      '/api/v1'.length
    );
    if (path === '/auth/me')
      return route.fulfill({
        json: { id: 1, displayName: 'Admin', permissions: 2 },
      });
    if (path === '/settings/public')
      return route.fulfill({
        json: {
          applicationTitle: 'SeerrNG',
          enabledMediaCategories: { movie: true, tv: true },
        },
      });
    if (path === '/lumen/configuration')
      return route.fulfill({ json: { defaults: { rows: {} } } });
    if (path === '/settings/discover')
      return route.fulfill({
        json: includeShelves
          ? [
              {
                id: 8,
                type: 8,
                order: 0,
                enabled: true,
                data: JSON.stringify([
                  {
                    id: 41077,
                    name: 'A24',
                    logoPath: '/1ZXsGaFPgrgS6ZZGS37AqD5uU12.png',
                  },
                ]),
              },
              {
                id: 12,
                type: 12,
                order: 1,
                enabled: true,
                data: '',
              },
            ]
          : [],
      });
    if (
      /^\/discover\/(trending|movies|tv|movies\/upcoming)$/.test(path) ||
      path === '/media'
    )
      return route.fulfill({ json: paged });
    if (path.startsWith('/discover/genreslider/'))
      return route.fulfill({ json: [] });
    return route.fulfill({ json: {} });
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Discover' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Studios' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Networks' })).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Browse movies from A24' })
  ).toHaveAttribute('href', '/movies?studio=41077');
  await expect(
    page.getByRole('link', { name: 'Browse series from Netflix' })
  ).toHaveAttribute('href', '/series?network=213');
  if (process.env.LUMEN_CAPTURE_DISCOVER_COMPANIES)
    await page.screenshot({
      path: info.outputPath('discover-companies-after-desktop.png'),
      fullPage: true,
    });

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('heading', { name: 'Studios' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Networks' })).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth)
  ).toBeLessThanOrEqual(390);
  if (process.env.LUMEN_CAPTURE_DISCOVER_COMPANIES)
    await page.screenshot({
      path: info.outputPath('discover-companies-after-mobile.png'),
      fullPage: true,
    });
});
