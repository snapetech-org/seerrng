import { expect, test } from '@playwright/test';

for (const theme of ['seerrOrig', 'seerrNGJ', 'persiusNG']) {
  for (const width of [390, 1440]) {
    test(`${theme} owns geometry before and after shared CSS at ${width}px`, async ({
      page,
      context,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.request.get('/api/v1/settings/public');
      const token = (await context.cookies()).find(
        (cookie) => cookie.name === 'XSRF-TOKEN'
      )?.value;
      const headers = token
        ? { 'X-XSRF-TOKEN': decodeURIComponent(token) }
        : {};
      expect(
        (
          await page.request.post('/api/v1/auth/local', {
            headers,
            data: { email: 'admin@seerr.dev', password: 'test1234' },
          })
        ).status()
      ).toBe(200);
      const user = await (await page.request.get('/api/v1/auth/me')).json();
      const original = user.settings?.interfaceTheme ?? 'persiusNG';
      const endpoint = `/api/v1/user/${user.id}/settings/interface-theme`;
      try {
        expect(
          (
            await page.request.post(endpoint, { headers, data: { theme } })
          ).status()
        ).toBe(200);
        // Catalogue restoration and account restoration share a pending link.
        // An obsolete effect must not detach that link while its successor owns it.
        await page.addInitScript(() => {
          const state = window as unknown as {
            themeStylesheetRemovals: string[];
          };
          state.themeStylesheetRemovals = [];
          new MutationObserver((records) => {
            for (const record of records) {
              for (const node of record.removedNodes) {
                if (
                  node instanceof HTMLLinkElement &&
                  node.hasAttribute('data-interface-theme-stylesheet')
                ) {
                  state.themeStylesheetRemovals.push(
                    node.dataset.interfaceThemeId ?? ''
                  );
                }
              }
            }
          }).observe(document, { childList: true, subtree: true });
        });
        await page.route('**/api/v1/interface-themes', async (route) => {
          const response = await route.fetch();
          await new Promise((resolve) => setTimeout(resolve, 150));
          await route.fulfill({ response });
        });
        await page.route(
          `**/api/v1/interface-themes/${theme}/theme.css`,
          async (route) => {
            const response = await route.fetch();
            await new Promise((resolve) => setTimeout(resolve, 450));
            await route.fulfill({ response });
          }
        );
        await page.goto('/settings/plex');
        await expect(page.locator('html')).toHaveAttribute(
          'data-interface-theme',
          theme
        );
        await page.waitForFunction((theme) => {
          const link = document.querySelector<HTMLLinkElement>(
            `link[data-interface-theme-stylesheet][data-interface-theme-id="${theme}"]`
          );
          return Boolean(link?.sheet && link.media !== 'not all');
        }, theme);
        expect(
          await page.evaluate(
            (theme) =>
              (
                window as unknown as { themeStylesheetRemovals: string[] }
              ).themeStylesheetRemovals.filter((id) => id === theme),
            theme
          )
        ).toEqual([]);
        await page.unrouteAll({ behavior: 'wait' });
        const values = await page.evaluate(async (theme) => {
          const link = document.querySelector<HTMLLinkElement>(
            `link[data-interface-theme-stylesheet][data-interface-theme-id="${theme}"]`
          )!;
          const read = () => {
            const style = getComputedStyle(document.documentElement);
            return Object.fromEntries(
              [
                '--card-spacing',
                '--card-layout-spacing',
                '--main-card-padding',
                '--compact-control-height',
                '--control-corner-radius',
                '--poster-width',
                '--card-title-font-size',
              ].map((name) => [name, style.getPropertyValue(name).trim()])
            );
          };
          const settle = () =>
            new Promise<void>((resolve) =>
              requestAnimationFrame(() =>
                requestAnimationFrame(() => resolve())
              )
            );
          document.head.prepend(link);
          await settle();
          const initial = read();
          document.head.append(link);
          await settle();
          return { initial, switched: read() };
        }, theme);
        expect(values.initial).toEqual(values.switched);
        if (theme === 'seerrOrig')
          expect(values.initial['--card-spacing']).toBe('16px');
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth)
        ).toBeLessThanOrEqual(width + 1);
      } finally {
        expect(
          (
            await page.request.post(endpoint, {
              headers,
              data: { theme: original },
            })
          ).status()
        ).toBe(200);
      }
    });
  }
}
