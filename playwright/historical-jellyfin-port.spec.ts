import { expect, test } from '@playwright/test';

test.use({ serviceWorkers: 'block' });

test('typed Jellyfin port is submitted as an integer', async ({ page }) => {
  const auth = await page.request.post('/api/v1/auth/local', {
    data: { email: 'admin@seerr.dev', password: 'test1234' },
  });
  expect(auth.status()).toBe(200);
  let submitted: Record<string, unknown> | undefined;
  await page.route('**/api/v1/settings/jellyfin', async (route) => {
    if (route.request().method() === 'POST') {
      submitted = route.request().postDataJSON();
    }
    await route.fulfill({
      json: {
        ip: 'jellyfin.fixture.invalid',
        port: 8096,
        useSsl: false,
        urlBase: '',
        apiKey: 'fixture-key',
        libraries: [],
      },
    });
  });
  await page.goto('/settings/jellyfin');
  await page.locator('#port').fill('8097');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect.poll(() => submitted?.port).toBe(8097);
  expect(typeof submitted?.port).toBe('number');
  expect(Number.isInteger(submitted?.port)).toBe(true);
});
