import { expect, test } from '@playwright/test';

test('music discovery opens trusted collector picks and follows the matched artist', async ({
  page,
}) => {
  const albumId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const artistId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/imageproxy/coverartarchive/**', (route) =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"/>',
    })
  );
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname.slice(
      '/api/v1'.length
    );
    switch (path) {
      case '/auth/me':
        return route.fulfill({
          json: { id: 1, displayName: 'test', permissions: 2 },
        });
      case '/settings/public':
        return route.fulfill({
          json: { musicEnabled: true, enabledMediaCategories: { music: true } },
        });
      case '/collectors':
        return route.fulfill({
          json: {
            available: true,
            results: [
              {
                title: 'Fixture Album',
                creator: 'Fixture Artist',
                year: 2000,
                trustedSourceCount: 2,
                reasons: ['Shared by a followed collector'],
                album: {
                  id: albumId,
                  imageUrl: '/imageproxy/coverartarchive/release/fixture.jpg',
                },
                artistId,
              },
            ],
          },
        });
      case '/collectors/radar':
        expect(route.request().method()).toBe('POST');
        expect(route.request().postDataJSON()).toEqual({
          artistId,
          artist: 'Fixture Artist',
        });
        return route.fulfill({
          status: 201,
          json: { followId: 42, radar: false },
        });
      default:
        return route.fulfill({ json: { results: [], totalPages: 1 } });
    }
  });
  await page.goto('/music');
  await page.getByRole('link', { name: 'Collector Picks' }).click();
  await expect(
    page.getByRole('heading', { name: 'Collector Picks' })
  ).toBeVisible();
  await expect(page.getByText('Shared by 2 trusted collectors')).toBeVisible();
  await expect(page.getByText('Shared by a followed collector')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open Album' })).toHaveAttribute(
    'href',
    `/music/${albumId}`
  );
  await expect(page.locator('.poster.sq img')).toHaveAttribute(
    'src',
    '/imageproxy/coverartarchive/release/fixture.jpg'
  );
  await page.getByRole('button', { name: 'Follow Artist Releases' }).click();
  await expect(
    page.getByRole('button', { name: 'Following', exact: true })
  ).toBeDisabled();
});
