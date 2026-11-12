import { expect, test, type Page } from '@playwright/test';

// Release dates name the year when it isn't this one ("Mar 11, 2027"), and Discover's
// Coming soon row links to the Coming soon page like the other rows.
const year = new Date().getFullYear();
const nextYear = year + 1;

const movie = (id: number, title: string, releaseDate: string) => ({
  id,
  title,
  mediaType: 'movie',
  releaseDate,
  posterPath: `/p${id}.png`,
  voteAverage: 0,
});
const paged = (results: unknown[]) => ({
  page: 1,
  totalPages: 1,
  totalResults: results.length,
  results,
});

async function fixture(page: Page) {
  await page.route('https://**/*', (r) => r.abort());
  await page.route(/\/(imageproxy|branding)\//, (r) =>
    r.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#e05"/></svg>',
    })
  );
  await page.route('**/lumen-config.json', (r) => r.fulfill({ json: {} }));
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname.slice(7);
    let json: unknown = {};
    if (path === '/settings/public') json = { mediaServerType: 2 };
    else if (path === '/auth/me')
      json = { id: 1, displayName: 'fam', permissions: 2 };
    else if (path === '/discover/movies/upcoming')
      json = paged([
        movie(401, 'Later This Year', `${year}-12-31`),
        movie(402, 'Next Year Film', `${nextYear}-03-11`),
      ]);
    else if (path === '/movie/402/recommendations') json = paged([]);
    else if (path === '/movie/402')
      json = {
        ...movie(402, 'Next Year Film', `${nextYear}-03-11`),
        genres: [],
        overview: 'Not out yet.',
        credits: { cast: [], crew: [] },
        relatedVideos: [],
        releases: { results: [] },
      };
    else if (path === '/discover/genreslider/movie') json = [];
    else if (/^\/discover\//.test(path) || path === '/media') json = paged([]);
    else if (path === '/request')
      json = { pageInfo: { pages: 1, results: 0 }, results: [] };
    return route.fulfill({ json });
  });
}

test('the detail page names the year of a release that is not this year', async ({
  page,
}) => {
  await fixture(page);
  await page.goto('/movie/402');
  await expect(page.locator('.dtitle h1')).toHaveText('Next Year Film');
  await expect(page.getByText(`In theaters Mar 11, ${nextYear}`)).toBeVisible();
});

test('Coming soon on Discover names the year and links to the full page', async ({
  page,
}) => {
  await fixture(page);
  await page.goto('/');
  const row = page.locator('section', {
    has: page.getByRole('heading', { name: 'Coming soon' }),
  });
  await expect(
    row.locator('.poster', { hasText: 'Next Year Film' }).locator('.m')
  ).toHaveText(`Mar 11, ${nextYear}`);
  // this year's dates stay short
  await expect(
    row.locator('.poster', { hasText: 'Later This Year' }).locator('.m')
  ).toHaveText('Dec 31');
  const seeAll = row.getByRole('link', { name: 'See all' });
  await expect(seeAll).toHaveAttribute('href', '/soon');
});

test('the phone request bar keeps its button on screen and the title readable', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'iphone', 'phone layout');
  await fixture(page);
  await page.goto('/movie/402');
  const bar = page.locator('.actionbar');
  await expect(bar).toBeVisible();
  const button = bar.getByRole('button', { name: /Request/ });
  const box = (await button.boundingBox())!;
  expect(box.x + box.width).toBeLessThanOrEqual(
    page.viewportSize()!.width + 0.5
  );
  const title = (await bar.locator('.ab-meta').boundingBox())!;
  expect(title.height).toBeLessThan(40);
});
