import { expect, test } from '@playwright/test';

const mount = process.env.LUMEN_TEST_MOUNT === '/lumen' ? '/lumen' : '';
const appPath = (path: string) => `${mount}${path}`;
const locale = (
  ['en', 'fr', 'ar'].includes(process.env.LUMEN_READERS_LOCALE ?? '')
    ? process.env.LUMEN_READERS_LOCALE
    : 'en'
) as 'en' | 'fr' | 'ar';

const labels = {
  en: {
    title: 'Audiobookshelf Settings',
    back: 'Administration',
    connection: 'Audiobookshelf Connection',
    service: 'Service Name',
    hostname: 'Hostname',
    apiKey: 'API Key',
    library: 'Audiobook Library',
    choose: 'Choose a Library',
    scan: 'Enable Library Scan',
    test: 'Test Connection',
    save: 'Save Changes',
    disconnect: 'Disconnect',
    confirm: 'Confirm Disconnect',
    keep: 'Keep Connection',
    verified: 'Audiobookshelf connection verified.',
    scanNotice: 'Select the audiobook library to scan.',
    saved: 'Audiobookshelf settings saved.',
    disconnected: 'Audiobookshelf disconnected.',
  },
  fr: {
    title: 'Paramètres de Audiobookshelf',
    back: 'Administration',
    connection: 'Connexion à Audiobookshelf',
    service: 'Nom du service',
    hostname: "Nom d'hôte",
    apiKey: 'Clé API',
    library: 'Bibliothèque de livres audio',
    choose: 'Choisir une bibliothèque',
    scan: 'Activer l’analyse de la bibliothèque',
    test: 'Tester la connexion',
    save: 'Enregistrer les modifications',
    disconnect: 'Déconnecter',
    confirm: 'Confirmer la déconnexion',
    keep: 'Conserver la connexion',
    verified: 'Connexion à Audiobookshelf vérifiée.',
    scanNotice: 'Sélectionnez la bibliothèque de livres audio à analyser.',
    saved: 'Paramètres de Audiobookshelf enregistrés.',
    disconnected: 'Audiobookshelf déconnecté.',
  },
  ar: {
    title: 'إعدادات Audiobookshelf',
    back: 'الإدارة',
    connection: 'اتصال Audiobookshelf',
    service: 'اسم الخدمة',
    hostname: 'اسم المضيف',
    apiKey: 'مفتاح API',
    library: 'مكتبة الكتب الصوتية',
    choose: 'اختر مكتبة',
    scan: 'تفعيل فحص المكتبة',
    test: 'اختبار الاتصال',
    save: 'حفظ التغييرات',
    disconnect: 'فصل الاتصال',
    confirm: 'تأكيد فصل الاتصال',
    keep: 'الاحتفاظ بالاتصال',
    verified: 'تم التحقق من اتصال Audiobookshelf.',
    scanNotice: 'اختر مكتبة الكتب الصوتية المطلوب فحصها.',
    saved: 'تم حفظ إعدادات Audiobookshelf.',
    disconnected: 'تم فصل Audiobookshelf.',
  },
} as const;

test('Audiobookshelf settings localize while preserving connection workflows', async ({
  page,
}) => {
  const text = labels[locale];
  const baseline = process.env.LUMEN_READERS_BASELINE === 'true';
  const writes: Record<string, unknown>[] = [];
  let settings: Record<string, unknown> | null = null;
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace(/^\/lumen/, '');
    if (path.endsWith('/auth/me'))
      return route.fulfill({ json: { id: 1, permissions: 2 } });
    if (path.endsWith('/user/1/settings/main'))
      return route.fulfill({ json: { locale } });
    if (path.endsWith('/settings/public'))
      return route.fulfill({ json: { applicationTitle: 'SeerrNG' } });
    if (path.endsWith('/settings/audiobookshelf/test'))
      return route.fulfill({
        json: { libraries: [{ id: 'audio-1', name: 'Fiction' }] },
      });
    if (path.endsWith('/settings/audiobookshelf')) {
      if (request.method() === 'GET') return route.fulfill({ json: settings });
      if (request.method() === 'PUT') {
        writes.push(request.postDataJSON() as Record<string, unknown>);
        settings = request.postDataJSON() as Record<string, unknown>;
        return route.fulfill({ json: settings });
      }
      if (request.method() === 'DELETE') {
        settings = null;
        return route.fulfill({ status: 204, body: '' });
      }
    }
    return route.fulfill({ json: {} });
  });

  await page.goto(appPath('/admin/audiobookshelf'));
  const visibleText = baseline ? labels.en : text;
  await expect(
    page.getByRole('heading', { name: visibleText.title, exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: visibleText.back, exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: visibleText.connection, exact: true })
  ).toBeVisible();
  await expect(
    page.getByLabel(visibleText.service, { exact: true })
  ).toBeVisible();
  await expect(
    page.getByLabel(visibleText.hostname, { exact: true })
  ).toBeVisible();
  await expect(
    page.getByLabel(visibleText.apiKey, { exact: true })
  ).toBeVisible();
  await expect(
    page.getByText(visibleText.library, { exact: true })
  ).toBeVisible();
  if (process.env.LUMEN_READERS_CAPTURE)
    await page.screenshot({
      path: `${process.env.LUMEN_READERS_CAPTURE}/${locale}-${page.viewportSize()?.width}.png`,
    });
  await expect(page.locator('html')).toHaveAttribute(
    'dir',
    locale === 'ar' ? 'rtl' : 'ltr'
  );
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth)
  ).toBeLessThanOrEqual(page.viewportSize()!.width);
  if (baseline) return;

  await page
    .getByLabel(text.hostname, { exact: true })
    .fill('audiobooks.local');
  await page.getByLabel(text.apiKey, { exact: true }).fill('fixture-key');
  await page.getByRole('button', { name: text.test, exact: true }).click();
  await expect(page.getByText(text.scanNotice, { exact: true })).toBeVisible();
  await page.locator('select').first().selectOption('audio-1');
  await page.getByRole('button', { name: text.save, exact: true }).click();
  await expect(page.getByText(text.saved, { exact: true })).toBeVisible();
  expect(writes).toHaveLength(1);
  expect(writes[0]).toMatchObject({
    hostname: 'audiobooks.local',
    apiKey: 'fixture-key',
    libraryId: 'audio-1',
    libraryName: 'Fiction',
  });
  await page
    .getByRole('button', { name: text.disconnect, exact: true })
    .click();
  await page.getByRole('button', { name: text.confirm, exact: true }).click();
  await expect(
    page.getByText(text.disconnected, { exact: true })
  ).toBeVisible();
});

