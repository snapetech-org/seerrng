import { expect, test, type Page } from '@playwright/test';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
const baseline = process.env.SEERR_DISCOVERY_BASELINE === 'true';
const theme = process.env.SEERR_DISCOVERY_THEME ?? 'seerrNGJ';
async function login(page: Page, baseURL: string) {
  expect(
    (
      await page.request.post(`${baseURL}/api/v1/auth/local`, {
        data: { email: 'admin@seerr.dev', password: 'test1234' },
      })
    ).status()
  ).toBe(200);
  expect(
    (
      await page.request.post(
        `${baseURL}/api/v1/user/1/settings/interface-theme`,
        {
          data: { theme },
        }
      )
    ).status()
  ).toBe(200);
}
const movie = {
  id: 91001,
  mediaType: 'movie',
  title: 'Recovery Movie',
  name: '',
  overview: 'A fixture for credit identity and requested Search visibility.',
  releaseDate: '2020-01-01',
  voteAverage: 7,
  voteCount: 10,
  popularity: 1,
  mediaInfo: {
    id: 91001,
    status: 2,
    status4k: 1,
    hasActiveRequest: true,
    requests: [],
    seasons: [],
  },
};
for (const width of [1440, 390]) {
  test(`person identity, filters and sorting at ${width}px`, async ({
    page,
    baseURL,
  }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await login(page, baseURL!);
    await page.route('**/api/v1/person/91001**', async (route) => {
      if (
        new URL(route.request().url()).pathname.endsWith('combined_credits')
      ) {
        return route.fulfill({
          json: {
            cast: [
              { ...movie, character: 'First role' },
              { ...movie, character: 'Second role' },
              {
                ...movie,
                mediaType: 'tv',
                title: '',
                name: 'Recovery Series',
                firstAirDate: '2021-01-01',
                voteCount: 20,
                character: 'Series role',
              },
            ],
            crew: [],
          },
        });
      }
      return route.fulfill({
        json: {
          id: 91001,
          name: 'Recovery Person',
          biography: 'Deterministic credits for contribution review.',
          birthday: '',
          deathday: '',
          knownForDepartment: 'Acting',
          alsoKnownAs: [],
          gender: 0,
          popularity: 1,
          adult: false,
          homepage: '',
          imdbId: '',
        },
      });
    });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/person/91001');
    await expect(
      page.getByText('Recovery Person', { exact: true }).first()
    ).toBeVisible();
    const cards = page.locator('ul.cards-vertical > li');
    await expect(cards).toHaveCount(baseline ? 1 : 2);
    await expect(page.getByText(/First role, Second role/)).toBeVisible();
    if (!baseline) {
      await page
        .getByRole('button', { name: 'Sort credits', exact: true })
        .click();
      await page
        .getByRole('option', { name: 'Title (A–Z)', exact: true })
        .click();
      await expect(cards.first()).toContainText('Recovery Movie');
      await page
        .getByRole('button', { name: 'Media type', exact: true })
        .click();
      await page.getByRole('option', { name: 'Movies', exact: true }).click();
      await expect(cards).toHaveCount(1);
      await page
        .getByRole('button', { name: 'Media type', exact: true })
        .click();
      await page.getByRole('option', { name: 'All', exact: true }).click();
      await expect(cards).toHaveCount(2);
    }
    await page.screenshot({
      path: info.outputPath(`person-${theme}-${width}.png`),
      animations: 'disabled',
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      )
    ).toBe(true);
    expect(errors).toEqual([]);
  });
  test(`explicit Search retains requested titles at ${width}px`, async ({
    page,
    baseURL,
  }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await login(page, baseURL!);
    await page.route('**/api/v1/settings/public', async (route) => {
      const response = await route.fetch();
      await route.fulfill({
        response,
        json: { ...(await response.json()), hideRequested: true },
      });
    });
    await page.route('**/api/v1/search?**', (route) =>
      route.fulfill({
        json: {
          page: 1,
          totalPages: 1,
          totalResults: 1,
          results: [movie],
        },
      })
    );
    await page.goto('/search?query=recovery&type=movie');
    await expect(
      page.getByText('Recovery Movie', { exact: true }).first()
    ).toBeVisible();
    await page.screenshot({
      path: info.outputPath(`search-${theme}-${width}.png`),
      animations: 'disabled',
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      )
    ).toBe(true);
  });
}
