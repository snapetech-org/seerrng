import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import TheMovieDb, {
  MAX_TMDB_DETAIL_CREDITS,
  MAX_TMDB_DETAIL_TEXT_LENGTH,
  MAX_TMDB_LOOKUP_RESULTS,
  MAX_TMDB_PAGE_RESULTS,
  MAX_TMDB_SEASON_EPISODES,
  sanitizeTmdbCertifications,
  sanitizeTmdbCombinedCredits,
  sanitizeTmdbGenres,
  sanitizeTmdbListResponse,
  sanitizeTmdbMovieDetails,
  sanitizeTmdbPagedResponse,
  sanitizeTmdbPersonDetails,
  sanitizeTmdbTvDetails,
} from '@server/api/themoviedb';
import type { TmdbSearchMovieResponse } from '@server/api/themoviedb/interfaces';
import { getSettings } from '@server/lib/settings';

describe('TMDB discover filter mapping', () => {
  it('maps fractional scores and provider exclusion to Movie and TV API parameters', async () => {
    const tmdb = new TheMovieDb();
    const calls: { path: string; params: Record<string, unknown> }[] = [];
    Object.defineProperty(tmdb, 'get', {
      configurable: true,
      value: async (
        path: string,
        options: { params?: Record<string, unknown> }
      ) => {
        calls.push({ path, params: options.params ?? {} });
        return { page: 1, results: [], total_pages: 1, total_results: 0 };
      },
    });

    await tmdb.getDiscoverMovies({
      voteAverageGte: '7.5',
      watchProviders: '8|9',
      watchRegion: 'CA',
    });
    await tmdb.getDiscoverTv({
      voteAverageLte: '8.4',
      withoutWatchProviders: '8|9',
      watchRegion: 'CA',
    });

    assert.deepStrictEqual(
      calls.map(({ path, params }) => ({
        path,
        minimum: params['vote_average.gte'],
        maximum: params['vote_average.lte'],
        include: params.with_watch_providers,
        exclude: params.without_watch_providers,
        region: params.watch_region,
      })),
      [
        {
          path: '/discover/movie',
          minimum: '7.5',
          maximum: undefined,
          include: '8|9',
          exclude: undefined,
          region: 'CA',
        },
        {
          path: '/discover/tv',
          minimum: undefined,
          maximum: '8.4',
          include: undefined,
          exclude: '8|9',
          region: 'CA',
        },
      ]
    );
  });
});

