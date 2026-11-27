import { expect, test, type Page } from '@playwright/test';

const base =
  process.env.PLAYWRIGHT_BASE_URL ??
  `http://127.0.0.1:${process.env.PORT ?? '5055'}`;
const albumId = '397b4ce9-89a1-41f8-9599-68983ee4a767';
const artistId = '934ebb1e-9e64-4a2d-abc2-8aea39d7b50c';

async function login(page: Page) {
  const response = await page
    .context()
    .request.post(`${base}/api/v1/auth/local`, {
      data: { email: 'admin@seerr.dev', password: 'test1234' },
      headers: { 'X-Forwarded-Proto': 'https' },
    });
  expect(response.status()).toBe(200);
  const sid = response
    .headersArray()
    .find((header) => header.name.toLowerCase() === 'set-cookie')
    ?.value.match(/^connect\.sid=([^;]+)/)?.[1];
  expect(sid).toBeTruthy();
  await page.context().addCookies([
    {
      name: 'connect.sid',
      value: sid!,
      url: base,
      httpOnly: true,
      secure: false,
      sameSite: 'Lax',
    },
  ]);
}

for (const viewport of [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'phone', width: 390, height: 844 },
]) {
  test(`native album contributing artists ${viewport.name}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.route('https://**/*', (route) => route.abort());
    await page.route('**/api/v1/settings/public', (route) =>
      route.fulfill({
        json: { musicEnabled: true, enabledMediaCategories: { music: true } },
      })
    );
    await page.route('**/api/v1/service/music', (route) =>
      route.fulfill({ json: [] })
    );
    await page.route(`**/api/v1/music/${albumId}`, (route) =>
      route.fulfill({
        json: {
          id: albumId,
          mbId: albumId,
          title: 'Fixture Album',
          artist: {
            id: artistId,
            name: 'Fixture Artist',
            area: 'Fixture City',
          },
          releaseDate: '2024-02-03',
          recordLabel: 'Fixture Records',
          type: 'Album',
          'artist-credit': [
            { name: 'Fixture Artist', artist: { id: artistId } },
          ],
          tracks: [
            {
              position: 1,
              name: 'Fixture Track',
              length: 180000,
              recordingMbid: 'fixture-recording-1',
              artists: [
                { mbid: artistId, name: 'Fixture Artist' },
                {
                  mbid: 'fixture-featured-artist',
                  name: 'Featured Artist',
                },
              ],
            },
          ],
        },
      })
    );
    await page.route(`**/api/v1/artist/${artistId}/similar`, (route) =>
      route.fulfill({ json: { results: [] } })
    );
    await page.route(`**/api/v1/music/${albumId}/artist-similar`, (route) =>
      route.fulfill({ json: { results: [] } })
    );
    await page.route(`**/api/v1/music/${albumId}/rating`, (route) =>
      route.fulfill({ json: { ratings: [], failedSources: [] } })
    );
    await login(page);
    await page.goto(`/music/${albumId}`);
    await expect(
      page.getByRole('heading', { name: 'Fixture Album' })
    ).toBeVisible();
    await page.getByRole('button', { name: 'Artists', exact: true }).click();
    await expect(
      page.getByText('Full Artist List', { exact: true })
    ).toBeVisible();
    const artistList = page.locator('section').filter({
      has: page.getByText('Full Artist List', { exact: true }),
    });
    const albumArtist = artistList.locator(`a[href="/artist/${artistId}"]`);
    const trackArtist = artistList.locator(
      'a[href="/artist/fixture-featured-artist"]'
    );
    await expect(albumArtist).toBeVisible();
    await expect(albumArtist).toContainText('Fixture Artist');
    await expect(albumArtist).toContainText('Album Artist');
    await expect(trackArtist).toBeVisible();
    await expect(trackArtist).toContainText('Featured Artist');
    await expect(trackArtist).toContainText('Track Artist');
    const capture = process.env.SEERRNG_MUSIC_ARTISTS_PARITY_CAPTURE;
    if (capture) {
      await page.screenshot({
        path: `${capture}-${viewport.name}.png`,
        fullPage: true,
      });
    }
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth)
    ).toBeLessThanOrEqual(viewport.width);
  });
}
