import { expect, test } from '@playwright/test';

const testMount = process.env.LUMEN_TEST_MOUNT === '/lumen' ? '/lumen' : '';
const testAppPath = (path: string) => `${testMount}${path}`;
const testApiPath = (url: string) =>
  new URL(url).pathname.replace(/^\/lumen(?=\/)/, '').replace(/^\/api\/v1/, '');

const ebookFile = 'a'.repeat(43);
const audiobookFile = 'b'.repeat(43);
const comicFile = 'c'.repeat(43);
const magazineFile = 'd'.repeat(43);

test('reader detail downloads stay scoped to the selected media and format', async ({
  page,
}) => {
  const queries: URLSearchParams[] = [];
  const expectLatestQuery = (expected: Record<string, string>) =>
    expect(Object.fromEntries(queries.at(-1) ?? [])).toMatchObject(expected);
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/api/v1/**', (route) => {
    const path = testApiPath(route.request().url());
    const url = new URL(route.request().url());
    if (path === '/auth/me')
      return route.fulfill({
        json: { id: 1, displayName: 'Reader', permissions: 32, userType: 2 },
      });
    if (path === '/settings/public')
      return route.fulfill({
        json: {
          applicationTitle: 'SeerrNG',
          booksEnabled: true,
          comicsEnabled: true,
          magazinesEnabled: true,
          enabledMediaCategories: { book: true, comic: true, magazine: true },
        },
      });
    if (path === '/user/1/settings/main') return route.fulfill({ json: {} });
    if (path === '/book/OL123W')
      return route.fulfill({
        json: {
          id: 'OL123W',
          title: 'Fixture Book',
          author: 'Fixture Author',
          mediaInfo: { id: 72, status: 5 },
        },
      });
    if (path === '/comic/work/al-1')
      return route.fulfill({
        json: {
          id: 'al-1',
          mediaType: 'comic',
          kind: 'manga',
          title: 'Fixture Comic',
          editions: [
            {
              id: '11',
              publisher: 'Fixture Press',
              languageName: 'English',
              recommended: true,
              mediaInfo: { id: 73, status: 5 },
            },
          ],
          editionsResolved: true,
          recommendedId: '11',
        },
      });
    if (path === '/magazine/Fixture%20Magazine')
      return route.fulfill({
        json: {
          id: 'fixture-magazine',
          title: 'Fixture Magazine',
          publisher: 'Fixture Press',
          requestable: false,
          mediaInfo: { id: 74, status: 5 },
        },
      });
    if (path === '/request/status') {
      const query = url.searchParams;
      queries.push(new URLSearchParams(query));
      const mediaId = Number(query.get('mediaId'));
      const type = query.get('mediaType');
      const id = mediaId === 72 ? 801 : mediaId === 73 ? 802 : 803;
      return route.fulfill({
        json: {
          results: [
            {
              request: {
                id,
                requestedBy: { id: 1 },
                media: { id: mediaId },
                type,
                ...(type === 'book' ? { bookFormat: 'both' } : {}),
              },
              status: { stage: 'available' },
            },
            {
              request: {
                id: 899,
                requestedBy: { id: 2 },
                media: { id: mediaId },
                type,
                bookFormat: 'ebook',
              },
              status: { stage: 'available' },
            },
            {
              request: {
                id: 898,
                requestedBy: { id: 1 },
                media: { id: 999 },
                type,
              },
              status: { stage: 'available' },
            },
          ],
        },
      });
    }
    if (path === '/request/status/801/downloads')
      return route.fulfill({
        json: {
          results: [
            { id: ebookFile, name: 'fixture.epub', format: 'ebook' },
            { id: audiobookFile, name: 'fixture.m4b', format: 'audiobook' },
          ],
        },
      });
    if (path === '/request/status/802/downloads')
      return route.fulfill({
        json: { results: [{ id: comicFile, name: 'fixture.cbz' }] },
      });
    if (path === '/request/status/803/downloads')
      return route.fulfill({
        json: { results: [{ id: magazineFile, name: 'fixture-issue.pdf' }] },
      });
    if (path.startsWith('/service/') || path.startsWith('/genres/'))
      return route.fulfill({ json: [] });
    return route.fulfill({ json: {} });
  });

  await page.goto(testAppPath('/book/OL123W'));
  await page.getByRole('button', { name: 'Download Ebook' }).click();
  const ebookDialog = page.getByRole('dialog', {
    name: 'Download request files',
  });
  await expect(
    ebookDialog.getByRole('link', { name: 'fixture.epub' })
  ).toHaveAttribute(
    'href',
    `/api/v1/request/status/801/downloads/${ebookFile}`
  );
  await expect(ebookDialog.getByText('fixture.m4b')).toHaveCount(0);
  expectLatestQuery({
    requestedBy: '1',
    mediaType: 'book',
    mediaId: '72',
    bookFormat: 'ebook',
    filter: 'available',
  });
  await ebookDialog.getByRole('button', { name: 'Close' }).click();

  await page.goto(testAppPath('/comic/al-1'));
  await page.getByRole('button', { name: 'Download Files' }).click();
  const comicDialog = page.getByRole('dialog', {
    name: 'Download request files',
  });
  await expect(
    comicDialog.getByRole('link', { name: 'fixture.cbz' })
  ).toHaveAttribute(
    'href',
    `/api/v1/request/status/802/downloads/${comicFile}`
  );
  expectLatestQuery({ requestedBy: '1', mediaType: 'comic', mediaId: '73' });
  await comicDialog.getByRole('button', { name: 'Close' }).click();

  await page.goto(testAppPath('/magazine/Fixture%20Magazine'));
  await page.getByRole('button', { name: 'Download Files' }).click();
  const magazineDialog = page.getByRole('dialog', {
    name: 'Download request files',
  });
  await expect(
    magazineDialog.getByRole('link', { name: 'fixture-issue.pdf' })
  ).toHaveAttribute(
    'href',
    `/api/v1/request/status/803/downloads/${magazineFile}`
  );
  expectLatestQuery({
    requestedBy: '1',
    mediaType: 'magazine',
    mediaId: '74',
  });
});
