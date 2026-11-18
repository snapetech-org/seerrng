import { expect, test } from '@playwright/test';

test('Share keeps an unconfirmed series available to retry in a mixed batch', async ({
  page,
}, info) => {
  const writes: unknown[] = [];
  let tvAttempts = 0;
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', (route) => {
    const { pathname } = new URL(route.request().url());
    const path = pathname.slice(7);
    if (path === '/auth/me')
      return route.fulfill({ json: { id: 1, permissions: 32 } });
    if (path === '/resolve/capabilities')
      return route.fulfill({ json: { enabled: true } });
    if (path === '/resolve')
      return route.fulfill({
        json: {
          groups: [
            { id: 42, title: 'Fixture Series', mediaType: 'tv' },
            { id: 72, title: 'Fixture Movie', mediaType: 'movie' },
          ].map(({ id, title, mediaType }) => ({
            input: title,
            autoSelected: 0,
            candidates: [
              {
                id: String(id),
                title,
                mediaType,
                evidence: 'Exact title match',
              },
            ],
          })),
        },
      });
    if (path === '/request' && route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      writes.push(body);
      if (body.mediaType === 'tv' && ++tvAttempts === 1)
        return route.fulfill({
          status: 202,
          json: { message: 'No seasons available.' },
        });
      return route.fulfill({ status: 201, json: { id: writes.length } });
    }
    return route.fulfill({ json: { results: [] } });
  });
  await page.goto('/share');
  await page
    .getByLabel('Titles, links, or ISBNs')
    .fill('Fixture Series\nFixture Movie');
  await page.getByRole('button', { name: 'Find Matches' }).click();
  await page
    .getByRole('combobox', { name: 'Series Seasons' })
    .selectOption('all');
  await page.getByRole('button', { name: 'Request Selected (2)' }).click();
  await expect(page.getByText('No selected seasons were added.')).toBeVisible();
  await expect(
    page.getByText('Submitted 1 request.', { exact: true })
  ).toBeVisible();
  const movie = page.getByRole('listitem').filter({ hasText: 'Fixture Movie' });
  const series = page
    .getByRole('listitem')
    .filter({ hasText: 'Fixture Series' });
  await expect(
    movie.getByText('Request submitted', { exact: true })
  ).toBeVisible();
  await expect(
    series.getByText('Request submitted', { exact: true })
  ).toHaveCount(0);
  await page.screenshot({
    path: info.outputPath('share-tv-unconfirmed.png'),
    animations: 'disabled',
  });
  await page.getByRole('button', { name: 'Request Selected (1)' }).click();
  await expect(
    series.getByText('Request submitted', { exact: true })
  ).toBeVisible();
  expect(writes).toEqual([
    { mediaType: 'tv', mediaId: 42, seasons: 'all' },
    { mediaType: 'movie', mediaId: 72 },
    { mediaType: 'tv', mediaId: 42, seasons: 'all' },
  ]);
});
