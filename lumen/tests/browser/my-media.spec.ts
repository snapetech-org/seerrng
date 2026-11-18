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

  await page.goto('/me');
  await page.getByRole('link', { name: 'Open My Media' }).click();
  await expect(page.getByRole('heading', { name: 'My Media' })).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Matched Movie' })
  ).toHaveAttribute('href', '/movie/20');
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
  await page.goto('/library');
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
  ).toHaveAttribute('href', '/movie/20');
  await page.getByRole('button', { name: 'Continue Scan' }).click();
  await expect(page.getByText('Library scan complete.')).toBeVisible();
  expect(scans).toEqual([
    { shelf: 'watched', startPage: 1, pageCount: 5, mediaType: 'movie' },
    { shelf: 'watched', startPage: 6, pageCount: 5, mediaType: 'movie' },
  ]);
});
