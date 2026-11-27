import { expect, test, type Page } from '@playwright/test';

async function openBookManager(page: Page, permissions: number) {
  const deletes: { path: string; body: unknown }[] = [];
  const libraryReads: string[] = [];
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname
      .replace(/^\/lumen/, '')
      .slice(7);
    if (path === '/auth/me')
      return route.fulfill({ json: { id: 1, permissions, settings: {} } });
    if (path === '/user/1/settings/main')
      return route.fulfill({ json: { locale: 'en' } });
    if (path === '/settings/public')
      return route.fulfill({
        json: {
          ebookServiceEnabled: true,
          audiobookServiceEnabled: true,
          booksEnabled: true,
          enabledMediaCategories: { ebook: true, audiobook: true },
        },
      });
    if (path === '/book/bookshelf%3A42%3AaGM6MTIzNDU')
      return route.fulfill({
        json: {
          id: 'bookshelf:42:aGM6MTIzNDU',
          mediaType: 'book',
          title: 'Managed Book',
          provider: 'bookshelf',
          mediaInfo: {
            id: 42,
            status: 5,
            serviceUrl: 'https://books.example/book/12',
            audiobookServiceUrl: 'https://books.example/audiobook/12',
            downloadStatus: [
              { downloadId: 'ebook-1', status: 'Downloading', percent: 35 },
            ],
            audiobookDownloadStatus: [
              { downloadId: 'audio-1', status: 'Queued', percent: 0 },
            ],
            requests: [
              {
                id: 77,
                status: 2,
                bookFormat: 'ebook',
                requestedBy: { id: 1, displayName: 'reader' },
              },
              {
                id: 78,
                status: 3,
                bookFormat: 'audiobook',
                requestedBy: { id: 1, displayName: 'reader' },
              },
            ],
          },
        },
      });
    if (path === '/media/42/library') {
      libraryReads.push(request.method());
      if (request.method() === 'DELETE') {
        deletes.push({ path, body: request.postDataJSON() });
        return route.fulfill({ status: 204, body: '' });
      }
      return route.fulfill({
        json: {
          token: 'verified-plan-token',
          verifiedServices: 2,
          targets: [
            {
              key: 'ebook',
              serviceId: 1,
              serviceType: 'readarr',
              externalId: 12,
              service: 'Bookshelf (Book)',
              quality: 'Ebook',
              url: 'https://books.example/book/12',
            },
            {
              key: 'audio',
              serviceId: 2,
              serviceType: 'readarr',
              externalId: 13,
              service: 'Bookshelf (Audiobook)',
              quality: 'Audiobook',
              url: 'https://books.example/audiobook/12',
            },
          ],
        },
      });
    }
    return route.fulfill({ json: {} });
  });
  await page.goto('/book/bookshelf%3A42%3AaGM6MTIzNDU');
  return { deletes, libraryReads };
}

test('book manager shows requests and both formats, and confirms exact library copies', async ({
  page,
}) => {
  const { deletes, libraryReads } = await openBookManager(page, 2);
  await page.getByRole('button', { name: 'Manage Book' }).click();
  const sheet = page.getByRole('dialog', { name: 'Manage Book' });
  await expect(sheet.getByText('Requests')).toBeVisible();
  await expect(
    sheet
      .getByRole('region', { name: 'Requests' })
      .getByText('Ebook', { exact: true })
  ).toBeVisible();
  await expect(sheet.getByText('Downloading')).toBeVisible();
  await expect(sheet.getByText('Queued')).toBeVisible();
  await expect(
    sheet.getByRole('link', { name: 'Open Ebook in Bookshelf' })
  ).toHaveAttribute('href', 'https://books.example/book/12');
  await expect(
    sheet.getByRole('link', { name: 'Open Audiobook in Bookshelf' })
  ).toHaveAttribute('href', 'https://books.example/audiobook/12');
  await expect(
    sheet.getByRole('link', { name: 'View Request' })
  ).toHaveAttribute('href', '/requests?requestId=77');
  await expect(sheet.getByRole('link', { name: 'View Request' })).toHaveCount(
    1
  );
  await expect(sheet.getByText('Bookshelf (Book)')).toBeVisible();
  await expect(sheet.getByText('Bookshelf (Audiobook)')).toBeVisible();
  await expect(libraryReads).toEqual(['GET']);
  await sheet.getByRole('button', { name: 'Delete From Library' }).click();
  const confirm = page.getByRole('alertdialog', {
    name: 'Delete Book Copies?',
  });
  await expect(confirm.getByText('Bookshelf (Book)')).toBeVisible();
  await expect(confirm.getByText('Bookshelf (Audiobook)')).toBeVisible();
  await confirm.getByRole('button', { name: 'Keep Copies' }).click();
  await expect(sheet).toBeVisible();
  await sheet.getByRole('button', { name: 'Delete From Library' }).click();
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Delete From Library' })
    .click();
  await expect
    .poll(() => deletes)
    .toEqual([
      { path: '/media/42/library', body: { token: 'verified-plan-token' } },
    ]);
  await expect(page.getByRole('dialog', { name: 'Manage Book' })).toHaveCount(
    0
  );
});

test('book manager and library plan stay hidden without management access', async ({
  page,
}) => {
  const { libraryReads } = await openBookManager(page, 0);
  await expect(page.getByRole('button', { name: 'Manage Book' })).toHaveCount(
    0
  );
  await expect(page.getByRole('dialog', { name: 'Manage Book' })).toHaveCount(
    0
  );
  expect(libraryReads).toEqual([]);
});
