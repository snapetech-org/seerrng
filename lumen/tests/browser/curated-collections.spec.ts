import { expect, test } from '@playwright/test';

const testAppPath = (path: string) =>
  `${process.env.LUMEN_TEST_MOUNT === '/lumen' ? '/lumen' : ''}${path}`;
const testApiPath = (url: string) =>
  new URL(url).pathname.replace(/^\/lumen(?=\/)/, '').slice(7);

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
    const path = testApiPath(route.request().url());
    if (path === '/request') {
      expect(route.request().method()).toBe('POST');
      tvRequests.push(route.request().postDataJSON());
      return route.fulfill({
        status: 202,
        json: { message: 'No seasons available.' },
      });
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
  await page.goto(testAppPath('/tv/42'));
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
  ).toHaveAttribute('href', testAppPath('/tv/42'));
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
  await expect(tvSheet.getByText('0 requested, 1 failed.')).toBeVisible();
  await expect(
    tvSheet.getByText('Fixture Series · No selected episodes were added.')
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath('series-request-unconfirmed.png'),
    animations: 'disabled',
  });
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
  await page.goto(testAppPath(`/music/${album}`));
  await page.locator('#view').getByText('More', { exact: true }).click();
  await page.getByRole('link', { name: 'View Discography' }).click();
  await expect(
    page.getByRole('heading', { name: 'Fixture Discography' })
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Back to Album' })
  ).toHaveAttribute('href', testAppPath(`/music/${album}`));
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

test('TV collection quota override enables otherwise restricted requests', async ({
  page,
}, info) => {
  const requests: unknown[] = [];
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', (route) => {
    const path = testApiPath(route.request().url());
    if (path === '/request' && route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      requests.push(body);
      if (!body.bypassStreamingRequestPolicy)
        return route.fulfill({
          status: 403,
          json: {
            code: 'STREAMING_REQUEST_POLICY_REJECTED',
            allowOverride: true,
            message: 'Available on your streaming service.',
          },
        });
      return route.fulfill({ json: { id: 4 } });
    }
    const responses: Record<string, unknown> = {
      '/auth/me': { id: 1, permissions: 2 },
      '/settings/public': { partialRequestsEnabled: true },
      '/user/1/quota': { tv: { limit: 1, remaining: 0, restricted: true } },
      '/service/sonarr': [
        { id: 1, name: 'Sonarr', isDefault: true, is4k: false },
      ],
      '/service/sonarr/1': {
        server: { activeProfileId: 3, activeDirectory: '/series' },
        profiles: [{ id: 3, name: 'HD' }],
        rootFolders: [{ id: 1, path: '/series' }],
      },
      '/collection-catalog/tv/19': {
        id: '19',
        name: 'Fixture Collection',
        parts: [{ id: '42', title: 'Fixture Series' }],
      },
      '/tv/42': {
        id: 42,
        externalIds: { tvdbId: 80 },
        seasons: [{ seasonNumber: 1, episodeCount: 4 }],
      },
    };
    return route.fulfill({ json: responses[path] ?? { results: [] } });
  });
  await page.goto(testAppPath('/collections/tv/19'));
  await page.getByRole('button', { name: 'Request Series' }).click();
  const sheet = page.getByRole('dialog', { name: 'Request Series' });
  const submit = sheet.getByRole('button', { name: 'Request Selected Series' });
  await sheet.getByRole('checkbox', { name: /Fixture Series/ }).check();
  await expect(submit).toBeDisabled();
  await expect(sheet.getByText(/Request quota exceeded/)).toBeVisible();
  await sheet.getByRole('checkbox', { name: 'Ignore Request Quota' }).check();
  await expect(submit).toBeEnabled();
  await page.screenshot({
    path: info.outputPath('tv-collection-quota-override.png'),
  });
  await submit.click();
  await expect(
    sheet.getByText('Fixture Series · Available on your streaming service.')
  ).toBeVisible();
  expect(requests).toHaveLength(1);
  await sheet.getByRole('button', { name: 'Request Anyway (1)' }).click();
  await expect(sheet.getByText('1 requested, 0 failed.')).toBeVisible();
  expect(requests).toEqual([
    expect.objectContaining({
      mediaId: 42,
      mediaType: 'tv',
      ignoreQuota: true,
    }),
    { ...(requests[0] as object), bypassStreamingRequestPolicy: true },
  ]);
});

