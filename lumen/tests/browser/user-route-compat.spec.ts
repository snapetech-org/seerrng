import { expect, test, type Page } from '@playwright/test';
import { testAppPath as mountedTestAppPath } from './testAppPath';

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
    mountedTestAppPath(
      '/users/19/requests?filter=all&mediaType=movie&userId=99&requestedBy=7'
    )
  );
  await expect(page).toHaveURL(
    new RegExp(`^https?://[^/]+${mount}/requests\\?.*$`)
  );
  await expect(page).toHaveURL(/show=all/);
  const url = new URL(page.url());
  expect(url.searchParams.get('show'), url.href).toBe('all');
  expect(url.searchParams.has('filter')).toBe(false);
  expect(url.searchParams.get('mediaType')).toBe('movie');
  expect(url.searchParams.has('userId'), url.href).toBe(false);
  expect(url.searchParams.get('requestedBy')).toBe('19');
});

test('standalone request bookmark keeps the path user and legacy filters in Lumen', async ({
  page,
}) => {
  await authenticate(page, 16384);
  const reads: URLSearchParams[] = [];
  await page.route('**/api/v1/**', (route) => {
    const url = new URL(route.request().url());
    const pathname = url.pathname.replace(/^\/lumen(?=\/)/, '');
    if (pathname !== '/api/v1/request' && pathname !== '/api/v1/request/status')
      return route.fallback();
    reads.push(url.searchParams);
    return route.fulfill({
      json: { pageInfo: { pages: 1, results: 0 }, results: [] },
    });
  });

  await page.goto(
    appPath(
      '/requests/by-user/19?userId=12&requestedBy=11&filter=pending&mediaType=audiobook&bookFormat=ebook&search=Night+%26+Day'
    )
  );
  await expect(page).toHaveURL(
    new RegExp(`^https?://[^/]+${mount}/requests\\?`)
  );
  const url = new URL(page.url());
  expect(url.searchParams.has('userId')).toBe(false);
  expect(url.searchParams.get('requestedBy')).toBe('19');
  await expect.poll(() => reads.length).toBeGreaterThan(0);
  for (const params of reads) {
    expect(params.get('requestedBy')).toBe('19');
    expect(params.has('userId')).toBe(false);
    expect(params.get('filter')).toBe('pending');
    expect(params.get('mediaType')).toBe('book');
    expect(params.get('bookFormat')).toBe('ebook');
    expect(params.get('search')).toBe('Night & Day');
  }
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

test('native self notification bookmarks preserve supported channel anchors and query', async ({
  page,
}) => {
  await authenticate(page, 32);
  for (const channel of [
    'discord',
    'email',
    'pushbullet',
    'pushover',
    'telegram',
    'webpush',
  ]) {
    await page.goto(
      appPath(`/users/2/settings/notifications/${channel}?from=native`)
    );
    await expect(page).toHaveURL(
      new RegExp(
        `${mount}/me/account/notifications\\?from=native#notification-${channel}$`
      )
    );
  }

  await page.goto(
    appPath('/users/2/settings/notifications/unknown?from=native')
  );
  await expect(page).toHaveURL(
    new RegExp(`${mount}/me/account/notifications\\?from=native$`)
  );
});

test('unauthorized notification bookmark does not read settings for another user', async ({
  page,
}) => {
  await authenticate(page, 32);
  const targetReads: string[] = [];
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname.replace(/^\/lumen(?=\/)/, '');
    if (path.startsWith('/api/v1/user/19/')) targetReads.push(path);
  });

  await page.goto(
    appPath('/users/19/settings/notifications/telegram?from=native')
  );
  await expect(page).toHaveURL(new RegExp(`${mount}/me$`));
  expect(targetReads).toEqual([]);
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
  await page.route('**/api/v1/user/2', (route) =>
    route.fulfill({
      json: {
        id: 2,
        displayName: 'Viewer',
        userType: 2,
        createdAt: '2026-11-01T00:00:00.000Z',
      },
    })
  );
  await page.route('**/api/v1/user/2/requests*', (route) =>
    route.fulfill({ json: { results: [] } })
  );
  await page.route('**/api/v1/user/2/watchlist', (route) =>
    route.fulfill({ json: { results: [] } })
  );
  await page.route('**/api/v1/user/2/quota', (route) =>
    route.fulfill({ json: {} })
  );
  await page.goto(appPath('/profile?from=native'));
  await expect(page).toHaveURL(
    new RegExp(`${mount}/household/me\\?from=native$`)
  );
  await expect(
    page.getByRole('heading', { name: 'Recent Requests' })
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Watchlist' })).toBeVisible();
  if (process.env.LUMEN_VISUAL_CAPTURE_DIR)
    await page.screenshot({
      path: `${process.env.LUMEN_VISUAL_CAPTURE_DIR}/profile-bookmark-${page.viewportSize()?.width}.png`,
      fullPage: true,
    });

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
