import { expect, test, type Page, type TestInfo } from '@playwright/test';

const testMount = process.env.LUMEN_TEST_MOUNT === '/lumen' ? '/lumen' : '';
const testAppPath = (path: string) => `${testMount}${path}`;

async function capture(page: Page, info: TestInfo, name = 'browse-ranges') {
  const directory = process.env.LUMEN_VISUAL_CAPTURE_DIR;
  if (!directory || !['desktop', 'iphone'].includes(info.project.name)) return;
  await page.screenshot({
    path: `${directory}/${name}-${info.project.name}.png`,
    animations: 'disabled',
  });
}

test('movie and series range filters follow the account locale', async ({
  page,
}, info) => {
  const locale = ['en', 'fr', 'ar'].includes(
    process.env.LUMEN_BROWSE_LOCALE ?? ''
  )
    ? (process.env.LUMEN_BROWSE_LOCALE as 'en' | 'fr' | 'ar')
    : 'en';
  const baseline = process.env.LUMEN_CAPTURE_MODE === 'baseline';
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname
      .replace(/^\/lumen(?=\/)/, '')
      .replace(/^\/api\/v1/, '');
    if (path === '/auth/me')
      return route.fulfill({ json: { id: 1, permissions: 2 } });
    if (path === '/user/1/settings/main')
      return route.fulfill({
        json: {
          locale,
          enabledMediaCategories: {
            ebook: true,
            audiobook: true,
            music: true,
            comic: true,
          },
        },
      });
    if (path === '/settings/public')
      return route.fulfill({
        json: {
          enable4k: true,
          musicEnabled: true,
          enabledMediaCategories: {
            ebook: true,
            audiobook: true,
            music: true,
            comic: true,
          },
        },
      });
    if (path === '/discover/movies' || path === '/discover/tv')
      return route.fulfill({
        json: { page: 1, totalPages: 1, totalResults: 0, results: [] },
      });
    if (path === '/languages')
      return route.fulfill({
        json: [
          { iso_639_1: 'en', english_name: 'English' },
          { iso_639_1: 'fr', english_name: 'French' },
          { iso_639_1: 'ja', english_name: 'Japanese' },
        ],
      });
    if (path === '/watchproviders/regions')
      return route.fulfill({
        json: [
          { iso_3166_1: 'FR', english_name: 'France' },
          { iso_3166_1: 'US', english_name: 'United States' },
        ],
      });
    if (path === '/watchproviders/movies' || path === '/watchproviders/tv')
      return route.fulfill({ json: [{ id: 8, name: 'Fixture Stream' }] });
    return route.fulfill({ json: [] });
  });

  const wording = (en: string, fr: string, ar: string) =>
    locale === 'en' ? en : locale === 'fr' ? fr : ar;
  const streamingWording = (en: string, fr: string, ar: string) =>
    baseline ? en : wording(en, fr, ar);
  for (const kind of ['movie', 'tv'] as const) {
    await page.goto(testAppPath(kind === 'movie' ? '/movies' : '/series'));
    await expect(
      page.getByRole('heading', {
        level: 1,
        name:
          kind === 'movie'
            ? wording('Movies', 'Films', 'الأفلام')
            : wording('Series', 'Séries', 'المسلسلات'),
      })
    ).toBeVisible();
    await expect(page.locator('.search-ph .ph-text')).toHaveText(
      kind === 'movie'
        ? wording('Search movies…', 'Rechercher des films…', 'البحث عن أفلام…')
        : wording(
            'Search series…',
            'Rechercher des séries…',
            'البحث عن مسلسلات…'
          )
    );
    await expect(page.locator('header.ph .sub')).toContainText(
      kind === 'movie'
        ? wording(
            'Everything on',
            'Tout ce qui se trouve sur',
            'كل ما هو متوفر على'
          )
        : wording(
            'Requesting gets the whole show.',
            'La demande porte sur toute la série.',
            'يشمل الطلب المسلسل كاملًا.'
          )
    );
    await page
      .getByText(
        wording('More Filters', 'Plus de filtres', 'عوامل تصفية إضافية'),
        { exact: true }
      )
      .click();
    await expect(
      page.getByRole('form', {
        name: wording('More Filters', 'Plus de filtres', 'عوامل تصفية إضافية'),
      })
    ).toBeVisible();
    await expect(
      page.getByText(
        wording(
          'Clear Discovery Filters',
          'Effacer les filtres de découverte',
          'مسح عوامل تصفية الاستكشاف'
        ),
        { exact: true }
      )
    ).toBeVisible();
    await expect(
      page.getByRole('group', {
        name: wording('Availability', 'Disponibilité', 'التوفر'),
      })
    ).toBeVisible();
    await expect(
      page.getByText(wording('Sort', 'Trier', 'الترتيب'), { exact: true })
    ).toBeVisible();
    await expect(
      page.getByText(
        wording('Nothing here', 'Aucun résultat', 'لا توجد نتائج هنا'),
        { exact: true }
      )
    ).toBeVisible();
    await expect(page.locator('.empty')).toContainText(
      wording(
        'Try changing your filters.',
        'Essayez de modifier vos filtres.',
        'جرّب تغيير عوامل التصفية.'
      )
    );
    await expect(
      page.getByRole('combobox', {
        name: wording('Country of Origin', 'Pays d’origine', 'بلد المنشأ'),
      })
    ).toBeVisible();
    await expect(
      page.getByRole('option', {
        name: wording('French', 'français', 'الفرنسية'),
        exact: true,
      })
    ).toBeAttached();
    await expect(
      page.getByRole('option', {
        name: wording('United States', 'États-Unis', 'الولايات المتحدة'),
        exact: true,
      })
    ).toBeAttached();
    await expect(
      page.getByRole('option', {
        name: wording('Popular', 'Popularité', 'الأكثر شعبية'),
        exact: true,
      })
    ).toBeAttached();
    const genreButton = page.getByRole('button', {
      name: wording(
        'Genres: All genres',
        'Genres : Tous les genres',
        'الأنواع: كل الأنواع'
      ),
    });
    await genreButton.click();
    const genreDialog = page.getByRole('dialog', {
      name: wording('Genres', 'Genres', 'الأنواع'),
    });
    await expect(
      genreDialog.getByRole('group', {
        name: wording(
          'Genres to match',
          'Genres à faire correspondre',
          'مطابقة الأنواع'
        ),
      })
    ).toBeVisible();
    await expect(
      genreDialog.getByRole('button', {
        name: wording('Match any', 'Correspondre à un', 'مطابقة أي نوع'),
      })
    ).toBeVisible();
    await genreDialog
      .getByRole('button', {
        name: wording('Done', 'Terminé', 'تم'),
      })
      .click();
    if (kind === 'movie') {
      await page
        .getByRole('button', {
          name: wording(
            'Production Studios',
            'Studios de production',
            'استوديوهات الإنتاج'
          ),
        })
        .click();
      await expect(
        page.getByText(
          wording(
            'Find Production Studios',
            'Rechercher des studios de production',
            'البحث عن استوديوهات الإنتاج'
          ),
          { exact: true }
        )
      ).toBeVisible();
      await page
        .getByRole('button', {
          name: wording(
            'Streaming Services',
            'Services de streaming',
            'خدمات البث'
          ),
        })
        .click();
      const streamingForm = page.getByRole('form', {
        name: wording(
          'Streaming Service Filter',
          'Filtre des services de streaming',
          'تصفية خدمات البث'
        ),
      });
      await expect(streamingForm).toBeVisible();
      await expect(
        page.getByText(
          wording(
            'Provider Match',
            'Correspondance des services',
            'مطابقة الخدمة'
          ),
          { exact: true }
        )
      ).toBeVisible();
      await streamingForm.scrollIntoViewIfNeeded();
      const providerGroup = streamingForm.getByRole('group', {
        name: streamingWording(
          'Streaming Services',
          'Services de streaming',
          'خدمات البث'
        ),
      });
      const providerCheckbox = providerGroup.getByRole('checkbox', {
        name: 'Fixture Stream',
      });
      await expect(providerCheckbox).toBeVisible();
      await expect(
        streamingForm.getByText(
          streamingWording(
            'Streaming Services',
            'Services de streaming',
            'خدمات البث'
          ),
          { exact: true }
        )
      ).toBeVisible();
      const providerGuidance = streamingForm.locator(
        '.cfg-stack > span > small'
      );
      const limit = streamingWording(
        'Select up to 50 services.',
        'Sélectionnez jusqu’à 50 services.',
        'اختر ما يصل إلى 50 خدمة.'
      );
      await expect(providerGuidance).toHaveText(
        `${limit} ${streamingWording('Selected: 0', 'Sélection : 0', 'المحدد: 0')}`
      );
      await providerCheckbox.scrollIntoViewIfNeeded();
      await capture(page, info, 'streaming-filter');
      await providerGroup.getByText('Fixture Stream', { exact: true }).click();
      await expect(providerCheckbox).toBeChecked();
      await expect(providerGuidance).toHaveText(
        `${limit} ${streamingWording('Selected: 1', 'Sélection : 1', 'المحدد: 1')}`
      );
      await page
        .getByRole('button', {
          name: wording('Subject Tags', 'Mots-clés', 'الوسوم'),
        })
        .click();
      await expect(
        page.getByRole('button', {
          name: wording(
            'Find Tags',
            'Rechercher des mots-clés',
            'البحث عن الوسوم'
          ),
        })
      ).toBeVisible();
      await expect(
        page.getByText(
          wording('Tag Match', 'Correspondance des mots-clés', 'مطابقة الوسوم'),
          { exact: true }
        )
      ).toBeVisible();
    } else {
      await expect(
        page.getByRole('combobox', {
          name: wording('Network', 'Réseau', 'الشبكة'),
        })
      ).toBeVisible();
      await expect(
        page.getByRole('combobox', {
          name: wording('Series Status', 'Statut de la série', 'حالة المسلسل'),
        })
      ).toBeVisible();
    }
    const ranges = [
      {
        kind: 'dates',
        group: ['Release Dates', 'les dates de sortie', 'تواريخ الإصدار'],
        low: [
          'Released On or After',
          'Sortie à partir du',
          'تاريخ الإصدار في أو بعد',
        ],
        high: [
          'Released On or Before',
          'Sortie au plus tard le',
          'تاريخ الإصدار في أو قبل',
        ],
      },
      {
        kind: 'rating',
        group: ['Rating', 'la note', 'التقييم'],
        low: ['Minimum Rating', 'Note minimale', 'الحد الأدنى للتقييم'],
        high: ['Maximum Rating', 'Note maximale', 'الحد الأقصى للتقييم'],
      },
      {
        kind: 'runtime',
        group: ['Runtime', 'la durée', 'مدة التشغيل'],
        low: [
          'Minimum Runtime (Minutes)',
          'Durée minimale (minutes)',
          'الحد الأدنى لمدة التشغيل (بالدقائق)',
        ],
        high: [
          'Maximum Runtime (Minutes)',
          'Durée maximale (minutes)',
          'الحد الأقصى لمدة التشغيل (بالدقائق)',
        ],
      },
      {
        kind: 'votes',
        group: ['Vote Count', 'le nombre de votes', 'عدد الأصوات'],
        low: [
          'Minimum Votes',
          'Nombre minimal de votes',
          'الحد الأدنى للأصوات',
        ],
        high: [
          'Maximum Votes',
          'Nombre maximal de votes',
          'الحد الأقصى للأصوات',
        ],
      },
    ];

    for (const range of ranges) {
      const form = page.getByRole('group', {
        name: wording(...(range.group as [string, string, string])),
      });
      await expect(form).toBeVisible();
      await expect(
        form.getByLabel(wording(...(range.low as [string, string, string])))
      ).toBeVisible();
      await expect(
        form.getByLabel(wording(...(range.high as [string, string, string])))
      ).toBeVisible();
      if (range.kind === 'dates') {
        const low = form.locator('input[type="date"]').nth(0);
        const high = form.locator('input[type="date"]').nth(1);
        await low.fill('2026-12-01');
        await high.fill('2026-01-01');
        await expect(
          form.getByText(
            wording(
              'The lower bound must be at or below the upper bound.',
              'La borne inférieure doit être inférieure ou égale à la borne supérieure.',
              'يجب أن يكون الحد الأدنى أقل من الحد الأعلى أو مساويًا له.'
            ),
            { exact: true }
          )
        ).toBeVisible();
        await expect(
          page.getByRole('button', {
            name: wording(
              'Apply Filters',
              'Appliquer les filtres',
              'تطبيق عوامل التصفية'
            ),
          })
        ).toBeDisabled();
        await high.fill('2027-01-01');
        await page
          .getByRole('button', {
            name: wording(
              'Apply Filters',
              'Appliquer les filtres',
              'تطبيق عوامل التصفية'
            ),
          })
          .click();
      }
    }
    if (!baseline && locale === 'ar')
      await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
      )
      .toBe(true);
    if (kind === 'movie') await capture(page, info);
    await page.goto(
      testAppPath(kind === 'movie' ? '/movies/genres' : '/series/genres')
    );
    await expect(
      page.getByRole('heading', {
        level: 1,
        name:
          kind === 'movie'
            ? wording('Movie Genres', 'Genres de films', 'أنواع الأفلام')
            : wording('Series Genres', 'Genres de séries', 'أنواع المسلسلات'),
      })
    ).toBeVisible();
  }
  if (info.project.name === 'desktop') {
    for (const { path, button, title } of [
      {
        path: '/books',
        button: wording(
          'Genres: All genres',
          'Genres : Tous les genres',
          'الأنواع: كل الأنواع'
        ),
        title: wording('Genres', 'Genres', 'الأنواع'),
      },
      {
        path: '/music',
        button: wording(
          'Release Types: Any Release Type',
          'Types de sorties : Tous les types de sorties',
          'أنواع الإصدارات: أي نوع إصدار'
        ),
        title: wording('Release Types', 'Types de sorties', 'أنواع الإصدارات'),
      },
      {
        path: '/comics',
        button: wording(
          'Genres: All genres',
          'Genres : Tous les genres',
          'الأنواع: كل الأنواع'
        ),
        title: wording('Genres', 'Genres', 'الأنواع'),
      },
    ]) {
      await page.goto(testAppPath(path));
      if (path === '/comics')
        await page
          .getByRole('button', {
            name: wording('Manga', 'Manga', 'مانغا'),
          })
          .click();
      const picker = page.getByRole('button', { name: button });
      await expect(picker).toBeVisible();
      await picker.click();
      const dialog = page.getByRole('dialog', { name: title });
      await expect(
        dialog.getByRole('button', {
          name: wording('Done', 'Terminé', 'تم'),
        })
      ).toBeVisible();
    }
  }
});

