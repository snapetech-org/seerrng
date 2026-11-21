import { expect, test } from '@playwright/test';

const mount = process.env.LUMEN_TEST_MOUNT === '/lumen' ? '/lumen' : '';
const locale = process.env.LUMEN_DISCOVERY_SHARED_LOCALE ?? 'en';
const copy = {
  en: {
    regions: 'Discovery Regions and Languages',
    region: 'Discover Region',
    saveRegions: 'Save Discovery Region Settings',
    savedRegions: 'Discovery region settings saved.',
    saveFailure: 'The server had a problem. Try again in a moment.',
    packs: 'Shared Discovery Title Matches',
    choose: 'Choose Pack File',
    acknowledge: 'I understand this pack applies to every account.',
    publish: 'Publish Shared Pack',
    publishFailure: 'Could not publish the pack. Check the file and try again.',
    published:
      'Published Demo. 2 matches, 2 new, 0 changed, 0 unchanged, 0 removed.',
    delete: 'Delete Pack',
    confirmDelete: 'Delete Shared Pack',
    empty: 'No shared packs have been published.',
  },
  fr: {
    regions: 'Régions et langues de découverte',
    region: 'Région de découverte',
    saveRegions: 'Enregistrer les paramètres de région de découverte',
    savedRegions: 'Les paramètres de région de découverte ont été enregistrés.',
    saveFailure:
      'Le serveur a rencontré un problème. Réessayez dans un instant.',
    packs: 'Correspondances de titres partagées',
    choose: 'Choisir un fichier de pack',
    acknowledge: 'Je comprends que ce pack s’applique à tous les comptes.',
    publish: 'Publier le pack partagé',
    publishFailure:
      'Impossible de publier le pack. Vérifiez le fichier et réessayez.',
    published:
      'Pack Demo publié. 2 correspondances, 2 nouvelles, 0 modifiées, 0 inchangées, 0 supprimées.',
    delete: 'Supprimer le pack',
    confirmDelete: 'Supprimer le pack partagé',
    empty: 'Aucun pack partagé n’a été publié.',
  },
  ar: {
    regions: 'مناطق ولغات الاستكشاف',
    region: 'منطقة الاستكشاف',
    saveRegions: 'حفظ إعدادات منطقة الاستكشاف',
    savedRegions: 'تم حفظ إعدادات منطقة الاستكشاف.',
    saveFailure: 'حدثت مشكلة في الخادم. حاول مجددًا بعد قليل.',
    packs: 'مطابقات عناوين الاستكشاف المشتركة',
    choose: 'اختيار ملف الحزمة',
    acknowledge: 'أفهم أن هذه الحزمة تنطبق على جميع الحسابات.',
    publish: 'نشر الحزمة المشتركة',
    publishFailure: 'تعذر نشر الحزمة. تحقق من الملف وحاول مجددًا.',
    published:
      'تم نشر Demo. 2 مطابقة، 2 جديدة، 0 معدلة، 0 دون تغيير، 0 محذوفة.',
    delete: 'حذف الحزمة',
    confirmDelete: 'حذف الحزمة المشتركة',
    empty: 'لم يتم نشر أي حزم مشتركة.',
  },
} as const;

