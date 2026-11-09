import { expect, test } from '@playwright/test';

for (const frontend of ['native', 'lumen'] as const) {
  for (const width of [390, 1440]) {
    test(`${frontend} boots and blocks inline script at ${width}px`, async ({
      page,
    }, info) => {
      await page.setViewportSize({ width, height: 900 });
      const response = await page.goto(
        frontend === 'native' ? '/login' : '/lumen/login'
      );
      expect(response?.headers()['content-security-policy']).toMatch(
        /script-src 'self';/
      );
      const email =
        frontend === 'native'
          ? page.getByTestId('email')
          : page.getByLabel('Email', { exact: true });
      if (frontend === 'lumen') {
        const local = page.getByRole('button', {
          name: 'Use an email and password instead',
        });
        await expect
          .poll(
            async () => (await email.isVisible()) || (await local.isVisible())
          )
          .toBe(true);
        if (await local.isVisible()) await local.click();
      }
      await expect(email).toBeVisible();
      await email.fill('csp-fixture@example.test');
      await page.locator('input[type=password]').fill('fixture-only-password');
      await page.route('**/api/v1/auth/local', (route) =>
        route.fulfill({ status: 403, json: { message: 'Invalid credentials' } })
      );
      await (
        frontend === 'native'
          ? page.getByTestId('local-signin-button')
          : page.getByRole('button', { name: 'Sign in', exact: true })
      ).click();
      await expect(email).toBeEnabled();
      await expect(
        page.getByText(
          frontend === 'native'
            ? 'The email address or password is incorrect.'
            : 'Invalid credentials',
          { exact: true }
        )
      ).toBeVisible();
      const blocked = await page.evaluate(
        () =>
          new Promise<boolean>((resolve) => {
            const timeout = setTimeout(() => resolve(false), 2000);
            document.addEventListener('securitypolicyviolation', (event) => {
              if (
                event.blockedURI === 'inline' &&
                event.effectiveDirective === 'script-src-elem'
              ) {
                clearTimeout(timeout);
                resolve(true);
              }
            });
            const script = document.createElement('script');
            script.textContent = 'document.body.dataset.inlineExecuted = "yes"';
            document.body.append(script);
          })
      );
      expect(blocked).toBe(true);
      expect(
        await page.locator('body').getAttribute('data-inline-executed')
      ).toBeNull();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth)
      ).toBeLessThanOrEqual(width);
      await page.screenshot({
        path: info.outputPath(`${frontend}-${width}.png`),
        fullPage: true,
      });
    });
  }
}
