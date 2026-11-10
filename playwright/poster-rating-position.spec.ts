import { expect, test } from '@playwright/test';
import { restoreAdminPresentation } from './helpers/presentation';

test.afterEach(async ({ page }) => restoreAdminPresentation(page));
// The real worker has its own navigation tests; this fixture intercepts APIs.
test.use({ reducedMotion: 'no-preference', serviceWorkers: 'block' });

for (const theme of ['seerrNGJ', 'seerrOrig']) {
  for (const width of [390, 1440]) {
    test(`${theme} rating popover stays anchored at ${width}px`, async ({
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
      await page.route('**/api/v1/discover/movies*', (route) =>
        route.fulfill({
          json: {
            page: 1,
            totalPages: 1,
            totalResults: 12,
            results: Array.from({ length: 12 }, (_, i) => ({
              id: 981234 + i,
              mediaType: 'movie',
              title: `Rating Fixture ${i}`,
              releaseDate: '2025-01-01',
              voteAverage: 8.2,
              voteCount: 1200,
              posterPath: '/fixture.png',
            })),
          },
        })
      );
      await page.route('**/api/v1/movie/*/ratingscombined', (route) =>
        route.fulfill({
          json: {
            rt: {
              criticsRating: 'Fresh',
              criticsScore: 91,
              audienceRating: 'Upright',
              audienceScore: 84,
            },
            imdb: { criticsScore: 8.1, criticsScoreCount: 1200 },
          },
        })
      );
      await page.route('**/imageproxy/tmdb/**', (route) =>
        route.fulfill({
          contentType: 'image/svg+xml',
          body: '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="450"><rect width="300" height="450" fill="#30405c"/></svg>',
        })
      );
      const catalogLoaded = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === '/api/v1/discover/movies' &&
          response.status() === 200
      );
      // Settle the requested theme before card prefetch competes with its
      // nonmatching-media stylesheet on a cold browser connection pool.
      await page.goto('/settings/main');
      await expect(page.locator('html')).toHaveAttribute(
        'data-interface-theme',
        theme
      );
      await page.evaluate(() =>
        (window as any).next.router.push('/discover/movies')
      );
      await expect(page).toHaveURL(/\/discover\/movies$/);
      await catalogLoaded;
      await expect(page.getByTestId('title-card')).toHaveCount(12);
      await page.evaluate(() => document.fonts.ready);
      const frame = page
        .getByTestId('title-card')
        .first()
        .locator('[data-poster-region="frame"]');
      for (let repetition = 0; repetition < 3; repetition++) {
        await frame.hover();
        const popover = page.getByRole('status', {
          name: 'Ratings for Rating Fixture 0',
          exact: true,
        });
        await expect(popover).toBeVisible();
        await info.attach(`position-rules-${repetition}`, {
          body: JSON.stringify(
            await popover.evaluate((el) => {
              const computed = getComputedStyle(el);
              const rules: string[] = [];
              const visit = (list: CSSRuleList) => {
                for (const rule of Array.from(list)) {
                  if (
                    rule instanceof CSSStyleRule &&
                    el.matches(rule.selectorText) &&
                    /transition|animation|transform|position/.test(
                      rule.style.cssText
                    )
                  )
                    rules.push(rule.cssText);
                  else if ('cssRules' in rule)
                    visit((rule as CSSGroupingRule).cssRules);
                }
              };
              for (const sheet of Array.from(document.styleSheets)) {
                try {
                  visit(sheet.cssRules);
                } catch {}
              }
              return {
                transition: computed.transition,
                transform: computed.transform,
                animation: computed.animation,
                rules,
              };
            })
          ),
          contentType: 'application/json',
        });
        const movingFrames = await popover.evaluate(async (el) => {
          const frames: {
            top: number;
            left: number;
            expectedTop: number;
            expectedLeft: number;
          }[] = [];
          for (let i = 0; i < 40; i++) {
            await new Promise(requestAnimationFrame);
            if (getComputedStyle(el).visibility === 'hidden') continue;
            const r = el.getBoundingClientRect();
            frames.push({
              top: r.top,
              left: r.left,
              expectedTop: parseFloat(el.style.top),
              expectedLeft: parseFloat(el.style.left),
            });
          }
          return frames;
        });
        await info.attach(`movement-${repetition}`, {
          body: JSON.stringify(movingFrames),
          contentType: 'application/json',
        });
        expect(movingFrames.length).toBeGreaterThan(0);
        expect(
          movingFrames.every(
            (r) =>
              Math.abs(r.top - r.expectedTop) < 2 &&
              Math.abs(r.left - r.expectedLeft) < 2
          )
        ).toBe(true);
        await page.screenshot({
          path: info.outputPath(`hover-${repetition}.png`),
        });
        const geometry = await popover.evaluate((el) => {
          const r = el.getBoundingClientRect();
          const s = getComputedStyle(el);
          return {
            top: r.top,
            left: r.left,
            right: r.right,
            bottom: r.bottom,
            position: s.position,
            transition: s.transitionProperty,
            inlineTop: el.style.top,
            inlineLeft: el.style.left,
          };
        });
        await info.attach(`geometry-${repetition}`, {
          body: JSON.stringify(geometry),
          contentType: 'application/json',
        });
        expect(geometry.position).toBe('fixed');
        expect(
          Math.abs(geometry.top - parseFloat(geometry.inlineTop))
        ).toBeLessThan(2);
        expect(
          Math.abs(geometry.left - parseFloat(geometry.inlineLeft))
        ).toBeLessThan(2);
        expect(geometry.left).toBeGreaterThanOrEqual(8);
        expect(geometry.right).toBeLessThanOrEqual(width - 7);
        await page.mouse.move(width - 1, 1);
        await expect(popover).toHaveCount(0);
      }
    });
  }
}
