import { expect, test } from '@playwright/test';

const mount = process.env.LUMEN_TEST_MOUNT === '/lumen' ? '/lumen' : '';
const baseline = process.env.LUMEN_USE_API_ERROR_BASELINE === '1';
const copy = {
  en: {
    error: 'The server had a problem. Try again in a moment.',
    retry: 'Retry',
  },
  fr: {
    error: 'Le serveur a rencontré un problème. Réessayez dans un instant.',
    retry: 'Réessayer',
  },
  ar: {
    error: 'حدثت مشكلة في الخادم. حاول مجددًا بعد قليل.',
    retry: 'إعادة المحاولة',
  },
} as const;

for (const locale of ['en', 'fr', 'ar'] as const) {
  test(`shared API detail errors follow ${locale} locale and retry`, async ({
    page,
  }, info) => {
    let movieCalls = 0;
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
      if (path === '/settings/public') return route.fulfill({ json: {} });
      if (path === '/user/1/settings/main')
        return route.fulfill({ json: { locale } });
      if (path === '/movie/550') {
        movieCalls += 1;
        if (movieCalls === 1)
          return route.fulfill({
            status: 503,
            json: { message: 'Service Unavailable' },
          });
        return route.fulfill({
          json: {
            id: 550,
            title: 'Fixture Film',
            overview: 'A fixture.',
            genres: [],
            runtime: 100,
            originalLanguage: 'en',
            mediaInfo: {},
            credits: { cast: [], crew: [] },
          },
        });
      }
      return route.fulfill({ json: { results: [] } });
    });
    await page.goto(`${mount}/movie/550`);
    const message = page.getByText(
      baseline ? copy.en.error : copy[locale].error,
      { exact: true }
    );
    await expect(message).toBeVisible();
    const capture = process.env.LUMEN_USE_API_ERROR_CAPTURE;
    if (capture && ['desktop', 'iphone'].includes(info.project.name))
      await page.screenshot({
        path: `${capture}-${locale}-${info.project.name}.png`,
        fullPage: true,
        animations: 'disabled',
      });
    await page
      .getByRole('button', {
        name: baseline ? copy.en.retry : copy[locale].retry,
      })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Fixture Film' })
    ).toBeVisible();
    expect(movieCalls).toBe(2);
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
      )
      .toBe(true);
  });
}
