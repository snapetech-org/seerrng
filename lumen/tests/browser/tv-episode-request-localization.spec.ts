import { expect, test } from '@playwright/test';

const mount = process.env.LUMEN_TEST_MOUNT === '/lumen' ? '/lumen' : '';
const appPath = (path: string) => `${mount}${path}`;
const apiPath = (pathname: string) =>
  pathname.slice(pathname.indexOf('/api/v1') + '/api/v1'.length);

const locales = [
  {
    tag: 'en',
    open: 'Request Episodes',
    season: 'Season',
    loadFailure: 'Could not load episodes',
    retry: 'Retry',
    submit: 'Request Selected Episodes',
    close: 'Close',
    seasonOne: 'Season 1',
    partialFailure:
      'Some season details remain unavailable. Episodes from loaded seasons are still shown; retry to load the missing details.',
    selectSeasonTwo: 'Season 2',
    missingSeasonOneEpisode: 'E2 Missing Episode',
    missingSeasonTwoEpisode: 'E1 Missing Season 2 Episode',
  },
  {
    tag: 'fr',
    open: 'Demander des épisodes',
    season: 'Saison',
    loadFailure: 'Impossible de charger les épisodes',
    retry: 'Réessayer',
    submit: 'Demander les épisodes sélectionnés',
    close: 'Fermer',
    seasonOne: 'Season 1',
    partialFailure:
      'Les détails de certaines saisons restent indisponibles. Les épisodes des saisons chargées restent affichés ; réessayez pour charger les détails manquants.',
    selectSeasonTwo: 'Season 2',
    missingSeasonOneEpisode: 'E2 Missing Episode',
    missingSeasonTwoEpisode: 'E1 Missing Season 2 Episode',
  },
  {
    tag: 'ar',
    open: 'طلب الحلقات',
    season: 'الموسم',
    loadFailure: 'تعذر تحميل الحلقات',
    retry: 'إعادة المحاولة',
    submit: 'طلب الحلقات المحددة',
    close: 'إغلاق',
    seasonOne: 'Season 1',
    partialFailure:
      'لا تزال تفاصيل بعض المواسم غير متاحة. تبقى حلقات المواسم المحمّلة معروضة؛ أعد المحاولة لتحميل التفاصيل الناقصة.',
    selectSeasonTwo: 'Season 2',
    missingSeasonOneEpisode: 'E2 Missing Episode',
    missingSeasonTwoEpisode: 'E1 Missing Season 2 Episode',
  },
];

