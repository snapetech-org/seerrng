import { expect, test } from '@playwright/test';

test.use({ serviceWorkers: 'block' });
for (const theme of ['persiusNG', 'seerrOrig', 'seerrNGJ']) {
  for (const width of [390, 1440]) {
    test(`account tokens ${theme} ${width}`, async ({ page }, info) => {
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
      // A matching existing settings consumer is the visual baseline for the
      // shared profile, tabs, form, sensitive input and button owners.
      await page.goto('/profile/settings/password');
      await expect(page.locator('html')).toHaveAttribute(
        'data-interface-theme',
        theme
      );
      await expect(page.locator('input[type=password]').first()).toBeVisible();
      await page.screenshot({
        path: info.outputPath('password.png'),
        fullPage: true,
      });
      if (process.env.SECURITY_UI_BASELINE === 'true') return;

      // This suite runs only with the disposable cypress fixture database.
      const existing = await (
        await page.request.get('/api/v1/auth/client-tokens')
      ).json();
      for (const key of existing) {
        if (key.name === 'Browser fixture')
          await page.request.delete(`/api/v1/auth/client-tokens/${key.id}`);
      }
      if (theme === 'persiusNG' && width === 390) {
        await page.route('**/api/v1/auth/client-tokens', (route) =>
          route.fulfill({
            status: 503,
            json: { message: 'Fixture read failure' },
          })
        );
        await page.goto('/profile/settings/client-tokens');
        await expect(
          page.getByText('Unable to load your client tokens.', { exact: true })
        ).toBeVisible();
        await expect(
          page.getByRole('button', { name: 'Create Token', exact: true })
        ).toBeDisabled();
        await page.screenshot({
          path: info.outputPath('tokens-load-failure.png'),
          fullPage: true,
        });
        await page.unroute('**/api/v1/auth/client-tokens');
        await page.getByRole('button', { name: 'Retry', exact: true }).click();
      }
      await page.goto('/profile/settings/client-tokens');
      await expect(
        page.getByRole('heading', { name: 'Client Tokens', exact: true })
      ).toBeVisible();
      await expect(
        page.getByText('No client tokens yet.', { exact: true })
      ).toBeVisible();
      await page.screenshot({
        path: info.outputPath('tokens-empty.png'),
        fullPage: true,
      });
      await page
        .getByLabel('Token Name', { exact: true })
        .fill('Browser fixture');
      await page.getByLabel('Access', { exact: true }).selectOption('discover');
      await page.getByLabel('Expires After', { exact: true }).selectOption('7');
      // Failed creation must retain the draft and allow a deliberate retry.
      await page.route('**/api/v1/auth/client-tokens', async (route) => {
        if (route.request().method() === 'POST') {
          await route.fulfill({
            status: 409,
            json: { message: 'Fixture limit' },
          });
          return;
        }
        await route.continue();
      });
      await page
        .getByRole('button', { name: 'Create Token', exact: true })
        .click();
      await expect(
        page.getByText(
          'Unable to create the token. Check your settings and revoke an existing token if you have reached the limit.'
        )
      ).toBeVisible();
      await expect(page.getByLabel('Token Name', { exact: true })).toHaveValue(
        'Browser fixture'
      );
      await page.screenshot({
        path: info.outputPath('tokens-failure.png'),
        fullPage: true,
      });
      await page.unroute('**/api/v1/auth/client-tokens');
      await page
        .getByRole('button', { name: 'Create Token', exact: true })
        .click();
      const tokenInput = page
        .locator('input')
        .and(page.getByLabel('New Token', { exact: true }));
      await expect(tokenInput).toBeVisible();
      const token = await tokenInput.inputValue();
      expect(token).toMatch(/^sngc_[A-Za-z0-9_-]{43}$/);
      expect(await tokenInput.getAttribute('type')).toBe('password');
      expect(
        (
          await page.request.get('/api/v1/auth/me', {
            headers: { 'X-API-Key': token },
          })
        ).status()
      ).toBe(200);
      expect(
        (
          await page.request.get('/api/v1/settings/main', {
            headers: { 'X-API-Key': token },
          })
        ).status()
      ).toBe(401);
      const list = await page.request.get('/api/v1/auth/client-tokens');
      expect(list.headers()['cache-control']).toContain('no-store');
      expect(await list.text()).not.toContain(token);
      const persisted = await page.evaluate(() => [
        JSON.stringify(localStorage),
        JSON.stringify(sessionStorage),
      ]);
      expect(persisted.join('')).not.toContain(token);
      // Screenshots keep the one-time token masked.
      await page.screenshot({
        path: info.outputPath('tokens-created.png'),
        fullPage: true,
      });
      const newTokenCard = page.getByRole('region', {
        name: 'New Token',
        exact: true,
      });
      // Center the card above the existing fixed phone navigation before
      // inspecting it; full-page captures retain fixed controls mid-document.
      await newTokenCard.evaluate((element) =>
        element.scrollIntoView({ block: 'center' })
      );
      await expect(
        page.getByRole('button', { name: 'Copy Token', exact: true })
      ).toBeInViewport();
      await newTokenCard.screenshot({
        path: info.outputPath('new-token-card.png'),
      });
      await page.screenshot({ path: info.outputPath('token-viewport.png') });
      await page.reload();
      await expect(tokenInput).toHaveCount(0);
      await expect(
        page.getByRole('heading', { name: 'Browser fixture', exact: true })
      ).toBeVisible();
      await page
        .getByRole('button', { name: 'Revoke Token', exact: true })
        .click();
      await page.getByRole('button', { name: 'Cancel', exact: true }).click();
      expect(
        (
          await page.request.get('/api/v1/auth/me', {
            headers: { 'X-API-Key': token },
          })
        ).status()
      ).toBe(200);
      await page
        .getByRole('button', { name: 'Revoke Token', exact: true })
        .click();
      await page
        .getByRole('button', { name: 'Confirm Revocation', exact: true })
        .click();
      await expect(
        page.getByText('No client tokens yet.', { exact: true })
      ).toBeVisible();
      expect(
        (
          await page.request.get('/api/v1/auth/me', {
            headers: { 'X-API-Key': token },
          })
        ).status()
      ).toBe(401);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth)
      ).toBeLessThanOrEqual(width);
      await page.screenshot({
        path: info.outputPath('tokens-revoked.png'),
        fullPage: true,
      });
    });
  }
}

