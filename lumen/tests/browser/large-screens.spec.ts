import { expect, test, type Page } from '@playwright/test';

// Wide monitors: the page should grow with the window instead of stopping at
// 1320px, and posters should grow with it so rows stay full.
const movies = Array.from({ length: 24 }, (_, i) => ({
  id: 500 + i,
  title: `Wide Screen ${i + 1}`,
  mediaType: 'movie',
  posterPath: `/wide-poster-${i}.png`,
  backdropPath: `/wide-backdrop-${i}.png`,
  releaseDate: '2024-01-01',
  voteAverage: 7,
}));
const paged = (results: unknown[]) => ({
  page: 1,
  totalPages: 1,
  totalResults: results.length,
  results,
});

async function fixtures(page: Page) {
  await page.route('https://**/*', (route) => route.abort());
  await page.route(/(?:image\.tmdb\.org|\/imageproxy\/tmdb)\//, (route) =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="780" height="440"><rect width="780" height="440" fill="#30405c"/><circle cx="390" cy="220" r="100" fill="#526996"/></svg>',
    })
  );
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname.slice(
      '/api/v1'.length
    );
    let body: unknown = {};
    if (path === '/auth/me')
      body = { id: 1, displayName: 'owner', permissions: 2 };
    else if (path === '/settings/public')
      body = {
        applicationTitle: 'SeerrNG',
        enabledMediaCategories: {},
        movie4kEnabled: false,
      };
    else if (path === '/discover/genreslider/movie')
      body = ['Drama', 'Comedy', 'Action', 'Horror', 'Family', 'Crime'].map(
        (name, id) => ({ id, name, backdrops: [] })
      );
    else if (/^\/discover\/(trending|movies|tv)(\/upcoming)?$/.test(path))
      body = paged(movies);
    else if (path === '/discover/books' || path === '/media') body = paged([]);
    else if (path === '/request')
      body = { pageInfo: { pages: 1, results: 0 }, results: [] };
    await route.fulfill({ json: body });
  });
}

const sizes = [
  { width: 1440, height: 900, view: [1150, 1320], poster: 164 },
  { width: 1920, height: 1080, view: [1600, 1680], poster: 176 },
  { width: 2560, height: 1440, view: [2300, 2400], poster: 196 },
  { width: 3840, height: 2160, view: [3200, 3200], poster: 232 },
];

for (const size of sizes)
  test(`Discover uses the width of a ${size.width}px window`, async ({
    page,
  }, info) => {
    test.skip(info.project.name !== 'desktop', 'desktop layout only');
    await page.setViewportSize({ width: size.width, height: size.height });
    await fixtures(page);
    await page.goto('/');
    await expect(
      page.getByRole('heading', { name: 'Discover', exact: true })
    ).toBeVisible();
    await expect(page.locator('.poster').first()).toBeVisible();
    const box = await page.evaluate(() => {
      const view = document.querySelector('.view')!.getBoundingClientRect();
      const poster = document.querySelector('.poster')!.getBoundingClientRect();
      return {
        view: view.width,
        poster: poster.width,
        overflow: document.documentElement.scrollWidth > innerWidth,
      };
    });
    expect(box.view).toBeGreaterThanOrEqual(size.view[0]);
    expect(box.view).toBeLessThanOrEqual(size.view[1]);
    expect(box.poster).toBe(size.poster);
    expect(box.overflow).toBe(false);
    await page.screenshot({
      path: info.outputPath(`discover-${size.width}.png`),
      animations: 'disabled',
    });
  });
