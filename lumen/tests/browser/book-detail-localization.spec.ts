import { expect, test } from '@playwright/test';

const labels = {
  en: {
    ebook: 'Ebook',
    request: 'Request audiobook',
    narrator: 'Choose a narrator',
    narratorName: 'Fixture Narrator',
    follow: 'Follow New Releases',
    retryFollow: 'Retry Follow Status',
  },
  fr: {
    ebook: 'Livre numérique',
    request: 'Demander un livre audio',
    narrator: 'Choisir un narrateur',
    narratorName: 'Fixture Narrator',
    follow: 'Suivre les nouveautés',
    retryFollow: 'Réessayer le suivi',
  },
  ar: {
    ebook: 'كتاب إلكتروني',
    request: 'طلب كتاب صوتي',
    narrator: 'اختيار راوٍ',
    narratorName: 'Fixture Narrator',
    follow: 'متابعة الإصدارات الجديدة',
    retryFollow: 'إعادة محاولة حالة المتابعة',
  },
} as const;

for (const locale of ['en', 'fr', 'ar'] as const) {
  test(`book details use ${locale} labels and preserve narrator selection`, async ({
    page,
  }, testInfo) => {
    await page.route('https://**/*', (route) => route.abort());
    await page.route('**/lumen-config.json', (route) =>
      route.fulfill({ json: {} })
    );
    let followAttempts = 0;
    await page.route('**/api/v1/**', (route) => {
      const url = new URL(route.request().url());
      const path = url.pathname.slice('/api/v1'.length);
      if (path === '/follow') {
        followAttempts += 1;
        return followAttempts === 1
          ? route.fulfill({ status: 503, json: {} })
          : route.fulfill({ json: { results: [] } });
      }
      if (path === '/auth/me')
        return route.fulfill({
          json: {
            id: 1,
            permissions: 2,
            settings: { narratorChoice: true },
          },
        });
      if (path === '/user/1/settings/main')
        return route.fulfill({ json: { locale } });
      if (path === '/settings/public')
        return route.fulfill({
          json: {
            ebookServiceEnabled: true,
            audiobookServiceEnabled: true,
            booksEnabled: true,
          },
        });
      if (path.startsWith('/book/'))
        return route.fulfill({
          json: {
            id: 'bookshelf:42:aGM6MTIzNDU',
            mediaType: 'book',
            bookFormat: 'ebook',
            title: 'Fixture Book',
            author: 'Fixture Author',
            authorId: 'author-1',
            posterPath: null,
            description: 'A test description.',
          },
        });
      if (path === '/editions/book')
        return route.fulfill({
          json: {
            editions: [
              {
                id: 'edition-1',
                title: 'Fixture recording',
                format: 'audiobook',
                language: 'eng',
                narrators: ['Fixture Narrator'],
                durationSeconds: 36000,
              },
            ],
          },
        });
      return route.fulfill({ json: {} });
    });

    await page.goto('/book/bookshelf%3A42%3AaGM6MTIzNDU');
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    await expect(page.locator('html')).toHaveAttribute(
      'dir',
      locale === 'ar' ? 'rtl' : 'ltr'
    );
    await expect(page.getByText(labels[locale].ebook).first()).toBeVisible();
    const retryFollow = page.getByRole('button', {
      name: labels[locale].retryFollow,
    });
    await expect(retryFollow).toBeVisible();
    await retryFollow.click();
    await expect(
      page.getByRole('button', { name: labels[locale].follow })
    ).toBeVisible();

    await page.goto('/book/bookshelf%3A42%3AaGM6MTIzNDU?f=audio');
    await expect(
      page.getByRole('heading', { name: labels[locale].narrator })
    ).toBeVisible();
    await expect(
      page.getByText(labels[locale].narratorName).first()
    ).toBeVisible();

    await expect(page.locator('body')).toHaveJSProperty(
      'scrollWidth',
      await page.evaluate(() => document.documentElement.clientWidth)
    );
    const screenshotPath = testInfo.outputPath(`book-detail-${locale}.png`);
    await page.screenshot({
      path: screenshotPath,
      fullPage: true,
    });
    await testInfo.attach(`book-detail-${locale}`, {
      path: screenshotPath,
      contentType: 'image/png',
    });
  });
}