for (const language of locales) {
  test(`TV episode requests follow ${language.tag} locale after load recovery`, async ({
    page,
  }) => {
    const posts: unknown[] = [];
    let retrying = false;
    const failureCopy = process.env.LUMEN_BASELINE_CAPTURE
      ? 'Couldn’t load episodes'
      : language.loadFailure;
    await page.route('**/lumen-config.json', (route) =>
      route.fulfill({ json: {} })
    );
    await page.route('**/api/v1/**', (route) => {
      const request = route.request();
      const path = apiPath(new URL(request.url()).pathname);
      if (request.method() !== 'GET') posts.push(request.postDataJSON());
      switch (path) {
        case '/auth/me':
          return route.fulfill({
            json: { id: 1, displayName: 'Viewer', permissions: 2 },
          });
        case '/user/1/settings/main':
          return route.fulfill({ json: { locale: language.tag } });
        case '/settings/public':
          return route.fulfill({ json: { partialRequestsEnabled: true } });
        case '/tv/84773':
          return route.fulfill({
            json: {
              id: 84773,
              name: 'The Rings of Power',
              externalIds: { tvdbId: 80 },
              overview: 'Rings.',
              genres: [],
              firstAirDate: '2022-09-01',
              contentRatings: { results: [] },
              seasons: [
                {
                  seasonNumber: 1,
                  episodeCount: 2,
                  name: 'Season 1',
                  airDate: '2022-09-01',
                },
              ],
              numberOfSeasons: 1,
              mediaInfo: { seasons: [], requests: [] },
            },
          });
        case '/tv/84773/seasons':
          if (!retrying)
            return route.fulfill({
              status: 503,
              json: { message: 'Temporary metadata failure' },
            });
          return route.fulfill({
            json: [
              {
                seasonNumber: 1,
                episodes: [
                  {
                    episodeNumber: 1,
                    name: 'Owned Episode',
                    sonarrAvailability: { hd: true, fourK: false },
                  },
                  { episodeNumber: 2, name: 'Missing Episode' },
                ],
              },
            ],
          });
        case '/request':
          return route.fulfill({ json: { id: 44, status: 1 } });
        default:
          return route.fulfill({ json: { results: [] } });
      }
    });

    await page.goto(appPath('/tv/84773'));
    await page
      .getByRole('button', { name: language.open, exact: true })
      .click();
    const sheet = page.getByRole('dialog', { name: language.open });
    await expect(
      sheet.getByRole('heading', { name: 'The Rings of Power' })
    ).toBeVisible();
    await expect(sheet.getByText('Season 1', { exact: true })).toBeVisible();
    await expect(sheet.getByText(failureCopy, { exact: true })).toBeVisible();
    if (process.env.LUMEN_CAPTURE) {
      await page.waitForTimeout(400);
      await page.screenshot({
        path: `${process.env.LUMEN_CAPTURE}-failed.png`,
      });
    }
    retrying = true;
    await sheet
      .getByRole('button', { name: language.retry, exact: true })
      .click();
    await sheet.getByText('Season 1', { exact: true }).click();
    const missingEpisode = sheet.getByRole('checkbox', {
      name: 'E2 Missing Episode',
      exact: true,
    });
    await missingEpisode.check();
    if (process.env.LUMEN_CAPTURE) {
      await page.screenshot({
        path: `${process.env.LUMEN_CAPTURE}-selected.png`,
      });
    }
    await sheet
      .getByRole('button', { name: language.submit, exact: true })
      .click();
    await expect.poll(() => posts.length).toBe(1);
    expect(posts).toEqual([
      {
        mediaType: 'tv',
        mediaId: 84773,
        is4k: false,
        seasons: [1],
        seasonRequests: [{ seasonNumber: 1, episodeNumbers: [2] }],
      },
    ]);
    await expect(sheet).toHaveCount(0);
  });

  test(`TV episode requests preserve usable seasons during ${language.tag} partial recovery`, async ({
    page,
  }, info) => {
    const posts: unknown[] = [];
    const batchQueries: string[] = [];
    let retrying = false;
    await page.route('**/lumen-config.json', (route) =>
      route.fulfill({ json: {} })
    );
    await page.route('**/api/v1/**', (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const path = apiPath(url.pathname);
      if (request.method() !== 'GET') posts.push(request.postDataJSON());
      switch (path) {
        case '/auth/me':
          return route.fulfill({
            json: { id: 1, displayName: 'Viewer', permissions: 2 },
          });
        case '/user/1/settings/main':
          return route.fulfill({ json: { locale: language.tag } });
        case '/settings/public':
          return route.fulfill({ json: { partialRequestsEnabled: true } });
        case '/tv/84773':
          return route.fulfill({
            json: {
              id: 84773,
              name: 'The Rings of Power',
              externalIds: { tvdbId: 80 },
              overview: 'Rings.',
              genres: [],
              firstAirDate: '2022-09-01',
              contentRatings: { results: [] },
              seasons: [1, 2].map((seasonNumber) => ({
                seasonNumber,
                episodeCount: 2,
                name: `Season ${seasonNumber}`,
                airDate: '2022-09-01',
              })),
              numberOfSeasons: 2,
              mediaInfo: { seasons: [], requests: [] },
            },
          });
        case '/tv/84773/seasons': {
          const requested = url.searchParams.get('seasonNumbers') ?? '';
          batchQueries.push(requested);
          if (!retrying)
            return route.fulfill({
              json: [
                {
                  seasonNumber: 1,
                  episodes: [
                    {
                      episodeNumber: 1,
                      name: 'Owned Episode',
                      sonarrAvailability: { hd: true, fourK: false },
                    },
                    { episodeNumber: 2, name: 'Missing Episode' },
                  ],
                },
              ],
            });
          return route.fulfill({
            json: [
              {
                seasonNumber: 2,
                episodes: [
                  { episodeNumber: 1, name: 'Missing Season 2 Episode' },
                ],
              },
            ],
          });
        }
        case '/request':
          return route.fulfill({ json: { id: 44, status: 1 } });
        default:
          return route.fulfill({ json: { results: [] } });
      }
    });

    await page.goto(appPath('/tv/84773'));
    await page
      .getByRole('button', { name: language.open, exact: true })
      .click();
    const sheet = page.getByRole('dialog', { name: language.open });
    await sheet.getByText(language.seasonOne, { exact: true }).click();
    const firstSeasonEpisode = sheet.getByRole('checkbox', {
      name: language.missingSeasonOneEpisode,
      exact: true,
    });
    if (process.env.LUMEN_PARTIAL_INITIAL_CAPTURE) {
      await page.screenshot({
        path: `${process.env.LUMEN_PARTIAL_INITIAL_CAPTURE}-${language.tag}-${info.project.name}.png`,
      });
    }
    await expect(sheet.getByRole('alert')).toContainText(
      language.partialFailure
    );
    await expect(firstSeasonEpisode).toBeEnabled();
    await firstSeasonEpisode.check();
    if (process.env.LUMEN_PARTIAL_CAPTURE) {
      await page.screenshot({
        path: `${process.env.LUMEN_PARTIAL_CAPTURE}-${language.tag}-${info.project.name}.png`,
      });
    }
    const beforeRetry = batchQueries.length;
    retrying = true;
    await sheet
      .getByRole('button', { name: language.retry, exact: true })
      .click();
    await expect.poll(() => batchQueries.length).toBeGreaterThan(beforeRetry);
    expect(batchQueries.slice(beforeRetry)).toEqual(['2']);
    await sheet.getByText(language.selectSeasonTwo, { exact: true }).click();
    const secondSeasonEpisode = sheet.getByRole('checkbox', {
      name: language.missingSeasonTwoEpisode,
      exact: true,
    });
    await secondSeasonEpisode.check();
    await expect(firstSeasonEpisode).toBeChecked();
    await sheet
      .getByRole('button', { name: language.submit, exact: true })
      .click();
    await expect.poll(() => posts.length).toBe(1);
    expect(posts).toEqual([
      {
        mediaType: 'tv',
        mediaId: 84773,
        is4k: false,
        seasons: [1, 2],
        seasonRequests: [
          { seasonNumber: 1, episodeNumbers: [2] },
          { seasonNumber: 2, episodeNumbers: [1] },
        ],
      },
    ]);
  });
}

