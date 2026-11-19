import { expect, test } from '@playwright/test';

test('team follows are reachable from sports and added and removed by exact identity', async ({
  page,
}, info) => {
  const team = { dataset: 'nhl', team: 'Fixture | Owls', league: 'NHL' };
  let saved = false;
  const actions: string[] = [];
  let rejected = true;
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.slice(7);
    if (path === '/auth/me')
      return route.fulfill({ json: { id: 1, permissions: 32 } });
    if (path === '/settings/public')
      return route.fulfill({
        json: {
          sportsEnabled: true,
          enabledMediaCategories: { sports: true },
        },
      });
    if (path === '/live-tv/status')
      return route.fulfill({
        json: { configured: true, guideReady: true, canRequest: true },
      });
    if (path === '/live-tv/sports/teams')
      return route.fulfill({
        json: { configured: true, enabled: true, teams: [team] },
      });
    if (path === '/live-tv/sports/follows' && request.method() === 'POST') {
      expect(request.postDataJSON()).toEqual({
        dataset: team.dataset,
        team: team.team,
      });
      if (rejected)
        return route.fulfill({
          status: 409,
          json: { message: 'Team follow rejected.' },
        });
      actions.push('follow');
      saved = true;
      return route.fulfill({ status: 201, json: { id: 17, ...team } });
    }
    if (path === '/live-tv/sports/follows/17') {
      expect(request.method()).toBe('DELETE');
      actions.push('unfollow');
      saved = false;
      return route.fulfill({ status: 204 });
    }
    if (path === '/live-tv/sports/follows')
      return route.fulfill({
        json: { results: saved ? [{ id: 17, ...team }] : [] },
      });
    return route.fulfill({
      json: {
        results: [],
        page: 1,
        totalPages: 1,
        totalResults: 0,
        pageInfo: { total: 0 },
      },
    });
  });
  await page.goto('/sports');
  await page.getByRole('link', { name: 'Team Follows and Recordings' }).click();
  await expect(
    page.getByRole('heading', { name: 'Followed Teams' })
  ).toBeVisible();
  const picker = page.getByRole('combobox', { name: 'Team', exact: true });
  await picker.selectOption({ label: 'Fixture | Owls (NHL)' });
  const follow = page.getByRole('button', { name: 'Follow', exact: true });
  await follow.click();
  await expect(page.getByRole('alert')).toHaveText('Team follow rejected.');
  await expect(follow).toBeEnabled();
  rejected = false;
  await follow.click();
  const unfollow = page.getByRole('button', {
    name: 'Unfollow Fixture | Owls',
  });
  await expect(unfollow).toBeVisible();
  await expect(
    picker.locator('option', { hasText: 'Fixture | Owls' })
  ).toHaveCount(0);
  await page.screenshot({
    path: info.outputPath('followed-teams.png'),
    fullPage: true,
  });
  await unfollow.click();
  await expect(page.getByText('You are following no teams.')).toBeVisible();
  await expect(
    picker.locator('option', { hasText: 'Fixture | Owls' })
  ).toHaveCount(1);
  expect(actions).toEqual(['follow', 'unfollow']);
});
