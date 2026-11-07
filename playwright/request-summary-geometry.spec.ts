import { expect, test } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { restoreAdminPresentation } from './helpers/presentation';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
test.afterEach(async ({ page }) => restoreAdminPresentation(page));
const baseline = process.env.SEERR_SUMMARY_BASELINE === 'true';

for (const theme of ['seerrOrig', 'seerrNGJ']) {
  for (const width of [320, 390, 1440]) {
    for (const mediaType of ['movie', 'tv']) {
      test(`${theme} ${mediaType} request summary at ${width}px`, async ({
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
        expect(
          (
            await page.request.post('/api/v1/user/1/settings/interface-theme', {
              data: { theme },
            })
          ).status()
        ).toBe(200);
        const id = 1396;
        const mediaInfo = {
          id,
          tmdbId: id,
          mediaType,
          status: 1,
          status4k: 1,
          requests: [],
          seasons: [],
        };
        const details = {
          id,
          title: mediaType === 'movie' ? 'Columbo' : undefined,
          originalTitle: mediaType === 'movie' ? 'Columbo' : undefined,
          name: mediaType === 'tv' ? 'Columbo' : undefined,
          originalName: mediaType === 'tv' ? 'Columbo' : undefined,
          mediaType,
          adult: false,
          releaseDate: mediaType === 'movie' ? '1971-09-15' : undefined,
          firstAirDate: mediaType === 'tv' ? '1971-09-15' : undefined,
          lastAirDate: '2003-01-30',
          runtime: mediaType === 'movie' ? 90 : undefined,
          episodeRunTime: [90],
          genres: [
            { id: 80, name: 'Crime' },
            { id: 18, name: 'Drama' },
            { id: 9648, name: 'Mystery' },
          ],
          createdBy: [
            { id: 1, name: 'William Link' },
            { id: 2, name: 'Richard Levinson' },
          ],
          credits: {
            cast: [],
            crew: [
              { id: 1, name: 'William Link', job: 'Director' },
              { id: 2, name: 'Richard Levinson', job: 'Screenplay' },
            ],
          },
          networks: [{ id: 2, name: 'ABC' }],
          productionCompanies: [{ id: 2, name: 'Universal Television' }],
          productionCountries: [],
          spokenLanguages: [],
          originalLanguage: 'en',
          languages: ['en'],
          originCountry: ['US'],
          homepage: '',
          overview: 'A detective investigates a complex mystery.',
          inProduction: false,
          type: 'Scripted',
          status: 'Ended',
          popularity: 1,
          voteAverage: 8,
          voteCount: 100,
          externalIds: { tvdbId: 70369 },
          contentRatings: { results: [] },
          keywords: [],
          releases: { results: [] },
          numberOfEpisodes: 2,
          numberOfSeasons: 1,
          seasons: [
            {
              id: 1,
              seasonNumber: 1,
              episodeCount: 2,
              name: 'Season 1',
              airDate: '1971-09-15',
            },
          ],
          mediaInfo,
        };
        const serviceType = mediaType === 'tv' ? 'sonarr' : 'radarr';
        const services = [false, true].map((is4k, index) => ({
          id: index,
          name: is4k ? '4K service' : 'HD service',
          isDefault: true,
          is4k,
          activeProfileId: 1,
          activeDirectory: '/media',
          activeTags: [],
          tagRequests: false,
        }));
        await page.route(`**/api/v1/service/${serviceType}**`, (route) => {
          const pathname = new URL(route.request().url()).pathname;
          if (pathname.includes('/lookup/')) return route.fulfill({ json: [] });
          const match = pathname.match(/\/(\d+)$/);
          return route.fulfill({
            json: match
              ? {
                  server: services[Number(match[1])],
                  profiles: [{ id: 1, name: 'Default' }],
                  rootFolders: [{ id: 1, path: '/media' }],
                  tags: [],
                  languageProfiles: [],
                }
              : services,
          });
        });
        await page.route(`**/api/v1/${mediaType}/${id}/**`, (route) =>
          route.fulfill({
            json: {
              page: 1,
              totalPages: 0,
              totalResults: 0,
              results: [],
              seasonNumber: 1,
              episodes: [1, 2].map((number) => ({
                id: number,
                seasonNumber: 1,
                episodeNumber: number,
                name: `Episode ${number}`,
                airDate: '1971-09-15',
              })),
            },
          })
        );
        await page.route(`**/api/v1/${mediaType}/${id}`, (route) =>
          route.fulfill({ json: details })
        );
        await page.route(`**/_next/data/**/${mediaType}/${id}.json*`, (route) =>
          route.fulfill({
            json: { pageProps: { [mediaType]: details }, __N_SSP: true },
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
        await page.route('**/api/v1/playback/**', (route) =>
          route.fulfill({
            status: 503,
            json: { message: 'Fixture playback disabled' },
          })
        );
        await page.goto('/');
        await page.evaluate(
          (path) => (window as any).next.router.push(path),
          `/${mediaType}/${id}`
        );
        await expect(page.locator('html')).toHaveAttribute(
          'data-interface-theme',
          theme
        );
        if (!baseline && theme === 'seerrOrig') {
          await expect(
            page.locator('[data-native-composition="upstream"]')
          ).toBeVisible();
          await expect(
            page.locator('.upstream-media-overview-copy')
          ).toBeVisible();
        }
        if (!baseline) {
          const primaryPoster = page
            .locator(
              theme === 'seerrOrig'
                ? '.upstream-media-poster[data-testid="media-details-poster"]'
                : '[data-summary-layout="detail"] [data-testid="media-details-poster"]'
            )
            .first();
          await expect(primaryPoster).toBeVisible();
          const posterWidth = await primaryPoster.evaluate(
            (node) => node.getBoundingClientRect().width
          );
          expect(posterWidth).toBe(
            theme === 'seerrOrig'
              ? width < 768
                ? 128
                : width < 1280
                  ? 176
                  : 208
              : width < 1024
                ? 80
                : 136
          );
        }
        await page
          .getByRole('button', { name: /^Request(?: HD)?$/ })
          .first()
          .click();
        const dialog = page.getByRole('dialog');
        await expect(dialog).toBeVisible();
        await page.waitForTimeout(350);
        if (theme === 'seerrOrig') {
          expect(
            await dialog.evaluate((node) => node.scrollWidth)
          ).toBeLessThanOrEqual(width);
          if (mediaType === 'tv') {
            const choice = dialog.getByRole('checkbox', {
              name: 'Season 1',
              exact: true,
            });
            await expect(choice).toBeEnabled();
            await choice.uncheck();
            await expect(dialog.getByTestId('modal-ok-button')).toBeDisabled();
            await choice.check();
            await expect(dialog.getByTestId('modal-ok-button')).toBeEnabled();
            const episodes = dialog
              .locator('summary')
              .filter({ hasText: 'Choose individual episodes' });
            await episodes.click();
            await expect(
              dialog.locator('[data-tree-part="season"]').first()
            ).toBeVisible();
            await dialog
              .getByRole('button', { name: 'Expand All', exact: true })
              .click();
            await expect(
              dialog.locator('[data-tree-part="episode"]').first()
            ).toBeVisible();
            await episodes.click();
          }
          const disclosure = dialog
            .locator('details:has(.detail-summary-card)')
            .first();
          await expect(disclosure).not.toHaveAttribute('open');
          await disclosure.locator('summary').first().click();
        }
        const summary = dialog.locator('.detail-summary-card').first();
        await expect(summary).toBeVisible();
        const geometry = await summary.evaluate((node) => {
          const poster = node.querySelector('.detail-card-poster')!;
          const title = node.querySelector('.detail-summary-title')!;
          const grid = node.querySelector('.app-detail-summary-grid') ?? node;
          const p = poster.getBoundingClientRect(),
            t = title.getBoundingClientRect();
          const disclosure = node
            .closest('[role="dialog"]')
            ?.querySelector('.detail-disclosure-button');
          const disclosureIcons = [
            ...(disclosure?.querySelectorAll(':scope > svg') ?? []),
          ].map((icon) => ({
            width: icon.getBoundingClientRect().width,
            height: icon.getBoundingClientRect().height,
          }));
          return {
            poster: { x: p.x, y: p.y, width: p.width, height: p.height },
            title: { x: t.x, y: t.y, width: t.width, height: t.height },
            columns: getComputedStyle(grid).gridTemplateColumns,
            alignment: getComputedStyle(grid).alignItems,
            summaryWidth: node.getBoundingClientRect().width,
            summaryOverflow: node.scrollWidth - node.clientWidth,
            disclosureIcons,
            values: [...node.querySelectorAll('dd')].map((value) => ({
              text: value.textContent,
              width: value.clientWidth,
              scrollWidth: value.scrollWidth,
              height: value.clientHeight,
              scrollHeight: value.scrollHeight,
            })),
          };
        });
        writeFileSync(
          info.outputPath('summary-geometry.json'),
          JSON.stringify(geometry, null, 2)
        );
        await dialog.screenshot({
          path: info.outputPath('request-dialog.png'),
          animations: 'disabled',
        });
        if (!baseline) {
          expect(geometry.poster.width).toBeLessThanOrEqual(
            width < 640 ? 64 : 80
          );
          expect(
            Math.abs(geometry.title.y - geometry.poster.y)
          ).toBeLessThanOrEqual(2);
          expect(geometry.summaryOverflow).toBeLessThanOrEqual(1);
          for (const value of geometry.values) {
            expect(value.scrollWidth, value.text ?? '').toBeLessThanOrEqual(
              value.width + 1
            );
            expect(value.scrollHeight, value.text ?? '').toBeLessThanOrEqual(
              value.height + 1
            );
          }
          for (const icon of geometry.disclosureIcons) {
            expect(icon.width).toBe(14);
            expect(icon.height).toBe(14);
          }
        }
        const advanced = dialog
          .getByRole('button', { name: /Advanced Options/ })
          .last();
        await advanced.click();
        await expect(advanced).toHaveAttribute('aria-expanded', 'true');
        await dialog.screenshot({
          path: info.outputPath('request-advanced.png'),
          animations: 'disabled',
        });
        expect(
          await dialog.evaluate((node) => node.scrollWidth - node.clientWidth)
        ).toBeLessThanOrEqual(1);
        await dialog.getByTestId('modal-cancel-button').click();
      });
    }
  }
}
