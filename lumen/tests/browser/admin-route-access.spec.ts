import { expect, test, type Page } from '@playwright/test';

const adminRoutes = [
  '/admin',
  '/admin/override-rules',
  '/admin/logs',
  '/admin/jobs',
  '/admin/caches',
  '/admin/categories',
  '/admin/general',
  '/admin/network',
  '/admin/connection-hosts',
  '/admin/prowlarr',
  '/admin/radarr',
  '/admin/sonarr',
  '/admin/lidarr',
  '/admin/readarr',
  '/admin/lazylibrarian',
  '/admin/mylar',
  '/admin/kapowarr',
  '/admin/backissue',
  '/admin/sportarr',
  '/admin/soulseek',
  '/admin/reader-delivery',
  '/admin/software-acquisition',
  '/admin/tunerr',
  '/admin/recognition',
  '/admin/swipe',
  '/admin/download-clients',
  '/admin/readmeabook',
  '/admin/navidrome',
  '/admin/jellystat',
  '/admin/audiobookshelf',
  '/admin/kavita',
  '/admin/whisparr',
  '/admin/discovery',
  '/admin/metadata',
  '/admin/media-libraries',
  '/admin/notifications',
  '/admin/library-migration',
  '/admin/about',
  '/admin/users',
];

async function signIn(page: Page, admin: boolean) {
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname.slice(
      '/api/v1'.length
    );
    if (path === '/auth/me')
      return route.fulfill({
        json: {
          id: 1,
          displayName: admin ? 'Admin Fixture' : 'User Fixture',
          permissions: admin ? 2 : 0,
        },
      });
    if (path === '/user/1/settings/main')
      return route.fulfill({ json: { locale: 'en', lumenPreferences: {} } });
    if (path === '/settings/public')
      return route.fulfill({
        json: { applicationTitle: 'SeerrNG', mediaServerType: 1 },
      });
    return route.fulfill({ json: {} });
  });
}

test('administrator navigation matches the account role', async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  await signIn(page, false);
  await page.goto('/me');
  await expect(
    page.getByRole('link', { name: 'SeerrNG Administration', exact: true })
  ).toHaveCount(0);
  for (const path of adminRoutes) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/me$/);
  }

  await page.goto('/me');
  await signIn(page, true);
  await page.goto('/me');
  const adminEntry =
    testInfo.project.name === 'desktop'
      ? page.getByRole('link', {
          name: 'SeerrNG Administration',
          exact: true,
        })
      : page.getByRole('link', { name: 'Open SeerrNG Administration' });
  await expect(adminEntry).toHaveAttribute('href', '/admin');
  for (const path of adminRoutes) {
    await page.goto(path);
    await expect(page).toHaveURL(new RegExp(`${path.replaceAll('/', '\\/')}$`));
  }
});
