import { expect, test } from '@playwright/test';

for (const [type, name, provider] of [
  [1, 'Plex', 'plex'],
  [2, 'Jellyfin', 'jellyfin'],
  [3, 'Emby', 'jellyfin'],
] as const) {
  test(`${name} library settings and scan controls use the configured server`, async ({
    page,
  }, info) => {
    let running = false;
    const requests: { endpoint: string; body: Record<string, unknown> }[] = [];
    let libraries = [
      {
        id: 'tv',
        name: 'Shows',
        type: 'show',
        enabled: true,
        episodeOrderProvider: undefined as unknown,
      },
      {
        id: 'music',
        name: 'Audio',
        type: 'music',
        enabled: false,
        episodeOrderProvider: undefined as unknown,
      },
    ];
    const path = `/api/v1/settings/${provider}`;
    await page.route('https://**/*', (route) => route.abort());
    await page.route('**/lumen-config.json', (route) =>
      route.fulfill({ json: {} })
    );
    await page.route('**/api/v1/**', (route) => {
      const request = route.request();
      const endpoint = new URL(request.url()).pathname;
      if (endpoint.endsWith('/auth/me'))
        return route.fulfill({ json: { id: 1, permissions: 2 } });
      if (endpoint.endsWith('/settings/public'))
        return route.fulfill({ json: { mediaServerType: type } });
      if (endpoint === path) return route.fulfill({ json: { libraries } });
      const action = endpoint.slice(path.length);
      if (!endpoint.startsWith(path + '/')) return route.fulfill({ json: {} });
      const body = request.method() === 'GET' ? {} : request.postDataJSON();
      if (request.method() !== 'GET') requests.push({ endpoint: action, body });
      if (action === '/sync') {
        if (body.start) running = true;
        if (body.cancel) running = false;
        return route.fulfill({ json: { running, progress: 1, total: 10 } });
      }
      libraries = libraries.map((library) => ({
        ...library,
        ...(typeof body.enable === 'string'
          ? { enabled: body.enable.split(',').includes(library.id) }
          : {}),
        ...(body.episodeOrderLibraryId === library.id
          ? { episodeOrderProvider: body.episodeOrderProvider }
          : {}),
        ...(action === '/library/music/type' && library.id === 'music'
          ? { type: body.type }
          : {}),
      }));
      return route.fulfill({ json: libraries });
    });

    await page.goto('/me');
    await page
      .getByRole('link', { name: 'Open Media Server Libraries' })
      .click();
    await expect(
      page.getByRole('heading', { name: `${name} Libraries` })
    ).toBeVisible();
    await page.getByLabel('Enable Audio').click();
    await expect(page.getByLabel('Enable Audio')).toBeChecked();
    await page.getByLabel('Episode Order for Shows').selectOption('tvdb');
    await expect(page.getByLabel('Episode Order for Shows')).toHaveValue(
      'tvdb'
    );
    await expect(page.getByLabel('Library Type for Shows')).toHaveCount(0);
    if (type === 1) {
      await page.getByLabel('Library Type for Audio').selectOption('book');
      await expect(page.getByLabel('Library Type for Audio')).toHaveValue(
        'book'
      );
    } else {
      await expect(page.getByLabel('Library Type for Audio')).toHaveCount(0);
    }
    await page.getByRole('button', { name: 'Start Full Scan' }).click();
    await expect(page.getByText('Scanning · 1 of 10')).toBeVisible();
    await page.getByRole('button', { name: 'Cancel Scan' }).click();
    await expect(page.getByText('No scan is running.')).toBeVisible();
    expect(requests).toEqual([
      { endpoint: '/library', body: { enable: 'tv,music' } },
      {
        endpoint: '/library',
        body: { episodeOrderLibraryId: 'tv', episodeOrderProvider: 'tvdb' },
      },
      ...(type === 1
        ? [{ endpoint: '/library/music/type', body: { type: 'book' } }]
        : []),
      { endpoint: '/sync', body: { start: true } },
      { endpoint: '/sync', body: { cancel: true } },
    ]);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth)
    ).toBeLessThanOrEqual(page.viewportSize()!.width);
    if (process.env.LUMEN_CAPTURE_MEDIA_LIBRARIES)
      await page.screenshot({
        path: info.outputPath('media-libraries.png'),
        fullPage: true,
      });
  });
}

