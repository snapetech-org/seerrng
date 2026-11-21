import { expect, test } from '@playwright/test';

const mount = process.env.LUMEN_TEST_MOUNT === '/lumen' ? '/lumen' : '';
const locale = process.env.LUMEN_ADMIN_GENERAL_LOCALE ?? 'en';
const labels = {
  en: {
    title: 'General Settings',
    back: 'Back to Account',
    field: 'Application Title',
    interface: 'Default Interface',
    save: 'Save Application Settings',
    spotifyId: 'Spotify Client ID',
    spotifySecret: 'Spotify Client Secret',
    spotifySave: 'Save Spotify Credentials',
    mappingsLabel: 'Library Path Mappings',
    mappingsSave: 'Save Library Path Mappings',
    mappingsSaved: 'Library path mappings saved.',
    mappingsError: 'Enter a JSON array with at most 100 path mappings.',
    enable4k: 'Enable 4K',
    requestSettingsSave: 'Save Instance Request Settings',
    requestSettingsSaved: 'Instance request settings saved.',
    apiKeyTitle: 'Application API Key',
    revealKey: 'Reveal Key',
    regenerateKey: 'Regenerate Key',
    keepKey: 'Keep Current Key',
    confirmApiKey: 'Regenerate the application API key?',
    saved: 'Application settings saved.',
    failure: 'The server had a problem. Try again in a moment.',
  },
  fr: {
    title: 'Paramètres généraux',
    back: 'Retour au compte',
    field: 'Titre de l’application',
    interface: 'Interface par défaut',
    save: 'Enregistrer les paramètres de l’application',
    spotifyId: 'Spotify ID client',
    spotifySecret: 'Code secret client Spotify',
    spotifySave: 'Enregistrer les identifiants Spotify',
    mappingsLabel: 'Mappages des chemins de bibliothèque',
    mappingsSave: 'Enregistrer',
    mappingsSaved: 'Mappages des chemins de bibliothèque enregistrés.',
    mappingsError:
      'Saisissez un tableau JSON contenant au maximum 100 mappages de chemins.',
    enable4k: 'Activer le 4K',
    requestSettingsSave: 'Enregistrer les règles de demande',
    requestSettingsSaved: 'Paramètres de demande de l’instance enregistrés.',
    apiKeyTitle: 'Clé API de l’application',
    revealKey: 'Afficher la clé',
    regenerateKey: 'Régénérer la clé',
    keepKey: 'Conserver la clé actuelle',
    confirmApiKey: 'Régénérer la clé API de l’application ?',
    saved: 'Paramètres de l’application enregistrés.',
    failure: 'Le serveur a rencontré un problème. Réessayez dans un instant.',
  },
  ar: {
    title: 'الإعدادات العامة',
    back: 'العودة إلى الحساب',
    field: 'عنوان التطبيق',
    interface: 'الواجهة الافتراضية',
    save: 'حفظ إعدادات التطبيق',
    spotifyId: 'معرف العميل Spotify',
    spotifySecret: 'Spotify سر العميل',
    spotifySave: 'حفظ بيانات اعتماد Spotify',
    mappingsLabel: 'تعيينات مسارات المكتبة',
    mappingsSave: 'حفظ المسارات',
    mappingsSaved: 'تم حفظ تعيينات مسارات المكتبة.',
    mappingsError: 'أدخل مصفوفة JSON تضم 100 تعيين مسار كحد أقصى.',
    enable4k: 'تفعيل 4K',
    requestSettingsSave: 'حفظ إعدادات الطلب',
    requestSettingsSaved: 'تم حفظ إعدادات الطلب.',
    apiKeyTitle: 'مفتاح واجهة برمجة التطبيقات للتطبيق',
    revealKey: 'إظهار المفتاح',
    regenerateKey: 'إعادة إنشاء المفتاح',
    keepKey: 'الاحتفاظ بالمفتاح الحالي',
    confirmApiKey: 'هل تريد إعادة إنشاء مفتاح API للتطبيق؟',
    saved: 'تم حفظ إعدادات التطبيق.',
    failure: 'حدثت مشكلة في الخادم. حاول مجددًا بعد قليل.',
  },
} as const;

