import { expect, test } from '@playwright/test';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });

for (const theme of ['seerrNGJ', 'seerrOrig', 'persiusNG']) {
  for (const width of [390, 1440]) {
    test(`category labels, switches and descriptions: ${theme} ${width}`, async ({
      page,
    }, info) => {
      await page.setViewportSize({ width, height: 900 });
      const auth = await page.request.post('/api/v1/auth/local', {
        data: { email: 'admin@seerr.dev', password: 'test1234' },
      });
      expect(auth.status()).toBe(200);
      const user = await auth.json();
      expect(
        (
          await page.request.post(
            `/api/v1/user/${user.id}/settings/interface-theme`,
            { data: { theme } }
          )
        ).status()
      ).toBe(200);
      await page.goto('/settings/categories');
      await expect(page.locator('html')).toHaveAttribute(
        'data-interface-theme',
        theme
      );
      const rows = page
        .locator('.settings-form-row-compact-description')
        .filter({
          has: page.locator('[data-testid^="category-toggle-"]'),
        });
      await expect(rows).toHaveCount(11);
      for (const row of await rows.all()) {
        const geometry = await row.evaluate((element) => {
          const box = (selector: string) =>
            element.querySelector(selector)!.getBoundingClientRect().toJSON();
          return {
            label: box('.settings-form-label-line'),
            input: box('[data-testid^="category-toggle-"]'),
            description: box('.settings-form-row-description'),
            row: element.getBoundingClientRect().toJSON(),
          };
        });
        if (width >= 768) {
          expect(
            Math.abs(
              geometry.label.y +
                geometry.label.height / 2 -
                (geometry.input.y + geometry.input.height / 2)
            )
          ).toBeLessThanOrEqual(3);
        } else {
          expect(geometry.input.y).toBeGreaterThanOrEqual(
            geometry.label.bottom
          );
          expect(geometry.input.bottom).toBeLessThanOrEqual(
            geometry.description.y
          );
          expect(
            Math.abs(geometry.input.x - geometry.label.x)
          ).toBeLessThanOrEqual(1);
        }
        expect(geometry.description.y).toBeGreaterThanOrEqual(
          geometry.label.y + geometry.label.height
        );
        expect(geometry.description.bottom).toBeLessThanOrEqual(
          geometry.row.bottom
        );
        expect(
          Math.abs(geometry.description.x - geometry.label.x)
        ).toBeLessThanOrEqual(1);
      }
      const movies = page.getByTestId('category-toggle-movie');
      const checked = (await movies.getAttribute('aria-pressed')) === 'true';
      await page.locator('label[for="enabledMediaCategories.movie"]').click();
      await expect(movies).toHaveAttribute('aria-pressed', String(!checked));
      await page.locator('label[for="enabledMediaCategories.movie"]').click();
      await expect(movies).toHaveAttribute('aria-pressed', String(checked));
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth
        )
      ).toBe(true);
      await page.screenshot({
        path: info.outputPath(`${theme}-${width}-categories.png`),
        fullPage: true,
      });
    });
  }
}
