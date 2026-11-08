import { expect, test } from '@playwright/test';

test('Lumen sends the current SeerrNG CSRF cookie on sign-in', async ({
  page,
  context,
  baseURL,
}) => {
  await context.addCookies([
    { name: 'XSRF-TOKEN', value: 'current%20token', url: baseURL! },
  ]);
  let signedIn = false;
  await page.route('**/lumen-config.json', (r) => r.fulfill({ json: {} }));
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.endsWith('/auth/local')) {
      expect(request.headers()['x-xsrf-token']).toBe('current token');
      signedIn = true;
      return route.fulfill({
        json: { id: 1, displayName: 'Household', permissions: 2 },
      });
    }
    if (path.endsWith('/auth/me'))
      return route.fulfill(
        signedIn
          ? { json: { id: 1, displayName: 'Household', permissions: 2 } }
          : { status: 401, json: {} }
      );
    if (path.endsWith('/settings/public'))
      return route.fulfill({
        json: { localLogin: true, plexLogin: false, mediaServerType: 1 },
      });
    return route.fulfill({
      json: { results: [], totalResults: 0, totalPages: 1, page: 1 },
    });
  });
  await page.goto('/');
  const email = page.getByLabel('Email', { exact: true });
  const alternate = page.getByRole('button', {
    name: 'Use an email and password instead',
  });
  await expect(email.or(alternate)).toBeVisible();
  if (await alternate.isVisible()) await alternate.click();
  await email.fill('family@fixture.invalid');
  await page.getByLabel('Password', { exact: true }).fill('example-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.locator('.app')).toBeVisible();
  expect(signedIn).toBe(true);
});
