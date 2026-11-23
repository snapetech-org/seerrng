import { expect, test, type Page } from '@playwright/test';

const base = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:55117';

async function loginAsAdmin(page: Page) {
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
  test(`bundled Lumen music artist list works at ${viewport.name}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.route('https://**/*', (route) => route.abort());
    await page.route('**/imageproxy/**', (route) =>
      route.fulfill({
        contentType: 'image/svg+xml',
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="250" height="250"><rect width="250" height="250" fill="#30405c"/></svg>',
      })
    );
    await page.route('**/api/v1/**', (route) => {
      const path = new URL(route.request().url()).pathname
        .replace(/^\/lumen(?=\/)/, '')
        .replace(/^\/api\/v1/, '');
      if (path === '/auth/me')
        return route.fulfill({
          json: { id: 1, permissions: 0, settings: { locale: 'en' } },
        });
      if (path === '/settings/public')
        return route.fulfill({
          json: {
            initialized: true,
            musicEnabled: true,
            enabledMediaCategories: { music: true },
          },
        });
      if (path === '/user/1/settings/main')
        return route.fulfill({
          json: { locale: 'en', enabledMediaCategories: { music: true } },
        });
      if (path === '/user/1/quota') return route.fulfill({ json: {} });
      if (path === '/music/42')
        return route.fulfill({
          json: {
            id: '42',
            title: 'Fixture Album',
            artist: { id: 'fixture-artist', name: 'Fixture Artist' },
            tracks: [
              {
                position: 1,
                name: 'Opening Track',
                length: 182000,
                artists: [
                  { mbid: 'fixture-artist', name: 'Fixture Artist' },
                  {
                    mbid: 'fixture-featured-artist',
                    name: 'Featured Artist',
                  },
                ],
              },
              {
                position: 2,
                name: 'Closing Track',
                length: 201000,
                artists: [
                  {
                    mbid: 'fixture-featured-artist',
                    name: 'Featured Artist',
                  },
                ],
              },
            ],
          },
        });
      if (path === '/follow') return route.fulfill({ json: { results: [] } });
      if (path.startsWith('/blocklist/'))
        return route.fulfill({
          status: 404,
          json: { message: 'Not blocklisted' },
        });
      return route.fulfill({ json: { results: [] } });
    });

    await loginAsAdmin(page);
    await page.goto('/lumen/music/42');
    await expect(
      page.getByRole('heading', { name: 'Fixture Album' })
    ).toBeVisible();
    const list = page.getByTestId('music-artist-list');
    await expect(list).toHaveJSProperty('open', false);
    await list.locator('summary').click();
    const featured = list.getByRole('link', {
      name: 'Featured Artist · Track Artist',
    });
    await expect(featured).toHaveAttribute(
      'href',
      '/lumen/artist/fixture-featured-artist'
    );
    await expect(
      list.locator('a[href="/lumen/artist/fixture-featured-artist"]')
    ).toHaveCount(1);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth)
    ).toBeLessThanOrEqual(viewport.width);
  });
}
