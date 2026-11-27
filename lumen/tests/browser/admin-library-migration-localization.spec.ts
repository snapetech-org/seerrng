import { expect, test } from '@playwright/test';
import { testAppPath } from './testAppPath';

for (const locale of ['en', 'fr', 'ar'] as const) {
  test(`Library Migration follows the saved ${locale} locale`, async ({
    page,
  }) => {
    await page.route('https://**/*', (route) => route.abort());
    await page.route('**/lumen-config.json', (route) =>
      route.fulfill({ json: {} })
    );
    await page.route('**/api/v1/**', (route) => {
      const path = new URL(route.request().url()).pathname.slice(
        '/api/v1'.length
      );
      if (path === '/auth/me')
        return route.fulfill({
          json: { id: 1, displayName: 'Admin Fixture', permissions: 2 },
        });
      if (path === '/user/1/settings/main')
        return route.fulfill({ json: { locale } });
      if (path === '/settings/public')
        return route.fulfill({
          json: { applicationTitle: 'SeerrNG', mediaServerType: 1 },
        });
      if (path === '/settings/readarr')
        return route.fulfill({ json: [{ id: 11, name: 'Bookshelf' }] });
      if (path.includes('/media-move/configuration'))
        return route.fulfill({
          json: { authors: [], rootFolders: [], truncated: false },
        });
      return route.fulfill({ json: {} });
    });
    await page.goto(testAppPath('/admin/library-migration'));
    const copy = {
      en: {
        title: 'Bookshelf Library Path Migration',
        service: 'Bookshelf Service',
        authors: 'Authors',
        noAuthors: 'No authors match these filters.',
      },
      fr: {
        title: 'Migration des chemins de bibliothèque Bookshelf',
        service: 'Service Bookshelf',
        authors: 'Auteurs',
        noAuthors: 'Aucun auteur ne correspond à ces filtres.',
      },
      ar: {
        title: 'ترحيل مسارات مكتبة Bookshelf',
        service: 'خدمة Bookshelf',
        authors: 'المؤلفون',
        noAuthors: 'لا يوجد مؤلفون يطابقون عوامل التصفية.',
      },
    }[locale];
    await expect(page.getByRole('heading', { name: copy.title })).toBeVisible();
    await expect(page.getByText(copy.service, { exact: true })).toBeVisible();
    await expect(
      page.getByRole('heading', { name: copy.authors })
    ).toBeVisible();
    await expect(page.getByText(copy.noAuthors)).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute(
      'dir',
      locale === 'ar' ? 'rtl' : 'ltr'
    );
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth
        )
      )
      .toBe(true);
    if (process.env.LUMEN_MIGRATION_SCREENSHOT_LOCALE === locale) {
      await page.screenshot({
        path: process.env.LUMEN_MIGRATION_SCREENSHOT,
        fullPage: true,
      });
    }
  });
}
