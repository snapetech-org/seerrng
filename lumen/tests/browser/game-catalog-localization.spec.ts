import { expect, test, type Page } from '@playwright/test';

const locale = ['en', 'fr', 'ar'].includes(
  process.env.LUMEN_GAME_CATALOG_LOCALE ?? ''
)
  ? (process.env.LUMEN_GAME_CATALOG_LOCALE as 'en' | 'fr' | 'ar')
  : 'en';

const copy = {
  en: {
    title: 'Games',
    pcHint: 'PC games. Pick your system when you request.',
    finder: 'Game Finder',
    hacks: 'Translations and Hacks',
    myGames: 'My Games',
    platform: 'Platform',
    pc: 'PC games',
    retro: 'Retro consoles',
    modern: 'Modern consoles',
    searchPc: 'Search PC games…',
    searchRetro: 'Search retro games…',
    noGames: 'No games found',
    tryTitle: 'Try the game’s full title.',
  },
  fr: {
    title: 'Jeux',
    pcHint: 'Jeux PC. Choisissez votre système lors de la demande.',
    finder: 'Recherche de jeux',
    hacks: 'Traductions et modifications',
    myGames: 'Mes jeux',
    platform: 'Plateforme',
    pc: 'Jeux PC',
    retro: 'Consoles rétro',
    modern: 'Consoles modernes',
    searchPc: 'Rechercher des jeux PC…',
    searchRetro: 'Rechercher des jeux rétro…',
    noGames: 'Aucun jeu trouvé',
    tryTitle: 'Essayez le titre complet du jeu.',
  },
  ar: {
    title: 'الألعاب',
    pcHint: 'ألعاب الكمبيوتر. اختر نظام التشغيل عند تقديم الطلب.',
    finder: 'مستكشف الألعاب',
    hacks: 'الترجمات والتعديلات',
    myGames: 'ألعابي',
    platform: 'المنصة',
    pc: 'ألعاب الكمبيوتر',
    retro: 'أجهزة ألعاب قديمة',
    modern: 'أجهزة ألعاب حديثة',
    searchPc: 'ابحث عن ألعاب الكمبيوتر…',
    searchRetro: 'ابحث عن ألعاب قديمة…',
    noGames: 'لم يتم العثور على ألعاب',
    tryTitle: 'جرّب كتابة اسم اللعبة كاملاً.',
  },
}[locale];

test('Games catalog controls and empty state follow the saved locale', async ({
  page,
}, info) => {
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname
      .replace(/^\/lumen(?=\/)/, '')
      .slice('/api/v1'.length);
    if (path === '/auth/me')
      return route.fulfill({
        json: { id: 1, displayName: 'Player', permissions: 2 },
      });
    if (path === '/user/1/settings/main')
      return route.fulfill({
        json: {
          locale,
          enabledMediaCategories: { game: true, retro: true, modern: true },
        },
      });
    if (path === '/settings/public')
      return route.fulfill({
        json: {
          softwareEnabled: true,
          romarrEnabled: true,
          enabledMediaCategories: { game: true, retro: true, modern: true },
        },
      });
    if (path.startsWith('/request/software/catalog/popular')) {
      const url = new URL(request.url());
      if (url.searchParams.get('limit') === '1')
        return route.fulfill({ json: { results: [] } });
      return route.fulfill({
        json: {
          results: [
            {
              id: 'fixture-game',
              title: 'Fixture Game',
              catalogId: '42',
              catalogProvider: 'igdb',
              igdbId: 42,
              coverUrl: null,
              releaseDate: '2025-01-01',
              genres: ['Adventure'],
            },
          ],
          nextOffset: null,
        },
      });
    }
    if (path.startsWith('/request/software/catalog/search'))
      return route.fulfill({ json: { results: [], nextCursor: null } });
    return route.fulfill({ json: { results: [] } });
  });

  await page.goto('/games');
  await expect(page.getByRole('heading', { name: copy.title })).toBeVisible();
  await expect(page.getByText(copy.pcHint)).toBeVisible();
  await expect(page.getByRole('link', { name: copy.finder })).toHaveAttribute(
    'href',
    '/games/discovery'
  );
  await expect(page.getByRole('link', { name: copy.hacks })).toHaveAttribute(
    'href',
    '/patches'
  );
  await expect(page.getByRole('link', { name: copy.myGames })).toHaveAttribute(
    'href',
    '/game-library'
  );
  await expect(page.getByRole('group', { name: copy.platform })).toBeVisible();
  await expect(page.getByRole('button', { name: copy.pc })).toBeVisible();
  await expect(page.getByRole('button', { name: copy.retro })).toBeVisible();
  await expect(page.getByRole('button', { name: copy.modern })).toBeVisible();
  await expect(page.getByPlaceholder(copy.searchPc)).toBeVisible();
  await expect(page.getByPlaceholder(copy.searchPc)).toHaveAttribute(
    'placeholder',
    copy.searchPc
  );
  await expect(page.getByText('Fixture Game')).toBeVisible();
  expect(await page.locator('html').getAttribute('dir')).toBe(
    locale === 'ar' ? 'rtl' : 'ltr'
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    )
  ).toBe(true);

  const captureDirectory = process.env.LUMEN_GAME_CATALOG_CAPTURE_DIR;
  if (captureDirectory)
    await page.screenshot({
      path: `${captureDirectory}/${locale}-${info.project.name}.png`,
      fullPage: true,
    });

  await page.getByRole('button', { name: copy.retro }).click();
  await expect(page.getByPlaceholder(copy.searchRetro)).toBeVisible();
  await expect(page.getByPlaceholder(copy.searchRetro)).toHaveAttribute(
    'placeholder',
    copy.searchRetro
  );
  await page.getByPlaceholder(copy.searchRetro).fill('missing title');
  await expect(page.getByText(copy.noGames)).toBeVisible();
  await expect(page.getByText(copy.tryTitle)).toBeVisible();
  await expect(page).toHaveURL(/\/games\?c=retro&q=missing\+title$/);
});

