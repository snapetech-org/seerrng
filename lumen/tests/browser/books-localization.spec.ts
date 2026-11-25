import { expect, test } from '@playwright/test';

const copy = {
  en: {
    title: 'Trending ebooks',
    recommendations: 'Book Recommendations',
    series: 'Find a Book Series',
    format: 'Format',
    search: 'Search Books',
    sort: 'Sort',
    library: 'Library',
    all: 'All',
    titleFilter: 'Title',
    author: 'Author',
    rating: 'Minimum Book Rating',
    genre: 'Fantasy',
    noMatches: 'No books match this view.',
    audioTitle: 'Audiobooks',
    audioNote:
      'Lengths are the full unabridged recording. Open a book to pick the narrator.',
  },
  fr: {
    title: 'Tendances livres numériques',
    recommendations: 'Recommandations de livres',
    series: 'Trouver une série de livres',
    format: 'Format',
    search: 'Rechercher des livres',
    sort: 'Tri',
    library: 'Bibliothèque',
    all: 'Tout',
    titleFilter: 'Titre',
    author: 'Auteur',
    rating: 'Note minimale du livre',
    genre: 'Fantasy',
    noMatches: 'Aucun livre ne correspond à cette vue.',
    audioTitle: 'Livres audio',
    audioNote:
      'Les durées correspondent à l’enregistrement intégral. Ouvrez un livre pour choisir le narrateur.',
  },
  ar: {
    title: 'الرائجة كتب إلكترونية',
    recommendations: 'توصيات الكتب',
    series: 'العثور على سلسلة كتب',
    format: 'التنسيق',
    search: 'بحث الكتب',
    sort: 'الترتيب',
    library: 'المكتبة',
    all: 'الكل',
    titleFilter: 'العنوان',
    author: 'المؤلف',
    rating: 'الحد الأدنى لتقييم الكتاب',
    genre: 'خيال',
    noMatches: 'لا توجد كتب تطابق هذا العرض.',
    audioTitle: 'كتب صوتية',
    audioNote:
      'المدد تمثل التسجيل الكامل غير المختصر. افتح كتابًا لاختيار الراوي.',
  },
} as const;

for (const locale of ['en', 'fr', 'ar'] as const) {
  test(`Books discovery follows ${locale}`, async ({ page }, testInfo) => {
    await page.route('https://**/*', (route) => route.abort());
    await page.route('**/lumen-config.json', (route) =>
      route.fulfill({ json: {} })
    );
    await page.route('**/api/v1/**', (route) => {
      const url = new URL(route.request().url());
      const path = url.pathname.slice('/api/v1'.length);
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
      if (path === '/discover/books')
        return route.fulfill({ json: { results: [], page: 1, totalPages: 1 } });
      return route.fulfill({ json: { results: [], page: 1, totalPages: 1 } });
    });
    await page.goto('/books?sort=trending');
    const text = copy[locale];
    await expect(page.getByRole('heading', { name: text.title })).toBeVisible();
    await expect(
      page.locator('#view').getByRole('link', { name: text.recommendations })
    ).toBeVisible();
    await expect(
      page.locator('#view').getByRole('link', { name: text.series })
    ).toBeVisible();
    await expect(page.getByRole('group', { name: text.format })).toBeVisible();
    await expect(
      page
        .getByRole('group', { name: text.library })
        .getByRole('button', { name: text.all })
    ).toBeVisible();
    await expect(
      page.getByRole('searchbox', { name: text.titleFilter })
    ).toBeVisible();
    await expect(
      page.getByRole('searchbox', { name: text.author })
    ).toBeVisible();
    await expect(
      page.getByRole('searchbox', { name: text.rating })
    ).toBeVisible();
    await expect(page.getByRole('button', { name: text.search })).toBeVisible();
    await expect(page.getByText(text.noMatches)).toBeVisible();
    const genres = page.getByRole('button', { name: /genres|أنواع|الأنواع/i });
    await genres.click();
    await expect(
      page
        .getByRole('group', { name: /Genres|الأنواع/i })
        .getByRole('button', { name: text.genre, exact: true })
    ).toBeVisible();
    await page.keyboard.press('Escape');
    await page.getByLabel(text.sort).selectOption('newest');
    await expect(page).toHaveURL(/sort=newest/);
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
    if (
      (locale === 'fr' && testInfo.project.name === 'desktop') ||
      (locale === 'ar' && testInfo.project.name === 'iphone')
    ) {
      await page.screenshot({
        path: testInfo.outputPath(`books-${locale}.png`),
        fullPage: true,
      });
    }
    await page.goto('/audiobooks');
    await expect(
      page.getByRole('heading', { name: text.audioTitle })
    ).toBeVisible();
    await expect(page.getByText(text.audioNote)).toBeVisible();
  });
}
