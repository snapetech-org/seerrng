import { expect, test } from '@playwright/test';

test('Radarr creation tests credentials and assigns a request destination', async ({
  page,
}, info) => {
  const writes: { method: string; body?: Record<string, unknown> }[] = [];
  let services: Record<string, unknown>[] = [];
  const path = '/api/v1/settings/radarr';
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', (route) => {
    const request = route.request();
    const endpoint = new URL(request.url()).pathname;
    if (endpoint.endsWith('/auth/me'))
      return route.fulfill({ json: { id: 1, permissions: 2 } });
    if (!endpoint.startsWith(path)) return route.fulfill({ json: {} });
    const method = request.method();
    if (method === 'GET') return route.fulfill({ json: services });
    if (method === 'DELETE') {
      writes.push({ method });
      services = [];
      return route.fulfill({ status: 204 });
    }
    const body = request.postDataJSON();
    writes.push({ method, body });
    if (endpoint.endsWith('/test'))
      return route.fulfill({
        json: {
          profiles: [{ id: 2, name: 'HD' }],
          rootFolders: [{ id: 1, path: '/movies' }],
          tags: [{ id: 3, label: 'requested' }],
        },
      });
    const result = { ...body, id: 0, apiKey: '[REDACTED]' };
    services = [result];
    return route.fulfill({ json: result });
  });
  await page.goto('/me');
  await page.getByRole('link', { name: 'Open Radarr Services' }).click();
  await page.getByRole('button', { name: 'Add Radarr' }).click();
  await page.getByLabel('Service Name').fill('Home Radarr');
  await page.getByLabel('Hostname').fill('radarr.internal');
  await page.getByLabel('API Key').fill('fixture-key');
  const save = page.getByRole('button', { name: 'Save Radarr' });
  await expect(save).toBeDisabled();
  await page.getByRole('button', { name: 'Test Radarr' }).click();
  await page.getByLabel('Quality Profile').selectOption('2');
  await page.getByLabel('Root Folder').selectOption('/movies');
  await save.click();
  await page.getByRole('button', { name: 'Edit Home Radarr' }).click();
  await expect(page.getByLabel('API Key')).toHaveValue('');
  await page.getByLabel('Request Button Label').fill('Home Movies');
  await save.click();
  await page.getByRole('button', { name: 'Edit Home Radarr' }).click();
  if (process.env.LUMEN_CAPTURE_RADARR) {
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.screenshot({
      path: info.outputPath('radarr.png'),
      fullPage: true,
    });
  }
  await page.getByRole('button', { name: 'Remove Service' }).click();
  expect(writes).toHaveLength(3);
  await page.getByRole('button', { name: 'Confirm Removal' }).click();
  await expect(page.getByText('No Radarr services configured.')).toBeVisible();
  expect(writes).toEqual([
    {
      method: 'POST',
      body: expect.objectContaining({
        apiKey: 'fixture-key',
        hostname: 'radarr.internal',
      }),
    },
    {
      method: 'POST',
      body: expect.objectContaining({
        activeProfileId: 2,
        activeProfileName: 'HD',
        activeDirectory: '/movies',
      }),
    },
    {
      method: 'PUT',
      body: expect.objectContaining({
        apiKey: '[REDACTED]',
        requestButtonLabel: 'Home Movies',
      }),
    },
    { method: 'DELETE' },
  ]);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth)
  ).toBeLessThanOrEqual(page.viewportSize()!.width);
});
