import { expect, test } from '@playwright/test';
import { once } from 'node:events';
import { createServer, type Server } from 'node:http';

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
let bookOrbit: Server;
let bookOrbitPort: number;

test.beforeAll(async () => {
  const responses: Record<string, unknown> = {
    'GET /api/v1/auth/me': { id: 1, permissions: ['book_request_access'] },
    'POST /api/v1/books/query': { items: [], total: 0 },
    'GET /api/v1/app-info': { version: 'fixture' },
  };
  bookOrbit = createServer((req, res) => {
    const data =
      req.url === '/api/v1/auth/login' && req.method === 'POST'
        ? { accessToken: 'fixture-token' }
        : req.headers.authorization === 'Bearer fixture-token'
          ? responses[`${req.method} ${req.url}`]
          : undefined;
    req.resume();
    res.writeHead(data ? 200 : 404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data ?? {}));
  });
  bookOrbit.listen(0, '127.0.0.1');
  await once(bookOrbit, 'listening');
  const address = bookOrbit.address();
  if (!address || typeof address === 'string')
    throw new Error('BookOrbit fixture needs a TCP port.');
  bookOrbitPort = address.port;
});

test.afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    bookOrbit.close((error) => (error ? reject(error) : resolve()))
  );
});

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
      await dialog.locator('#hostname').fill('127.0.0.1');
      await dialog.locator('#port').fill(String(bookOrbitPort));
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

      const serviceCard = page
        .getByRole('listitem')
        .filter({ hasText: service.name });
      const removal = new RegExp(`/api/v1/settings/readarr/${createdId}$`);
      await page.route(
        removal,
        (route) =>
          route.fulfill({
            status: 409,
            json: {
              message: 'Service is still referenced by 1 active request.',
            },
          }),
        { times: 1 }
      );
      await serviceCard
        .getByRole('button', { name: 'Delete', exact: true })
        .click();
      const confirmation = page.getByRole('dialog', {
        name: 'Delete Bookshelf Server',
      });
      await confirmation
        .getByRole('button', { name: 'Delete', exact: true })
        .click();
      await expect(confirmation.getByRole('alert')).toHaveText(
        'Service is still referenced by 1 active request.'
      );
      await page.screenshot({
        path: info.outputPath('book-acquisition-remove-conflict.png'),
      });
      await confirmation
        .getByRole('button', { name: 'Delete', exact: true })
        .click();
      await expect(confirmation).toBeHidden();
      await expect(serviceCard).toHaveCount(0);
      createdId = undefined;
    });
  }
}