test('ordinary users manage only their own tokens', async ({
  page,
  browser,
}) => {
  test.skip(process.env.SECURITY_UI_BASELINE === 'true');
  expect(
    (
      await page.request.post('/api/v1/auth/local', {
        data: { email: 'friend@seerr.dev', password: 'test1234' },
      })
    ).status()
  ).toBe(200);
  await page.goto('/profile/settings/client-tokens');
  await page
    .getByLabel('Token Name', { exact: true })
    .fill('Own-account fixture');
  await page.getByRole('button', { name: 'Create Token', exact: true }).click();
  const input = page
    .locator('input')
    .and(page.getByLabel('New Token', { exact: true }));
  await expect(input).toBeVisible();
  const token = await input.inputValue();
  const me = await page.request.get('/api/v1/auth/me', {
    headers: { 'X-API-Key': token },
  });
  expect((await me.json()).id).toBe(2);
  const own = await (
    await page.request.get('/api/v1/auth/client-tokens')
  ).json();
  const id = own.find(
    (key: { name: string }) => key.name === 'Own-account fixture'
  ).id;
  const admin = await browser.newContext({
    baseURL: new URL(page.url()).origin,
  });
  try {
    expect(
      (
        await admin.request.post('/api/v1/auth/local', {
          data: { email: 'admin@seerr.dev', password: 'test1234' },
        })
      ).status()
    ).toBe(200);
    expect(
      (await admin.request.get('/api/v1/auth/client-tokens')).status()
    ).toBe(200);
    expect(
      await (await admin.request.get('/api/v1/auth/client-tokens')).text()
    ).not.toContain('Own-account fixture');
    await admin.request.delete(`/api/v1/auth/client-tokens/${id}`);
    expect(
      (
        await page.request.get('/api/v1/auth/me', {
          headers: { 'X-API-Key': token },
        })
      ).status()
    ).toBe(200);
  } finally {
    await admin.close();
  }
  await page.getByRole('button', { name: 'Revoke Token', exact: true }).click();
  await page
    .getByRole('button', { name: 'Confirm Revocation', exact: true })
    .click();
  await expect(input).toHaveCount(0);
  expect(
    (
      await page.request.get('/api/v1/auth/me', {
        headers: { 'X-API-Key': token },
      })
    ).status()
  ).toBe(401);
});
