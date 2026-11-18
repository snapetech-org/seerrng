import { expect, test } from '@playwright/test';

test('Navidrome can connect, reuse a saved password, and disconnect', async ({
  page,
}, info) => {
  const endpoint = '/api/v1/settings/navidrome';
  const tests: Record<string, unknown>[] = [];
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.endsWith('/auth/me'))
      return route.fulfill({ json: { id: 1, permissions: 2 } });
    if (path === endpoint + '/test') {
      tests.push(request.postDataJSON());
      return route.fulfill({ status: 204 });
    }
    if (path !== endpoint) return route.fulfill({ json: {} });
    if (request.method() === 'GET')
      return route.fulfill({ body: 'null', contentType: 'application/json' });
    if (request.method() === 'DELETE') return route.fulfill({ status: 204 });
    return route.fulfill({
      json: { ...request.postDataJSON(), password: '[REDACTED]' },
    });
  });
  await page.goto('/me');
  await page.getByRole('link', { name: 'Open Navidrome Settings' }).click();
  await page.getByLabel('Server URL').fill('https://music.internal');
  await page.getByLabel('Username').fill('listener');
  await page.getByLabel('Password').fill('fixture-password');
  await page.getByRole('button', { name: 'Test Connection' }).click();
  await expect(page.getByText('Navidrome connection verified.')).toBeVisible();
  await page.getByRole('button', { name: 'Save Changes' }).click();
  await expect(page.getByText('Navidrome settings saved.')).toBeVisible();
  await page.getByRole('button', { name: 'Test Connection' }).click();
  await expect(page.getByText('Navidrome connection verified.')).toBeVisible();
  expect(tests[1]).toMatchObject({
    username: 'listener',
    password: '[REDACTED]',
    syncEnabled: true,
  });
  await page.screenshot({
    path: info.outputPath('navidrome.png'),
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Disconnect', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm Disconnect' }).click();
  await expect(page.getByText('Navidrome disconnected.')).toBeVisible();
  await expect(page.getByLabel('Server URL')).toHaveValue('');
});
