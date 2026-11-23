import { expect, test } from '@playwright/test';

for (const [locale, labels] of [
  [
    'fr',
    {
      title: 'Paramètres Soulseek',
      host: 'Nom d’hôte ou adresse IP',
      section: 'Connexion slskdN',
      test: 'Tester la connexion',
    },
  ],
  [
    'ar',
    {
      title: 'إعدادات Soulseek',
      host: 'اسم المضيف أو عنوان IP',
      section: 'اتصال slskdN',
      test: 'اختبار الاتصال',
    },
  ],
] as const) {
  test(`Soulseek settings follow the saved ${locale} locale`, async ({
    page,
  }) => {
    await page.route('https://**/*', (route) => route.abort());
    await page.route('**/lumen-config.json', (route) =>
      route.fulfill({ json: {} })
    );
    await page.route('**/api/v1/**', (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith('/auth/me'))
        return route.fulfill({ json: { id: 1, permissions: 2 } });
      if (path.endsWith('/user/1/settings/main'))
        return route.fulfill({ json: { locale } });
      if (path.endsWith('/settings/slskdn'))
        return route.fulfill({
          json: {
            enabled: true,
            hostname: 'slskd.internal',
            port: 5030,
            useSsl: false,
            baseUrl: '',
            searchFilter: '',
            apiKeyConfigured: true,
          },
        });
      return route.fulfill({ json: {} });
    });
    await page.goto('/admin/soulseek');
    await expect(
      page.getByRole('heading', { name: labels.title })
    ).toBeVisible();
    await expect(page.getByLabel(labels.host)).toHaveValue('slskd.internal');
    await expect(
      page.getByRole('heading', { name: labels.section })
    ).toBeVisible();
    await expect(page.getByRole('button', { name: labels.test })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute(
      'dir',
      locale === 'ar' ? 'rtl' : 'ltr'
    );
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth)
    ).toBeLessThanOrEqual(page.viewportSize()!.width);
    const captureDir = process.env.LUMEN_REQUEST_SERVICE_CAPTURE_DIR;
    if (captureDir)
      await page.screenshot({
        path: `${captureDir}/soulseek-${locale}-${page.viewportSize()?.width}.png`,
        fullPage: true,
      });
  });
}

test('Soulseek tests with the stored key and explicitly removes it when disabled', async ({
  page,
}, info) => {
  const path = '/api/v1/settings/slskdn';
  const settings = {
    enabled: true,
    hostname: 'slskd.internal',
    port: 5030,
    useSsl: false,
    baseUrl: '',
    searchFilter: '',
    apiKeyConfigured: true,
  };
  const writes: Record<string, unknown>[] = [];
  let currentSettings = settings;
  let saveAttempts = 0;
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (pathname.endsWith('/auth/me'))
      return route.fulfill({ json: { id: 1, permissions: 2 } });
    if (pathname === path + '/test') {
      writes.push(request.postDataJSON());
      return route.fulfill({
        json: {
          version: 'fixture',
          features: { wishlist: true, libraryHealth: true, songId: false },
        },
      });
    }
    if (pathname !== path) return route.fulfill({ json: {} });
    if (request.method() === 'GET') {
      if (saveAttempts === 1) {
        return route.fulfill({ json: settings });
      }
      return route.fulfill({ json: currentSettings });
    }
    const body = request.postDataJSON();
    writes.push(body);
    currentSettings = {
      ...currentSettings,
      ...body,
      apiKeyConfigured: !body.clearApiKey,
    };
    saveAttempts += 1;
    return route.fulfill({ json: currentSettings });
  });
  await page.goto('/me');
  await page.getByRole('link', { name: 'Open Soulseek Settings' }).click();
  await page.getByRole('button', { name: 'Test Connection' }).click();
  await expect(page.getByText('SongID unavailable.')).toBeVisible();
  expect(writes[0]).not.toHaveProperty('apiKey');
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.screenshot({
    path: info.outputPath('soulseek.png'),
    fullPage: true,
  });
  await page.getByLabel('Remove Saved API Key').check();
  await expect(
    page.getByRole('button', { name: 'Save Changes' })
  ).toBeDisabled();
  await page.getByLabel('Enable Soulseek Requests').uncheck();
  await page.getByRole('button', { name: 'Save Changes' }).click();
  await expect(page.getByRole('alert')).toContainText(
    'Could not save Soulseek settings.'
  );
  const captureDir = process.env.LUMEN_REQUEST_SERVICE_CAPTURE_DIR;
  if (captureDir)
    await page.screenshot({
      path: `${captureDir}/soulseek-readback-failure-${page.viewportSize()?.width}.png`,
      fullPage: true,
    });
  await expect(
    page.getByRole('button', { name: 'Save Changes' })
  ).toBeEnabled();
  await expect(page.getByLabel('Remove Saved API Key')).toBeChecked();
  await page.getByRole('button', { name: 'Save Changes' }).click();
  await expect(page.getByText('Soulseek settings saved.')).toBeVisible();
  await expect(page.getByLabel('Remove Saved API Key')).toHaveCount(0);
  expect(writes[1]).toMatchObject({ enabled: false, clearApiKey: true });
  expect(writes[2]).toMatchObject({ enabled: false, clearApiKey: true });
});
