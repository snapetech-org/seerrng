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
  const token = 'a'.repeat(43);
  let invites: { id: number; status: string }[] = [];
  let userId = 1;
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', (route) => {
    const request = route.request();
    const url = new URL(request.url()).pathname;
    if (url.endsWith('/auth/me'))
      return route.fulfill({ json: { id: userId, permissions: 2 } });
    if (url === path && request.method() === 'GET')
      return route.fulfill({
        json: { sessions: session.title ? [session] : [] },
      });
    if (url === path + '/9/invites') {
      if (request.method() === 'GET')
        return route.fulfill({ json: { invites } });
      const id = invites.length + 1;
      invites.push({ id, status: 'open' });
      return route.fulfill({ json: { id, token } });
    }
    if (url === path + '/9/invites/1') {
      expect(request.method()).toBe('DELETE');
      invites = [{ id: 1, status: 'revoked' }];
      return route.fulfill({ json: { revoked: true } });
    }
    if (url === path + '/invites/accept') {
      expect(request.postDataJSON()).toEqual({ token });
      return route.fulfill({ json: { sessionId: 9 } });
    }
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
  await page.getByRole('button', { name: 'Create Invite Link' }).click();
  await expect(page.getByLabel('Invite Link', { exact: true })).toHaveValue(
    new RegExp(`/watch-sessions/join#token=${token}$`)
  );
  await page.screenshot({
    path: info.outputPath('watch-invites.png'),
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Revoke Invitation 1' }).click();
  await expect(page.getByLabel('Invite Link', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Create Invite Link' }).click();
  await expect(page.getByLabel('Invite Link', { exact: true })).toHaveValue(
    new RegExp(`/watch-sessions/join#token=${token}$`)
  );
  const invite = await page
    .getByLabel('Invite Link', { exact: true })
    .inputValue();
  userId = 2;
  await page.goto(invite);
  await expect(page).toHaveURL(/\/watch-sessions\/9$/);
  await expect(
    page.getByRole('heading', { name: 'Movie Night' })
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Create Invite Link' })
  ).toHaveCount(0);
});
