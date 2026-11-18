import { expect, test } from '@playwright/test';

test('software bookmarks open catalog titles by provider and preserve search', async ({
  page,
}, info) => {
  const datKey = 'dat-' + 'a'.repeat(64);
  const reads: string[] = [];
  const requests: unknown[] = [];
  let failSecond = true;
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/imageproxy/**', (route) =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="48"><rect width="64" height="48" fill="#456"/></svg>',
    })
  );
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
    if (path === '/request/software' && route.request().method() === 'POST') {
      requests.push(route.request().postDataJSON());
      return route.fulfill({
        status: 201,
        json: { request: { status: 'pending' } },
      });
    }
    if (path === '/request/software/catalog/games/43' && failSecond) {
      failSecond = false;
      return route.fulfill({
        status: 503,
        json: { error: 'Catalog temporarily unavailable.' },
      });
    }
    if (
      /^\/request\/software\/catalog\/games\/4[23]$/.test(path) ||
      path.endsWith('/' + datKey)
    ) {
      reads.push(path + url.search);
      return route.fulfill({
        json: {
          game: {
            title: path.endsWith('/42')
              ? 'Fixture PC Game'
              : path.endsWith('/43')
                ? 'Second PC Game'
                : 'Fixture DAT Game',
            igdbId: path.endsWith('/42') ? 42 : 43,
            coverUrl: 'about:blank',
            screenshots: ['about:blank', '/imageproxy/igdb/shot.png'],
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
  await expect(page.locator('.dposter img')).toHaveCount(0);
  await expect(page.locator('.dhero img')).toHaveAttribute(
    'src',
    '/imageproxy/igdb/shot.png'
  );
  await expect(page.locator('.shots img')).toHaveCount(1);
  await expect(page.locator('.shots img')).toHaveAttribute(
    'src',
    '/imageproxy/igdb/shot.png'
  );
  await page.screenshot({ path: info.outputPath('pc-bookmark.png') });
  await page.getByRole('combobox', { name: 'System' }).selectOption('windows');
  await page.getByRole('combobox', { name: 'Build' }).selectOption('x64');
  await page.evaluate(() => {
    history.pushState(history.state, '', '/game/game/43');
    window.dispatchEvent(
      new PopStateEvent('popstate', { state: history.state })
    );
  });
  await expect(page.getByRole('alert')).toContainText(
    'Catalog temporarily unavailable.'
  );
  await page.screenshot({ path: info.outputPath('game-retry.png') });
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Second PC Game' })
  ).toBeVisible();
  const request = page
    .getByRole('button', { name: 'Request', exact: true })
    .filter({ visible: true });
  await expect(request).toBeDisabled();
  await page.getByRole('combobox', { name: 'System' }).selectOption('linux');
  await page.getByRole('combobox', { name: 'Build' }).selectOption('arm64');
  await request.click();
  await expect(
    page
      .getByRole('button', { name: 'Waiting for approval', exact: true })
      .filter({ visible: true })
  ).toBeDisabled();
  expect(requests).toEqual([
    {
      category: 'game',
      catalogId: 43,
      variant: { operatingSystem: 'linux', architecture: 'arm64' },
    },
  ]);
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
    '/request/software/catalog/games/43?category=game',
    `/request/software/catalog/games/${datKey}?category=retro&catalogProvider=dat`,
  ]);
  await page.goto('/software?category=retro&game=bad&q=Fixture+Search&extra=1');
  await expect(page).toHaveURL('/games?c=retro&q=Fixture+Search');
  expect(reads).toHaveLength(3);
});
