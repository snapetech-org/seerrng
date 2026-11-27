import { expect, test } from '@playwright/test';
import { testAppPath } from './testAppPath';

test('Sonarr saves separate series and anime request defaults', async ({
  page,
}, info) => {
  const writes: Record<string, unknown>[] = [];
  let services: Record<string, unknown>[] = [];
  const path = '/api/v1/settings/sonarr';
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', (route) => {
    const request = route.request();
    const endpoint = new URL(request.url()).pathname;
    if (endpoint.endsWith('/auth/me'))
      return route.fulfill({ json: { id: 1, permissions: 2 } });
    if (!endpoint.startsWith(path)) return route.fulfill({ json: {} });
    if (request.method() === 'GET') return route.fulfill({ json: services });
    const body = request.postDataJSON();
    writes.push(body);
    if (endpoint.endsWith('/test'))
      return route.fulfill({
        json: {
          profiles: [
            { id: 2, name: 'Series HD' },
            { id: 3, name: 'Anime HD' },
          ],
          rootFolders: [
            { id: 1, path: '/series' },
            { id: 2, path: '/anime' },
          ],
          metadataLanguages: [{ id: 4, name: 'Japanese' }],
          languageProfiles: null,
          tags: [{ id: 5, label: 'anime' }],
        },
      });
    const result = { ...body, id: 0, apiKey: '[REDACTED]' };
    services = [result];
    return route.fulfill({ json: result });
  });
  await page.goto(testAppPath('/me'));
  await page.getByRole('link', { name: 'Open Sonarr Services' }).click();
  await page.getByRole('button', { name: 'Add Sonarr' }).click();
  await expect(page.getByLabel('Port', { exact: true })).toHaveValue('8989');
  await page.getByLabel('Service Name').fill('Home Sonarr');
  await page.getByLabel('Hostname').fill('sonarr.internal');
  await page.getByLabel('API Key').fill('fixture-key');
  await page.getByRole('button', { name: 'Test Sonarr' }).click();
  await page
    .getByRole('combobox', { name: 'Quality Profile', exact: true })
    .selectOption('2');
  await page
    .getByRole('combobox', { name: 'Root Folder', exact: true })
    .selectOption('/series');
  await page.getByLabel('Anime Quality Profile').selectOption('3');
  await page.getByLabel('Anime Root Folder').selectOption('/anime');
  await page
    .getByRole('combobox', { name: 'Metadata Language', exact: true })
    .selectOption('4');
  await page.getByLabel('Monitor New Items').selectOption('latest');
  await page.getByLabel('Enable Season Folders').check();
  await page.getByText('Anime Request Tags', { exact: true }).click();
  await page
    .locator('details')
    .filter({ has: page.getByText('Anime Request Tags', { exact: true }) })
    .getByRole('checkbox', { name: 'anime', exact: true })
    .check();
  await expect(page.getByLabel('Anime Language Profile')).toHaveCount(0);
  if (process.env.LUMEN_CAPTURE_SONARR) {
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.screenshot({
      path: info.outputPath('sonarr.png'),
      fullPage: true,
    });
  }
  await page.getByRole('button', { name: 'Save Sonarr' }).click();
  await expect(
    page.getByRole('button', { name: 'Edit Home Sonarr' })
  ).toBeVisible();
  expect(writes).toEqual([
    expect.objectContaining({
      hostname: 'sonarr.internal',
      port: 8989,
      apiKey: 'fixture-key',
    }),
    expect.objectContaining({
      activeProfileId: 2,
      activeProfileName: 'Series HD',
      activeDirectory: '/series',
      activeAnimeProfileId: 3,
      activeAnimeProfileName: 'Anime HD',
      activeAnimeDirectory: '/anime',
      seriesType: 'standard',
      animeSeriesType: 'anime',
      monitorNewItems: 'latest',
      enableSeasonFolders: true,
      defaultMetadataLanguageId: 4,
      animeTags: [5],
    }),
  ]);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth)
  ).toBeLessThanOrEqual(page.viewportSize()!.width);
});
