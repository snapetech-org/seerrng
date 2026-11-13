import { expect, test, type Page } from '@playwright/test';

const ebookId = 'bookshelf:7:aGM6MTIzNDU';
const audioId = 'bookshelf:42:aGM6MTIzNDU';
const ownedId = 'bookshelf:93:aGM6OTg3NjU';
const book = (id: string, format: string, title: string, owned = false) => ({
  id,
  mediaType: 'book',
  bookFormat: format,
  title,
  author: 'Fixture Author',
  posterPath: null,
  mediaInfo: owned
    ? {
        status: 5,
        ...(format === 'ebook'
          ? { externalServiceId: 12, availableEbookServiceIds: [0] }
          : {
              audiobookLibraryServiceId: 9,
              audiobookLibraryItemId: 'abs-owned',
            }),
      }
    : undefined,
});

test('manager records do not mark missing book files available', async ({
  page,
}) => {
  await fixtures(page);
  await page.route('**/api/v1/discover/books?**', (route) =>
    route.fulfill({
      json: paged([
        {
          ...book('pending-manager', 'ebook', 'Manager only'),
          mediaInfo: {
            status: 5,
            externalServiceId: 12,
            audiobookExternalServiceId: 13,
          },
        },
        {
          ...book('imported-zero', 'ebook', 'Imported ebook'),
          mediaInfo: { status: 5, availableEbookServiceIds: [0] },
        },
        {
          ...book('other-format', 'ebook', 'Audio only'),
          mediaInfo: { status: 5, availableAudiobookServiceIds: [9] },
        },
        {
          ...book('plex-audio', 'audiobook', 'Plex audiobook'),
          mediaInfo: { status: 5, hasPlexAudiobookFile: true },
        },
      ]),
    })
  );
  await page.goto('/books?sort=ranked');
  for (const title of ['Manager only', 'Audio only', 'Plex audiobook'])
    await expect(
      page.locator('.poster', { hasText: title }).locator('.glyph.ok')
    ).toHaveCount(0);
  await expect(
    page.locator('.poster', { hasText: 'Imported ebook' }).locator('.glyph.ok')
  ).toHaveCount(1);
  await page.goto('/audiobooks?sort=ranked');
  for (const title of ['Manager only', 'Imported ebook'])
    await expect(
      page.locator('.poster', { hasText: title }).locator('.glyph.ok')
    ).toHaveCount(0);
  for (const title of ['Audio only', 'Plex audiobook'])
    await expect(
      page.locator('.poster', { hasText: title }).locator('.glyph.ok')
    ).toHaveCount(1);
});
test('Books and Audiobooks open on rows, one per sort', async ({ page }) => {
  const requests = await fixtures(page);
  const feed = () =>
    requests.filter((r) => r.path === '/discover/books').map((r) => r.query);
  await page.goto('/books');
  for (const name of [
    'In your library',
    'Trending',
    'New releases',
    'Top rated',
    'Popular',
  ])
    await expect(
      page.getByRole('heading', { name, exact: true })
    ).toBeVisible();
  for (const sortBy of ['trending', 'newest', 'rating.desc'])
    await expect.poll(feed).toContainEqual(`?format=ebook&sortBy=${sortBy}`);
  await expect.poll(feed).toContainEqual('?format=ebook');
  // the rows are one page each: the full list's paging stays quiet until See all
  expect(feed().some((q) => q.includes('page='))).toBe(false);
  await expect(page.getByLabel('Sort')).toHaveCount(0);
  // the library row marks what is owned
  const libraryRow = page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'In your library' }) });
  await expect(
    libraryRow
      .locator('.poster', { hasText: 'Owned outside popular' })
      .locator('.glyph.ok')
  ).toHaveCount(1);
  await expect(
    libraryRow.getByRole('link', { name: 'See all' })
  ).toHaveAttribute('href', '/books?show=have');

  await page.goto('/audiobooks');
  await expect(
    page.getByRole('heading', { name: 'Top rated', exact: true })
  ).toBeVisible();
  await expect
    .poll(feed)
    .toContainEqual('?format=audiobook&sortBy=rating.desc');
  await expect(
    page.getByText(/Lengths are the full|Request goes straight through/)
  ).toBeVisible();
});

