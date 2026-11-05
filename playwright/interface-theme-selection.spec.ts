import { expect, test } from '@playwright/test';

test.use({ serviceWorkers: 'block' });

test('users can switch and persist an installed interface theme', async ({
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

  const currentUserResponse = await page
    .context()
    .request.get(`${baseURL}/api/v1/auth/me`);
  expect(currentUserResponse.status()).toBe(200);
  const currentUser = await currentUserResponse.json();
  const userId = currentUser.id as number;
  const originalTheme = currentUser.settings?.interfaceTheme ?? 'seerrOrig';

  try {
    await page.route('**/api/v1/discover/**', (route) =>
      route.fulfill({
        json: new URL(route.request().url()).pathname.includes('/genreslider/')
          ? []
          : { page: 1, totalPages: 1, totalResults: 0, results: [] },
      })
    );
    await page.route('**/avatarproxy/**', (route) =>
      route.fulfill({
        contentType: 'image/png',
        body: Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
          'base64'
        ),
      })
    );
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await page.goto('/');

    const stylesheetResponse = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname ===
        '/api/v1/interface-themes/seerrNGJ/theme.css'
    );
    const saveResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname ===
          `/api/v1/user/${userId}/settings/interface-theme`
    );
    await page.getByRole('button', { name: 'Theme picker' }).click();
    await page.getByRole('menuitem', { name: /SeerrNGJ/ }).click();

    const [stylesheet, saved] = await Promise.all([
      stylesheetResponse,
      saveResponse,
    ]);
    expect(stylesheet.status()).toBe(200);
    expect(stylesheet.headers()['content-type']).toMatch(
      /^text\/css; charset=utf-8/u
    );
    expect(saved.status()).toBe(200);
    expect(await saved.json()).toEqual({ interfaceTheme: 'seerrNGJ' });
    await expect(page.locator('html')).toHaveAttribute(
      'data-interface-theme',
      'seerrNGJ'
    );

    await page.reload({ waitUntil: 'networkidle' });
    await expect(page.locator('html')).toHaveAttribute(
      'data-interface-theme',
      'seerrNGJ'
    );
    expect(errors).toEqual([]);
  } finally {
    await page
      .context()
      .request.post(
        `${baseURL}/api/v1/user/${userId}/settings/interface-theme`,
        {
          data: { theme: originalTheme },
          headers: { 'X-Forwarded-Proto': 'https' },
        }
      );
  }
});
