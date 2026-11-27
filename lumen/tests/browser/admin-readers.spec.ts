import { expect, test } from '@playwright/test';
import { testAppPath } from './testAppPath';

for (const name of ['Audiobookshelf', 'Kavita']) {
  test(`${name} tests and saves the reader connection`, async ({
    page,
  }, info) => {
    const provider = name.toLowerCase();
    const path = `/api/v1/settings/${provider}`;
    const audio = provider === 'audiobookshelf';
    let saved: Record<string, unknown> | null = null;
    let staleReadback: Record<string, unknown> | null | undefined;
    let reject = true;
    const writes: Record<string, unknown>[] = [];
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
      if (request.method() === 'GET') {
        if (staleReadback !== undefined) {
          const stale = staleReadback;
          staleReadback = undefined;
          return route.fulfill({ json: stale });
        }
        return route.fulfill({ json: saved });
      }
      const body = request.postDataJSON() as Record<string, unknown>;
      writes.push(body);
      if (reject) {
        reject = false;
        return route.fulfill({
          status: 503,
          json: { message: `${name} settings unavailable.` },
        });
      }
      const previous = saved;
      saved = { ...body, apiKey: '[REDACTED]' };
      if (writes.length === 2) staleReadback = previous;
      return route.fulfill({ json: saved });
    });
    await page.goto(testAppPath('/me'));
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
    const save = page.getByRole('button', { name: 'Save Changes' });
    await save.click();
    await expect(page.getByRole('alert')).toHaveText(
      `${name} settings unavailable.`
    );
    await expect(page.getByLabel('Hostname')).toHaveValue('reader.internal');
    await page.screenshot({
      path: info.outputPath(`${provider}-write-failure.png`),
      fullPage: true,
    });
    await save.click();
    await expect(page.getByRole('alert')).toContainText(
      'Could not complete the'
    );
    await expect(page.getByLabel('Hostname')).toHaveValue('reader.internal');
    await page.screenshot({
      path: info.outputPath(`${provider}-readback-failure.png`),
      fullPage: true,
    });
    await save.scrollIntoViewIfNeeded();
    if (page.viewportSize()!.width < 1040) {
      const saveBox = await save.boundingBox();
      const tabsBox = await page.locator('.tabbar').boundingBox();
      expect(saveBox).not.toBeNull();
      expect(tabsBox).not.toBeNull();
      expect(saveBox!.y + saveBox!.height + 8).toBeLessThan(tabsBox!.y);
      await page.screenshot({
        path: info.outputPath(`${provider}-readback-failure-viewport.png`),
      });
    }
    await save.click();
    await expect(page.getByText(`${name} settings saved.`)).toBeVisible();
    await page.screenshot({
      path: info.outputPath(`${provider}-readback-recovered.png`),
      fullPage: true,
    });
    expect(writes).toHaveLength(3);
    expect(writes[2]).toMatchObject({
      hostname: 'reader.internal',
      port: audio ? 13378 : 5000,
    });
    if (audio)
      expect(writes[2]).toMatchObject({
        libraryId: 'books',
        libraryName: 'Audiobooks',
        syncEnabled: true,
      });
  });
}
