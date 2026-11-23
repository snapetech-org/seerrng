import { expect, test } from '@playwright/test';

const mount = process.env.LUMEN_TEST_MOUNT === '/lumen' ? '/lumen' : '';
const appPath = (path: string) => `${mount}${path}`;

test('native administrator settings bookmarks open their Lumen destinations', async ({
  page,
}) => {
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname.slice(
      '/api/v1'.length
    );
    return route.fulfill({
      json:
        path === '/auth/me'
          ? { id: 1, displayName: 'Admin', permissions: 2 }
          : path === '/settings/public'
            ? { enabledMediaCategories: {} }
            : {},
    });
  });

  const cases = [
    ['/settings', '/admin/general'],
    ['/settings/main', '/admin/general'],
    ['/settings/about', '/admin/about'],
    ['/settings/categories', '/admin/categories'],
    ['/settings/discovery', '/admin/discovery'],
    ['/settings/jobs', '/admin/jobs'],
    ['/settings/library-migration', '/admin/library-migration'],
    ['/settings/logs', '/admin/logs'],
    ['/settings/metadata', '/admin/metadata'],
    ['/settings/network', '/admin/network'],
    ['/settings/plex', '/admin/media-libraries'],
    ['/settings/jellyfin', '/admin/media-libraries'],
    ['/settings/prowlarr', '/admin/prowlarr'],
    ['/settings/services', '/admin'],
    ['/settings/users', '/admin/users'],
    ['/settings/notifications/apprise', '/admin/notifications/apprise'],
    ['/settings/notifications/discord', '/admin/notifications/discord'],
    ['/settings/notifications/email', '/admin/notifications/email'],
    ['/settings/notifications/gotify', '/admin/notifications/gotify'],
    ['/settings/notifications/ntfy', '/admin/notifications/ntfy'],
    ['/settings/notifications/pushbullet', '/admin/notifications/pushbullet'],
    ['/settings/notifications/pushover', '/admin/notifications/pushover'],
    ['/settings/notifications/slack', '/admin/notifications/slack'],
    ['/settings/notifications/telegram', '/admin/notifications/telegram'],
    ['/settings/notifications/webhook', '/admin/notifications/webhook'],
    ['/settings/notifications/webpush', '/admin/notifications/webpush'],
    ['/settings/notifications', '/admin/notifications'],
    [
      '/settings/services?settingsSearch=Indexers&settingsSearchTarget=prowlarr#prowlarr',
      '/admin/prowlarr?settingsSearch=Indexers&settingsSearchTarget=prowlarr#prowlarr',
    ],
    [
      '/settings/main?settingsSearch=4K&settingsSearchTarget=enable4k#enable4k',
      '/admin/requests?settingsSearch=4K&settingsSearchTarget=enable4k#enable4k',
    ],
    [
      '/settings/main?settingsSearch=API&settingsSearchTarget=apiKey#apiKey',
      '/admin/general?settingsSearch=API&settingsSearchTarget=apiKey#apiKey',
    ],
  ] as const;

  await page.goto(appPath('/settings'));
  for (const [source, destination] of cases) {
    await page.evaluate((path) => {
      window.history.pushState({}, '', path);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }, appPath(source));
    await expect(page).toHaveURL(
      new URL(appPath(destination), page.url()).href
    );
  }
});

test('native settings bookmarks still enforce the administrator boundary', async ({
  page,
}) => {
  const settingsReads: string[] = [];
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname.slice(
      '/api/v1'.length
    );
    if (path.startsWith('/settings/') && path !== '/settings/public')
      settingsReads.push(path);
    return route.fulfill({
      json:
        path === '/auth/me'
          ? { id: 7, displayName: 'Requester', permissions: 16 }
          : path === '/settings/public'
            ? { enabledMediaCategories: {} }
            : {},
    });
  });

  await page.goto(appPath('/settings/prowlarr?source=bookmark#diagnostics'));
  await expect(page).toHaveURL(/\/me$/);
  expect(settingsReads).toEqual([]);
});
