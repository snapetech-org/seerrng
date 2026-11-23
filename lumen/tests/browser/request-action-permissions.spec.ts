import { expect, test } from '@playwright/test';

const cases = [
  {
    path: '/game/retro/123',
    label: 'Request',
    allowed: [2, 32],
    configure: () => ({
      '/request/software/catalog/games/123': {
        id: '123',
        catalogId: '123',
        title: 'Fixture Console Game',
        genres: [],
        platforms: [],
        emulationSystems: [{ group: 'retro', slug: 'nes', name: 'NES' }],
      },
    }),
  },
  {
    path: '/music/42',
    label: 'Request MP3',
    allowed: [2, 32, 4294967296],
    configure: () => ({
      '/music/42': {
        id: '42',
        title: 'Fixture Album',
        artist: { id: 'artist', name: 'Fixture Artist' },
        tracks: [],
        mediaInfo: { status: 1 },
      },
    }),
  },
  {
    path: '/adult/42',
    label: 'Request',
    allowed: [2, 16, 140737488355328],
    configure: () => ({
      '/adult/42': {
        id: '42',
        title: 'Fixture Scene',
        performers: [],
        serviceId: 1,
        mediaInfo: { status: 1 },
      },
    }),
  },
  {
    path: '/book/OL42W',
    label: 'Request ebook',
    allowed: [2, 32, 34359738368],
    configure: () => ({
      '/book/OL42W': {
        id: 'OL42W',
        title: 'Fixture Ebook',
        author: 'Fixture Author',
        mediaType: 'book',
        bookFormat: 'ebook',
      },
    }),
  },
  {
    path: '/comic/work-42',
    label: 'Request manga',
    allowed: [2, 32, 274877906944],
    configure: () => ({
      '/comic/work/work-42': {
        id: 'work-42',
        kind: 'manga',
        title: 'Fixture Manga',
        editionsResolved: true,
        recommendedId: 'edition-42',
        editions: [
          {
            id: 'edition-42',
            publisher: 'Fixture Press',
            languageName: 'English',
          },
        ],
      },
      '/comic/edition-42': {
        id: 'edition-42',
        title: 'Fixture Manga',
        mediaInfo: undefined,
      },
    }),
  },
];

for (const item of cases) {
  for (const permissions of [0, ...item.allowed]) {
    test(`${item.path} request action follows permissions (${permissions})`, async ({
      page,
    }, info) => {
      await page.route('https://**/*', (route) => route.abort());
      await page.route('**/lumen-config.json', (route) =>
        route.fulfill({ json: {} })
      );
      const detail = item.configure();
      await page.route('**/api/v1/**', (route) => {
        const url = new URL(route.request().url());
        const path = url.pathname.slice('/api/v1'.length);
        if (path === '/auth/me')
          return route.fulfill({
            json: { id: 1, displayName: 'Viewer', permissions },
          });
        if (path === '/settings/public')
          return route.fulfill({
            json: {
              mediaServerType: 1,
              musicEnabled: true,
              softwareEnabled: true,
              romarrEnabled: true,
              adultEnabled: true,
              comicsEnabled: true,
              enabledMediaCategories: {
                music: true,
                game: true,
                retro: true,
                adult: true,
                comic: true,
              },
            },
          });
        if (path === '/user/1/settings/main')
          return route.fulfill({
            json: {
              enabledMediaCategories: {
                music: true,
                game: true,
                retro: true,
                adult: true,
                comic: true,
              },
            },
          });
        if (path === '/service/whisparr')
          return route.fulfill({ json: [{ id: 1, isDefault: true }] });
        if (path === '/service/lidarr')
          return route.fulfill({
            json: [
              {
                id: 2,
                name: 'Fixture MP3',
                musicQuality: 'mp3',
                isDefault: true,
              },
            ],
          });
        if (path === '/request/software/catalog/popular')
          return route.fulfill({ json: { results: [], nextOffset: null } });
        if (path in detail) return route.fulfill({ json: detail[path] });
        return route.fulfill({ json: { page: 1, results: [], totalPages: 1 } });
      });
      await page.goto(item.path);
      await expect(page.locator('main h1')).toBeVisible();
      const action = page.getByRole('button', {
        name: item.label,
        exact: true,
      });
      await expect(action).toHaveCount(permissions === 0 ? 0 : 1);
      if (info.project.name === 'desktop' && permissions === 0)
        await page.screenshot({
          path: info.outputPath(
            `${item.path.slice(1).replaceAll('/', '-')}-permissions-${permissions}.png`
          ),
          fullPage: true,
          animations: 'disabled',
        });
    });
  }
}
