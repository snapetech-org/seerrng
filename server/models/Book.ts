import type {
  OpenLibraryAuthorWork,
  OpenLibraryEdition,
  OpenLibrarySearchDoc,
  OpenLibraryWork,
} from '@server/api/openlibrary';
import type Media from '@server/entity/Media';
import {
  normalizeOpenLibraryEditionId,
  normalizeOpenLibraryWorkId,
} from '@server/lib/externalIds';
import { normalizeValidIsbn } from '@server/lib/isbn';

export interface BookResult {
  id: string;
  provider?: 'openlibrary' | 'bookshelf';
  mediaType: 'book';
  bookFormat?: 'ebook' | 'audiobook';
  title: string;
  author?: string;
  authorId?: string;
  firstPublishYear?: number;
  posterPath?: string;
  isbn13?: string;
  editionId?: string;
  isbnCandidates?: BookIsbnCandidate[];
  metadataSource?: { name: string; url: string };
  editionCount?: number;
  ratingsAverage?: number;
  ratingsCount?: number;
  /** Catalogue popularity (Bookshelf `ratings.popularity`, else votes). */
  popularity?: number;
  /** Full release date when the catalogue knows it (ISO 8601). */
  releaseDate?: string;
  subjects?: string[];
  languages?: string[];
  wantToReadCount?: number;
  publisher?: string;
  series?: BookSeriesReference[];
  audiobookDuration?: number;
  narrators?: string[];
  score?: number;
  mediaInfo?: Media;
}

export interface BookDetails extends BookResult {
  description?: string;
  subjects?: string[];
  numberOfPages?: number;
  onUserWatchlist?: boolean;
}

export interface BookRatingResponse {
  average?: number;
  count: number;
  source: 'openlibrary' | 'bookshelf';
  workId?: string;
}

export interface BookSeriesReference {
  id: string;
  title: string;
  position?: string;
}

export interface BookSeriesDetails {
  id: string;
  title: string;
  description?: string;
  books: BookResult[];
}

export interface AuthorResult {
  id: string;
  provider: 'openlibrary' | 'bookshelf';
  mediaType: 'author';
  name: string;
  posterPath?: string;
  topWork?: string;
  workCount?: number;
  birthDate?: string;
  deathDate?: string;
}

export interface AuthorDetails {
  id: string;
  name: string;
  biography?: string;
  birthDate?: string;
  deathDate?: string;
  posterPath?: string;
  works: BookResult[];
  pagination: {
    limit: number;
    offset: number;
    totalItems: number;
  };
}

export interface BookIsbnCandidate {
  isbn: string;
  editionId?: string;
  title?: string;
  format?: string;
  languages?: string[];
}

export const MAX_BOOK_ISBN_CANDIDATES = 200;

const getEditionId = (key?: string): string | undefined =>
  key ? normalizeOpenLibraryEditionId(key) : undefined;

const mapEditionIsbnCandidates = (
  editions: OpenLibraryEdition[]
): BookIsbnCandidate[] => {
  const candidates = new Map<string, BookIsbnCandidate>();

  for (const edition of editions) {
    const editionId = getEditionId(edition.key);
    const title = edition.title;
    const format = edition.physical_format;
    const languages = edition.languages
      ?.map(({ key }) => key.split('/').filter(Boolean).pop() ?? key)
      .filter((language, index, values) => values.indexOf(language) === index);

    for (const isbn of [
      ...(edition.isbn_13 ?? []),
      ...(edition.isbn_10 ?? []),
    ]) {
      const normalized = normalizeValidIsbn(isbn);

      if (normalized && !candidates.has(normalized)) {
        candidates.set(normalized, {
          isbn: normalized,
          editionId,
          title,
          format,
          languages,
        });

        if (candidates.size >= MAX_BOOK_ISBN_CANDIDATES) {
          break;
        }
      }
    }

    if (candidates.size >= MAX_BOOK_ISBN_CANDIDATES) {
      break;
    }
  }

  return [...candidates.values()].sort((a, b) => {
    if (a.isbn.length !== b.isbn.length) {
      return b.isbn.length - a.isbn.length;
    }

    return a.isbn.localeCompare(b.isbn);
  });
};

