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
  await page.goto('/books');
  for (const title of ['Manager only', 'Audio only', 'Plex audiobook'])
    await expect(
      page.locator('.poster', { hasText: title }).locator('.glyph.ok')
    ).toHaveCount(0);
  await expect(
    page.locator('.poster', { hasText: 'Imported ebook' }).locator('.glyph.ok')
  ).toHaveCount(1);
  await page.goto('/audiobooks');
  for (const title of ['Manager only', 'Imported ebook'])
    await expect(
      page.locator('.poster', { hasText: title }).locator('.glyph.ok')
    ).toHaveCount(0);
  for (const title of ['Audio only', 'Plex audiobook'])
    await expect(
      page.locator('.poster', { hasText: title }).locator('.glyph.ok')
    ).toHaveCount(1);
});
const paged = (results: unknown[]) => ({
  page: 1,
  totalPages: 1,
  totalResults: results.length,
  results,
});

async function fixtures(page: Page) {
  const requests: {
    path: string;
    query: string;
    body?: Record<string, unknown>;
  }[] = [];
  await page.route('https://**/*', (r) => r.abort());
  await page.route('**/lumen-config.json', (r) => r.fulfill({ json: {} }));
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
          url.searchParams.get('f') === 'audio' ? 'audiobook' : 'ebook',
          'Native book detail'
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
    await page.goto(format === 'ebook' ? '/books' : '/audiobooks');
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
