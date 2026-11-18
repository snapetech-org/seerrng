import { expect, test } from '@playwright/test';

test('recognition settings retain edits after rejection and handle saved API keys', async ({
  page,
}, info) => {
  const settingsPath = '/api/v1/settings/recognition';
  let saved = {
    enabled: true,
    localOcr: true,
    visionProvider: 'openai',
    visionModel: 'fixture-model',
    visionBaseUrl: 'https://recognition.example.test/v1',
    visionApiKey: '[REDACTED]',
    visionApiKeyConfigured: true,
    externalConsent: true,
    maxImageBytes: 6 * 1024 * 1024,
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
    if (path.endsWith('/resolve/capabilities'))
      return route.fulfill({ json: { localOcr: true } });
    if (path !== settingsPath) return route.fulfill({ json: {} });
    if (request.method() === 'PUT') {
      const change = request.postDataJSON();
      writes.push(change);
      if (!change.externalConsent) {
        return route.fulfill({
          status: 400,
          json: { error: 'Confirm that uploaded images may be sent.' },
        });
      }
      saved = { ...saved, ...change };
      if (change.clearVisionApiKey) {
        saved.visionApiKey = '';
        saved.visionApiKeyConfigured = false;
      }
    }
    return route.fulfill({ json: saved });
  });
  await page.goto('/admin');
  await page
    .getByRole('link', { name: 'Open Share and Image Recognition' })
    .click();
  const key = page.getByLabel('API Key', { exact: true });
  await expect(key).toHaveValue('');
  await expect(key).toHaveAttribute('placeholder', 'Saved');
  await page.screenshot({
    path: info.outputPath('configured.png'),
    fullPage: true,
  });
  const base = page.getByLabel('Base URL');
  const consent = page.getByLabel(
    'Allow Uploaded Images to Be Sent to This Provider'
  );
  await base.fill('https://new-recognition.example.test/v1');
  await expect(consent).not.toBeChecked();
  const save = page.getByRole('button', { name: 'Save Changes' });
  await save.click();
  await expect(page.getByRole('alert')).toContainText(
    'Confirm that uploaded images may be sent.'
  );
  await expect(base).toHaveValue('https://new-recognition.example.test/v1');
  await consent.check();
  await save.click();
  await expect(page.getByText('Recognition settings saved.')).toBeVisible();
  await expect(save).toBeDisabled();
  expect(writes[1]).toMatchObject({
    visionBaseUrl: 'https://new-recognition.example.test/v1',
    externalConsent: true,
  });
  expect(writes[1]).not.toHaveProperty('visionApiKey');
  await page.getByLabel('Remove Saved API Key').check();
  await expect(key).toBeDisabled();
  await save.click();
  await expect(page.getByLabel('Remove Saved API Key')).toHaveCount(0);
  expect(writes[2]).toHaveProperty('clearVisionApiKey', true);
  await page.getByLabel('Vision Provider').selectOption('none');
  await expect(key).toHaveCount(0);
  await page.getByRole('button', { name: 'Discard Changes' }).click();
  await expect(key).toBeVisible();
  await expect(save).toBeDisabled();
});

test('non-administrators cannot open or load recognition settings', async ({
  page,
}) => {
  let reads = 0;
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/settings/recognition')) reads++;
    return route.fulfill({
      json: path.endsWith('/auth/me') ? { id: 1, permissions: 32 } : {},
    });
  });
  await page.goto('/admin/recognition');
  await expect(page).toHaveURL(/\/me$/);
  await expect(
    page.getByRole('link', { name: 'Open Share and Image Recognition' })
  ).toHaveCount(0);
  expect(reads).toBe(0);
});
