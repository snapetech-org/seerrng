import { expect, test } from '@playwright/test';

test('collections are reachable from search and blocklist as one collection', async ({
  page,
}) => {
  let blocked = false;
  const actions: string[] = [];
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/api/v1/**', (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.slice('/api/v1'.length);
    if (path === '/auth/me')
      return route.fulfill({ json: { id: 1, permissions: 268435456 } });
    if (path === '/search')
      return route.fulfill({
        json: {
          results: [
            { id: 30, mediaType: 'collection', title: 'Example Collection' },
          ],
        },
      });
    if (path === '/collection/30')
      return route.fulfill({
        json: {
          id: 30,
          name: 'Example Collection',
          parts: [
            {
              id: 20,
              mediaType: 'movie',
              title: 'Example Movie',
              mediaInfo: { status: blocked ? 6 : 1 },
            },
          ],
        },
      });
    if (path === '/blocklist/collection/30') {
      actions.push(request.method());
      blocked = request.method() === 'POST';
      return route.fulfill({ status: blocked ? 201 : 204 });
    }
    if (path === '/blocklist/count')
      return route.fulfill({ json: { count: Number(blocked) } });
    return route.fulfill({ json: { results: [] } });
  });
  await page.goto('/search?f=movie&q=example');
  await page.getByRole('link', { name: 'Example Collection' }).click();
  await expect(
    page.getByRole('heading', { name: 'Example Collection' })
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Example Movie' })
  ).toHaveAttribute('href', '/movie/20');
  await page
    .getByRole('button', { name: 'Blocklist Collection', exact: true })
    .click();
  expect(actions).toEqual([]);
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Blocklist Collection' })
    .click();
  await expect(page.getByText('1 of 1 blocklisted')).toBeVisible();
  await page.getByRole('button', { name: 'Unblock Collection' }).click();
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Unblock Collection' })
    .click();
  await expect(page.getByText('1 of 1 blocklisted')).toHaveCount(0);
  expect(actions).toEqual(['POST', 'DELETE']);
});

test('progressive requests start, stop, and restart the selected quality', async ({
  page,
}) => {
  let status: 'waiting' | 'stopped' | null = null;
  const mutations: unknown[] = [];
  const queue = () =>
    status
      ? {
          collectionId: 30,
          is4k: true,
          bufferSize: 2,
          status,
          reason: status === 'waiting' ? 'provider-unavailable' : null,
          requested: 0,
          watched: 0,
          total: 1,
        }
      : null;
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/api/v1/**', (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.slice('/api/v1'.length);
    if (path === '/auth/me')
      return route.fulfill({ json: { id: 1, permissions: 2048 } });
    if (path === '/settings/public')
      return route.fulfill({ json: { movie4kEnabled: true } });
    if (path === '/collection/30')
      return route.fulfill({
        json: {
          id: 30,
          name: 'Example Collection',
          parts: [{ id: 20, mediaType: 'movie', title: 'Example Movie' }],
        },
      });
    if (path === '/collection/30/queue') {
      if (request.method() === 'POST') {
        mutations.push(request.postDataJSON());
        status = 'waiting';
        return route.fulfill({ status: 202, json: { queue: queue() } });
      }
      if (request.method() === 'DELETE') {
        mutations.push(url.search);
        status = 'stopped';
        return route.fulfill({ status: 204 });
      }
      return route.fulfill({
        json: {
          queue: url.searchParams.get('is4k') === 'true' ? queue() : null,
        },
      });
    }
    return route.fulfill({ json: {} });
  });
  await page.goto('/collection/30');
  await page.getByRole('button', { name: 'Queue Collection' }).click();
  const sheet = page.getByRole('dialog', { name: 'Queue Collection' });
  await expect(
    sheet.getByRole('button', { name: 'Start Queue' })
  ).toBeDisabled();
  await sheet.getByLabel('Queue Quality').selectOption('4k');
  await sheet.getByLabel('Movies Ahead').selectOption('2');
  await sheet.getByRole('button', { name: 'Start Queue' }).click();
  await expect(
    sheet.getByText('Playback history is unavailable.', { exact: false })
  ).toBeVisible();
  await sheet.getByRole('button', { name: 'Stop Queue' }).click();
  await expect(sheet.getByText('Queue Stopped')).toBeVisible();
  await sheet.getByRole('button', { name: 'Restart Queue' }).click();
  await expect(sheet.getByText('Waiting', { exact: true })).toBeVisible();
  expect(mutations).toEqual([
    { bufferSize: 2, is4k: true },
    '?is4k=true',
    { bufferSize: 2, is4k: true },
  ]);
});

test('bulk collection requests exclude blocked titles and show partial results', async ({
  page,
}, info) => {
  const submitted: unknown[] = [];
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/api/v1/**', (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.slice('/api/v1'.length);
    if (path === '/auth/me')
      return route.fulfill({ json: { id: 1, permissions: 32 } });
    if (path === '/genres/movie')
      return route.fulfill({ json: [{ id: 18, name: 'Drama' }] });
    if (path === '/languages')
      return route.fulfill({
        json: [{ iso_639_1: 'en', english_name: 'English' }],
      });
    if (path === '/collection/30')
      return route.fulfill({
        json: {
          id: 30,
          name: 'Example Collection',
          parts: [
            {
              id: 20,
              mediaType: 'movie',
              title: 'First Movie',
              releaseDate: '1968-01-01',
              genreIds: [18],
              voteAverage: 8,
              originalLanguage: 'en',
            },
            {
              id: 21,
              mediaType: 'movie',
              title: 'Second Movie',
              releaseDate: '2024-01-01',
              genreIds: [18],
              voteAverage: 7,
              originalLanguage: 'en',
            },
            {
              id: 22,
              mediaType: 'movie',
              title: 'Blocked Movie',
              mediaInfo: { status: 6 },
            },
          ],
        },
      });
    if (path === '/request' && request.method() === 'POST') {
      const body = request.postDataJSON();
      submitted.push(body);
      return route.fulfill(
        body.mediaId === 20
          ? { status: 201, json: { id: 8 } }
          : { status: 403, json: { message: 'Quota exceeded' } }
      );
    }
    return route.fulfill({ json: {} });
  });
  await page.goto('/collection/30');
  await page.getByRole('button', { name: 'Request Collection' }).click();
  const sheet = page.getByRole('dialog', { name: 'Request Collection' });
  await expect(
    sheet.getByRole('checkbox', { name: 'Blocked Movie Blocklisted' })
  ).toBeDisabled();
  await sheet.getByRole('button', { name: 'Select Eligible Movies' }).click();
  const filters = sheet.getByRole('group', { name: 'Collection Filters' });
  await filters
    .getByRole('combobox', { name: 'Genre', exact: true })
    .selectOption('18');
  await filters
    .getByRole('combobox', { name: 'Language', exact: true })
    .selectOption('en');
  await filters
    .getByRole('combobox', { name: 'Release Year' })
    .selectOption('before-1970');
  await expect(
    sheet.getByRole('button', { name: 'Request Selected (1)' })
  ).toBeEnabled();
  await expect(
    sheet.getByRole('checkbox', { name: 'Second Movie' })
  ).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('movie-request-filters.png') });
  await filters
    .getByRole('combobox', { name: 'Minimum Rating' })
    .selectOption('9');
  await expect(sheet.getByText('No movies match these filters.')).toBeVisible();
  await expect(
    sheet.getByRole('button', { name: 'Request Selected (0)' })
  ).toBeDisabled();
  await filters.getByRole('button', { name: 'Clear Filters' }).click();
  await sheet.getByRole('button', { name: 'Request Selected (2)' }).click();
  await expect(
    sheet.getByText('1 of 2 requests submitted.', { exact: false })
  ).toBeVisible();
  await expect(
    sheet.getByText('Request Rejected', { exact: true })
  ).toBeVisible();
  expect(submitted).toEqual([
    { mediaId: 20, mediaType: 'movie', is4k: false },
    { mediaId: 21, mediaType: 'movie', is4k: false },
  ]);
});

test('collection playback uses ordered internal IDs, skips shared copies, and opens a safe playlist link', async ({
  page,
}) => {
  const writes: unknown[] = [];
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/api/v1/**', (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.slice('/api/v1'.length);
    if (path === '/auth/me')
      return route.fulfill({ json: { id: 1, permissions: 32 } });
    if (path === '/settings/public')
      return route.fulfill({ json: { otherUsersAvailability: 'distinguish' } });
    if (path === '/collection/30')
      return route.fulfill({
        json: {
          id: 30,
          name: 'Example Collection',
          parts: [
            {
              id: 20,
              mediaType: 'movie',
              title: 'First Movie',
              mediaInfo: { id: 99, status: 5 },
            },
            {
              id: 21,
              mediaType: 'movie',
              title: 'Shared Movie',
              mediaInfo: {
                id: 100,
                status: 5,
                viewerRequestCoverage: { standard: false },
              },
            },
            {
              id: 22,
              mediaType: 'movie',
              title: 'Last Movie',
              mediaInfo: { id: 70, status: 5 },
            },
          ],
        },
      });
    if (path === '/playback/devices')
      return route.fulfill({
        json: [{ id: 'player-1', name: 'TV', client: 'Plex' }],
      });
    if (
      path === '/playback/collection/play' ||
      path === '/playback/collection/playlist'
    ) {
      writes.push(request.postDataJSON());
      return path.endsWith('/playlist')
        ? route.fulfill({ json: { url: 'https://example.test/playlist' } })
        : route.fulfill({ status: 204 });
    }
    return route.fulfill({ json: {} });
  });
  await page.goto('/collection/30');
  await page.getByRole('button', { name: 'Play Collection' }).click();
  const sheet = page.getByRole('dialog', { name: 'Play Collection' });
  await expect(
    sheet.getByRole('checkbox', { name: 'Shared Movie' })
  ).toHaveCount(0);
  await sheet.getByLabel('Playback Device').selectOption('player-1');
  await sheet.getByRole('button', { name: 'Play on Device' }).click();
  await expect(sheet.getByText('Playback started on TV.')).toBeVisible();
  await sheet.getByRole('checkbox', { name: 'First Movie' }).uncheck();
  await sheet.getByRole('button', { name: 'Create Playback Playlist' }).click();
  await expect(
    sheet.getByRole('link', { name: 'Open Playlist' })
  ).toHaveAttribute('href', 'https://example.test/playlist');
  expect(writes).toEqual([
    { mediaIds: [99, 70], is4k: false, deviceId: 'player-1' },
    { mediaIds: [70], is4k: false },
  ]);
});
