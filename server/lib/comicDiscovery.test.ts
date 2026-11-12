import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import type { AnilistMangaSearchResult } from '@server/api/anilist';
import type { ComicVineVolumeResult } from '@server/api/comicvine';
import type Media from '@server/entity/Media';
import {
  browseMangaWorks,
  buildComicLanding,
  buildComicWorkSearch,
  clearComicDiscoveryCaches,
  listComicLibrary,
  scoreMangaHits,
} from '@server/lib/comicDiscovery';
import {
  clearComicWorkCaches,
  getWorkForEdition,
  type ComicWork,
} from '@server/lib/comicWorks';
import { clearMangaSearchCaches } from '@server/lib/mangaSearch';

const volume = (
  id: number,
  name: string,
  publisher: string,
  year: number,
  count: number
): ComicVineVolumeResult => ({
  id,
  name,
  publisher: { id: 1, name: publisher },
  start_year: String(year),
  count_of_issues: count,
  resource_type: 'volume',
});

const CHAINSAW = [
  volume(130799, 'Chainsaw Man', 'Viz', 2020, 21),
  volume(117318, 'Chainsaw Man', 'Shueisha', 2019, 24),
  volume(52125, 'Chainsaw Vigilante', 'New England Comics', 1993, 3),
  volume(155485, 'Chainsaw Man', 'Norma Editorial', 2020, 21),
  volume(167946, 'Chainsaw Man', 'Crunchyroll SAS', 2020, 21),
  volume(25446, 'Texas Chainsaw Massacre', 'DC Comics', 2007, 6),
];
const chainsawMan: AnilistMangaSearchResult = {
  id: 105778,
  format: 'MANGA',
  popularity: 337297,
  title: { romaji: 'Chainsaw Man', english: 'Chainsaw Man' },
  startDate: { year: 2018 },
  coverImage: { extraLarge: 'https://s4.anilist.co/file/csm.jpg' },
};
const buddyStories: AnilistMangaSearchResult = {
  id: 138829,
  format: 'NOVEL',
  popularity: 7986,
  title: { english: 'Chainsaw Man: Buddy Stories' },
};
const noComicVine = {
  searchVolumes: async () => {
    throw new Error('unexpected ComicVine search');
  },
};
const media = (id: number, status: number) =>
  ({ id, status, downloadStatus: [] }) as unknown as Media;

const reset = () => {
  clearComicWorkCaches();
  clearComicDiscoveryCaches();
  clearMangaSearchCaches();
};

describe('buildComicWorkSearch (global search)', () => {
  beforeEach(reset);

  it('answers one card per work, the named manga first', async () => {
    let anilistCalls = 0;
    const { results } = await buildComicWorkSearch({
      query: 'chainsaw',
      page: 1,
      comicVine: noComicVine,
      volumes: CHAINSAW,
      searchAnilist: async () => {
        anilistCalls++;
        return [chainsawMan, buddyStories];
      },
      findMedia: async () => new Map([[155485, media(1, 3)]]),
    });
    assert.equal(anilistCalls, 1, 'one AniList call for hits and editions');
    assert.deepEqual(
      results.map((w) => w.id),
      ['al-105778', '52125', '25446']
    );
    const csm = results[0];
    assert.equal(csm.recommendedId, '130799');
    assert.equal(csm.editions.length, 4);
    // the Spanish edition is requested: the work shows it
    assert.equal(csm.mediaEditionId, '155485');
    assert.equal(csm.mediaInfo?.status, 3);
    assert.equal(getWorkForEdition(117318)?.id, 'al-105778');
  });

  it('spends one ComicVine search on a named manga whose English edition is missing', async () => {
    let searches = 0;
    const { results } = await buildComicWorkSearch({
      query: 'chainsaw man',
      page: 1,
      comicVine: {
        searchVolumes: async () => {
          searches++;
          return {
            error: 'OK',
            limit: 20,
            offset: 0,
            number_of_page_results: 1,
            number_of_total_results: 1,
            status_code: 1,
            results: [volume(130799, 'Chainsaw Man', 'Viz', 2020, 21)],
          };
        },
      },
      volumes: CHAINSAW.filter((v) => v.id !== 130799),
      searchAnilist: async () => [chainsawMan],
      findMedia: async () => new Map(),
    });
    assert.equal(searches, 1);
    assert.equal(results[0].recommendedId, '130799');
    assert.equal(results[0].editions[0].publisher, 'Viz');
  });

  it('still answers ComicVine works when AniList fails', async () => {
    const { results } = await buildComicWorkSearch({
      query: 'chainsaw',
      page: 1,
      comicVine: noComicVine,
      volumes: CHAINSAW,
      searchAnilist: async () => {
        throw new Error('AniList down');
      },
      findMedia: async () => new Map(),
    });
    // grouped by title without AniList: the Chainsaw Man editions still fold
    assert.equal(results.filter((w) => w.title === 'Chainsaw Man').length, 1);
    assert.equal(results.length, 3);
  });

  it('scores AniList hits, manga formats only', () => {
    const hits = scoreMangaHits('chainsaw', [chainsawMan, buddyStories]);
    assert.deepEqual(
      hits.map((h) => [h.media.id, h.strength]),
      [[105778, 2]]
    );
  });
});

