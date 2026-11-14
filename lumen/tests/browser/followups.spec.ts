import { expect, test, type Page } from '@playwright/test';

// Follow-ups to the audit pass: sideways phones, search tap target, settings checkbox, and
// one request per page load for the public settings and the signed-in user.
async function fixtures(page: Page, counts: Record<string, number> = {}) {
  await page.route('https://**/*', (r) => r.abort());
  await page.route('**/lumen-config.json', (r) => r.fulfill({ json: {} }));
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

test('the search field fills its bar so a tap anywhere in it types', async ({
  page,
}) => {
  test.skip(page.viewportSize()!.width >= 1040, 'phone and tablet search box');
  await fixtures(page);
  await page.goto('/search');
  const bar = (await page.locator('#sq-label').boundingBox())!;
  const field = (await page.locator('#sq').boundingBox())!;
  expect(bar.height).toBeGreaterThanOrEqual(44);
  expect(field.height).toBeGreaterThanOrEqual(bar.height - 1);
  expect(field.x + field.width).toBeGreaterThanOrEqual(bar.x + bar.width - 1);
  // a tap near the bar edge, outside the old 25px strip, still focuses the field
  await page.locator('#sq').blur();
  await page.touchscreen.tap(bar.x + bar.width / 2, bar.y + 3);
  await expect(page.locator('#sq')).toBeFocused();
});

test('the Lumen settings checkbox has a 44px touch target and stays keyboard friendly', async ({
  page,
}) => {
  await fixtures(page);
  await page.goto('/me/lumen');
  const lock = page.locator('.cfg-lock').first();
  await expect(lock).toBeVisible();
  const input = lock.locator('input');
  const coarse = await page.evaluate(
    () => matchMedia('(pointer: coarse)').matches
  );
  if (coarse) {
    await lock.scrollIntoViewIfNeeded();
    const label = (await lock.boundingBox())!;
    const mark = (await input.boundingBox())!;
    expect(label.height).toBeGreaterThanOrEqual(44);
    expect(label.width).toBeGreaterThanOrEqual(44);
    expect(mark.width).toBeGreaterThanOrEqual(22);
    // the very left edge of the control, beside the box, still toggles it
    const before = await input.isChecked();
    await page.touchscreen.tap(label.x + 1, label.y + label.height / 2);
    expect(await input.isChecked()).toBe(!before);
  }
  await input.focus();
  const was = await input.isChecked();
  await page.keyboard.press('Space');
  expect(await input.isChecked()).toBe(!was);
});

test('a cold load asks for the public settings and the signed-in user once each', async ({
  page,
}) => {
  const counts: Record<string, number> = {};
  await fixtures(page, counts);
  await page.goto('/');
  await expect(page.locator('.navchips')).toBeVisible();
  // let late rows and rechecks settle before counting
  await page.waitForTimeout(1500);
  expect(counts).toMatchObject({ '/settings/public': 1, '/auth/me': 1 });
});

test('signing in does not ask for the public settings again', async ({
  page,
}) => {
  const counts: Record<string, number> = {};
  await fixtures(page);
  let signedIn = false;
  await page.route('**/api/v1/auth/me', (route) => {
    counts['/auth/me'] = (counts['/auth/me'] || 0) + 1;
    return route.fulfill(
      signedIn
        ? { json: { id: 1, displayName: 'fam', permissions: 2 } }
        : { status: 401, json: { message: 'NO_SESSION' } }
    );
  });
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: { loginStyle: 'form' } })
  );
  await page.route('**/api/v1/settings/public', (route) => {
    counts['/settings/public'] = (counts['/settings/public'] || 0) + 1;
    return route.fulfill({
      json: { mediaServerType: 2, localLogin: true, booksEnabled: true },
    });
  });
  await page.route('**/api/v1/auth/jellyfin', (route) => {
    signedIn = true;
    return route.fulfill({ json: { id: 1, displayName: 'fam' } });
  });
  await page.goto('/');
  await page.getByLabel('Username', { exact: true }).fill('fam');
  await page.getByLabel('Password').fill('secret');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.locator('.navchips')).toBeVisible();
  await page.waitForTimeout(1000);
  expect(counts['/settings/public']).toBe(1);
  // once to find out nobody is signed in, once after signing in
  expect(counts['/auth/me']).toBe(2);
});
