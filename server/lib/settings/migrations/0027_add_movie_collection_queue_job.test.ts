import { describe, expect, it } from 'vitest';
import addMovieCollectionQueueJob from './0027_add_movie_collection_queue_job';

describe('movie collection queue job settings migration', () => {
  it('adds the regular sync schedule and preserves an operator schedule', () => {
    const defaults = addMovieCollectionQueueJob({
      jobs: {},
      migrations: [],
    });
    expect(defaults.jobs['movie-collection-queue']).toEqual({
      schedule: '0 * * * * *',
    });

    const customized = addMovieCollectionQueueJob({
      jobs: {
        'movie-collection-queue': {
          schedule: '0 30 * * * *',
          enabled: false,
        },
      },
      migrations: [],
    });
    expect(customized.jobs['movie-collection-queue']).toEqual({
      schedule: '0 30 * * * *',
      enabled: false,
    });
  });

  it('does not reapply a recorded migration', () => {
    const migrated = {
      jobs: {},
      migrations: ['0027_add_movie_collection_queue_job'],
    };
    expect(addMovieCollectionQueueJob(migrated)).toBe(migrated);
  });
});
