import { expect, test } from '@playwright/test';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
for (const theme of ['seerrOrig', 'seerrNGJ']) {
  for (const width of [390, 1440]) {
    test(`administrator recovery survives viewer-masked availability ${theme} ${width}`, async ({
      page,
    }, info) => {
      await page.setViewportSize({ width, height: 900 });
      expect(
        (
          await page.request.post('/api/v1/auth/local', {
            data: { email: 'admin@seerr.dev', password: 'test1234' },
          })
        ).status()
      ).toBe(200);
      await page.request.post('/api/v1/user/1/settings/interface-theme', {
        data: { theme },
      });
      let cleared = false;
      let writes = 0;
      await page.route('**/api/v1/tv/1396', (route) =>
        route.fulfill({
          json: {
            id: 1396,
            name: 'Recovery fixture',
            originalName: 'Recovery fixture',
            firstAirDate: '2008-01-20',
            lastAirDate: '2013-09-29',
            numberOfSeasons: 1,
            numberOfEpisodes: 7,
            overview: 'Deleted library files.',
            contentRatings: { results: [] },
            createdBy: [],
            episodeRunTime: [45],
            genres: [],
            languages: ['en'],
            networks: [],
            originCountry: ['US'],
            originalLanguage: 'en',
            productionCompanies: [],
            productionCountries: [],
            spokenLanguages: [],
            status: 'Ended',
            type: 'Scripted',
            voteAverage: 8,
            voteCount: 10,
            credits: { cast: [], crew: [] },
            externalIds: { tvdbId: 81189 },
            keywords: [],
            seasons: [],
            mediaInfo: {
              id: 9103,
              tmdbId: 1396,
              tvdbId: 81189,
              mediaType: 'tv',
              status: 1,
              status4k: 1,
              requests: [],
              seasons: [],
              issues: [],
              watchlists: [],
              serviceStatuses: [],
            },
          },
        })
      );
      await page.route('**/api/v1/media/9103/library', (route) =>
        route.fulfill({
          json: {
            token: 'a'.repeat(64),
            verifiedServices: 1,
            staleAvailabilityQualities: cleared ? [] : ['HD'],
            targets: [
              {
                key: 'sonarr:0:17:HD',
                serviceId: 0,
                serviceType: 'sonarr',
                externalId: 17,
                service: 'Empty Sonarr record',
                quality: 'HD',
                url: 'http://localhost:8989/series/fixture',
              },
            ],
          },
        })
      );
      await page.route(
        '**/api/v1/media/9103/library/clear-stale-availability',
        (route) => {
          expect(route.request().method()).toBe('POST');
          expect(route.request().postDataJSON()).toEqual({
            token: 'a'.repeat(64),
            quality: 'HD',
          });
          writes++;
          cleared = true;
          return route.fulfill({ status: 204 });
        }
      );
      await page.goto('/tv/1396');
      await page
        .getByRole('button', { name: 'Manage Series', exact: true })
        .click();
      const action = page.getByRole('dialog').getByRole('button', {
        name: 'Clear Stale HD Availability',
        exact: true,
      });
      await expect(action).toBeVisible();
      await expect(
        page.getByRole('button', {
          name: 'Clear Stale 4K Availability',
          exact: true,
        })
      ).toHaveCount(0);
      expect(writes).toBe(0);
      await action.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: info.outputPath(`recovery-${theme}-${width}.png`),
        animations: 'disabled',
      });
      await action.click();
      const confirmation = page.getByRole('dialog', {
        name: 'Clear Stale HD Availability?',
        exact: true,
      });
      await expect(confirmation).toBeVisible();
      expect(writes).toBe(0);
      await confirmation
        .getByRole('button', {
          name: 'Clear Stale HD Availability',
          exact: true,
        })
        .click();
      await expect.poll(() => writes).toBe(1);
      await expect(confirmation).toHaveCount(0);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth)
      ).toBeLessThanOrEqual(width + 1);
    });
  }
}
