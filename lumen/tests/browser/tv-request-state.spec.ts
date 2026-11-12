import { expect, test, type Page, type TestInfo } from '@playwright/test';

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
  permissions = 2
) {
  await page.route('https://**/*', (r) => r.abort());
  await page.route('**/lumen-config.json', (r) => r.fulfill({ json: {} }));
  await page.route('**/seerr-classic/**', (r) => r.fulfill({ status: 404 }));
  await page.route('**/api/v1/**', (r) => {
    const path = new URL(r.request().url()).pathname.slice(7);
    if (r.request().method() !== 'GET')
      posts.push({ path, body: r.request().postDataJSON() });
    if (path === '/auth/me')
      return r.fulfill({
        json: { id: 1, displayName: 'alex', permissions },
      });
    if (path === '/settings/public') return r.fulfill({ json: {} });
    if (path === '/tv/84773')
      return r.fulfill({
        json: {
          id: 84773,
          name: 'The Rings of Power',
          overview: 'Rings.',
          genres: [],
          seasons,
          numberOfSeasons: 3,
          firstAirDate: '2022-09-01',
          mediaInfo,
        },
      });
    return r.fulfill({ json: { results: [] } });
  });
  await page.goto('/tv/84773');
}

test(
  'a fully requested series shows Requested and its request, not the request button @tv-request-visual',
  async ({ page }, testInfo) => {
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
  }
);

test(
  'a partly requested series keeps the other seasons requestable @tv-request-visual',
  async ({ page }, testInfo) => {
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
  }
);

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
      body: { mediaType: 'tv', mediaId: 2074, seasons: [2, 3] },
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
