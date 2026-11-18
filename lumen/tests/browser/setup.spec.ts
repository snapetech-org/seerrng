import { expect, test } from '@playwright/test';

test('first-run Jellyfin setup confirms the session and requires an enabled library', async ({
  page,
}) => {
  const bundled = process.env.LUMEN_TEST_MOUNT === '/lumen';
  let signedIn = false;
  let initialized = false;
  let enabled = false;
  let attempts = 0;
  let booksEnabled = false;
  let radarrReads = 0;
  let radarrServices: Record<string, unknown>[] = [];
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname.slice(
      '/api/v1'.length
    );
    switch (path) {
      case '/settings/public':
        return route.fulfill({
          json: { initialized, mediaServerType: signedIn ? 2 : 4 },
        });
      case '/auth/me':
        return signedIn
          ? route.fulfill({
              json: { id: 1, permissions: 2, displayName: 'Owner' },
            })
          : route.fulfill({ status: 401, json: {} });
      case '/auth/jellyfin':
        expect(route.request().postDataJSON()).toMatchObject({
          hostname: 'media.example',
          serverType: 2,
          port: 8096,
        });
        signedIn = true;
        return route.fulfill({ json: { id: 1 } });
      case '/settings/jellyfin':
        return route.fulfill({
          json: { libraries: [{ id: '1', name: 'Films', enabled }] },
        });
      case '/settings/jellyfin/library':
        expect(route.request().postDataJSON()).toEqual({ enable: '1' });
        enabled = true;
        return route.fulfill({ json: [{ id: '1', name: 'Films', enabled }] });
      case '/settings/main':
        if (route.request().method() === 'POST') {
          expect(route.request().postDataJSON()).toEqual({
            defaultEnabledMediaCategories: { ebook: true },
          });
          booksEnabled = true;
        }
        return route.fulfill({
          json: {
            enabledMediaCategories: { ebook: true },
            defaultEnabledMediaCategories: { ebook: booksEnabled },
          },
        });
      case '/settings/radarr/test':
        expect(route.request().postDataJSON()).toMatchObject({
          hostname: 'radarr.internal',
          apiKey: 'fixture-key',
        });
        return route.fulfill({
          json: {
            profiles: [{ id: 2, name: 'HD' }],
            rootFolders: [{ id: 1, path: '/movies' }],
            tags: [],
          },
        });
      case '/settings/radarr':
        if (route.request().method() === 'POST') {
          const body = route.request().postDataJSON();
          expect(body).toMatchObject({
            name: 'Fixture Radarr',
            activeProfileId: 2,
            activeDirectory: '/movies',
          });
          const saved = { ...body, id: 0, apiKey: '[REDACTED]' };
          radarrServices = [saved];
          return route.fulfill({ json: saved });
        }
        radarrReads += 1;
        return route.fulfill({ json: radarrServices });
      case '/settings/download-clients':
        return route.fulfill({
          json: { pollIntervalSeconds: 15, clients: [] },
        });
      case '/settings/prowlarr':
        return route.fulfill({
          json: {
            hostname: '',
            port: 9696,
            baseUrl: '',
            useSsl: false,
            apiKeyConfigured: false,
          },
        });
      case '/settings/initialize':
        attempts += 1;
        initialized = true;
        return route.fulfill({ json: { initialized } });
      default:
        return route.fulfill({ json: { results: [], totalPages: 1 } });
    }
  });
  await page.goto(bundled ? '/lumen/setup' : '/');
  await expect(page).toHaveURL(bundled ? '/lumen/setup' : '/setup');
  await page.getByRole('combobox', { name: 'Media server' }).selectOption('2');
  await page.getByLabel('Hostname').fill('media.example');
  await page.getByLabel('Username').fill('owner');
  await page.getByLabel('Email').fill('owner@example.test');
  await page.getByRole('button', { name: 'Connect and Sign In' }).click();
  const finish = page.getByRole('button', { name: 'Finish Setup' });
  await finish.click();
  await expect(
    page.getByText('Enable at least one media library before finishing setup.')
  ).toBeVisible();
  expect(attempts).toBe(0);
  const library = page.getByRole('checkbox', { name: 'Enable Films' });
  await library.click();
  await expect(library).toBeChecked();
  await page.getByText('Configure Media Categories', { exact: true }).click();
  const defaults = page
    .getByRole('group', { name: 'Enabled Media Categories' })
    .last();
  await defaults.getByRole('checkbox', { name: 'Ebooks', exact: true }).check();
  await page.getByRole('button', { name: 'Save Default Categories' }).click();
  await expect(page.getByText('Default categories saved.')).toBeVisible();
  expect(booksEnabled).toBe(true);
  expect(radarrReads).toBe(0);
  await page.getByText('Configure Request Services', { exact: true }).click();
  const radarr = page.getByText('Radarr', { exact: true });
  await radarr.click();
  await page.getByRole('button', { name: 'Add Radarr' }).click();
  await page.getByLabel('Service Name', { exact: true }).fill('Fixture Radarr');
  await radarr.click();
  await radarr.click();
  await expect(page.getByLabel('Service Name', { exact: true })).toHaveValue(
    'Fixture Radarr'
  );
  expect(radarrReads).toBe(1);
  const editor = page
    .getByLabel('Service Name', { exact: true })
    .locator('xpath=ancestor::form');
  await editor.getByLabel('Hostname', { exact: true }).fill('radarr.internal');
  await page.getByLabel('API Key', { exact: true }).fill('fixture-key');
  await page.getByRole('button', { name: 'Test Radarr' }).click();
  await page
    .getByRole('combobox', { name: 'Quality Profile', exact: true })
    .selectOption('2');
  await page
    .getByRole('combobox', { name: 'Root Folder', exact: true })
    .selectOption('/movies');
  await page.getByRole('button', { name: 'Save Radarr' }).click();
  await expect(
    page.getByRole('button', { name: 'Edit Fixture Radarr' })
  ).toBeVisible();
  await page.getByText('Configure Download Clients', { exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Add Download Client' })
  ).toBeVisible();
  await page.getByText('Configure Prowlarr', { exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Indexer Diagnostics' })
  ).toBeVisible();
  expect(initialized).toBe(false);
  await finish.click();
  await expect(page).toHaveURL(bundled ? '/lumen/' : '/');
  expect(attempts).toBe(1);
});
