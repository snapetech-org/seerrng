import { expect, test, type Page } from '@playwright/test';

test.use({ serviceWorkers: 'block' });

const loginAsAdmin = async (page: Page, baseURL: string | undefined) => {
  expect(baseURL).toBeTruthy();
  const loginResponse = await page
    .context()
    .request.post(`${baseURL}/api/v1/auth/local`, {
      data: { email: 'admin@seerr.dev', password: 'test1234' },
      headers: { 'X-Forwarded-Proto': 'https' },
    });
  expect(loginResponse.status()).toBe(200);

  const sessionCookie = loginResponse
    .headersArray()
    .find(
      (header) =>
        header.name.toLowerCase() === 'set-cookie' &&
        header.value.startsWith('connect.sid=')
    )
    ?.value.match(/^connect\.sid=([^;]+)/)?.[1];
  expect(sessionCookie).toBeTruthy();

  await page.context().addCookies([
    {
      name: 'connect.sid',
      value: sessionCookie!,
      url: baseURL!,
      httpOnly: true,
      secure: false,
      sameSite: 'Lax',
    },
  ]);

  const currentUserResponse = await page
    .context()
    .request.get(`${baseURL}/api/v1/auth/me`);
  expect(currentUserResponse.status()).toBe(200);
  return currentUserResponse.json() as Promise<{
    id: number;
    displayName: string;
  }>;
};

for (const viewport of [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'narrow', width: 390, height: 844 },
]) {
  test(`movie request edit opens without request.media at ${viewport.name} width`, async ({
    page,
    baseURL,
  }, testInfo) => {
    await page.setViewportSize({
      width: viewport.width,
      height: viewport.height,
    });
    const user = await loginAsAdmin(page, baseURL);
    const request = {
      id: 987654,
      type: 'movie',
      status: 1,
      requestedBy: {
        id: user.id,
        displayName: user.displayName,
        avatar: '',
      },
      createdAt: '2026-10-04T12:00:00.000Z',
      seasons: [],
      is4k: false,
      serverId: null,
      profileId: null,
      rootFolder: null,
      languageProfileId: null,
      tags: [],
    };
    expect(request).not.toHaveProperty('media');
    const movie = {
      id: 438148,
      adult: false,
      budget: 0,
      genres: [],
      originalLanguage: 'en',
      originalTitle: 'The Social Reckoning',
      popularity: 0,
      productionCompanies: [],
      productionCountries: [],
      releaseDate: '2026-10-07',
      releases: { results: [] },
      revenue: 0,
      spokenLanguages: [],
      status: 'Released',
      title: 'The Social Reckoning',
      video: false,
      voteAverage: 0,
      voteCount: 0,
      credits: { cast: [], crew: [] },
      externalIds: {},
      keywords: [],
      mediaInfo: {
        id: 987654,
        mediaType: 'movie',
        tmdbId: 438148,
        status: 2,
        status4k: 1,
        requests: [request],
        downloadStatus: [],
        downloadStatus4k: [],
      },
    };

    // Keep this browser regression independent from TMDB and configured
    // services. The request deliberately omits the optional request.media link.
    // Next data navigation is a browser request; the page's internal API call
    // during server rendering is server-to-server and cannot be intercepted by
    // page.route. Keep a separate browser API fixture for the post-navigation
    // SWR refresh.
    let detailsFixtureApplied = false;
    let browserMovieFixtureApplied = false;
    let discoveryFixtureApplied = false;
    await page.route('**/api/v1/discover/movies*', async (route) => {
      discoveryFixtureApplied = true;
      await route.fulfill({
        json: {
          page: 1,
          totalPages: 1,
          totalResults: 1,
          results: [
            {
              id: movie.id,
              mediaType: 'movie',
              title: movie.title,
              releaseDate: movie.releaseDate,
              posterPath: null,
            },
          ],
        },
      });
    });
    await page.route('**/api/v1/movie/438148', (route) => {
      browserMovieFixtureApplied = true;
      return route.fulfill({ json: movie });
    });
    await page.route('**/_next/data/**/movie/438148.json*', (route) => {
      detailsFixtureApplied = true;
      return route.fulfill({
        json: { pageProps: { movie }, __N_SSP: true },
      });
    });
    await page.route('**/api/v1/movie/438148/ratingscombined*', (route) =>
      route.fulfill({ json: {} })
    );
    await page.route('**/api/v1/movie/438148/recommendations*', (route) =>
      route.fulfill({
        json: { page: 1, totalPages: 0, totalResults: 0, results: [] },
      })
    );
    await page.route('**/api/v1/movie/438148/similar*', (route) =>
      route.fulfill({
        json: { page: 1, totalPages: 0, totalResults: 0, results: [] },
      })
    );
    await page.route('**/api/v1/service/radarr*', (route) =>
      route.fulfill({ json: [] })
    );
    await page.route('**/api/v1/media/987654/library*', (route) =>
      route.fulfill({ json: { targets: [] } })
    );
    await page.route('**/api/v1/blocklist/438148*', (route) =>
      route.fulfill({ status: 404, json: { message: 'Not found' } })
    );

    const movieResponse = page.waitForResponse((response) => {
      const pathname = new URL(response.url()).pathname;
      return (
        pathname.includes('/_next/data/') &&
        pathname.endsWith('/movie/438148.json')
      );
    });
    const browserMovieResponse = page.waitForResponse(
      (response) => new URL(response.url()).pathname === '/api/v1/movie/438148'
    );
    await page.goto('/discover/movies');
    await expect(page.getByTestId('title-card')).toHaveCount(1);
    expect(discoveryFixtureApplied).toBe(true);
    const card = page.getByTestId('title-card').first();
    await card.hover();
    const detailsLink = card.locator('[data-poster-region="detail-link"]');
    await expect(detailsLink).toBeVisible();
    await detailsLink.click();
    const mockedMovieResponse = await movieResponse;
    expect(mockedMovieResponse.status()).toBe(200);
    expect(detailsFixtureApplied).toBe(true);
    expect(await mockedMovieResponse.json()).toMatchObject({
      pageProps: {
        movie: {
          title: movie.title,
          mediaInfo: { requests: [{ id: request.id }] },
        },
      },
    });
    const mockedBrowserMovieResponse = await browserMovieResponse;
    expect(mockedBrowserMovieResponse.status()).toBe(200);
    expect(browserMovieFixtureApplied).toBe(true);
    expect(await mockedBrowserMovieResponse.json()).toMatchObject({
      title: movie.title,
      mediaInfo: { requests: [{ id: request.id }] },
    });
    await expect(page.getByTestId('media-title')).toContainText(movie.title);
    const manageButton = page.getByRole('button', { name: 'Manage Movie' });
    await expect(manageButton).toBeEnabled();
    await manageButton.click();

    const requestRow = page
      .locator('li')
      .filter({ hasText: user.displayName })
      .first();
    await expect(requestRow).toBeVisible();
    const editButton = requestRow.getByRole('button', {
      name: 'Edit Request',
    });
    await expect(editButton).toBeVisible();
    await editButton.click();

    const editDialog = page.getByRole('dialog', {
      name: 'Pending Movie Request',
    });
    if (!(await editDialog.isVisible())) {
      await page.screenshot({
        path: testInfo.outputPath(
          `edit-request-before-fix-${viewport.name}.png`
        ),
        animations: 'disabled',
      });
    }
    await expect(editDialog).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath(`edit-request-modal-${viewport.name}.png`),
      animations: 'disabled',
    });
  });
}
