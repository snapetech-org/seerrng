import { expect, test } from '@playwright/test';

for (const administrator of [true, false]) {
  test(`initialized setup guide enforces access for ${administrator ? 'administrators' : 'members'}`, async ({
    page,
  }) => {
    const mount = process.env.LUMEN_TEST_MOUNT === '/lumen' ? '/lumen' : '';
    await page.route('**/lumen-config.json', (route) =>
      route.fulfill({ json: {} })
    );
    await page.route('**/api/v1/**', (route) => {
      const path = new URL(route.request().url()).pathname.slice(
        '/api/v1'.length
      );
      if (path === '/settings/public')
        return route.fulfill({
          json: { initialized: true, mediaServerType: 4 },
        });
      if (path === '/auth/me')
        return route.fulfill({
          json: { id: 1, permissions: administrator ? 2 : 0 },
        });
      expect(route.request().method()).toBe('GET');
      return route.fulfill({ json: { results: [], totalPages: 1 } });
    });
    if (!administrator) {
      await page.goto(`${mount}/setup?guide=1`);
      await expect(page.getByRole('alert')).toHaveText(
        'Only administrators can open the setup guide.'
      );
      await expect(page.getByText('Configure Media Categories')).toHaveCount(0);
      return;
    }
    await page.goto(`${mount}/admin`);
    await page.getByRole('link', { name: 'Open Setup Guide' }).click();
    await expect(page).toHaveURL(`${mount}/setup?guide=1`);
    await expect(
      page.getByRole('heading', { name: 'Setup Guide' })
    ).toBeVisible();
    await expect(page.getByText('Configure Media Categories')).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Finish Setup' })
    ).toHaveCount(0);
    await page.getByRole('link', { name: 'Return to Administration' }).click();
    await expect(page).toHaveURL(`${mount}/admin`);
  });
}

test('first-run Plex setup exchanges the PIN and configures a discovered server', async ({
  context,
  page,
}) => {
  const mount = process.env.LUMEN_TEST_MOUNT === '/lumen' ? '/lumen' : '';
  const connection = { ip: 'plex.example.test', port: 32400, useSsl: true };
  const library = { id: '1', name: 'Films', type: 'movie', enabled: false };
  let signedIn = false;
  let connected = false;
  let initialized = false;
  await context.route('https://app.plex.tv/auth', (route) =>
    route.fulfill({ body: 'Plex authorization fixture' })
  );
  await page.route('https://plex.tv/api/v2/pins**', (route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') {
      return route.fulfill({
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-headers': '*',
          'access-control-allow-methods': 'GET, POST',
        },
      });
    }
    expect(request.headers()['x-plex-client-identifier']).toBeTruthy();
    return route.fulfill({
      headers: { 'access-control-allow-origin': '*' },
      json:
        request.method() === 'POST'
          ? { id: 123, code: 'fixture-pin' }
          : { authToken: 'fixture-plex-token' },
    });
  });
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.slice('/api/v1'.length);
    switch (path) {
      case '/settings/public':
        return route.fulfill({
          json: { initialized, mediaServerType: signedIn ? 1 : 4 },
        });
      case '/auth/me':
        return signedIn
          ? route.fulfill({
              json: { id: 1, permissions: 2, displayName: 'Owner' },
            })
          : route.fulfill({ status: 401, json: {} });
      case '/auth/plex':
        expect(request.postDataJSON()).toEqual({
          authToken: 'fixture-plex-token',
        });
        signedIn = true;
        return route.fulfill({ json: { id: 1 } });
      case '/settings/plex/devices/servers':
        return route.fulfill({
          json: [
            {
              name: 'Fixture Plex',
              clientIdentifier: 'fixture-server',
              connection: [
                {
                  address: connection.ip,
                  port: connection.port,
                  protocol: 'https',
                  local: true,
                  status: 200,
                },
              ],
            },
          ],
        });
      case '/settings/plex':
        if (request.method() === 'POST') {
          expect(request.postDataJSON()).toMatchObject(connection);
          connected = true;
        }
        return route.fulfill({
          json: connected
            ? { ...connection, libraries: [library] }
            : { libraries: [] },
        });
      case '/settings/plex/library':
        expect(request.postDataJSON()).toEqual({ enable: '1' });
        library.enabled = true;
        return route.fulfill({ json: [library] });
      case '/settings/initialize':
        expect(connected && library.enabled).toBe(true);
        initialized = true;
        return route.fulfill({ json: { initialized } });
      default:
        return route.fulfill({ json: { results: [], totalPages: 1 } });
    }
  });
  await page.goto(`${mount}/setup`);
  await page.getByRole('combobox', { name: 'Media server' }).selectOption('1');
  const popup = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Sign in with Plex' }).click();
  await expect(await popup).toHaveURL(/app\.plex\.tv\/auth.*code=fixture-pin/);
  await page.getByRole('button', { name: 'Discover Plex Servers' }).click();
  await page
    .getByLabel('Discovered Plex Connection')
    .selectOption('fixture-server|0');
  await page.getByRole('button', { name: 'Save Plex Connection' }).click();
  const finish = page.getByRole('button', { name: 'Finish Setup' });
  const films = page.getByRole('checkbox', { name: 'Enable Films' });
  await expect(films).toBeVisible();
  await finish.click();
  await expect(
    page.getByText('Enable at least one media library before finishing setup.')
  ).toBeVisible();
  await films.click();
  await expect(films).toBeChecked();
  await finish.click();
  await expect(page).toHaveURL(`${mount}/`);
  expect(initialized).toBe(true);
});

