import { expect, test } from '@playwright/test';
import { openSettingsTools } from './helpers/presentation';

test('Settings Search opens the matching setting when Enter is pressed', async ({
  page,
  baseURL,
}) => {
  expect(baseURL).toBeTruthy();
  const loginResponse = await page
    .context()
    .request.post(`${baseURL}/api/v1/auth/local`, {
      data: { email: 'admin@seerr.dev', password: 'test1234' },
      headers: { 'X-Forwarded-Proto': 'https' },
    });
  expect(loginResponse.status()).toBe(200);

  const sessionCookie = loginResponse
    .headersArray()
    .find(
      (header) =>
        header.name.toLowerCase() === 'set-cookie' &&
        header.value.startsWith('connect.sid=')
    )
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

  await page.goto('/settings/metadata');
  await openSettingsTools(page);
  const search = page.getByRole('searchbox', { name: 'Search Settings' });
  await search.fill('API');
  await search.press('Enter');

  await expect(page).toHaveURL(/\/settings\/main/);
  await expect(page.locator('#apiKey')).toBeInViewport();
  await expect(page.locator('#apiKey')).toBeFocused();
});
