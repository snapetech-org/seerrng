import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

const testMount = process.env.LUMEN_TEST_MOUNT === '/lumen' ? '/lumen' : '';
const appPath = (path: string) => `${testMount}${path}`;
const apiPath = (pathname: string) =>
  pathname.slice(pathname.indexOf('/api/v1') + '/api/v1'.length);

// shaped like the live responses: right after a request SeerrNG returns the request (with its
// seasons) but no mediaInfo.seasons yet (those arrive once Sonarr has synced)
const seasons = [
  {
    seasonNumber: 0,
    episodeCount: 36,
    name: 'Specials',
    airDate: '2022-09-03',
  },
  { seasonNumber: 1, episodeCount: 8, name: 'Season 1', airDate: '2022-09-01' },
  { seasonNumber: 2, episodeCount: 8, name: 'Season 2', airDate: '2024-08-29' },
  { seasonNumber: 3, episodeCount: 8, name: 'Season 3', airDate: '2026-11-11' },
];
const req = (nums: number[], status = 2, is4k = false) => ({
  id: 444,
  status,
  is4k,
  createdAt: '2026-11-12T05:20:57.000Z',
  requestedBy: { id: 1, displayName: 'alex' },
  seasons: nums.map((n) => ({ seasonNumber: n, status })),
});
type RecordedPost = { path: string; body: unknown };
const isBaseline = process.env.LUMEN_TV_REQUEST_BASELINE === 'true';

async function captureRequestState(
  page: Page,
  testInfo: TestInfo,
  name: string
) {
  if (!['desktop', 'iphone'].includes(testInfo.project.name)) return;
  await page.setViewportSize(
    testInfo.project.name === 'iphone'
      ? { width: 390, height: 844 }
      : { width: 1280, height: 900 }
  );
  await page.screenshot({
    path: testInfo.outputPath(
      `tv-request-${name}-${isBaseline ? 'baseline' : 'candidate'}.png`
    ),
    fullPage: true,
  });
}

async function show(
  page: Page,
  mediaInfo: Record<string, unknown>,
  posts: RecordedPost[] = [],
  permissions = 2,
  quota?: { limit: number; remaining: number; restricted: boolean },
  settings: Record<string, unknown> = {},
  seriesSeasons: typeof seasons = seasons,
  locale?: string,
  failRequest = false
) {
  await page.route('https://**/*', (r) => r.abort());
  await page.route('**/lumen-config.json', (r) => r.fulfill({ json: {} }));
  await page.route('**/imageproxy/tmdb/**', (r) =>
    r.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 56 84"><rect width="56" height="84" fill="#38435c"/><path d="M0 60 20 35l12 14 9-10 15 21v24H0" fill="#687bad"/><circle cx="39" cy="20" r="8" fill="#d8b56b"/></svg>',
    })
  );
  await page.route('**/api/v1/**', (r) => {
    const path = apiPath(new URL(r.request().url()).pathname);
    if (r.request().method() !== 'GET')
      posts.push({ path, body: r.request().postDataJSON() });
    if (path === '/auth/me')
      return r.fulfill({
        json: { id: 1, displayName: 'alex', permissions },
      });
    if (path === '/settings/public') return r.fulfill({ json: settings });
    if (path === '/user/1/settings/episode-queue')
      return r.fulfill({ json: { status: 'off', defaultEpisodeCount: 0 } });
    if (path === '/user/1/settings/tv-season-watch-gate')
      return r.fulfill({ json: { status: 'off', globallyEnabled: false } });
    if (locale && path === '/user/1/settings/main')
      return r.fulfill({ json: { locale } });
    if (quota && path === '/user/1/quota')
      return r.fulfill({ json: { tv: quota } });
    if (path === '/request' && r.request().method() === 'POST' && failRequest)
      return r.fulfill({
        status: 500,
        json: { message: 'Internal Server Error' },
      });
    if (path === '/request' && r.request().method() === 'POST')
      return r.fulfill({
        json: { id: 44, status: 1, quotaException: !!quota },
      });
    if (path === '/tv/84773')
      return r.fulfill({
        json: {
          id: 84773,
          name: 'The Rings of Power',
          posterPath: '/rings-poster.jpg',
          externalIds: { tvdbId: 80 },
          overview: 'Rings.',
          genres: [],
          seasons: seriesSeasons,
          numberOfSeasons: seriesSeasons.filter(
            ({ seasonNumber }) => seasonNumber > 0
          ).length,
          firstAirDate: '2022-09-01',
          mediaInfo,
        },
      });
    if (/^\/tv\/84773\/season\/\d+$/.test(path))
      return r.fulfill({ json: { episodes: [] } });
    return r.fulfill({ json: { results: [] } });
  });
  await page.goto(appPath('/tv/84773'));
}

for (const locale of ['en', 'fr', 'ar'] as const) {
  test(`TV detail request failures follow ${locale} locale`, async ({
    page,
  }, testInfo) => {
    const serverFailure = {
      en: 'The server had a problem. Try again in a moment.',
      fr: 'Le serveur a rencontré un problème. Réessayez dans un instant.',
      ar: 'حدثت مشكلة في الخادم. حاول مجددًا بعد قليل.',
    }[locale];
    await show(
      page,
      { id: 2074, status: 2, requests: [], seasons: [] },
      [],
      32,
      undefined,
      {},
      seasons,
      locale,
      true
    );
    const requestButton = page
      .locator(
        (page.viewportSize()?.width ?? 0) < 1040
          ? '.actionbar .btn-primary'
          : '.dacts.pc .btn-primary'
      )
      .first();
    await expect(requestButton).toBeEnabled();
    if ((page.viewportSize()?.width ?? 0) < 1040) {
      const bounds = await requestButton.boundingBox();
      expect(bounds).not.toBeNull();
      await page.mouse.click(
        bounds!.x + bounds!.width / 2,
        bounds!.y + bounds!.height / 2
      );
    } else await requestButton.click();
    const toast = page.getByRole('status');
    await expect(toast).toHaveClass(/show/);
    const toastBounds = await toast.boundingBox();
    expect(toastBounds).not.toBeNull();
    if ((page.viewportSize()?.width ?? 0) >= 1040) {
      const requestBounds = await requestButton.boundingBox();
      expect(requestBounds).not.toBeNull();
      expect(toastBounds!.y).toBeGreaterThanOrEqual(
        requestBounds!.y + requestBounds!.height
      );
    }
    const capture = process.env.LUMEN_TV_ERROR_CAPTURE;
    if (capture && testInfo.project.name === 'desktop')
      await page.screenshot({
        path: `${capture}-${locale}-desktop.png`,
        animations: 'disabled',
      });
    await expect(toast).toContainText(serverFailure);
  });
}

