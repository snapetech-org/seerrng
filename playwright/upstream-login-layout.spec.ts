import { expect, test } from '@playwright/test';

// Public sign-in uses the default theme before an account preference exists.
// Geometry is measured from actual upstream Seerr v3.5.1, not a fork snapshot.
for (const width of [390, 1440]) {
  test(`upstream sign-in geometry and rejected credentials at ${width}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/login');
    await expect(page.locator('html')).toHaveAttribute(
      'data-interface-theme',
      'seerrOrig'
    );
    const email = page.getByTestId('email');
    const password = page.locator('#password');
    await expect(email).toBeVisible();
    const fieldWidth = width < 640 ? width - 80 : 368;
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
    await expect(plex).toHaveCSS('border-color', 'rgb(204, 123, 25)');
    await expect(plex.locator('svg')).toHaveCSS('width', '32px');
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
