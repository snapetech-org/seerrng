import { expect, test } from '@playwright/test';

test('a household can create a watch session and opt in to watchlist contributions', async ({
  page,
}, info) => {
  const path = '/api/v1/watch-sessions';
  let session = {
    id: 9,
    title: '',
    status: 'draft',
    filters: {},
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
    if (url.endsWith('/genres/movie'))
      return route.fulfill({
        json: [
          { id: 35, name: 'Comedy' },
          { id: 18, name: 'Drama' },
        ],
      });
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
    if (url === path + '/9') {
      if (request.method() === 'PUT') {
        const body = request.postDataJSON();
        writes.push(body);
        session = { ...session, title: body.title, filters: body.filters };
      }
      return route.fulfill({ json: { session } });
    }
    if (url === path || url === path + '/9/preferences') {
      const body = request.postDataJSON();
      writes.push(body);
      if (url === path)
        session = { ...session, title: body.title, filters: body.filters };
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
  await page.getByText('Genres (0 of 5)').click();
  await page.getByRole('checkbox', { name: 'Comedy' }).check();
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
      filters: {
        ranking: 'vote_average.desc',
        releaseYearFrom: 1990,
        genreIds: [35],
      },
    },
    { includeWatchlistContributions: true },
  ]);
  await page.getByRole('button', { name: 'Edit Session Settings' }).click();
  await page.getByText('Genres (1 of 5)').click();
  await expect(page.getByRole('checkbox', { name: 'Comedy' })).toBeChecked();
  await page.getByRole('checkbox', { name: 'Drama' }).check();
  await page.screenshot({
    path: info.outputPath('watch-genres.png'),
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Save Session Settings' }).click();
  await expect(
    page.getByRole('button', { name: 'Edit Session Settings' })
  ).toBeVisible();
  expect(writes[2]).toMatchObject({
    title: 'Movie Night',
    filters: { genreIds: [35, 18] },
  });
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

test('active watch sessions save and revise ballots and show matches', async ({
  page,
}, info) => {
  const path = '/api/v1/watch-sessions/9';
  const movie = {
    id: 84,
    candidateId: 23,
    title: 'Fixture Match',
    overview: 'A movie to watch together.',
  };
  const playbackUrl =
    'https://jf.example.com/web/index.html#!/details?id=fixture';
  let decision: string | undefined;
  const writes: unknown[] = [];
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', (route) => {
    const request = route.request();
    const url = new URL(request.url()).pathname;
    if (url.endsWith('/auth/me'))
      return route.fulfill({ json: { id: 2, permissions: 2 } });
    if (url.endsWith('/settings/public'))
      return route.fulfill({
        json: {
          applicationTitle: 'SeerrNG',
          mediaServerType: 2,
          jellyfinExternalHost: 'https://jf.example.com',
        },
      });
    if (url.endsWith('/movie/84'))
      return route.fulfill({
        json: {
          ...movie,
          genres: [],
          releases: { results: [] },
          credits: { cast: [], crew: [] },
          mediaInfo: { id: 10, status: 5, mediaUrl: playbackUrl },
        },
      });
    if (url.endsWith('/movie/84/recommendations'))
      return route.fulfill({ json: { results: [], totalPages: 0 } });
    if (url === path)
      return route.fulfill({
        json: {
          session: {
            id: 9,
            title: 'Movie Night',
            status: 'active',
            ownerId: 1,
            memberCount: 2,
            members: [
              { id: 1, displayName: 'Host', isOwner: true },
              { id: 2, displayName: 'Guest' },
            ],
            ownPreferences: { includeWatchlistContributions: false },
          },
        },
      });
    if (url === path + '/deck')
      return route.fulfill({
        json: { candidates: decision ? [] : [movie], hasMore: false },
      });
    if (url === path + '/my-ballots')
      return route.fulfill({
        json: { ballots: decision ? [{ ...movie, decision }] : [] },
      });
    if (url === path + '/matches')
      return route.fulfill({
        json: { matches: decision === 'want' ? [movie] : [], hasMore: false },
      });
    if (url === path + '/candidates/23/ballot') {
      const body = request.postDataJSON();
      decision = body.decision;
      writes.push(body);
      return route.fulfill({ json: { saved: true } });
    }
    return route.fulfill({ json: {} });
  });
  await page.goto('/watch-sessions/9');
  await page
    .getByRole('button', { name: 'Want to Watch Fixture Match' })
    .click();
  const match = page.getByRole('link', { name: 'Open Fixture Match' });
  await expect(match).toHaveAttribute('href', '/movie/84');
  await page.screenshot({
    path: info.outputPath('watch-ballots.png'),
    fullPage: true,
  });
  await match.click();
  await expect(
    page.getByRole('link', { name: 'Watch on Jellyfin' })
  ).toHaveAttribute('href', playbackUrl);
  await page.goBack();
  await page.getByRole('button', { name: 'Pass on Fixture Match' }).click();
  await expect(match).toHaveCount(0);
  await expect(page.getByText('Passed', { exact: true })).toBeVisible();
  expect(writes).toEqual([{ decision: 'want' }, { decision: 'pass' }]);
});

for (const action of [
  {
    label: 'Remove Guest',
    user: 1,
    suffix: '/members/2',
    warning: 'fewer than two members remain',
  },
  {
    label: 'End Session',
    user: 1,
    suffix: '',
    warning: 'End this session for everyone?',
  },
  {
    label: 'Leave Session',
    user: 2,
    suffix: '/members/me',
    warning: 'Your votes will be removed',
  },
]) {
  test(`watch session action requires confirmation: ${action.label}`, async ({
    page,
  }, info) => {
    const path = '/api/v1/watch-sessions';
    const deletes: string[] = [];
    await page.route('https://**/*', (route) => route.abort());
    await page.route('**/lumen-config.json', (route) =>
      route.fulfill({ json: {} })
    );
    await page.route('**/api/v1/**', (route) => {
      const request = route.request();
      const url = new URL(request.url()).pathname;
      if (url.endsWith('/auth/me'))
        return route.fulfill({ json: { id: action.user, permissions: 2 } });
      if (request.method() === 'DELETE') {
        deletes.push(url);
        return route.fulfill({ json: { closed: true } });
      }
      if (url === path) return route.fulfill({ json: { sessions: [] } });
      if (url === path + '/9')
        return route.fulfill({
          json: {
            session: {
              id: 9,
              title: 'Movie Night',
              status: 'draft',
              ownerId: 1,
              memberCount: 2,
              members: [
                { id: 1, displayName: 'Host', isOwner: true },
                { id: 2, displayName: 'Guest' },
              ],
              ownPreferences: { includeWatchlistContributions: false },
            },
          },
        });
      if (url === path + '/9/invites')
        return route.fulfill({ json: { invites: [] } });
      return route.fulfill({ json: {} });
    });
    await page.goto('/watch-sessions/9');
    await page.getByRole('button', { name: action.label }).click();
    await expect(page.getByRole('alert')).toContainText(action.warning);
    await page.screenshot({
      path: info.outputPath('watch-members.png'),
      fullPage: true,
    });
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    expect(deletes).toHaveLength(0);
    await page.getByRole('button', { name: action.label }).click();
    await page.getByRole('button', { name: 'Confirm', exact: true }).click();
    await expect(page).toHaveURL(/\/watch-sessions$/);
    expect(deletes).toEqual([path + '/9' + action.suffix]);
  });
}