test('a fully requested series shows Requested and its request, not the request button @tv-request-visual', async ({
  page,
}, testInfo) => {
  await show(page, {
    id: 2074,
    status: 3,
    status4k: 1,
    downloadStatus: [],
    requests: [req([1, 2, 3])],
    seasons: [],
  });
  if (isBaseline) {
    await expect(page.locator('.rinfo')).toHaveCount(0);
    await expect(page.locator('.srow')).toHaveCount(3);
    await expect(page.locator('.srow.locked')).toHaveCount(0);
    await captureRequestState(page, testInfo, 'fully-requested');
    return;
  }
  await expect(
    page.getByRole('button', { name: 'Requested', exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: /^Request(?!ed)/ })
  ).toHaveCount(0);
  await expect(page.locator('.rinfo')).toContainText(
    'Approved · requested by alex · on'
  );
  await expect(page.locator('.rinfo')).toContainText('Entire series');
  const rows = page.locator('.srow');
  await expect(rows).toHaveCount(3);
  for (let i = 0; i < 3; i++) {
    await expect(rows.nth(i)).toHaveClass(/locked/);
    await expect(rows.nth(i)).toContainText('Requested');
  }
  await captureRequestState(page, testInfo, 'fully-requested');
});

test('TV detail request activity localizes selected season ranges', async ({
  page,
}) => {
  await show(
    page,
    {
      id: 2074,
      status: 3,
      status4k: 1,
      downloadStatus: [],
      requests: [req([1, 2])],
      seasons: [],
    },
    [],
    2,
    undefined,
    {},
    seasons,
    'fr'
  );
  await expect(page.locator('.rinfo')).toContainText('Saisons 1–2');
});

test('a partly requested series keeps the other seasons requestable @tv-request-visual', async ({
  page,
}, testInfo) => {
  const posts: RecordedPost[] = [];
  await show(
    page,
    {
      id: 2074,
      status: 3,
      downloadStatus: [],
      requests: [req([1])],
      seasons: [],
    },
    posts
  );
  if (isBaseline) {
    await expect(page.locator('.rinfo')).toHaveCount(0);
    await expect(page.locator('.srow')).toHaveCount(3);
    await expect(page.locator('.srow.locked')).toHaveCount(0);
    await captureRequestState(page, testInfo, 'partly-requested');
    return;
  }
  await expect(page.locator('.rinfo')).toContainText('Season 1');
  await expect(page.getByText('1 season requested')).toBeVisible();
  const rows = page.locator('.srow');
  await expect(rows.nth(0)).toHaveClass(/locked/);
  await expect(rows.nth(1)).not.toHaveClass(/locked/);
  await captureRequestState(page, testInfo, 'partly-requested');
  await page.getByRole('button', { name: 'All missing (2)' }).click();
  await expect(rows.nth(1)).toHaveAttribute('aria-checked', 'true');
  await expect(
    page.getByRole('button', { name: 'Request 2 more seasons' })
  ).toBeEnabled();
  expect(posts).toEqual([]);
});

// release-note: none
test('a large series selects all fifteen seasons and submits the whole-series request', async ({
  page,
}, testInfo) => {
  const posts: RecordedPost[] = [];
  const largeSeriesSeasons = Array.from({ length: 15 }, (_, index) => ({
    seasonNumber: index + 1,
    episodeCount: 20,
    name: `Season ${index + 1}`,
  }));
  await show(
    page,
    { status: 1, seasons: [], requests: [] },
    posts,
    2,
    undefined,
    {},
    largeSeriesSeasons
  );
  await page.goto(appPath('/tv/84773#season-15'));
  const rows = page.locator('.srow');
  await expect(rows).toHaveCount(15);
  await expect(rows.nth(14)).toHaveAttribute('id', 'season-15');
  await rows.nth(14).scrollIntoViewIfNeeded();
  if (isBaseline) {
    await page
      .locator('.shortcuts')
      .getByRole('button', { name: 'Select entire series', exact: true })
      .evaluate((button) => {
        button.textContent = 'Request entire series';
      });
  }
  await page
    .locator('.shortcuts')
    .getByRole('button', {
      name: isBaseline ? 'Request entire series' : 'Select entire series',
      exact: true,
    })
    .click();
  for (let index = 0; index < 15; index++)
    await expect(rows.nth(index)).toHaveAttribute('aria-checked', 'true');
  await captureRequestState(page, testInfo, 'large-series-selected');
  const request = page.locator('button.btn-primary:visible').first();
  await expect(request).toHaveText('Request entire series');
  await expect(request).toBeEnabled();
  await request.click();
  await expect.poll(() => posts.length).toBe(1);
  expect(posts).toEqual([
    {
      path: '/request',
      body: {
        mediaType: 'tv',
        mediaId: 84773,
        seasons: 'all',
        monitorFutureSeasons: true,
      },
    },
  ]);
});

