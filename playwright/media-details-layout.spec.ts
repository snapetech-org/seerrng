import { expect, test, type Page } from '@playwright/test';
import type { MovieDetails } from '@server/models/Movie';
import type { TvDetails } from '@server/models/Tv';

test.use({ serviceWorkers: 'block' });

const loginAsAdmin = async (page: Page, baseURL: string | undefined) => {
  const response = await page
    .context()
    .request.post(`${baseURL}/api/v1/auth/local`, {
      data: { email: 'admin@seerr.dev', password: 'test1234' },
      headers: { 'X-Forwarded-Proto': 'https' },
    });
  expect(response.status()).toBe(200);
  const sid = response
    .headersArray()
    .find((header) => header.name.toLowerCase() === 'set-cookie')
    ?.value.match(/^connect\.sid=([^;]+)/)?.[1];
  expect(sid).toBeTruthy();
  await page.context().addCookies([
    {
      name: 'connect.sid',
      value: sid!,
      url: baseURL!,
      httpOnly: true,
      secure: false,
      sameSite: 'Lax',
    },
  ]);
};

const movie: MovieDetails = {
  id: 550,
  adult: false,
  budget: 63000000,
  genres: [],
  originalLanguage: 'en',
  originalTitle: 'Fight Club',
  popularity: 1,
  productionCompanies: [],
  productionCountries: [],
  releaseDate: '1999-10-15',
  releases: { results: [] },
  revenue: 0,
  spokenLanguages: [],
  status: 'Released',
  title: 'Fight Club',
  video: false,
  voteAverage: 8.4,
  voteCount: 100,
  credits: { cast: [], crew: [] },
  externalIds: {},
  keywords: [],
};

const tv: TvDetails = {
  id: 1396,
  contentRatings: { results: [] },
  createdBy: [],
  episodeRunTime: [],
  genres: [],
  homepage: '',
  inProduction: false,
  languages: ['en'],
  lastAirDate: '2013-09-29',
  name: 'Breaking Bad',
  networks: [],
  numberOfEpisodes: 62,
  numberOfSeasons: 5,
  originCountry: ['US'],
  originalLanguage: 'en',
  originalName: 'Breaking Bad',
  overview: 'A chemistry teacher turns to manufacturing drugs.',
  popularity: 1,
  productionCompanies: [],
  productionCountries: [],
  spokenLanguages: [],
  seasons: [],
  status: 'Ended',
  type: 'Scripted',
  voteAverage: 9.5,
  voteCount: 100,
  credits: { cast: [], crew: [] },
  externalIds: {},
  keywords: [],
};

const mediaDetailsPages = [
  {
    route: '/movie/550',
    discoveryPath: '/discover/movies',
    mediaType: 'movie',
    id: movie.id,
    title: movie.title,
    date: movie.releaseDate,
    details: movie,
    pagePropsKey: 'movie',
  },
  {
    route: '/tv/1396',
    discoveryPath: '/discover/tv',
    mediaType: 'tv',
    id: tv.id,
    title: tv.name,
    date: tv.firstAirDate ?? '2008-01-20',
    details: tv,
    pagePropsKey: 'tv',
  },
] as const;

