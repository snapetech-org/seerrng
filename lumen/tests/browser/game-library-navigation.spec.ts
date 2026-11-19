import { expect, test, type Page } from '@playwright/test';

const mount = process.env.LUMEN_TEST_MOUNT === '/lumen' ? '/lumen' : '';
const appPath = (path: string) => `${mount}${path}`;

async function fixture(page: Page, gamesEnabled: boolean) {
  let gameCatalogRequests = 0;
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
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
          mediaServerType: 1,
          softwareEnabled: true,
          romarrEnabled: true,
          enabledMediaCategories: {
            game: gamesEnabled,
            retro: gamesEnabled,
            modern: gamesEnabled,
          },
        },
      });
    if (path === '/user/1/settings/main')
      return route.fulfill({
        json: {
          enabledMediaCategories: {
            game: true,
            retro: true,
            modern: true,
          },
        },
      });
    if (path.startsWith('/request/software/catalog/popular')) {
      gameCatalogRequests++;
      return route.fulfill({ json: { results: [] } });
    }
    return route.fulfill({ json: {} });
  });
  return () => gameCatalogRequests;
}

test('globally disabled game categories omit My Games from You', async ({
  page,
}, info) => {
  const gameCatalogRequests = await fixture(page, false);
  await page.goto(appPath('/me'));
  const link = page.getByRole('link', { name: 'Open My Games', exact: true });
  await expect(link).toHaveCount(0);
  if (info.project.name === 'iphone')
    await page.screenshot({
      path: info.outputPath('disabled-my-games-after.png'),
    });
  expect(gameCatalogRequests()).toBe(0);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth)
  ).toBeLessThanOrEqual(page.viewportSize()!.width);
});

test('enabled game catalogs keep My Games reachable from You', async ({
  page,
}) => {
  const gameCatalogRequests = await fixture(page, true);
  await page.goto(appPath('/me'));
  await expect(
    page.getByRole('link', { name: 'Open My Games', exact: true })
  ).toBeVisible();
  await expect.poll(gameCatalogRequests).toBeGreaterThan(0);
});
