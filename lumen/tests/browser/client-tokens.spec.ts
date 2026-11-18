import { expect, test } from '@playwright/test';

test('client tokens display the secret once and revoke after confirmation', async ({
  page,
}) => {
  const token = {
    id: 7,
    name: 'Fixture Client',
    scopes: ['discover'],
    expiresAt: '2099-01-01T00:00:00Z',
  };
  let listed = false;
  let revoked = false;
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/api/v1/**', (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.slice('/api/v1'.length);
    if (path === '/auth/me')
      return route.fulfill({ json: { id: 2, permissions: 32, userType: 2 } });
    if (path === '/auth/client-tokens') {
      if (request.method() === 'POST') {
        expect(request.postDataJSON()).toEqual({
          name: 'Fixture Client',
          scopes: ['discover'],
          days: 7,
        });
        listed = true;
        return route.fulfill({
          status: 201,
          json: { ...token, token: 'sngc_synthetic_fixture_only' },
        });
      }
      return route.fulfill({ json: listed ? [token] : [] });
    }
    if (path === '/auth/client-tokens/7' && request.method() === 'DELETE') {
      listed = false;
      revoked = true;
      return route.fulfill({ status: 204 });
    }
    return route.fulfill({ json: {} });
  });
  await page.goto('/me/account');
  await page.getByRole('link', { name: 'Client Tokens' }).click();
  await page.getByLabel('Token Name').fill('Fixture Client');
  await page
    .getByRole('combobox', { name: 'Access', exact: true })
    .selectOption('discover');
  await page
    .getByRole('combobox', { name: 'Expires After', exact: true })
    .selectOption('7');
  await page.getByRole('button', { name: 'Create Token' }).click();
  await expect(
    page.getByRole('textbox', { name: 'New Client Token' })
  ).toHaveValue('sngc_synthetic_fixture_only');
  await page.getByRole('button', { name: 'Dismiss Token' }).click();
  await page.reload();
  await expect(
    page.getByRole('textbox', { name: 'New Client Token' })
  ).toHaveCount(0);
  await page
    .getByRole('button', { name: 'Revoke token Fixture Client' })
    .click();
  expect(revoked).toBe(false);
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Revoke Token' })
    .click();
  await expect(page.getByText('Token revoked.')).toBeVisible();
  await expect(page.getByText('No client tokens yet.')).toBeVisible();
  expect(revoked).toBe(true);
});
