import { expect, test } from '@playwright/test';
import { testAppPath as mountedTestAppPath } from './testAppPath';

const mount = process.env.LUMEN_TEST_MOUNT === '/lumen' ? '/lumen' : '';
const appPath = (path: string) => `${mount}${path}`;

for (const locale of ['en', 'fr', 'ar'] as const) {
  for (const enabled of [true, false]) {
    test(`global Search ${enabled ? 'shows' : 'hides'} TMDB collections (${locale})`, async ({
      page,
    }) => {
      const heading = locale === 'ar' ? 'المجموعات' : 'Collections';
      await page.route('https://**/*', (route) => route.abort());
      await page.route('**/lumen-config.json', (route) =>
        route.fulfill({ json: {} })
      );
      await page.route('**/imageproxy/tmdb/**', (route) =>
        route.fulfill({
          contentType: 'image/svg+xml',
          body: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"/>',
        })
      );
      await page.route('**/api/v1/**', (route) => {
        const path = new URL(route.request().url()).pathname.replace(
          /^\/lumen(?=\/)/,
          ''
        );
        if (path === '/api/v1/auth/me')
          return route.fulfill({ json: { id: 1, permissions: 2 } });
        if (path === '/api/v1/user/1/settings/main')
          return route.fulfill({
            json: {
              locale,
              enabledMediaCategories: { movie: enabled, tv: true },
            },
          });
        if (path === '/api/v1/settings/public')
          return route.fulfill({
            json: {
              enabledMediaCategories: { movie: enabled, tv: true },
            },
          });
        if (path === '/api/v1/search')
          return route.fulfill({
            json: {
              page: 1,
              totalPages: 1,
              totalResults: 1,
              results: [
                {
                  id: 42,
                  mediaType: 'collection',
                  title: 'Foundation Collection',
                  posterPath: '/foundation.jpg',
                },
              ],
            },
          });
        return route.fulfill({ json: [] });
      });

      await page.goto(mountedTestAppPath('/search?q=Foundation'));
      if (enabled) {
        await expect(
          page.getByRole('heading', { name: heading, exact: true })
        ).toBeVisible();
        await expect(
          page.getByRole('link', { name: 'Foundation Collection' })
        ).toHaveAttribute('href', appPath('/collection/42'));
      } else {
        await expect(
          page.getByRole('heading', { name: heading, exact: true })
        ).toHaveCount(0);
        await expect(
          page.getByRole('link', { name: 'Foundation Collection' })
        ).toHaveCount(0);
      }
    });
  }
}
