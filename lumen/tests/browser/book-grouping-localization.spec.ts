import { expect, test } from '@playwright/test';

const labels = {
  en: {
    bibliography: 'Bibliography',
    next: 'Next',
    filters: 'Book Series Filters',
    any: 'Any',
    books: 'Books in This Series',
  },
  fr: {
    bibliography: 'Bibliographie',
    next: 'Suivant',
    filters: 'Filtres de série de livres',
    any: 'Tous',
    books: 'Livres de cette série',
  },
  ar: {
    bibliography: 'قائمة الأعمال',
    next: 'التالي',
    filters: 'عوامل تصفية سلسلة الكتب',
    any: 'أي',
    books: 'الكتب في هذه السلسلة',
  },
} as const;

for (const locale of ['en', 'fr', 'ar'] as const) {
  test(`book author and series pages follow ${locale}`, async ({
    page,
  }, info) => {
    await page.route('https://**/*', (route) => route.abort());
    await page.route('**/lumen-config.json', (route) =>
      route.fulfill({ json: {} })
    );
    await page.route('**/api/v1/**', (route) => {
      const path = decodeURIComponent(
        new URL(route.request().url()).pathname.slice('/api/v1'.length)
      );
      if (path === '/auth/me')
        return route.fulfill({
          json: { id: 1, displayName: 'Fixture', permissions: 2 },
        });
      if (path === '/user/1/settings/main')
        return route.fulfill({ json: { locale } });
      if (path === '/settings/public') return route.fulfill({ json: {} });
      if (path === '/request' || path === '/blocklist')
        return route.fulfill({ json: { results: [] } });
      if (path.startsWith('/author/'))
        return route.fulfill({
          json: {
            id: 'OL42A',
            name: 'Fixture Author',
            works: [],
            pagination: { offset: 0, limit: 20, totalItems: 21 },
          },
        });
      if (path.startsWith('/series/'))
        return route.fulfill({
          json: {
            id: 'bookshelf-series:1:Rml4dHVyZQ',
            title: 'Fixture Series',
            books: [
              {
                id: 'OL11W',
                title: 'Fixture Book',
                mediaType: 'book',
                firstPublishYear: 2020,
                languages: ['eng'],
              },
            ],
          },
        });
      if (path === '/association/book/OL11W')
        return route.fulfill({ json: { edges: [] } });
      if (path === '/editions/series-narrators')
        return route.fulfill({ json: { supported: false } });
      return route.fulfill({ json: {} });
    });

    const viewport = {
      desktop: { width: 1440, height: 900 },
      iphone: { width: 390, height: 844 },
      android: { width: 412, height: 915 },
      tablet: { width: 834, height: 1194 },
    }[info.project.name] ?? { width: 390, height: 844 };
    await page.setViewportSize(viewport);
    await page.goto('/author/OL42A');
    await expect(
      page.getByRole('heading', { name: labels[locale].bibliography })
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: labels[locale].next })
    ).toBeVisible();
    await page.screenshot({ path: info.outputPath(`author-${locale}.png`) });

    await page.goto('/book-series/bookshelf-series%3A1%3ARml4dHVyZQ');
    await expect(
      page.getByRole('group', { name: labels[locale].filters })
    ).toBeVisible();
    await expect(
      page
        .getByRole('option', { name: labels[locale].any, exact: true })
        .first()
    ).toBeAttached();
    await expect(
      page.getByRole('heading', { name: labels[locale].books })
    ).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute(
      'dir',
      locale === 'ar' ? 'rtl' : 'ltr'
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth
      )
    ).toBe(true);
    await page.screenshot({ path: info.outputPath(`series-${locale}.png`) });
  });
}
