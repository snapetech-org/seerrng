import { expect, test } from '@playwright/test';

const mount = process.env.LUMEN_TEST_MOUNT === '/lumen' ? '/lumen' : '';
const appPath = (path: string) => `${mount}${path}`;

const copy = {
  en: {
    title: 'Similar Movies',
    back: 'Back to Details',
    related: 'Related Fixture',
  },
  fr: {
    title: 'Films similaires',
    back: 'Retour aux détails',
    related: 'Related Fixture',
  },
  ar: {
    title: 'أفلام مشابهة',
    back: 'العودة إلى التفاصيل',
    related: 'Related Fixture',
  },
} as const;

for (const locale of ['en', 'fr', 'ar'] as const) {
  test(`Related video pages follow ${locale}`, async ({ page }) => {
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
          json: { id: 1, displayName: 'Fixture', permissions: 2 },
        });
      if (path === '/user/1/settings/main')
        return route.fulfill({ json: { locale } });
      if (path === '/settings/public')
        return route.fulfill({ json: { initialized: true } });
      if (path === '/movie/101')
        return route.fulfill({
          json: { id: 101, title: 'Source Film', mediaType: 'movie' },
        });
      if (path === '/movie/101/similar')
        return route.fulfill({
          json: {
            page: 1,
            totalPages: 1,
            totalResults: 1,
            results: [
              { id: 102, title: 'Related Fixture', mediaType: 'movie' },
            ],
          },
        });
      return route.fulfill({ json: {} });
    });
    await page.goto('/movie/101/similar');
    const text = copy[locale];
    await expect(page.getByRole('heading', { name: text.title })).toBeVisible();
    await expect(
      page.getByRole('link', { name: text.related })
    ).toHaveAttribute('href', appPath('/movie/102'));
    await page.getByRole('link', { name: text.back }).click();
    await expect(page).toHaveURL(/\/movie\/101$/);
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
  });
}
