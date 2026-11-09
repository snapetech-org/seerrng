import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

test.use({ serviceWorkers: 'block' });
test.afterEach(async ({ page }) => page.unrouteAll({ behavior: 'wait' }));

// Exercise the shipped application and real Axios/SWR/Formik owners with
// deterministic API responses. These fixtures never write a provider account.
const fixture = async (page: Page, theme = 'seerrNGJ', setup = false) => {
  let plex = {
    name: 'Media Server',
    ip: '',
    port: 32400,
    useSsl: false,
    machineId: 'fixture',
    libraries: [
      { id: '1', name: 'Movies', type: 'movie', enabled: false },
      { id: '2', name: 'Series', type: 'show', enabled: false },
    ],
    webAppUrl: '',
    analyzeOnPlayback: false,
  };
  const state = {
    requests: [] as string[],
    writes: [] as Record<string, unknown>[],
    discovery: 0,
    limitNextWrite: false,
  };
  const manifests = ['persiusNG', 'seerrNGJ', 'seerrOrig'].map((id) =>
    JSON.parse(
      readFileSync(
        path.join(process.cwd(), 'themes', id, 'manifest.json'),
        'utf8'
      )
    )
  );
  const servers = [
    {
      name: 'Media Server',
      clientIdentifier: 'fixture-server',
      owned: true,
      provides: ['server'],
      connection: [
        ...[
          '172.19.0.1',
          '172.31.200.1',
          '127.0.0.1',
          '192.168.5.124',
          '108.80.4.149',
        ].map((address) => ({
          address,
          port: 32400,
          protocol: 'http',
          uri: `http://${address}:32400`,
          local: address !== '108.80.4.149',
          status: 200,
        })),
        {
          address: '192-168-5-124.fixture.plex.direct',
          port: 32400,
          protocol: 'https',
          uri: 'https://192-168-5-124.fixture.plex.direct:32400',
          local: true,
          status: 500,
          message: 'unable to get local issuer certificate',
        },
      ],
    },
  ];
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    state.requests.push(pathname);
    if (pathname.endsWith('/theme.css'))
      return route.fulfill({
        body: readFileSync(
          path.join(
            process.cwd(),
            'themes',
            pathname.split('/').at(-2)!,
            'theme.css'
          ),
          'utf8'
        ),
        contentType: 'text/css',
      });
    let json: unknown = {};
    if (pathname === '/api/v1/settings/public')
      json = {
        initialized: !setup,
        applicationTitle: 'SeerrNG',
        mediaServerType: 1,
        locale: 'en',
        localLogin: true,
        enabledMediaCategories: { movie: true, tv: true },
        defaultEnabledMediaCategories: { movie: true, tv: true },
      };
    else if (pathname === '/api/v1/auth/me')
      json = {
        id: 1,
        email: 'fixture@example.test',
        avatar: '/logo_full.svg',
        displayName: 'Admin',
        permissions: 2,
        userType: 2,
        settings: { interfaceTheme: theme, locale: 'en' },
      };
    else if (pathname === '/api/v1/interface-themes')
      json = { themes: manifests };
    else if (pathname === '/api/v1/settings/plex/devices/servers') {
      state.discovery++;
      json = servers;
    } else if (
      pathname === '/api/v1/settings/plex/library' &&
      request.method() === 'POST'
    ) {
      const body = request.postDataJSON();
      state.writes.push(body);
      if (state.limitNextWrite) {
        state.limitNextWrite = false;
        return route.fulfill({
          status: 429,
          headers: { 'Retry-After': '120' },
          json: { message: 'Too many requests' },
        });
      }
      const enabled = String(body.enable ?? '').split(',');
      plex = {
        ...plex,
        libraries: plex.libraries.map((library) => ({
          ...library,
          enabled: enabled.includes(library.id),
        })),
      };
      json = plex.libraries;
    } else if (pathname === '/api/v1/settings/plex') {
      if (request.method() === 'POST')
        plex = { ...plex, ...request.postDataJSON() };
      json = plex;
    } else if (pathname === '/api/v1/settings/plex/sync')
      json = { running: false, progress: 0, total: 0, libraries: [] };
    else if (pathname === '/api/v1/settings/tautulli')
      json = {
        hostname: '',
        port: 8181,
        useSsl: false,
        urlBase: '',
        apiKey: '',
        externalUrl: '',
      };
    else if (pathname === '/api/v1/status')
      json = {
        version: 'fixture',
        commitTag: 'local',
        restartRequired: false,
        appDataWritable: true,
        appDataStatus: 'ok',
        appDataPath: '/config',
      };
    else if (pathname === '/api/v1/status/tls')
      json = {
        configuredMode: 'disabled',
        mode: 'disabled',
        configuredHttpAuthAllowed: true,
        httpAuthAllowed: true,
        configuredHttpsPort: 5056,
        configuredRedirectsHttpToHttps: false,
        hosts: [],
        environmentOverrides: [],
        setupRequired: false,
        restartRequired: false,
      };
    else if (pathname === '/api/v1/backdrops') json = [];
    else if (pathname.includes('/request') || pathname.includes('/downloads'))
      json = { results: [], pageInfo: { results: 0, pages: 0 } };
    return route.fulfill({ json });
  });
  return state;
};

