import { expect, test } from '@playwright/test';

test.use({ serviceWorkers: 'block' });
test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: 'wait' });
});
for (const theme of ['seerrOrig', 'seerrNGJ'])
  for (const width of [390, 1440])
    for (const failFirst of [false, true]) {
      test(`Plex settings preserve independent saves and retry ${theme} ${width} ${failFirst ? 'failure' : 'success'}`, async ({
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
        let plex = {
          name: 'Plex fixture',
          ip: '127.0.0.1',
          port: 32400,
          useSsl: false,
          machineId: 'fixture',
          libraries: [],
          webAppUrl: '',
          analyzeOnPlayback: false,
        };
        let saves = 0;
        let tautulliWrites = 0;
        await page.route('**/api/v1/settings/plex**', async (route) => {
          const path = new URL(route.request().url()).pathname;
          if (
            route.request().method() === 'POST' &&
            path === '/api/v1/settings/plex'
          ) {
            saves++;
            if (failFirst && saves === 1)
              return route.fulfill({
                status: 503,
                json: { message: 'Isolated save failure' },
              });
            const body = route.request().postDataJSON();
            expect(typeof body.port).toBe('number');
            plex = { ...plex, ...body };
            return route.fulfill({ json: plex });
          }
          if (path.endsWith('/sync'))
            return route.fulfill({
              json: { running: false, progress: 0, total: 0, libraries: [] },
            });
          if (path.includes('/library')) return route.fulfill({ json: [] });
          return route.fulfill({ json: plex });
        });
        await page.route('**/api/v1/settings/tautulli', (route) => {
          if (route.request().method() === 'POST') tautulliWrites++;
          return route.fulfill({
            json: {
              hostname: '',
              port: 8181,
              useSsl: false,
              urlBase: '',
              apiKey: '',
              externalUrl: '',
            },
          });
        });
        await page.goto('/settings/plex');
        const analysis = page.getByRole('button', {
          name: 'Analyze Seasons During Playback',
          exact: true,
        });
        const save = page.getByTestId('settings-save-button');
        await expect(analysis).toHaveAttribute('aria-pressed', 'false');
        await analysis.click();
        await expect(save).toBeEnabled();
        const first = page.waitForResponse(
          (r) =>
            r.url().endsWith('/api/v1/settings/plex') &&
            r.request().method() === 'POST'
        );
        await save.click();
        await first;
        if (failFirst) {
          await expect(
            page.getByText('Failed to connect to Plex.', { exact: true })
          ).toBeVisible();
          await expect(save).toBeEnabled();
          await expect(analysis).toHaveAttribute('aria-pressed', 'true');
          expect(plex.analyzeOnPlayback).toBe(false);
          const retry = page.waitForResponse(
            (r) =>
              r.url().endsWith('/api/v1/settings/plex') &&
              r.request().method() === 'POST'
          );
          await save.click();
          expect((await retry).status()).toBe(200);
        }
        await expect(save).toBeDisabled();
        expect(plex.analyzeOnPlayback).toBe(true);
        expect(tautulliWrites).toBe(0);
        await analysis.click();
        await expect(save).toBeEnabled();
        const second = page.waitForResponse(
          (r) =>
            r.url().endsWith('/api/v1/settings/plex') &&
            r.request().method() === 'POST'
        );
        await save.click();
        expect((await second).status()).toBe(200);
        await expect(save).toBeDisabled();
        expect(plex.analyzeOnPlayback).toBe(false);
        expect(tautulliWrites).toBe(0);
        await page.reload();
        await expect(analysis).toHaveAttribute('aria-pressed', 'false');
        await page.screenshot({
          path: info.outputPath('plex-independent-saves.png'),
          fullPage: true,
        });
      });
    }
