import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { MediaType } from '@server/constants/media';
import { watchlistFiltersSchema } from '@server/lib/watchlistFilters';

describe('watchlist filter query', () => {
  it('accepts bounded title, media type, and sort filters alongside pagination', () => {
    const result = watchlistFiltersSchema.safeParse({
      page: '2',
      search: '  Arrival  ',
      mediaType: MediaType.MOVIE,
      sortBy: 'title-asc',
    });

    assert.equal(result.success, true);
    if (result.success) {
      assert.deepEqual(result.data, {
        search: 'Arrival',
        mediaType: MediaType.MOVIE,
        sortBy: 'title-asc',
      });
    }
  });

  it('treats a blank title as no search filter', () => {
    const result = watchlistFiltersSchema.safeParse({ search: '  ' });

    assert.equal(result.success, true);
    if (result.success) {
      assert.deepEqual(result.data, {
        search: undefined,
      });
    }
  });

  it('rejects unsupported types, sort fields, repeated values, and long searches', () => {
    for (const query of [
      { mediaType: 'sports' },
      { sortBy: 'popularity.desc' },
      { search: ['one', 'two'] },
      { search: 'x'.repeat(101) },
    ]) {
      assert.equal(watchlistFiltersSchema.safeParse(query).success, false);
    }
  });
});
