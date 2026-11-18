import { expect, test } from '@playwright/test';

test('account settings preserve failed profile edits and save only changes and password fields', async ({
  page,
}) => {
  const profile = { username: 'Viewer', email: 'viewer@example.test' };
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
  await page.goto('/me');
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

  await page.goto('/me/account');
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
