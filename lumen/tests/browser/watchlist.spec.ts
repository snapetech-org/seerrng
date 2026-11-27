import { expect, test, type Locator } from '@playwright/test';

const testMount = process.env.LUMEN_TEST_MOUNT === '/lumen' ? '/lumen' : '';
const testAppPath = (path: string) => `${testMount}${path}`;
const testApiPath = (url: string) =>
  new URL(url).pathname.replace(/^\/lumen(?=\/)/, '').replace(/^\/api\/v1/, '');

async function expectRouteLink(link: Locator, path: string) {
  const href = await link.getAttribute('href');
  expect(href).not.toBeNull();
  expect(new URL(href!, 'http://lumen.local').pathname).toBe(testAppPath(path));
}

test('empty Watchlist distinguishes the first page from an empty later page', async ({
  page,
}, info) => {
  const requestedLocale = process.env.LUMEN_ISSUE742_LOCALE;
  const locale =
    requestedLocale === 'fr' || requestedLocale === 'ar'
      ? requestedLocale
      : 'en';
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/api/v1/**', (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(/^\/lumen(?=\/)/, '').slice(7);
    if (path === '/auth/me')
      return route.fulfill({
        json: { id: 1, displayName: 'Administrator', permissions: 2 },
      });
    if (path === '/user/1/settings/main')
      return route.fulfill({ json: { locale } });
    if (path === '/user/2/watchlist')
      return route.fulfill({
        json: {
          filtersSupported: true,
          totalPages: url.searchParams.get('page') === '2' ? 2 : 1,
          results: [],
        },
      });
    return route.fulfill({ json: {} });
  });

  await page.goto(testAppPath('/watchlist/user/2'));
  await expect(
    page.getByText(
      process.env.LUMEN_ISSUE742_BASELINE === 'true'
        ? {
            en: 'No titles on this page.',
            fr: 'Aucun titre sur cette page.',
            ar: 'لا توجد عناوين في هذه الصفحة.',
          }[locale]
        : {
            en: 'Your Watchlist is empty.',
            fr: 'Votre liste de suivi est vide.',
            ar: 'قائمة المشاهدة فارغة.',
          }[locale],
      { exact: true }
    )
  ).toBeVisible();
  if (locale === 'en' && ['desktop', 'iphone'].includes(info.project.name))
    await page.screenshot({
      path: info.outputPath('watchlist-empty.png'),
      animations: 'disabled',
    });

  await page.goto(testAppPath('/watchlist/user/2?page=2'));
  await expect(
    page.getByText(
      {
        en: 'No titles on this page.',
        fr: 'Aucun titre sur cette page.',
        ar: 'لا توجد عناوين في هذه الصفحة.',
      }[locale],
      { exact: true }
    )
  ).toBeVisible();
});

test('Watchlist renders linked poster cards for every supported media category', async ({
  page,
}) => {
  const detailRequests = new Set<string>();
  const items: {
    id: number;
    tmdbId?: number;
    mbId?: string;
    externalId?: string;
    mediaType: 'movie' | 'tv' | 'music' | 'book' | 'comic' | 'magazine';
    title: string;
  }[] = [
    { id: 51, tmdbId: 51, mediaType: 'movie', title: 'Fixture Movie' },
    { id: 52, tmdbId: 52, mediaType: 'tv', title: 'Fixture Series' },
    {
      id: 53,
      mbId: 'mb-53',
      mediaType: 'music',
      title: 'Fixture Album',
    },
    {
      id: 54,
      externalId: 'book-54',
      mediaType: 'book',
      title: 'Fixture Book',
    },
    {
      id: 55,
      externalId: 'comic-55',
      mediaType: 'comic',
      title: 'Fixture Comic',
    },
    {
      id: 56,
      externalId: 'mag-56',
      mediaType: 'magazine',
      title: 'Fixture Magazine',
    },
  ];
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/api/v1/**', (route) => {
    const path = testApiPath(route.request().url());
    if (path === '/auth/me')
      return route.fulfill({
        json: { id: 1, displayName: 'Reader', permissions: 32 },
      });
    if (path === '/user/1/settings/main')
      return route.fulfill({
        json: {
          enabledMediaCategories: {
            movie: true,
            tv: true,
            music: true,
            ebook: true,
            audiobook: true,
            comic: true,
            magazine: true,
          },
        },
      });
    if (path === '/settings/public')
      return route.fulfill({
        json: {
          applicationTitle: 'SeerrNG',
          enabledMediaCategories: {
            movie: true,
            tv: true,
            music: true,
            ebook: true,
            audiobook: true,
            comic: true,
            magazine: true,
          },
        },
      });
    if (path === '/user/1/watchlist')
      return route.fulfill({
        json: { filtersSupported: true, totalPages: 1, results: items },
      });
    if (
      items.some(
        (item) =>
          path ===
          `/${item.mediaType}/${item.tmdbId ?? item.mbId ?? item.externalId}`
      )
    ) {
      detailRequests.add(path);
      const item = items.find(
        (candidate) =>
          path ===
          `/${candidate.mediaType}/${candidate.tmdbId ?? candidate.mbId ?? candidate.externalId}`
      )!;
      return route.fulfill({
        json: {
          id: item.tmdbId ?? item.mbId ?? item.externalId,
          title: item.title,
          name: item.title,
          posterPath:
            item.mediaType === 'movie' || item.mediaType === 'tv'
              ? '/watchlist-fixture.svg'
              : '/imageproxy/fixtures/poster.svg',
          releaseDate: '2025-01-01',
          firstAirDate: '2025-01-01',
          author: 'Fixture Author',
          publisher: 'Fixture Publisher',
          artist: { name: 'Fixture Artist' },
        },
      });
    }
    return route.fulfill({ json: {} });
  });
  await page.route('**/imageproxy/**', (route) =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2 3"><rect width="2" height="3" fill="#6270d9"/></svg>',
    })
  );

  await page.goto(testAppPath('/watchlist'));
  const cards = page.getByRole('list', { name: 'Watchlist' });
  await expect(cards.getByRole('listitem')).toHaveCount(items.length);
  for (const [index, item] of items.entries()) {
    const card = cards.getByRole('listitem').nth(index);
    await expect(card.getByRole('link', { name: item.title })).toBeVisible();
    const id = item.tmdbId ?? item.mbId ?? item.externalId;
    await expectRouteLink(
      card.getByRole('link', { name: item.title }),
      `/${item.mediaType}/${id}`
    );
    await card.scrollIntoViewIfNeeded();
    await expect(card.locator('.art img')).toBeVisible();
    await expect
      .poll(() => detailRequests.has(`/${item.mediaType}/${id}`))
      .toBe(true);
  }
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth)
  ).toBeLessThanOrEqual(page.viewportSize()!.width);
});

test('directory Watchlist and Requests links scope reads to the selected user', async ({
  page,
}) => {
  const queries: URLSearchParams[] = [];
  let scopedRequests = false;
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/api/v1/**', (route) => {
    const path = testApiPath(route.request().url());
    const url = new URL(route.request().url());
    switch (path) {
      case '/auth/me':
        return route.fulfill({
          json: { id: 1, displayName: 'Administrator', permissions: 2 },
        });
      case '/user':
        return route.fulfill({
          json: {
            pageInfo: { pages: 1 },
            results: [{ id: 19, displayName: 'Viewer', permissions: 32 }],
          },
        });
      case '/user/19/watchlist':
        expect(route.request().method()).toBe('GET');
        queries.push(url.searchParams);
        return route.fulfill({
          json: {
            filtersSupported: true,
            totalPages: 2,
            results: [
              {
                id: 20,
                ratingKey: 'local20',
                tmdbId: 20,
                title: 'Example Movie',
                mediaType: 'movie',
              },
            ],
          },
        });
      case '/request':
      case '/request/status':
        if (url.searchParams.get('requestedBy') === '19') scopedRequests = true;
        return route.fulfill({
          json: { results: [], pageInfo: { results: 0, pages: 1 } },
        });
      default:
        return route.fulfill({ json: {} });
    }
  });

  await page.goto(testAppPath('/admin/users'));
  await page.getByRole('link', { name: 'View Watchlist for Viewer' }).click();
  await expect(
    page.getByRole('heading', { name: 'User Watchlist' })
  ).toBeVisible();
  await expectRouteLink(
    page.getByRole('link', { name: 'Example Movie' }),
    '/movie/20'
  );
  await expect(
    page.getByRole('button', { name: /remove.*watchlist/i })
  ).toHaveCount(0);
  await page.getByRole('searchbox', { name: 'Search Titles' }).fill('Example');
  await page.getByRole('button', { name: 'Apply Filters' }).click();
  await page.getByRole('button', { name: 'Next Page' }).click();
  await expect
    .poll(() => queries.at(-1)?.toString())
    .toBe('search=Example&page=2');
  await page.getByRole('link', { name: 'Back to User' }).click();
  await expect(page).toHaveURL(/\/admin\/users\/19$/);
  await page.getByRole('link', { name: 'View Requests for Viewer' }).click();
  await expect(page).toHaveURL(/\/requests\?requestedBy=19$/);
  await expect.poll(() => scopedRequests).toBe(true);
});

test('a user manager without watchlist authority cannot load another user’s watchlist', async ({
  page,
}) => {
  let requested = false;
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/api/v1/**', (route) => {
    const { pathname } = new URL(route.request().url());
    if (pathname.endsWith('/watchlist')) requested = true;
    return route.fulfill({
      json: pathname.endsWith('/auth/me')
        ? { id: 2, displayName: 'Manager', permissions: 8 }
        : {},
    });
  });
  await page.goto(testAppPath('/watchlist/user/19'));
  await expect(page.getByText('This watchlist is unavailable.')).toBeVisible();
  expect(requested).toBe(false);
});

test('delegated Watchlist does not filter target results by viewer categories', async ({
  page,
}, info) => {
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/api/v1/**', (route) => {
    const path = testApiPath(route.request().url());
    if (path === '/auth/me') {
      return route.fulfill({
        json: { id: 1, displayName: 'Administrator', permissions: 2 },
      });
    }
    if (path === '/settings/public') {
      return route.fulfill({
        json: { enabledMediaCategories: { movie: true, tv: true } },
      });
    }
    if (path === '/user/1/settings/main') {
      return route.fulfill({
        json: { enabledMediaCategories: { movie: false, tv: true } },
      });
    }
    if (path === '/user/19/watchlist') {
      return route.fulfill({
        json: {
          filtersSupported: true,
          totalPages: 1,
          results: [
            {
              id: 20,
              ratingKey: 'local20',
              tmdbId: 20,
              title: 'Target Movie',
              mediaType: 'movie',
            },
          ],
        },
      });
    }
    return route.fulfill({ json: {} });
  });

  await page.goto(testAppPath('/watchlist/user/19'));
  await expect(
    page.getByRole('heading', { name: 'User Watchlist' })
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath('delegated-watchlist-categories.png'),
    fullPage: true,
  });
  await expect(page.getByRole('link', { name: 'Target Movie' })).toBeVisible();
  await expect(page.getByRole('option', { name: 'Movies' })).toHaveCount(1);
});

for (const combined of [false, true]) {
  test(`personal Watchlist handles ${combined ? 'combined Plex' : 'local'} results`, async ({
    page,
  }) => {
    let deleted = false;
    const queries: URLSearchParams[] = [];
    await page.route('https://**/*', (route) => route.abort());
    await page.route('**/api/v1/**', (route) => {
      const url = new URL(route.request().url());
      const path = testApiPath(route.request().url());
      if (path === '/user/1/watchlist') {
        queries.push(url.searchParams);
        return route.fulfill({
          json: {
            filtersSupported: !combined,
            totalPages: 2,
            results: deleted
              ? []
              : [
                  {
                    id: 99,
                    ratingKey: 'local99',
                    tmdbId: 20,
                    title: 'Example Movie',
                    mediaType: 'movie',
                  },
                ],
          },
        });
      }
      if (path === '/watchlist/20' && route.request().method() === 'DELETE') {
        expect(combined).toBe(false);
        expect(url.searchParams.get('mediaType')).toBe('movie');
        deleted = true;
        return route.fulfill({ status: 204 });
      }
      return route.fulfill({
        json:
          path === '/auth/me'
            ? { id: 1, displayName: 'Reader', permissions: 32 }
            : {},
      });
    });
    await page.goto(testAppPath('/me'));
    await page.getByRole('link', { name: 'Open Watchlist' }).click();
    await expect(
      page.getByRole('heading', { name: 'Watchlist' })
    ).toBeVisible();
    await expectRouteLink(
      page.getByRole('link', { name: 'Example Movie' }),
      '/movie/20'
    );
    if (combined) {
      await expect(
        page.getByText('Plex and SeerrNG items share this list.', {
          exact: false,
        })
      ).toBeVisible();
      await expect(
        page.getByRole('button', { name: 'Apply Filters' })
      ).toHaveCount(0);
      await expect(
        page.getByRole('button', {
          name: 'Remove Example Movie from Watchlist',
        })
      ).toHaveCount(0);
    } else {
      await page.getByLabel('Search Titles').fill('Example');
      await page.getByLabel('Media Type').selectOption('movie');
      await page.getByLabel('Sort By').selectOption('title-asc');
      await page.getByRole('button', { name: 'Apply Filters' }).click();
      await expect
        .poll(() => Object.fromEntries(queries.at(-1) ?? []))
        .toMatchObject({
          search: 'Example',
          mediaType: 'movie',
          sortBy: 'title-asc',
          page: '1',
        });
    }
    await page.getByRole('button', { name: 'Next Page' }).click();
    await expect.poll(() => queries.at(-1)?.get('page')).toBe('2');
    if (!combined) {
      await page
        .getByRole('button', { name: 'Remove Example Movie from Watchlist' })
        .click();
      await expect(page.getByText('No titles on this page.')).toBeVisible();
      expect(deleted).toBe(true);
    }
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth)
    ).toBeLessThanOrEqual(page.viewportSize()!.width);
  });
}

