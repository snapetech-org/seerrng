import { expect, test, type Page } from '@playwright/test';
import { writeFileSync } from 'node:fs';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
const baseline = process.env.SEERR_FINAL_BASELINE === 'true';
const theme = process.env.SEERR_FINAL_THEME ?? 'seerrNGJ';
async function login(page: Page) {
  expect(
    (
      await page.request.post('/api/v1/auth/local', {
        data: { email: 'admin@seerr.dev', password: 'test1234' },
      })
    ).status()
  ).toBe(200);
  expect(
    (
      await page.request.post('/api/v1/user/1/settings/interface-theme', {
        data: { theme },
      })
    ).status()
  ).toBe(200);
  await page.route('**/api/v1/genres/movie', (route) =>
    route.fulfill({
      json: [
        { id: 28, name: 'Action' },
        { id: 35, name: 'Comedy' },
      ],
    })
  );
  await page.route('**/api/v1/genres/tv', (route) =>
    route.fulfill({ json: [{ id: 10759, name: 'Action & Adventure' }] })
  );
  await page.route('**/api/v1/keyword/60', (route) =>
    route.fulfill({ json: { id: 60, name: 'Fixture Keyword' } })
  );
}
const movie = {
  id: 970001,
  title: 'Recovery Fixture Movie',
  originalTitle: 'Recovery Fixture Movie',
  adult: false,
  releaseDate: '2020-01-01',
  runtime: 110,
  genres: [],
  originalLanguage: 'en',
  overview: 'Deterministic metadata for contribution review.',
  productionCompanies: [],
  productionCountries: [],
  spokenLanguages: [],
  status: 'Released',
  voteAverage: 7.4,
  voteCount: 10,
  popularity: 1,
  credits: { cast: [], crew: [] },
  externalIds: {},
  keywords: [],
  releases: { results: [] },
};
const follow = {
  id: 91,
  kind: 'tmdb-person',
  subjectKey: 'tmdb:person:99',
  subjectLabel: 'Recovery Fixture Person',
  conditions: { ref: { tmdbId: 99 } },
  notify: true,
  autoRequest: false,
  createdAt: '2026-11-01T00:00:00.000Z',
};
const event = (id: number) => ({
  id,
  title: `Recovery Follow Movie ${id}`,
  reasonKey: 'newVideoTitle',
  reasonValues: {
    title: `Recovery Follow Movie ${id}`,
    subject: follow.subjectLabel,
    date: '2026-11-01',
  },
  target: { mediaType: 'movie', id: String(970000 + id) },
  seen: false,
  createdAt: '2026-11-01T00:00:00.000Z',
  follow,
});
for (const width of [390, 1440]) {
  test(`genre and streaming settings at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await login(page);
    await page.route('**/api/v1/settings/main', async (route) => {
      const response = await route.fetch();
      return route.fulfill({
        json: {
          ...(await response.json()),
          blocklistedTags: '60',
          blocklistedGenresMovie: '',
          blocklistedGenresTv: '',
          streamingRequestPolicy: {
            enabled: false,
            condition: 'available',
            action: 'reject',
            allowUserOverride: false,
            rejectionMessage: '',
          },
        },
      });
    });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/settings/main');
    await expect(page.locator('#blocklistedTagsLimit')).toBeVisible();
    if (!baseline) {
      const genres = page.getByLabel('Blocklist Movies by Genre', {
        exact: true,
      });
      await genres.fill('Action');
      await expect(
        page.getByRole('option', { name: 'Action', exact: true })
      ).toBeVisible();
      await page.screenshot({
        path: info.outputPath(`${theme}-${width}-genre-menu.png`),
      });
      await page.getByRole('option', { name: 'Action', exact: true }).click();
      await page
        .getByLabel('Streaming Availability Request Policy', { exact: true })
        .click();
      await expect(
        page.getByLabel('Matching Request Behavior', { exact: true })
      ).toBeVisible();
      await page
        .getByLabel('Allow Users to Request Anyway', { exact: true })
        .click();
    }
    await page.locator('#blocklistedTagsLimit').scrollIntoViewIfNeeded();
    await page.screenshot({
      path: info.outputPath(`${theme}-${width}-settings.png`),
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      )
    ).toBe(true);
    expect(errors).toEqual([]);
  });
  test(`mixed automatic blocklist sources at ${width}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await login(page);
    const item = {
      tmdbId: movie.id,
      mediaType: 'movie',
      title: movie.title,
      createdAt: '2026-11-01T00:00:00.000Z',
      blocklistedTags: ',60,',
      blocklistedGenres: ',28,',
    };
    await page.route(/\/api\/v1\/blocklist\/(?:\?.*)?$/, (route) =>
      route.fulfill({
        json: {
          pageInfo: { pages: 1, pageSize: 20, page: 1, results: 1 },
          results: [item],
          counts: {
            all: 1,
            manual: 0,
            blocklistedTags: 1,
            blocklistedGenres: 1,
          },
        },
      })
    );
    await page.route(`**/api/v1/movie/${movie.id}`, (route) =>
      route.fulfill({ json: movie })
    );
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/blocklist');
    await expect(
      page
        .getByRole('link', { name: `${movie.title} (2020)`, exact: true })
        .first()
    ).toBeVisible();
    await expect(
      page.getByText('Blocklist Tag', { exact: true }).first()
    ).toBeVisible();
    if (!baseline)
      await expect(
        page.getByText('Blocklist Genre', { exact: true }).first()
      ).toBeVisible();
    const badge = page
      .getByText('Blocklist Tag', { exact: true })
      .first()
      .locator('..');
    const geometry = await badge.evaluate((node) => {
      const style = getComputedStyle(node);
      const icon = node.querySelector('svg')!;
      const bounds = node.getBoundingClientRect();
      return {
        width: bounds.width,
        height: bounds.height,
        color: style.color,
        borderColor: style.borderColor,
        borderRadius: style.borderRadius,
        fontSize: style.fontSize,
        lineHeight: style.lineHeight,
        gap: style.gap,
        iconWidth: icon.getBoundingClientRect().width,
        iconHeight: icon.getBoundingClientRect().height,
      };
    });
    writeFileSync(
      info.outputPath(`${theme}-${width}-tag-badge.json`),
      JSON.stringify(geometry, null, 2)
    );

    await page.screenshot({
      path: info.outputPath(`${theme}-${width}-blocklist.png`),
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      )
    ).toBe(true);
    expect(errors).toEqual([]);
  });
  test(`personal following cards at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await login(page);
    await page.route('**/api/v1/follow', (route) =>
      route.fulfill({ json: { results: [follow] } })
    );
    await page.route('**/api/v1/follow/events?*', (route) =>
      route.fulfill({ json: { total: 1, results: [event(1)] } })
    );
    await page.goto('/following');
    await expect(page.getByText(event(1).title, { exact: true })).toBeVisible();
    if (!baseline)
      await expect(
        page.getByRole('link', { name: 'Browse', exact: true })
      ).toHaveAttribute('href', '/person/99');
    await page.screenshot({
      path: info.outputPath(`${theme}-${width}-following.png`),
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      )
    ).toBe(true);
  });
}

test('following loads beyond the API hundred-item page cap', async ({
  page,
}) => {
  await login(page);
  await page.route('**/api/v1/follow', (route) =>
    route.fulfill({ json: { results: [follow] } })
  );
  await page.route('**/api/v1/follow/events?*', (route) => {
    const url = new URL(route.request().url());
    const take = Math.min(100, Number(url.searchParams.get('take') ?? 30));
    const skip = Number(url.searchParams.get('skip') ?? 0);
    return route.fulfill({
      json: {
        total: 101,
        results: Array.from(
          { length: Math.min(take, 101 - skip) },
          (_, index) => event(index + skip + 1)
        ),
      },
    });
  });
  await page.goto('/following');
  await expect(
    page.getByText('Recovery Follow Movie 30', { exact: true })
  ).toHaveCount(1);
  for (let index = 0; index < 3; index++) {
    await page.getByRole('button', { name: 'Load More', exact: true }).click();
    await expect(
      page.getByText(
        `Recovery Follow Movie ${Math.min(101, (index + 2) * 30)}`,
        { exact: true }
      )
    ).toHaveCount(1);
  }
  await expect(
    page.getByText('Recovery Follow Movie 101', { exact: true })
  ).toHaveCount(1);
  await expect(
    page.getByRole('button', { name: 'Load More', exact: true })
  ).toHaveCount(0);
});

test('Following exposes a failed page and retries without losing the page title', async ({
  page,
}) => {
  await login(page);
  await page.route('**/api/v1/follow', (route) =>
    route.fulfill({ json: { results: [follow] } })
  );
  let failed = true;
  await page.route('**/api/v1/follow/events?*', (route) =>
    failed
      ? route.fulfill({
          status: 503,
          json: { message: 'Temporary fixture outage' },
        })
      : route.fulfill({ json: { total: 1, results: [event(1)] } })
  );
  await page.goto('/following');
  await expect(
    page.getByRole('heading', { name: 'Following', exact: true })
  ).toBeVisible();
  await expect(
    page.getByText('Following updates could not be loaded.', { exact: true })
  ).toBeVisible();
  failed = false;
  await page.getByRole('button', { name: 'Try Again', exact: true }).click();
  await expect(page.getByText(event(1).title, { exact: true })).toBeVisible();
  await expect(
    page.getByText('Following updates could not be loaded.', { exact: true })
  ).toHaveCount(0);
});

for (const width of [390, 1440]) {
  for (const mediaType of ['movie', 'tv'] as const) {
    for (const tagOnly of [true, false]) {
      test(`${mediaType} ${tagOnly ? 'requester tag' : 'streaming override'} dialog at ${width}px`, async ({
        page,
      }, info) => {
        test.skip(baseline);
        await page.setViewportSize({ width, height: 900 });
        await login(page);
        const id = movie.id;
        const serviceType = mediaType === 'movie' ? 'radarr' : 'sonarr';
        const mediaInfo = {
          id: 970001,
          mediaType,
          tmdbId: id,
          status: tagOnly ? 5 : 1,
          status4k: 1,
          requests: [],
          downloadStatus: [],
          downloadStatus4k: [],
          seasons: [{ seasonNumber: 1, status: tagOnly ? 5 : 1, status4k: 1 }],
          serviceStatuses: tagOnly
            ? [
                {
                  serviceType,
                  serverId: 0,
                  format: 'standard',
                  status: 5,
                  externalServiceId: 91,
                  seasonStatuses: { 1: 5 },
                },
              ]
            : [],
        };
        const details =
          mediaType === 'movie'
            ? { ...movie, mediaInfo }
            : {
                ...movie,
                title: undefined,
                originalTitle: undefined,
                releaseDate: undefined,
                runtime: undefined,
                name: movie.title,
                originalName: movie.title,
                firstAirDate: movie.releaseDate,
                externalIds: { tvdbId: 970002 },
                contentRatings: { results: [] },
                createdBy: [],
                episodeRunTime: [45],
                inProduction: false,
                languages: ['en'],
                lastAirDate: '2020-01-01',
                networks: [],
                numberOfEpisodes: 1,
                numberOfSeasons: 1,
                originCountry: ['US'],
                type: 'Scripted',
                seasons: [
                  {
                    id: 1,
                    seasonNumber: 1,
                    episodeCount: 1,
                    name: 'Season 1',
                    airDate: '2020-01-01',
                  },
                ],
                mediaInfo,
              };
        const service = {
          id: 0,
          name: 'Recovery service zero',
          isDefault: true,
          is4k: false,
          activeProfileId: 0,
          activeDirectory: '/media',
          activeTags: [],
          tagRequests: true,
        };
        await page.route(`**/api/v1/service/${serviceType}**`, (route) =>
          route.fulfill({
            json:
              new URL(route.request().url()).pathname ===
              `/api/v1/service/${serviceType}/0`
                ? {
                    server: service,
                    profiles: [{ id: 0, name: 'Default' }],
                    rootFolders: [{ id: 1, path: '/media' }],
                    tags: [],
                    languageProfiles: [],
                  }
                : [service],
          })
        );
        await page.route('**/api/v1/user/1/quota', (route) =>
          route.fulfill({
            json: {
              movie: { limit: 0, used: 0, remaining: 0, restricted: false },
              tv: { limit: 0, used: 0, remaining: 0, restricted: false },
            },
          })
        );
        await page.route(
          '**/api/v1/user/1/settings/request-root-folders',
          (route) => route.fulfill({ json: {} })
        );
        await page.route(`**/api/v1/${mediaType}/${id}`, (route) =>
          route.fulfill({ json: details })
        );
        await page.route(`**/_next/data/**/${mediaType}/${id}.json*`, (route) =>
          route.fulfill({
            json: { pageProps: { [mediaType]: details }, __N_SSP: true },
          })
        );
        await page.route(`**/api/v1/${mediaType}/${id}/**`, (route) =>
          route.fulfill({
            json: {
              page: 1,
              totalPages: 0,
              totalResults: 0,
              results: [],
              seasonNumber: 1,
              episodes: [
                {
                  id: 1,
                  seasonNumber: 1,
                  episodeNumber: 1,
                  airDate: '2020-01-01',
                  name: 'Pilot',
                },
              ],
            },
          })
        );
        await page.route(`**/api/v1/blocklist/${id}*`, (route) =>
          route.fulfill({ status: 404, json: { message: 'Not found' } })
        );
        await page.route('**/api/v1/playback/**', (route) =>
          route.fulfill({
            status: 503,
            json: { message: 'Fixture playback disabled' },
          })
        );
        await page.route(
          `**/api/v1/discover/${mediaType === 'movie' ? 'movies' : 'tv'}*`,
          (route) =>
            route.fulfill({
              json: {
                page: 1,
                totalPages: 1,
                totalResults: 1,
                results: [{ ...details, mediaType }],
              },
            })
        );
        const submitted: Record<string, unknown>[] = [];
        await page.route('**/api/v1/request', (route) => {
          submitted.push(route.request().postDataJSON());
          if (!tagOnly && submitted.length === 1)
            return route.fulfill({
              status: 403,
              json: {
                code: 'STREAMING_REQUEST_POLICY_REJECTED',
                allowOverride: true,
                message:
                  'This title is included in your streaming subscriptions.',
              },
            });
          return route.fulfill({ json: { id: 975001, media: mediaInfo } });
        });
        const errors: string[] = [];
        page.on('pageerror', (error) => errors.push(error.message));
        await page.goto(`/discover/${mediaType === 'movie' ? 'movies' : 'tv'}`);
        await expect(page.locator('html')).toHaveAttribute(
          'data-interface-theme',
          theme
        );
        const card = page.getByTestId('title-card').first();
        await card.hover();
        await card.locator('[data-poster-region="detail-link"]').click();
        await expect(page).toHaveURL(new RegExp(`/${mediaType}/${id}`));
        await expect(page.locator('html')).toHaveAttribute(
          'data-interface-theme',
          theme
        );
        await page
          .getByRole('button', {
            name: tagOnly ? /Add Your Tag/ : /^Request(?: HD)?$/,
          })
          .first()
          .click();
        const dialog = page.getByRole('dialog');
        await expect(dialog).toBeVisible();
        if (tagOnly) {
          await expect(
            dialog.getByText('This adds your personal requester tag', {
              exact: false,
            })
          ).toBeVisible();
          await expect(dialog.getByTestId('modal-ok-button')).toBeEnabled();
        } else if (mediaType === 'tv') {
          // Select the single ordinary season using the actual native selector.
          const season = dialog
            .getByRole('button', {
              name: 'Select requestable episodes in Season 01',
              exact: true,
            })
            .first();
          if (await season.count()) await season.click();
        }
        if (tagOnly)
          await page.screenshot({
            path: info.outputPath(
              `${theme}-${width}-${mediaType}-tag-only.png`
            ),
          });
        await dialog.getByTestId('modal-ok-button').click();
        if (!tagOnly) {
          await expect(dialog.getByRole('alert')).toContainText(
            'included in your streaming subscriptions'
          );
          await page.screenshot({
            path: info.outputPath(
              `${theme}-${width}-${mediaType}-streaming-override.png`
            ),
          });
          await dialog
            .getByRole('button', { name: /Request anyway/i, exact: true })
            .click();
          await expect.poll(() => submitted.length).toBe(2);
          expect(submitted[0]).not.toHaveProperty(
            'bypassStreamingRequestPolicy'
          );
          expect(submitted[1].bypassStreamingRequestPolicy).toBe(true);
        } else {
          await expect.poll(() => submitted.length).toBe(1);
          expect(submitted[0]).toMatchObject({
            mediaType,
            mediaId: id,
            requesterTagOnly: true,
            serverId: 0,
          });
          if (mediaType === 'tv') expect(submitted[0].seasons).toBe('all');
        }
        expect(errors).toEqual([]);
      });
    }
  }
  test(`own streaming subscriptions at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await login(page);
    await page.route('**/api/v1/watchproviders/movies*', (route) =>
      route.fulfill({
        json: [
          {
            id: 8,
            name: 'Fixture Movies',
            displayPriority: 1,
            logoPath: '/fixture.png',
          },
        ],
      })
    );
    await page.route('**/api/v1/watchproviders/tv*', (route) =>
      route.fulfill({
        json: [
          {
            id: 9,
            name: 'Fixture Series',
            displayPriority: 2,
            logoPath: '/fixture2.png',
          },
        ],
      })
    );
    await page.goto('/users/1/settings/main');
    if (baseline) {
      await expect(
        page.getByText('Streaming Region', { exact: true })
      ).toBeVisible();
    } else {
      const movies = page.getByRole('button', {
        name: 'Fixture Movies',
        exact: true,
      });
      const tv = page.getByRole('button', {
        name: 'Fixture Series',
        exact: true,
      });
      await movies.click();
      await tv.click();
      await expect(movies).toHaveAttribute('aria-pressed', 'true');
      await expect(tv).toHaveAttribute('aria-pressed', 'true');
      await tv.scrollIntoViewIfNeeded();
    }
    await page.screenshot({
      path: info.outputPath(
        `${theme}-${width}-user-streaming-subscriptions.png`
      ),
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      )
    ).toBe(true);
  });
}
