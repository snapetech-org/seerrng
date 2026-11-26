import { expect, test } from '@playwright/test';

const testMount = process.env.LUMEN_TEST_MOUNT === '/lumen' ? '/lumen' : '';
const testAppPath = (path: string) => `${testMount}${path}`;
const testApiPath = (url: string) =>
  new URL(url).pathname.replace(/^\/lumen(?=\/)/, '').replace(/^\/api\/v1/, '');

for (const permissions of [32, 1073741824, 268435456]) {
  test(`blocklist count and removal respect account permission ${permissions}`, async ({
    page,
  }) => {
    let entryExists = true;
    const queries: URLSearchParams[] = [];
    const removals: string[] = [];
    let counts = 0;
    await page.route('https://**/*', (route) => route.abort());
    await page.route('**/api/v1/**', (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const path = testApiPath(request.url());
      if (path === '/auth/me')
        return route.fulfill({ json: { id: 1, permissions } });
      if (path === '/blocklist/count') {
        counts++;
        return route.fulfill({ json: { count: Number(entryExists) } });
      }
      if (path === '/blocklist') {
        queries.push(url.searchParams);
        return route.fulfill({
          json: {
            results: entryExists
              ? [
                  {
                    id: 99,
                    title: 'Example Book',
                    mediaType: 'book',
                    externalId: 'hc:123',
                    createdAt: '2026-11-12T00:00:00Z',
                  },
                ]
              : [],
            pageInfo: { pages: 1 },
          },
        });
      }
      if (path === '/blocklist/hc%3A123' && request.method() === 'DELETE') {
        removals.push(path + url.search);
        entryExists = false;
        return route.fulfill({ status: 204 });
      }
      return route.fulfill({ json: {} });
    });
    await page.goto(testAppPath('/blocklist'));
    if (permissions === 32) {
      await expect(
        page.getByText('You do not have permission to view the Blocklist.')
      ).toBeVisible();
      expect(queries).toHaveLength(0);
      expect(counts).toBe(0);
      return;
    }
    await expect(page.getByText('Example Book', { exact: true })).toBeVisible();
    const captureDir = process.env.LUMEN_CAPTURE_DIR;
    if (
      captureDir &&
      permissions === 268435456 &&
      ['desktop', 'iphone'].includes(test.info().project.name)
    )
      await page.screenshot({
        path: `${captureDir}/blocklist-list-${test.info().project.name}.png`,
        fullPage: true,
      });
    await page.getByLabel('Media Type', { exact: true }).selectOption('book');
    await expect.poll(() => queries.at(-1)?.get('mediaType')).toBe('book');
    const remove = page.getByRole('button', {
      name: 'Remove Example Book from Blocklist',
    });
    if (permissions === 1073741824) {
      await expect(remove).toHaveCount(0);
      return;
    }
    await remove.click();
    expect(removals).toHaveLength(0);
    await page
      .getByRole('alertdialog')
      .getByRole('button', { name: 'Remove from Blocklist' })
      .click();
    await expect(page.getByText('No entries match this view.')).toBeVisible();
    expect(removals).toEqual(['/blocklist/hc%3A123?mediaType=book']);
    await page.goto(testAppPath('/me'));
    await expect(
      page.getByRole('link', { name: 'Open Blocklist' })
    ).toHaveCount(0);
  });
}

