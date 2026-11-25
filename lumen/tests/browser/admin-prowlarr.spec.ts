import { expect, test } from '@playwright/test';

const mount = process.env.LUMEN_TEST_MOUNT === '/lumen' ? '/lumen' : '';
const appPath = (path: string) => `${mount}${path}`;

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
  let saved = initial;
  let staleReadback: typeof initial | undefined;
  let saveCount = 0;
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
    if (endpoint === path && request.method() === 'GET') {
      if (staleReadback) {
        const stale = staleReadback;
        staleReadback = undefined;
        return route.fulfill({ json: stale });
      }
      return route.fulfill({ json: saved });
    }
    if (endpoint === path + '/test' || endpoint === path) {
      const body = request.postDataJSON();
      writes.push({ method: request.method(), body });
      if (request.method() === 'PUT') {
        if (saveCount === 0) staleReadback = saved;
        saved = { ...saved, ...body };
        saveCount++;
      }
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
  await page.goto(appPath('/me'));
  await page.getByRole('link', { name: 'Open Prowlarr Settings' }).click();
  await expect(page.getByLabel('API key', { exact: true })).toHaveValue('');
  await page.getByLabel('Port', { exact: true }).fill('9697');
  await page
    .getByRole('button', { name: 'Test connection and inspect coverage' })
    .click();
  await expect(page.getByText('Connected', { exact: true })).toBeVisible();
  await page
    .getByRole('button', { name: 'Save Prowlarr settings', exact: true })
    .click();
  await expect(
    page.getByText('Prowlarr settings saved.', { exact: true })
  ).toHaveCount(0);
  await expect(
    page.getByText('Prowlarr settings could not be saved.', { exact: true })
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Save Prowlarr settings', exact: true })
    .click();
  await expect(page.getByText('Prowlarr settings saved.')).toBeVisible();
  expect(writes).toEqual(
    ['POST', 'PUT', 'PUT'].map((method) => ({
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

test('Prowlarr routing edits preserve explicit empty assignments and clear limits', async ({
  page,
}, info) => {
  const changes: unknown[] = [];
  const initial = {
    hostname: 'prowlarr',
    port: 9696,
    baseUrl: '',
    useSsl: false,
    apiKeyConfigured: true,
    categoryMappings: { movie: [2000], tv: [5000] },
    indexerIdsByCategory: { movie: [4] },
    searchLimitByIndexer: { 4: 8 },
  };
  let persisted = initial;
  let saveCount = 0;
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.endsWith('/auth/me'))
      return route.fulfill({ json: { id: 1, permissions: 2 } });
    if (path.endsWith('/prowlarr/coverage'))
      return route.fulfill({
        json: {
          configured: true,
          indexers: [
            {
              id: 4,
              name: 'Catalog Indexer',
              enabled: true,
              supportsSearch: true,
            },
          ],
        },
      });
    if (!path.endsWith('/prowlarr')) return route.fulfill({ json: {} });
    if (request.method() === 'GET') return route.fulfill({ json: persisted });
    const body = request.postDataJSON();
    changes.push(body);
    persisted = { ...persisted, ...body };
    if (saveCount++ === 0)
      return route.fulfill({
        json: {
          ...persisted,
          categoryMappings: initial.categoryMappings,
          indexerIdsByCategory: initial.indexerIdsByCategory,
          searchLimitByIndexer: initial.searchLimitByIndexer,
        },
      });
    return route.fulfill({ json: persisted });
  });
  await page.goto(appPath('/admin/prowlarr'));
  const movies = page.getByLabel('Movies Category IDs', { exact: true });
  const save = page.getByRole('button', {
    name: 'Save Prowlarr settings',
    exact: true,
  });
  await movies.fill('invalid');
  await expect(save).toBeDisabled();
  await movies.fill('2000, 2040, 2040');
  await page.getByText('Movies · 1 assigned', { exact: true }).click();
  await page
    .getByRole('group', { name: 'Indexers for Movies' })
    .getByLabel('Catalog Indexer')
    .uncheck();
  await page.getByLabel('Catalog Indexer Search Limit').fill('');
  await save.click();
  await expect(
    page.getByText('Prowlarr settings could not be saved.', { exact: true })
  ).toBeVisible();
  await expect(movies).toHaveValue('2000, 2040, 2040');
  await expect(
    page
      .getByRole('group', { name: 'Indexers for Movies' })
      .getByLabel('Catalog Indexer')
  ).not.toBeChecked();
  await expect(page.getByLabel('Catalog Indexer Search Limit')).toHaveValue('');
  await save.click();
  await expect(page.getByText('Prowlarr settings saved.')).toBeVisible();
  expect(changes).toEqual([
    expect.objectContaining({
      categoryMappings: { movie: [2000, 2040], tv: [5000] },
      indexerIdsByCategory: { movie: [] },
      searchLimitByIndexer: {},
    }),
    expect.objectContaining({
      categoryMappings: { movie: [2000, 2040], tv: [5000] },
      indexerIdsByCategory: { movie: [] },
      searchLimitByIndexer: {},
    }),
  ]);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth)
  ).toBeLessThanOrEqual(page.viewportSize()!.width);
  if (process.env.LUMEN_CAPTURE_PROWLARR) {
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.screenshot({
      path: info.outputPath('mappings.png'),
      fullPage: true,
    });
  }
});

test('Prowlarr administration follows the saved locale and confirms changes', async ({
  page,
}) => {
  const locale = ['en', 'fr', 'ar'].includes(
    process.env.LUMEN_PROWLARR_LOCALE ?? ''
  )
    ? (process.env.LUMEN_PROWLARR_LOCALE as 'en' | 'fr' | 'ar')
    : 'en';
  const labels = {
    en: [
      'Prowlarr indexers',
      'Hostname',
      'API key',
      'Save Prowlarr settings',
      'Prowlarr settings saved.',
    ],
    fr: [
      'Indexeurs Prowlarr',
      "Nom d'hôte",
      'Clé API',
      'Enregistrer les paramètres Prowlarr',
      'Paramètres Prowlarr enregistrés.',
    ],
    ar: [
      'مفهارس Prowlarr',
      'اسم المضيف',
      'مفتاح API',
      'احفظ إعدادات Prowlarr',
      'تم حفظ إعدادات Prowlarr.',
    ],
  } as const;
  const baseline = process.env.LUMEN_CAPTURE_MODE === 'baseline';
  const [title, hostnameLabel, apiKeyLabel, saveLabel, savedLabel] = baseline
    ? [
        'Prowlarr Settings',
        'Hostname',
        'API Key',
        'Save Prowlarr',
        'Prowlarr settings saved.',
      ]
    : labels[locale];
  const initial = {
    hostname: 'prowlarr',
    port: 9696,
    baseUrl: '',
    useSsl: false,
    apiKeyConfigured: true,
  };
  let persisted = initial;
  const inventory = {
    configured: true,
    version: '1.0',
    totalIndexers: 2,
    enabledSearchableIndexers: 1,
    indexers: [
      { id: 1, name: 'Catalog Indexer', enabled: true, supportsSearch: true },
      { id: 2, name: 'Disabled Indexer', enabled: false, supportsSearch: true },
    ],
    diagnostics: [{ id: 1, name: 'Catalog Indexer', success: true }],
  };
  const writes: unknown[] = [];
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', (route) => {
    const request = route.request();
    const endpoint = new URL(request.url()).pathname;
    if (endpoint.endsWith('/auth/me'))
      return route.fulfill({ json: { id: 1, permissions: 2 } });
    if (endpoint.endsWith('/user/1/settings/main'))
      return route.fulfill({ json: { locale } });
    if (
      endpoint.endsWith('/settings/prowlarr/coverage') ||
      endpoint.endsWith('/settings/prowlarr/test')
    )
      return route.fulfill({ json: inventory });
    if (endpoint.endsWith('/settings/prowlarr')) {
      if (request.method() === 'GET') return route.fulfill({ json: persisted });
      const body = request.postDataJSON();
      writes.push(body);
      persisted = { ...persisted, ...body };
      return route.fulfill({ json: persisted });
    }
    return route.fulfill({ json: {} });
  });
  await page.goto(appPath('/admin/prowlarr'));
  await expect(
    page.getByRole('heading', { name: title, exact: true })
  ).toBeVisible();
  await expect(page.getByLabel(hostnameLabel, { exact: true })).toHaveValue(
    'prowlarr'
  );
  await expect(page.getByLabel(apiKeyLabel, { exact: true })).toHaveValue('');
  await page.getByLabel(hostnameLabel, { exact: true }).fill('prowlarr-new');
  await page.getByRole('button', { name: saveLabel, exact: true }).click();
  await expect(page.getByText(savedLabel, { exact: true })).toBeVisible();
  expect(writes).toEqual([
    expect.objectContaining({ hostname: 'prowlarr-new', port: 9696 }),
  ]);
  await expect(page.getByLabel(hostnameLabel, { exact: true })).toHaveValue(
    'prowlarr-new'
  );
  await expect(page.locator('html')).toHaveAttribute(
    'dir',
    locale === 'ar' ? 'rtl' : 'ltr'
  );
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth)
  ).toBeLessThanOrEqual(page.viewportSize()!.width);
  if (process.env.LUMEN_CAPTURE_PROWLARR_LOCALE)
    await page.screenshot({
      path: `${process.env.LUMEN_CAPTURE_PROWLARR_LOCALE}/${locale}-${page.viewportSize()?.width}.png`,
      fullPage: true,
    });
});
