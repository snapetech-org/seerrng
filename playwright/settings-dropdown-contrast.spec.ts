import { expect, test } from '@playwright/test';
import { THEME_PALETTE_IDS } from '../server/utils/themePreference';
import { restoreAdminPresentation } from './helpers/presentation';
import { getSelectOptionContrast } from './helpers/selectContrast';
test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
let originalPalette = 'seerr';
test.beforeEach(async ({ page }) => {
  expect(
    (
      await page.request.post('/api/v1/auth/local', {
        data: { email: 'admin@seerr.dev', password: 'test1234' },
      })
    ).status()
  ).toBe(200);
  originalPalette =
    (await (await page.request.get('/api/v1/auth/me')).json()).settings
      ?.themePalette ?? 'seerr';
});
test.afterEach(async ({ page }) => {
  expect(
    (
      await page.request.post('/api/v1/user/1/settings/theme', {
        data: { palette: originalPalette },
      })
    ).status()
  ).toBe(200);
  await restoreAdminPresentation(page);
});
const scenarios = [
  ...['seerrOrig', 'seerrNGJ', 'persiusNG'].flatMap((theme) =>
    ['dark', 'light'].flatMap((mode) =>
      [390, 1440].map((width) => ({ theme, mode, width, palette: 'lagoon' }))
    )
  ),
  ...THEME_PALETTE_IDS.filter((palette) => palette !== 'lagoon').flatMap(
    (palette) =>
      ['dark', 'light'].map((mode) => ({
        theme: 'seerrNGJ',
        mode,
        width: 1440,
        palette,
      }))
  ),
];
for (const { theme, mode, width, palette } of scenarios)
  test(`language option contrast ${theme} ${palette} ${mode} ${width}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 900 });
    expect(
      (
        await page.request.post('/api/v1/auth/local', {
          data: { email: 'admin@seerr.dev', password: 'test1234' },
        })
      ).status()
    ).toBe(200);
    expect(
      (
        await page.request.post('/api/v1/user/1/settings/interface-theme', {
          data: { theme },
        })
      ).status()
    ).toBe(200);
    expect(
      (
        await page.request.post('/api/v1/user/1/settings/theme', {
          data: { palette },
        })
      ).status()
    ).toBe(200);
    await page.addInitScript(
      (mode) => localStorage.setItem('seerr-theme-mode', mode),
      mode
    );
    await page.route('**/api/v1/languages', (route) =>
      route.fulfill({
        json: [
          { iso_639_1: 'en', english_name: 'English', name: 'English' },
          { iso_639_1: 'de', english_name: 'German', name: 'Deutsch' },
          { iso_639_1: 'ar', english_name: 'Arabic', name: 'العربية' },
        ],
      })
    );
    await page.goto('/settings', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('html')).toHaveAttribute('data-theme-mode', mode);
    await page.locator('#originalLanguage').click();
    const options = page.locator('.react-select__menu [role="option"]');
    await expect(options.first()).toBeVisible();
    const values = await getSelectOptionContrast(options);
    await info.attach('option-contrast.json', {
      body: JSON.stringify(values, null, 2),
      contentType: 'application/json',
    });
    await page.screenshot({
      path: info.outputPath('language-options.png'),
      animations: 'disabled',
    });
    for (const item of values)
      expect(item.contrast, JSON.stringify(item)).toBeGreaterThanOrEqual(4.5);
  });
