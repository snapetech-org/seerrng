import { expect, test } from '@playwright/test';

test('My Media retains provider cursors and leaves unmapped items unlinked', async ({
  page,
}) => {
  const requests: URLSearchParams[] = [];
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/api/v1/**', (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.slice('/api/v1'.length);
    if (path === '/integrations/discovery/library/plex') {
      requests.push(url.searchParams);
      const next = url.searchParams.get('cursor') === '37';
      return route.fulfill({
        json: {
          libraries: [
            { id: '1', name: 'Cinema' },
            { id: '2', name: 'Family' },
          ],
          items: !url.searchParams.has('libraryId')
            ? []
            : next
              ? [{ id: 'unknown', title: 'Unmatched' }]
              : [
                  {
                    id: 'known',
                    title: 'Matched Movie',
                    mediaType: 'movie',
                    tmdbId: 20,
                  },
                ],
          hasMore: !next,
          nextCursor: next ? undefined : 37,
          missingMappings: next ? 1 : 0,
          truncated: false,
        },
      });
    }
    return route.fulfill({
      json:
        path === '/auth/me'
          ? { id: 1, displayName: 'Reader', permissions: 32 }
          : path === '/integrations/discovery/accounts'
            ? {
                accounts: [],
                mediaServer: { provider: 'plex', connected: true },
              }
            : {},
    });
  });

  await page.goto('./me');
  await page.getByRole('link', { name: 'Open My Media' }).click();
  await expect(page.getByRole('heading', { name: 'My Media' })).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Matched Movie' })
  ).toHaveAttribute('href', /\/movie\/20$/);
  await page
    .getByRole('combobox', { name: 'Library', exact: true })
    .selectOption('2');
  await page.getByRole('button', { name: 'Next Page' }).click();
  await expect(page.getByText('Unmatched', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Unmatched' })).toHaveCount(0);
  expect(Object.fromEntries(requests.at(-1) ?? [])).toMatchObject({
    page: '2',
    cursor: '37',
    libraryId: '2',
  });
  await page
    .getByRole('combobox', { name: 'Shelf', exact: true })
    .selectOption('watched');
  await expect(page.getByRole('link', { name: 'Matched Movie' })).toBeVisible();
  expect(Object.fromEntries(requests.at(-1) ?? [])).toMatchObject({
    page: '1',
    cursor: '0',
    shelf: 'watched',
  });
  await page.reload();
  await expect(
    page.getByRole('combobox', { name: 'Library', exact: true })
  ).toHaveValue('2');
  await expect(
    page.getByRole('combobox', { name: 'Shelf', exact: true })
  ).toHaveValue('watched');
  await page.goto('./library?source=anilist&shelf=rated&libraryId=unknown');
  await expect(
    page.getByRole('combobox', { name: 'Library Source' })
  ).toHaveValue('plex');
  await expect(
    page.getByRole('combobox', { name: 'Library', exact: true })
  ).toHaveValue('1');
  await expect(
    page.getByRole('combobox', { name: 'Shelf', exact: true })
  ).toHaveValue('all');
  expect(requests.some((query) => query.get('libraryId') === 'unknown')).toBe(
    false
  );
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth)
  ).toBeLessThanOrEqual(page.viewportSize()!.width);
});

test('provider library scans keep filter scope while paging and resume after a pause', async ({
  page,
}) => {
  const scans: unknown[] = [];
  let releaseBatch!: () => void;
  const firstBatch = new Promise<void>((resolve) => {
    releaseBatch = resolve;
  });
  let matched = false;
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.slice('/api/v1'.length);
    if (path === '/integrations/discovery/library/trakt/repair') {
      expect(request.method()).toBe('POST');
      scans.push(request.postDataJSON());
      if (scans.length === 1) await firstBatch;
      matched = true;
      return route.fulfill({
        json: {
          nextPage: 6,
          scanned: 2,
          matched: 1,
          saved: 1,
          hasMore: scans.length === 1,
          truncated: false,
          limitReached: false,
        },
      });
    }
    if (path === '/integrations/discovery/library/trakt')
      return route.fulfill({
        json: {
          items: [
            {
              id: 'fixture',
              title:
                url.searchParams.get('page') === '2'
                  ? 'Second Fixture Film'
                  : 'Fixture Film',
              mediaType: 'movie',
              ...(matched ? { tmdbId: 20 } : {}),
            },
          ],
          hasMore: url.searchParams.get('page') === '1',
          missingMappings: matched ? 0 : 1,
          truncated: false,
        },
      });
    return route.fulfill({
      json:
        path === '/auth/me'
          ? { id: 1, displayName: 'Reader', permissions: 32 }
          : path === '/integrations/discovery/accounts'
            ? { accounts: [{ provider: 'trakt' }], mediaServer: null }
            : {},
    });
  });
  await page.goto('./library');
  await page
    .getByRole('combobox', { name: 'Media Type' })
    .selectOption('movie');
  await expect(page.getByText('Fixture Film')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Fixture Film' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Scan Library', exact: true }).click();
  await expect.poll(() => scans.length).toBe(1);
  await page.getByRole('button', { name: 'Next Page' }).click();
  await expect(page.getByText('Second Fixture Film')).toBeVisible();
  await page.getByRole('button', { name: 'Stop After This Batch' }).click();
  releaseBatch();
  await expect(page.getByText('Scan paused at page 6.')).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Second Fixture Film' })
  ).toHaveAttribute('href', /\/movie\/20$/);
  await page.getByRole('button', { name: 'Continue Scan' }).click();
  await expect(page.getByText('Library scan complete.')).toBeVisible();
  expect(scans).toEqual([
    { shelf: 'watched', startPage: 1, pageCount: 5, mediaType: 'movie' },
    { shelf: 'watched', startPage: 6, pageCount: 5, mediaType: 'movie' },
  ]);
});

test('My Media exports private packs and refreshes the current shelf after import', async ({
  page,
}) => {
  const pack = {
    format: 'seerrng.personal-title-matches',
    version: 1,
    exportedAt: '2026-11-18T00:00:00.000Z',
    entries: [{ identity: 'trakt:movie:123', mediaType: 'movie', tmdbId: 21 }],
  };
  let imported = false;
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/api/v1/**', (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname.slice('/api/v1'.length);
    if (path === '/auth/me')
      return route.fulfill({
        json: { id: 2, displayName: 'Reader', permissions: 32 },
      });
    if (path === '/integrations/discovery/accounts')
      return route.fulfill({
        json: { accounts: [{ provider: 'trakt' }], mediaServer: null },
      });
    if (path === '/integrations/discovery/mappings/pack') {
      if (req.method() === 'GET') return route.fulfill({ json: pack });
      expect(req.method()).toBe('POST');
      expect(req.headers()['content-type']).toBe('text/plain');
      expect(JSON.parse(req.postData()!)).toEqual(pack);
      imported = true;
      return route.fulfill({ json: { imported: 1, updated: 0, unchanged: 0 } });
    }
    if (path === '/integrations/discovery/library/trakt')
      return route.fulfill({
        json: {
          items: [
            {
              id: 'fixture',
              title: 'Private Match',
              mediaType: 'movie',
              ...(imported ? { tmdbId: 21 } : {}),
            },
          ],
          hasMore: false,
          missingMappings: imported ? 0 : 1,
          truncated: false,
        },
      });
    return route.fulfill({ json: {} });
  });
  await page.goto('./library');
  await expect(page.getByText('Private Match')).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export Title Matches' }).click();
  expect((await download).suggestedFilename()).toMatch(
    /^seerrng-title-matches-.*\.json$/
  );
  await page.getByLabel('Choose Personal Pack').setInputFiles({
    name: 'private.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(pack)),
  });
  await expect(
    page.getByText(/private\.json contains 1 title match/)
  ).toBeVisible();
  await page.getByRole('button', { name: 'Import Title Matches' }).click();
  await expect(
    page.getByText('Imported 1, updated 0, and left 0 unchanged.')
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Private Match' })
  ).toHaveAttribute('href', /\/movie\/21$/);
});

test('My Media offers account linking and reads new connections on return', async ({
  page,
}) => {
  let connected = false;
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname.slice(
      '/api/v1'.length
    );
    if (path === '/auth/me')
      return route.fulfill({ json: { id: 2, permissions: 32, userType: 2 } });
    if (path === '/user/2/settings/linked-accounts')
      return route.fulfill({ json: [] });
    if (path === '/integrations/discovery/accounts')
      return route.fulfill({
        json: {
          accounts: connected
            ? [
                {
                  provider: 'trakt',
                  username: 'Fixture Viewer',
                  allowWrites: false,
                },
              ]
            : [],
          mediaServer: null,
        },
      });
    if (path === '/integrations/discovery/library/trakt')
      return route.fulfill({
        json: {
          items: [{ id: 'fixture', title: 'New Library Film' }],
          hasMore: false,
          missingMappings: 0,
          truncated: false,
        },
      });
    return route.fulfill({ json: {} });
  });
  await page.goto('./library');
  await page
    .getByRole('link', { name: 'Open Linked Accounts', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Linked Accounts', exact: true })
  ).toBeVisible();
  connected = true;
  await page.getByRole('link', { name: 'Open My Media', exact: true }).click();
  await expect(page.getByText('New Library Film')).toBeVisible();
  await page
    .getByRole('link', { name: 'Manage Linked Accounts', exact: true })
    .click();
  await expect(page.getByText('Fixture Viewer')).toBeVisible();
});

test('My Media recovers from malformed connected accounts and shelf responses', async ({
  page,
}) => {
  let accountReads = 0;
  let shelfReads = 0;
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname.slice(
      '/api/v1'.length
    );
    if (path === '/auth/me')
      return route.fulfill({ json: { id: 2, permissions: 32, userType: 2 } });
    if (path === '/integrations/discovery/accounts')
      return route.fulfill({
        json:
          ++accountReads === 1
            ? { accounts: {} }
            : {
                accounts: [
                  null,
                  { provider: 'unrecognized' },
                  { provider: 'trakt' },
                ],
                mediaServer: null,
              },
      });
    if (path === '/integrations/discovery/library/trakt')
      return route.fulfill({
        json:
          ++shelfReads === 1
            ? { items: [null] }
            : {
                items: [{ id: 'fixture', title: 'Recovered Film' }],
                hasMore: false,
              },
      });
    return route.fulfill({ json: {} });
  });
  await page.goto('./library');
  const error = page.getByRole('alert');
  await expect(error).toContainText('Invalid connected accounts response.');
  await error.getByRole('button', { name: 'Retry' }).click();
  await expect(error).toContainText('Invalid library response.');
  await expect(
    page.getByRole('combobox', { name: 'Library Source' }).getByRole('option')
  ).toHaveCount(1);
  await error.getByRole('button', { name: 'Retry' }).click();
  await expect(page.getByText('Recovered Film')).toBeVisible();
});

test('My Media saves and resets a private catalog match', async ({ page }) => {
  let matched = false;
  const identity = 'trakt:movie:123';
  const mutations: string[] = [];
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/api/v1/**', (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname.slice('/api/v1'.length);
    if (path === '/auth/me')
      return route.fulfill({ json: { id: 2, permissions: 32 } });
    if (path === '/integrations/discovery/accounts')
      return route.fulfill({
        json: { accounts: [{ provider: 'trakt' }], mediaServer: null },
      });
    if (path === '/integrations/discovery/library/trakt')
      return route.fulfill({
        json: {
          items: [
            {
              id: identity,
              title: 'Provider Film',
              mediaType: 'movie',
              identityMapped: matched,
              ...(matched ? { tmdbId: 21 } : {}),
            },
          ],
          hasMore: false,
        },
      });
    if (path === '/search') {
      expect(url.searchParams.get('query')).toBe('Provider Film');
      return route.fulfill({
        json: {
          results: [{ id: 21, mediaType: 'movie', title: 'Catalog Film' }],
        },
      });
    }
    if (path === '/integrations/discovery/mappings') {
      expect(req.postDataJSON()).toEqual({
        identity,
        tmdbId: 21,
        mediaType: 'movie',
      });
      mutations.push(req.method());
      matched = true;
      return route.fulfill({ json: {} });
    }
    if (
      path ===
      '/integrations/discovery/mappings/' + encodeURIComponent(identity)
    ) {
      mutations.push(req.method());
      matched = false;
      return route.fulfill({ status: 204 });
    }
    return route.fulfill({ json: {} });
  });
  await page.goto('./library');
  await page.getByRole('button', { name: 'Match Title', exact: true }).click();
  await page.getByRole('button', { name: 'Search Matches' }).click();
  await page.getByRole('button', { name: 'Match Catalog Film' }).click();
  await expect(
    page.getByRole('link', { name: 'Provider Film' })
  ).toHaveAttribute('href', /\/movie\/21$/);
  await page.getByRole('button', { name: 'Reset Match' }).click();
  await expect(
    page.getByRole('button', { name: 'Match Title', exact: true })
  ).toBeVisible();
  expect(mutations).toEqual(['PUT', 'DELETE']);
});

test('My Media gates provider tracking and recovers a confirmed update without repeating it', async ({
  page,
}) => {
  let allowWrites = false;
  let watched = false;
  let actionId = '';
  let deniedId = '';
  let writes = 0;
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/api/v1/**', (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.slice('/api/v1'.length);
    if (path === '/auth/me')
      return route.fulfill({ json: { id: 2, permissions: 32 } });
    if (path === '/integrations/discovery/accounts')
      return route.fulfill({
        json: { accounts: [{ provider: 'trakt' }], mediaServer: null },
      });
    if (path === '/integrations/discovery/library/trakt')
      return route.fulfill({
        json: {
          items: [
            {
              id: 'trakt:movie:123',
              title: 'Tracked Movie',
              tmdbId: 21,
              mediaType: 'movie',
              status: watched ? 'watched' : 'planning',
            },
          ],
          allowWrites,
          hasMore: false,
        },
      });
    if (path === '/integrations/discovery/tracking/trakt') {
      expect(request.method()).toBe('POST');
      const body = request.postDataJSON();
      expect(body).toMatchObject({
        action: 'watched',
        value: true,
        mediaType: 'movie',
        tmdbId: 21,
      });
      expect(body.requestId).toMatch(/^[0-9a-f-]{36}$/);
      if (!deniedId) {
        deniedId = body.requestId;
        return route.fulfill({
          status: 403,
          json: {
            message:
              'Enable watched-status and rating updates under Linked Accounts.',
          },
        });
      }
      expect(body.requestId).toBe(deniedId);
      actionId = body.requestId;
      watched = true;
      writes++;
      return route.abort();
    }
    if (
      actionId &&
      path === '/integrations/discovery/tracking/actions/' + actionId
    )
      return route.fulfill({ json: { state: 'succeeded' } });
    if (path.startsWith('/integrations/discovery/tracking/actions/'))
      return route.fulfill({ status: 404, json: {} });
    return route.fulfill({ json: {} });
  });
  await page.goto('./library');
  await expect(page.getByRole('link', { name: 'Tracked Movie' })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Update Tracking' })
  ).toHaveCount(0);
  allowWrites = true;
  await page.reload();
  await page.getByRole('button', { name: 'Update Tracking' }).click();
  await page.getByRole('button', { name: 'Mark Watched', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText(
    'Enable watched-status and rating updates under Linked Accounts.'
  );
  await page.getByRole('button', { name: 'Mark Watched', exact: true }).click();
  await expect(page.getByText('Provider tracking updated.')).toBeVisible();
  await page
    .getByRole('button', { name: 'Mark Unwatched', exact: true })
    .click();
  await expect(page.getByRole('alertdialog')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(writes).toBe(1);
});

test('My Media tracks and removes a selected provider episode', async ({
  page,
}) => {
  let watched = false;
  let statusReads = 0;
  const changes: boolean[] = [];
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/api/v1/**', (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.slice('/api/v1'.length);
    if (path === '/auth/me')
      return route.fulfill({ json: { id: 2, permissions: 32 } });
    if (path === '/integrations/discovery/accounts')
      return route.fulfill({
        json: { accounts: [{ provider: 'simkl' }], mediaServer: null },
      });
    if (path === '/integrations/discovery/library/simkl')
      return route.fulfill({
        json: {
          items: [
            {
              id: 'simkl:tv:123',
              title: 'Tracked Series',
              sourceId: '123',
              tmdbId: 21,
              mediaType: 'tv',
            },
          ],
          allowWrites: true,
          hasMore: false,
        },
      });
    if (path === '/tv/21')
      return route.fulfill({
        json: {
          seasons: [{ seasonNumber: 2, name: 'Season Two', episodeCount: 2 }],
        },
      });
    if (path === '/tv/21/season/2')
      return route.fulfill({
        json: {
          episodes: [
            { episodeNumber: 1, name: 'First' },
            { episodeNumber: 2, name: 'Second' },
          ],
        },
      });
    if (path === '/integrations/discovery/tracking/simkl/episodes') {
      expect(Object.fromEntries(url.searchParams)).toEqual({
        sourceId: '123',
        tmdbId: '21',
        season: '2',
      });
      return route.fulfill({
        json: {
          available: true,
          episodes: ++statusReads === 1 ? {} : [{ episode: 2, watched }],
        },
      });
    }
    if (path === '/integrations/discovery/tracking/simkl') {
      const body = request.postDataJSON();
      expect(body).toMatchObject({
        action: 'watched',
        tmdbId: 21,
        mediaType: 'tv',
        episode: { season: 2, episode: 2 },
      });
      watched = body.value;
      changes.push(watched);
      return route.fulfill({ json: { state: 'succeeded' } });
    }
    return route.fulfill({ json: {} });
  });
  await page.goto('./library');
  await page.getByRole('button', { name: 'Update Tracking' }).click();
  await page.getByRole('button', { name: 'Track Individual Episodes' }).click();
  await page
    .getByRole('combobox', { name: 'Tracking Episode' })
    .selectOption('2');
  const statusError = page.getByRole('alert').filter({
    hasText: 'Invalid provider watch status response.',
  });
  await expect(statusError).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Mark Episode Watched' })
  ).toBeEnabled();
  await statusError.getByRole('button', { name: 'Retry' }).click();
  await expect(
    page.getByText('Unwatched on provider.', { exact: true })
  ).toBeVisible();
  await page.getByRole('button', { name: 'Mark Episode Watched' }).click();
  await expect(
    page.getByText('Watched on provider.', { exact: true })
  ).toBeVisible();
  await page.getByRole('button', { name: 'Mark Episode Unwatched' }).click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog.getByText(/season 2, episode 2/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Mark Unwatched' }).click();
  await expect(
    page.getByText('Unwatched on provider.', { exact: true })
  ).toBeVisible();
  expect(changes).toEqual([true, false]);
});

test('My Media opens reconnection for an expired provider account', async ({
  page,
}) => {
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname.slice(
      '/api/v1'.length
    );
    if (path === '/auth/me')
      return route.fulfill({ json: { id: 2, permissions: 32 } });
    if (path === '/user/2/settings/linked-accounts')
      return route.fulfill({ json: [] });
    if (path === '/integrations/discovery/accounts')
      return route.fulfill({
        json: {
          accounts: [{ provider: 'trakt', username: 'Reader' }],
          mediaServer: null,
        },
      });
    if (path === '/integrations/discovery/configuration')
      return route.fulfill({ json: { trakt: { configured: true } } });
    if (path === '/integrations/discovery/library/trakt')
      return route.fulfill({
        status: 409,
        json: {
          code: 'RECONNECT_REQUIRED',
          message: 'Reconnect your provider account under Linked Accounts.',
        },
      });
    return route.fulfill({ json: {} });
  });
  await page.goto('./library');
  await page.getByRole('link', { name: 'Reconnect Provider' }).click();
  await expect(page).toHaveURL(/linked-accounts\?reconnect=trakt$/);
  await expect(
    page.getByRole('button', { name: 'Reconnect Trakt' })
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Disconnect Trakt' })
  ).toBeVisible();
});
