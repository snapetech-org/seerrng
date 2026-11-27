import { expect, test } from '@playwright/test';
import { testAppPath } from './testAppPath';

for (const locale of ['en', 'fr', 'ar'] as const) {
  test(`Watch Session creation follows ${locale}`, async ({ page }) => {
    await page.route('https://**/*', (route) => route.abort());
    await page.route('**/lumen-config.json', (route) =>
      route.fulfill({ json: {} })
    );
    await page.route('**/api/v1/**', (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname.slice('/api/v1'.length);
      if (path === '/auth/me')
        return route.fulfill({
          json: { id: 1, displayName: 'Admin Fixture', permissions: 2 },
        });
      if (path === '/user/1/settings/main')
        return route.fulfill({ json: { locale } });
      if (path === '/settings/public')
        return route.fulfill({
          json: { applicationTitle: 'SeerrNG', mediaServerType: 1 },
        });
      if (path === '/watch-sessions' && request.method() === 'GET')
        return route.fulfill({ json: { sessions: [] } });
      if (path === '/genres/movie') return route.fulfill({ json: [] });
      if (path === '/watch-sessions' && request.method() === 'POST')
        return route.fulfill({ json: { session: { id: 9 } } });
      return route.fulfill({ json: {} });
    });
    await page.goto(testAppPath('/watch-sessions'));
    const copy = {
      en: {
        title: 'Watch Sessions',
        section: 'Your Sessions',
        empty: 'You haven’t joined any watch sessions.',
        form: 'Create a Session',
        sessionTitle: 'Session Title',
        ranking: 'Movie Ranking',
        create: 'Create Session',
        rankingOption: 'Highest Rated',
      },
      fr: {
        title: 'Sessions de visionnage',
        section: 'Vos sessions',
        empty: 'Vous n’avez rejoint aucune session de visionnage.',
        form: 'Créer une session',
        sessionTitle: 'Titre de la session',
        ranking: 'Classement des films',
        create: 'Créer une session',
        rankingOption: 'Les mieux notés',
      },
      ar: {
        title: 'جلسات المشاهدة',
        section: 'جلساتك',
        empty: 'لم تنضم إلى أي جلسة مشاهدة.',
        form: 'إنشاء جلسة',
        sessionTitle: 'عنوان الجلسة',
        ranking: 'ترتيب الأفلام',
        create: 'إنشاء جلسة',
        rankingOption: 'الأعلى تقييمًا',
      },
    }[locale];
    await expect(page.getByRole('heading', { name: copy.title })).toBeVisible();
    await expect(
      page.getByRole('heading', { name: copy.section })
    ).toBeVisible();
    await expect(page.getByText(copy.empty)).toBeVisible();
    await expect(page.getByRole('heading', { name: copy.form })).toBeVisible();
    await expect(page.getByLabel(copy.sessionTitle)).toBeVisible();
    await page.getByLabel(copy.sessionTitle).fill('Friday Movie Night');
    const ranking = page.getByLabel(copy.ranking);
    await expect(
      ranking.locator('option', { hasText: copy.rankingOption })
    ).toHaveCount(1);
    const create = page.waitForRequest(
      (request) =>
        request.method() === 'POST' &&
        new URL(request.url()).pathname.endsWith('/watch-sessions')
    );
    await page.getByRole('button', { name: copy.create, exact: true }).click();
    expect((await create).postDataJSON()).toMatchObject({
      title: 'Friday Movie Night',
      filters: { ranking: 'popularity.desc', genreIds: [] },
    });
    await expect(page.locator('html')).toHaveAttribute(
      'dir',
      locale === 'ar' ? 'rtl' : 'ltr'
    );
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth
        )
      )
      .toBe(true);
  });
}

for (const locale of ['en', 'fr', 'ar'] as const) {
  test(`Watch Session preserves an unavailable genre in ${locale}`, async ({
    page,
  }) => {
    await page.route('https://**/*', (route) => route.abort());
    await page.route('**/lumen-config.json', (route) =>
      route.fulfill({ json: {} })
    );
    await page.route('**/api/v1/**', (route) => {
      const path = new URL(route.request().url()).pathname.slice(
        '/api/v1'.length
      );
      if (path === '/auth/me')
        return route.fulfill({
          json: { id: 1, displayName: 'Admin Fixture', permissions: 2 },
        });
      if (path === '/user/1/settings/main')
        return route.fulfill({ json: { locale } });
      if (path === '/settings/public')
        return route.fulfill({
          json: { applicationTitle: 'SeerrNG', mediaServerType: 1 },
        });
      if (path === '/watch-sessions/9')
        return route.fulfill({
          json: {
            session: {
              id: 9,
              title: 'Friday Movie Night',
              status: 'draft',
              ownerId: 1,
              memberCount: 1,
              expiresAt: '2030-01-15T12:00:00.000Z',
              members: [{ id: 1, displayName: 'Admin Fixture', isOwner: true }],
              filters: { genreIds: [99] },
              ownPreferences: { includeWatchlistContributions: false },
            },
          },
        });
      if (path === '/watch-sessions/9/invites')
        return route.fulfill({ json: { invites: [] } });
      if (path === '/genres/movie') return route.fulfill({ json: [] });
      return route.fulfill({ json: {} });
    });

    await page.goto(testAppPath('/watch-sessions/9'));
    const expiryDate = new Intl.DateTimeFormat(locale, {
      dateStyle: 'medium',
    }).format(new Date('2030-01-15T12:00:00.000Z'));
    await expect(
      page.locator('.note').filter({ hasText: expiryDate })
    ).toBeVisible();
    const fallback = {
      en: 'Genre 99',
      fr: 'Genre 99',
      ar: 'النوع 99',
    }[locale];
    const editSettings = {
      en: 'Edit Session Settings',
      fr: 'Modifier les paramètres de la session',
      ar: 'تعديل إعدادات الجلسة',
    }[locale];
    await page.getByRole('button', { name: editSettings }).click();
    await page.locator('summary').click();
    await expect(page.getByText(fallback, { exact: true })).toBeVisible();
    await expect(page.getByRole('checkbox', { name: fallback })).toBeChecked();
  });
}
