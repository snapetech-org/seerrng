import { expect, test } from '@playwright/test';

const mount = process.env.LUMEN_TEST_MOUNT === '/lumen' ? '/lumen' : '';
const locales = {
  en: {
    movie: 'Movie Details',
    tv: 'Series Details',
    studio: 'Production Studios',
    episodes: 'Episodes',
    lastAired: 'Last aired',
    seasonCount: '2 seasons',
    directors: 'Director',
    writers: 'Writers',
    screenplay: 'Screenplay',
    sources: 'Metadata sources',
    tmdb: 'TMDB',
    tvdb: 'TheTVDB.com',
  },
  fr: {
    movie: 'Détails du film',
    tv: 'Détails de la série',
    studio: 'Sociétés de production',
    episodes: 'Épisodes',
    lastAired: 'Dernière diffusion',
    seasonCount: '2 saisons',
    directors: 'Réalisateur',
    writers: 'Auteurs',
    screenplay: 'Scénario',
    sources: 'Sources des métadonnées',
    tmdb: 'TMDB',
    tvdb: 'TheTVDB.com',
  },
  ar: {
    movie: 'تفاصيل الفيلم',
    tv: 'تفاصيل المسلسل',
    studio: 'شركات الإنتاج',
    episodes: 'عدد الحلقات',
    lastAired: 'آخر عرض',
    seasonCount: '2 مواسم',
    directors: 'مخرج',
    writers: 'كاتبون',
    screenplay: 'سيناريو',
    sources: 'مصادر البيانات',
    tmdb: 'TMDB',
    tvdb: 'TheTVDB.com',
  },
} as const;

