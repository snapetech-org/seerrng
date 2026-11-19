import { expect, test } from '@playwright/test';

test('Indexer Search is reachable from the permission-aware mobile You menu', async ({
  page,
}) => {
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname.slice(
      '/api/v1'.length
    );
    return route.fulfill({
      json:
        path === '/auth/me'
          ? { id: 1, displayName: 'Operator', permissions: 16 }
          : path === '/settings/public'
            ? { mediaServerType: 1 }
            : path === '/indexer-search/configuration'
              ? { configured: true, categories: [] }
              : {},
    });
  });

  await page.goto('/me');
  const desktop = (page.viewportSize()?.width ?? 0) >= 1040;
  if (!desktop) {
    await page
      .getByRole('navigation', { name: 'Tabs', exact: true })
      .getByRole('link', { name: 'You', exact: true })
      .click();
  }
  const link = desktop
    ? page
        .getByRole('navigation', { name: 'Main', exact: true })
        .getByRole('link', { name: 'Indexer Search', exact: true })
    : page.getByRole('link', { name: 'Open Indexer Search', exact: true });
  await expect(link).toBeVisible();
  await link.click();
  await expect(page).toHaveURL(/\/indexer-search$/);
  await expect(
    page.getByText(
      'No configured media categories are available to this account.',
      {
        exact: true,
      }
    )
  ).toBeVisible();
});

test('Indexer Search is absent from the You menu without permission', async ({
  page,
}) => {
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/api/v1/**', (route) =>
    route.fulfill({
      json: new URL(route.request().url()).pathname.endsWith('/auth/me')
        ? { id: 1, displayName: 'Viewer', permissions: 32 }
        : {},
    })
  );

  await page.goto('/me');
  await expect(
    page.getByRole('link', { name: 'Open Indexer Search', exact: true })
  ).toHaveCount(0);
});

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

for (const permissions of [16, 32]) {
  test(`movie shortcuts respect permission ${permissions} and never run search automatically`, async ({
    page,
  }) => {
    let searches = 0;
    await page.route('https://**/*', (route) => route.abort());
    await page.route('**/api/v1/**', (route) => {
      const path = new URL(route.request().url()).pathname.slice(
        '/api/v1'.length
      );
      if (path === '/auth/me')
        return route.fulfill({
          json: { id: 1, displayName: 'Viewer', permissions },
        });
      if (path === '/movie/20')
        return route.fulfill({
          json: { id: 20, title: ' Dune & Friends ', genres: [] },
        });
      if (path === '/indexer-search/configuration')
        return route.fulfill({
          json: {
            configured: true,
            showIndexerDetails: false,
            categories: [
              { category: 'movie', categoryIds: [2000], enabled: true },
            ],
          },
        });
      if (path === '/indexer-search/search') searches++;
      return route.fulfill({ json: { results: [] } });
    });
    await page.goto('/movie/20');
    await expect(
      page.getByRole('heading', { name: 'Dune & Friends' })
    ).toBeVisible();
    const shortcut = page.getByRole('link', { name: 'Search Prowlarr' });
    if (permissions === 32) {
      await expect(shortcut).toHaveCount(0);
      return;
    }
    await shortcut.click();
    await expect(
      page.getByRole('searchbox', { name: 'Search Terms' })
    ).toHaveValue('Dune & Friends');
    await expect(
      page.getByRole('combobox', { name: 'Media Category' })
    ).toHaveValue('movie');
    expect(searches).toBe(0);
  });
}
