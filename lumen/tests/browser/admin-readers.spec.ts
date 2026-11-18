import { expect, test } from '@playwright/test';

for (const name of ['Audiobookshelf', 'Kavita']) {
  test(`${name} tests and saves the reader connection`, async ({
    page,
  }, info) => {
    const provider = name.toLowerCase();
    const path = `/api/v1/settings/${provider}`;
    const audio = provider === 'audiobookshelf';
    let saved: Record<string, unknown> | undefined;
    await page.route('https://**/*', (route) => route.abort());
    await page.route('**/lumen-config.json', (route) =>
      route.fulfill({ json: {} })
    );
    await page.route('**/api/v1/**', (route) => {
      const request = route.request();
      const url = new URL(request.url()).pathname;
      if (url.endsWith('/auth/me'))
        return route.fulfill({ json: { id: 1, permissions: 2 } });
      if (url === path + '/test')
        return route.fulfill({
          json: {
            libraries: [
              {
                id: audio ? 'books' : 9,
                name: audio ? 'Audiobooks' : 'Comics',
              },
            ],
          },
        });
      if (url !== path) return route.fulfill({ json: {} });
      if (request.method() === 'GET')
        return route.fulfill({ body: 'null', contentType: 'application/json' });
      saved = request.postDataJSON();
      return route.fulfill({ json: { ...saved, apiKey: '[REDACTED]' } });
    });
    await page.goto('/me');
    await page.getByRole('link', { name: `Open ${name} Settings` }).click();
    await page.getByLabel('Hostname').fill('reader.internal');
    await page.getByLabel('API Key').fill('fixture-key');
    await page.getByRole('button', { name: 'Test Connection' }).click();
    await expect(page.getByText(`${name} connection verified.`)).toBeVisible();
    if (audio)
      await page
        .getByRole('combobox', { name: 'Audiobook Library' })
        .selectOption('books');
    else await expect(page.getByText('Comics', { exact: true })).toBeVisible();
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.screenshot({
      path: info.outputPath(`${provider}.png`),
      fullPage: true,
    });
    await page.getByRole('button', { name: 'Save Changes' }).click();
    await expect(page.getByText(`${name} settings saved.`)).toBeVisible();
    expect(saved).toMatchObject({
      hostname: 'reader.internal',
      port: audio ? 13378 : 5000,
    });
    if (audio)
      expect(saved).toMatchObject({
        libraryId: 'books',
        libraryName: 'Audiobooks',
        syncEnabled: true,
      });
  });
}
