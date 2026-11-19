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
      return route.fulfill({ json: { locale: 'fr' } });
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
    if (path === '/integrations/discovery/accounts')
      return route.fulfill({ json: { accounts: [] } });
    return route.fulfill({ json: {} });
  });

  await page.goto('/me/account/linked-accounts');
  const candidate = process.env.LUMEN_CAPTURE_MODE === 'candidate';
  await expect(
    page.getByRole('heading', {
      name: candidate ? 'Comptes liés' : 'Linked Accounts',
    })
  ).toBeVisible();
  await expect(
    page.getByRole('heading', {
      name: candidate ? 'Méthodes de connexion' : 'Sign-in Methods',
    })
  ).toBeVisible();
  await expect(
    page.getByRole('heading', {
      name: candidate ? 'Comptes de suivi' : 'Tracking Accounts',
    })
  ).toBeVisible();
  await expect(
    page.getByText(
      candidate
        ? 'Aucun compte de suivi n’est connecté.'
        : 'No tracking accounts are connected.'
    )
  ).toBeVisible();
  await expect(
    page.getByLabel(
      candidate
        ? 'Nom d’utilisateur du serveur multimédia'
        : 'Media Server Username'
    )
  ).toBeVisible();
  await expect(
    page.getByLabel(
      candidate ? 'Mot de passe du serveur multimédia' : 'Media Server Password'
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
      name: candidate ? 'Connecter AniList' : 'Connect AniList',
    })
  ).toBeVisible();
  await page.route(
    '**/api/v1/integrations/discovery/accounts/anilist/connect',
    (route) => route.fulfill({ status: 500, json: {} })
  );
  await page
    .getByRole('button', {
      name: candidate ? 'Connecter AniList' : 'Connect AniList',
    })
    .click();
  await expect(page.getByRole('alert')).toHaveText(
    candidate
      ? 'Le serveur a rencontré un problème. Réessayez dans un instant.'
      : 'The server had a problem. Try again in a moment.'
  );
});
