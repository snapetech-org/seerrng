import { expect, test } from '@playwright/test';

test('ReadMeABook tests with the stored key and explicitly removes it when disabled', async ({
  page,
}, info) => {
  const path = '/api/v1/settings/readmeabook';
  const settings = {
    enabled: true,
    hostname: 'books.internal',
    port: 3030,
    useSsl: false,
    baseUrl: '',
    apiKeyConfigured: true,
  };
  const approvals = '/api/v1/readmeabook/admin/requests';
  let waiting = [
    {
      id: 7,
      title: 'Fixture Book',
      author: 'Fixture Author',
      user: { username: 'listener' },
    },
    { id: 8, title: 'Second Book', user: null },
  ];
  const decisions: string[] = [];
  const writes: Record<string, unknown>[] = [];
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (pathname.endsWith('/auth/me'))
      return route.fulfill({ json: { id: 1, permissions: 2 } });
    if (pathname === path + '/test') {
      writes.push(request.postDataJSON());
      return route.fulfill({ json: { success: true } });
    }
    if (pathname === '/api/v1/readmeabook/admin/dashboard')
      return route.fulfill({
        json: {
          metrics: { waiting: waiting.length },
          activeDownloads: [],
          recentRequests: [],
        },
      });
    if (pathname === approvals) return route.fulfill({ json: waiting });
    if (pathname.startsWith(approvals + '/')) {
      decisions.push(pathname.slice(approvals.length));
      waiting = waiting.filter(({ id }) => !pathname.includes(`/${id}/`));
      return route.fulfill({ json: {} });
    }
    if (pathname !== path) return route.fulfill({ json: {} });
    if (request.method() === 'GET') return route.fulfill({ json: settings });
    const body = request.postDataJSON();
    writes.push(body);
    return route.fulfill({
      json: { ...settings, ...body, apiKeyConfigured: !body.clearApiKey },
    });
  });
  await page.goto('/me');
  await page.getByRole('link', { name: 'Open ReadMeABook Settings' }).click();
  await page.getByRole('button', { name: 'Test Connection' }).click();
  await expect(page.getByText('Connected to ReadMeABook.')).toBeVisible();
  expect(writes[0]).not.toHaveProperty('apiKey');
  await page.getByText('Metrics', { exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Metrics' })).toHaveValue(
    /"waiting": 2/
  );
  await page.screenshot({
    path: info.outputPath('operations.png'),
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Approve Fixture Book' }).click();
  await expect(
    page.getByRole('button', { name: 'Approve Fixture Book' })
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Deny Second Book' }).click();
  await expect(
    page.getByText('No audiobook requests are waiting for approval.')
  ).toBeVisible();
  expect(decisions).toEqual(['/7/approve', '/8/deny']);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.screenshot({
    path: info.outputPath('readmeabook.png'),
    fullPage: true,
  });
  await page.getByLabel('Remove Saved API Token').check();
  await expect(
    page.getByRole('button', { name: 'Save Changes' })
  ).toBeDisabled();
  await page.getByLabel('Enable ReadMeABook Requests').uncheck();
  await page.getByRole('button', { name: 'Save Changes' }).click();
  await expect(page.getByText('ReadMeABook settings saved.')).toBeVisible();
  await expect(page.getByLabel('Remove Saved API Token')).toHaveCount(0);
  expect(writes[1]).toMatchObject({ enabled: false, clearApiKey: true });
});
