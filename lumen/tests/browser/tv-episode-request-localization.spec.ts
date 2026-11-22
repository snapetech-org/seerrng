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
  },
  {
    tag: 'fr',
    open: 'Demander des épisodes',
    season: 'Saison',
    loadFailure: 'Impossible de charger les épisodes',
    retry: 'Réessayer',
    submit: 'Demander les épisodes sélectionnés',
    close: 'Fermer',
  },
  {
    tag: 'ar',
    open: 'طلب الحلقات',
    season: 'الموسم',
    loadFailure: 'تعذر تحميل الحلقات',
    retry: 'إعادة المحاولة',
    submit: 'طلب الحلقات المحددة',
    close: 'إغلاق',
  },
];

for (const language of locales) {
  test(`TV episode requests follow ${language.tag} locale after load recovery`, async ({
    page,
  }) => {
    const posts: unknown[] = [];
    let seasonLoads = 0;
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
          if (++seasonLoads === 1)
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
      sheet.getByRole('heading', { name: language.open })
    ).toBeVisible();
    await expect(sheet.getByText('Season 1', { exact: true })).toBeVisible();
    await expect(sheet.getByText(failureCopy, { exact: true })).toBeVisible();
    if (process.env.LUMEN_CAPTURE) {
      await page.waitForTimeout(400);
      await page.screenshot({
        path: `${process.env.LUMEN_CAPTURE}-failed.png`,
      });
    }
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
}
