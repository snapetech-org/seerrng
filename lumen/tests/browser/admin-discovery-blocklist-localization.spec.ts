import { expect, test } from '@playwright/test';

const mount = process.env.LUMEN_TEST_MOUNT === '/lumen' ? '/lumen' : '';
const locale = process.env.LUMEN_BLOCKLIST_LOCALE ?? 'en';
const labels = {
  en: {
    title: 'Automatic Blocklist',
    keywords: 'Blocklisted TMDB Keyword IDs',
    search: 'Find Blocklist Keywords',
    find: 'Find Keywords',
    save: 'Save Automatic Blocklist Settings',
    saved: 'Automatic blocklist settings saved.',
    limit: 'Limit Pages per Blocklist Tag or Genre',
    next: 'Next Tag Page',
    page2: 'Tag page 2 of 2',
    movieGenres: 'Blocklisted Movie Genres',
    tvGenres: 'Blocklisted TV Genres',
    unknownGenre: 'Genre #999',
    confirmFailure: 'Could not confirm the saved blocklist settings.',
  },
  fr: {
    title: 'Blocage automatique',
    keywords: 'ID de mots-clés TMDB bloqués',
    search: 'Rechercher des mots-clés de blocage',
    find: 'Rechercher des mots-clés',
    save: 'Enregistrer le blocage automatique',
    saved: 'Paramètres de blocage automatique enregistrés.',
    limit: 'Limiter les pages par balise ou genre bloqué',
    next: 'Page suivante de balises',
    page2: 'Page 2 des balises sur 2',
    movieGenres: 'Genres de films bloqués',
    tvGenres: 'Genres de séries bloqués',
    unknownGenre: 'Genre nº 999',
    confirmFailure:
      'Impossible de confirmer les paramètres de blocage enregistrés.',
  },
  ar: {
    title: 'الحظر التلقائي',
    keywords: 'معرّفات كلمات TMDB المحظورة',
    search: 'البحث عن كلمات الحظر',
    find: 'البحث عن كلمات',
    save: 'حفظ إعدادات الحظر التلقائي',
    saved: 'تم حفظ إعدادات الحظر التلقائي.',
    limit: 'حد الصفحات لكل وسم أو نوع محظور',
    next: 'صفحة وسوم الموضوع التالية',
    page2: 'صفحة الوسوم 2 من 2',
    movieGenres: 'أنواع الأفلام المحظورة',
    tvGenres: 'أنواع المسلسلات المحظورة',
    unknownGenre: 'النوع رقم 999',
    confirmFailure: 'تعذر تأكيد إعدادات الحظر المحفوظة.',
  },
} as const;

