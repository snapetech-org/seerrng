import { expect, test } from '@playwright/test';

test('metadata sections save independently and expose failed provider checks', async ({
  page,
}, info) => {
  const writes: { path: string; body: unknown }[] = [];
  const base = '/settings/metadatas';
  const music = { maxConcurrentRequests: 2, maxRequestsPerSecond: 10 };
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.slice(7);
    if (path === '/auth/me')
      return route.fulfill({ json: { id: 1, permissions: 2 } });
    if (!path.startsWith(base)) return route.fulfill({ json: {} });
    if (request.method() === 'GET') {
      return route.fulfill({
        json:
          path === base
            ? { tv: 'tmdb', anime: 'tmdb' }
            : path.endsWith('/music')
              ? music
              : { allowedLanguages: [] },
      });
    }
    const body = request.postDataJSON();
    writes.push({ path, body });
    if (path.endsWith('/test')) {
      return route.fulfill({
        status: 500,
        json: { success: false, tests: { tmdb: 'ok', tvdb: 'failed' } },
      });
    }
    return route.fulfill({ json: { success: true, ...body } });
  });
  await page.goto('/me');
  await page.getByRole('link', { name: 'Open Metadata Providers' }).click();
  const languages = page.getByLabel('Allowed Book Languages');
  const requests = page.getByLabel('Maximum Requests per Second');
  await languages.fill('english');
  await expect(
    page.getByRole('button', { name: 'Save Book Language Restrictions' })
  ).toBeDisabled();
  await requests.fill('25');
  await page.getByRole('button', { name: 'Save Music Metadata' }).click();
  await expect(requests).toHaveValue('25');
  await expect(languages).toHaveValue('english');
  await languages.fill('ENG, fre');
  await page
    .getByRole('button', { name: 'Save Book Language Restrictions' })
    .click();
  await expect(languages).toHaveValue('eng, fre');

  await page.getByLabel('Anime Metadata Provider').selectOption('tvdb');
  await page
    .getByRole('button', { name: 'Test TV and Anime Providers' })
    .click();
  await expect(page.getByText('Connected', { exact: true })).toBeVisible();
  await expect(page.getByText('Failed', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Save TV and Anime' }).click();
  await expect(
    page.getByRole('button', { name: 'Save TV and Anime' })
  ).toBeDisabled();
  expect(writes).toEqual([
    { path: base + '/music', body: { ...music, maxRequestsPerSecond: 25 } },
    { path: base + '/books', body: { allowedLanguages: ['eng', 'fre'] } },
    { path: base + '/test', body: { tmdb: true, tvdb: true } },
    { path: base, body: { tv: 'tmdb', anime: 'tvdb' } },
  ]);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth)
  ).toBeLessThanOrEqual(page.viewportSize()!.width);
  if (process.env.LUMEN_CAPTURE_METADATA) {
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.screenshot({
      path: info.outputPath('metadata.png'),
      fullPage: true,
    });
  }
});
