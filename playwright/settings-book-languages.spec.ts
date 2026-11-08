import { expect, test } from '@playwright/test';
import { restoreAdminPresentation } from './helpers/presentation';
test.use({ serviceWorkers: 'block' });
test.afterEach(async ({ page }) => restoreAdminPresentation(page));
for (const theme of ['seerrOrig', 'seerrNGJ'])
  for (const width of [390, 1440])
    test(`book language settings ${theme} ${width}`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 });
      expect(
        (
          await page.request.post('/api/v1/auth/local', {
            data: { email: 'admin@seerr.dev', password: 'test1234' },
          })
        ).status()
      ).toBe(200);
      await page.request.post('/api/v1/user/1/settings/main', {
        data: { locale: 'en' },
      });
      await page.request.post('/api/v1/user/1/settings/interface-theme', {
        data: { theme },
      });

      const original = await (
        await page.request.get('/api/v1/settings/metadatas/books')
      ).json();
      let getFailed = false,
        putFailed = false;
      await page.route('**/api/v1/settings/metadatas/books', (route) => {
        if (route.request().method() === 'GET' && !getFailed) {
          getFailed = true;
          return route.fulfill({
            status: 503,
            json: { message: 'Isolated initial load failure' },
          });
        }
        if (route.request().method() === 'PUT' && !putFailed) {
          putFailed = true;
          return route.fulfill({
            status: 503,
            json: { message: 'Isolated save failure' },
          });
        }
        return route.continue();
      });
      try {
        await page.goto('/settings/metadata');
        const section = page
          .locator('section')
          .filter({
            has: page.getByRole('heading', {
              name: 'Book language restrictions',
              exact: true,
            }),
          });
        await expect(section.getByRole('textbox')).toHaveCount(0);
        await section
          .getByRole('button', { name: 'Retry', exact: true })
          .click();
        const input = page.getByLabel('Allowed book languages', {
          exact: true,
        });
        await expect(input).toBeVisible();
        await input.fill('eng, fre');
        const form = page.getByTestId('book-language-settings-form');
        const save = page.getByRole('button', { name: 'Save', exact: true });
        await save.click();
        await expect(form.getByRole('alert')).toContainText(
          'changes are still here'
        );
        await expect(save).toBeEnabled();
        await expect(input).toHaveValue('eng, fre');
        await save.click();
        await expect(save).toBeDisabled();
        expect(
          (
            await (
              await page.request.get('/api/v1/settings/metadatas/books')
            ).json()
          ).allowedLanguages
        ).toEqual(['eng', 'fre']);
        await page.reload();
        await expect(input).toHaveValue('eng, fre');
        await input.fill('eng');
        await save.click();
        await expect(save).toBeDisabled();
        await page.reload();
        await expect(input).toHaveValue('eng');
        if (theme === 'seerrOrig' && width === 390) {
          const tabs = page.getByRole('combobox', {
            name: 'Selected tab',
            exact: true,
          });
          await expect(tabs.locator('option:checked')).toHaveText(
            'Metadata Providers'
          );
          await tabs.selectOption({ label: 'Users' });
          await expect(page).toHaveURL(/settings\/users/);
          await expect(tabs.locator('option:checked')).toHaveText('Users');
          await tabs.selectOption({ label: 'Metadata Providers' });
          await expect(input).toHaveValue('eng');
          await expect(tabs.locator('option:checked')).toHaveText(
            'Metadata Providers'
          );
        }
        await page.screenshot({
          path: info.outputPath('restricted.png'),
          fullPage: true,
        });
        await input.fill('');
        await save.click();
        await expect(save).toBeDisabled();
        expect(
          (
            await (
              await page.request.get('/api/v1/settings/metadatas/books')
            ).json()
          ).allowedLanguages
        ).toEqual([]);
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth)
        ).toBeLessThanOrEqual(width + 1);
      } finally {
        await page.request.put('/api/v1/settings/metadatas/books', {
          data: original,
        });
      }
    });
