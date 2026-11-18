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

test('OIDC linking validates the round trip and consumes the callback once', async ({
  page,
}) => {
  const state = 'synthetic-state-012345';
  let linked = false;
  let callbacks = 0;
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/fixture-oidc?*', (route) => {
    const url = new URL(route.request().url());
    const callback = new URL(url.searchParams.get('redirect_uri')!);
    callback.search = new URLSearchParams({
      code: 'synthetic-code',
      state,
    }).toString();
    return route.fulfill({ status: 302, headers: { location: callback.href } });
  });
  await page.route('**/api/v1/**', (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.slice('/api/v1'.length);
    if (path === '/auth/me')
      return route.fulfill({ json: { id: 2, permissions: 32, userType: 2 } });
    if (path === '/settings/public')
      return route.fulfill({
        json: {
          openIdProviders: [{ slug: 'fixture', name: 'Fixture Identity' }],
        },
      });
    if (path === '/user/2/settings/linked-accounts')
      return route.fulfill({
        json: linked
          ? [
              {
                id: 9,
                username: 'Viewer',
                provider: { slug: 'fixture', name: 'Fixture Identity' },
              },
            ]
          : [],
      });
    if (path === '/user/2/settings/password')
      return route.fulfill({ json: { hasPassword: true } });
    if (path === '/auth/oidc/login/fixture') {
      const callbackPath = '/me/account/linked-accounts';
      expect(url.searchParams.get('returnUrl')).toBe(callbackPath);
      const provider = new URL('/fixture-oidc', url);
      provider.search = new URLSearchParams({
        redirect_uri: new URL(callbackPath, url).href,
        state,
      }).toString();
      return route.fulfill({ json: { redirectUrl: provider.href } });
    }
    if (path === '/auth/oidc/callback/fixture') {
      callbacks++;
      expect(
        new URL(request.postDataJSON().callbackUrl).searchParams.get('code')
      ).toBe('synthetic-code');
      linked = true;
      return route.fulfill({ status: 204 });
    }
    return route.fulfill({ json: {} });
  });
  await page.goto('/me/account/linked-accounts');
  await page
    .getByRole('button', { name: 'Link Fixture Identity', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Unlink Fixture Identity' })
  ).toBeVisible();
  await expect(page).toHaveURL(/\/me\/account\/linked-accounts$/);
  expect(callbacks).toBe(1);
});
