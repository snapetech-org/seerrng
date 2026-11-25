import { expect, test, type Page } from '@playwright/test';

const mount = process.env.LUMEN_TEST_MOUNT === '/lumen' ? '/lumen' : '';

async function openMenu(page: Page, permissions: number) {
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname
      .replace(/^\/lumen(?=\/)/, '')
      .replace(/^\/api\/v1/, '');
    if (path === '/auth/me')
      return route.fulfill({
        json: { id: 1, displayName: 'Household', permissions, userType: 2 },
      });
    if (path === '/settings/public')
      return route.fulfill({
        json: { mediaServerType: 1, enabledMediaCategories: {} },
      });
    if (path === '/user/1/settings/main')
      return route.fulfill({ json: { locale: 'en' } });
    return route.fulfill({ json: {} });
  });
  await page.goto(`${mount}/me`);
  if ((page.viewportSize()?.width ?? 0) < 1040)
    await page.getByRole('button', { name: 'More navigation' }).click();
  return page.locator('.side');
}

test('administrators have a direct user management menu link', async ({
  page,
}) => {
  const menu = await openMenu(page, 2);
  const users = menu.getByRole('link', { name: 'User List', exact: true });
  await users.scrollIntoViewIfNeeded();
  await expect(users).toBeInViewport();
  await expect(users).toHaveAttribute('href', '/admin/users');
});

test('delegated user managers have a direct user management menu link', async ({
  page,
}) => {
  const menu = await openMenu(page, 8);
  const users = menu.getByRole('link', { name: 'User List', exact: true });
  await users.scrollIntoViewIfNeeded();
  await expect(users).toBeInViewport();
  await expect(users).toHaveAttribute('href', '/admin/users');
});

test('regular users do not see user management navigation', async ({
  page,
}) => {
  const menu = await openMenu(page, 32);
  await expect(
    menu.getByRole('link', { name: 'User List', exact: true })
  ).toHaveCount(0);
});
