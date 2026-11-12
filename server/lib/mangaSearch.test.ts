import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import type { AnilistMangaSearchResult } from '@server/api/anilist';
import type { ComicVineVolumeResult } from '@server/api/comicvine';
import {
  isEnglishMangaPublisher,
  isMangaPublisher,
  mangaEditionOf,
} from '@server/lib/mangaPublishers';
import {
  anilistTitles,
  clearMangaSearchCaches,
  getMangaVolumeHint,
  matchStrength,
  normalizeTitle,
  pickEnglishEdition,
  searchMangaEditions,
} from '@server/lib/mangaSearch';

const volume = (
  id: number,
  name: string,
  publisher: string,
  count: number,
  year = '2023'
): ComicVineVolumeResult => ({
  id,
  name,
  publisher: { id: id + 1, name: publisher },
  count_of_issues: count,
  start_year: year,
  resource_type: 'volume',
});

const oshiNoKo: AnilistMangaSearchResult = {
  id: 117195,
  format: 'MANGA',
  popularity: 107975,
  volumes: 16,
  synonyms: ['Favorite Girl', "My Idol's Child"],
  title: {
    romaji: '[Oshi no Ko]',
    english: '[Oshi no Ko]',
    native: '【推しの子】',
  },
  coverImage: { extraLarge: 'https://s4.anilist.co/file/oshi.jpg' },
};

const frieren: AnilistMangaSearchResult = {
  id: 118586,
  format: 'MANGA',
  popularity: 86940,
  synonyms: ['Frieren at the Funeral'],
  title: {
    romaji: 'Sousou no Frieren',
    english: 'Frieren: Beyond Journey’s End',
    native: '葬送のフリーレン',
  },
  coverImage: { extraLarge: 'https://s4.anilist.co/file/frieren.jpg' },
};

const oshiCvResults = [
  volume(168741, 'Oshi no Ko', 'Editorial Ivrea', 16, '2022'),
  volume(132980, '【Oshi no Ko】', 'Shueisha', 16, '2020'),
  volume(147500, '[Oshi No Ko]', 'Yen Press', 13),
  volume(156852, 'Koroshiya no Oshi', 'Enterbrain', 4),
];

describe('manga publishers', () => {
  it('knows English and Japanese manga publishers as ComicVine spells them', () => {
    assert.equal(isEnglishMangaPublisher('Yen Press'), true);
    assert.equal(isEnglishMangaPublisher('Viz'), true);
    assert.equal(isEnglishMangaPublisher('VIZ Media'), true);
    assert.equal(isEnglishMangaPublisher('Square Enix Manga & Books'), true);
    assert.equal(isEnglishMangaPublisher('Kodansha USA'), true);
    assert.equal(isEnglishMangaPublisher('Kodansha'), false);
    assert.equal(isEnglishMangaPublisher('Shueisha'), false);
    assert.equal(isEnglishMangaPublisher('Editorial Ivrea'), false);
    assert.equal(isMangaPublisher('Shōnen Gahōsha'), true);
    assert.equal(isMangaPublisher('Shueisha'), true);
    assert.equal(isMangaPublisher('Dark Horse Manga'), true);
    assert.equal(isMangaPublisher('Dark Horse Comics'), false);
    assert.equal(isMangaPublisher('Image'), false);
    assert.equal(isMangaPublisher('DC Comics'), false);
    assert.deepEqual(mangaEditionOf('Yen Press'), {
      manga: true,
      edition: 'en',
    });
    assert.deepEqual(mangaEditionOf('Shueisha'), {
      manga: true,
      edition: 'ja',
    });
    assert.deepEqual(mangaEditionOf('Marvel'), { manga: false });
  });
});

