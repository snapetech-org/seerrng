import { expect, test } from '@playwright/test';

test.use({ serviceWorkers: 'block' });
for (const theme of ['seerrOrig', 'seerrNGJ'])
  for (const width of [390, 1440])
    for (const kind of ['jellyfin', 'metadata']) {
      test(`secondary settings save recovery ${theme} ${width} ${kind}`, async ({
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
        let data =
          kind === 'jellyfin'
            ? {
                ip: '127.0.0.1',
                port: 8096,
                useSsl: false,
                urlBase: '',
                apiKey: 'qa-fixture',
                libraries: [],
                externalHostname: '',
                jellyfinForgotPasswordUrl: '',
              }
            : { tv: 'tmdb', anime: 'tmdb' };
        const endpoint = `/api/v1/settings/${kind === 'jellyfin' ? 'jellyfin' : 'metadatas'}`;
        let writes = 0;
        await page.route(`**${endpoint}`, async (route) => {
          if (['POST', 'PUT'].includes(route.request().method())) {
            writes++;
            if (writes === 1)
              return route.fulfill({
                status: 503,
                json: { message: 'Isolated save failure' },
              });
            data = { ...data, ...route.request().postDataJSON() };
          }
          return route.fulfill({
            json: kind === 'metadata' ? { success: true, ...data } : data,
          });
        });
        await page.goto(`/settings/${kind}`);
        await expect(page.locator('html')).toHaveAttribute(
          'data-interface-theme',
          theme
        );
        const edit = async (next: boolean) => {
          if (kind === 'jellyfin')
            await page
              .locator('#hostname')
              .fill(next ? 'localhost' : '127.0.0.1');
          else {
            await page.getByTestId('tv-metadata-provider-selector').click();
            await page
              .getByRole('option', {
                name: next ? 'TheTVDB' : 'The Movie Database (TMDB)',
                exact: true,
              })
              .click();
          }
        };
        const verify = async (next: boolean) => {
          if (kind === 'jellyfin')
            await expect(page.locator('#hostname')).toHaveValue(
              next ? 'localhost' : '127.0.0.1'
            );
          else
            await expect(
              page.getByTestId('tv-metadata-provider-selector')
            ).toContainText(next ? 'TheTVDB' : 'The Movie Database (TMDB)');
        };
        const save = page.getByTestId('settings-save-button');
        await edit(true);
        await expect(save).toBeEnabled();
        await save.click();
        await expect.poll(() => writes).toBe(1);
        await verify(true);
        await expect(save).toBeEnabled();
        await page.screenshot({
          path: info.outputPath('failed-save.png'),
          fullPage: true,
        });
        await save.click();
        await expect.poll(() => writes).toBe(2);
        await expect(save).toBeDisabled();
        await page.reload();
        await verify(true);
        await edit(false);
        await expect(save).toBeEnabled();
        await save.click();
        await expect.poll(() => writes).toBe(3);
        await expect(save).toBeDisabled();
        await page.reload();
        await verify(false);
        await page.screenshot({
          path: info.outputPath('saved-restored.png'),
          fullPage: true,
        });
        await page.unrouteAll({ behavior: 'wait' });
      });
    }