test('a partial season with a live request stays locked and keeps playback available', async ({
  page,
}) => {
  const posts: RecordedPost[] = [];
  await show(
    page,
    {
      id: 2074,
      status: 4,
      mediaUrl:
        'https://app.plex.tv/desktop#!/server/x/details?key=%2Flibrary%2Fmetadata%2F1',
      downloadStatus: [],
      requests: [req([1])],
      seasons: [{ seasonNumber: 1, status: 4 }],
    },
    posts
  );
  const rows = page.locator('.srow');
  await expect(rows.nth(0)).toHaveClass(/locked/);
  await expect(rows.nth(0)).toHaveAttribute('aria-disabled', 'true');
  await expect(rows.nth(0)).toContainText('Partly on Plex · Requested');
  await expect(rows.nth(1)).not.toHaveClass(/locked/);
  await expect(page.getByRole('link', { name: /Watch on Plex/ })).toBeVisible();
  await page.getByRole('button', { name: 'All missing (2)' }).click();
  await expect(rows.nth(0)).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('button', { name: 'Request 2 more seasons' }).click();
  await expect.poll(() => posts.length).toBe(1);
  expect(posts).toEqual([
    {
      path: '/request',
      body: {
        mediaType: 'tv',
        mediaId: 84773,
        seasons: [2, 3],
        monitorFutureSeasons: true,
      },
    },
  ]);
});

test('future season monitoring can be disabled for a series request', async ({
  page,
}) => {
  const posts: RecordedPost[] = [];
  await show(page, { status: 1, requests: [], seasons: [] }, posts);
  const setting = page.getByRole('checkbox', {
    name: 'Get new seasons automatically',
  });
  await expect(setting).toBeChecked();
  await setting.uncheck();
  await page.getByRole('button', { name: 'Request entire series' }).click();
  await expect.poll(() => posts.length).toBe(1);
  expect(posts[0]?.body).toMatchObject({ monitorFutureSeasons: false });
});

test('future season monitoring is disabled when the TV season gate is active', async ({
  page,
}) => {
  await show(page, { status: 1, requests: [], seasons: [] }, [], 2, undefined, {
    tvSeasonWatchGateEnabled: true,
  });
  const setting = page.getByRole('checkbox', {
    name: 'Get new seasons automatically',
  });
  await expect(setting).toBeDisabled();
  await expect(setting).not.toBeChecked();
});

test('future season monitoring stays off when the requester uses Episode Queue', async ({
  page,
}) => {
  const posts: RecordedPost[] = [];
  await show(page, { status: 1, requests: [], seasons: [] }, posts);
  await page.route('**/api/v1/user/1/settings/episode-queue', (route) =>
    route.fulfill({ json: { status: 'approved', defaultEpisodeCount: 2 } })
  );
  await page.reload();
  const setting = page.getByRole('checkbox', {
    name: 'Get new seasons automatically',
  });
  await expect(setting).toBeDisabled();
  await expect(setting).not.toBeChecked();
  await page.getByRole('button', { name: 'Request entire series' }).click();
  await expect.poll(() => posts.length).toBe(1);
  expect(posts[0]?.body).toMatchObject({ monitorFutureSeasons: false });
});

test('a 4K request does not lock standard seasons', async ({ page }) => {
  await show(page, {
    id: 2074,
    status: 3,
    downloadStatus: [],
    requests: [req([1], 2, true)],
    seasons: [],
  });
  await expect(page.locator('.rinfo')).toHaveCount(0);
  await expect(page.locator('.srow').first()).not.toHaveClass(/locked/);
});

test('a redacted foreign request uses a non-identifying requester label', async ({
  page,
}) => {
  const foreign = req([1]);
  delete (foreign as { requestedBy?: unknown }).requestedBy;
  await show(
    page,
    { id: 2074, status: 3, requests: [foreign], seasons: [] },
    [],
    32
  );
  await expect(page.locator('.rinfo')).toContainText('requested by someone');
});

test('a fully available series says so and offers no request', async ({
  page,
}) => {
  await show(page, {
    id: 2074,
    status: 5,
    mediaUrl:
      'https://app.plex.tv/desktop#!/server/x/details?key=%2Flibrary%2Fmetadata%2F1',
    downloadStatus: [],
    requests: [],
    seasons: [1, 2, 3].map((n) => ({ seasonNumber: n, status: 5 })),
  });
  await expect(page.getByRole('link', { name: /Watch on Plex/ })).toBeVisible();
  await expect(
    page.getByRole('button', { name: /^Request(?!ed)/ })
  ).toHaveCount(0);
  await expect(page.locator('.srow').first()).toContainText('On Plex');
  await expect(page.locator('.rinfo')).toHaveCount(0);
});

