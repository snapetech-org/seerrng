import { expect, test, type Page, type TestInfo } from '@playwright/test';

const testMount = process.env.LUMEN_TEST_MOUNT === '/lumen' ? '/lumen' : '';
const testAppPath = (path: string) => `${testMount}${path}`;

async function capture(page: Page, info: TestInfo) {
  if (
    !process.env.LUMEN_VISUAL_CAPTURE_DIR ||
    !['desktop', 'iphone'].includes(info.project.name)
  )
    return;
  await page.screenshot({
    path: `${process.env.LUMEN_VISUAL_CAPTURE_DIR}/calendar-${info.project.name}.png`,
    animations: 'disabled',
  });
}

test('Release Calendar localizes filters, states, and release details', async ({
  page,
}, info) => {
  const locale = ['en', 'fr', 'ar'].includes(
    process.env.LUMEN_CALENDAR_LOCALE ?? ''
  )
    ? (process.env.LUMEN_CALENDAR_LOCALE as 'en' | 'fr' | 'ar')
    : 'en';
  const candidate = process.env.LUMEN_CAPTURE_MODE !== 'baseline';
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname
      .replace(/^\/lumen(?=\/)/, '')
      .replace(/^\/api\/v1/, '');
    if (path === '/auth/me')
      return route.fulfill({ json: { id: 1, permissions: 2 } });
    if (path === '/user/1/settings/main')
      return route.fulfill({ json: { locale } });
    if (path === '/calendar')
      return route.fulfill({
        json: {
          partialSources: [{ source: 'radarr' }],
          truncated: false,
          results: [
            {
              id: 'sonarr:1:9',
              title: 'Fixture Series',
              tmdbId: 42,
              mediaType: 'tv',
              dateType: 'air',
              allDay: true,
              available: false,
              is4k: false,
              seasonNumber: 2,
              episodeNumber: 3,
              startsAt: '2026-11-20T00:00:00.000Z',
              episodeTitle: 'A New Episode',
            },
          ],
        },
      });
    return route.fulfill({ json: {} });
  });

  await page.goto(testAppPath('/calendar?month=2026-11'));
  const text = (english: string, french: string, arabic: string) =>
    candidate
      ? locale === 'ar'
        ? arabic
        : locale === 'fr'
          ? french
          : english
      : english;
  await expect(
    page.getByRole('heading', {
      name: text(
        'Release Calendar',
        'Calendrier des sorties',
        'تقويم الإصدارات'
      ),
    })
  ).toBeVisible();
  if (process.env.LUMEN_CALENDAR_EXPECT_DESCRIPTION !== '0')
    await expect(
      page.getByText(
        text(
          'Upcoming movie, series, music, book, comic, magazine, PC game, and emulation releases from your acquisition services.',
          'Prochaines sorties de films, séries, musique, livres, BD, magazines, jeux PC et émulation depuis vos services connectés.',
          'الإصدارات القادمة للأفلام والمسلسلات والموسيقى والكتب والقصص المصورة والمجلات وألعاب الكمبيوتر والمحاكاة من خدماتك المتصلة.'
        ),
        { exact: true }
      )
    ).toBeVisible();
  await expect(
    page.getByRole('combobox', {
      name: text('Media Type', 'Type de média', 'نوع الوسائط'),
    })
  ).toContainText(
    text('Games and Emulation', 'Jeux et émulation', 'الألعاب والمحاكاة')
  );
  await expect(
    page.getByRole('combobox', {
      name: text('Scope', 'Portée', 'النطاق'),
    })
  ).toContainText(
    text(
      'All Monitored Releases',
      'Toutes les sorties suivies',
      'جميع الإصدارات المتابعة'
    )
  );
  const release = page
    .getByRole('listitem')
    .filter({ hasText: 'Fixture Series' });
  await expect(release).toContainText(
    text('Episode release', 'Sortie d’épisode', 'إصدار حلقة')
  );
  await expect(release).toContainText(
    text('Season 2, Episode 3', 'Saison 2, épisode 3', 'الموسم 2، الحلقة 3')
  );
  await expect(release).toContainText(text('Upcoming', 'À venir', 'قادم'));
  const expectedDate = new Intl.DateTimeFormat(candidate ? locale : 'en', {
    dateStyle: 'medium',
    timeZone: 'UTC',
  }).format(new Date('2026-11-20T00:00:00.000Z'));
  await expect(release.locator('time')).toHaveText(expectedDate);
  if (candidate) {
    const warning = page.getByRole('status').filter({
      hasText: text(
        'Some release sources could not be reached.',
        'Certaines sources de sorties sont inaccessibles.',
        'تعذر الوصول إلى بعض مصادر الإصدارات.'
      ),
    });
    await expect(warning).toHaveAttribute('data-tone', 'warning');
    await expect(warning).toContainText(
      text(
        'Their releases may be missing.',
        'Leurs sorties peuvent manquer.',
        'قد تكون إصداراتها غير ظاهرة.'
      )
    );
    await expect(
      warning.getByRole('button', {
        name: text('Retry', 'Réessayer', 'إعادة المحاولة'),
      })
    ).toBeVisible();
  }
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth
      )
    )
    .toBe(true);
  await capture(page, info);
});
