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
    biographyMore: 'Show More Biography',
    biographyLess: 'Show Less Biography',
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
    biographyMore: 'Afficher plus de la biographie',
    biographyLess: 'Afficher moins de la biographie',
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
    biographyMore: 'عرض المزيد من السيرة الذاتية',
    biographyLess: 'عرض أقل من السيرة الذاتية',
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
    await page.route('**/imageproxy/tmdb/**', (route) =>
      route.fulfill({
        contentType: 'image/svg+xml',
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="342" height="513"><rect width="342" height="513" fill="#30405c"/><circle cx="171" cy="171" r="80" fill="#8292b8"/></svg>',
      })
    );
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
            birthday: '1980-01-02',
            deathday: '2020-03-04',
            alsoKnownAs: ['Jane Doe', 'J. Example'],
            imdbId: 'nm1234567',
            profilePath: '/jane-example.jpg',
            knownForDepartment: 'Acting',
            placeOfBirth: 'Montreal',
            biography: Array.from(
              { length: 12 },
              (_, index) =>
                `Biography paragraph ${index + 1}: Jane Example is known for thoughtful performances across film and television. This fixture checks how longer person biographies remain readable on narrow and wide screens. `
            ).join('\n\n'),
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
    const formatDate = (value: string) =>
      new Intl.DateTimeFormat(locale, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        timeZone: 'UTC',
      }).format(new Date(`${value}T00:00:00.000Z`));
    await expect(page.locator('.person-overview')).toContainText(
      formatDate('1980-01-02')
    );
    await expect(page.locator('.person-overview')).toContainText(
      formatDate('2020-03-04')
    );
    await expect(page.getByText(/Jane Doe.*J\. Example/)).toBeVisible();
    const externalLinks = page.getByRole('navigation', {
      name:
        locale === 'fr'
          ? 'Liens externes'
          : locale === 'ar'
            ? 'روابط خارجية'
            : 'External links',
    });
    await expect(
      externalLinks.getByRole('link', { name: 'TMDB' })
    ).toHaveAttribute(
      'href',
      `https://www.themoviedb.org/person/77?language=${locale}`
    );
    await expect(
      externalLinks.getByRole('link', { name: 'IMDb' })
    ).toHaveAttribute('href', 'https://www.imdb.com/name/nm1234567');
    if (
      process.env.LUMEN_PEOPLE_DETAIL_CAPTURE === 'true' &&
      ['desktop', 'iphone'].includes(info.project.name)
    ) {
      await page.screenshot({
        path: info.outputPath(`people-detail-candidate-${locale}.png`),
        animations: 'disabled',
      });
    }
    const biography = page.locator('#person-biography-77');
    const biographyToggle = page.getByRole('button', {
      name: copy.biographyMore,
    });
    await expect(biographyToggle).toHaveAttribute('aria-expanded', 'false');
    await expect(biographyToggle).toHaveAttribute(
      'aria-controls',
      'person-biography-77'
    );
    expect(
      await biography.evaluate(
        (element) => getComputedStyle(element).webkitLineClamp
      )
    ).toBe('6');
    const collapsedHeight = await biography.evaluate(
      (element) => element.getBoundingClientRect().height
    );
    await biographyToggle.click();
    const biographyLess = page.getByRole('button', {
      name: copy.biographyLess,
    });
    await expect(biographyLess).toHaveAttribute('aria-expanded', 'true');
    const expandedHeight = await biography.evaluate(
      (element) => element.getBoundingClientRect().height
    );
    expect(expandedHeight).toBeGreaterThan(collapsedHeight * 1.5);
    if (
      process.env.LUMEN_PEOPLE_DETAIL_CAPTURE === 'true' &&
      ['desktop', 'iphone'].includes(info.project.name)
    ) {
      await page.screenshot({
        path: info.outputPath(`people-biography-expanded-${locale}.png`),
        animations: 'disabled',
        fullPage: true,
      });
    }
    await biographyLess.focus();
    await biographyLess.press('Space');
    await expect(biographyToggle).toHaveAttribute('aria-expanded', 'false');
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