test('Sonarr language, season order, and tags follow the selected destination', async ({
  page,
}, info) => {
  const posts: RecordedPost[] = [];
  const managerReads: string[] = [];
  page.on('request', (request) => {
    const { pathname } = new URL(request.url());
    if (pathname === '/api/v1/request/count' || pathname === '/api/v1/user')
      managerReads.push(pathname);
  });
  await show(page, { status: 1 }, posts, 32 | 8192);
  await page.route('**/api/v1/service/sonarr', (route) =>
    route.fulfill({
      json: [
        { id: 1, name: 'Sonarr v3', isDefault: true, is4k: false },
        { id: 2, name: 'Sonarr v5', isDefault: false, is4k: false },
      ],
    })
  );
  await page.route('**/api/v1/service/sonarr/*', (route) => {
    const legacy = route.request().url().endsWith('/1');
    return route.fulfill({
      json: {
        server: {
          activeProfileId: 1,
          activeDirectory: '/shows',
          activeLanguageProfileId: legacy ? 8 : undefined,
          activeTags: [legacy ? 17 : 23],
        },
        profiles: [{ id: 1, name: 'HD' }],
        rootFolders: [{ id: 1, path: '/shows' }],
        languageProfiles: legacy
          ? [
              { id: 8, name: 'English' },
              { id: 9, name: 'French' },
            ]
          : null,
        metadataLanguages: legacy ? [] : [{ id: 4, name: 'French' }],
        tags: legacy
          ? [{ id: 17, label: 'Legacy Shows' }]
          : [{ id: 23, label: 'New Shows' }],
      },
    });
  });
  await page.route('**/api/v1/service/sonarr/lookup/**', (route) => {
    const { searchParams } = new URL(route.request().url());
    const alternate =
      searchParams.get('serverId') === '2' &&
      searchParams.get('language') === '4';
    expect(searchParams.get('is4k')).toBe('false');
    return route.fulfill({
      json: [
        { tvdbId: 79, seasonTypes: [{ type: 'wrong', name: 'Wrong Series' }] },
        {
          tvdbId: 80,
          seasonTypes: [
            { type: 'aired', name: 'Aired' },
            alternate
              ? { type: 'dvd', name: 'DVD' }
              : { type: 'absolute', name: 'Absolute' },
          ],
        },
      ],
    });
  });
  await page.getByText('Advanced Request Options', { exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Request as' })).toHaveCount(
    0
  );
  const profile = page.getByRole('combobox', { name: 'Language Profile' });
  await expect(profile).toHaveValue('8');
  await profile.selectOption('9');
  const order = page.getByRole('combobox', { name: 'Season Order' });
  await order.selectOption('absolute');
  await expect(order.getByRole('option', { name: 'Wrong Series' })).toHaveCount(
    0
  );
  const tags = page.getByRole('group', { name: 'Request Tags' });
  await expect(
    tags.getByRole('checkbox', { name: 'Legacy Shows' })
  ).toBeChecked();
  await tags.getByRole('checkbox', { name: 'Legacy Shows' }).uncheck();
  await profile.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: info.outputPath('sonarr-language-profile.png'),
  });
  await page
    .getByRole('combobox', { name: 'Server', exact: true })
    .selectOption('2');
  await expect(profile).toHaveCount(0);
  const metadata = page.getByRole('combobox', { name: 'Metadata Language' });
  await metadata.selectOption('4');
  await expect(order.getByRole('option', { name: 'DVD (dvd)' })).toHaveCount(1);
  await expect(order).toHaveValue('');
  await order.selectOption('dvd');
  await order.scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('sonarr-season-order.png') });
  await expect(
    tags.getByRole('checkbox', { name: 'Legacy Shows' })
  ).toHaveCount(0);
  const newTag = tags.getByRole('checkbox', { name: 'New Shows' });
  await expect(newTag).toBeChecked();
  await newTag.uncheck();
  await newTag.scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('sonarr-request-tags.png') });
  await metadata.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: info.outputPath('sonarr-metadata-language.png'),
  });
  const request = page.getByRole('button', { name: /^Request (entire|\d)/ });
  if (!(await request.count()))
    await page.getByText('Season 1', { exact: true }).click();
  await request.click();
  await expect.poll(() => posts.length).toBe(1);
  expect(posts).toEqual([
    {
      path: '/request',
      body: expect.objectContaining({
        mediaType: 'tv',
        serverId: 2,
        metadataLanguageId: 4,
        sonarrSeasonType: 'dvd',
        tags: [],
        requesterSelectedOptions: {
          tags: true,
          profile: true,
          rootFolder: true,
          languageProfile: false,
        },
      }),
    },
  ]);
  expect(posts[0].body).not.toHaveProperty('languageProfileId');
  await page.goto(appPath('/me'));
  const preference = page.getByRole('switch', {
    name: /Choose server and folder on quick requests/,
  });
  await expect(preference).toBeVisible();
  await preference.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: info.outputPath('advanced-request-preference.png'),
  });
  expect(managerReads).toEqual([]);
});

test('requesters can ask for approval for TV seasons over quota', async ({
  page,
}, info) => {
  const posts: RecordedPost[] = [];
  await show(page, { status: 1 }, posts, 32, {
    limit: 2,
    remaining: 1,
    restricted: false,
  });
  await expect(
    page.getByRole('checkbox', { name: 'Get new seasons automatically' })
  ).toBeChecked();
  const approval = page.getByRole('button', {
    name: 'Request Approval',
    exact: true,
  });
  await expect(approval).toBeVisible();
  await approval.scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('tv-quota-approval.png') });
  await approval.click();
  await expect(
    page.getByText('Approval requested for The Rings of Power')
  ).toBeVisible();
  expect(posts).toEqual([
    {
      path: '/request',
      body: {
        mediaType: 'tv',
        mediaId: 84773,
        seasons: 'all',
        monitorFutureSeasons: true,
        requestQuotaApproval: true,
      },
    },
  ]);
});

