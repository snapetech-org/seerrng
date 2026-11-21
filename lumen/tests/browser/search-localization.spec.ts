import { expect, test, type Page, type TestInfo } from '@playwright/test';

const mount = process.env.LUMEN_TEST_MOUNT === '/lumen' ? '/lumen' : '';
const appPath = (path: string) => `${mount}${path}`;

async function capture(page: Page, info: TestInfo) {
  const directory = process.env.LUMEN_VISUAL_CAPTURE_DIR;
  if (!directory || !['desktop', 'iphone'].includes(info.project.name)) return;
  await page.screenshot({
    path: `${directory}/search-empty-${info.project.name}.png`,
    animations: 'disabled',
  });
}

test('Search scopes, results, sorting, and pagination follow the saved locale', async ({
  page,
}) => {
  const locale = ['en', 'fr', 'ar'].includes(
    process.env.LUMEN_SEARCH_LOCALE ?? ''
  )
    ? (process.env.LUMEN_SEARCH_LOCALE as 'en' | 'fr' | 'ar')
    : 'en';
  const labels = {
    en: {
      heading: 'Search',
      searchIn: 'Search in',
      all: 'All',
      movies: 'Movies',
      series: 'Series',
      books: 'Books',
      audio: 'Audiobooks',
      sort: 'Sort Results',
      bestMatch: 'Best Match',
      titleSort: 'Title A–Z',
      moviesEmpty: 'No movies for “Dune”',
      previous: 'Previous Page',
      page: 'Page 2',
      next: 'Next Page',
      resultPages: 'Search Result Pages',
      authors: 'Authors',
      searching: 'Searching…',
    },
    fr: {
      heading: 'Recherche',
      searchIn: 'Rechercher dans',
      all: 'Tout',
      movies: 'Films',
      series: 'Séries',
      books: 'Livres',
      audio: 'Livres audio',
      sort: 'Trier les résultats',
      bestMatch: 'Meilleure correspondance',
      titleSort: 'Titre A–Z',
      moviesEmpty: 'Aucun résultat dans films pour « Dune »',
      previous: 'Page précédente',
      page: 'Page 2',
      next: 'Page suivante',
      resultPages: 'Pages de résultats de recherche',
      authors: 'Auteurs',
      searching: 'Recherche en cours…',
    },
    ar: {
      heading: 'البحث',
      searchIn: 'البحث ضمن',
      all: 'الكل',
      movies: 'الأفلام',
      series: 'المسلسلات',
      books: 'الكتب',
      audio: 'الكتب الصوتية',
      sort: 'ترتيب النتائج',
      bestMatch: 'أفضل تطابق',
      titleSort: 'العنوان أ–ي',
      moviesEmpty: 'لا توجد نتائج ضمن الأفلام لـ «Dune»',
      previous: 'الصفحة السابقة',
      page: 'الصفحة 2',
      next: 'الصفحة التالية',
      resultPages: 'صفحات نتائج البحث',
      authors: 'المؤلفون',
      searching: 'جارٍ البحث…',
    },
  } as const;
  const expected = labels[locale];
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname
      .replace(/^\/lumen(?=\/)/, '')
      .replace(/^\/api\/v1/, '');
    if (path === '/auth/me')
      return route.fulfill({ json: { id: 1, permissions: 2 } });
    if (path === '/user/1/settings/main')
      return route.fulfill({
        json: {
          locale,
          showBooks: true,
          enabledMediaCategories: {
            movie: true,
            tv: true,
            ebook: true,
            audiobook: true,
          },
        },
      });
    if (path === '/settings/public')
      return route.fulfill({
        json: {
          booksEnabled: true,
          enabledMediaCategories: {
            movie: true,
            tv: true,
            ebook: true,
            audiobook: true,
          },
        },
      });
    if (path === '/search') {
      const requestUrl = new URL(route.request().url());
      const pageNumber = Number(requestUrl.searchParams.get('page') ?? 1);
      return route.fulfill({
        json: {
          page: pageNumber,
          totalPages: requestUrl.searchParams.get('type') === 'author' ? 1 : 3,
          totalResults: 42,
          results:
            requestUrl.searchParams.get('type') === 'author'
              ? [{ id: 'OL1A', mediaType: 'author', name: 'Jane Austen' }]
              : [],
        },
      });
    }
    if (path === '/discover/trending')
      return route.fulfill({
        json: { page: 1, totalPages: 1, totalResults: 0, results: [] },
      });
    if (path.startsWith('/discover/books'))
      return route.fulfill({
        json: { page: 1, totalPages: 1, totalResults: 0, results: [] },
      });
    return route.fulfill({ json: [] });
  });

  await page.goto(appPath('/search'));
  await expect(
    page.getByRole('heading', { level: 1, name: expected.heading })
  ).toBeVisible();
  const scopes = page.getByRole('group', { name: expected.searchIn });
  for (const name of [
    expected.all,
    expected.movies,
    expected.series,
    expected.books,
    expected.audio,
  ])
    await expect(
      scopes.getByRole('button', { name, exact: true })
    ).toBeVisible();
  await expect(page.locator('#sq')).toHaveAttribute(
    'placeholder',
    locale === 'en'
      ? 'Movies, series, books, narrators…'
      : locale === 'fr'
        ? 'Films, séries, livres, narrateurs…'
        : 'أفلام ومسلسلات وكتب ورواة…'
  );

  await page.goto(appPath('/search?f=movie&q=Dune&page=2'));
  await expect(
    page.getByRole('heading', { level: 1, name: expected.heading })
  ).toBeVisible();
  await expect(
    page.getByText(
      locale === 'en'
        ? 'In Movies'
        : locale === 'fr'
          ? 'Dans Films'
          : 'ضمن الأفلام',
      { exact: true }
    )
  ).toBeVisible();
  const sorting = page.getByRole('combobox');
  await expect(sorting).toBeVisible();
  await expect(page.getByText(expected.sort, { exact: true })).toBeVisible();
  await expect(
    sorting.getByRole('option', { name: expected.bestMatch, exact: true })
  ).toBeAttached();
  await expect(
    sorting.getByRole('option', { name: expected.titleSort, exact: true })
  ).toBeAttached();
  await expect(
    page.getByText(expected.moviesEmpty, { exact: true })
  ).toBeVisible();
  const pages = page.getByRole('navigation', { name: expected.resultPages });
  await expect(
    pages.getByRole('button', { name: expected.previous, exact: true })
  ).toBeEnabled();
  await expect(pages.getByText(expected.page, { exact: true })).toBeVisible();
  await expect(
    pages.getByRole('button', { name: expected.next, exact: true })
  ).toBeEnabled();
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
    )
    .toBe(true);
  await capture(page, test.info());
  await pages.getByRole('button', { name: expected.next, exact: true }).click();
  await expect(page).toHaveURL(/page=3/);
  await expect(
    pages.getByRole('button', { name: expected.next, exact: true })
  ).toBeDisabled();
  await page.goto(appPath('/search?f=author&q=Jane'));
  await expect(
    page.getByRole('heading', { name: expected.authors, exact: true })
  ).toBeVisible();
});
