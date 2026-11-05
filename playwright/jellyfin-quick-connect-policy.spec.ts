import { expect, test } from '@playwright/test';

test.use({ serviceWorkers: 'block' });
const baseline = process.env.SEERR_QUICK_CONNECT_BASELINE === 'true';

for (const width of [1440, 390]) {
  for (const [name, serverType, only] of [
    ['jellyfin-password', 2, false],
    ['jellyfin-quick-only', 2, true],
    ['emby-password', 3, true],
    ['plex-local', 1, true],
  ] as const) {
    test(`${name} sign-in remains usable at ${width}px`, async ({
      page,
    }, info) => {
      await page.setViewportSize({ width, height: 900 });
      await page.route('**/api/v1/settings/public', async (route) => {
        const response = await route.fetch();
        await route.fulfill({
          json: {
            ...(await response.json()),
            mediaServerType: serverType,
            mediaServerLogin: true,
            localLogin: true,
            jellyfinQuickConnectOnly: only,
          },
        });
      });
      await page.route('**/api/v1/backdrops', (route) =>
        route.fulfill({ json: [] })
      );
      await page.goto('/login');
      if (serverType === 1) {
        await expect(page.locator('#email')).toBeVisible();
        await expect(page.locator('#password')).toBeVisible();
      } else {
        if (await page.getByTestId('mediaserver-login-button').isVisible()) {
          await page.getByTestId('mediaserver-login-button').click();
        }
        if (serverType === 2 && only && !baseline) {
          await expect(page.locator('#username')).toHaveCount(0);
          await expect(page.locator('#password')).toHaveCount(0);
        } else {
          await expect(page.locator('#username')).toBeVisible();
          await expect(page.locator('#password')).toBeVisible();
        }
        await expect(
          page.getByRole('button', { name: 'Quick Connect', exact: true })
        ).toHaveCount(serverType === 2 ? 1 : 0);
      }
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth
          )
        )
        .toBe(true);
      await page.screenshot({
        path: info.outputPath(`${name}-${width}.png`),
        fullPage: true,
        animations: 'disabled',
      });
      if (serverType === 2) {
        await page.getByTestId('seerr-login-button').click();
        await expect(page.locator('#email')).toBeVisible();
        await expect(page.locator('#password')).toBeVisible();
      }
    });
  }
}

for (const width of [1440, 390]) {
  test(`Quick Connect policy settings preserve the selected policy at ${width}px`, async ({
    page,
    baseURL,
  }, info) => {
    await page.setViewportSize({ width, height: 900 });
    const login = await page
      .context()
      .request.post(`${baseURL}/api/v1/auth/local`, {
        data: { email: 'admin@seerr.dev', password: 'test1234' },
      });
    expect(login.status()).toBe(200);
    let main: Record<string, unknown> | undefined;
    let saved: Record<string, unknown> | undefined;
    await page.route('**/api/v1/settings/public', async (route) => {
      const response = await route.fetch();
      await route.fulfill({
        json: {
          ...(await response.json()),
          mediaServerType: 2,
          mediaServerLogin: true,
        },
      });
    });
    await page.route('**/api/v1/settings/main', async (route) => {
      if (route.request().method() === 'POST') {
        saved = route.request().postDataJSON();
        main = { ...main, ...saved };
      } else if (!main) {
        main = {
          ...(await (await route.fetch()).json()),
          mediaServerLogin: true,
          jellyfinQuickConnectOnly: false,
        };
      }
      await route.fulfill({ json: main });
    });
    await page.goto('/settings/users');
    const parent = page.locator('#mediaServerLogin');
    await expect(parent).toBeChecked();
    const policy = page.locator('#jellyfinQuickConnectOnly');
    if (baseline) {
      await expect(policy).toHaveCount(0);
    } else {
      await expect(policy).toBeVisible();
      await policy.check();
      await parent.uncheck();
      await expect(policy).toHaveCount(0);
      await parent.check();
      await expect(policy).toBeChecked();
      await page.getByRole('button', { name: 'Save', exact: true }).click();
      await expect.poll(() => saved?.jellyfinQuickConnectOnly).toBe(true);
      expect(saved?.mediaServerLogin).toBe(true);
    }
    await parent.scrollIntoViewIfNeeded();
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth
        )
      )
      .toBe(true);
    await page.screenshot({
      path: info.outputPath(`settings-${width}.png`),
      fullPage: true,
      animations: 'disabled',
    });
  });
}
