import { expect, test } from '@playwright/test';

const locale = (
  ['en', 'fr', 'ar'].includes(process.env.LUMEN_READER_DELIVERY_LOCALE ?? '')
    ? process.env.LUMEN_READER_DELIVERY_LOCALE
    : 'en'
) as 'en' | 'fr' | 'ar';
const mount = process.env.LUMEN_TEST_MOUNT === '/lumen' ? '/lumen' : '';
const appPath = (path: string) => `${mount}${path}`;
const labels = {
  en: {
    page: 'Reader Delivery',
    administration: 'Administration',
    grimmoryUrl: 'Grimmory URL',
    grimmoryPassword: 'Grimmory Password',
    saved: 'Saved Credential',
    removeCredentials: 'Remove Saved Grimmory Credentials',
    catalog: 'Grimmory OPDS Catalog',
    bookorbitUrl: 'BookOrbit URL',
    bookorbitUsername: 'BookOrbit Username',
    preferences: 'Delivery Preferences',
    preferred: 'Preferred Reader App',
    save: 'Save Reader Settings',
    discard: 'Discard Changes',
    savedMessage: 'Reader settings saved.',
    testAccess: 'Test BookOrbit Grouping Access',
    connected: 'BookOrbit connected. Existing shelves found: 1.',
    shelves: 'Managed Reader Shelves',
    ready: 'Ready',
    shared: 'Shared',
    preview: 'Preview Matches',
    remove: 'Remove Shelf',
    noShelves: 'No managed reader shelves.',
    title: 'Remove Fixture Shelf?',
    body: 'This removes the reader shelf. Library files are kept.',
    keep: 'Keep it',
  },
  fr: {
    page: 'Distribution aux lecteurs',
    administration: 'Administration',
    grimmoryUrl: 'URL de Grimmory',
    grimmoryPassword: 'Mot de passe Grimmory',
    saved: 'Identifiant enregistré',
    removeCredentials: 'Supprimer les identifiants enregistrés de Grimmory',
    catalog: 'Catalogue OPDS de Grimmory',
    bookorbitUrl: 'URL de BookOrbit',
    bookorbitUsername: 'Nom d’utilisateur BookOrbit',
    preferences: 'Préférences de distribution',
    preferred: 'Application de lecture préférée',
    save: 'Enregistrer les paramètres du lecteur',
    discard: 'Annuler les modifications',
    savedMessage: 'Paramètres du lecteur enregistrés.',
    testAccess: 'Tester l’accès aux groupements BookOrbit',
    connected: 'BookOrbit connecté. Rayons existants : 1.',
    shelves: 'Rayons de lecture gérés',
    ready: 'Prêt',
    shared: 'Partagé',
    preview: 'Correspondances de l’aperçu',
    remove: 'Supprimer le rayon',
    noShelves: 'Aucun rayon de lecture géré.',
    title: 'Supprimer Fixture Shelf ?',
    body: 'Cette action supprime le rayon. Les fichiers de la bibliothèque sont conservés.',
    keep: 'Garder',
  },
  ar: {
    page: 'توصيل القارئ',
    administration: 'الإدارة',
    grimmoryUrl: 'عنوان URL لـ Grimmory',
    grimmoryPassword: 'كلمة مرور Grimmory',
    saved: 'بيانات اعتماد محفوظة',
    removeCredentials: 'إزالة بيانات اعتماد Grimmory المحفوظة',
    catalog: 'فهرس OPDS لـ Grimmory',
    bookorbitUrl: 'عنوان URL لـ BookOrbit',
    bookorbitUsername: 'اسم مستخدم BookOrbit',
    preferences: 'تفضيلات التوصيل',
    preferred: 'تطبيق القراءة المفضل',
    save: 'حفظ إعدادات القارئ',
    discard: 'تجاهل التغييرات',
    savedMessage: 'تم حفظ إعدادات القارئ.',
    testAccess: 'اختبار الوصول إلى تجميعات BookOrbit',
    connected: 'تم الاتصال بـ BookOrbit. الرفوف الموجودة: 1.',
    shelves: 'رفوف القارئ المُدارة',
    ready: 'جاهز',
    shared: 'مشترك',
    preview: 'مطابقات المعاينة',
    remove: 'إزالة الرف',
    noShelves: 'لا توجد رفوف قارئ مُدارة.',
    title: 'إزالة Fixture Shelf؟',
    body: 'سيؤدي هذا إلى إزالة رف القارئ. ستبقى ملفات المكتبة كما هي.',
    keep: 'الإبقاء على الرف',
  },
} as const;

