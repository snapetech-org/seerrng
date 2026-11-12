import { expect, test, type Page } from '@playwright/test';

// On a short landscape screen the quick-request sheet's pinned Request/Cancel footer used to cover
// the options and push Cancel off the screen. The sheet now scrolls as one piece.
const movie = {
  id: 302,
  title: 'Fresh Pick',
  mediaType: 'movie',
  releaseDate: '2020-01-01',
  posterPath: '/p302.png',
  voteAverage: 7,
};
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
      json = paged([movie]);
    else if (path === '/discover/genreslider/movie') json = [];
    else if (/^\/discover\//.test(path) || path === '/media') json = paged([]);
    else if (path === '/request')
      json = { pageInfo: { pages: 1, results: 0 }, results: [] };
    else if (/^\/user\/\d+\/quota$/.test(path)) json = {};
    return route.fulfill({ json });
  });
}

for (const [width, height] of [
  [640, 256],
  [863, 304],
  [945, 316],
] as const) {
  test(`quick-request sheet is usable on a ${width}x${height} screen`, async ({
    page,
  }, info) => {
    test.skip(info.project.name !== 'desktop', 'sets its own viewport');
    await fixture(page);
    await page.setViewportSize({ width, height });
    await page.goto('/');
    const poster = page.locator('.poster', { hasText: 'Fresh Pick' }).first();
    await poster.scrollIntoViewIfNeeded();
    await poster.hover();
    await poster.locator('.qbtn.go').focus();
    await page.keyboard.press('Enter');
    const sheet = page.getByRole('dialog', { name: 'Request Fresh Pick' });
    await expect(sheet).toBeVisible();
    await page.waitForTimeout(600); // the sheet slides up first
    const geo = () =>
      sheet.evaluate((el) => {
        const r = (s: string) =>
          el.querySelector(s)!.getBoundingClientRect().toJSON();
        return {
          foot: r('.pk-foot'),
          seg: r('.seg'),
          cancel: r('.pk-foot .btn-tonal'),
          pos: getComputedStyle(el.querySelector('.pk-foot')!).position,
          scrollable: el.scrollHeight > el.clientHeight,
          vh: innerHeight,
        };
      });
    // the footer never sits on top of the options
    let g = await geo();
    expect(g.pos).not.toBe('sticky');
    const overlap =
      Math.min(g.seg.bottom, g.foot.bottom) - Math.max(g.seg.top, g.foot.top);
    expect(overlap, 'footer covers the quality options').toBeLessThanOrEqual(0);
    // scrolling the sheet brings Request and Cancel fully on screen
    await sheet.evaluate((el) => el.scrollTo(0, el.scrollHeight));
    g = await geo();
    expect(g.cancel.bottom).toBeLessThanOrEqual(g.vh);
    expect(g.cancel.top).toBeGreaterThanOrEqual(0);
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
  });
}