test('general application settings localize and recover failed saves', async ({
  page,
}) => {
  const text = labels[locale as keyof typeof labels] ?? labels.en;
  let failOnce = true;
  let title = 'SeerrNG';
  let spotifyClientId = '';
  let spotifyClientSecret = '';
  let downloadPathMappings: Record<string, unknown>[] = [];
  let apiKey = 'initial-test-api-key';
  const publicSettings: Record<string, unknown> = {
    personMovieBulkRequestsEnabled: false,
    enable4k: true,
    partialRequestsEnabled: true,
    enableSpecialEpisodes: false,
    trackEpisodeAvailability: false,
    tvSeasonWatchGateEnabled: false,
  };
  const writes: Record<string, unknown>[] = [];
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname
      .replace(/^\/lumen/, '')
      .replace(/^\/api\/v1/, '');
    if (path === '/auth/me')
      return route.fulfill({
        json: { id: 1, permissions: 2, displayName: 'Admin' },
      });
    if (path === '/user/1/settings/main')
      return route.fulfill({ json: { locale } });
    if (path === '/settings/public') {
      if (request.method() === 'POST') {
        const body = request.postDataJSON() as Record<string, unknown>;
        writes.push(body);
        Object.assign(publicSettings, body);
      }
      return route.fulfill({ json: publicSettings });
    }
    if (path === '/settings/main/regenerate') {
      apiKey = 'replacement-test-api-key';
      return route.fulfill({ json: { apiKey } });
    }
    if (path === '/settings/main') {
      if (request.method() === 'POST') {
        const body = request.postDataJSON() as Record<string, unknown>;
        writes.push(body);
        if (failOnce) {
          failOnce = false;
          return route.fulfill({ status: 503, json: { message: 'offline' } });
        }
        if (typeof body.applicationTitle === 'string')
          title = body.applicationTitle;
        if (typeof body.spotifyClientId === 'string')
          spotifyClientId = body.spotifyClientId;
        if (typeof body.spotifyClientSecret === 'string')
          spotifyClientSecret = body.spotifyClientSecret;
        if (Array.isArray(body.downloadPathMappings))
          downloadPathMappings = body.downloadPathMappings as Record<
            string,
            unknown
          >[];
        if (typeof body.enable4k === 'boolean')
          Object.assign(publicSettings, { enable4k: body.enable4k });
      }
      return route.fulfill({
        json: {
          ...publicSettings,
          applicationTitle: title,
          spotifyClientId,
          spotifyClientSecret,
          downloadPathMappings,
          apiKey,
          applicationUrl: 'https://seerr.example.test',
          youtubeUrl: '',
          cacheImages: true,
          versionCheck: true,
          defaultFrontend: 'native',
          enforceDefaultFrontend: false,
          lockLumenForNonAdmins: false,
          lumenPublicUrl: '',
          localLogin: true,
          mediaServerLogin: true,
          newPlexLogin: true,
          jellyfinQuickConnectOnly: false,
          otherUsersAvailability: 'show',
          mediaServerType: 2,
        },
      });
    }
    return route.fulfill({ json: {} });
  });

  await page.goto(`${mount}/admin/general`);
  await expect(page.getByRole('heading', { name: text.title })).toBeVisible();
  await expect(page.getByRole('link', { name: text.back })).toBeVisible();
  await expect(page.getByLabel(text.field, { exact: true })).toHaveValue(
    'SeerrNG'
  );
  await expect(page.locator('html')).toHaveAttribute('lang', locale);
  await expect(page.locator('html')).toHaveAttribute(
    'dir',
    locale === 'ar' ? 'rtl' : 'ltr'
  );
  if (process.env.LUMEN_ADMIN_GENERAL_CAPTURE) {
    await page.screenshot({
      path: `${process.env.LUMEN_ADMIN_GENERAL_CAPTURE}-${page.viewportSize()!.width}.png`,
      fullPage: true,
    });
    if (locale === 'en') return;
  }

  const field = page.getByLabel(text.field, { exact: true });
  await field.fill('Household SeerrNG');
  const save = page.getByRole('button', { name: text.save, exact: true });
  await save.click();
  await expect(page.getByRole('alert')).toContainText(text.failure);
  await expect(field).toHaveValue('Household SeerrNG');
  await save.click();
  await expect(page.getByText(text.saved, { exact: true })).toBeVisible();
  expect(writes).toHaveLength(2);
  expect(writes).toEqual([
    { applicationTitle: 'Household SeerrNG' },
    { applicationTitle: 'Household SeerrNG' },
  ]);
  await page
    .getByRole('textbox', { name: text.spotifyId })
    .fill('spotify-client');
  await page
    .getByRole('textbox', { name: text.spotifySecret })
    .fill('spotify-secret');
  await page
    .getByRole('button', { name: text.spotifySave, exact: true })
    .click();
  await expect(
    page.getByText(
      locale === 'fr'
        ? 'Identifiants Spotify enregistrés.'
        : locale === 'ar'
          ? 'تم حفظ بيانات اعتماد Spotify.'
          : 'Spotify credentials saved.',
      { exact: true }
    )
  ).toBeVisible();
  expect(writes[2]).toMatchObject({
    spotifyClientId: 'spotify-client',
    spotifyClientSecret: 'spotify-secret',
  });
  await page
    .getByRole('textbox', { name: text.mappingsLabel })
    .fill(
      '[{"serviceType":"radarr","remoteRoot":"/remote","localRoot":"/media"}]'
    );
  await page
    .getByRole('button', { name: text.mappingsSave, exact: true })
    .click();
  await expect(
    page.getByText(text.mappingsSaved, { exact: true })
  ).toBeVisible();
  expect(writes[3]).toMatchObject({
    downloadPathMappings: [
      {
        serviceType: 'radarr',
        remoteRoot: '/remote',
        localRoot: '/media',
      },
    ],
  });
  await page
    .getByRole('textbox', { name: text.mappingsLabel })
    .fill('not JSON');
  await page
    .getByRole('button', { name: text.mappingsSave, exact: true })
    .click();
  await expect(page.getByRole('alert')).toContainText(text.mappingsError);
  expect(writes).toHaveLength(4);
  await page.getByRole('checkbox', { name: text.enable4k }).uncheck();
  await page
    .getByRole('button', { name: text.requestSettingsSave, exact: true })
    .click();
  await expect(
    page.getByText(text.requestSettingsSaved, { exact: true })
  ).toBeVisible();
  expect(writes[4]).toEqual({ enable4k: false });
  const apiKeyPanel = page.locator('#apiKey');
  await expect(
    apiKeyPanel.getByRole('heading', { name: text.apiKeyTitle })
  ).toBeVisible();
  await apiKeyPanel.getByRole('button', { name: text.revealKey }).click();
  await expect(apiKeyPanel.locator('input')).toHaveValue(apiKey);
  await apiKeyPanel.getByRole('button', { name: text.regenerateKey }).click();
  await expect(
    page.getByText(text.confirmApiKey, { exact: true })
  ).toBeVisible();
  await page.getByRole('button', { name: text.keepKey, exact: true }).click();
  await expect(page.getByText(text.confirmApiKey, { exact: true })).toHaveCount(
    0
  );
  await apiKeyPanel.getByRole('button', { name: text.regenerateKey }).click();
  await page
    .getByRole('button', { name: text.regenerateKey, exact: true })
    .last()
    .click();
  await expect(
    page.getByText(
      locale === 'fr'
        ? 'Clé API de l’application régénérée.'
        : locale === 'ar'
          ? 'تمت إعادة إنشاء مفتاح API للتطبيق.'
          : 'Application API key regenerated.',
      { exact: true }
    )
  ).toBeVisible();
  await expect(apiKeyPanel.locator('input')).toHaveValue('••••••••••••••••');
  const widths = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth,
    viewport: document.documentElement.clientWidth,
  }));
  expect(widths.document).toBeLessThanOrEqual(widths.viewport);
});
