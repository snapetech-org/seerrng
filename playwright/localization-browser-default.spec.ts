import { expect, test, type Page } from '@playwright/test';

test.use({ locale: 'ar-EG', serviceWorkers: 'block' });

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

test('browser-default language follows the browser and sets RTL document metadata', async ({
  page,
  baseURL,
}, testInfo) => {
  await loginAsAdmin(page, baseURL);
  await page.goto('/profile/settings/main', { waitUntil: 'networkidle' });

  const language = page.getByLabel('Display Language');
  await expect(language).toBeVisible();
  await expect(language.locator('option').first()).toContainText('العربية');
  await language.selectOption('');
  await page.locator('form button[type="submit"]').first().click();

  await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(language).toHaveValue('');

  for (const viewport of [
    { width: 1280, height: 900 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth
        )
      )
      .toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(
        `rtl-settings-${viewport.width}x${viewport.height}.png`
      ),
      fullPage: true,
    });
  }
});
