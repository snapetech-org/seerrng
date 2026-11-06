import { expect, test, type Page } from '@playwright/test';

async function fixtures(page: Page, settings: Record<string, unknown>) {
  let signedIn = false;
  const posts: { path: string; body: Record<string, unknown> }[] = [];
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('https://**/*', (r) => r.abort());
  await page.route('**/lumen-config.json', (r) => r.fulfill({ json: {} }));
  await page.route('**/api/v1/**', (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname.slice(7);
    if (req.method() === 'POST')
      posts.push({ path, body: req.postDataJSON() ?? {} });
    if (path === '/settings/public')
      return route.fulfill({
        json: {
          mediaServerType: 2,
          mediaServerLogin: true,
          localLogin: true,
          ...settings,
        },
      });
    if (path === '/auth/me')
      return route.fulfill({
        status: signedIn ? 200 : 401,
        json: signedIn ? { id: 1, displayName: 'viewer', permissions: 2 } : {},
      });
    if (
      path === '/auth/jellyfin' ||
      path === '/auth/jellyfin/quickconnect/authenticate'
    ) {
      signedIn = true;
      return route.fulfill({ json: {} });
    }
    if (path === '/auth/jellyfin/quickconnect/initiate')
      return route.fulfill({
        json: { code: '123456', secret: 'fixture-quick-connect-secret' },
      });
    if (path === '/auth/jellyfin/quickconnect/check')
      return route.fulfill({ json: { authenticated: true } });
    if (path === '/movie/101')
      return route.fulfill({
        json: {
          id: 101,
          title: 'Jellyfin fixture',
          releaseDate: '2025-01-01',
          overview: 'A media-server playback fixture.',
          genres: [],
          credits: { cast: [], crew: [] },
          releases: { results: [] },
          videos: { results: [] },
          mediaInfo: {
            id: 1,
            status: 5,
            mediaUrl:
              'https://jellyfin.example/web/index.html#!/details?id=abc',
            iOSPlexUrl:
              'plex://preplay/?metadataKey=%2Flibrary%2Fmetadata%2F101&server=stale',
          },
        },
      });
    if (path === '/discover/genreslider/movie')
      return route.fulfill({ json: [] });
    if (
      path.startsWith('/discover/') ||
      path.startsWith('/request') ||
      path.endsWith('/recommendations') ||
      path === '/media'
    )
      return route.fulfill({
        json: { page: 1, totalPages: 0, totalResults: 0, results: [] },
      });
    return route.fulfill({ json: {} });
  });
  return { posts, errors };
}

for (const [type, name] of [
  [2, 'Jellyfin'],
  [3, 'Emby'],
] as const) {
  test(`${name} credentials use native SeerrNG sign-in and server playback links`, async ({
    page,
  }, info) => {
    const fixture = await fixtures(page, { mediaServerType: type });
    await page.goto('/login');
    if (process.env.LUMEN_MEDIA_BASELINE === 'true') {
      await expect(
        page.getByRole('button', { name: 'Continue with Plex' })
      ).toBeVisible();
      await page.screenshot({
        path: info.outputPath(`${name}-login.png`),
        fullPage: true,
      });
      return;
    }
    await expect(
      page.getByRole('button', { name: 'Continue with Plex' })
    ).toHaveCount(0);
    await page
      .getByRole('button', { name: `Continue with ${name}`, exact: true })
      .click();
    await expect(
      page.getByRole('button', { name: `Sign in with ${name}`, exact: true })
    ).toBeVisible();
    await page.screenshot({
      path: info.outputPath(`${name}-login.png`),
      fullPage: true,
    });
    await page.getByLabel(`${name} username`, { exact: true }).fill('viewer');
    await page.getByLabel('Password', { exact: true }).fill('fixture-password');
    await page
      .getByRole('button', { name: `Sign in with ${name}`, exact: true })
      .click();
    await expect(page).not.toHaveURL(/\/login/);
    expect(
      fixture.posts.find((p) => p.path === '/auth/jellyfin')?.body
    ).toEqual({
      username: 'viewer',
      password: 'fixture-password',
      email: 'viewer',
    });
    await page.goto('/movie/101');
    const watch = page.getByRole('link', {
      name: `Watch on ${name}`,
      exact: true,
    });
    await expect(watch).toHaveAttribute(
      'href',
      'https://jellyfin.example/web/index.html#!/details?id=abc'
    );
    await page.screenshot({
      path: info.outputPath(`${name}-movie.png`),
      fullPage: true,
    });
    expect(fixture.posts.some((p) => p.path === '/auth/plex')).toBe(false);
    expect(fixture.errors).toEqual([]);
  });
}

