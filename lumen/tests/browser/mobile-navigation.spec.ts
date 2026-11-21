import { expect, test } from '@playwright/test';

test('mobile tabs yield to long forms on scroll and return on scroll up', async ({
  page,
}, testInfo) => {
  const viewport = page.viewportSize();
  test.skip(!viewport || viewport.width >= 1040, 'Mobile tab bar only');

  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname
      .replace(/^\/lumen/, '')
      .replace(/^\/api\/v1/, '');
    if (path === '/auth/me')
      return route.fulfill({ json: { id: 1, permissions: 2, userType: 2 } });
    if (path === '/settings/public')
      return route.fulfill({
        json: {
          applicationTitle: 'SeerrNG',
          mediaServerType: 4,
          enabledMediaCategories: { movie: true, tv: true, ebook: true },
        },
      });
    if (path === '/user/1/settings/main')
      return route.fulfill({ json: { locale: 'en' } });
    if (path === '/user')
      return route.fulfill({
        json: {
          pageInfo: { pages: 1, results: 8 },
          results: Array.from({ length: 8 }, (_, index) => ({
            id: index + 2,
            displayName: `Demo User ${index + 1}`,
            email: `demo-${index + 1}@example.test`,
            permissions: 0,
            requestCount: index,
            userType: 1,
          })),
        },
      });
    return route.fulfill({ json: {} });
  });

  await page.goto('/admin/users');
  await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible();
  const tabs = page.locator('.tabbar');
  await expect(tabs).toBeVisible();
  await expect(tabs).not.toHaveAttribute('data-hidden');
  await page.getByRole('button', { name: 'Create Local User' }).click();
  await expect(
    page.getByRole('heading', { name: 'Create Local User' })
  ).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollHeight))
    .toBeGreaterThan(viewport!.height + 300);

  await page.evaluate(() => window.scrollTo(0, 96));
  await page.waitForFunction(() => window.scrollY > 48);
  await expect(tabs).toHaveAttribute('data-hidden', 'true');
  await expect(tabs).toHaveAttribute('aria-hidden', 'true');
  await expect(page.getByRole('navigation', { name: 'Tabs' })).toHaveCount(0);
  expect(await tabs.evaluate((element: HTMLElement) => element.inert)).toBe(
    true
  );
  await expect
    .poll(() => tabs.evaluate((element) => getComputedStyle(element).opacity))
    .toBe('0');
  if (
    testInfo.project.name === 'iphone' ||
    testInfo.project.name === 'tablet'
  ) {
    await page.screenshot({
      path: testInfo.outputPath('tabs-hidden-on-scroll.png'),
    });
  }

  await page.evaluate(() => window.scrollTo(0, 40));
  await page.waitForFunction(() => window.scrollY <= 40);
  await expect(tabs).not.toHaveAttribute('data-hidden');
  await expect
    .poll(() => tabs.evaluate((element) => getComputedStyle(element).opacity))
    .toBe('1');
  await page
    .getByRole('navigation', { name: 'Tabs' })
    .getByRole('link', { name: 'Requests' })
    .focus();
  await page.evaluate(() => window.scrollTo(0, 96));
  await page.waitForFunction(() => window.scrollY > 48);
  await expect(tabs).not.toHaveAttribute('data-hidden');
  await expect(
    page
      .getByRole('navigation', { name: 'Tabs' })
      .getByRole('link', { name: 'Requests' })
  ).toBeFocused();
});
