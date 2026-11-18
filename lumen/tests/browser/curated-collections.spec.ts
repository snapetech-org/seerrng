import { expect, test } from '@playwright/test';

test('series and album details reach their curated collections', async ({
  page,
}, info) => {
  const album = '62a8e15d-a5f1-4213-a794-e10e0150e945';
  const seriesReads: string[] = [];
  let checks = 0;
  const requests: unknown[] = [];
  const tvRequests: unknown[] = [];
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname.slice(7);
    if (path === '/request') {
      expect(route.request().method()).toBe('POST');
      tvRequests.push(route.request().postDataJSON());
      return route.fulfill({ json: { id: 2 } });
    }
    if (path === '/request/bulk') {
      expect(route.request().method()).toBe('POST');
      requests.push(route.request().postDataJSON());
      return route.fulfill({
        status: 207,
        json: { created: [{ id: 1 }], skipped: [], failed: [] },
      });
    }
    const entries: Record<string, unknown> = {
      '/service/lidarr': [
        { id: 1, name: 'MP3', musicQuality: 'mp3', isDefault: true },
        { id: 2, name: 'Lossless' },
      ],
      '/auth/me': { id: 1, permissions: 32 },
      '/settings/public': {
        musicEnabled: true,
        partialRequestsEnabled: true,
        mediaServerType: 1,
        enabledMediaCategories: { music: true },
      },
      '/user/1/quota': { tv: { limit: 2, remaining: 2, restricted: false } },
      '/tv/42': {
        id: 42,
        name: 'Fixture Series',
        status: 'Ended',
        originalLanguage: 'en',
        externalIds: { tvdbId: 200 },
        seasons: [
          { seasonNumber: 0, episodeCount: 1 },
          { seasonNumber: 1, episodeCount: 3 },
          { seasonNumber: 2, episodeCount: 2 },
        ],
        genres: [],
        mediaInfo: {
          id: 62,
          requests: [
            {
              id: 3,
              status: 2,
              seasons: [{ seasonNumber: 1, episodeNumbers: [2] }],
            },
          ],
          seasons: [{ seasonNumber: 2, status: 5 }],
        },
      },
      '/playback/media/62': { groups: [{ index: 1, items: [{ index: 1 }] }] },
      '/collection-catalog/tv/for-series/42': {
        collections: [{ id: 19, name: 'Fixture Series Collection' }],
      },
      '/collection-catalog/tv/19': {
        id: '19',
        name: 'Fixture Series Collection',
        parts: [
          {
            id: '42',
            title: 'Fixture Series',
            releaseDate: '2024-09-07',
          },
        ],
      },
      [`/music/${album}`]: {
        id: album,
        title: 'Fixture Album',
        artist: { id: 'artist-42', name: 'Fixture Artist' },
        tracks: [],
      },
      '/collection-catalog/music/artist-42': {
        id: 'artist-42',
        name: 'Fixture Discography',
        parts: [
          {
            id: album,
            title: 'Fixture Album',
            availableQualities: ['FLAC'],
            primaryType: 'Album',
            releaseDate: '2020-02-22',
            genres: ['Rock'],
          },
          {
            id: 'live-album',
            title: 'Fixture Live',
            primaryType: 'Album',
            secondaryTypes: ['Live'],
            genres: ['Jazz'],
          },
        ],
      },
    };
    if (path === '/collection-catalog/tv/19/availability') {
      expect(route.request().method()).toBe('POST');
      checks++;
      if (checks === 1)
        return route.fulfill({
          status: 503,
          json: { message: 'Provider unavailable.' },
        });
      return route.fulfill({
        json: {
          collection: {
            id: '19',
            parts: [
              { id: '42', title: 'Fixture Series', mediaInfo: { status: 5 } },
              {
                id: '99',
                title: 'Restricted Series',
                mediaInfo: { status: 5 },
              },
            ],
          },
        },
      });
    }
    if (path.startsWith('/collection-catalog/tv/for-series/'))
      seriesReads.push(path);
    return route.fulfill({ json: entries[path] ?? { results: [] } });
  });
  await page.goto('/tv/42');
  await expect(
    page.getByRole('heading', { name: 'Fixture Series' })
  ).toBeVisible();
  expect(seriesReads).toEqual([]);
  await page.getByText('Series Collections', { exact: true }).click();
  await page.getByRole('link', { name: 'Fixture Series Collection' }).click();
  await expect(
    page.getByRole('heading', { name: 'Fixture Series Collection' })
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Fixture Series', exact: true })
  ).toHaveAttribute('href', '/tv/42');
  await expect(page.getByRole('alert')).toHaveText('Provider unavailable.');
  await page.getByRole('button', { name: 'Refresh Availability' }).click();
  await expect(page.getByTitle('On Plex')).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Restricted Series' })
  ).toHaveCount(0);
  expect(checks).toBe(2);
  await page.screenshot({ path: info.outputPath('series-collection.png') });
  await page.getByRole('button', { name: 'Request Series' }).click();
  const tvSheet = page.getByRole('dialog', { name: 'Request Series' });
  const tvFilters = tvSheet.getByRole('group', { name: 'Collection Filters' });
  await tvFilters
    .getByRole('combobox', { name: 'Series Status' })
    .selectOption('Returning Series');
  await expect(
    tvSheet.getByText('No series match these filters.')
  ).toBeVisible();
  await tvFilters
    .getByRole('combobox', { name: 'Series Status' })
    .selectOption('Ended');
  await tvSheet.getByRole('checkbox', { name: /Fixture Series/ }).check();
  await expect(tvSheet.getByText('1 season selected')).toBeVisible();
  await page.screenshot({ path: info.outputPath('series-requests.png') });
  await tvSheet
    .getByRole('button', { name: 'Request Selected Series' })
    .click();
  await expect(tvSheet.getByText('1 requested, 0 failed.')).toBeVisible();
  expect(tvRequests).toEqual([
    {
      mediaType: 'tv',
      mediaId: 42,
      tvdbId: 200,
      is4k: false,
      seasons: [1],
      seasonRequests: [{ seasonNumber: 1, episodeNumbers: [3] }],
    },
  ]);
  await tvSheet.getByRole('button', { name: 'Close' }).click();
  await page.goto(`/music/${album}`);
  await page.getByRole('link', { name: 'View Discography' }).click();
  await expect(
    page.getByRole('heading', { name: 'Fixture Discography' })
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Back to Album' })
  ).toHaveAttribute('href', `/music/${album}`);
  await expect(page.getByText('FLAC', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Refresh Availability' })
  ).toHaveCount(0);
  const filters = page.getByRole('group', { name: 'Collection Filters' });
  await expect(
    page.getByRole('link', { name: 'Fixture Live', exact: true })
  ).toHaveCount(0);
  await filters
    .getByRole('combobox', { name: 'Release Type' })
    .selectOption('live');
  await filters.getByRole('combobox', { name: 'Genre' }).selectOption('jazz');
  await filters
    .getByRole('combobox', { name: 'Release Year' })
    .selectOption('unknown');
  await expect(
    page.getByRole('link', { name: 'Fixture Live', exact: true })
  ).toBeVisible();
  await filters
    .getByRole('combobox', { name: 'Release Year' })
    .selectOption('2020');
  await expect(
    page.getByText('No releases match these filters.')
  ).toBeVisible();
  await filters.getByRole('button', { name: 'Clear Filters' }).click();
  await expect(
    page.getByRole('link', { name: 'Fixture Live', exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Fixture Album', exact: true })
  ).toBeVisible();
  await page.screenshot({ path: info.outputPath('discography.png') });
  await page.getByRole('button', { name: 'Request Releases' }).click();
  const sheet = page.getByRole('dialog', { name: 'Request Releases' });
  await sheet.getByRole('combobox', { name: 'Quality' }).selectOption('flac');
  await expect(
    sheet.getByRole('checkbox', { name: /Fixture Album/ })
  ).toBeDisabled();
  await sheet.getByRole('checkbox', { name: 'Fixture Live' }).check();
  await page.screenshot({ path: info.outputPath('music-requests.png') });
  await sheet
    .getByRole('button', { name: 'Request Selected Releases' })
    .click();
  await expect(
    sheet.getByText('1 requested, 0 skipped, 0 failed.')
  ).toBeVisible();
  expect(requests).toEqual([
    {
      mediaType: 'music',
      serverId: 2,
      items: [{ mediaId: 'live-album', title: 'Fixture Live' }],
    },
  ]);
});
