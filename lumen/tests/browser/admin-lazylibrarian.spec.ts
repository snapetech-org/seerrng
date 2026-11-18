import { expect, test } from '@playwright/test';

test('LazyLibrarian tests and saves magazine search and scan preferences', async ({
  page,
}, info) => {
  const endpoint = '/api/v1/settings/lazylibrarian';
  let saved: Record<string, unknown> | undefined;
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.endsWith('/auth/me'))
      return route.fulfill({ json: { id: 1, permissions: 2 } });
    if (path === endpoint + '/test')
      return route.fulfill({ json: { version: 'fixture' } });
    if (path !== endpoint) return route.fulfill({ json: {} });
    if (request.method() === 'GET')
      return route.fulfill({ json: saved ? [saved] : [] });
    saved = { ...request.postDataJSON(), id: 0, apiKey: '[REDACTED]' };
    return route.fulfill({ json: saved });
  });
  await page.goto('/me');
  await page.getByRole('link', { name: 'Open LazyLibrarian Services' }).click();
  await page.getByRole('button', { name: 'Add LazyLibrarian' }).click();
  await expect(page.getByLabel('Port')).toHaveValue('5299');
  await page.getByLabel('Service Name').fill('Magazines');
  await page.getByLabel('Hostname').fill('library.internal');
  await page.getByLabel('API Key').fill('fixture-key');
  await page.getByLabel('Enable Library Scan').check();
  await page.getByLabel('Search on Approval').uncheck();
  await page.getByRole('button', { name: 'Test LazyLibrarian' }).click();
  await expect(
    page.getByText('LazyLibrarian connection verified.')
  ).toBeVisible();
  await expect(page.getByLabel('Quality Profile')).toHaveCount(0);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.screenshot({
    path: info.outputPath('lazylibrarian.png'),
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Save LazyLibrarian' }).click();
  await page.getByRole('button', { name: 'Edit Magazines' }).click();
  await expect(page.getByLabel('Enable Library Scan')).toBeChecked();
  await expect(page.getByLabel('Search on Approval')).not.toBeChecked();
  expect(saved).toMatchObject({
    hostname: 'library.internal',
    syncEnabled: true,
    preventSearch: true,
  });
  expect(saved).not.toHaveProperty('activeProfileId');
});
