import { expect, test } from '@playwright/test';

const mount = process.env.LUMEN_TEST_MOUNT === '/lumen' ? '/lumen' : '';
const baseline = process.env.LUMEN_ISSUE_LIST_ERROR_BASELINE === '1';
const capture = process.env.LUMEN_ISSUE_LIST_ERROR_CAPTURE;
const copy = {
  en: {
    title: 'Couldn’t load issues',
    baselineTitle: 'Couldn’t load Issues',
    error: 'The server had a problem. Try again in a moment.',
    retry: 'Retry',
  },
  fr: {
    title: 'Impossible de charger les signalements',
    baselineTitle: 'Impossible de charger issues',
    error: 'Le serveur a rencontré un problème. Réessayez dans un instant.',
    retry: 'Réessayer',
  },
  ar: {
    title: 'تعذّر تحميل البلاغات',
    baselineTitle: 'تعذّر تحميل issues',
    error: 'حدثت مشكلة في الخادم. حاول مجددًا بعد قليل.',
    retry: 'إعادة المحاولة',
  },
} as const;

for (const locale of ['en', 'fr', 'ar'] as const) {
  test(`issue list load errors follow ${locale} locale and retry`, async ({
    page,
  }) => {
    let calls = 0;
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
          json: { id: 1, displayName: 'Manager', permissions: 4194304 },
        });
      if (path === '/settings/public') return route.fulfill({ json: {} });
      if (path === '/user/1/settings/main')
        return route.fulfill({ json: { locale } });
      if (path === '/issue') {
        calls += 1;
        if (calls === 1)
          return route.fulfill({
            status: 503,
            json: { message: 'Service Unavailable' },
          });
        return route.fulfill({
          json: { results: [], pageInfo: { page: 1, pages: 1 } },
        });
      }
      return route.fulfill({ json: {} });
    });
    await page.goto(`${mount}/issues`);
    const alert = page.getByRole('alert').filter({
      hasText: baseline ? copy[locale].baselineTitle : copy[locale].title,
    });
    await expect(alert.getByText(copy[locale].error)).toBeVisible();
    if (capture && ['desktop', 'iphone'].includes(test.info().project.name))
      await page.screenshot({
        path: `${capture}-${locale}-${test.info().project.name}.png`,
        fullPage: true,
        animations: 'disabled',
      });
    await page.getByRole('button', { name: copy[locale].retry }).click();
    await expect(alert).toHaveCount(0);
    expect(calls).toBe(2);
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
      )
      .toBe(true);
  });
}
