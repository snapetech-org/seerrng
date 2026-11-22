import { expect, test } from '@playwright/test';

for (const locale of ['en', 'fr', 'ar'] as const) {
  test(`book-series search follows ${locale}`, async ({ page }) => {
    await page.route('https://**/*', (route) => route.abort());
    await page.route('**/lumen-config.json', (route) =>
      route.fulfill({ json: {} })
    );
    await page.route('**/api/v1/**', (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname.slice('/api/v1'.length);
      if (path === '/auth/me')
        return route.fulfill({
          json: { id: 1, displayName: 'Fixture', permissions: 2 },
        });
      if (path === '/user/1/settings/main')
        return route.fulfill({ json: { locale } });
      if (path === '/settings/public')
        return route.fulfill({
          json: { initialized: true, ebookServiceEnabled: true },
        });
      if (path === '/book-series/search') {
        expect(Object.fromEntries(new URL(request.url()).searchParams)).toEqual(
          { query: 'Dune', format: 'ebook' }
        );
        return route.fulfill({
          json: {
            status: 'ok',
            truncated: false,
            results: [
              {
                key: 'hc:42',
                title: 'Dune Chronicles',
                serverName: 'Bookshelf',
                format: 'ebook',
                source: 'library',
                href: '/book-series/42',
              },
            ],
          },
        });
      }
      return route.fulfill({ json: {} });
    });
    await page.goto('/book-series');
    const copy = {
      en: {
        title: 'Find a Book Series',
        requests: 'Book Series Requests',
        name: 'Series Name',
        format: 'Format',
        ebook: 'Ebooks',
        search: 'Search Series',
        library: 'Library',
        open: 'Open Dune Chronicles from Bookshelf',
      },
      fr: {
        title: 'Trouver une série de livres',
        requests: 'Demandes de séries de livres',
        name: 'Nom de la série',
        format: 'Format',
        ebook: 'Livres numériques',
        search: 'Rechercher des séries',
        library: 'Bibliothèque',
        open: 'Ouvrir Dune Chronicles depuis Bookshelf',
      },
      ar: {
        title: 'العثور على سلسلة كتب',
        requests: 'طلبات سلاسل الكتب',
        name: 'اسم السلسلة',
        format: 'التنسيق',
        ebook: 'كتب إلكترونية',
        search: 'البحث عن سلاسل',
        library: 'المكتبة',
        open: 'افتح Dune Chronicles من Bookshelf',
      },
    }[locale];
    await expect(page.getByRole('heading', { name: copy.title })).toBeVisible();
    await expect(page.getByRole('link', { name: copy.requests })).toBeVisible();
    const name = page.getByLabel(copy.name);
    await name.fill('Dune');
    const format = page.getByLabel(copy.format);
    await format.selectOption('ebook');
    await page.getByRole('button', { name: copy.search }).click();
    await expect(page.getByText(copy.library)).toBeVisible();
    await expect(page.getByRole('link', { name: copy.open })).toBeVisible();
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
