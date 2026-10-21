import { expect, test, type Page } from '@playwright/test';

test.use({ serviceWorkers: 'block' });

const loginAsAdmin = async (page: Page, baseURL: string | undefined) => {
  const response = await page
    .context()
    .request.post(`${baseURL}/api/v1/auth/local`, {
      data: { email: 'admin@seerr.dev', password: 'test1234' },
      headers: { 'X-Forwarded-Proto': 'https' },
    });
  expect(response.status()).toBe(200);
  const sid = response
    .headersArray()
    .find((h) => h.name.toLowerCase() === 'set-cookie')
    ?.value.match(/^connect\.sid=([^;]+)/)?.[1];
  expect(sid).toBeTruthy();
  await page.context().addCookies([
    {
      name: 'connect.sid',
      value: sid!,
      url: baseURL!,
      httpOnly: true,
      secure: false,
      sameSite: 'Lax',
    },
  ]);
};

test('Book Series routes hydrate consistently with and without query parameters', async ({
  page,
  baseURL,
}) => {
  await loginAsAdmin(page, baseURL);
  const hydrationErrors: string[] = [];
  page.on('pageerror', (error) => {
    if (/Hydration failed|Minified React error #418/.test(error.message))
      hydrationErrors.push(error.message);
  });
  page.on('console', (message) => {
    if (
      message.type() === 'error' &&
      /Hydration failed|Minified React error #418/.test(message.text())
    ) {
      hydrationErrors.push(message.text());
    }
  });

  for (const route of [
    '/book-series',
    '/book-series?query=the%20expanse&format=ebook',
    '/book-series/catalog',
    '/book-series/catalog?serverId=1&scope=series&providerId=books',
  ]) {
    await page.goto(route, { waitUntil: 'networkidle' });
    await expect(page.locator('body')).not.toBeEmpty();
  }

  expect(hydrationErrors).toEqual([]);
});
