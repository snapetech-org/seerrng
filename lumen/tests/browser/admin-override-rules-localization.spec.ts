import { expect, test } from '@playwright/test';

const mount = process.env.LUMEN_TEST_MOUNT === '/lumen' ? '/lumen' : '';

for (const locale of ['en', 'fr', 'ar'] as const) {
  test(`Override Rules follow the saved ${locale} locale`, async ({ page }) => {
    await page.route('https://**/*', (route) => route.abort());
    await page.route('**/lumen-config.json', (route) =>
      route.fulfill({ json: {} })
    );
    await page.route('**/api/v1/**', (route) => {
      const path = new URL(route.request().url()).pathname.replace(
        /^\/lumen/,
        ''
      );
      if (path.endsWith('/auth/me'))
        return route.fulfill({
          json: { id: 1, displayName: 'Admin Fixture', permissions: 2 },
        });
      if (path.endsWith('/user/1/settings/main'))
        return route.fulfill({ json: { locale } });
      if (path.endsWith('/settings/public'))
        return route.fulfill({
          json: { applicationTitle: 'SeerrNG', mediaServerType: 1 },
        });
      if (path.endsWith('/overrideRule')) return route.fulfill({ json: [] });
      if (/\/settings\/(radarr|sonarr|lidarr|readarr)$/.test(path))
        return route.fulfill({ json: [] });
      return route.fulfill({ json: [] });
    });

    await page.goto(`${mount}/admin/override-rules`);
    const copy = {
      en: {
        title: 'Request Override Rules',
        empty: 'No request override rules configured.',
        create: 'New Override Rule',
        service: 'Service',
      },
      fr: {
        title: 'Règles de remplacement des demandes',
        empty: 'Aucune règle de remplacement configurée.',
        create: 'Nouvelle règle de remplacement',
        service: 'Service',
      },
      ar: {
        title: 'قواعد تجاوز الطلبات',
        empty: 'لا توجد قواعد تجاوز مهيأة.',
        create: 'قاعدة تجاوز جديدة',
        service: 'الخدمة',
      },
    }[locale];
    await expect(page.getByRole('heading', { name: copy.title })).toBeVisible();
    await expect(page.getByText(copy.empty)).toBeVisible();
    await page.getByRole('button', { name: copy.create }).click();
    await expect(page.getByText(copy.service, { exact: true })).toBeVisible();
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
    if (process.env.LUMEN_OVERRIDE_SCREENSHOT_LOCALE === locale) {
      await page.screenshot({
        path: process.env.LUMEN_OVERRIDE_SCREENSHOT,
        fullPage: true,
      });
    }
  });
}
