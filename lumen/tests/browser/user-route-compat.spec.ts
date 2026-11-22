import { expect, test, type Page } from '@playwright/test';

const mount = process.env.LUMEN_TEST_MOUNT === '/lumen' ? '/lumen' : '';
const appPath = (path: string) => `${mount}${path}`;

async function authenticate(page: Page, permissions: number, id = 2) {
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname
      .replace(/^\/lumen(?=\/)/, '')
      .slice('/api/v1'.length);
    if (path === '/auth/me')
      return route.fulfill({
        json: { id, displayName: 'Viewer', permissions, userType: 2 },
      });
    if (path === `/user/${id}/settings/main`)
      return route.fulfill({ json: { locale: 'en' } });
    if (path === '/settings/public') return route.fulfill({ json: {} });
    return route.fulfill({ json: {} });
  });
}

test('native user profile and watchlist bookmarks map to Lumen destinations', async ({
  page,
}) => {
  await authenticate(page, 2);
  await page.goto(appPath('/users/19'));
  await expect(page).toHaveURL(new RegExp(`${mount}/household/19$`));

  await page.goto(appPath('/users/19/watchlist?mediaType=movie&page=2'));
  await expect(page).toHaveURL(
    new RegExp(`${mount}/watchlist/user/19\\?mediaType=movie&page=2$`)
  );
});

test('native user request bookmark preserves filters and enforces the path user', async ({
  page,
}) => {
  await authenticate(page, 16384);
  await page.goto(
    appPath(
      '/users/19/requests?filter=all&mediaType=movie&userId=99&requestedBy=7'
    )
  );
  await expect(page).toHaveURL(
    new RegExp(`^https?://[^/]+${mount}/requests\\?.*$`)
  );
  const url = new URL(page.url());
  expect(url.searchParams.get('filter')).toBe('all');
  expect(url.searchParams.get('mediaType')).toBe('movie');
  expect(url.searchParams.has('userId'), url.href).toBe(false);
  expect(url.searchParams.get('requestedBy')).toBe('19');
});

test('native self settings bookmark opens the matching Lumen account section', async ({
  page,
}) => {
  await authenticate(page, 32);
  await page.goto(appPath('/users/2/settings/tv-request-access?from=native'));
  await expect(page).toHaveURL(
    new RegExp(`${mount}/me/account/tv-requests\\?from=native$`)
  );
});

test('native managed settings bookmark requires user-management authority', async ({
  page,
}) => {
  await authenticate(page, 8);
  await page.goto(appPath('/users/19/settings/password?from=native'));
  await expect(page).toHaveURL(
    new RegExp(`${mount}/admin/users/19/password\\?from=native$`)
  );
});

test('native settings bookmark redirects unauthorized viewers without loading target settings', async ({
  page,
}) => {
  await authenticate(page, 32);
  const targetReads: string[] = [];
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname.replace(/^\/lumen(?=\/)/, '');
    if (path.startsWith('/api/v1/user/19/') || path === '/api/v1/user')
      targetReads.push(path);
  });
  await page.goto(appPath('/users/19/settings/linked-accounts'));
  await expect(page).toHaveURL(new RegExp(`${mount}/me$`));
  expect(targetReads).toEqual([]);
});

test('malformed native user IDs fall back to safe Lumen routes', async ({
  page,
}) => {
  await authenticate(page, 2);
  await page.goto(appPath('/users/0'));
  await expect(page).toHaveURL(new RegExp(`${mount}/me$`));
  await page.goto(appPath('/users/invalid/requests'));
  await expect(page).toHaveURL(new RegExp(`${mount}/requests$`));
});

test('native profile and settings bookmarks open the matching Lumen sections', async ({
  page,
}) => {
  await authenticate(page, 32);
  await page.goto(appPath('/profile?from=native'));
  await expect(page).toHaveURL(new RegExp(`${mount}/me\\?from=native$`));

  await page.goto(appPath('/profile/watchlist?mediaType=book&page=2'));
  await expect(page).toHaveURL(
    new RegExp(`${mount}/watchlist\\?mediaType=book&page=2$`)
  );

  await page.goto(appPath('/profile/settings/password?from=native'));
  await expect(page).toHaveURL(
    new RegExp(`${mount}/me/account\\?from=native#password$`)
  );

  await page.goto(
    appPath('/profile/settings/notifications/telegram?from=native')
  );
  await expect(page).toHaveURL(
    new RegExp(
      `${mount}/me/account/notifications\\?from=native#notification-telegram$`
    )
  );

  await page.goto(appPath('/profile/advanced-theme?from=native'));
  await expect(page).toHaveURL(
    new RegExp(`${mount}/me/account\\?from=native#advanced-theme$`)
  );
});
