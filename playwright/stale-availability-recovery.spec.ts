import { expect, test, type Page } from '@playwright/test';
import { MediaStatus } from '../server/constants/media';

test.use({ serviceWorkers: 'block' });

const tvId = 909999;
const mediaId = 987654;

const makeTv = (status: MediaStatus) => ({
  id: tvId,
  name: 'A Removed Series',
  originalName: 'A Removed Series',
  firstAirDate: '2020-01-01',
  contentRatings: { results: [] },
  createdBy: [],
  episodeRunTime: [],
  genres: [],
  homepage: '',
  inProduction: false,
  languages: ['en'],
  lastAirDate: '2020-02-01',
  networks: [],
  numberOfEpisodes: 8,
  numberOfSeasons: 1,
  originCountry: ['US'],
  originalLanguage: 'en',
  overview: 'A series whose library copy has been removed.',
  popularity: 0,
  productionCompanies: [],
  productionCountries: [],
  spokenLanguages: [],
  seasons: [
    {
      id: 909991,
      airDate: '2020-01-01',
      episodeCount: 8,
      name: 'Season 1',
      overview: '',
      seasonNumber: 1,
    },
  ],
  status: 'Ended',
  type: 'Scripted',
  voteAverage: 0,
  voteCount: 0,
  credits: { cast: [], crew: [] },
  externalIds: {},
  keywords: [],
  mediaInfo: {
    id: mediaId,
    tmdbId: tvId,
    mediaType: 'tv',
    status,
    status4k: MediaStatus.UNKNOWN,
    ratingKey: 'stale-plex-key',
    jellyfinMediaId: 'stale-jellyfin-id',
    requests: [],
    seasons: [
      {
        id: 909991,
        seasonNumber: 1,
        status,
        status4k: MediaStatus.UNKNOWN,
      },
    ],
    issues: [],
    downloadStatus: [],
    downloadStatus4k: [],
  },
});

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

for (const viewport of [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'narrow', width: 390, height: 844 },
]) {
  test(`clears stale series availability after an empty library check at ${viewport.name} width`, async ({
    page,
    baseURL,
  }, testInfo) => {
    await page.setViewportSize({
      width: viewport.width,
      height: viewport.height,
    });
    await loginAsAdmin(page, baseURL);

    let tv = makeTv(MediaStatus.AVAILABLE);
    let clearRequests = 0;
    let libraryDeleteRequests = 0;
    await page.route('**/api/v1/settings/public', async (route) => {
      const response = await route.fetch();
      const settings = await response.json();
      await route.fulfill({
        response,
        json: { ...settings, series4kEnabled: false },
      });
    });
    await page.route('**/api/v1/search*', (route) =>
      route.fulfill({
        json: {
          page: 1,
          totalPages: 1,
          totalResults: 1,
          results: [
            {
              id: tvId,
              mediaType: 'tv',
              name: tv.name,
              originalName: tv.originalName,
              firstAirDate: tv.firstAirDate,
              posterPath: null,
            },
          ],
        },
      })
    );
    await page.route(`**/api/v1/tv/${tvId}*`, (route) =>
      route.fulfill({ json: tv })
    );
    await page.route(`**/_next/data/**/tv/${tvId}.json*`, (route) =>
      route.fulfill({ json: { pageProps: { tv }, __N_SSP: true } })
    );
    await page.route(`**/api/v1/tv/${tvId}/ratingscombined*`, (route) =>
      route.fulfill({ json: {} })
    );
    for (const relation of ['recommendations', 'similar']) {
      await page.route(`**/api/v1/tv/${tvId}/${relation}*`, (route) =>
        route.fulfill({
          json: { page: 1, totalPages: 1, totalResults: 0, results: [] },
        })
      );
    }
    await page.route('**/api/v1/service/sonarr*', (route) =>
      route.fulfill({
        json: [
          {
            id: 1,
            name: 'Test Sonarr HD',
            is4k: false,
            isDefault: true,
            activeProfileId: 1,
            activeDirectory: '/tv',
            activeTags: [],
          },
        ],
      })
    );
    await page.route(`**/api/v1/blocklist/${tvId}*`, (route) =>
      route.fulfill({ status: 404, json: { message: 'Not found' } })
    );
    await page.route(`**/api/v1/media/${mediaId}/library*`, (route) =>
      route.fulfill({
        json: {
          token: 'verified-empty-library',
          targets: [],
          verifiedServices: 1,
        },
      })
    );
    await page.route(
      `**/api/v1/media/${mediaId}/library/clear-stale-availability`,
      async (route) => {
        clearRequests += 1;
        expect(route.request().method()).toBe('POST');
        expect(route.request().postDataJSON()).toEqual({
          token: 'verified-empty-library',
          quality: 'HD',
        });
        tv = makeTv(MediaStatus.UNKNOWN);
        await route.fulfill({ status: 204 });
      }
    );
    await page.route(`**/api/v1/media/${mediaId}/library`, async (route) => {
      if (route.request().method() === 'DELETE') {
        libraryDeleteRequests += 1;
        await route.fulfill({ status: 204 });
        return;
      }
      await route.fallback();
    });

    await page.goto(`/search?query=${encodeURIComponent(tv.name)}`);
    await page.getByTestId('title-card').first().click();
    await expect(page.getByTestId('media-title')).toContainText(tv.name);

    const hdRequest = page
      .getByRole('button', { name: 'Request', exact: true })
      .filter({ visible: true });
    await expect(page.getByText('Available', { exact: true })).toBeVisible();
    await expect(hdRequest).toBeDisabled();
    await expect(
      page.getByText('Loading Series Details', { exact: true })
    ).toBeHidden();
    await page.screenshot({
      path: testInfo.outputPath(
        `stale-availability-before-${viewport.name}.png`
      ),
      animations: 'disabled',
    });

    await page.getByRole('button', { name: 'Manage Series' }).click();
    const manageDialog = page.getByRole('dialog', { name: 'Manage series' });
    await expect(manageDialog).toBeVisible();
    const clearAvailability = manageDialog.getByRole('button', {
      name: 'Clear Stale HD Availability',
    });
    await expect(clearAvailability).toBeVisible();
    await clearAvailability.click();

    const confirmation = page.getByRole('dialog', {
      name: 'Clear Stale HD Availability?',
    });
    await expect(confirmation).toBeVisible();
    await expect(confirmation).toContainText(
      'The latest check found no copy in any configured Sonarr library.'
    );
    await page.screenshot({
      path: testInfo.outputPath(
        `stale-availability-confirm-${viewport.name}.png`
      ),
      animations: 'disabled',
    });

    await confirmation.getByTestId('modal-ok-button').click();
    await expect.poll(() => clearRequests).toBe(1);
    await manageDialog
      .getByRole('button', { name: 'Cancel', exact: true })
      .click();
    await expect(manageDialog).not.toBeVisible();
    await expect(hdRequest).toBeEnabled();
    expect(libraryDeleteRequests).toBe(0);
    await page.screenshot({
      path: testInfo.outputPath(
        `stale-availability-after-${viewport.name}.png`
      ),
      animations: 'disabled',
    });
  });
}
