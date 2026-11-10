import { expect, test } from '@playwright/test';
import { restoreAdminPresentation } from './helpers/presentation';
test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
test.afterEach(async ({ page }) => restoreAdminPresentation(page));
for (const theme of ['seerrOrig', 'seerrNGJ'])
  for (const locale of ['en', 'ar'])
    for (const width of [390, 1440])
      test(`${theme} ${locale} carousel restoration ${width}`, async ({
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
        expect(
          (
            await page.request.post('/api/v1/user/1/settings/main', {
              data: { locale },
            })
          ).status()
        ).toBe(200);
        const results = Array.from({ length: 16 }, (_, i) => ({
          id: 991000 + i,
          mediaType: 'movie',
          title: `Carousel Regression ${i + 1}`,
          overview: 'Carousel navigation fixture.',
          releaseDate: '2026-01-01',
          posterPath: null,
        }));
        await page.route('**/api/v1/discover/**', (route) =>
          route.fulfill({
            json: {
              page: 1,
              totalPages: 1,
              totalResults: route.request().url().includes('/trending')
                ? results.length
                : 0,
              results: route.request().url().includes('/trending')
                ? results
                : [],
            },
          })
        );
        const detail = {
          ...results[2],
          credits: { cast: [], crew: [] },
          productionCompanies: [],
          productionCountries: [],
          spokenLanguages: [],
          genres: [],
          keywords: [],
          relatedVideos: [],
          externalIds: {},
          releases: { results: [] },
          contentRatings: { results: [] },
          createdBy: [],
          episodeRunTime: [],
          networks: [],
          originalLanguage: 'en',
          status: 'Released',
        };
        await page.route('**/api/v1/movie/991002', (route) =>
          route.fulfill({ json: detail })
        );
        await page.route('**/_next/data/*/movie/991002.json*', (route) =>
          route.fulfill({
            json: { pageProps: { movie: detail }, __N_SSP: true },
          })
        );
        const sliders = [
          {
            id: 4,
            type: 4,
            enabled: true,
            isBuiltIn: true,
            order: 0,
            title: 'Carousel Regression',
          },
        ];
        await page.route('**/api/v1/settings/discover', (route) =>
          route.fulfill({ json: sliders })
        );
        await page.route(
          '**/api/v1/user/1/settings/discover-book-sections',
          (route) => route.fulfill({ json: { sections: [] } })
        );
        await page.route('**/_next/data/*/index.json*', (route) =>
          route.fulfill({
            json: { pageProps: { discoverSliders: sliders }, __N_SSP: true },
          })
        );
        await page.goto('/settings/main');
        await page.evaluate(() => {
          void (window as any).next.router.push('/');
        });

        await expect(page.locator('html')).toHaveAttribute(
          'dir',
          locale === 'ar' ? 'rtl' : 'ltr'
        );
        const themePicker = page
          .locator('.searchbar button[aria-haspopup="menu"]')
          .first();
        await themePicker.click();
        const menu = page.getByRole('menu');
        await expect(menu).toBeVisible();
        const bounds = await menu.boundingBox();
        expect(bounds).not.toBeNull();
        expect(bounds!.x).toBeGreaterThanOrEqual(0);
        expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width + 1);
        await page.keyboard.press('Escape');
        if (width >= 1024) {
          const sidebar = page
            .locator('.sidebar')
            .filter({ visible: true })
            .first();
          const box = await sidebar.boundingBox();
          expect(box).not.toBeNull();
          expect(
            locale === 'ar'
              ? Math.abs(box!.x + box!.width - width)
              : Math.abs(box!.x)
          ).toBeLessThanOrEqual(1);
        }
        const slider = page.getByTestId('media-slider').filter({
          has: page.getByText('Carousel Regression 1', { exact: true }),
        });
        const track = slider.locator('.slider-track');
        await expect(track).toBeVisible();
        expect(
          await track.evaluate((el) => el.scrollWidth - el.clientWidth)
        ).toBeGreaterThan(260);
        const target = locale === 'ar' ? -260 : 260;
        await track.evaluate((el, x) => {
          el.scrollLeft = x;
          el.dispatchEvent(new Event('scroll', { bubbles: true }));
        }, target);
        await expect
          .poll(() => track.evaluate((el) => el.scrollLeft))
          .toBe(target);
        await slider.screenshot({
          path: info.outputPath('scrolled-carousel.png'),
        });
        await expect
          .poll(() =>
            page.evaluate(() => {
              const key = history.state?.key;
              return JSON.parse(
                sessionStorage.getItem(
                  `__seerrDiscoverScroll:sliders:${key}`
                ) || '{}'
              ).trending;
            })
          )
          .toBe(260);
        await slider.locator('a[href="/movie/991002"]').first().click();
        await expect(page).toHaveURL(/\/movie\/991002$/);
        await page.goBack();
        await expect(page).toHaveURL(/\/$/);
        await expect(track).toBeVisible();
        await expect
          .poll(() => track.evaluate((el) => el.scrollLeft))
          .toBe(target);
        await slider.screenshot({
          path: info.outputPath('restored-carousel.png'),
        });
      });
