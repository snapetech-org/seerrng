import { expect, test } from '@playwright/test';

const mount = process.env.LUMEN_TEST_MOUNT === '/lumen' ? '/lumen' : '';
const appPath = (path: string) => `${mount}${path}`;

test('Swipe navigation stays hidden when the administrator disables it', async ({
  page,
}) => {
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
        json: { id: 1, displayName: 'Fixture User', permissions: 2 },
      });
    if (path === '/settings/public')
      return route.fulfill({ json: { swipeEnabled: false } });
    if (path === '/user/1/settings/main') return route.fulfill({ json: {} });
    return route.fulfill({ json: {} });
  });

  await page.goto(appPath('/'));
  const desktop = (page.viewportSize()?.width ?? 0) >= 1040;
  if (desktop) {
    const mainNav = page.getByRole('navigation', {
      name: 'Main navigation',
      exact: true,
    });
    const swipe = mainNav.getByRole('link', { name: 'Swipe', exact: true });
    await expect(swipe).toHaveCount(0);
  }

  await page.goto(appPath('/me'));
  const accountSwipe = page.getByRole('link', {
    name: 'Open Swipe',
    exact: true,
  });
  await expect(accountSwipe).toHaveCount(0);
});
