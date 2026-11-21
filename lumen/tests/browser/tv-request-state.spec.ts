import { expect, test, type Page, type TestInfo } from '@playwright/test';

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
  seriesSeasons: typeof seasons = seasons
) {
  await page.route('https://**/*', (r) => r.abort());
  await page.route('**/lumen-config.json', (r) => r.fulfill({ json: {} }));
  await page.route('**/api/v1/**', (r) => {
    const path = apiPath(new URL(r.request().url()).pathname);
    if (r.request().method() !== 'GET')
      posts.push({ path, body: r.request().postDataJSON() });
    if (path === '/auth/me')
      return r.fulfill({
        json: { id: 1, displayName: 'alex', permissions },
      });
    if (path === '/settings/public') return r.fulfill({ json: settings });
    if (quota && path === '/user/1/quota')
      return r.fulfill({ json: { tv: quota } });
    if (path === '/request' && r.request().method() === 'POST')
      return r.fulfill({
        json: { id: 44, status: 1, quotaException: !!quota },
      });
    if (path === '/tv/84773')
      return r.fulfill({
        json: {
          id: 84773,
          name: 'The Rings of Power',
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
    return r.fulfill({ json: { results: [] } });
  });
  await page.goto(appPath('/tv/84773'));
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
    'Approved · requested by alex on'
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
      body: { mediaType: 'tv', mediaId: 84773, seasons: [2, 3] },
    },
  ]);
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
  await page.route('**/api/v1/tv/84773/season/1', (route) =>
    route.fulfill({
      json: {
        episodes: [
          {
            episodeNumber: 1,
            name: 'Owned',
            availabilitySources: [{ hd: true, fourK: false }],
          },
          { episodeNumber: 2, name: 'Pending' },
          { episodeNumber: 3, name: 'Missing' },
        ],
      },
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
  await sheet
    .getByRole('button', { name: 'Request Selected Episodes' })
    .click();
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
  await sheet
    .getByRole('button', { name: 'Request Selected Episodes' })
    .click();
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
        seasons: [1],
        seasonRequests: [{ seasonNumber: 1, episodeNumbers: [3] }],
        bypassStreamingRequestPolicy: true,
      },
    },
  ]);
});

test('large-series episode metadata can be retried without losing the deep-linked episode', async ({
  page,
}) => {
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
  let loads = 0;
  const loadedSeasons: string[] = [];
  await page.route('**/api/v1/tv/84773/season/*', (route) => {
    const seasonNumber = new URL(route.request().url()).pathname
      .split('/')
      .at(-1)!;
    loadedSeasons.push(seasonNumber);
    loads += 1;
    if (loads === 1)
      return route.fulfill({
        status: 503,
        json: { message: 'Temporary metadata failure' },
      });
    return route.fulfill({
      json: {
        episodes: [
          { episodeNumber: 1, name: 'First episode' },
          { episodeNumber: 3, name: 'Deep-linked episode' },
        ],
      },
    });
  });
  const open = page.getByRole('button', {
    name: 'Request Episodes',
    exact: true,
  });
  await open.click();
  const sheet = page.getByRole('dialog', { name: 'Request Episodes' });
  await expect(sheet.getByRole('combobox', { name: 'Season' })).toHaveValue(
    '15'
  );
  const retry = sheet.getByRole('button', { name: 'Retry' });
  await expect(retry).toBeVisible();
  await retry.click();
  const selectedEpisode = sheet.getByRole('checkbox', {
    name: 'E3 Deep-linked episode',
    exact: true,
  });
  await expect(selectedEpisode).toBeChecked();
  await expect(retry).toHaveCount(0);
  expect(loadedSeasons).toEqual(['15', '15']);
  await sheet
    .getByRole('button', { name: 'Request Selected Episodes' })
    .click();
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
        seasons: [15],
        seasonRequests: [{ seasonNumber: 15, episodeNumbers: [3] }],
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
  const original = { mediaType: 'tv', mediaId: 84773, seasons: [2] };
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
    await page.route(`**/api/v1/tv/84773/season/${expected}`, (route) =>
      route.fulfill({
        json: {
          episodes: [
            {
              episodeNumber: 3,
              name: 'Bookmarked Episode',
              sonarrAvailability: {
                hd: scenario === 'owned episode',
                fourK: false,
              },
            },
          ],
        },
      })
    );
    await page.goto(appPath('/tv/84773?episode=3#season-2'));
    await page
      .getByRole('button', { name: 'Request Episodes', exact: true })
      .click();
    const sheet = page.getByRole('dialog', { name: 'Request Episodes' });
    await expect(sheet.getByRole('combobox', { name: 'Season' })).toHaveValue(
      String(expected)
    );
    const episode = sheet.getByRole('checkbox', {
      name: /E3 Bookmarked Episode/,
    });
    if (scenario === 'eligible') await expect(episode).toBeChecked();
    else await expect(episode).not.toBeChecked();
    if (scenario === 'owned episode') {
      await expect(episode).toBeDisabled();
      await expect(
        sheet.getByRole('button', { name: 'Request Selected Episodes' })
      ).toBeDisabled();
    }
  });
}
