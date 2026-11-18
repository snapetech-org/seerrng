import { expect, test } from '@playwright/test';

test('OIDC signs in and restores the requested route with search and hash', async ({
  page,
}) => {
  const state = 'synthetic-login-state-1234';
  const destination = '/requests?fixture=1#requests';
  let signedIn = false;
  let callbacks = 0;
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/fixture-oidc?*', (route) => {
    const provider = new URL(route.request().url());
    const callback = new URL(provider.searchParams.get('redirect_uri')!);
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
      return signedIn
        ? route.fulfill({
            json: { id: 2, permissions: 32, displayName: 'Fixture Viewer' },
          })
        : route.fulfill({ status: 401, json: {} });
    if (path === '/settings/public')
      return route.fulfill({
        json: {
          openIdProviders: [{ slug: 'fixture', name: 'Fixture Identity' }],
        },
      });
    if (path === '/auth/oidc/login/fixture') {
      expect(url.searchParams.get('returnUrl')).toBe('/login');
      expect(url.searchParams.get('returnTo')).toBe(destination);
      const provider = new URL('/fixture-oidc', url);
      provider.search = new URLSearchParams({
        redirect_uri: new URL('/login', url).href,
        state,
      }).toString();
      return route.fulfill({ json: { redirectUrl: provider.href } });
    }
    if (path === '/auth/oidc/callback/fixture') {
      callbacks++;
      expect(
        new URL(request.postDataJSON().callbackUrl).searchParams.get('state')
      ).toBe(state);
      signedIn = true;
      return route.fulfill({ status: 204 });
    }
    return route.fulfill({ json: { results: [] } });
  });
  await page.goto(destination);
  await page
    .getByRole('button', { name: 'Sign in with Fixture Identity' })
    .click();
  await expect(page).toHaveURL(/\/requests\?fixture=1#requests$/);
  await expect(page.getByRole('heading', { name: 'Requests' })).toBeVisible();
  expect(callbacks).toBe(1);
});
