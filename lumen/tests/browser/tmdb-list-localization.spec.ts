import { expect, test } from '@playwright/test';

const copy = {
  en: {
    discover: 'Discover',
    empty: 'No titles on this page.',
    pages: 'TMDB List Pages',
    previous: 'Previous Page',
    page: 'Page 2',
    next: 'Next Page',
  },
  fr: {
    discover: 'Découvrir',
    empty: 'Aucun titre sur cette page.',
    pages: 'Pages de la liste TMDB',
    previous: 'Page précédente',
    page: 'Page 2',
    next: 'Page suivante',
  },
  ar: {
    discover: 'اكتشف',
    empty: 'لا توجد عناوين في هذه الصفحة.',
    pages: 'صفحات قائمة TMDB',
    previous: 'الصفحة السابقة',
    page: 'الصفحة 2',
    next: 'الصفحة التالية',
  },
} as const;

for (const locale of ['en', 'fr', 'ar'] as const) {
  test(`TMDB List pagination follows ${locale}`, async ({ page }) => {
    await page.route('https://**/*', (route) => route.abort());
    await page.route('**/lumen-config.json', (route) =>
      route.fulfill({ json: {} })
    );
    const requestedPages: number[] = [];
    await page.route('**/api/v1/**', (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const path = url.pathname.slice('/api/v1'.length);
      if (path === '/auth/me')
        return route.fulfill({
          json: { id: 1, displayName: 'Fixture', permissions: 2 },
        });
      if (path === '/user/1/settings/main')
        return route.fulfill({ json: { locale } });
      if (path === '/settings/public')
        return route.fulfill({ json: { initialized: true } });
      if (path === '/discover/list/12345') {
        const requestedPage = Number(url.searchParams.get('page'));
        requestedPages.push(requestedPage);
        return route.fulfill({
          json: {
            page: requestedPage,
            totalPages: 3,
            totalResults: 0,
            results: [],
            list: { name: 'Public Fixture List', description: 'Fixture' },
          },
        });
      }
      return route.fulfill({ json: {} });
    });
    await page.goto('/list/12345?page=2');
    const text = copy[locale];
    await expect(
      page.getByRole('heading', { name: 'Public Fixture List' })
    ).toBeVisible();
    await expect(
      page.locator('#view').getByRole('link', { name: text.discover })
    ).toBeVisible();
    await expect(page.getByText(text.empty)).toBeVisible();
    const pagination = page.getByRole('navigation', { name: text.pages });
    await expect(pagination.getByText(text.page)).toBeVisible();
    await pagination.getByRole('button', { name: text.previous }).click();
    await expect(page).toHaveURL(/\/list\/12345$/);
    await pagination.getByRole('button', { name: text.next }).click();
    await expect(page).toHaveURL(/\?page=2$/);
    expect(requestedPages).toContain(2);
    expect(requestedPages).toContain(1);
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
