import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import type { AnilistMangaSearchResult } from '@server/api/anilist';
import type { ComicVineVolumeResult } from '@server/api/comicvine';
import type Media from '@server/entity/Media';
import {
  clearComicWorkCaches,
  getCachedWork,
  getWorkForEdition,
  groupComicVolumes,
  recommendEdition,
  rememberWorks,
  resolveMangaWork,
  withWorkMedia,
} from '@server/lib/comicWorks';
import {
  clearMangaSearchCaches,
  getMangaVolumeHint,
} from '@server/lib/mangaSearch';

const volume = (
  id: number,
  name: string,
  publisher: string,
  year: number,
  count: number,
  aliases?: string[]
): ComicVineVolumeResult => ({
  id,
  name,
  aliases,
  publisher: { id: 1, name: publisher },
  start_year: String(year),
  count_of_issues: count,
  image: { super_url: `https://comicvine.gamespot.com/a/uploads/${id}.jpg` },
  resource_type: 'volume',
});

// ComicVine's answer to "chainsaw" (recorded from SeerrNG, Nov 2026)
const CHAINSAW = [
  volume(130799, 'Chainsaw Man', 'Viz', 2020, 21),
  volume(96858, 'Chimamire Sukeban Chainsaw', 'Enterbrain', 2010, 13, [
    '血まみれスケバンチェーンソー',
    'Bloody Delinquent Chainsaw',
  ]),
  volume(117318, 'Chainsaw Man', 'Shueisha', 2019, 24, [
    'チェンソーマン',
    'Chainsawman',
  ]),
  volume(52125, 'Chainsaw Vigilante', 'New England Comics', 1993, 3),
  volume(145408, 'Chainsaw Man', 'Crew', 2022, 2),
  volume(121193, 'Chainsaw Reindeer', 'Action Lab', 2019, 1),
  volume(155485, 'Chainsaw Man', 'Norma Editorial', 2020, 21),
  volume(167946, 'Chainsaw Man', 'Crunchyroll SAS', 2020, 21),
  volume(117623, 'Chainsaw Man', 'NXB Trẻ', 2022, 11),
  volume(137488, 'Chainsaw Man', 'Egmont Ehapa Verlag', 2020, 21),
  volume(129821, 'Chainsaw Man', 'Haksan', 2020, 1, ['체인소 맨']),
  volume(21295, 'Texas Chainsaw Massacre: The Grind', 'Avatar Press', 2006, 3),
  volume(25446, 'Texas Chainsaw Massacre', 'DC Comics', 2007, 6),
  volume(162936, 'Saitama Chainsaw Shōjo', 'ASCII Media Works', 2009, 1, [
    'さいたまチェーンソー少女',
  ]),
];

const chainsawMan: AnilistMangaSearchResult = {
  id: 105778,
  format: 'MANGA',
  status: 'RELEASING',
  popularity: 337297,
  genres: ['Action', 'Horror'],
  synonyms: ['CSM', '체인소 맨'],
  title: {
    romaji: 'Chainsaw Man',
    english: 'Chainsaw Man',
    native: 'チェンソーマン',
  },
  startDate: { year: 2018 },
  coverImage: { extraLarge: 'https://s4.anilist.co/file/csm.jpg' },
};
const saitama: AnilistMangaSearchResult = {
  id: 42672,
  format: 'MANGA',
  popularity: 1421,
  title: {
    romaji: 'Saitama Chainsaw Shoujo',
    english: 'Saitama Chainsaw Girl',
    native: 'さいたまチェーンソー少女',
  },
  startDate: { year: 2008 },
};
const lollipop: AnilistMangaSearchResult = {
  id: 160819,
  format: 'MANGA',
  popularity: 291,
  title: { romaji: 'Lollipop Chainsaw', native: 'ロリポップチェーンソー' },
  startDate: { year: 2013 },
};

