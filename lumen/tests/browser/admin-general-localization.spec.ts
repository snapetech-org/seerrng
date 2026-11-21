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
    saved: 'Application settings saved.',
    failure: 'The server had a problem. Try again in a moment.',
  },
  fr: {
    title: 'Paramètres généraux',
    back: 'Retour au compte',
    field: 'Titre de l’application',
    interface: 'Interface par défaut',
    save: 'Enregistrer les paramètres de l’application',
    saved: 'Paramètres de l’application enregistrés.',
    failure: 'Le serveur a rencontré un problème. Réessayez dans un instant.',
  },
  ar: {
    title: 'الإعدادات العامة',
    back: 'العودة إلى الحساب',
    field: 'عنوان التطبيق',
    interface: 'الواجهة الافتراضية',
    save: 'حفظ إعدادات التطبيق',
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
      }
      return route.fulfill({
        json: {
          applicationTitle: title,
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
  const widths = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth,
    viewport: document.documentElement.clientWidth,
  }));
  expect(widths.document).toBeLessThanOrEqual(widths.viewport);
});
