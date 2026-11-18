import { expect, test } from '@playwright/test';

for (const permissions of [2, 24, 16, 32]) {
  const authorized = permissions !== 32;
  test(`household profile permissions ${permissions} gate each preview`, async ({
    page,
  }) => {
    const fetched: string[] = [];
    const avatar = 'https://plex.tv/users/example/avatar';
    await page.route('**/avatarproxy/remote?*', (route) => {
      expect(new URL(route.request().url()).searchParams.get('url')).toBe(
        avatar
      );
      return permissions === 32
        ? route.fulfill({ status: 404 })
        : route.fulfill({
            contentType: 'image/svg+xml',
            body: '<svg xmlns="http://www.w3.org/2000/svg" width="38" height="38"/>',
          });
    });
    await page.route('**/lumen-config.json', (route) =>
      route.fulfill({ json: {} })
    );
    await page.route('**/api/v1/**', (route) => {
      const path = new URL(route.request().url()).pathname.slice(
        '/api/v1'.length
      );
      fetched.push(path);
      switch (path) {
        case '/auth/me':
          return route.fulfill({
            json: {
              id: 9,
              displayName: 'Viewer',
              permissions,
            },
          });
        case '/user/19':
          return route.fulfill({
            json: {
              id: 19,
              displayName: 'Household Member',
              userType: 1,
              createdAt: '2020-06-15T12:00:00.000Z',
              email: 'member@example.test',
              avatar,
            },
          });
        case '/user/19/watch_data':
          return route.fulfill({
            json: {
              playCount: 3,
              recentlyWatched: [
                {
                  id: 7,
                  tmdbId: 25,
                  mediaType: 'tv',
                  searchMetadata: {
                    title: 'Watched Series',
                    posterPath: '/watched.jpg',
                  },
                },
              ],
            },
          });
        case '/user/19/quota':
          return route.fulfill({
            json: { movie: { limit: 5, used: 2, days: 7 } },
          });
        case '/user/19/watchlist':
          return route.fulfill({
            json: {
              results: [
                {
                  id: 1,
                  ratingKey: '23',
                  tmdbId: 23,
                  mediaType: 'movie',
                  title: 'Saved Film',
                },
              ],
              totalPages: 1,
            },
          });
        case '/user/19/requests':
          return route.fulfill({
            json: {
              results: [
                {
                  id: 3,
                  type: 'movie',
                  media: { tmdbId: 24, mediaType: 'movie' },
                },
              ],
            },
          });
        case '/request/status/3':
          return route.fulfill({
            json: {
              current: { stage: 'requested', attempt: 1 },
              history: { results: [], total: 0 },
            },
          });
        case '/movie/24':
          return route.fulfill({ json: { id: 24, title: 'Requested Film' } });
        default:
          return route.fulfill({ json: {} });
      }
    });
    await page.goto('/household/19');
    await expect(
      page.getByRole('heading', { name: 'Household Member' })
    ).toBeVisible();
    await expect(page.getByText(/Joined Jun 15, 2020/)).toBeVisible();
    const portrait = page.locator('.ph .avatar[aria-hidden="true"]');
    if (permissions === 32) await expect(portrait).toHaveText('HM');
    else
      await expect(portrait.locator('img')).toHaveAttribute(
        'src',
        '/avatarproxy/remote?url=https%3A%2F%2Fplex.tv%2Fusers%2Fexample%2Favatar'
      );
    await expect(page.getByText(/member@example\.test/)).toHaveCount(
      permissions === 2 || permissions === 24 ? 1 : 0
    );
    await expect(page.getByText(/User ID: 19/)).toHaveCount(
      permissions === 32 ? 0 : 1
    );
    const edit = page.getByRole('link', { name: 'Edit Settings' });
    if (permissions === 2 || permissions === 24)
      await expect(edit).toHaveAttribute('href', '/admin/users/19');
    else await expect(edit).toHaveCount(0);
    if (permissions === 2) {
      await expect(page.getByText('Total plays: 3')).toBeVisible();
      await expect(
        page.getByRole('link', { name: 'Watched Series' })
      ).toHaveAttribute('href', '/tv/25');
      await expect(page.locator('.rail img')).toHaveAttribute(
        'src',
        '/imageproxy/tmdb/t/p/w342/watched.jpg'
      );
    } else {
      await expect(
        page.getByRole('heading', { name: 'Playback Activity' })
      ).toHaveCount(0);
      expect(fetched).not.toContain('/user/19/watch_data');
    }
    if (permissions === 24 || permissions === 2) {
      await expect(
        page.getByRole('heading', { name: 'Request limits' })
      ).toBeVisible();
      await expect(page.getByText('of 5 left')).toBeVisible();
    } else {
      await expect(
        page.getByRole('heading', { name: 'Request limits' })
      ).toHaveCount(0);
      expect(fetched).not.toContain('/user/19/quota');
    }
    if (authorized) {
      await expect(
        page.getByRole('link', { name: 'Saved Film' })
      ).toHaveAttribute('href', '/movie/23');
      await page.getByRole('link', { name: 'Requested Film' }).click();
      await expect(page).toHaveURL('/requests?requestedBy=19&requestId=3');
      const history = page.getByRole('dialog', { name: 'Request history' });
      await expect(
        history.getByText('Current status: Requested', { exact: true })
      ).toBeVisible();
      await history.getByRole('button', { name: 'Close', exact: true }).click();
      await expect(page).toHaveURL('/requests?requestedBy=19');
    } else {
      await expect(
        page.getByRole('link', { name: 'View Requests' })
      ).toHaveCount(0);
      await expect(
        page.getByRole('link', { name: 'View Watchlist' })
      ).toHaveCount(0);
      expect(fetched).not.toContain('/user/19/requests');
      expect(fetched).not.toContain('/user/19/watchlist');
    }
  });
}

