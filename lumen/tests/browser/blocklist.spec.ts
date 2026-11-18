import { expect, test } from '@playwright/test';

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
      const path = url.pathname.slice('/api/v1'.length);
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
    await page.goto('/blocklist');
    if (permissions === 32) {
      await expect(
        page.getByText('You do not have permission to view the Blocklist.')
      ).toBeVisible();
      expect(queries).toHaveLength(0);
      expect(counts).toBe(0);
      return;
    }
    await expect(page.getByText('Example Book', { exact: true })).toBeVisible();
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
    await page.goto('/me');
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
    const path = new URL(request.url()).pathname.slice('/api/v1'.length);
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

  await page.goto('/movie/20');
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
