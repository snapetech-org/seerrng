import { expect, test } from '@playwright/test';

test('Swipe records decisions and restores or clears history', async ({
  page,
}, info) => {
  const cards = [
    { id: '7', title: 'First Film', overview: 'A fixture recommendation.' },
    { id: '8', title: 'Second Film' },
  ];
  let decisions = [
    { mediaType: 'movie', id: '7', title: 'First Film', decision: 'want' },
    { mediaType: 'movie', id: '8', title: 'Second Film', decision: 'pass' },
    { mediaType: 'movie', id: '9', title: 'Third Film', decision: 'seen' },
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
    if (path.endsWith('/history/restore')) {
      expect(request.postDataJSON()).toEqual({ mediaType: 'movie', id: '8' });
      decisions = decisions.filter(({ id }) => id !== '8');
      return route.fulfill({ json: { restored: true } });
    }
    if (path.endsWith('/history')) {
      if (request.method() === 'DELETE') {
        expect(new URL(request.url()).searchParams.get('mediaType')).toBe(
          'movie'
        );
        decisions = decisions.filter(({ decision }) => decision === 'want');
        return route.fulfill({ json: { cleared: 1 } });
      }
      return route.fulfill({ json: { decisions, hasMore: false } });
    }
    if (request.method() === 'POST') writes.push(request.postDataJSON());
    return route.fulfill({
      json: path.endsWith('/undo') ? { card: cards[1] } : {},
    });
  });
  await page.goto('/swipe');
  await expect(page.getByRole('heading', { name: 'First Film' })).toBeVisible();
  await page.screenshot({ path: info.outputPath('swipe.png'), fullPage: true });
  const shortcuts = page.getByRole('application', { name: 'Swipe shortcuts' });
  await shortcuts.press('ArrowRight');
  await expect(
    page.getByRole('heading', { name: 'Second Film' })
  ).toBeVisible();
  if (await page.evaluate(() => navigator.maxTouchPoints > 0)) {
    const title = page.getByRole('heading', { name: 'Second Film' });
    await title.scrollIntoViewIfNeeded();
    const bounds = (await title.boundingBox())!;
    const x = Math.round(bounds.x + Math.min(120, bounds.width - 10));
    const y = Math.round(bounds.y + bounds.height / 2);
    const touch = await page.context().newCDPSession(page);
    await touch.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x, y }],
    });
    await touch.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: x - 85, y }],
    });
    await touch.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
    await touch.detach();
  } else {
    await shortcuts.press('ArrowLeft');
  }
  await expect(
    page.getByText('No more recommendations in this deck.')
  ).toBeVisible();
  await shortcuts.press('Backspace');
  await expect(
    page.getByRole('heading', { name: 'Second Film' })
  ).toBeVisible();
  expect(writes).toEqual([
    { mediaType: 'movie', mediaId: 7 },
    { mediaType: 'movie', id: '7', decision: 'want' },
    { mediaType: 'movie', id: '8', decision: 'pass' },
    { mediaType: 'movie' },
  ]);
  await page.getByRole('button', { name: 'View Swipe History' }).click();
  await page
    .getByRole('combobox', { name: 'History Category' })
    .selectOption('movie');
  await expect(
    page.getByRole('button', { name: 'Restore Second Film' })
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath('swipe-history.png'),
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Restore Second Film' }).click();
  await expect(page.getByText('Second Film restored.')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Restore Second Film' })
  ).toHaveCount(0);
  await page
    .getByRole('button', { name: 'Clear History', exact: true })
    .click();
  await page.getByRole('button', { name: 'Confirm Clear History' }).click();
  await expect(page.getByText('Cleared 1 decisions.')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Restore Third Film' })
  ).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'View Requests' })).toBeVisible();
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
    if (path.endsWith('/swipe/favorites'))
      return route.fulfill({ json: [{ ...series, mediaType: 'tv' }] });
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
  await page
    .getByRole('combobox', { name: 'Recommendation Sources' })
    .selectOption('favorites');
  await page.getByRole('checkbox', { name: 'Fixture Series' }).check();
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
      seedScope: 'favorites',
      favoriteSeeds: [{ ...series, mediaType: 'tv' }],
    },
    { mediaType: 'tv', mediaId: 42, seasons: 'all' },
  ]);
});

test('Swipe catalog decisions preserve magazine identity and destination', async ({
  page,
}, info) => {
  const writes: unknown[] = [];
  const catalogQueries: string[] = [];
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    if (path.endsWith('/auth/me'))
      return route.fulfill({ json: { id: 1, permissions: 2 } });
    if (path.endsWith('/swipe/status'))
      return route.fulfill({
        json: { mediaTypes: ['magazine'], bookFormats: [] },
      });
    if (path.endsWith('/swipe/profile'))
      return route.fulfill({
        json: { seriesRequest: 'first-season', bookFormat: 'ebook' },
      });
    if (path.endsWith('/discover/magazines')) {
      catalogQueries.push(url.search);
      return route.fulfill({
        json: {
          results:
            url.searchParams.get('page') === '1'
              ? [
                  { id: 7, title: 'Old Issue' },
                  { id: 8, title: 'New Issue', serviceId: 2 },
                ]
              : [{ id: 9, title: 'Next Issue' }],
          totalPages: 2,
        },
      });
    }
    if (path.endsWith('/swipe/decisions') && request.method() === 'GET')
      return route.fulfill({
        json: { decisions: [{ id: 'Old Issue', decision: 'pass' }] },
      });
    if (request.method() === 'POST') writes.push(request.postDataJSON());
    return route.fulfill({ json: {} });
  });
  await page.goto('/swipe');
  await expect(page.getByRole('heading', { name: 'New Issue' })).toBeVisible();
  await page.getByText('Deck Filters', { exact: true }).click();
  await page
    .getByRole('combobox', { name: 'Magazine Catalog' })
    .selectOption('public');
  await page.getByLabel('Search Titles').fill('Issue');
  await page.getByRole('button', { name: 'Apply Filters' }).click();
  await expect
    .poll(() =>
      catalogQueries.some(
        (query) =>
          query.includes('catalog=public') && query.includes('query=Issue')
      )
    )
    .toBe(true);
  await page.screenshot({
    path: info.outputPath('swipe-catalog.png'),
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Request', exact: true }).click();
  await expect(page.getByText('New Issue requested.')).toBeVisible();
  await page.getByRole('button', { name: 'Load More Recommendations' }).click();
  await expect(page.getByRole('heading', { name: 'Next Issue' })).toBeVisible();
  expect(writes).toEqual([
    { mediaType: 'magazine', mediaId: 'New Issue', serverId: 2 },
    {
      mediaType: 'magazine',
      id: 'New Issue',
      decision: 'want',
      card: {
        mediaType: 'magazine',
        id: 'New Issue',
        title: 'New Issue',
        serviceId: 2,
        tags: [],
      },
    },
  ]);
});
