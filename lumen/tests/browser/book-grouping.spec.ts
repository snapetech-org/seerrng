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
    series: [{ id: seriesId, title: 'Fixture Series', position: '1' }],
  };
  const second = {
    ...first,
    id: 'OL22W',
    title: 'Another Fixture Book',
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
  await expect(page.locator('.grid a').first()).toHaveAttribute(
    'href',
    '/book/OL11W'
  );
  await page.screenshot({ path: info.outputPath('series.png') });
  await preview();
  expect(targets).toEqual([
    { type: 'author', id: 'OL42A', name: 'Fixture Author' },
    { type: 'book-series', id: seriesId, name: 'Fixture Series' },
  ]);
});