test('automatic blocklist settings localize and retain validated edits through save retry', async ({
  page,
}) => {
  const text = labels[locale as keyof typeof labels] ?? labels.en;
  const writes: Record<string, unknown>[] = [];
  let settings: Record<string, unknown> = {
    blocklistedTags: '42',
    blocklistedGenresMovie: '18',
    blocklistedGenresTv: '999',
    blocklistedTagsLimit: 50,
  };
  let failOnce = true;
  let staleReadbackOnce = true;
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname
      .replace(/^\/lumen/, '')
      .replace(/^\/api\/v1/, '');
    if (path === '/auth/me')
      return route.fulfill({ json: { id: 1, permissions: 2 } });
    if (path === '/user/1/settings/main')
      return route.fulfill({ json: { locale } });
    if (path === '/integrations/discovery/configuration')
      return route.fulfill({
        json: { trakt: {}, anilist: {}, simkl: {}, mdblist: {} },
      });
    if (path === '/integrations/discovery/mappings/packs')
      return route.fulfill({ json: { packs: [] } });
    if (path === '/regions' || path === '/languages')
      return route.fulfill({ json: [] });
    if (path === '/genres/movie')
      return route.fulfill({ json: [{ id: 18, name: 'Drama' }] });
    if (path === '/genres/tv') return route.fulfill({ json: [] });
    if (path.startsWith('/search/keyword')) {
      const pageNum = new URL(request.url()).searchParams.get('page');
      return route.fulfill({
        json: {
          results: [{ id: pageNum === '2' ? 74 : 73, name: 'Stage Magic' }],
          total_pages: 2,
        },
      });
    }
    if (path === '/settings/main') {
      if (request.method() === 'POST') {
        const body = request.postDataJSON() as Record<string, unknown>;
        writes.push(body);
        if (failOnce) {
          failOnce = false;
          return route.fulfill({
            status: 503,
            json: { message: 'Service unavailable' },
          });
        }
        if (staleReadbackOnce) {
          staleReadbackOnce = false;
          return route.fulfill({ json: { ...settings, ...body } });
        }
        settings = { ...settings, ...body };
      }
      return route.fulfill({ json: settings });
    }
    return route.fulfill({ json: {} });
  });

  await page.goto(`${mount}/admin/discovery`);
  await expect(
    page.getByRole('heading', {
      name: process.env.LUMEN_BLOCKLIST_BASELINE ? labels.en.title : text.title,
      exact: true,
      level: 2,
    })
  ).toBeVisible();
  if (
    process.env.LUMEN_BLOCKLIST_BASELINE &&
    process.env.LUMEN_BLOCKLIST_CAPTURE
  ) {
    await page.screenshot({
      path: `${process.env.LUMEN_BLOCKLIST_CAPTURE}-${page.viewportSize()!.width}.png`,
      fullPage: true,
    });
    return;
  }
  const keywords = page.getByRole('textbox', {
    name: text.keywords,
    exact: true,
  });
  await expect(keywords).toHaveValue('42');
  await expect(page.getByText(text.movieGenres, { exact: true })).toBeVisible();
  await expect(page.getByText(text.tvGenres, { exact: true })).toBeVisible();
  await expect(
    page.getByText(text.unknownGenre, { exact: true })
  ).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute(
    'dir',
    locale === 'ar' ? 'rtl' : 'ltr'
  );
  const documentWidth = await page.evaluate(
    () => document.documentElement.scrollWidth
  );
  const viewportWidth = await page.evaluate(
    () => document.documentElement.clientWidth
  );
  const overflow = await page.evaluate(() =>
    [...document.querySelectorAll('body *')]
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          tag: element.tagName,
          className:
            typeof element.className === 'string' ? element.className : '',
          text: element.textContent?.trim().slice(0, 70),
          right: Math.round(rect.right),
          width: Math.round(rect.width),
        };
      })
      .filter(({ right }) => right > document.documentElement.clientWidth)
      .slice(0, 8)
  );
  expect(documentWidth, JSON.stringify(overflow)).toBeLessThanOrEqual(
    viewportWidth
  );

  if (process.env.LUMEN_BLOCKLIST_CAPTURE) {
    await page.screenshot({
      path: `${process.env.LUMEN_BLOCKLIST_CAPTURE}-${page.viewportSize()!.width}.png`,
      fullPage: true,
    });
    return;
  }

  const search = page.getByRole('searchbox', {
    name: text.search,
    exact: true,
  });
  await search.fill('magic');
  await page.getByRole('button', { name: text.find, exact: true }).click();
  await expect(page.getByRole('button', { name: 'Stage Magic' })).toBeVisible();
  await page.getByRole('button', { name: 'Stage Magic' }).click();
  await expect(keywords).toHaveValue('42,73');
  const nextPage = page.getByRole('button', { name: text.next, exact: true });
  await nextPage.click();
  await expect(page.getByText(text.page2, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Stage Magic' }).click();
  await expect(keywords).toHaveValue('42,73,74');

  await keywords.fill('42,73,invalid');
  const save = page.getByRole('button', { name: text.save, exact: true });
  await expect(save).toBeDisabled();
  await keywords.fill('42,73,74');
  await save.click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(keywords).toHaveValue('42,73,74');
  await save.click();
  await expect(page.getByRole('alert')).toContainText(text.confirmFailure);
  await expect(keywords).toHaveValue('42,73,74');
  await save.click();
  await expect(page.getByText(text.saved, { exact: true })).toBeVisible();
  expect(writes).toHaveLength(3);
  expect(writes[1]).toEqual({ blocklistedTags: '42,73,74' });
  expect(writes[2]).toEqual({ blocklistedTags: '42,73,74' });
  await expect(page.getByLabel(text.limit, { exact: true })).toHaveValue('50');
});
