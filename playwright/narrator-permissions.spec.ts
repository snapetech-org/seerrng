import { expect, test } from '@playwright/test';

test.use({ serviceWorkers: 'block' });
for (const theme of ['persiusNG', 'seerrOrig', 'seerrNGJ']) {
  for (const width of [390, 1440]) {
    for (const manager of [false, true]) {
      test(`narrator controls ${theme} ${width} ${manager ? 'manager' : 'requester'}`, async ({
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
        const actor = await (await page.request.get('/api/v1/auth/me')).json();
        await page.route('**/api/v1/auth/me', (route) =>
          route.fulfill({
            json: {
              ...actor,
              permissions: 8 + 34359738368 + (manager ? 16 : 0),
            },
          })
        );
        await page.route('**/api/v1/series/security-fixture', (route) =>
          route.fulfill({
            json: {
              id: 'security-fixture',
              title: 'Security Fixture',
              books: [],
              description: 'Isolated narrator permission review.',
            },
          })
        );
        await page.route('**/api/v1/service/readarr', (route) =>
          route.fulfill({
            json: [{ id: 1, name: 'Fixture audio', serviceType: 'audiobook' }],
          })
        );
        await page.route('**/api/v1/editions/series-narrators?*', (route) =>
          route.fulfill({
            json: {
              supported: true,
              matrix: {
                books: [
                  { bookId: 1, title: 'One' },
                  { bookId: 2, title: 'Two' },
                ],
              },
              plans: [
                {
                  narrator: 'Fixture Narrator',
                  totalBooks: 2,
                  covered: [1],
                  owned: [],
                  missing: [2],
                  otherPerformanceOnly: [2],
                  complete: false,
                  production: 'solo',
                },
              ],
            },
          })
        );
        let writes = 0;
        await page.route(
          '**/api/v1/editions/series-narrators/prefer',
          (route) => {
            writes++;
            return route.fulfill({ json: { success: true } });
          }
        );
        await page.goto('/series/security-fixture');
        await expect(page.locator('html')).toHaveAttribute(
          'data-interface-theme',
          theme
        );
        await expect(
          page.getByRole('heading', { name: 'Fixture Narrator', exact: true })
        ).toBeVisible();
        const collect = page.getByRole('button', {
          name: 'Collect With Fixture Narrator',
          exact: true,
        });
        await expect(collect).toHaveCount(manager ? 1 : 0);
        await page.screenshot({
          path: info.outputPath('narrator-permissions.png'),
          fullPage: true,
        });
        const panel = page.locator('section').filter({
          has: page.getByRole('heading', {
            name: 'Collect This Series With One Narrator',
            exact: true,
          }),
        });
        await panel.evaluate((element) =>
          element.scrollIntoView({ block: 'center' })
        );
        await panel.screenshot({ path: info.outputPath('narrator-panel.png') });
        if (manager) {
          await collect.click();
          await expect.poll(() => writes).toBe(1);
        } else expect(writes).toBe(0);
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth)
        ).toBeLessThanOrEqual(width);
      });
    }
  }
}
