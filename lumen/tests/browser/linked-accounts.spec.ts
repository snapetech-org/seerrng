import { expect, test } from '@playwright/test';

test('Quick Connect links the signed-in account without calling login', async ({
  page,
}) => {
  const calls: string[] = [];
  let linked = false;
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/api/v1/**', (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.slice('/api/v1'.length);
    if (path === '/auth/me')
      return route.fulfill({
        json: {
          id: 2,
          permissions: 32,
          userType: linked ? 3 : 2,
          jellyfinUsername: linked ? 'Fixture Viewer' : null,
        },
      });
    if (path === '/settings/public')
      return route.fulfill({
        json: { mediaServerType: 2, jellyfinQuickConnectOnly: true },
      });
    if (path === '/user/2/settings/linked-accounts')
      return route.fulfill({ json: [] });
    if (path === '/user/2/settings/password')
      return route.fulfill({ json: { hasPassword: true } });
    if (path.includes('quickconnect')) calls.push(path);
    if (path === '/auth/jellyfin/quickconnect/initiate')
      return route.fulfill({
        json: { code: '123456', secret: 'synthetic-secret' },
      });
    if (path === '/auth/jellyfin/quickconnect/check')
      return route.fulfill({ json: { authenticated: true } });
    if (path === '/user/2/settings/linked-accounts/jellyfin/quickconnect') {
      expect(request.postDataJSON()).toEqual({ secret: 'synthetic-secret' });
      linked = true;
      return route.fulfill({ status: 204 });
    }
    return route.fulfill({ json: {} });
  });
  await page.goto('/me/account/linked-accounts');
  await page.getByRole('button', { name: 'Start Quick Connect' }).click();
  await expect(page.getByText('123456')).toBeVisible();
  await expect(page.getByText('Account linked.')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Unlink Jellyfin' })
  ).toBeVisible();
  await expect(page.getByLabel('Media Server Password')).toHaveCount(0);
  expect(calls).toEqual([
    '/auth/jellyfin/quickconnect/initiate',
    '/auth/jellyfin/quickconnect/check',
    '/user/2/settings/linked-accounts/jellyfin/quickconnect',
  ]);
});
