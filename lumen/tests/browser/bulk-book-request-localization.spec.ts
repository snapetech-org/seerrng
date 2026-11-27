import { expect, test } from '@playwright/test';
import { testAppPath } from './testAppPath';

const copy = {
  en: {
    title: 'Request Books',
    advanced: 'Advanced Request Options',
    format: 'Format',
    service: 'Book Service',
    requestAs: 'Request As',
    quality: 'Quality Profile',
    metadata: 'Metadata Profile',
    root: 'Root Folder',
    loadMore: 'Load More Books',
    selected: '1 of 100 selected',
    submit: 'Request Selected Books',
    close: 'Close',
  },
  fr: {
    title: 'Demander des livres',
    advanced: 'Options avancées de demande',
    format: 'Format',
    service: 'Service de livres',
    requestAs: 'Demander pour',
    quality: 'Profil de qualité',
    metadata: 'Profil de métadonnées',
    root: 'Dossier racine',
    loadMore: 'Charger plus de livres',
    selected: '1 sur 100 sélectionnés',
    submit: 'Demander les livres sélectionnés',
    close: 'Fermer',
  },
  ar: {
    title: 'طلب الكتب',
    advanced: 'خيارات الطلب المتقدمة',
    format: 'التنسيق',
    service: 'خدمة الكتب',
    requestAs: 'الطلب باسم',
    quality: 'ملف الجودة',
    metadata: 'ملف البيانات الوصفية',
    root: 'المجلد الجذر',
    loadMore: 'تحميل المزيد من الكتب',
    selected: 'تم تحديد 1 من 100',
    submit: 'طلب الكتب المحددة',
    close: 'إغلاق',
  },
} as const;

for (const locale of ['en', 'fr', 'ar'] as const) {
  test(`bulk book request follows ${locale}`, async ({ page }, info) => {
    await page.route('https://**/*', (route) => route.abort());
    await page.route('**/lumen-config.json', (route) =>
      route.fulfill({ json: {} })
    );
    await page.route('**/api/v1/**', (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname.slice('/api/v1'.length);
      if (path === '/auth/me')
        return route.fulfill({
          json: { id: 1, displayName: 'Fixture', permissions: 2 },
        });
      if (path === '/user/1/settings/main')
        return route.fulfill({ json: { locale } });
      if (path === '/settings/public')
        return route.fulfill({
          json: { initialized: true, ebookServiceEnabled: true },
        });
      if (path === '/request') return route.fulfill({ json: { results: [] } });
      if (path === '/service/readarr')
        return route.fulfill({
          json: [{ id: 1, name: 'Ebook Service', serviceType: 'ebook' }],
        });
      if (path === '/service/readarr/1')
        return route.fulfill({
          json: {
            server: { id: 1, activeTags: [] },
            profiles: [{ id: 3, name: 'EPUB' }],
            metadataProfiles: [{ id: 4, name: 'Standard Metadata' }],
            rootFolders: [{ path: '/books' }],
            tags: [{ id: 5, label: 'family' }],
          },
        });
      if (path === '/user')
        return route.fulfill({
          json: { results: [{ id: 2, displayName: 'Family Member' }] },
        });
      if (path === '/request/count' || path === '/blocklist/count')
        return route.fulfill({ json: { count: 0 } });
      if (path === '/live-tv/status')
        return route.fulfill({ json: { configured: false } });
      if (path === '/resolve/capabilities') return route.fulfill({ json: {} });
      if (path === '/book/library')
        return route.fulfill({
          json: { page: 1, totalPages: 1, totalResults: 0, results: [] },
        });
      if (path === '/author/OL42A')
        return route.fulfill({
          json: {
            id: 'OL42A',
            name: 'Fixture Author',
            works: [{ id: 'OL11W', title: 'Fixture Book', mediaType: 'book' }],
            pagination: { offset: 0, limit: 20, totalItems: 21 },
          },
        });
      return route.fulfill({ json: {} });
    });
    await page.goto(testAppPath('/author/OL42A'));
    const text = copy[locale];
    await page.getByRole('button', { name: text.title }).click();
    const sheet = page.getByRole('dialog', { name: text.title });
    await expect(sheet.getByText(text.format, { exact: true })).toBeVisible();
    await sheet.getByText(text.advanced, { exact: true }).click();
    await expect(sheet.getByLabel(text.service)).toBeVisible();
    await sheet.getByLabel(text.service).selectOption('1');
    await expect(sheet.getByLabel(text.quality)).toBeVisible();
    await expect(sheet.getByLabel(text.metadata)).toBeVisible();
    await expect(sheet.getByLabel(text.root)).toBeVisible();
    await expect(sheet.getByLabel(text.requestAs)).toBeVisible();
    await sheet.getByLabel(text.requestAs).selectOption('2');
    await sheet.getByLabel(text.quality).selectOption('3');
    await sheet.getByLabel(text.metadata).selectOption('4');
    await sheet.getByLabel(text.root).selectOption('/books');
    await sheet.getByLabel('family', { exact: true }).check();
    await expect(
      sheet.getByRole('button', { name: text.loadMore })
    ).toBeVisible();
    await sheet.getByLabel('Fixture Book').check();
    await expect(sheet.getByRole('status')).toContainText(text.selected);
    await expect(
      sheet.getByRole('button', { name: text.submit })
    ).toBeEnabled();
    await expect(page.locator('html')).toHaveAttribute(
      'dir',
      locale === 'ar' ? 'rtl' : 'ltr'
    );
    await page.screenshot({
      path: info.outputPath(`bulk-books-${locale}.png`),
    });
    await sheet.getByRole('button', { name: text.close }).click();
    await expect(sheet).toHaveCount(0);
  });
}
