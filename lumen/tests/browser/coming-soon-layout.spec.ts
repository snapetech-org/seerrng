import { expect, test, type Page } from '@playwright/test';

const paged = (results: unknown[]) => ({
  page: 1,
  totalPages: 1,
  totalResults: results.length,
  results,
});

async function fixtures(page: Page) {
  const upcoming = Array.from({ length: 6 }, (_, i) => ({
    id: 900 + i,
    title: `Upcoming Movie ${i + 1}`,
    mediaType: 'movie',
    releaseDate: '2027-03-15',
  }));
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname.slice(
      '/api/v1'.length
    );
    if (path === '/auth/me')
      return route.fulfill({
        json: { id: 1, displayName: 'test', permissions: 2 },
      });
    if (path === '/settings/public')
      return route.fulfill({
        json: { applicationTitle: 'SeerrNG', movie4kEnabled: false },
      });
    return route.fulfill({
      json: paged(path === '/discover/movies/upcoming' ? upcoming : []),
    });
  });
}

test('Coming Soon Request buttons stay inside cards in iPad landscape', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'tablet', 'tablet layout only');
  await fixtures(page);
  await page.goto('/soon');
  await expect(page.locator('.si')).toHaveCount(6);
  await expect(page.locator('.si .act button')).toHaveCount(6);

  for (const width of [1024, 1112, 1180, 1194, 1280, 1366]) {
    await page.setViewportSize({ width, height: 820 });
    const layout = await page.locator('.sl').first().evaluate((grid) => {
      const cards = Array.from(grid.querySelectorAll<HTMLElement>('.si'));
      const overflow = cards.flatMap((card, index) => {
        const button = card.querySelector<HTMLButtonElement>('.act button');
        if (!button) return [index];
        const outer = card.getBoundingClientRect();
        const inner = button.getBoundingClientRect();
        return inner.left < outer.left - 1 || inner.right > outer.right + 1
          ? [index]
          : [];
      });
      return {
        overflow,
        columns: getComputedStyle(grid).gridTemplateColumns.split(' ').length,
      };
    });
    expect(layout.overflow, `overlapping buttons at ${width}px`).toEqual([]);
    expect(layout.columns).toBe(width < 1320 ? 2 : 3);
  }
});
