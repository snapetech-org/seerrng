import { expect, test } from '@playwright/test';

const mount = process.env.LUMEN_TEST_MOUNT === '/lumen' ? '/lumen' : '';
const locale = process.env.LUMEN_ADMIN_USERS_LOCALE ?? 'en';
const labels = {
  en: {
    title: 'Users',
    back: 'Back to Account',
    searchUsers: 'Search Users',
    sortBy: 'Sort By',
    sortDirection: 'Sort Direction',
    ascending: 'Ascending',
    descending: 'Descending',
    createLocalUser: 'Create Local User',
    createHeading: 'Create Local User',
    username: 'Username',
    email: 'Email',
    emailSetup: 'Email a password setup link',
    password: 'Password',
    createUser: 'Create User',
    creating: 'Creating…',
    cancel: 'Cancel',
    role: 'Member',
    requestCount: '3 requests',
    serverProblem: 'The server had a problem. Try again in a moment.',
    created: 'Created New User.',
  },
  fr: {
    title: 'Utilisateurs',
    back: 'Retour au compte',
    searchUsers: 'Rechercher des utilisateurs',
    sortBy: 'Trier par',
    sortDirection: 'Ordre de tri',
    ascending: 'Croissant',
    descending: 'Décroissant',
    createLocalUser: 'Créer un utilisateur local',
    createHeading: 'Créer un utilisateur local',
    username: 'Nom d’utilisateur',
    email: 'Adresse e-mail',
    emailSetup: 'Envoyer un lien de création de mot de passe par e-mail',
    password: 'Mot de passe',
    createUser: 'Créer l’utilisateur',
    creating: 'Création…',
    cancel: 'Annuler',
    role: 'Membre',
    requestCount: '3 demandes',
    serverProblem:
      'Le serveur a rencontré un problème. Réessayez dans un instant.',
    created: 'New User a été créé.',
  },
  ar: {
    title: 'المستخدمون',
    back: 'العودة إلى الحساب',
    searchUsers: 'البحث عن المستخدمين',
    sortBy: 'الترتيب حسب',
    sortDirection: 'اتجاه الترتيب',
    ascending: 'تصاعدي',
    descending: 'تنازلي',
    createLocalUser: 'إنشاء مستخدم محلي',
    createHeading: 'إنشاء مستخدم محلي',
    username: 'اسم المستخدم',
    email: 'البريد الإلكتروني',
    emailSetup: 'إرسال رابط إعداد كلمة المرور بالبريد الإلكتروني',
    password: 'كلمة المرور',
    createUser: 'إنشاء مستخدم',
    creating: 'جارٍ الإنشاء…',
    cancel: 'إلغاء',
    role: 'عضو',
    requestCount: '3 من الطلبات',
    serverProblem: 'حدثت مشكلة في الخادم. حاول مجددًا بعد قليل.',
    created: 'تم إنشاء New User.',
  },
} as const;
const english = labels.en;

test('user directory and local-account creation use the saved locale and retain a failed submit', async ({
  page,
}) => {
  const translated = labels[locale as keyof typeof labels] ?? english;
  const copy =
    process.env.LUMEN_ADMIN_USERS_BASELINE === 'true' ? english : translated;
  let failOnce = true;
  const creates: Record<string, unknown>[] = [];

  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname
      .replace(/^\/lumen/, '')
      .replace(/^\/api\/v1/, '');
    if (path === '/auth/me')
      return route.fulfill({ json: { id: 1, permissions: 2 } });
    if (path === '/user/1/settings/main')
      return route.fulfill({ json: { locale } });
    if (path === '/settings/public')
      return route.fulfill({
        json: { applicationTitle: 'SeerrNG', mediaServerType: 0 },
      });
    if (path === '/user' && request.method() === 'GET')
      return route.fulfill({
        json: {
          pageInfo: { pages: 1, results: 1 },
          results: [
            {
              id: 2,
              displayName: 'Demo User',
              email: 'demo@example.test',
              permissions: 0,
              requestCount: 3,
              userType: 1,
            },
          ],
        },
      });
    if (path === '/user' && request.method() === 'POST') {
      creates.push(request.postDataJSON() as Record<string, unknown>);
      if (failOnce) {
        failOnce = false;
        return route.fulfill({ status: 503, json: { message: 'unavailable' } });
      }
      return route.fulfill({ json: { id: 3 } });
    }
    return route.fulfill({ json: {} });
  });

  await page.goto(`${mount}/admin/users`);
  await expect(
    page.getByRole('heading', { name: copy.title, exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: copy.back, exact: true })
  ).toBeVisible();
  await expect(page.getByLabel(copy.searchUsers)).toBeVisible();
  await expect(page.getByLabel(copy.sortBy)).toBeVisible();
  await expect(page.getByLabel(copy.sortDirection)).toHaveValue('asc');
  await expect(page.getByText(copy.role, { exact: true })).toBeVisible();
  await expect(
    page.getByText(copy.requestCount, { exact: true })
  ).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute(
    'dir',
    locale === 'ar' ? 'rtl' : 'ltr'
  );

  if (process.env.LUMEN_ADMIN_USERS_CAPTURE) {
    await page.screenshot({
      path: `${process.env.LUMEN_ADMIN_USERS_CAPTURE}-directory-${page.viewportSize()!.width}.png`,
    });
    await page
      .getByRole('button', { name: copy.createLocalUser, exact: true })
      .click();
    await expect(page.getByLabel(copy.username)).toBeVisible();
    await page.screenshot({
      path: `${process.env.LUMEN_ADMIN_USERS_CAPTURE}-create-${page.viewportSize()!.width}.png`,
    });
    if (process.env.LUMEN_ADMIN_USERS_CAPTURE_ONLY === '1') return;
    await page.getByRole('button', { name: copy.cancel, exact: true }).click();
  }

  await page
    .getByRole('button', { name: copy.createLocalUser, exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: copy.createHeading, exact: true })
  ).toBeVisible();
  await page.getByLabel(copy.username).fill('New User');
  await page
    .getByRole('textbox', { name: copy.email })
    .fill('new@example.test');
  await page
    .getByRole('textbox', { name: copy.password })
    .fill('safe-password-123');
  const create = page.getByRole('button', {
    name: copy.createUser,
    exact: true,
  });
  await create.click();
  await expect(page.getByRole('alert')).toContainText(copy.serverProblem);
  await expect(page.getByLabel(copy.username)).toHaveValue('New User');
  await create.click();
  await expect(page.getByText(copy.created, { exact: true })).toBeVisible();
  expect(creates).toHaveLength(2);
  expect(creates[0]).toMatchObject({
    username: 'New User',
    email: 'new@example.test',
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    )
  ).toBe(true);
});
