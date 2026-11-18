import { expect, test } from '@playwright/test';

test('indexer search honors enabled categories, submitted pagination and one-use handoff', async ({
  page,
}) => {
  const searches: unknown[] = [];
  const handoffs: unknown[] = [];
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname.slice(
      '/api/v1'.length
    );
    if (path === '/auth/me')
      return route.fulfill({
        json: { id: 1, displayName: 'Operator', permissions: 16 },
      });
    if (path === '/indexer-search/configuration')
      return route.fulfill({
        json: {
          configured: true,
          showIndexerDetails: false,
          categories: [
            { category: 'ebook', categoryIds: [7020], enabled: true },
            { category: 'adult', categoryIds: [6000], enabled: false },
          ],
        },
      });
    if (path === '/indexer-search/search') {
      const body = route.request().postDataJSON();
      searches.push(body);
      return route.fulfill({
        json: {
          limit: 50,
          hasMore: body.offset === 0,
          results: [
            {
              title: body.offset ? 'Second Result' : 'First Result',
              indexer: 'Hidden Indexer',
              protocol: 'usenet',
              size: 1000000,
              infoUrl: 'https://example.test/info',
              grabs: null,
              seeders: null,
              leechers: null,
              publishDate: null,
              categories: [],
              grabId: body.offset
                ? null
                : 'df924acb-ad33-490f-a44e-150b0e7d6985',
            },
          ],
        },
      });
    }
    if (path === '/indexer-search/grab') {
      handoffs.push(route.request().postDataJSON());
      return route.fulfill({ status: 202, json: { submitted: true } });
    }
    return route.fulfill({ json: {} });
  });

  await page.goto('/indexer-search?category=adult&query=Dune');
  await expect(
    page.getByRole('combobox', { name: 'Media Category' })
  ).toHaveValue('ebook');
  await expect(page.getByRole('option', { name: 'Adult' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Search Indexers' }).click();
  await expect(page.getByText('First Result')).toBeVisible();
  await expect(page.getByText('Hidden Indexer')).toHaveCount(0);
  await expect(
    page.getByRole('link', { name: 'Open Indexer Details' })
  ).toHaveCount(0);
  await page
    .getByRole('searchbox', { name: 'Search Terms' })
    .fill('Next query');
  await page.getByRole('button', { name: 'Load More Results' }).click();
  await expect(page.getByText('Second Result')).toBeVisible();
  expect(searches).toEqual([
    { category: 'ebook', query: 'Dune', offset: 0 },
    { category: 'ebook', query: 'Dune', offset: 50 },
  ]);
  await page.getByRole('button', { name: 'Send to Downloader' }).click();
  await expect(
    page.getByText('Sent to Prowlarr’s configured download client.')
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Send to Downloader' })
  ).toHaveCount(0);
  expect(handoffs).toEqual([
    { grabId: 'df924acb-ad33-490f-a44e-150b0e7d6985' },
  ]);
});

test('indexer search rejects a direct route without Manage Requests', async ({
  page,
}) => {
  const indexerCalls: string[] = [];
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.includes('/indexer-search/')) indexerCalls.push(path);
    return route.fulfill({
      json: path.endsWith('/auth/me') ? { id: 2, permissions: 32 } : {},
    });
  });
  await page.goto('/indexer-search');
  await expect(
    page.getByText('You need Manage Requests permission to search indexers.')
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Indexer Search' })).toHaveCount(
    0
  );
  expect(indexerCalls).toEqual([]);
});