describe('manga title matching', () => {
  it('normalizes brackets, ×, apostrophes and accents', () => {
    assert.equal(normalizeTitle('[Oshi No Ko]'), 'oshi no ko');
    assert.equal(normalizeTitle('SPY×FAMILY'), 'spyxfamily');
    assert.equal(normalizeTitle('SPY x FAMILY'), 'spy x family');
    assert.equal(
      normalizeTitle('Frieren: Beyond Journey’s End'),
      'frieren beyond journeys end'
    );
    assert.equal(normalizeTitle('Sōsō no Frieren'), 'soso no frieren');
  });

  it('rates how strongly a query names a series', () => {
    assert.equal(matchStrength('Oshi no Ko', oshiNoKo), 2);
    assert.equal(matchStrength('frieren', frieren), 2);
    assert.equal(matchStrength('Frieren: Beyond', frieren), 2);
    assert.equal(
      matchStrength('saga', {
        id: 1,
        popularity: 9000,
        title: { romaji: 'Tsuyokute New Saga', english: 'New Saga' },
      }),
      1
    );
    assert.equal(
      matchStrength('batman', {
        id: 2,
        popularity: 500,
        title: { romaji: 'Batman: Child of Dreams' },
      }),
      2
    );
    assert.equal(
      matchStrength('chainsaw man', {
        id: 3,
        title: { romaji: 'Fire Punch' },
      }),
      0
    );
  });

  it('picks the English edition with the most volumes', () => {
    const titles = anilistTitles(oshiNoKo, true);
    assert.equal(pickEnglishEdition(oshiCvResults, titles)?.id, 147500);
    const frierenTitles = anilistTitles(frieren, true);
    assert.equal(
      pickEnglishEdition(
        [
          volume(147577, 'Frieren', 'Norma Editorial', 13),
          volume(140167, "Frieren: Beyond Journey's End", 'Viz', 14),
          volume(130685, 'Sōsō no Frieren', 'Shogakukan', 15),
        ],
        frierenTitles
      )?.id,
      140167
    );
    assert.equal(
      pickEnglishEdition(
        [volume(130685, 'Sōsō no Frieren', 'Shogakukan', 15)],
        frierenTitles
      ),
      undefined
    );
  });
});

describe('searchMangaEditions', () => {
  beforeEach(() => clearMangaSearchCaches());

  it('reuses the regular ComicVine results before searching again', async () => {
    let comicVineCalls = 0;
    const matches = await searchMangaEditions({
      query: 'Oshi no Ko',
      comicVine: {
        searchVolumes: async () => {
          comicVineCalls++;
          throw new Error('should not search');
        },
      },
      searchAnilist: async () => [oshiNoKo],
      knownVolumes: oshiCvResults,
    });
    assert.equal(comicVineCalls, 0);
    assert.equal(matches.length, 1);
    assert.equal(matches[0].volume.id, 147500);
    assert.equal(matches[0].title, '[Oshi no Ko]');
    assert.equal(matches[0].coverUrl, 'https://s4.anilist.co/file/oshi.jpg');
    assert.equal(matches[0].strength, 2);
    assert.equal(getMangaVolumeHint(147500)?.anilistId, 117195);
  });

  it('searches ComicVine by English title for a strong match, then caches it', async () => {
    const queries: string[] = [];
    const comicVine = {
      searchVolumes: async ({ query }: { query: string }) => {
        queries.push(query);
        return {
          error: 'OK',
          limit: 20,
          offset: 0,
          number_of_page_results: 1,
          number_of_total_results: 1,
          status_code: 1,
          results:
            query === "Frieren: Beyond Journey's End"
              ? [volume(140167, "Frieren: Beyond Journey's End", 'Viz', 14)]
              : [],
        };
      },
    };
    const run = () =>
      searchMangaEditions({
        query: 'Frieren',
        comicVine,
        searchAnilist: async () => [frieren],
        knownVolumes: [volume(147577, 'Frieren', 'Norma Editorial', 13)],
      });
    const first = await run();
    assert.equal(first[0]?.volume.id, 140167);
    assert.equal(first[0]?.title, 'Frieren: Beyond Journey’s End');
    const second = await run();
    assert.equal(second[0]?.volume.id, 140167);
    assert.deepEqual(queries, ["Frieren: Beyond Journey's End"]);
  });

  it('never spends ComicVine calls on loose matches and skips novels', async () => {
    let comicVineCalls = 0;
    const matches = await searchMangaEditions({
      query: 'saga',
      comicVine: {
        searchVolumes: async () => {
          comicVineCalls++;
          throw new Error('no');
        },
      },
      searchAnilist: async () => [
        {
          id: 85890,
          format: 'MANGA',
          popularity: 9000,
          title: { romaji: 'Tsuyokute New Saga', english: 'New Saga' },
        },
        {
          id: 5,
          format: 'NOVEL',
          popularity: 90000,
          title: { english: 'Saga' },
        },
      ],
      knownVolumes: [volume(1, 'Saga', 'Image', 72, '2012')],
    });
    assert.equal(comicVineCalls, 0);
    assert.deepEqual(matches, []);
  });

  it('omits a series ComicVine has no English edition of', async () => {
    const matches = await searchMangaEditions({
      query: 'Oshi no Ko',
      comicVine: {
        searchVolumes: async () => ({
          error: 'OK',
          limit: 20,
          offset: 0,
          number_of_page_results: 1,
          number_of_total_results: 1,
          status_code: 1,
          results: [volume(132980, '【Oshi no Ko】', 'Shueisha', 16)],
        }),
      },
      searchAnilist: async () => [oshiNoKo],
    });
    assert.deepEqual(matches, []);
  });
});
