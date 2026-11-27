import { expect, test } from '@playwright/test';
import { testAppPath } from './testAppPath';

test('book detail starts a bibliography request with the current work and author titles', async ({
  page,
}) => {
  const writes: Record<string, unknown>[] = [];
  const authorReads: string[] = [];
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname
      .replace(/^\/lumen/, '')
      .slice(7);
    if (path === '/auth/me')
      return route.fulfill({
        json: { id: 1, permissions: 34359738368, settings: {} },
      });
    if (path === '/user/1/settings/main')
      return route.fulfill({ json: { locale: 'en' } });
    if (path === '/settings/public')
      return route.fulfill({
        json: {
          ebookServiceEnabled: true,
          audiobookServiceEnabled: true,
          booksEnabled: true,
          enabledMediaCategories: { ebook: true, audiobook: true },
        },
      });
    if (path === '/book/bookshelf%3A42%3AaGM6MTIzNDU')
      return route.fulfill({
        json: {
          id: 'bookshelf:42:aGM6MTIzNDU',
          mediaType: 'book',
          title: 'Current Book',
          author: 'Fixture Author',
          authorId: 'author-1',
          provider: 'bookshelf',
          isbn13: '9781234567890',
          editionId: 'edition-42',
        },
      });
    if (path === '/user/1/quota')
      return route.fulfill({ json: { book: { limit: 0, restricted: false } } });
    if (path === '/author/author-1/works') {
      authorReads.push(request.url());
      return route.fulfill({
        json: {
          works: [
            {
              id: 'bookshelf:42:aGM6Njc4OTA',
              mediaType: 'book',
              title: 'Another Book',
              authorId: 'author-1',
            },
          ],
          pagination: { nextOffset: 2, totalItems: 2 },
        },
      });
    }
    if (path === '/request/bulk' && request.method() === 'POST') {
      writes.push(request.postDataJSON());
      return route.fulfill({
        json: { created: [{ id: 1 }, { id: 2 }], skipped: [], failed: [] },
      });
    }
    return route.fulfill({ json: {} });
  });

  await page.goto(testAppPath('/book/bookshelf%3A42%3AaGM6MTIzNDU'));
  const bibliography = page.getByRole('button', {
    name: 'Request Bibliography',
  });
  await expect(bibliography).toBeVisible();
  await bibliography.click();
  const sheet = page.getByRole('dialog', { name: 'Request Books' });
  await expect(sheet.getByText('Current Book')).toBeVisible();
  await sheet.getByRole('button', { name: 'Load More Books' }).click();
  await expect(sheet.getByText('Another Book')).toBeVisible();
  expect(authorReads).toHaveLength(1);
  expect(new URL(authorReads[0]).searchParams.get('offset')).toBe('1');
  await sheet.getByLabel('Current Book').check();
  await sheet.getByLabel('Another Book').check();
  await sheet.getByRole('button', { name: 'Request Selected Books' }).click();
  await expect.poll(() => writes).toHaveLength(1);
  expect(writes[0]).toMatchObject({
    mediaType: 'book',
    format: 'ebook',
    items: [
      {
        mediaId: 'bookshelf:42:aGM6MTIzNDU',
        title: 'Current Book',
        authorId: 'author-1',
        isbn13: '9781234567890',
        editionId: 'edition-42',
      },
      { mediaId: 'bookshelf:42:aGM6Njc4OTA', title: 'Another Book' },
    ],
  });
});

test('book bibliography request stays hidden without book request permission', async ({
  page,
}) => {
  const forbiddenReads: string[] = [];
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname
      .replace(/^\/lumen/, '')
      .slice(7);
    if (path === '/auth/me')
      return route.fulfill({ json: { id: 1, permissions: 0 } });
    if (path === '/user/1/settings/main')
      return route.fulfill({ json: { locale: 'en' } });
    if (path === '/settings/public')
      return route.fulfill({
        json: { ebookServiceEnabled: true, booksEnabled: true },
      });
    if (path === '/book/bookshelf%3A42%3AaGM6MTIzNDU')
      return route.fulfill({
        json: {
          id: 'bookshelf:42:aGM6MTIzNDU',
          mediaType: 'book',
          title: 'Current Book',
          author: 'Fixture Author',
          authorId: 'author-1',
          provider: 'bookshelf',
        },
      });
    if (path.startsWith('/author/') || path === '/request/bulk')
      forbiddenReads.push(path);
    return route.fulfill({ json: {} });
  });

  await page.goto(testAppPath('/book/bookshelf%3A42%3AaGM6MTIzNDU'));
  await expect(
    page.getByRole('button', { name: 'Request Bibliography' })
  ).toHaveCount(0);
  expect(forbiddenReads).toEqual([]);
});
