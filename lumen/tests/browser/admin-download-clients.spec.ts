import { expect, test } from '@playwright/test';

test('download clients test and save with the existing credential', async ({
  page,
}, info) => {
  const endpoint = '/api/v1/settings/download-clients';
  let saved = {
    pollIntervalSeconds: 3,
    clients: [
      {
        id: 7,
        name: 'Usenet',
        type: 'sabnzbd',
        hostname: 'sab.internal',
        port: 8080,
        enabled: true,
        passwordConfigured: true,
        password: '[REDACTED]',
      },
    ],
  };
  const writes: Record<string, unknown>[] = [];
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.endsWith('/auth/me'))
      return route.fulfill({ json: { id: 1, permissions: 2 } });
    if (path === endpoint + '/status')
      return route.fulfill({ json: { clients: [{ clientId: 7, ok: true }] } });
    if (path === endpoint + '/test') {
      writes.push(request.postDataJSON());
      return route.fulfill({ json: { success: true, version: 'fixture' } });
    }
    if (path !== endpoint) return route.fulfill({ json: {} });
    if (request.method() === 'PUT') {
      const body = request.postDataJSON();
      writes.push(body);
      saved = {
        ...body,
        clients: body.clients.map((row: object) => ({
          ...row,
          passwordConfigured: true,
          password: '[REDACTED]',
        })),
      };
    }
    return route.fulfill({ json: saved });
  });
  await page.goto('/me');
  await page
    .getByRole('link', { name: 'Open Download Client Settings' })
    .click();
  await page.getByText('Usenet', { exact: true }).click();
  await expect(page.getByLabel('API Key')).toHaveValue('');
  await page.getByRole('button', { name: 'Test Client' }).click();
  await expect(page.getByText('Connected to Usenet (fixture).')).toBeVisible();
  await page.getByLabel('Refresh Interval (Seconds)').fill('8');
  await page.screenshot({
    path: info.outputPath('download-clients.png'),
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Save Changes' }).click();
  await expect(page.getByText('Download client settings saved.')).toBeVisible();
  expect(writes[0]).toMatchObject({
    id: 7,
    type: 'sabnzbd',
    clearPassword: false,
  });
  expect(writes[0]).not.toHaveProperty('password');
  expect(writes[1]).toMatchObject({
    pollIntervalSeconds: 8,
    clients: [{ id: 7, type: 'sabnzbd' }],
  });
  expect((writes[1].clients as unknown[])[0]).not.toHaveProperty('password');
});
