import { expect, test, type Page } from '@playwright/test';

// Shaped like SeerrNG 3.72.31: the catalogue feeds carry no mediaInfo, the owned list does.
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
  }),
  // only the ebook of this one is in the library
  card(audioOnlyEbookOwned, 'Wool', 'Hugh Howey', {
    provider: 'bookshelf',
    bookFormat: 'audiobook',
  }),
];
const ebookFeed = [
  card('OL15358691W', 'Throne of Glass', 'Sarah J. Maas', {
    provider: 'openlibrary',
    bookFormat: 'ebook',
  }),
  card('OL17860744W', 'Project Hail Mary', 'Andy Weir', {
    provider: 'openlibrary',
    bookFormat: 'ebook',
  }),
  card('OL66554W', 'Pride and Prejudice', 'Jane Austen', {
    provider: 'openlibrary',
    bookFormat: 'ebook',
  }),
  // same title, different author: not the owned book
  card('OL1W', 'Wool', 'Someone Else', {
    provider: 'openlibrary',
    bookFormat: 'ebook',
  }),
];
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

async function fixtures(page: Page) {
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
    if (path === '/book/library')
      return route.fulfill({ json: paged(library[format]) });
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
}) => {
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

  await page.getByRole('button', { name: 'Not yet', exact: true }).click();
  await expect(poster(page, 'Not Owned Recording')).toHaveCount(1);
  await expect(poster(page, 'Wool')).toHaveCount(1);
  await expect(page.locator('.grid .poster')).toHaveCount(2);

  await page.getByRole('button', { name: 'In library', exact: true }).click();
  await expect(page.locator('.grid .poster')).toHaveCount(2);
  await expect(page.locator('.grid .poster .glyph.ok')).toHaveCount(2);
  // the cards and the filters share the owned list instead of asking once per card (a
  // sign-in landing mid-read can make the cache ask a second time)
  expect(
    calls.filter((c) => c.startsWith('/book/library?format=audiobook')).length
  ).toBeLessThanOrEqual(2);
});

test('ebook cards from Open Library match owned books by title and author', async ({
  page,
}) => {
  await fixtures(page);
  await page.goto('/books');
  await expect(poster(page, 'Pride and Prejudice')).toHaveCount(1);
  await expectOwned(page, 'Throne of Glass', true);
  await expectOwned(page, 'Project Hail Mary', true);
  await expectOwned(page, 'Pride and Prejudice', false);
  await expectOwned(page, 'Wool', false);

  await page.getByRole('button', { name: 'Not yet', exact: true }).click();
  await expect(page.locator('.grid .poster')).toHaveCount(2);
  await expect(poster(page, 'Pride and Prejudice')).toHaveCount(1);
  await expect(poster(page, 'Wool')).toHaveCount(1);

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

test('a book SeerrNG already marks keeps its state when the owned list is unavailable', async ({
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
  await expect(page.locator('.grid .poster')).toHaveCount(1);
  await expect(poster(page, 'Unmarked')).toHaveCount(1);
});
