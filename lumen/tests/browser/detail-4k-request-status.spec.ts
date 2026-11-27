import { expect, test } from '@playwright/test';

const mount = process.env.LUMEN_TEST_MOUNT === '/lumen' ? '/lumen' : '';
const locales = [
  { tag: 'en', requested: 'Requested' },
  { tag: 'fr', requested: 'Demandé' },
  { tag: 'ar', requested: 'مطلوب' },
];

for (const locale of locales) {
  test(`movie 4K requested status follows ${locale.tag} locale`, async ({
    page,
  }, info) => {
    await page.route('https://**/*', (route) => route.abort());
    await page.route('**/lumen-config.json', (route) =>
      route.fulfill({ json: {} })
    );
    await page.route('**/api/v1/**', (route) => {
      const path = new URL(route.request().url()).pathname.split('/api/v1')[1];
      if (path === '/auth/me')
        return route.fulfill({ json: { id: 1, permissions: 32 } });
      if (path === '/user/1/settings/main')
        return route.fulfill({ json: { locale: locale.tag } });
      if (path === '/settings/public')
        return route.fulfill({ json: { movie4kEnabled: true } });
      if (path === '/movie/550')
        return route.fulfill({
          json: {
            id: 550,
            title: 'Fixture Film',
            overview: 'A fixture.',
            genres: [],
            runtime: 100,
            originalLanguage: 'en',
            mediaInfo: { status: 1, status4k: 2 },
            credits: { cast: [], crew: [] },
          },
        });
      return route.fulfill({ json: { results: [] } });
    });

    await page.goto(`${mount}/movie/550`);
    await expect(
      page.getByRole('heading', { name: 'Fixture Film' })
    ).toBeVisible();
    await expect(
      page.locator('.dstatus').getByText(`4K · ${locale.requested}`, {
        exact: true,
      })
    ).toBeVisible();
    const captureDir = process.env.LUMEN_4K_REQUEST_CAPTURE_DIR;
    if (
      captureDir &&
      locale.tag === 'en' &&
      ['desktop', 'iphone'].includes(info.project.name)
    ) {
      const badge = page.locator('.dstatus .pill.wait').filter({
        hasText: `4K · ${locale.requested}`,
      });
      await badge.evaluate((element) => {
        element.innerHTML = element.innerHTML.replace(
          '4K · Requested',
          '4K requested'
        );
      });
      await page.screenshot({
        path: `${captureDir}/baseline-${page.viewportSize()?.width}.png`,
        fullPage: true,
        animations: 'disabled',
      });
      await page.reload();
      await expect(
        page.locator('.dstatus').getByText(`4K · ${locale.requested}`, {
          exact: true,
        })
      ).toBeVisible();
      await page.screenshot({
        path: `${captureDir}/candidate-${page.viewportSize()?.width}.png`,
        fullPage: true,
        animations: 'disabled',
      });
    }
  });
}
