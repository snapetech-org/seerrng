import { expect, test, type Page } from '@playwright/test';
import { testAppPath as mountedTestAppPath } from './testAppPath';

const mount = process.env.LUMEN_TEST_MOUNT === '/lumen' ? '/lumen' : '';
const appPath = (path: string) => `${mount}${path}`;

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
    else if (path === '/movie/402/similar') json = paged([]);
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
    else if (
      path === '/watchproviders/regions' ||
      path === '/languages' ||
      path === '/genres/tv'
    )
      json = [];
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
  await page.goto(mountedTestAppPath('/movie/402'));
  await expect(page.locator('.dtitle h1')).toHaveText('Next Year Film');
  await expect(page.getByText(`In theaters Mar 11, ${nextYear}`)).toBeVisible();
});

test('Coming soon on Discover names the year and links to the full page', async ({
  page,
}) => {
  await fixture(page);
  await page.goto(mountedTestAppPath('/'));
  const row = page.locator('section', {
    has: page.getByRole('heading', { name: 'Coming soon' }),
  });
  await expect(
    row.locator('.poster', { hasText: 'Next Year Film' }).locator('.m')
  ).toContainText(`Mar 11, ${nextYear}`);
  // this year's dates stay short
  await expect(
    row.locator('.poster', { hasText: 'Later This Year' }).locator('.m')
  ).toContainText('Dec 31');
  const seeAll = row.getByRole('link', { name: 'See all' });
  await expect(seeAll).toHaveAttribute('href', appPath('/soon'));
});

test('Coming soon cards use the saved locale for release dates', async ({
  page,
}) => {
  await fixture(page);
  await page.route('**/api/v1/user/1/settings/main', (route) =>
    route.fulfill({ json: { locale: 'fr' } })
  );
  await page.goto(mountedTestAppPath('/'));
  await expect(
    page.locator('.poster').filter({ hasText: 'Next Year Film' }).locator('.m')
  ).toContainText(`11 mars ${nextYear}`);
});

test('series cards localize their type and upcoming quick details', async ({
  page,
}) => {
  await fixture(page);
  await page.route('**/api/v1/settings/public', (route) =>
    route.fulfill({
      json: {
        mediaServerType: 2,
        enabledMediaCategories: { movie: true, tv: true },
      },
    })
  );
  await page.route('**/api/v1/user/1/settings/main', (route) =>
    route.fulfill({
      json: { locale: 'fr', lumenPreferences: { hoverRequest: true } },
    })
  );
  await page.route('**/api/v1/discover/tv*', (route) =>
    route.fulfill({
      json: paged([
        {
          id: 501,
          name: 'Next Year Series',
          mediaType: 'tv',
          firstAirDate: `${nextYear}-03-11`,
          posterPath: null,
          voteAverage: 0,
        },
      ]),
    })
  );
  await page.goto(mountedTestAppPath('/series'));
  const card = page.locator('.poster').filter({ hasText: 'Next Year Series' });
  await expect(card.locator('.m')).toContainText(
    `11 mars ${nextYear} · Séries`
  );
  test.skip(
    ['iphone', 'android'].includes(test.info().project.name),
    'quick details use hover on touch devices'
  );
  await card.hover();
  await expect(card.locator('.qm')).toContainText(
    `Sortie le 11 mars ${nextYear}`
  );
  await expect(card.locator('.qbtn.go')).toHaveText('Demander avant la sortie');
});

test('the phone request bar keeps its button on screen and the title readable', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'iphone', 'phone layout');
  await fixture(page);
  await page.goto(mountedTestAppPath('/movie/402'));
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
