import type { BookResult } from '@server/models/Book';

/**
 * Votes a rating needs before it outweighs the catalogue mean. Bookshelf
 * ratings come from Goodreads/Hardcover, where well-known books carry
 * thousands of votes; a few dozen enthusiastic early reviews should not put a
 * book above titles rated by tens of thousands of readers, while a book with
 * a thousand votes is mostly judged on its own rating.
 */
export const BOOK_RATING_PRIOR_VOTES = 250;

/**
 * Open Library dates every record by its earliest printed edition, so a first
 * publish year before movable type is a data-entry slip (years 0, 1, 19...),
 * not an early book. Oldest-first browsing hides them.
 */
export const OPEN_LIBRARY_EARLIEST_PRINT_YEAR = 1450;

const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;
// Trending treats an undated book as this many years old: it can still trend
// on sheer popularity, but any comparably popular dated release ranks first.
const TRENDING_UNDATED_AGE_YEARS = 25;

/** The last year a release date may plausibly carry (pre-orders included). */
const latestPlausibleYear = (now: Date) => now.getUTCFullYear() + 1;

/**
 * Open Library query clauses that keep date sorts on real books.
 *
 * `sort=new` otherwise leads with records whose first publish year is a typo
 * far in the future (9981, 9461...), and `sort=old` with years 0 and 1. The
 * negative clauses only drop those impossible years; undated works still
 * match, so searches keep every real result. Browsing (no keyword or author
 * search) also asks for a cover, which filters the bulk of placeholder
 * records out of the newest/oldest feeds. A search must never hide a
 * coverless match, so it skips that clause. A request already pinned to one
 * publish year needs no year bounds.
 */
export const getOpenLibraryDateSortClauses = ({
  sortBy,
  browsing,
  exactYear = false,
  now = new Date(),
}: {
  sortBy: string;
  browsing: boolean;
  exactYear?: boolean;
  now?: Date;
}): string[] => {
  if (sortBy !== 'newest' && sortBy !== 'oldest') return [];
  return [
    ...(browsing ? ['cover_i:[1 TO *]'] : []),
    ...(exactYear
      ? []
      : [
          sortBy === 'newest'
            ? `-first_publish_year:[${latestPlausibleYear(now) + 1} TO *]`
            : `-first_publish_year:[* TO ${OPEN_LIBRARY_EARLIEST_PRINT_YEAR - 1}]`,
        ]),
  ];
};

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/**
 * Release time in ms, from the full release date when there is one and the
 * year otherwise. Dates past next year are typos, and year 1 is the
 * Readarr-family "no date" sentinel, so both count as undated.
 */
export const getBookReleaseTime = (
  book: Pick<BookResult, 'releaseDate' | 'firstPublishYear'>,
  now: Date = new Date()
): number | undefined => {
  const plausible = (time: number) => {
    const year = new Date(time).getUTCFullYear();
    return year > 1 && year <= latestPlausibleYear(now);
  };
  const releaseTime = book.releaseDate ? Date.parse(book.releaseDate) : NaN;
  if (Number.isFinite(releaseTime) && plausible(releaseTime)) {
    return releaseTime;
  }
  if (isFiniteNumber(book.firstPublishYear)) {
    // setUTCFullYear, unlike Date.UTC, does not map years 0-99 to 19xx.
    const yearTime = new Date(0).setUTCFullYear(book.firstPublishYear, 0, 1);
    if (plausible(yearTime)) return yearTime;
  }
  return undefined;
};

const isRated = (book: BookResult): boolean =>
  isFiniteNumber(book.ratingsAverage) &&
  book.ratingsAverage > 0 &&
  book.ratingsCount !== 0;

/**
 * Bayesian average: (v * R + m * C) / (v + m), with C the mean rating of the
 * books being sorted and m {@link BOOK_RATING_PRIOR_VOTES}. A book whose vote
 * count is unknown is trusted as if it had m votes.
 */
const getWeightedRating = (book: BookResult, catalogueMean: number) => {
  const average = book.ratingsAverage as number;
  const votes = isFiniteNumber(book.ratingsCount)
    ? Math.max(book.ratingsCount, 0)
    : BOOK_RATING_PRIOR_VOTES;
  return (
    (votes * average + BOOK_RATING_PRIOR_VOTES * catalogueMean) /
    (votes + BOOK_RATING_PRIOR_VOTES)
  );
};

/**
 * Trending score. Bookshelf catalogues carry no time-series signal (no recent
 * votes, reads or requests), so trending is all-time popularity decayed by
 * release age, the way link aggregators rank posts: popularity / (age + 1)^2,
 * with age in years. A big release from this year outranks an older book with
 * a few times its readers, while a perennial with ten times the readers of a
 * modest new release still beats it, so the view differs from both Popular and
 * Newest. Upcoming releases count as age zero. The date a book was added to
 * the catalogue says nothing about readers' interest, so it is not used.
 */
const getTrendingScore = (book: BookResult, now: Date) => {
  if (!isFiniteNumber(book.popularity)) return undefined;
  const releaseTime = getBookReleaseTime(book, now);
  const ageYears =
    releaseTime === undefined
      ? TRENDING_UNDATED_AGE_YEARS
      : Math.max(0, (now.getTime() - releaseTime) / YEAR_MS);
  return book.popularity / (ageYears + 1) ** 2;
};

const compareTitles = (left: BookResult, right: BookResult) =>
  left.title.localeCompare(right.title) || left.id.localeCompare(right.id);

/**
 * Orders Bookshelf (ChaptarrNG/Readarr) catalogue books for discovery.
 *
 * - ranked (Popular): popularity, high to low.
 * - trending: popularity decayed by release age (see getTrendingScore).
 * - rating: Bayesian-weighted average rating; unrated books last.
 * - newest/oldest: release date (full date when known); undated last.
 * - editions: number of known ISBNs.
 *
 * `.asc` reverses the order of books that have the sort's value; books
 * without it stay last either way. Ties, and sorts with no catalogue signal
 * (random), fall back to title and then id so paging stays stable.
 */
export const sortBookshelfBooks = (
  books: BookResult[],
  sortBy: string,
  now: Date = new Date()
): BookResult[] => {
  const ascending = sortBy.endsWith('.asc') || sortBy === 'oldest';
  const base = sortBy.replace(/\.(?:asc|desc)$/, '');
  const ratedBooks = books.filter(isRated);
  const catalogueMean = ratedBooks.length
    ? ratedBooks.reduce((sum, book) => sum + (book.ratingsAverage ?? 0), 0) /
      ratedBooks.length
    : 0;
  const getSortValue = (book: BookResult): number | undefined => {
    switch (base) {
      case 'ranked':
        return isFiniteNumber(book.popularity) ? book.popularity : undefined;
      case 'trending':
        return getTrendingScore(book, now);
      case 'rating':
        return isRated(book)
          ? getWeightedRating(book, catalogueMean)
          : undefined;
      case 'newest':
      case 'oldest':
        return getBookReleaseTime(book, now);
      case 'editions':
        return book.isbnCandidates?.length ?? 0;
      default:
        return undefined;
    }
  };

  return books
    .map((book) => ({ book, value: getSortValue(book) }))
    .sort((left, right) => {
      if (left.value !== right.value) {
        if (left.value === undefined) return 1;
        if (right.value === undefined) return -1;
        return ascending ? left.value - right.value : right.value - left.value;
      }
      return compareTitles(left.book, right.book);
    })
    .map(({ book }) => book);
};
