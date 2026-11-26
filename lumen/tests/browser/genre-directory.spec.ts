import { expect, test } from '@playwright/test';

const testMount = process.env.LUMEN_TEST_MOUNT === '/lumen' ? '/lumen' : '';
const testAppPath = (path: string) => `${testMount}${path}`;
const testApiPath = (url: string) =>
  new URL(url).pathname.replace(/^\/lumen(?=\/)/, '').replace(/^\/api\/v1/, '');

for (const directory of [
  {
    route: '/movies/genres',
    kind: 'movie',
    browse: '/movies',
    title: 'Movie Genres',
    genre: { id: 28, name: 'Action' },
    otherGenre: { id: 12, name: 'Adventure' },
  },
  {
    route: '/series/genres',
    kind: 'tv',
    browse: '/series',
    title: 'Series Genres',
    genre: { id: 10759, name: 'Action & Adventure' },
    otherGenre: { id: 18, name: 'Drama' },
  },
]) {
  test(`${directory.title} links genres, recovers artwork, and opens the matching browse filter`, async ({
    page,
  }, testInfo) => {
    await page.route('https://**/*', (route) => route.abort());
    await page.route('**/imageproxy/**', (route) =>
      route.request().url().endsWith('/shared.jpg')
        ? route.fulfill({ status: 404, body: '' })
        : route.fulfill({
            contentType: 'image/svg+xml',
            body: `<svg xmlns="http://www.w3.org/2000/svg" width="780" height="390"><defs><linearGradient id="g"><stop stop-color="#${route.request().url().endsWith('/fallback.jpg') ? '6428a8' : '1e5a8a'}"/><stop offset="1" stop-color="#111827"/></linearGradient></defs><rect width="780" height="390" fill="url(#g)"/><circle cx="600" cy="120" r="150" fill="#ffffff" opacity=".12"/></svg>`,
          })
    );
    await page.route('**/api/v1/**', (route) => {
      const path = testApiPath(route.request().url());
      if (path === '/auth/me')
        return route.fulfill({
          json: { id: 1, displayName: 'Household', permissions: 32 },
        });
      if (path === '/settings/public')
        return route.fulfill({
          json: {
            mediaServerType: 1,
            enabledMediaCategories: { movie: true, tv: true },
          },
        });
      if (path === `/genres/${directory.kind}`)
        return route.fulfill({
          json: [directory.genre, directory.otherGenre],
        });
      if (path === `/discover/genreslider/${directory.kind}`)
        return route.fulfill({
          json: [
            {
              ...directory.genre,
              backdrops: ['/shared.jpg', '/fallback.jpg'],
            },
            {
              ...directory.otherGenre,
              backdrops: ['/shared.jpg', '/adventure.jpg'],
            },
          ],
        });
      return route.fulfill({ json: {} });
    });

    await page.goto(testAppPath(directory.route));
    await expect(
      page.getByRole('heading', { name: directory.title, exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: `Browse ${directory.genre.name}` })
    ).toHaveAttribute(
      'href',
      testAppPath(`${directory.browse}?genre=${directory.genre.id}`)
    );
    const genreImage = page
      .getByRole('link', { name: `Browse ${directory.genre.name}` })
      .locator('img');
    await genreImage.scrollIntoViewIfNeeded();
    await expect(genreImage).toHaveAttribute(
      'src',
      '/imageproxy/tmdb/t/p/w780/fallback.jpg'
    );
    await expect(
      page
        .getByRole('link', { name: `Browse ${directory.otherGenre.name}` })
        .locator('img')
    ).toHaveAttribute('src', '/imageproxy/tmdb/t/p/w780/adventure.jpg');
    await page.screenshot({
      path: testInfo.outputPath('genre-directory.png'),
      fullPage: true,
    });
  });
}
