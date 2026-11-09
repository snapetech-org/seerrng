import { expect, test } from '@playwright/test';

test.use({
  serviceWorkers: 'block',
  reducedMotion: 'reduce',
  ...(process.env.PLAYWRIGHT_CHROMIUM_PATH
    ? {
        launchOptions: {
          executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH,
        },
      }
    : {}),
});

let createdId: number | undefined;
test.afterEach(async ({ page }) => {
  if (createdId != null) {
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
    test(`BookOrbit connection in ${theme} at ${width}px`, async ({
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
            backend: 'bookorbit',
            system: { version: 'fixture' },
            features: { requests: true, ebook: true, audiobook: true },
          },
        })
      );

      await page.goto('/settings/services', { waitUntil: 'domcontentloaded' });
      await page
        .getByRole('button', { name: 'Audiobooks & Books', exact: true })
        .click();
      await page.getByRole('button', { name: 'Add BookOrbit Server' }).click();
      const dialog = page.getByRole('dialog', { name: 'Add BookOrbit Server' });
      await expect(dialog).toBeVisible();
      await page.screenshot({
        path: info.outputPath('bookorbit-entry-dialog.png'),
        fullPage: false,
      });
      await dialog.locator('#name').fill(`BookOrbit fixture ${theme} ${width}`);
      await dialog.locator('#hostname').fill('books.invalid');
      await dialog.locator('#bookorbitUsername').fill('requester');
      await dialog.locator('#apiKey').fill('fixture-password');
      await dialog.locator('#serviceType').selectOption('both');
      await dialog.getByRole('button', { name: 'Test connection' }).click();
      await expect(dialog.getByText('BookOrbit Version')).toBeVisible();
      await expect(
        dialog.getByText(/Requests are filed under this BookOrbit account/)
      ).toBeVisible();
      const bounds = await dialog.boundingBox();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width + 1);
      await page.screenshot({
        path: info.outputPath('bookorbit-tested-dialog.png'),
        fullPage: false,
      });

      const responsePromise = page.waitForResponse(
        (response) =>
          response.request().method() === 'POST' &&
          new URL(response.url()).pathname === '/api/v1/settings/readarr'
      );
      await dialog.getByRole('button', { name: 'Add BookOrbit' }).click();
      const response = await responsePromise;
      expect(response.status(), await response.text()).toBe(201);
      createdId = (await response.json()).id;
      const readback = await page.request.get('/api/v1/settings/readarr');
      expect(readback.ok()).toBe(true);
      const service = (await readback.json()).find(
        (item: { id: number }) => item.id === createdId
      );
      expect(service).toMatchObject({
        backend: 'bookorbit',
        serviceType: 'both',
        bookorbitUsername: 'requester',
      });
      expect(JSON.stringify(service)).not.toContain('fixture-password');
      await expect(dialog).toBeHidden();
    });
  }
}
