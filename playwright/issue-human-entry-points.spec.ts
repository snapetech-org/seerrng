import { expect, test, type Page } from '@playwright/test';
import { restoreAdminPresentation } from './helpers/presentation';

test.use({ serviceWorkers: 'block' });
test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: 'wait' });
  await restoreAdminPresentation(page);
});

async function login(page: Page, theme: string) {
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
}

for (const theme of ['seerrOrig', 'seerrNGJ']) {
  for (const width of [390, 1440]) {
    test(`external lists add, persist, report sync and import, and remove ${theme} ${width}`, async ({
      page,
    }, info) => {
      await page.setViewportSize({ width, height: 900 });
      await login(page, theme);
      const listUrl = 'https://www.imdb.com/user/ur987654321/watchlist/';
      const endpoint = '/api/v1/request/lists';
      const prior = await (await page.request.get(endpoint)).json();
      expect(
        prior.some((list: { sourceUrl: string }) => list.sourceUrl === listUrl)
      ).toBe(false);
      let listId: number | undefined;
      try {
        await page.goto('/profile/settings/main');
        await expect(
          page.getByRole('heading', {
            name: 'External request lists',
            exact: true,
          })
        ).toBeVisible();
        const url = page.getByLabel('Public list URL', { exact: true });
        await url.fill('https://invalid.example/list');
        await page
          .getByRole('button', { name: 'Add list', exact: true })
          .click();
        await expect(
          page.getByText(
            'Use a public IMDb watchlist URL or a Goodreads to-read shelf URL.',
            { exact: true }
          )
        ).toBeVisible();
        await url.fill(listUrl);
        const saved = page.waitForResponse(
          (response) =>
            response.url().endsWith(endpoint) &&
            response.request().method() === 'POST'
        );
        await page
          .getByRole('button', { name: 'Add list', exact: true })
          .click();
        const response = await saved;
        expect(response.status()).toBe(201);
        listId = (await response.json()).id;
        await page.reload();
        const row = page.getByRole('listitem').filter({
          has: page.getByRole('link', { name: listUrl, exact: true }),
        });
        await expect(row).toBeVisible();
        // Provider access is deterministic here; list ownership/storage above and
        // deletion below use the real isolated database. Native tests cover dispatch.
        await page.route(`**${endpoint}/${listId}/sync`, (route) =>
          route.fulfill({
            json: {
              requested: 0,
              alreadyRequested: 0,
              unmatched: 0,
              failed: 0,
              error:
                'IMDb blocked server-side sync. Import your IMDb CSV export here.',
            },
          })
        );
        await row
          .getByRole('button', { name: 'Sync now', exact: true })
          .click();
        await expect(
          page.getByText(
            'IMDb blocked server-side sync. Import your IMDb CSV export here.',
            { exact: true }
          )
        ).toBeVisible();
        let imported: unknown;
        await page.route(`**${endpoint}/${listId}/import`, (route) => {
          imported = route.request().postDataJSON();
          return route.fulfill({
            json: {
              requested: 1,
              alreadyRequested: 0,
              unmatched: 0,
              failed: 0,
            },
          });
        });
        await row
          .getByLabel('Import IMDb CSV export', { exact: true })
          .setInputFiles({
            name: 'watchlist.csv',
            mimeType: 'text/csv',
            buffer: Buffer.from('Const,Title\ntt0137523,Fight Club\n'),
          });
        await expect.poll(() => imported).toEqual({ itemIds: ['tt0137523'] });
        await expect(
          page.getByText(
            'Sync complete: 1 requested, 0 already requested, 0 not found, 0 failed.',
            { exact: true }
          )
        ).toBeVisible();
        await row.scrollIntoViewIfNeeded();
        await page.screenshot({ path: info.outputPath('external-lists.png') });
        await row.getByRole('button', { name: 'Remove', exact: true }).click();
        await expect(row).toHaveCount(0);
        await page.reload();
        await expect(
          page.getByRole('link', { name: listUrl, exact: true })
        ).toHaveCount(0);
      } finally {
        if (listId) await page.request.delete(`${endpoint}/${listId}`);
      }
    });

    test(`beginner guide saves defaults, connects choices, and returns ${theme} ${width}`, async ({
      page,
    }, info) => {
      await page.setViewportSize({ width, height: 900 });
      await login(page, theme);
      const original = await (
        await page.request.get('/api/v1/settings/main')
      ).json();
      const originalPartial = original.partialRequestsEnabled;
      try {
        await page.goto('/settings/services');
        await page
          .getByRole('link', { name: 'Open guided setup', exact: true })
          .click();
        await expect(
          page.getByRole('heading', {
            name: 'Set defaults for new users',
            exact: true,
          })
        ).toBeVisible();
        const partial = page.getByRole('button', {
          name: 'Allow partial TV season requests',
          exact: true,
        });
        await partial.click();
        await page
          .getByRole('button', {
            name: 'Save defaults and continue',
            exact: true,
          })
          .click();
        await expect(
          page.getByRole('heading', {
            name: 'What would you like to connect?',
            exact: true,
          })
        ).toBeVisible();
        await expect
          .poll(
            async () =>
              (await (await page.request.get('/api/v1/settings/main')).json())
                .partialRequestsEnabled
          )
          .toBe(!originalPartial);
        await page.getByRole('button', { name: /^Download progress/ }).click();
        await expect(
          page.getByRole('heading', {
            name: 'How do your downloads arrive?',
            exact: true,
          })
        ).toBeVisible();
        await page.getByRole('button', { name: /^Both / }).click();
        await expect(
          page.getByRole('heading', {
            name: 'Live download progress',
            level: 2,
            exact: true,
          })
        ).toBeVisible();
        await expect(
          page.getByRole('button', { name: 'Add Usenet client', exact: true })
        ).toBeVisible();
        await page
          .getByRole('button', { name: 'Skip for now', exact: true })
          .click();
        await page.getByRole('button', { name: /^Movies & TV/ }).click();
        await expect(
          page.getByRole('button', { name: 'Add Radarr Server', exact: true })
        ).toBeVisible();
        await page.screenshot({
          path: info.outputPath('guide-service-choice.png'),
        });
        await page
          .getByRole('button', { name: 'Skip for now', exact: true })
          .click();
        await page
          .getByRole('button', { name: 'Back to defaults', exact: true })
          .click();
        await expect(partial).toHaveAttribute(
          'aria-pressed',
          String(!originalPartial)
        );
        await page
          .getByRole('button', { name: 'Skip for now', exact: true })
          .click();
        await page
          .getByRole('button', { name: 'Return to Services', exact: true })
          .click();
        await expect(page).not.toHaveURL(/\/setup/);
      } finally {
        expect(
          (
            await page.request.post('/api/v1/settings/main', {
              data: {
                defaultPermissions: original.defaultPermissions,
                enable4k: original.enable4k,
                partialRequestsEnabled: originalPartial,
              },
            })
          ).status()
        ).toBe(200);
      }
    });
  }
}
