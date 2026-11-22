import { expect, test } from '@playwright/test';

for (const locale of ['en', 'fr', 'ar'] as const) {
  test(`Bookshelf service administration follows ${locale}`, async ({
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
      if (path === '/settings/readarr') return route.fulfill({ json: [] });
      return route.fulfill({ json: {} });
    });
    await page.goto('/admin/readarr');
    const copy = {
      en: {
        title: 'Book and Audiobook Services',
        add: 'Add Book and Audiobook',
        backend: 'Backend',
        format: 'Book Format',
        name: 'Service Name',
      },
      fr: {
        title: 'Services Livres et livres audio',
        add: 'Ajouter Livres et livres audio',
        backend: 'Service dorsal',
        format: 'Format du livre',
        name: 'Nom du service',
      },
      ar: {
        title: 'خدمات كتب وكتب صوتية',
        add: 'إضافة كتب وكتب صوتية',
        backend: 'الخلفية',
        format: 'تنسيق الكتاب',
        name: 'اسم الخدمة',
      },
    }[locale];
    await expect(page.getByRole('heading', { name: copy.title })).toBeVisible();
    await page.getByRole('button', { name: copy.add }).click();
    await expect(page.getByLabel(copy.backend)).toBeVisible();
    await expect(page.getByLabel(copy.format)).toBeVisible();
    await expect(page.getByLabel(copy.name)).toBeVisible();
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
    if (process.env.LUMEN_SERVARR_SCREENSHOT_LOCALE === locale) {
      await page.screenshot({
        path: process.env.LUMEN_SERVARR_SCREENSHOT,
        fullPage: true,
      });
    }
  });
}
