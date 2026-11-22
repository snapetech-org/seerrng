import { expect, test } from '@playwright/test';

for (const locale of ['en', 'fr', 'ar'] as const) {
  test(`recommendation feeds preserve behavior in ${locale}`, async ({
    page,
  }, info) => {
    const baseline = process.env.LUMEN_BOOK_RECOMMENDATIONS_BASELINE === 'true';
    const copy = {
      en: {
        title: 'Book Recommendations',
        show: 'Show books: Fixture Feed',
        standalone: 'Standalones only',
        more: 'More Like This',
        field: 'Title',
        create: 'Create on Hardcover',
        created: 'Recommendation feed created.',
        format: 'Format',
        open: 'Open Book',
      },
      fr: {
        title: 'Recommandations de livres',
        show: 'Afficher les livres : Fixture Feed',
        standalone: 'Livres indépendants uniquement',
        more: 'Plus comme celui-ci',
        field: 'Titre',
        create: 'Créer sur Hardcover',
        created: 'Flux de recommandations créé.',
        format: 'Format',
        open: 'Ouvrir le livre',
      },
      ar: {
        title: 'توصيات الكتب',
        show: 'عرض كتب: Fixture Feed',
        standalone: 'الكتب المستقلة فقط',
        more: 'المزيد من هذا النوع',
        field: 'العنوان',
        create: 'إنشاء على Hardcover',
        created: 'تم إنشاء قائمة التوصيات.',
        format: 'التنسيق',
        open: 'فتح الكتاب',
      },
    }[baseline ? 'en' : locale];
    const captureDirectory = process.env.LUMEN_BOOK_RECOMMENDATIONS_CAPTURE_DIR;
    const submitted: unknown[] = [];
    let resolveBody: unknown;
    await page.route('**/lumen-config.json', (route) =>
      route.fulfill({ json: {} })
    );
    await page.route('**/imageproxy/hardcover/**', (route) =>
      route.fulfill({
        contentType: 'image/svg+xml',
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"/>',
      })
    );
    await page.route('**/api/v1/**', (route) => {
      const path = new URL(route.request().url()).pathname.slice(
        '/api/v1'.length
      );
      if (path === '/auth/me')
        return route.fulfill({ json: { id: 1, permissions: 2 } });
      if (path === '/settings/public')
        return route.fulfill({ json: { booksEnabled: true } });
      if (path === '/user/1/settings/main')
        return route.fulfill({ json: { locale } });
      if (path === '/resolve') {
        resolveBody = route.request().postDataJSON();
        return route.fulfill({
          json: {
            groups: [{ candidates: [{ id: 'OL42W', mediaType: 'book' }] }],
          },
        });
      }
      if (path === '/book/OL42W')
        return route.fulfill({
          json: {
            id: 'OL42W',
            title: 'Matched Fixture Audiobook',
            author: 'Fixture Author',
            description: 'Fixture description.',
            mediaType: 'book',
            bookFormat: 'audiobook',
          },
        });
      if (path === '/book-recommendations/7/books') {
        submitted.push(route.request().postDataJSON());
        return route.fulfill({
          json: {
            available: true,
            total: 1,
            books: [
              {
                id: 8,
                title: 'Fixture Book',
                imageUrl: 'https://assets.hardcover.app/fixture.jpg',
              },
            ],
          },
        });
      }
      if (path === '/book-recommendations') {
        if (route.request().method() === 'POST') {
          submitted.push(route.request().postDataJSON());
          return route.fulfill({ status: 201, json: { id: 9 } });
        }
        return route.fulfill({
          json: {
            available: true,
            results: [
              { id: 7, title: 'Fixture Feed', source: 'featured', likes: 2 },
            ],
          },
        });
      }
      return route.fulfill({ json: {} });
    });
    await page.goto('./books/recommendations');
    await expect(page.getByRole('heading', { name: copy.title })).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth
      )
    ).toBe(true);
    if (captureDirectory && ['desktop', 'iphone'].includes(info.project.name))
      await page.screenshot({
        path: `${captureDirectory}/${locale}-${info.project.name}.png`,
        fullPage: true,
      });
    await page.getByRole('button', { name: copy.show }).click();
    await expect(page.getByText('Fixture Book')).toBeVisible();
    await expect(page.locator('.poster.book img')).toHaveAttribute(
      'src',
      '/imageproxy/hardcover/fixture.jpg'
    );
    await page.getByRole('checkbox', { name: copy.standalone }).check();
    await page.getByRole('button', { name: copy.more }).click();
    await expect
      .poll(() => submitted[1])
      .toMatchObject({ tuning: { standalones: true, moreLike: [8] } });
    await page.getByLabel(copy.field, { exact: true }).fill('My Fixture Feed');
    await page.getByRole('button', { name: copy.create }).click();
    await expect
      .poll(() => submitted[2])
      .toMatchObject({ title: 'My Fixture Feed', likeBookIds: [8] });
    await expect(page.getByText(copy.created)).toBeVisible();
    await page.getByRole('button', { name: copy.show }).click();
    await page
      .getByRole('combobox', { name: copy.format, exact: true })
      .selectOption('audiobook');
    await page.getByRole('button', { name: copy.open }).click();
    await expect(page).toHaveURL('./book/OL42W?f=audio');
    await expect(
      page.getByRole('heading', { name: 'Matched Fixture Audiobook' })
    ).toBeVisible();
    expect(resolveBody).toMatchObject({
      text: 'Fixture Book',
      types: ['book'],
      formatHint: 'audiobook',
    });
  });
}
