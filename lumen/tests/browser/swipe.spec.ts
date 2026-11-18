import { expect, test } from '@playwright/test';

test('Swipe requests, passes, and undoes a recommendation', async ({
  page,
}, info) => {
  const cards = [
    { id: '7', title: 'First Film', overview: 'A fixture recommendation.' },
    { id: '8', title: 'Second Film' },
  ];
  const writes: unknown[] = [];
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.endsWith('/auth/me'))
      return route.fulfill({ json: { id: 1, permissions: 2 } });
    if (path.endsWith('/swipe/status'))
      return route.fulfill({
        json: { mediaTypes: ['movie', 'tv', 'book'], bookFormats: ['ebook'] },
      });
    if (path.endsWith('/swipe/profile'))
      return route.fulfill({
        json: { seriesRequest: 'first-season', bookFormat: 'ebook' },
      });
    if (path.endsWith('/swipe/deck'))
      return route.fulfill({ json: { cards, remaining: 2 } });
    if (request.method() === 'POST') writes.push(request.postDataJSON());
    return route.fulfill({
      json: path.endsWith('/undo') ? { card: cards[1] } : {},
    });
  });
  await page.goto('/swipe');
  await expect(page.getByRole('heading', { name: 'First Film' })).toBeVisible();
  await page.screenshot({ path: info.outputPath('swipe.png'), fullPage: true });
  await page.getByRole('button', { name: 'Request', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Second Film' })
  ).toBeVisible();
  await page.getByRole('button', { name: 'Pass', exact: true }).click();
  await expect(
    page.getByText('No more recommendations in this deck.')
  ).toBeVisible();
  await page.getByRole('button', { name: 'Undo Last Decision' }).click();
  await expect(
    page.getByRole('heading', { name: 'Second Film' })
  ).toBeVisible();
  expect(writes).toEqual([
    { mediaType: 'movie', mediaId: 7 },
    { mediaType: 'movie', id: '7', decision: 'want' },
    { mediaType: 'movie', id: '8', decision: 'pass' },
    { mediaType: 'movie' },
  ]);
});
