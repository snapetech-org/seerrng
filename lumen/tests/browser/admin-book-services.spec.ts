import { expect, test } from '@playwright/test';

for (const backend of ['readarr', 'bindery', 'bookorbit'] as const) {
  test(`book services save ${backend} with the correct request defaults`, async ({
    page,
  }, info) => {
    const writes: Record<string, unknown>[] = [];
    let services: unknown[] = [];
    const endpoint = '/api/v1/settings/readarr';
    const serviceName =
      backend === 'readarr'
        ? 'Home Chaptarr'
        : backend === 'bindery'
          ? 'Home Bindery'
          : 'Home BookOrbit';
    await page.route('https://**/*', (route) => route.abort());
    await page.route('**/lumen-config.json', (route) =>
      route.fulfill({ json: {} })
    );
    await page.route('**/api/v1/**', (route) => {
      const req = route.request();
      const path = new URL(req.url()).pathname;
      if (path.endsWith('/auth/me'))
        return route.fulfill({ json: { id: 1, permissions: 2 } });
      if (path !== endpoint && path !== endpoint + '/test')
        return route.fulfill({ json: {} });
      if (req.method() === 'GET') return route.fulfill({ json: services });
      const body = req.postDataJSON();
      writes.push(body);
      if (path.endsWith('/test'))
        return route.fulfill({
          json:
            backend === 'readarr'
              ? {
                  profiles: [{ id: 7, name: 'Standard' }],
                  metadataProfiles: [{ id: 8, name: 'Books' }],
                  rootFolders: [{ id: 3, path: '/books' }],
                  tags: [],
                }
              : { backend, system: { version: '1.0' } },
        });
      const result = { ...body, apiKey: '[REDACTED]', id: 0 };
      services = [result];
      return route.fulfill({ json: result });
    });
    await page.goto('/me');
    await page
      .getByRole('link', { name: 'Open Book and Audiobook Services' })
      .click();
    await page.getByRole('button', { name: 'Add Book and Audiobook' }).click();
    await page.getByRole('combobox', { name: 'Backend' }).selectOption(backend);
    await page
      .getByRole('combobox', { name: 'Book Format' })
      .selectOption(backend === 'readarr' ? 'audiobook' : 'both');
    await page.getByLabel('Service Name').fill(serviceName);
    await page.getByLabel('Hostname').fill(`${backend}.internal`);
    if (backend === 'bookorbit')
      await page.getByLabel('BookOrbit Username').fill('requester');
    await page
      .getByLabel(backend === 'bookorbit' ? 'BookOrbit Password' : 'API Key')
      .fill('fixture-key');
    await page.getByRole('button', { name: 'Test Book and Audiobook' }).click();
    await expect(
      page.getByText('Book and Audiobook connection verified.')
    ).toBeVisible();
    if (backend === 'readarr') {
      await page
        .getByRole('combobox', { name: 'Quality Profile' })
        .selectOption('7');
      await page
        .getByRole('combobox', { name: 'Root Folder' })
        .selectOption('/books');
      await page
        .getByRole('combobox', { name: 'Metadata Profile' })
        .selectOption('8');
    } else {
      await expect(
        page.getByRole('combobox', { name: 'Quality Profile' })
      ).toHaveCount(0);
    }
    if (backend === 'bindery')
      await page.getByLabel('Bindery User Mappings (JSON)').fill('{"23":42}');
    if (process.env.LUMEN_CAPTURE_BOOK_SERVICES) {
      await page.evaluate(() =>
        window.scrollTo({ top: 0, behavior: 'instant' })
      );
      await page.screenshot({
        path: info.outputPath(`${backend}.png`),
        fullPage: true,
      });
    }
    await page.getByRole('button', { name: 'Save Book and Audiobook' }).click();
    await expect(
      page.getByRole('button', { name: `Edit ${serviceName}` })
    ).toBeVisible();
    expect(writes[0]).toMatchObject({
      backend,
      serviceType: backend === 'readarr' ? 'audiobook' : 'both',
    });
    expect(writes[1]).toMatchObject({
      backend,
      activeProfileId: backend === 'readarr' ? 7 : 0,
      activeDirectory: backend === 'readarr' ? '/books' : '/',
      ...(backend === 'readarr'
        ? { activeMetadataProfileId: 8, activeMetadataProfileName: 'Books' }
        : backend === 'bindery'
          ? { binderyUserMappings: { '23': 42 } }
          : { bookorbitUsername: 'requester' }),
    });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth)
    ).toBeLessThanOrEqual(page.viewportSize()!.width);
  });
}