for (const [provider, serverType] of [
  ['Jellyfin', 2],
  ['Emby', 3],
] as const) {
  test(`first-run ${provider} setup confirms the session and requires an enabled library`, async ({
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
            json: { initialized, mediaServerType: signedIn ? serverType : 4 },
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
            serverType,
            useSsl: true,
            urlBase: '/media',
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
    await page
      .getByRole('combobox', { name: 'Media server' })
      .selectOption(String(serverType));
    await page.getByLabel('Hostname').fill('media.example');
    await page.getByLabel('Use HTTPS').check();
    await page.getByLabel('URL base').fill('/media');
    await page.getByLabel('Username').fill('owner');
    await page.getByLabel('Email').fill('owner@example.test');
    await page.getByRole('button', { name: 'Connect and Sign In' }).click();
    const finish = page.getByRole('button', { name: 'Finish Setup' });
    await finish.click();
    await expect(
      page.getByText(
        'Enable at least one media library before finishing setup.'
      )
    ).toBeVisible();
    expect(attempts).toBe(0);
    const library = page.getByRole('checkbox', { name: 'Enable Films' });
    await library.click();
    await expect(library).toBeChecked();
    await page.getByText('Configure Media Categories', { exact: true }).click();
    const defaults = page
      .getByRole('group', { name: 'Enabled Media Categories' })
      .last();
    await defaults
      .getByRole('checkbox', { name: 'Ebooks', exact: true })
      .check();
    await page.getByRole('button', { name: 'Save Default Categories' }).click();
    await expect(page.getByText('Default categories saved.')).toBeVisible();
    expect(booksEnabled).toBe(true);
    expect(radarrReads).toBe(0);
    await page.getByText('Configure Request Services', { exact: true }).click();
    const radarr = page.getByText('Radarr', { exact: true });
    await radarr.click();
    await page.getByRole('button', { name: 'Add Radarr' }).click();
    await page
      .getByLabel('Service Name', { exact: true })
      .fill('Fixture Radarr');
    await radarr.click();
    await radarr.click();
    await expect(page.getByLabel('Service Name', { exact: true })).toHaveValue(
      'Fixture Radarr'
    );
    expect(radarrReads).toBe(1);
    const editor = page
      .getByLabel('Service Name', { exact: true })
      .locator('xpath=ancestor::form');
    await editor
      .getByLabel('Hostname', { exact: true })
      .fill('radarr.internal');
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
}
