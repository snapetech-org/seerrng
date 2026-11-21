import { expect, test } from '@playwright/test';

const locale = ['en', 'fr', 'ar'].includes(
  process.env.LUMEN_STATUS_LOCALE ?? ''
)
  ? process.env.LUMEN_STATUS_LOCALE!
  : 'en';
const baseline = process.env.LUMEN_STATUS_BASELINE === '1';

const copy = {
  en: {
    onServer: 'On Plex',
    requested: 'Requested',
    blocklisted: 'Blocklisted',
  },
  fr: {
    onServer: 'Sur Plex',
    requested: 'Demandé',
    blocklisted: 'Bloqué',
  },
  ar: { onServer: 'على Plex', requested: 'تم طلبه', blocklisted: 'محظور' },
} as const;

test('poster status labels use the account locale', async ({ page }, info) => {
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.slice('/api/v1'.length);
    if (path === '/auth/me')
      return route.fulfill({
        json: {
          id: 1,
          displayName: 'Fixture User',
          permissions: 268435488,
        },
      });
    if (path === '/user/1/settings/main')
      return route.fulfill({ json: { locale } });
    if (path === '/settings/public')
      return route.fulfill({
        json: {
          applicationTitle: 'SeerrNG',
          mediaServerType: 1,
          hideAvailable: false,
          hideRequested: false,
          hideBlocklisted: false,
          enabledMediaCategories: {},
        },
      });
    if (path === '/discover/movies')
      return route.fulfill({
        json: {
          page: 1,
          totalPages: 1,
          totalResults: 3,
          results: [
            {
              id: 51,
              title: 'Fixture Available Movie',
              mediaType: 'movie',
              releaseDate: '2020-01-01',
              mediaInfo: { id: 51, status: 5 },
            },
            {
              id: 52,
              title: 'Fixture Requested Movie',
              mediaType: 'movie',
              releaseDate: '2020-01-01',
              mediaInfo: { id: 52, status: 2 },
            },
            {
              id: 53,
              title: 'Fixture Blocklisted Movie',
              mediaType: 'movie',
              releaseDate: '2020-01-01',
              mediaInfo: { id: 53, status: 6 },
            },
          ],
        },
      });
    if (path === '/watchproviders/regions' || path === '/languages')
      return route.fulfill({ json: [] });
    if (path === '/genres/movie') return route.fulfill({ json: [] });
    if (path === '/user/1/quota') return route.fulfill({ json: {} });
    if (path.startsWith('/discover/genreslider/'))
      return route.fulfill({ json: [] });
    return route.fulfill({ json: {} });
  });

  await page.goto('/movies');
  const card = page.locator('.poster', { hasText: 'Fixture Available Movie' });
  await expect(card.locator('.glyph')).toHaveAttribute(
    'title',
    baseline ? copy.en.onServer : copy[locale as keyof typeof copy].onServer
  );
  const expected = baseline ? copy.en : copy[locale as keyof typeof copy];
  await expect(
    page
      .locator('.poster', { hasText: 'Fixture Requested Movie' })
      .locator('.glyph')
  ).toHaveAttribute('title', expected.requested);
  await expect(
    page
      .locator('.poster', { hasText: 'Fixture Blocklisted Movie' })
      .locator('.glyph')
  ).toHaveAttribute('title', expected.blocklisted);
  await expect(page.locator('html')).toHaveAttribute(
    'dir',
    locale === 'ar' ? 'rtl' : 'ltr'
  );
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
    )
    .toBe(true);
  const captureDir = process.env.LUMEN_STATUS_CAPTURE_DIR;
  if (captureDir)
    await page.screenshot({
      path: `${captureDir}/${baseline ? 'baseline' : 'candidate'}-status-${locale}-${info.project.name}.png`,
      fullPage: true,
    });
});
