import { expect, test } from '@playwright/test';

test('collections are reachable from search and blocklist as one collection', async ({
  page,
}) => {
  let blocked = false;
  const actions: string[] = [];
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/api/v1/**', (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.slice('/api/v1'.length);
    if (path === '/auth/me')
      return route.fulfill({ json: { id: 1, permissions: 268435456 } });
    if (path === '/search')
      return route.fulfill({
        json: {
          results: [
            { id: 30, mediaType: 'collection', title: 'Example Collection' },
          ],
        },
      });
    if (path === '/collection/30')
      return route.fulfill({
        json: {
          id: 30,
          name: 'Example Collection',
          parts: [
            {
              id: 20,
              mediaType: 'movie',
              title: 'Example Movie',
              mediaInfo: { status: blocked ? 6 : 1 },
            },
          ],
        },
      });
    if (path === '/blocklist/collection/30') {
      actions.push(request.method());
      blocked = request.method() === 'POST';
      return route.fulfill({ status: blocked ? 201 : 204 });
    }
    if (path === '/blocklist/count')
      return route.fulfill({ json: { count: Number(blocked) } });
    return route.fulfill({ json: { results: [] } });
  });
  await page.goto('/search?f=movie&q=example');
  await page.getByRole('link', { name: 'Example Collection' }).click();
  await expect(
    page.getByRole('heading', { name: 'Example Collection' })
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Example Movie' })
  ).toHaveAttribute('href', '/movie/20');
  await page
    .getByRole('button', { name: 'Blocklist Collection', exact: true })
    .click();
  expect(actions).toEqual([]);
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Blocklist Collection' })
    .click();
  await expect(page.getByText('1 of 1 blocklisted')).toBeVisible();
  await page.getByRole('button', { name: 'Unblock Collection' }).click();
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Unblock Collection' })
    .click();
  await expect(page.getByText('1 of 1 blocklisted')).toHaveCount(0);
  expect(actions).toEqual(['POST', 'DELETE']);
});
