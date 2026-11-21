import { expect, test, type Page, type TestInfo } from '@playwright/test';

async function capture(page: Page, info: TestInfo) {
  if (
    !process.env.LUMEN_VISUAL_CAPTURE_DIR ||
    !['desktop', 'iphone'].includes(info.project.name)
  )
    return;
  await page.screenshot({
    path: `${process.env.LUMEN_VISUAL_CAPTURE_DIR}/linked-accounts-${info.project.name}.png`,
    fullPage: true,
  });
}

test('Linked Accounts exposes translated sign-in and recovery controls', async ({
  page,
}, info) => {
  let discoveryConfigured = false;
  const locale = process.env.LUMEN_DISCOVERY_LOCALE === 'ar' ? 'ar' : 'fr';
  const translated = (english: string, french: string, arabic: string) =>
    process.env.LUMEN_CAPTURE_MODE !== 'baseline'
      ? locale === 'ar'
        ? arabic
        : french
      : english;
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname.slice(
      '/api/v1'.length
    );
    if (path === '/auth/me')
      return route.fulfill({
        json: { id: 2, displayName: 'Viewer', permissions: 32, userType: 2 },
      });
    if (path === '/settings/public')
      return route.fulfill({
        json: { mediaServerType: 3, applicationTitle: 'SeerrNG' },
      });
    if (path === '/user/2/settings/main')
      return route.fulfill({ json: { locale } });
    if (path === '/user/2/settings/linked-accounts')
      return route.fulfill({ json: [] });
    if (path === '/user/2/settings/password')
      return route.fulfill({ json: { hasPassword: true } });
    if (path === '/integrations/discovery/configuration')
      return route.fulfill({
        json: discoveryConfigured
          ? {
              anilist: { configured: true },
              simkl: { configured: true },
              trakt: { configured: true },
            }
          : {},
      });
    if (path === '/integrations/discovery/accounts')
      return route.fulfill({ json: { accounts: [] } });
    return route.fulfill({ json: {} });
  });

  await page.goto('/me/account/linked-accounts');
  await expect(
    page.getByRole('heading', {
      name: translated('Linked Accounts', 'Comptes liés', 'الحسابات المرتبطة'),
    })
  ).toBeVisible();
  await expect(
    page.getByRole('heading', {
      name: translated(
        'Sign-in Methods',
        'Méthodes de connexion',
        'طرق تسجيل الدخول'
      ),
    })
  ).toBeVisible();
  await expect(
    page.getByRole('heading', {
      name: translated(
        'Tracking Accounts',
        'Comptes de suivi',
        'حسابات التتبع'
      ),
    })
  ).toBeVisible();
  await expect(
    page.getByText(
      translated(
        'No tracking accounts are connected.',
        'Aucun compte de suivi n’est connecté.',
        'لا توجد حسابات تتبع متصلة.'
      )
    )
  ).toBeVisible();
  await expect(
    page.getByLabel(
      translated(
        'Media Server Username',
        'Nom d’utilisateur du serveur multimédia',
        'اسم مستخدم خادم الوسائط'
      )
    )
  ).toBeVisible();
  await expect(
    page.getByLabel(
      translated(
        'Media Server Password',
        'Mot de passe du serveur multimédia',
        'كلمة مرور خادم الوسائط'
      )
    )
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth
      )
    )
    .toBe(true);
  await capture(page, info);

  discoveryConfigured = true;
  await page.reload();
  await expect(
    page.getByRole('button', {
      name: translated(
        'Connect AniList',
        'Connecter AniList',
        'الاتصال بـ AniList'
      ),
    })
  ).toBeVisible();
  await page.route(
    '**/api/v1/integrations/discovery/accounts/anilist/connect',
    (route) => route.fulfill({ status: 500, json: {} })
  );
  await page
    .getByRole('button', {
      name: translated(
        'Connect AniList',
        'Connecter AniList',
        'الاتصال بـ AniList'
      ),
    })
    .click();
  await expect(page.getByRole('alert')).toHaveText(
    translated(
      'The server had a problem. Try again in a moment.',
      'Le serveur a rencontré un problème. Réessayez dans un instant.',
      'حدثت مشكلة في الخادم. حاول مرة أخرى بعد قليل.'
    )
  );
});
