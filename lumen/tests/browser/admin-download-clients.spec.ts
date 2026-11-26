import { expect, test } from '@playwright/test';

const locale = (
  ['en', 'fr', 'ar'].includes(process.env.LUMEN_DOWNLOAD_CLIENTS_LOCALE ?? '')
    ? process.env.LUMEN_DOWNLOAD_CLIENTS_LOCALE
    : 'en'
) as 'en' | 'fr' | 'ar';
const mount = process.env.LUMEN_TEST_MOUNT === '/lumen' ? '/lumen' : '';
const appPath = (path: string) => `${mount}${path}`;
const labels = {
  en: {
    page: 'Download Client Settings',
    back: 'Administration',
    section: 'Live Download Progress',
    interval: 'Refresh Interval (Seconds)',
    apiKey: 'API Key',
    test: 'Test Client',
    connected: 'Connected to Usenet (fixture).',
    saveFailure: 'Could not update download client settings.',
    saved: 'Download client settings saved.',
    save: 'Save Changes',
    lastCheck: 'Last check passed.',
  },
  fr: {
    page: 'Paramètres du client de téléchargement',
    back: 'Administration',
    section: 'Progression des téléchargements en direct',
    interval: 'Intervalle d’actualisation (secondes)',
    apiKey: 'Clé API',
    test: 'Tester le client',
    connected: 'Connecté à Usenet (fixture).',
    saveFailure:
      'Impossible de mettre à jour les paramètres du client de téléchargement.',
    saved: 'Paramètres du client de téléchargement enregistrés.',
    save: 'Enregistrer les modifications',
    lastCheck: 'La dernière vérification a réussi.',
  },
  ar: {
    page: 'إعدادات عميل التنزيل',
    back: 'الإدارة',
    section: 'تقدم التنزيل المباشر',
    interval: 'الفاصل الزمني للتحديث (ثوانٍ)',
    apiKey: 'مفتاح API',
    test: 'اختبار العميل',
    connected: 'تم الاتصال بـ Usenet (fixture).',
    saveFailure: 'تعذر تحديث إعدادات عميل التنزيل.',
    saved: 'تم حفظ إعدادات عميل التنزيل.',
    save: 'حفظ التغييرات',
    lastCheck: 'نجح آخر فحص.',
  },
} as const;

