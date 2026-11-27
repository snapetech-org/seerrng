import { expect, test } from '@playwright/test';
import { testAppPath } from './testAppPath';

for (const [locale, labels] of [
  [
    'fr',
    {
      title: 'Acquisition de logiciels',
      host: 'ROMarrNG Nom d’hôte',
      catalog: 'Catalogue d’émulation',
      save: 'Enregistrer les modifications',
    },
  ],
  [
    'ar',
    {
      title: 'اقتناء البرامج',
      host: 'ROMarrNG اسم المضيف',
      catalog: 'كتالوج المحاكاة',
      save: 'حفظ التغييرات',
    },
  ],
] as const) {
  test(`software acquisition settings follow the saved ${locale} locale`, async ({
    page,
  }) => {
    await page.route('https://**/*', (route) => route.abort());
    await page.route('**/lumen-config.json', (route) =>
      route.fulfill({ json: {} })
    );
    await page.route('**/api/v1/**', (route) => {
      const path = new URL(route.request().url()).pathname
        .replace(/^\/lumen/, '')
        .slice(7);
      if (path === '/auth/me')
        return route.fulfill({ json: { id: 1, permissions: 2 } });
      if (path === '/user/1/settings/main')
        return route.fulfill({ json: { locale } });
      if (path === '/settings/software-acquisition')
        return route.fulfill({
          json: {
            romarr: {
              hostname: 'fixture-romarr',
              port: 6868,
              baseUrl: '',
              useSsl: false,
              apiKeyConfigured: false,
            },
            questarr: {
              hostname: '',
              port: 3000,
              baseUrl: '',
              useSsl: false,
              apiKeyConfigured: false,
            },
            emulationCatalogProvider: 'questarr',
            emulationSystemGroups: {},
            emulationPlatformMappings: {},
            steamApiKeyConfigured: false,
          },
        });
      if (path === '/request/software/catalog/systems')
        return route.fulfill({
          json: { results: [{ slug: 'nes', name: 'NES' }] },
        });
      return route.fulfill({ json: {} });
    });
    await page.goto(testAppPath('/admin/software-acquisition'));
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    await expect(
      page.getByRole('heading', { name: labels.title, exact: true })
    ).toBeVisible();
    await expect(page.getByLabel(labels.host)).toHaveValue('fixture-romarr');
    await expect(
      page.getByRole('heading', { name: labels.catalog, exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: labels.save })
    ).toBeDisabled();
    await expect(page.locator('html')).toHaveAttribute(
      'dir',
      locale === 'ar' ? 'rtl' : 'ltr'
    );
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth)
    ).toBeLessThanOrEqual(page.viewportSize()!.width);
    const captureDir = process.env.LUMEN_SOFTWARE_CAPTURE_DIR;
    if (captureDir)
      await page.screenshot({
        path: `${captureDir}/${locale}-${page.viewportSize()?.width}.png`,
        fullPage: true,
      });
  });
}

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
  let staleReadback = false;
  let staleSettings = saved;
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
        staleSettings = structuredClone(saved);
        saved = {
          ...saved,
          ...change,
          romarr: { ...saved.romarr, ...change.romarr },
          questarr: { ...saved.questarr, ...change.questarr },
        };
        staleReadback = true;
        return route.fulfill({ json: saved });
      }
      if (request.method() === 'GET' && staleReadback) {
        staleReadback = false;
        return route.fulfill({ json: staleSettings });
      }
      return route.fulfill({ json: saved });
    }
    return route.fulfill({ json: { results: [] } });
  });
  await page.goto(testAppPath('/admin'));
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
  await expect(page.getByRole('alert')).toHaveText(
    'Could not save software acquisition settings.'
  );
  const captureDir = process.env.LUMEN_SOFTWARE_CAPTURE_DIR;
  if (captureDir)
    await page.screenshot({
      path: `${captureDir}/readback-failure-${page.viewportSize()?.width}.png`,
      fullPage: true,
    });
  await expect(page.getByLabel('NES Platform')).toHaveValue('2');
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
