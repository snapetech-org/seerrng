import { expect, test } from '@playwright/test';

test('Game Finder pages with the submitted filters and saves, runs and deletes searches', async ({
  page,
  baseURL,
}, testInfo) => {
  const locale = ['fr', 'ar'].includes(
    process.env.LUMEN_GAME_FINDER_LOCALE ?? ''
  )
    ? (process.env.LUMEN_GAME_FINDER_LOCALE as 'fr' | 'ar')
    : 'en';
  const copy = {
    en: {
      title: 'Game Finder',
      browse: 'Browse Games',
      keywords: 'Keywords',
      themes: 'Themes',
      exclude: 'Exclude Themes',
      show: 'Show Matches',
      invalid: 'Invalid saved searches response.',
      empty: 'No saved searches yet.',
      unavailable: 'Game Finder could not reach QuestarrNG.',
      serverFailure: 'The server had a problem. Try again in a moment.',
      loadMore: 'Load More Matches',
      searchName: 'Search Name',
      notify: 'Notify Me of New Matches',
      save: 'Save Search',
      saved: 'Search saved.',
      run: 'Run My Search',
      delete: 'Delete My Search',
      confirm: 'Delete Search',
    },
    fr: {
      title: 'Recherche de jeux',
      browse: 'Parcourir les jeux',
      keywords: 'Mots-clés',
      themes: 'Thèmes',
      exclude: 'À exclure',
      show: 'Afficher les résultats',
      invalid: 'Réponse des recherches enregistrées invalide.',
      empty: 'Aucune recherche enregistrée.',
      unavailable: 'Game Finder ne peut pas joindre QuestarrNG.',
      serverFailure:
        'Le serveur a rencontré un problème. Réessayez dans un instant.',
      loadMore: 'Charger plus de résultats',
      searchName: 'Nom',
      notify: 'M’avertir des nouveaux résultats',
      save: 'Enregistrer la recherche',
      saved: 'Recherche enregistrée.',
      run: 'Lancer My Search',
      delete: 'Supprimer My Search',
      confirm: 'Supprimer la recherche',
    },
    ar: {
      title: 'مستكشف الألعاب',
      browse: 'تصفح الألعاب',
      keywords: 'الكلمات المفتاحية',
      themes: 'السمات',
      exclude: 'استبعاد السمات',
      show: 'عرض التطابقات',
      invalid: 'استجابة عمليات البحث المحفوظة غير صالحة.',
      empty: 'لا توجد عمليات بحث محفوظة بعد.',
      unavailable: 'تعذر على مستكشف الألعاب الوصول إلى QuestarrNG.',
      serverFailure: 'حدثت مشكلة في الخادم. حاول مجددًا بعد قليل.',
      loadMore: 'تحميل المزيد من التطابقات',
      searchName: 'اسم البحث',
      notify: 'أبلغني بالتطابقات الجديدة',
      save: 'حفظ البحث',
      saved: 'تم حفظ البحث.',
      run: 'تشغيل My Search',
      delete: 'حذف My Search',
      confirm: 'حذف البحث',
    },
  }[locale];
  const discovery: Record<string, unknown>[] = [];
  let saved: Record<string, unknown> | undefined;
  let invalidSaved = true;
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/api/v1/**', (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.slice('/api/v1'.length);
    if (path === '/auth/me')
      return route.fulfill({ json: { id: 2, permissions: 32 } });
    if (path === '/settings/public')
      return route.fulfill({
        json: { softwareEnabled: true, enabledMediaCategories: { game: true } },
      });
    if (path === '/user/2/settings/main')
      return route.fulfill({ json: { locale } });
    if (path === '/game-content/discover') {
      const body = request.postDataJSON();
      discovery.push(body);
      if (discovery.length === 2)
        return route.fulfill({ json: { available: false, results: [] } });
      if (discovery.length === 4)
        return route.fulfill({
          status: 500,
          json: { message: 'Internal Server Error' },
        });
      return route.fulfill({
        json: {
          available: true,
          results: [
            {
              game: {
                igdbId: body.cursor ? 22 : 21,
                title: body.cursor ? 'Second Game' : 'First Game',
              },
              reasons: [{ values: ['Survival'] }],
            },
          ],
          nextCursor: body.cursor ? null : 'page-two',
        },
      });
    }
    if (path === '/game-content/saved' && request.method() === 'POST') {
      saved = { ...request.postDataJSON(), id: 7 };
      return route.fulfill({ json: saved });
    }
    if (path === '/game-content/saved' && invalidSaved) {
      invalidSaved = false;
      return route.fulfill({ json: { results: [null] } });
    }
    if (path === '/game-content/saved')
      return route.fulfill({ json: { results: saved ? [saved] : [] } });
    if (path === '/game-content/saved/7') {
      expect(request.method()).toBe('DELETE');
      saved = undefined;
      return route.fulfill({ status: 204 });
    }
    return route.fulfill({ json: { results: [] } });
  });

  await page.goto('./games/discovery');
  await expect(page.getByRole('heading', { name: copy.title })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.dir)).toBe(
    locale === 'ar' ? 'rtl' : 'ltr'
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    )
  ).toBe(true);
  const invalid = page.getByRole('alert').filter({ hasText: copy.invalid });
  await expect(invalid).toBeVisible();
  await invalid.getByRole('button', { name: 'Retry' }).click();
  await expect(page.getByText(copy.empty)).toBeVisible();
  const captureDirectory = process.env.LUMEN_GAME_FINDER_CAPTURE_DIR;
  if (captureDirectory && ['desktop', 'iphone'].includes(testInfo.project.name))
    await page.screenshot({
      path: `${captureDirectory}/${locale}-${testInfo.project.name}.png`,
      animations: 'disabled',
    });
  await page.getByLabel(copy.keywords).fill('crafting');
  await page.getByLabel(copy.themes, { exact: true }).fill('Survival');
  await page.getByLabel(copy.exclude).fill('Horror');
  await page.getByRole('button', { name: copy.show }).click();
  await expect(page.getByRole('link', { name: 'First Game' })).toHaveAttribute(
    'href',
    new URL('./game/game/21', baseURL).pathname
  );
  await page.getByLabel(copy.keywords).fill('different draft');
  await page.getByRole('button', { name: copy.loadMore }).click();
  await expect(page.getByRole('link', { name: 'First Game' })).toBeVisible();
  const failure = page.getByRole('alert').filter({ hasText: copy.unavailable });
  await expect(failure).toBeVisible();
  await failure.getByRole('button', { name: 'Retry' }).click();
  await expect(page.getByRole('link', { name: 'Second Game' })).toBeVisible();
  expect(discovery[1]).toEqual({
    filters: { text: 'crafting', themes: ['Survival'] },
    exclusions: { themes: ['Horror'] },
    cursor: 'page-two',
  });
  expect(discovery[2]).toEqual(discovery[1]);
  await page.getByLabel(copy.searchName).fill('My Search');
  await page.getByLabel(copy.notify).uncheck();
  await page.getByRole('button', { name: copy.save }).click();
  await expect(page.getByText(copy.saved, { exact: true })).toBeVisible();
  expect(saved).toMatchObject({
    name: 'My Search',
    notify: false,
    filters: { text: 'different draft' },
  });
  await page.getByLabel(copy.keywords).fill('changed again');
  await page.getByRole('button', { name: copy.run }).click();
  await expect(page.getByLabel(copy.keywords)).toHaveValue('different draft');
  await expect.poll(() => discovery.length).toBe(4);
  const serverError = page.getByRole('alert').last();
  await expect(serverError).toBeVisible();
  const errorCapture = process.env.LUMEN_GAME_FINDER_ERROR_CAPTURE;
  if (errorCapture && ['desktop', 'iphone'].includes(testInfo.project.name))
    await page.screenshot({
      path: `${errorCapture}/${locale}-${testInfo.project.name}.png`,
      animations: 'disabled',
    });
  await expect(serverError).toContainText(copy.serverFailure);
  await page.getByRole('button', { name: copy.delete }).click();
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: copy.confirm })
    .click();
  await expect(page.getByText(copy.empty)).toBeVisible();
});
