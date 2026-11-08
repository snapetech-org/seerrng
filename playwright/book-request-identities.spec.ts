import { expect, test } from '@playwright/test';
import { restoreAdminPresentation } from './helpers/presentation';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
test.afterEach(async ({ page }) => restoreAdminPresentation(page));

for (const theme of ['seerrOrig', 'seerrNGJ'])
  for (const width of [390, 1440])
    test(`book identities reach history, cards and issues ${theme} ${width}`, async ({
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
      await page.request.post('/api/v1/user/1/settings/main', {
        data: { locale: 'en' },
      });
      await page.request.post('/api/v1/user/1/settings/interface-theme', {
        data: { theme },
      });
      const user = {
        id: 1,
        displayName: 'Admin',
        username: 'admin',
        avatar: '',
        permissions: 2,
      };
      const identities = [
        ['bookshelf:0:aGM6NTM', 'Scoped service zero book', 'bookshelf'],
        ['OL53W', 'Open Library history book', 'openlibrary'],
      ] as const;
      const requests = identities.map(([id, , provider], index) => ({
        id: 950053 + index,
        type: 'book',
        bookFormat: 'ebook',
        status: 5,
        is4k: false,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
        requestedBy: user,
        modifiedBy: user,
        seasons: [],
        media: {
          id: 950053 + index,
          mediaType: 'book',
          tmdbId: 0,
          status: 5,
          status4k: 1,
          requests: [],
          seasons: [],
          identifiers: [{ provider, value: id, canonical: true }],
        },
      }));
      const pageInfo = { page: 1, pages: 1, pageSize: 10, results: 2 };
      // Bounded API replays exercise actual components and CSS; no provider or acquisition is claimed.
      await page.route(
        (u) =>
          u.pathname === '/api/v1/request' ||
          u.pathname === '/api/v1/user/1/requests',
        (r) =>
          r.fulfill({
            json: {
              pageInfo,
              results: requests,
              serviceErrors: {
                radarr: [],
                sonarr: [],
                lidarr: [],
                readarr: [],
              },
            },
          })
      );
      await page.route(/\/api\/v1\/request\/95005[34]$/, (r) =>
        r.fulfill({
          json: requests.find((x) =>
            r
              .request()
              .url()
              .endsWith('/' + x.id)
          ),
        })
      );
      await page.route(
        (u) => u.pathname.startsWith('/api/v1/book/'),
        (r) => {
          const id = decodeURIComponent(
            new URL(r.request().url()).pathname.slice('/api/v1/book/'.length)
          );
          const index = identities.findIndex((x) => x[0] === id);
          return r.fulfill({
            status: index < 0 ? 404 : 200,
            json:
              index < 0
                ? {}
                : {
                    id,
                    provider: identities[index][2],
                    mediaType: 'book',
                    title: identities[index][1],
                    author: 'Fixture Author',
                    firstPublishYear: 2024,
                    subjects: [],
                    description: 'Identity regression fixture',
                    isbnCandidates: [],
                    mediaInfo: requests[index].media,
                  },
          });
        }
      );
      await page.route(
        (u) => u.pathname === '/api/v1/user/1/watchlist',
        (r) =>
          r.fulfill({
            json: { pageInfo: { ...pageInfo, results: 0 }, results: [] },
          })
      );
      const issue = {
        id: 950053,
        issueType: 4,
        status: 1,
        problemSeason: 0,
        problemEpisode: 0,
        is4k: false,
        media: requests[0].media,
        createdBy: user,
        comments: [],
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      };
      await page.route(
        (u) =>
          u.pathname === '/api/v1/issue' || u.pathname === '/api/v1/issue/',
        (r) =>
          r.fulfill({
            json: {
              pageInfo: { ...pageInfo, results: 1 },
              results: [issue],
              counts: { all: 1, open: 1, resolved: 0 },
            },
          })
      );
      for (const path of [
        '/users/1/requests?filter=all&mediaType=book',
        '/users/1',
        '/issues',
      ]) {
        await page.goto(path);
        await expect(page.locator('html')).toHaveAttribute(
          'data-interface-theme',
          theme
        );
        if (path === '/users/1')
          await page
            .getByTestId('media-slider')
            .filter({
              has: page.getByRole('link', {
                name: 'Recent Requests',
                exact: true,
              }),
            })
            .scrollIntoViewIfNeeded();
        await expect(
          path === '/issues'
            ? page.getByRole('link', {
                name: identities[0][1] + ' (2024)',
                exact: true,
              })
            : page.getByText(identities[0][1], { exact: true }).first()
        ).toBeVisible();
        if (path !== '/issues')
          await expect(
            page.getByText(identities[1][1], { exact: true }).first()
          ).toBeVisible();
        const link = page
          .locator('a[href^="/book/bookshelf%3A0%3AaGM6NTM"]')
          .first();
        await expect(link).toBeVisible();
        await expect
          .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
          .toBeLessThanOrEqual(width + 1);
        await page.screenshot({
          path: info.outputPath(
            path === '/issues'
              ? 'issues.png'
              : path === '/users/1'
                ? 'profile.png'
                : 'history.png'
          ),
        });
      }
    });
