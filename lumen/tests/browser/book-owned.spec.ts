import { expect, test, type Page } from '@playwright/test';

// Shaped like SeerrNG 3.72.31: catalogues may carry server-resolved mediaInfo, while the
// owned list carries format-specific library state.
const ownedAudio = 'bookshelf:1:NDI4Mjkw';
const ownedAudioWork = 'bookshelf:1:aGM6NDU5NzQ0';
const audioOnlyEbookOwned = 'bookshelf:1:MjYwNDY4';
const paged = (results: unknown[]) => ({
  page: 1,
  totalPages: 1,
  totalResults: results.length,
  results,
});
const card = (
  id: string,
  title: string,
  author: string,
  extra: Record<string, unknown> = {}
) => ({
  id,
  mediaType: 'book',
  title,
  author,
  posterPath: 'https://covers.invalid/cover.jpg',
  ...extra,
});
const audioMedia = {
  status: 5,
  availableEbookServiceIds: [0],
  availableAudiobookServiceIds: [1],
  audiobookLibraryServiceId: 1,
  audiobookLibraryItemId: 'abs-item',
  hasPlexAudiobookFile: false,
};
const ebookMedia = {
  status: 5,
  availableEbookServiceIds: [0],
  availableAudiobookServiceIds: null,
  hasPlexAudiobookFile: false,
};
const audiobookOnlyMedia = {
  status: 5,
  availableEbookServiceIds: null,
  availableAudiobookServiceIds: [1],
  hasPlexAudiobookFile: false,
};
// The catalogue knows these works through an ebook, but there is no audiobook file.
const ebookOnlyMedia = {
  status: 5,
  availableEbookServiceIds: [0],
  availableAudiobookServiceIds: null,
  hasPlexAudiobookFile: false,
};
const audioFeed = [
  card(
    ownedAudio,
    'A Court of Thorns and Roses (10th Anniversary Recording)',
    'Sarah J. Maas',
    { provider: 'bookshelf', bookFormat: 'audiobook' }
  ),
  // the same Hardcover work under another spelling of its id
  card(
    'bookshelf:1:NDU5NzQ0',
    'A Court of Frost and Starlight (10th Anniversary Recording)',
    'Sarah J. Maas',
    { provider: 'bookshelf', bookFormat: 'audiobook' }
  ),
  card('bookshelf:1:OTk5OTk5', 'Not Owned Recording', 'Writer Two', {
    provider: 'bookshelf',
    bookFormat: 'audiobook',
    mediaInfo: ebookOnlyMedia,
  }),
  // only the ebook of this one is in the library
  card(audioOnlyEbookOwned, 'Wool', 'Hugh Howey', {
    provider: 'bookshelf',
    bookFormat: 'audiobook',
    mediaInfo: ebookOnlyMedia,
  }),
];
const ebookFeed = [
  card('OL15358691W', 'Throne of Glass', 'Sarah J. Maas', {
    provider: 'openlibrary',
    bookFormat: 'ebook',
    mediaInfo: ebookMedia,
  }),
  card('OL17860744W', 'Project Hail Mary', 'Andy Weir', {
    provider: 'openlibrary',
    bookFormat: 'ebook',
    mediaInfo: ebookMedia,
  }),
  card('OL66554W', 'Pride and Prejudice', 'Jane Austen', {
    provider: 'openlibrary',
    bookFormat: 'ebook',
  }),
  // same title, different author: not the owned book
  card('OL1W', 'Wool', 'Someone Else', {
    provider: 'openlibrary',
    bookFormat: 'ebook',
    mediaInfo: audiobookOnlyMedia,
  }),
  // A similar title and same author is a different Open Library work and must not inherit
  // the owned state from Project Hail Mary.
  card('OL2W', 'Project Hail Mary: Illustrated Edition', 'Andy Weir', {
    provider: 'openlibrary',
    bookFormat: 'ebook',
  }),
];
const library = {
  audiobook: [
    card(
      ownedAudio,
      'A Court of Thorns and Roses (10th Anniversary Recording)',
      'Sarah J. Maas',
      { mediaInfo: audioMedia }
    ),
    card(
      ownedAudioWork,
      'A Court of Frost and Starlight (10th Anniversary Recording)',
      'Sarah J. Maas',
      { mediaInfo: audioMedia }
    ),
  ],
  ebook: [
    card('bookshelf:0:Mzk2Mjk', 'Throne of Glass', 'Sarah J. Maas', {
      mediaInfo: ebookMedia,
    }),
    card('bookshelf:0:NDI3NTc4', 'Project Hail Mary: A Novel', 'Andy Weir', {
      mediaInfo: ebookMedia,
    }),
    card('bookshelf:0:MjYwNDY4', 'Wool', 'Hugh Howey', {
      mediaInfo: ebookMedia,
    }),
  ],
};

