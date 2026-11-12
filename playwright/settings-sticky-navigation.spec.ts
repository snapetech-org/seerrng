import { expect, test } from '@playwright/test';

test.use({ serviceWorkers: 'block' });

const widths = [390, 640, 767, 768, 1023, 1024, 1280];

const themeCases = [
  { theme: 'seerrOrig', mode: 'dark' },
  { theme: 'persiusNG', mode: 'dark' },
  { theme: 'persiusNG', mode: 'light' },
  { theme: 'seerrNGJ', mode: 'dark' },
];

test.afterEach(async ({ page }) => {
  const login = await page.request.post('/api/v1/auth/local', {
    data: { email: 'admin@seerr.dev', password: 'test1234' },
  });
  expect(login.status()).toBe(200);
  const user = await login.json();
  const restore = await page.request.post(
    `/api/v1/user/${user.id}/settings/interface-theme`,
    { data: { theme: 'seerrOrig' } }
  );
  expect(restore.status()).toBe(200);
});

for (const { theme, mode } of themeCases) {
  test(
    `sticky Settings navigation stays reachable at responsive widths in ${theme} (${mode})`,
    async ({ page }, info) => {
      const login = await page.request.post('/api/v1/auth/local', {
        data: { email: 'admin@seerr.dev', password: 'test1234' },
      });
      expect(login.status()).toBe(200);
      const user = await login.json();

      const themeResponse = await page.request.post(
        `/api/v1/user/${user.id}/settings/interface-theme`,
        { data: { theme } }
      );
      expect(themeResponse.status()).toBe(200);
      await page.addInitScript((selectedMode) => {
        localStorage.setItem('seerr-theme-mode', selectedMode);
      }, mode);

      await page.goto('/settings/services');
      const root = page.locator('html');
      await expect(root).toHaveAttribute('data-interface-theme', theme);
      await expect(root).toHaveAttribute('data-theme-mode', mode);

      for (const width of widths) {
        // CSS widths cover layouts also reached through zoom; this does not emulate browser zoom.
        const height = width < 768 ? 640 : 900;
        await page.setViewportSize({ width, height });

        const maxScroll = await page.evaluate(
          () => document.documentElement.scrollHeight - window.innerHeight
        );
        expect(maxScroll, `page scroll range at ${width}px`).toBeGreaterThan(
          400
        );
        await page.evaluate(() => window.scrollTo(0, 400));
        await expect
          .poll(() => page.evaluate(() => window.scrollY))
          .toBeGreaterThan(300);

        const header = page.locator('.searchbar');
        const navigation = page.locator('.settings-page-navigation-row');
        await expect(header).toBeVisible();
        await expect(navigation).toBeVisible();

        const headerBottom = await header.evaluate(
          (element) => element.getBoundingClientRect().bottom
        );
        const navigationGeometry = await navigation.evaluate((element) => {
          const rect = element.getBoundingClientRect();
          const styles = element.ownerDocument.defaultView!.getComputedStyle(
            element
          );
          return {
            top: rect.top,
            height: rect.height,
            maxHeight: Number.parseFloat(styles.maxHeight),
            documentWidth: element.ownerDocument.documentElement.scrollWidth,
          };
        });

        expect(
          Math.abs(navigationGeometry.top - headerBottom),
          `sticky navigation clears the header at ${width}px`
        ).toBeLessThanOrEqual(2);
        expect(
          navigationGeometry.height,
          `sticky navigation respects its viewport limit at ${width}px`
        ).toBeLessThanOrEqual(navigationGeometry.maxHeight + 1);
        expect(
          navigationGeometry.documentWidth,
          `document has no horizontal overflow at ${width}px`
        ).toBeLessThanOrEqual(width + 1);

        const mobileSelector = navigation.locator('select#tabs');
        const desktopNavigation = navigation.locator('nav');
        if (width < 1024) {
          await expect(mobileSelector).toBeVisible();
          await expect(mobileSelector).toHaveAttribute(
            'aria-label',
            'Selected tab'
          );
          await expect(desktopNavigation).toBeHidden();
        } else {
          await expect(mobileSelector).toBeHidden();
          await expect(desktopNavigation).toBeVisible();
        }

        if (width === 390) {
          await page.screenshot({
            path: info.outputPath(`${theme}-${mode}-${width}-sticky.png`),
          });
          await page.evaluate(() =>
            window.scrollTo(0, document.documentElement.scrollHeight)
          );
          await expect(navigation).toBeVisible();
          await expect(mobileSelector).toBeVisible();
          await mobileSelector.selectOption({ label: 'Jobs & Cache' });
          await expect(page).toHaveURL(/\/settings\/jobs$/);
          await expect(mobileSelector.locator('option:checked')).toHaveText(
            'Jobs & Cache'
          );
          await page.goto('/settings/services');
        }

        if (width === 1280) {
          await page.screenshot({
            path: info.outputPath(`${theme}-${mode}-${width}-sticky.png`),
          });
          await page.evaluate(() =>
            window.scrollTo(0, document.documentElement.scrollHeight)
          );
          const jobsLink = navigation.getByRole('link', {
            name: 'Jobs & Cache',
            exact: true,
          });
          await expect(jobsLink).toBeVisible();
          await jobsLink.click();
          await expect(page).toHaveURL(/\/settings\/jobs$/);
          await expect(jobsLink).toHaveAttribute('aria-current', 'page');
        }
      }
    }
  );
}
