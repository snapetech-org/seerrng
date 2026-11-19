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

test('movie and series genre directories open the matching filtered browse', async ({
  page,
}) => {
  let seriesArtworkUnavailable = true;
  await page.route('**/imageproxy/tmdb/t/p/w780/*.jpg', (route) =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="780" height="440"><rect width="780" height="440" fill="#365279"/></svg>',
    })
  );
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/auth/me'))
      return route.fulfill({
        json: { id: 1, displayName: 'test', permissions: 2 },
      });
    if (path.endsWith('/settings/public'))
      return route.fulfill({ json: { applicationTitle: 'SeerrNG' } });
    if (path.endsWith('/discover/genreslider/movie'))
      return route.fulfill({
        json: [{ id: 28, name: 'Action', backdrops: ['/action.jpg'] }],
      });
    if (path.endsWith('/discover/genreslider/tv'))
      return seriesArtworkUnavailable
        ? route.fulfill({ status: 503, json: {} })
        : route.fulfill({
            json: [{ id: 18, name: 'Drama', backdrops: ['/drama.jpg'] }],
          });
    if (path.endsWith('/genres/movie'))
      return route.fulfill({ json: [{ id: 28, name: 'Action' }] });
    if (path.endsWith('/genres/tv'))
      return route.fulfill({ json: [{ id: 18, name: 'Drama' }] });
    return route.fulfill({ json: paged([]) });
  });
  for (const [path, title, genre, id] of [
    ['movies', 'Movie Genres', 'Action', 28],
    ['series', 'Series Genres', 'Drama', 18],
  ] as const) {
    await page.goto(`./${path}`);
    await page.getByRole('link', { name: 'Browse Genres' }).click();
    await expect(page.getByRole('heading', { name: title })).toBeVisible();
    const tile = page.getByRole('link', { name: `Browse ${genre}` });
    if (path === 'movies') {
      await expect(tile.locator('img')).toHaveAttribute(
        'src',
        '/imageproxy/tmdb/t/p/w780/action.jpg'
      );
    } else {
      await expect(tile).toBeVisible();
      await expect(tile.locator('img')).toHaveCount(0);
      const warning = page
        .getByRole('alert')
        .filter({ hasText: 'genre artwork' });
      await expect(warning).toBeVisible();
      seriesArtworkUnavailable = false;
      await warning.getByRole('button', { name: 'Retry' }).click();
      await expect(tile.locator('img')).toHaveAttribute(
        'src',
        '/imageproxy/tmdb/t/p/w780/drama.jpg'
      );
      await expect(warning).toHaveCount(0);
    }
    await tile.click();
    await expect(page).toHaveURL(new RegExp(`/${path}\\?genre=${id}$`));
  }
});
