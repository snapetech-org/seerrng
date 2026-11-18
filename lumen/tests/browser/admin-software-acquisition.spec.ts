import { expect, test } from '@playwright/test';

test('software acquisition tests a saved connection, preserves keys and saves system mappings', async ({
  page,
}, info) => {
  const path = '/settings/software-acquisition';
  const connection = {
    hostname: 'fixture-romarr',
    port: 6868,
    baseUrl: '',
    useSsl: false,
    apiKeyConfigured: true,
  };
  let saved = {
    romarr: connection,
    questarr: { ...connection, hostname: 'fixture-questarr', port: 3000 },
    emulationCatalogProvider: 'questarr',
    emulationSystemGroups: {},
    emulationPlatformMappings: {},
    steamApiKeyConfigured: true,
  };
  let rejected = true;
  const writes: Record<string, unknown>[] = [];
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', (route) => {
    const request = route.request();
    const url = new URL(request.url()).pathname.slice(7);
    if (url === '/auth/me')
      return route.fulfill({ json: { id: 1, permissions: 2 } });
    if (url === '/request/software/catalog/systems')
      return route.fulfill({
        json: { results: [{ slug: 'nes', name: 'NES' }] },
      });
    if (url === path + '/platform-mapping/preview')
      return route.fulfill({
        json: {
          systems: [
            {
              slug: 'nes',
              name: 'NES',
              automaticMatch: { id: 1, name: 'Nintendo' },
            },
          ],
          catalogPlatforms: [
            { id: 1, name: 'Nintendo' },
            { id: 2, name: 'Famicom' },
          ],
        },
      });
    if (url === path + '/test/romarr') {
      expect(request.postDataJSON()).not.toHaveProperty('apiKey');
      return route.fulfill({
        json: {
          apiVersion: 2,
          capabilities: { catalog: true, datCatalog: true },
          datCatalogPlatformCount: 1,
        },
      });
    }
    if (url === path) {
      if (request.method() === 'PUT') {
        const change = request.postDataJSON();
        writes.push(change);
        if (rejected)
          return route.fulfill({
            status: 400,
            json: { error: 'Software settings rejected.' },
          });
        saved = {
          ...saved,
          ...change,
          romarr: { ...saved.romarr, ...change.romarr },
          questarr: { ...saved.questarr, ...change.questarr },
        };
      }
      return route.fulfill({ json: saved });
    }
    return route.fulfill({ json: { results: [] } });
  });
  await page.goto('/admin');
  await page.getByRole('link', { name: 'Open Software Acquisition' }).click();
  await expect(
    page.getByLabel('ROMarrNG API Key', { exact: true })
  ).toHaveValue('');
  await page.getByRole('button', { name: 'Test ROMarrNG Connection' }).click();
  await expect(page.getByText(/DAT catalog ready for 1 systems/)).toBeVisible();
  await page.getByLabel('Catalog Source').selectOption('romarr-dat');
  await page.getByRole('button', { name: 'Assign All to Retro' }).click();
  await page.getByRole('button', { name: 'Preview Platform Matches' }).click();
  await page.getByLabel('NES Platform').selectOption('2');
  await page.screenshot({
    path: info.outputPath('software-acquisition.png'),
    fullPage: true,
  });
  const save = page.getByRole('button', { name: 'Save Changes' });
  await save.click();
  await expect(page.getByRole('alert')).toHaveText(
    'Software settings rejected.'
  );
  await expect(page.getByLabel('NES Platform')).toHaveValue('2');
  rejected = false;
  await save.click();
  await expect(
    page.getByText('Software acquisition settings saved.')
  ).toBeVisible();
  expect(writes[1]).toMatchObject({
    emulationCatalogProvider: 'romarr-dat',
    emulationSystemGroups: { nes: 'retro' },
    emulationPlatformMappings: { nes: 2 },
  });
  expect(writes[1]).not.toHaveProperty('romarr.apiKey');
  expect(writes[1]).not.toHaveProperty('questarr.apiKey');
  expect(writes[1]).not.toHaveProperty('steamApiKey');
  await expect(save).toBeDisabled();
});