async function fixtures(
  page: Page,
  options: { libraryStatus?: number; libraryTotalPages?: number } = {}
) {
  const calls: string[] = [];
  await page.route('https://**/*', (r) => r.abort());
  await page.route('**/lumen-config.json', (r) => r.fulfill({ json: {} }));
  await page.route('**/seerr-classic/**', (r) =>
    r.fulfill({ status: 404, body: '' })
  );
  await page.route('**/api/v1/**', (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.slice(7);
    calls.push(path + url.search);
    const format =
      url.searchParams.get('format') === 'audiobook' ? 'audiobook' : 'ebook';
    if (path === '/auth/me')
      return route.fulfill({
        json: { id: 1, displayName: 'viewer', permissions: 2 },
      });
    if (path === '/settings/public')
      return route.fulfill({
        json: {
          mediaServerType: 1,
          booksEnabled: true,
          ebookServiceEnabled: true,
          audiobookServiceEnabled: true,
          enabledMediaCategories: { ebook: true, audiobook: true },
        },
      });
    if (path === '/request') return route.fulfill({ json: paged([]) });
    if (path === '/discover/books') {
      const q = (url.searchParams.get('query') || '').toLowerCase();
      const feed = format === 'audiobook' ? audioFeed : ebookFeed;
      return route.fulfill({
        json: paged(
          q ? feed.filter((b) => b.title.toLowerCase().includes(q)) : feed
        ),
      });
    }
    if (path === '/book/library') {
      if (options.libraryStatus && options.libraryStatus !== 200)
        return route.fulfill({
          status: options.libraryStatus,
          json: { message: 'Library unavailable' },
        });
      return route.fulfill({
        json: {
          ...paged(library[format]),
          page: Number(url.searchParams.get('page') || 1),
          totalPages: options.libraryTotalPages ?? 1,
          totalResults:
            options.libraryTotalPages === undefined
              ? library[format].length
              : Math.max(0, (options.libraryTotalPages - 1) * 50 + 1),
        },
      });
    }
    if (path.startsWith('/discover/genreslider/'))
      return route.fulfill({ json: [] });
    if (path.startsWith('/discover/') || path === '/search')
      return route.fulfill({ json: paged([]) });
    return route.fulfill({ json: {} });
  });
  return calls;
}

const poster = (page: Page, title: string) =>
  page.locator('.poster').filter({
    has: page.getByRole('link', { name: title, exact: true }),
  });
const expectOwned = async (page: Page, title: string, owned: boolean) => {
  const glyph = poster(page, title).locator('.glyph.ok');
  if (owned) {
    await expect(glyph).toHaveCount(1);
    await expect(glyph).toHaveAttribute('title', 'In library');
  } else await expect(glyph).toHaveCount(0);
};

test('audiobook cards show the books already in the library', async ({
  page,
}, info) => {
  const calls = await fixtures(page);
  await page.goto('/audiobooks');
  await expect(poster(page, 'Not Owned Recording')).toHaveCount(1);
  await expectOwned(
    page,
    'A Court of Thorns and Roses (10th Anniversary Recording)',
    true
  );
  await expectOwned(
    page,
    'A Court of Frost and Starlight (10th Anniversary Recording)',
    true
  );
  await expectOwned(page, 'Not Owned Recording', false);
  // owning the ebook is not owning the audiobook
  await expectOwned(page, 'Wool', false);
  await page.screenshot({
    path: info.outputPath('audiobooks-all.png'),
    fullPage: true,
  });

  await page.getByRole('button', { name: 'Not yet', exact: true }).click();
  await expect(poster(page, 'Not Owned Recording')).toHaveCount(1);
  await expect(poster(page, 'Wool')).toHaveCount(1);
  await expect(page.locator('.grid .poster')).toHaveCount(2);
  await page.screenshot({
    path: info.outputPath('audiobooks-not-yet.png'),
    fullPage: true,
  });

  await page.getByRole('button', { name: 'In library', exact: true }).click();
  await expect(page.locator('.grid .poster')).toHaveCount(2);
  await expect(page.locator('.grid .poster .glyph.ok')).toHaveCount(2);
  // the cards and the filters share the owned list instead of asking once per card (a
  // sign-in landing mid-read can make the cache ask a second time)
  expect(
    calls.filter((c) => c.startsWith('/book/library?format=audiobook')).length
  ).toBeLessThanOrEqual(2);
});

