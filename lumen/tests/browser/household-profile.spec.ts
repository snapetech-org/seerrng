import { expect, test } from '@playwright/test';

for (const permissions of [24, 16, 32]) {
  const authorized = permissions !== 32;
  test(`household profile permissions ${permissions} gate each preview`, async ({
    page,
  }) => {
    const fetched: string[] = [];
    await page.route('**/lumen-config.json', (route) =>
      route.fulfill({ json: {} })
    );
    await page.route('**/api/v1/**', (route) => {
      const path = new URL(route.request().url()).pathname.slice(
        '/api/v1'.length
      );
      fetched.push(path);
      switch (path) {
        case '/auth/me':
          return route.fulfill({
            json: {
              id: 9,
              displayName: 'Viewer',
              permissions,
            },
          });
        case '/user/19':
          return route.fulfill({
            json: { id: 19, displayName: 'Household Member' },
          });
        case '/user/19/quota':
          return route.fulfill({
            json: { movie: { limit: 5, used: 2, days: 7 } },
          });
        case '/user/19/watchlist':
          return route.fulfill({
            json: {
              results: [
                {
                  id: 1,
                  ratingKey: '23',
                  tmdbId: 23,
                  mediaType: 'movie',
                  title: 'Saved Film',
                },
              ],
              totalPages: 1,
            },
          });
        case '/user/19/requests':
          return route.fulfill({
            json: {
              results: [
                {
                  id: 3,
                  type: 'movie',
                  media: { tmdbId: 24, mediaType: 'movie' },
                },
              ],
            },
          });
        case '/movie/24':
          return route.fulfill({ json: { id: 24, title: 'Requested Film' } });
        default:
          return route.fulfill({ json: {} });
      }
    });
    await page.goto('/household/19');
    await expect(
      page.getByRole('heading', { name: 'Household Member' })
    ).toBeVisible();
    if (permissions === 24) {
      await expect(
        page.getByRole('heading', { name: 'Request limits' })
      ).toBeVisible();
      await expect(page.getByText('of 5 left')).toBeVisible();
    } else {
      await expect(
        page.getByRole('heading', { name: 'Request limits' })
      ).toHaveCount(0);
      expect(fetched).not.toContain('/user/19/quota');
    }
    if (authorized) {
      await expect(
        page.getByRole('link', { name: 'Saved Film' })
      ).toHaveAttribute('href', '/movie/23');
      await expect(
        page.getByRole('link', { name: 'Requested Film' })
      ).toHaveAttribute('href', '/requests?requestId=3');
    } else {
      await expect(
        page.getByRole('link', { name: 'View Requests' })
      ).toHaveCount(0);
      await expect(
        page.getByRole('link', { name: 'View Watchlist' })
      ).toHaveCount(0);
      expect(fetched).not.toContain('/user/19/requests');
      expect(fetched).not.toContain('/user/19/watchlist');
    }
  });
}