test('download clients test and save with the existing credential', async ({
  page,
}, info) => {
  const text = labels[locale];
  const endpoint = '/api/v1/settings/download-clients';
  let saved = {
    pollIntervalSeconds: 3,
    clients: [
      {
        id: 7,
        name: 'Usenet',
        type: 'sabnzbd',
        hostname: 'sab.internal',
        port: 8080,
        useSsl: false,
        enabled: true,
        baseUrl: '',
        username: '',
        passwordConfigured: true,
        password: '[REDACTED]',
      },
    ],
  };
  let staleReadback: typeof saved | undefined;
  let saveCount = 0;
  const writes: Record<string, unknown>[] = [];
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace(/^\/lumen(?=\/)/, '');
    if (path.endsWith('/auth/me'))
      return route.fulfill({ json: { id: 1, permissions: 2 } });
    if (path.endsWith('/user/1/settings/main'))
      return route.fulfill({ json: { locale } });
    if (path === endpoint + '/status')
      return route.fulfill({ json: { clients: [{ clientId: 7, ok: true }] } });
    if (path === endpoint + '/test') {
      writes.push(request.postDataJSON());
      return route.fulfill({ json: { success: true, version: 'fixture' } });
    }
    if (path !== endpoint) return route.fulfill({ json: {} });
    if (request.method() === 'GET') {
      if (staleReadback) {
        const stale = staleReadback;
        staleReadback = undefined;
        return route.fulfill({ json: stale });
      }
      return route.fulfill({ json: saved });
    }
    if (request.method() === 'PUT') {
      const body = request.postDataJSON();
      writes.push(body);
      if (saveCount === 0) staleReadback = saved;
      saved = {
        ...body,
        clients: body.clients.map((row: object) => ({
          ...row,
          passwordConfigured: true,
          password: '[REDACTED]',
        })),
      };
      saveCount++;
    }
    return route.fulfill({ json: saved });
  });
  await page.goto(appPath('/me'));
  await page
    .getByRole('link', { name: 'Open Download Client Settings' })
    .click();
  await expect(
    page.getByRole('heading', { name: text.page, exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: text.back, exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: text.section, exact: true })
  ).toBeVisible();
  await page.getByText('Usenet', { exact: true }).click();
  await expect(page.getByLabel(text.apiKey)).toHaveValue('');
  await expect(page.getByText(text.lastCheck)).toBeVisible();
  await page.getByRole('button', { name: text.test }).click();
  await expect(page.getByText(text.connected)).toBeVisible();
  await page.getByLabel(text.interval).fill('8');
  await expect(page.locator('html')).toHaveAttribute(
    'dir',
    locale === 'ar' ? 'rtl' : 'ltr'
  );
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth)
  ).toBeLessThanOrEqual(page.viewportSize()!.width);
  await page.screenshot({
    path: info.outputPath('download-clients.png'),
    fullPage: true,
  });
  await page.getByRole('button', { name: text.save }).click();
  await expect(page.getByText(text.saved, { exact: true })).toHaveCount(0);
  await expect(page.getByText(text.saveFailure)).toBeVisible();
  await expect(page.getByLabel(text.interval)).toHaveValue('8');
  await page.getByText(text.saveFailure).scrollIntoViewIfNeeded();
  await page.screenshot({
    path: info.outputPath('readback-failure.png'),
  });
  await page.getByRole('button', { name: text.save }).click();
  await expect(page.getByText(text.saved)).toBeVisible();
  expect(writes[0]).toMatchObject({
    id: 7,
    type: 'sabnzbd',
    clearPassword: false,
  });
  expect(writes[0]).not.toHaveProperty('password');
  for (const write of writes.slice(1)) {
    expect(write).toMatchObject({
      pollIntervalSeconds: 8,
      clients: [{ id: 7, type: 'sabnzbd' }],
    });
    expect((write.clients as unknown[])[0]).not.toHaveProperty('password');
  }
});

test('rTorrent keeps its HTTP basic-auth username when settings are saved', async ({
  page,
}, info) => {
  let saved = {
    pollIntervalSeconds: 3,
    clients: [
      {
        id: 12,
        name: 'Torrent bridge',
        type: 'rtorrent',
        hostname: 'torrent.internal',
        port: 80,
        useSsl: false,
        enabled: true,
        baseUrl: '',
        username: 'reader',
        passwordConfigured: true,
        password: '[REDACTED]',
      },
    ],
  };
  let savedPayload: Record<string, unknown> | undefined;
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace(/^\/lumen(?=\/)/, '');
    if (path.endsWith('/auth/me'))
      return route.fulfill({ json: { id: 1, permissions: 2 } });
    if (path.endsWith('/user/1/settings/main'))
      return route.fulfill({ json: { locale: 'en' } });
    if (path.endsWith('/settings/download-clients/status'))
      return route.fulfill({ json: { clients: [{ clientId: 12, ok: true }] } });
    if (path !== '/api/v1/settings/download-clients')
      return route.fulfill({ json: {} });
    if (request.method() === 'PUT') {
      savedPayload = request.postDataJSON();
      saved = {
        ...savedPayload,
        clients: savedPayload.clients.map((client: object) => ({
          ...client,
          passwordConfigured: true,
          password: '[REDACTED]',
        })),
      } as typeof saved;
    }
    return route.fulfill({ json: saved });
  });

  await page.goto(appPath('/admin/download-clients'));
  const client = page.locator('details').filter({ hasText: 'Torrent bridge' });
  await client.locator('summary').click();
  await expect(page.getByLabel('Username')).toHaveValue('reader');
  await page.screenshot({
    path: info.outputPath('rtorrent-username-field.png'),
    fullPage: true,
  });
  await page.getByLabel('Username').fill('updated-reader');
  await page.getByRole('button', { name: 'Save Changes' }).click();
  await expect(page.getByText('Download client settings saved.')).toBeVisible();
  expect(savedPayload).toMatchObject({
    clients: [{ id: 12, type: 'rtorrent', username: 'updated-reader' }],
  });
});
