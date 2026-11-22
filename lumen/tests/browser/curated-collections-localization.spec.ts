import { expect, test } from '@playwright/test';

const copy = {
  en: {
    series: 'Series in This Collection',
    requestSeries: 'Request Series',
    quality: 'Quality',
    selectAll: 'Select All',
    selected: '1 season selected',
    submitSeries: 'Request Selected Series',
    seriesResult: '1 requested, 0 failed.',
    releases: 'Releases',
    filters: 'Collection Filters',
    releaseType: 'Release Type',
    genre: 'Genre',
    year: 'Release Year',
    any: 'Any',
    clear: 'Clear Filters',
    requestReleases: 'Request Releases',
    submitReleases: 'Request Selected Releases',
    musicResult: '1 requested, 0 skipped, 0 failed.',
    add: 'Add to Media Server',
    remove: 'Remove from Media Server',
    addTitle: 'Add Collection to Media Server',
    removeTitle: 'Remove Collection from Media Server',
    available: 'Fixture Library · 1 available',
    verified: '1 of 1 libraries verified.',
    done: 'Done',
    close: 'Close',
    blocklist: 'Blocklist Collection',
    confirmBlocklist: 'Blocklist this collection?',
    blocked: '1 added to the Blocklist, 0 failed.',
  },
  fr: {
    series: 'Séries de cette collection',
    requestSeries: 'Demander des séries',
    quality: 'Qualité',
    selectAll: 'Tout sélectionner',
    selected: '1 saison sélectionnée',
    submitSeries: 'Demander les séries sélectionnées',
    seriesResult: '1 demandées, 0 échecs.',
    releases: 'Sorties',
    filters: 'Filtres de collection',
    releaseType: 'Type de sortie',
    genre: 'Genre',
    year: 'Année de sortie',
    any: 'Tous',
    clear: 'Effacer les filtres',
    requestReleases: 'Demander des sorties',
    submitReleases: 'Demander les sorties sélectionnées',
    musicResult: '1 demandées, 0 ignorées, 0 échecs.',
    add: 'Ajouter au serveur multimédia',
    remove: 'Retirer du serveur multimédia',
    addTitle: 'Ajouter la collection au serveur multimédia',
    removeTitle: 'Retirer la collection du serveur multimédia',
    available: 'Fixture Library · 1 disponibles',
    verified: '1 bibliothèque(s) sur 1 vérifiée(s).',
    done: 'Terminé',
    close: 'Fermer',
    blocklist: 'Bloquer la collection',
    confirmBlocklist: 'Bloquer cette collection ?',
    blocked: '1 ajoutés à la liste de blocage, 0 échecs.',
  },
  ar: {
    series: 'المسلسلات في هذه المجموعة',
    requestSeries: 'طلب المسلسلات',
    quality: 'الجودة',
    selectAll: 'تحديد الكل',
    selected: 'تم تحديد موسم واحد',
    submitSeries: 'طلب المسلسلات المحددة',
    seriesResult: 'تم طلب 1، وفشل 0.',
    releases: 'الإصدارات',
    filters: 'عوامل تصفية المجموعة',
    releaseType: 'نوع الإصدار',
    genre: 'النوع',
    year: 'سنة الإصدار',
    any: 'أي',
    clear: 'مسح عوامل التصفية',
    requestReleases: 'طلب الإصدارات',
    submitReleases: 'طلب الإصدارات المحددة',
    musicResult: 'تم طلب 1، وتخطي 0، وفشل 0.',
    add: 'إضافة إلى خادم الوسائط',
    remove: 'الإزالة من خادم الوسائط',
    addTitle: 'إضافة المجموعة إلى خادم الوسائط',
    removeTitle: 'إزالة المجموعة من خادم الوسائط',
    available: 'Fixture Library · 1 متاح',
    verified: 'تم التحقق من 1 من أصل 1 مكتبة.',
    done: 'تم',
    close: 'إغلاق',
    blocklist: 'حظر المجموعة',
    confirmBlocklist: 'هل تريد حظر هذه المجموعة؟',
    blocked: 'أُضيف 1 إلى قائمة الحظر، وفشل 0.',
  },
} as const;

const mount = process.env.LUMEN_TEST_MOUNT === '/lumen' ? '/lumen' : '';
const appPath = (path: string) => `${mount}${path}`;
const apiPath = (url: string) =>
  new URL(url).pathname.replace(/^\/lumen(?=\/)/, '').slice('/api/v1'.length);
const viewports = {
  desktop: { width: 1440, height: 900 },
  iphone: { width: 390, height: 844 },
  android: { width: 412, height: 915 },
  tablet: { width: 834, height: 1194 },
} as const;