test('reader delivery settings and managed shelves use the saved locale', async ({
  page,
}, info) => {
  const text = labels[locale];
  const path = '/api/v1/settings/reader-delivery';
  let saved = {
    grimmoryUrl: 'https://reader.example.test/books',
    grimmoryUsername: 'reader',
    grimmoryPassword: '[REDACTED]',
    bookorbitUrl: 'https://orbit.example.test',
    bookorbitUsername: '',
    bookorbitPassword: '',
    preferredProvider: 'grimmory',
  };
  let deleteCount = 0;
  let reject = true;
  const changes: Record<string, unknown>[] = [];
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname.replace(
      /^\/lumen(?=\/)/,
      ''
    );
    if (pathname.endsWith('/auth/me'))
      return route.fulfill({ json: { id: 1, permissions: 2 } });
    if (pathname.endsWith('/user/1/settings/main'))
      return route.fulfill({ json: { locale } });
    if (pathname === path + '/connection-test') {
      expect(request.postDataJSON()).toEqual({ provider: 'bookorbit' });
      return route.fulfill({
        json: { connected: true, existingGroupingCount: 1 },
      });
    }
    if (pathname === path + '/groupings/17') {
      expect(request.method()).toBe('DELETE');
      deleteCount++;
      return route.fulfill({ json: { deleted: true } });
    }
    if (pathname === path + '/groupings')
      return route.fulfill({
        json: deleteCount
          ? []
          : [
              {
                id: 17,
                provider: 'bookorbit',
                groupName: 'Fixture Shelf',
                targetName: 'Fixture Author',
                isPublic: true,
                status: 'ready',
                lastMatchCount: 2,
                countVerified: false,
                lastError: null,
                syncToKobo: false,
                koboSyncStatus: 'disabled',
                koboSyncError: null,
              },
            ],
      });
    if (pathname !== path) return route.fulfill({ json: {} });
    if (request.method() === 'PUT') {
      const change = request.postDataJSON();
      changes.push(change);
      if (reject)
        return route.fulfill({
          status: 400,
          json: { error: 'Reader settings rejected.' },
        });
      saved = { ...saved, ...change };
      if (change.clearGrimmoryCredentials) {
        saved.grimmoryUsername = '';
        saved.grimmoryPassword = '';
      }
    }
    return route.fulfill({ json: saved });
  });

  await page.goto(appPath('/admin/reader-delivery'));
  await expect(page.getByRole('heading', { name: text.page })).toBeVisible();
  await expect(
    page.getByRole('link', { name: text.administration, exact: true })
  ).toBeVisible();
  await expect(page.getByLabel(text.grimmoryPassword)).toHaveValue('');
  await expect(page.getByLabel(text.grimmoryPassword)).toHaveAttribute(
    'placeholder',
    text.saved
  );
  await expect(page.getByLabel(text.removeCredentials)).toBeVisible();
  await expect(page.getByLabel(text.catalog)).toHaveValue(
    'https://reader.example.test/books/api/v1/opds'
  );
  await expect(
    page.getByRole('heading', { name: text.preferences })
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: text.shelves })).toBeVisible();
  await expect(page.getByText(text.ready)).toBeVisible();
  await expect(page.getByText(text.shared)).toBeVisible();
  await expect(page.getByText(text.preview)).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute(
    'dir',
    locale === 'ar' ? 'rtl' : 'ltr'
  );
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth)
  ).toBeLessThanOrEqual(page.viewportSize()!.width);
  await page.screenshot({
    path: info.outputPath('reader-delivery.png'),
    fullPage: true,
  });

  const preferred = page.getByLabel(text.preferred);
  await page.getByLabel(text.removeCredentials).check();
  const testAccess = page.getByRole('button', { name: text.testAccess });
  const save = page.getByRole('button', { name: text.save });
  await preferred.selectOption('bookorbit');
  await expect(testAccess).toBeDisabled();
  await save.click();
  await expect(page.getByRole('alert')).toHaveText('Reader settings rejected.');
  await expect(preferred).toHaveValue('bookorbit');
  reject = false;
  await save.click();
  await expect(page.getByText(text.savedMessage)).toBeVisible();
  expect(changes[1]).not.toHaveProperty('grimmoryPassword');
  expect(changes[1]).not.toHaveProperty('bookorbitPassword');
  expect(changes[1]).toHaveProperty('clearGrimmoryCredentials', true);
  await testAccess.click();
  await expect(page.getByText(text.connected)).toBeVisible();

  await page.getByRole('button', { name: text.remove, exact: true }).click();
  const confirm = page.getByRole('alertdialog');
  await expect(confirm.getByText(text.title)).toBeVisible();
  await expect(confirm.getByText(text.body)).toBeVisible();
  await confirm.getByRole('button', { name: text.keep }).click();
  expect(deleteCount).toBe(0);
  await page.getByRole('button', { name: text.remove, exact: true }).click();
  await confirm.getByRole('button', { name: text.remove }).click();
  await expect(page.getByText(text.noShelves)).toBeVisible();
  expect(deleteCount).toBe(1);
});
