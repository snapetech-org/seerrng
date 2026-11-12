import { expect, test, type Page } from '@playwright/test';

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
const req = (nums: number[], status = 2) => ({
  id: 444,
  status,
  is4k: false,
  createdAt: '2026-11-12T05:20:57.000Z',
  requestedBy: { id: 1, displayName: 'alex' },
  seasons: nums.map((n) => ({ seasonNumber: n, status })),
});

async function show(
  page: Page,
  mediaInfo: Record<string, unknown>,
  posts: string[] = []
) {
  await page.route('https://**/*', (r) => r.abort());
  await page.route('**/lumen-config.json', (r) => r.fulfill({ json: {} }));
  await page.route('**/seerr-classic/**', (r) => r.fulfill({ status: 404 }));
  await page.route('**/api/v1/**', (r) => {
    const path = new URL(r.request().url()).pathname.slice(7);
    if (r.request().method() !== 'GET') posts.push(path);
    if (path === '/auth/me')
      return r.fulfill({
        json: { id: 1, displayName: 'alex', permissions: 2 },
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

test('a fully requested series shows Requested and its request, not the request button', async ({
  page,
}) => {
  await show(page, {
    id: 2074,
    status: 3,
    status4k: 1,
    downloadStatus: [],
    requests: [req([1, 2, 3])],
    seasons: [],
  });
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
});

test('a partly requested series keeps the other seasons requestable', async ({
  page,
}) => {
  const posts: string[] = [];
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
  await expect(page.locator('.rinfo')).toContainText('Season 1');
  const rows = page.locator('.srow');
  await expect(rows.nth(0)).toHaveClass(/locked/);
  await expect(rows.nth(1)).not.toHaveClass(/locked/);
  await page.getByRole('button', { name: 'All missing (2)' }).click();
  await expect(rows.nth(1)).toHaveAttribute('aria-checked', 'true');
  await expect(
    page.getByRole('button', { name: 'Request 2 more seasons' })
  ).toBeEnabled();
  expect(posts).toEqual([]);
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
