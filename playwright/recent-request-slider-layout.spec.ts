import { expect, test } from '@playwright/test';
import { restoreAdminPresentation } from './helpers/presentation';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
test.afterEach(async ({ page }) => restoreAdminPresentation(page));

for (const theme of ['persiusNG', 'seerrOrig', 'seerrNGJ']) {
  for (const width of [390, 1342]) {
    test(`${theme} recent requests occupy separate slots at ${width}px`, async ({
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
      if (process.env.SEERR_REQUEST_SLIDER_BASELINE === 'true') {
        await page.route(
          '**/interface-themes/persiusNG/theme.css*',
          async (route) => {
            const response = await route.fetch();
            const css = await response.text();
            expect(css).toContain('.slider-item:not(.slider-item-compact)');
            await route.fulfill({
              response,
              body: css.replace(
                '.slider-item:not(.slider-item-compact)',
                '.slider-item'
              ),
            });
          }
        );
      }

      const rows = ['movie', 'book', 'tv', 'movie'].map((type, i) => {
        const id = 991000 + i;
        const media = {
          id,
          mediaType: type,
          tmdbId: id,
          status: 3,
          status4k: 1,
          identifiers:
            type === 'book'
              ? [
                  {
                    provider: 'openlibrary',
                    value: 'OL28217339W',
                    canonical: true,
                  },
                ]
              : [],
          requests: [],
          seasons: [],
          downloadStatus: [],
          downloadStatus4k: [],
        };
        return {
          id,
          type,
          status: type === 'book' ? 4 : 2,
          is4k: false,
          media,
          requestedBy: { id: 1, displayName: 'Fixture requester', avatar: '' },
          seasons: [],
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        };
      });
      await page.route('**/api/v1/request?*', (route) =>
        route.fulfill({
          json: {
            pageInfo: { pages: 1, pageSize: 10, results: rows.length, page: 1 },
            results: rows,
            serviceErrors: { radarr: [], sonarr: [], lidarr: [], readarr: [] },
          },
        })
      );
      for (const row of rows) {
        await page.route(`**/api/v1/request/${row.id}`, (route) =>
          route.fulfill({ json: row })
        );
        const name = `Layout ${row.type} ${row.id}`;
        await page.route(
          `**/api/v1/${row.type}/${row.type === 'book' ? 'OL28217339W' : row.id}`,
          (route) =>
            route.fulfill({
              json: {
                id: row.type === 'book' ? 'OL28217339W' : row.id,
                mediaType: row.type,
                title: name,
                name,
                releaseDate: '2026-01-01',
                firstAirDate: '2015-01-01',
                firstPublishYear: 2022,
                author: 'Fixture author',
                mediaInfo: row.media,
                genres: [],
                credits: { cast: [], crew: [] },
                seasons: [],
                externalIds: {},
              },
            })
        );
      }
      const sliders = [2, 4].map((type, i) => ({
        id: type,
        type,
        enabled: true,
        isBuiltIn: true,
        order: i,
      }));
      await page.route('**/api/v1/settings/discover', (route) =>
        route.fulfill({ json: sliders })
      );
      await page.route('**/_next/data/*/index.json*', (route) =>
        route.fulfill({
          json: { pageProps: { discoverSliders: sliders }, __N_SSP: true },
        })
      );
      await page.route('**/api/v1/discover/**', (route) =>
        route.fulfill({
          json: {
            page: 1,
            totalPages: 1,
            totalResults: 4,
            results: rows.map((row) => ({
              id: row.id,
              mediaType: 'movie',
              title: `Poster ${row.id}`,
              releaseDate: '2026-01-01',
            })),
          },
        })
      );
      await page.goto('/settings/main');
      await page.evaluate(() => {
        void (
          window as Window & {
            next: { router: { push: (path: string) => Promise<boolean> } };
          }
        ).next.router.push('/');
      });
      await expect(page.locator('html')).toHaveAttribute(
        'data-interface-theme',
        theme
      );
      const slider = page.getByTestId('media-slider').filter({
        has: page.getByRole('link', { name: 'Recent Requests', exact: true }),
      });
      const cards = slider.getByTestId('request-card');
      await expect(slider.locator('.slider-item')).toHaveCount(rows.length);
      for (const item of await slider.locator('.slider-item').all()) {
        await item.scrollIntoViewIfNeeded();
      }
      await expect(cards).toHaveCount(rows.length);
      for (const card of await cards.all()) await card.scrollIntoViewIfNeeded();
      await slider.locator('.slider-track').evaluate((el) => {
        el.scrollLeft = 0;
      });
      const isBaseline = process.env.SEERR_REQUEST_SLIDER_BASELINE === 'true';
      await slider.screenshot({
        path: info.outputPath(
          `recent-requests-${isBaseline ? 'baseline' : 'candidate'}.png`
        ),
      });
      const geometry = await slider
        .locator('.slider-item')
        .evaluateAll((items) =>
          items.map((item) => {
            const card = item.querySelector('[data-testid="request-card"]')!;
            const a = item.getBoundingClientRect();
            const b = card.getBoundingClientRect();
            return {
              slotLeft: a.left,
              slotRight: a.right,
              cardLeft: b.left,
              cardRight: b.right,
              width: b.width,
            };
          })
        );
      for (let i = 0; i < geometry.length; i++) {
        const card = geometry[i];
        expect(card.width).toBe(width < 640 ? 288 : 384);
        expect(card.cardLeft).toBeGreaterThanOrEqual(card.slotLeft - 1);
        if (isBaseline && theme === 'persiusNG') {
          expect(card.cardRight).toBeGreaterThan(card.slotRight + 1);
          if (i)
            expect(card.cardLeft).toBeLessThan(geometry[i - 1].cardRight);
        } else {
          expect(card.cardRight).toBeLessThanOrEqual(card.slotRight + 1);
          if (i)
            expect(card.cardLeft).toBeGreaterThanOrEqual(
              geometry[i - 1].cardRight
            );
        }
      }
      const poster = page
        .locator('.slider-item:not(.slider-item-compact)')
        .first();
      await poster.scrollIntoViewIfNeeded();
      const posterWidth = await poster.evaluate(
        (el) => el.getBoundingClientRect().width
      );
      if (theme === 'persiusNG') {
        expect(posterWidth).toBe(width < 768 ? 150 : 164);
      } else {
        expect(posterWidth).toBeGreaterThan(100);
      }
    });
  }
}
