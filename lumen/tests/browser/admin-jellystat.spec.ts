import { expect, test } from '@playwright/test';

test('Jellystat can connect, reuse a saved password, and disconnect', async ({
  page,
}, info) => {
  const endpoint = '/api/v1/settings/jellystat';
  const tests: Record<string, unknown>[] = [];
  let saved: Record<string, unknown> | null = null;
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
    if (request.method() === 'GET') return route.fulfill({ json: saved });
    if (request.method() === 'DELETE') {
      saved = null;
      return route.fulfill({ status: 204 });
    }
    if (request.method() === 'PUT') {
      saved = { ...request.postDataJSON(), apiKey: '[REDACTED]' };
      return route.fulfill({ json: saved });
    }
    return route.fulfill({ status: 405 });
  });
  await page.goto('/me');
  await page.getByRole('link', { name: 'Open Jellystat Settings' }).click();
  await page.getByLabel('Server URL').fill('https://music.internal');
  await page.getByLabel('API Key').fill('fixture-password');
  await page.getByRole('button', { name: 'Test Connection' }).click();
  await expect(page.getByText('Jellystat connection verified.')).toBeVisible();
  await page.getByRole('button', { name: 'Save Changes' }).click();
  await expect(page.getByText('Jellystat settings saved.')).toBeVisible();
  await page.getByRole('button', { name: 'Test Connection' }).click();
  await expect(page.getByText('Jellystat connection verified.')).toBeVisible();
  expect(tests[1]).toMatchObject({
    apiKey: '[REDACTED]',
  });
  await page.screenshot({
    path: info.outputPath('jellystat.png'),
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Disconnect', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm Disconnect' }).click();
  await expect(page.getByText('Jellystat disconnected.')).toBeVisible();
  await expect(page.getByLabel('Server URL')).toHaveValue('');
});
