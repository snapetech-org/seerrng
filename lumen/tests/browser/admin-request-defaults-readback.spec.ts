import { expect, test, type Page } from '@playwright/test';

const mount = process.env.LUMEN_TEST_MOUNT === '/lumen' ? '/lumen' : '';
const appPath = (path: string) => `${mount}${path}`;

async function mockAdmin(page: Page) {
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    return route.fulfill({
      json: path.endsWith('/auth/me')
        ? { id: 1, displayName: 'Administrator', permissions: 2 }
        : path.endsWith('/user/1/settings/main')
          ? { locale: 'en', lumenPreferences: {} }
          : path.endsWith('/settings/public')
            ? { applicationTitle: 'SeerrNG' }
            : {},
    });
  });
}

test('default quota save remains retryable until fresh settings confirm it', async ({
  page,
}, testInfo) => {
  const path = '/api/v1/settings/main';
  let quotaLimit = 4;
  let writes = 0;
  await mockAdmin(page);
  await page.route('**/api/v1/settings/main', (route) => {
    const request = route.request();
    if (request.method() === 'GET')
      return route.fulfill({
        json: {
          defaultQuotas: { movie: { quotaLimit, quotaDays: 7 } },
          defaultPermissions: 32,
        },
      });
    expect(request.method()).toBe('POST');
    expect(new URL(request.url()).pathname).toBe(path);
    const body = request.postDataJSON() as {
      defaultQuotas: { movie: { quotaLimit: number } };
    };
    expect(body).toEqual({
      defaultQuotas: { movie: { quotaLimit: 5 } },
    });
    writes++;
    if (writes > 1) quotaLimit = body.defaultQuotas.movie.quotaLimit;
    return route.fulfill({
      json: { defaultQuotas: { movie: { quotaLimit: 5, quotaDays: 7 } } },
    });
  });

  await page.goto(appPath('/admin/requests#default-request-quotas'));
  const limit = page.getByLabel('Request Limit', { exact: true });
  const save = page.getByRole('button', { name: 'Save Default Quota' });
  await limit.fill('5');
  await save.click();
  await expect(page.getByRole('alert')).toHaveText(
    'Could not confirm the saved default quota.'
  );
  await expect(limit).toHaveValue('5');
  await expect(save).toBeEnabled();
  if (
    process.env.LUMEN_CAPTURE_DEFAULTS_READBACK &&
    ['desktop', 'iphone'].includes(testInfo.project.name)
  )
    await page.screenshot({
      path: `${process.env.LUMEN_CAPTURE_DEFAULTS_READBACK}/quota-unconfirmed-${testInfo.project.name}.png`,
      fullPage: true,
    });

  await save.click();
  await expect(
    page.getByText('Default request quota saved.', { exact: true })
  ).toBeVisible();
  await expect(limit).toHaveValue('5');
  await expect(save).toBeDisabled();
  if (
    process.env.LUMEN_CAPTURE_DEFAULTS_READBACK &&
    ['desktop', 'iphone'].includes(testInfo.project.name)
  )
    await page.screenshot({
      path: `${process.env.LUMEN_CAPTURE_DEFAULTS_READBACK}/quota-confirmed-${testInfo.project.name}.png`,
      fullPage: true,
    });
  expect(writes).toBe(2);
});

test('default permission save checks fresh settings before confirming', async ({
  page,
}, testInfo) => {
  const path = '/api/v1/settings/main';
  let permissions = 32;
  let writes = 0;
  await mockAdmin(page);
  await page.route('**/api/v1/settings/main', (route) => {
    const request = route.request();
    if (request.method() === 'GET')
      return route.fulfill({ json: { defaultPermissions: permissions } });
    expect(request.method()).toBe('POST');
    expect(new URL(request.url()).pathname).toBe(path);
    const body = request.postDataJSON() as { defaultPermissions: number };
    expect(body.defaultPermissions).toBe(34359738400);
    writes++;
    if (writes > 1) permissions = body.defaultPermissions;
    return route.fulfill({
      json: { defaultPermissions: body.defaultPermissions },
    });
  });

  await page.goto(appPath('/admin/requests#default-user-permissions'));
  const books = page.getByRole('checkbox', {
    name: 'Request Books',
    exact: true,
  });
  await expect(books).toBeVisible();
  await books.check();
  const save = page.getByRole('button', { name: 'Save Default Permissions' });
  await save.click();
  const confirm = page.getByRole('alertdialog').getByRole('button', {
    name: 'Save Default Permissions',
  });
  await confirm.click();
  await expect(page.getByRole('alert')).toHaveText(
    'Could not confirm the saved default permissions.'
  );
  await expect(books).toBeChecked();
  if (
    process.env.LUMEN_CAPTURE_DEFAULTS_READBACK &&
    ['desktop', 'iphone'].includes(testInfo.project.name)
  )
    await page.screenshot({
      path: `${process.env.LUMEN_CAPTURE_DEFAULTS_READBACK}/permissions-unconfirmed-${testInfo.project.name}.png`,
      fullPage: true,
    });

  await save.click();
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Save Default Permissions' })
    .click();
  await expect(
    page.getByText('Default permissions saved.', { exact: true })
  ).toBeVisible();
  await expect(books).toBeChecked();
  if (
    process.env.LUMEN_CAPTURE_DEFAULTS_READBACK &&
    ['desktop', 'iphone'].includes(testInfo.project.name)
  )
    await page.screenshot({
      path: `${process.env.LUMEN_CAPTURE_DEFAULTS_READBACK}/permissions-confirmed-${testInfo.project.name}.png`,
      fullPage: true,
    });
  expect(writes).toBe(2);
});
