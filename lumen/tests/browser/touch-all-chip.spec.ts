import { expect, test } from '@playwright/test';

// The short "All" filter button on Movies/Series/Books/Audiobooks must still be a 44px touch target.
test('the All availability button is at least 44px wide on touch screens', async ({
  page,
}, info) => {
  test.skip(
    info.project.name !== 'android' && info.project.name !== 'iphone',
    'touch only'
  );
  await page.route('https://**/*', (r) => r.abort());
  await page.route('**/lumen-config.json', (r) => r.fulfill({ json: {} }));
  await page.route('**/api/v1/**', (r) => {
    const path = new URL(r.request().url()).pathname.slice(7);
    if (path === '/auth/me')
      return r.fulfill({
        json: { id: 1, displayName: 'reader', permissions: 2 },
      });
    if (path === '/settings/public')
      return r.fulfill({ json: { mediaServerType: 1 } });
    if (path.includes('genre')) return r.fulfill({ json: [] });
    return r.fulfill({
      json: { page: 1, totalPages: 1, totalResults: 0, results: [] },
    });
  });
  await page.goto('/movies');
  const all = page
    .getByRole('group', { name: 'Availability' })
    .getByRole('button', {
      name: 'All',
      exact: true,
    });
  await expect(all).toBeVisible();
  const box = await all.evaluate((el) => el.getBoundingClientRect().toJSON());
  expect(box.width).toBeGreaterThanOrEqual(43.5);
  expect(box.height).toBeGreaterThanOrEqual(43.5);
});