test('See all opens the full list with that sort, and Overview or Back returns to the rows', async ({
  page,
}) => {
  const requests = await fixtures(page);
  const feed = () =>
    requests.filter((r) => r.path === '/discover/books').map((r) => r.query);
  await page.goto('/books');
  const row = (name: string) =>
    page
      .locator('section')
      .filter({ has: page.getByRole('heading', { name, exact: true }) });
  await row('Trending').getByRole('link', { name: 'See all' }).click();
  await expect(page).toHaveURL(/\/books\?sort=trending$/);
  await expect(page.getByLabel('Sort')).toHaveValue('trending');
  await expect(
    page.getByRole('heading', { name: 'Trending ebooks' })
  ).toBeVisible();
  await expect
    .poll(feed)
    .toContainEqual('?format=ebook&sortBy=trending&page=1');

  // Back is the rows again
  await page.goBack();
  await expect(page).toHaveURL(/\/books$/);
  await expect(
    page.getByRole('heading', { name: 'New releases', exact: true })
  ).toBeVisible();

  // Popular is the feed's default order: its list keeps sort=ranked so it stays a list
  await row('Popular').getByRole('link', { name: 'See all' }).click();
  await expect(page).toHaveURL(/\/books\?sort=ranked$/);
  await expect(page.getByLabel('Sort')).toHaveValue('ranked');
  await expect(
    page.getByRole('heading', { name: 'Popular ebooks' })
  ).toBeVisible();
  await expect.poll(feed).toContainEqual('?format=ebook&page=1');

  await page.getByRole('link', { name: 'Overview', exact: true }).click();
  await expect(page).toHaveURL(/\/books$/);
  await expect(
    page.getByRole('heading', { name: 'Top rated', exact: true })
  ).toBeVisible();
  await expect(page.getByLabel('Sort')).toHaveCount(0);

  // In library from the rows opens the library list
  await page.getByRole('button', { name: 'In library', exact: true }).click();
  await expect(page).toHaveURL(/\/books\?show=have$/);
  await expect(
    page.getByRole('heading', { name: 'In your library' })
  ).toBeVisible();
  await expect(
    page.locator('.grid .poster', { hasText: 'Owned outside popular' })
  ).toHaveCount(1);
  // All stays on the full list
  await page.getByRole('button', { name: 'All', exact: true }).click();
  await expect(page).toHaveURL(/\/books\?sort=ranked$/);
});

test('a row that fails does not take the others with it', async ({ page }) => {
  await fixtures(page);
  let fail = true;
  await page.route('**/api/v1/discover/books?**', (route) =>
    fail &&
    new URL(route.request().url()).searchParams.get('sortBy') === 'newest'
      ? route.fulfill({ status: 503, json: { message: 'Feed unavailable' } })
      : route.fallback()
  );
  await page.goto('/audiobooks');
  const row = (name: string) =>
    page
      .locator('section')
      .filter({ has: page.getByRole('heading', { name, exact: true }) });
  await expect(row('New releases')).toContainText('Couldn’t load this row');
  for (const name of ['Trending', 'Top rated', 'Popular'])
    await expect(
      row(name).getByRole('link', { name: 'Native audiobook', exact: true })
    ).toBeVisible();
  fail = false;
  await row('New releases').getByRole('button', { name: 'Retry' }).click();
  await expect(
    row('New releases').getByRole('link', {
      name: 'Native audiobook',
      exact: true,
    })
  ).toBeVisible();
});