test('Jellyfin Quick Connect-only respects cancellation during an approved in-flight poll', async ({
  page,
}, info) => {
  const fixture = await fixtures(page, {
    jellyfinQuickConnectOnly: true,
    localLogin: false,
  });
  let release!: () => void;
  let started!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const polling = new Promise<void>((resolve) => {
    started = resolve;
  });
  await page.route('**/auth/jellyfin/quickconnect/check?*', async (route) => {
    started();
    await held;
    await route.fulfill({ json: { authenticated: true } }).catch(() => {});
  });
  await page.goto('/login');
  await expect(page.getByLabel('Password', { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Use an email and password instead' })
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Continue with Jellyfin' }).click();
  await expect(page.locator('.login').getByRole('status')).toContainText(
    '123456'
  );
  await polling;
  await page.screenshot({
    path: info.outputPath('quick-connect.png'),
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Cancel' }).click();
  release();
  await expect(
    page.getByRole('button', { name: 'Continue with Jellyfin' })
  ).toBeEnabled();
  await page.waitForTimeout(200);
  expect(fixture.posts.some((p) => p.path.endsWith('/authenticate'))).toBe(
    false
  );
  await expect(page).toHaveURL(/\/login/);
});

test('approved Jellyfin Quick Connect signs in through SeerrNG', async ({
  page,
}) => {
  const fixture = await fixtures(page, { jellyfinQuickConnectOnly: true });
  await page.goto('/login');
  await page.getByRole('button', { name: 'Continue with Jellyfin' }).click();
  await expect(page).not.toHaveURL(/\/login/);
  expect(fixture.posts.filter((p) => p.path.endsWith('/authenticate'))).toEqual(
    [
      {
        path: '/auth/jellyfin/quickconnect/authenticate',
        body: { secret: 'fixture-quick-connect-secret' },
      },
    ]
  );
});

test('Quick Connect cancellation releases a stalled initiation immediately', async ({
  page,
}) => {
  const fixture = await fixtures(page, { jellyfinQuickConnectOnly: true });
  let release!: () => void;
  let started!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const initiating = new Promise<void>((resolve) => {
    started = resolve;
  });
  await page.route('**/auth/jellyfin/quickconnect/initiate', async (route) => {
    started();
    await held;
    await route
      .fulfill({ json: { code: '123456', secret: 'late-fixture-secret' } })
      .catch(() => {});
  });
  await page.goto('/login');
  await page.getByRole('button', { name: 'Continue with Jellyfin' }).click();
  await initiating;
  try {
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Continue with Jellyfin' })
    ).toBeEnabled();
  } finally {
    release();
  }
  await page.waitForTimeout(200);
  expect(fixture.posts.some((p) => p.path.endsWith('/authenticate'))).toBe(
    false
  );
});

test('disabled sign-in methods stay disabled', async ({ page }) => {
  const fixture = await fixtures(page, {
    mediaServerLogin: false,
    localLogin: false,
  });
  await page.goto('/login');
  await expect(page.locator('.login').getByRole('status')).toHaveText(
    'Sign-in is disabled. Contact your administrator.'
  );
  await expect(page.getByRole('textbox')).toHaveCount(0);
  await expect(page.getByRole('button')).toHaveCount(0);
  expect(fixture.posts).toEqual([]);
});

test('failed public settings shows retry without guessing enabled login methods', async ({
  page,
}) => {
  await fixtures(page, {});
  await page.route('**/settings/public', (route) =>
    route.fulfill({ status: 503, json: {} })
  );
  await page.goto('/login');
  await expect(page.getByRole('alert')).toHaveText(
    'Couldn’t load sign-in options.'
  );
  await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
  await expect(
    page.getByRole('button', { name: /Sign in with|Continue with/ })
  ).toHaveCount(0);
});