test('movie detail adds and removes the exact blocked title and refreshes requests and navigation', async ({
  page,
}) => {
  let blocked = false;
  const writes: unknown[] = [];
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/api/v1/**', (route) => {
    const request = route.request();
    const path = testApiPath(request.url());
    if (path === '/auth/me')
      return route.fulfill({ json: { id: 1, permissions: 268435456 } });
    if (path === '/movie/20')
      return route.fulfill({
        json: {
          id: 20,
          title: 'Example Movie',
          genres: [],
          mediaInfo: { status: blocked ? 6 : 1 },
        },
      });
    if (path === '/blocklist/count')
      return route.fulfill({ json: { count: Number(blocked) } });
    if (path === '/blocklist' && request.method() === 'POST') {
      writes.push(request.postDataJSON());
      blocked = true;
      return route.fulfill({ status: 201 });
    }
    if (path === '/blocklist/20') {
      if (request.method() === 'DELETE') {
        writes.push(new URL(request.url()).search);
        blocked = false;
        return route.fulfill({ status: 204 });
      }
      return blocked
        ? route.fulfill({ json: { id: 99 } })
        : route.fulfill({ status: 404, json: { message: 'Not found' } });
    }
    return route.fulfill({ json: { results: [] } });
  });

  await page.goto(testAppPath('/movie/20'));
  await page.getByRole('button', { name: 'Add to Blocklist' }).click();
  expect(writes).toEqual([]);
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Add to Blocklist' })
    .click();
  await expect(
    page.getByRole('button', { name: 'Blocklisted' }).first()
  ).toBeDisabled();
  await page.getByRole('button', { name: 'Remove from Blocklist' }).click();
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Remove from Blocklist' })
    .click();
  await expect(
    page.getByRole('button', { name: 'Add to Blocklist' })
  ).toBeVisible();
  expect(writes).toEqual([
    { mediaType: 'movie', title: 'Example Movie', tmdbId: 20 },
    '?mediaType=movie',
  ]);
});

test('detail Blocklist actions send the canonical identity for every supported media type', async ({
  page,
}) => {
  const cases = [
    {
      route: '/tv/30',
      mediaType: 'tv',
      id: '30',
      title: 'Example Series',
      detailPath: '/tv/30',
      detail: { id: 30, name: 'Example Series', genres: [], seasons: [] },
      identity: { tmdbId: 30 },
    },
    {
      route: '/music/album-22',
      mediaType: 'music',
      id: 'album-22',
      title: 'Example Album',
      detailPath: '/music/album-22',
      detail: {
        id: 'album-22',
        title: 'Example Album',
        artist: { id: 'artist-2', name: 'Example Artist' },
        tracks: [],
      },
      identity: {
        externalId: 'album-22',
        externalProvider: 'musicbrainz',
      },
    },
    {
      route: '/book/ol123w',
      mediaType: 'book',
      id: 'OL123W',
      title: 'Example Book',
      detailPath: '/book/ol123w',
      detail: {
        id: 'OL123W',
        title: 'Example Book',
        description: 'A fixture book.',
      },
      identity: {
        externalId: 'OL123W',
        externalProvider: 'openlibrary',
      },
    },
    {
      route: '/comic/al-105778',
      mediaType: 'comic',
      id: '130799',
      title: 'Example Comic',
      detailPath: '/comic/130799',
      detail: { id: '130799', title: 'Example Comic' },
      work: {
        id: 'al-105778',
        mediaType: 'comic',
        kind: 'manga',
        title: 'Example Comic',
        editionsResolved: true,
        recommendedId: '130799',
        editions: [
          {
            id: '130799',
            title: 'Example Comic',
            publisher: 'Fixture Press',
            language: 'en',
            languageName: 'English',
            recommended: true,
          },
        ],
      },
      identity: {
        externalId: '130799',
        externalProvider: 'comicvine',
      },
    },
    {
      route: '/magazine/Fixture%20Magazine',
      mediaType: 'magazine',
      id: 'fixture magazine',
      title: 'Fixture Magazine',
      detailPath: '/magazine/Fixture%20Magazine',
      detail: {
        id: 'Fixture Magazine',
        title: 'Fixture Magazine',
        issues: [],
      },
      identity: {
        externalId: 'fixture magazine',
        externalProvider: 'lazylibrarian',
      },
    },
  ] as const;
  let active: (typeof cases)[number] = cases[0];
  let blocked = false;
  const writes: unknown[] = [];

  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/api/v1/**', (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = testApiPath(request.url());
    if (path === '/auth/me')
      return route.fulfill({ json: { id: 1, permissions: 268435456 } });
    if (path === '/settings/public')
      return route.fulfill({
        json: {
          initialized: true,
          booksEnabled: true,
          musicEnabled: true,
          enabledMediaCategories: {
            book: true,
            comic: true,
            magazine: true,
            music: true,
          },
        },
      });
    if (path === active.detailPath)
      return route.fulfill({
        json: { ...active.detail, mediaInfo: { status: blocked ? 6 : 1 } },
      });
    if ('work' in active && path === '/comic/work/al-105778')
      return route.fulfill({ json: active.work });
    if (path.startsWith('/blocklist/') && url.searchParams.has('mediaType')) {
      if (request.method() === 'GET')
        return blocked
          ? route.fulfill({ json: { id: 99 } })
          : route.fulfill({ status: 404, json: { message: 'Not found' } });
      if (request.method() === 'DELETE') {
        blocked = false;
        return route.fulfill({ status: 204 });
      }
    }
    if (path === '/blocklist/count')
      return route.fulfill({ json: { count: Number(blocked) } });
    if (path === '/blocklist' && request.method() === 'POST') {
      const payload = request.postDataJSON();
      expect(payload).toEqual({
        mediaType: active.mediaType,
        title: active.title,
        ...active.identity,
      });
      writes.push(payload);
      blocked = true;
      return route.fulfill({ status: 201 });
    }
    return route.fulfill({ json: { results: [] } });
  });

  for (const item of cases) {
    active = item;
    blocked = false;
    const before = writes.length;
    await page.goto(testAppPath(item.route));
    // the album page keeps its admin tools behind "More"
    if (item.mediaType === 'music')
      await page.locator('#view').getByText('More', { exact: true }).click();
    await page.getByRole('button', { name: 'Add to Blocklist' }).click();
    await page
      .getByRole('alertdialog')
      .getByRole('button', { name: 'Add to Blocklist' })
      .click();
    if (
      item.mediaType === 'music' &&
      !(await page
        .locator('details.music-more')
        .evaluate((menu) => (menu as HTMLDetailsElement).open))
    )
      await page.locator('#view').getByText('More', { exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Remove from Blocklist' })
    ).toBeVisible();
    await expect.poll(() => writes.length).toBe(before + 1);
  }
});

test('failed Blocklist removal stays confirmed and retries after a fresh state check', async ({
  page,
}) => {
  let blocked = true;
  let deletes = 0;
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/api/v1/**', (route) => {
    const request = route.request();
    const path = testApiPath(request.url());
    if (path === '/auth/me')
      return route.fulfill({ json: { id: 1, permissions: 268435456 } });
    if (path === '/movie/20')
      return route.fulfill({
        json: {
          id: 20,
          title: 'Example Movie',
          genres: [],
          mediaInfo: { status: blocked ? 6 : 1 },
        },
      });
    if (path === '/blocklist/20') {
      if (request.method() === 'DELETE') {
        deletes++;
        if (deletes === 1)
          return route.fulfill({
            status: 503,
            json: { message: 'Unavailable' },
          });
        blocked = false;
        return route.fulfill({ status: 204 });
      }
      return blocked
        ? route.fulfill({ json: { id: 99 } })
        : route.fulfill({ status: 404, json: { message: 'Not found' } });
    }
    if (path === '/blocklist/count')
      return route.fulfill({ json: { count: Number(blocked) } });
    return route.fulfill({ json: { results: [] } });
  });

  await page.goto(testAppPath('/movie/20'));
  await page.getByRole('button', { name: 'Remove from Blocklist' }).click();
  const dialog = page.getByRole('alertdialog');
  const captureDir = process.env.LUMEN_CAPTURE_DIR;
  if (captureDir && ['desktop', 'iphone'].includes(test.info().project.name))
    await page.screenshot({
      path: `${captureDir}/blocklist-confirm-${test.info().project.name}.png`,
    });
  await dialog.getByRole('button', { name: 'Remove from Blocklist' }).click();
  await expect(dialog.getByRole('alert')).toBeVisible();
  await expect(dialog).toBeVisible();
  if (captureDir && ['desktop', 'iphone'].includes(test.info().project.name))
    await page.screenshot({
      path: `${captureDir}/blocklist-retry-${test.info().project.name}.png`,
    });
  await dialog.getByRole('button', { name: 'Remove from Blocklist' }).click();
  await expect(dialog).toHaveCount(0);
  expect(deletes).toBe(2);
});

test('lost Blocklist response closes only after readback confirms the change', async ({
  page,
}) => {
  let blocked = true;
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/api/v1/**', (route) => {
    const request = route.request();
    const path = testApiPath(request.url());
    if (path === '/auth/me')
      return route.fulfill({ json: { id: 1, permissions: 268435456 } });
    if (path === '/movie/20')
      return route.fulfill({
        json: {
          id: 20,
          title: 'Example Movie',
          genres: [],
          mediaInfo: { status: blocked ? 6 : 1 },
        },
      });
    if (path === '/blocklist/20') {
      if (request.method() === 'DELETE') {
        blocked = false;
        return route.fulfill({
          status: 503,
          json: { message: 'Response lost' },
        });
      }
      return blocked
        ? route.fulfill({ json: { id: 99 } })
        : route.fulfill({ status: 404, json: { message: 'Not found' } });
    }
    if (path === '/blocklist/count')
      return route.fulfill({ json: { count: Number(blocked) } });
    return route.fulfill({ json: { results: [] } });
  });

  await page.goto(testAppPath('/movie/20'));
  await page.getByRole('button', { name: 'Remove from Blocklist' }).click();
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Remove from Blocklist' })
    .click();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Add to Blocklist' })
  ).toBeVisible();
});

test('Blocklist list removal stays open after failure and closes after confirmed retry', async ({
  page,
}) => {
  let blocked = true;
  let deletes = 0;
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/api/v1/**', (route) => {
    const request = route.request();
    const path = testApiPath(request.url());
    if (path === '/auth/me')
      return route.fulfill({ json: { id: 1, permissions: 268435456 } });
    if (path === '/blocklist/count')
      return route.fulfill({ json: { count: Number(blocked) } });
    if (path === '/blocklist' && request.method() === 'GET')
      return route.fulfill({
        json: {
          results: blocked
            ? [
                {
                  id: 99,
                  title: 'Example Book',
                  mediaType: 'book',
                  externalId: 'hc:123',
                  createdAt: '2026-11-12T00:00:00Z',
                },
              ]
            : [],
          pageInfo: { pages: 1 },
        },
      });
    if (path === '/blocklist/hc%3A123') {
      if (request.method() === 'DELETE') {
        deletes++;
        if (deletes === 1)
          return route.fulfill({
            status: 503,
            json: { message: 'Unavailable' },
          });
        blocked = false;
        return route.fulfill({ status: 204 });
      }
      return blocked
        ? route.fulfill({ json: { id: 99 } })
        : route.fulfill({ status: 404, json: { message: 'Not found' } });
    }
    return route.fulfill({ json: {} });
  });

  await page.goto(testAppPath('/blocklist'));
  await page
    .getByRole('button', { name: 'Remove Example Book from Blocklist' })
    .click();
  const dialog = page.getByRole('alertdialog');
  const captureDir = process.env.LUMEN_CAPTURE_DIR;
  if (captureDir && ['desktop', 'iphone'].includes(test.info().project.name))
    await page.screenshot({
      path: `${captureDir}/blocklist-list-confirm-${test.info().project.name}.png`,
    });
  await dialog.getByRole('button', { name: 'Remove from Blocklist' }).click();
  await expect(dialog.getByRole('alert')).toBeVisible();
  if (captureDir && ['desktop', 'iphone'].includes(test.info().project.name))
    await page.screenshot({
      path: `${captureDir}/blocklist-list-retry-${test.info().project.name}.png`,
    });
  await dialog.getByRole('button', { name: 'Remove from Blocklist' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText('No entries match this view.')).toBeVisible();
  expect(deletes).toBe(2);
});
