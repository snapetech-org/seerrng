import { expect, test } from '@playwright/test';

const text = {
  en: {
    credits: 'Credits',
    mediaType: 'Media Type',
    all: 'All',
    movies: 'Movies',
    sort: 'Sort Credits',
    votes: 'Votes',
    cast: 'Cast',
    crew: 'Crew',
    request: 'Request All Movies',
    confirmTitle: 'Request Movies by Jane Example',
    confirmation:
      'SeerrNG will check 1 credited movies for eligibility and request the eligible titles using your default movie settings.',
    requestAll: 'Request All',
    cancel: 'Cancel',
    result: '1 submitted · 0 skipped · 0 failed',
  },
  fr: {
    credits: 'Crédits',
    mediaType: 'Type de média',
    all: 'Tout',
    movies: 'Films',
    sort: 'Trier les crédits',
    votes: 'Votes',
    cast: 'Distribution',
    crew: 'Équipe',
    request: 'Demander tous les films',
    confirmTitle: 'Demander les films de Jane Example',
    confirmation:
      'SeerrNG vérifiera l’admissibilité des films crédités et demandera les titres admissibles selon vos paramètres de films par défaut.',
    requestAll: 'Tout demander',
    cancel: 'Annuler',
    result: 'Soumis : 1 · Ignorés : 0 · Échecs : 0',
  },
  ar: {
    credits: 'الأعمال',
    mediaType: 'نوع الوسائط',
    all: 'الكل',
    movies: 'الأفلام',
    sort: 'ترتيب الأعمال',
    votes: 'الأصوات',
    cast: 'التمثيل',
    crew: 'طاقم العمل',
    request: 'طلب جميع الأفلام',
    confirmTitle: 'طلب أفلام Jane Example',
    confirmation:
      'سيتحقق SeerrNG من أهلية الأفلام المنسوبة، ثم يطلب العناوين المؤهلة وفق إعدادات الأفلام الافتراضية.',
    requestAll: 'طلب الكل',
    cancel: 'إلغاء',
    result: 'تم إرسال 1 · تم تخطي 0 · فشل 0',
  },
} as const;

const viewports = {
  desktop: { width: 1440, height: 900 },
  iphone: { width: 390, height: 844 },
  android: { width: 412, height: 915 },
  tablet: { width: 834, height: 1194 },
} as const;

for (const locale of ['en', 'fr', 'ar'] as const) {
  test(`people filmography and bulk requests follow ${locale}`, async ({
    page,
  }, info) => {
    const copy = text[locale];
    const writes: unknown[] = [];
    await page.setViewportSize(
      viewports[info.project.name as keyof typeof viewports] ??
        viewports.desktop
    );
    await page.route('https://**/*', (route) => route.abort());
    await page.route('**/lumen-config.json', (route) =>
      route.fulfill({ json: {} })
    );
    await page.route('**/api/v1/**', (route) => {
      const path = new URL(route.request().url()).pathname.slice(
        '/api/v1'.length
      );
      if (path === '/auth/me')
        return route.fulfill({ json: { id: 1, permissions: 2 } });
      if (path === '/user/1/settings/main')
        return route.fulfill({ json: { locale } });
      if (path === '/settings/public')
        return route.fulfill({
          json: { personMovieBulkRequestsEnabled: true },
        });
      if (path === '/follow') return route.fulfill({ json: { results: [] } });
      if (path === '/person/77')
        return route.fulfill({
          json: {
            id: 77,
            name: 'Jane Example',
            knownForDepartment: 'Acting',
            placeOfBirth: 'Montreal',
          },
        });
      if (path === '/person/77/combined_credits')
        return route.fulfill({
          json: {
            cast: [
              {
                id: 5,
                title: 'Fixture Film',
                mediaType: 'movie',
                voteCount: 10,
                character: 'Pilot',
              },
            ],
            crew: [
              {
                id: 5,
                title: 'Fixture Film',
                mediaType: 'movie',
                voteCount: 10,
                job: 'Director',
              },
            ],
          },
        });
      if (
        path === '/request/person-movies' &&
        route.request().method() === 'POST'
      ) {
        writes.push(route.request().postDataJSON());
        return route.fulfill({
          json: { created: [5], skipped: [], failed: [] },
        });
      }
      return route.fulfill({ json: {} });
    });
    await page.goto('/person/77');
    await expect(
      page.getByRole('heading', { name: 'Jane Example' })
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: copy.credits })
    ).toBeVisible();
    await expect(page.getByLabel(copy.mediaType)).toBeVisible();
    await expect(
      page.getByLabel(copy.mediaType).getByRole('option', { name: copy.all })
    ).toBeAttached();
    await expect(page.getByLabel(copy.sort)).toBeVisible();
    await expect(
      page.getByRole('heading', { name: copy.cast, exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: copy.crew, exact: true })
    ).toBeVisible();
    await page.getByRole('button', { name: copy.request }).click();
    const dialog = page.getByRole('alertdialog', { name: copy.confirmTitle });
    await expect(dialog).toContainText(copy.confirmation);
    await page.screenshot({
      path: info.outputPath(`people-confirm-${locale}.png`),
      animations: 'disabled',
    });
    await dialog.getByRole('button', { name: copy.requestAll }).click();
    const result = page
      .getByRole('status')
      .getByText(copy.result, { exact: true });
    await expect(result).toBeVisible();
    expect(writes).toEqual([{ movieIds: [5] }]);
    await expect(page.locator('html')).toHaveAttribute(
      'dir',
      locale === 'ar' ? 'rtl' : 'ltr'
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      )
    ).toBe(true);
  });
}
