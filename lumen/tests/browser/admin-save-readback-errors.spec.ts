import { expect, test, type Page } from '@playwright/test';

const mount = process.env.LUMEN_TEST_MOUNT === '/lumen' ? '/lumen' : '';
const appPath = (path: string) => `${mount}${path}`;

async function mockAdmin(page: Page) {
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname
      .replace(/^\/lumen/, '')
      .replace(/^\/api\/v1/, '');
    if (path === '/auth/me')
      return route.fulfill({
        json: { id: 1, displayName: 'Administrator', permissions: 2 },
      });
    if (path === '/user/1/settings/main')
      return route.fulfill({ json: { locale: 'en', lumenPreferences: {} } });
    if (path === '/settings/public')
      return route.fulfill({ json: { applicationTitle: 'SeerrNG' } });
    return route.fulfill({ json: {} });
  });
}

test('General Settings distinguishes a lost settings read after a saved write', async ({
  page,
}, testInfo) => {
  let settings = {
    applicationTitle: 'SeerrNG',
    applicationUrl: 'https://seerr.example.test',
    youtubeUrl: '',
    cacheImages: true,
    versionCheck: true,
    defaultFrontend: 'native',
    enforceDefaultFrontend: false,
    lockLumenForNonAdmins: false,
    lumenPublicUrl: '',
    localLogin: true,
    mediaServerLogin: true,
    newPlexLogin: false,
    jellyfinQuickConnectOnly: false,
    otherUsersAvailability: 'show',
  };
  let failReadback = false;
  let writes = 0;
  await mockAdmin(page);
  await page.route('**/api/v1/settings/main', (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON() as Partial<typeof settings>;
      writes++;
      settings = { ...settings, ...body };
      failReadback = writes === 1;
      return route.fulfill({ json: settings });
    }
    if (failReadback) {
      failReadback = false;
      return route.fulfill({ status: 503, json: { message: 'Unavailable' } });
    }
    return route.fulfill({ json: settings });
  });

  await page.goto(appPath('/admin/general'));
  const title = page.getByLabel('Application Title');
  const save = page.getByRole('button', { name: 'Save Application Settings' });
  await title.fill('Family Library');
  await save.click();
  await expect(page.getByRole('alert')).toHaveText(
    'Could not confirm the saved application settings.'
  );
  await expect(title).toHaveValue('Family Library');
  await expect(save).toBeEnabled();
  if (
    process.env.LUMEN_CAPTURE_ADMIN_READBACK &&
    ['desktop', 'iphone'].includes(testInfo.project.name)
  )
    await page.screenshot({
      path: `${process.env.LUMEN_CAPTURE_ADMIN_READBACK}/general-unconfirmed-${testInfo.project.name}.png`,
      fullPage: true,
    });

  await save.click();
  await expect(
    page.getByText('Application settings saved.', { exact: true })
  ).toBeVisible();
  await expect(title).toHaveValue('Family Library');
  await expect(save).toBeDisabled();
  expect(writes).toBe(2);
});

test('Connection Hosts distinguishes a lost settings read after a saved write', async ({
  page,
}, testInfo) => {
  let hosts: { name: string; hostname: string }[] = [];
  let failReadback = false;
  let writes = 0;
  await mockAdmin(page);
  await page.route('**/api/v1/settings/connection-hosts', (route) => {
    if (route.request().method() === 'PUT') {
      hosts = route.request().postDataJSON().hosts;
      writes++;
      failReadback = writes === 1;
      return route.fulfill({ json: hosts });
    }
    if (failReadback) {
      failReadback = false;
      return route.fulfill({ status: 503, json: { message: 'Unavailable' } });
    }
    return route.fulfill({ json: hosts });
  });

  await page.goto(appPath('/admin/connection-hosts'));
  await page.getByRole('button', { name: 'Add Host' }).click();
  await page.getByLabel('Name', { exact: true }).fill('Media Host');
  await page.getByLabel('Hostname', { exact: true }).fill('media.internal');
  const save = page.getByRole('button', { name: 'Save Changes' });
  await save.click();
  await expect(page.getByRole('alert')).toHaveText(
    'Could not confirm the saved connection hosts.'
  );
  await expect(page.getByLabel('Hostname', { exact: true })).toHaveValue(
    'media.internal'
  );
  await expect(save).toBeEnabled();
  if (
    process.env.LUMEN_CAPTURE_ADMIN_READBACK &&
    ['desktop', 'iphone'].includes(testInfo.project.name)
  )
    await page.screenshot({
      path: `${process.env.LUMEN_CAPTURE_ADMIN_READBACK}/hosts-unconfirmed-${testInfo.project.name}.png`,
      fullPage: true,
    });

  await save.click();
  await expect(
    page.getByText('Connection hosts saved.', { exact: true })
  ).toBeVisible();
  await expect(save).toBeDisabled();
  expect(writes).toBe(2);
});

test('Discovery Integrations distinguishes a lost settings read after a saved write', async ({
  page,
}, testInfo) => {
  const configuration = {
    trakt: { configured: false, clientId: '' },
    anilist: { configured: false, clientId: '' },
    simkl: { configured: false, clientId: '' },
    mdblist: { configured: false },
  };
  let failReadback = false;
  let writes = 0;
  await mockAdmin(page);
  await page.route('**/api/v1/integrations/discovery/mappings/packs', (route) =>
    route.fulfill({ json: { packs: [] } })
  );
  await page.route(
    '**/api/v1/integrations/discovery/configuration',
    (route) => {
      if (route.request().method() === 'PUT') {
        const changes = route.request().postDataJSON() as Record<
          string,
          Record<string, string>
        >;
        Object.assign(configuration.trakt, changes.trakt);
        configuration.trakt.configured = Boolean(configuration.trakt.clientId);
        writes++;
        failReadback = writes === 1;
        return route.fulfill({ json: configuration });
      }
      if (failReadback) {
        failReadback = false;
        return route.fulfill({ status: 503, json: { message: 'Unavailable' } });
      }
      return route.fulfill({ json: configuration });
    }
  );

  await page.goto(appPath('/admin/discovery'));
  const trakt = page.locator('section').filter({
    has: page.getByRole('heading', { name: 'Trakt' }),
  });
  const clientId = trakt.getByLabel('Client ID');
  await clientId.fill('trakt-client-id');
  const save = page.getByRole('button', { name: 'Save Discovery Credentials' });
  await save.click();
  await expect(page.getByRole('alert')).toHaveText(
    'Could not confirm the saved discovery credentials. Try again.'
  );
  await expect(clientId).toHaveValue('trakt-client-id');
  await expect(save).toBeEnabled();
  if (
    process.env.LUMEN_CAPTURE_ADMIN_READBACK &&
    ['desktop', 'iphone'].includes(testInfo.project.name)
  )
    await page.screenshot({
      path: `${process.env.LUMEN_CAPTURE_ADMIN_READBACK}/discovery-unconfirmed-${testInfo.project.name}.png`,
      fullPage: true,
    });

  await save.click();
  await expect(
    page.getByText('Discovery credentials saved.', { exact: true })
  ).toBeVisible();
  await expect(clientId).toHaveValue('trakt-client-id');
  await expect(save).toBeDisabled();
  expect(writes).toBe(2);
});
