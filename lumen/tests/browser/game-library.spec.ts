import { expect, test } from '@playwright/test';

const appPath = (path: string) =>
  `${process.env.LUMEN_TEST_MOUNT ? '/lumen' : ''}${path}`;

test('My Games keeps private edits separate from household results', async ({
  page,
}) => {
  const game = {
    id: 4,
    title: 'Private Fixture',
    status: 'backlog',
    category: 'retro',
    catalogId: 41,
    storeName: '',
    platformName: '',
    isOwned: false,
    steamOwned: false,
    shareWithHousehold: false,
    playtimeMinutes: 0,
    request: null,
  };
  let added: typeof game | undefined;
  let removed = false;
  let writes = 0;
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/api/v1/**', (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.slice('/api/v1'.length);
    if (path === '/game-library/4' && request.method() === 'PATCH') {
      const body = request.postDataJSON();
      expect(body).toMatchObject({
        status: 'playing',
        isOwned: true,
        shareWithHousehold: true,
      });
      Object.assign(game, body);
      writes++;
      return route.fulfill({ json: { entry: game } });
    }
    if (path === '/game-library/manual' && request.method() === 'POST') {
      const body = request.postDataJSON();
      expect(body).toMatchObject({
        title: 'Manual Fixture',
        category: 'game',
        shareWithHousehold: false,
      });
      added = { ...game, ...body, id: 5, catalogId: null };
      writes++;
      return route.fulfill({ status: 201, json: { entry: added } });
    }
    if (path === '/game-library/5' && request.method() === 'DELETE') {
      removed = true;
      added = undefined;
      writes++;
      return route.fulfill({ status: 204 });
    }
    if (path === '/game-library') {
      const results = [game, ...(added ? [added] : [])];
      return route.fulfill({
        json: { results, total: results.length, nextOffset: null },
      });
    }
    if (path === '/game-library/shared') {
      expect(url.searchParams.get('minOwners')).toBe('2');
      return route.fulfill({
        json: {
          total: 1,
          nextOffset: null,
          results: [
            {
              key: 'household',
              title: 'Shared Fixture',
              category: 'game',
              catalogId: 22,
              playtimeMinutes: 60,
              owners: [
                { id: 2, displayName: 'Friend' },
                { id: 3, displayName: 'Neighbour' },
              ],
            },
          ],
        },
      });
    }
    return route.fulfill({
      json:
        path === '/auth/me'
          ? { id: 1, displayName: 'Player', permissions: 32 }
          : path === '/settings/public'
            ? {
                softwareEnabled: true,
                enabledMediaCategories: { game: true },
              }
            : path === '/user/1/settings/main'
              ? { enabledMediaCategories: { game: true } }
              : {},
    });
  });

  await page.goto(appPath('/me'));
  await page.getByRole('link', { name: 'Open My Games' }).click();
  await expect(page.getByRole('link', { name: game.title })).toHaveAttribute(
    'href',
    appPath('/game/retro/41')
  );
  await page.getByRole('button', { name: 'Edit Private Fixture' }).click();
  const share = page.getByLabel('Share With Household');
  await expect(share).toBeDisabled();
  await page.getByLabel('Owned', { exact: true }).check();
  await share.check();
  await page
    .getByRole('heading', { name: 'Edit Private Fixture' })
    .locator('..')
    .getByLabel('Progress')
    .selectOption('playing');
  await page.getByRole('button', { name: 'Save Changes' }).click();
  await expect(page.getByText('Owned · Shared with household')).toBeVisible();

  await page.getByRole('button', { name: 'Add a Game' }).click();
  await page.getByLabel('Game Title').fill('Manual Fixture');
  await page.getByRole('button', { name: 'Add Game', exact: true }).click();
  await page.getByRole('button', { name: 'Edit Manual Fixture' }).click();
  await page.getByRole('button', { name: 'Remove Game' }).click();
  expect(removed).toBe(false);
  await page.getByRole('button', { name: 'Confirm Removal' }).click();
  await expect(
    page.getByRole('button', { name: 'Edit Manual Fixture' })
  ).toHaveCount(0);
  expect(removed).toBe(true);

  await page.getByRole('link', { name: 'Household Games' }).click();
  await expect(
    page.getByRole('link', { name: 'Shared Fixture' })
  ).toHaveAttribute('href', appPath('/game/game/22'));
  await expect(page.getByText('Private Fixture')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Add a Game' })).toHaveCount(0);
  expect(writes).toBe(3);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth)
  ).toBeLessThanOrEqual(page.viewportSize()!.width);
});

test('catalogue matching saves the chosen identity with the current game edits', async ({
  page,
}) => {
  const game = {
    id: 8,
    title: 'Unmatched Game',
    category: 'game',
    catalogId: null as number | null,
    status: 'backlog',
    isOwned: false,
    steamOwned: true,
    shareWithHousehold: false,
    storeName: '',
    platformName: '',
    playtimeMinutes: 5,
    request: null,
  };
  let attempts = 0;
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/api/v1/**', (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.slice('/api/v1'.length);
    if (path === '/request/software/catalog/search') {
      expect(Object.fromEntries(url.searchParams)).toEqual({
        category: 'game',
        q: 'Unmatched Game',
        limit: '8',
      });
      return route.fulfill({
        json: {
          results: [
            { igdbId: 57, title: 'Correct Game', releaseDate: '2020-01-01' },
            { igdbId: 58, title: 'Other Game' },
            { catalogId: '58', title: 'DAT Only Game' },
          ],
        },
      });
    }
    if (path === '/game-library/8/match') {
      expect(request.method()).toBe('POST');
      expect(request.postDataJSON()).toMatchObject({
        category: 'game',
        catalogId: 57,
        status: 'playing',
        shareWithHousehold: true,
      });
      if (++attempts === 1) return route.fulfill({ status: 503, json: {} });
      Object.assign(game, { catalogId: 57, title: 'Correct Game' });
      return route.fulfill({ json: { entry: game } });
    }
    return route.fulfill({
      json:
        path === '/auth/me'
          ? { id: 1, displayName: 'Player', permissions: 32 }
          : path === '/game-library'
            ? { total: 1, nextOffset: null, results: [game] }
            : {},
    });
  });

  await page.goto(appPath('/game-library'));
  await page.getByRole('button', { name: 'Edit Unmatched Game' }).click();
  await page
    .getByRole('heading', { name: 'Edit Unmatched Game' })
    .locator('..')
    .getByLabel('Progress')
    .selectOption('playing');
  await page.getByLabel('Share With Household').check();
  await page.getByRole('button', { name: 'Search Catalogue' }).click();
  const match = page.getByRole('button', { name: 'Link Correct Game' });
  await expect(match).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Link DAT Only Game' })
  ).toHaveCount(0);
  expect(attempts).toBe(0);
  await match.click();
  await expect(
    page.getByText('The server had a problem', { exact: false })
  ).toBeVisible();
  await match.click();
  await expect(
    page.getByRole('link', { name: 'Correct Game' })
  ).toHaveAttribute('href', appPath('/game/game/57'));
  expect(attempts).toBe(2);
});

test('Steam import returns to My Games and refreshes ownership after sync and unlink', async ({
  page,
}) => {
  let connected = false;
  let synced = false;
  let unlinkCount = 0;
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/api/v1/**', (route) => {
    const request = route.request();
    const url = new URL(request.url());
    switch (url.pathname.slice('/api/v1'.length)) {
      case '/auth/me':
        return route.fulfill({
          json: { id: 1, displayName: 'Player', permissions: 32 },
        });
      case '/game-library/steam/status':
        return route.fulfill({
          json: {
            connected,
            apiKeyConfigured: true,
            lastSyncedAt: synced ? '2026-11-17T00:00:00Z' : null,
            lastSyncCount: synced ? 1 : 0,
          },
        });
      case '/game-library/steam/connect':
        expect(url.searchParams.get('frontend')).toBe(
          process.env.LUMEN_TEST_MOUNT ? 'bundled-lumen' : 'companion-lumen'
        );
        connected = true;
        return route.fulfill({
          status: 302,
          headers: { location: appPath('/game-library?steam=connected') },
        });
      case '/game-library/steam/sync':
        expect(request.method()).toBe('POST');
        synced = true;
        return route.fulfill({ json: { imported: 1, updated: 0, total: 1 } });
      case '/game-library/steam':
        expect(request.method()).toBe('DELETE');
        unlinkCount++;
        connected = false;
        return route.fulfill({ status: 204 });
      case '/game-library':
        return route.fulfill({
          json: {
            total: synced ? 1 : 0,
            nextOffset: null,
            results: synced
              ? [
                  {
                    id: 6,
                    title: 'Steam Fixture',
                    category: 'game',
                    status: 'backlog',
                    catalogId: null,
                    isOwned: false,
                    steamOwned: connected,
                    shareWithHousehold: false,
                    storeName: 'Steam',
                    platformName: 'PC',
                    playtimeMinutes: 8,
                    request: null,
                  },
                ]
              : [],
          },
        });
      default:
        return route.fulfill({ json: {} });
    }
  });

  await page.goto(appPath('/game-library'));
  await page.getByText('Steam Library Import', { exact: true }).click();
  await page.getByRole('link', { name: 'Link Steam Account' }).click();
  await expect(
    page.getByText('Steam account linked. Sync to import your games.')
  ).toBeVisible();
  await page.getByRole('button', { name: 'Sync Steam Library' }).click();
  const entry = page.getByRole('listitem').filter({ hasText: 'Steam Fixture' });
  await expect(
    entry.getByText('Owned on Steam', { exact: false })
  ).toBeVisible();

  await page.getByRole('button', { name: 'Unlink Steam' }).click();
  expect(unlinkCount).toBe(0);
  await page.getByRole('button', { name: 'Confirm Unlink' }).click();
  await expect(
    entry.getByText('Not marked owned', { exact: false })
  ).toBeVisible();
  expect(unlinkCount).toBe(1);
});

test('My Games follows the selected Lumen locale', async ({
  page,
}, testInfo) => {
  const locale = process.env.LUMEN_TEST_LOCALE ?? 'en';
  const labels = {
    en: {
      title: 'My Games',
      private: 'Private Library',
      type: 'Game Type',
      add: 'Add a Game',
      titleField: 'Game Title',
      progress: 'Progress',
      save: 'Add Game',
    },
    fr: {
      title: 'Mes jeux',
      private: 'Bibliothèque privée',
      type: 'Type de jeu',
      add: 'Ajouter un jeu',
      titleField: 'Titre du jeu',
      progress: 'Progression',
      save: 'Ajouter le jeu',
    },
    ar: {
      title: 'ألعابي',
      private: 'المكتبة الخاصة',
      type: 'نوع اللعبة',
      add: 'أضف لعبة',
      titleField: 'عنوان اللعبة',
      progress: 'التقدم',
      save: 'إضافة اللعبة',
    },
  } as const;
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname.slice(
      '/api/v1'.length
    );
    return route.fulfill({
      json:
        path === '/auth/me'
          ? { id: 1, displayName: 'Player', permissions: 32 }
          : path === '/user/1/settings/main'
            ? { locale, enabledMediaCategories: { game: true } }
            : path === '/game-library'
              ? { results: [], total: 0, nextOffset: null }
              : {},
    });
  });
  await page.goto(appPath('/game-library'));
  await expect(
    page.getByRole('heading', { name: labels[locale].title })
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: labels[locale].private })
  ).toBeVisible();
  await expect(
    page.getByText(labels[locale].type, { exact: true })
  ).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', locale);
  await expect(page.locator('html')).toHaveAttribute(
    'dir',
    locale === 'ar' ? 'rtl' : 'ltr'
  );
  const captureDirectory = process.env.LUMEN_CAPTURE_DIR;
  if (
    captureDirectory &&
    ['fr', 'ar'].includes(locale) &&
    ['desktop', 'iphone'].includes(testInfo.project.name)
  ) {
    const { mkdirSync } = await import('node:fs');
    mkdirSync(captureDirectory, { recursive: true });
    await page.screenshot({
      path: `${captureDirectory}/game-library-${locale}-${testInfo.project.name}.png`,
      fullPage: true,
    });
  }
  await page.getByRole('button', { name: labels[locale].add }).click();
  await expect(
    page.getByRole('heading', { name: labels[locale].add })
  ).toBeVisible();
  await expect(page.getByLabel(labels[locale].titleField)).toBeVisible();
  await expect(page.getByLabel(labels[locale].progress).last()).toBeVisible();
  await expect(
    page.getByRole('button', { name: labels[locale].save, exact: true })
  ).toBeVisible();
  if (
    captureDirectory &&
    ['fr', 'ar'].includes(locale) &&
    ['desktop', 'iphone'].includes(testInfo.project.name)
  ) {
    await page.screenshot({
      path: `${captureDirectory}/game-library-${locale}-${testInfo.project.name}-editor.png`,
      fullPage: true,
    });
  }
});
