import { expect, test } from '@playwright/test';

const mount = process.env.LUMEN_TEST_MOUNT === '/lumen' ? '/lumen' : '';
const path = (value: string) => `${mount}${value}`;

test('Discover follows saved personal book shelf order and can request its audiobook rows', async ({
  page,
}, info) => {
  const calls: { url: string; method: string; body?: unknown }[] = [];
  const preferences = [
    { key: 'new:ebook', enabled: true },
    { key: 'popular:audiobook', enabled: true },
    { key: 'subject:history:ebook', enabled: true },
  ];
  const book = (id: string, title: string) => ({
    id,
    title,
    mediaType: 'book',
    bookFormat: 'ebook',
    author: 'A. Author',
    posterPath: null,
  });
  const audio = {
    asin: 'B000BOOK1',
    title: 'Shelf Audiobook',
    author: 'A. Author',
    coverArtUrl: null,
    durationMinutes: 300,
  };
  let requestItems: { asin: string; status: string }[] = [];
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const endpoint = url.pathname
      .replace(/^\/lumen(?=\/)/, '')
      .replace(/^\/api\/v1/, '');
    if (['POST'].includes(request.method()))
      calls.push({
        url: endpoint,
        method: request.method(),
        body: request.postDataJSON(),
      });
    if (endpoint === '/auth/me')
      return route.fulfill({
        json: { id: 1, displayName: 'Viewer', permissions: 2 },
      });
    if (endpoint === '/user/1/settings/main')
      return route.fulfill({
        json: {
          locale: 'en',
          enabledMediaCategories: { ebook: true, audiobook: true },
        },
      });
    if (endpoint === '/user/1/settings/discover-book-sections')
      return route.fulfill({ json: { sections: preferences } });
    if (endpoint === '/settings/public')
      return route.fulfill({
        json: {
          enabledMediaCategories: {
            movie: true,
            tv: true,
            ebook: true,
            audiobook: true,
          },
          musicEnabled: false,
        },
      });
    if (endpoint === '/lumen/configuration')
      return route.fulfill({
        json: {
          defaults: {
            showBooks: true,
            rows: {
              hero: false,
              newOnPlex: false,
              trendingMovies: false,
              popularSeries: false,
              audiobooks: false,
              books: false,
              comingSoon: false,
              genres: false,
            },
          },
        },
      });
    if (endpoint === '/readmeabook/status')
      return route.fulfill({ json: { enabled: true } });
    if (endpoint === '/readmeabook/requests' && request.method() === 'GET')
      return route.fulfill({ json: requestItems });
    if (endpoint === '/readmeabook/requests' && request.method() === 'POST') {
      requestItems = [{ asin: audio.asin, status: 'pending' }];
      return route.fulfill({ status: 201, json: requestItems[0] });
    }
    if (endpoint === '/readmeabook/discover')
      return route.fulfill({ json: [audio] });
    if (endpoint === '/discover/books') {
      const title =
        url.searchParams.get('subject') === 'history'
          ? 'History Shelf Book'
          : 'New Shelf Book';
      return route.fulfill({
        json: { page: 1, totalPages: 1, results: [book(title, title)] },
      });
    }
    if (endpoint.startsWith('/discover/genreslider/'))
      return route.fulfill({ json: [] });
    if (endpoint.startsWith('/discover/'))
      return route.fulfill({ json: { page: 1, totalPages: 1, results: [] } });
    return route.fulfill({ json: {} });
  });
  await page.goto(path('/'));
  const heading = page.getByRole('heading', { name: 'New Books' });
  await expect(heading).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Popular Audiobooks' })
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'History Books' })
  ).toBeVisible();
  const order = await page.locator('main h2').allTextContents();
  expect(order.indexOf('New Books')).toBeLessThan(
    order.indexOf('Popular Audiobooks')
  );
  expect(order.indexOf('Popular Audiobooks')).toBeLessThan(
    order.indexOf('History Books')
  );
  if (
    process.env.LUMEN_BOOK_SHELF_CAPTURE_DIR &&
    ['desktop', 'iphone'].includes(info.project.name)
  ) {
    const { mkdir } = await import('node:fs/promises');
    await mkdir(process.env.LUMEN_BOOK_SHELF_CAPTURE_DIR, { recursive: true });
    await page.screenshot({
      path: `${process.env.LUMEN_BOOK_SHELF_CAPTURE_DIR}/discover-${info.project.name}.png`,
      fullPage: true,
      scale: 'css',
      animations: 'disabled',
    });
  }
  await page.getByRole('button', { name: 'Request', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Shelf Audiobook requested.' })
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Requested', exact: true })
  ).toBeDisabled();
  expect(calls).toContainEqual({
    url: '/readmeabook/requests',
    method: 'POST',
    body: audio,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    )
  ).toBe(true);
});
