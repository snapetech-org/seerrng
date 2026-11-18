import { expect, test, type Page } from '@playwright/test';

async function fixtures(page: Page, permissions = 2, overrides: string[] = []) {
  const patches: unknown[] = [];
  let failed = false;
  const settings = {
    apiRequestTimeout: 10000,
    dnsCache: { enabled: true, forceMinTtl: 0, forceMaxTtl: -1 },
    proxy: { enabled: false, password: '[REDACTED]' },
    tls: {
      mode: 'disabled',
      httpsPort: 5056,
      allowHttpAuth: true,
      httpAuthAcknowledged: true,
    },
  };
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.slice(7);
    if (path === '/auth/me')
      return route.fulfill({
        json: { id: 1, permissions, displayName: 'User' },
      });
    if (path === '/status/tls')
      return route.fulfill({ json: { environmentOverrides: overrides } });
    if (path !== '/settings/network') return route.fulfill({ json: {} });
    if (request.method() === 'GET') return route.fulfill({ json: settings });
    const patch = request.postDataJSON();
    patches.push(patch);
    if (!failed) {
      failed = true;
      return route.fulfill({
        status: 400,
        json: { message: 'Check the network settings.' },
      });
    }
    return route.fulfill({
      json: {
        ...settings,
        ...patch,
        dnsCache: { ...settings.dnsCache, ...patch.dnsCache },
        tls: { ...settings.tls, ...patch.tls },
      },
    });
  });
  return patches;
}

test('network settings send only edited values and recover from a rejected save', async ({
  page,
}) => {
  const patches = await fixtures(page);
  await page.goto('/me');
  await page.getByRole('link', { name: 'Open Network Settings' }).click();
  await expect(
    page.getByRole('heading', { name: 'Network Settings' })
  ).toBeVisible();
  await expect(page.getByLabel('New Proxy Password')).toHaveValue('');
  await page.getByLabel('API Request Timeout (seconds)').fill('3.125');
  await page.getByLabel('Minimum TTL (seconds)').fill('60');
  await page.getByLabel('Built-in HTTPS').selectOption('self-signed');
  await expect(page.getByLabel('Allow Sign-In over HTTP')).not.toBeChecked();
  await expect(page.getByLabel('Allow Sign-In over HTTP')).toBeDisabled();

  const save = page.getByRole('button', { name: 'Save Network Settings' });
  await save.click();
  await expect(page.getByText('Check the network settings.')).toBeVisible();
  await expect(page.getByLabel('Minimum TTL (seconds)')).toHaveValue('60');
  await save.click();
  await expect(page.getByText(/Network settings saved/)).toBeVisible();
  await expect(save).toBeDisabled();
  expect(patches).toEqual(
    Array.from({ length: 2 }, () => ({
      apiRequestTimeout: 3125,
      dnsCache: { forceMinTtl: 60 },
      tls: {
        mode: 'self-signed',
        allowHttpAuth: false,
        httpAuthAcknowledged: false,
      },
    }))
  );
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth)
  ).toBeLessThanOrEqual(page.viewportSize()!.width);
});

test('transport environment overrides prevent Lumen edits', async ({
  page,
}) => {
  await fixtures(page, 2, ['TLS_MODE']);
  await page.goto('/admin/network');
  await expect(
    page.getByText(
      /Environment variables override transport settings.*TLS_MODE/
    )
  ).toBeVisible();
  await expect(page.getByLabel('Built-in HTTPS')).toBeDisabled();
  await expect(page.getByLabel('Enable DNS Cache')).toBeEnabled();
});

test('non-administrators cannot open network settings', async ({ page }) => {
  await fixtures(page, 0);
  await page.goto('/admin/network');
  await expect(page).toHaveURL(/\/me$/);
  await expect(
    page.getByRole('link', { name: 'Open Network Settings' })
  ).toHaveCount(0);
});