for (const locale of Object.keys(locales) as (keyof typeof locales)[]) {
  test(`movie and TV details retain supplemental metadata in ${locale}`, async ({
    page,
  }, info) => {
    const copy = locales[locale];
    const capture = process.env.LUMEN_VIDEO_METADATA_CAPTURE_DIR;
    const captureOnly = process.env.LUMEN_VIDEO_METADATA_CAPTURE_ONLY === '1';
    const metadata = {
      metadataSources: [
        {
          source: 'tvdb',
          url: 'javascript:alert(1)',
          license: 'Unsafe fixture',
          fetchedAt: '2026-11-26T00:00:00.000Z',
          stale: false,
        },
        {
          source: 'tmdb',
          url: 'https://www.themoviedb.org/tv/42',
          fetchedAt: '2026-11-26T00:00:00.000Z',
          stale: false,
        },
      ],
      supplementalMetadata: {
        posterUrl: undefined,
        genres: [],
        studios: [],
        networks: [],
        directors: ['Fixture Director', 'Fixture Crew Member'],
        writers: ['Fixture Writer'],
      },
    };
    await page.route('https://**/*', (route) => route.abort());
    await page.route('**/lumen-config.json', (route) =>
      route.fulfill({ json: {} })
    );
    await page.route('**/api/v1/**', (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname
        .replace(/^\/lumen(?=\/)/, '')
        .replace(/^.*\/api\/v1/, '');
      if (path === '/auth/me')
        return route.fulfill({
          json: { id: 17, displayName: 'Viewer', permissions: 0 },
        });
      if (path === '/settings/public')
        return route.fulfill({
          json: { initialized: true, enableSpecialEpisodes: true },
        });
      if (path === '/user/17/settings/main')
        return route.fulfill({ json: { locale } });
      if (path === '/movie/550')
        return route.fulfill({
          json: {
            id: 550,
            title: 'Fixture Film',
            overview: 'A film fixture.',
            releaseDate: '2020-01-01',
            originalLanguage: 'en',
            genres: [
              { id: 18, name: 'Drama' },
              { id: 35, name: 'Comedy' },
            ],
            productionCompanies: [],
            productionCountries: [],
            credits: {
              cast: [],
              crew: [
                { id: 31, name: 'Fixture Crew Member', job: 'Director' },
                { id: 32, name: 'Fixture Screenplay', job: 'Screenplay' },
              ],
            },
            keywords: [],
            mediaInfo: {},
            ...metadata,
          },
        });
      if (path === '/tv/42' || path === '/tv/43')
        return route.fulfill({
          json: {
            id: path === '/tv/43' ? 43 : 42,
            name: 'Fixture Series',
            overview: 'A series fixture.',
            firstAirDate: '2020-01-01',
            lastAirDate: path === '/tv/43' ? '2020-01-01' : '2022-01-01',
            originalLanguage: 'en',
            productionCountries: [],
            productionCompanies: [
              { id: 8, name: 'Fixture Studio' },
              { id: 0, name: 'Unlinked Studio' },
            ],
            genres: [
              { id: 18, name: 'Drama' },
              { id: 35, name: 'Comedy' },
            ],
            networks: [],
            seasons: [
              { seasonNumber: 0, episodeCount: 12, name: 'Specials' },
              { seasonNumber: 1, episodeCount: 5, name: 'Season One' },
              { seasonNumber: 2, episodeCount: 0, name: 'Empty Season' },
              { seasonNumber: 3, episodeCount: 3, name: 'Season Three' },
            ],
            numberOfSeasons: 1,
            numberOfEpisodes: 8,
            episodeRunTime: [42],
            createdBy: [],
            status: 'Ended',
            type: 'Scripted',
            credits: {
              cast: [],
              crew: [{ id: 31, name: 'Fixture Crew Member', job: 'Director' }],
            },
            keywords: [],
            mediaInfo: {},
            ...metadata,
          },
        });
      return route.fulfill({ json: { results: [] } });
    });

    await page.goto(`${mount}/movie/550`);
    await expect(
      page.getByRole('heading', { name: 'Fixture Film' })
    ).toBeVisible();
    await page.getByText(copy.movie, { exact: true }).click();
    const drama = page.getByRole('link', { name: 'Drama', exact: true });
    const comedy = page.getByRole('link', { name: 'Comedy', exact: true });
    if (!captureOnly) {
      await expect(drama).toHaveAttribute('href', `${mount}/movies?genre=18`);
      await expect(comedy).toHaveAttribute('href', `${mount}/movies?genre=35`);
    }
    if (capture && ['desktop', 'iphone'].includes(info.project.name))
      await page.screenshot({
        path: `${capture}/${locale}-movie-${info.project.name}.png`,
        fullPage: true,
        animations: 'disabled',
      });
    if (!captureOnly) {
      await expect(page.getByText(copy.sources, { exact: true })).toBeVisible();
      await expect(
        page.getByText(copy.directors, { exact: true }).last()
      ).toBeVisible();
      await expect(page.getByText(copy.writers, { exact: true })).toBeVisible();
      await expect(page.getByText('Fixture Director')).toBeVisible();
      await expect(page.getByText('Fixture Writer')).toBeVisible();
      await expect(
        page.locator('#details dt').getByText(copy.screenplay, { exact: true })
      ).toBeVisible();
      await expect(
        page.getByRole('link', { name: 'Fixture Screenplay' })
      ).toHaveAttribute('href', `${mount}/person/32`);
      const tmdbLink = page.getByRole('link', { name: copy.tmdb });
      await expect(tmdbLink).toHaveAttribute(
        'href',
        'https://www.themoviedb.org/tv/42'
      );
      await expect(tmdbLink).toHaveAttribute('target', '_blank');
      await expect(tmdbLink).toHaveAttribute('rel', 'noreferrer');
      await expect(page.getByRole('link', { name: copy.tvdb })).toHaveCount(0);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth
        )
      ).toBe(true);
    }

    await page.goto(`${mount}/tv/42`);
    await expect(
      page.getByRole('heading', { name: 'Fixture Series' })
    ).toBeVisible();
    await page.getByText(copy.tv, { exact: true }).click();
    const studioLabel = page
      .locator('#details dt')
      .getByText(copy.studio, { exact: true });
    const fixtureStudio = page.getByRole('link', {
      name: 'Fixture Studio',
      exact: true,
    });
    const episodesLabel = page
      .locator('#details dt')
      .getByText(copy.episodes, { exact: true });
    if (!captureOnly) {
      await expect(studioLabel).toBeVisible();
      await expect(fixtureStudio).toHaveAttribute(
        'href',
        `${mount}/series?studio=8`
      );
      await expect(
        page.getByRole('link', { name: 'Unlinked Studio', exact: true })
      ).toHaveCount(0);
      await expect(episodesLabel).toBeVisible();
      await expect(episodesLabel.locator('..').locator('dd')).toHaveText('8');
    }
    const tvHeader = page.locator('.dtitle');
    if (!captureOnly) {
      await expect(tvHeader).toContainText(copy.seasonCount);
      await expect(page.locator('.actionbar')).toContainText(copy.seasonCount);
    }
    const tvDrama = tvHeader.getByRole('link', { name: 'Drama', exact: true });
    const tvComedy = tvHeader.getByRole('link', {
      name: 'Comedy',
      exact: true,
    });
    if (!captureOnly) {
      await expect(tvDrama).toHaveAttribute('href', `${mount}/series?genre=18`);
      await expect(tvComedy).toHaveAttribute(
        'href',
        `${mount}/series?genre=35`
      );
    }
    if (capture && ['desktop', 'iphone'].includes(info.project.name))
      await page.screenshot({
        path: `${capture}/${locale}-tv-${info.project.name}.png`,
        fullPage: true,
        animations: 'disabled',
      });
    if (!captureOnly) {
      await expect(page.getByText(copy.sources, { exact: true })).toBeVisible();
      await expect(
        page.getByText(copy.directors, { exact: true }).last()
      ).toBeVisible();
      await expect(page.getByText(copy.writers, { exact: true })).toBeVisible();
      await expect(page.getByText('Fixture Director')).toBeVisible();
      await expect(page.getByText('Fixture Writer')).toBeVisible();
      const lastAired = page
        .locator('#details dt')
        .getByText(copy.lastAired, { exact: true });
      await expect(lastAired.locator('..').locator('dd')).not.toBeEmpty();
      const tmdbLink = page.getByRole('link', { name: copy.tmdb });
      await expect(tmdbLink).toHaveAttribute(
        'href',
        'https://www.themoviedb.org/tv/42'
      );
      await expect(tmdbLink).toHaveAttribute('target', '_blank');
      await expect(tmdbLink).toHaveAttribute('rel', 'noreferrer');
      await expect(page.getByRole('link', { name: copy.tvdb })).toHaveCount(0);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth
        )
      ).toBe(true);

      await page.goto(`${mount}/tv/43`);
      await expect(
        page.getByRole('heading', { name: 'Fixture Series' })
      ).toBeVisible();
      await page.getByText(copy.tv, { exact: true }).click();
      await expect(
        page.locator('#details dt').getByText(copy.lastAired, { exact: true })
      ).toHaveCount(0);
    }
  });
}