test('TV detail can request missing episodes from a partly requested season', async ({
  page,
}, info) => {
  const posts: RecordedPost[] = [];
  await show(
    page,
    {
      requests: [
        { ...req([1]), seasons: [{ seasonNumber: 1, episodeNumbers: [2] }] },
      ],
    },
    posts,
    32,
    undefined,
    { partialRequestsEnabled: true }
  );
  await page.route('**/api/v1/tv/84773/seasons?*', (route) =>
    route.fulfill({
      json: new URL(route.request().url()).searchParams
        .get('seasonNumbers')!
        .split(',')
        .map(Number)
        .map((seasonNumber) => ({
          seasonNumber,
          episodes:
            seasonNumber === 1
              ? [
                  {
                    episodeNumber: 1,
                    name: 'Owned',
                    availabilitySources: [{ hd: true, fourK: false }],
                  },
                  { episodeNumber: 2, name: 'Pending' },
                  { episodeNumber: 3, name: 'Missing' },
                ]
              : [],
        })),
    })
  );
  await page.route('**/api/v1/request', (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    posts.push({ path: '/request', body: route.request().postDataJSON() });
    if (posts.length === 2)
      return route.fulfill({
        status: 403,
        json: {
          code: 'STREAMING_REQUEST_POLICY_REJECTED',
          allowOverride: true,
          message: 'This episode is available on your streaming service.',
        },
      });
    return route.fulfill(
      posts.length === 1
        ? { status: 202, json: { message: 'No episodes available.' } }
        : { status: 201, json: { id: 44 } }
    );
  });
  const action = page.getByRole('button', {
    name: 'Request Episodes',
    exact: true,
  });
  await action.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: info.outputPath('tv-episodes-entry.png'),
    animations: 'disabled',
  });
  await action.click();
  const sheet = page.getByRole('dialog', { name: 'Request Episodes' });
  await sheet.getByText('Season 1', { exact: true }).click();
  await expect(
    sheet.getByRole('checkbox', { name: /E1 Owned/ })
  ).toBeDisabled();
  await expect(
    sheet.getByRole('checkbox', { name: /E2 Pending/ })
  ).toBeDisabled();
  await sheet
    .getByRole('checkbox', { name: 'E3 Missing', exact: true })
    .check();
  await page.screenshot({
    path: info.outputPath('tv-episode-request.png'),
    animations: 'disabled',
  });
  await sheet.getByRole('button', { name: 'Request Selected Items' }).click();
  await expect(sheet.getByRole('alert')).toHaveText(
    /No selected episodes were added/
  );
  await expect(
    sheet.getByRole('checkbox', { name: 'E3 Missing', exact: true })
  ).toBeChecked();
  await page.screenshot({
    path: info.outputPath('tv-episode-request-unconfirmed.png'),
    animations: 'disabled',
  });
  await sheet.getByRole('button', { name: 'Request Selected Items' }).click();
  await expect(sheet.getByRole('alert')).toHaveText(
    'This episode is available on your streaming service.'
  );
  await expect(sheet.getByRole('button', { name: 'Close' })).toBeFocused();
  expect(posts).toHaveLength(2);
  await sheet.getByRole('button', { name: 'Request Anyway' }).click();
  await expect(
    page.getByText('Episodes requested for The Rings of Power')
  ).toBeVisible();
  expect(posts).toHaveLength(3);
  expect(posts[0]).toEqual(posts[1]);
  expect(posts.slice(2)).toEqual([
    {
      path: '/request',
      body: {
        mediaType: 'tv',
        mediaId: 84773,
        is4k: false,
        monitorFutureSeasons: true,
        seasons: [1],
        seasonRequests: [{ seasonNumber: 1, episodeNumbers: [3] }],
        bypassStreamingRequestPolicy: true,
      },
    },
  ]);
});

test('large-series episode metadata uses small bounded batches and preserves deep-linked selection on retry', async ({
  page,
}, info) => {
  const posts: RecordedPost[] = [];
  const largeSeriesSeasons = Array.from({ length: 15 }, (_, index) => ({
    seasonNumber: index + 1,
    episodeCount: 20,
    name: `Season ${index + 1}`,
  }));
  await show(
    page,
    {},
    posts,
    32,
    undefined,
    { partialRequestsEnabled: true },
    largeSeriesSeasons
  );
  await page.goto(appPath('/tv/84773?episode=3#season-15'));
  const batchQueries: string[] = [];
  let retrying = false;
  await page.route('**/api/v1/tv/84773/seasons?*', (route) => {
    const requested =
      new URL(route.request().url()).searchParams.get('seasonNumbers') ?? '';
    batchQueries.push(requested);
    return route.fulfill({
      json: requested
        .split(',')
        .map(Number)
        .filter((seasonNumber) => retrying || seasonNumber !== 15)
        .map((seasonNumber) => ({
          seasonNumber,
          episodes:
            seasonNumber === 15
              ? [
                  { episodeNumber: 1, name: 'First episode' },
                  { episodeNumber: 3, name: 'Deep-linked episode' },
                ]
              : [],
        })),
    });
  });
  const open = page.getByRole('button', {
    name: 'Request Episodes',
    exact: true,
  });
  await open.click();
  const sheet = page.getByRole('dialog', { name: 'Request Episodes' });
  await expect(
    sheet.getByRole('heading', { name: 'The Rings of Power', exact: true })
  ).toBeVisible();
  await expect(
    sheet.getByText('2022 · 15 seasons', { exact: true })
  ).toBeVisible();
  await expect(sheet.locator('.pk-head img')).toHaveAttribute(
    'src',
    '/imageproxy/tmdb/t/p/w342/rings-poster.jpg'
  );
  await expect(sheet.getByText('Could not load episodes')).toBeVisible();
  expect(batchQueries).toEqual([
    '1,2,3,4,5',
    '6,7,8,9,10',
    '11,12,13,14,15',
    '15',
  ]);
  const initialBatchCount = batchQueries.length;
  retrying = true;
  await sheet.getByRole('button', { name: 'Retry' }).click();
  await expect(
    sheet.getByRole('button', { name: 'Request Selected Items' })
  ).toBeEnabled();
  await sheet.getByText('Season 1', { exact: true }).click();
  const selectedEpisode = sheet.getByRole('checkbox', {
    name: 'E3 Deep-linked episode',
    exact: true,
  });
  await expect(selectedEpisode).toBeChecked();
  expect(batchQueries.slice(initialBatchCount)).toEqual(['15']);
  if (['desktop', 'iphone'].includes(info.project.name))
    await page.screenshot({
      path: info.outputPath(`tv-request-context-${info.project.name}.png`),
      fullPage: false,
    });
  await sheet.getByRole('button', { name: 'Request Selected Items' }).click();
  await expect(
    page.getByText('Episodes requested for The Rings of Power')
  ).toBeVisible();
  expect(posts).toEqual([
    {
      path: '/request',
      body: {
        mediaType: 'tv',
        mediaId: 84773,
        is4k: false,
        monitorFutureSeasons: true,
        seasons: [15],
        seasonRequests: [{ seasonNumber: 15, episodeNumbers: [3] }],
      },
    },
  ]);
});

