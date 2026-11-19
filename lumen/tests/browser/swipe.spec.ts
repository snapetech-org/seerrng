import { expect, test } from '@playwright/test';

const testAppPath = (path: string) =>
  `${process.env.LUMEN_TEST_MOUNT === '/lumen' ? '/lumen' : ''}${path}`;

test('Swipe records decisions and restores or clears history', async ({
  page,
}, info) => {
  const cards = [
    {
      id: '7',
      title: 'First Film',
      overview: 'A fixture recommendation.',
      imageUrl: '/imageproxy/tmdb/t/p/w342/cover.png?v=1',
    },
    { id: '8', title: 'Second Film', imageUrl: '/imageproxy/\tcover.png' },
  ];
  let decisions = [
    { mediaType: 'movie', id: '7', title: 'First Film', decision: 'want' },
    { mediaType: 'movie', id: '8', title: 'Second Film', decision: 'pass' },
    { mediaType: 'movie', id: '9', title: 'Third Film', decision: 'seen' },
  ];
  const writes: unknown[] = [];
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/imageproxy/**', (route) =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="64"><rect width="48" height="64" fill="#456"/></svg>',
    })
  );
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
  await page.goto(testAppPath('/swipe'));
  await expect(page.getByRole('heading', { name: 'First Film' })).toBeVisible();
  await expect(page.locator('.gesture-surface img')).toHaveAttribute(
    'src',
    '/imageproxy/tmdb/t/p/w342/cover.png?v=1'
  );
  await page.screenshot({ path: info.outputPath('swipe.png'), fullPage: true });
  const shortcuts = page.getByRole('application', { name: 'Swipe shortcuts' });
  await shortcuts.press('ArrowRight');
  await expect(
    page.getByRole('heading', { name: 'Second Film' })
  ).toBeVisible();
  await expect(page.locator('.gesture-surface img')).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('swipe-malformed-art.png') });
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
  const decisions: unknown[] = [];
  let attempts = 0;
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
    if (path.endsWith('/request')) {
      calls.push(request.postDataJSON());
      attempts++;
      if (attempts === 2)
        return route.fulfill({
          status: 403,
          json: {
            code: 'STREAMING_REQUEST_POLICY_REJECTED',
            allowOverride: true,
            message: 'Available on your streaming service.',
          },
        });
      return route.fulfill(
        attempts === 1
          ? { status: 202, json: { message: 'No seasons available.' } }
          : { status: 201, json: { id: 19 } }
      );
    }
    if (path.endsWith('/swipe/decisions') && request.method() === 'POST')
      decisions.push(request.postDataJSON());
    return route.fulfill({ json: {} });
  });
  await page.goto(testAppPath('/swipe'));
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
  await expect(page.getByText('No selected seasons were added.')).toBeVisible();
  expect(decisions).toEqual([]);
  await page.screenshot({
    path: info.outputPath('swipe-tv-unconfirmed.png'),
    animations: 'disabled',
  });
  await page.getByRole('button', { name: 'Request', exact: true }).click();
  const confirmation = page.getByRole('alertdialog', {
    name: 'Streaming Request Policy',
  });
  await expect(
    confirmation.getByText('Available on your streaming service.')
  ).toBeVisible();
  expect(decisions).toEqual([]);
  await confirmation.getByRole('button', { name: 'Request Anyway' }).click();
  await expect(page.getByText('Fixture Series requested.')).toBeVisible();
  expect(decisions).toHaveLength(1);
  expect(calls).toEqual([
    {
      seriesRequest: 'all-seasons',
      bookFormat: 'ebook',
      tasteNotes: 'Slow mysteries',
      seedScope: 'favorites',
      favoriteSeeds: [{ ...series, mediaType: 'tv' }],
    },
    { mediaType: 'tv', mediaId: 42, seasons: 'all' },
    { mediaType: 'tv', mediaId: 42, seasons: 'all' },
    {
      mediaType: 'tv',
      mediaId: 42,
      seasons: 'all',
      bypassStreamingRequestPolicy: true,
    },
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
  await page.goto(testAppPath('/swipe'));
  await expect(page.getByRole('heading', { name: 'New Issue' })).toBeVisible();
  await page.getByLabel('Search Titles').fill('Issue');
  await page.getByRole('button', { name: 'Search Deck' }).click();
  await page.getByText('Deck Filters', { exact: true }).click();
  await expect(
    page.locator('details.adv').getByLabel('Search Titles')
  ).toHaveCount(0);
  await page
    .getByRole('combobox', { name: 'Magazine Catalog' })
    .selectOption('public');
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

test('Swipe software requests use the chosen PC variant and next catalog offset', async ({
  page,
}, info) => {
  const writes: unknown[] = [];
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
        json: { mediaTypes: ['software-game'], bookFormats: [] },
      });
    if (path.endsWith('/swipe/profile'))
      return route.fulfill({
        json: { seriesRequest: 'first-season', bookFormat: 'ebook' },
      });
    if (path.endsWith('/catalog/popular')) {
      const next = url.searchParams.get('offset') === '37';
      return route.fulfill({
        json: {
          results: [
            {
              id: next ? 83 : 82,
              title: next ? 'Next Game' : 'First Game',
              platformOptions: [{ name: 'Windows' }],
            },
          ],
          nextOffset: next ? null : 37,
        },
      });
    }
    if (path.endsWith('/swipe/decisions') && request.method() === 'GET')
      return route.fulfill({ json: { decisions: [] } });
    if (request.method() === 'POST')
      writes.push({ path, body: request.postDataJSON() });
    return route.fulfill({ json: {} });
  });
  await page.goto(testAppPath('/swipe'));
  await expect(page.getByRole('heading', { name: 'First Game' })).toBeVisible();
  const request = page.getByRole('button', { name: 'Request', exact: true });
  await expect(request).toBeDisabled();
  await page
    .getByRole('combobox', { name: 'PC Variant' })
    .selectOption({ label: 'Windows · arm64' });
  await page.screenshot({
    path: info.outputPath('swipe-software.png'),
    fullPage: true,
  });
  await request.click();
  await expect(page.getByText('First Game requested.')).toBeVisible();
  await page.getByRole('button', { name: 'Load More Recommendations' }).click();
  await expect(page.getByRole('heading', { name: 'Next Game' })).toBeVisible();
  await expect(request).toBeDisabled();
  expect(writes[0]).toEqual({
    path: '/api/v1/request/software',
    body: {
      category: 'game',
      catalogProvider: 'igdb',
      catalogId: 82,
      variant: { operatingSystem: 'windows', architecture: 'arm64' },
    },
  });
  expect(writes[1]).toMatchObject({
    path: '/api/v1/swipe/decisions',
    body: {
      mediaType: 'software-game',
      id: '82',
      decision: 'want',
      card: { software: { category: 'game', catalogId: '82' } },
    },
  });
});

test('Swipe software title search follows and retains the catalog cursor', async ({
  page,
}) => {
  const searches: URLSearchParams[] = [];
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
        json: { mediaTypes: ['software-game'], bookFormats: [] },
      });
    if (path.endsWith('/swipe/profile'))
      return route.fulfill({
        json: { seriesRequest: 'first-season', bookFormat: 'ebook' },
      });
    if (path.endsWith('/request/software/catalog/search')) {
      searches.push(url.searchParams);
      const next = url.searchParams.get('cursor') === 'cursor-2';
      return route.fulfill({
        json: {
          results: [
            {
              id: next ? 83 : 82,
              catalogId: String(next ? 83 : 82),
              title: next ? 'Next Search Result' : 'First Search Result',
              platformOptions: [{ name: 'Windows' }],
            },
          ],
          nextCursor: next ? null : 'cursor-2',
        },
      });
    }
    if (path.endsWith('/swipe/decisions') && request.method() === 'GET')
      return route.fulfill({ json: { decisions: [] } });
    return route.fulfill({ json: {} });
  });

  await page.goto(testAppPath('/swipe'));
  await page
    .getByRole('combobox', { name: 'Category' })
    .selectOption('software-game');
  await page.getByLabel('Search Titles').fill('Search');
  await page.getByRole('button', { name: 'Search Deck' }).click();
  await expect(
    page.getByRole('heading', { name: 'First Search Result' })
  ).toBeVisible();
  expect(searches[0]?.get('q')).toBe('Search');
  expect(searches[0]?.has('cursor')).toBe(false);

  await page.getByRole('button', { name: 'Pass', exact: true }).click();
  await page.getByRole('button', { name: 'Load More Recommendations' }).click();
  await expect(
    page.getByRole('heading', { name: 'Next Search Result' })
  ).toBeVisible();
  expect(searches[1]?.get('q')).toBe('Search');
  expect(searches[1]?.get('cursor')).toBe('cursor-2');
});

test('Swipe software decks preserve category filters and exact request targets', async ({
  page,
}, info) => {
  const catalogQueries: URLSearchParams[] = [];
  const requests: unknown[] = [];
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
        json: {
          mediaTypes: ['software-retro', 'software-modern', 'software-game'],
          bookFormats: [],
        },
      });
    if (path.endsWith('/swipe/profile'))
      return route.fulfill({
        json: { seriesRequest: 'first-season', bookFormat: 'ebook' },
      });
    if (path.endsWith('/request/software/catalog/popular')) {
      catalogQueries.push(url.searchParams);
      const category = url.searchParams.get('category');
      const result = {
        retro: {
          id: 'retro-1',
          catalogId: 'retro-1',
          igdbId: 101,
          catalogProvider: 'igdb',
          title: 'Retro Fixture',
          tags: ['platform'],
          emulationSystems: [
            { slug: 'snes', name: 'Super Nintendo', group: 'retro' },
          ],
        },
        modern: {
          id: 'modern-1',
          catalogId: 'modern-1',
          igdbId: 102,
          catalogProvider: 'igdb',
          title: 'Modern Fixture',
          emulationSystems: [
            { slug: 'ps5', name: 'PlayStation 5', group: 'modern' },
          ],
        },
        game: {
          id: '82',
          catalogId: '82',
          igdbId: 82,
          catalogProvider: 'igdb',
          title: 'PC Fixture',
          platformOptions: [{ id: 6, name: 'PC (Microsoft Windows)' }],
        },
      }[category ?? ''];
      return route.fulfill({
        json: { results: result ? [result] : [], nextOffset: null },
      });
    }
    if (path.endsWith('/swipe/decisions') && request.method() === 'GET')
      return route.fulfill({ json: { decisions: [] } });
    if (request.method() === 'POST' && path.endsWith('/request/software'))
      requests.push({ path, body: request.postDataJSON() });
    return route.fulfill({ json: {} });
  });

  await page.goto(testAppPath('/swipe'));
  const category = page.getByRole('combobox', { name: 'Category' });
  await category.selectOption('software-retro');
  await expect(
    page.getByRole('heading', { name: 'Retro Fixture' })
  ).toBeVisible();
  await page.getByText('Deck Filters', { exact: true }).click();
  await page.getByLabel('Genre or Subject').fill('platform');
  await page.getByRole('button', { name: 'Apply Filters' }).click();
  await expect
    .poll(() =>
      catalogQueries.some((query) => query.get('genre') === 'platform')
    )
    .toBe(true);
  await page.getByRole('combobox', { name: 'Target System' }).selectOption('0');
  await page.evaluate(() =>
    window.scrollTo(0, document.documentElement.scrollHeight)
  );
  await expect
    .poll(async () => {
      const tabbar = page.locator('.tabbar');
      if (!(await tabbar.isVisible())) return true;
      const tabs = await tabbar.boundingBox();
      const undo = await page
        .getByRole('button', { name: 'Undo Last Decision' })
        .boundingBox();
      return !!tabs && !!undo && undo.y + undo.height <= tabs.y;
    })
    .toBe(true);
  await page.screenshot({
    path: info.outputPath('software-retro.png'),
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Request', exact: true }).click();
  await expect(page.getByText('Retro Fixture requested.')).toBeVisible();

  await category.selectOption('software-modern');
  await expect(
    page.getByRole('heading', { name: 'Modern Fixture' })
  ).toBeVisible();
  await page.getByRole('combobox', { name: 'Target System' }).selectOption('0');
  await page.evaluate(() =>
    window.scrollTo(0, document.documentElement.scrollHeight)
  );
  await expect
    .poll(async () => {
      const tabbar = page.locator('.tabbar');
      if (!(await tabbar.isVisible())) return true;
      const tabs = await tabbar.boundingBox();
      const undo = await page
        .getByRole('button', { name: 'Undo Last Decision' })
        .boundingBox();
      return !!tabs && !!undo && undo.y + undo.height <= tabs.y;
    })
    .toBe(true);
  await page.screenshot({
    path: info.outputPath('software-modern.png'),
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Request', exact: true }).click();
  await expect(page.getByText('Modern Fixture requested.')).toBeVisible();

  await category.selectOption('software-game');
  await expect(page.getByRole('heading', { name: 'PC Fixture' })).toBeVisible();
  await page
    .getByRole('combobox', { name: 'PC Variant' })
    .selectOption({ label: 'Windows · x64' });
  await page.evaluate(() =>
    window.scrollTo(0, document.documentElement.scrollHeight)
  );
  await expect
    .poll(async () => {
      const tabbar = page.locator('.tabbar');
      if (!(await tabbar.isVisible())) return true;
      const tabs = await tabbar.boundingBox();
      const undo = await page
        .getByRole('button', { name: 'Undo Last Decision' })
        .boundingBox();
      return !!tabs && !!undo && undo.y + undo.height <= tabs.y;
    })
    .toBe(true);
  await page.screenshot({
    path: info.outputPath('software-game.png'),
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Request', exact: true }).click();
  await expect(page.getByText('PC Fixture requested.')).toBeVisible();

  expect(requests).toEqual([
    {
      path: '/api/v1/request/software',
      body: {
        category: 'retro',
        catalogProvider: 'igdb',
        catalogId: 101,
        platformSlug: 'snes',
      },
    },
    {
      path: '/api/v1/request/software',
      body: {
        category: 'modern',
        catalogProvider: 'igdb',
        catalogId: 102,
        platformSlug: 'ps5',
      },
    },
    {
      path: '/api/v1/request/software',
      body: {
        category: 'game',
        catalogProvider: 'igdb',
        catalogId: 82,
        variant: { operatingSystem: 'windows', architecture: 'x64' },
      },
    },
  ]);
});
