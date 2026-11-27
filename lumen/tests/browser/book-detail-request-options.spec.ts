import { expect, test } from '@playwright/test';

test('book detail preserves edition identity with authorized requester and service options', async ({
  page,
}) => {
  const writes: Record<string, unknown>[] = [];
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
      return route.fulfill({
        json: { id: 1, permissions: 2, settings: { narratorChoice: true } },
      });
    if (path === '/user/1/settings/main')
      return route.fulfill({ json: { locale: 'en' } });
    if (path === '/settings/public')
      return route.fulfill({
        json: {
          ebookServiceEnabled: true,
          audiobookServiceEnabled: true,
          booksEnabled: true,
        },
      });
    if (path === '/book/bookshelf%3A42%3AaGM6MTIzNDU')
      return route.fulfill({
        json: {
          id: 'bookshelf:42:aGM6MTIzNDU',
          mediaType: 'book',
          title: 'Fixture Book',
          author: 'Fixture Author',
          provider: 'bookshelf',
        },
      });
    if (path === '/editions/book')
      return route.fulfill({
        json: {
          editions: [
            {
              id: 'edition-1',
              title: 'Fixture recording',
              format: 'audiobook',
              language: 'eng',
              narrators: ['Fixture Narrator'],
              durationSeconds: 36000,
            },
          ],
        },
      });
    if (path === '/user')
      return route.fulfill({
        json: {
          results: [
            { id: 1, displayName: 'Owner' },
            { id: 9, displayName: 'Household member' },
          ],
        },
      });
    if (path === '/service/readarr')
      return route.fulfill({
        json: [
          {
            id: 4,
            name: 'Audiobook service',
            backend: 'bookorbit',
            serviceType: 'audiobook',
          },
        ],
      });
    if (path === '/service/readarr/4')
      return route.fulfill({
        json: {
          server: {
            activeProfileId: 7,
            activeMetadataProfileId: 8,
            activeDirectory: '/audio',
            activeTags: [2],
          },
          profiles: [{ id: 7, name: 'Audio profile' }],
          metadataProfiles: [{ id: 8, name: 'Audio metadata' }],
          rootFolders: [{ path: '/audio' }, { path: '/spoken' }],
          tags: [
            { id: 2, label: 'Family' },
            { id: 5, label: 'Archive' },
          ],
        },
      });
    if (path === '/request' && request.method() === 'POST') {
      writes.push(request.postDataJSON());
      return route.fulfill({ json: { id: 71 } });
    }
    return route.fulfill({ json: {} });
  });

  await page.goto('/book/bookshelf%3A42%3AaGM6MTIzNDU?f=audio');
  await expect(
    page.getByRole('button', { name: /Request · Fixture Narrator/ })
  ).toBeVisible();
  await page.getByText('Advanced Request Options', { exact: true }).click();
  await page.getByLabel('Request As').selectOption('9');
  await page.getByLabel('Book Service').selectOption('4');
  await page.getByLabel('Quality Profile').selectOption('7');
  await page.getByLabel('Metadata Profile').selectOption('8');
  await page.getByLabel('Root Folder').selectOption('/spoken');
  await page.getByLabel('Archive').check();
  await page.getByText('Advanced Request Options', { exact: true }).click();
  await expect(
    page.getByRole('button', { name: /Request · Fixture Narrator/ })
  ).toBeEnabled();

  await page
    .getByRole('button', { name: /Request · Fixture Narrator/ })
    .click();
  await expect.poll(() => writes).toHaveLength(1);
  expect(writes[0]).toMatchObject({
    mediaType: 'book',
    format: 'audiobook',
    preferredEditionId: 'edition-1',
    editionPolicy: 'only',
    userId: 9,
    serverId: 4,
    profileId: 7,
    metadataProfileId: 8,
    rootFolder: '/spoken',
    tags: [2, 5],
  });
});

