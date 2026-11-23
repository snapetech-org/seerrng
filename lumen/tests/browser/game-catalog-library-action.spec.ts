import { expect, test, type Page } from '@playwright/test';

const mount = process.env.LUMEN_TEST_MOUNT === '/lumen' ? '/lumen' : '';
const appPath = (path: string) => `${mount}${path}`;
const apiPath = (url: string) =>
  new URL(url).pathname.replace(/^\/lumen(?=\/)/, '').slice('/api/v1'.length);

type FixtureMode = 'empty' | 'existing' | 'lookup-fails' | 'add-fails' | 'dat';

async function openGame(page: Page, mode: FixtureMode, locale = 'fr') {
  let entry = mode === 'existing' ? { id: 8 } : null;
  let lookupFailures = mode === 'lookup-fails' ? 1 : 0;
  let addFailures = ['lookup-fails', 'add-fails'].includes(mode) ? 1 : 0;
  const adds: unknown[] = [];
  const lookups: string[] = [];
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = apiPath(request.url());
    if (path === '/auth/me')
      return route.fulfill({
        json: { id: 1, displayName: 'Player', permissions: 0 },
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
    if (path.startsWith('/request/software/catalog/popular'))
      return route.fulfill({ json: { results: [] } });
    if (path.startsWith('/request/software/catalog/games/'))
      return route.fulfill({
        json: {
          game:
            mode === 'dat'
              ? {
                  title: 'Fixture DAT Game',
                  catalogId: 'dat-123',
                  catalogProvider: 'dat',
                  genres: [],
                  platforms: [],
                  emulationSystems: [
                    { slug: 'nes', name: 'NES', group: 'retro' },
                  ],
                }
              : {
                  title: 'Fixture Catalogue Game',
                  catalogId: '42',
                  catalogProvider: 'igdb',
                  igdbId: 42,
                  genres: [],
                  platforms: [],
                  emulationSystems: [
                    { slug: 'nes', name: 'NES', group: 'retro' },
                  ],
                },
        },
      });
    if (path === '/game-library/lookup') {
      lookups.push(url.search);
      expect(url.searchParams.get('category')).toBe('retro');
      expect(url.searchParams.get('catalogId')).toBe('42');
      if (lookupFailures > 0) {
        lookupFailures--;
        return route.fulfill({
          status: 503,
          json: { error: 'The library could not be checked.' },
        });
      }
      return route.fulfill({ json: { entry } });
    }
    if (path === '/game-library' && request.method() === 'POST') {
      const body = request.postDataJSON();
      adds.push(body);
      expect(body).toEqual({ category: 'retro', catalogId: 42 });
      if (addFailures > 0) {
        addFailures--;
        return route.fulfill({
          status: 502,
          json: { error: 'The game catalogue could not confirm this title.' },
        });
      }
      entry = { id: 8 };
      return route.fulfill({ json: { entry } });
    }
    if (path === '/game-library')
      return route.fulfill({
        json: {
          total: entry ? 1 : 0,
          nextOffset: null,
          results: entry
            ? [
                {
                  id: entry.id,
                  title: 'Fixture Catalogue Game',
                  category: 'retro',
                  catalogId: 42,
                  status: 'backlog',
                  isOwned: false,
                  steamOwned: false,
                  shareWithHousehold: false,
                  storeName: '',
                  platformName: '',
                  playtimeMinutes: 0,
                  request: null,
                },
              ]
            : [],
        },
      });
    return route.fulfill({ json: { results: [] } });
  });
  await page.goto(
    mode === 'dat'
      ? appPath('/game/retro/dat-123?dat=1')
      : appPath('/game/retro/42')
  );
  await expect(
    page.getByRole('heading', {
      name: mode === 'dat' ? 'Fixture DAT Game' : 'Fixture Catalogue Game',
    })
  ).toBeVisible();
  return { adds, lookups };
}