test('Books and Audiobooks can be sorted like the SeerrNG web app', async ({
  page,
}) => {
  const requests = await fixtures(page);
  const feed = () =>
    requests.filter((r) => r.path === '/discover/books').map((r) => r.query);
  await page.goto('/books?sort=ranked');
  const sort = page.getByLabel('Sort');
  await expect(sort).toHaveValue('ranked');
  await expect(
    page.getByRole('heading', { name: 'Popular ebooks' })
  ).toBeVisible();
  await expect
    .poll(feed)
    .toContainEqual(expect.stringContaining('format=ebook'));
  expect(feed().some((q) => q.includes('sortBy='))).toBe(false);

  await sort.selectOption('newest');
  await expect(page).toHaveURL(/[?&]sort=newest/);
  await expect(page.getByRole('heading', { name: 'New ebooks' })).toBeVisible();
  await expect
    .poll(feed)
    .toContainEqual(expect.stringContaining('sortBy=newest'));

  // the library list has no sort, so the menu steps aside there
  await page.getByRole('button', { name: 'In library' }).click();
  await expect(page.getByLabel('Sort')).toHaveCount(0);

  await page.goto('/audiobooks?sort=rating.desc');
  await expect(page.getByLabel('Sort')).toHaveValue('rating.desc');
  await expect(
    page.getByRole('heading', { name: 'Top rated audiobooks' })
  ).toBeVisible();
  await expect
    .poll(feed)
    .toContainEqual(
      expect.stringMatching(/format=audiobook.*sortBy=rating\.desc/)
    );

  // an unknown sort in the address falls back to Popular
  await page.goto('/books?sort=bogus');
  await expect(page.getByLabel('Sort')).toHaveValue('ranked');
});
const paged = (results: unknown[]) => ({
  page: 1,
  totalPages: 1,
  totalResults: results.length,
  results,
});

async function fixtures(
  page: Page,
  opts: { config?: Record<string, unknown>; ownedAudiobook?: boolean } = {}
) {
  const requests: {
    path: string;
    query: string;
    body?: Record<string, unknown>;
  }[] = [];
  await page.route('https://**/*', (r) => r.abort());
  await page.route('**/lumen-config.json', (r) =>
    r.fulfill({ json: opts.config || {} })
  );
  await page.route('**/seerr-classic/**', (r) =>
    r.fulfill({ status: 404, body: '' })
  );
  await page.route('**/api/v1/**', (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname.slice(7);
    requests.push({
      path,
      query: url.search,
      ...(req.method() === 'POST' ? { body: req.postDataJSON() } : {}),
    });
    if (path === '/auth/me')
      return route.fulfill({
        json: { id: 1, displayName: 'viewer', permissions: 2 },
      });
    if (path === '/settings/public')
      return route.fulfill({
        json: {
          mediaServerType: 2,
          booksEnabled: true,
          ebookServiceEnabled: true,
          audiobookServiceEnabled: true,
          enabledMediaCategories: { ebook: true, audiobook: true },
        },
      });
    if (path === '/request')
      return route.fulfill({
        json:
          req.method() === 'POST'
            ? { id: 123 }
            : paged([
                {
                  status: 5,
                  bookFormat: 'ebook',
                  media: {
                    status: 5,
                    identifiers: [{ provider: 'bookshelf', value: ebookId }],
                  },
                },
              ]),
      });
    if (path === '/editions/book')
      // SeerrNG answers only when it also gets an identity; a bare term returns nothing
      return route.fulfill({
        json: {
          editions:
            url.searchParams.get('foreignBookId') === 'hc:12345'
              ? [
                  {
                    id: 'ed-1',
                    title: 'Native book detail',
                    format: 'audiobook',
                    language: 'eng',
                    narrators: ['Fixture Narrator'],
                    durationSeconds: 36000,
                  },
                ]
              : [],
        },
      });
    if (path === '/discover/books' || path === '/book/library') {
      const format = url.searchParams.get('format') || 'ebook';
      return route.fulfill({
        json: paged([
          path === '/book/library'
            ? book(ownedId, format, 'Owned outside popular', true)
            : book(
                format === 'ebook' ? ebookId : audioId,
                format,
                `Native ${format}`
              ),
        ]),
      });
    }
    if (path.startsWith('/book/'))
      return route.fulfill({
        json: book(
          decodeURIComponent(path.slice(6)),
          opts.ownedAudiobook || url.searchParams.get('f') === 'audio'
            ? 'audiobook'
            : 'ebook',
          'Native book detail',
          !!opts.ownedAudiobook
        ),
      });
    return route.fulfill({ json: {} });
  });
  return requests;
}