const trending: AnilistMangaSearchResult[] = [
  {
    id: 30013,
    format: 'MANGA',
    status: 'RELEASING',
    genres: ['Action', 'Adventure'],
    title: { english: 'One Piece', romaji: 'ONE PIECE' },
    startDate: { year: 1997 },
    coverImage: { large: 'https://s4.anilist.co/file/op.jpg' },
  },
  {
    id: 117195,
    format: 'MANGA',
    status: 'FINISHED',
    title: { english: '[Oshi no Ko]', romaji: '[Oshi no Ko]' },
    startDate: { year: 2020 },
  },
];

const libraryWork = (over: Partial<ComicWork> = {}): ComicWork => ({
  id: '147500',
  mediaType: 'comic',
  kind: 'manga',
  title: '[Oshi No Ko]',
  editions: [
    {
      id: '147500',
      title: '[Oshi No Ko]',
      publisher: 'Yen Press',
      language: 'en',
    },
  ],
  editionsResolved: false,
  recommendedId: '147500',
  mediaInfo: media(7, 5),
  mediaEditionId: '147500',
  ...over,
});

describe('browseMangaWorks', () => {
  beforeEach(reset);

  it('maps the AniList sort and filters, and marks what the library has', async () => {
    let asked: unknown;
    const { results, hasNextPage } = await browseMangaWorks({
      sort: 'newest',
      genres: ['Action'],
      status: 'RELEASING',
      page: 2,
      library: [libraryWork()],
      browse: async (options) => {
        asked = options;
        return { hasNextPage: true, media: trending };
      },
      findMedia: async () => new Map(),
    });
    assert.deepEqual(asked, {
      page: 2,
      perPage: 20,
      sort: 'START_DATE_DESC',
      genres: ['Action'],
      status: 'RELEASING',
      minPopularity: 1000,
    });
    assert.equal(hasNextPage, true);
    assert.deepEqual(
      results.map((w) => [w.id, w.status, w.editionsResolved]),
      [
        ['al-30013', 'ongoing', false],
        ['al-117195', 'finished', false],
      ]
    );
    assert.equal(results[0].posterPath, 'https://s4.anilist.co/file/op.jpg');
    assert.deepEqual(results[0].genres, ['Action', 'Adventure']);
    // matched by title: the library's Yen Press edition
    assert.equal(results[1].mediaInfo?.status, 5);
    assert.equal(results[1].mediaEditionId, '147500');
    assert.equal(results[0].mediaInfo, undefined);
  });
});

describe('buildComicLanding', () => {
  beforeEach(reset);

  it('builds the sections, caches AniList and survives a failing one', async () => {
    let calls = 0;
    const browse = async (options?: { sort?: string }) => {
      calls++;
      if (options?.sort === 'START_DATE_DESC') throw new Error('AniList down');
      return { hasNextPage: true, media: trending };
    };
    const landing = await buildComicLanding({
      library: [libraryWork()],
      browse,
      western: async () => [
        {
          id: '46568',
          mediaType: 'comic',
          kind: 'comic',
          title: 'Saga',
          editions: [{ id: '46568', title: 'Saga', publisher: 'Image' }],
          editionsResolved: true,
          recommendedId: '46568',
        },
      ],
      findMedia: async () => new Map([[46568, media(3, 2)]]),
    });
    assert.equal(landing.library.length, 1);
    assert.equal(landing.trending.length, 2);
    assert.equal(landing.trending[1].mediaInfo?.status, 5);
    assert.deepEqual(landing.newest, []);
    assert.deepEqual(landing.failed, ['newest']);
    assert.equal(landing.western[0].mediaInfo?.status, 2);
    // the next visit reads trending from the cache
    await buildComicLanding({
      library: [],
      browse,
      findMedia: async () => new Map(),
    });
    assert.equal(calls, 3);
  });
});

describe('listComicLibrary', () => {
  beforeEach(reset);

  it('titles library rows from the index first and caps ComicVine lookups', async () => {
    const looked: number[] = [];
    const works = await listComicLibrary({
      loadIds: async () => [1, 2, 3, 4],
      lookupIndexed: async () => [volume(1, 'Saga', 'Image', 2012, 72)],
      lookupVolume: async (id) => {
        looked.push(id);
        return volume(id, `Volume ${id}`, 'Viz', 2020, 5);
      },
      maxVolumeLookups: 2,
      findMedia: async () =>
        new Map([
          [1, media(1, 5)],
          [2, media(2, 2)],
        ]),
    });
    assert.deepEqual(looked, [2, 3]);
    assert.deepEqual(
      works.map((w) => [w.id, w.kind, w.title, w.mediaInfo?.status]),
      [
        ['1', 'comic', 'Saga', 5],
        ['2', 'manga', 'Volume 2', 2],
        ['3', 'manga', 'Volume 3', undefined],
      ]
    );
  });

  it('answers the grouped work for an edition it has seen', async () => {
    await buildComicWorkSearch({
      query: 'chainsaw',
      page: 1,
      comicVine: noComicVine,
      volumes: CHAINSAW,
      searchAnilist: async () => [chainsawMan],
      findMedia: async () => new Map(),
    });
    const works = await listComicLibrary({
      loadIds: async () => [155485],
      findMedia: async () => new Map([[155485, media(1, 4)]]),
    });
    assert.equal(works[0].id, 'al-105778');
    assert.equal(works[0].mediaEditionId, '155485');
  });
});
