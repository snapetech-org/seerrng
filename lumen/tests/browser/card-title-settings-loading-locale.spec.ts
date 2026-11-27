import { expect, test } from '@playwright/test';
import { testAppPath } from './testAppPath';

const locale = (process.env.LUMEN_CARD_SETTINGS_LOADING_LOCALE ?? 'fr') as
  'fr' | 'ar';

const loadingText = {
  fr: 'Chargement des paramètres de titre des cartes…',
  ar: 'جارٍ تحميل إعدادات عناوين البطاقات…',
} as const;

test('card title settings loading state follows the saved locale', async ({
  page,
}, info) => {
  let releaseSettings!: () => void;
  const settingsGate = new Promise<void>((resolve) => {
    releaseSettings = resolve;
  });

  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/lumen/configuration', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname.slice(
      '/api/v1'.length
    );
    if (path === '/user/1/settings/card-text') {
      await settingsGate;
      return route.fulfill({ json: {} });
    }
    if (path === '/auth/me')
      return route.fulfill({
        json: { id: 1, displayName: 'Fixture User', permissions: 2 },
      });
    if (path === '/user/1/settings/main')
      return route.fulfill({ json: { locale } });
    if (path === '/settings/public')
      return route.fulfill({ json: { applicationTitle: 'SeerrNG' } });
    return route.fulfill({ json: [] });
  });

  await page.goto(testAppPath('/me/account'));
  const loading = page.getByRole('status').filter({
    hasText: loadingText[locale],
  });
  await expect(loading).toBeVisible();

  const captureDir = process.env.LUMEN_VISUAL_CAPTURE_DIR;
  if (captureDir && ['desktop', 'iphone'].includes(info.project.name))
    await loading.locator('xpath=..').screenshot({
      path: `${captureDir}/${locale}/card-title-settings-loading-${info.project.name}.png`,
      animations: 'disabled',
    });

  releaseSettings();
  await expect(
    page.getByRole('combobox', { name: /Movies|Films|الأفلام/ }).first()
  ).toBeVisible();
});
