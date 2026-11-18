import { expect, test } from '@playwright/test';

test('a household can create a watch session and opt in to watchlist contributions', async ({
  page,
}, info) => {
  const path = '/api/v1/watch-sessions';
  let session = {
    id: 9,
    title: '',
    status: 'draft',
    ownerId: 1,
    memberCount: 1,
    members: [{ id: 1, displayName: 'Host User', isOwner: true }],
    ownPreferences: { includeWatchlistContributions: false },
  };
  const writes: unknown[] = [];
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', (route) => {
    const request = route.request();
    const url = new URL(request.url()).pathname;
    if (url.endsWith('/auth/me'))
      return route.fulfill({ json: { id: 1, permissions: 2 } });
    if (url === path && request.method() === 'GET')
      return route.fulfill({
        json: { sessions: session.title ? [session] : [] },
      });
    if (url === path + '/9') return route.fulfill({ json: { session } });
    if (url === path || url === path + '/9/preferences') {
      const body = request.postDataJSON();
      writes.push(body);
      if (url === path) session = { ...session, title: body.title };
      else session = { ...session, ownPreferences: body };
      return route.fulfill({ json: url === path ? { session } : body });
    }
    return route.fulfill({ json: {} });
  });
  await page.goto('/me');
  await page.getByRole('link', { name: 'Open Watch Sessions' }).click();
  await page.getByLabel('Session Title').fill('Movie Night');
  await page
    .getByRole('combobox', { name: 'Movie Ranking' })
    .selectOption('vote_average.desc');
  await page.getByLabel('From Year').fill('1990');
  await page.screenshot({
    path: info.outputPath('watch-sessions.png'),
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Create Session' }).click();
  await expect(
    page.getByRole('heading', { name: 'Movie Night' })
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Start Session' })
  ).toBeDisabled();
  await page.getByLabel('Contribute My Watchlist').click();
  await expect(page.getByLabel('Contribute My Watchlist')).toBeChecked();
  await page.screenshot({
    path: info.outputPath('watch-room.png'),
    fullPage: true,
  });
  expect(writes).toEqual([
    {
      title: 'Movie Night',
      filters: { ranking: 'vote_average.desc', releaseYearFrom: 1990 },
    },
    { includeWatchlistContributions: true },
  ]);
});
