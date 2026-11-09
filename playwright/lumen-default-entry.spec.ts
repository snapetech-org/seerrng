import { expect, test } from '@playwright/test';

for (const width of [390, 1440]) {
  test(`Upgrades retain native entry and selected Lumen keeps full access at ${width}px`, async ({
    page,
    context,
    playwright,
  }, info) => {
    await context.clearCookies();
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await expect(page).toHaveURL(/\/login$/);
    // An upgraded installation keeps native access; even a direct Lumen visit
    // exposes the way back before anyone has signed in.
    await page.goto('/lumen/');
    await expect(
      page.getByRole('link', { name: 'Open full SeerrNG', exact: true })
    ).toHaveAttribute('href', '/seerrng');
    await page
      .getByRole('link', { name: 'Open full SeerrNG', exact: true })
      .click();
    await expect(page).toHaveURL(/\/login$/);
    await page.screenshot({
      path: info.outputPath('upgrade-native-entry.png'),
    });
    const admin = await playwright.request.newContext({
      baseURL: new URL(page.url()).origin,
    });
    const headers = async (): Promise<Record<string, string>> => {
      const token = (await admin.storageState()).cookies.find(
        (cookie) => cookie.name === 'XSRF-TOKEN'
      )?.value;
      return token ? { 'X-XSRF-TOKEN': decodeURIComponent(token) } : {};
    };
    await admin.get('/api/v1/settings/public');
    expect(
      (
        await admin.post('/api/v1/auth/local', {
          headers: await headers(),
          data: { email: 'admin@seerr.dev', password: 'test1234' },
        })
      ).status()
    ).toBe(200);
    const original = await (await admin.get('/api/v1/settings/main')).json();
    expect(original.defaultFrontend).toBe('native');
    try {
      // Explicitly selected Lumen, unlike an upgrade migration, becomes the
      // default again after logout and in a browser without an override cookie.
      expect(
        (
          await admin.post('/api/v1/settings/main', {
            headers: await headers(),
            data: { defaultFrontend: 'lumen' },
          })
        ).status()
      ).toBe(200);
      await context.clearCookies();
      await page.goto('/');
      await expect(page).toHaveURL(/\/lumen\/$/);
      await expect(
        page.getByRole('heading', { name: /Sign in to request/ })
      ).toBeVisible();
      await page.screenshot({
        path: info.outputPath('selected-lumen-entry.png'),
      });
      await expect(
        page.getByRole('link', { name: 'More sign-in options' })
      ).toHaveAttribute('href', '/login');
      await page
        .getByRole('button', { name: 'Use an email and password instead' })
        .click();
      await page.getByLabel('Email', { exact: true }).fill('friend@seerr.dev');
      await page.getByLabel('Password', { exact: true }).fill('test1234');
      await page.getByRole('button', { name: 'Sign in', exact: true }).click();
      await expect(page.locator('.app')).toBeVisible();
      const currentUser = await (
        await page.request.get('/api/v1/auth/me')
      ).json();
      const selectedTheme = currentUser.settings?.interfaceTheme ?? 'persiusNG';
      await page.goto('/lumen/me');
      await page
        .locator('.set')
        .filter({ hasText: 'Full SeerrNG' })
        .getByRole('link', { name: 'Open', exact: true })
        .click();
      await expect(page).toHaveURL(/\/$/);
      await expect(page.locator('html')).toHaveAttribute(
        'data-interface-theme',
        selectedTheme
      );
      await page.waitForFunction((theme) => {
        const link = document.querySelector<HTMLLinkElement>(
          `link[data-interface-theme-stylesheet][data-interface-theme-id="${theme}"]`
        );
        return Boolean(link?.sheet && link.media !== 'not all');
      }, selectedTheme);
      await page
        .getByRole('button', { name: 'Theme picker', exact: true })
        .filter({ visible: true })
        .first()
        .click();
      await page
        .getByRole('menuitem', { name: 'Open included Lumen', exact: true })
        .click();
      await expect(page).toHaveURL(/\/lumen\/$/);
      await expect(page.locator('.app')).toBeVisible();
      await page.goto('/seerrng');
      const loggedOut = await page.evaluate(async () => {
        const token = document.cookie
          .split('; ')
          .find((cookie) => cookie.startsWith('XSRF-TOKEN='))
          ?.slice(11);
        return (
          await fetch('/api/v1/auth/logout', {
            method: 'POST',
            headers: token ? { 'X-XSRF-TOKEN': decodeURIComponent(token) } : {},
          })
        ).status;
      });
      expect(loggedOut).toBe(200);
      expect(
        (await context.cookies()).some(
          (cookie) => cookie.name === 'seerrng-frontend'
        )
      ).toBe(false);
      await page.goto('/');
      await expect(page).toHaveURL(/\/lumen\/$/);
      await expect(
        page.getByRole('heading', { name: /Sign in to request/ })
      ).toBeVisible();
      const manifest = await (
        await page.request.get('/lumen/manifest.webmanifest')
      ).json();
      expect(manifest.start_url).toBe('/lumen/');
      expect(manifest.scope).toBe('/lumen/');
      for (const icon of manifest.icons) {
        expect(icon.src).toMatch(/^\/lumen\//);
        expect((await page.request.get(icon.src)).status()).toBe(200);
      }
    } finally {
      expect(
        (
          await admin.post('/api/v1/settings/main', {
            headers: await headers(),
            data: {
              defaultFrontend: original.defaultFrontend,
              lumenPublicUrl: original.lumenPublicUrl,
            },
          })
        ).status()
      ).toBe(200);
      await admin.dispose();
    }
  });
}
