import { expect, test } from '@playwright/test';

const appPath = (path: string) =>
  `${process.env.LUMEN_TEST_MOUNT ? '/lumen' : ''}${path}`;
const apiPath = (pathname: string) =>
  pathname.replace(/^\/lumen(?=\/)/, '').slice('/api/v1'.length);

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
    const path = apiPath(url.pathname);
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
              ownerCount: 2,
              owners: [
                {
                  id: 2,
                  displayName: 'Friend',
                  status: 'playing',
                  storeName: 'Steam',
                  platformName: 'Windows',
                  playtimeMinutes: 45,
                },
                {
                  id: 3,
                  displayName: 'Neighbour',
                  status: 'completed',
                  storeName: 'GOG',
                  platformName: 'Linux',
                  playtimeMinutes: 15,
                },
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

  await page
    .locator(`a[href="${appPath('/game-library?view=shared')}"]`)
    .click();
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

test('My Games exposes request and catalog actions from private and shared games', async ({
  page,
}, testInfo) => {
  const locale = process.env.LUMEN_GAME_LIBRARY_REQUEST_LOCALE ?? 'en';
  const labels = {
    en: {
      request: 'Request this game',
      catalog: 'Open in catalog',
      ownerCount: 'Owner Count: 2',
      sharedBy: 'Shared by Friend, Neighbour',
      requestStatus: 'Request: Downloading',
      requestHistory: 'Request History',
      friend: 'Friend: Playing · Steam · Windows · 80 minutes played',
      neighbour: 'Neighbour: Completed · GOG · Linux · 125 minutes played',
    },
    fr: {
      request: 'Demander ce jeu',
      catalog: 'Ouvrir dans le catalogue',
      ownerCount: 'Nombre de propriétaires: 2',
      sharedBy: 'Partagé par Friend, Neighbour',
      requestStatus: 'Demande: Téléchargement en cours',
      requestHistory: 'Historique des demandes',
      friend: 'Friend: En cours · Steam · Windows · 80 minutes jouées',
      neighbour: 'Neighbour: Terminé · GOG · Linux · 125 minutes jouées',
    },
    ar: {
      request: 'اطلب هذه اللعبة',
      catalog: 'افتح في الكتالوج',
      ownerCount: 'عدد المالكين: ٢',
      sharedBy: 'تمت المشاركة بواسطة Friend, Neighbour',
      requestStatus: 'الطلب: جارٍ التنزيل',
      requestHistory: 'سجل الطلبات',
      friend: 'Friend: قيد اللعب · Steam · Windows · ٨٠ دقيقة لعب',
      neighbour: 'Neighbour: مكتملة · GOG · Linux · ١٢٥ دقيقة لعب',
    },
  } as const;
  const copy = labels[locale as keyof typeof labels] ?? labels.en;
  const entries = [
    {
      id: 41,
      title: 'Catalog Game',
      category: 'retro',
      catalogId: 41,
      status: 'backlog',
      isOwned: true,
      steamOwned: false,
      shareWithHousehold: true,
      storeName: '',
      platformName: '',
      playtimeMinutes: 0,
      request: { id: 41, status: 'downloading' },
    },
    {
      id: 42,
      title: 'Manual Game',
      category: 'modern',
      catalogId: null,
      status: 'backlog',
      isOwned: false,
      steamOwned: false,
      shareWithHousehold: false,
      storeName: '',
      platformName: '',
      playtimeMinutes: 0,
      request: null,
    },
  ];
  const shared = [
    {
      key: 'catalog',
      title: 'Shared Catalog Game',
      category: 'game',
      catalogId: 22,
      playtimeMinutes: 0,
      ownerCount: 2,
      owners: [
        {
          id: 2,
          displayName: 'Friend',
          status: 'playing',
          storeName: 'Steam',
          platformName: 'Windows',
          playtimeMinutes: 80,
        },
        {
          id: 3,
          displayName: 'Neighbour',
          status: 'completed',
          storeName: 'GOG',
          platformName: 'Linux',
          playtimeMinutes: 125,
        },
      ],
    },
    {
      key: 'manual',
      title: 'Shared Manual Game',
      category: 'game',
      catalogId: null,
      playtimeMinutes: 0,
      ownerCount: 1,
      owners: [
        {
          id: 2,
          displayName: 'Friend',
          status: 'playing',
          storeName: '',
          platformName: '',
          playtimeMinutes: 0,
        },
      ],
    },
  ];
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/api/v1/**', (route) => {
    const path = apiPath(new URL(route.request().url()).pathname);
    if (path === '/auth/me')
      return route.fulfill({
        json: { id: 1, displayName: 'Player', permissions: 32 },
      });
    if (path === '/settings/public')
      return route.fulfill({
        json: { softwareEnabled: true, enabledMediaCategories: { game: true } },
      });
    if (path === '/user/1/settings/main')
      return route.fulfill({
        json: { locale, enabledMediaCategories: { game: true } },
      });
    if (path === '/game-library/steam/status')
      return route.fulfill({
        json: {
          connected: false,
          lastSyncedAt: null,
          lastSyncCount: 0,
          apiKeyConfigured: false,
        },
      });
    if (path === '/game-library/shared')
      return route.fulfill({
        json: { results: shared, total: shared.length, nextOffset: null },
      });
    if (path === '/game-library')
      return route.fulfill({
        json: { results: entries, total: entries.length, nextOffset: null },
      });
    return route.fulfill({ json: {} });
  });

  await page.goto(appPath('/game-library'));
  await expect(page.getByText('Catalog Game')).toBeVisible();
  await expect(page.getByText('Manual Game')).toBeVisible();
  await expect(page.getByText(copy.requestStatus)).toBeVisible();
  const captureDirectory = process.env.LUMEN_GAME_LIBRARY_REQUEST_CAPTURE_DIR;
  const capture = async (state: string, gameTitle: string) => {
    await page
      .locator('.set')
      .filter({ hasText: gameTitle })
      .scrollIntoViewIfNeeded();
    if (
      captureDirectory &&
      ['desktop', 'iphone'].includes(testInfo.project.name)
    ) {
      const { mkdirSync } = await import('node:fs');
      mkdirSync(captureDirectory, { recursive: true });
      await page.screenshot({
        path: `${captureDirectory}/${process.env.LUMEN_GAME_LIBRARY_REQUEST_CAPTURE_PHASE}-${state}-${testInfo.project.name}.png`,
        fullPage: true,
      });
      await page.screenshot({
        path: `${captureDirectory}/${process.env.LUMEN_GAME_LIBRARY_REQUEST_CAPTURE_PHASE}-${state}-${testInfo.project.name}-viewport.png`,
      });
    }
  };
  await capture('private', 'Manual Game');
  const requestActions = page.getByRole('link', { name: copy.request });
  await expect.soft(requestActions).toHaveCount(2);
  await expect
    .soft(requestActions.nth(0))
    .toHaveAttribute('href', appPath('/game/retro/41'));
  await expect
    .soft(requestActions.nth(1))
    .toHaveAttribute('href', appPath('/games?c=game&q=Manual+Game'));
  const historyAction = page.getByRole('link', { name: copy.requestHistory });
  await expect(historyAction).toBeVisible();
  const historyBox = await historyAction.boundingBox();
  const requestBox = await requestActions.first().boundingBox();
  expect(historyBox).not.toBeNull();
  expect(requestBox).not.toBeNull();
  expect(
    historyBox!.x + historyBox!.width <= requestBox!.x ||
      requestBox!.x + requestBox!.width <= historyBox!.x ||
      historyBox!.y + historyBox!.height <= requestBox!.y ||
      requestBox!.y + requestBox!.height <= historyBox!.y
  ).toBe(true);

  await page
    .locator(`a[href="${appPath('/game-library?view=shared')}"]`)
    .click();
  await expect(page.getByText('Shared Catalog Game')).toBeVisible();
  await expect(page.getByText('Shared Manual Game')).toBeVisible();
  await expect(page.getByText(copy.ownerCount)).toBeVisible();
  await expect(page.getByText(copy.sharedBy)).toBeVisible();
  await expect(page.getByText(copy.friend)).toBeVisible();
  await expect(page.getByText(copy.neighbour)).toBeVisible();
  await capture('shared', 'Shared Manual Game');
  const catalogActions = page.getByRole('link', { name: copy.catalog });
  await expect.soft(catalogActions).toHaveCount(1);
  await expect
    .soft(catalogActions)
    .toHaveAttribute('href', appPath('/game/game/22'));
  const manualRequest = page.getByRole('link', { name: copy.request });
  await expect.soft(manualRequest).toHaveCount(1);
  await expect
    .soft(manualRequest)
    .toHaveAttribute('href', appPath('/games?c=game&q=Shared+Manual+Game'));
  await catalogActions.click();
  await expect(page).toHaveURL(new RegExp(`${appPath('/game/game/22')}$`));
  await page.goBack();
  await manualRequest.click();
  await expect(page).toHaveURL(
    new URL(`${appPath('/games')}?c=game&q=Shared+Manual+Game`, page.url()).href
  );
});

test('My Games keeps request actions behind request permission', async ({
  page,
}) => {
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/api/v1/**', (route) => {
    const path = apiPath(new URL(route.request().url()).pathname);
    if (path === '/auth/me')
      return route.fulfill({ json: { id: 1, permissions: 16384 } });
    if (path === '/settings/public')
      return route.fulfill({
        json: { softwareEnabled: true, enabledMediaCategories: { game: true } },
      });
    if (path === '/user/1/settings/main')
      return route.fulfill({
        json: { locale: 'en', enabledMediaCategories: { game: true } },
      });
    if (path === '/game-library')
      return route.fulfill({
        json: {
          results: [
            {
              id: 41,
              title: 'Catalog Game',
              category: 'retro',
              catalogId: 41,
              status: 'backlog',
              isOwned: false,
              steamOwned: false,
              shareWithHousehold: false,
              storeName: '',
              platformName: '',
              playtimeMinutes: 0,
              request: null,
            },
          ],
          total: 1,
          nextOffset: null,
        },
      });
    if (path === '/game-library/shared')
      return route.fulfill({
        json: {
          results: [
            {
              key: 'manual',
              title: 'Shared Manual Game',
              category: 'game',
              catalogId: null,
              playtimeMinutes: 0,
              ownerCount: 1,
              owners: [
                {
                  id: 2,
                  displayName: 'Friend',
                  status: 'playing',
                  storeName: '',
                  platformName: '',
                  playtimeMinutes: 0,
                },
              ],
            },
          ],
          total: 1,
          nextOffset: null,
        },
      });
    return route.fulfill({ json: {} });
  });
  await page.goto(appPath('/game-library'));
  await expect(page.getByText('Catalog Game')).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Request this game' })
  ).toHaveCount(0);
  await page.getByRole('link', { name: 'Household Games' }).click();
  await expect(page.getByText('Shared Manual Game')).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Open in catalog' })
  ).toBeVisible();
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
    const path = apiPath(url.pathname);
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
    switch (apiPath(url.pathname)) {
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
      allProgress: 'All Progress',
      allTypes: 'All Types',
      add: 'Add a Game',
      titleField: 'Game Title',
      progress: 'Progress',
      save: 'Add Game',
      progressOptions: [
        'Backlog',
        'Playing',
        'Played',
        'Completed',
        'Paused',
        'Dropped',
      ],
      gameTypeOptions: ['PC games', 'Retro consoles', 'Modern consoles'],
    },
    fr: {
      title: 'Mes jeux',
      private: 'Bibliothèque privée',
      type: 'Type de jeu',
      allProgress: 'Toute progression',
      allTypes: 'Tous les types',
      add: 'Ajouter un jeu',
      titleField: 'Titre du jeu',
      progress: 'Progression',
      save: 'Ajouter le jeu',
      progressOptions: [
        'À faire',
        'En cours',
        'Joué',
        'Terminé',
        'En pause',
        'Abandonné',
      ],
      gameTypeOptions: ['Jeux PC', 'Consoles rétro', 'Consoles modernes'],
    },
    ar: {
      title: 'ألعابي',
      private: 'المكتبة الخاصة',
      type: 'نوع اللعبة',
      allProgress: 'كل التقدم',
      allTypes: 'كل الأنواع',
      add: 'أضف لعبة',
      titleField: 'عنوان اللعبة',
      progress: 'التقدم',
      save: 'إضافة اللعبة',
      progressOptions: [
        'قائمة الانتظار',
        'قيد اللعب',
        'تم لعبها',
        'مكتملة',
        'متوقفة مؤقتًا',
        'متروكة',
      ],
      gameTypeOptions: [
        'ألعاب الكمبيوتر',
        'أجهزة ألعاب قديمة',
        'أجهزة ألعاب حديثة',
      ],
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
  await expect(
    page.getByLabel(labels[locale].progress).locator('option')
  ).toHaveText([labels[locale].allProgress, ...labels[locale].progressOptions]);
  await expect(
    page.getByLabel(labels[locale].type).locator('option')
  ).toHaveText([labels[locale].allTypes, ...labels[locale].gameTypeOptions]);
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
  const progress = page.getByLabel(labels[locale].progress).last();
  await expect(progress).toBeVisible();
  await progress.evaluate((element) =>
    element.scrollIntoView({ block: 'end', behavior: 'instant' })
  );
  if ((page.viewportSize()?.width ?? 1440) < 1040) {
    const field = await progress.boundingBox();
    const tabbar = await page.locator('.tabbar').boundingBox();
    expect(field).not.toBeNull();
    expect(tabbar).not.toBeNull();
    expect(field!.y + field!.height).toBeLessThanOrEqual(tabbar!.y);
  }
  const save = page.getByRole('button', {
    name: labels[locale].save,
    exact: true,
  });
  await expect(save).toBeVisible();
  await save.evaluate((element) =>
    element.scrollIntoView({ block: 'end', behavior: 'instant' })
  );
  if ((page.viewportSize()?.width ?? 1440) < 1040) {
    const button = await save.boundingBox();
    const tabbar = await page.locator('.tabbar').boundingBox();
    expect(button).not.toBeNull();
    expect(tabbar).not.toBeNull();
    expect(button!.y + button!.height).toBeLessThanOrEqual(tabbar!.y);
  }
  if (
    captureDirectory &&
    ['fr', 'ar'].includes(locale) &&
    ['desktop', 'iphone'].includes(testInfo.project.name)
  ) {
    await page.screenshot({
      path: `${captureDirectory}/game-library-${locale}-${testInfo.project.name}-editor.png`,
    });
  }
});

for (const locale of ['en', 'fr', 'ar'] as const) {
  test(`game removal actions follow the account locale in ${locale}`, async ({
    page,
  }, testInfo) => {
    const labels = {
      en: {
        edit: 'Edit Parity Fixture',
        remove: 'Remove Game',
        confirm: 'Confirm Removal',
      },
      fr: {
        edit: 'Modifier Parity Fixture',
        remove: 'Supprimer le jeu',
        confirm: 'Confirmer la suppression',
      },
      ar: {
        edit: 'تعديل Parity Fixture',
        remove: 'إزالة اللعبة',
        confirm: 'تأكيد الإزالة',
      },
    } as const;
    const entry = {
      id: 5,
      title: 'Parity Fixture',
      status: 'backlog',
      category: 'game',
      catalogId: null,
      storeName: '',
      platformName: '',
      isOwned: false,
      steamOwned: false,
      shareWithHousehold: false,
      playtimeMinutes: 0,
      request: null,
    };
    const isBaseline = process.env.LUMEN_GAME_LIBRARY_BASELINE === 'true';
    const expected = isBaseline
      ? { remove: 'Remove Game', confirm: 'Confirm Removal' }
      : labels[locale];
    await page.route('https://**/*', (route) => route.abort());
    await page.route('**/api/v1/**', (route) => {
      const path = apiPath(new URL(route.request().url()).pathname);
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
                ? { locale, enabledMediaCategories: { game: true } }
                : path === '/game-library'
                  ? { results: [entry], total: 1, nextOffset: null }
                  : {},
      });
    });
    await page.goto(appPath('/game-library'));
    await page.getByRole('button', { name: labels[locale].edit }).click();
    await page.getByRole('button', { name: expected.remove }).click();
    await expect(
      page.getByRole('button', { name: expected.confirm })
    ).toBeVisible();

    const captureDirectory = process.env.LUMEN_GAME_LIBRARY_REMOVE_CAPTURE;
    if (
      captureDirectory &&
      ['desktop', 'iphone'].includes(testInfo.project.name)
    ) {
      const { mkdirSync } = await import('node:fs');
      mkdirSync(captureDirectory, { recursive: true });
      await page.screenshot({
        path: `${captureDirectory}/${isBaseline ? 'baseline' : 'candidate'}-${locale}-${testInfo.project.name}.png`,
        fullPage: true,
      });
    }
  });
}
