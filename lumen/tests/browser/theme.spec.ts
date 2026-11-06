import { expect, test } from '@playwright/test';

// "Device" follows the system light/dark setting, live, and so does the browser's bar.
test('Device theme follows the system, page and browser bar', async ({
  page,
}) => {
  await page.route('https://**/*', (r) => r.abort());
  await page.route('**/lumen-config.json', (r) => r.fulfill({ json: {} }));
  await page.route('**/api/v1/**', (r) => {
    const p = new URL(r.request().url()).pathname.slice(7);
    if (p === '/settings/public')
      return r.fulfill({
        json: { mediaServerType: 2, enabledMediaCategories: {} },
      });
    if (p === '/auth/me')
      return r.fulfill({ json: { id: 1, displayName: 'fam', permissions: 2 } });
    return r.fulfill({ status: 404, json: {} });
  });
  await page.addInitScript(() =>
    localStorage.setItem('lumen-prefs:1', JSON.stringify({ theme: 'system' }))
  );
  const bg = () =>
    page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const bar = () =>
    page.evaluate(() =>
      document
        .querySelector('meta[name="theme-color"]')
        ?.getAttribute('content')
    );
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/me');
  await expect(page.getByRole('button', { name: 'Device' })).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  await expect.poll(bg).toBe('rgb(245, 246, 248)');
  await expect.poll(bar).toBe('#f5f6f8');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect.poll(bg).toBe('rgb(11, 13, 17)');
  await expect.poll(bar).toBe('#0b0d11');
  await page.getByRole('button', { name: 'Light' }).click();
  await expect.poll(bar).toBe('#f5f6f8');
});
