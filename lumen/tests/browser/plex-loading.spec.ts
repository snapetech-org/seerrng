import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

declare global {
  interface Window {
    __plexCloseCalls: number;
  }
}

async function recordPopupClose(page: Page) {
  await page.addInitScript(() => {
    let closeCalls = 0;
    Object.defineProperty(window, '__plexCloseCalls', {
      configurable: false,
      get: () => closeCalls,
    });
    window.close = () => {
      closeCalls += 1;
    };
  });
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/api/v1/**', (route) => route.fulfill({ json: {} }));
}

test('Plex completion route closes only after the completion marker', async ({
  page,
}) => {
  await recordPopupClose(page);
  await page.goto('/login/plex/loading?complete=1');

  await expect(page.locator('main[role="status"]')).toBeVisible();
  if (process.env.LUMEN_CAPTURE_DIR)
    await page.screenshot({
      path: `${process.env.LUMEN_CAPTURE_DIR}/plex-loading-${test.info().project.name}.png`,
    });
  await expect.poll(() => page.evaluate(() => window.__plexCloseCalls)).toBe(1);
});

test('Plex loading route stays open without the completion marker', async ({
  page,
}) => {
  await recordPopupClose(page);
  await page.goto('/login/plex/loading');

  await expect(page.locator('main[role="status"]')).toBeVisible();
  if (process.env.LUMEN_CAPTURE_DIR)
    await page.screenshot({
      path: `${process.env.LUMEN_CAPTURE_DIR}/plex-loading-pending-${test.info().project.name}.png`,
    });
  await expect.poll(() => page.evaluate(() => window.__plexCloseCalls)).toBe(0);
});
