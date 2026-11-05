import { expect, test, type Page } from '@playwright/test';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
const baseline = process.env.SEERR_EPISODE_BASELINE === 'true';
const tv = {
  id: 1396,
  name: 'Episode availability fixture',
  originalName: 'Episode availability fixture',
  mediaType: 'tv',
  firstAirDate: '2020-01-01',
  lastAirDate: '2020-01-03',
  numberOfSeasons: 1,
  numberOfEpisodes: 2,
  contentRatings: { results: [] },
  createdBy: [],
  episodeRunTime: [22],
  genres: [],
  homepage: '',
  inProduction: false,
  languages: ['en'],
  networks: [],
  originCountry: ['US'],
  originalLanguage: 'en',
  overview: 'Source inventory and playback access stay independent.',
  popularity: 1,
  productionCompanies: [],
  productionCountries: [],
  spokenLanguages: [],
  status: 'Ended',
  type: 'Scripted',
  voteAverage: 8,
  voteCount: 100,
  credits: { cast: [], crew: [] },
  externalIds: { tvdbId: 79168 },
  keywords: [],
  seasons: [
    {
      id: 1,
      seasonNumber: 1,
      name: 'Season 1',
      episodeCount: 2,
      airDate: '2020-01-01',
      overview: '',
    },
  ],
  mediaInfo: {
    id: 1396,
    tmdbId: 1396,
    mediaType: 'tv',
    status: 1,
    status4k: 1,
    requests: [],
    seasons: [],
  },
};
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
        { data: { theme: process.env.SEERR_EPISODE_THEME ?? 'seerrNGJ' } }
      )
    ).status()
  ).toBe(200);
}
for (const width of process.env.SEERR_EPISODE_WIDTHS?.split(',').map(
  Number
) ?? [1440, 390]) {
  test(`library episode order saves without changing enabled libraries at ${width}px`, async ({
    page,
    baseURL,
  }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await login(page, baseURL!);
    let saved: Record<string, unknown> | undefined;
    const library = {
      id: '1',
      name: 'TV fixture',
      type: 'show',
      enabled: true,
      episodeOrderProvider: 'tmdb',
    };
    await page.route('**/api/v1/settings/plex**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (route.request().method() === 'POST') {
        saved = route.request().postDataJSON();
        library.episodeOrderProvider = String(saved?.episodeOrderProvider);
        return route.fulfill({ json: [library] });
      }
      if (path.endsWith('/sync'))
        return route.fulfill({
          json: { running: false, progress: 0, total: 0, libraries: [library] },
        });
      return route.fulfill({
        json: {
          name: 'Fixture',
          ip: '127.0.0.1',
          port: 32400,
          useSsl: false,
          machineId: 'fixture',
          libraries: [library],
        },
      });
    });
    await page.route('**/api/v1/settings/tautulli', (route) =>
      route.fulfill({
        json: { hostname: '', port: 8181, apiKey: '', useSsl: false },
      })
    );
    await page.goto('/settings/plex');
    const control = page.getByLabel('Episode Order for TV fixture', {
      exact: true,
    });
    if (!baseline) {
      await control.selectOption('tvdb');
      await expect
        .poll(() => saved)
        .toMatchObject({
          enable: '1',
          episodeOrderLibraryId: '1',
          episodeOrderProvider: 'tvdb',
        });
      await expect(control).toHaveValue('tvdb');
      await control.scrollIntoViewIfNeeded();
    } else {
      await expect(control).toHaveCount(0);
      await page
        .getByText('TV fixture', { exact: true })
        .first()
        .scrollIntoViewIfNeeded();
    }
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.screenshot({
      fullPage: true,
      path: info.outputPath(`library-order-${width}.png`),
      animations: 'disabled',
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      )
    ).toBe(true);
  });
  test(`live episode tree exposes source files without granting playback at ${width}px`, async ({
    page,
    baseURL,
  }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await login(page, baseURL!);
    await page.route('**/_next/data/**/tv/1396.json*', (route) =>
      route.fulfill({ json: { pageProps: { tv }, __N_SSP: true } })
    );
    await page.route('**/api/v1/tv/1396**', (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path.includes('/season/'))
        return route.fulfill({
          json: {
            seasonNumber: 1,
            episodes: [
              {
                id: 101,
                episodeNumber: 1,
                seasonNumber: 1,
                name: 'Source file only',
                airDate: '2020-01-01',
                availabilitySources: [
                  { sourceType: 'sonarr', hd: true, fourK: false },
                  { sourceType: 'plex', hd: true, fourK: true },
                ],
              },
              {
                id: 102,
                episodeNumber: 2,
                seasonNumber: 1,
                name: 'Missing file',
                airDate: '2020-01-02',
              },
            ],
          },
        });
      if (path === '/api/v1/tv/1396') return route.fulfill({ json: tv });
      return route.fulfill({
        json: { page: 1, totalPages: 0, totalResults: 0, results: [] },
      });
    });
    await page.route('**/api/v1/playback/media/**', (route) =>
      route.fulfill({
        json: { mediaId: 1396, serverType: 1, is4k: false, groups: [] },
      })
    );
    await page.route('**/api/v1/watchstatus/**', (route) =>
      route.fulfill({ json: { serverType: 1, seasons: [] } })
    );
    await page.goto('/');
    await page.evaluate(() => (window as any).next.router.push('/tv/1396'));
    await expect(
      page
        .getByRole('heading', { name: `${tv.name} (2020)`, exact: true })
        .first()
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'Media Server', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Expand Season 01', exact: true })
      .click();
    const episode = page
      .locator('[data-tree-part="episode"]')
      .filter({ hasText: 'Source file only' });
    await expect(episode).toBeVisible();
    const availability = episode.locator('[data-tree-part="availability"]');
    await expect(availability).toHaveAttribute('data-availability', 'missing');
    if (!baseline) {
      await expect
        .poll(
          async () =>
            (await episode.locator('[data-tree-part="name"]').boundingBox())
              ?.width ?? 0
        )
        .toBeGreaterThan(40);
      await availability.click();
      await expect(
        page
          .getByRole('tooltip')
          .getByText('Available · Sonarr', { exact: true })
      ).toBeVisible();
      await expect(
        page
          .getByRole('tooltip')
          .getByText('Available · Plex · 4K', { exact: true })
      ).toBeVisible();
    }
    await page.screenshot({
      path: info.outputPath(`episode-sources-${width}.png`),
      animations: 'disabled',
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      )
    ).toBe(true);
  });
}
