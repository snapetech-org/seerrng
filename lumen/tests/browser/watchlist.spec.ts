import { expect, test } from '@playwright/test';

for (const combined of [false, true]) {
  test(`personal Watchlist handles ${combined ? 'combined Plex' : 'local'} results`, async ({
    page,
  }) => {
    let deleted = false;
    const queries: URLSearchParams[] = [];
    await page.route('https://**/*', (route) => route.abort());
    await page.route('**/api/v1/**', (route) => {
      const url = new URL(route.request().url());
      const path = url.pathname.slice('/api/v1'.length);
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
    await page.goto('/me');
    await page.getByRole('link', { name: 'Open Watchlist' }).click();
    await expect(
      page.getByRole('heading', { name: 'Watchlist' })
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Example Movie' })
    ).toHaveAttribute('href', '/movie/20');
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

test('video Watchlist action confirms the current title and server response', async ({
  page,
}) => {
  let saved = false;
  let writes = 0;
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/api/v1/**', (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.slice('/api/v1'.length);
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
      return route.fulfill({ status: 204 });
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
  await page.goto('/movie/20');
  await page.getByRole('button', { name: 'Add To Watchlist' }).click();
  await expect(
    page.getByRole('button', { name: 'Remove From Watchlist' })
  ).toBeVisible();
  expect(writes).toBe(1);
  await page.reload();
  await page.getByRole('button', { name: 'Remove From Watchlist' }).click();
  await expect(
    page.getByRole('button', { name: 'Add To Watchlist' })
  ).toBeVisible();
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
    const path = decodeURIComponent(url.pathname.slice(7));
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
  await page.goto(`/book/${work}`);
  const add = page.getByRole('button', { name: 'Add To Watchlist' });
  const remove = page.getByRole('button', { name: 'Remove From Watchlist' });
  await add.click();
  await expect(remove).toBeVisible();
  await remove.click();
  await expect(add).toBeVisible();
  expect(writes).toBe(2);
  await page.goto(`/book/${encodeURIComponent(bookshelf)}`);
  await expect(
    page.getByRole('heading', { name: 'Example Book' })
  ).toBeVisible();
  await expect(add.or(remove)).toHaveCount(0);
  expect(writes).toBe(2);
});
