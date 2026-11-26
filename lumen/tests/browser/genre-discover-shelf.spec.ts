import { expect, test } from '@playwright/test';

const mount = process.env.LUMEN_TEST_MOUNT === '/lumen' ? '/lumen' : '';
const appPath = (path: string) => `${mount}${path}`;

test('Discover genre shelf recovers the next image after artwork fails', async ({
  page,
}, testInfo) => {
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({
      json: {
        defaults: {
          rows: {
            hero: false,
            newOnPlex: false,
            trendingMovies: false,
            popularSeries: false,
            audiobooks: false,
            books: false,
            comingSoon: false,
            genres: true,
          },
          showBooks: false,
        },
      },
    })
  );
  await page.route('**/imageproxy/**', (route) =>
    route.request().url().endsWith('/shared.jpg')
      ? route.fulfill({ status: 404, body: '' })
      : route.fulfill({
          contentType: 'image/svg+xml',
          body: '<svg xmlns="http://www.w3.org/2000/svg" width="780" height="390"><rect width="780" height="390" fill="#315a8a"/></svg>',
        })
  );
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname
      .replace(/^\/lumen(?=\/)/, '')
      .replace(/^\/api\/v1/, '');
    if (path === '/auth/me')
      return route.fulfill({
        json: { id: 1, displayName: 'Household', permissions: 32 },
      });
    if (path === '/settings/public')
      return route.fulfill({
        json: {
          applicationTitle: 'SeerrNG',
          mediaServerType: 1,
          enabledMediaCategories: { movie: true, tv: true },
        },
      });
    if (path === '/user/1/settings/main')
      return route.fulfill({ json: { enabledMediaCategories: {} } });
    if (path === '/lumen/configuration')
      return route.fulfill({ json: { defaults: { rows: { genres: true } } } });
    if (path === '/settings/discover') return route.fulfill({ json: [] });
    if (path === '/discover/genreslider/movie')
      return route.fulfill({
        json: [
          {
            id: 28,
            name: 'Action',
            backdrops: ['/shared.jpg', '/fallback.jpg'],
          },
          {
            id: 12,
            name: 'Adventure',
            backdrops: ['/shared.jpg', '/adventure.jpg'],
          },
        ],
      });
    return route.fulfill({
      json: { page: 1, totalPages: 1, totalResults: 0, results: [] },
    });
  });

  await page.goto(appPath('/'));
  await expect(
    page.getByRole('heading', { name: 'Browse by Genre', exact: true })
  ).toBeVisible();
  const tile = page.getByRole('link', { name: 'Browse Action' });
  await expect(tile).toHaveAttribute('href', appPath('/movies?genre=28'));
  await expect(tile.locator('img')).toHaveAttribute(
    'src',
    '/imageproxy/tmdb/t/p/w780/fallback.jpg'
  );
  if (['desktop', 'iphone'].includes(testInfo.project.name))
    await page.screenshot({
      path: testInfo.outputPath('discover-genres.png'),
      fullPage: true,
    });
});
