import { expect, test, type Page } from '@playwright/test';

// Follow-ups to the audit pass: sideways phones, search tap target, settings checkbox, and
// one request per page load for the public settings and the signed-in user.
async function fixtures(page: Page, counts: Record<string, number> = {}) {
  await page.route('https://**/*', (r) => r.abort());
  await page.route('**/lumen-config.json', (r) => r.fulfill({ json: {} }));
  await page.route('**/seerr-classic/**', (r) => r.fulfill({ status: 404 }));
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname.slice(7);
    counts[path] = (counts[path] || 0) + 1;
    if (path === '/settings/public')
      return route.fulfill({
        json: { mediaServerType: 1, localLogin: true, booksEnabled: true },
      });
    if (path === '/auth/me')
      return route.fulfill({
        json: { id: 1, displayName: 'fam', permissions: 2 },
      });
    if (
      path.startsWith('/discover/genreslider') ||
      path.startsWith('/service/')
    )
      return route.fulfill({ json: [] });
    return route.fulfill({
      json: { page: 1, totalPages: 1, totalResults: 0, results: [] },
    });
  });
}

type Box = { x: number; y: number; width: number; height: number };
const overlap = (a: Box, b: Box) =>
  a.x < b.x + b.width &&
  b.x < a.x + a.width &&
  a.y < b.y + b.height &&
  b.y < a.y + a.height;

// sideways phones: the tabs sit in a rail beside the page, never over the shortcut chips or the
// first content, and the rail fits inside the short screen
for (const [width, height] of [
  [640, 360],
  [915, 412],
]) {
  test(`landscape phone ${width}x${height}: tabs do not cover Discover`, async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport: { width, height },
      isMobile: true,
      hasTouch: true,
    });
    const page = await context.newPage();
    await fixtures(page);
    await page.goto('/');
    const tabs = page.getByRole('navigation', { name: 'Tabs' });
    const chips = page.locator('.navchips');
    await expect(chips).toBeVisible();
    const box = async (l: typeof chips) => (await l.boundingBox())!;
    for (const y of [0, 99999]) {
      await page.evaluate((top) => window.scrollTo(0, top), y);
      const t = await box(tabs);
      expect(t.y).toBeGreaterThanOrEqual(0);
      expect(t.y + t.height).toBeLessThanOrEqual(height);
      expect(t.x + t.width).toBeLessThanOrEqual(width / 3);
      const first = await box(page.locator('.view > *').first());
      expect(overlap(t, first)).toBe(false);
      for (const tab of await tabs.locator('.tab').all())
        expect((await box(tab)).height).toBeGreaterThanOrEqual(44);
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    expect(overlap(await box(tabs), await box(chips))).toBe(false);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth
      )
    ).toBe(true);
    await context.close();
  });
}
