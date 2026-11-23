import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

test.use({ serviceWorkers: 'block' });

const base = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:55117';
const artwork =
  'https://coverartarchive.org/release-group/11111111-1111-4111-8111-111111111111/front-250';
const album = {
  id: '11111111-1111-4111-8111-111111111111',
  mediaType: 'album',
  title: 'Fixture Album: Blue Hours',
  'primary-type': 'Album',
  'first-release-date': '2024-05-03',
  'artist-credit': [
    {
      name: 'Fixture Artist',
      artist: {
        id: '22222222-2222-4222-8222-222222222222',
        name: 'Fixture Artist',
        'sort-name': 'Fixture Artist',
      },
    },
  ],
  score: 100,
  posterPath: artwork,
};

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

async function fixture(
  page: Page,
  viewport: { width: number; height: number }
) {
  await page.setViewportSize(viewport);
  await page.route('https://**/*', (route) => route.abort());
  await page.route('https://coverartarchive.org/**', (route) =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="250" height="250"><rect width="250" height="250" fill="#30405c"/><circle cx="125" cy="125" r="76" fill="#d59a62"/></svg>',
    })
  );
  await page.route('**/imageproxy/**', (route) =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="250" height="250"><rect width="250" height="250" fill="#30405c"/><circle cx="125" cy="125" r="76" fill="#d59a62"/></svg>',
    })
  );
  await page.route('**/api/v1/settings/public', async (route) => {
    const response = await route.fetch();
    const settings = await response.json();
    await route.fulfill({
      response,
      json: {
        ...settings,
        musicEnabled: true,
        enabledMediaCategories: {
          ...settings.enabledMediaCategories,
          music: true,
        },
      },
    });
  });
  await page.route('**/api/v1/user/1/settings/main', async (route) => {
    const response = await route.fetch();
    const settings = await response.json();
    await route.fulfill({
      response,
      json: {
        ...settings,
        locale: 'en',
        enabledMediaCategories: {
          ...settings.enabledMediaCategories,
          music: true,
        },
      },
    });
  });
  await page.route('**/api/v1/discover/music**', (route) =>
    route.fulfill({
      json: {
        page: 1,
        totalPages: 1,
        totalResults: 1,
        results: [album],
      },
    })
  );
  await page.route('**/api/v1/service/lidarr', (route) =>
    route.fulfill({ json: [] })
  );
}

for (const viewport of [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'phone', width: 390, height: 844 },
]) {
  test(`native and Lumen Music discovery render the same populated fixture at ${viewport.name}`, async ({
    page,
  }, info) => {
    const captureDir =
      process.env.MUSIC_VISUAL_DIR ?? info.outputPath('music-visual');
    mkdirSync(captureDir, { recursive: true });
    await fixture(page, viewport);
    await loginAsAdmin(page);

    await page.goto('/discover/music');
    await expect(
      page.getByText(album.title, { exact: true }).first()
    ).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth)
    ).toBeLessThanOrEqual(viewport.width);
    await page.screenshot({
      path: `${captureDir}/native-${viewport.name}.png`,
      fullPage: true,
      animations: 'disabled',
    });

    await page.goto('/lumen/music');
    await expect(
      page.getByText(album.title, { exact: true }).first()
    ).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth)
    ).toBeLessThanOrEqual(viewport.width);
    await page.screenshot({
      path: `${captureDir}/lumen-candidate-${viewport.name}.png`,
      fullPage: true,
      animations: 'disabled',
    });
    const filterPanel = page.locator('details.more-filters');
    await expect(filterPanel).toHaveJSProperty('open', false);
    await filterPanel.locator('summary').click();
    await expect(
      page.getByRole('form', { name: 'Music Discovery Filters' })
    ).toBeVisible();
    await page.screenshot({
      path: `${captureDir}/lumen-candidate-expanded-${viewport.name}.png`,
      fullPage: true,
      animations: 'disabled',
    });
  });
}
