import { expect, test } from '@playwright/test';
import { restoreAdminPresentation } from './helpers/presentation';

test.use({ serviceWorkers: 'block' });
test.afterEach(async ({ page }) => restoreAdminPresentation(page));
for (const theme of ['seerrOrig', 'seerrNGJ']) {
  test(`settings search waits for permissions before resolving API in ${theme}`, async ({
    page,
  }) => {
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
    let release!: () => void;
    const permissionReady = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route('**/api/v1/auth/me', async (route) => {
      const response = await route.fetch();
      await permissionReady;
      await route.fulfill({ response });
    });
    try {
      await page.goto('/settings/metadata', { waitUntil: 'domcontentloaded' });
      const search = page.getByRole('searchbox', { name: 'Search Settings' });
      await expect(search).toBeVisible();
      await expect(search).toBeDisabled();
      release();
      await expect(search).toBeEnabled();
      await search.fill('API');
      await search.press('Enter');
      await expect(page).toHaveURL(/\/settings\/main/);
      await expect(page.locator('#apiKey')).toBeFocused();
    } finally {
      release();
      await page.unrouteAll({ behavior: 'wait' });
    }
  });
}
