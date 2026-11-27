import { expect, test } from '@playwright/test';
import { testAppPath } from './testAppPath';

const locale = ['en', 'fr', 'ar'].includes(process.env.LUMEN_ADULT_LOCALE ?? '')
  ? (process.env.LUMEN_ADULT_LOCALE as 'en' | 'fr' | 'ar')
  : 'en';

const copy = {
  en: {
    title: 'Adult',
    hint: 'Browse scenes in your Whisparr libraries or search by title, performer, or studio.',
    search: 'Title, performer, or studio',
    filter: 'Service',
    all: 'All',
    partial:
      'Some Whisparr servers could not be searched. Results may be incomplete.',
    noResults: 'No scenes match this search.',
  },
  fr: {
    title: 'Adulte',
    hint: 'Parcourez les scènes de vos bibliothèques Whisparr ou recherchez par titre, interprète ou studio.',
    search: 'Titre, interprète ou studio',
    filter: 'Serveur',
    all: 'Tous',
    partial:
      "Certains serveurs Whisparr n'ont pas pu être consultés. Les résultats peuvent être incomplets.",
    noResults: 'Aucune scène ne correspond à cette recherche.',
  },
  ar: {
    title: 'للبالغين',
    hint: 'تصفّح المشاهد في مكتبات Whisparr الخاصة بك أو ابحث بالاسم أو المنفّذ أو الاستوديو.',
    search: 'الاسم أو المنفّذ أو الاستوديو',
    filter: 'الخادم',
    all: 'الكل',
    partial: 'تعذّر البحث في بعض خوادم Whisparr. قد تكون النتائج غير مكتملة.',
    noResults: 'لا توجد مشاهد تطابق هذا البحث.',
  },
}[locale];

test('Adult catalog follows the saved locale and preserves service filters', async ({
  page,
}, info) => {
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname
      .replace(/^\/lumen(?=\/)/, '')
      .slice('/api/v1'.length);
    if (path === '/auth/me')
      return route.fulfill({
        json: { id: 1, displayName: 'Viewer', permissions: 8192 },
      });
    if (path === '/user/1/settings/main')
      return route.fulfill({
        json: { locale, enabledMediaCategories: { adult: true } },
      });
    if (path === '/settings/public')
      return route.fulfill({
        json: { adultEnabled: true, enabledMediaCategories: { adult: true } },
      });
    if (path === '/service/whisparr')
      return route.fulfill({
        json: [
          { id: 1, name: 'Whisparr One' },
          { id: 2, name: 'Whisparr Two' },
        ],
      });
    if (path === '/adult/search') {
      const filtered = url.searchParams.has('serverId');
      return route.fulfill({
        json: {
          page: 1,
          results: filtered
            ? []
            : [
                {
                  id: 'scene-1',
                  mediaType: 'adult',
                  title: 'Fixture Scene',
                  serviceId: 1,
                },
              ],
          totalPages: 1,
          partial: !filtered,
        },
      });
    }
    return route.fulfill({ json: {} });
  });

  await page.goto(testAppPath('/adult'));
  const baseline = process.env.LUMEN_ADULT_BASELINE === '1';
  await expect(
    page.getByRole('heading', { name: baseline ? 'Adult' : copy.title })
  ).toBeVisible();
  await expect(
    page.getByText(
      baseline ? 'What the library has. Search to find more.' : copy.hint
    )
  ).toBeVisible();
  await expect(
    page.getByPlaceholder(
      baseline ? 'Search scenes, studios, performers…' : copy.search
    )
  ).toBeVisible();
  await expect(
    page.getByText(
      baseline
        ? 'Whisparr returned partial results. Some matches may be missing.'
        : copy.partial
    )
  ).toBeVisible();
  const captureDirectory = process.env.LUMEN_ADULT_CAPTURE_DIR;
  if (captureDirectory && ['desktop', 'iphone'].includes(info.project.name))
    await page.screenshot({
      path: `${captureDirectory}/${locale}-${info.project.name}.png`,
      fullPage: true,
    });

  const service = page.getByRole('combobox', {
    name: baseline ? 'Whisparr Service' : copy.filter,
  });
  await expect(service).toBeVisible();
  await expect(service.locator('option').first()).toHaveText(
    baseline ? 'All Services' : copy.all
  );
  await service.selectOption('2');
  await page
    .getByPlaceholder(
      baseline ? 'Search scenes, studios, performers…' : copy.search
    )
    .fill('missing');
  await expect(
    page.getByText(baseline ? 'Nothing found' : copy.noResults)
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.dir)).toBe(
    locale === 'ar' ? 'rtl' : 'ltr'
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    )
  ).toBe(true);
});
