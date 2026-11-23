import { expect, test } from '@playwright/test';

const mount = process.env.LUMEN_TEST_MOUNT === '/lumen' ? '/lumen' : '';

test('TV detail plays only selected episodes from seasons the viewer may access', async ({
  page,
}) => {
  const commands: { path: string; body: unknown }[] = [];
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
        json: { id: 17, displayName: 'Reader', permissions: 32 },
      });
    if (path === '/settings/public')
      return route.fulfill({
        json: { initialized: true, otherUsersAvailability: 'distinguish' },
      });
    if (path === '/user/17/settings/main')
      return route.fulfill({ json: { locale: 'en' } });
    if (path === '/tv/42')
      return route.fulfill({
        json: {
          id: 42,
          name: 'Fixture Series',
          overview: 'A fixture.',
          genres: [],
          seasons: [
            {
              id: 1,
              name: 'Season 1',
              seasonNumber: 1,
              episodeCount: 1,
              airDate: '2020-01-01',
            },
            {
              id: 2,
              name: 'Season 2',
              seasonNumber: 2,
              episodeCount: 2,
              airDate: '2021-01-01',
            },
          ],
          mediaInfo: {
            id: 9,
            status: 5,
            seasons: [
              { seasonNumber: 1, status: 5 },
              { seasonNumber: 2, status: 5 },
            ],
            viewerRequestCoverage: {
              standard: false,
              seasons: [
                { seasonNumber: 1, standard: false, fourK: false },
                { seasonNumber: 2, standard: true, fourK: true },
              ],
            },
            requests: [],
          },
          credits: { cast: [], crew: [] },
        },
      });
    if (path === '/playback/media/9')
      return route.fulfill({
        json: {
          mediaId: 9,
          is4k: false,
          groups: [
            {
              id: 'season-1',
              title: 'Season 1',
              index: 1,
              available: true,
              items: [
                {
                  id: 'shared-episode',
                  title: 'Shared Pilot',
                  index: 1,
                  kind: 'episode',
                  available: true,
                },
              ],
            },
            {
              id: 'season-2',
              title: 'Season 2',
              index: 2,
              available: true,
              items: [
                {
                  id: 'episode-2',
                  title: 'Local Pilot',
                  index: 1,
                  kind: 'episode',
                  available: true,
                },
                {
                  id: 'episode-3',
                  title: 'Local Finale',
                  index: 2,
                  kind: 'episode',
                  available: true,
                },
              ],
            },
          ],
        },
      });
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

  await page.goto(`${mount}/tv/42`);
  await page.getByRole('button', { name: 'Playback Options' }).click();
  const dialog = page.getByRole('dialog', { name: 'Play Series' });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.locator('summary').filter({ hasText: 'Season 1' })
  ).toHaveCount(0);
  await dialog
    .locator('li.set')
    .filter({ hasText: 'Season 2' })
    .locator('summary')
    .click();
  await dialog.getByLabel('Local Pilot').uncheck();
  await expect(dialog.getByLabel('Local Finale')).toBeChecked();
  await dialog.getByLabel('Device').selectOption('device-1');
  const play = dialog.getByRole('button', { name: 'Play on Device' });
  await expect(play).toBeEnabled();
  await play.click();
  await expect(dialog.getByRole('status')).toContainText(
    'Playback started on Living Room.'
  );
  expect(commands).toEqual([
    {
      path: '/playback/media/9/play',
      body: { deviceId: 'device-1', itemIds: ['episode-3'], is4k: false },
    },
  ]);
});