for (const format of ['ebook', 'audiobook'] as const) {
  test(`${format} keeps arbitrary native IDs, missing-cover titles and actual library inventory`, async ({
    page,
  }, info) => {
    const requests = await fixtures(page);
    await page.goto(
      format === 'ebook' ? '/books?sort=ranked' : '/audiobooks?sort=ranked'
    );
    const native = page.getByRole('link', {
      name: `Native ${format}`,
      exact: true,
    });
    await expect(native).toBeVisible();
    await expect(native).toHaveAttribute(
      'href',
      `/book/${encodeURIComponent(format === 'ebook' ? ebookId : audioId)}${format === 'audiobook' ? '?f=audio' : ''}`
    );
    await page.getByRole('button', { name: 'In library', exact: true }).click();
    await expect(
      page.getByRole('link', { name: 'Owned outside popular', exact: true })
    ).toBeVisible();
    await page.screenshot({
      path: info.outputPath(`${format}-library.png`),
      fullPage: true,
    });
    expect(
      requests.some(
        (r) =>
          r.path === '/book/library' && r.query.includes(`format=${format}`)
      )
    ).toBe(true);
    expect(
      requests.some(
        (r) =>
          r.path === '/discover/books' && r.query.includes(`format=${format}`)
      )
    ).toBe(true);
  });
}

test('native ebook search works without a companion and retains its service-owned request identity', async ({
  page,
}) => {
  const requests = await fixtures(page);
  await page.goto('/search?f=ebook&q=rare');
  const native = page.getByRole('link', { name: 'Native ebook', exact: true });
  await expect(native).toBeVisible();
  await expect(native).toHaveAttribute(
    'href',
    `/book/${encodeURIComponent(ebookId)}`
  );
  await native.locator('..').hover();
  const quick = page.getByRole('button', {
    name: 'Request ebook',
    exact: true,
  });
  if (await quick.isVisible()) await quick.click();
  else
    await page
      .getByRole('button', {
        name: 'Request Native ebook (ebook)',
        exact: true,
      })
      .click();
  await expect
    .poll(() => requests.filter((r) => r.body?.mediaType === 'book').length)
    .toBe(1);
  expect(
    requests.find((r) => r.body?.mediaType === 'book')?.body
  ).toMatchObject({ mediaId: ebookId, format: 'ebook' });
  expect(
    requests.some(
      (r) => r.path === '/discover/books' && r.query.includes('query=rare')
    )
  ).toBe(true);
});

test('an owned audiobook opens in Audiobookshelf when the admin set its address', async ({
  page,
}) => {
  await fixtures(page, {
    ownedAudiobook: true,
    config: { audiobookshelfUrl: 'https://books.example.com/' },
  });
  await page.goto(`/book/${encodeURIComponent(ownedId)}?f=audio`);
  await expect(
    page.getByRole('link', { name: 'Listen in Audiobookshelf' })
  ).toHaveAttribute('href', 'https://books.example.com/item/abs-owned');
});

test('without an Audiobookshelf address an owned book shows its status, not a dead button', async ({
  page,
}) => {
  await fixtures(page, {
    ownedAudiobook: true,
    config: { audiobookshelfUrl: 'javascript:alert(1)' },
  });
  await page.goto(`/book/${encodeURIComponent(ownedId)}?f=audio`);
  await expect(
    page.getByRole('button', { name: 'In your library' })
  ).toBeDisabled();
  await expect(page.getByText('Listen in Audiobookshelf')).toHaveCount(0);
});

test('an audiobook page lists narrations from SeerrNG editions', async ({
  page,
}) => {
  const requests = await fixtures(page);
  await page.goto(`/book/${encodeURIComponent(audioId)}?f=audio`);
  await expect(page.getByText('Fixture Narrator').first()).toBeVisible();
  expect(
    requests.some(
      (r) =>
        r.path === '/editions/book' &&
        r.query.includes('foreignBookId=hc%3A12345')
    )
  ).toBe(true);
});

