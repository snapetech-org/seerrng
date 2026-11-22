import { expect, test } from '@playwright/test';

const locale = ['en', 'fr', 'ar'].includes(
  process.env.LUMEN_REQUESTS_LOCALE ?? ''
)
  ? (process.env.LUMEN_REQUESTS_LOCALE as 'en' | 'fr' | 'ar')
  : 'en';
const candidate = process.env.LUMEN_CAPTURE_MODE !== 'baseline';
const copy = {
  en: {
    group: 'Media Filters',
    requester: 'Requester',
    allUsers: 'All Users',
    media: 'Media Type',
    allMedia: 'All Media',
    book: 'Books and Audiobooks',
    format: 'Format',
    allFormats: 'All Formats',
    ebook: 'Book',
    audiobook: 'Audiobook',
    sort: 'Sort',
    priority: 'Request Priority',
    newest: 'Newest First',
    date: 'Date Added',
    allTime: 'All time',
    last7: 'Last 7 days',
    search: 'Search Requests',
    clear: 'Clear search',
  },
  fr: {
    group: 'Filtres pour médias',
    requester: 'Demandeur',
    allUsers: 'Tous les utilisateurs',
    media: 'Type de média',
    allMedia: 'Tous les médias',
    book: 'Livres et livres audio',
    format: 'Format',
    allFormats: 'Tous les formats',
    ebook: 'Livre',
    audiobook: 'Livre audio',
    sort: 'Trier par',
    priority: 'Priorité des demandes',
    newest: 'Plus récentes',
    date: 'Date d’ajout',
    allTime: 'Toute la période',
    last7: '7 derniers jours',
    search: 'Rechercher des demandes',
    clear: 'Effacer la recherche',
  },
  ar: {
    group: 'عوامل تصفية الوسائط',
    requester: 'مقدم الطلب',
    allUsers: 'جميع المستخدمين',
    media: 'نوع الوسائط',
    allMedia: 'جميع الوسائط',
    book: 'كتب وكتب صوتية',
    format: 'التنسيق',
    allFormats: 'جميع التنسيقات',
    ebook: 'كتاب',
    audiobook: 'كتاب صوتي',
    sort: 'الترتيب حسب',
    priority: 'أولوية الطلبات',
    newest: 'الأحدث أولاً',
    date: 'تاريخ الإضافة',
    allTime: 'كامل الفترة',
    last7: 'آخر 7 أيام',
    search: 'البحث عن الطلبات',
    clear: 'مسح البحث',
  },
} as const;

test('manager request filters follow the saved locale and keep URL behavior', async ({
  page,
}, info) => {
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname
      .replace(/^\/lumen(?=\/)/, '')
      .replace(/^\/api\/v1/, '');
    if (path === '/auth/me')
      return route.fulfill({
        json: { id: 1, displayName: 'Manager', permissions: 2 },
      });
    if (path === '/user/1/settings/main')
      return route.fulfill({ json: { locale } });
    if (path === '/settings/public')
      return route.fulfill({ json: { mediaServerType: 1 } });
    if (path === '/request/count') return route.fulfill({ json: {} });
    if (path === '/request/status/users')
      return route.fulfill({
        json: { pageInfo: { page: 1, pages: 1 }, results: [] },
      });
    if (path === '/request' || path === '/request/status')
      return route.fulfill({
        json: { pageInfo: { pages: 1, results: 0 }, results: [] },
      });
    return route.fulfill({ json: {} });
  });

  await page.goto('/requests?tab=everyone&mediaType=book');
  const text = candidate
    ? copy[locale]
    : {
        ...copy.en,
        group: 'Request filters',
        requester: 'Requester',
        allUsers: 'Everyone',
        allMedia: 'All media',
        format: 'Book Format',
        allFormats: 'All formats',
        ebook: 'Ebook',
        priority: 'Request priority',
        newest: 'Newest first',
        search: 'Search media requests',
        clear: 'Clear Search',
      };
  const filters = page.getByRole('group', { name: text.group });
  await expect(filters).toBeVisible();
  await expect(
    filters.getByLabel(text.requester, { exact: false })
  ).toBeVisible();
  const media = filters.getByLabel(text.media, { exact: false });
  const format = filters.getByLabel(text.format, { exact: false });
  const sort = filters.getByLabel(text.sort, { exact: false });
  const date = filters.getByLabel(text.date, { exact: false });
  expect(await media.locator('option').allTextContents()).toContain(
    text.allMedia
  );
  expect(await media.locator('option').allTextContents()).toContain(text.book);
  expect(await format.locator('option').allTextContents()).toEqual([
    text.allFormats,
    text.ebook,
    text.audiobook,
  ]);
  expect(await sort.locator('option').allTextContents()).toContain(
    text.priority
  );
  expect(await sort.locator('option').allTextContents()).toContain(text.newest);
  expect(await date.locator('option').allTextContents()).toContain(
    text.allTime
  );
  expect(await date.locator('option').allTextContents()).toContain(text.last7);
  const search = filters.locator('input[type="search"]');
  await expect(search).toBeVisible();
  await expect(search).toHaveAttribute('placeholder', text.search);
  if (['desktop', 'iphone'].includes(info.project.name)) {
    await page.screenshot({
      path: `${process.env.LUMEN_VISUAL_CAPTURE_DIR}/${info.project.name}.png`,
      fullPage: true,
    });
  }

  await media.selectOption('music');
  await expect(page).toHaveURL(/mediaType=music/);
  await sort.selectOption('newest');
  await expect(page).toHaveURL(/order=newest/);
  await date.selectOption('7d');
  await expect(page).toHaveURL(/timeFrame=7d/);
  await search.fill('Greenland');
  await search.press('Enter');
  await expect(page).toHaveURL(/search=Greenland/);
  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth
  );
  expect(hasHorizontalOverflow).toBe(
    !candidate && info.project.name === 'iphone'
  );
  if (['desktop', 'iphone'].includes(info.project.name)) {
    await page.screenshot({
      path: `${process.env.LUMEN_VISUAL_CAPTURE_DIR}/${info.project.name}-searched.png`,
      fullPage: true,
    });
  }
  if (!candidate) return;
  await filters.getByRole('button', { name: text.clear }).click();
  await expect(page).not.toHaveURL(/search=Greenland/);
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth
      )
    )
    .toBe(true);
});
