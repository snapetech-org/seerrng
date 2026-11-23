import { expect, test } from '@playwright/test';

const mount = process.env.LUMEN_TEST_MOUNT === '/lumen' ? '/lumen' : '';
const locales = [
  {
    tag: 'en',
    title: 'Advanced Request Options',
    server: 'Server',
    quality: 'Quality',
    folder: 'Folder',
    request: 'Request',
    originalLanguage: 'Original Language',
    runtime: 'Runtime',
    cast: 'Starring',
    showAll: 'Show All 11 Credits',
    showFewer: 'Show Fewer Credits',
    subjectTags: 'Subject Tags',
    showTags: 'Show Subject Tags',
    seasonsHeading: 'Seasons',
    pickSeasons: 'Pick seasons',
    requestOneSeason: 'Request 1 season',
    episodeLength: 'Episode length',
    endedStatus: 'Ended',
    collections: 'Series Collections',
    noCollections: 'This series has no catalog collections.',
  },
  {
    tag: 'fr',
    title: 'Options de demande avancées',
    server: 'Serveur',
    quality: 'Qualité',
    folder: 'Dossier',
    request: 'Demander',
    originalLanguage: 'Langue originale',
    runtime: 'Durée',
    cast: 'Avec',
    showAll: 'Afficher les 11 crédits',
    showFewer: 'Afficher moins de crédits',
    subjectTags: 'Mots-clés',
    showTags: 'Afficher les mots-clés',
    seasonsHeading: 'Saisons',
    pickSeasons: 'Choisir les saisons',
    requestOneSeason: 'Demander 1 saison',
    episodeLength: 'Durée d’un épisode',
    endedStatus: 'Terminée',
    collections: 'Collections de séries',
    noCollections: 'Cette série n’appartient à aucune collection du catalogue.',
  },
  {
    tag: 'ar',
    title: 'خيارات الطلب المتقدمة',
    server: 'الخادم',
    quality: 'الجودة',
    folder: 'المجلد',
    request: 'طلب',
    originalLanguage: 'اللغة الأصلية',
    runtime: 'المدة',
    cast: 'بطولة',
    showAll: 'عرض كل الاعتمادات (11)',
    showFewer: 'عرض اعتمادات أقل',
    subjectTags: 'الوسوم',
    showTags: 'عرض الوسوم',
    seasonsHeading: 'المواسم',
    pickSeasons: 'اختر المواسم',
    requestOneSeason: 'طلب موسم 1',
    episodeLength: 'مدة الحلقة',
    endedStatus: 'منتهٍ',
    collections: 'مجموعات المسلسلات',
    noCollections: 'لا ينتمي هذا المسلسل إلى أي مجموعة في الفهرس.',
  },
];

for (const locale of locales) {
  test(`movie request options follow ${locale.tag} locale`, async ({
    page,
  }) => {
    await page.route('https://**/*', (route) => route.abort());
    await page.route('**/lumen-config.json', (route) =>
      route.fulfill({ json: {} })
    );
    await page.route('**/api/v1/**', (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname.split('/api/v1')[1];
      if (path === '/auth/me')
        return route.fulfill({
          json: { id: 1, displayName: 'Viewer', permissions: 2 },
        });
      if (path === '/user/1/settings/main')
        return route.fulfill({ json: { locale: locale.tag } });
      if (path === '/settings/public') return route.fulfill({ json: {} });
      if (path === '/movie/550')
        return route.fulfill({
          json: {
            id: 550,
            title: 'Fixture Film',
            overview: 'A fixture.',
            genres: [],
            runtime: 100,
            originalLanguage: 'en',
            mediaInfo: {},
            credits: {
              cast: Array.from({ length: 11 }, (_, index) => ({
                id: index + 1,
                name: `Actor ${index + 1}`,
                character: `Role ${index + 1}`,
              })),
              crew: [{ id: 20, name: 'Director', job: 'Director' }],
            },
            keywords: [{ id: 16, name: 'Drama' }],
          },
        });
      if (path === '/service/radarr')
        return route.fulfill({
          json: [{ id: 3, name: 'Movies', is4k: false, isDefault: true }],
        });
      if (path === '/service/radarr/3')
        return route.fulfill({
          json: {
            profiles: [{ id: 4, name: 'HD' }],
            rootFolders: [{ id: 5, path: '/movies' }],
            server: { activeProfileId: 4, activeDirectory: '/movies' },
          },
        });
      return route.fulfill({ json: { results: [] } });
    });
    await page.goto(`${mount}/movie/550`);
    await expect(
      page.getByRole('button', { name: locale.request, exact: true }).first()
    ).toBeVisible();
    await expect(
      page.locator('dt', { hasText: locale.originalLanguage })
    ).toBeVisible();
    await expect(page.locator('dt', { hasText: locale.runtime })).toBeVisible();
    await page.getByText(locale.title, { exact: true }).click();
    await expect(page.getByLabel(locale.server)).toBeVisible();
    await expect(page.getByLabel(locale.quality)).toBeVisible();
    await expect(page.getByLabel(locale.folder)).toBeVisible();
    await page.getByText(locale.cast, { exact: true }).click();
    const expandCredits = page.getByRole('button', {
      name: locale.showAll,
      exact: true,
    });
    await expandCredits.click();
    await expect(
      page.getByRole('button', { name: locale.showFewer, exact: true })
    ).toHaveAttribute('aria-expanded', 'true');
    await expect(
      page.getByText(locale.subjectTags, { exact: true })
    ).toBeVisible();
    await page.getByText(locale.subjectTags, { exact: true }).click();
    const dramaTag = page.getByRole('link', { name: 'Drama', exact: true });
    await expect(dramaTag).toBeVisible();
    const tagsToggle = page.getByRole('button', {
      name: locale.showTags,
      exact: true,
    });
    await tagsToggle.click();
    await expect(dramaTag).toBeHidden();
    await tagsToggle.click();
    await expect(dramaTag).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', locale.tag);
    if (process.env.LUMEN_CAPTURE_DIR) {
      await page.screenshot({
        path: `${process.env.LUMEN_CAPTURE_DIR}/options-${locale.tag}-${page.viewportSize()?.width}.png`,
      });
    }
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth
    );
    expect(overflow).toBe(false);
  });
}