test('ordinary book requester does not load or expose advanced options', async ({
  page,
}) => {
  const unexpected = new Set<string>();
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname
      .replace(/^\/lumen/, '')
      .slice(7);
    if (path === '/auth/me')
      return route.fulfill({ json: { id: 1, permissions: 34359738368 } });
    if (path === '/user/1/settings/main')
      return route.fulfill({ json: { locale: 'en' } });
    if (path === '/settings/public')
      return route.fulfill({
        json: { ebookServiceEnabled: true, booksEnabled: true },
      });
    if (path === '/book/bookshelf%3A42%3AaGM6MTIzNDU')
      return route.fulfill({
        json: {
          id: 'bookshelf:42:aGM6MTIzNDU',
          mediaType: 'book',
          title: 'Fixture Book',
          author: 'Fixture Author',
          provider: 'bookshelf',
        },
      });
    if (path.startsWith('/service/readarr') || path.startsWith('/user?'))
      unexpected.add(path);
    return route.fulfill({ json: {} });
  });
  await page.goto('/book/bookshelf%3A42%3AaGM6MTIzNDU');
  await expect(
    page.getByRole('button', { name: 'Request ebook' })
  ).toBeVisible();
  await expect(
    page.getByText('Advanced Request Options', { exact: true })
  ).toHaveCount(0);
  expect([...unexpected]).toEqual([]);
});

test('book detail shows and enforces an exhausted book quota', async ({
  page,
}) => {
  const writes: Record<string, unknown>[] = [];
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
      return route.fulfill({
        json: { id: 1, permissions: 2, settings: { narratorChoice: true } },
      });
    if (path === '/user/1/settings/main')
      return route.fulfill({ json: { locale: 'en' } });
    if (path === '/settings/public')
      return route.fulfill({
        json: { ebookServiceEnabled: true, booksEnabled: true },
      });
    if (path === '/book/bookshelf%3A42%3AaGM6MTIzNDU')
      return route.fulfill({
        json: {
          id: 'bookshelf:42:aGM6MTIzNDU',
          mediaType: 'book',
          title: 'Fixture Book',
          author: 'Fixture Author',
          provider: 'bookshelf',
        },
      });
    if (path === '/user/1/quota')
      return route.fulfill({
        json: { book: { limit: 1, remaining: 0, days: 7, restricted: true } },
      });
    if (path === '/request' && request.method() === 'POST') {
      writes.push(request.postDataJSON());
      return route.fulfill({ json: { id: 71 } });
    }
    return route.fulfill({ json: {} });
  });

  await page.goto('/book/bookshelf%3A42%3AaGM6MTIzNDU');
  await expect(
    page.getByText('Your book request limit has been reached.')
  ).toBeVisible();
  const action = page.getByRole('button', { name: 'Request ebook' });
  await expect(action).toBeDisabled();
  expect(writes).toEqual([]);
});

test('book request stays disabled when quota cannot be checked and retries', async ({
  page,
}) => {
  let quotaReads = 0;
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname
      .replace(/^\/lumen/, '')
      .slice(7);
    if (path === '/auth/me')
      return route.fulfill({ json: { id: 1, permissions: 34359738368 } });
    if (path === '/user/1/settings/main')
      return route.fulfill({ json: { locale: 'en' } });
    if (path === '/settings/public')
      return route.fulfill({
        json: { ebookServiceEnabled: true, booksEnabled: true },
      });
    if (path === '/book/bookshelf%3A42%3AaGM6MTIzNDU')
      return route.fulfill({
        json: {
          id: 'bookshelf:42:aGM6MTIzNDU',
          mediaType: 'book',
          title: 'Fixture Book',
          author: 'Fixture Author',
          provider: 'bookshelf',
        },
      });
    if (path === '/user/1/quota') {
      quotaReads++;
      return quotaReads === 1
        ? route.fulfill({ status: 503, json: { message: 'Unavailable' } })
        : route.fulfill({ json: { book: { limit: 0, restricted: false } } });
    }
    return route.fulfill({ json: {} });
  });

  await page.goto('/book/bookshelf%3A42%3AaGM6MTIzNDU');
  const action = page.getByRole('button', { name: 'Request ebook' });
  await expect(
    page.getByText('Could not check the book request limit.')
  ).toBeVisible();
  await expect(action).toBeDisabled();
  await page.getByRole('button', { name: 'Recheck quota' }).click();
  await expect(action).toBeEnabled();
  expect(quotaReads).toBe(2);
});
