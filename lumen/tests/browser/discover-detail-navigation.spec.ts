import { expect, test, type Page } from '@playwright/test';

const mount = process.env.LUMEN_TEST_MOUNT === '/lumen' ? '/lumen' : '';
const route = (path: string) => `${mount}${path}`;
const capture = async (page: Page, project: string, name: string) => {
  const directory = process.env.LUMEN_VISUAL_CAPTURE_DIR;
  if (directory && ['desktop', 'iphone'].includes(project))
    await page.screenshot({ path: `${directory}/${name}-${project}.png` });
};

for (const kind of ['movie', 'tv'] as const) {
  const listPath = kind === 'movie' ? '/discover/movies' : '/discover/tv';
  const detailPath = kind === 'movie' ? '/movie' : '/tv';
  const titles = ['First Result', 'Current Result', 'Next Result'];

  test(`${kind} detail keeps adjacent Discover results in tab context`, async ({
    page,
  }, info) => {
    await page.route('https://**/*', (request) => request.abort());
    await page.route('**/api/v1/**', (request) => {
      const url = new URL(request.request().url());
      const path = url.pathname
        .replace(/^\/lumen(?=\/)/, '')
        .replace(/^\/api\/v1/, '');
      if (path === '/auth/me')
        return request.fulfill({
          json: { id: 1, displayName: 'Viewer', permissions: 2 },
        });
      if (path === '/user/1/settings/main')
        return request.fulfill({
          json: {
            locale: 'en',
            enabledMediaCategories: {
              ebook: true,
              audiobook: true,
              music: true,
              comic: true,
            },
          },
        });
      if (path === '/settings/public')
        return request.fulfill({
          json: {
            enable4k: true,
            movie4kEnabled: true,
            musicEnabled: true,
            enabledMediaCategories: { movie: true, tv: true },
          },
        });
      if (
        path === `/discover/genreslider/${kind}` ||
        path === `/genres/${kind}`
      )
        return request.fulfill({ json: [] });
      if (path === listPath)
        return request.fulfill({
          json: {
            page: 1,
            totalPages: 1,
            totalResults: 3,
            results: [101, 102, 103].map((id, index) => ({
              id,
              mediaType: kind,
              title: titles[index],
              name: titles[index],
              posterPath: null,
              ...(kind === 'movie'
                ? { releaseDate: '2020-01-01' }
                : { firstAirDate: '2020-01-01' }),
            })),
          },
        });
      if (new RegExp(`^${detailPath}/\\d+$`).test(path)) {
        const id = Number(path.slice(detailPath.length + 1));
        const title = titles[id - 101] ?? 'Direct Title';
        return request.fulfill({
          json: {
            id,
            title,
            name: title,
            overview: 'Fixture detail.',
            genres: [],
            runtime: 100,
            seasons: [],
            credits: { cast: [], crew: [] },
            mediaInfo: {},
          },
        });
      }
      return request.fulfill({ json: { results: [], totalPages: 1 } });
    });

    await page.goto(route(kind === 'movie' ? '/movies' : '/series'));
    await page.getByRole('link', { name: 'Current Result' }).click();
    await expect(page).toHaveURL(/discoverContext=[a-z0-9_-]{12,64}/i);
    const previous = page.getByRole('button', {
      name: 'Previous',
      exact: true,
    });
    const next = page.getByRole('button', { name: 'Next', exact: true });
    await expect(previous).toBeVisible();
    await expect(next).toBeVisible();
    await capture(page, info.project.name, `discover-detail-${kind}`);
    await next.click();
    await expect(page).toHaveURL(
      new RegExp(`${detailPath}/103\\?discoverContext=`)
    );
    await expect(page.getByRole('button', { name: 'Previous' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Next' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Previous', exact: true }).click();
    await expect(page).toHaveURL(
      new RegExp(`${detailPath}/102\\?discoverContext=`)
    );
    const context = new URL(page.url()).searchParams.get('discoverContext');

    await page.goto(route(`${detailPath}/102`));
    await expect(page.getByRole('button', { name: 'Previous' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Next' })).toHaveCount(0);
    await page.goto(route(`${detailPath}/999?discoverContext=${context}`));
    await expect(page.getByRole('button', { name: 'Previous' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Next' })).toHaveCount(0);
    await capture(page, info.project.name, `direct-detail-${kind}`);
    await expect(
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
    ).resolves.toBe(true);
  });
}

test('Discover Watchlist details keep the filtered result context', async ({
  page,
}) => {
  await page.route('https://**/*', (request) => request.abort());
  await page.route('**/api/v1/**', (request) => {
    const path = new URL(request.request().url()).pathname
      .replace(/^\/lumen(?=\/)/, '')
      .replace(/^\/api\/v1/, '');
    if (path === '/auth/me')
      return request.fulfill({
        json: { id: 1, displayName: 'Viewer', permissions: 2 },
      });
    if (path === '/user/1/settings/main')
      return request.fulfill({ json: { locale: 'en' } });
    if (path === '/settings/public')
      return request.fulfill({
        json: { enabledMediaCategories: { movie: true, tv: true } },
      });
    if (path === '/discover/watchlist')
      return request.fulfill({
        json: {
          results: [101, 102, 103].map((tmdbId, index) => ({
            id: tmdbId,
            tmdbId,
            ratingKey: `fixture-${tmdbId}`,
            mediaType: 'movie',
            title: [
              'First Watchlist Film',
              'Current Watchlist Film',
              'Next Watchlist Film',
            ][index],
          })),
          totalPages: 1,
          filtersSupported: true,
        },
      });
    if (/^\/movie\/\d+$/.test(path)) {
      const id = Number(path.split('/').at(-1));
      return request.fulfill({
        json: {
          id,
          title: id === 102 ? 'Current Watchlist Film' : `Watchlist Film ${id}`,
          overview: 'Fixture detail.',
          genres: [],
          credits: { cast: [], crew: [] },
          mediaInfo: {},
        },
      });
    }
    if (/^\/movie\/\d+\/(?:recommendations|similar)$/.test(path))
      return request.fulfill({
        json: { page: 1, totalPages: 1, totalResults: 0, results: [] },
      });
    if (path === '/service/radarr') return request.fulfill({ json: [] });
    return request.fulfill({ json: { page: 1, totalPages: 1, results: [] } });
  });

  await page.goto(route('/watchlist/discover'));
  await page.getByRole('link', { name: 'Current Watchlist Film' }).click();
  await expect(page).toHaveURL(/discoverContext=[a-z0-9_-]{12,64}/i);
  await expect(
    page.getByRole('button', { name: 'Previous', exact: true })
  ).toBeVisible();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page).toHaveURL(/\/movie\/103\?discoverContext=/);
});
