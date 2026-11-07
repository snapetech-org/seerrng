import { expect, test, type Page } from '@playwright/test';
import type { MovieDetails } from '@server/models/Movie';
import { restoreAdminPresentation } from './helpers/presentation';

test.use({ serviceWorkers: 'block' });
test.afterEach(async ({ page }) => restoreAdminPresentation(page));

const loginAsAdmin = async (page: Page, baseURL: string | undefined) => {
  const response = await page.request.post(`${baseURL}/api/v1/auth/local`, {
    data: { email: 'admin@seerr.dev', password: 'test1234' },
  });
  expect(response.status()).toBe(200);
};
const movie: MovieDetails = {
  id: 550,
  adult: false,
  budget: 63000000,
  genres: [],
  originalLanguage: 'en',
  originalTitle: 'Fight Club',
  popularity: 1,
  productionCompanies: [],
  productionCountries: [],
  releaseDate: '1999-10-15',
  releases: { results: [] },
  revenue: 0,
  spokenLanguages: [],
  status: 'Released',
  title: 'Fight Club',
  video: false,
  voteAverage: 8.4,
  voteCount: 100,
  credits: { cast: [], crew: [] },
  externalIds: {},
  keywords: [],
};

const baseline = process.env.SEERR_COLLECTION_QA_BASELINE === 'true';
const collection = {
  id: 123,
  name: 'Fixture Collection',
  overview: 'Fixture overview',
  parts: [{ ...movie, mediaType: 'movie', genreIds: [] }],
};
for (const theme of ['seerrNGJ', 'seerrOrig', 'persiusNG'])
  for (const locale of baseline ? ['en'] : ['en', 'ar'])
    for (const width of [390, 1440]) {
      test(`collection summary ${theme} ${locale} ${width}`, async ({
        page,
        baseURL,
      }, info) => {
        await page.setViewportSize({ width, height: 900 });
        await loginAsAdmin(page, baseURL);
        expect(
          (
            await page.request.post('/api/v1/user/1/settings/main', {
              data: { locale },
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
        await page.route('**/_next/data/**/collection/123.json*', (r) =>
          r.fulfill({ json: { pageProps: { collection }, __N_SSP: true } })
        );
        await page.route('**/api/v1/collection/123', (r) =>
          r.fulfill({ json: collection })
        );
        await page.route('**/api/v1/collection/123/availability', (r) =>
          r.fulfill({
            status: 409,
            json: { message: 'Fixture has no library copies' },
          })
        );
        await page.route('**/api/v1/movie/550', (r) =>
          r.fulfill({ json: movie })
        );
        await page.route('**/api/v1/movie/550/ratingscombined*', (r) =>
          r.fulfill({ json: {} })
        );
        await page.goto('/settings/main');
        await page.evaluate(async () => {
          await (
            window as unknown as {
              next: { router: { push: (path: string) => Promise<unknown> } };
            }
          ).next.router.push('/collection/123');
        });
        if (theme === 'seerrOrig') {
          await expect(
            page.locator(
              '[data-native-composition="upstream"][data-media-type="collection"]'
            )
          ).toBeVisible();
          await expect(
            page.locator('.upstream-media-overview-copy')
          ).toBeVisible();
          await expect(
            page
              .locator(
                '[data-testid="media-slider"] [data-testid="title-card"]'
              )
              .first()
          ).toBeVisible();
          await page.locator('.upstream-extra-tools > summary').click();
        }
        const row = page.locator('.movie-summary-card-with-selection');
        await expect(row).toHaveCount(1);
        await expect(page.locator('html')).toHaveAttribute('lang', locale);
        await expect(page.locator('html')).toHaveAttribute(
          'data-interface-theme',
          theme
        );
        await expect
          .poll(() =>
            page.evaluate(
              () => getComputedStyle(document.documentElement).direction
            )
          )
          .toBe(locale === 'ar' ? 'rtl' : 'ltr');
        await row.scrollIntoViewIfNeeded();
        const geometry = await row.evaluate((n) => ({
          columns: getComputedStyle(n).gridTemplateColumns,
          children: Array.from(n.children).map((c) => ({
            owner: c.className,
            rect: c.getBoundingClientRect().toJSON(),
          })),
        }));
        await info.attach('summary-geometry', {
          body: JSON.stringify(geometry),
          contentType: 'application/json',
        });
        if (!baseline && (theme !== 'seerrOrig' || width >= 1024)) {
          if (locale === 'ar') {
            expect(geometry.children[0].rect.left).toBeGreaterThanOrEqual(
              geometry.children[1].rect.right
            );
            expect(geometry.children[1].rect.left).toBeGreaterThanOrEqual(
              geometry.children[2].rect.right
            );
          } else {
            expect(geometry.children[0].rect.right).toBeLessThanOrEqual(
              geometry.children[1].rect.left
            );
            expect(geometry.children[1].rect.right).toBeLessThanOrEqual(
              geometry.children[2].rect.left
            );
          }
          expect(
            Math.abs(geometry.children[0].rect.width - 16)
          ).toBeLessThanOrEqual(1);
        }
        const selection = row.locator('.movie-summary-selection button');
        const pressed = await selection.getAttribute('aria-pressed');
        await selection.click();
        await expect(selection).toHaveAttribute(
          'aria-pressed',
          String(pressed !== 'true')
        );
        await selection.click();
        await expect(selection).toHaveAttribute(
          'aria-pressed',
          String(pressed === 'true')
        );
        await row.screenshot({
          path: info.outputPath(
            `${theme}-${locale}-${width}-collection-row.png`
          ),
        });
        await page.screenshot({
          path: info.outputPath(`${theme}-${locale}-${width}-collection.png`),
          fullPage: true,
        });
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth
          )
        ).toBe(true);
      });
    }
