import { expect, test } from '@playwright/test';
import { restoreAdminPresentation } from './helpers/presentation';
import { getSelectOptionContrast } from './helpers/selectContrast';
test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
test.afterEach(async ({ page }) => {
  expect(
    (
      await page.request.post('/api/v1/user/1/settings/theme', {
        data: { palette: 'seerr' },
      })
    ).status()
  ).toBe(200);
  await restoreAdminPresentation(page);
});
for (const theme of ['seerrNGJ', 'seerrOrig', 'persiusNG'])
  for (const locale of ['en', 'ar'])
    for (const width of [390, 1440]) {
      test(`book advanced disclosure ${theme} ${locale} ${width}`, async ({
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
        expect(
          (
            await page.request.post('/api/v1/user/1/settings/theme', {
              data: { palette: 'lagoon' },
            })
          ).status()
        ).toBe(200);
        await page.route('**/api/v1/settings/public', async (route) => {
          const response = await route.fetch();
          const body = await response.json();
          await route.fulfill({
            json: {
              ...body,
              booksEnabled: true,
              ebookServiceEnabled: true,
              audiobookServiceEnabled: false,
              enabledMediaCategories: {
                ...body.enabledMediaCategories,
                ebook: true,
                audiobook: false,
              },
            },
          });
        });
        const service = {
          id: 1,
          name: 'Fixture Bookshelf',
          backend: 'readarr',
          serviceType: 'ebook',
          isDefault: true,
          is4k: false,
          activeProfileId: 1,
          activeDirectory: '/books',
        };
        await page.route('**/api/v1/service/readarr', (route) =>
          route.fulfill({ json: [service] })
        );
        await page.route('**/api/v1/service/readarr/1', (route) =>
          route.fulfill({
            json: {
              server: service,
              profiles: [{ id: 1, name: 'Default' }],
              rootFolders: [{ id: 1, path: '/books' }],
              tags: [
                { id: 1, label: 'Fixture first tag' },
                { id: 2, label: 'Fixture second tag' },
              ],
            },
          })
        );
        await page.route('**/api/v1/editions/book?*', (route) =>
          route.fulfill({ json: { editions: [], supportsAlongside: false } })
        );
        await page.route(/\/api\/v1\/book\/OL82563W(?:[/?]|$)/, (route) =>
          route.fulfill({
            json: new URL(route.request().url()).pathname.endsWith('/ratings')
              ? { count: 0, source: 'openlibrary' }
              : {
                  id: 'OL82563W',
                  provider: 'openlibrary',
                  mediaType: 'book',
                  title: 'Book request layout fixture',
                  author: 'Fixture Author',
                  firstPublishYear: 1999,
                  subjects: ['Fiction'],
                  description: 'A deterministic request dialog fixture.',
                  isbnCandidates: [],
                  mediaInfo: null,
                },
          })
        );
        let submissions = 0;
        page.on('request', (request) => {
          if (
            request.method() === 'POST' &&
            new URL(request.url()).pathname === '/api/v1/request'
          )
            submissions++;
        });
        await page.goto('/book/OL82563W', { waitUntil: 'domcontentloaded' });
        await expect(page.locator('html')).toHaveAttribute(
          'data-interface-theme',
          theme
        );
        await expect(page.locator('html')).toHaveAttribute('lang', locale);
        await page
          .locator('button[data-testid="format-request-control"]')
          .filter({ has: page.getByTestId('format-request-option-ebook') })
          .click();
        const dialog = page.getByRole('dialog');
        const control = dialog.locator(
          '[data-control-variant="book-request-advanced-options"]'
        );
        const button = control.locator('.detail-disclosure-button');
        await expect(button).toBeVisible();
        const geometry = await control.evaluate((element) => {
          const r = element.getBoundingClientRect(),
            b = element.querySelector('button.detail-disclosure-button'),
            c = getComputedStyle(element);
          return {
            width: r.width,
            height: r.height,
            font: c.fontSize,
            labelWidth: b.clientWidth,
            labelScroll: b.scrollWidth,
          };
        });
        const overlap = await dialog
          .locator('.detail-summary-card')
          .evaluate((summary) => {
            const poster = summary.querySelector('.detail-card-poster')!;
            const copy = poster.nextElementSibling!;
            const p = poster.getBoundingClientRect(),
              c = copy.getBoundingClientRect();
            return (
              Math.max(
                0,
                Math.min(p.right, c.right) - Math.max(p.left, c.left)
              ) *
              Math.max(0, Math.min(p.bottom, c.bottom) - Math.max(p.top, c.top))
            );
          });
        await page.screenshot({
          path: info.outputPath('poster-layout.png'),
          fullPage: true,
        });
        expect(
          overlap,
          'poster must not cover request metadata'
        ).toBeLessThanOrEqual(1);
        expect(geometry.height).toBe(32);
        expect(geometry.width).toBeGreaterThanOrEqual(192);
        expect(geometry.labelScroll).toBeLessThanOrEqual(
          geometry.labelWidth + 1
        );
        if ((await button.getAttribute('aria-expanded')) === 'true')
          await button.click();
        await expect(button).toHaveAttribute('aria-expanded', 'false');
        await button.click();
        await expect(button).toHaveAttribute('aria-expanded', 'true');
        const tags = dialog.locator('.react-select-container-dark');
        expect(
          await tags
            .locator('.react-select__control')
            .evaluate((element) => getComputedStyle(element).backgroundColor)
        ).not.toBe('rgb(255, 255, 255)');
        await tags.locator('[role="combobox"]').click();
        const options = page.locator('.react-select__menu [role="option"]');
        await expect(options.first()).toBeVisible();
        const contrast = await getSelectOptionContrast(options);
        for (const item of contrast)
          expect(item.contrast, JSON.stringify(item)).toBeGreaterThanOrEqual(
            4.5
          );
        await info.attach('request-tag-contrast.json', {
          body: JSON.stringify(contrast, null, 2),
          contentType: 'application/json',
        });
        await page.screenshot({
          path: info.outputPath('request-tags.png'),
          fullPage: true,
        });
        await tags.locator('[role="combobox"]').press('Escape');
        await page.screenshot({
          path: info.outputPath('expanded.png'),
          fullPage: true,
        });
        await button.click();
        await expect(button).toHaveAttribute('aria-expanded', 'false');
        await page.screenshot({
          path: info.outputPath('collapsed.png'),
          fullPage: true,
        });
        expect(submissions).toBe(0);
        expect((await dialog.boundingBox())!.width).toBeLessThanOrEqual(width);
        await info.attach('control-geometry', {
          body: JSON.stringify(geometry),
          contentType: 'application/json',
        });
      });
    }
