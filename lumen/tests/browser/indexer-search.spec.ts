import { expect, test } from '@playwright/test';

const mount = process.env.LUMEN_TEST_MOUNT === '/lumen' ? '/lumen' : '';
const appPath = (path: string) => `${mount}${path}`;

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

  await page.goto(appPath('/me'));
  const desktop = (page.viewportSize()?.width ?? 0) >= 1040;
  if (!desktop) {
    await page
      .getByRole('navigation', { name: 'Tabs', exact: true })
      .locator(`a[href="${appPath('/me')}"]`)
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
      'No enabled media categories are available to this account.',
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

  await page.goto(appPath('/me'));
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

  await page.goto(appPath('/indexer-search?category=adult&query=Dune'));
  await expect(
    page.getByRole('combobox', { name: 'Media category' })
  ).toHaveValue('ebook');
  await expect(page.getByRole('option', { name: 'Adult' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Search indexers' }).click();
  await expect(page.getByText('First Result')).toBeVisible();
  await expect(page.getByText('Hidden Indexer')).toHaveCount(0);
  await expect(
    page.getByRole('link', { name: 'Open indexer details' })
  ).toHaveCount(0);
  await page
    .getByRole('searchbox', { name: 'Search terms' })
    .fill('Next query');
  await page.getByRole('button', { name: 'Load more results' }).click();
  await expect(page.getByText('Second Result')).toBeVisible();
  expect(searches).toEqual([
    { category: 'ebook', query: 'Dune', offset: 0 },
    { category: 'ebook', query: 'Dune', offset: 50 },
  ]);
  await page.getByRole('button', { name: 'Send to downloader' }).click();
  await expect(
    page.getByText('Sent to Prowlarr’s configured download client.')
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Send to downloader' })
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
  await page.goto(appPath('/indexer-search'));
  await expect(
    page.getByText('You need Manage Requests permission to search indexers.')
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Indexer Search' })).toHaveCount(
    0
  );
  expect(indexerCalls).toEqual([]);
});

test('Indexer Search follows the saved locale and localizes results and handoff', async ({
  page,
}) => {
  const locale = ['en', 'fr', 'ar'].includes(
    process.env.LUMEN_INDEXER_LOCALE ?? ''
  )
    ? (process.env.LUMEN_INDEXER_LOCALE as 'en' | 'fr' | 'ar')
    : 'en';
  const labels = {
    en: {
      title: 'Indexer Search',
      search: 'Search indexers',
      category: 'Media category',
      query: 'Search terms',
      send: 'Send to downloader',
      sent: 'Sent to Prowlarr’s configured download client.',
      failure:
        'Handoff could not be confirmed. Check the client before searching and trying again.',
    },
    fr: {
      title: 'Recherche d’indexeurs',
      search: 'Rechercher dans les indexeurs',
      category: 'Catégorie médias',
      query: 'Termes de recherche',
      send: 'Envoyer vers le téléchargeur',
      sent: 'Envoyé au client de téléchargement configuré par Prowlarr.',
      failure:
        'Le résultat a peut-être été envoyé. Vérifiez le client avant de rechercher ou de réessayer.',
    },
    ar: {
      title: 'البحث عن المفهرسات',
      search: 'ابحث في مواقع الفهرسة',
      category: 'فئة وسائط الإعلام',
      query: 'مصطلحات البحث',
      send: 'إرسال إلى المُحمِّل',
      sent: 'تم الإرسال إلى عميل التحميل المُهيأ لدى Prowlarr.',
      failure:
        'تعذّر التأكد من إرسال النتيجة. تحقّق من عميل التنزيل قبل البحث أو إعادة المحاولة.',
    },
  } as const;
  const expected =
    process.env.LUMEN_CAPTURE_MODE === 'baseline'
      ? {
          ...labels.en,
          search: 'Search Indexers',
          category: 'Media Category',
          query: 'Search Terms',
          send: 'Send to Downloader',
        }
      : labels[locale];
  let submitted: unknown;
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname.slice(
      '/api/v1'.length
    );
    if (path === '/auth/me')
      return route.fulfill({
        json: { id: 1, displayName: 'Operator', permissions: 16 },
      });
    if (path === '/user/1/settings/main')
      return route.fulfill({ json: { locale } });
    if (path === '/indexer-search/configuration')
      return route.fulfill({
        json: {
          configured: true,
          showIndexerDetails: true,
          categories: [
            { category: 'movie', categoryIds: [2000], enabled: true },
          ],
        },
      });
    if (path === '/indexer-search/search') {
      submitted = route.request().postDataJSON();
      return route.fulfill({
        json: {
          limit: 50,
          hasMore: false,
          results: [
            {
              title: 'Fixture Release',
              indexer: 'Fixture Indexer',
              protocol: 'usenet',
              size: 1048576,
              infoUrl: null,
              grabs: 12,
              seeders: null,
              leechers: null,
              publishDate: '2026-11-19T00:00:00Z',
              categories: [],
              grabId: 'one-use-handle',
            },
            {
              title: 'Uncertain Fixture',
              indexer: 'Fixture Indexer',
              protocol: 'usenet',
              size: 1048576,
              infoUrl: null,
              grabs: null,
              seeders: null,
              leechers: null,
              publishDate: null,
              categories: [],
              grabId: 'uncertain-handle',
            },
          ],
        },
      });
    }
    if (path === '/indexer-search/grab') {
      return route.request().postDataJSON().grabId === 'uncertain-handle'
        ? route.fulfill({ status: 503, json: { submitted: false } })
        : route.fulfill({ status: 202, json: { submitted: true } });
    }
    return route.fulfill({ json: {} });
  });
  await page.goto(appPath('/indexer-search'));
  await expect(
    page.getByRole('heading', { name: expected.title })
  ).toBeVisible();
  await expect(
    page.getByRole('combobox', { name: expected.category })
  ).toBeVisible();
  await expect(
    page.getByRole('searchbox', { name: expected.query })
  ).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute(
    'dir',
    locale === 'ar' ? 'rtl' : 'ltr'
  );
  await page.getByRole('searchbox', { name: expected.query }).fill('Dune');
  await page.getByRole('button', { name: expected.search }).click();
  await expect(page.getByText('Fixture Release')).toBeVisible();
  expect(submitted).toEqual({ category: 'movie', query: 'Dune', offset: 0 });
  const first = page
    .getByRole('listitem')
    .filter({ hasText: 'Fixture Release' });
  await expect(
    first.getByRole('button', { name: expected.send })
  ).toBeVisible();
  await first.getByRole('button', { name: expected.send }).click();
  await expect(first.getByRole('status')).toHaveText(expected.sent);
  const uncertain = page
    .getByRole('listitem')
    .filter({ hasText: 'Uncertain Fixture' });
  await uncertain.getByRole('button', { name: expected.send }).click();
  await expect(uncertain.getByRole('alert')).toHaveText(expected.failure);
  const dimensions = await page.locator('body').evaluate((element) => ({
    scroll: element.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.client);
  if (process.env.LUMEN_CAPTURE_MODE !== 'baseline')
    await page.screenshot({
      path: `${process.env.LUMEN_CAPTURE_DIR}/indexer-${locale}-${page.viewportSize()?.width}.png`,
      fullPage: true,
    });
  if (process.env.LUMEN_CAPTURE_MODE === 'baseline')
    await page.screenshot({
      path: `${process.env.LUMEN_CAPTURE_DIR}/indexer-${locale}-${page.viewportSize()?.width}.png`,
      fullPage: true,
    });
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
    await page.goto(appPath('/movie/20'));
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
      page.getByRole('searchbox', { name: 'Search terms' })
    ).toHaveValue('Dune & Friends');
    await expect(
      page.getByRole('combobox', { name: 'Media category' })
    ).toHaveValue('movie');
    expect(searches).toBe(0);
  });
}
