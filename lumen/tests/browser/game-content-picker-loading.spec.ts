import { expect, test, type Route } from '@playwright/test';

const testMount = process.env.LUMEN_TEST_MOUNT === '/lumen' ? '/lumen' : '';
const testApiPath = (url: string) =>
  new URL(url).pathname.replace(/^\/lumen(?=\/)/, '').replace(/^\/api\/v1/, '');

for (const locale of ['en', 'fr', 'ar'])
  test(`game content picker announces loading in ${locale}`, async ({
    page,
  }, info) => {
    const captureDir = process.env.LUMEN_VISUAL_CAPTURE_DIR;
    const labels = {
      en: { loading: 'Checking editions…', content: 'Content to Request' },
      fr: {
        loading: 'Vérification des éditions…',
        content: 'Contenu à demander',
      },
      ar: {
        loading: 'جارٍ التحقق من إصدارات اللعبة…',
        content: 'المحتوى المطلوب',
      },
    }[locale]!;
    let releaseCatalog!: () => void;
    const catalogReady = new Promise<void>((resolve) => {
      releaseCatalog = resolve;
    });
    let finishCatalog!: (route: Route) => void;
    const catalogIntercepted = new Promise<Route>((resolve) => {
      finishCatalog = resolve;
    });
    await page.route('**/lumen-config.json', (route) =>
      route.fulfill({ json: {} })
    );
    await page.route('**/api/v1/**', async (route) => {
      const path = testApiPath(route.request().url());
      if (path === '/auth/me')
        return route.fulfill({ json: { id: 1, permissions: 32 } });
      if (path === '/user/1/settings/main')
        return route.fulfill({ json: { locale } });
      if (path === '/settings/public')
        return route.fulfill({
          json: {
            softwareEnabled: true,
            enabledMediaCategories: { game: true },
          },
        });
      if (path === '/request/software/catalog/games/42')
        return route.fulfill({
          json: {
            game: {
              title: 'Loading Fixture Game',
              igdbId: 42,
              catalogProvider: 'igdb',
              availability: 'missing',
              genres: [],
              platforms: [],
            },
          },
        });
      if (path === '/game-content/42/editions') {
        finishCatalog(route);
        await catalogReady;
        return route.fulfill({
          json: {
            available: true,
            base: { igdbId: 42, title: 'Loading Fixture Game', owned: false },
            editions: [
              {
                igdbId: 51,
                title: 'Fixture Edition',
                owned: false,
                contentKnown: false,
              },
            ],
            addons: [],
          },
        });
      }
      return route.fulfill({ json: { results: [] } });
    });
    await page.goto(`${testMount}/game/game/42`);
    const route = await catalogIntercepted;
    if (captureDir && ['desktop', 'iphone'].includes(info.project.name))
      await page.screenshot({
        path: `${captureDir}/${locale}/game-content-loading-${info.project.name}.png`,
        fullPage: true,
        animations: 'disabled',
      });
    await expect(page.locator('.note[role="status"]')).toContainText(
      labels.loading
    );
    releaseCatalog();
    await expect(
      page.getByRole('combobox', { name: labels.content })
    ).toBeVisible();
    expect(route.request().method()).toBe('GET');
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth)
    ).toBeLessThanOrEqual(page.viewportSize()!.width);
  });
