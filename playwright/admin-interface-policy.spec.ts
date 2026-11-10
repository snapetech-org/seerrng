import { expect, test } from '@playwright/test';

test('admin can apply the interface to all users and lock non-admins to Lumen', async ({
  page,
  browser,
  baseURL,
}, info) => {
  test.setTimeout(120_000);
  await page.request.get('/api/v1/settings/public');
  expect(
    (
      await page.request.post('/api/v1/auth/local', {
        data: { email: 'admin@seerr.dev', password: 'test1234' },
      })
    ).status()
  ).toBe(200);
  const original = await (
    await page.request.get('/api/v1/settings/main')
  ).json();
  const friend = await browser.newContext({ baseURL });
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/settings/main');
    await expect(
      page.getByLabel('Default Interface', { exact: true })
    ).toBeVisible();
    await page.screenshot({
      path: info.outputPath('general-desktop-before.png'),
    });
    await page
      .getByLabel('Default Interface', { exact: true })
      .selectOption('lumen');
    await page.getByLabel('Apply Default Interface to All Users').click();
    await page.getByLabel('Lock Lumen for Non-Administrators').click();
    await page.screenshot({
      path: info.outputPath('general-desktop-selected.png'),
    });
    await page.setViewportSize({ width: 390, height: 900 });
    await page
      .getByLabel('Lock Lumen for Non-Administrators')
      .scrollIntoViewIfNeeded();
    await page.screenshot({
      path: info.outputPath('general-phone-selected.png'),
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      )
    ).toBe(true);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect
      .poll(
        async () =>
          (await (await page.request.get('/api/v1/settings/main')).json())
            .lockLumenForNonAdmins
      )
      .toBe(true);

    await friend.request.get('/api/v1/settings/public');
    expect(
      (
        await friend.request.post('/api/v1/auth/local', {
          data: { email: 'friend@seerr.dev', password: 'test1234' },
        })
      ).status()
    ).toBe(200);
    const host = new URL(baseURL!).hostname;
    await friend.addCookies([
      {
        name: 'seerrng-frontend',
        value: 'classic',
        domain: host,
        path: '/',
      },
    ]);
    const friendPage = await friend.newPage();
    await friendPage.goto('/');
    await expect(friendPage).toHaveURL(/\/lumen\/$/);
    await friendPage.goto('/lumen/me');
    await expect(
      friendPage.getByText('Full SeerrNG', { exact: true })
    ).toHaveCount(0);
    await friendPage.goto('/seerrng');
    await expect(friendPage).toHaveURL(/\/lumen\/$/);
    await page.goto('/seerrng');
    await expect(page).toHaveURL(/\/?interface=classic$/);
  } finally {
    expect(
      (
        await page.request.post('/api/v1/settings/main', {
          data: {
            defaultFrontend: original.defaultFrontend,
            lumenPublicUrl: original.lumenPublicUrl,
            enforceDefaultFrontend: original.enforceDefaultFrontend ?? false,
            lockLumenForNonAdmins: original.lockLumenForNonAdmins ?? false,
          },
        })
      ).status()
    ).toBe(200);
    await friend.close();
  }
});