describe('TMDB response boundaries', () => {
  it('sanitizes mixed TMDB list pages without using total_results', () => {
    const response = sanitizeTmdbListResponse({
      page: 2,
      total_pages: 7,
      item_count: 127,
      total_results: 1,
      name: 'Public picks',
      description: 'Movies and series',
      providerOnly: 'discarded',
      results: [
        { id: 42, media_type: 'movie', title: 'Movie', providerOnly: true },
        { id: 42, media_type: 'tv', name: 'Series', providerOnly: true },
        { id: 4, media_type: 'person', name: 'Ignored result' },
        { id: -1, media_type: 'movie', title: 'Invalid ID' },
      ],
    });

    assert.strictEqual(response.page, 2);
    assert.strictEqual(response.total_pages, 7);
    assert.strictEqual(response.item_count, 127);
    assert.strictEqual(response.name, 'Public picks');
    assert.deepStrictEqual(
      response.results.map(({ id, media_type }) => [id, media_type]),
      [
        [42, 'movie'],
        [42, 'tv'],
      ]
    );
    assert.ok(!('providerOnly' in response.results[0]));
  });

  it('rejects list envelopes without item_count instead of trusting total_results', () => {
    assert.throws(
      () =>
        sanitizeTmdbListResponse({
          page: 1,
          total_pages: 1,
          total_results: 12,
          results: [],
        }),
      /Invalid TMDB list response/
    );
  });

  it('rejects list envelopes without a results array', () => {
    assert.throws(
      () =>
        sanitizeTmdbListResponse({
          page: 1,
          total_pages: 1,
          item_count: 12,
        }),
      /Invalid TMDB list response/
    );
  });

  it('requests v4 public lists with a validated ID and the selected page', async () => {
    const tmdb = new TheMovieDb();
    const calls: { path: string; config: Record<string, unknown> }[] = [];
    Object.defineProperty(tmdb, 'get', {
      configurable: true,
      value: async (path: string, config: Record<string, unknown>) => {
        calls.push({ path, config });
        return {
          page: 2,
          total_pages: 3,
          item_count: 51,
          name: 'My list',
          description: '',
          results: [],
        };
      },
    });

    const response = await tmdb.getTmdbList({
      listId: '123456789012',
      page: 2,
      language: 'fr',
    });

    assert.strictEqual(response.item_count, 51);
    assert.deepStrictEqual(calls, [
      {
        path: '/list/123456789012',
        config: {
          baseURL: 'https://api.themoviedb.org/4',
          params: { page: 2, language: 'fr' },
        },
      },
    ]);
  });

  it('rejects unsafe TMDB list IDs before making an upstream request', async () => {
    const tmdb = new TheMovieDb();
    let called = false;
    Object.defineProperty(tmdb, 'get', {
      configurable: true,
      value: async () => {
        called = true;
        return {};
      },
    });

    await assert.rejects(tmdb.getTmdbList({ listId: '1/../../2' }));
    assert.strictEqual(called, false);
  });

  it('uses the global adult-content setting for searches and movie discovery', async () => {
    const settings = getSettings();
    const originalIncludeAdult = settings.main.includeAdult;
    const calls: { path: string; params: Record<string, unknown> }[] = [];
    settings.main.includeAdult = true;

    try {
      const tmdb = new TheMovieDb();
      Object.defineProperty(tmdb, 'get', {
        configurable: true,
        value: async (
          path: string,
          options: { params?: Record<string, unknown> }
        ) => {
          calls.push({ path, params: options.params ?? {} });
          return { page: 1, results: [], total_pages: 1, total_results: 0 };
        },
      });

      await tmdb.searchMulti({ query: 'adult' });
      await tmdb.searchMovies({ query: 'adult' });
      await tmdb.searchTvShows({ query: 'adult' });
      await tmdb.getDiscoverMovies();

      assert.deepStrictEqual(
        calls.map(({ path, params }) => [path, params.include_adult]),
        [
          ['/search/multi', true],
          ['/search/movie', true],
          ['/search/tv', true],
          ['/discover/movie', true],
        ]
      );
    } finally {
      settings.main.includeAdult = originalIncludeAdult;
    }
  });

  it('uses TMDB native exclusion parameters for movie and TV discovery', async () => {
    const tmdb = new TheMovieDb();
    const calls: { path: string; params: Record<string, unknown> }[] = [];
    Object.defineProperty(tmdb, 'get', {
      configurable: true,
      value: async (
        path: string,
        options: { params?: Record<string, unknown> }
      ) => {
        calls.push({ path, params: options.params ?? {} });
        return { page: 1, results: [], total_pages: 1, total_results: 0 };
      },
    });

    await tmdb.getDiscoverMovies({
      genre: '18',
      excludeGenre: true,
      studio: '5',
      excludeStudio: true,
      withoutWatchProviders: '8|9',
    });
    await tmdb.getDiscoverTv({
      genre: '18',
      excludeGenre: true,
      withoutWatchProviders: '8|9',
    });

    assert.strictEqual(calls[0].path, '/discover/movie');
    assert.strictEqual(calls[0].params.with_genres, undefined);
    assert.strictEqual(calls[0].params.without_genres, '18');
    assert.strictEqual(calls[0].params.with_companies, undefined);
    assert.strictEqual(calls[0].params.without_companies, '5');
    assert.strictEqual(calls[0].params.with_watch_providers, undefined);
    assert.strictEqual(calls[0].params.without_watch_providers, '8|9');

    assert.strictEqual(calls[1].path, '/discover/tv');
    assert.strictEqual(calls[1].params.with_genres, undefined);
    assert.strictEqual(calls[1].params.without_genres, '18');
    assert.strictEqual(calls[1].params.with_watch_providers, undefined);
    assert.strictEqual(calls[1].params.without_watch_providers, '8|9');
  });

  it('normalizes paginated envelopes and caps actual provider results', () => {
    const response = sanitizeTmdbPagedResponse<TmdbSearchMovieResponse>({
      page: -1,
      total_pages: 'invalid',
      total_results: -1,
      unexpectedProviderField: 'not-public',
      results: [
        null,
        ...Array.from({ length: MAX_TMDB_PAGE_RESULTS + 100 }, (_, index) => ({
          id: index + 1,
          providerOnly: true,
        })),
      ],
    });

    assert.strictEqual(response.page, 1);
    assert.strictEqual(response.total_pages, 1);
    assert.strictEqual(response.total_results, 0);
    assert.strictEqual(response.results.length, MAX_TMDB_PAGE_RESULTS - 1);
    assert.ok(!('unexpectedProviderField' in response));
    assert.ok(!('providerOnly' in (response.results[0] ?? {})));
  });

  it('caps season episodes without mutating the cached provider response', async () => {
    const tmdb = new TheMovieDb();
    const firstEpisode = { id: 1, still_path: '/still.jpg' };
    const providerResponse = {
      id: 10,
      episodes: [
        firstEpisode,
        ...Array.from(
          { length: MAX_TMDB_SEASON_EPISODES + 100 },
          (_, index) => ({ id: index + 2, still_path: null })
        ),
      ],
    };
    Object.defineProperty(tmdb, 'get', {
      configurable: true,
      value: async () => providerResponse,
    });

    const response = await tmdb.getTvSeason({ tvId: 1, seasonNumber: 1 });

    assert.strictEqual(response.episodes.length, MAX_TMDB_SEASON_EPISODES);
    assert.strictEqual(
      response.episodes[0].still_path,
      'https://image.tmdb.org/t/p/original/still.jpg'
    );
    assert.strictEqual(firstEpisode.still_path, '/still.jpg');
  });

  it('caps collection parts and removes unknown top-level fields', async () => {
    const tmdb = new TheMovieDb();
    Object.defineProperty(tmdb, 'get', {
      configurable: true,
      value: async () => ({
        id: 1,
        name: 'Collection',
        unexpectedProviderField: 'not-public',
        parts: Array.from(
          { length: MAX_TMDB_LOOKUP_RESULTS + 100 },
          (_, index) => ({ id: index + 1, providerOnly: true })
        ),
      }),
    });

    const response = await tmdb.getCollection({ collectionId: 1 });

    assert.strictEqual(response.parts.length, MAX_TMDB_LOOKUP_RESULTS);
    assert.ok(!('unexpectedProviderField' in response));
    assert.ok(!('providerOnly' in (response.parts[0] ?? {})));
  });

  it('rejects unsafe external IDs before constructing provider paths', async () => {
    const tmdb = new TheMovieDb();
    let calls = 0;
    Object.defineProperty(tmdb, 'get', {
      configurable: true,
      value: async () => {
        calls += 1;
        return {};
      },
    });

    await assert.rejects(
      tmdb.getByExternalId({ externalId: '../unsafe', type: 'imdb' }),
      /Invalid external media ID/
    );
    await assert.rejects(
      tmdb.getByExternalId({ externalId: -1, type: 'tvdb' }),
      /Invalid external media ID/
    );
    assert.strictEqual(calls, 0);
  });

  it('bounds movie detail collections and supplies safe nested envelopes', () => {
    const response = sanitizeTmdbMovieDetails({
      overview: 'x'.repeat(MAX_TMDB_DETAIL_TEXT_LENGTH + 10),
      credits: {
        cast: Array.from({ length: MAX_TMDB_DETAIL_CREDITS + 10 }, (_, id) => ({
          id,
          name: 'x'.repeat(2_000),
          providerOnly: { deeply: 'nested' },
        })),
        crew: null,
      },
      videos: {
        results: Array.from({ length: 150 }, (_, id) => ({
          id: String(id),
          key: `video-${id}`,
          site: 'YouTube',
          type: 'Trailer',
        })),
      },
      keywords: null,
      release_dates: {
        results: [{ release_dates: Array.from({ length: 150 }, () => ({})) }],
      },
      'watch/providers': {
        results: Object.fromEntries(
          Array.from({ length: 300 }, (_, id) => [
            `region-${id}`,
            { buy: Array.from({ length: 150 }, () => ({})) },
          ])
        ),
      },
    });

    assert.strictEqual(response.overview?.length, MAX_TMDB_DETAIL_TEXT_LENGTH);
    assert.strictEqual(response.credits.cast.length, MAX_TMDB_DETAIL_CREDITS);
    assert.strictEqual(response.credits.cast[0].name.length, 1_000);
    assert.ok(!('providerOnly' in response.credits.cast[0]));
    assert.deepStrictEqual(response.credits.crew, []);
    assert.strictEqual(response.videos.results.length, 100);
    assert.deepStrictEqual(response.keywords.keywords, []);
    assert.strictEqual(
      response.release_dates.results[0].release_dates.length,
      100
    );
    assert.strictEqual(
      Object.keys(response['watch/providers']?.results ?? {}).length,
      250
    );
  });

  it('drops TV aggregate cast without usable roles and caps valid credits', () => {
    const response = sanitizeTmdbTvDetails({
      aggregate_credits: {
        cast: [
          null,
          { id: 1, roles: null },
          ...Array.from({ length: MAX_TMDB_DETAIL_CREDITS + 10 }, (_, id) => ({
            id: id + 2,
            roles: [{ character: 'Role' }],
          })),
        ],
      },
      credits: null,
      content_ratings: null,
    });

    assert.strictEqual(
      response.aggregate_credits.cast.length,
      MAX_TMDB_DETAIL_CREDITS - 2
    );
    assert.deepStrictEqual(response.credits.crew, []);
    assert.deepStrictEqual(response.content_ratings.results, []);
  });

  it('bounds person aliases, biography, and combined credits', () => {
    const person = sanitizeTmdbPersonDetails({
      biography: 'x'.repeat(MAX_TMDB_DETAIL_TEXT_LENGTH + 1),
      also_known_as: Array.from({ length: 150 }, (_, id) => `Alias ${id}`),
      providerOnly: 'not-public',
    });
    const credits = sanitizeTmdbCombinedCredits({
      id: 1,
      cast: Array.from({ length: MAX_TMDB_DETAIL_CREDITS + 1 }, (_, id) => ({
        id,
        origin_country: Array.from({ length: 50 }, () => 'US'),
      })),
      crew: null,
    });

    assert.strictEqual(person.biography.length, MAX_TMDB_DETAIL_TEXT_LENGTH);
    assert.strictEqual(person.also_known_as?.length, 100);
    assert.ok(!('providerOnly' in person));
    assert.strictEqual(credits.cast.length, MAX_TMDB_DETAIL_CREDITS);
    assert.strictEqual(credits.cast[0].origin_country.length, 25);
    assert.deepStrictEqual(credits.crew, []);
  });

  it('bounds genre and certification configuration payloads', () => {
    const genres = sanitizeTmdbGenres({
      genres: [
        null,
        { id: 'bad', name: 'Bad' },
        ...Array.from({ length: 600 }, (_, id) => ({
          id,
          name: `Genre ${id}`,
          providerOnly: true,
        })),
      ],
    });
    const certifications = sanitizeTmdbCertifications({
      certifications: Object.fromEntries(
        Array.from({ length: 300 }, (_, country) => [
          `country-${country}`,
          Array.from({ length: 150 }, (_, id) => ({
            certification: `Rating ${id}`,
            providerOnly: true,
          })),
        ])
      ),
    });

    assert.strictEqual(genres.length, MAX_TMDB_LOOKUP_RESULTS - 2);
    assert.deepStrictEqual(genres[0], { id: 0, name: 'Genre 0' });
    assert.strictEqual(Object.keys(certifications.certifications).length, 250);
    assert.strictEqual(
      Object.values(certifications.certifications)[0]?.length,
      100
    );
  });
});
