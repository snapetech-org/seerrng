import ExternalAPI from '@server/api/externalapi';
import { MediaType } from '@server/constants/media';
import { getSettings } from '@server/lib/settings';
import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';
import {
  loadMovieTvSortMetadata,
  sortMovieTvRequestRowsByMetadata,
} from './requestStatusSort';

const originalLocale = getSettings().main.locale;
afterEach(() => {
  mock.restoreAll();
  getSettings().main.locale = originalLocale;
});
const stubProvider = () => {
  const calls: string[] = [];
  mock.method(
    ExternalAPI.prototype as unknown as {
      get: (
        path: string,
        options: { params: { language: string } }
      ) => Promise<unknown>;
    },
    'get',
    async (path: string, options: { params: { language: string } }) => {
      calls.push(`${path}:${options.params.language}`);
      return {
        id: Number(path.split('/').at(-1)),
        title: options.params.language,
        vote_average: 0,
        popularity: 0,
        release_date: '2020-01-01',
        videos: {
          results: [{ type: 'Trailer', key: 'fixture', site: 'YouTube' }],
        },
      };
    }
  );
  return calls;
};
test('request metadata cache separates languages after a locale change', async () => {
  const calls = stubProvider();
  getSettings().main.locale = 'en';
  assert.equal(
    (await loadMovieTvSortMetadata(MediaType.MOVIE, 923001)).title,
    'en'
  );
  getSettings().main.locale = 'fr';
  assert.equal(
    (await loadMovieTvSortMetadata(MediaType.MOVIE, 923001)).title,
    'fr'
  );
  assert.deepEqual(calls, ['/movie/923001:en', '/movie/923001:fr']);
});
test('new metadata loads use the current provider locale', async () => {
  stubProvider();
  getSettings().main.locale = 'en';
  await loadMovieTvSortMetadata(MediaType.MOVIE, 923002);
  getSettings().main.locale = 'de';
  assert.equal(
    (await loadMovieTvSortMetadata(MediaType.MOVIE, 923003)).title,
    'de'
  );
});
test('concurrent metadata lookups share one provider request and retain real zero ratings', async () => {
  const calls = stubProvider();
  getSettings().main.locale = 'en';
  const values = await Promise.all(
    Array.from({ length: 12 }, () =>
      loadMovieTvSortMetadata(MediaType.MOVIE, 923004)
    )
  );
  assert.equal(calls.length, 1);
  assert(values.every((value) => value.rating === 0 && value.popularity === 0));
});
test('request history sorting orders the complete set without mutating rows', async () => {
  stubProvider();
  const rows = [3, 1, 2].map((id) => ({
    id,
    type: MediaType.MOVIE,
    media: { tmdbId: 923004 },
  }));
  assert.deepEqual(
    (await sortMovieTvRequestRowsByMetadata(rows, 'title', 'asc')).map(
      (row) => row.id
    ),
    [1, 2, 3]
  );
  assert.deepEqual(
    rows.map((row) => row.id),
    [3, 1, 2]
  );
});
