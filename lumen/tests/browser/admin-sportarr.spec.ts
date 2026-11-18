import { expect, test } from '@playwright/test';

test('Sportarr saves the quality profile without requiring a root folder', async ({
  page,
}, info) => {
  const endpoint = '/api/v1/settings/sportarr';
  let saved: Record<string, unknown> | undefined;
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.endsWith('/auth/me'))
      return route.fulfill({ json: { id: 1, permissions: 2 } });
    if (path === endpoint + '/test')
      return route.fulfill({
        json: { profiles: [{ id: 4, name: 'HD Sports' }] },
      });
    if (path !== endpoint) return route.fulfill({ json: {} });
    if (request.method() === 'GET')
      return route.fulfill({ json: saved ? [saved] : [] });
    saved = { ...request.postDataJSON(), id: 0, apiKey: '[REDACTED]' };
    return route.fulfill({ json: saved });
  });
  await page.goto('/me');
  await page.getByRole('link', { name: 'Open Sportarr Services' }).click();
  await page.getByRole('button', { name: 'Add Sportarr' }).click();
  await expect(page.getByLabel('Port')).toHaveValue('1867');
  await page.getByLabel('Hostname').fill('sportarr.internal');
  await page.getByLabel('API Key').fill('fixture-key');
  await page.getByRole('button', { name: 'Test Sportarr' }).click();
  await page
    .getByRole('combobox', { name: 'Quality Profile' })
    .selectOption('4');
  await expect(page.getByLabel('Root Folder')).toHaveCount(0);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.screenshot({
    path: info.outputPath('sportarr.png'),
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Save Sportarr' }).click();
  await expect(
    page.getByRole('button', { name: 'Edit Sportarr' })
  ).toBeVisible();
  expect(saved).toMatchObject({
    name: 'Sportarr',
    isDefault: true,
    activeProfileId: 4,
    activeProfileName: 'HD Sports',
  });
});
