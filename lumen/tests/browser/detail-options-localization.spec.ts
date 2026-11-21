import { expect, test } from '@playwright/test';

const mount = process.env.LUMEN_TEST_MOUNT === '/lumen' ? '/lumen' : '';
const locales = [
  {
    tag: 'en',
    title: 'Advanced Request Options',
    server: 'Server',
    quality: 'Quality',
    folder: 'Folder',
  },
  {
    tag: 'fr',
    title: 'Options de demande avancées',
    server: 'Serveur',
    quality: 'Qualité',
    folder: 'Dossier',
  },
  {
    tag: 'ar',
    title: 'خيارات الطلب المتقدمة',
    server: 'الخادم',
    quality: 'الجودة',
    folder: 'المجلد',
  },
];

for (const locale of locales) {
  test(`movie request options follow ${locale.tag} locale`, async ({
    page,
  }) => {
    await page.route('https://**/*', (route) => route.abort());
    await page.route('**/lumen-config.json', (route) =>
      route.fulfill({ json: {} })
    );
    await page.route('**/api/v1/**', (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname.split('/api/v1')[1];
      if (path === '/auth/me')
        return route.fulfill({
          json: { id: 1, displayName: 'Viewer', permissions: 2 },
        });
      if (path === '/user/1/settings/main')
        return route.fulfill({ json: { locale: locale.tag } });
      if (path === '/settings/public') return route.fulfill({ json: {} });
      if (path === '/movie/550')
        return route.fulfill({
          json: {
            id: 550,
            title: 'Fixture Film',
            overview: 'A fixture.',
            genres: [],
            mediaInfo: {},
          },
        });
      if (path === '/service/radarr')
        return route.fulfill({
          json: [{ id: 3, name: 'Movies', is4k: false, isDefault: true }],
        });
      if (path === '/service/radarr/3')
        return route.fulfill({
          json: {
            profiles: [{ id: 4, name: 'HD' }],
            rootFolders: [{ id: 5, path: '/movies' }],
            server: { activeProfileId: 4, activeDirectory: '/movies' },
          },
        });
      return route.fulfill({ json: { results: [] } });
    });
    await page.goto(`${mount}/movie/550`);
    await page.getByText(locale.title, { exact: true }).click();
    await expect(page.getByLabel(locale.server)).toBeVisible();
    await expect(page.getByLabel(locale.quality)).toBeVisible();
    await expect(page.getByLabel(locale.folder)).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', locale.tag);
    if (process.env.LUMEN_CAPTURE_DIR) {
      await page.screenshot({
        path: `${process.env.LUMEN_CAPTURE_DIR}/options-${locale.tag}-${page.viewportSize()?.width}.png`,
      });
    }
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth
    );
    expect(overflow).toBe(false);
  });
}
