import { expect, test } from '@playwright/test';
import { restoreAdminPresentation } from './helpers/presentation';
test.use({ serviceWorkers: 'block' });
test.afterEach(async ({ page }) => restoreAdminPresentation(page));
for (const theme of ['seerrOrig', 'seerrNGJ'])
  for (const width of [390, 1440])
    test(`collection load recovery ${theme} ${width}`, async ({
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
      await page.request.post('/api/v1/user/1/settings/interface-theme', {
        data: { theme },
      });
      let failed = true;
      await page.route('**/_next/data/**/collection/123.json*', (route) =>
        route.fulfill({ json: { pageProps: {}, __N_SSP: true } })
      );
      await page.route('**/api/v1/collection/123', (route) =>
        route.fulfill(
          failed
            ? { status: 503, json: { message: 'Isolated provider outage' } }
            : { json: { id: 123, name: 'Recovery Collection', parts: [] } }
        )
      );
      await page.goto('/settings/main');
      await page.evaluate(async () => {
        await (
          window as unknown as {
            next: { router: { push: (path: string) => Promise<unknown> } };
          }
        ).next.router.push('/collection/123');
      });
      await expect(
        page.getByRole('heading', {
          name: 'Could not load this collection. Try again.',
          exact: true,
        })
      ).toBeVisible();
      await page.screenshot({
        path: info.outputPath('outage.png'),
        fullPage: true,
      });
      failed = false;
      await page.getByRole('button', { name: 'Retry', exact: true }).click();
      await expect(
        page.getByText('Recovery Collection', { exact: true }).first()
      ).toBeVisible();
      await expect(
        page.getByRole('button', { name: 'Queue Collection', exact: true })
      ).toBeVisible();
      await page.screenshot({
        path: info.outputPath('recovered.png'),
        fullPage: true,
      });
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth)
      ).toBeLessThanOrEqual(width + 1);
    });