for (const theme of ['seerrNGJ', 'seerrOrig'])
  for (const width of [320, 390, 1440]) {
    test(`Plex discovery recommends a LAN connection and preserves manual/advanced choices ${theme} ${width}`, async ({
      page,
    }, info) => {
      await page.setViewportSize({ width, height: 900 });
      const state = await fixture(page, theme);
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto('/settings/plex');
      await page
        .getByRole('button', { name: 'Load Servers', exact: true })
        .click();
      await expect(page.locator('#hostname')).toHaveValue('192.168.5.124');
      await expect(page.locator('#preset option')).toHaveCount(2);
      await expect(page.locator('#preset')).toHaveValue('fixture-server');
      await expect(
        page.getByText('Recommended connection: Local Network · HTTP.', {
          exact: false,
        })
      ).toBeVisible();
      expect(state.discovery).toBe(1);
      const disclosure = page
        .locator('summary')
        .filter({ hasText: 'Other Connections (Advanced)' });
      await disclosure.focus();
      await page.keyboard.press('Enter');
      await expect(page.locator('#plexConnection')).toBeVisible();
      await expect(
        page
          .locator('#plexConnection option')
          .filter({ hasText: 'Certificate could not be verified' })
      ).toBeDisabled();
      await page
        .locator('#plexConnection')
        .selectOption('fixture-server|http|172.19.0.1|32400');
      await expect(page.locator('#hostname')).toHaveValue('172.19.0.1');
      await page.locator('#hostname').fill('plex.example.test');
      await page
        .getByRole('button', { name: 'Refresh Servers', exact: true })
        .click();
      await expect.poll(() => state.discovery).toBe(2);
      await expect(page.locator('#hostname')).toHaveValue('plex.example.test');
      await expect(page.locator('html')).toHaveAttribute(
        'data-interface-theme',
        theme
      );
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth
        )
      ).toBe(false);
      expect(errors).toEqual([]);
      await page.screenshot({
        path: info.outputPath('plex-picker-advanced.png'),
        fullPage: true,
      });
    });
  }

test('Plex library updates honor Retry-After and never replay a rate-limited write', async ({
  page,
}, info) => {
  const state = await fixture(page);
  await page.goto('/settings/plex');
  const movies = page.getByRole('button', { name: 'Movies', exact: true });
  const series = page.getByRole('button', { name: 'Series', exact: true });
  await expect(movies).toBeEnabled();
  await page.clock.install();
  state.limitNextWrite = true;
  await movies.click();
  await expect(
    page.getByText('Requests Paused', { exact: true })
  ).toBeVisible();
  await expect(movies).toBeDisabled();
  await expect(
    page.getByRole('button', { name: 'Load Servers', exact: true })
  ).toBeDisabled();
  const count = state.requests.length;
  await page.clock.fastForward(119_000);
  expect(state.requests).toHaveLength(count);
  expect(state.writes).toHaveLength(1);
  await expect(movies).toHaveAttribute('aria-pressed', 'false');
  await page.screenshot({
    path: info.outputPath('plex-rate-limit.png'),
    fullPage: true,
  });
  await page.clock.fastForward(1000);
  await expect(page.getByText('Requests Paused', { exact: true })).toHaveCount(
    0
  );
  expect(state.writes).toHaveLength(1);
  await movies.click();
  await expect(movies).toHaveAttribute('aria-pressed', 'true');
  await expect(series).toBeEnabled();
  await series.click();
  await expect(series).toHaveAttribute('aria-pressed', 'true');
  expect(state.writes.map((body) => body.enable)).toEqual(['1', '1', '1,2']);
});

test('setup library validation stays idle and continues after confirmed selection', async ({
  page,
}) => {
  const state = await fixture(page, 'seerrNGJ', true);
  await page.goto('/setup');
  const movies = page.getByRole('button', { name: 'Movies', exact: true });
  await expect(movies).toBeVisible();
  const initial = state.requests.filter(
    (url) => url === '/api/v1/settings/plex'
  ).length;
  await page.waitForTimeout(1500);
  expect(
    state.requests.filter((url) => url === '/api/v1/settings/plex')
  ).toHaveLength(initial);
  expect(initial).toBeLessThanOrEqual(3);
  await movies.click();
  await expect(movies).toHaveAttribute('aria-pressed', 'true');
  await expect(
    page.getByRole('button', { name: 'Continue', exact: true })
  ).toBeEnabled();
  await page.waitForTimeout(1000);
  expect(
    state.requests.filter((url) => url === '/api/v1/settings/plex').length
  ).toBeLessThanOrEqual(initial + 1);
  expect(state.writes).toHaveLength(1);
});
