import { expect, test } from '@playwright/test';

test.use({ serviceWorkers: 'allow' });
test('real service worker preserves repeated authenticated document navigation', async ({
  page,
  baseURL,
}) => {
  const login = await page
    .context()
    .request.post(`${baseURL}/api/v1/auth/local`, {
      data: { email: 'admin@seerr.dev', password: 'test1234' },
    });
  expect(login.status()).toBe(200);
  await page.goto('/settings/network');
  await expect
    .poll(
      () => page.evaluate(() => Boolean(navigator.serviceWorker.controller)),
      { timeout: 15_000 }
    )
    .toBe(true);
  for (const route of [
    '/settings/main',
    '/settings/network',
    '/settings/main',
  ]) {
    const response = await page.goto(route);
    expect(response?.status()).toBe(200);
    await expect(
      page.getByRole('button', { name: 'User menu', exact: true })
    ).toBeVisible();
    expect(
      await page.evaluate(() => Boolean(navigator.serviceWorker.controller))
    ).toBe(true);
    expect(page.url()).toBe(baseURL + route);
  }
});
