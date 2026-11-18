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

test('saved Swipe preferences apply to the active series deck', async ({
  page,
}, info) => {
  const series = { id: '42', title: 'Fixture Series' };
  const calls: unknown[] = [];
  const profile = {
    seriesRequest: 'first-season',
    bookFormat: 'ebook',
    seedScope: 'full',
    tasteNotes: '',
  };
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
        json: { mediaTypes: ['tv'], bookFormats: ['ebook'] },
      });
    if (path.endsWith('/swipe/profile')) {
      if (request.method() === 'GET') return route.fulfill({ json: profile });
      const body = request.postDataJSON();
      calls.push(body);
      return route.fulfill({ json: { ...profile, ...body } });
    }
    if (path.endsWith('/swipe/deck'))
      return route.fulfill({ json: { cards: [series], remaining: 1 } });
    if (path.endsWith('/request')) calls.push(request.postDataJSON());
    return route.fulfill({ json: {} });
  });
  await page.goto('/swipe');
  await page.getByText('Swipe Preferences', { exact: true }).click();
  await page
    .getByRole('combobox', { name: 'Series Request Default' })
    .selectOption('all-seasons');
  await page.getByLabel('Taste Notes').fill('Slow mysteries');
  await page.getByRole('button', { name: 'Save Swipe Preferences' }).click();
  await expect(page.getByText('Swipe preferences saved.')).toBeVisible();
  await page.screenshot({
    path: info.outputPath('swipe-preferences.png'),
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Request', exact: true }).click();
  await expect(page.getByText('Fixture Series requested.')).toBeVisible();
  expect(calls).toEqual([
    {
      seriesRequest: 'all-seasons',
      bookFormat: 'ebook',
      tasteNotes: 'Slow mysteries',
      seedScope: 'full',
    },
    { mediaType: 'tv', mediaId: 42, seasons: 'all' },
  ]);
});
