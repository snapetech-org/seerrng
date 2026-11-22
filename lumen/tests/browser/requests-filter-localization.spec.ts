import { expect, test } from '@playwright/test';

const locale = ['en', 'fr', 'ar'].includes(
  process.env.LUMEN_REQUESTS_LOCALE ?? ''
)
  ? (process.env.LUMEN_REQUESTS_LOCALE as 'en' | 'fr' | 'ar')
  : 'en';
const candidate = process.env.LUMEN_CAPTURE_MODE !== 'baseline';
const filtersBaseline = process.env.LUMEN_REQUEST_FILTERS_BASELINE === '1';
const mount = process.env.LUMEN_TEST_MOUNT === '/lumen' ? '/lumen' : '';
const copy = {
  en: {
    title: 'Requests',
    bookSeries: 'Book Series Requests',
    show: 'Show',
    active: 'Active',
    ready: 'Ready',
    all: 'All',
    everyone: 'Everyone',
    whichRequests: 'Which requests',
    requestFilters: [
      'All',
      'Waiting',
      'Downloading',
      'Incomplete',
      'Needs attention',
      'Unavailable',
      'Failed',
      'Completed',
      'Available',
      'Software',
    ],
    loadFailed: 'Couldn’t load requests',
    retry: 'Retry',
    emptyTitle: 'No requests yet',
    emptyBody: 'Nobody has asked for anything.',
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
    title: 'Demandes',
    bookSeries: 'Demandes de séries de livres',
    show: 'Afficher',
    active: 'En cours',
    ready: 'Prêtes',
    all: 'Toutes',
    everyone: 'Tout le monde',
    whichRequests: 'Quelles demandes',
    requestFilters: [
      'Toutes',
      'En attente',
      'Téléchargement',
      'Incomplètes',
      'À traiter',
      'Indisponibles',
      'Échec',
      'Terminées',
      'Disponibles',
      'Logiciels',
    ],
    loadFailed: 'Impossible de charger les demandes',
    retry: 'Réessayer',
    emptyTitle: 'Aucune demande pour le moment',
    emptyBody: 'Personne n’a encore rien demandé.',
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
    title: 'الطلبات',
    bookSeries: 'طلبات سلاسل الكتب',
    show: 'عرض',
    active: 'نشط',
    ready: 'جاهز',
    all: 'الكل',
    everyone: 'الجميع',
    whichRequests: 'الطلبات المعروضة',
    requestFilters: [
      'الكل',
      'قيد الانتظار',
      'قيد التنزيل',
      'غير مكتملة',
      'يتطلب الانتباه',
      'غير متاحة',
      'فشل',
      'مكتملة',
      'متاحة',
      'البرامج',
    ],
    loadFailed: 'تعذر تحميل الطلبات',
    retry: 'إعادة المحاولة',
    emptyTitle: 'لا توجد طلبات بعد',
    emptyBody: 'لم يطلب أحد أي شيء.',
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
  let failRequests = false;
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
    if (failRequests && (path === '/request' || path === '/request/status'))
      return route.fulfill({
        status: 503,
        json: { message: 'fixture failure' },
      });
    if (path === '/request' || path === '/request/status')
      return route.fulfill({
        json: { pageInfo: { pages: 1, results: 0 }, results: [] },
      });
    return route.fulfill({ json: {} });
  });

  await page.goto(`${mount}/requests?tab=everyone&mediaType=book`);
  const text = {
    ...copy[locale],
    ...(!candidate
      ? {
          title: 'Requests',
          bookSeries: 'Book Series Requests',
          show: 'Show',
          active: 'Active',
          ready: 'Ready',
          all: 'All',
          everyone: 'Everyone',
          loadFailed: 'Couldn’t load requests',
          retry: 'Retry',
          emptyTitle: 'No requests yet',
          emptyBody: 'Nobody has asked for anything.',
        }
      : {}),
  };
  const expectedRequestFilters = filtersBaseline
    ? copy.en.requestFilters
    : copy[locale].requestFilters;
  await expect(
    page.getByRole('heading', { name: text.title, exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: text.bookSeries, exact: true })
  ).toBeVisible();
  const scope = page.getByRole('group', { name: text.show });
  for (const label of [text.active, text.ready, text.all, text.everyone]) {
    await expect(
      scope.getByRole('button', { name: new RegExp(label) })
    ).toBeVisible();
  }
  const requestFilters = page.getByRole('group', {
    name: text.whichRequests,
  });
  for (const label of expectedRequestFilters) {
    await expect(
      requestFilters.getByRole('button', { name: label, exact: true })
    ).toBeVisible();
  }
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
  const empty = page.locator('.empty').filter({ hasText: text.emptyTitle });
  await expect(empty).toContainText(text.emptyBody);
  if (
    process.env.LUMEN_VISUAL_CAPTURE_DIR &&
    ['desktop', 'iphone'].includes(info.project.name)
  ) {
    await page.screenshot({
      path: `${process.env.LUMEN_VISUAL_CAPTURE_DIR}/${info.project.name}.png`,
      fullPage: true,
    });
  }

  failRequests = true;
  await page.reload();
  const alert = page.getByRole('alert');
  await expect(alert).toContainText(text.loadFailed);
  if (
    process.env.LUMEN_VISUAL_CAPTURE_DIR &&
    ['desktop', 'iphone'].includes(info.project.name)
  ) {
    await page.screenshot({
      path: `${process.env.LUMEN_VISUAL_CAPTURE_DIR}/${info.project.name}-error.png`,
      fullPage: true,
    });
  }
  failRequests = false;
  await alert.getByRole('button', { name: text.retry }).click();
  await expect(
    page.locator('.empty').filter({ hasText: text.emptyTitle })
  ).toContainText(text.emptyBody);

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
  expect(hasHorizontalOverflow).toBe(false);
  if (
    process.env.LUMEN_VISUAL_CAPTURE_DIR &&
    ['desktop', 'iphone'].includes(info.project.name)
  ) {
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
