import { expect, test } from '@playwright/test';

test('password and Episode Queue bookmarks scroll to the selected section after loading', async ({
  page,
}) => {
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/api/v1/**', (route) => {
    const { pathname } = new URL(route.request().url());
    const responses: Record<string, object> = {
      '/api/v1/auth/me': {
        id: 2,
        displayName: 'Viewer',
        permissions: 32,
        userType: 3,
      },
      '/api/v1/user/2/settings/main': { username: 'Viewer' },
      '/api/v1/user/2/settings/password': { hasPassword: true },
      '/api/v1/user/2/settings/tv-season-watch-gate': {
        status: 'off',
        globallyEnabled: false,
      },
      '/api/v1/user/2/settings/episode-queue': { defaultEpisodeCount: 2 },
    };
    return route.fulfill({ json: responses[pathname] ?? {} });
  });
  await page.addInitScript(() => {
    const scroll = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function (options) {
      this.setAttribute('data-bookmark-target', 'true');
      scroll.call(this, options);
    };
  });
  for (const [path, id] of [
    ['./me/account#password', 'password'],
    ['./me/account/tv-requests#episode-queue', 'episode-queue'],
    ['./me/account#advanced-theme', 'advanced-theme'],
  ]) {
    await page.goto(path);
    await expect(page.locator(`section#${id}`)).toHaveAttribute(
      'data-bookmark-target',
      'true'
    );
  }
  await page.goto('./me/account');
  await expect(page.getByText('Jellyfin User', { exact: true })).toBeVisible();
  await expect(
    page.locator('dd').getByText('User', { exact: true })
  ).toBeVisible();
});

test('account settings preserve failed profile edits and save only changes and password fields', async ({
  page,
}) => {
  const profile = {
    username: 'Viewer',
    email: 'viewer@example.test',
    preferredLanguages: { all: 'en', movie: 'fr', tv: null, book: 'zz' },
  };
  const writes: unknown[] = [];
  let reject = true;
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/api/v1/**', (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.slice('/api/v1'.length);
    if (path === '/auth/me')
      return route.fulfill({
        json: {
          id: 2,
          displayName: profile.username,
          permissions: 32,
          userType: 2,
        },
      });
    if (path === '/languages')
      return route.fulfill({
        json: [
          { iso_639_1: 'en', english_name: 'English' },
          { iso_639_1: 'fr', english_name: 'French' },
        ],
      });
    if (path === '/user/2/settings/main') {
      if (request.method() === 'POST') {
        const body = request.postDataJSON();
        writes.push(body);
        if (reject) {
          reject = false;
          return route.fulfill({ status: 503, json: {} });
        }
        Object.assign(profile, body);
      }
      return route.fulfill({ json: profile });
    }
    if (path === '/user/2/settings/password') {
      if (request.method() === 'POST') {
        writes.push(request.postDataJSON());
        return route.fulfill({ status: 204 });
      }
      return route.fulfill({ json: { hasPassword: true } });
    }
    return route.fulfill({ json: {} });
  });
  await page.goto('./me');
  await page.getByRole('link', { name: 'Open Account Settings' }).click();
  const displayName = page.getByLabel('Display Name');
  await expect(displayName).toHaveValue('Viewer');
  await displayName.fill('Updated Viewer');
  await page.getByRole('button', { name: 'Save Profile' }).click();
  await expect(
    page.getByText('Could not save the profile.', { exact: false })
  ).toBeVisible();
  await expect(displayName).toHaveValue('Updated Viewer');
  await page.getByRole('button', { name: 'Save Profile' }).click();
  await expect(page.getByText('Profile saved.')).toBeVisible();
  expect(writes).toEqual([
    { username: 'Updated Viewer' },
    { username: 'Updated Viewer' },
  ]);
  const movieLanguage = page.getByLabel('Movie Language Override');
  const seriesLanguage = page.getByLabel('Series Language Override');
  await expect(movieLanguage).toHaveValue('fr');
  await expect(seriesLanguage).toHaveValue('');
  await expect(page.getByLabel('Book Language Override')).toHaveValue('zz');
  await movieLanguage.selectOption('inherit');
  await seriesLanguage.selectOption('fr');
  await page.getByRole('button', { name: 'Save Profile' }).click();
  await expect(
    page.getByRole('button', { name: 'Save Profile' })
  ).toBeDisabled();
  expect(writes.at(-1)).toEqual({
    preferredLanguages: { all: 'en', tv: 'fr', book: 'zz' },
  });
  const savePassword = page.getByRole('button', { name: 'Save Password' });
  await page.getByLabel('Current Password').fill('synthetic-current');
  await page.getByLabel('New Password').fill('synthetic-new');
  await expect(savePassword).toBeDisabled();
  await page.getByLabel('Confirm Password').fill('synthetic-new');
  await savePassword.click();
  await expect(
    page.getByText('Password saved.', { exact: false })
  ).toBeVisible();
  expect(writes.at(-1)).toEqual({
    currentPassword: 'synthetic-current',
    newPassword: 'synthetic-new',
  });
  await expect(page.getByLabel('New Password')).toHaveValue('');
});

test('watchlist preferences honor account type and category permissions and persist false', async ({
  page,
}) => {
  const profile = { username: 'Viewer', watchlistSyncMusic: true };
  const writes: unknown[] = [];
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/api/v1/**', (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.endsWith('/auth/me'))
      return route.fulfill({
        json: {
          id: 2,
          displayName: profile.username,
          permissions: 8606711808,
          userType: 2,
        },
      });
    if (path.endsWith('/user/2/settings/main')) {
      if (request.method() === 'POST') {
        const body = request.postDataJSON();
        writes.push(body);
        Object.assign(profile, body);
      }
      return route.fulfill({ json: profile });
    }
    return route.fulfill({ json: {} });
  });

  await page.goto('./me/account');
  const music = page.getByRole('checkbox', { name: 'Auto-Request Music' });
  await expect(music).toBeChecked();
  await expect(page.getByLabel('Auto-Request Movies')).toHaveCount(0);
  await expect(page.getByLabel('Auto-Request Books')).toHaveCount(0);
  await music.uncheck();
  await page.getByRole('button', { name: 'Save Profile' }).click();
  await expect(page.getByText('Profile saved.')).toBeVisible();
  expect(writes).toEqual([{ watchlistSyncMusic: false }]);
  await page.reload();
  await expect(music).toBeVisible();
  await expect(music).not.toBeChecked();
});

test('account theme colors preserve stored overrides for other controls', async ({
  page,
}) => {
  const classicOnly = { '--theme-page-spotlight-strength': 0.5 };
  const overrides: Record<string, string | number> = { ...classicOnly };
  let fail = true;
  await page.route('**/api/v1/**', (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.slice(7);
    if (path === '/auth/me')
      return route.fulfill({
        json: {
          id: 2,
          permissions: 32,
          settings: { advancedThemeOverrides: overrides },
        },
      });
    if (path === '/user/2/settings/advanced-theme') {
      if (fail) {
        fail = false;
        return route.fulfill({
          status: 503,
          json: { message: 'Theme save unavailable.' },
        });
      }
      for (const [key, value] of Object.entries(
        request.postDataJSON().changes
      )) {
        if (typeof value === 'string' || typeof value === 'number')
          overrides[key] = value;
        else delete overrides[key];
      }
      if (overrides['--theme-page-bg'] === '#123')
        overrides['--theme-page-bg'] = '#112233';
      return route.fulfill({ json: { advancedThemeOverrides: overrides } });
    }
    return route.fulfill({ json: {} });
  });
  await page.goto('./me/account');
  const background = page.getByLabel('Page Background');
  const save = page.getByRole('button', { name: 'Save Theme Colors' });
  await background.fill('invalid');
  await expect(save).toBeDisabled();
  await background.fill('#123');
  await save.click();
  await expect(page.getByText('Theme save unavailable.')).toBeVisible();
  await expect(background).toHaveValue('#123');
  expect(overrides).toEqual(classicOnly);
  await save.click();
  await expect(page.getByText('Theme colors saved.')).toBeVisible();
  expect(overrides).toEqual({ ...classicOnly, '--theme-page-bg': '#112233' });
  await expect
    .poll(() =>
      page.evaluate(() =>
        getComputedStyle(document.documentElement)
          .getPropertyValue('--bg')
          .trim()
      )
    )
    .toBe('#112233');
  await page.reload();
  await expect(background).toHaveValue('#112233');
  if (await page.locator('.side').isVisible()) {
    const sidebar = page.locator('.side');
    const width = (await sidebar.boundingBox())?.width;
    await expect(sidebar).toHaveCSS('background-image', 'none');
    await expect(sidebar).toHaveCSS('background-color', 'rgb(20, 23, 29)');
    await expect(sidebar).toHaveCSS('border-right-color', 'rgb(42, 48, 59)');
    await page.getByLabel('Sidebar Background Start').fill('#233446');
    await page.getByLabel('Sidebar Background End').fill('#0d1927');
    await page.getByLabel('Sidebar Border').fill('#506680');
    await page.getByLabel('Sidebar Hover Background').fill('#29354d');
    await save.click();
    await expect(sidebar).toHaveCSS(
      'background-image',
      'linear-gradient(rgb(35, 52, 70), rgb(13, 25, 39))'
    );
    await expect(sidebar).toHaveCSS('border-right-color', 'rgb(80, 102, 128)');
    expect((await sidebar.boundingBox())?.width).toBe(width);
    const navLink = sidebar.locator('a:not([aria-current])').first();
    await navLink.hover();
    await expect(navLink).toHaveCSS('background-color', 'rgb(41, 53, 77)');
    await page.getByLabel('Sidebar Background End').fill('');
    await save.click();
    await expect(sidebar).toHaveCSS(
      'background-image',
      'linear-gradient(rgb(35, 52, 70), rgb(20, 23, 29))'
    );
    for (const label of [
      'Sidebar Background Start',
      'Sidebar Background End',
      'Sidebar Border',
      'Sidebar Hover Background',
    ]) {
      await page.getByLabel(label).fill('');
    }
    await save.click();
    await expect(sidebar).toHaveCSS('border-right-color', 'rgb(42, 48, 59)');
    await expect(sidebar).toHaveCSS('background-image', 'none');
  }
  await background.fill('');
  await save.click();
  await expect(page.getByText('Theme colors saved.')).toBeVisible();
  expect(overrides).toEqual(classicOnly);
  await expect
    .poll(() =>
      page.evaluate(() =>
        document.documentElement.style.getPropertyValue('--bg')
      )
    )
    .toBe('');
  await page.getByRole('button', { name: 'Edit All Overrides' }).click();
  const editor = page.getByLabel('Theme Override JSON');
  await expect(editor).toHaveValue(JSON.stringify(classicOnly, null, 2));
  await editor.fill('[]');
  await page.getByRole('button', { name: 'Edit Theme Colors' }).click();
  await expect(background).toBeVisible();
  await page.getByRole('button', { name: 'Edit All Overrides' }).click();
  await expect(editor).toHaveValue('[]');
  await page.getByRole('button', { name: 'Save Theme Overrides' }).click();
  await expect(
    page.getByText(
      'Enter a JSON object with string or numeric override values.'
    )
  ).toBeVisible();
  await editor.fill(
    JSON.stringify({ '--theme-page-spotlight-strength': 0.75 })
  );
  await page.getByRole('button', { name: 'Save Theme Overrides' }).click();
  await expect(page.getByText('Theme overrides saved.')).toBeVisible();
  expect(overrides).toEqual({ '--theme-page-spotlight-strength': 0.75 });
});
