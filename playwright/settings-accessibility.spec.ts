import { expect, test, type Page } from '@playwright/test';

test.use({ serviceWorkers: 'block' });

const loginAsAdmin = async (page: Page, baseURL: string | undefined) => {
  expect(baseURL).toBeTruthy();
  const response = await page
    .context()
    .request.post(`${baseURL}/api/v1/auth/local`, {
      data: { email: 'admin@seerr.dev', password: 'test1234' },
      headers: { 'X-Forwarded-Proto': 'https' },
    });
  expect(response.status()).toBe(200);
  const sessionCookie = response
    .headersArray()
    .find((header) => header.name.toLowerCase() === 'set-cookie')
    ?.value.match(/^connect\.sid=([^;]+)/)?.[1];
  expect(sessionCookie).toBeTruthy();
  await page.context().addCookies([
    {
      name: 'connect.sid',
      value: sessionCookie!,
      url: baseURL!,
      httpOnly: true,
      secure: false,
      sameSite: 'Lax',
    },
  ]);
};

test('settings controls have accessible names linked to their purpose', async ({
  page,
  baseURL,
}) => {
  await loginAsAdmin(page, baseURL);

  await page.goto('/settings/logs');
  await expect(
    page.getByRole('textbox', { name: 'Search logs' })
  ).toBeVisible();
  await expect(
    page.getByRole('combobox', { name: 'Filter logs by severity' })
  ).toBeVisible();

  await page.goto('/settings/notifications/discord');
  await expect(page.getByLabel('Webhook URL')).toBeVisible();

  await page.goto('/settings/notifications/slack');
  await expect(page.getByLabel('Webhook URL')).toBeVisible();

  await page.goto('/settings/users');
  await page
    .getByRole('combobox', { name: 'Global Movie Request Limit' })
    .selectOption('1');
  await expect(
    page.getByRole('combobox', {
      name: 'Number of days for Global Movie Request Limit',
    })
  ).toBeVisible();

  await page.goto('/settings');
  await expect(
    page.getByRole('combobox', { name: 'Discover Language' })
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Discover Region' })
  ).toBeVisible();

  await page.goto('/settings/metadata');
  await expect(
    page.getByRole('combobox', { name: 'Series metadata provider' })
  ).toBeVisible();
  await expect(
    page.getByRole('combobox', { name: 'Anime metadata provider' })
  ).toBeVisible();

  await page.goto('/profile/settings/main');
  await expect(
    page.getByRole('combobox', { name: 'Discover Language' })
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Discover Region' })
  ).toBeVisible();
});
