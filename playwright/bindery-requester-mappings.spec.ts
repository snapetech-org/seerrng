import { expect, test } from '@playwright/test';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
const baseline = process.env.SEERR_BINDERY_MAPPING_BASELINE === 'true';
let createdId: number | undefined;
test.afterEach(async ({ page }) => {
  if (createdId !== undefined) {
    expect(
      (await page.request.delete(`/api/v1/settings/readarr/${createdId}`)).ok()
    ).toBe(true);
    createdId = undefined;
  }
  expect(
    (
      await page.request.post('/api/v1/user/1/settings/interface-theme', {
        data: { theme: 'seerrOrig' },
      })
    ).status()
  ).toBe(200);
});
for (const theme of ['seerrNGJ', 'seerrOrig', 'persiusNG']) {
  for (const width of [390, 1440]) {
    test(`administrator maps Bindery requesters in ${theme} at ${width}px`, async ({
      page,
      playwright,
      baseURL,
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
        const body = await response.json();
        await route.fulfill({
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
      await page.route('**/api/v1/settings/readarr/test', (route) =>
        route.fulfill({
          json: {
            backend: 'bindery',
            system: { version: 'fixture' },
            features: { requestsForUser: true },
            requesterAccounts: 1,
          },
        })
      );
      await page.goto('/settings/services', { waitUntil: 'domcontentloaded' });
      await page
        .getByRole('button', { name: 'Audiobooks & Books', exact: true })
        .click();
      await page.getByRole('button', { name: /^Add Bindery Server$/i }).click();
      const dialog = page.getByRole('dialog', { name: /Add Bindery Server/i });
      await expect(dialog).toBeVisible();
      await dialog.locator('#name').fill(`Mapping fixture ${theme} ${width}`);
      await dialog.locator('#hostname').fill('bindery.invalid');
      await dialog.locator('#apiKey').fill('fixture-api-key');
      await dialog.getByRole('button', { name: /^Test connection$/i }).click();
      await expect(
        dialog.getByText(/Per-user requests are supported/)
      ).toBeVisible();
      await page.screenshot({
        path: info.outputPath('tested-dialog.png'),
        fullPage: false,
      });
      const bounds = await dialog.boundingBox();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width + 1);
      if (baseline) {
        await dialog.getByRole('button', { name: /^Cancel$/i }).click();
        return;
      }
      const mapping = dialog.getByLabel('Requester Account Mappings', {
        exact: true,
      });
      await mapping.fill('{"2":"victim"}');
      await mapping.blur();
      const save = dialog.getByRole('button', { name: /^Add Bindery$/i });
      await expect(save).toBeDisabled();
      await expect(
        dialog.getByText(/Enter a JSON object mapping/)
      ).toBeVisible();
      await mapping.fill('{"2":7}');
      await mapping.blur();
      await expect(save).toBeEnabled();
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth
          )
        )
        .toBe(true);
      await page.screenshot({
        path: info.outputPath('mapped-dialog.png'),
        fullPage: false,
      });
      const saved = page.waitForResponse(
        (r) =>
          r.request().method() === 'POST' &&
          new URL(r.url()).pathname === '/api/v1/settings/readarr'
      );
      await save.click();
      const response = await saved;
      expect(response.status(), await response.text()).toBe(201);
      const body = await response.json();
      createdId = body.id;
      expect(createdId).toBeDefined();
      const readback = await page.request.get('/api/v1/settings/readarr');
      expect(readback.ok()).toBe(true);
      expect(
        (await readback.json()).find(
          (service: { id: number }) => service.id === createdId
        ).binderyUserMappings
      ).toEqual({ '2': 7 });
      if (theme === 'seerrNGJ' && width === 390) {
        const friend = await playwright.request.newContext({ baseURL });
        try {
          expect(
            (
              await friend.post('/api/v1/auth/local', {
                data: { email: 'friend@seerr.dev', password: 'test1234' },
              })
            ).status()
          ).toBe(200);
          expect(
            (
              await friend.post('/api/v1/user/2/settings/main', {
                data: { username: 'Victim' },
              })
            ).status()
          ).toBe(200);
          expect(
            (
              await friend.put(`/api/v1/settings/readarr/${createdId}`, {
                data: {
                  ...response.request().postDataJSON(),
                  binderyUserMappings: { '2': 8 },
                },
              })
            ).status()
          ).toBe(403);
          const unchanged = await page.request.get('/api/v1/settings/readarr');
          expect(
            (await unchanged.json()).find(
              (service: { id: number }) => service.id === createdId
            ).binderyUserMappings
          ).toEqual({ '2': 7 });
        } finally {
          await friend.post('/api/v1/user/2/settings/main', {
            data: { username: 'friend' },
          });
          await friend.dispose();
        }
      }
      await expect(dialog).toBeHidden();
    });
  }
}
