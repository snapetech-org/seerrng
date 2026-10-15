import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TMDB_RATING_MINIMUM_VOTES,
  countActiveFilters,
  prepareFilterValues,
  withDefaultTmdbRatingMinimumVotes,
} from './constants';

describe('TMDB rating vote-count defaults', () => {
  it('uses a fifty-vote minimum when sorting by rating', () => {
    expect(
      withDefaultTmdbRatingMinimumVotes({ sortBy: 'vote_average.desc' })
    ).toEqual({
      sortBy: 'vote_average.desc',
      voteCountGte: DEFAULT_TMDB_RATING_MINIMUM_VOTES,
    });
  });

  it('preserves an explicit choice to include any vote count', () => {
    const filters = prepareFilterValues({
      sortBy: 'vote_average.asc',
      voteCountGte: '0',
    });

    expect(withDefaultTmdbRatingMinimumVotes(filters)).toEqual({
      sortBy: 'vote_average.asc',
      voteCountGte: '0',
    });
  });

  it('does not add the rating default to other sorts', () => {
    expect(
      withDefaultTmdbRatingMinimumVotes({ sortBy: 'popularity.desc' })
    ).toEqual({ sortBy: 'popularity.desc' });
  });
});

describe('Discover provider and rating filters', () => {
  it('preserves fractional rating thresholds and provider exclusion in URL state', () => {
    expect(
      prepareFilterValues({
        voteAverageGte: '7.5',
        voteAverageLte: '9.2',
        watchProviders: '8|9',
        watchProviderMode: 'exclude',
        watchRegion: 'CA',
      })
    ).toEqual({
      voteAverageGte: '7.5',
      voteAverageLte: '9.2',
      watchProviders: '8|9',
      watchProviderMode: 'exclude',
      watchRegion: 'CA',
    });
  });

  it('keeps existing integer URLs and drops malformed score bounds safely', () => {
    expect(prepareFilterValues({ voteAverageGte: '8' })).toEqual({
      voteAverageGte: '8',
    });
    expect(prepareFilterValues({ voteAverageGte: '10.1' })).toEqual({});
    expect(prepareFilterValues({ voteAverageLte: '-0.1' })).toEqual({});
    expect(
      prepareFilterValues({
        watchProviders: '8',
        watchProviderMode: 'unknown',
      })
    ).toEqual({ watchProviders: '8' });
  });

  it('counts provider inclusion or exclusion as one active filter', () => {
    expect(
      countActiveFilters({
        watchProviders: '8|9',
        watchProviderMode: 'exclude',
        watchRegion: 'CA',
      })
    ).toBe(1);
  });
});
