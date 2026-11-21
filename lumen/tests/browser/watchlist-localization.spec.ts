import { expect, test } from '@playwright/test';

const locale = ['en', 'fr', 'ar'].includes(
  process.env.LUMEN_WATCHLIST_LOCALE ?? ''
)
  ? process.env.LUMEN_WATCHLIST_LOCALE!
  : 'en';
const baseline = process.env.LUMEN_WATCHLIST_BASELINE === '1';

const copy = {
  en: {
    title: 'Watchlist',
    discover: 'Discover Watchlist',
    search: 'Search Titles',
    searchPlaceholder: 'Search titles…',
    mediaType: 'Media Type',
    allTypes: 'All Types',
    sortBy: 'Sort By',
    addedOrder: 'Added Order',
    apply: 'Apply Filters',
    clear: 'Clear Filters',
    movie: 'Movies',
    recentlyAdded: 'Recently Added',
    titleAZ: 'Title (A to Z)',
    remove: 'Remove Fixture Movie from Watchlist',
    removeFailure: 'Couldn’t remove this title',
    serverProblem: 'The server had a problem. Try again in a moment.',
    previous: 'Previous Page',
    page: 'Page 1',
    next: 'Next Page',
  },
  fr: {
    title: 'Liste de suivi',
    discover: 'Découvrir la liste de suivi',
    search: 'Rechercher des titres',
    searchPlaceholder: 'Rechercher des titres…',
    mediaType: 'Type de média',
    allTypes: 'Tous les types',
    sortBy: 'Trier par',
    addedOrder: 'Ordre d’ajout',
    apply: 'Appliquer les filtres',
    clear: 'Effacer les filtres',
    movie: 'Films',
    recentlyAdded: 'Ajoutés récemment',
    titleAZ: 'Titre (A à Z)',
    remove: 'Retirer Fixture Movie de la liste de suivi',
    removeFailure: 'Impossible de retirer ce titre',
    serverProblem:
      'Le serveur a rencontré un problème. Réessayez dans un instant.',
    previous: 'Page précédente',
    page: 'Page 1',
    next: 'Page suivante',
  },
  ar: {
    title: 'قائمة المتابعة',
    discover: 'استكشف قائمة المتابعة',
    search: 'البحث عن العناوين',
    searchPlaceholder: 'البحث عن العناوين…',
    mediaType: 'نوع الوسائط',
    allTypes: 'كل الأنواع',
    sortBy: 'ترتيب حسب',
    addedOrder: 'ترتيب الإضافة',
    apply: 'تطبيق عوامل التصفية',
    clear: 'مسح عوامل التصفية',
    movie: 'الأفلام',
    recentlyAdded: 'أضيفت مؤخرًا',
    titleAZ: 'العنوان (أ إلى ي)',
    remove: 'إزالة Fixture Movie من قائمة المتابعة',
    removeFailure: 'تعذرت إزالة هذا العنوان',
    serverProblem: 'حدثت مشكلة في الخادم. حاول مجددًا بعد قليل.',
    previous: 'الصفحة السابقة',
    page: 'الصفحة 1',
    next: 'الصفحة التالية',
  },
} as const;

test('watchlist controls follow the saved account locale', async ({
  page,
}, info) => {
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
        json: { id: 1, displayName: 'Fixture User', permissions: 32 },
      });
    if (path === '/user/1/settings/main')
      return route.fulfill({ json: { locale } });
    if (path === '/settings/public')
      return route.fulfill({
        json: { applicationTitle: 'SeerrNG', mediaServerType: 1 },
      });
    if (path === '/watchlist/51' && route.request().method() === 'DELETE')
      return route.fulfill({ status: 503, json: {} });
    if (path === '/user/1/watchlist')
      return route.fulfill({
        json: {
          filtersSupported: true,
          totalPages: 2,
          results: [
            {
              id: 51,
              tmdbId: 51,
              ratingKey: 'fixture-51',
              mediaType: 'movie',
              title: 'Fixture Movie',
            },
          ],
        },
      });
    return route.fulfill({ json: {} });
  });

  await page.goto('/watchlist');
  const expected = copy[baseline ? 'en' : (locale as keyof typeof copy)];
  await expect(
    page.getByRole('heading', { name: expected.title })
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: expected.discover })
  ).toBeVisible();
  await expect(
    page.getByRole('searchbox', { name: expected.search })
  ).toHaveAttribute('placeholder', expected.searchPlaceholder);
  await expect(
    page.getByText(expected.mediaType, { exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole('option', { name: expected.allTypes })
  ).toBeAttached();
  await expect(page.getByText(expected.sortBy, { exact: true })).toBeVisible();
  await expect(
    page.getByRole('option', { name: expected.addedOrder })
  ).toBeAttached();
  await expect(
    page.getByRole('button', { name: expected.apply })
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: expected.clear })
  ).toBeVisible();
  await expect(page.locator('.setlist .set small')).toHaveText(expected.movie);
  await expect(
    page.getByRole('option', { name: expected.recentlyAdded })
  ).toBeAttached();
  await expect(
    page.getByRole('option', { name: expected.titleAZ })
  ).toBeAttached();
  await expect(
    page.getByRole('button', { name: expected.remove })
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: expected.previous })
  ).toBeDisabled();
  await expect(page.getByText(expected.page, { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: expected.next })).toBeEnabled();
  await expect(page.locator('html')).toHaveAttribute(
    'dir',
    locale === 'ar' ? 'rtl' : 'ltr'
  );
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
    )
    .toBe(true);

  const captureDir = process.env.LUMEN_WATCHLIST_CAPTURE_DIR;
  if (captureDir && ['desktop', 'iphone'].includes(info.project.name)) {
    await page.screenshot({
      path: `${captureDir}/${baseline ? 'baseline' : 'candidate'}-watchlist-${locale}-${info.project.name}.png`,
      fullPage: true,
    });
  }
  await page.getByRole('button', { name: expected.remove }).click();
  await expect(
    page.getByText(
      baseline
        ? copy.en.serverProblem
        : copy[locale as keyof typeof copy].serverProblem,
      { exact: true }
    )
  ).toBeVisible();
});