const mockMediaNavigation = async (
  page: Page,
  media: (typeof mediaDetailsPages)[number]
) => {
  let discoveryFixtureApplied = false;
  let detailsFixtureApplied = false;
  const discoveryEndpoint = media.mediaType === 'movie' ? 'movies' : 'tv';

  await page.route(`**/api/v1/discover/${discoveryEndpoint}*`, (route) => {
    discoveryFixtureApplied = true;
    return route.fulfill({
      json: {
        page: 1,
        totalPages: 1,
        totalResults: 1,
        results: [
          {
            id: media.id,
            mediaType: media.mediaType,
            title: media.title,
            name: media.title,
            releaseDate: media.date,
            firstAirDate: media.date,
            posterPath: null,
          },
        ],
      },
    });
  });
  await page.route(
    `**/_next/data/**/${media.mediaType}/${media.id}.json*`,
    (route) => {
      detailsFixtureApplied = true;
      return route.fulfill({
        json: {
          pageProps: { [media.pagePropsKey]: media.details },
          __N_SSP: true,
        },
      });
    }
  );
  await page.route(`**/api/v1/${media.mediaType}/${media.id}`, (route) =>
    route.fulfill({ json: media.details })
  );
  await page.route(
    `**/api/v1/${media.mediaType}/${media.id}/ratingscombined*`,
    (route) => route.fulfill({ json: {} })
  );
  await page.route(
    `**/api/v1/${media.mediaType}/${media.id}/recommendations*`,
    (route) =>
      route.fulfill({
        json: { page: 1, totalPages: 0, totalResults: 0, results: [] },
      })
  );
  await page.route(
    `**/api/v1/${media.mediaType}/${media.id}/similar*`,
    (route) =>
      route.fulfill({
        json: { page: 1, totalPages: 0, totalResults: 0, results: [] },
      })
  );
  await page.route('**/api/v1/watchproviders/regions*', (route) =>
    route.fulfill({
      json: [{ iso_3166_1: 'US', english_name: 'United States' }],
    })
  );
  await page.route('**/api/v1/watchproviders/movies*', (route) =>
    route.fulfill({ json: [] })
  );
  await page.route('**/api/v1/watchproviders/tv*', (route) =>
    route.fulfill({ json: [] })
  );

  await page.goto(media.discoveryPath);
  await expect(page.getByTestId('title-card')).toHaveCount(1);
  expect(discoveryFixtureApplied).toBe(true);
  const card = page.getByTestId('title-card').first();
  await card.hover();
  const detailsLink = card.locator('[data-poster-region="detail-link"]');
  await expect(detailsLink).toBeVisible();
  await detailsLink.click();
  await page.waitForURL((url) => url.pathname === media.route);
  await page.waitForLoadState('networkidle');
  expect(detailsFixtureApplied).toBe(true);
  for (const width of [320, 360, 375, 390, 412, 768, 1024, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    const horizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth
    );
    expect(
      horizontalOverflow,
      `${media.route} at ${width}px`
    ).toBeLessThanOrEqual(1);
  }
};

for (const media of mediaDetailsPages) {
  test(`${media.mediaType} details keep actions in a responsive sidebar`, async ({
    page,
    baseURL,
  }) => {
    await loginAsAdmin(page, baseURL);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setViewportSize({ width: 1440, height: 1000 });
    await mockMediaNavigation(page, media);

    const layout = page.locator(`[data-detail-layout="${media.mediaType}"]`);
    await expect(layout).toBeVisible();
    const desktop = await layout.evaluate((node) => {
      const information = node.querySelector(':scope > div');
      const actions = node.querySelector(':scope > aside');
      if (!information || !actions) return null;
      const informationBounds = information.getBoundingClientRect();
      const actionsBounds = actions.getBoundingClientRect();
      return {
        display: getComputedStyle(node).display,
        informationX: informationBounds.x,
        informationY: informationBounds.y,
        actionsX: actionsBounds.x,
        actionsY: actionsBounds.y,
      };
    });
    expect(desktop).not.toBeNull();
    expect(desktop!.display).toBe('grid');
    expect(desktop!.actionsX).toBeGreaterThan(desktop!.informationX);
    expect(Math.abs(desktop!.actionsY - desktop!.informationY)).toBeLessThan(2);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(150);
    const mobile = await layout.evaluate((node) => {
      const information = node.querySelector(':scope > div');
      const actions = node.querySelector(':scope > aside');
      if (!information || !actions) return null;
      const informationBounds = information.getBoundingClientRect();
      const actionsBounds = actions.getBoundingClientRect();
      return {
        columns: getComputedStyle(node).gridTemplateColumns,
        informationX: informationBounds.x,
        informationY: informationBounds.y,
        actionsX: actionsBounds.x,
        actionsY: actionsBounds.y,
      };
    });
    expect(mobile).not.toBeNull();
    expect(mobile!.columns.split(' ')).toHaveLength(1);
    expect(mobile!.actionsY).toBeLessThan(mobile!.informationY);
    expect(Math.abs(mobile!.actionsX - mobile!.informationX)).toBeLessThan(2);
    expect(errors).toEqual([]);
  });
}
