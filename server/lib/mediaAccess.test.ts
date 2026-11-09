import TheMovieDb from '@server/api/themoviedb';
import type { TmdbTvDetails } from '@server/api/themoviedb/interfaces';
import { MediaType } from '@server/constants/media';
import { User } from '@server/entity/User';
import { UserSettings } from '@server/entity/UserSettings';
import assert from 'node:assert/strict';
import { afterEach, it, mock } from 'node:test';
import { filterRestrictedPayload } from './contentRestriction';
import { filterMediaCategories, mayAccessVideo } from './mediaAccess';

afterEach(() => mock.restoreAll());

it('cross-media envelopes filter category aliases without bypassing serialization', () => {
  const user = new User({
    id: 2,
    permissions: 0,
    password: 'must-never-be-serialized',
    plexToken: 'private-token',
  });
  user.settings = new UserSettings({
    enabledMediaCategories: { movie: false, ebook: false, audiobook: false },
  });
  const date = new Date('2026-11-09T00:00:00Z');
  const result = filterMediaCategories(user, {
    user,
    date,
    cards: [{ mediaType: 'movie' }, { kind: 'manga' }, { mediaType: 'tv' }],
    nested: { mediaType: 'book' },
  });
  const serialized = JSON.parse(JSON.stringify(result.payload));
  assert.deepEqual(serialized.cards, [{ mediaType: 'tv' }]);
  assert.equal(serialized.nested, null);
  assert.equal(serialized.date, date.toISOString());
  assert.equal(serialized.user.password, undefined);
  assert.equal(serialized.user.plexToken, undefined);
  assert.equal(
    filterMediaCategories(user, { mediaType: 'movie' }).blocked,
    true
  );
  const restricted = filterRestrictedPayload(
    {
      maxMovieCertification: 'PG',
      maxTvCertification: 'TV-PG',
      certificationCountry: 'US',
    },
    {
      user,
      date,
      cards: [
        { isAdult: true },
        { tags: [{ name: 'Hentai' }] },
        { title: 'Allowed' },
      ],
    }
  );
  const safe = JSON.parse(JSON.stringify(restricted.payload));
  assert.deepEqual(safe.cards, [{ title: 'Allowed' }]);
  assert.equal(safe.date, date.toISOString());
  assert.equal(safe.user.password, undefined);
});

it('playback and helper video admission fail closed on unavailable, mismatched or excessive ratings', async () => {
  const user = new User({ id: 2, permissions: 0 });
  user.settings = new UserSettings({ tvMaturityRatingLimit: 'TV-PG' });
  const details = (id: number, rating?: string) =>
    ({
      id,
      content_ratings: {
        results: rating ? [{ iso_3166_1: 'US', rating }] : [],
      },
    }) as TmdbTvDetails;
  assert.equal(
    await mayAccessVideo(user, MediaType.TV, 1, details(1, 'TV-PG')),
    true
  );
  for (const item of [details(1, 'TV-MA'), details(1), details(2, 'TV-G')])
    assert.equal(await mayAccessVideo(user, MediaType.TV, 1, item), false);
  mock.method(
    TheMovieDb.prototype as unknown as { get: () => Promise<never> },
    'get',
    async () => {
      throw new Error('offline');
    }
  );
  assert.equal(await mayAccessVideo(user, MediaType.TV, 1), false);
  user.settings.enabledMediaCategories = { tv: false };
  assert.equal(
    await mayAccessVideo(user, MediaType.TV, 1, details(1, 'TV-G')),
    false
  );
});