export const mapOpenLibrarySearchDoc = (
  doc: OpenLibrarySearchDoc,
  media?: Media
): BookResult => {
  const isbn13 = doc.isbn
    ?.map((isbn) => normalizeValidIsbn(isbn))
    .find((isbn): isbn is string => !!isbn);
  const workId = normalizeOpenLibraryWorkId(doc.key);

  return {
    id: workId,
    provider: 'openlibrary',
    mediaType: 'book',
    bookFormat: 'ebook',
    title: doc.title,
    author: doc.author_name?.[0],
    authorId: doc.author_key?.[0],
    firstPublishYear: doc.first_publish_year,
    posterPath: doc.cover_i
      ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`
      : undefined,
    isbn13,
    editionId: doc.edition_key?.[0],
    editionCount: doc.edition_count,
    ratingsAverage: doc.ratings_average,
    ratingsCount: doc.ratings_count,
    wantToReadCount: doc.want_to_read_count,
    publisher: doc.publisher?.[0],
    languages: doc.language,
    mediaInfo: media,
  };
};

export const mapOpenLibraryAuthorSearchDoc = (doc: {
  key: string;
  name: string;
  top_work?: string;
  work_count?: number;
  birth_date?: string;
  death_date?: string;
}): AuthorResult => {
  const id = doc.key.replace(/^\/?authors\//, '');

  return {
    id,
    provider: 'openlibrary',
    mediaType: 'author',
    name: doc.name,
    posterPath: `https://covers.openlibrary.org/a/olid/${encodeURIComponent(id)}-L.jpg`,
    topWork: doc.top_work,
    workCount: doc.work_count,
    birthDate: doc.birth_date,
    deathDate: doc.death_date,
  };
};

export const mapOpenLibraryWork = (
  work: OpenLibraryWork,
  media?: Media,
  editions: OpenLibraryEdition[] = [],
  userWatchlist?: boolean,
  authorName?: string
): BookDetails => {
  const description =
    typeof work.description === 'string'
      ? work.description
      : work.description?.value;
  const coverId = work.covers?.[0];
  const isbnCandidates = mapEditionIsbnCandidates(editions);
  const selectedCandidate = isbnCandidates[0];
  const publisher = editions
    .flatMap((edition) => edition.publishers ?? [])
    .map((name) => name.trim())
    .find(Boolean);

  return {
    id: normalizeOpenLibraryWorkId(work.key),
    provider: 'openlibrary',
    mediaType: 'book',
    title: work.title,
    author: authorName,
    authorId: work.authors?.[0]?.author.key.replace('/authors/', ''),
    firstPublishYear: work.first_publish_date
      ? Number(work.first_publish_date.match(/\d{4}/)?.[0])
      : undefined,
    posterPath: coverId
      ? `https://covers.openlibrary.org/b/id/${coverId}-L.jpg`
      : undefined,
    isbn13: selectedCandidate?.isbn,
    editionId: selectedCandidate?.editionId,
    isbnCandidates,
    publisher,
    numberOfPages: editions.find(
      (edition) =>
        Number.isFinite(edition.number_of_pages) &&
        (edition.number_of_pages ?? 0) > 0
    )?.number_of_pages,
    description,
    subjects: work.subjects?.slice(0, 20),
    mediaInfo: media,
    onUserWatchlist: userWatchlist,
  };
};

export const mapOpenLibraryAuthorWork = (
  work: OpenLibraryAuthorWork,
  media?: Media,
  authorName?: string,
  authorId?: string
): BookResult => {
  const coverId = work.covers?.[0];

  return {
    id: normalizeOpenLibraryWorkId(work.key),
    provider: 'openlibrary',
    mediaType: 'book',
    title: work.title,
    author: authorName,
    authorId,
    firstPublishYear: work.first_publish_date
      ? Number(work.first_publish_date.match(/\d{4}/)?.[0])
      : undefined,
    subjects: work.subjects,
    languages: work.languages?.map((language) =>
      language.key.replace(/^\/?languages\//, '')
    ),
    posterPath: coverId
      ? `https://covers.openlibrary.org/b/id/${coverId}-L.jpg`
      : undefined,
    mediaInfo: media,
  };
};