const detailCopy = {
  en: {
    system: 'System',
    build: 'Build',
    choose: 'Choose…',
    request: 'Request',
  },
  fr: {
    system: 'Système',
    build: 'Architecture',
    choose: 'Choisir…',
    request: 'Demander',
  },
  ar: {
    system: 'نظام التشغيل',
    build: 'البنية',
    choose: 'اختر…',
    request: 'طلب',
  },
}[locale];

test('Game detail request controls follow the saved locale', async ({
  page,
}, info) => {
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname
      .replace(/^\/lumen(?=\/)/, '')
      .slice('/api/v1'.length);
    if (path === '/auth/me')
      return route.fulfill({
        json: { id: 1, displayName: 'Player', permissions: 2 },
      });
    if (path === '/user/1/settings/main')
      return route.fulfill({ json: { locale } });
    if (path === '/settings/public')
      return route.fulfill({
        json: {
          softwareEnabled: true,
          romarrEnabled: true,
          enabledMediaCategories: { game: true, retro: true, modern: true },
        },
      });
    if (path.startsWith('/request/software/catalog/games/'))
      return route.fulfill({
        json: {
          game: {
            title: 'Fixture Detail Game',
            catalogId: '42',
            catalogProvider: 'steam',
            coverUrl: null,
            releaseDate: '2025-01-01',
            genres: [],
            platforms: ['Windows'],
          },
        },
      });
    return route.fulfill({ json: { results: [] } });
  });

  await page.goto('/game/game/42');
  await expect(
    page.getByRole('heading', { name: 'Fixture Detail Game' })
  ).toBeVisible();
  const captureDirectory = process.env.LUMEN_GAME_DETAIL_FORM_CAPTURE_DIR;
  if (captureDirectory && ['desktop', 'iphone'].includes(info.project.name))
    await page.screenshot({
      path: `${captureDirectory}/${info.project.name}.png`,
      fullPage: true,
    });
  if (process.env.LUMEN_GAME_DETAIL_FORM_BASELINE === '1') {
    await expect(page.getByLabel('System')).toBeVisible();
    await expect(page.getByLabel('Build')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Request' })).toBeVisible();
    return;
  }
  await expect(page.getByLabel(detailCopy.system)).toBeVisible();
  await expect(page.getByLabel(detailCopy.build)).toBeVisible();
  await expect(
    page.getByLabel(detailCopy.system).locator('option').first()
  ).toHaveText(detailCopy.choose);
  await expect(
    page.getByLabel(detailCopy.build).locator('option').first()
  ).toHaveText(detailCopy.choose);
  await expect(
    page.getByRole('button', { name: detailCopy.request })
  ).toBeVisible();
});

const consoleCopy = {
  en: {
    label: 'Console',
    patches: 'Translations and Hacks for This Game',
    unsupported:
      'This game isn’t listed for any modern console this server supports.',
  },
  fr: {
    label: 'Console',
    patches: 'Traductions et modifications pour ce jeu',
    unsupported:
      'Ce jeu ne figure dans aucune console moderne prise en charge par ce serveur.',
  },
  ar: {
    label: 'جهاز الألعاب',
    patches: 'ترجمات وتعديلات هذه اللعبة',
    unsupported: 'هذه اللعبة غير مدرجة لأي جهاز ألعاب حديث يدعمه هذا الخادم.',
  },
}[locale];

async function openConsoleGame(
  page: Page,
  category: 'retro' | 'modern',
  systems: { slug: string; name: string; group: 'retro' | 'modern' }[]
) {
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname
      .replace(/^\/lumen(?=\/)/, '')
      .slice('/api/v1'.length);
    if (path === '/auth/me')
      return route.fulfill({
        json: { id: 1, displayName: 'Player', permissions: 2 },
      });
    if (path === '/user/1/settings/main')
      return route.fulfill({ json: { locale } });
    if (path === '/settings/public')
      return route.fulfill({
        json: {
          softwareEnabled: true,
          romarrEnabled: true,
          enabledMediaCategories: { game: true, retro: true, modern: true },
        },
      });
    if (path.startsWith('/request/software/catalog/games/'))
      return route.fulfill({
        json: {
          game: {
            title: 'Fixture Console Game',
            catalogId: '42',
            catalogProvider: 'igdb',
            coverUrl: null,
            releaseDate: '1992-01-01',
            genres: [],
            platforms: ['SNES'],
            emulationSystems: systems,
          },
        },
      });
    return route.fulfill({ json: { results: [] } });
  });
  await page.goto(`/game/${category}/42`);
  await expect(
    page.getByRole('heading', { name: 'Fixture Console Game' })
  ).toBeVisible();
}

test('Console game request controls follow the saved locale', async ({
  page,
}) => {
  await openConsoleGame(page, 'retro', [
    { slug: 'snes', name: 'Super Nintendo', group: 'retro' },
  ]);
  await expect(page.getByLabel(consoleCopy.label)).toBeVisible();
  await expect(
    page.getByRole('link', { name: consoleCopy.patches })
  ).toHaveAttribute('href', /\/patches\?/);
  await expect(
    page.getByRole('button', { name: detailCopy.request })
  ).toBeVisible();
});

test('Unsupported console state follows the saved locale', async ({ page }) => {
  await openConsoleGame(page, 'modern', []);
  await expect(page.getByText(consoleCopy.unsupported)).toBeVisible();
});