test('Jellyfin connection and bridge saves preserve credentials and update the library list', async ({
  page,
}, info) => {
  const path = '/api/v1/settings/jellyfin';
  const settings = {
    ip: 'jellyfin.internal',
    port: 8096,
    apiKey: '[REDACTED]',
    libraries: [
      { id: 'old', name: 'Old Library', enabled: true, type: 'show' },
    ],
    bridgeLoginEnabled: false,
  };
  const writes: { path: string; body: Record<string, unknown> }[] = [];
  let rejectConnectionSave = true;
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', (route) => {
    const request = route.request();
    const endpoint = new URL(request.url()).pathname;
    if (endpoint.endsWith('/auth/me'))
      return route.fulfill({ json: { id: 1, permissions: 2 } });
    if (endpoint.endsWith('/settings/public'))
      return route.fulfill({ json: { mediaServerType: 2 } });
    if (endpoint === path + '/sync')
      return route.fulfill({ json: { running: false } });
    if (!endpoint.startsWith(path)) return route.fulfill({ json: {} });
    if (request.method() === 'GET') return route.fulfill({ json: settings });
    const body = request.postDataJSON();
    writes.push({ path: endpoint.slice(path.length), body });
    if (endpoint.endsWith('/bridge-login'))
      return route.fulfill({ json: { bridgeLoginEnabled: body.enabled } });
    if (endpoint === path && rejectConnectionSave) {
      rejectConnectionSave = false;
      return route.fulfill({
        status: 503,
        json: { message: 'Media server is temporarily unavailable.' },
      });
    }
    return route.fulfill({ json: { ...settings, ...body, libraries: [] } });
  });
  await page.goto('/admin/media-libraries');
  await expect(page.getByLabel('Server API Key')).toHaveValue('');
  await page.getByLabel('Server Port').fill('8920');
  await page.getByLabel('Use HTTPS', { exact: true }).check();
  await page.getByRole('button', { name: 'Save Jellyfin Connection' }).click();
  await expect(
    page.getByText(
      'Could not save the Jellyfin connection. Check the address and credentials, then try again.'
    )
  ).toBeVisible();
  await expect(page.getByLabel('Server Port')).toHaveValue('8920');
  await expect(page.getByLabel('Use HTTPS', { exact: true })).toBeChecked();
  await page.getByRole('button', { name: 'Save Jellyfin Connection' }).click();
  await expect(page.getByText('Connection settings saved.')).toBeVisible();
  await expect(page.getByText('Old Library', { exact: true })).toHaveCount(0);
  const bridge = page.getByLabel('Enable Jellyfin Bridge Sign-In');
  await bridge.click();
  await expect(bridge).toBeChecked();
  expect(writes).toEqual([
    {
      path: '',
      body: {
        ip: 'jellyfin.internal',
        port: 8920,
        useSsl: true,
        urlBase: '',
        externalHostname: '',
        jellyfinForgotPasswordUrl: '',
        apiKey: '[REDACTED]',
      },
    },
    {
      path: '',
      body: {
        ip: 'jellyfin.internal',
        port: 8920,
        useSsl: true,
        urlBase: '',
        externalHostname: '',
        jellyfinForgotPasswordUrl: '',
        apiKey: '[REDACTED]',
      },
    },
    { path: '/bridge-login', body: { enabled: true } },
  ]);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth)
  ).toBeLessThanOrEqual(page.viewportSize()!.width);
  if (process.env.LUMEN_CAPTURE_MEDIA_LIBRARIES)
    await page.screenshot({
      path: info.outputPath('connection.png'),
      fullPage: true,
    });
});