for (const locale of ['en', 'fr', 'ar'] as const) {
  test(`curated collection workflows follow ${locale}`, async ({
    page,
  }, info) => {
    const text = copy[locale];
    const requests: unknown[] = [];
    const bulkRequests: unknown[] = [];
    const blocklistRequests: unknown[] = [];
    let libraryExists = false;
    const viewport =
      viewports[info.project.name as keyof typeof viewports] ??
      viewports.iphone;
    await page.setViewportSize(viewport);
    await page.route('https://**/*', (route) => route.abort());
    await page.route('**/lumen-config.json', (route) =>
      route.fulfill({ json: {} })
    );
    await page.route('**/api/v1/**', (route) => {
      const request = route.request();
      const path = apiPath(request.url());
      const tvCollection = {
        id: '19',
        name: 'Fixture Series Collection',
        parts: [
          {
            id: '42',
            title: 'Fixture Series',
            releaseDate: '2024-09-07',
          },
        ],
      };
      if (path === '/auth/me')
        return route.fulfill({
          json: { id: 1, permissions: 32 | 2 | 268435456 },
        });
      if (path === '/user/1/settings/main')
        return route.fulfill({ json: { locale } });
      if (path === '/user/1/quota')
        return route.fulfill({
          json: { tv: { limit: 4, remaining: 4, restricted: false } },
        });
      if (path === '/settings/public')
        return route.fulfill({
          json: {
            initialized: true,
            musicEnabled: true,
            mediaServerType: 1,
            partialRequestsEnabled: false,
            enabledMediaCategories: { music: true },
          },
        });
      if (path === '/service/lidarr')
        return route.fulfill({
          json: [
            { id: 2, name: 'Lossless', musicQuality: 'flac', isDefault: true },
          ],
        });
      if (path === '/service/sonarr')
        return route.fulfill({
          json: [{ id: 1, name: 'Sonarr', isDefault: true, is4k: false }],
        });
      if (path === '/service/sonarr/1')
        return route.fulfill({
          json: {
            server: { activeProfileId: 3, activeDirectory: '/series' },
            profiles: [{ id: 3, name: 'HD' }],
            rootFolders: [{ id: 1, path: '/series' }],
          },
        });
      if (path === '/tv/42')
        return route.fulfill({
          json: {
            id: 42,
            name: 'Fixture Series',
            externalIds: { tvdbId: 80 },
            seasons: [{ seasonNumber: 1, episodeCount: 4 }],
            genres: [],
          },
        });
      if (path === '/collection-catalog/tv/19')
        return route.fulfill({ json: tvCollection });
      if (path === '/collection-catalog/tv/19/availability')
        return route.fulfill({
          json: {
            collection: tvCollection,
            sync: {
              supported: true,
              destinations: [
                {
                  libraryId: 'library-1',
                  libraryName: 'Fixture Library',
                  state: libraryExists ? 'exists' : 'missing',
                  availableIds: ['42'],
                  removalToken: libraryExists ? 'a'.repeat(64) : undefined,
                },
              ],
            },
          },
        });
      if (path === '/collection-catalog/tv/19/server') {
        if (request.method() === 'POST') {
          expect(request.postDataJSON()).toEqual({
            libraryIds: ['library-1'],
            selectedIds: ['42'],
          });
          libraryExists = true;
        } else {
          expect(request.method()).toBe('DELETE');
          expect(request.postDataJSON()).toEqual({
            destinations: [
              { libraryId: 'library-1', removalToken: 'a'.repeat(64) },
            ],
          });
          libraryExists = false;
        }
        return route.fulfill({
          json: {
            supported: true,
            destinations: [
              {
                libraryId: 'library-1',
                libraryName: 'Fixture Library',
                state: libraryExists ? 'exists' : 'missing',
                availableIds: ['42'],
                removalToken: libraryExists ? 'a'.repeat(64) : undefined,
              },
            ],
          },
        });
      }
      if (path === '/collection-catalog/music/artist-42')
        return route.fulfill({
          json: {
            id: 'artist-42',
            name: 'Fixture Discography',
            parts: [
              {
                id: 'album-42',
                title: 'Fixture Release',
                primaryType: 'Album',
                releaseDate: '2020-02-22',
                genres: ['Rock'],
              },
            ],
          },
        });
      if (path === '/collection-catalog/music/artist-42/availability')
        return route.fulfill({
          json: {
            collection: {
              id: 'artist-42',
              parts: [
                {
                  id: 'album-42',
                  title: 'Fixture Release',
                },
              ],
            },
            sync: { supported: true, destinations: [] },
          },
        });
      if (path.startsWith('/association/'))
        return route.fulfill({ json: { edges: [] } });
      if (path === '/request' && request.method() === 'POST') {
        requests.push(request.postDataJSON());
        return route.fulfill({ status: 201, json: { id: 51 } });
      }
      if (path === '/request/bulk' && request.method() === 'POST') {
        bulkRequests.push(request.postDataJSON());
        return route.fulfill({
          status: 207,
          json: { created: [{ mediaId: 'album-42' }], skipped: [], failed: [] },
        });
      }
      if (path === '/blocklist' && request.method() === 'POST') {
        blocklistRequests.push(request.postDataJSON());
        return route.fulfill({ status: 201, body: '' });
      }
      return route.fulfill({ json: { results: [] } });
    });

    await page.goto(appPath('/collections/tv/19'));
    await expect(
      page.getByRole('heading', { name: text.series })
    ).toBeVisible();
    await page.screenshot({ path: info.outputPath(`series-${locale}.png`) });
    await page.getByRole('button', { name: text.add }).click();
    const add = page.getByRole('dialog', { name: text.addTitle });
    await expect(
      add.getByRole('checkbox', { name: text.available })
    ).toBeChecked();
    await add.getByRole('button', { name: text.addTitle }).click();
    await expect(add.getByRole('status')).toHaveText(text.verified);
    await add.getByRole('button', { name: text.done }).click();
    await page.getByRole('button', { name: text.remove }).click();
    const remove = page.getByRole('dialog', { name: text.removeTitle });
    await remove.getByRole('button', { name: text.removeTitle }).click();
    await expect(remove.getByRole('status')).toHaveText(text.verified);
    await remove.getByRole('button', { name: text.done }).click();

    await page.getByRole('button', { name: text.requestSeries }).click();
    const seriesSheet = page.getByRole('dialog', { name: text.requestSeries });
    await expect(seriesSheet.getByText(text.selectAll)).toBeVisible();
    await seriesSheet.getByRole('checkbox', { name: /Fixture Series/ }).check();
    await expect(seriesSheet.getByText(text.selected)).toBeVisible();
    await page.screenshot({
      path: info.outputPath(`series-request-${locale}.png`),
    });
    await seriesSheet.getByRole('button', { name: text.submitSeries }).click();
    await expect(seriesSheet.getByText(text.seriesResult)).toBeVisible();
    expect(requests).toEqual([
      {
        mediaType: 'tv',
        mediaId: 42,
        seasons: [1],
        is4k: false,
        tvdbId: 80,
        serverId: 1,
        profileId: 3,
        rootFolder: '/series',
      },
    ]);
    await seriesSheet.getByRole('button', { name: text.close }).click();

    await page.getByRole('button', { name: text.blocklist }).click();
    const confirm = page.getByRole('alertdialog', {
      name: text.confirmBlocklist,
    });
    await expect(confirm).toContainText('1');
    await confirm.getByRole('button', { name: text.blocklist }).click();
    await expect(page.getByText(text.blocked)).toBeVisible();
    expect(blocklistRequests).toEqual([
      { tmdbId: 42, mediaType: 'tv', title: 'Fixture Series' },
    ]);

    await page.goto(appPath('/collections/music/artist-42'));
    await expect(
      page.getByRole('heading', { name: text.releases })
    ).toBeVisible();
    const filters = page.getByRole('group', { name: text.filters });
    await expect(
      filters.getByRole('combobox', { name: text.releaseType })
    ).toBeVisible();
    await expect(
      filters.getByRole('combobox', { name: text.genre })
    ).toBeVisible();
    await expect(
      filters.getByRole('combobox', { name: text.year })
    ).toBeVisible();
    await expect(
      filters.getByRole('option', { name: text.any }).first()
    ).toBeAttached();
    await filters
      .getByRole('combobox', { name: text.genre })
      .selectOption('rock');
    await filters.getByRole('button', { name: text.clear }).click();
    await page.screenshot({ path: info.outputPath(`music-${locale}.png`) });
    await page.getByRole('button', { name: text.requestReleases }).click();
    const musicSheet = page.getByRole('dialog', { name: text.requestReleases });
    await musicSheet.getByRole('checkbox', { name: 'Fixture Release' }).check();
    await page.screenshot({
      path: info.outputPath(`music-request-${locale}.png`),
    });
    await musicSheet.getByRole('button', { name: text.submitReleases }).click();
    await expect(musicSheet.getByText(text.musicResult)).toBeVisible();
    expect(bulkRequests).toEqual([
      {
        mediaType: 'music',
        serverId: 2,
        items: [{ mediaId: 'album-42', title: 'Fixture Release' }],
      },
    ]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      )
    ).toBe(true);
    await expect(page.locator('html')).toHaveAttribute(
      'dir',
      locale === 'ar' ? 'rtl' : 'ltr'
    );
  });
}
