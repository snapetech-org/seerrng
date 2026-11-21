import { expect, test, type Page, type TestInfo } from '@playwright/test';

const mount = process.env.LUMEN_TEST_MOUNT === '/lumen' ? '/lumen' : '';
const appPath = (path: string) => `${mount}${path}`;

async function capture(page: Page, info: TestInfo) {
  const directory = process.env.LUMEN_VISUAL_CAPTURE_DIR;
  if (!directory || !['desktop', 'iphone'].includes(info.project.name)) return;
  await page.screenshot({
    path: `${directory}/admin-lumen-settings-${info.project.name}.png`,
    fullPage: true,
    animations: 'disabled',
  });
}

test('Lumen administration settings follow locale and retain config behavior', async ({
  page,
}, info) => {
  const locale = ['en', 'fr', 'ar'].includes(
    process.env.LUMEN_ADMIN_LOCALE ?? ''
  )
    ? (process.env.LUMEN_ADMIN_LOCALE as 'en' | 'fr' | 'ar')
    : 'en';
  const labels = {
    en: {
      title: 'Lumen settings for everyone',
      mediaServer: 'Media server',
      mediaServerName: 'Media server name',
      signIn: 'Sign-in and media server',
      branding: 'Logo and tab icon',
      defaults: 'Defaults for everyone',
      save: 'Save for everyone',
      theme: 'Theme',
      logoShape: 'Logo shape',
      quickRequest: 'Quick request on posters',
      allowChange: 'Let people change it',
      saveSuccess: 'Saved. Everyone gets it the next time they open Lumen.',
    },
    fr: {
      title: 'Réglages de Lumen pour tout le monde',
      mediaServer: 'Serveur multimédia',
      mediaServerName: 'Nom du serveur multimédia',
      signIn: 'Connexion et serveur multimédia',
      branding: 'Logo et icône d’onglet',
      defaults: 'Valeurs par défaut pour tout le monde',
      save: 'Enregistrer pour tout le monde',
      theme: 'Thème',
      logoShape: 'Forme du logo',
      quickRequest: 'Demande rapide sur les affiches',
      allowChange: 'Autoriser les utilisateurs à le modifier',
      saveSuccess:
        'Enregistré. Le changement s’appliquera à la prochaine ouverture de Lumen.',
    },
    ar: {
      title: 'إعدادات Lumen للجميع',
      mediaServer: 'خادم الوسائط',
      mediaServerName: 'اسم خادم الوسائط',
      signIn: 'تسجيل الدخول وخادم الوسائط',
      branding: 'الشعار وأيقونة التبويب',
      defaults: 'الإعدادات الافتراضية للجميع',
      save: 'حفظ للجميع',
      theme: 'السمة',
      logoShape: 'شكل الشعار',
      quickRequest: 'طلب سريع على الملصقات',
      allowChange: 'السماح للمستخدمين بتغييره',
      saveSuccess:
        'تم الحفظ. ستظهر الإعدادات للجميع عند فتح Lumen في المرة التالية.',
    },
  } as const;
  const expected = labels[locale];
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: { defaults: { theme: 'dark' } } })
  );
  const putBodies: string[] = [];
  await page.route('**/lumen/config', async (route) => {
    if (route.request().method() === 'PUT') {
      putBodies.push(route.request().postData() ?? '');
      return route.fulfill({ json: { ok: true } });
    }
    return route.fulfill({ json: { canSave: true, folder: 'writable' } });
  });
  await page.route('**/api/v1/lumen/config', async (route) => {
    if (route.request().method() === 'PUT') {
      putBodies.push(route.request().postData() ?? '');
      return route.fulfill({ json: { ok: true } });
    }
    return route.fulfill({ json: { canSave: true, folder: 'writable' } });
  });
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname
      .replace(/^\/lumen(?=\/)/, '')
      .replace(/^\/api\/v1/, '');
    if (path === '/lumen/config') {
      if (route.request().method() === 'PUT') {
        putBodies.push(route.request().postData() ?? '');
        return route.fulfill({ json: { ok: true } });
      }
      return route.fulfill({ json: { canSave: true, folder: 'writable' } });
    }
    if (path === '/auth/me')
      return route.fulfill({
        json: { id: 1, displayName: 'Admin Fixture', permissions: 2 },
      });
    if (path === '/user/1/settings/main')
      return route.fulfill({ json: { locale } });
    if (path === '/settings/public')
      return route.fulfill({
        json: { applicationTitle: 'SeerrNG', mediaServerType: 1 },
      });
    return route.fulfill({ json: {} });
  });

  await page.goto(appPath('/me/lumen'));
  await expect(
    page.getByRole('heading', { name: expected.title })
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: expected.signIn })
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: expected.branding })
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: expected.defaults })
  ).toBeVisible();
  await expect(page.locator('.cfg-select').first()).toHaveAttribute(
    'aria-label',
    expected.mediaServer
  );
  await expect(page.locator('input.cfg-input').nth(0)).toHaveAttribute(
    'aria-label',
    expected.mediaServerName
  );
  await expect(
    page.getByRole('button', { name: expected.logoShape })
  ).toHaveCount(0);
  await expect(
    page.getByText(expected.quickRequest, { exact: true })
  ).toBeVisible();
  await expect(page.getByText(expected.theme, { exact: true })).toBeVisible();
  await expect(
    page.getByText(expected.allowChange, { exact: true })
  ).toBeVisible();
  await expect(
    page.locator('textarea[aria-label="lumen-config.json"]')
  ).toHaveAttribute('dir', 'ltr');
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
    )
    .toBe(true);
  await capture(page, info);

  await page.locator('input.cfg-input').nth(0).fill('Primary library');
  await page.getByRole('button', { name: expected.save }).click();
  await expect.poll(() => putBodies.length).toBe(1);
  expect(JSON.parse(putBodies[0]).mediaServerName).toBe('Primary library');
  await expect(
    page.getByRole('status').filter({ hasText: expected.saveSuccess })
  ).toBeVisible();
});