test('a passing book lookup failure offers Retry instead of “no ebook”', async ({
  page,
}) => {
  await fixtures(page);
  let status = 404;
  await page.route(/\/api\/v1\/book\/bookshelf[^/?]*$/, (route) =>
    status === 200
      ? route.fallback()
      : route.fulfill({ status, json: { message: 'Too many requests' } })
  );
  // a real "not found" points to the audiobook
  await page.goto(`/book/${encodeURIComponent(ebookId)}`);
  await expect(page.getByText('No ebook edition found')).toBeVisible();

  status = 429;
  await page.reload();
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('Couldn’t load this book');
  await expect(page.getByText('No ebook edition found')).toHaveCount(0);
  status = 200;
  await alert.getByRole('button', { name: 'Retry' }).click();
  await expect(
    page.getByRole('heading', { name: 'Native book detail' })
  ).toBeVisible();
});

test('a failed movie page can be retried', async ({ page }) => {
  await fixtures(page);
  let fail = true;
  await page.route('**/api/v1/movie/77', (route) =>
    fail
      ? route.fulfill({
          status: 503,
          json: { message: 'Provider unavailable' },
        })
      : route.fulfill({
          json: {
            id: 77,
            title: 'Retry Film',
            genres: [],
            releaseDate: '2020-01-01',
          },
        })
  );
  await page.route('**/api/v1/movie/77/recommendations', (route) =>
    route.fulfill({ json: paged([]) })
  );
  await page.goto('/movie/77');
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('Couldn’t load this movie');
  fail = false;
  await alert.getByRole('button', { name: 'Retry' }).click();
  await expect(page.getByRole('heading', { name: 'Retry Film' })).toBeVisible();
});

test('Audiobookshelf links retain a path prefix and omit query tokens and fragments', async ({
  page,
}) => {
  await fixtures(page, {
    ownedAudiobook: true,
    config: {
      audiobookshelfUrl:
        'https://books.example.com/abs/?token=must-not-forward#shelf',
    },
  });
  await page.goto(`/book/${encodeURIComponent(ownedId)}?f=audio`);
  await expect(
    page.getByRole('link', { name: 'Listen in Audiobookshelf' })
  ).toHaveAttribute('href', 'https://books.example.com/abs/item/abs-owned');
});
test('Audiobookshelf credentials never become a public owned-book link', async ({
  page,
}) => {
  await fixtures(page, {
    ownedAudiobook: true,
    config: { audiobookshelfUrl: 'https://user:secret@books.example.com/' },
  });
  await page.goto(`/book/${encodeURIComponent(ownedId)}?f=audio`);
  await expect(
    page.getByRole('button', { name: 'In your library' })
  ).toBeDisabled();
  await expect(
    page.getByRole('link', { name: 'Listen in Audiobookshelf' })
  ).toHaveCount(0);
});
test('owning the audiobook still offers the ebook', async ({ page }) => {
  await fixtures(page);
  await page.route('**/api/v1/book/bookshelf*', (route) =>
    route.fulfill({
      json: {
        ...book(ebookId, 'ebook', 'Audio only book'),
        mediaInfo: {
          status: 5,
          availableEbookServiceIds: [],
          availableAudiobookServiceIds: [1],
          audiobookLibraryServiceId: 9,
          audiobookLibraryItemId: 'abs-audio',
        },
      },
    })
  );
  await page.goto(`/book/${encodeURIComponent(ebookId)}`);
  await expect(
    page.getByRole('button', { name: 'Request ebook' })
  ).toBeVisible();
  await expect(page.getByText('Read in Audiobookshelf')).toHaveCount(0);
});

test('a book page shows a requested format as requested, not as Request again', async ({
  page,
}) => {
  await fixtures(page);
  await page.route('**/api/v1/book/bookshelf*', (route) =>
    route.fulfill({
      json: {
        ...book(ebookId, 'ebook', 'Requested ebook'),
        mediaInfo: {
          status: 5,
          availableEbookServiceIds: [],
          availableAudiobookServiceIds: [1],
          audiobookLibraryServiceId: 9,
          audiobookLibraryItemId: 'abs-audio',
          requests: [{ id: 9, status: 2, bookFormat: 'ebook' }],
        },
      },
    })
  );
  await page.goto(`/book/${encodeURIComponent(ebookId)}`);
  await expect(page.locator('h1')).toContainText('Requested ebook');
  await expect(page.getByRole('button', { name: 'Request ebook' })).toHaveCount(
    0
  );
});

