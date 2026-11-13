import { expect, test, type Page } from '@playwright/test';

// Movies and Series: one Genres button beside Sort instead of a wall of genre chips
const GENRES = [
  { id: 28, name: 'Action' },
  { id: 12, name: 'Adventure' },
  { id: 35, name: 'Comedy' },
  { id: 18, name: 'Drama' },
  { id: 14, name: 'Fantasy' },
  { id: 27, name: 'Horror' },
];

async function fixtures(page: Page) {
  const feed: string[] = [];
  await page.route('https://**/*', (r) => r.abort());
  await page.route('**/lumen-config.json', (r) => r.fulfill({ json: {} }));
  await page.route('**/seerr-classic/**', (r) =>
    r.fulfill({ status: 404, body: '' })
  );
  await page.route('**/api/v1/**', (r) => {
    const url = new URL(r.request().url());
    const path = url.pathname.slice(7);
    if (path === '/auth/me')
      return r.fulfill({
        json: { id: 1, displayName: 'viewer', permissions: 2 },
      });
    if (path === '/settings/public')
      return r.fulfill({ json: { mediaServerType: 1 } });
    if (path === '/genres/movie' || path === '/genres/tv')
      return r.fulfill({ json: GENRES });
    if (path === '/discover/movies' || path === '/discover/tv')
      feed.push(url.search);
    return r.fulfill({
      json: { page: 1, totalPages: 1, totalResults: 0, results: [] },
    });
  });
  return feed;
}

test('Movies: All genres by default; ticking genres updates the address and the list', async ({
  page,
}) => {
  const feed = await fixtures(page);
  await page.goto('/movies');
  await expect(
    page.getByRole('button', { name: 'Genres: All genres' })
  ).toBeVisible();
  // by class: while the phone sheet is open the page behind it is inert
  const picker = page.locator('.gp-btn');
  const genres = page.getByRole('group', { name: 'Genres' });
  const opt = (name: string) =>
    genres.getByRole('button', { name, exact: true });
  await expect(picker).toHaveText('All genres');
  await expect(genres).toHaveCount(0);
  await expect(page.locator('.genre-chips')).toHaveCount(0);

  await picker.click();
  await expect(picker).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('dialog', { name: 'Genres' })).toBeVisible();
  await expect(opt('All genres')).toHaveAttribute('aria-pressed', 'true');
  // the switch only matters with two or more genres: it's there from the start (so the list
  // never shifts under the finger) but stays off until then
  const matchRow = page.getByRole('group', { name: 'Genres to match' });
  await expect(
    matchRow.getByRole('button', { name: 'Match all' })
  ).toBeDisabled();
  // the phone sheet slides up: measure once it has settled
  const settled = () =>
    page.waitForFunction(() =>
      document.getAnimations().every((x) => x.playState !== 'running')
    );
  await settled();
  const before = await opt('Comedy').boundingBox();

  await opt('Action').click();
  await expect(page).toHaveURL(/\/movies\?genre=28$/);
  await expect.poll(() => feed.at(-1)).toContain('genre=28');
  await expect(picker).toHaveText('Action');
  // ticking a genre doesn't move the rest of the list
  await settled();
  expect((await opt('Comedy').boundingBox())!.y).toBeCloseTo(before!.y, 0);
  await opt('Comedy').click();
  await expect(page).toHaveURL(/genre=28%2C35/);
  await expect(
    matchRow.getByRole('button', { name: 'Match all' })
  ).toBeEnabled();
  // any of them (the default) asks TMDB for 28|35
  await expect.poll(() => feed.at(-1)).toContain('genre=28%7C35');
  await expect(picker).toHaveText('Action + 1');
  await expect(opt('Action')).toHaveAttribute('aria-pressed', 'true');
  await expect(opt('All genres')).toHaveAttribute('aria-pressed', 'false');

  // all of them asks for 28,35
  const matchGroup = page.getByRole('group', { name: 'Genres to match' });
  await matchGroup.getByRole('button', { name: 'Match all' }).click();
  await expect(page).toHaveURL(/match=all/);
  await expect.poll(() => feed.at(-1)).toContain('genre=28%2C35');
  await matchGroup.getByRole('button', { name: 'Match any' }).click();
  await expect(page).not.toHaveURL(/match=/);

  // Escape closes it, focus back on the button
  await page.keyboard.press('Escape');
  await expect(genres).toHaveCount(0);
  await expect(picker).toBeFocused();
  await expect(picker).toHaveAttribute('aria-expanded', 'false');

  // All genres clears the genres and the match switch
  await picker.click();
  await matchGroup.getByRole('button', { name: 'Match all' }).click();
  await opt('All genres').click();
  await expect(page).toHaveURL(/\/movies$/);
  await expect(picker).toHaveText('All genres');
});