describe('groupComicVolumes', () => {
  beforeEach(() => {
    clearComicWorkCaches();
    clearMangaSearchCaches();
  });

  it('folds every edition of Chainsaw Man into one work with Viz recommended', () => {
    const works = groupComicVolumes({
      volumes: CHAINSAW,
      manga: [
        { media: chainsawMan, strength: 2 },
        { media: saitama, strength: 1 },
        { media: lollipop, strength: 1 },
      ],
    });
    const csm = works[0];
    assert.equal(csm.id, 'al-105778');
    assert.equal(csm.kind, 'manga');
    assert.equal(csm.title, 'Chainsaw Man');
    assert.equal(csm.posterPath, 'https://s4.anilist.co/file/csm.jpg');
    assert.equal(csm.recommendedId, '130799');
    assert.equal(csm.publisher, 'Viz');
    assert.equal(csm.editionsResolved, true);
    assert.deepEqual(
      csm.editions.map((e) => [e.publisher, e.languageName]),
      [
        ['Viz', 'English'],
        ['Crew', 'Czech'],
        ['Crunchyroll SAS', 'French'],
        ['Egmont Ehapa Verlag', 'German'],
        ['Haksan', 'Korean'],
        ['Norma Editorial', 'Spanish'],
        ['NXB Trẻ', 'Vietnamese'],
        ['Shueisha', 'Japanese'],
      ]
    );
    assert.equal(csm.editions[0].recommended, true);
    assert.equal(
      csm.editions.filter((e) => e.recommended).length,
      1,
      'one recommended edition'
    );
    // different series that share a word stay their own works
    const titles = works.map((w) => w.title);
    assert.equal(titles.filter((t) => t === 'Chainsaw Man').length, 1);
    for (const other of [
      'Chainsaw Vigilante',
      'Chainsaw Reindeer',
      'Texas Chainsaw Massacre',
      'Texas Chainsaw Massacre: The Grind',
      'Chimamire Sukeban Chainsaw',
    ])
      assert.ok(titles.includes(other), other);
    // a loose AniList match with an edition in the results is grouped by its native title
    const girl = works.find((w) => w.id === 'al-42672');
    assert.deepEqual(
      girl?.editions.map((e) => e.id),
      ['162936']
    );
    // a loose match with no edition at all is left out
    assert.equal(
      works.some((w) => w.id === 'al-160819'),
      false
    );
    assert.equal(works.length, 7);
  });

  it('keeps ComicVine order for the works after the named manga', () => {
    const chimamire: AnilistMangaSearchResult = {
      id: 87407,
      format: 'MANGA',
      popularity: 1584,
      title: { romaji: 'Chimamire Sukeban Chainsaw' },
      startDate: { year: 2009 },
    };
    const spinOff: AnilistMangaSearchResult = {
      id: 999,
      format: 'MANGA',
      popularity: 900,
      title: { english: 'Chainsaw Man: Side Stories' },
    };
    const works = groupComicVolumes({
      volumes: CHAINSAW,
      manga: [
        { media: chainsawMan, strength: 2 },
        { media: spinOff, strength: 2 },
        { media: chimamire, strength: 1 },
      ],
    });
    assert.equal(works[1].id, 'al-87407');
    assert.deepEqual(
      works.map((w) => w.title),
      [
        'Chainsaw Man',
        'Chimamire Sukeban Chainsaw',
        'Chainsaw Vigilante',
        'Chainsaw Reindeer',
        'Texas Chainsaw Massacre: The Grind',
        'Texas Chainsaw Massacre',
        'Saitama Chainsaw Shōjo',
      ]
    );
  });

  it('without AniList still groups the manga editions by title', () => {
    const works = groupComicVolumes({ volumes: CHAINSAW });
    const csm = works.filter((w) => w.title === 'Chainsaw Man');
    // Viz and Shueisha are manga publishers; the translations join them
    assert.equal(csm.length, 1);
    assert.equal(csm[0].kind, 'manga');
    assert.equal(csm[0].editions.length, 8);
    assert.equal(csm[0].id, '130799');
    assert.equal(csm[0].recommendedId, '130799');
  });

  it('keeps Western runs apart and attaches each translation to its run', () => {
    const works = groupComicVolumes({
      volumes: [
        volume(42721, 'Batman', 'DC Comics', 2011, 52),
        volume(91273, 'Batman', 'DC Comics', 2016, 163),
        volume(55000, 'Batman', 'Urban Comics', 2012, 11),
        volume(99000, 'Batman', 'Urban Comics', 2017, 20),
        volume(99100, 'Batman', 'Panini Verlag', 2017, 60),
        volume(12345, 'Batman Beyond', 'DC Comics', 2016, 50),
      ],
    });
    assert.equal(works.length, 3);
    const [b2011, b2016, beyond] = works;
    assert.equal(b2011.id, '42721');
    assert.equal(b2011.kind, 'comic');
    assert.deepEqual(
      b2011.editions.map((e) => [e.id, e.languageName]),
      [
        ['42721', 'English'],
        ['55000', 'French'],
      ]
    );
    assert.equal(b2016.id, '91273');
    assert.deepEqual(
      b2016.editions.map((e) => e.id),
      ['91273', '99000', '99100']
    );
    assert.equal(b2016.recommendedId, '91273');
    assert.equal(beyond.editions.length, 1);
  });

  it('never attaches a Western publisher volume to a manga work', () => {
    const monster: AnilistMangaSearchResult = {
      id: 30001,
      format: 'MANGA',
      popularity: 200000,
      title: { romaji: 'Monster', english: 'Monster', native: 'MONSTER' },
      startDate: { year: 1994 },
    };
    const works = groupComicVolumes({
      volumes: [
        volume(1, 'Monster', 'Viz', 2006, 18),
        volume(2, 'Monster', 'Image', 2004, 4),
        volume(3, 'Monster', 'Marvel', 1993, 1),
      ],
      manga: [{ media: monster, strength: 2 }],
    });
    assert.deepEqual(
      works[0].editions.map((e) => e.id),
      ['1']
    );
    assert.equal(works.length, 3);
  });

  it('a translation older than the manga is not an edition of it', () => {
    const works = groupComicVolumes({
      volumes: [
        volume(1, 'Chainsaw Man', 'Viz', 2020, 21),
        volume(2, 'Chainsaw Man', 'Norma Editorial', 1999, 1),
      ],
      manga: [{ media: chainsawMan, strength: 2 }],
    });
    assert.deepEqual(
      works[0].editions.map((e) => e.id),
      ['1']
    );
  });
});