test('requesting the audiobook does not mark the ebook as requested', async ({
  page,
}) => {
  await fixtures(page);
  await page.route('**/api/v1/book/bookshelf*', (route) =>
    route.fulfill({
      json: {
        ...book(ebookId, 'ebook', 'Audio requested'),
        mediaInfo: {
          status: 3,
          requests: [{ id: 10, status: 2, bookFormat: 'audiobook' }],
        },
      },
    })
  );
  await page.goto(`/book/${encodeURIComponent(ebookId)}`);
  await expect(
    page.getByRole('button', { name: 'Request ebook' })
  ).toBeVisible();
});

for (const [label, request, requested] of [
  ['both formats', { status: 2, bookFormat: 'both' }, true],
  ['legacy ebook', { status: 1 }, true],
  [
    'active handoff',
    {
      status: 5,
      bookFormat: 'ebook',
      serviceTargets: [{ serviceType: 'readarr', format: 'ebook', status: 3 }],
    },
    true,
  ],
  [
    'completed handoff',
    {
      status: 5,
      bookFormat: 'ebook',
      serviceTargets: [{ serviceType: 'readarr', format: 'ebook', status: 5 }],
    },
    false,
  ],
  [
    'opposite handoff',
    {
      status: 5,
      bookFormat: 'both',
      serviceTargets: [
        { serviceType: 'readarr', format: 'audiobook', status: 3 },
      ],
    },
    false,
  ],
] as const) {
  test(`ebook detail scopes ${label} request state`, async ({ page }) => {
    await fixtures(page);
    await page.route('**/api/v1/book/bookshelf*', (route) =>
      route.fulfill({
        json: {
          ...book(ebookId, 'ebook', 'Request state fixture'),
          mediaInfo: { status: 3, requests: [request] },
        },
      })
    );
    await page.goto(`/book/${encodeURIComponent(ebookId)}`);
    await expect(page.locator('h1')).toContainText('Request state fixture');
    await expect(
      page.getByRole('button', { name: 'Request ebook' })
    ).toHaveCount(requested ? 0 : 1);
  });
}

test('audiobook search offers books the audiobook catalogue has not seen yet', async ({
  page,
}) => {
  await fixtures(page);
  await page.route('**/api/v1/settings/public', (route) =>
    route.fulfill({
      json: {
        mediaServerType: 2,
        booksEnabled: true,
        ebookServiceEnabled: false,
        audiobookServiceEnabled: true,
        enabledMediaCategories: { ebook: false, audiobook: true },
      },
    })
  );
  const asked: string[] = [];
  await page.route('**/api/v1/discover/books?**', (route) => {
    const url = new URL(route.request().url());
    const format = url.searchParams.get('format') || '';
    asked.push(format);
    return route.fulfill({
      json: paged(
        format === 'ebook'
          ? [
              {
                ...book('OL123W', 'ebook', 'Brand New Book'),
                bookFormat: undefined,
              },
            ]
          : []
      ),
    });
  });
  await page.route('**/api/v1/book/search?**', (route) =>
    route.fulfill({
      json: paged([
        book('OL123W', 'ebook', 'Brand New Book'),
        book('bookshelf:7:ZXhhbXBsZQ', 'ebook', 'Ebook-only manager record'),
      ]),
    })
  );
  await page.goto('/search?q=brand%20new&f=audio');
  const card = page.locator('.poster', { hasText: 'Brand New Book' });
  await expect(card).toHaveCount(1);
  await expect(card).toHaveClass(/sq/);
  await expect(card.locator('a.hit')).toHaveAttribute(
    'href',
    '/book/OL123W?f=audio'
  );
  expect(asked).toEqual(['audiobook']);
  await expect(page.getByText('Ebook-only manager record')).toHaveCount(0);
});

