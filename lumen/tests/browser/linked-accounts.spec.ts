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

test('tracking accounts read back write preferences and confirm disconnect', async ({
  page,
}) => {
  const base = '/integrations/discovery/accounts';
  let connected = true;
  let allowWrites = false;
  let denied = true;
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/api/v1/**', (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.slice('/api/v1'.length);
    if (path === '/auth/me')
      return route.fulfill({ json: { id: 2, permissions: 32, userType: 2 } });
    if (path === '/user/2/settings/linked-accounts')
      return route.fulfill({ json: [] });
    if (path === base)
      return route.fulfill({
        json: {
          accounts: connected
            ? [{ provider: 'trakt', username: 'Viewer', allowWrites }]
            : [],
        },
      });
    if (path === base + '/trakt/preferences') {
      expect(request.method()).toBe('PUT');
      expect(request.postDataJSON()).toEqual({ allowWrites: true });
      if (denied) {
        denied = false;
        return route.fulfill({ status: 403, json: {} });
      }
      allowWrites = true;
      return route.fulfill({ status: 204 });
    }
    if (path === base + '/trakt') {
      expect(request.method()).toBe('DELETE');
      connected = false;
      return route.fulfill({ status: 204 });
    }
    return route.fulfill({ json: {} });
  });

  await page.goto('/me/account/linked-accounts');
  const writes = page.getByRole('checkbox', { name: 'Allow writes to Trakt' });
  await writes.check({ trial: true });
  await writes.click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(writes).not.toBeChecked();
  await writes.click();
  await expect(writes).toBeChecked();
  await page.getByRole('button', { name: 'Disconnect Trakt' }).click();
  const confirmation = page.getByRole('alertdialog');
  await confirmation.getByRole('button', { name: 'Keep connected' }).click();
  await expect(writes).toBeChecked();
  await page.getByRole('button', { name: 'Disconnect Trakt' }).click();
  await confirmation
    .getByRole('button', { name: 'Disconnect', exact: true })
    .click();
  await expect(
    page.getByText('No tracking accounts are connected.')
  ).toBeVisible();
});

test('AniList connects through a code submitted in the request body', async ({
  page,
}) => {
  const base = '/integrations/discovery';
  let connected = false;
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/api/v1/**', (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.slice('/api/v1'.length);
    if (path === '/auth/me')
      return route.fulfill({ json: { id: 2, permissions: 32, userType: 2 } });
    if (path === '/user/2/settings/linked-accounts')
      return route.fulfill({ json: [] });
    if (path === base + '/configuration')
      return route.fulfill({ json: { anilist: { configured: true } } });
    if (path === base + '/accounts')
      return route.fulfill({
        json: {
          accounts: connected
            ? [
                {
                  provider: 'anilist',
                  username: 'Ani Viewer',
                  allowWrites: false,
                },
              ]
            : [],
        },
      });
    if (path === base + '/accounts/anilist/connect')
      return route.fulfill({
        json: {
          verificationUrl:
            'https://anilist.co/api/v2/oauth/authorize?client_id=123',
        },
      });
    if (path === base + '/accounts/anilist/complete') {
      expect(request.method()).toBe('POST');
      expect(request.postDataJSON()).toEqual({ code: 'fixture-code' });
      connected = true;
      return route.fulfill({ json: { status: 'authorized' } });
    }
    return route.fulfill({ json: {} });
  });
  await page.goto('/me/account/linked-accounts');
  const connect = page.getByRole('button', {
    name: 'Connect AniList',
    exact: true,
  });
  await connect.click();
  const authorize = page.getByRole('link', { name: 'Authorize on AniList' });
  await expect(authorize).toHaveAttribute('target', '_blank');
  const code = page.getByLabel('AniList authorization code');
  await code.fill('discard-this');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await connect.click();
  await expect(code).toHaveValue('');
  await code.fill('  fixture-code  ');
  await page
    .getByRole('button', { name: 'Complete AniList Connection' })
    .click();
  await expect(page.getByText('Ani Viewer')).toBeVisible();
  await expect(code).toHaveCount(0);
  expect(new URL(page.url()).search).toBe('');
});

test('Simkl stops polling on cancel and links after provider approval', async ({
  page,
}) => {
  const base = '/integrations/discovery';
  let connected = false;
  let polls = 0;
  await page.clock.install();
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/api/v1/**', (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.slice('/api/v1'.length);
    if (path === '/auth/me')
      return route.fulfill({ json: { id: 2, permissions: 32, userType: 2 } });
    if (path === '/user/2/settings/linked-accounts')
      return route.fulfill({ json: [] });
    if (path === base + '/configuration')
      return route.fulfill({ json: { simkl: { configured: true } } });
    if (path === base + '/accounts')
      return route.fulfill({
        json: {
          accounts: connected
            ? [
                {
                  provider: 'simkl',
                  username: 'Simkl Viewer',
                  allowWrites: false,
                },
              ]
            : [],
        },
      });
    if (path === base + '/accounts/simkl/connect')
      return route.fulfill({
        json: { userCode: 'PIN123', expiresIn: 30, interval: 5 },
      });
    if (path === base + '/accounts/simkl/complete') {
      expect(route.request().method()).toBe('POST');
      polls++;
      if (polls === 1)
        return route.fulfill({
          status: 202,
          json: { status: 'pending', interval: 8 },
        });
      connected = true;
      return route.fulfill({ json: { status: 'authorized' } });
    }
    return route.fulfill({ json: {} });
  });
  await page.goto('/me/account/linked-accounts');
  const connect = page.getByRole('button', {
    name: 'Connect Simkl',
    exact: true,
  });
  await connect.click();
  await expect(page.getByText('PIN123')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel Simkl Connection' }).click();
  await page.clock.fastForward(6000);
  expect(polls).toBe(0);
  await connect.click();
  await expect(
    page.getByRole('link', { name: 'Authorize on Simkl' })
  ).toHaveAttribute('href', 'https://simkl.com/pin/');
  await page.clock.fastForward(5000);
  await expect.poll(() => polls).toBe(1);
  await page.clock.fastForward(7000);
  expect(polls).toBe(1);
  await page.clock.fastForward(1500);
  await expect(page.getByText('Simkl Viewer')).toBeVisible();
});
