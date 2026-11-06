import { expect, test } from '@playwright/test';

for (const cancelled of [true, false]) {
  test(`${cancelled ? 'closed' : 'approved'} Plex popup during an in-flight poll`, async ({
    page,
    context,
  }, info) => {
    let attempts = 0;
    let releasePoll!: () => void;
    let pollStarted!: () => void;
    const held = new Promise<void>((resolve) => {
      releasePoll = resolve;
    });
    const started = new Promise<void>((resolve) => {
      pollStarted = resolve;
    });
    await context.route('https://app.plex.tv/**', (route) =>
      route.fulfill({ body: 'Fixture Plex sign-in' })
    );
    await page.route('**/lumen-config.json', (route) =>
      route.fulfill({ json: {} })
    );
    await page.route('**/api/v1/**', (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith('/auth/plex')) attempts++;
      return route.fulfill({
        status: path.endsWith('/auth/me') ? 401 : 200,
        json: {},
      });
    });
    await page.route('https://plex.tv/api/v2/pins?strong=true', (route) =>
      route.fulfill({ json: { id: 123, code: 'fixture-code' } })
    );
    await page.route('https://plex.tv/api/v2/pins/123', async (route) => {
      pollStarted();
      await held;
      await route.fulfill({ json: { authToken: 'fixture-token' } });
    });
    await page.goto('/');
    await page.screenshot({ path: info.outputPath('before-plex.png') });
    const popupOpened = page.waitForEvent('popup');
    await page.getByRole('button', { name: 'Continue with Plex' }).click();
    const popup = await popupOpened;
    await started;
    if (cancelled) await popup.close();
    releasePoll();
    await expect(
      page.getByRole('button', { name: 'Continue with Plex' })
    ).toBeEnabled();
    expect(attempts).toBe(cancelled ? 0 : 1);
    if (cancelled)
      await expect(page.getByRole('alert')).toContainText(
        /cancelled|timed out/
      );
    else {
      await expect(page.getByRole('alert')).toHaveCount(0);
      // Browsers may keep a cross-origin popup open after opener is cleared.
      // Successful authentication is the single token-bearing API exchange.
    }
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
      )
      .toBe(true);
    await page.screenshot({ path: info.outputPath('after-plex.png') });
  });
}
