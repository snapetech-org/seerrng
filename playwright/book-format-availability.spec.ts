import { expect, test } from '@playwright/test';
import { restoreAdminPresentation } from './helpers/presentation';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
test.afterEach(async ({ page }) => restoreAdminPresentation(page));

for (const theme of ['seerrOrig', 'seerrNGJ'])
  for (const width of [390, 1440]) {
    test(`${theme} book availability requires an available library state at ${width}px`, async ({
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
          await page.request.post('/api/v1/user/1/settings/main', {
            data: { locale: 'en' },
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
      await page.route('**/api/v1/settings/public', async (route) => {
        const response = await route.fetch();
        const settings = await response.json();
        await route.fulfill({
          json: {
            ...settings,
            ...Object.fromEntries(
              Object.keys(settings)
                .filter((key) => key.endsWith('Enabled'))
                .map((key) => [key, true])
            ),
            enabledMediaCategories: Object.fromEntries(
              Object.keys(settings.enabledMediaCategories).map((key) => [
                key,
                true,
              ])
            ),
          },
        });
      });
      let status = 3;
      let requested = true;
      await page.route(/\/api\/v1\/book\/OL82563W(?:\?.*)?$/, (route) =>
        route.fulfill({
          json: {
            id: 'OL82563W',
            provider: 'openlibrary',
            mediaType: 'book',
            title: 'The Fellowship of the Ring',
            author: 'J. R. R. Tolkien',
            firstPublishYear: 1954,
            subjects: ['Fantasy'],
            isbnCandidates: [],
            description: 'Book availability regression fixture.',
            numberOfPages: 423,
            mediaInfo: {
              id: 990409,
              tmdbId: 0,
              mediaType: 'book',
              status,
              status4k: 1,
              serviceId: 0,
              externalServiceId: 40,
              requests: requested
                ? [
                    {
                      id: 990409,
                      status: 2,
                      type: 'book',
                      bookFormat: 'ebook',
                      requestedBy: { id: 1, displayName: 'Admin' },
                      seasons: [],
                    },
                  ]
                : [],
              issues: [],
              downloadStatus: [],
              audiobookDownloadStatus: [],
            },
          },
        })
      );
      await page.route(
        /\/api\/v1\/book\/OL82563W\/ratings(?:\?.*)?$/,
        (route) => route.fulfill({ json: { count: 0, source: 'openlibrary' } })
      );
      await page.route('**/api/v1/service/readarr', (route) =>
        route.fulfill({ json: [] })
      );
      await page.route('**/api/v1/request/status?*', (route) =>
        route.fulfill({
          json: {
            pageInfo: { pages: 0, pageSize: 100, results: 0, page: 1 },
            results: [],
          },
        })
      );
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      for (const state of [
        { name: 'queued', status: 3, requested: true, label: 'Requested' },
        {
          name: 'cancelled',
          status: 1,
          requested: false,
          label: 'Not Available',
        },
        { name: 'imported', status: 5, requested: false, label: 'Available' },
      ]) {
        status = state.status;
        requested = state.requested;
        await page.goto('/book/OL82563W');
        await expect(page.locator('html')).toHaveAttribute(
          'data-interface-theme',
          theme
        );
        await expect(
          page.getByRole('heading', {
            name: 'The Fellowship of the Ring (1954)',
            exact: true,
          })
        ).toBeVisible();
        const ebookValue = page
          .locator('dt')
          .filter({ hasText: /^Book:$/ })
          .locator('xpath=following-sibling::dd[1]');
        await expect(ebookValue).toHaveText(
          process.env.SEERR_BOOK_AVAILABILITY_BASELINE === 'true'
            ? 'Available'
            : state.label
        );
        await expect(
          page
            .locator('dt')
            .filter({ hasText: /^Audiobook:$/ })
            .locator('xpath=following-sibling::dd[1]')
        ).toHaveText('Not Available');
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth
          )
        ).toBe(true);
        await expect(
          page.getByText('Checking for available files…')
        ).toHaveCount(0);
        expect(errors).toEqual([]);
        await page.screenshot({
          path: info.outputPath(`${state.name}.png`),
          fullPage: true,
        });
      }
    });
  }
