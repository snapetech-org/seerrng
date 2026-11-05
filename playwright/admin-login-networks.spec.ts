import { expect, test } from '@playwright/test';

test('administrator network settings remain usable and prevent lockout', async ({
  page,
  baseURL,
}, info) => {
  const login = await page
    .context()
    .request.post(`${baseURL}/api/v1/auth/local`, {
      data: { email: 'admin@seerr.dev', password: 'test1234' },
    });
  expect(login.status()).toBe(200);
  const sid = login
    .headersArray()
    .find(
      (h) =>
        h.name.toLowerCase() === 'set-cookie' &&
        h.value.startsWith('connect.sid=')
    )
    ?.value.match(/^connect\.sid=([^;]+)/)?.[1];
  expect(sid).toBeTruthy();
  await page.context().addCookies([
    {
      name: 'connect.sid',
      value: sid!,
      url: baseURL!,
      httpOnly: true,
      secure: false,
      sameSite: 'Lax',
    },
  ]);
  const baseline = process.env.SEERR_ADMIN_NETWORK_BASELINE === 'true';
  if (!baseline) {
    const reset = await page
      .context()
      .request.post(`${baseURL}/api/v1/settings/network`, {
        data: {
          restrictAdministratorSignInToNetworks: false,
          administratorSignInAllowedNetworks: '',
        },
      });
    expect(reset.status()).toBe(200);
  }
  await page.goto('/settings/network');
  const toggle = page.getByLabel(
    'Restrict Administrator Sign-In to Trusted Networks',
    { exact: true }
  );
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page
      .getByRole('button', {
        name: 'Trust Reverse Proxy Restart Required',
        exact: true,
      })
      .scrollIntoViewIfNeeded();
    await page.screenshot({
      path: info.outputPath(
        `network-${baseline ? 'baseline' : 'candidate'}-${width}.png`
      ),
      animations: 'disabled',
      fullPage: true,
    });
  }
  if (baseline) {
    await expect(toggle).toHaveCount(0);
    return;
  }
  await toggle.click();
  const networks = page.getByLabel('Allowed Administrator Networks', {
    exact: true,
  });
  await expect(networks).toBeVisible();
  await networks.fill('127.0.0.0/8\n::1');
  const save = page.getByRole('button', { name: 'Save', exact: true });
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await networks.scrollIntoViewIfNeeded();
    const box = await networks.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);
    await page.screenshot({
      path: info.outputPath(`network-enabled-${width}.png`),
      animations: 'disabled',
      fullPage: true,
    });
  }
  const refreshed = page.waitForResponse(
    (r) =>
      r.url().endsWith('/api/v1/settings/network') &&
      r.request().method() === 'GET'
  );
  const saved = page.waitForResponse(
    (r) =>
      r.url().endsWith('/api/v1/settings/network') &&
      r.request().method() === 'POST'
  );
  await save.click();
  expect((await saved).status()).toBe(200);
  await (await refreshed).finished();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await networks.fill('192.0.2.0/24');
  const rejected = page.waitForResponse(
    (r) =>
      r.url().endsWith('/api/v1/settings/network') &&
      r.request().method() === 'POST'
  );
  await save.click();
  expect((await rejected).status()).toBe(400);
  await expect(
    page.getByText(
      'The current client IP must be included in the allowed networks before enabling or changing this restriction.',
      { exact: true }
    )
  ).toBeVisible();
  // Keep the disposable fixture available to other browser checks.
  await toggle.click();
  const disabled = page.waitForResponse(
    (r) =>
      r.url().endsWith('/api/v1/settings/network') &&
      r.request().method() === 'POST'
  );
  await save.click();
  expect((await disabled).status()).toBe(200);
});
