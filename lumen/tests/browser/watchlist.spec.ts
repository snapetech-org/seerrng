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
