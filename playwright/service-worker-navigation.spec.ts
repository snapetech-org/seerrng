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

test('direct offline-page recovery leaves the utility document', async ({
  page,
  baseURL,
}) => {
  const login = await page.request.post('/api/v1/auth/local', {
    data: { email: 'admin@seerr.dev', password: 'test1234' },
  });
  expect(login.status()).toBe(200);
  await page.goto('/offline.html');
  await expect(page).toHaveURL(`${baseURL}/`);
  await expect(
    page.getByRole('button', { name: 'User menu', exact: true })
  ).toBeVisible();
});

test('worker offline recovery returns to the originally requested route', async ({
  page,
  context,
  baseURL,
}, info) => {
  const login = await page.request.post('/api/v1/auth/local', {
    data: { email: 'admin@seerr.dev', password: 'test1234' },
  });
  expect(login.status()).toBe(200);
  await page.goto('/settings/main');
  await expect
    .poll(() =>
      page.evaluate(() => Boolean(navigator.serviceWorker.controller))
    )
    .toBe(true);
  try {
    await context.setOffline(true);
    await page.goto('/settings/network');
    await expect(
      page.getByRole('heading', { name: 'You are offline' })
    ).toBeVisible();
    expect(page.url()).toBe(`${baseURL}/settings/network`);
    await page.screenshot({ path: info.outputPath('offline-fallback.png') });
  } finally {
    await context.setOffline(false);
  }
  await expect(
    page.getByRole('button', { name: 'User menu', exact: true })
  ).toBeVisible();
  expect(page.url()).toBe(`${baseURL}/settings/network`);
});
