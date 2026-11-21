import { expect, test } from '@playwright/test';

test('a saved connection host can populate a service form', async ({
  page,
}, info) => {
  const path = '/api/v1/settings/connection-hosts';
  let hosts: unknown[] = [];
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', (route) => {
    const request = route.request();
    const url = new URL(request.url()).pathname;
    if (url.endsWith('/auth/me'))
      return route.fulfill({ json: { id: 1, permissions: 2 } });
    if (url === path) {
      if (request.method() === 'PUT') hosts = request.postDataJSON().hosts;
      return route.fulfill({ json: hosts });
    }
    if (url.endsWith('/settings/kavita'))
      return route.fulfill({ body: 'null', contentType: 'application/json' });
    if (
      url.endsWith('/settings/readmeabook') ||
      url.endsWith('/settings/prowlarr')
    )
      return route.fulfill({
        json: {
          hostname: '',
          port: 3030,
          baseUrl: '',
          useSsl: false,
          apiKeyConfigured: false,
        },
      });
    return route.fulfill({ json: url.endsWith('/settings/radarr') ? [] : {} });
  });
  await page.goto('/me');
  await page.getByRole('link', { name: 'Open Connection Hosts' }).click();
  await page.getByRole('button', { name: 'Add Host' }).click();
  await page.getByLabel('Name', { exact: true }).fill('Media Host');
  await page.getByLabel('Hostname', { exact: true }).fill('media.internal');
  await page.getByRole('button', { name: 'Save Changes' }).click();
  await expect(page.getByText('Connection hosts saved.')).toBeVisible();
  await page.screenshot({ path: info.outputPath('hosts.png'), fullPage: true });
  await page.getByRole('link', { name: 'Administration', exact: true }).click();
  await page.getByRole('link', { name: 'Open Radarr Services' }).click();
  await page.getByRole('button', { name: 'Add Radarr' }).click();
  await page
    .getByRole('combobox', { name: 'Saved Connection Host' })
    .selectOption('media.internal');
  await expect(page.getByLabel('Hostname', { exact: true })).toHaveValue(
    'media.internal'
  );
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.screenshot({
    path: info.outputPath('picker.png'),
    fullPage: true,
  });
  for (const [route, label] of [
    ['kavita', 'Hostname'],
    ['prowlarr', 'Hostname'],
    ['readmeabook', 'Hostname or IP Address'],
  ]) {
    await page.goto(`/admin/${route}`);
    await page
      .getByRole('combobox', { name: 'Saved Connection Host' })
      .selectOption('media.internal');
    await expect(page.getByLabel(label, { exact: true })).toHaveValue(
      'media.internal'
    );
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.screenshot({
      path: info.outputPath(`${route}-picker.png`),
      fullPage: true,
    });
  }
});
