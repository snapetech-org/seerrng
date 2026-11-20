import { expect, test } from '@playwright/test';

const mount = process.env.LUMEN_TEST_MOUNT === '/lumen' ? '/lumen' : '';
const appPath = (path: string) => `${mount}${path}`;

const administratorRoutes = [
  '/admin',
  '/admin/about',
  '/admin/audiobookshelf',
  '/admin/backissue',
  '/admin/caches',
  '/admin/categories',
  '/admin/connection-hosts',
  '/admin/discovery',
  '/admin/download-clients',
  '/admin/general',
  '/admin/jellystat',
  '/admin/jobs',
  '/admin/kapowarr',
  '/admin/kavita',
  '/admin/lazylibrarian',
  '/admin/library-migration',
  '/admin/lidarr',
  '/admin/logs',
  '/admin/media-libraries',
  '/admin/metadata',
  '/admin/mylar',
  '/admin/navidrome',
  '/admin/network',
  '/admin/notifications',
  '/admin/notifications/webhook',
  '/admin/override-rules',
  '/admin/prowlarr',
  '/admin/radarr',
  '/admin/readarr',
  '/admin/reader-delivery',
  '/admin/readmeabook',
  '/admin/recognition',
  '/admin/software-acquisition',
  '/admin/sonarr',
  '/admin/soulseek',
  '/admin/sportarr',
  '/admin/swipe',
  '/admin/tunerr',
  '/admin/users',
  '/admin/users/1',
  '/admin/users/1/permissions',
  '/admin/whisparr',
];

test('every administrator route denies direct access to a standard user', async ({
  page,
}) => {
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    return route.fulfill({
      json: path.endsWith('/auth/me')
        ? { id: 7, displayName: 'Viewer', permissions: 32 }
        : path.endsWith('/settings/public')
          ? { mediaServerType: 1 }
          : {},
    });
  });

  for (const route of administratorRoutes) {
    await page.goto(appPath(route));
    await expect(page).toHaveURL(new RegExp(`${appPath('/me')}$`));
  }
});
