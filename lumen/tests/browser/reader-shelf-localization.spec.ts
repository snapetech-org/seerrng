import { expect, test } from '@playwright/test';

const mount = process.env.LUMEN_TEST_MOUNT === '/lumen' ? '/lumen' : '';
const appPath = (path: string) => `${mount}${path}`;

const copy = {
  en: {
    manage: 'Manage Reader Shelf',
    title: 'Reader Shelf',
    configure: 'Configure Reader Delivery',
    description:
      'Create a shelf that updates as matching titles enter the reader library.',
    service: 'Reader Service',
    share: 'Share With Other Reader Users',
    locked: 'BookOrbit locks visibility after creation.',
    sync: 'Sync to Kobo',
    preview: 'Preview Matches',
    count: 'Current matches: 0',
    empty: 'Create an Empty Shelf for Future Matches',
    create: 'Create Shelf',
    saved: 'Reader shelf saved',
    confirmed: 'Confirmed items: 0.',
    open: 'Open BookOrbit',
    close: 'Close',
    update: 'Save Shelf Updates',
  },
  fr: {
    manage: 'Gérer l’étagère de lecture',
    title: 'Étagère de lecture',
    configure: 'Configurer la distribution aux lecteurs',
    description:
      'Créez une étagère qui se met à jour à mesure que les titres correspondants sont ajoutés à la bibliothèque de lecture.',
    service: 'Service de lecture',
    share: 'Partager avec les autres utilisateurs du service',
    locked: 'BookOrbit verrouille la visibilité après la création.',
    sync: 'Synchroniser avec Kobo',
    preview: 'Prévisualiser les correspondances',
    count: 'Correspondances actuelles : 0',
    empty: 'Créer une étagère vide pour les correspondances futures',
    create: 'Créer l’étagère',
    saved: 'Étagère de lecture enregistrée',
    confirmed: 'Éléments confirmés : 0.',
    open: 'Ouvrir BookOrbit',
    close: 'Fermer',
    update: 'Enregistrer les modifications de l’étagère',
  },
  ar: {
    manage: 'إدارة رف القراءة',
    title: 'رف القراءة',
    configure: 'إعداد التوصيل إلى القراء',
    description:
      'أنشئ رفًا يتحدّث عند إضافة العناوين المطابقة إلى مكتبة القراءة.',
    service: 'خدمة القراءة',
    share: 'مشاركة الرف مع مستخدمي خدمة القراءة الآخرين',
    locked: 'يقفل BookOrbit إعداد الظهور بعد الإنشاء.',
    sync: 'مزامنة مع Kobo',
    preview: 'معاينة التطابقات',
    count: 'التطابقات الحالية: 0',
    empty: 'إنشاء رف فارغ للتطابقات المستقبلية',
    create: 'إنشاء الرف',
    saved: 'تم حفظ رف القراءة',
    confirmed: 'العناصر المؤكدة: 0.',
    open: 'فتح BookOrbit',
    close: 'إغلاق',
    update: 'حفظ تعديلات الرف',
  },
} as const;

