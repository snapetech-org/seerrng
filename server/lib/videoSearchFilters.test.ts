import type TheMovieDb from '@server/api/themoviedb';
import type {
  TmdbMovieDetails,
  TmdbTvDetails,
} from '@server/api/themoviedb/interfaces';
import { expect, it, vi } from 'vitest';
import {
  filterVideoSearchResults,
  matchesVideoListFilter,
  matchesVideoSearchFilters,
} from './videoSearchFilters';

const movie = {
  title: 'Example',
  release_date: '2020-06-10',
  runtime: 100,
  genres: [{ id: 18 }],
  production_companies: [{ id: 5 }],
  origin_country: ['US'],
  original_language: 'en',
  vote_average: 8,
  vote_count: 900,
  keywords: { keywords: [{ id: 42 }] },
  release_dates: {
    results: [{ iso_3166_1: 'US', release_dates: [{ certification: 'PG' }] }],
  },
  'watch/providers': { results: { US: { flatrate: [{ provider_id: 8 }] } } },
} as TmdbMovieDetails;
it('applies movie filters together to fresh metadata', () => {
  expect(
    matchesVideoSearchFilters(movie, {
      genre: '18',
      studio: '5',
      country: 'US',
      language: 'en',
      primaryReleaseDateGte: '2020-01-01',
      primaryReleaseDateLte: '2020-12-31',
      keywords: '42',
      withRuntimeLte: '110',
      voteAverageGte: '7',
      watchProviders: '8',
      certification: 'PG',
    })
  ).toBe(true);
  for (const filters of [
    { genre: '35' },
    { studio: '6' },
    { country: 'CA' },
    { language: 'es' },
    { primaryReleaseDateLte: '2019-12-31' },
    { excludeKeywords: '42' },
    { withRuntimeGte: '120' },
    { voteAverageGte: '9' },
    { watchProviders: '9' },
    { certification: 'R' },
  ])
    expect(matchesVideoSearchFilters(movie, filters)).toBe(false);
});
it('uses TV status, network and first-air-date constraints', () => {
  const tv = {
    name: 'Example',
    first_air_date: '2018-06-01',
    networks: [{ id: 4 }],
    status: 'Ended',
  } as TmdbTvDetails;
  expect(
    matchesVideoSearchFilters(tv, {
      status: '3',
      network: '4',
      firstAirDateGte: '2018-01-01',
    })
  ).toBe(true);
  expect(matchesVideoSearchFilters(tv, { status: '0' })).toBe(false);
});
it('applies fractional ratings and provider exclusion to combined searches', () => {
  expect(
    matchesVideoSearchFilters(movie, {
      voteAverageGte: '7.5',
      watchProviders: '8',
      watchProviderMode: 'exclude',
    })
  ).toBe(false);
  expect(
    matchesVideoSearchFilters(movie, {
      voteAverageGte: '7.5',
      watchProviders: '9',
      watchProviderMode: 'exclude',
    })
  ).toBe(true);
  expect(
    matchesVideoSearchFilters(movie, {
      voteAverageGte: '8.1',
      watchProviders: '9',
      watchProviderMode: 'exclude',
    })
  ).toBe(false);
});

it('excludes matching video genres, studios, and TV statuses', () => {
  expect(matchesVideoListFilter('18', [18], true)).toBe(false);
  expect(matchesVideoListFilter('18', [35], true)).toBe(true);
  expect(matchesVideoListFilter('18', [18])).toBe(true);

  expect(
    matchesVideoSearchFilters(movie, {
      genre: '18',
      excludeGenre: 'true',
    })
  ).toBe(false);
  expect(
    matchesVideoSearchFilters(movie, {
      genre: '35',
      excludeGenre: 'true',
    })
  ).toBe(true);
  expect(
    matchesVideoSearchFilters(movie, {
      studio: '5',
      excludeStudio: 'true',
    })
  ).toBe(false);
  expect(
    matchesVideoSearchFilters(movie, {
      studio: '6',
      excludeStudio: 'true',
    })
  ).toBe(true);

  const endedSeries = {
    name: 'Ended Example',
    first_air_date: '2018-06-01',
    status: 'Ended',
  } as TmdbTvDetails;
  const unknownStatus = {
    ...endedSeries,
    status: 'Continuing',
  } as TmdbTvDetails;
  expect(
    matchesVideoSearchFilters(endedSeries, {
      status: '3',
      excludeStatus: 'true',
    })
  ).toBe(false);
  expect(
    matchesVideoSearchFilters(endedSeries, {
      status: '2',
      excludeStatus: 'true',
    })
  ).toBe(true);
  expect(
    matchesVideoSearchFilters(unknownStatus, {
      status: '3',
      excludeStatus: 'true',
    })
  ).toBe(true);
});

it('fetches server metadata only for combined title searches, preserving result IDs', async () => {
  const getMovie = vi
    .fn()
    .mockResolvedValueOnce(movie)
    .mockResolvedValueOnce({ ...movie, genres: [{ id: 35 }] });
  const tmdb = { getMovie } as unknown as TheMovieDb;
  const results = [{ id: 1 }, { id: 2 }];
  expect(
    await filterVideoSearchResults(tmdb, 'movie', results, {
      search: 'example',
      genre: '18',
    })
  ).toEqual([{ id: 1 }]);
  expect(getMovie).toHaveBeenCalledTimes(2);
  expect(
    await filterVideoSearchResults(tmdb, 'movie', results, { genre: '18' })
  ).toBe(results);
});
it('does not disguise provider failures as no matches', async () => {
  const tmdb = {
    getMovie: vi.fn().mockRejectedValue(new Error('unavailable')),
  } as unknown as TheMovieDb;
  await expect(
    filterVideoSearchResults(tmdb, 'movie', [{ id: 1 }], {
      search: 'example',
      genre: '18',
    })
  ).rejects.toThrow('unavailable');
});
