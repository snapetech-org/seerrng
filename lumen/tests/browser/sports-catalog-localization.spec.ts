import { expect, test } from '@playwright/test';
import { testAppPath } from './testAppPath';

const locale = ['en', 'fr', 'ar'].includes(
  process.env.LUMEN_SPORTS_CATALOG_LOCALE ?? ''
)
  ? (process.env.LUMEN_SPORTS_CATALOG_LOCALE as 'en' | 'fr' | 'ar')
  : 'en';

const copy = {
  en: {
    title: 'Sports',
    hint: 'Find a league or competition and follow it; events are recorded as they happen.',
    search: 'Search leagues — Premier League, NFL, F1…',
    emptyTitle: 'Search for a league',
    emptyHint: 'Try a sport, a league or a country.',
    noResults: 'No leagues found',
    noResultsHint: 'Try the league’s full name.',
  },
  fr: {
    title: 'Sports',
    hint: 'Trouvez une ligue ou une compétition et suivez-la ; les événements sont enregistrés au fur et à mesure.',
    search: 'Rechercher une ligue — Premier League, NFL, F1…',
    emptyTitle: 'Rechercher une ligue',
    emptyHint: 'Essayez un sport, une ligue ou un pays.',
    noResults: 'Aucune ligue trouvée',
    noResultsHint: 'Essayez le nom complet de la ligue.',
  },
  ar: {
    title: 'الرياضة',
    hint: 'اعثر على دوري أو بطولة وتابعها؛ وسيتم تسجيل الأحداث فور وقوعها.',
    search: 'ابحث عن دوري — Premier League أو NFL أو F1…',
    emptyTitle: 'ابحث عن دوري',
    emptyHint: 'جرّب اسم رياضة أو دوري أو بلد.',
    noResults: 'لم يتم العثور على دوريات',
    noResultsHint: 'جرّب كتابة الاسم الكامل للدوري.',
  },
}[locale];

test('Sports catalog search and empty states follow the saved locale', async ({
  page,
}, info) => {
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname
      .replace(/^\/lumen(?=\/)/, '')
      .slice('/api/v1'.length);
    if (path === '/auth/me')
      return route.fulfill({
        json: { id: 1, displayName: 'Player', permissions: 2 },
      });
    if (path === '/user/1/settings/main')
      return route.fulfill({
        json: { locale, enabledMediaCategories: { sports: true } },
      });
    if (path === '/settings/public')
      return route.fulfill({
        json: {
          sportsEnabled: true,
          enabledMediaCategories: { sports: true },
        },
      });
    if (path === '/discover/sports')
      return route.fulfill({ json: { page: 1, results: [], totalPages: 1 } });
    return route.fulfill({ json: {} });
  });

  await page.goto(testAppPath('/sports'));
  await expect(page.getByRole('heading', { name: copy.title })).toBeVisible();
  const captureDirectory = process.env.LUMEN_SPORTS_CATALOG_CAPTURE_DIR;
  if (captureDirectory && ['desktop', 'iphone'].includes(info.project.name))
    await page.screenshot({
      path: `${captureDirectory}/${locale}-${info.project.name}.png`,
      fullPage: true,
    });
  if (process.env.LUMEN_SPORTS_CATALOG_BASELINE === '1') {
    await expect(
      page.getByText(
        'Find a league or competition and follow it; events are recorded as they happen.'
      )
    ).toBeVisible();
    await expect(
      page.getByPlaceholder('Search leagues — Premier League, NFL, F1…')
    ).toBeVisible();
    await expect(page.getByText('Search for a league')).toBeVisible();
    return;
  }

  await expect(page.getByText(copy.hint)).toBeVisible();
  await expect(page.getByPlaceholder(copy.search)).toBeVisible();
  await expect(page.getByText(copy.emptyTitle)).toBeVisible();
  await expect(page.getByText(copy.emptyHint)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.dir)).toBe(
    locale === 'ar' ? 'rtl' : 'ltr'
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    )
  ).toBe(true);

  await page.getByPlaceholder(copy.search).fill('unknown league');
  await expect(page.getByText(copy.noResults)).toBeVisible();
  await expect(page.getByText(copy.noResultsHint)).toBeVisible();
});
