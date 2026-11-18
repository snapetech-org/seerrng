import { expect, test } from '@playwright/test';

test('book details reach the author and series and send the exact shelf target', async ({
  page,
}, info) => {
  const seriesId = 'bookshelf-series:1:Rml4dHVyZQ';
  const first = {
    id: 'OL11W',
    title: 'A Fixture Book',
    mediaType: 'book',
    author: 'Fixture Author',
    authorId: 'OL42A',
    firstPublishYear: 1960,
    ratingsAverage: 4.5,
    subjects: ['Fantasy'],
    languages: ['eng'],
    mediaInfo: { status: 5, availableEbookServiceIds: [1] },
    series: [{ id: seriesId, title: 'Fixture Series', position: '1' }],
  };
  const second = {
    ...first,
    id: 'OL22W',
    title: 'Another Fixture Book',
    firstPublishYear: 2020,
    ratingsAverage: 3,
    subjects: ['Adventure'],
    languages: ['fre'],
    mediaInfo: { status: 5, availableAudiobookServiceIds: [1] },
    series: [{ ...first.series[0], position: '2' }],
  };
  const targets: unknown[] = [];
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = decodeURIComponent(url.pathname.slice(7));
    if (path === '/auth/me')
      return route.fulfill({ json: { id: 1, permissions: 2 } });
    if (path === '/book/OL11W') return route.fulfill({ json: first });
    if (path === '/author/OL42A') {
      const offset = Number(url.searchParams.get('offset'));
      return route.fulfill({
        json: {
          id: 'OL42A',
          name: 'Fixture Author',
          biography: 'A fixture biography.',
          works: [offset ? second : first],
          pagination: { offset, limit: 20, totalItems: 21 },
        },
      });
    }
    if (path === '/series/' + seriesId)
      return route.fulfill({
        json: { id: seriesId, title: 'Fixture Series', books: [second, first] },
      });
    if (path === '/settings/reader-delivery')
      return route.fulfill({
        json: {
          preferredProvider: 'grimmory',
          grimmoryUrl: 'https://reader.example.test',
        },
      });
    if (path === '/settings/reader-delivery/groupings')
      return route.fulfill({ json: [] });
    if (path.endsWith('/groupings/preview')) {
      targets.push(request.postDataJSON().target);
      return route.fulfill({
        json: {
          matchedCount: 1,
          ruleSummary: 'Matches fixture books',
          sampleTitles: [first.title],
        },
      });
    }
    return route.fulfill({ json: {} });
  });
  await page.goto('/book/OL11W');
  await page.getByRole('link', { name: 'Fixture Author', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Fixture Author' })
  ).toBeVisible();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(
    page.getByRole('link', { name: /Another Fixture Book/ })
  ).toBeVisible();
  await page.getByRole('button', { name: 'Previous', exact: true }).click();
  await expect(
    page.getByRole('link', { name: /A Fixture Book/ })
  ).toBeVisible();
  await page.screenshot({ path: info.outputPath('author.png') });
  async function preview() {
    await page.getByRole('button', { name: 'Manage Reader Shelf' }).click();
    const dialog = page.getByRole('dialog', { name: 'Reader Shelf' });
    await dialog.getByRole('button', { name: 'Preview Matches' }).click();
    await expect(dialog.getByText('Matches fixture books')).toBeVisible();
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  }
  await preview();
  await page.goto('/book/OL11W');
  await page.getByRole('link', { name: 'Fixture Series #1' }).click();
  await expect(
    page.getByRole('heading', { name: 'Fixture Series' })
  ).toBeVisible();
  await expect(page.locator('.grid a.hit').first()).toHaveAttribute(
    'href',
    '/book/OL11W'
  );
  await page.screenshot({ path: info.outputPath('series.png') });
  const filters = page.getByRole('group', { name: 'Book Series Filters' });
  const cards = page.locator('.grid a.hit');
  await filters.getByLabel('Format').selectOption('audiobook');
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toHaveAttribute('href', '/book/OL22W?f=audio');
  await filters.getByLabel('Minimum Rating').selectOption('4.0');
  await expect(page.getByText('No books match these filters.')).toBeVisible();
  await filters.getByRole('button', { name: 'Clear Filters' }).click();
  await filters.getByLabel('First Published').selectOption('older');
  await filters.getByLabel('Subject').selectOption('fantasy');
  await filters.getByLabel('Language').selectOption('eng');
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toHaveAttribute('href', '/book/OL11W');
  await page.screenshot({ path: info.outputPath('series-filtered.png') });
  await filters.getByRole('button', { name: 'Clear Filters' }).click();
  await expect(cards.first()).toHaveAttribute('href', '/book/OL11W');
  await expect(cards.nth(1)).toHaveAttribute('href', '/book/OL22W');
  await preview();
  expect(targets).toEqual([
    { type: 'author', id: 'OL42A', name: 'Fixture Author' },
    { type: 'book-series', id: seriesId, name: 'Fixture Series' },
  ]);
});

