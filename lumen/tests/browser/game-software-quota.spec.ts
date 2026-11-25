import { expect, test, type Page } from '@playwright/test';

const mount = process.env.LUMEN_TEST_MOUNT === '/lumen' ? '/lumen' : '';
const appPath = (path: string) => `${mount}${path}`;
const apiPath = (url: string) =>
  new URL(url).pathname.replace(/^\/lumen(?=\/)/, '').slice('/api/v1'.length);

async function openGame(
  page: Page,
  permissions: number,
  quotaRestricted = true
) {
  let quotaReads = 0;
  const requests: unknown[] = [];
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', (route) => {
    const request = route.request();
    const path = apiPath(request.url());
    if (path === '/auth/me')
      return route.fulfill({
        json: { id: 1, displayName: 'Player', permissions },
      });
    if (path === '/user/1/settings/main')
      return route.fulfill({
        json: {
          locale: 'en',
          enabledMediaCategories: { game: true, retro: true, modern: true },
        },
      });
    if (path === '/settings/public')
      return route.fulfill({
        json: {
          softwareEnabled: true,
          romarrEnabled: true,
          enabledMediaCategories: { game: true, retro: true, modern: true },
        },
      });
    if (path === '/user/1/quota') {
      quotaReads++;
      return route.fulfill({
        json: {
          software: {
            limit: 2,
            used: quotaRestricted ? 2 : 1,
            remaining: quotaRestricted ? 0 : 1,
            restricted: quotaRestricted,
          },
        },
      });
    }
    if (path.startsWith('/request/software/catalog/games/'))
      return route.fulfill({
        json: {
          game: {
            title: 'Fixture Quota Game',
            catalogId: '42',
            catalogProvider: 'igdb',
            igdbId: 42,
            genres: [],
            platforms: [],
            emulationSystems: [{ slug: 'nes', name: 'NES', group: 'retro' }],
          },
        },
      });
    if (path === '/request/software' && request.method() === 'POST') {
      requests.push(request.postDataJSON());
      return route.fulfill({ json: { request: { id: 9, status: 'pending' } } });
    }
    return route.fulfill({ json: { results: [] } });
  });
  await page.goto(appPath('/game/retro/42'));
  await expect(
    page.getByRole('heading', { name: 'Fixture Quota Game' })
  ).toBeVisible();
  return { getQuotaReads: () => quotaReads, requests };
}

test('restricted users see software quota and cannot submit a game request', async ({
  page,
}, info) => {
  const { getQuotaReads, requests } = await openGame(page, 32);
  await expect(
    page.getByText('You have reached your software request limit.')
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Request' })).toBeDisabled();
  if (['desktop', 'iphone'].includes(info.project.name))
    await page.screenshot({
      path: info.outputPath('software-quota-restricted.png'),
      fullPage: true,
    });
  await page.getByRole('button', { name: 'Recheck quota' }).click();
  await expect.poll(getQuotaReads).toBeGreaterThan(1);
  await expect(page.getByRole('button', { name: 'Request' })).toBeDisabled();
  expect(requests).toEqual([]);
});

test('request managers retain the native quota override and quota refreshes after submit', async ({
  page,
}) => {
  const { getQuotaReads, requests } = await openGame(page, 32 | 16);
  await expect(
    page.getByText('0 of 2 software requests remaining.')
  ).toBeVisible();
  const request = page.getByRole('button', { name: 'Request' });
  await expect(request).toBeEnabled();
  await request.click();
  await expect(
    page.getByRole('link', { name: 'Request History' })
  ).toBeVisible();
  await expect.poll(() => requests.length).toBe(1);
  await expect.poll(getQuotaReads).toBeGreaterThan(1);
});
