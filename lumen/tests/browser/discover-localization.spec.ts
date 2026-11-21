import { expect, test } from '@playwright/test';

const locale = ['en', 'fr', 'ar'].includes(
  process.env.LUMEN_DISCOVER_LOCALE ?? ''
)
  ? (process.env.LUMEN_DISCOVER_LOCALE as 'en' | 'fr' | 'ar')
  : 'en';

const labels = {
  en: {
    title: 'Discover',
    popular: 'Popular Right Now',
    newOn: 'New on Plex',
    added: 'Added Jan 2',
    titleView: 'Title View',
    titleViewAction: 'Title View: Always show poster titles',
    titleViewOnHoverAction: 'Title View: Show poster titles on hover or focus',
    failure: 'This section could not be loaded.',
    retry: 'Retry',
    noTitles: 'No popular titles available',
    movies: 'Movies',
    series: 'Series',
    books: 'Books',
    audio: 'Audiobooks',
  },
  fr: {
    title: 'Découvrir',
    popular: 'Populaires en ce moment',
    newOn: 'Nouveautés sur Plex',
    added: 'Ajouté le 2 janv.',
    titleView: 'Affichage des titres',
    titleViewAction:
      'Affichage des titres : Toujours afficher les titres des affiches',
    titleViewOnHoverAction:
      'Affichage des titres : Afficher les titres au survol ou au focus',
    failure: 'Impossible de charger cette section.',
    retry: 'Réessayer',
    noTitles: 'Aucun titre populaire disponible',
    movies: 'Films',
    series: 'Séries',
    books: 'Livres',
    audio: 'Livres audio',
  },
  ar: {
    title: 'اكتشف',
    popular: 'الأكثر رواجًا الآن',
    newOn: 'جديد على Plex',
    added: 'أُضيف 2 يناير',
    titleView: 'عرض العناوين',
    titleViewAction: 'عرض العناوين: إظهار عناوين الملصقات دائمًا',
    titleViewOnHoverAction:
      'عرض العناوين: إظهار عناوين الملصقات عند المرور أو التركيز',
    failure: 'تعذر تحميل هذا القسم.',
    retry: 'إعادة المحاولة',
    noTitles: 'لا توجد عناوين رائجة متاحة',
    movies: 'أفلام',
    series: 'مسلسلات',
    books: 'كتب',
    audio: 'كتب صوتية',
  },
} as const;
const baselineLabels = {
  title: 'Discover',
  popular: 'Popular right now',
  newOn: 'New on Plex',
  added: 'Added Jan 2',
  titleView: 'Title View',
  titleViewAction: 'Title View: Always show poster titles',
  titleViewOnHoverAction: 'Title View: Show poster titles on hover or focus',
  failure: 'Couldn’t load popular titles',
  retry: 'Retry',
  noTitles: 'No popular titles available',
  movies: 'Movies',
  series: 'Series',
  books: 'Books',
  audio: 'Audiobooks',
};

