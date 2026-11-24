import { expect, test } from '@playwright/test';

const mount = process.env.LUMEN_TEST_MOUNT === '/lumen' ? '/lumen' : '';
const messages = {
  en: {
    title: 'Couldn’t load books',
    failure: 'The server had a problem. Try again in a moment.',
    more: 'Couldn’t load more.',
    retry: 'Retry',
  },
  fr: {
    title: 'Impossible de charger les livres',
    failure: 'Le serveur a rencontré un problème. Réessayez dans un instant.',
    more: 'Impossible de charger la suite.',
    retry: 'Réessayer',
  },
  ar: {
    title: 'تعذر تحميل الكتب',
    failure: 'حدثت مشكلة في الخادم. حاول مجددًا بعد قليل.',
    more: 'تعذّر تحميل المزيد.',
    retry: 'إعادة المحاولة',
  },
} as const;

for (const locale of ['en', 'fr', 'ar'] as const) {
  test(`paged catalog errors follow ${locale} locale`, async ({
    page,
  }, info) => {
    let catalogCalls = 0;
    await page.route('https://**/*', (route) => route.abort());
    await page.route('**/lumen-config.json', (route) =>
      route.fulfill({ json: {} })
    );
    await page.route('**/api/v1/**', (route) => {
      const path = new URL(route.request().url()).pathname
        .replace(/^\/lumen(?=\/)/, '')
        .slice('/api/v1'.length);
      if (path === '/auth/me')
        return route.fulfill({ json: { id: 1, permissions: 2 } });
      if (path === '/settings/public')
        return route.fulfill({
          json: { ebookServiceEnabled: true, booksEnabled: true },
        });
      if (path === '/user/1/settings/main')
        return route.fulfill({ json: { locale } });
      if (path === '/discover/books') {
        catalogCalls += 1;
        if (catalogCalls === 1)
          return route.fulfill({
            status: 500,
            json: { message: 'Internal Server Error' },
          });
        return route.fulfill({
          json: { page: 1, totalPages: 1, totalResults: 0, results: [] },
        });
      }
      if (path === '/book/library')
        return route.fulfill({
          json: { page: 1, totalPages: 1, totalResults: 0, results: [] },
        });
      return route.fulfill({ json: { page: 1, totalPages: 1, results: [] } });
    });
    await page.goto(`${mount}/books?sort=trending`);
    const error = page.locator('.empty').filter({
      hasText: messages[locale].title,
    });
    await expect(error).toBeVisible();
    const moreAlert = page.getByRole('alert');
    await moreAlert.scrollIntoViewIfNeeded();
    const capture = process.env.LUMEN_PAGED_ERROR_CAPTURE;
    if (capture)
      await page.screenshot({
        path: `${capture}-${locale}-${info.project.name}.png`,
        animations: 'disabled',
      });
    const retry = page.getByRole('button', { name: messages[locale].retry });
    await expect(retry).toBeVisible();
    await expect(error).toContainText(messages[locale].failure);
    await expect(moreAlert).toContainText(messages[locale].more);
    const tabbar = page.locator('.tabbar');
    if (info.project.name !== 'desktop') {
      await page.evaluate(() => window.scrollTo(0, 0));
      await expect(tabbar).not.toHaveAttribute('data-hidden');
    }
    await retry.click();
    await expect(error).toBeHidden();
    expect(catalogCalls).toBe(2);
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth >
          document.documentElement.clientWidth
      )
    ).toBe(false);
  });
}