test('requests a full season when every episode metadata batch fails', async ({
  page,
}, info) => {
  const posts: RecordedPost[] = [];
  const largeSeriesSeasons = Array.from({ length: 12 }, (_, index) => ({
    seasonNumber: index + 1,
    episodeCount: 20,
    name: `Season ${index + 1}`,
  }));
  await show(
    page,
    {},
    posts,
    32,
    undefined,
    { partialRequestsEnabled: true },
    largeSeriesSeasons
  );
  await page.goto(appPath('/tv/84773'));
  const batchQueries: string[] = [];
  await page.route('**/api/v1/tv/84773/seasons?*', async (route) => {
    batchQueries.push(
      new URL(route.request().url()).searchParams.get('seasonNumbers') ?? ''
    );
    await route.fulfill({ status: 503, body: 'provider unavailable' });
  });
  await page
    .getByRole('button', { name: 'Request Episodes', exact: true })
    .click();
  const sheet = page.getByRole('dialog', { name: 'Request Episodes' });
  await expect(sheet.getByText('Could not load episodes')).toBeVisible();
  await expect(
    sheet.getByText('Request full seasons without episode details')
  ).toBeVisible();
  expect(batchQueries).toEqual([
    '1,2,3,4,5',
    '1,2,3,4,5',
    '6,7,8,9,10',
    '6,7,8,9,10',
    '11,12',
    '11,12',
  ]);
  const seasonChoice = sheet.getByRole('checkbox', {
    name: 'Season 1 20 episodes',
    exact: true,
  });
  await seasonChoice.check();
  await expect(
    sheet.getByRole('button', { name: 'Request Selected Items' })
  ).toBeEnabled();
  if (['desktop', 'iphone'].includes(info.project.name))
    await page.screenshot({
      path: info.outputPath(
        `tv-request-full-season-fallback-${info.project.name}.png`
      ),
      fullPage: false,
    });
  await sheet.getByRole('button', { name: 'Request Selected Items' }).click();
  await expect(
    page.getByText('Episodes requested for The Rings of Power')
  ).toBeVisible();
  expect(posts).toEqual([
    {
      path: '/request',
      body: {
        mediaType: 'tv',
        mediaId: 84773,
        is4k: false,
        monitorFutureSeasons: true,
        seasons: [1],
        seasonRequests: [{ seasonNumber: 1 }],
      },
    },
  ]);
});

test('loaded episodes remain selectable while the final large-series batch is pending', async ({
  page,
}) => {
  const posts: RecordedPost[] = [];
  const largeSeriesSeasons = Array.from({ length: 15 }, (_, index) => ({
    seasonNumber: index + 1,
    episodeCount: 20,
    name: `Season ${index + 1}`,
  }));
  const batchQueries: string[] = [];
  const baselineCapture = process.env.LUMEN_TV_BATCH_BASELINE_CAPTURE === '1';
  const allSeasons = Array.from({ length: 15 }, (_, index) => index + 1).join(
    ','
  );
  const pendingBatch = baselineCapture ? allSeasons : '11,12,13,14,15';
  let releaseLastBatch!: () => void;
  let lastBatchStarted = false;
  const lastBatchGate = new Promise<void>((resolve) => {
    releaseLastBatch = resolve;
  });
  await show(
    page,
    {},
    posts,
    32,
    undefined,
    { partialRequestsEnabled: true },
    largeSeriesSeasons
  );
  await page.route('**/api/v1/tv/84773/seasons?*', async (route) => {
    const requested =
      new URL(route.request().url()).searchParams.get('seasonNumbers') ?? '';
    batchQueries.push(requested);
    const numbers = requested.split(',').map(Number);
    if (requested === pendingBatch) {
      lastBatchStarted = true;
      await lastBatchGate;
    }
    return route.fulfill({
      json: numbers
        .filter((seasonNumber) => seasonNumber !== 15)
        .map((seasonNumber) => ({
          seasonNumber,
          episodes: [
            { episodeNumber: 1, name: `Loaded Season ${seasonNumber}` },
          ],
        })),
    });
  });

  await page
    .getByRole('button', { name: 'Request Episodes', exact: true })
    .click();
  const sheet = page.getByRole('dialog', { name: 'Request Episodes' });
  await expect.poll(() => lastBatchStarted).toBe(true);
  await expect(sheet.getByText('Loading episodes…')).toBeVisible();
  await expect
    .poll(() => batchQueries)
    .toEqual(
      baselineCapture
        ? [allSeasons]
        : ['1,2,3,4,5', '6,7,8,9,10', '11,12,13,14,15']
    );
  if (baselineCapture) {
    await expect(sheet.getByRole('checkbox')).toHaveCount(0);
  } else {
    await sheet.getByText('Season 1', { exact: true }).click();
    const episode = sheet.getByRole('checkbox', {
      name: 'E1 Loaded Season 1',
      exact: true,
    });
    await expect(episode).toBeEnabled();
    await episode.check();
    await expect(sheet.getByText('Selected: 1')).toBeVisible();
    await expect(
      sheet.getByRole('button', { name: 'Request Selected Items' })
    ).toBeDisabled();
  }
  const capture = process.env.LUMEN_TV_BATCH_CAPTURE;
  if (capture) {
    await sheet.evaluate((element) => element.scrollTo({ top: 0 }));
    await page.waitForTimeout(400);
    await mkdir(dirname(capture), { recursive: true });
    await page.screenshot({
      path: join(
        dirname(capture),
        `${basename(capture, '.png')}-${test.info().project.name}.png`
      ),
      fullPage: false,
    });
  }

  releaseLastBatch();
  await expect(sheet.getByRole('alert')).toContainText(
    'Episodes from loaded seasons are still shown'
  );
  if (baselineCapture) {
    await sheet.getByText('Season 1', { exact: true }).click();
    await sheet
      .getByRole('checkbox', { name: 'E1 Loaded Season 1', exact: true })
      .check();
    await expect(sheet.getByText('Selected: 1')).toBeVisible();
  }
  await expect(
    sheet.getByRole('button', { name: 'Request Selected Items' })
  ).toBeEnabled();
  await sheet.getByRole('button', { name: 'Request Selected Items' }).click();
  await expect.poll(() => posts.length).toBe(1);
  expect(posts[0].body).toMatchObject({
    seasons: [1],
    seasonRequests: [{ seasonNumber: 1, episodeNumbers: [1] }],
  });
});

