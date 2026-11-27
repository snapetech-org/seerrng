import { expect, test } from '@playwright/test';
import { testAppPath } from './testAppPath';

const copy = {
  en: {
    title: 'Trending ebooks',
    share: 'Share & Identify',
    following: 'Following',
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
    share: 'Partager & Identifier',
    following: 'Suivis',
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
    share: 'مشاركة وتحديد',
    following: 'المتابَع',
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
    await page.goto(testAppPath('/books?sort=trending'));
    const text = copy[locale];
    await expect(page.getByRole('heading', { name: text.title })).toBeVisible();
    await expect(
      page.locator('#view').getByRole('link', { name: text.share })
    ).toHaveAttribute('href', testAppPath('/share'));
    await expect(
      page.locator('#view').getByRole('link', { name: text.following })
    ).toHaveAttribute('href', testAppPath('/following'));
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
    await page.goto(testAppPath('/audiobooks'));
    await expect(
      page.getByRole('heading', { name: text.audioTitle })
    ).toBeVisible();
    await expect(page.getByText(text.audioNote)).toBeVisible();
  });
}

test('book cards localize format and request actions', async ({
  page,
}, info) => {
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route(/\/imageproxy\//, (route) =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#e05"/></svg>',
    })
  );
  await page.route('**/api/v1/**', (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.slice('/api/v1'.length);
    if (path === '/auth/me')
      return route.fulfill({
        json: {
          id: 1,
          displayName: 'Fixture',
          permissions: 34359738368,
        },
      });
    if (path === '/user/1/settings/main')
      return route.fulfill({
        json: {
          locale: 'fr',
          lumenPreferences: { hoverRequest: true, narratorChoice: false },
        },
      });
    if (path === '/settings/public')
      return route.fulfill({
        json: {
          initialized: true,
          ebookServiceEnabled: true,
          enabledMediaCategories: { ebook: true },
        },
      });
    if (path === '/book/library')
      return route.fulfill({
        json: { page: 1, totalPages: 1, totalResults: 0, results: [] },
      });
    if (path === '/discover/books')
      return route.fulfill({
        json: {
          page: 1,
          totalPages: 1,
          totalResults: 2,
          results: [
            {
              id: 'hc:card-format',
              title: 'Card Format',
              mediaType: 'book',
              bookFormat: 'ebook',
              provider: 'hardcover',
              author: null,
              posterPath: '/cover.jpg',
            },
            {
              id: 'OL900002W',
              title: 'Unknown Card',
              mediaType: 'book',
              bookFormat: 'ebook',
              provider: 'openlibrary',
              author: null,
              posterPath: '/cover.jpg',
            },
          ],
        },
      });
    return route.fulfill({
      json: { page: 1, totalPages: 1, totalResults: 0, results: [] },
    });
  });
  await page.goto(testAppPath('/books?sort=trending'));
  const card = page.locator('.poster.book').filter({ hasText: 'Card Format' });
  await expect(card.locator('.m')).toContainText('livre numérique');
  const unknown = page
    .locator('.poster.book')
    .filter({ hasText: 'Unknown Card' });
  if (['iphone', 'android'].includes(info.project.name)) {
    await expect(card.locator('.tq')).toHaveAccessibleName(
      /Demander Card Format \(livre numérique\)/
    );
    await expect(unknown.locator('.tq')).toHaveAccessibleName(
      /Demander Unknown Card quand même ; état de la bibliothèque inconnu/
    );
    return;
  }
  await card.hover();
  await expect(card.locator('.qbtn.go')).toHaveText('Demander livre numérique');
  await unknown.hover();
  await expect(unknown.locator('.qbtn.go')).toHaveText('Demander quand même');
});