test('discovery regions and shared title packs preserve edits and localize', async ({
  page,
}) => {
  const text = copy[locale as keyof typeof copy] ?? copy.en;
  let failRegionSave = true;
  let failPackPublish = true;
  let regionSettings: Record<string, unknown> = {
    discoverRegion: '',
    streamingRegion: '',
    originalLanguage: '',
    blocklistRegion: '',
    blocklistLanguage: '',
    includeAdult: false,
    hideAvailable: false,
    hideRequested: false,
    hideBlocklisted: false,
  };
  let packs: { packId: string; name: string; count: number }[] = [];

  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname
      .replace(/^\/lumen/, '')
      .replace(/^\/api\/v1/, '');
    if (path === '/auth/me')
      return route.fulfill({ json: { id: 1, permissions: 2 } });
    if (path === '/user/1/settings/main')
      return route.fulfill({ json: { locale } });
    if (path === '/settings/main') {
      if (request.method() === 'POST') {
        if (failRegionSave) {
          failRegionSave = false;
          return route.fulfill({ status: 503, json: { message: 'offline' } });
        }
        regionSettings = { ...regionSettings, ...request.postDataJSON() };
      }
      return route.fulfill({ json: regionSettings });
    }
    if (path === '/regions')
      return route.fulfill({
        json: [{ iso_3166_1: 'US', english_name: 'United States' }],
      });
    if (path === '/languages')
      return route.fulfill({
        json: [{ iso_639_1: 'en', english_name: 'English' }],
      });
    if (path === '/genres/movie' || path === '/genres/tv')
      return route.fulfill({ json: [] });
    if (path === '/integrations/discovery/configuration')
      return route.fulfill({
        json: {
          trakt: { configured: false },
          anilist: { configured: false },
          simkl: { configured: false },
          mdblist: { configured: false },
        },
      });
    if (path === '/integrations/discovery/mappings/packs') {
      if (request.method() === 'POST') {
        if (failPackPublish) {
          failPackPublish = false;
          return route.fulfill({ status: 503, json: { message: 'offline' } });
        }
        packs = [{ packId: 'demo', name: 'Demo', count: 2 }];
        return route.fulfill({
          json: { total: 2, imported: 2, updated: 0, unchanged: 0, removed: 0 },
        });
      }
      return route.fulfill({ json: { packs } });
    }
    if (
      path === '/integrations/discovery/mappings/packs/demo' &&
      request.method() === 'DELETE'
    ) {
      packs = [];
      return route.fulfill({ status: 204, body: '' });
    }
    return route.fulfill({ json: {} });
  });

  await page.goto(`${mount}/admin/discovery`);
  if (process.env.LUMEN_DISCOVERY_SHARED_CAPTURE) {
    const sections = page.locator('main section');
    await expect(sections.nth(4)).toBeAttached();
    await expect(sections.nth(7)).toBeAttached();
    await sections.nth(4).scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `${process.env.LUMEN_DISCOVERY_SHARED_CAPTURE}-regions-${page.viewportSize()!.width}.png`,
    });
    await sections.nth(7).scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `${process.env.LUMEN_DISCOVERY_SHARED_CAPTURE}-packs-${page.viewportSize()!.width}.png`,
    });
    if (process.env.LUMEN_DISCOVERY_SHARED_CAPTURE_ONLY === '1') return;
  }
  await expect(page.getByRole('heading', { name: text.regions })).toBeVisible();
  await expect(page.getByRole('heading', { name: text.packs })).toBeVisible();
  await expect(page.getByLabel(text.region)).toBeVisible();
  await expect(page.getByText(text.empty, { exact: true })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute(
    'dir',
    locale === 'ar' ? 'rtl' : 'ltr'
  );

  await page.getByLabel(text.region).selectOption('US');
  const saveRegions = page.getByRole('button', { name: text.saveRegions });
  await saveRegions.click();
  await expect(page.getByRole('alert')).toContainText(text.saveFailure);
  await expect(page.getByLabel(text.region)).toHaveValue('US');
  await saveRegions.click();
  await expect(page.getByText(text.savedRegions)).toBeVisible();

  await page.locator('input[type="file"]').setInputFiles({
    name: 'demo.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        format: 'seerrng.curated-title-matches',
        version: 1,
        packId: 'demo',
        name: 'Demo',
        entries: [{}, {}],
      })
    ),
  });
  await page.getByLabel(text.acknowledge).check();
  const publish = page.getByRole('button', { name: text.publish });
  await publish.click();
  await expect(page.getByRole('alert')).toContainText(text.publishFailure);
  await expect(publish).toBeEnabled();
  await publish.click();
  await expect(page.getByText(text.published, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: text.delete, exact: true }).click();
  await page
    .getByRole('button', { name: text.confirmDelete, exact: true })
    .click();
  await expect(page.getByText(text.empty, { exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    )
  ).toBe(true);
});