for (const locale of locales) {
  test(`TV season selection follows ${locale.tag} locale`, async ({ page }) => {
    await page.route('https://**/*', (route) => route.abort());
    await page.route('**/lumen-config.json', (route) =>
      route.fulfill({ json: {} })
    );
    await page.route('**/api/v1/**', (route) => {
      const path = new URL(route.request().url()).pathname.split('/api/v1')[1];
      if (path === '/auth/me')
        return route.fulfill({
          json: { id: 1, displayName: 'Viewer', permissions: 2 },
        });
      if (path === '/user/1/settings/main')
        return route.fulfill({ json: { locale: locale.tag } });
      if (path === '/settings/public')
        return route.fulfill({ json: { partialRequestsEnabled: true } });
      if (path === '/collection-catalog/tv/for-series/84773')
        return route.fulfill({ json: { collections: [] } });
      if (path === '/tv/84773')
        return route.fulfill({
          json: {
            id: 84773,
            name: 'Fixture Series',
            overview: 'A fixture.',
            genres: [],
            originalLanguage: 'en',
            status: 'Ended',
            firstAirDate: '2022-09-01',
            episodeRunTime: [45],
            contentRatings: { results: [] },
            seasons: [
              {
                seasonNumber: 1,
                episodeCount: 8,
                name: 'Season 1',
                airDate: '2022-09-01',
              },
            ],
            numberOfSeasons: 1,
            mediaInfo: { seasons: [], requests: [] },
          },
        });
      return route.fulfill({ json: { results: [] } });
    });
    await page.goto(`${mount}/tv/84773`);
    await expect(
      page.getByRole('heading', { name: locale.seasonsHeading, exact: true })
    ).toBeVisible();
    const requestSeason = page.getByRole('button', {
      name: locale.requestOneSeason,
      exact: true,
    });
    await expect(requestSeason).toBeEnabled();
    await expect(
      page.locator('dt', { hasText: locale.episodeLength })
    ).toBeVisible();
    await expect(
      page.getByText(locale.endedStatus, { exact: true })
    ).toBeVisible();
    const season = page.getByRole('checkbox', { name: /Season 1/ });
    await expect(season).toBeChecked();
    await season.click();
    await expect(
      page.getByRole('button', { name: locale.pickSeasons, exact: true })
    ).toBeDisabled();
    await season.click();
    await expect(requestSeason).toBeEnabled();
    await expect(page.locator('html')).toHaveAttribute('lang', locale.tag);
    if (process.env.LUMEN_CAPTURE_DIR) {
      await page.screenshot({
        path: `${process.env.LUMEN_CAPTURE_DIR}/tv-${locale.tag}-${page.viewportSize()?.width}.png`,
      });
    }
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth >
          document.documentElement.clientWidth
      )
    ).toBe(false);
    if ((page.viewportSize()?.width ?? 1040) < 1040) {
      await page.evaluate(() =>
        window.scrollTo(0, document.documentElement.scrollHeight)
      );
      const actionbar = await page.locator('.actionbar').boundingBox();
      const detail = await page.locator('.detail').boundingBox();
      expect(actionbar).not.toBeNull();
      expect(detail).not.toBeNull();
      const clearance = await page
        .locator('#view')
        .evaluate((view) =>
          Number.parseFloat(
            getComputedStyle(view).getPropertyValue(
              '--mobile-actionbar-clearance'
            )
          )
        );
      expect(clearance).toBeGreaterThanOrEqual(actionbar!.height);
      expect(detail!.y + detail!.height).toBeLessThanOrEqual(actionbar!.y + 1);
    }
  });
}