test('Series: a shared address shows its genres on the button; a click outside closes the picker', async ({
  page,
}) => {
  await fixtures(page);
  await page.goto('/series?genre=18,27,14');
  const picker = page.getByRole('button', { name: /^Genres:/ });
  await expect(picker).toHaveText('Drama + 2');
  await picker.click();
  const genres = page.getByRole('group', { name: 'Genres' });
  await expect(
    genres.getByRole('button', { name: 'Horror', exact: true })
  ).toHaveAttribute('aria-pressed', 'true');
  if (page.viewportSize()!.width < 700)
    await page.locator('.sheet-scrim').click({ position: { x: 20, y: 20 } });
  else await page.getByRole('heading', { name: 'Series', level: 1 }).click();
  await expect(genres).toHaveCount(0);
});

test('desktop: the popover is keyboard friendly and stays on screen', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop', 'popover on wide screens');
  await fixtures(page);
  await page.goto('/movies');
  const picker = page.getByRole('button', { name: /^Genres:/ });
  await picker.focus();
  await page.keyboard.press('Enter');
  const pop = page.getByRole('dialog', { name: 'Genres' });
  await expect(pop).toBeVisible();
  // it opens on its first option; Space ticks it
  await expect(
    pop.getByRole('button', { name: 'All genres', exact: true })
  ).toBeFocused();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Space');
  await expect(page).toHaveURL(/genre=28/);
  // not modal: the page stays reachable behind it
  await expect(page.locator('#root')).not.toHaveJSProperty('inert', true);
  const box = (await pop.boundingBox())!;
  expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  // a narrow window flips it to the button's right edge rather than run off
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 720, height: 900 });
  await picker.click();
  const narrow = (await pop.boundingBox())!;
  expect(narrow.x).toBeGreaterThanOrEqual(0);
  expect(narrow.x + narrow.width).toBeLessThanOrEqual(720);
});

test('phones: the genres open in a bottom sheet', async ({ page }, info) => {
  test.skip(
    info.project.name !== 'iphone' && info.project.name !== 'android',
    'phones only'
  );
  const feed = await fixtures(page);
  await page.goto('/movies');
  const picker = page.getByRole('button', { name: /^Genres:/ });
  expect((await picker.boundingBox())!.height).toBeGreaterThanOrEqual(43.5);
  await picker.click();
  const sheet = page.locator('.sheet.gp-sheet');
  await expect(sheet).toBeVisible();
  await expect(sheet).toHaveAttribute('aria-modal', 'true');
  // pinned to the bottom of the screen, full width
  const box = (await sheet.boundingBox())!;
  const vp = page.viewportSize()!;
  expect(Math.round(box.y + box.height)).toBeGreaterThanOrEqual(vp.height - 1);
  expect(box.width).toBeGreaterThanOrEqual(vp.width - 1);
  const drama = sheet.getByRole('button', { name: 'Drama', exact: true });
  expect((await drama.boundingBox())!.height).toBeGreaterThanOrEqual(43.5);
  await drama.click();
  await sheet.getByRole('button', { name: 'Fantasy', exact: true }).click();
  await expect(page).toHaveURL(/genre=18%2C14/);
  await expect.poll(() => feed.at(-1)).toContain('genre=18%7C14');
  await expect(
    sheet.getByRole('group', { name: 'Genres to match' })
  ).toBeVisible();
  await sheet.getByRole('button', { name: 'Done' }).click();
  await expect(sheet).toHaveCount(0);
  await expect(picker).toHaveText('Drama + 1');
  await expect(picker).toBeFocused();
});
