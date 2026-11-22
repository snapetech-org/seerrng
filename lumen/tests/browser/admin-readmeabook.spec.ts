import { expect, test } from '@playwright/test';

for (const [locale, labels] of [
  [
    'fr',
    {
      title: 'Paramètres ReadMeABook',
      section: 'Connexion ReadMeABook',
      approvals: 'Demandes de livres audio en attente d’approbation',
      dashboard: 'Tableau de bord des acquisitions',
    },
  ],
  [
    'ar',
    {
      title: 'إعدادات ReadMeABook',
      section: 'اتصال ReadMeABook',
      approvals: 'طلبات الكتب الصوتية بانتظار الموافقة',
      dashboard: 'لوحة الاقتناء',
    },
  ],
] as const) {
  test(`ReadMeABook settings and operations follow the saved ${locale} locale`, async ({
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
      if (path.endsWith('/settings/readmeabook'))
        return route.fulfill({
          json: {
            enabled: true,
            hostname: 'books.internal',
            port: 3030,
            useSsl: false,
            baseUrl: '',
            apiKeyConfigured: true,
          },
        });
      if (path.endsWith('/readmeabook/admin/requests'))
        return route.fulfill({ json: [] });
      if (path.endsWith('/readmeabook/admin/dashboard'))
        return route.fulfill({
          json: { metrics: {}, activeDownloads: [], recentRequests: [] },
        });
      return route.fulfill({ json: {} });
    });
    await page.goto('/admin/readmeabook');
    await expect(
      page.getByRole('heading', { name: labels.title })
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: labels.section })
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: labels.approvals })
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: labels.dashboard })
    ).toBeVisible();
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
        path: `${captureDir}/readmeabook-${locale}-${page.viewportSize()?.width}.png`,
        fullPage: true,
      });
  });
}

test('ReadMeABook tests with the stored key and explicitly removes it when disabled', async ({
  page,
}, info) => {
  const path = '/api/v1/settings/readmeabook';
  const settings = {
    enabled: true,
    hostname: 'books.internal',
    port: 3030,
    useSsl: false,
    baseUrl: '',
    apiKeyConfigured: true,
  };
  const approvals = '/api/v1/readmeabook/admin/requests';
  let waiting = [
    {
      id: 7,
      title: 'Fixture Book',
      author: 'Fixture Author',
      user: { username: 'listener' },
    },
    { id: 8, title: 'Second Book', user: null },
  ];
  const decisions: string[] = [];
  const writes: Record<string, unknown>[] = [];
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
      return route.fulfill({ json: { success: true } });
    }
    if (pathname === '/api/v1/readmeabook/admin/dashboard')
      return route.fulfill({
        json: {
          metrics: { waiting: waiting.length },
          activeDownloads: [],
          recentRequests: [],
        },
      });
    if (pathname === approvals) return route.fulfill({ json: waiting });
    if (pathname.startsWith(approvals + '/')) {
      decisions.push(pathname.slice(approvals.length));
      waiting = waiting.filter(({ id }) => !pathname.includes(`/${id}/`));
      return route.fulfill({ json: {} });
    }
    if (pathname !== path) return route.fulfill({ json: {} });
    if (request.method() === 'GET') return route.fulfill({ json: settings });
    const body = request.postDataJSON();
    writes.push(body);
    return route.fulfill({
      json: { ...settings, ...body, apiKeyConfigured: !body.clearApiKey },
    });
  });
  await page.goto('/me');
  await page.getByRole('link', { name: 'Open ReadMeABook Settings' }).click();
  await page.getByRole('button', { name: 'Test Connection' }).click();
  await expect(page.getByText('Connected to ReadMeABook.')).toBeVisible();
  expect(writes[0]).not.toHaveProperty('apiKey');
  await page.getByText('Metrics', { exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Metrics' })).toHaveValue(
    /"waiting": 2/
  );
  await page.screenshot({
    path: info.outputPath('operations.png'),
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Approve Fixture Book' }).click();
  await expect(
    page.getByRole('button', { name: 'Approve Fixture Book' })
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Deny Second Book' }).click();
  await expect(
    page.getByText('No audiobook requests are waiting for approval.')
  ).toBeVisible();
  expect(decisions).toEqual(['/7/approve', '/8/deny']);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.screenshot({
    path: info.outputPath('readmeabook.png'),
    fullPage: true,
  });
  await page.getByLabel('Remove Saved API Token').check();
  await expect(
    page.getByRole('button', { name: 'Save Changes' })
  ).toBeDisabled();
  await page.getByLabel('Enable ReadMeABook Requests').uncheck();
  await page.getByRole('button', { name: 'Save Changes' }).click();
  await expect(page.getByText('ReadMeABook settings saved.')).toBeVisible();
  await expect(page.getByLabel('Remove Saved API Token')).toHaveCount(0);
  expect(writes[1]).toMatchObject({ enabled: false, clearApiKey: true });
});
