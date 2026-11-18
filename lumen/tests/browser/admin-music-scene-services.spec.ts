import { expect, test } from '@playwright/test';

for (const [provider, name, port] of [
  ['lidarr', 'Lidarr', 8686],
  ['whisparr', 'Whisparr', 6969],
] as const) {
  test(`${name} saves its supported request destination settings`, async ({
    page,
  }, info) => {
    const payloads: unknown[] = [];
    let services: unknown[] = [];
    const endpoint = '/api/v1/settings/' + provider;
    await page.route('https://**/*', (route) => route.abort());
    await page.route('**/lumen-config.json', (route) =>
      route.fulfill({ json: {} })
    );
    await page.route('**/api/v1/**', (route) => {
      const req = route.request();
      const path = new URL(req.url()).pathname;
      if (path.endsWith('/auth/me'))
        return route.fulfill({ json: { id: 1, permissions: 2 } });
      if (path === endpoint + '/test')
        return route.fulfill({
          json: {
            profiles: [{ id: 7, name: 'Standard' }],
            metadataProfiles:
              provider === 'lidarr' ? [{ id: 2, name: 'Albums' }] : undefined,
            rootFolders: [{ id: 3, path: '/catalog' }],
            tags: [],
          },
        });
      if (path !== endpoint) return route.fulfill({ json: {} });
      if (req.method() === 'GET') return route.fulfill({ json: services });
      const body = req.postDataJSON();
      payloads.push(body);
      const result = { ...body, apiKey: '[REDACTED]', id: 0 };
      services = [result];
      return route.fulfill({ json: result });
    });
    await page.goto('/me');
    await page.getByRole('link', { name: `Open ${name} Services` }).click();
    await page.getByRole('button', { name: `Add ${name}` }).click();
    await expect(page.getByLabel('Port', { exact: true })).toHaveValue(
      String(port)
    );
    await page.getByLabel('Service Name').fill(`Home ${name}`);
    await page.getByLabel('Hostname').fill(`${provider}.internal`);
    await page.getByLabel('API Key').fill('fixture-key');
    await page.getByRole('button', { name: `Test ${name}` }).click();
    await page
      .getByRole('combobox', { name: 'Quality Profile' })
      .selectOption('7');
    await page
      .getByRole('combobox', { name: 'Root Folder' })
      .selectOption('/catalog');
    const save = page.getByRole('button', { name: `Save ${name}` });
    if (provider === 'lidarr') {
      await expect(save).toBeDisabled();
      await page
        .getByRole('combobox', { name: 'Metadata Profile' })
        .selectOption('2');
    }
    await expect(page.getByLabel('4K Server')).toHaveCount(0);
    if (process.env.LUMEN_CAPTURE_SERVARR) {
      await page.evaluate(() =>
        window.scrollTo({ top: 0, behavior: 'instant' })
      );
      await page.screenshot({
        path: info.outputPath(`${provider}.png`),
        fullPage: true,
      });
    }
    await save.click();
    await expect(
      page.getByRole('button', { name: `Edit Home ${name}` })
    ).toBeVisible();
    expect(payloads).toEqual([
      expect.objectContaining({
        name: `Home ${name}`,
        port,
        is4k: false,
        activeProfileId: 7,
        activeProfileName: 'Standard',
        activeDirectory: '/catalog',
        ...(provider === 'lidarr'
          ? { activeMetadataProfileId: 2, activeMetadataProfileName: 'Albums' }
          : { isDefault: true }),
      }),
    ]);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth)
    ).toBeLessThanOrEqual(page.viewportSize()!.width);
  });
}
