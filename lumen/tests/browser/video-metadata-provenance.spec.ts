import { expect, test } from '@playwright/test';

const mount = process.env.LUMEN_TEST_MOUNT === '/lumen' ? '/lumen' : '';
const locales = {
  en: {
    movie: 'Movie Details',
    tv: 'Series Details',
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
        return route.fulfill({ json: { initialized: true } });
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
            genres: [],
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
      if (path === '/tv/42')
        return route.fulfill({
          json: {
            id: 42,
            name: 'Fixture Series',
            overview: 'A series fixture.',
            firstAirDate: '2020-01-01',
            lastAirDate: '2022-01-01',
            originalLanguage: 'en',
            productionCountries: [],
            genres: [],
            networks: [],
            seasons: [],
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
  });
}
