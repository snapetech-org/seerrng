import { expect, test } from '@playwright/test';

test('Swipe settings test the provider and save enablement without resending its key', async ({
  page,
}, info) => {
  const path = '/api/v1/settings/swipe';
  let saved = {
    enabled: false,
    aiProvider: 'openai',
    aiModel: 'fixture-model',
    aiBaseUrl: 'https://model.internal/v1',
    aiEffort: 'low',
    aiApiKeyConfigured: true,
  };
  const writes: Record<string, unknown>[] = [];
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', (route) => {
    const request = route.request();
    const url = new URL(request.url()).pathname;
    if (url.endsWith('/auth/me'))
      return route.fulfill({ json: { id: 1, permissions: 2 } });
    if (url.endsWith('/settings/public'))
      return route.fulfill({ json: { swipeEnabled: saved.enabled } });
    if (url === path + '/test') {
      writes.push(request.postDataJSON());
      return route.fulfill({ json: { success: true } });
    }
    if (url !== path) return route.fulfill({ json: {} });
    if (request.method() === 'PUT') {
      const body = request.postDataJSON();
      writes.push(body);
      saved = { ...saved, ...body };
    }
    return route.fulfill({ json: saved });
  });
  await page.goto('/me');
  await page.getByRole('link', { name: 'Open Swipe Settings' }).click();
  await page.getByLabel('Enable Swipe').check();
  await page
    .getByRole('combobox', { name: 'Ranking Effort' })
    .selectOption('high');
  await page.getByRole('button', { name: 'Test Ranking Provider' }).click();
  await expect(
    page.getByText('Ranking provider connection verified.')
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath('swipe-admin.png'),
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Save Changes' }).click();
  await expect(page.getByText('Swipe settings saved.')).toBeVisible();
  for (const write of writes) {
    expect(write).toMatchObject({
      enabled: true,
      aiProvider: 'openai',
      aiEffort: 'high',
      clearAiApiKey: false,
    });
    expect(write).not.toHaveProperty('aiApiKey');
  }
  expect(writes).toHaveLength(2);
  await page.getByRole('link', { name: 'Back to Account' }).click();
  await expect(
    page.getByRole('link', { name: 'Open Swipe', exact: true })
  ).toBeVisible();
});
