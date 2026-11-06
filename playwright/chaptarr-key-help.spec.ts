import { expect, test } from '@playwright/test';
import { restoreAdminPresentation } from './helpers/presentation';

test.afterEach(async ({ page }) => restoreAdminPresentation(page));

for (const theme of ['seerrNGJ', 'seerrOrig', 'persiusNG']) {
  for (const width of [390, 1440]) {
    test(`${theme} Chaptarr service key instructions at ${width}px`, async ({
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
      await page.goto('/settings/services');
      await page
        .getByRole('button', { name: 'Audiobooks & Books', exact: true })
        .click();
      await page
        .getByRole('button', { name: 'Add ChaptarrNG Server', exact: true })
        .click();
      const description = page
        .locator('.settings-form-row-description')
        .filter({ hasText: 'SEERRAPIKEY' });
      await expect(description).toBeVisible();
      if (process.env.SEERR_KEY_HELP_BASELINE !== 'true') {
        await expect(description).toContainText(
          'create a separate random service key'
        );
        await expect(description.locator('code')).toHaveText(
          'CHAPTARR__AUTH__SEERRAPIKEY'
        );
        await expect(description).toContainText('two underscores');
        await expect(description).toContainText(
          'different from the administrator API key'
        );
      }
      await description.scrollIntoViewIfNeeded();
      await page.screenshot({ path: info.outputPath('chaptarr-key-help.png') });
      expect(
        await description.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)
      ).toBe(true);
      await page.getByTestId('modal-cancel-button').click();
    });
  }
}