test('ebook cards use server-resolved Open Library identity without title guesses', async ({
  page,
}, info) => {
  await fixtures(page);
  await page.goto('/books');
  await expect(poster(page, 'Pride and Prejudice')).toHaveCount(1);
  await expectOwned(page, 'Throne of Glass', true);
  await expectOwned(page, 'Project Hail Mary', true);
  await expectOwned(page, 'Pride and Prejudice', false);
  await expectOwned(page, 'Wool', false);
  await expectOwned(page, 'Project Hail Mary: Illustrated Edition', false);
  await expect(
    poster(page, 'Pride and Prejudice').locator('.glyph.wait')
  ).toHaveAttribute('title', 'Library status unknown');
  const unknownBook = poster(page, 'Pride and Prejudice');
  if (info.project.name === 'desktop') {
    await unknownBook.hover();
    await expect(
      unknownBook.getByRole('button', { name: 'Request anyway' })
    ).toBeVisible();
  } else {
    await expect(
      unknownBook.getByRole('button', {
        name: 'Request Pride and Prejudice anyway; library status is unknown',
      })
    ).toBeVisible();
  }
  await page.screenshot({
    path: info.outputPath('ebooks-all.png'),
    fullPage: true,
  });

  await page.getByRole('button', { name: 'Not yet', exact: true }).click();
  await expect(page.locator('.note[role="status"]')).toContainText(
    'library status could not be confirmed'
  );
  await expect(page.locator('.grid .poster')).toHaveCount(1);
  await expect(poster(page, 'Wool')).toHaveCount(1);
  await page.screenshot({
    path: info.outputPath('ebooks-not-yet.png'),
    fullPage: true,
  });

  await page.getByRole('button', { name: 'In library', exact: true }).click();
  await expect(page.locator('.grid .poster')).toHaveCount(3);
});

test('Discover rows and search results mark owned books', async ({ page }) => {
  await fixtures(page);
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Popular audiobooks' })
  ).toBeVisible();
  await expectOwned(
    page,
    'A Court of Thorns and Roses (10th Anniversary Recording)',
    true
  );
  await expectOwned(page, 'Not Owned Recording', false);
  await expectOwned(page, 'Throne of Glass', true);
  await expectOwned(page, 'Pride and Prejudice', false);

  await page.goto('/search?f=audio&q=court');
  await expectOwned(
    page,
    'A Court of Thorns and Roses (10th Anniversary Recording)',
    true
  );
  await page.goto('/search?f=ebook&q=throne');
  await expectOwned(page, 'Throne of Glass', true);
});

test('Not yet hides results when the library check fails', async ({ page }) => {
  await fixtures(page, { libraryStatus: 503 });
  await page.goto('/books?show=not');

  await expect(page.getByRole('alert')).toContainText(
    'Library Check Unavailable'
  );
  await expect(page.locator('.grid .poster')).toHaveCount(0);
});

test('Not yet hides results when the library exceeds the bounded scan', async ({
  page,
}) => {
  const calls = await fixtures(page, { libraryTotalPages: 21 });
  await page.goto('/books?show=not');

  await expect(page.getByRole('alert')).toContainText(
    'Library Check Incomplete'
  );
  await expect(page.locator('.grid .poster')).toHaveCount(0);
  expect(
    calls.filter((call) => call.startsWith('/discover/books'))
  ).toHaveLength(1);
});

test('Not yet hides results when library pagination is malformed', async ({
  page,
}) => {
  await fixtures(page, { libraryTotalPages: 0 });
  await page.goto('/books?show=not');

  await expect(page.getByRole('alert')).toContainText(
    'Library Check Unavailable'
  );
  await expect(page.locator('.grid .poster')).toHaveCount(0);
});

test('server status stays visible while Not yet hides unverified books when the library is unavailable', async ({
  page,
}) => {
  await fixtures(page);
  await page.route('**/api/v1/book/library?**', (route) =>
    route.fulfill({
      status: 403,
      json: { message: 'Media category is disabled.' },
    })
  );
  await page.route('**/api/v1/discover/books?**', (route) =>
    route.fulfill({
      json: paged([
        card('bookshelf:1:MTIz', 'Marked By Server', 'Writer', {
          mediaInfo: audioMedia,
        }),
        card('bookshelf:1:NDU2', 'Unmarked', 'Writer'),
      ]),
    })
  );
  await page.goto('/audiobooks');
  await expectOwned(page, 'Marked By Server', true);
  await expectOwned(page, 'Unmarked', false);
  await page.getByRole('button', { name: 'Not yet', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText(
    'Library Check Unavailable'
  );
  await expect(page.locator('.grid .poster')).toHaveCount(0);
});
