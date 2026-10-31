import { expect, test } from '@playwright/test';

test('admins can connect a read-only Audiobookshelf book library', async ({
  page,
  baseURL,
}) => {
  expect(baseURL).toBeTruthy();
  const loginResponse = await page
    .context()
    .request.post(`${baseURL}/api/v1/auth/local`, {
      data: { email: 'admin@seerr.dev', password: 'test1234' },
      headers: { 'X-Forwarded-Proto': 'https' },
    });
  expect(loginResponse.status()).toBe(200);

  const sessionCookie = loginResponse
    .headersArray()
    .find(
      (header) =>
        header.name.toLowerCase() === 'set-cookie' &&
        header.value.startsWith('connect.sid=')
    )
    ?.value.match(/^connect\.sid=([^;]+)/)?.[1];
  expect(sessionCookie).toBeTruthy();

  await page.context().addCookies([
    {
      name: 'connect.sid',
      value: sessionCookie!,
      url: baseURL!,
      httpOnly: true,
      secure: false,
      sameSite: 'Lax',
    },
  ]);

  await page.route('**/api/v1/settings/audiobookshelf/test', async (route) => {
    await route.fulfill({
      status: 200,
      json: {
        libraries: [
          { id: 'book-library', name: 'Audio Library', numBooks: 18 },
        ],
      },
    });
  });

  await page.goto('/settings/services');
  await page.getByRole('button', { name: 'Audiobooks & Books' }).click();
  await expect(
    page.getByRole('heading', { name: 'Audiobookshelf Availability' })
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Connect Audiobookshelf library' })
    .click();

  const dialog = page.getByRole('dialog', {
    name: 'Add Audiobookshelf library',
  });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(/read-only audiobook library/i)).toBeVisible();
  await expect(dialog.getByText(/matched by ISBN/i)).toBeVisible();
  await dialog.getByLabel('Connection name').fill('Home audiobooks');
  await dialog.getByLabel('Hostname or IP address').fill('audiobookshelf');
  await dialog.getByLabel('Port').fill('13378');
  await dialog
    .getByLabel('Audiobookshelf user API token')
    .fill('playwright-test-user-token');

  await dialog.getByRole('button', { name: 'Test connection' }).click();
  const library = dialog.getByLabel('Audiobook library');
  await expect(
    library.getByRole('option', { name: /Audio Library/ })
  ).toBeAttached();
  await library.selectOption('book-library');
  const saveResponsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === 'PUT' &&
      response.url().endsWith('/api/v1/settings/audiobookshelf')
  );
  await dialog.getByRole('button', { name: 'Add library' }).click();
  const saveResponse = await saveResponsePromise;
  expect(
    saveResponse.status(),
    `Audiobookshelf settings save response: ${await saveResponse.text()}`
  ).toBe(200);

  await expect(dialog).toBeHidden();
  await expect(page.getByText('Home audiobooks · Audio Library')).toBeVisible();

  const savedSettings = await page
    .context()
    .request.get(`${baseURL}/api/v1/settings/audiobookshelf`);
  expect(savedSettings.status()).toBe(200);
  const settings = await savedSettings.json();
  expect(settings.apiKey).toBe('[REDACTED]');
});