test('cards without art get a drawn cover, and the title opens the book', async ({
  page,
}) => {
  await fixtures(page);
  await page.route('**/api/v1/discover/books?**', (route) =>
    route.fulfill({
      json: paged([
        book('no-art', 'ebook', 'Book Without Art'),
        {
          ...book('broken-art', 'ebook', 'Broken Art'),
          // external images are aborted by the fixtures, so this one fails to load
          posterPath: 'https://covers.invalid/broken.jpg',
        },
      ]),
    })
  );
  await page.goto('/books?sort=ranked');
  for (const title of ['Book Without Art', 'Broken Art'])
    await expect(
      page.locator('.poster', { hasText: title }).locator('.nocover')
    ).toHaveAttribute('data-title', title);
  await expect(
    page.locator('.poster', { hasText: 'Broken Art' }).locator('img')
  ).toHaveCount(0);
  await page
    .locator('.poster', { hasText: 'Book Without Art' })
    .locator('a.t')
    .click();
  await expect(page).toHaveURL(/\/book\/no-art$/);
});

for (const status of [403, 429, 503]) {
  test(`audiobook fallback preserves catalogue status ${status}`, async ({
    page,
  }) => {
    await fixtures(page);
    let fallbackCalls = 0;
    await page.route('**/api/v1/discover/books?**', (route) =>
      route.fulfill({
        status,
        json: { message: 'Catalogue fixture unavailable' },
      })
    );
    await page.route('**/api/v1/book/search?**', (route) => {
      fallbackCalls++;
      return route.fulfill({
        json: paged([book('OL123W', 'ebook', 'Fallback work')]),
      });
    });
    await page.goto('/search?q=fallback&f=audio');
    if (status === 503)
      await expect(
        page.locator('.poster', { hasText: 'Fallback work' })
      ).toHaveCount(1);
    else
      await expect(page.getByRole('alert')).toContainText(
        'Catalogue fixture unavailable'
      );
    expect(fallbackCalls).toBe(status === 503 ? 1 : 0);
  });
}
test('a failed uncatalogued audiobook metadata lookup remains retryable', async ({
  page,
}) => {
  await fixtures(page);
  await page.route('**/api/v1/discover/books?**', (route) =>
    route.fulfill({ json: paged([]) })
  );
  await page.route('**/api/v1/book/search?**', (route) =>
    route.fulfill({
      status: 503,
      json: { message: 'Metadata fixture unavailable' },
    })
  );
  await page.goto('/search?q=unseen&f=audio');
  await expect(page.getByRole('alert')).toContainText(
    'Metadata fixture unavailable'
  );
  await expect(
    page.getByRole('button', { name: 'Retry', exact: true })
  ).toBeVisible();
});
test('catalogued audiobook results do not trigger an extra metadata search', async ({
  page,
}) => {
  await fixtures(page);
  let fallbackCalls = 0;
  await page.route('**/api/v1/discover/books?**', (route) =>
    route.fulfill({ json: paged([book(audioId, 'audiobook', 'Known audio')]) })
  );
  await page.route('**/api/v1/book/search?**', (route) => {
    fallbackCalls++;
    return route.fulfill({ json: paged([]) });
  });
  await page.goto('/search?q=known&f=audio');
  await expect(page.locator('.poster', { hasText: 'Known audio' })).toHaveCount(
    1
  );
  expect(fallbackCalls).toBe(0);
});
test('a card title keeps the existing keyboard target and cannot render title markup', async ({
  page,
}) => {
  await fixtures(page);
  const title =
    'Quoted "title" <img id="injected-cover" src=x onerror=alert(1)>';
  await page.route('**/api/v1/discover/books?**', (route) =>
    route.fulfill({ json: paged([book('OL123W', 'ebook', title)]) })
  );
  await page.goto('/books?sort=ranked');
  const card = page.locator('.poster');
  await expect(card.locator('.nocover')).toHaveAttribute('data-title', title);
  await expect(page.locator('#injected-cover')).toHaveCount(0);
  const titleGeometry = await card.locator('a.t').evaluate((element) => ({
    height: element.getBoundingClientRect().height,
    lineHeight: parseFloat(getComputedStyle(element).lineHeight),
  }));
  expect(titleGeometry.height).toBeLessThanOrEqual(
    titleGeometry.lineHeight + 1
  );
  await expect(
    card.getByRole('link', { name: title, exact: true })
  ).toHaveCount(1);
  expect(
    await card
      .locator('a')
      .evaluateAll((links) => links.filter((a) => a.tabIndex >= 0).length)
  ).toBe(1);
  await card.locator('a.hit').focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/book\/OL123W$/);
});
