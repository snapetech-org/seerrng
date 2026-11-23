import { expect, test } from '@playwright/test';

const mount = process.env.LUMEN_TEST_MOUNT === '/lumen' ? '/lumen' : '';

for (const quality of ['hd', '4k'] as const) {
  test(`movie detail playback actions work at ${quality}`, async ({
    page,
  }, testInfo) => {
    const is4k = quality === '4k';
    const commands: { path: string; body: unknown }[] = [];
    const catalogQualities: string[] = [];
    await page.route('https://**/*', (route) => route.abort());
    await page.route('**/lumen-config.json', (route) =>
      route.fulfill({ json: {} })
    );
    await page.route('**/api/v1/**', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const path = url.pathname
        .replace(/^\/lumen(?=\/)/, '')
        .slice('/api/v1'.length);
      if (path === '/auth/me')
        return route.fulfill({
          json: {
            id: 17,
            displayName: 'Reader',
            permissions: 32 | (is4k ? 2048 : 0),
          },
        });
      if (path === '/settings/public')
        return route.fulfill({
          json: { initialized: true, movie4kEnabled: true },
        });
      if (path === '/user/17/settings/main')
        return route.fulfill({ json: { locale: 'en' } });
      if (path === '/movie/42')
        return route.fulfill({
          json: {
            id: 42,
            title: 'Fixture Movie',
            overview: 'A fixture.',
            genres: [],
            credits: { cast: [], crew: [] },
            mediaInfo: {
              id: 9,
              status: is4k ? 1 : 5,
              status4k: 5,
              requests: [],
            },
          },
        });
      if (path === '/playback/media/9') {
        catalogQualities.push(url.searchParams.get('is4k') ?? 'hd');
        return route.fulfill({
          json: {
            mediaId: 9,
            is4k: url.searchParams.get('is4k') === 'true',
            rootItem: { id: 'movie-item-9', kind: 'movie', available: true },
            groups: [],
          },
        });
      }
      if (path === '/playback/devices')
        return route.fulfill({
          json: [
            {
              id: 'device-1',
              name: 'Living Room',
              client: 'Plex Web',
              serverType: 2,
            },
          ],
        });
      if (path === '/playback/media/9/play') {
        commands.push({ path, body: request.postDataJSON() });
        return route.fulfill({ status: 204, body: '' });
      }
      if (path === '/playback/media/9/playlist') {
        commands.push({ path, body: request.postDataJSON() });
        return route.fulfill({
          json: { url: 'http://plex.local/web/index.html' },
        });
      }
      return route.fulfill({ json: { results: [] } });
    });

    await page.goto(`${mount}/movie/42${is4k ? '?quality=4k' : ''}`);
    const open = page.getByRole('button', { name: 'Playback Options' });
    await expect(open).toBeVisible();
    if (['desktop', 'iphone'].includes(testInfo.project.name))
      await page.screenshot({
        path: testInfo.outputPath('movie-playback-options.png'),
        fullPage: true,
      });
    await open.click();
    const dialog = page.getByRole('dialog', { name: 'Play Movie' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveCSS('opacity', '1');
    await dialog.getByLabel('Device').selectOption('device-1');
    if (['desktop', 'iphone'].includes(testInfo.project.name)) {
      await page.screenshot({
        path: testInfo.outputPath('movie-playback-sheet.png'),
        fullPage: true,
      });
    }
    await dialog.getByRole('button', { name: 'Play on Device' }).click();
    await expect(dialog.getByRole('status')).toContainText(
      'Playback started on Living Room.'
    );
    await dialog
      .getByRole('button', { name: 'Create Playback Playlist' })
      .click();
    await expect(
      dialog.getByRole('link', { name: 'Open on Media Server' })
    ).toHaveAttribute('href', 'http://plex.local/web/index.html');
    expect(commands).toEqual([
      {
        path: '/playback/media/9/play',
        body: { deviceId: 'device-1', itemIds: ['movie-item-9'], is4k },
      },
      {
        path: '/playback/media/9/playlist',
        body: { itemIds: ['movie-item-9'], is4k },
      },
    ]);
    expect(catalogQualities).toContain(is4k ? 'true' : 'hd');
  });
}

for (const access of [
  { name: 'movie request permission', permissions: 0, movie4kEnabled: true },
  { name: '4K permission', permissions: 32, movie4kEnabled: true },
  { name: 'global 4K switch', permissions: 32 | 2048, movie4kEnabled: false },
]) {
  test(`movie detail respects ${access.name}`, async ({ page }) => {
    await page.route('https://**/*', (route) => route.abort());
    await page.route('**/lumen-config.json', (route) =>
      route.fulfill({ json: {} })
    );
    await page.route('**/api/v1/**', (route) => {
      const path = new URL(route.request().url()).pathname
        .replace(/^\/lumen(?=\/)/, '')
        .slice('/api/v1'.length);
      if (path === '/auth/me')
        return route.fulfill({
          json: {
            id: 17,
            displayName: 'Reader',
            permissions: access.permissions,
          },
        });
      if (path === '/settings/public')
        return route.fulfill({
          json: { initialized: true, movie4kEnabled: access.movie4kEnabled },
        });
      if (path === '/user/17/settings/main')
        return route.fulfill({ json: { locale: 'en' } });
      if (path === '/movie/42')
        return route.fulfill({
          json: {
            id: 42,
            title: 'Fixture Movie',
            genres: [],
            credits: { cast: [], crew: [] },
            mediaInfo: { id: 9, status: 5, status4k: 5, requests: [] },
          },
        });
      return route.fulfill({ json: { results: [] } });
    });
    await page.goto(`${mount}/movie/42?quality=4k`);
    await expect(
      page.getByRole('button', { name: 'Playback Options' })
    ).toHaveCount(0);
  });
}