test('a signed-in user can add an IGDB game to My Games without request access', async ({
  page,
}, info) => {
  const { adds, lookups } = await openGame(page, 'empty');
  const captureDir = process.env.LUMEN_GAME_LIBRARY_CAPTURE_DIR;
  const capture = async (label: string) => {
    if (captureDir && ['desktop', 'iphone'].includes(info.project.name))
      await page.screenshot({
        path: `${captureDir}/${label}-${info.project.name}.png`,
        fullPage: true,
      });
  };
  if (process.env.LUMEN_GAME_LIBRARY_BASELINE === '1') {
    await expect(
      page.getByRole('button', { name: /Mes jeux|My Games/ })
    ).toHaveCount(0);
    await capture('baseline');
    return;
  }
  const add = page.getByRole('button', { name: 'Ajouter à Mes jeux' });
  await expect(
    page.getByRole('region', { name: 'Bibliothèque de jeux privée' })
  ).toBeVisible();
  await expect(add).toBeVisible();
  await capture('candidate');
  await expect(page.getByRole('button', { name: 'Request' })).toHaveCount(0);
  await add.click();
  await expect(
    page.getByRole('button', { name: 'Déjà dans Mes jeux' })
  ).toBeDisabled();
  await expect(
    page.getByRole('status').getByText(/Ajouté à votre bibliothèque privée/)
  ).toBeVisible();
  expect(adds).toEqual([{ category: 'retro', catalogId: 42 }]);
  await expect.poll(() => lookups.length).toBeGreaterThan(1);
  await page.getByRole('link', { name: 'Ouvrir Mes jeux' }).click();
  await expect(page).toHaveURL(/\/game-library\?c=retro$/);
  await expect(
    page.getByRole('link', { name: 'Fixture Catalogue Game' })
  ).toBeVisible();
});

for (const [locale, libraryLabel] of [
  ['fr', 'Bibliothèque de jeux privée'],
  ['ar', 'مكتبة الألعاب الخاصة'],
]) {
  test(`private game library region uses ${locale}`, async ({ page }, info) => {
    await openGame(page, 'empty', locale);
    await expect(
      page.getByRole('region', { name: libraryLabel, exact: true })
    ).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth)
    ).toBeLessThanOrEqual(page.viewportSize()!.width);
    if (['desktop', 'iphone'].includes(info.project.name))
      await page.screenshot({
        path: info.outputPath(`private-game-library-${locale}.png`),
        fullPage: true,
      });
  });
}

test('an existing catalogue game links to its library entry', async ({
  page,
}) => {
  const { adds } = await openGame(page, 'existing');
  await expect(
    page.getByRole('button', { name: 'Déjà dans Mes jeux' })
  ).toBeDisabled();
  await expect(
    page.getByRole('link', { name: 'Ouvrir Mes jeux' })
  ).toHaveAttribute('href', appPath('/game-library?c=retro'));
  expect(adds).toEqual([]);
});

test('library lookup and add failures can be retried without losing the game', async ({
  page,
}) => {
  const { adds } = await openGame(page, 'lookup-fails');
  await expect(page.getByRole('alert')).toContainText(
    'Impossible de vérifier Mes jeux.'
  );
  await page.getByRole('button', { name: 'Réessayer la vérification' }).click();
  const add = page.getByRole('button', { name: 'Ajouter à Mes jeux' });
  await expect(add).toBeVisible();
  await add.click();
  await expect(page.getByRole('alert')).toBeVisible();
  await page.getByRole('button', { name: 'Ajouter à Mes jeux' }).click();
  await expect(
    page.getByRole('button', { name: 'Déjà dans Mes jeux' })
  ).toBeDisabled();
  expect(adds).toEqual([
    { category: 'retro', catalogId: 42 },
    { category: 'retro', catalogId: 42 },
  ]);
});

test('DAT catalogue games do not expose IGDB-only library linking', async ({
  page,
}) => {
  const { adds, lookups } = await openGame(page, 'dat');
  await expect(
    page.getByRole('button', { name: /Mes jeux|My Games/ })
  ).toHaveCount(0);
  expect(adds).toEqual([]);
  expect(lookups).toEqual([]);
});
