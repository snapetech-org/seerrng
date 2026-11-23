import { expect, test } from '@playwright/test';

const mount = process.env.LUMEN_TEST_MOUNT === '/lumen' ? '/lumen' : '';
const appPath = (path: string) => `${mount}${path}`;
const apiPath = (pathname: string) =>
  pathname.slice(pathname.indexOf('/api/v1') + '/api/v1'.length);

test('large TV requests load in bounded batches and recover only the failed seasons', async ({
  page,
}) => {
  const batches: string[] = [];
  const requests: unknown[] = [];
  let retrying = false;
  const seasons = Array.from({ length: 15 }, (_, index) => {
    const seasonNumber = index + 1;
    return {
      seasonNumber,
      episodeCount: 1,
      name: `Season ${seasonNumber}`,
      airDate: '2020-01-01',
    };
  });

  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = apiPath(url.pathname);
    if (request.method() !== 'GET') requests.push(request.postDataJSON());

    switch (path) {
      case '/auth/me':
        return route.fulfill({
          json: { id: 1, displayName: 'Viewer', permissions: 2 },
        });
      case '/user/1/settings/main':
        return route.fulfill({ json: { locale: 'en' } });
      case '/settings/public':
        return route.fulfill({ json: { partialRequestsEnabled: true } });
      case '/tv/84773':
        return route.fulfill({
          json: {
            id: 84773,
            name: 'Long Running Fixture',
            externalIds: { tvdbId: 80 },
            overview: 'Fifteen seasons.',
            genres: [],
            firstAirDate: '2005-01-01',
            contentRatings: { results: [] },
            seasons,
            numberOfSeasons: seasons.length,
            mediaInfo: { seasons: [], requests: [] },
          },
        });
      case '/tv/84773/seasons': {
        const query = url.searchParams.get('seasonNumbers') ?? '';
        batches.push(query);
        const numbers = query.split(',').map(Number);
        if (!retrying && numbers[0] === 1)
          return route.fulfill({
            status: 503,
            json: { message: 'Temporary metadata failure' },
          });
        return route.fulfill({
          json: numbers.map((seasonNumber) => ({
            seasonNumber,
            episodes: [
              {
                episodeNumber: 1,
                name: `Episode from season ${seasonNumber}`,
              },
            ],
          })),
        });
      }
      case '/request':
        return route.fulfill({ json: { id: 44, status: 1 } });
      default:
        return route.fulfill({ json: { results: [] } });
    }
  });

  await page.goto(appPath('/tv/84773'));
  await page
    .getByRole('button', { name: 'Request Episodes', exact: true })
    .click();
  const sheet = page.getByRole('dialog', { name: 'Request Episodes' });
  await expect(sheet.getByRole('alert')).toContainText(
    'Some season details remain unavailable.'
  );
  await expect.poll(() => batches.length).toBe(3);
  expect(batches).toEqual(['1,2,3,4,5', '6,7,8,9,10', '11,12,13,14,15']);

  await sheet.getByText('Season 6', { exact: true }).click();
  const middleEpisode = sheet.getByRole('checkbox', {
    name: 'E1 Episode from season 6',
    exact: true,
  });
  await middleEpisode.check();
  await sheet.getByText('Season 15', { exact: true }).click();
  const lastEpisode = sheet.getByRole('checkbox', {
    name: 'E1 Episode from season 15',
    exact: true,
  });
  await lastEpisode.check();

  retrying = true;
  await sheet.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect.poll(() => batches.length).toBe(4);
  expect(batches[3]).toBe('1,2,3,4,5');
  await expect(middleEpisode).toBeChecked();
  await expect(lastEpisode).toBeChecked();

  await sheet.getByText('Season 1', { exact: true }).click();
  await sheet
    .getByRole('checkbox', {
      name: 'E1 Episode from season 1',
      exact: true,
    })
    .check();
  await sheet
    .getByRole('button', { name: 'Request Selected Episodes', exact: true })
    .click();

  await expect.poll(() => requests.length).toBe(1);
  expect(requests).toEqual([
    {
      mediaType: 'tv',
      mediaId: 84773,
      is4k: false,
      seasons: [1, 6, 15],
      seasonRequests: [
        { seasonNumber: 1, episodeNumbers: [1] },
        { seasonNumber: 6, episodeNumbers: [1] },
        { seasonNumber: 15, episodeNumbers: [1] },
      ],
    },
  ]);
});
