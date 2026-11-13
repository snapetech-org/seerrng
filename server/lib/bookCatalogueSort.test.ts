import type { BookResult } from '@server/models/Book';
import { describe, expect, it } from 'vitest';
import {
  getBookReleaseTime,
  getOpenLibraryDateSortClauses,
  sortBookshelfBooks,
} from './bookCatalogueSort';

const NOW = new Date('2026-11-13T12:00:00Z');

const book = (title: string, fields: Partial<BookResult> = {}): BookResult => ({
  id: `bookshelf:1:${title}`,
  mediaType: 'book',
  bookFormat: 'audiobook',
  title,
  ...fields,
});

const titles = (books: BookResult[]) => books.map((entry) => entry.title);

describe('sortBookshelfBooks', () => {
  const catalogue = [
    book('Frost and Starlight', {
      ratingsAverage: 3.38,
      ratingsCount: 191372,
      popularity: 646837,
      releaseDate: '2018-05-01T00:00:00.000Z',
    }),
    book('Earth and Blood', {
      ratingsAverage: 4.79,
      ratingsCount: 42,
      popularity: 201,
      releaseDate: '2020-03-03T00:00:00.000Z',
    }),
    book('Steady Favourite', {
      ratingsAverage: 4.3,
      ratingsCount: 80000,
      popularity: 344000,
      releaseDate: '2018-09-01T00:00:00.000Z',
    }),
    book('New Hit', {
      ratingsAverage: 4.1,
      ratingsCount: 50000,
      popularity: 205000,
      releaseDate: '2026-06-01T00:00:00.000Z',
    }),
    book('No Data'),
  ];

  it('orders Popular by popularity, unknown last', () => {
    expect(titles(sortBookshelfBooks(catalogue, 'ranked', NOW))).toEqual([
      'Frost and Starlight',
      'Steady Favourite',
      'New Hit',
      'Earth and Blood',
      'No Data',
    ]);
    expect(
      titles(sortBookshelfBooks(catalogue, 'ranked.asc', NOW)).at(-1)
    ).toBe('No Data');
  });

  it('weights ratings so a small sample cannot top Rating', () => {
    // Earth and Blood's 4.79 from 42 votes is pulled toward the mean (about
    // 4.24), below 4.3 from 80,000 votes.
    expect(titles(sortBookshelfBooks(catalogue, 'rating.desc', NOW))).toEqual([
      'Steady Favourite',
      'Earth and Blood',
      'New Hit',
      'Frost and Starlight',
      'No Data',
    ]);
    expect(titles(sortBookshelfBooks(catalogue, 'rating.asc', NOW))).toEqual([
      'Frost and Starlight',
      'New Hit',
      'Earth and Blood',
      'Steady Favourite',
      'No Data',
    ]);
  });

  it('puts unrated and zero-vote books last for Rating', () => {
    const sorted = sortBookshelfBooks(
      [
        book('Zero Votes', { ratingsAverage: 5, ratingsCount: 0 }),
        book('Unknown Count', { ratingsAverage: 4 }),
        book('Unrated'),
      ],
      'rating',
      NOW
    );
    expect(titles(sorted)).toEqual(['Unknown Count', 'Unrated', 'Zero Votes']);
  });

  it('ranks Trending by popularity decayed by release age', () => {
    expect(titles(sortBookshelfBooks(catalogue, 'trending', NOW))).toEqual([
      'New Hit',
      'Frost and Starlight',
      'Steady Favourite',
      'Earth and Blood',
      'No Data',
    ]);
    // A popular undated book trends below a comparable dated release.
    expect(
      titles(
        sortBookshelfBooks(
          [
            book('Undated', { popularity: 1000 }),
            book('Last Year', {
              popularity: 1000,
              releaseDate: '2025-11-01T00:00:00.000Z',
            }),
          ],
          'trending',
          NOW
        )
      )
    ).toEqual(['Last Year', 'Undated']);
  });

  it('orders Newest/Oldest by full release date, undated and impossible dates last', () => {
    const dated = [
      book('Early May', { releaseDate: '2024-05-02T00:00:00.000Z' }),
      book('Late May', { releaseDate: '2024-05-30T00:00:00.000Z' }),
      book('Year Only', { firstPublishYear: 2010 }),
      book('Typo Future', { releaseDate: '9981-01-01T00:00:00.000Z' }),
      book('Preorder', { releaseDate: '2027-02-01T00:00:00.000Z' }),
      book('Undated'),
    ];
    expect(titles(sortBookshelfBooks(dated, 'newest', NOW))).toEqual([
      'Preorder',
      'Late May',
      'Early May',
      'Year Only',
      'Typo Future',
      'Undated',
    ]);
    expect(titles(sortBookshelfBooks(dated, 'oldest', NOW))).toEqual([
      'Year Only',
      'Early May',
      'Late May',
      'Preorder',
      'Typo Future',
      'Undated',
    ]);
  });

  it('breaks ties by title then id so paging is stable', () => {
    const tied = [
      { ...book('B'), id: 'bookshelf:2:b' },
      book('A'),
      { ...book('B'), id: 'bookshelf:1:b' },
    ];
    expect(
      sortBookshelfBooks(tied, 'ranked', NOW).map((entry) => entry.id)
    ).toEqual(['bookshelf:1:A', 'bookshelf:1:b', 'bookshelf:2:b']);
  });
});

describe('getBookReleaseTime', () => {
  it('ignores dates past next year and the year-1 sentinel', () => {
    expect(
      getBookReleaseTime({ releaseDate: '2027-12-31T00:00:00Z' }, NOW)
    ).toBe(Date.parse('2027-12-31T00:00:00Z'));
    expect(
      getBookReleaseTime({ releaseDate: '2028-01-01T00:00:00Z' }, NOW)
    ).toBeUndefined();
    expect(getBookReleaseTime({ firstPublishYear: 1 }, NOW)).toBeUndefined();
    expect(
      getBookReleaseTime(
        { releaseDate: '9981-01-01T00:00:00Z', firstPublishYear: 2001 },
        NOW
      )
    ).toBe(Date.UTC(2001, 0, 1));
  });
});

describe('getOpenLibraryDateSortClauses', () => {
  it('caps newest at next year and asks browsing for covers', () => {
    expect(
      getOpenLibraryDateSortClauses({
        sortBy: 'newest',
        browsing: true,
        now: NOW,
      })
    ).toEqual(['cover_i:[1 TO *]', '-first_publish_year:[2028 TO *]']);
  });

  it('never requires covers for searches', () => {
    expect(
      getOpenLibraryDateSortClauses({
        sortBy: 'newest',
        browsing: false,
        now: NOW,
      })
    ).toEqual(['-first_publish_year:[2028 TO *]']);
  });

  it('drops pre-print junk years for oldest', () => {
    expect(
      getOpenLibraryDateSortClauses({
        sortBy: 'oldest',
        browsing: true,
        now: NOW,
      })
    ).toEqual(['cover_i:[1 TO *]', '-first_publish_year:[* TO 1449]']);
  });

  it('adds no year bounds when one publish year is already selected', () => {
    expect(
      getOpenLibraryDateSortClauses({
        sortBy: 'newest',
        browsing: false,
        exactYear: true,
        now: NOW,
      })
    ).toEqual([]);
  });

  it('leaves other sorts alone', () => {
    for (const sortBy of ['ranked', 'trending', 'rating.desc', 'random']) {
      expect(
        getOpenLibraryDateSortClauses({ sortBy, browsing: true, now: NOW })
      ).toEqual([]);
    }
  });
});
