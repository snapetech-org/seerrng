import { expect, test, type Page } from '@playwright/test';
import { DiscoverSliderType } from '../server/constants/discover';

test.use({ serviceWorkers: 'block' });

const loginAsAdmin = async (page: Page, baseURL: string | undefined) => {
  await page.request.get(`${baseURL}/api/v1/settings/public`);
  const token = (await page.context().cookies()).find(
    (cookie) => cookie.name === 'XSRF-TOKEN'
  )?.value;
  const response = await page.request.post(`${baseURL}/api/v1/auth/local`, {
    data: { email: 'admin@seerr.dev', password: 'test1234' },
    headers: token ? { 'X-XSRF-TOKEN': decodeURIComponent(token) } : {},
  });
  expect(response.status()).toBe(200);
};

// Keep public catalogue/artwork deterministic while the real authenticated warm
// endpoint and shared client queue remain active. Provider latency is unrelated
// to whether an ordinary page rate-limits its own warm requests.
const fixtureCatalogue = async (page: Page) => {
  const details = new Map<number, Record<string, unknown>>();
  await page.route('**/api/v1/settings/public', async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      json: { ...(await response.json()), cacheImages: true },
    });
  });
  await page.route('**/api/v1/settings/discover', (route) =>
    route.fulfill({
      json: Array.from({ length: 20 }, (_, index) => ({
        id: 9000 + index,
        type: DiscoverSliderType.TMDB_LIST,
        enabled: true,
        isBuiltIn: false,
        order: index,
        title: `Warm fixture shelf ${index + 1}`,
        data: String(9000 + index),
      })),
    })
  );
  await page.route(
    /\/api\/v1\/discover\/(movies|tv|list\/\d+)(\?|$)/,
    (route) => {
      const url = new URL(route.request().url());
      const type = url.pathname.endsWith('/tv') ? 'tv' : 'movie';
      const shelf = Number(
        url.pathname.match(/list\/(\d+)/)?.[1] ?? (type === 'tv' ? 2 : 1)
      );
      const results = Array.from({ length: 40 }, (_, index) => {
        const id = 9000000 + shelf * 100 + index;
        const title = `Warm fixture title ${id}`;
        const item = {
          id,
          mediaType: type,
          ...(type === 'movie'
            ? { title, originalTitle: title }
            : { name: title, originalName: title }),
          overview: 'Isolated catalogue fixture',
          releaseDate: '2026-01-01',
          firstAirDate: '2026-01-01',
          posterPath: `/warm-fixture-${id}.jpg`,
          genreIds: [],
          voteAverage: 7,
          voteCount: 10,
        };
        details.set(id, {
          ...item,
          genres: [],
          credits: { cast: [], crew: [] },
        });
        return item;
      });
      return route.fulfill({
        json: { page: 1, totalPages: 1, totalResults: results.length, results },
      });
    }
  );
  await page.route(/\/api\/v1\/(movie|tv)\/\d+(\?|$)/, (route) => {
    const id = Number(
      new URL(route.request().url()).pathname.split('/').at(-1)
    );
    return route.fulfill({ json: details.get(id) });
  });
  const pixel = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jB1sAAAAASUVORK5CYII=',
    'base64'
  );
  // Artwork bytes are a fixture; /api/v1/imageproxy/warm is never intercepted.
  await page.route(/warm-fixture-\d+\.jpg/, (route) =>
    route.fulfill({ body: pixel, contentType: 'image/png' })
  );
};

// Every slider and list used to POST its own cache-warm request, so one ordinary
// Discover load exceeded the per-client limit and answered 429 to ourselves.
for (const path of ['/', '/discover/movies', '/discover/tv']) {
  test(`${path} does not rate-limit its own image requests`, async ({
    page,
    baseURL,
  }) => {
    await loginAsAdmin(page, baseURL);
    await fixtureCatalogue(page);
    const warmCalls: string[] = [];
    const limited: string[] = [];
    const warmStatuses: number[] = [];
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('request', (request) => {
      if (request.url().includes('/api/v1/imageproxy/warm'))
        warmCalls.push(request.url());
    });
    page.on('response', (response) => {
      if (response.status() === 429) limited.push(response.url());
      if (new URL(response.url()).pathname === '/api/v1/imageproxy/warm')
        warmStatuses.push(response.status());
    });

    await page.goto(path);
    await expect(
      page
        .getByTestId('title-card')
        .filter({ hasText: 'Warm fixture title' })
        .first()
    ).toBeVisible();
    // Scroll through the page so lazy shelves mount and queue their warm requests.
    for (let y = 0; y < 6000; y += 600) {
      await page.evaluate((top) => window.scrollTo(0, top), y);
      await page.waitForTimeout(250);
    }
    await page.waitForTimeout(6000);

    await expect
      .poll(() => warmStatuses.length === warmCalls.length)
      .toBe(true);
    expect(pageErrors).toEqual([]);
    expect(limited, 'no response should be rate limited').toEqual([]);
    // One shared queue spaces batches at least 4s apart: at most ~1 per 4s.
    expect(
      warmCalls.length,
      'the warm queue must actually be exercised'
    ).toBeGreaterThan(0);
    expect(warmCalls.length).toBeLessThanOrEqual(6);
    expect(warmStatuses).toHaveLength(warmCalls.length);
    expect(warmStatuses.every((status) => status === 202)).toBe(true);
  });
}
