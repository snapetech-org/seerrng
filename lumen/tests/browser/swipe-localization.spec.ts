import { expect, test } from '@playwright/test';
import { testAppPath } from './testAppPath';

const locale = ['en', 'fr', 'ar'].includes(process.env.LUMEN_SWIPE_LOCALE ?? '')
  ? (process.env.LUMEN_SWIPE_LOCALE as 'en' | 'fr' | 'ar')
  : 'en';

const copy = {
  en: {
    prefs: 'Swipe Preferences',
    filters: 'Deck Filters',
    search: 'Search titles',
    request: 'Request',
    pass: 'Pass',
    save: 'Save Swipe Preferences',
    seriesDefault: 'Series Request Default',
    favoriteTitles: 'Favorite Titles (0 of 25)',
    favoriteCategory: 'Favorite Category',
  },
  fr: {
    prefs: 'Préférences Swipe',
    filters: 'Filtres du catalogue',
    search: 'Rechercher des titres',
    request: 'Demander',
    pass: 'Ignorer',
    save: 'Enregistrer les préférences Swipe',
    seriesDefault: 'Demande de série par défaut',
    favoriteTitles: 'Titres favoris (0 sur 25)',
    favoriteCategory: 'Catégorie favorite',
  },
  ar: {
    prefs: 'تفضيلات Swipe',
    filters: 'عوامل تصفية المجموعة',
    search: 'ابحث عن العناوين',
    request: 'طلب',
    pass: 'تخطي',
    save: 'حفظ تفضيلات Swipe',
    seriesDefault: 'إعداد طلب المسلسل الافتراضي',
    favoriteTitles: 'العناوين المفضلة (0 من 25)',
    favoriteCategory: 'الفئة المفضلة',
  },
}[locale];

test('Swipe deck and preferences follow the saved locale', async ({
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
      return route.fulfill({ json: { locale } });
    if (path === '/swipe/status')
      return route.fulfill({
        json: { mediaTypes: ['movie'], bookFormats: [] },
      });
    if (path === '/swipe/profile')
      return route.fulfill({
        json: {
          seriesRequest: 'first-season',
          bookFormat: 'ebook',
          seedScope: 'favorites',
          tasteNotes: '',
        },
      });
    if (path === '/swipe/favorites')
      return route.fulfill({
        json: [{ id: '5', title: 'Favorite Film', mediaType: 'movie' }],
      });
    if (path === '/swipe/deck')
      return route.fulfill({
        json: { cards: [{ id: '42', title: 'Fixture Film' }], remaining: 1 },
      });
    return route.fulfill({ json: {} });
  });

  await page.goto(testAppPath('/swipe'));
  await expect(page.getByRole('heading', { name: 'Swipe' })).toBeVisible();
  const baseline = process.env.LUMEN_SWIPE_BASELINE === '1';
  await expect(
    page.getByPlaceholder(baseline ? 'Search titles' : copy.search)
  ).toBeVisible();
  await expect(
    page.getByRole('button', {
      name: baseline ? 'Request' : copy.request,
      exact: true,
    })
  ).toBeVisible();
  await expect(
    page.getByRole('button', {
      name: baseline ? 'Pass' : copy.pass,
      exact: true,
    })
  ).toBeVisible();
  await page
    .getByText(baseline ? 'Swipe Preferences' : copy.prefs, { exact: true })
    .click();
  await expect(
    page.getByRole('combobox', {
      name: baseline ? 'Series Request Default' : copy.seriesDefault,
    })
  ).toBeVisible();
  await expect(
    page.getByText(baseline ? 'Favorite Titles (0 of 25)' : copy.favoriteTitles)
  ).toBeVisible();
  await expect(
    page.getByRole('combobox', {
      name: baseline ? 'Favorite Category' : copy.favoriteCategory,
    })
  ).toBeVisible();
  await expect(
    page.getByRole('button', {
      name: baseline ? 'Save Swipe Preferences' : copy.save,
    })
  ).toBeVisible();
  await page
    .getByText(baseline ? 'Deck Filters' : copy.filters, { exact: true })
    .click();
  await expect(
    page.getByLabel(
      baseline
        ? 'Genre or Subject'
        : locale === 'fr'
          ? 'Genre ou sujet'
          : locale === 'ar'
            ? 'النوع أو الموضوع'
            : 'Genre or Subject'
    )
  ).toBeVisible();

  expect(await page.evaluate(() => document.documentElement.dir)).toBe(
    locale === 'ar' ? 'rtl' : 'ltr'
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    )
  ).toBe(true);
  const captureDirectory = process.env.LUMEN_SWIPE_CAPTURE_DIR;
  if (captureDirectory && ['desktop', 'iphone'].includes(info.project.name))
    await page.screenshot({
      path: `${captureDirectory}/${locale}-${info.project.name}.png`,
      fullPage: true,
    });
});