test('partial large-series metadata still permits exact requests from loaded seasons', async ({
  page,
}, info) => {
  const posts: RecordedPost[] = [];
  const largeSeriesSeasons = Array.from({ length: 15 }, (_, index) => ({
    seasonNumber: index + 1,
    episodeCount: 20,
    name: `Season ${index + 1}`,
  }));
  const batchQueries: string[] = [];
  await show(
    page,
    {},
    posts,
    32,
    undefined,
    { partialRequestsEnabled: true },
    largeSeriesSeasons
  );
  await page.route('**/api/v1/tv/84773/seasons?*', (route) => {
    const requested =
      new URL(route.request().url()).searchParams.get('seasonNumbers') ?? '';
    batchQueries.push(requested);
    return route.fulfill({
      json: requested
        .split(',')
        .map(Number)
        .filter((seasonNumber) => seasonNumber !== 15)
        .map((seasonNumber) => ({
          seasonNumber,
          episodes: [
            {
              episodeNumber: 1,
              name: `Loaded Season ${seasonNumber} Episode`,
            },
          ],
        })),
    });
  });
  await page
    .getByRole('button', { name: 'Request Episodes', exact: true })
    .click();
  const sheet = page.getByRole('dialog', { name: 'Request Episodes' });
  await expect(sheet.getByRole('alert')).toContainText(
    'Episodes from loaded seasons are still shown'
  );
  await sheet.getByText('Season 14', { exact: true }).click();
  const loadedEpisode = sheet.getByRole('checkbox', {
    name: 'E1 Loaded Season 14 Episode',
    exact: true,
  });
  await expect(loadedEpisode).toBeEnabled();
  await loadedEpisode.check();
  const submit = sheet.getByRole('button', {
    name: 'Request Selected Items',
    exact: true,
  });
  await expect(submit).toBeEnabled();
  if (process.env.LUMEN_TV_PARTIAL_CAPTURE) {
    await page.screenshot({
      path: `${process.env.LUMEN_TV_PARTIAL_CAPTURE}-${info.project.name}.png`,
      fullPage: true,
    });
  }
  expect(batchQueries).toEqual([
    '1,2,3,4,5',
    '6,7,8,9,10',
    '11,12,13,14,15',
    '15',
  ]);
  await submit.click();
  await expect.poll(() => posts.length).toBe(1);
  expect(posts).toEqual([
    {
      path: '/request',
      body: {
        mediaType: 'tv',
        mediaId: 84773,
        is4k: false,
        monitorFutureSeasons: true,
        seasons: [14],
        seasonRequests: [{ seasonNumber: 14, episodeNumbers: [1] }],
      },
    },
  ]);
});

test('the episode picker submits selections from multiple seasons together', async ({
  page,
}) => {
  const posts: RecordedPost[] = [];
  await show(
    page,
    {},
    posts,
    32,
    undefined,
    { partialRequestsEnabled: true },
    seasons.filter(({ seasonNumber }) => seasonNumber > 0).slice(0, 2)
  );
  await page.route('**/api/v1/tv/84773/seasons?*', (route) => {
    const seasonNumbers = new URL(route.request().url()).searchParams
      .get('seasonNumbers')!
      .split(',')
      .map(Number);
    return route.fulfill({
      json: seasonNumbers.map((seasonNumber) => ({
        seasonNumber,
        episodes: [
          {
            episodeNumber: seasonNumber,
            name: `Season ${seasonNumber} episode`,
          },
        ],
      })),
    });
  });
  await page
    .getByRole('button', { name: 'Request Episodes', exact: true })
    .click();
  const sheet = page.getByRole('dialog', { name: 'Request Episodes' });
  await sheet.getByText('Season 1', { exact: true }).click();
  await sheet.getByRole('checkbox', { name: 'E1 Season 1 episode' }).check();
  await sheet.getByText('Season 2', { exact: true }).click();
  await sheet.getByRole('checkbox', { name: 'E2 Season 2 episode' }).check();
  await sheet.getByRole('button', { name: 'Collapse All' }).click();
  await expect(
    sheet.getByRole('checkbox', { name: 'E1 Season 1 episode' })
  ).toBeHidden();
  await expect(sheet.getByText('Selected: 2')).toBeVisible();
  await sheet.getByRole('button', { name: 'Expand All' }).click();
  await expect(
    sheet.getByRole('checkbox', { name: 'E1 Season 1 episode' })
  ).toBeVisible();
  await sheet.getByRole('button', { name: 'Clear Selection' }).click();
  await expect(sheet.getByText('Selected: 0')).toBeVisible();
  await expect(
    sheet.getByRole('button', { name: 'Request Selected Items' })
  ).toBeDisabled();
  await sheet.getByRole('checkbox', { name: 'E1 Season 1 episode' }).check();
  await sheet.getByRole('checkbox', { name: 'E2 Season 2 episode' }).check();
  await expect(
    sheet.getByRole('button', { name: 'Request Selected Items' })
  ).toBeEnabled();
  await sheet.getByRole('button', { name: 'Request Selected Items' }).click();
  await expect(
    page.getByText('Episodes requested for The Rings of Power')
  ).toBeVisible();
  expect(posts).toEqual([
    {
      path: '/request',
      body: {
        mediaType: 'tv',
        mediaId: 84773,
        is4k: false,
        monitorFutureSeasons: true,
        seasons: [1, 2],
        seasonRequests: [
          { seasonNumber: 1, episodeNumbers: [1] },
          { seasonNumber: 2, episodeNumbers: [2] },
        ],
      },
    },
  ]);
});

