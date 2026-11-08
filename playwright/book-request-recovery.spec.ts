import { expect, test } from '@playwright/test';
import { restoreAdminPresentation } from './helpers/presentation';
test.use({ serviceWorkers: 'block' });
test.afterEach(async ({ page }) => restoreAdminPresentation(page));
for (const theme of ['seerrOrig', 'seerrNGJ'])
  for (const width of [390, 1440])
    test(
      'book metadata and edition Retry ' + theme + ' ' + width,
      async ({ page }, info) => {
        const id =
          'bookshelf:0:' +
          Buffer.from(
            String(427700 + width + (theme === 'seerrOrig' ? 0 : 10000))
          ).toString('base64url');
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
        const details = {
          id,
          mediaType: 'book',
          provider: 'bookshelf',
          bookFormat: 'ebook',
          title: 'Project Hail Mary',
          author: 'Synthetic Author',
          isbnCandidates: [],
          mediaInfo: null,
        };
        const service = {
          id: 0,
          name: 'Fixture Bookshelf',
          backend: 'readarr',
          serviceType: 'ebook',
          isDefault: true,
          is4k: false,
          activeProfileId: 1,
          activeDirectory: '/books',
        };
        await page.route('**/api/v1/settings/public', async (route) => {
          const r = await route.fetch();
          const body = await r.json();
          return route.fulfill({
            json: {
              ...body,
              booksEnabled: true,
              ebookServiceEnabled: true,
              audiobookServiceEnabled: true,
              enabledMediaCategories: {
                ...body.enabledMediaCategories,
                ebook: true,
                audiobook: true,
              },
            },
          });
        });
        await page.route('**/api/v1/service/readarr', (r) =>
          r.fulfill({ json: [service] })
        );
        await page.route('**/api/v1/service/readarr/0', (r) =>
          r.fulfill({
            json: {
              server: service,
              profiles: [{ id: 1, name: 'Default' }],
              rootFolders: [{ id: 1, path: '/books' }],
              tags: [],
            },
          })
        );
        let metadataFailed = false,
          editionFailed = false;
        await page.route('**/api/v1/book/**', (r) => {
          const u = new URL(r.request().url());
          if (u.pathname.endsWith('/series'))
            return r.fulfill({ json: { series: [] } });
          if (u.pathname.endsWith('/ratings'))
            return r.fulfill({ json: { count: 0, source: 'bookshelf' } });
          if (u.searchParams.has('lookupTitle'))
            return r.fulfill({ json: details });
          if (!metadataFailed) {
            metadataFailed = true;
            return r.fulfill({
              status: 503,
              json: { message: 'Explicit metadata outage fixture' },
            });
          }
          return r.fulfill({ json: details });
        });
        await page.route('**/api/v1/editions/book?*', (r) => {
          if (!editionFailed) {
            editionFailed = true;
            return r.fulfill({
              status: 503,
              json: { message: 'Explicit edition outage fixture' },
            });
          }
          return r.fulfill({
            json: { editions: [], supportsAlongside: false },
          });
        });
        await page.goto(
          '/book/' +
            encodeURIComponent(id) +
            '?format=ebook&lookupTitle=Project%20Hail%20Mary'
        );
        await expect(
          page.getByRole('heading', { name: 'Project Hail Mary', exact: true })
        ).toBeVisible();
        await expect(page.locator('html')).toHaveAttribute(
          'data-interface-theme',
          theme
        );
        const started = Date.now();
        await page
          .getByRole('group', { name: 'Request', exact: true })
          .getByRole('button', { name: 'Book', exact: true })
          .click();
        const dialog = page.getByRole('dialog');
        await expect(
          dialog.getByText('Something went wrong. Please try again.', {
            exact: true,
          })
        ).toBeVisible();
        expect(Date.now() - started).toBeLessThan(35000);
        await expect(
          dialog.getByRole('button', { name: 'Retry', exact: true })
        ).toBeVisible();
        await page.screenshot({
          path: info.outputPath(theme + '-' + width + '-metadata-timeout.png'),
          fullPage: true,
        });
        await dialog
          .getByRole('button', { name: 'Retry', exact: true })
          .click();
        await expect(
          dialog.getByRole('heading', {
            name: 'Project Hail Mary',
            exact: true,
          })
        ).toBeVisible();
        await expect(dialog.getByRole('alert')).toContainText(
          'You can still submit this request without choosing a version.'
        );
        await expect(
          dialog.getByRole('button', { name: 'Request', exact: true })
        ).toBeEnabled();
        await page.screenshot({
          path: info.outputPath(theme + '-' + width + '-edition-recovery.png'),
          fullPage: true,
        });
        const retry = dialog.getByRole('button', {
          name: 'Retry',
          exact: true,
        });
        await retry.click();
        await expect(
          dialog.getByText(
            'You can still submit this request without choosing a version.'
          )
        ).toHaveCount(0);
        await expect(
          dialog.getByRole('button', { name: 'Request', exact: true })
        ).toBeEnabled();
        await page.screenshot({
          path: info.outputPath(theme + '-' + width + '-ready.png'),
          fullPage: true,
        });
      }
    );