test('incomplete household preview responses recover independently', async ({
  page,
}) => {
  let attempts = 0;
  let watchlistAttempts = 0;
  let requestAttempts = 0;
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    switch (path) {
      case '/api/v1/auth/me':
        return route.fulfill({
          json: { id: 19, displayName: 'Household Member', permissions: 32 },
        });
      case '/api/v1/user/19':
        return route.fulfill({
          json: { id: 19, displayName: 'Household Member', userType: 1 },
        });
      case '/api/v1/user/19/watch_data':
        if (++attempts === 1) return route.fulfill({ json: {} });
        return route.fulfill({
          json: {
            playCount: 3,
            recentlyWatched: [{ id: 7, tmdbId: 0, mediaType: 'tv' }],
          },
        });
      case '/api/v1/user/19/watchlist':
        return route.fulfill({
          json: ++watchlistAttempts === 1 ? {} : { results: [] },
        });
      case '/api/v1/user/19/requests':
        return route.fulfill({
          json: ++requestAttempts === 1 ? {} : { results: [] },
        });
      default:
        return route.fulfill({ json: {} });
    }
  });
  await page.goto('/me');
  await page.getByRole('link', { name: 'Open My Profile' }).click();
  await expect(page).toHaveURL('/household/me');
  await expect(
    page.getByRole('heading', { name: 'Household Member' })
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Edit Settings' })
  ).toHaveAttribute('href', '/me/account');
  await expect(
    page.getByRole('link', { name: 'View Requests' })
  ).toHaveAttribute('href', '/requests?tab=all');
  const error = page.getByRole('alert').filter({
    hasText: 'Invalid playback activity response.',
  });
  await expect(error).toBeVisible();
  await error.getByRole('button', { name: 'Retry' }).click();
  await expect(page.getByText('Total plays: 3')).toBeVisible();
  await expect(
    page.getByText('No recently watched titles to display.')
  ).toBeVisible();
  await expect(page.locator('[aria-label="Recently watched"]')).toHaveCount(0);
  const watchlistError = page.getByRole('alert').filter({
    hasText: 'Invalid watchlist response.',
  });
  await watchlistError.getByRole('button', { name: 'Retry' }).click();
  await expect(page.getByText('No titles on this watchlist.')).toBeVisible();
  const requestError = page.getByRole('alert').filter({
    hasText: 'Invalid recent requests response.',
  });
  await requestError.getByRole('button', { name: 'Retry' }).click();
  await expect(page.getByText('No requests yet.')).toBeVisible();
  await expect(page.getByText('Total plays: 3')).toBeVisible();
});

test('a local account can upload a profile picture through Lumen', async ({
  page,
}) => {
  const avatar = '/avatarproxy/local/19?v=' + 'a'.repeat(64);
  let uploaded = false;
  await page.route('**/avatarproxy/local/19?*', (route) =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="38" height="38"/>',
    })
  );
  await page.route('**/api/v1/**', (route) => {
    const request = route.request();
    switch (new URL(request.url()).pathname) {
      case '/api/v1/auth/me':
        return route.fulfill({ json: { id: 19, permissions: 32 } });
      case '/api/v1/user/19':
        return route.fulfill({
          json: {
            id: 19,
            displayName: 'Local Member',
            userType: 2,
            ...(uploaded ? { avatar } : {}),
          },
        });
      case '/api/v1/user/19/avatar':
        expect(request.method()).toBe('PUT');
        expect(request.headers()['content-type']).toBe('image/png');
        expect(request.postDataBuffer()?.toString()).toBe('picture bytes');
        uploaded = true;
        return route.fulfill({ json: { id: 19, avatar } });
      default:
        return route.fulfill({ json: { results: [] } });
    }
  });
  await page.goto('/household/me');
  const button = page.getByRole('button', { name: 'Change Profile Picture' });
  const chooser = page.waitForEvent('filechooser');
  await button.click();
  await (
    await chooser
  ).setFiles({
    name: 'profile.png',
    mimeType: 'image/png',
    buffer: Buffer.from('picture bytes'),
  });
  await expect(page.locator('.ph .avatar img')).toHaveAttribute('src', avatar);
});
