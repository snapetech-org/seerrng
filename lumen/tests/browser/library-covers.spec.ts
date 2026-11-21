import { expect, test, type Page } from '@playwright/test';

const testAppPath = (path: string) =>
  `${process.env.LUMEN_TEST_MOUNT === '/lumen' ? '/lumen' : ''}${path}`;

async function mockServer(
  page: Page,
  options: { shareEnabled?: boolean; seen?: string[] } = {}
) {
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(/^\/lumen(?=\/)/, '').slice(7);
    options.seen?.push(path + url.search);
    if (path === '/auth/me')
      return route.fulfill({
        json: { id: 1, displayName: 'Owner', permissions: 2 },
      });
    if (path === '/settings/public')
      return route.fulfill({ json: { mediaServerType: 1 } });
    if (path === '/user/1/settings/main') return route.fulfill({ json: {} });
    if (path === '/resolve/capabilities')
      return route.fulfill({
        json: { enabled: options.shareEnabled ?? true },
      });
    if (path === '/issue' || path === '/blocklist')
      return route.fulfill({
        json: { results: [], pageInfo: { pages: 1, results: 0 } },
      });
    // catalogue lookups that answer with plain lists
    if (
      /^\/(genres|languages|regions|watchproviders|discover\/genreslider)/.test(
        path
      )
    )
      return route.fulfill({ json: [] });
    return route.fulfill({ json: { results: [] } });
  });
}

test('library posters load from SeerrNG cover links', async ({ page }) => {
  const cover =
    '/api/v1/movie/550/cover?serviceId=0&externalServiceId=9&is4k=false';
  await mockServer(page);
  await page.route('**/api/v1/discover/movies**', (route) =>
    route.fulfill({
      json: {
        page: 1,
        totalPages: 1,
        totalResults: 1,
        results: [
          {
            id: 550,
            mediaType: 'movie',
            title: 'Library Fixture',
            releaseDate: '2020-01-01',
            posterPath: cover,
            mediaInfo: { status: 5 },
          },
        ],
      },
    })
  );
  await page.route('**/api/v1/movie/550/cover**', (route) =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="300"><rect width="200" height="300" fill="#345"/></svg>',
    })
  );
  await page.goto(testAppPath('/movies?show=have'));
  const img = page.locator('.poster img').first();
  await expect(img).toHaveAttribute('src', cover);
  // posters load lazily; bring it on screen first (phones show it below the fold)
  await img.scrollIntoViewIfNeeded();
  await expect
    .poll(() => img.evaluate((el) => (el as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0);
});
