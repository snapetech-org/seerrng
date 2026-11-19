import { expect, test } from '@playwright/test';

const cards = [
  {
    path: '/books?sort=ranked',
    endpoint: '/discover/books',
    label: 'No Request Book',
    item: {
      id: 'OL900W',
      title: 'No Request Book',
      mediaType: 'book',
      bookFormat: 'ebook',
      provider: 'openlibrary',
      author: 'Fixture Author',
    },
  },
  {
    path: '/audiobooks',
    endpoint: '/discover/books',
    label: 'No Request Audiobook',
    item: {
      id: 'OL901W',
      title: 'No Request Audiobook',
      mediaType: 'book',
      bookFormat: 'audiobook',
      provider: 'openlibrary',
      author: 'Fixture Author',
    },
  },
];

for (const cardData of cards) {
  for (const permissions of [0, 2, 32, 34359738368]) {
    test(`${cardData.path} poster request follows book permissions (${permissions})`, async ({
      page,
    }, info) => {
      await page.route('https://**/*', (route) => route.abort());
      await page.route('**/lumen-config.json', (route) =>
        route.fulfill({
          json:
            cardData.item.bookFormat === 'audiobook'
              ? { defaults: { narratorChoice: false } }
              : {},
        })
      );
      await page.route('**/api/v1/**', (route) => {
        const url = new URL(route.request().url());
        const path = url.pathname.slice('/api/v1'.length);
        if (path === '/auth/me')
          return route.fulfill({
            json: { id: 1, displayName: 'Viewer', permissions },
          });
        if (path === '/settings/public')
          return route.fulfill({
            json: {
              booksEnabled: true,
              movie4kEnabled: false,
              series4kEnabled: false,
              enabledMediaCategories: {
                book: true,
                ebook: true,
                audiobook: true,
              },
            },
          });
        if (path === '/user/1/settings/main')
          return route.fulfill({
            json: {
              enabledMediaCategories: {
                book: true,
                ebook: true,
                audiobook: true,
              },
            },
          });
        if (path === '/book/library')
          return route.fulfill({
            json: { page: 1, totalPages: 1, totalResults: 0, results: [] },
          });
        if (
          path === '/discover/genreslider/movie' ||
          path === '/discover/genreslider/tv'
        )
          return route.fulfill({ json: [] });
        if (path === cardData.endpoint)
          return route.fulfill({
            json: { page: 1, totalPages: 1, results: [cardData.item] },
          });
        return route.fulfill({ json: { page: 1, totalPages: 1, results: [] } });
      });
      await page.goto(cardData.path);
      const card = page.locator('.poster', { hasText: cardData.label }).first();
      await expect(card).toBeVisible();
      await card.hover();
      const mayRequest =
        permissions === 2 || permissions === 32 || permissions === 34359738368;
      await expect(card.getByRole('button', { name: /request/i })).toHaveCount(
        mayRequest ? 1 : 0
      );
      if (permissions === 0)
        await page.screenshot({
          path: info.outputPath(
            `${cardData.path.slice(1)}-book-permission-${permissions}.png`
          ),
          fullPage: true,
          animations: 'disabled',
        });
    });
  }
}