for (const kind of ['tv', 'music']) {
  test(`curated ${kind} blocklisting confirms the exact eligible member`, async ({
    page,
  }) => {
    const id = kind === 'tv' ? '42' : '62a8e15d-a5f1-4213-a794-e10e0150e945';
    const blockedId =
      kind === 'tv' ? '43' : '60a8e15d-a5f1-4213-a794-e10e0150e946';
    let writes = 0;
    let associationReads = 0;
    await page.route('**/api/v1/**', (route) => {
      const path = testApiPath(route.request().url());
      if (path === '/auth/me')
        return route.fulfill({ json: { id: 1, permissions: 268435456 } });
      if (path === '/settings/public')
        return route.fulfill({
          json: {
            initialized: true,
            musicEnabled: true,
            enabledMediaCategories: { music: true },
          },
        });
      if (path === '/blocklist') {
        expect(route.request().method()).toBe('POST');
        expect(route.request().postDataJSON()).toEqual(
          kind === 'tv'
            ? { tmdbId: 42, mediaType: 'tv', title: 'Fixture Member' }
            : {
                externalId: id,
                externalProvider: 'musicbrainz',
                mediaType: 'music',
                title: 'Fixture Member',
              }
        );
        writes++;
        return route.fulfill({ status: 201, body: '' });
      }
      if (path === '/tv/42')
        return route.fulfill({
          json: {
            relatedVideos: [
              { site: 'YouTube', type: 'Trailer', key: 'invalid' },
              { site: 'YouTube', type: 'Trailer', key: 'AbCdEf12345' },
            ],
          },
        });
      if (path.startsWith('/association/')) {
        associationReads++;
        const type = kind === 'music' ? 'album' : 'tv';
        const stronger = path.endsWith(`/${blockedId}`);
        return route.fulfill({
          json: {
            edges: [
              {
                type: 'similar',
                reason: 'Same collection',
                weight: 100,
                node: { mediaType: type, id, title: 'Internal Member' },
              },
              {
                type: 'shared-person',
                reason: stronger ? 'Strongest match' : 'Weaker match',
                weight: stronger ? 5 : 1,
                node: { mediaType: 'person', id: 91, name: 'Related Person' },
              },
            ],
          },
        });
      }
      if (path === `/collection-catalog/${kind}/19`)
        return route.fulfill({
          json: {
            id: '19',
            name: 'Fixture Collection',
            parts: [
              {
                id,
                title: 'Fixture Member',
                mediaInfo: { status: writes ? 6 : 1 },
              },
              {
                id: blockedId,
                title: 'Already Blocked',
                mediaInfo: { status: 6 },
              },
            ],
          },
        });
      return route.fulfill({ json: { count: 0 } });
    });
    await page.goto(testAppPath(`/collections/${kind}/19`));
    expect(associationReads).toBe(0);
    await page.getByText('Collection Associations', { exact: true }).click();
    const related = page.getByRole('link', { name: 'Related Person' });
    await expect(related).toHaveAttribute('href', testAppPath('/person/91'));
    await expect(page.getByText('Strongest match')).toBeVisible();
    await expect(page.getByText('Internal Member')).toHaveCount(0);
    expect(associationReads).toBe(2);
    const trailer = page.getByRole('link', { name: 'Watch Trailer' });
    if (kind === 'tv') {
      await expect(trailer).toHaveAttribute(
        'href',
        'https://www.youtube.com/watch?v=AbCdEf12345'
      );
    } else {
      await expect(trailer).toHaveCount(0);
    }
    const action = page.getByRole('button', {
      name: 'Blocklist Collection',
      exact: true,
    });
    await action.click();
    const dialog = page.getByRole('alertdialog', {
      name: 'Blocklist this collection?',
    });
    await expect(dialog).toContainText('1 eligible');
    expect(writes).toBe(0);
    await dialog.getByRole('button', { name: 'Blocklist Collection' }).click();
    await expect(
      page.getByText('1 added to the Blocklist, 0 failed.')
    ).toBeVisible();
    await expect(action).toBeDisabled();
    expect(writes).toBe(1);
  });
}

test('collection server sync adds visible verified IDs and removes the confirmed remote library', async ({
  page,
}) => {
  const removalToken = 'a'.repeat(64);
  const parts = [{ id: '42', title: 'Fixture Series' }];
  let exists = false;
  function sync() {
    return {
      supported: true,
      destinations: [
        {
          libraryId: 'library-1',
          libraryName: 'Fixture Library',
          state: exists ? 'exists' : 'missing',
          availableIds: ['42', '99'],
          removalToken: exists ? removalToken : undefined,
        },
      ],
    };
  }
  await page.route('**/api/v1/**', (route) => {
    const request = route.request();
    const pathname = testApiPath(request.url());
    switch (pathname) {
      case '/auth/me':
        return route.fulfill({ json: { id: 1, permissions: 2 } });
      case '/settings/public':
        return route.fulfill({
          json: { initialized: true, mediaServerType: 1 },
        });
      case '/collection-catalog/tv/19':
        return route.fulfill({
          json: { id: '19', name: 'Fixture Collection', parts },
        });
      case '/collection-catalog/tv/19/availability':
        return route.fulfill({
          json: {
            collection: {
              id: '19',
              parts: [...parts, { id: '99', title: 'Restricted Series' }],
            },
            sync: sync(),
          },
        });
      case '/collection-catalog/tv/19/server':
        if (request.method() === 'POST') {
          expect(request.postDataJSON()).toEqual({
            libraryIds: ['library-1'],
            selectedIds: ['42'],
          });
          exists = true;
        } else {
          expect(request.method()).toBe('DELETE');
          expect(request.postDataJSON()).toEqual({
            destinations: [{ libraryId: 'library-1', removalToken }],
          });
          exists = false;
        }
        return route.fulfill({ json: sync() });
      default:
        return route.fulfill({ json: {} });
    }
  });
  await page.goto(testAppPath('/collections/tv/19'));
  await page.getByRole('button', { name: 'Add to Media Server' }).click();
  const add = page.getByRole('dialog', {
    name: 'Add Collection to Media Server',
  });
  await expect(
    add.getByRole('checkbox', { name: 'Fixture Library · 1 available' })
  ).toBeChecked();
  await add
    .getByRole('button', { name: 'Add Collection to Media Server' })
    .click();
  await expect(add.getByRole('status')).toHaveText(
    '1 of 1 libraries verified.'
  );
  await add.getByRole('button', { name: 'Done' }).click();
  await page.getByRole('button', { name: 'Remove from Media Server' }).click();
  const remove = page.getByRole('dialog', {
    name: 'Remove Collection from Media Server',
  });
  await remove
    .getByRole('button', { name: 'Remove Collection from Media Server' })
    .click();
  await expect(remove.getByRole('status')).toHaveText(
    '1 of 1 libraries verified.'
  );
  expect(exists).toBe(false);
});
