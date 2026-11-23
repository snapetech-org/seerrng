import { expect, test } from '@playwright/test';

test('native populated Indexer Search reference', async ({ page }) => {
  await page.setViewportSize({
    width: page.viewportSize()?.width ?? 1440,
    height: 900,
  });
  const login = await page.request.post('/api/v1/auth/local', {
    data: { email: 'admin@seerr.dev', password: 'test1234' },
  });
  expect(login.status()).toBe(200);
  const theme = await page.request.post(
    '/api/v1/user/1/settings/interface-theme',
    {
      data: { theme: 'seerrNGJ' },
    }
  );
  expect(theme.status()).toBe(200);

  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/api/v1/user/1/settings/main', (route) =>
    route.fulfill({ json: { locale: 'en' } })
  );
  await page.route('**/api/v1/settings/public', (route) =>
    route.fulfill({
      json: {
        booksEnabled: true,
        ebookServiceEnabled: true,
        enabledMediaCategories: { ebook: true },
      },
    })
  );
  await page.route('**/api/v1/indexer-search/configuration', (route) =>
    route.fulfill({
      json: {
        configured: true,
        showIndexerDetails: true,
        categories: [{ category: 'ebook', categoryIds: [7000] }],
      },
    })
  );
  await page.route('**/api/v1/indexer-search/search', (route) =>
    route.fulfill({
      json: {
        category: 'ebook',
        query: 'Dune',
        offset: 0,
        limit: 50,
        hasMore: false,
        results: [
          {
            title: 'First Result',
            indexer: 'Example Indexer',
            size: 512,
            seeders: 3,
            leechers: 1,
            grabs: 12,
            protocol: 'usenet',
            publishDate: '2026-11-01T00:00:00.000Z',
            infoUrl: 'https://indexer.example/result',
            grabId: 'opaque-handoff-handle',
            categories: [{ id: 7000, name: 'Books' }],
          },
          {
            title: 'Large Result',
            indexer: 'Example Indexer',
            size: 1610612736,
            seeders: null,
            leechers: null,
            grabs: null,
            protocol: 'usenet',
            publishDate: null,
            infoUrl: null,
            grabId: null,
            categories: [],
          },
        ],
      },
    })
  );

  await page.goto('/indexer-search?category=ebook&query=Dune');
  await expect(
    page.getByRole('heading', { name: 'Indexer Search' })
  ).toBeVisible();
  await expect(
    page.getByRole('combobox', { name: 'Media category' })
  ).toHaveValue('ebook');
  await expect(
    page.getByRole('textbox', { name: 'Search terms' })
  ).toBeVisible();
  await page.getByRole('textbox', { name: 'Search terms' }).fill('Dune');
  await page.getByRole('button', { name: 'Search indexers' }).click();
  await expect(page.getByText('First Result', { exact: true })).toBeVisible();
  await expect(page.getByText('Large Result', { exact: true })).toBeVisible();
  await expect(page.getByText(/Size: 512 B/)).toBeVisible();
  await expect(page.getByText(/Size: 1\.5 GB/)).toBeVisible();
  await expect(
    page.getByText(
      'Sending a result does not change a SeerrNG request. Prowlarr handles the handoff to its configured download client.',
      { exact: true }
    )
  ).toBeVisible();

  const captureDir = process.env.LUMEN_NATIVE_VISUAL_CAPTURE_DIR;
  if (captureDir) {
    await page.screenshot({
      path: `${captureDir}/native-indexer-results-desktop.png`,
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: `${captureDir}/native-indexer-results-phone.png`,
      fullPage: true,
    });
  }
});
