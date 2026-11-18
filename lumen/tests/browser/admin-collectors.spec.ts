import { expect, test } from '@playwright/test';

for (const [name, key, port] of [
  ['LazyLibrarian', 'lazylibrarian', '5299'],
  ['Mylar', 'mylar', '8090'],
  ['Kapowarr', 'kapowarr', '5656'],
  ['BackIssue', 'backissue', '8787'],
]) {
  test(`${name} tests and saves its service preferences`, async ({
    page,
  }, info) => {
    const endpoint = `/api/v1/settings/${key}`;
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
    await page.getByRole('link', { name: `Open ${name} Services` }).click();
    await page.getByRole('button', { name: `Add ${name}` }).click();
    await expect(page.getByLabel('Port')).toHaveValue(port);
    await page.getByLabel('Service Name').fill('Magazines');
    await page.getByLabel('Hostname').fill('library.internal');
    await page.getByLabel('API Key').fill('fixture-key');
    await page.getByLabel('Enable Library Scan').check();
    if (key !== 'backissue')
      await page.getByLabel('Search on Approval').uncheck();
    await page.getByRole('button', { name: `Test ${name}` }).click();
    await expect(page.getByText(`${name} connection verified.`)).toBeVisible();
    await expect(page.getByLabel('Quality Profile')).toHaveCount(0);
    if (key === 'kapowarr')
      await expect(
        page.getByRole('button', { name: `Save ${name}` })
      ).toBeDisabled();
    if (key === 'mylar' || key === 'kapowarr')
      await page.getByLabel('Root Folder').fill('/comics');
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.screenshot({
      path: info.outputPath(`${key}.png`),
      fullPage: true,
    });
    await page.getByRole('button', { name: `Save ${name}` }).click();
    await page.getByRole('button', { name: 'Edit Magazines' }).click();
    await expect(page.getByLabel('Enable Library Scan')).toBeChecked();
    if (key !== 'backissue')
      await expect(page.getByLabel('Search on Approval')).not.toBeChecked();
    if (key === 'mylar' || key === 'kapowarr')
      expect(saved).toHaveProperty('rootFolder', '/comics');
    expect(saved).toMatchObject({
      hostname: 'library.internal',
      syncEnabled: true,
      preventSearch: key !== 'backissue',
    });
    expect(saved).not.toHaveProperty('activeProfileId');
  });
}
