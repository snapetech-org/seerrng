import { expect, test } from '@playwright/test';
import { restoreAdminPresentation } from './helpers/presentation';
test.use({ serviceWorkers: 'block' });
test.afterEach(async ({ page }) => restoreAdminPresentation(page));
for (const theme of ['seerrOrig', 'seerrNGJ'])
  for (const width of [390, 1440])
    test(`collection queue live progress ${theme} ${width}`, async ({
      page,
    }) => {
      expect(
        (
          await page.request.post('/api/v1/auth/local', {
            data: { email: 'admin@seerr.dev', password: 'test1234' },
          })
        ).status()
      ).toBe(200);
      await page.setViewportSize({ width, height: 900 });
      await page.request.post('/api/v1/user/1/settings/interface-theme', {
        data: { theme },
      });
      const collection = { id: 123, name: 'Live queue fixture', parts: [] };
      let watched = 0;
      await page.route('**/_next/data/**/collection/123.json*', (r) =>
        r.fulfill({ json: { pageProps: { collection }, __N_SSP: true } })
      );
      await page.route('**/api/v1/collection/123', (r) =>
        r.fulfill({ json: collection })
      );
      await page.route('**/api/v1/collection/123/queue?*', (r) =>
        r.fulfill({
          json: {
            queue: {
              id: 900,
              collectionId: 123,
              is4k: false,
              status: 'active',
              reason: null,
              bufferSize: 2,
              total: 8,
              watched,
              requested: watched ? 3 : 2,
            },
          },
        })
      );
      await page.goto('/settings/main');
      await page.evaluate(async () => {
        await (
          window as unknown as {
            next: { router: { push: (p: string) => Promise<unknown> } };
          }
        ).next.router.push('/collection/123');
      });
      await page
        .getByRole('button', { name: 'Queue Collection', exact: true })
        .click();
      const status = page.getByRole('dialog').getByRole('status');
      await expect(status).toContainText(
        '0 watched · 2 requested by this queue'
      );
      watched = 1;
      await expect(status).toContainText(
        '1 watched · 3 requested by this queue',
        { timeout: 6500 }
      );
    });
