import { expect, test } from '@playwright/test';

test.use({ serviceWorkers: 'block' });
const baseline = process.env.SEERR_ACCOUNT_CACHE_BASELINE === 'true';
const privateText = 'Confidential issue from the previous account';
for (const width of [1440, 390]) {
  test(`account changes discard private cached issues at ${width}px`, async ({
    page,
    baseURL,
  }, info) => {
    await page.setViewportSize({ width, height: 900 });
    const login = await page
      .context()
      .request.post(`${baseURL}/api/v1/auth/local`, {
        data: { email: 'admin@seerr.dev', password: 'test1234' },
      });
    expect(login.status()).toBe(200);
    const friendPermissions = await page
      .context()
      .request.put(`${baseURL}/api/v1/user/2`, {
        data: { username: 'friend', permissions: 32 + 4194304 },
      });
    expect(friendPermissions.status()).toBe(200);
    let friend = false;
    let friendReads = 0;
    let release: (() => void) | undefined;
    const holdFriend = new Promise<void>((resolve) => {
      release = resolve;
    });
    const media = {
      id: 9101,
      mediaType: 'movie',
      tmdbId: 550,
      status: 5,
      status4k: 1,
      requests: [],
      issues: [],
    };
    const issue = {
      id: 9102,
      issueType: 1,
      status: 1,
      problemSeason: 0,
      problemEpisode: 0,
      is4k: false,
      media,
      createdBy: { id: 1, displayName: 'Admin', avatar: '' },
      comments: [{ id: 1, message: privateText }],
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };
    try {
      await page.route('**/api/v1/backdrops', (route) =>
        route.fulfill({ json: [] })
      );
      await page.route('**/api/v1/issue?*', async (route) => {
        if (friend) {
          friendReads++;
          await holdFriend;
        }
        await route.fulfill({
          json: {
            pageInfo: {
              pages: 1,
              pageSize: 10,
              results: friend ? 0 : 1,
              page: 1,
            },
            results: friend ? [] : [issue],
            counts: { all: friend ? 0 : 1, open: friend ? 0 : 1, resolved: 0 },
          },
        });
      });
      await page.route('**/api/v1/movie/550', (route) =>
        route.fulfill({
          json: {
            id: 550,
            title: 'Shared Movie',
            originalTitle: 'Shared Movie',
            releaseDate: '2020-01-01',
            genres: [],
            mediaInfo: media,
          },
        })
      );
      await page.route('**/api/v1/auth/local', (route) => {
        if (route.request().postDataJSON()?.email === 'friend@seerr.dev')
          friend = true;
        return route.continue();
      });
      await page.goto('/issues');
      const owner = await (await page.request.get('/api/v1/auth/me')).json();
      await expect(page.locator('html')).toHaveAttribute(
        'data-interface-theme',
        owner.settings?.interfaceTheme ?? 'persiusNG'
      );
      await expect(page.getByText(privateText, { exact: true })).toBeVisible();
      await page.screenshot({
        path: info.outputPath(`owner-issues-${width}.png`),
        fullPage: true,
        animations: 'disabled',
      });
      await page.evaluate(() =>
        Reflect.set(window, 'accountDocumentProbe', 'owner')
      );
      await page
        .getByRole('button', { name: 'User menu', exact: true })
        .click();
      await page.getByText('Sign Out', { exact: true }).click();
      await page.waitForURL('**/login');
      // Sign-out restores the shared browser's default Lumen entry. This
      // native cache-isolation test explicitly reopens the full interface.
      await page.goto('/seerrng');
      await expect(page.locator('input[name=email]')).toBeVisible();
      expect(
        await page.evaluate(() => Reflect.get(window, 'accountDocumentProbe'))
      ).toBe(baseline ? 'owner' : undefined);
      await page.screenshot({
        path: info.outputPath(`login-${width}.png`),
        fullPage: true,
        animations: 'disabled',
      });
      await page.evaluate(() =>
        Reflect.set(window, 'accountDocumentProbe', 'login')
      );
      await page.locator('input[name=email]').fill('friend@seerr.dev');
      await page.locator('input[name=password]').fill('test1234');
      await page.locator('button[type=submit]').click();
      await page.waitForURL(baseURL + '/');
      const nextUser = await (await page.request.get('/api/v1/auth/me')).json();
      await expect(page.locator('html')).toHaveAttribute(
        'data-interface-theme',
        nextUser.settings?.interfaceTheme ?? 'persiusNG'
      );
      await expect(
        page.getByRole('button', { name: 'User menu', exact: true })
      ).toBeVisible();
      expect(
        await page.evaluate(() => Reflect.get(window, 'accountDocumentProbe'))
      ).toBe(baseline ? 'login' : undefined);
      if (width < 640)
        await page
          .getByRole('button', { name: 'More navigation', exact: true })
          .click();
      if (
        width >= 640 &&
        (nextUser.settings?.interfaceTheme ?? 'persiusNG') === 'persiusNG'
      ) {
        await page
          .locator('.persius-navigation-more > summary')
          .filter({ visible: true })
          .click();
      }
      await page
        .getByRole('link', { name: 'Issues', exact: true })
        .filter({ visible: true })
        .first()
        .click();
      await expect(
        page.getByRole('heading', { name: 'Issues', exact: true })
      ).toBeVisible();
      if (baseline) {
        await expect(
          page.getByText(privateText, { exact: true })
        ).toBeVisible();
      } else {
        await expect.poll(() => friendReads).toBeGreaterThan(0);
        await expect(page.getByText(privateText, { exact: true })).toHaveCount(
          0
        );
        const loaded = page.waitForResponse(
          (response) =>
            response.url().includes('/api/v1/issue?') &&
            response.status() === 200
        );
        release?.();
        await loaded;
        await expect(
          page.getByText('No results', { exact: true })
        ).toBeVisible();
        await expect(page.getByText(privateText, { exact: true })).toHaveCount(
          0
        );
      }
      await page.screenshot({
        path: info.outputPath(`friend-issues-${width}.png`),
        fullPage: true,
        animations: 'disabled',
      });
    } finally {
      release?.();
      await page.context().request.post(`${baseURL}/api/v1/auth/local`, {
        data: { email: 'admin@seerr.dev', password: 'test1234' },
      });
      await page.context().request.put(`${baseURL}/api/v1/user/2`, {
        data: { username: 'friend', permissions: 32 },
      });
    }
  });
}
