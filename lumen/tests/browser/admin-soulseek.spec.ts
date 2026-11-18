import { expect, test } from '@playwright/test';

test('Soulseek tests with the stored key and explicitly removes it when disabled', async ({
  page,
}, info) => {
  const path = '/api/v1/settings/slskdn';
  const settings = {
    enabled: true,
    hostname: 'slskd.internal',
    port: 5030,
    useSsl: false,
    baseUrl: '',
    searchFilter: '',
    apiKeyConfigured: true,
  };
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
      return route.fulfill({
        json: {
          version: 'fixture',
          features: { wishlist: true, libraryHealth: true, songId: false },
        },
      });
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
  await page.getByRole('link', { name: 'Open Soulseek Settings' }).click();
  await page.getByRole('button', { name: 'Test Connection' }).click();
  await expect(page.getByText('SongID unavailable.')).toBeVisible();
  expect(writes[0]).not.toHaveProperty('apiKey');
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.screenshot({
    path: info.outputPath('soulseek.png'),
    fullPage: true,
  });
  await page.getByLabel('Remove Saved API Key').check();
  await expect(
    page.getByRole('button', { name: 'Save Changes' })
  ).toBeDisabled();
  await page.getByLabel('Enable Soulseek Requests').uncheck();
  await page.getByRole('button', { name: 'Save Changes' }).click();
  await expect(page.getByText('Soulseek settings saved.')).toBeVisible();
  await expect(page.getByLabel('Remove Saved API Key')).toHaveCount(0);
  expect(writes[1]).toMatchObject({ enabled: false, clearApiKey: true });
});
