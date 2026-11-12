import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import type { ComicVineVolumeResult } from '@server/api/comicvine';
import { buildComicSearchResults } from '@server/lib/comicSearchResults';
import {
  clearMangaSearchCaches,
  getMangaVolumeHint,
} from '@server/lib/mangaSearch';

const volume = (
  id: number,
  name: string,
  publisher: string,
  count: number
): ComicVineVolumeResult => ({
  id,
  name,
  publisher: { id: 1, name: publisher },
  count_of_issues: count,
  image: { super_url: `https://comicvine.gamespot.com/a/uploads/${id}.jpg` },
  resource_type: 'volume',
});

const noComicVine = {
  searchVolumes: async () => {
    throw new Error('unexpected ComicVine search');
  },
};
const noMedia = async () => new Map();

describe('buildComicSearchResults', () => {
  beforeEach(() => clearMangaSearchCaches());

  it('puts a strongly matched manga first as its English edition with the AniList cover', async () => {
    const { results, mangaResults } = await buildComicSearchResults({
      query: 'oshi no ko',
      page: 1,
      comicVine: noComicVine,
      volumes: [
        volume(168741, 'Oshi no Ko', 'Editorial Ivrea', 16),
        volume(132980, '【Oshi no Ko】', 'Shueisha', 16),
        volume(147500, '[Oshi No Ko]', 'Yen Press', 13),
      ],
      searchAnilist: async () => [
        {
          id: 117195,
          format: 'MANGA',
          popularity: 107975,
          title: { romaji: '[Oshi no Ko]', english: '[Oshi no Ko]' },
          coverImage: { extraLarge: 'https://s4.anilist.co/file/oshi.jpg' },
        },
      ],
      findMedia: noMedia,
    });
    assert.deepEqual(
      results.map((r) => r.id),
      ['147500', '168741', '132980']
    );
    assert.equal(mangaResults, 0);
    assert.deepEqual(
      {
        title: results[0].title,
        posterPath: results[0].posterPath,
        label: results[0].label,
        manga: results[0].manga,
        anilistId: results[0].anilistId,
      },
      {
        title: '[Oshi no Ko]',
        posterPath: 'https://s4.anilist.co/file/oshi.jpg',
        label: 'Manga · English edition · Yen Press · 13 vols',
        manga: true,
        anilistId: 117195,
      }
    );
    assert.equal(
      results[2].label,
      'Manga · Japanese edition · Shueisha · 16 vols'
    );
    assert.equal(results[1].manga, undefined);
    assert.equal(getMangaVolumeHint(132980) !== undefined, true);
  });

  it('keeps Western comic results when AniList fails or has nothing', async () => {
    const { results } = await buildComicSearchResults({
      query: 'saga',
      page: 1,
      comicVine: noComicVine,
      volumes: [volume(46568, 'Saga', 'Image', 72)],
      searchAnilist: async () => {
        throw new Error('AniList down');
      },
      findMedia: noMedia,
    });
    assert.deepEqual(
      results.map((r) => [r.id, r.manga]),
      [['46568', undefined]]
    );
  });

  it('only searches AniList on the first page', async () => {
    let anilistCalls = 0;
    await buildComicSearchResults({
      query: 'batman',
      page: 2,
      comicVine: noComicVine,
      volumes: [volume(796, 'Batman', 'DC Comics', 700)],
      searchAnilist: async () => {
        anilistCalls++;
        return [];
      },
      findMedia: noMedia,
    });
    assert.equal(anilistCalls, 0);
  });
});