test('Browse and genre loading errors follow the account locale', async ({
  page,
}, info) => {
  const locale = ['en', 'fr', 'ar'].includes(
    process.env.LUMEN_BROWSE_LOCALE ?? ''
  )
    ? (process.env.LUMEN_BROWSE_LOCALE as 'en' | 'fr' | 'ar')
    : 'en';
  const wording = (en: string, fr: string, ar: string) =>
    locale === 'en' ? en : locale === 'fr' ? fr : ar;
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname
      .replace(/^\/lumen(?=\/)/, '')
      .replace(/^\/api\/v1/, '');
    if (path === '/auth/me')
      return route.fulfill({ json: { id: 1, permissions: 2 } });
    if (path === '/user/1/settings/main')
      return route.fulfill({ json: { locale } });
    if (path === '/settings/public')
      return route.fulfill({ json: { enable4k: true } });
    if (path === '/discover/movies' || path === '/genres/movie')
      return route.fulfill({
        status: 500,
        json: { message: 'Fixture failure' },
      });
    return route.fulfill({ json: [] });
  });

  await page.goto(testAppPath('/movies'));
  await expect(
    page.getByText(
      wording(
        'Couldn’t load movies',
        'Impossible de charger films',
        'تعذّر تحميل الأفلام'
      ),
      { exact: true }
    )
  ).toBeVisible();
  await expect(
    page.getByRole('button', {
      name: wording('Retry', 'Réessayer', 'إعادة المحاولة'),
    })
  ).toBeVisible();

  await page.goto(testAppPath('/movies/genres'));
  await expect(
    page.getByText(
      wording(
        'Couldn’t load genres',
        'Impossible de charger genres',
        'تعذّر تحميل الأنواع'
      ),
      { exact: true }
    )
  ).toBeVisible();
  await expect(
    page.getByRole('button', {
      name: wording('Retry', 'Réessayer', 'إعادة المحاولة'),
    })
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
    )
    .toBe(true);
  if (info.project.name === 'desktop' || info.project.name === 'iphone')
    await page.screenshot({ animations: 'disabled' });
});