test('an unconfirmed season request keeps the selection without a success message', async ({
  page,
}, info) => {
  const posts: RecordedPost[] = [];
  await show(page, { status: 1 }, posts);
  await page.route('**/api/v1/request', (route) =>
    route.fulfill({ status: 202, json: { message: 'No seasons available.' } })
  );
  const request = page.getByRole('button', {
    name: 'Request entire series',
    exact: true,
  });
  await request.click();
  await expect(
    page.getByText('No selected seasons were added.', { exact: true })
  ).toBeVisible();
  await expect(
    page.getByText(/Request submitted for The Rings of Power/)
  ).toHaveCount(0);
  await expect(request).toBeEnabled();
  await page.screenshot({
    path: info.outputPath('series-request-unconfirmed.png'),
    animations: 'disabled',
  });
});

test('a permitted streaming override retries only the selected seasons', async ({
  page,
}) => {
  await show(page, { status: 2, requests: [req([1])], seasons: [] });
  await expect(
    page.getByRole('checkbox', { name: 'Get new seasons automatically' })
  ).toBeChecked();
  const submissions: unknown[] = [];
  await page.route('**/api/v1/request', (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    const body = route.request().postDataJSON();
    submissions.push(body);
    if (body.bypassStreamingRequestPolicy === true)
      return route.fulfill({
        json: { id: 45, seasons: [{ seasonNumber: 2 }] },
      });
    return route.fulfill({
      status: 403,
      json: {
        code: 'STREAMING_REQUEST_POLICY_REJECTED',
        allowOverride: true,
        message: 'This series is available on your streaming service.',
      },
    });
  });
  await page.getByRole('button', { name: 'All missing (2)' }).click();
  await page.getByText('Season 3', { exact: true }).click();
  await expect(
    page.getByRole('checkbox', { name: /Season 2/ })
  ).toHaveAttribute('aria-checked', 'true');
  await page
    .getByRole('button', { name: /^Request 1 (more )?season$/ })
    .click();
  const confirm = page.getByRole('alertdialog', {
    name: 'Streaming Request Policy',
  });
  await expect(
    confirm.getByText('This series is available on your streaming service.')
  ).toBeVisible();
  const original = {
    mediaType: 'tv',
    mediaId: 84773,
    seasons: [2],
    monitorFutureSeasons: true,
  };
  expect(submissions).toEqual([original]);
  await confirm.getByRole('button', { name: 'Request Anyway' }).click();
  await expect
    .poll(() => submissions)
    .toEqual([original, { ...original, bypassStreamingRequestPolicy: true }]);
  await expect(confirm).toHaveCount(0);
});

for (const scenario of ['eligible', 'owned season', 'owned episode']) {
  const expected = scenario === 'owned season' ? 1 : 2;
  test(`the episode picker respects the bookmark for an ${scenario}`, async ({
    page,
  }) => {
    await show(
      page,
      scenario === 'owned season'
        ? { seasons: [{ seasonNumber: 2, status: 5 }] }
        : {},
      [],
      32,
      undefined,
      { partialRequestsEnabled: true }
    );
    await page.route('**/api/v1/tv/84773/seasons?*', (route) =>
      route.fulfill({
        json: new URL(route.request().url()).searchParams
          .get('seasonNumbers')!
          .split(',')
          .map(Number)
          .map((seasonNumber) => ({
            seasonNumber,
            episodes:
              seasonNumber === expected
                ? [
                    {
                      episodeNumber: 3,
                      name: 'Bookmarked Episode',
                      sonarrAvailability: {
                        hd: scenario === 'owned episode',
                        fourK: false,
                      },
                    },
                  ]
                : [],
          })),
      })
    );
    await page.goto(appPath('/tv/84773?episode=3#season-2'));
    await page
      .getByRole('button', { name: 'Request Episodes', exact: true })
      .click();
    const sheet = page.getByRole('dialog', { name: 'Request Episodes' });
    await expect(
      sheet.getByText(`Season ${expected}`, { exact: true })
    ).toBeVisible();
    const episode = sheet.getByRole('checkbox', {
      name: /E3 Bookmarked Episode/,
    });
    if (!(await episode.isVisible()))
      await sheet.getByText(`Season ${expected}`, { exact: true }).click();
    if (scenario === 'eligible') await expect(episode).toBeChecked();
    else await expect(episode).not.toBeChecked();
    if (scenario === 'owned episode') {
      await expect(episode).toBeDisabled();
      await expect(
        sheet.getByRole('button', { name: 'Request Selected Items' })
      ).toBeDisabled();
    }
  });
}
