import { expect, test, type Page } from '@playwright/test';

const base =
  process.env.PLAYWRIGHT_BASE_URL ??
  `http://127.0.0.1:${process.env.PORT ?? '5055'}`;
const artistId = 'fixture-artist-release-groups';
const albums = Array.from({ length: 21 }, (_, index) => ({
  id: `album-${String(index + 1).padStart(2, '0')}`,
  title: `Fixture Album ${index + 1}`,
  'primary-type': 'Album',
  'first-release-date': `${2025 - index}-01-01`,
  'artist-credit': [{ name: 'Fixture Artist' }],
}));
const special = [
  {
    id: 'live-release',
    title: 'Live Fixture',
    'primary-type': 'Album',
    secondary_types: ['Live'],
    'artist-credit': [{ name: 'Fixture Artist' }],
  },
  {
    id: 'compilation-release',
    title: 'Compilation Fixture',
    'primary-type': 'Album',
    secondary_types: ['Compilation'],
    'artist-credit': [{ name: 'Fixture Artist' }],
  },
];
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
    .find((h) => h.name.toLowerCase() === 'set-cookie')
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
  test(`native artist release groups ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.route('https://**/*', (route) => route.abort());
    await page.route('**/api/v1/**', (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === '/api/v1/settings/public') {
        return route.fulfill({
          json: { musicEnabled: true, enabledMediaCategories: { music: true } },
        });
      }
      if (url.pathname.startsWith(`/api/v1/artist/${artistId}`)) {
        if (url.pathname.endsWith('/similar')) return route.continue();
        const type = url.searchParams.get('albumType');
        const releaseGroups =
          type === 'Album' ? albums : [...albums.slice(0, 20), ...special];
        return route.fulfill({
          json: {
            artist: {
              id: artistId,
              name: 'Fixture Artist',
              type: 'Person',
              area: 'Fixture City',
              beginYear: 1990,
            },
            wikipedia: {
              title: 'Fixture Artist',
              url: 'https://en.wikipedia.org/wiki/Fixture_Artist',
              content: 'A fixture biography for the artist detail page.',
            },
            releaseGroups,
            typeCounts: { Album: 21, Live: 1, Compilation: 1 },
          },
        });
      }
      return route.continue();
    });
    await login(page);
    await page.goto(`/artist/${artistId}`);
    await expect(
      page.getByRole('heading', { name: 'Fixture Artist' })
    ).toBeVisible();
    await expect(
      page
        .locator('.page-heading')
        .filter({ hasText: 'Album' })
        .filter({ hasText: '(21)' })
    ).toBeVisible();
    await expect(
      page
        .locator('.page-heading')
        .filter({ hasText: 'Live' })
        .filter({ hasText: '(1)' })
    ).toBeVisible();
    await expect(
      page
        .locator('.page-heading')
        .filter({ hasText: 'Compilation' })
        .filter({ hasText: '(1)' })
    ).toBeVisible();
    await expect(
      page.getByText('A fixture biography for the artist detail page.', {
        exact: true,
      })
    ).toBeVisible();
    const capture = process.env.SEERRNG_ARTIST_GROUP_CAPTURE;
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
