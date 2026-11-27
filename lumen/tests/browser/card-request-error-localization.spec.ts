import { expect, test } from '@playwright/test';

const mount = process.env.LUMEN_TEST_MOUNT === '/lumen' ? '/lumen' : '';
const copy = {
  en: {
    failure: 'The server had a problem. Try again in a moment.',
  },
  fr: {
    failure: 'Le serveur a rencontré un problème. Réessayez dans un instant.',
  },
  ar: {
    failure: 'حدثت مشكلة في الخادم. حاول مجددًا بعد قليل.',
  },
} as const;

for (const locale of ['en', 'fr', 'ar'] as const) {
  for (const kind of ['book', 'comic'] as const) {
    test(`${kind} card request failure follows ${locale} locale`, async ({
      page,
    }, info) => {
      test.skip(
        info.project.name !== 'desktop',
        'hover card action is desktop-only'
      );
      await page.route('https://**/*', (route) => route.abort());
      await page.route('**/lumen-config.json', (route) =>
        route.fulfill({ json: {} })
      );
      await page.route('**/api/v1/**', (route) => {
        const request = route.request();
        const path = new URL(request.url()).pathname
          .replace(/^\/lumen(?=\/)/, '')
          .slice('/api/v1'.length);
        if (path === '/auth/me')
          return route.fulfill({
            json: {
              id: 1,
              permissions: 32 + (kind === 'book' ? 34359738368 : 274877906944),
            },
          });
        if (path === '/settings/public')
          return route.fulfill({
            json: {
              booksEnabled: true,
              ebookServiceEnabled: true,
              comicsEnabled: true,
              enabledMediaCategories: { ebook: true, comic: true },
            },
          });
        if (path === '/user/1/settings/main')
          return route.fulfill({ json: { locale } });
        if (path === '/service/comic')
          return route.fulfill({
            json: [
              {
                id: 1,
                name: 'Fixture Comics',
                isDefault: true,
                backendType: 'backissue',
              },
            ],
          });
        if (path === '/book/library')
          return route.fulfill({
            json: { page: 1, totalPages: 1, totalResults: 0, results: [] },
          });
        if (path === '/discover/books')
          return route.fulfill({
            json: {
              page: 1,
              totalPages: 1,
              totalResults: 1,
              results: [
                {
                  id: 'fixture-book',
                  provider: 'openlibrary',
                  mediaType: 'book',
                  bookFormat: 'ebook',
                  title: 'Fixture Book',
                  author: 'Fixture Author',
                },
              ],
            },
          });
        if (path === '/discover/comics/browse')
          return route.fulfill({
            json: {
              page: 1,
              totalPages: 1,
              totalResults: 1,
              results: [
                {
                  id: 'fixture-comic',
                  mediaType: 'comic',
                  kind: 'manga',
                  title: 'Fixture Comic',
                  editions: [
                    {
                      id: 'edition-1',
                      title: 'Fixture Comic',
                      language: 'en',
                      languageName: 'English',
                      recommended: true,
                    },
                  ],
                  editionsResolved: true,
                  recommendedId: 'edition-1',
                },
              ],
            },
          });
        if (path === '/discover/comics/landing')
          return route.fulfill({ json: {} });
        if (path === '/comic/work/fixture-comic')
          return route.fulfill({
            json: {
              id: 'fixture-comic',
              editions: [],
              editionsResolved: true,
            },
          });
        if (path === '/request' && request.method() === 'POST')
          return route.fulfill({
            status: 500,
            json: { message: 'Internal Server Error' },
          });
        return route.fulfill({ json: [] });
      });

      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(
        `${mount}${kind === 'book' ? '/books?show=all' : '/comics?type=manga'}`
      );
      const poster = page
        .locator(kind === 'book' ? '.poster.book' : '.comic-grid .poster')
        .first();
      await expect(poster).toBeVisible();
      await poster.hover();
      const button = poster.locator('.qa').getByRole('button');
      await expect(button).toBeVisible();
      const capture = process.env.LUMEN_CARD_ERROR_CAPTURE;
      if (capture)
        await page.screenshot({
          path: `${capture}-${kind}-${locale}-before.png`,
          animations: 'disabled',
        });
      await button.click();
      if (kind === 'comic')
        await page.getByRole('alertdialog').getByRole('button').first().click();
      const toast = page
        .getByRole('status')
        .filter({ hasText: copy[locale].failure });
      if (capture)
        await page.screenshot({
          path: `${capture}-${kind}-${locale}-after.png`,
          animations: 'disabled',
        });
      await expect(toast).toContainText(copy[locale].failure);
      expect(
        await page.evaluate(
          () =>
            document.documentElement.scrollWidth >
            document.documentElement.clientWidth
        )
      ).toBe(false);
    });
  }
}
