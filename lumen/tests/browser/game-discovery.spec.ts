import { expect, test } from '@playwright/test';

test('Game Finder pages with the submitted filters and saves, runs and deletes searches', async ({
  page,
}) => {
  const discovery: Record<string, unknown>[] = [];
  let saved: Record<string, unknown> | undefined;
  let invalidSaved = true;
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/api/v1/**', (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.slice('/api/v1'.length);
    if (path === '/auth/me')
      return route.fulfill({ json: { id: 2, permissions: 32 } });
    if (path === '/settings/public')
      return route.fulfill({
        json: { softwareEnabled: true, enabledMediaCategories: { game: true } },
      });
    if (path === '/game-content/discover') {
      const body = request.postDataJSON();
      discovery.push(body);
      if (discovery.length === 2)
        return route.fulfill({ json: { available: false, results: [] } });
      return route.fulfill({
        json: {
          available: true,
          results: [
            {
              game: {
                igdbId: body.cursor ? 22 : 21,
                title: body.cursor ? 'Second Game' : 'First Game',
              },
              reasons: [{ values: ['Survival'] }],
            },
          ],
          nextCursor: body.cursor ? null : 'page-two',
        },
      });
    }
    if (path === '/game-content/saved' && request.method() === 'POST') {
      saved = { ...request.postDataJSON(), id: 7 };
      return route.fulfill({ json: saved });
    }
    if (path === '/game-content/saved' && invalidSaved) {
      invalidSaved = false;
      return route.fulfill({ json: { results: [null] } });
    }
    if (path === '/game-content/saved')
      return route.fulfill({ json: { results: saved ? [saved] : [] } });
    if (path === '/game-content/saved/7') {
      expect(request.method()).toBe('DELETE');
      saved = undefined;
      return route.fulfill({ status: 204 });
    }
    return route.fulfill({ json: { results: [] } });
  });

  await page.goto('/games/discovery');
  const invalid = page
    .getByRole('alert')
    .filter({ hasText: 'Invalid saved searches response.' });
  await expect(invalid).toBeVisible();
  await invalid.getByRole('button', { name: 'Retry' }).click();
  await expect(page.getByText('No saved searches yet.')).toBeVisible();
  await page.getByLabel('Keywords').fill('crafting');
  await page.getByLabel('Themes', { exact: true }).fill('Survival');
  await page.getByLabel('Exclude Themes').fill('Horror');
  await page.getByRole('button', { name: 'Show Matches' }).click();
  await expect(page.getByRole('link', { name: 'First Game' })).toHaveAttribute(
    'href',
    '/game/game/21'
  );
  await page.getByLabel('Keywords').fill('different draft');
  await page.getByRole('button', { name: 'Load More Matches' }).click();
  await expect(page.getByRole('link', { name: 'First Game' })).toBeVisible();
  const failure = page
    .getByRole('alert')
    .filter({ hasText: 'Game Finder could not reach QuestarrNG.' });
  await expect(failure).toBeVisible();
  await failure.getByRole('button', { name: 'Retry' }).click();
  await expect(page.getByRole('link', { name: 'Second Game' })).toBeVisible();
  expect(discovery[1]).toEqual({
    filters: { text: 'crafting', themes: ['Survival'] },
    exclusions: { themes: ['Horror'] },
    cursor: 'page-two',
  });
  expect(discovery[2]).toEqual(discovery[1]);
  await page.getByLabel('Search Name').fill('My Search');
  await page.getByLabel('Notify Me of New Matches').uncheck();
  await page.getByRole('button', { name: 'Save Search' }).click();
  await expect(page.getByText('Search saved.')).toBeVisible();
  expect(saved).toMatchObject({
    name: 'My Search',
    notify: false,
    filters: { text: 'different draft' },
  });
  await page.getByLabel('Keywords').fill('changed again');
  await page.getByRole('button', { name: 'Run My Search' }).click();
  await expect(page.getByLabel('Keywords')).toHaveValue('different draft');
  await expect.poll(() => discovery.length).toBe(4);
  await page.getByRole('button', { name: 'Delete My Search' }).click();
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Delete Search' })
    .click();
  await expect(page.getByText('No saved searches yet.')).toBeVisible();
});
