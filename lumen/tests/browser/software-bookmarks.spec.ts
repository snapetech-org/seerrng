import { expect, test } from '@playwright/test';

test('software bookmarks open catalog titles by provider and preserve search', async ({
  page,
}, info) => {
  const datKey = 'dat-' + 'a'.repeat(64);
  const reads: string[] = [];
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.slice(7);
    if (path === '/auth/me')
      return route.fulfill({ json: { id: 1, permissions: 32 } });
    if (path === '/settings/public')
      return route.fulfill({
        json: {
          softwareEnabled: true,
          romarrEnabled: true,
          enabledMediaCategories: { game: true, retro: true },
        },
      });
    if (
      path === '/request/software/catalog/games/42' ||
      path.endsWith('/' + datKey)
    ) {
      reads.push(path + url.search);
      return route.fulfill({
        json: {
          game: {
            title: path.endsWith('/42')
              ? 'Fixture PC Game'
              : 'Fixture DAT Game',
            genres: [],
            platforms: [],
            emulationSystems: [{ slug: 'nes', name: 'NES', group: 'retro' }],
          },
        },
      });
    }
    return route.fulfill({ json: { results: [] } });
  });
  await page.goto('/software?category=game&game=42');
  await expect(page).toHaveURL(/\/game\/game\/42$/);
  await expect(
    page.getByRole('heading', { name: 'Fixture PC Game' })
  ).toBeVisible();
  await page.screenshot({ path: info.outputPath('pc-bookmark.png') });
  await page.goto(
    `/software?category=retro&catalogProvider=dat&game=${datKey}`
  );
  await expect(page).toHaveURL(`/game/retro/${datKey}?dat=1`);
  await expect(
    page.getByRole('heading', { name: 'Fixture DAT Game' })
  ).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Console' })).toHaveValue(
    'nes'
  );
  await page.screenshot({ path: info.outputPath('dat-bookmark.png') });
  expect(reads).toEqual([
    '/request/software/catalog/games/42?category=game',
    `/request/software/catalog/games/${datKey}?category=retro&catalogProvider=dat`,
  ]);
  await page.goto('/software?category=retro&game=bad&q=Fixture+Search&extra=1');
  await expect(page).toHaveURL('/games?c=retro&q=Fixture+Search');
  expect(reads).toHaveLength(2);
});
