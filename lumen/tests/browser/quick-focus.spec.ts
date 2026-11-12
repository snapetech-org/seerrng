import { expect, test, type Page } from '@playwright/test';

// On desktop the poster's Request button lives in a hover/focus overlay. When the quick-request
// sheet closes (Escape or Cancel) keyboard focus has to come back to that button.
const movie = (id: number, title: string) => ({
  id,
  title,
  mediaType: 'movie',
  releaseDate: '2020-01-01',
  posterPath: `/p${id}.png`,
  voteAverage: 7,
});
const paged = (results: unknown[]) => ({
  page: 1,
  totalPages: 1,
  totalResults: results.length,
  results,
});

async function fixture(page: Page) {
  await page.route('https://**/*', (r) => r.abort());
  await page.route(/\/(imageproxy|branding)\//, (r) =>
    r.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#e05"/></svg>',
    })
  );
  await page.route('**/lumen-config.json', (r) => r.fulfill({ json: {} }));
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname.slice(7);
    let json: unknown = {};
    if (path === '/settings/public')
      json = { mediaServerType: 2, movie4kEnabled: true };
    else if (path === '/auth/me')
      json = { id: 1, displayName: 'fam', permissions: 32 | 1024 };
    else if (path === '/discover/movies' || path === '/discover/trending')
      json = paged([movie(302, 'Fresh Pick')]);
    else if (path === '/discover/genreslider/movie') json = [];
    else if (/^\/discover\//.test(path) || path === '/media') json = paged([]);
    else if (path === '/request')
      json = { pageInfo: { pages: 1, results: 0 }, results: [] };
    else if (/^\/user\/\d+\/quota$/.test(path)) json = {};
    return route.fulfill({ json });
  });
}

for (const how of ['Escape', 'Cancel'] as const) {
  test(`${how} on the quick-request sheet returns focus to the poster's Request button`, async ({
    page,
  }, info) => {
    test.skip(
      info.project.name !== 'desktop',
      'the hover overlay is desktop only'
    );
    await fixture(page);
    await page.goto('/');
    const poster = page.locator('.poster', { hasText: 'Fresh Pick' }).first();
    await poster.scrollIntoViewIfNeeded();
    const trigger = poster.locator('.qbtn.go');
    await poster.hover();
    await trigger.focus();
    await page.mouse.move(2, 2);
    await expect(trigger).toBeFocused();
    await page.keyboard.press('Enter');
    const sheet = page.getByRole('dialog', { name: 'Request Fresh Pick' });
    await expect(sheet).toBeVisible();
    // the pointer is somewhere else, so only focus keeps the overlay shown
    await page.mouse.move(2, 2);
    if (how === 'Escape') await page.keyboard.press('Escape');
    else await sheet.getByRole('button', { name: 'Cancel' }).click();
    await expect(sheet).toHaveCount(0);
    await page.mouse.move(2, 2);
    await expect(trigger).toBeFocused();
  });
}
