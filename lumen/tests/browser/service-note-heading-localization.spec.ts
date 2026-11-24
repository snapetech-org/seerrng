import { expect, test } from '@playwright/test';

const mount = process.env.LUMEN_TEST_MOUNT === '/lumen' ? '/lumen' : '';
const baseline = process.env.LUMEN_SERVICE_NOTE_BASELINE === '1';
const copy = {
  en: {
    what: 'Comics/Manga',
    heading: 'Couldn’t load Comics/Manga',
    baselineHeading: 'Couldn’t load comics',
    error: 'The server had a problem. Try again in a moment.',
    retry: 'Retry',
  },
  fr: {
    what: 'BD et mangas',
    heading: 'Impossible de charger BD et mangas',
    error: 'Le serveur a rencontré un problème. Réessayez dans un instant.',
    retry: 'Réessayer',
  },
  ar: {
    what: 'القصص المصورة والمانغا',
    heading: 'تعذّر تحميل القصص المصورة والمانغا',
    error: 'حدثت مشكلة في الخادم. حاول مجددًا بعد قليل.',
    retry: 'إعادة المحاولة',
  },
} as const;

for (const locale of ['en', 'fr', 'ar'] as const) {
  test(`shared empty-state headings follow ${locale} locale`, async ({
    page,
  }, info) => {
    let catalogueCalls = 0;
    const catalogueStatuses: number[] = [];
    await page.route('https://**/*', (route) => route.abort());
    await page.route('**/lumen-config.json', (route) =>
      route.fulfill({ json: {} })
    );
    await page.route('**/api/v1/**', (route) => {
      const path = new URL(route.request().url()).pathname
        .replace(/^\/lumen(?=\/)/, '')
        .slice('/api/v1'.length);
      if (path === '/auth/me')
        return route.fulfill({ json: { id: 1, displayName: 'Viewer' } });
      if (path === '/settings/public')
        return route.fulfill({
          json: {
            comicsEnabled: true,
            enabledMediaCategories: { comic: true },
          },
        });
      if (path === '/user/1/settings/main')
        return route.fulfill({ json: { locale } });
      if (path === '/discover/comics/landing')
        return route.fulfill({
          json: {
            library: [],
            trending: [],
            newest: [],
            western: [],
            failed: [],
            genres: [],
            publishers: [],
            comicVineConfigured: true,
          },
        });
      if (path === '/discover/comics') {
        catalogueCalls += 1;
        if (catalogueCalls === 1) {
          catalogueStatuses.push(503);
          return route.fulfill({
            status: 503,
            json: { message: 'Service Unavailable' },
          });
        }
        catalogueStatuses.push(200);
        return route.fulfill({
          json: { page: 1, totalPages: 1, totalResults: 0, results: [] },
        });
      }
      return route.fulfill({ json: { page: 1, totalPages: 1, results: [] } });
    });
    await page.goto(`${mount}/comics?catalog=1&query=chainsaw`);
    const expected = baseline ? copy.en.baselineHeading : copy[locale].heading;
    const note = page.getByRole('alert').filter({ hasText: expected });
    const heading = note.getByText(expected, { exact: true });
    await expect(heading).toBeVisible();
    await expect(
      note.getByText(copy[locale].error, {
        exact: true,
      })
    ).toBeVisible();
    const capture = process.env.LUMEN_SERVICE_NOTE_CAPTURE;
    if (capture && ['desktop', 'iphone'].includes(info.project.name))
      await page.screenshot({
        path: `${capture}-${locale}-${info.project.name}.png`,
        fullPage: true,
        animations: 'disabled',
      });
    await note
      .getByRole('button', {
        name: copy[locale].retry,
      })
      .click();
    await expect.poll(() => catalogueStatuses).toContain(200);
    await expect(note).toHaveCount(0);
    expect(catalogueStatuses[0]).toBe(503);
    expect(catalogueCalls).toBeGreaterThanOrEqual(2);
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
      )
      .toBe(true);
  });
}