test('Plex discovery selects reachable addresses without saving automatically', async ({
  page,
}, info) => {
  const writes: unknown[] = [];
  let discoveryCalls = 0;
  const path = '/api/v1/settings/plex';
  const initial = {
    ip: 'manual.internal',
    port: 32400,
    useSsl: false,
    libraries: [],
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
    if (endpoint.endsWith('/settings/public'))
      return route.fulfill({ json: { mediaServerType: 1 } });
    if (endpoint === path + '/sync')
      return route.fulfill({ json: { running: false } });
    if (endpoint === path + '/devices/servers') {
      discoveryCalls++;
      return route.fulfill({
        json: [
          {
            name: 'Household Plex',
            clientIdentifier: 'fixture-plex',
            connection: [
              {
                address: 'unreachable.internal',
                port: 32400,
                protocol: 'http',
                local: true,
                status: 500,
              },
              {
                address: 'plex.internal',
                port: 32443,
                protocol: 'https',
                local: true,
                status: 200,
              },
            ],
          },
        ],
      });
    }
    if (endpoint !== path) return route.fulfill({ json: {} });
    if (request.method() === 'GET') return route.fulfill({ json: initial });
    const body = request.postDataJSON();
    writes.push(body);
    return route.fulfill({ json: { ...initial, ...body } });
  });
  await page.goto('/admin/media-libraries');
  const hostname = page.getByLabel('Server Hostname');
  await expect(hostname).toHaveValue('manual.internal');
  expect(discoveryCalls).toBe(0);
  await page.getByRole('button', { name: 'Discover Plex Servers' }).click();
  const picker = page.getByLabel('Discovered Plex Connection');
  await expect(
    picker.getByRole('option', { name: /Unreachable/ })
  ).toHaveAttribute('disabled', '');
  await expect(hostname).toHaveValue('manual.internal');
  await picker.selectOption({
    label: 'Local HTTPS · plex.internal:32443 · Recommended',
  });
  await expect(hostname).toHaveValue('plex.internal');
  await expect(page.getByLabel('Use HTTPS', { exact: true })).toBeChecked();
  expect(writes).toEqual([]);
  await page.getByRole('button', { name: 'Save Plex Connection' }).click();
  await expect(page.getByText('Connection settings saved.')).toBeVisible();
  expect(writes).toEqual([
    {
      ip: 'plex.internal',
      port: 32443,
      useSsl: true,
      webAppUrl: '',
      analyzeOnPlayback: false,
    },
  ]);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth)
  ).toBeLessThanOrEqual(page.viewportSize()!.width);
  if (process.env.LUMEN_CAPTURE_MEDIA_LIBRARIES)
    await page.screenshot({
      path: info.outputPath('plex-discovery.png'),
      fullPage: true,
    });
});

test('Tautulli settings preserve saved keys and support disconnecting the service', async ({
  page,
}, info) => {
  const writes: unknown[] = [];
  const initial = {
    hostname: 'tautulli.internal',
    port: 8181,
    useSsl: false,
    urlBase: '',
    externalUrl: '',
    apiKey: '[REDACTED]',
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
    if (endpoint.endsWith('/settings/public'))
      return route.fulfill({ json: { mediaServerType: 1 } });
    if (endpoint.endsWith('/settings/plex'))
      return route.fulfill({ json: { libraries: [] } });
    if (endpoint.endsWith('/settings/plex/sync'))
      return route.fulfill({ json: { running: false } });
    if (!endpoint.endsWith('/settings/tautulli'))
      return route.fulfill({ json: {} });
    if (request.method() === 'GET') return route.fulfill({ json: initial });
    const body = request.postDataJSON();
    writes.push(body);
    return route.fulfill({ json: { ...initial, ...body } });
  });
  await page.goto('/admin/media-libraries');
  await expect(page.getByLabel('Tautulli API Key')).toHaveValue('');
  await page
    .getByLabel('Tautulli External URL')
    .fill('https://tautulli.example.test');
  const save = page.getByRole('button', { name: 'Save Tautulli Connection' });
  await save.click();
  await expect(page.getByText('Connection settings saved.')).toBeVisible();
  expect(writes[0]).toEqual({
    ...initial,
    externalUrl: 'https://tautulli.example.test',
  });
  if (process.env.LUMEN_CAPTURE_MEDIA_LIBRARIES)
    await page.screenshot({
      path: info.outputPath('tautulli.png'),
      fullPage: true,
    });
  await page.getByLabel('Tautulli Hostname').fill('');
  await save.click();
  await expect(page.getByText('Connection settings saved.')).toBeVisible();
  expect(writes[1]).toEqual({
    ...initial,
    hostname: '',
    externalUrl: 'https://tautulli.example.test',
  });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth)
  ).toBeLessThanOrEqual(page.viewportSize()!.width);
});
