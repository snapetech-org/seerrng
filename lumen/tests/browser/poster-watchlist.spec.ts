import { expect, test } from '@playwright/test';

const testMount = process.env.LUMEN_TEST_MOUNT === '/lumen' ? '/lumen' : '';
const testAppPath = (path: string) => `${testMount}${path}`;
const testApiPath = (url: string) =>
  new URL(url).pathname.replace(/^\/lumen(?=\/)/, '').replace(/^\/api\/v1/, '');

test('movie poster Watchlist action checks current state before add and remove', async ({
  page,
}, testInfo) => {
  let listed = false;
  let detailReads = 0;
  let adds = 0;
  let removes = 0;
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/api/v1/**', (route) => {
    const path = testApiPath(route.request().url());
    if (path === '/auth/me')
      return route.fulfill({
        json: {
          id: 1,
          displayName: 'Reader',
          permissions: 32,
          userType: 2,
        },
      });
    if (path === '/settings/public')
      return route.fulfill({
        json: {
          applicationTitle: 'SeerrNG',
          movie4kEnabled: false,
          series4kEnabled: false,
          partialRequestsEnabled: false,
          booksEnabled: true,
          ebookServiceEnabled: false,
          audiobookServiceEnabled: false,
          enabledMediaCategories: { movie: true, tv: true },
        },
      });
    if (path === '/discover/movies')
      return route.fulfill({
        json: {
          page: 1,
          totalPages: 1,
          results: [
            {
              id: 101,
              title: 'Watchlist Fixture Film',
              mediaType: 'movie',
              posterPath: null,
              releaseDate: '2025-01-01',
            },
          ],
        },
      });
    if (path === '/movie/101') {
      detailReads++;
      return route.fulfill({
        json: {
          id: 101,
          title: 'Watchlist Fixture Film',
          onUserWatchlist: listed,
          mediaInfo: { status: 1 },
        },
      });
    }
    if (path === '/watchlist' && route.request().method() === 'POST') {
      adds++;
      listed = true;
      return route.fulfill({ json: { id: 500 } });
    }
    if (path === '/watchlist/101' && route.request().method() === 'DELETE') {
      expect(url.searchParams.get('mediaType')).toBe('movie');
      removes++;
      listed = false;
      return route.fulfill({ status: 204 });
    }
    if (path === '/genres/movie' || path === '/languages')
      return route.fulfill({ json: [] });
    return route.fulfill({ json: {} });
  });

  await page.goto(testAppPath('/movies'));
  const poster = page.locator('.poster').filter({
    has: page.getByRole('link', { name: 'Watchlist Fixture Film' }),
  });
  await expect(poster).toBeVisible();
  const action = poster.getByRole('button', {
    name: 'Add Watchlist Fixture Film to your Watchlist',
  });
  await poster.scrollIntoViewIfNeeded();
  if (testInfo.project.name === 'desktop') await poster.hover();
  await expect(action).toBeVisible();
  expect(detailReads).toBe(0);

  await action.click();
  await expect.poll(() => adds).toBe(1);
  await expect(
    poster.getByRole('button', {
      name: 'Remove Watchlist Fixture Film from your Watchlist',
    })
  ).toBeVisible();
  expect(detailReads).toBe(1);
  expect(removes).toBe(0);

  await poster
    .getByRole('button', {
      name: 'Remove Watchlist Fixture Film from your Watchlist',
    })
    .click();
  await expect.poll(() => removes).toBe(1);
  expect(detailReads).toBe(2);
  expect(listed).toBe(false);
});

test('first poster activation never removes an item already on the Watchlist', async ({
  page,
}) => {
  let detailReads = 0;
  let mutations = 0;
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/api/v1/**', (route) => {
    const path = testApiPath(route.request().url());
    if (path === '/auth/me')
      return route.fulfill({
        json: {
          id: 1,
          displayName: 'Reader',
          permissions: 32,
          userType: 2,
        },
      });
    if (path === '/settings/public')
      return route.fulfill({
        json: {
          applicationTitle: 'SeerrNG',
          movie4kEnabled: false,
          series4kEnabled: false,
          partialRequestsEnabled: false,
          booksEnabled: true,
          ebookServiceEnabled: false,
          audiobookServiceEnabled: false,
          enabledMediaCategories: { movie: true, tv: true },
        },
      });
    if (path === '/discover/movies')
      return route.fulfill({
        json: {
          page: 1,
          totalPages: 1,
          results: [
            { id: 101, title: 'Saved Fixture Film', mediaType: 'movie' },
          ],
        },
      });
    if (path === '/movie/101') {
      detailReads++;
      return route.fulfill({
        json: {
          id: 101,
          title: 'Saved Fixture Film',
          onUserWatchlist: true,
          mediaInfo: { status: 1 },
        },
      });
    }
    if (path === '/watchlist' || path.startsWith('/watchlist/')) {
      mutations++;
      return route.fulfill({ json: { id: 501 } });
    }
    if (path === '/genres/movie' || path === '/languages')
      return route.fulfill({ json: [] });
    return route.fulfill({ json: {} });
  });

  await page.goto(testAppPath('/movies'));
  const poster = page.locator('.poster').filter({
    has: page.getByRole('link', { name: 'Saved Fixture Film' }),
  });
  await poster.scrollIntoViewIfNeeded();
  if (test.info().project.name === 'desktop') await poster.hover();
  await poster
    .getByRole('button', { name: 'Add Saved Fixture Film to your Watchlist' })
    .click();
  await expect.poll(() => detailReads).toBe(1);
  await expect(
    poster.getByRole('button', {
      name: 'Remove Saved Fixture Film from your Watchlist',
    })
  ).toBeVisible();
  expect(mutations).toBe(0);
});

test('series poster Watchlist action uses the TV detail and media identity', async ({
  page,
}, testInfo) => {
  let listed = false;
  let added = false;
  let removed = false;
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/api/v1/**', (route) => {
    const url = new URL(route.request().url());
    const path = testApiPath(route.request().url());
    if (path === '/auth/me')
      return route.fulfill({
        json: {
          id: 1,
          displayName: 'Reader',
          permissions: 32,
          userType: 2,
        },
      });
    if (path === '/settings/public')
      return route.fulfill({
        json: {
          applicationTitle: 'SeerrNG',
          movie4kEnabled: false,
          series4kEnabled: false,
          partialRequestsEnabled: false,
          booksEnabled: true,
          ebookServiceEnabled: false,
          audiobookServiceEnabled: false,
          enabledMediaCategories: { movie: true, tv: true },
        },
      });
    if (path === '/discover/tv')
      return route.fulfill({
        json: {
          page: 1,
          totalPages: 1,
          results: [
            { id: 202, title: 'Watchlist Fixture Series', mediaType: 'tv' },
          ],
        },
      });
    if (path === '/tv/202')
      return route.fulfill({
        json: {
          id: 202,
          title: 'Watchlist Fixture Series',
          onUserWatchlist: listed,
          mediaInfo: { status: 1 },
        },
      });
    if (path === '/watchlist' && route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      expect(body).toMatchObject({ mediaType: 'tv', tmdbId: 202 });
      added = true;
      listed = true;
      return route.fulfill({ json: { id: 502 } });
    }
    if (path === '/watchlist/202' && route.request().method() === 'DELETE') {
      expect(url.searchParams.get('mediaType')).toBe('tv');
      removed = true;
      listed = false;
      return route.fulfill({ status: 204 });
    }
    if (path === '/genres/tv' || path === '/languages')
      return route.fulfill({ json: [] });
    return route.fulfill({ json: {} });
  });

  await page.goto(testAppPath('/series'));
  const poster = page.locator('.poster').filter({
    has: page.getByRole('link', { name: 'Watchlist Fixture Series' }),
  });
  await poster.scrollIntoViewIfNeeded();
  if (testInfo.project.name === 'desktop') await poster.hover();
  await poster
    .getByRole('button', {
      name: 'Add Watchlist Fixture Series to your Watchlist',
    })
    .click();
  await expect.poll(() => added).toBe(true);
  await poster
    .getByRole('button', {
      name: 'Remove Watchlist Fixture Series from your Watchlist',
    })
    .click();
  await expect.poll(() => removed).toBe(true);
  expect(listed).toBe(false);
});

test('poster Watchlist control is unavailable for a Plex primary account', async ({
  page,
}) => {
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/api/v1/**', (route) => {
    const path = testApiPath(route.request().url());
    if (path === '/auth/me')
      return route.fulfill({
        json: { id: 1, displayName: 'Plex', permissions: 32, userType: 1 },
      });
    if (path === '/settings/public')
      return route.fulfill({
        json: {
          applicationTitle: 'SeerrNG',
          movie4kEnabled: false,
          series4kEnabled: false,
          partialRequestsEnabled: false,
          booksEnabled: true,
          ebookServiceEnabled: false,
          audiobookServiceEnabled: false,
          enabledMediaCategories: { movie: true, tv: true },
        },
      });
    if (path === '/discover/movies')
      return route.fulfill({
        json: {
          page: 1,
          totalPages: 1,
          results: [
            { id: 101, title: 'Watchlist Fixture Film', mediaType: 'movie' },
          ],
        },
      });
    if (path === '/genres/movie' || path === '/languages')
      return route.fulfill({ json: [] });
    return route.fulfill({ json: {} });
  });

  await page.goto(testAppPath('/movies'));
  const poster = page.locator('.poster').filter({
    has: page.getByRole('link', { name: 'Watchlist Fixture Film' }),
  });
  await expect(poster).toBeVisible();
  await expect(
    poster.getByRole('button', { name: /Add .* to your Watchlist/ })
  ).toHaveCount(0);
});

test('book poster Watchlist action preserves the Open Library work identity', async ({
  page,
}, testInfo) => {
  let listed = false;
  let detailReads = 0;
  let writes = 0;
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/api/v1/**', (route) => {
    const path = testApiPath(route.request().url());
    if (path === '/auth/me')
      return route.fulfill({
        json: { id: 1, displayName: 'Reader', permissions: 32, userType: 2 },
      });
    if (path === '/settings/public')
      return route.fulfill({
        json: {
          applicationTitle: 'SeerrNG',
          booksEnabled: true,
          ebookServiceEnabled: true,
          enabledMediaCategories: { ebook: true },
        },
      });
    if (path === '/user/1/settings/main') return route.fulfill({ json: {} });
    if (path.startsWith('/service/')) return route.fulfill({ json: [] });
    if (path.startsWith('/discover/books'))
      return route.fulfill({
        json: {
          page: 1,
          totalPages: 1,
          results: [
            {
              id: 'OL123W',
              title: 'Watchlist Fixture Book',
              provider: 'openlibrary',
              author: 'Fixture Author',
            },
          ],
        },
      });
    if (path === '/book/OL123W') {
      detailReads++;
      return route.fulfill({
        json: {
          id: 'OL123W',
          title: 'Watchlist Fixture Book',
          onUserWatchlist: listed,
        },
      });
    }
    if (path === '/watchlist' && route.request().method() === 'POST') {
      expect(route.request().postDataJSON()).toMatchObject({
        mediaType: 'book',
        externalId: 'OL123W',
        title: 'Watchlist Fixture Book',
      });
      listed = true;
      writes++;
      return route.fulfill({ json: { id: 9001 } });
    }
    if (path === '/genres/book' || path === '/languages')
      return route.fulfill({ json: [] });
    return route.fulfill({ json: {} });
  });

  await page.goto(testAppPath('/books?search=Watchlist'));
  const poster = page
    .locator('.poster')
    .filter({
      has: page.getByRole('link', { name: 'Watchlist Fixture Book' }),
    })
    .first();
  await expect(poster).toBeVisible();
  await poster.evaluate((element) =>
    element.scrollIntoView({ block: 'center', inline: 'nearest' })
  );
  if (testInfo.project.name === 'desktop') await poster.hover();
  const action = poster.getByRole('button', {
    name: 'Add Watchlist Fixture Book to your Watchlist',
  });
  await expect(action).toBeVisible();
  await action.click();
  await expect.poll(() => detailReads).toBeGreaterThan(0);
  await expect.poll(() => writes).toBe(1);
  await expect(
    poster.getByRole('button', {
      name: 'Remove Watchlist Fixture Book from your Watchlist',
    })
  ).toBeVisible();
});

test('album and magazine posters preserve their Watchlist identities', async ({
  page,
}, testInfo) => {
  const records = [
    {
      path: '/music?q=Watchlist',
      listing: '/discover/music',
      detail: '/music/rg-fixture',
      mediaType: 'music',
      id: 'RG-FIXTURE',
      title: 'Watchlist Fixture Album',
      result: {
        id: 'RG-FIXTURE',
        mediaType: 'album',
        title: 'Watchlist Fixture Album',
        'artist-credit': [{ name: 'Fixture Artist' }],
      },
      body: {
        mediaType: 'music',
        mbId: 'rg-fixture',
        title: 'Watchlist Fixture Album',
      },
    },
    {
      path: '/magazines?query=Watchlist',
      listing: '/discover/magazines',
      detail: '/magazine/Watchlist%20Fixture%20Magazine',
      mediaType: 'magazine',
      id: 'Watchlist Fixture Magazine',
      title: 'Watchlist Fixture Magazine',
      result: {
        id: 'Watchlist Fixture Magazine',
        mediaType: 'magazine',
        provider: 'googlebooks',
        title: 'Watchlist Fixture Magazine',
        requestable: true,
      },
      body: {
        mediaType: 'magazine',
        externalId: 'watchlist fixture magazine',
        title: 'Watchlist Fixture Magazine',
      },
    },
  ];
  const writes: unknown[] = [];
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/api/v1/**', (route) => {
    const path = testApiPath(route.request().url());
    if (path === '/auth/me')
      return route.fulfill({
        json: { id: 1, displayName: 'Reader', permissions: 32, userType: 2 },
      });
    if (path === '/settings/public')
      return route.fulfill({
        json: {
          applicationTitle: 'SeerrNG',
          musicEnabled: true,
          comicsEnabled: true,
          magazinesEnabled: true,
          enabledMediaCategories: { music: true, comic: true, magazine: true },
        },
      });
    if (path === '/user/1/settings/main') return route.fulfill({ json: {} });
    if (path.startsWith('/service/')) return route.fulfill({ json: [] });
    if (path === '/discover/comics/landing')
      return route.fulfill({
        json: {
          library: [],
          trending: [],
          newest: [],
          western: [],
          failed: [],
          genres: [],
          publishers: [],
          comicVineConfigured: true,
        },
      });
    if (
      path === '/genres/book' ||
      path === '/genres/tv' ||
      path === '/languages'
    )
      return route.fulfill({ json: [] });
    const item = records.find((record) => path === record.listing);
    if (item)
      return route.fulfill({
        json: {
          page: 1,
          totalPages: 1,
          totalResults: 1,
          results: [item.result],
        },
      });
    const detail = records.find((record) => path === record.detail);
    if (detail)
      return route.fulfill({
        json: {
          id: detail.id,
          title: detail.title,
          mediaType: detail.mediaType,
          onUserWatchlist: false,
        },
      });
    if (path === '/watchlist' && route.request().method() === 'POST') {
      writes.push(route.request().postDataJSON());
      return route.fulfill({ json: { id: 9001 } });
    }
    return route.fulfill({ json: {} });
  });

  for (const [index, record] of records.entries()) {
    await page.goto(testAppPath(record.path));
    const poster = page
      .locator('.poster')
      .filter({
        has: page.getByRole('link', { name: record.title, exact: true }),
      })
      .first();
    await expect(poster).toBeVisible();
    await poster.scrollIntoViewIfNeeded();
    if (testInfo.project.name === 'desktop') await poster.hover();
    const action = poster.getByRole('button', {
      name: `Add ${record.title} to your Watchlist`,
    });
    await expect(action).toBeVisible();
    await action.click();
    await expect.poll(() => writes.length).toBe(index + 1);
    expect(writes.at(-1)).toMatchObject(record.body);
  }
});
