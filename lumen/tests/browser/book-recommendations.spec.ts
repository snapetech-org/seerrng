import { expect, test } from '@playwright/test';

test('recommendation feeds apply feedback and create a personalized feed', async ({
  page,
}) => {
  const submitted: unknown[] = [];
  let resolveBody: unknown;
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/imageproxy/hardcover/**', (route) =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"/>',
    })
  );
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname.slice(
      '/api/v1'.length
    );
    if (path === '/auth/me')
      return route.fulfill({ json: { id: 1, permissions: 2 } });
    if (path === '/settings/public')
      return route.fulfill({ json: { booksEnabled: true } });
    if (path === '/resolve') {
      resolveBody = route.request().postDataJSON();
      return route.fulfill({
        json: {
          groups: [{ candidates: [{ id: 'OL42W', mediaType: 'book' }] }],
        },
      });
    }
    if (path === '/book/OL42W')
      return route.fulfill({
        json: {
          id: 'OL42W',
          title: 'Matched Fixture Audiobook',
          author: 'Fixture Author',
          description: 'Fixture description.',
          mediaType: 'book',
          bookFormat: 'audiobook',
        },
      });
    if (path === '/book-recommendations/7/books') {
      submitted.push(route.request().postDataJSON());
      return route.fulfill({
        json: {
          available: true,
          total: 1,
          books: [
            {
              id: 8,
              title: 'Fixture Book',
              imageUrl: 'https://assets.hardcover.app/fixture.jpg',
            },
          ],
        },
      });
    }
    if (path === '/book-recommendations') {
      if (route.request().method() === 'POST') {
        submitted.push(route.request().postDataJSON());
        return route.fulfill({ status: 201, json: { id: 9 } });
      }
      return route.fulfill({
        json: {
          available: true,
          results: [
            { id: 7, title: 'Fixture Feed', source: 'featured', likes: 2 },
          ],
        },
      });
    }
    return route.fulfill({ json: {} });
  });
  await page.goto('/books/recommendations');
  await page.getByRole('button', { name: 'Show Books: Fixture Feed' }).click();
  await expect(page.getByText('Fixture Book')).toBeVisible();
  await expect(page.locator('.poster.book img')).toHaveAttribute(
    'src',
    '/imageproxy/hardcover/fixture.jpg'
  );
  await page.getByLabel('Standalones only').check();
  await page.getByRole('button', { name: 'More Like This' }).click();
  await expect
    .poll(() => submitted[1])
    .toMatchObject({ tuning: { standalones: true, moreLike: [8] } });
  await page.getByLabel('Title', { exact: true }).fill('My Fixture Feed');
  await page.getByRole('button', { name: 'Create on Hardcover' }).click();
  await expect
    .poll(() => submitted[2])
    .toMatchObject({ title: 'My Fixture Feed', likeBookIds: [8] });
  await expect(page.getByText('Recommendation feed created.')).toBeVisible();
  await page
    .getByRole('combobox', { name: 'Format', exact: true })
    .selectOption('audiobook');
  await page.getByRole('button', { name: 'Open Book' }).click();
  await expect(page).toHaveURL('/book/OL42W?f=audio');
  await expect(
    page.getByRole('heading', { name: 'Matched Fixture Audiobook' })
  ).toBeVisible();
  expect(resolveBody).toMatchObject({
    text: 'Fixture Book',
    types: ['book'],
    formatHint: 'audiobook',
  });
});
