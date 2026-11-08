import { expect, test } from '@playwright/test';

test.use({ serviceWorkers: 'block' });
for (const theme of ['seerrOrig', 'seerrNGJ'])
  for (const width of [320, 390, 1440]) {
    test(`compact settings are discoverable, searchable and recoverable ${theme} ${width}`, async ({
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
      await page.goto('/settings/main');
      await expect(page.locator('html')).toHaveAttribute(
        'data-interface-theme',
        theme
      );
      await expect(page.locator('#applicationTitle')).toBeVisible();
      const compact = page.getByRole('button', {
        name: 'Compact settings',
        exact: true,
      });
      await expect(compact).toHaveAttribute('aria-pressed', 'false');
      const save = page.getByTestId('settings-save-button');
      await expect(save).toBeDisabled();
      const fullHeight = await page
        .locator('.settings-page-content')
        .evaluate((el) => el.getBoundingClientRect().height);
      await page.screenshot({
        path: info.outputPath(`${theme}-${width}-expanded.png`),
        fullPage: true,
      });
      await compact.click();
      await expect(compact).toHaveAttribute('aria-pressed', 'true');
      await expect(save).toBeDisabled();
      const regional = page.getByRole('button', {
        name: 'Regional Content',
        exact: true,
      });
      await expect(regional).toHaveAttribute('aria-expanded', 'false');
      expect(
        await page
          .locator('.settings-page-content')
          .evaluate((el) => el.getBoundingClientRect().height)
      ).toBeLessThan(fullHeight);
      const clippedGroups = await page
        .locator('.settings-group-title-row')
        .evaluateAll((rows) =>
          rows.flatMap((row) =>
            Array.from(row.querySelectorAll('button, .settings-group-status'))
              .filter((el) => el.scrollWidth > el.clientWidth + 1)
              .map((el) => el.textContent)
          )
        );
      expect(clippedGroups).toEqual([]);
      await page.screenshot({
        path: info.outputPath(`${theme}-${width}-compact.png`),
        fullPage: true,
      });
      await regional.focus();
      await page.keyboard.press('Enter');
      await expect(regional).toHaveAttribute('aria-expanded', 'true');
      await regional.click();
      const search = page.getByRole('searchbox', {
        name: 'Search Settings',
        exact: true,
      });
      await search.fill('Discover Region');
      await search.press('Enter');
      await expect(regional).toHaveAttribute('aria-expanded', 'true');
      await expect(page.locator('#discoverRegion')).toBeFocused();
      const requestRules = page.getByRole('button', {
        name: 'Request and Episode Rules',
        exact: true,
      });
      await requestRules.click();
      const fourKRow = page
        .locator('.settings-form-row')
        .filter({ has: page.locator('#enable4k') });
      const help = fourKRow.locator('summary');
      await expect(help).toBeVisible();
      await expect(
        fourKRow.getByText(/This global switch controls 4K/)
      ).toBeHidden();
      await help.focus();
      await page.keyboard.press('Enter');
      await expect(
        fourKRow.getByText(/This global switch controls 4K/)
      ).toBeVisible();
      const mapping = page.locator('#downloadPathMappingsJson');
      await mapping.fill('[');
      const copies = page.getByRole('button', {
        name: 'Download Copies',
        exact: true,
      });
      await expect(copies).toHaveAttribute('aria-expanded', 'true');
      await copies.click();
      await expect(mapping).toBeHidden();
      await save.click();
      await expect(copies).toHaveAttribute('aria-expanded', 'true');
      await expect(mapping).toBeVisible();
      await expect(
        page.getByText('Enter a JSON array with at most 100 path mappings.', {
          exact: true,
        })
      ).toBeVisible();
      await mapping.fill('[]');
      await expect(save).toBeDisabled();
      await page.reload();
      await expect(compact).toHaveAttribute('aria-pressed', 'true');
      await expect(regional).toHaveAttribute('aria-expanded', 'false');
      const title = page.locator('#applicationTitle');
      const original = await title.inputValue();
      await title.fill('Unsuccessful compact draft');
      let writes = 0;
      await page.route('**/api/v1/settings/main', (route) => {
        if (route.request().method() === 'POST') {
          writes++;
          return route.fulfill({
            status: 503,
            json: { message: 'Isolated failed save' },
          });
        }
        return route.continue();
      });
      await save.click();
      await expect.poll(() => writes).toBe(1);
      await expect(title).toHaveValue('Unsuccessful compact draft');
      await expect(save).toBeEnabled();
      await compact.click();
      await expect(title).toHaveValue('Unsuccessful compact draft');
      await expect(save).toBeEnabled();
      await title.fill(original);
      await expect(save).toBeDisabled();
      await page.unrouteAll({ behavior: 'wait' });
      await page.screenshot({
        path: info.outputPath(`${theme}-${width}-restored.png`),
        fullPage: true,
      });
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1
      );
      expect(overflow).toBe(false);
    });
  }