test('Kavita settings localize and preserve their connection lifecycle', async ({
  page,
}) => {
  const service = {
    en: {
      title: 'Kavita Settings',
      connection: 'Kavita Connection',
      loadError: 'Couldn’t load Kavita settings',
      retry: 'Retry',
      verified: 'Kavita connection verified.',
      saved: 'Kavita settings saved.',
      disconnected: 'Kavita disconnected.',
    },
    fr: {
      title: 'Paramètres de Kavita',
      connection: 'Connexion à Kavita',
      loadError: 'Impossible de charger les paramètres de Kavita',
      retry: 'Réessayer',
      verified: 'Connexion à Kavita vérifiée.',
      saved: 'Paramètres de Kavita enregistrés.',
      disconnected: 'Kavita déconnecté.',
    },
    ar: {
      title: 'إعدادات Kavita',
      connection: 'اتصال Kavita',
      loadError: 'تعذر تحميل إعدادات Kavita',
      retry: 'إعادة المحاولة',
      verified: 'تم التحقق من اتصال Kavita.',
      saved: 'تم حفظ إعدادات Kavita.',
      disconnected: 'تم فصل Kavita.',
    },
  }[locale];
  let settings: Record<string, unknown> | null = null;
  let write: Record<string, unknown> | undefined;
  let failInitialLoad = true;
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace(/^\/lumen/, '');
    if (path.endsWith('/auth/me'))
      return route.fulfill({ json: { id: 1, permissions: 2 } });
    if (path.endsWith('/user/1/settings/main'))
      return route.fulfill({ json: { locale } });
    if (path.endsWith('/settings/public'))
      return route.fulfill({ json: { applicationTitle: 'SeerrNG' } });
    if (path.endsWith('/settings/kavita/test'))
      return route.fulfill({
        json: { libraries: [{ id: 'library-1', name: 'Fiction' }] },
      });
    if (path.endsWith('/settings/kavita')) {
      if (request.method() === 'GET') {
        if (failInitialLoad) {
          failInitialLoad = false;
          return route.fulfill({
            status: 503,
            json: { message: 'Unavailable' },
          });
        }
        return route.fulfill({ json: settings });
      }
      if (request.method() === 'PUT') {
        write = request.postDataJSON() as Record<string, unknown>;
        settings = write;
        return route.fulfill({ json: settings });
      }
      if (request.method() === 'DELETE') {
        settings = null;
        return route.fulfill({ status: 204, body: '' });
      }
    }
    return route.fulfill({ json: {} });
  });

  await page.goto(appPath('/admin/kavita'));
  await expect(page.getByRole('alert')).toContainText(service.loadError);
  await page.getByRole('button', { name: service.retry, exact: true }).click();
  await expect(
    page.getByRole('heading', { name: service.title, exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: service.connection, exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: labels[locale].back, exact: true })
  ).toBeVisible();
  await page
    .getByLabel(labels[locale].hostname, { exact: true })
    .fill('kavita.local');
  await page
    .getByLabel(labels[locale].apiKey, { exact: true })
    .fill('fixture-key');
  await page
    .getByRole('button', { name: labels[locale].test, exact: true })
    .click();
  await expect(page.getByText(service.verified, { exact: true })).toBeVisible();
  await page
    .getByRole('button', { name: labels[locale].save, exact: true })
    .click();
  await expect(page.getByText(service.saved, { exact: true })).toBeVisible();
  expect(write).toMatchObject({
    hostname: 'kavita.local',
    apiKey: 'fixture-key',
  });
  await page
    .getByRole('button', { name: labels[locale].disconnect, exact: true })
    .click();
  await page
    .getByRole('button', { name: labels[locale].confirm, exact: true })
    .click();
  await expect(
    page.getByText(service.disconnected, { exact: true })
  ).toBeVisible();
});
