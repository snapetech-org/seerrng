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
