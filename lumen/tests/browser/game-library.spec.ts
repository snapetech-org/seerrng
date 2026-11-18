import { expect, test } from '@playwright/test';

test('My Games keeps private edits separate from household results', async ({
  page,
}) => {
  const game = {
    id: 4,
    title: 'Private Fixture',
    status: 'backlog',
    category: 'retro',
    catalogId: 41,
    storeName: '',
    platformName: '',
    isOwned: false,
    steamOwned: false,
    shareWithHousehold: false,
    playtimeMinutes: 0,
    request: null,
  };
  let added: typeof game | undefined;
  let removed = false;
  let writes = 0;
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/api/v1/**', (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.slice('/api/v1'.length);
    if (path === '/game-library/4' && request.method() === 'PATCH') {
      const body = request.postDataJSON();
      expect(body).toMatchObject({
        status: 'playing',
        isOwned: true,
        shareWithHousehold: true,
      });
      Object.assign(game, body);
      writes++;
      return route.fulfill({ json: { entry: game } });
    }
    if (path === '/game-library/manual' && request.method() === 'POST') {
      const body = request.postDataJSON();
      expect(body).toMatchObject({
        title: 'Manual Fixture',
        category: 'game',
        shareWithHousehold: false,
      });
      added = { ...game, ...body, id: 5, catalogId: null };
      writes++;
      return route.fulfill({ status: 201, json: { entry: added } });
    }
    if (path === '/game-library/5' && request.method() === 'DELETE') {
      removed = true;
      added = undefined;
      writes++;
      return route.fulfill({ status: 204 });
    }
    if (path === '/game-library') {
      const results = [game, ...(added ? [added] : [])];
      return route.fulfill({
        json: { results, total: results.length, nextOffset: null },
      });
    }
    if (path === '/game-library/shared') {
      expect(url.searchParams.get('minOwners')).toBe('2');
      return route.fulfill({
        json: {
          total: 1,
          nextOffset: null,
          results: [
            {
              key: 'household',
              title: 'Shared Fixture',
              category: 'game',
              catalogId: 22,
              playtimeMinutes: 60,
              owners: [
                { id: 2, displayName: 'Friend' },
                { id: 3, displayName: 'Neighbour' },
              ],
            },
          ],
        },
      });
    }
    return route.fulfill({
      json:
        path === '/auth/me'
          ? { id: 1, displayName: 'Player', permissions: 32 }
          : {},
    });
  });

  await page.goto('/me');
  await page.getByRole('link', { name: 'Open My Games' }).click();
  await expect(page.getByRole('link', { name: game.title })).toHaveAttribute(
    'href',
    '/game/retro/41'
  );
  await page.getByRole('button', { name: 'Edit Private Fixture' }).click();
  const share = page.getByLabel('Share With Household');
  await expect(share).toBeDisabled();
  await page.getByLabel('Owned', { exact: true }).check();
  await share.check();
  await page
    .getByRole('heading', { name: 'Edit Private Fixture' })
    .locator('..')
    .getByLabel('Progress')
    .selectOption('playing');
  await page.getByRole('button', { name: 'Save Changes' }).click();
  await expect(page.getByText('Owned · Shared with household')).toBeVisible();

  await page.getByRole('button', { name: 'Add a Game' }).click();
  await page.getByLabel('Game Title').fill('Manual Fixture');
  await page.getByRole('button', { name: 'Add Game', exact: true }).click();
  await page.getByRole('button', { name: 'Edit Manual Fixture' }).click();
  await page.getByRole('button', { name: 'Remove Game' }).click();
  expect(removed).toBe(false);
  await page.getByRole('button', { name: 'Confirm Removal' }).click();
  await expect(
    page.getByRole('button', { name: 'Edit Manual Fixture' })
  ).toHaveCount(0);
  expect(removed).toBe(true);

  await page.getByRole('link', { name: 'Household Games' }).click();
  await expect(
    page.getByRole('link', { name: 'Shared Fixture' })
  ).toHaveAttribute('href', '/game/game/22');
  await expect(page.getByText('Private Fixture')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Add a Game' })).toHaveCount(0);
  expect(writes).toBe(3);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth)
  ).toBeLessThanOrEqual(page.viewportSize()!.width);
});