test('Browse pagination loading and recovery follow the account locale', async ({
  page,
}, info) => {
  const locale = ['en', 'fr', 'ar'].includes(
    process.env.LUMEN_BROWSE_LOCALE ?? ''
  )
    ? (process.env.LUMEN_BROWSE_LOCALE as 'en' | 'fr' | 'ar')
    : 'en';
  const baseline = process.env.LUMEN_CAPTURE_MODE === 'baseline';
  const wording = (en: string, fr: string, ar: string) =>
    baseline || locale === 'en' ? en : locale === 'fr' ? fr : ar;
  let pageTwoReads = 0;
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname
      .replace(/^\/lumen(?=\/)/, '')
      .replace(/^\/api\/v1/, '');
    if (path === '/auth/me')
      return route.fulfill({ json: { id: 1, permissions: 2 } });
    if (path === '/user/1/settings/main')
      return route.fulfill({ json: { locale } });
    if (path === '/settings/public')
      return route.fulfill({ json: { enable4k: true } });
    if (path === '/discover/movies') {
      const number = Number(url.searchParams.get('page'));
      if (number === 1)
        return route.fulfill({
          json: {
            page: 1,
            totalPages: 2,
            totalResults: 2,
            results: [
              {
                id: 101,
                title: 'First Browse Film',
                mediaType: 'movie',
                posterPath: null,
                releaseDate: '2020-01-01',
              },
            ],
          },
        });
      pageTwoReads++;
      if (pageTwoReads === 1)
        return route.fulfill({
          status: 503,
          json: { message: 'Page unavailable.' },
        });
      await new Promise((resolve) => setTimeout(resolve, 300));
      return route.fulfill({
        json: {
          page: 2,
          totalPages: 2,
          totalResults: 2,
          results: [
            {
              id: 102,
              title: 'Second Browse Film',
              mediaType: 'movie',
              posterPath: null,
              releaseDate: '2021-01-01',
            },
          ],
        },
      });
    }
    return route.fulfill({ json: [] });
  });

  await page.goto(testAppPath('/movies'));
  await expect(
    page.getByRole('link', { name: 'First Browse Film', exact: true })
  ).toBeVisible();
  const error = wording(
    'Couldn’t load more.',
    'Impossible de charger la suite.',
    'تعذّر تحميل المزيد.'
  );
  const loading = wording(
    'Loading more…',
    'Chargement de la suite…',
    'جارٍ تحميل المزيد…'
  );
  const alert = page.getByRole('alert').filter({ hasText: error });
  await expect(alert).toBeVisible();
  const retry = alert.getByRole('button', {
    name: wording('Retry', 'Réessayer', 'إعادة المحاولة'),
  });
  await retry.scrollIntoViewIfNeeded();
  if (['iphone', 'android'].includes(info.project.name)) {
    const buttonBox = await retry.boundingBox();
    const tabsBox = await page.locator('.tabbar').boundingBox();
    expect(buttonBox).not.toBeNull();
    expect(tabsBox).not.toBeNull();
    expect(buttonBox!.y + buttonBox!.height).toBeLessThanOrEqual(tabsBox!.y);
  }
  if (info.project.name === 'desktop' || info.project.name === 'iphone')
    await capture(page, info, 'browse-pagination-error');
  await retry.click();
  const loadingMessage = page.getByText(loading, { exact: true });
  await expect(loadingMessage).toBeVisible();
  await loadingMessage.scrollIntoViewIfNeeded();
  if (info.project.name === 'desktop' || info.project.name === 'iphone')
    await capture(page, info, 'browse-pagination-loading');
  await expect(
    page.getByRole('link', { name: 'Second Browse Film', exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'First Browse Film', exact: true })
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
    )
    .toBe(true);
});
