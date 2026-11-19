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
];

for (const cardData of cards) {
  test(`${cardData.path} poster hides request actions without permission`, async ({
    page,
  }) => {
    await page.route('https://**/*', (route) => route.abort());
    await page.route('**/lumen-config.json', (route) =>
      route.fulfill({ json: {} })
    );
    await page.route('**/api/v1/**', (route) => {
      const url = new URL(route.request().url());
      const path = url.pathname.slice('/api/v1'.length);
      if (path === '/auth/me')
        return route.fulfill({
          json: { id: 1, displayName: 'Viewer', permissions: 0 },
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
    const card = page.locator('.poster', { hasText: cardData.label });
    await expect(card).toBeVisible();
    await expect(card.getByRole('button', { name: /request/i })).toHaveCount(0);
  });
}
