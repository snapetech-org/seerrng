import { expect, test } from '@playwright/test';

test('series and album details reach their curated collections', async ({
  page,
}, info) => {
  const album = '62a8e15d-a5f1-4213-a794-e10e0150e945';
  const seriesReads: string[] = [];
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname.slice(7);
    const entries: Record<string, unknown> = {
      '/auth/me': { id: 1, permissions: 32 },
      '/settings/public': {
        musicEnabled: true,
        enabledMediaCategories: { music: true },
      },
      '/tv/42': { id: 42, name: 'Fixture Series', seasons: [], genres: [] },
      '/collection-catalog/tv/for-series/42': {
        collections: [{ id: 19, name: 'Fixture Series Collection' }],
      },
      '/collection-catalog/tv/19': {
        id: '19',
        name: 'Fixture Series Collection',
        parts: [
          { id: '42', title: 'Fixture Series', releaseDate: '2024-09-07' },
        ],
      },
      [`/music/${album}`]: {
        id: album,
        title: 'Fixture Album',
        artist: { id: 'artist-42', name: 'Fixture Artist' },
        tracks: [],
      },
      '/collection-catalog/music/artist-42': {
        id: 'artist-42',
        name: 'Fixture Discography',
        parts: [
          { id: album, title: 'Fixture Album', availableQualities: ['FLAC'] },
        ],
      },
    };
    if (path.startsWith('/collection-catalog/tv/for-series/'))
      seriesReads.push(path);
    return route.fulfill({ json: entries[path] ?? { results: [] } });
  });
  await page.goto('/tv/42');
  await expect(
    page.getByRole('heading', { name: 'Fixture Series' })
  ).toBeVisible();
  expect(seriesReads).toEqual([]);
  await page.getByText('Series Collections', { exact: true }).click();
  await page.getByRole('link', { name: 'Fixture Series Collection' }).click();
  await expect(
    page.getByRole('heading', { name: 'Fixture Series Collection' })
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Fixture Series', exact: true })
  ).toHaveAttribute('href', '/tv/42');
  await page.screenshot({ path: info.outputPath('series-collection.png') });
  await page.goto(`/music/${album}`);
  await page.getByRole('link', { name: 'View Discography' }).click();
  await expect(
    page.getByRole('heading', { name: 'Fixture Discography' })
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Back to Album' })
  ).toHaveAttribute('href', `/music/${album}`);
  await expect(page.getByText('FLAC', { exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath('discography.png') });
});