for (const locale of ['en', 'fr', 'ar'] as const) {
  test(`Reader Shelf creation follows ${locale} and retains the exact target`, async ({
    page,
  }, info) => {
    const submitted: unknown[] = [];
    let configured = false;
    let exists = false;
    const seriesId = 'bookshelf-series:1:Rml4dHVyZQ';
    await page.route('https://**/*', (route) => route.abort());
    await page.route('**/lumen-config.json', (route) =>
      route.fulfill({ json: {} })
    );
    await page.route('**/api/v1/**', (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const path = decodeURIComponent(url.pathname.slice(7));
      if (path === '/auth/me')
        return route.fulfill({ json: { id: 1, permissions: 2 } });
      if (path === '/settings/public')
        return route.fulfill({
          json: { enabledMediaCategories: { book: true } },
        });
      if (path === '/user/1/settings/main')
        return route.fulfill({
          json: { locale, enabledMediaCategories: { book: true } },
        });
      if (path.startsWith('/author/OL42A'))
        return route.fulfill({
          json: {
            id: 'OL42A',
            name: 'Fixture Author',
            works: [],
            pagination: { offset: 0, limit: 20, totalItems: 0 },
          },
        });
      if (path === `/series/${seriesId}`)
        return route.fulfill({
          json: { id: seriesId, title: 'Fixture Series', books: [] },
        });
      if (path === '/settings/reader-delivery')
        return route.fulfill({
          json: configured
            ? {
                preferredProvider: 'bookorbit',
                bookorbitUrl: 'https://reader.example.test',
              }
            : { preferredProvider: 'bookorbit' },
        });
      if (path === '/settings/reader-delivery/groupings/preview')
        return route.fulfill({
          json: {
            matchedCount: 0,
            ruleSummary: 'Titles by Fixture Author',
            sampleTitles: [],
          },
        });
      if (
        path === '/settings/reader-delivery/groupings' &&
        request.method() === 'POST'
      ) {
        const body = request.postDataJSON();
        submitted.push(body);
        return route.fulfill({
          status: 201,
          json: {
            grouping: {
              targetType: 'author',
              targetId: 'OL42A',
              provider: 'bookorbit',
              isPublic: true,
              syncToKobo: true,
              countVerified: true,
              lastMatchCount: 0,
              serviceUrl: 'https://reader.example.test',
              target: body.target,
            },
          },
        });
      }
      if (path === '/settings/reader-delivery/groupings')
        return route.fulfill({
          json: exists
            ? [
                {
                  targetType: 'author',
                  targetId: 'OL42A',
                  provider: 'bookorbit',
                  isPublic: true,
                  syncToKobo: true,
                  countVerified: true,
                  lastMatchCount: 0,
                  serviceUrl: 'https://reader.example.test',
                },
              ]
            : [],
        });
      return route.fulfill({ json: {} });
    });

    const text = copy[locale];
    const captureDirectory = process.env.LUMEN_READER_SHELF_CAPTURE_DIR;
    const capture = async (state: string) => {
      if (
        captureDirectory &&
        (info.project.name === 'desktop' || info.project.name === 'iphone')
      )
        await page.screenshot({
          path: `${captureDirectory}/${locale}-${info.project.name}-${state}.png`,
          animations: 'disabled',
        });
    };
    await page.goto(appPath('/author/OL42A'));
    const manage = page.getByRole('button', { name: text.manage });
    await expect(manage).toBeVisible();
    await manage.click();
    let dialog = page.getByRole('dialog', { name: text.title });
    await expect(
      dialog.getByRole('link', { name: text.configure })
    ).toBeVisible();
    await capture('unconfigured');
    await dialog.getByRole('button', { name: text.close }).click();

    configured = true;
    await page.reload();
    await page.getByRole('button', { name: text.manage }).click();
    dialog = page.getByRole('dialog', { name: text.title });
    await expect(dialog.getByText(text.description)).toBeVisible();
    await expect(dialog.getByText(text.service, { exact: true })).toBeVisible();
    await expect(dialog.getByText(text.share, { exact: true })).toBeVisible();
    await expect(dialog.getByText(text.sync, { exact: true })).toBeVisible();
    await dialog.getByRole('button', { name: text.preview }).click();
    await expect(dialog.getByText(text.count, { exact: true })).toBeVisible();
    await expect(dialog.getByText(text.empty, { exact: true })).toBeVisible();
    const create = dialog.getByRole('button', { name: text.create });
    await expect(create).toBeDisabled();
    await dialog.getByLabel(text.empty).check();
    await dialog.getByLabel(text.sync).check();
    await capture('empty-shelf-preview');
    await create.click();
    await expect(
      dialog.getByRole('status').filter({ hasText: text.saved })
    ).toBeVisible();
    await expect(
      dialog.getByText(text.confirmed, { exact: true })
    ).toBeVisible();
    const open = dialog.getByRole('link', { name: text.open });
    await expect(open).toHaveAttribute('href', 'https://reader.example.test/');
    await capture('saved');
    expect(submitted).toEqual([
      {
        provider: 'bookorbit',
        target: { type: 'author', id: 'OL42A', name: 'Fixture Author' },
        isPublic: true,
        syncToKobo: true,
        allowEmpty: true,
      },
    ]);
    exists = true;
    await dialog.getByRole('button', { name: text.close }).click();
    await page.reload();
    await page.getByRole('button', { name: text.manage }).click();
    dialog = page.getByRole('dialog', { name: text.title });
    await expect(dialog.getByText(text.locked)).toBeVisible();
    await expect(dialog.getByLabel(text.share)).toBeDisabled();
    await capture('visibility-locked');
    await dialog.getByRole('button', { name: text.preview }).click();
    await dialog.getByLabel(text.empty).check();
    await expect(
      dialog.getByRole('button', { name: text.update })
    ).toBeEnabled();
    await page.goto(appPath(`/book-series/${encodeURIComponent(seriesId)}`));
    await expect(
      page.getByRole('heading', { name: 'Fixture Series' })
    ).toBeVisible();
    await expect(page.getByRole('button', { name: text.manage })).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth
      )
    ).toBe(true);
  });
}
