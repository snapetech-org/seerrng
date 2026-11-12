import { expect, test } from '@playwright/test';

const tv = {
  id: 7,
  mediaType: 'tv',
  name: 'Hero Series',
  posterPath: '/p.jpg',
  backdropPath: '/b.jpg',
  firstAirDate: '2003-01-01',
  voteAverage: 8.3,
};
const paged = (results: unknown[]) => ({
  page: 1,
  totalPages: 1,
  totalResults: results.length,
  results,
});

test('Discover feature card meta is not cut off on narrow screens', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop', 'sets its own viewports');
  await page.route('**/lumen-config.json', (r) => r.fulfill({ json: {} }));
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
    if (/^\/discover\/(trending|movies|tv)$/.test(path))
      return route.fulfill({ json: paged([tv]) });
    if (path.startsWith('/discover/genreslider/'))
      return route.fulfill({ json: [] });
    return route.fulfill({ json: paged([]) });
  });
  for (const [width, height] of [
    [360, 536],
    [412, 783],
    [701, 685],
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto('/');
    const card = page.locator('.feat').first();
    await expect(card.locator('.mm')).toBeVisible();
    const r = await card.evaluate((el) => {
      const mm = el.querySelector<HTMLElement>('.mm')!;
      const box = el.getBoundingClientRect();
      const inside = Array.from(
        el.querySelectorAll<HTMLElement>('.cap h3, .cap .go, .mm')
      ).every((n) => {
        const b = n.getBoundingClientRect();
        return (
          b.left >= box.left - 1 &&
          b.right <= box.right + 1 &&
          b.top >= box.top - 1 &&
          b.bottom <= box.bottom + 1
        );
      });
      return {
        clipped: mm.scrollWidth > mm.clientWidth + 1,
        ellipsis: getComputedStyle(mm).textOverflow === 'ellipsis',
        inside,
        text: mm.textContent,
      };
    });
    expect(r.text, `${width}px`).toContain('★');
    expect(r.clipped, `${width}px clipped`).toBe(false);
    expect(r.ellipsis, `${width}px ellipsis`).toBe(false);
    expect(r.inside, `${width}px overflow`).toBe(true);
  }
});
