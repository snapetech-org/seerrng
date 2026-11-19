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
  const classicOnly = { '--theme-overlay-menu': '#112233' };
  let overrides: Record<string, string> = { ...classicOnly };
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
      overrides = request.postDataJSON().overrides;
      return route.fulfill({ json: { advancedThemeOverrides: overrides } });
    }
    return route.fulfill({ json: {} });
  });
  await page.goto('./me/account');
  const background = page.getByLabel('Page Background');
  const save = page.getByRole('button', { name: 'Save Theme Colors' });
  await background.fill('invalid');
  await expect(save).toBeDisabled();
  await background.fill('#123456');
  await save.click();
  await expect(page.getByText('Theme colors saved.')).toBeVisible();
  expect(overrides).toEqual({ ...classicOnly, '--theme-page-bg': '#123456' });
  await expect
    .poll(() =>
      page.evaluate(() =>
        getComputedStyle(document.documentElement)
          .getPropertyValue('--bg')
          .trim()
      )
    )
    .toBe('#123456');
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
});