test('bulk bibliography requests preserve selection across pages and report partial results', async ({
  page,
}, info) => {
  const first = {
    id: 'OL11W',
    mediaType: 'book',
    title: 'First Fixture Book',
    authorId: 'OL42A',
    editionId: 'OL123M',
    isbn13: '9780306406157',
  };
  const second = {
    ...first,
    id: 'OL22W',
    title: 'Second Fixture Book',
    editionId: 'OL124M',
  };
  const payloads: unknown[] = [];
  let reject = true;
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.slice(7);
    if (path === '/auth/me')
      return route.fulfill({ json: { id: 1, permissions: 34359738368 } });
    if (path === '/settings/public')
      return route.fulfill({
        json: { ebookServiceEnabled: true, audiobookServiceEnabled: true },
      });
    if (path === '/author/OL42A' || path === '/author/OL42A/works') {
      const offset = Number(url.searchParams.get('offset'));
      return route.fulfill({
        json: {
          id: 'OL42A',
          name: 'Fixture Author',
          works: [offset ? second : first],
          pagination: {
            offset,
            limit: 20,
            nextOffset: offset + 1,
            totalItems: 2,
          },
        },
      });
    }
    if (path === '/request/bulk') {
      payloads.push(request.postDataJSON());
      if (reject)
        return route.fulfill({
          status: 403,
          json: { message: 'Book quota exceeded.' },
        });
      return route.fulfill({
        status: 207,
        json: {
          created: [{ id: 9 }],
          skipped: [],
          failed: [
            {
              mediaId: second.id,
              title: second.title,
              reason: 'The service did not accept this request.',
            },
          ],
        },
      });
    }
    return route.fulfill({ json: {} });
  });
  await page.goto('/author/OL42A');
  await page
    .getByRole('button', { name: 'Request Books', exact: true })
    .click();
  const sheet = page.getByRole('dialog', { name: 'Request Books' });
  await sheet.getByLabel('First Fixture Book').check();
  await sheet.getByRole('button', { name: 'Load More Books' }).click();
  await sheet.getByLabel('Second Fixture Book').check();
  await expect(sheet.getByLabel('First Fixture Book')).toBeChecked();
  await page.screenshot({ path: info.outputPath('bulk-books.png') });
  const submit = sheet.getByRole('button', { name: 'Request Selected Books' });
  await submit.click();
  await expect(sheet.getByRole('alert')).toContainText('Book quota exceeded.');
  await expect(sheet.getByLabel('Second Fixture Book')).toBeChecked();
  reject = false;
  await submit.click();
  await expect(sheet.getByRole('status')).toHaveText(
    '1 requested, 0 skipped, 1 failed.'
  );
  await expect(
    sheet.getByText('Second Fixture Book', { exact: false })
  ).toContainText('The service did not accept');
  expect(payloads[1]).toEqual({
    mediaType: 'book',
    format: 'ebook',
    items: [first, second].map(
      ({ id, title, authorId, editionId, isbn13 }) => ({
        mediaId: id,
        title,
        authorId,
        editionId,
        isbn13,
      })
    ),
  });
  await sheet.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(sheet).toHaveCount(0);
});

test('advanced bulk book options send the selected destination and clear format-specific overrides', async ({
  page,
}, info) => {
  const writes: unknown[] = [];
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.slice(7);
    const responses: Record<string, unknown> = {
      '/auth/me': { id: 1, permissions: 2 },
      '/settings/public': {
        ebookServiceEnabled: true,
        audiobookServiceEnabled: true,
      },
      '/author/OL42A': {
        id: 'OL42A',
        name: 'Fixture Author',
        works: [
          { id: 'OL11W', mediaType: 'book', title: 'First Fixture Book' },
        ],
        pagination: { offset: 0, limit: 20, totalItems: 1 },
      },
      '/service/readarr': [
        { id: 1, name: 'Ebook Service', serviceType: 'ebook' },
        { id: 2, name: 'Audiobook Service', serviceType: 'audiobook' },
      ],
      '/service/readarr/1': {
        server: { id: 1, activeTags: [] },
        profiles: [{ id: 3, name: 'EPUB' }],
        metadataProfiles: [{ id: 4, name: 'Standard Metadata' }],
        rootFolders: [{ path: '/books' }],
        tags: [{ id: 5, label: 'family' }],
      },
      '/user': { results: [{ id: 2, displayName: 'Family Member' }] },
    };
    if (path === '/request/bulk') {
      writes.push(request.postDataJSON());
      return route.fulfill({
        status: 207,
        json: { created: [], skipped: [], failed: [] },
      });
    }
    return route.fulfill({ json: responses[path] ?? {} });
  });
  await page.goto('/author/OL42A');
  await page
    .getByRole('button', { name: 'Request Books', exact: true })
    .click();
  const sheet = page.getByRole('dialog', { name: 'Request Books' });
  await sheet.getByText('Advanced Request Options', { exact: true }).click();
  const server = sheet.getByLabel('Book Service');
  await server.selectOption('1');
  await sheet.getByLabel('Quality Profile').selectOption('3');
  await sheet
    .getByRole('combobox', { name: 'Format', exact: true })
    .selectOption('audiobook');
  await expect(server).toHaveValue('');
  await expect(
    server.locator('option', { hasText: 'Ebook Service' })
  ).toHaveCount(0);
  await expect(sheet.getByLabel('Quality Profile')).toHaveCount(0);
  await sheet
    .getByRole('combobox', { name: 'Format', exact: true })
    .selectOption('ebook');
  await server.selectOption('1');
  await sheet.getByLabel('Quality Profile').selectOption('3');
  await sheet.getByLabel('Metadata Profile').selectOption('4');
  await sheet.getByLabel('Root Folder').selectOption('/books');
  await sheet.getByLabel('family', { exact: true }).check();
  await sheet.getByLabel('Request As').selectOption('2');
  await sheet.getByLabel('First Fixture Book').check();
  await page.screenshot({ path: info.outputPath('advanced-bulk-books.png') });
  await sheet.getByRole('button', { name: 'Request Selected Books' }).click();
  await expect(sheet.getByRole('status')).toContainText('0 requested');
  expect(writes).toEqual([
    {
      mediaType: 'book',
      format: 'ebook',
      items: [{ mediaId: 'OL11W', title: 'First Fixture Book' }],
      serverId: 1,
      profileId: 3,
      metadataProfileId: 4,
      rootFolder: '/books',
      tags: [5],
      userId: 2,
    },
  ]);
});
