import { expect, test } from '@playwright/test';

// Public native sign-in now uses the owner-adopted Persius default before an
// account preference exists. Orig geometry remains a signed-in theme contract.
for (const width of [390, 1440]) {
  test(`default native sign-in geometry and rejected credentials at ${width}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/login');
    await expect(page.locator('html')).toHaveAttribute(
      'data-interface-theme',
      'persiusNG'
    );
    const email = page.getByTestId('email');
    const password = page.locator('#password');
    await expect(email).toBeVisible();
    const fieldWidth = width < 640 ? width - 112 : 336;
    const fieldHeight = width < 640 ? 42 : 38;
    for (const field of [email, password]) {
      await expect
        .poll(
          async () =>
            (
              await page
                .locator('.form-input-field')
                .filter({ has: field })
                .boundingBox()
            )?.width
        )
        .toBe(fieldWidth);
      await expect
        .poll(async () => (await field.boundingBox())?.height)
        .toBe(fieldHeight);
    }
    const plex = page.getByTestId('plex-login-button');
    await expect(plex).toHaveCSS('border-color', 'rgba(0, 0, 0, 0)');
    await expect(plex.locator('svg')).toHaveCSS('width', '16px');
    await page.screenshot({
      path: info.outputPath(`login-${width}.png`),
      fullPage: true,
    });

    await page.route('**/api/v1/auth/local', (route) =>
      route.fulfill({ status: 403, json: { message: 'Invalid credentials' } })
    );
    await email.fill('rejected@example.test');
    await password.fill('read-only-fixture');
    await page.getByTestId('local-signin-button').click();
    await expect(
      page.getByText('The email address or password is incorrect.', {
        exact: true,
      })
    ).toBeVisible();
    await expect(email).toBeEnabled();
    await expect(password).toBeEnabled();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth)
    ).toBeLessThanOrEqual(width);
  });
}
