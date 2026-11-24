import { expect, test, type TestInfo } from '@playwright/test';

const locale = ['en', 'fr', 'ar'].includes(
  process.env.LUMEN_ADULT_DETAIL_LOCALE ?? ''
)
  ? (process.env.LUMEN_ADULT_DETAIL_LOCALE as 'en' | 'fr' | 'ar')
  : 'en';
const copy = {
  en: 'Couldn’t load this scene',
  fr: 'Impossible de charger cette scène',
  ar: 'تعذّر تحميل هذا المشهد',
} as const;

test('Adult detail load errors follow the saved locale', async ({
  page,
}, info: TestInfo) => {
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
        json: { id: 1, displayName: 'Viewer', permissions: 8192 },
      });
    if (path === '/user/1/settings/main')
      return route.fulfill({
        json: { locale, enabledMediaCategories: { adult: true } },
      });
    if (path === '/settings/public')
      return route.fulfill({
        json: { adultEnabled: true, enabledMediaCategories: { adult: true } },
      });
    if (path === '/adult/43')
      return route.fulfill({
        status: 503,
        json: { message: 'Temporary scene-service failure' },
      });
    return route.fulfill({ json: [] });
  });
  await page.goto('/adult/43');
  const label =
    process.env.LUMEN_ADULT_DETAIL_BASELINE === '1'
      ? 'Couldn’t load this'
      : copy[locale];
  await expect(page.getByText(label, { exact: true })).toBeVisible();
  if (['desktop', 'iphone'].includes(info.project.name)) {
    const directory = process.env.LUMEN_ADULT_DETAIL_CAPTURE_DIR;
    if (directory)
      await page.screenshot({
        path: `${directory}/adult-detail-${locale}-${info.project.name}.png`,
        fullPage: true,
        animations: 'disabled',
      });
  }
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
    )
    .toBe(true);
});
