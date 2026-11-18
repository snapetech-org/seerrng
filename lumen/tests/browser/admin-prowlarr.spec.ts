import { expect, test } from '@playwright/test';

test('Prowlarr tests the draft without overwriting the saved API key', async ({
  page,
}, info) => {
  const writes: { method: string; body: unknown }[] = [];
  const path = '/api/v1/settings/prowlarr';
  const initial = {
    hostname: 'prowlarr',
    port: 9696,
    baseUrl: '',
    useSsl: false,
    apiKeyConfigured: true,
  };
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', (route) => {
    const request = route.request();
    const endpoint = new URL(request.url()).pathname;
    if (endpoint.endsWith('/auth/me'))
      return route.fulfill({ json: { id: 1, permissions: 2 } });
    if (endpoint === path + '/coverage')
      return route.fulfill({ json: { configured: true, totalIndexers: 1 } });
    if (endpoint === path && request.method() === 'GET')
      return route.fulfill({ json: initial });
    if (endpoint === path + '/test' || endpoint === path) {
      const body = request.postDataJSON();
      writes.push({ method: request.method(), body });
      return route.fulfill({
        json: endpoint.endsWith('/test')
          ? {
              version: '1.0',
              totalIndexers: 1,
              enabledSearchableIndexers: 1,
              indexers: [
                {
                  id: 1,
                  name: 'Example Indexer',
                  enabled: true,
                  supportsSearch: true,
                },
              ],
              diagnostics: [{ id: 1, name: 'Example Indexer', success: true }],
            }
          : { ...initial, ...body },
      });
    }
    return route.fulfill({ json: {} });
  });
  await page.goto('/me');
  await page.getByRole('link', { name: 'Open Prowlarr Settings' }).click();
  await expect(page.getByLabel('API Key', { exact: true })).toHaveValue('');
  await page.getByLabel('Port', { exact: true }).fill('9697');
  await page.getByRole('button', { name: 'Test Prowlarr Connection' }).click();
  await expect(
    page.getByText('Connection Passed', { exact: true })
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Save Prowlarr', exact: true })
    .click();
  await expect(page.getByText('Prowlarr settings saved.')).toBeVisible();
  expect(writes).toEqual(
    ['POST', 'PUT'].map((method) => ({
      method,
      body: {
        hostname: 'prowlarr',
        port: 9697,
        baseUrl: '',
        useSsl: false,
        apiKey: '',
        clearApiKey: false,
        searchLimitPerUserPerMinute: 12,
        showIndexerDetails: false,
      },
    }))
  );
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth)
  ).toBeLessThanOrEqual(page.viewportSize()!.width);
  if (process.env.LUMEN_CAPTURE_PROWLARR)
    await page.screenshot({
      path: info.outputPath('prowlarr.png'),
      fullPage: true,
    });
});