describe('recommendEdition', () => {
  it('picks the English edition with the most volumes', () => {
    const rec = recommendEdition(
      [
        { id: '1', title: 'x', language: 'ja', issueCount: 40 },
        { id: '2', title: 'x', language: 'en', issueCount: 10 },
        { id: '3', title: 'x', language: 'en', issueCount: 30 },
      ],
      'manga'
    );
    assert.equal(rec?.id, '3');
  });
  it('recommends nothing for a manga with no English edition', () => {
    assert.equal(
      recommendEdition(
        [{ id: '1', title: 'x', language: 'ja', issueCount: 40 }],
        'manga'
      ),
      undefined
    );
  });
});

describe('work caches and media', () => {
  beforeEach(() => {
    clearComicWorkCaches();
    clearMangaSearchCaches();
  });

  it('remembers works by edition and marks manga editions for the manga library', () => {
    const works = groupComicVolumes({
      volumes: CHAINSAW,
      manga: [{ media: chainsawMan, strength: 2 }],
    });
    rememberWorks(works);
    assert.equal(getWorkForEdition(155485)?.id, 'al-105778');
    assert.equal(getMangaVolumeHint(155485)?.anilistId, 105778);
    // only English editions take the English title and AniList cover
    assert.equal(getMangaVolumeHint(130799)?.title, 'Chainsaw Man');
    assert.equal(getMangaVolumeHint(155485)?.title, undefined);
  });

  it('shows the state of whichever edition is in the library', () => {
    const [csm] = groupComicVolumes({
      volumes: CHAINSAW,
      manga: [{ media: chainsawMan, strength: 2 }],
    });
    const spanish = { id: 9, status: 5 } as unknown as Media;
    const work = withWorkMedia(csm, new Map([[155485, spanish]]));
    assert.equal(work.mediaInfo, spanish);
    assert.equal(work.mediaEditionId, '155485');
    assert.equal(
      work.editions.find((e) => e.id === '155485')?.mediaInfo,
      spanish
    );
  });
});

describe('resolveMangaWork', () => {
  beforeEach(() => {
    clearComicWorkCaches();
    clearMangaSearchCaches();
  });

  it('finds the editions with one ComicVine search and caches them', async () => {
    let searches = 0;
    const comicVine = {
      searchVolumes: async ({ query }: { query: string }) => {
        searches++;
        assert.equal(query, 'Chainsaw Man');
        return {
          error: 'OK',
          limit: 30,
          offset: 0,
          number_of_page_results: CHAINSAW.length,
          number_of_total_results: CHAINSAW.length,
          status_code: 1,
          results: CHAINSAW,
        };
      },
    };
    const work = await resolveMangaWork({
      anilistId: 105778,
      getManga: async () => chainsawMan,
      comicVine,
    });
    assert.equal(work?.recommendedId, '130799');
    assert.equal(work?.editions.length, 8);
    assert.equal(searches, 1);
    const again = await resolveMangaWork({
      anilistId: 105778,
      getManga: async () => {
        throw new Error('should come from the cache');
      },
      comicVine,
    });
    assert.equal(again?.editions.length, 8);
    assert.equal(searches, 1);
    assert.equal(getCachedWork('al-105778')?.editionsResolved, true);
  });

  it('tries the romaji title when the English one finds no English edition', async () => {
    const queries: string[] = [];
    const frieren: AnilistMangaSearchResult = {
      id: 118586,
      format: 'MANGA',
      title: {
        english: "Frieren: Beyond Journey's End",
        romaji: 'Sousou no Frieren',
        native: '葬送のフリーレン',
      },
      startDate: { year: 2020 },
    };
    const work = await resolveMangaWork({
      anilistId: 118586,
      getManga: async () => frieren,
      comicVine: {
        searchVolumes: async ({ query }: { query: string }) => {
          queries.push(query);
          return {
            error: 'OK',
            limit: 30,
            offset: 0,
            number_of_page_results: 1,
            number_of_total_results: 1,
            status_code: 1,
            results:
              query === 'Sousou no Frieren'
                ? [
                    volume(140167, 'Frieren', 'Viz', 2021, 14),
                    volume(126000, 'Sousou no Frieren', 'Shogakukan', 2020, 14),
                  ]
                : [],
          };
        },
      },
    });
    assert.deepEqual(queries, [
      "Frieren: Beyond Journey's End",
      'Sousou no Frieren',
    ]);
    assert.equal(work?.recommendedId, '140167');
  });

  it('does not cache a failed lookup', async () => {
    const work = await resolveMangaWork({
      anilistId: 105778,
      getManga: async () => chainsawMan,
      comicVine: {
        searchVolumes: async () => {
          throw new Error('ComicVine is down');
        },
      },
    });
    assert.equal(work?.editions.length, 0);
    assert.equal(work?.editionsResolved, false);
    assert.equal(getCachedWork('al-105778'), undefined);
  });
});
