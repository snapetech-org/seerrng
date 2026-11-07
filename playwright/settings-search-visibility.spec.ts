import { expect, test } from '@playwright/test';
import { restoreAdminPresentation } from './helpers/presentation';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
test.afterEach(async ({ page }) => restoreAdminPresentation(page));
for (const theme of ['seerrOrig', 'seerrNGJ']) {
  test(`settings search waits for destination visibility in ${theme}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
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
    // Model a panel temporarily hidden while its destination layout settles.
    // A DOM match is insufficient: focus must succeed after it becomes visible.
    await page.addInitScript(() => {
      const deferred = new WeakSet<HTMLElement>();
      const observer = new MutationObserver(() => {
        const panel = document.getElementById('prowlarr');
        if (!panel || deferred.has(panel)) return;
        deferred.add(panel);
        panel.hidden = true;
        Object.defineProperty(window, '__settingsPanelWasDeferred', {
          value: true,
        });
        window.setTimeout(() => {
          panel.hidden = false;
        }, 400);
      });
      observer.observe(document, { childList: true, subtree: true });
    });
    await page.goto('/settings/services');
    await expect(page.locator('html')).toHaveAttribute(
      'data-interface-theme',
      theme
    );
    const search = page.getByRole('searchbox', { name: 'Search Settings' });
    await search.fill('NZBHydra2');
    await search.press('Enter');
    await expect(page).toHaveURL(/\/settings\/prowlarr/);
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (window as unknown as { __settingsPanelWasDeferred?: boolean })
              .__settingsPanelWasDeferred
        )
      )
      .toBe(true);
    await expect(page.locator('#prowlarr')).toBeVisible();
    await expect(page.locator('#prowlarr-hostname')).toBeFocused();
  });
}