for (const language of locales) {
  test(`requested TV season status follows ${language.tag} locale`, async ({
    page,
  }) => {
    const baseline = process.env.LUMEN_TV_SEASON_STATUS_BASELINE === '1';
    await page.route('https://**/*', (route) => route.abort());
    await page.route('**/lumen-config.json', (route) =>
      route.fulfill({ json: {} })
    );
    await page.route('**/api/v1/**', (route) => {
      const path = apiPath(new URL(route.request().url()).pathname);
      if (path === '/auth/me')
        return route.fulfill({
          json: { id: 1, displayName: 'Viewer', permissions: 2 },
        });
      if (path === '/user/1/settings/main')
        return route.fulfill({ json: { locale: language.tag } });
      if (path === '/settings/public')
        return route.fulfill({ json: { partialRequestsEnabled: true } });
      if (path === '/tv/84774')
        return route.fulfill({
          json: {
            id: 84774,
            name: 'Requested season fixture',
            externalIds: { tvdbId: 81 },
            overview: 'Season status.',
            genres: [],
            firstAirDate: '2022-09-01',
            contentRatings: { results: [] },
            seasons: [
              {
                seasonNumber: 1,
                episodeCount: 2,
                name: 'Season 1',
                airDate: '2022-09-01',
              },
            ],
            numberOfSeasons: 1,
            mediaInfo: {
              status: 2,
              seasons: [],
              requests: [
                {
                  id: 84774,
                  status: 2,
                  is4k: false,
                  seasons: [{ seasonNumber: 1, status: 2 }],
                },
              ],
            },
          },
        });
      return route.fulfill({ json: { page: 1, totalPages: 1, results: [] } });
    });
    await page.goto(appPath('/tv/84774'));
    const season = page.locator('.srow').filter({ hasText: 'Season 1' });
    await expect(season).toBeVisible();
    await expect(season).toContainText(
      baseline
        ? 'Requested'
        : { en: 'Requested', fr: 'Demandé', ar: 'تم طلبه' }[language.tag]
    );
    await season.scrollIntoViewIfNeeded();
    const width = page.viewportSize()?.width;
    const captureDir = process.env.LUMEN_TV_SEASON_STATUS_CAPTURE_DIR;
    if (captureDir && (width === 1440 || width === 390))
      await page.screenshot({
        path: `${captureDir}/${language.tag}-${width}.png`,
      });
  });
}
