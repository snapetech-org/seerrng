import { expect, test } from '@playwright/test';

const mount = process.env.LUMEN_TEST_MOUNT === '/lumen' ? '/lumen' : '';
const appPath = (path: string) => `${mount}${path}`;

test('preferred media language options use the saved interface locale', async ({
  page,
}, info) => {
  const locale = ['en', 'fr', 'ar'].includes(
    process.env.LUMEN_ACCOUNT_LOCALE ?? ''
  )
    ? (process.env.LUMEN_ACCOUNT_LOCALE as 'en' | 'fr' | 'ar')
    : 'fr';
  const names = {
    en: ['English', 'French', 'Japanese'],
    fr: ['anglais', 'français', 'japonais'],
    ar: ['الإنجليزية', 'الفرنسية', 'اليابانية'],
  } as const;
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname
      .replace(/^\/lumen(?=\/)/, '')
      .replace(/^\/api\/v1/, '');
    if (path === '/auth/me')
      return route.fulfill({
        json: { id: 2, displayName: 'Viewer', permissions: 32, userType: 2 },
      });
    if (path === '/user/2/settings/main')
      return route.fulfill({
        json: {
          username: 'Viewer',
          locale,
          preferredLanguages: { all: null, movie: 'fr' },
        },
      });
    if (path === '/languages')
      return route.fulfill({
        json: [
          { iso_639_1: 'en', english_name: 'English' },
          { iso_639_1: 'fr', english_name: 'French' },
          { iso_639_1: 'ja', english_name: 'Japanese' },
        ],
      });
    if (path === '/settings/public')
      return route.fulfill({
        json: { applicationTitle: 'SeerrNG', mediaServerType: 1 },
      });
    return route.fulfill({ json: {} });
  });
  await page.goto(appPath('/me/account'));
  const selector = page.locator('select.cfg-input').nth(1);
  await expect(selector).toBeEnabled();
  const expectedNames = process.env.LUMEN_EXPECT_ENGLISH_NAMES
    ? names.en
    : names[locale];
  for (const [index, value] of ['en', 'fr', 'ja'].entries())
    await expect(selector.locator(`option[value="${value}"]`)).toHaveText(
      expectedNames[index]
    );
  await expect(page.locator('html')).toHaveAttribute(
    'dir',
    locale === 'ar' ? 'rtl' : 'ltr'
  );
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
    )
    .toBe(true);
  if (
    process.env.LUMEN_VISUAL_CAPTURE_DIR &&
    ['desktop', 'iphone'].includes(info.project.name)
  )
    await page.screenshot({
      path: `${process.env.LUMEN_VISUAL_CAPTURE_DIR}/account-language-${locale}-${info.project.name}.png`,
      fullPage: true,
      animations: 'disabled',
    });
});
