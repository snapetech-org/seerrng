import { expect, test, type Page, type TestInfo } from '@playwright/test';

const testMount = process.env.LUMEN_TEST_MOUNT === '/lumen' ? '/lumen' : '';
const testAppPath = (path: string) => `${testMount}${path}`;

async function capture(page: Page, info: TestInfo) {
  const directory = process.env.LUMEN_VISUAL_CAPTURE_DIR;
  if (!directory || !['desktop', 'iphone'].includes(info.project.name)) return;
  await page.screenshot({
    path: `${directory}/browse-ranges-${info.project.name}.png`,
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
      return route.fulfill({ json: { locale } });
    if (path === '/settings/public')
      return route.fulfill({ json: { enable4k: true } });
    if (path === '/discover/movies' || path === '/discover/tv')
      return route.fulfill({
        json: { page: 1, totalPages: 1, totalResults: 0, results: [] },
      });
    return route.fulfill({ json: [] });
  });

  const wording = (en: string, fr: string, ar: string) =>
    baseline || locale === 'en' ? en : locale === 'fr' ? fr : ar;
  for (const kind of ['movie', 'tv'] as const) {
    await page.goto(testAppPath(kind === 'movie' ? '/movies' : '/series'));
    await expect(
      page.getByRole('form', {
        name: wording(
          'Filter by Title',
          'Filtrer par titre',
          'التصفية حسب العنوان'
        ),
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
    const ranges = [
      {
        en: 'Release Date Filter',
        fr: 'Filtre de date de sortie',
        ar: 'عامل تصفية تاريخ الإصدار',
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
        apply: [
          'Apply Release Dates',
          'Appliquer les dates de sortie',
          'تطبيق تواريخ الإصدار',
        ],
      },
      {
        en: 'TMDB Rating Filter',
        fr: 'Filtre de note TMDB',
        ar: 'عامل تصفية تقييم TMDB',
        low: ['Minimum Rating', 'Note minimale', 'الحد الأدنى للتقييم'],
        high: ['Maximum Rating', 'Note maximale', 'الحد الأقصى للتقييم'],
        apply: ['Apply Rating', 'Appliquer la note', 'تطبيق التقييم'],
      },
      {
        en: 'Runtime Filter',
        fr: 'Filtre de durée',
        ar: 'عامل تصفية مدة التشغيل',
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
        apply: ['Apply Runtime', 'Appliquer la durée', 'تطبيق مدة التشغيل'],
      },
      {
        en: 'TMDB Vote Count Filter',
        fr: 'Filtre du nombre de votes TMDB',
        ar: 'عامل تصفية عدد أصوات TMDB',
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
        apply: [
          'Apply Vote Count',
          'Appliquer le nombre de votes',
          'تطبيق عدد الأصوات',
        ],
      },
    ];

    for (const range of ranges) {
      const form = page.getByRole('form', {
        name: wording(range.en, range.fr, range.ar),
      });
      await expect(form).toBeVisible();
      await expect(
        form.getByText(wording(...(range.low as [string, string, string])), {
          exact: true,
        })
      ).toBeVisible();
      await expect(
        form.getByText(wording(...(range.high as [string, string, string])), {
          exact: true,
        })
      ).toBeVisible();
      await expect(
        form.getByRole('button', {
          name: wording(...(range.apply as [string, string, string])),
        })
      ).toBeVisible();
      if (range.en === 'Release Date Filter') {
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
          form.getByRole('button', {
            name: wording(...(range.apply as [string, string, string])),
          })
        ).toBeDisabled();
        await high.fill('2027-01-01');
        await form
          .getByRole('button', {
            name: wording(
              'Clear Release Dates',
              'Effacer les dates de sortie',
              'مسح تواريخ الإصدار'
            ),
          })
          .click();
        await expect(low).toHaveValue('');
        await expect(high).toHaveValue('');
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
  }
});