test('Watchlist returns to the last page after removing its final entry', async ({
  page,
}) => {
  let removed = false;
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/api/v1/**', (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/user/1/watchlist')) {
      const first = url.searchParams.get('page') === '1';
      return route.fulfill({
        json: {
          filtersSupported: true,
          totalPages: removed ? 1 : 2,
          results:
            first || !removed
              ? [
                  {
                    id: first ? 10 : 20,
                    tmdbId: first ? 10 : 20,
                    ratingKey: first ? 'first' : 'last',
                    mediaType: 'movie',
                    title: first ? 'First Movie' : 'Last Movie',
                  },
                ]
              : [],
        },
      });
    }
    if (
      url.pathname.endsWith('/watchlist/20') &&
      route.request().method() === 'DELETE'
    ) {
      removed = true;
      return route.fulfill({ status: 204 });
    }
    return route.fulfill({
      json: url.pathname.endsWith('/auth/me')
        ? { id: 1, displayName: 'Viewer', permissions: 32 }
        : {},
    });
  });
  await page.goto(testAppPath('/watchlist?search=Movie&page=2'));
  await page
    .getByRole('button', { name: 'Remove Last Movie from Watchlist' })
    .click();
  await expect(page).toHaveURL(/\/watchlist\?search=Movie$/);
  await expect(page.getByRole('link', { name: 'First Movie' })).toBeVisible();
});

test('combined Watchlist removes the SeerrNG entry and retains its Plex match', async ({
  page,
}) => {
  let removed = false;
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/api/v1/**', (route) => {
    const { pathname } = new URL(route.request().url());
    if (pathname.endsWith('/user/1/watchlist')) {
      return route.fulfill({
        json: {
          filtersSupported: false,
          totalPages: 1,
          results: [
            {
              id: 20,
              tmdbId: 20,
              ratingKey: removed ? 'plex20' : 'local20',
              mediaType: 'movie',
              title: 'Example Movie',
              source: removed ? 'plex' : 'local',
            },
          ],
        },
      });
    }
    if (
      pathname.endsWith('/watchlist/20') &&
      route.request().method() === 'DELETE'
    ) {
      removed = true;
      return route.fulfill({ status: 204 });
    }
    return route.fulfill({
      json: pathname.endsWith('/auth/me')
        ? { id: 1, displayName: 'Viewer', permissions: 32 }
        : {},
    });
  });
  await page.goto(testAppPath('/watchlist'));
  const remove = page.getByRole('button', {
    name: 'Remove Example Movie from Watchlist',
  });
  await remove.click();
  await expect(remove).toHaveCount(0);
  await expectRouteLink(
    page.getByRole('link', { name: 'Example Movie' }),
    '/movie/20'
  );
  expect(removed).toBe(true);
});

test('video Watchlist action confirms the current title and server response', async ({
  page,
}) => {
  let saved = false;
  let writes = 0;
  let failDeleteReadback = false;
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/api/v1/**', (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = testApiPath(route.request().url());
    if (path === '/watchlist' && request.method() === 'POST') {
      expect(request.postDataJSON()).toEqual({
        tmdbId: 20,
        mediaType: 'movie',
      });
      writes++;
      saved = true;
      return route.fulfill({ status: 201, json: { id: 99 } });
    }
    if (path === '/watchlist/20' && request.method() === 'DELETE') {
      expect(url.searchParams.get('mediaType')).toBe('movie');
      writes++;
      saved = false;
      failDeleteReadback = true;
      return route.fulfill({ status: 204 });
    }
    if (path === '/movie/20' && failDeleteReadback) {
      failDeleteReadback = false;
      return route.fulfill({ status: 503, json: { message: 'Unavailable' } });
    }
    return route.fulfill({
      json:
        path === '/auth/me'
          ? { id: 1, displayName: 'Reader', permissions: 32, userType: 2 }
          : path === '/movie/20'
            ? {
                id: 20,
                title: 'Example Movie',
                genres: [],
                onUserWatchlist: saved,
              }
            : { results: [] },
    });
  });
  await page.goto(testAppPath('/movie/20'));
  await page
    .getByRole('button', { name: 'Add Example Movie to your Watchlist' })
    .first()
    .click();
  await expect(
    page.getByRole('button', {
      name: 'Remove Example Movie from your Watchlist',
    })
  ).toHaveCount(1);
  expect(writes).toBe(1);
  await page.reload();
  const remove = page
    .getByRole('button', { name: 'Remove Example Movie from your Watchlist' })
    .first();
  await remove.click();
  await expect(
    page.getByText('Couldn’t confirm the Watchlist change.')
  ).toBeVisible();
  await expect(remove).toBeVisible();
  await remove.click();
  await expect(
    page.getByRole('button', { name: 'Add Example Movie to your Watchlist' })
  ).toHaveCount(3);
  expect(writes).toBe(2);
});

test('Watchlist uses the Open Library work ID and never substitutes a Bookshelf ID', async ({
  page,
}) => {
  const work = 'OL123W';
  const bookshelf = 'bookshelf:1:MjYwNDY4';
  let saved = false;
  let writes = 0;
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/api/v1/**', (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = decodeURIComponent(testApiPath(route.request().url()));
    if (path === '/watchlist' && request.method() === 'POST') {
      expect(request.postDataJSON()).toEqual({
        mediaType: 'book',
        externalId: work,
        title: 'Example Book',
      });
      saved = true;
      writes++;
      return route.fulfill({ status: 201, json: { id: 99 } });
    }
    if (path === `/watchlist/${work}` && request.method() === 'DELETE') {
      expect(url.searchParams.get('mediaType')).toBe('book');
      saved = false;
      writes++;
      return route.fulfill({ status: 204 });
    }
    return route.fulfill({
      json:
        path === '/auth/me'
          ? { id: 1, displayName: 'Reader', permissions: 32, userType: 2 }
          : path === '/settings/public'
            ? {
                booksEnabled: true,
                ebookServiceEnabled: true,
                enabledMediaCategories: { ebook: true },
              }
            : path === `/book/${work}` || path === `/book/${bookshelf}`
              ? {
                  id: path.slice(6),
                  title: 'Example Book',
                  bookFormat: 'ebook',
                  description: 'A fixture.',
                  onUserWatchlist: saved,
                }
              : {},
    });
  });
  await page.goto(testAppPath(`/book/${work}`));
  const add = page.getByRole('button', {
    name: 'Add Example Book to your Watchlist',
  });
  const remove = page.getByRole('button', {
    name: 'Remove Example Book from your Watchlist',
  });
  await add.click();
  await expect(remove).toBeVisible();
  await remove.click();
  await expect(add).toBeVisible();
  expect(writes).toBe(2);
  await page.goto(testAppPath(`/book/${encodeURIComponent(bookshelf)}`));
  await expect(
    page.getByRole('heading', { name: 'Example Book' })
  ).toBeVisible();
  await expect(add.or(remove)).toHaveCount(0);
  expect(writes).toBe(2);
});

test('Discover Watchlist uses the discovery endpoint and configured media categories', async ({
  page,
}) => {
  const paths: string[] = [];
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/api/v1/**', (route) => {
    const path = testApiPath(route.request().url());
    const url = new URL(route.request().url());
    if (path.endsWith('/watchlist')) {
      paths.push(path + url.search);
      return route.fulfill({
        json: {
          filtersSupported: true,
          totalPages: 2,
          results: [
            {
              ratingKey: '1',
              tmdbId: 20,
              title: 'Movie Result',
              mediaType: 'movie',
            },
            {
              ratingKey: '2',
              tmdbId: 21,
              title: 'Series Result',
              mediaType: 'tv',
            },
          ],
        },
      });
    }
    return route.fulfill({
      json:
        path === '/auth/me'
          ? { id: 1, displayName: 'Reader', permissions: 32 }
          : path === '/settings/public'
            ? { enabledMediaCategories: { tv: false } }
            : {},
    });
  });

  await page.goto(testAppPath('/watchlist'));
  await expect(page.getByRole('link', { name: 'Series Result' })).toBeVisible();
  await page.getByRole('link', { name: 'Discover Watchlist' }).click();
  await expect(
    page.getByRole('heading', { name: 'Discover Watchlist' })
  ).toBeVisible();
  await expectRouteLink(
    page.getByRole('link', { name: 'Movie Result' }),
    '/movie/20'
  );
  await expect(page.getByRole('link', { name: 'Series Result' })).toHaveCount(
    0
  );
  await expect(
    page.getByLabel('Media Type').locator('option[value="tv"]')
  ).toHaveCount(0);

  await page.getByLabel('Search Titles').fill('Movie');
  await page.getByRole('button', { name: 'Apply Filters' }).click();
  await page.getByRole('button', { name: 'Next Page' }).click();
  await expect
    .poll(() => paths.at(-1))
    .toBe('/discover/watchlist?search=Movie&page=2');
  await page.getByRole('link', { name: 'Personal Watchlist' }).click();
  await expect(page.getByRole('link', { name: 'Series Result' })).toBeVisible();
  expect(paths[0]).toBe('/user/1/watchlist?page=1');
});
