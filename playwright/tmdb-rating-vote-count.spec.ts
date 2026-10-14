import { expect, test, type Page } from '@playwright/test';

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
};

for (const media of [
  { name: 'movies', path: '/discover/movies', api: '/api/v1/discover/movies' },
  { name: 'series', path: '/discover/tv', api: '/api/v1/discover/tv' },
]) {
  test(`${media.name} TMDB rating sort applies a minimum vote count`, async ({
    page,
    baseURL,
  }) => {
    await loginAsAdmin(page, baseURL);
    await page.route(`**${media.api}**`, (route) =>
      route.fulfill({
        json: { page: 1, totalPages: 0, totalResults: 0, results: [] },
      })
    );

    const discoverRequest = page.waitForRequest((request) => {
      if (!request.url().includes(media.api)) return false;

      const query = new URL(request.url()).searchParams;
      return query.get('sortBy') === 'vote_average.desc';
    });
    await page.goto(media.path);
    const sortSection = page.getByRole('region', { name: 'Sort By' });
    await sortSection
      .getByRole('button', { name: 'Sort By', exact: true })
      .click();
    await sortSection.getByRole('button', { name: 'TMDB Rating' }).click();
    const request = await discoverRequest;
    expect(new URL(request.url()).searchParams.get('voteCountGte')).toBe('50');
  });

  test(`${media.name} filters fractional scores and excludes selected services`, async ({
    page,
    baseURL,
  }) => {
    await loginAsAdmin(page, baseURL);
    await page.route(`**${media.api}**`, (route) =>
      route.fulfill({
        json: { page: 1, totalPages: 0, totalResults: 0, results: [] },
      })
    );
    await page.route('**/api/v1/watchproviders/**', (route) =>
      route.fulfill({
        json: [
          {
            id: 8,
            name: 'Netflix',
            logoPath: '/provider.png',
            displayPriority: 1,
          },
        ],
      })
    );

    await page.goto(media.path);
    await page.getByRole('button', { name: 'Filters', exact: true }).click();
    await page.getByRole('button', { name: 'TMDB Rating: Any' }).click();
    await page.getByRole('option', { name: '7.5+' }).click();

    const filterToggle = page.getByRole('button', {
      name: 'Streaming Services',
    });
    await filterToggle.click();
    await page.getByRole('button', { name: 'Netflix' }).click();
    await page.getByRole('button', { name: 'Match selected services' }).click();
    const filteredResponse = page.waitForResponse((response) => {
      if (!response.url().includes(media.api)) return false;

      const query = new URL(response.url()).searchParams;
      return (
        query.get('voteAverageGte') === '7.5' &&
        query.get('watchProviders') === '8' &&
        query.get('watchProviderMode') === 'exclude'
      );
    });
    await page
      .getByRole('option', { name: 'Exclude selected services' })
      .click();
    expect((await filteredResponse).ok()).toBe(true);

    await expect(page).toHaveURL(/voteAverageGte=7.5/);
    await expect(page).toHaveURL(/watchProviders=8/);
    await expect(page).toHaveURL(/watchProviderMode=exclude/);
    await expect(
      page.getByRole('button', { name: 'TMDB Rating: 7.5+' })
    ).toBeVisible();

    const previewDirectory = process.env.SEERRNG_DISCOVER_PREVIEW_DIR;
    if (previewDirectory) {
      await page.screenshot({
        path: `${previewDirectory}/discover-${media.name}-desktop.png`,
        fullPage: true,
      });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.screenshot({
        path: `${previewDirectory}/discover-${media.name}-narrow.png`,
        fullPage: true,
      });
    }
  });
}
