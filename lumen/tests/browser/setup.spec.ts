import { expect, test } from '@playwright/test';

test('first-run Jellyfin setup confirms the session and requires an enabled library', async ({
  page,
}) => {
  const bundled = process.env.LUMEN_TEST_MOUNT === '/lumen';
  let signedIn = false;
  let initialized = false;
  let enabled = false;
  let attempts = 0;
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname.slice(
      '/api/v1'.length
    );
    switch (path) {
      case '/settings/public':
        return route.fulfill({
          json: { initialized, mediaServerType: signedIn ? 2 : 4 },
        });
      case '/auth/me':
        return signedIn
          ? route.fulfill({
              json: { id: 1, permissions: 2, displayName: 'Owner' },
            })
          : route.fulfill({ status: 401, json: {} });
      case '/auth/jellyfin':
        expect(route.request().postDataJSON()).toMatchObject({
          hostname: 'media.example',
          serverType: 2,
          port: 8096,
        });
        signedIn = true;
        return route.fulfill({ json: { id: 1 } });
      case '/settings/jellyfin':
        return route.fulfill({
          json: { libraries: [{ id: '1', name: 'Films', enabled }] },
        });
      case '/settings/jellyfin/library':
        expect(route.request().postDataJSON()).toEqual({ enable: '1' });
        enabled = true;
        return route.fulfill({ json: [{ id: '1', name: 'Films', enabled }] });
      case '/settings/initialize':
        attempts += 1;
        initialized = true;
        return route.fulfill({ json: { initialized } });
      default:
        return route.fulfill({ json: { results: [], totalPages: 1 } });
    }
  });
  await page.goto(bundled ? '/lumen/setup' : '/');
  await expect(page).toHaveURL(bundled ? '/lumen/setup' : '/setup');
  await page.getByRole('combobox', { name: 'Media server' }).selectOption('2');
  await page.getByLabel('Hostname').fill('media.example');
  await page.getByLabel('Username').fill('owner');
  await page.getByLabel('Email').fill('owner@example.test');
  await page.getByRole('button', { name: 'Connect and Sign In' }).click();
  const finish = page.getByRole('button', { name: 'Finish Setup' });
  await finish.click();
  await expect(
    page.getByText('Enable at least one media library before finishing setup.')
  ).toBeVisible();
  expect(attempts).toBe(0);
  const library = page.getByRole('checkbox', { name: 'Enable Films' });
  await library.click();
  await expect(library).toBeChecked();
  await finish.click();
  await expect(page).toHaveURL(bundled ? '/lumen/' : '/');
  expect(attempts).toBe(1);
});
