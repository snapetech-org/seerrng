import { expect, test, type Page } from '@playwright/test';
import { testAppPath as mountedTestAppPath } from './testAppPath';

const testAppPath = (path: string) =>
  `${process.env.LUMEN_TEST_MOUNT === '/lumen' ? '/lumen' : ''}${path}`;

const paged = (results: unknown[] = []) => ({
  page: 1,
  totalPages: 1,
  totalResults: results.length,
  results,
});

const series = {
  id: 202,
  name: 'Saved Item Fixture',
  firstAirDate: '2020-01-01',
  originalName: 'Saved Item Fixture',
  overview: 'A fixture for the viewer-scoped media-server saved item action.',
  posterPath: null,
  backdropPath: null,
  voteAverage: 7.5,
  genres: [],
  seasons: [{ id: 1, seasonNumber: 1, episodeCount: 2, name: 'Season 1' }],
  credits: { cast: [], crew: [] },
  createdBy: [],
  networks: [],
  externalIds: {},
  mediaInfo: {
    id: 50,
    status: 5,
    status4k: 5,
    seasons: [{ seasonNumber: 1, status: 5, status4k: 5 }],
    requests: [],
  },
};

async function fixture(
  page: Page,
  serverType = 1,
  opts: {
    failInitialRead?: boolean;
    fourK?: boolean;
    unavailableReason?: 'account-not-linked' | 'series-not-found';
  } = {}
) {
  let saved = false;
  let failInitialRead = opts.failInitialRead ?? false;
  const reads: string[] = [];
  const writes: unknown[] = [];
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/api/v1/**', (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.slice('/api/v1'.length);
    if (path === '/auth/me')
      return route.fulfill({
        json: {
          id: 1,
          displayName: 'Fixture Owner',
          permissions: 2,
          userType: 2,
        },
      });
    if (/^\/user\/\d+\/settings\/main$/.test(path))
      return route.fulfill({ json: {} });
    if (path === '/settings/discover') return route.fulfill({ json: [] });
    if (path === '/settings/public')
      return route.fulfill({
        json: {
          applicationTitle: 'SeerrNG',
          enabledMediaCategories: {},
          mediaServerType: serverType,
          series4kEnabled: opts.fourK ?? false,
          movie4kEnabled: false,
        },
      });
    if (path === '/request/status')
      return route.fulfill({ status: 404, json: {} });
    if (path === '/request/count') return route.fulfill({ json: { total: 0 } });
    if (path === '/blocklist/count')
      return route.fulfill({ json: { count: 0 } });
    if (path === '/tv/202') return route.fulfill({ json: series });
    if (path === '/tv/202/recommendations')
      return route.fulfill({ json: paged() });
    if (path === '/tv/202/media-server-saved-item') {
      if (request.method() === 'GET') {
        reads.push(url.search);
        if (failInitialRead) {
          failInitialRead = false;
          return route.fulfill({
            status: 503,
            json: { message: 'Temporary read failure' },
          });
        }
        return route.fulfill({
          json: {
            serverType,
            kind: serverType === 1 ? 'watchlist' : 'favorites',
            available: !opts.unavailableReason,
            ...(opts.unavailableReason
              ? { reason: opts.unavailableReason }
              : { saved }),
          },
        });
      }
      writes.push(request.postDataJSON());
      saved = Boolean(request.postDataJSON().saved);
      return route.fulfill({
        json: {
          serverType,
          kind: serverType === 1 ? 'watchlist' : 'favorites',
          available: !opts.unavailableReason,
          ...(opts.unavailableReason
            ? { reason: opts.unavailableReason }
            : { saved }),
        },
      });
    }
    return route.fulfill({ json: paged() });
  });
  return { reads, writes };
}

async function openMediaServerActions(page: Page) {
  await page.getByTestId('tv-media-server').locator('summary').first().click();
}

for (const [serverType, name] of [
  [1, 'Plex Watchlist'],
  [2, 'Jellyfin Favorites'],
  [3, 'Emby Favorites'],
] as const) {
  test(`${name} saves and removes a series without changing SeerrNG Watchlist`, async ({
    page,
  }, info) => {
    const { reads, writes } = await fixture(page, serverType);
    await page.goto(mountedTestAppPath('/tv/202'));
    await openMediaServerActions(page);
    const add = page.getByRole('button', {
      name: `Add Saved Item Fixture to ${name}`,
    });
    await expect(add).toBeVisible();
    await page.screenshot({
      path: info.outputPath('tv-saved-item-candidate.png'),
      fullPage: true,
      animations: 'disabled',
    });
    expect(reads).toContain('?is4k=false');
    await add.click();
    const remove = page.getByRole('button', {
      name: `Remove Saved Item Fixture from ${name}`,
    });
    await expect(remove).toBeVisible();
    expect(writes).toEqual([{ saved: true, is4k: false }]);
    await page.reload();
    await openMediaServerActions(page);
    await page
      .getByRole('button', { name: `Remove Saved Item Fixture from ${name}` })
      .click();
    await expect(
      page.getByRole('button', { name: `Add Saved Item Fixture to ${name}` })
    ).toBeVisible();
    expect(writes).toEqual([
      { saved: true, is4k: false },
      { saved: false, is4k: false },
    ]);
    expect(reads.every((query) => query === '?is4k=false')).toBe(true);
  });
}

test('4K saved state uses the selected quality', async ({ page }) => {
  const { reads, writes } = await fixture(page, 2, { fourK: true });
  await page.goto(mountedTestAppPath('/tv/202?quality=4k'));
  await openMediaServerActions(page);
  await expect(
    page.getByRole('button', {
      name: 'Add Saved Item Fixture to Jellyfin Favorites',
    })
  ).toBeVisible();
  expect(reads).toContain('?is4k=true');
  await page
    .getByRole('button', {
      name: 'Add Saved Item Fixture to Jellyfin Favorites',
    })
    .click();
  await expect(
    page.getByRole('button', {
      name: 'Remove Saved Item Fixture from Jellyfin Favorites',
    })
  ).toBeVisible();
  expect(writes).toEqual([{ saved: true, is4k: true }]);
});

test('read retry only reads and does not repeat a saved action', async ({
  page,
}) => {
  const { reads, writes } = await fixture(page, 1, { failInitialRead: true });
  await page.goto(mountedTestAppPath('/tv/202'));
  await openMediaServerActions(page);
  await expect(
    page.getByRole('button', { name: 'Retry Plex Watchlist status' })
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Retry Plex Watchlist status' })
    .click();
  await expect(
    page.getByRole('button', {
      name: 'Add Saved Item Fixture to Plex Watchlist',
    })
  ).toBeVisible();
  expect(reads).toHaveLength(2);
  expect(writes).toEqual([]);
});

test('unconfigured media servers do not show or query a saved action', async ({
  page,
}) => {
  const { reads, writes } = await fixture(page, 4);
  await page.goto(mountedTestAppPath('/tv/202'));
  await expect(
    page.getByRole('heading', { name: 'Saved Item Fixture' })
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: /Favorites|Plex Watchlist/ })
  ).toHaveCount(0);
  expect(reads).toEqual([]);
  expect(writes).toEqual([]);
});

test('an unlinked account offers recovery without attempting a write', async ({
  page,
}, info) => {
  const { writes } = await fixture(page, 1, {
    unavailableReason: 'account-not-linked',
  });
  await page.goto(mountedTestAppPath('/tv/202'));
  await openMediaServerActions(page);
  await expect(
    page.getByRole('button', { name: 'Plex Watchlist unavailable' })
  ).toBeDisabled();
  await expect(
    page.getByRole('link', { name: 'Link Plex Account' })
  ).toHaveAttribute('href', testAppPath('/me/account/linked-accounts'));
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    )
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath('tv-saved-item-unlinked.png'),
    fullPage: true,
    animations: 'disabled',
  });
  expect(writes).toEqual([]);
});

test('a series absent from the viewer catalog has a disabled explained action', async ({
  page,
}) => {
  const { writes } = await fixture(page, 2, {
    unavailableReason: 'series-not-found',
  });
  await page.goto(mountedTestAppPath('/tv/202'));
  await openMediaServerActions(page);
  await expect(
    page.getByRole('button', { name: 'Jellyfin Favorites unavailable' })
  ).toBeDisabled();
  await expect(
    page.getByText('Not in your accessible Jellyfin catalog.')
  ).toBeVisible();
  expect(writes).toEqual([]);
});
