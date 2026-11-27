import { expect, test, type Page } from '@playwright/test';

const mount = process.env.LUMEN_TEST_MOUNT === '/lumen' ? '/lumen' : '';

async function mockSetup(
  page: Page,
  options?: {
    failReadback?: boolean;
    failLoad?: boolean;
  }
) {
  let saved: {
    defaultPermissions: number;
    enable4k: boolean;
    partialRequestsEnabled: boolean;
  } = {
    defaultPermissions: 0,
    enable4k: false,
    partialRequestsEnabled: false,
  };
  let postCount = 0;
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname
      .replace(/^\/lumen(?=\/)/, '')
      .slice(7);
    if (path === '/auth/me')
      return route.fulfill({ json: { id: 1, permissions: 2 } });
    if (path === '/user/1/settings/main')
      return route.fulfill({ json: { locale: 'en' } });
    if (path === '/settings/public')
      return route.fulfill({
        json: {
          initialized: true,
          mediaServerType: 4,
          enabledMediaCategories: {},
        },
      });
    if (path === '/settings/main' && route.request().method() === 'POST') {
      postCount += 1;
      saved = route.request().postDataJSON();
      return route.fulfill({ json: saved });
    }
    if (path === '/settings/main') {
      if (options?.failLoad)
        return route.fulfill({ status: 503, json: { message: 'offline' } });
      if (options?.failReadback && postCount === 1)
        return route.fulfill({
          status: 503,
          json: { message: 'Temporary failure' },
        });
      return route.fulfill({ json: saved });
    }
    return route.fulfill({ json: {} });
  });
  return () => ({ saved, postCount });
}

test('guided setup saves request defaults and verifies the saved values', async ({
  page,
}, info) => {
  const state = await mockSetup(page);
  await page.goto(`${mount}/setup?guide=1&step=defaults`);
  await expect(
    page.getByRole('heading', { name: 'Set defaults for new users' })
  ).toBeVisible();
  const request = page.getByRole('checkbox', {
    name: 'Allow new users to request media',
  });
  const enable4k = page.getByRole('checkbox', {
    name: 'Enable 4K request options',
  });
  const request4k = page.getByRole('checkbox', {
    name: 'Allow new users to request in 4K',
  });
  const partial = page.getByRole('checkbox', {
    name: 'Allow partial TV season requests',
  });
  await expect(request4k).toBeDisabled();
  await request.check();
  await enable4k.check();
  await expect(request4k).toBeEnabled();
  await request4k.check();
  await enable4k.uncheck();
  await enable4k.check();
  await expect(request4k).not.toBeChecked();
  await request4k.check();
  await partial.check();
  await page.screenshot({
    path: info.outputPath('setup-defaults.png'),
    animations: 'disabled',
  });
  await page
    .getByRole('button', { name: 'Save defaults and continue' })
    .click();
  await expect(page).toHaveURL(/step=services/);
  expect(state().postCount).toBe(1);
  expect(state().saved).toEqual({
    defaultPermissions: 1056,
    enable4k: true,
    partialRequestsEnabled: true,
  });
});

test('guided setup stays on defaults when saved readback fails', async ({
  page,
}) => {
  const state = await mockSetup(page, { failReadback: true });
  await page.goto(`${mount}/setup?guide=1&step=defaults`);
  await page
    .getByRole('checkbox', { name: 'Allow new users to request media' })
    .check();
  await page
    .getByRole('button', { name: 'Save defaults and continue' })
    .click();
  await expect(page.getByRole('alert')).toContainText(
    'The server accepted the change, but Lumen could not confirm the saved state.'
  );
  await expect(page).toHaveURL(/step=defaults/);
  await expect(
    page.getByRole('checkbox', { name: 'Allow new users to request media' })
  ).toBeChecked();
  expect(state().postCount).toBe(1);
  await page
    .getByRole('button', { name: 'Save defaults and continue' })
    .click();
  await expect(page).toHaveURL(/step=services/);
  expect(state().postCount).toBe(2);
});

test('guided setup can skip defaults without saving', async ({ page }) => {
  const state = await mockSetup(page);
  await page.goto(`${mount}/setup?guide=1&step=defaults`);
  await page
    .getByRole('checkbox', { name: 'Allow new users to request media' })
    .check();
  await page.getByRole('button', { name: 'Skip for now' }).click();
  await expect(page).toHaveURL(/step=services/);
  expect(state().postCount).toBe(0);
});
