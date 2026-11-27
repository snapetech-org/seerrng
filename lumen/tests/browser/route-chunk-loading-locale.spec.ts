import { expect, test } from '@playwright/test';
import { testAppPath } from './testAppPath';

const locale = (process.env.LUMEN_ROUTE_LOADING_LOCALE ?? 'fr') as 'fr' | 'ar';
const loadingText = {
  fr: 'Chargement…',
  ar: 'جارٍ التحميل…',
} as const;

test('lazy route chunk loading follows the saved locale', async ({
  page,
}, info) => {
  let releaseChunk!: () => void;
  let announceChunk!: () => void;
  const chunkGate = new Promise<void>((resolve) => {
    releaseChunk = resolve;
  });
  const chunkRequested = new Promise<void>((resolve) => {
    announceChunk = resolve;
  });

  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/lumen/configuration', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/assets/GameDiscovery-*.js', async (route) => {
    announceChunk();
    await chunkGate;
    await route.continue();
  });
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname.slice(
      '/api/v1'.length
    );
    if (path === '/auth/me')
      return route.fulfill({
        json: { id: 1, displayName: 'Fixture User', permissions: 2 },
      });
    if (path === '/user/1/settings/main')
      return route.fulfill({
        json: { locale, enabledMediaCategories: { game: true } },
      });
    if (path === '/settings/public')
      return route.fulfill({
        json: {
          applicationTitle: 'SeerrNG',
          enabledMediaCategories: { game: true },
          softwareEnabled: true,
        },
      });
    if (path.startsWith('/request/software/catalog/popular'))
      return route.fulfill({ json: { results: [{ id: 1 }] } });
    return route.fulfill({ json: [] });
  });

  await page.goto(testAppPath('/games/discovery'));
  await chunkRequested;
  const loading = page.getByRole('status').filter({
    hasText: loadingText[locale],
  });
  await expect(loading).toBeVisible();

  const captureDir = process.env.LUMEN_VISUAL_CAPTURE_DIR;
  if (captureDir && ['desktop', 'iphone'].includes(info.project.name))
    await loading.screenshot({
      path: `${captureDir}/${locale}/route-chunk-loading-${info.project.name}.png`,
      animations: 'disabled',
    });

  releaseChunk();
  await expect(loading).toHaveCount(0);
});
