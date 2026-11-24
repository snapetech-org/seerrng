import { expect, test } from '@playwright/test';

const mount = process.env.LUMEN_TEST_MOUNT === '/lumen' ? '/lumen' : '';
const appPath = (path: string) => `${mount}${path}`;
const fileId = 'a'.repeat(43);

const copy = {
  en: {
    title: 'Download Files',
    download: 'Download Ebook',
    checking: 'Some sources couldn’t be checked.',
    retry: 'Check again',
    format: 'Ebook',
    request: 'Request',
    requestNumber: 'Request #801',
    none: 'No downloadable files were found.',
    dialog: 'Download request files',
    close: 'Close',
  },
  fr: {
    title: 'Télécharger les fichiers',
    download: 'Télécharger le livre numérique',
    checking: 'Certaines sources n’ont pas pu être vérifiées.',
    retry: 'Vérifier à nouveau',
    format: 'Livre numérique',
    request: 'Demande',
    requestNumber: 'Demande nº 801',
    none: 'Aucun fichier téléchargeable trouvé.',
    dialog: 'Télécharger les fichiers de la demande',
    close: 'Fermer',
  },
  ar: {
    title: 'تنزيل الملفات',
    download: 'تنزيل الكتاب الإلكتروني',
    checking: 'تعذّر التحقق من بعض المصادر.',
    retry: 'تحقق مرة أخرى',
    format: 'كتاب إلكتروني',
    request: 'الطلب',
    requestNumber: 'الطلب رقم 801',
    none: 'لم يتم العثور على ملفات قابلة للتنزيل.',
    dialog: 'تنزيل ملفات الطلب',
    close: 'إغلاق',
  },
} as const;

for (const locale of ['en', 'fr', 'ar'] as const) {
  test(`request download sheet localizes its loaded and partial-error state (${locale})`, async ({
    page,
  }, info) => {
    const expected = copy[locale];
    const captureDirectory = process.env.LUMEN_REQUEST_FILES_CAPTURE_DIR;
    let downloadReads = 0;
    await page.route('https://**/*', (route) => route.abort());
    await page.route('**/api/v1/**', (route) => {
      const path = new URL(route.request().url()).pathname
        .replace(/^\/lumen(?=\/)/, '')
        .replace(/^\/api\/v1/, '');
      if (path === '/auth/me')
        return route.fulfill({
          json: { id: 1, displayName: 'Reader', permissions: 32, userType: 2 },
        });
      if (path === '/user/1/settings/main')
        return route.fulfill({ json: { locale } });
      if (path === '/settings/public')
        return route.fulfill({
          json: {
            booksEnabled: true,
            enabledMediaCategories: { ebook: true, audiobook: true },
          },
        });
      if (path === '/book/OL123W')
        return route.fulfill({
          json: {
            id: 'OL123W',
            title: 'Fixture Book',
            author: 'Fixture Author',
            mediaType: 'book',
            bookFormat: 'ebook',
            mediaInfo: { id: 72, status: 5 },
          },
        });
      if (path === '/request/status')
        return route.fulfill({
          json: {
            results: [801, 802].map((id) => ({
              request: {
                id,
                requestedBy: { id: 1 },
                media: { id: 72 },
                type: 'book',
                bookFormat: 'ebook',
              },
              status: { stage: 'available' },
            })),
          },
        });
      if (path === '/request/status/801/downloads') {
        downloadReads += 1;
        return route.fulfill({
          json: {
            results:
              downloadReads === 1
                ? [{ id: fileId, name: 'fixture.epub', format: 'ebook' }]
                : [],
            hadErrors: downloadReads === 1,
          },
        });
      }
      return route.fulfill({ json: [] });
    });

    await page.goto(appPath('/book/OL123W'));
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    await page.getByRole('button', { name: expected.download }).click();
    const dialog = page.getByRole('dialog', { name: expected.dialog });
    await expect(
      dialog.getByRole('heading', { name: expected.title })
    ).toBeVisible();
    await expect(
      dialog.getByRole('link', { name: 'fixture.epub' })
    ).toBeVisible();
    await expect(dialog.getByText(expected.checking)).toBeVisible();
    await expect(dialog.getByText(expected.format)).toBeVisible();
    await expect(
      dialog.getByRole('combobox', { name: expected.request })
    ).toHaveValue('801');
    await expect(
      dialog.getByRole('option', { name: expected.requestNumber })
    ).toBeAttached();
    await expect(
      dialog.getByRole('button', { name: expected.retry })
    ).toBeVisible();
    await expect(
      dialog.getByRole('button', { name: expected.close })
    ).toBeVisible();
    if (captureDirectory && ['desktop', 'iphone'].includes(info.project.name))
      await page.screenshot({
        path: `${captureDirectory}/${locale}-${info.project.name}.png`,
        fullPage: true,
        animations: 'disabled',
      });
    await dialog.getByRole('button', { name: expected.retry }).click();
    await expect(dialog.getByText(expected.none)).toBeVisible();
    await expect(
      dialog.getByRole('link', { name: 'fixture.epub' })
    ).toHaveCount(0);
  });
}
