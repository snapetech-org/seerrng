import { expect, test } from '@playwright/test';

const mount = process.env.LUMEN_TEST_MOUNT === '/lumen' ? '/lumen' : '';
const locale = process.env.LUMEN_DISCOVERY_LOCALE ?? 'en';
const labels = {
  en: {
    title: 'Discovery Integrations',
    help: 'Enter new credentials or use Clear to remove a provider’s saved credentials. Select Save to apply changes.',
    clear: 'Clear AniList Credentials',
    save: 'Save Discovery Credentials',
    saved: 'Discovery credentials saved.',
    failure: 'Could not save discovery credentials. Try again.',
    secret: 'Client Secret',
  },
  fr: {
    title: 'Intégrations de découverte',
    help: 'Saisissez de nouveaux identifiants ou utilisez Effacer pour supprimer ceux enregistrés chez un fournisseur. Sélectionnez Enregistrer pour appliquer les modifications.',
    clear: 'Effacer les identifiants de AniList',
    save: 'Enregistrer les identifiants de découverte',
    saved: 'Les identifiants de découverte ont été enregistrés.',
    failure:
      'Impossible d’enregistrer les identifiants de découverte. Réessayez.',
    secret: 'Clé secrète client',
  },
  ar: {
    title: 'تكاملات الاستكشاف',
    help: 'أدخل بيانات اعتماد جديدة أو استخدم مسح لإزالة البيانات المحفوظة لموفر. اختر حفظ لتطبيق التغييرات.',
    clear: 'مسح بيانات اعتماد AniList',
    save: 'حفظ بيانات اعتماد الاستكشاف',
    saved: 'تم حفظ بيانات اعتماد الاستكشاف.',
    failure: 'تعذر حفظ بيانات اعتماد الاستكشاف. حاول مرة أخرى.',
    secret: 'سر العميل',
  },
} as const;

test('discovery credentials localize and preserve failed changes for retry', async ({
  page,
}) => {
  const text = labels[locale as keyof typeof labels] ?? labels.en;
  let failOnce = true;
  const writes: Record<string, unknown>[] = [];
  let configuration = {
    trakt: { clientId: 'saved-trakt-id', configured: true },
    anilist: { clientId: 'saved-anilist-id', configured: true },
    simkl: { configured: false },
    mdblist: { configured: false },
  };
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname
      .replace(/^\/lumen/, '')
      .replace(/^\/api\/v1/, '');
    if (path === '/auth/me')
      return route.fulfill({ json: { id: 1, permissions: 2 } });
    if (path === '/user/1/settings/main')
      return route.fulfill({ json: { locale } });
    if (path === '/settings/main') return route.fulfill({ json: {} });
    if (path === '/regions' || path === '/languages')
      return route.fulfill({ json: [] });
    if (path === '/genres/movie' || path === '/genres/tv')
      return route.fulfill({ json: [] });
    if (path === '/integrations/discovery/mappings/packs')
      return route.fulfill({ json: { packs: [] } });
    if (path === '/integrations/discovery/configuration') {
      if (request.method() === 'PUT') {
        writes.push(request.postDataJSON() as Record<string, unknown>);
        if (failOnce) {
          failOnce = false;
          return route.fulfill({ status: 503, json: { message: 'offline' } });
        }
        const body = request.postDataJSON() as Record<
          string,
          Record<string, string>
        >;
        if (body.anilist) {
          const clientId =
            body.anilist.clientId ?? configuration.anilist.clientId;
          const configured =
            !!clientId &&
            (body.anilist.clientSecret !== undefined
              ? !!body.anilist.clientSecret
              : configuration.anilist.configured);
          configuration = {
            ...configuration,
            anilist: { clientId, configured },
          };
        }
      }
      return route.fulfill({ json: configuration });
    }
    return route.fulfill({ json: {} });
  });

  await page.goto(`${mount}/admin/discovery`);
  await expect(
    page.getByRole('heading', { name: 'Trakt', level: 2 })
  ).toBeVisible();
  if (process.env.LUMEN_DISCOVERY_CAPTURE) {
    await page.screenshot({
      path: `${process.env.LUMEN_DISCOVERY_CAPTURE}-${page.viewportSize()!.width}.png`,
      fullPage: true,
    });
    if (locale === 'en') return;
  }
  await expect(
    page.getByRole('heading', { name: text.title, level: 1 })
  ).toBeVisible();
  await expect(page.getByText(text.help, { exact: true })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute(
    'dir',
    locale === 'ar' ? 'rtl' : 'ltr'
  );
  await expect(page.getByLabel(text.secret, { exact: true })).toHaveAttribute(
    'type',
    'password'
  );

  await page.getByRole('button', { name: text.clear, exact: true }).click();
  const save = page.getByRole('button', { name: text.save, exact: true });
  await save.click();
  await expect(page.getByRole('alert')).toContainText(text.failure);
  await save.click();
  await expect(page.getByText(text.saved, { exact: true })).toBeVisible();
  expect(writes).toHaveLength(2);
  expect(writes[1]).toMatchObject({
    anilist: { clientId: '', clientSecret: '' },
  });
});