test('Discover shell, shelves, and recovery follow the account locale', async ({
  page,
}, info) => {
  const expected = process.env.LUMEN_DISCOVER_BASELINE
    ? baselineLabels
    : labels[locale];
  let trendingCalls = 0;
  let movieTitleMode: 'hover' | 'always' = 'hover';
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: { mediaServerName: 'Plex' } })
  );
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname.slice(
      '/api/v1'.length
    );
    if (path === '/auth/me')
      return route.fulfill({
        json: {
          id: 1,
          displayName: 'Fixture User',
          permissions: 2,
          settings: { cardTextVisibilityMovie: movieTitleMode },
        },
      });
    if (path === '/user/1/settings/card-text') {
      if (route.request().method() === 'POST') {
        const mode = route.request().postDataJSON().movie;
        if (mode === 'always' || mode === 'hover') movieTitleMode = mode;
      }
      return route.fulfill({
        json: { movie: movieTitleMode },
      });
    }
    if (path === '/user/1/settings/main')
      return route.fulfill({ json: { locale } });
    if (path === '/settings/public')
      return route.fulfill({
        json: {
          applicationTitle: 'SeerrNG',
          mediaServerType: 1,
          movie4kEnabled: false,
          series4kEnabled: false,
          partialRequestsEnabled: true,
          booksEnabled: true,
          ebookServiceEnabled: true,
          audiobookServiceEnabled: true,
          enabledMediaCategories: {},
        },
      });
    if (path === '/lumen/configuration') return route.fulfill({ json: {} });
    if (path === '/settings/discover') return route.fulfill({ json: [] });
    if (path === '/discover/trending') {
      trendingCalls++;
      return trendingCalls === 1
        ? route.fulfill({ status: 503, json: {} })
        : route.fulfill({
            json: { page: 1, totalPages: 1, totalResults: 0, results: [] },
          });
    }
    if (path === '/discover/genreslider/movie')
      return route.fulfill({ json: [] });
    if (path.startsWith('/discover/'))
      return route.fulfill({ json: { page: 1, totalPages: 1, results: [] } });
    if (path === '/media')
      return route.fulfill({
        json: {
          page: 1,
          totalPages: 1,
          results: [
            {
              id: 2,
              tmdbId: 2,
              mediaType: 'movie',
              title: 'Fixture Film',
              posterPath: '/fixture.jpg',
              status: 5,
              mediaAddedAt: '2026-01-02T00:00:00.000Z',
            },
          ],
        },
      });
    return route.fulfill({ json: [] });
  });

  await page.goto(
    process.env.LUMEN_DISCOVER_BASELINE ||
      process.env.LUMEN_DISCOVER_MOUNT === '/lumen'
      ? '/lumen/'
      : '/'
  );
  await expect(
    page.getByRole('heading', { name: expected.title })
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: expected.newOn })
  ).toBeVisible();
  await expect(page.getByText(expected.added)).toBeVisible();
  const titleView = page.getByRole('button', {
    name: expected.titleViewAction,
  });
  await expect(titleView).toBeVisible();
  if (!process.env.LUMEN_DISCOVER_BASELINE) {
    await titleView.click();
    await expect(
      page.getByRole('button', { name: expected.titleViewOnHoverAction })
    ).toHaveAttribute('aria-pressed', 'true');
    await page
      .getByRole('button', { name: expected.titleViewOnHoverAction })
      .click();
    await expect(
      page.getByRole('button', { name: expected.titleViewAction })
    ).toHaveAttribute('aria-pressed', 'false');
  }
  await expect(
    page.getByRole('link', { name: expected.movies, exact: true }).last()
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: expected.series, exact: true }).last()
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: expected.books, exact: true }).last()
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: expected.audio, exact: true }).last()
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: expected.popular })
  ).toBeVisible();
  const hero = page.locator('section').filter({
    has: page.getByRole('heading', { name: expected.popular }),
  });
  await expect(hero.getByText(expected.failure)).toBeVisible();
  const retry = hero.getByRole('button', { name: expected.retry });
  await retry.click();
  await expect.poll(() => trendingCalls).toBe(2);
  await expect(hero.getByText(expected.noTitles)).toBeVisible();

  if (process.env.LUMEN_DISCOVER_CAPTURE)
    await page.screenshot({
      path: info.outputPath(`discover-${locale}.png`),
      fullPage: true,
      animations: 'disabled',
    });
});

test('administrator Discover row controls follow the account locale', async ({
  page,
}, info) => {
  const settingsLocale = (process.env.LUMEN_SETTINGS_LOCALE ?? 'en') as
    'en' | 'fr' | 'ar';
  const localeLabels = {
    en: ['Discover rows', 'Popular right now', 'New on Plex'],
    fr: [
      'Sections de découverte',
      'Populaires en ce moment',
      'Nouveautés sur Plex',
    ],
    ar: ['أقسام الاستكشاف', 'الأكثر رواجًا الآن', 'جديد على Plex'],
  }[settingsLocale];
  const expected = process.env.LUMEN_DISCOVER_BASELINE
    ? ['Discover rows', 'Popular right now', 'New on Plex']
    : localeLabels;

  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: { mediaServerName: 'Plex' } })
  );
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname.slice(
      '/api/v1'.length
    );
    if (path === '/auth/me')
      return route.fulfill({
        json: {
          id: 1,
          displayName: 'Fixture Admin',
          permissions: 2,
          settings: {},
        },
      });
    if (path === '/user/1/settings/main')
      return route.fulfill({ json: { locale: settingsLocale } });
    if (path === '/settings/public')
      return route.fulfill({
        json: {
          applicationTitle: 'SeerrNG',
          mediaServerType: 1,
          movie4kEnabled: false,
          series4kEnabled: false,
          partialRequestsEnabled: true,
          booksEnabled: true,
          ebookServiceEnabled: true,
          audiobookServiceEnabled: true,
          enabledMediaCategories: {},
        },
      });
    if (path === '/lumen/configuration') return route.fulfill({ json: {} });
    return route.fulfill({ json: [] });
  });

  await page.goto(
    process.env.LUMEN_DISCOVER_MOUNT === '/lumen'
      ? '/lumen/me/lumen'
      : '/me/lumen'
  );
  for (const label of expected)
    await expect(page.getByText(label).first()).toBeVisible();
  if (process.env.LUMEN_DISCOVER_CAPTURE)
    await page.screenshot({
      path: info.outputPath(`admin-discover-${settingsLocale}.png`),
      fullPage: true,
      animations: 'disabled',
    });
});
