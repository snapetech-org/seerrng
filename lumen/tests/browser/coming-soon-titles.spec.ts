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
    title: `Victorian Psychosis Stories ${i + 1}`,
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

test('Coming soon titles wrap to two lines instead of cutting to a few letters', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop', 'sets its own viewport');
  await fixtures(page);
  await page.goto('/soon');
  await expect(page.locator('.si')).toHaveCount(6);
  for (const width of [1320, 1366, 1440, 1520, 1599]) {
    await page.setViewportSize({ width, height: 900 });
    const bad = await page
      .locator('.sl')
      .first()
      .evaluate((grid) => {
        const problems: string[] = [];
        for (const card of Array.from(
          grid.querySelectorAll<HTMLElement>('.si')
        )) {
          const tt = card.querySelector<HTMLElement>('.tt')!;
          const line = parseFloat(getComputedStyle(tt).lineHeight);
          if (tt.clientWidth < 100)
            problems.push(`title only ${tt.clientWidth}px wide`);
          if (tt.scrollWidth > tt.clientWidth + 1)
            problems.push(`title cut sideways (${tt.clientWidth}px wide)`);
          if (tt.clientHeight > line * 2 + 1)
            problems.push('title over 2 lines');
        }
        return problems;
      });
    expect(bad, `at ${width}px`).toEqual([]);
  }
});
