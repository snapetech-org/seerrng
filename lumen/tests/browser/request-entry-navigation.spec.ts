import { expect, test } from '@playwright/test';

const pages = [
  { path: '/books', label: 'Book Recommendations' },
  { path: '/music', label: 'Collector Picks' },
  { path: '/games', label: 'Translations and Hacks' },
  { path: '/games', label: 'Game Finder' },
];

for (const permissions of [0, 32, 2]) {
  for (const entry of pages) {
    test(`${entry.label} entry follows request access (permissions: ${permissions})`, async ({
      page,
    }, info) => {
      await page.route('https://**/*', (route) => route.abort());
      await page.route('**/lumen-config.json', (route) =>
        route.fulfill({ json: {} })
      );
      await page.route('**/api/v1/**', (route) => {
        const url = new URL(route.request().url());
        const path = url.pathname.slice('/api/v1'.length);
        if (path === '/auth/me')
          return route.fulfill({
            json: { id: 1, displayName: 'Viewer', permissions },
          });
        if (path === '/settings/public')
          return route.fulfill({
            json: {
              mediaServerType: 1,
              musicEnabled: true,
              softwareEnabled: true,
              romarrEnabled: true,
              enabledMediaCategories: {
                book: true,
                audiobook: true,
                music: true,
                game: true,
                modern: true,
              },
            },
          });
        if (path === '/user/1/settings/main')
          return route.fulfill({
            json: {
              enabledMediaCategories: {
                book: true,
                audiobook: true,
                music: true,
                game: true,
                modern: true,
              },
            },
          });
        if (path === '/request/software/catalog/status')
          return route.fulfill({
            json: { games: ['game', 'modern'], available: true },
          });
        if (path === '/request/software/catalog/categories')
          return route.fulfill({ json: { categories: ['game', 'modern'] } });
        if (path === '/request/software/catalog/popular')
          return route.fulfill({ json: { results: [], nextOffset: null } });
        return route.fulfill({ json: { page: 1, results: [], totalPages: 1 } });
      });
      await page.goto(entry.path);
      await expect(page.locator('main h1')).toBeVisible();
      const link = page.getByRole('link', { name: entry.label, exact: true });
      await expect(link).toHaveCount(permissions === 0 ? 0 : 1);
      if (info.project.name === 'desktop')
        await page.screenshot({
          path: info.outputPath(
            `${entry.label.toLowerCase().replaceAll(' ', '-')}-permissions-${permissions}.png`
          ),
          fullPage: true,
          animations: 'disabled',
        });
    });
  }
}
