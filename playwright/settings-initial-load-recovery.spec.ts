import { expect, test } from '@playwright/test';

test.use({ serviceWorkers: 'block' });
const cases = [
  ['main', 'main'],
  ['users', 'main'],
  ['categories', 'main'],
  ['network', 'network'],
  ['metadata', 'metadatas'],
  ['metadata', 'metadatas/music'],
  ['jellyfin', 'jellyfin'],
  ['jobs', 'jobs'],
  ['about', 'about'],
  ...[
    'email',
    'discord',
    'telegram',
    'gotify',
    'ntfy',
    'pushover',
    'slack',
    'webpush',
    'apprise',
    'pushbullet',
    'webhook',
  ].map((agent) => [`notifications/${agent}`, `notifications/${agent}`]),
];
for (const theme of ['seerrOrig', 'seerrNGJ'])
  for (const width of [390, 1440])
    for (const [route, endpoint] of cases) {
      test(`initial settings failure has a real Retry ${theme} ${width} ${route} ${endpoint}`, async ({
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
        let failed = true,
          reads = 0,
          writes = 0;
        const crashes: string[] = [];
        page.on('pageerror', (e) => crashes.push(e.message));
        await page.route(`**/api/v1/settings/${endpoint}`, async (request) => {
          if (request.request().method() !== 'GET') {
            writes++;
            return request.abort('blockedbyclient');
          }
          reads++;
          if (failed)
            return request.fulfill({
              status: 503,
              json: { message: 'QA initial read unavailable' },
            });
          return request.fallback();
        });
        await page.goto(`/settings/${route}`);
        await expect(page.locator('html')).toHaveAttribute(
          'data-interface-theme',
          theme
        );
        await expect(
          page
            .getByRole('alert')
            .filter({ hasText: 'Could not load settings.' })
        ).toBeVisible();
        await expect(page.locator('form[data-settings-dirty]')).toHaveCount(0);
        await page.screenshot({
          path: info.outputPath(
            `${theme}-${width}-${endpoint.replaceAll('/', '-')}-failed.png`
          ),
          fullPage: true,
        });
        const before = reads;
        failed = false;
        await page.getByRole('button', { name: 'Retry', exact: true }).click();
        await expect.poll(() => reads).toBeGreaterThan(before);
        await expect(
          page
            .getByRole('alert')
            .filter({ hasText: 'Could not load settings.' })
        ).toHaveCount(0);
        await expect(page.locator('.settings-page-content')).not.toBeEmpty();
        await expect
          .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
          .toBeLessThanOrEqual(width + 1);
        await page.screenshot({
          path: info.outputPath(
            `${theme}-${width}-${endpoint.replaceAll('/', '-')}-recovered.png`
          ),
          fullPage: true,
        });
        expect(crashes).toEqual([]);
        expect(writes).toBe(0);
      });
    }

for (const theme of ['seerrOrig', 'seerrNGJ'])
  for (const width of [390, 1440]) {
    test(`background settings read failure retains a loaded draft ${theme} ${width}`, async ({
      page,
    }) => {
      await page.clock.install();
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
      await page.goto('/settings/main');
      await expect(page.locator('html')).toHaveAttribute(
        'data-interface-theme',
        theme
      );
      const title = page.locator('#applicationTitle');
      await expect(title).toBeVisible();
      await title.fill('Unsaved draft survives refresh failure');
      let failures = 0;
      await page.route('**/api/v1/settings/main', (route) => {
        if (route.request().method() !== 'GET')
          throw new Error('Unexpected settings mutation');
        failures++;
        return route.fulfill({
          status: 503,
          json: { message: 'QA background read unavailable' },
        });
      });
      // Advance the application's 30-second SWR de-duplication window without a wall-clock wait.
      await page.clock.fastForward(31000);
      await page.context().setOffline(true);
      await page.context().setOffline(false);
      await expect.poll(() => failures).toBeGreaterThan(0);
      await expect(title).toHaveValue('Unsaved draft survives refresh failure');
      await expect(page.getByTestId('settings-main-form')).toHaveAttribute(
        'data-settings-dirty',
        'true'
      );
      await expect(
        page.getByRole('alert').filter({ hasText: 'Could not load settings.' })
      ).toHaveCount(0);
    });
  }
