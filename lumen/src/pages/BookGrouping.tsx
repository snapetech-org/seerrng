import { useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  bookArt,
  bookMediaForFormat,
  MediaStatus,
  type BookResult,
} from '../api';
import BulkBookRequest from '../components/BulkBookRequest';
import { BookCard, GridSkeleton, Section } from '../components/cards';
import { DetailTop } from '../components/detail';
import { ServiceNote } from '../components/extra';
import ReaderShelf from '../components/ReaderShelf';
import { useApi } from '../hooks';
import { CollectionAssociations } from './Associations';
import BookSeriesCatalog from './BookSeriesCatalog';

interface Author {
  id: string;
  name: string;
  posterPath?: string;
  biography?: string;
  birthDate?: string;
  deathDate?: string;
  works: BookResult[];
  pagination: { offset: number; limit: number; totalItems: number };
}

interface Series {
  id: string;
  title: string;
  description?: string;
  books: BookResult[];
}

const pageSize = 20;

function Books({
  books,
  title,
  empty = 'No books found.',
}: {
  books: BookResult[];
  title: string;
  empty?: string;
}) {
  return (
    <Section title={title}>
      {books.length ? (
        <div className="grid">
          {books.map((book) => (
            <BookCard key={`${book.id}:${book.bookFormat ?? ''}`} b={book} />
          ))}
        </div>
      ) : (
        <p className="note">{empty}</p>
      )}
    </Section>
  );
}

function Loading({
  title,
  error,
  reload,
}: {
  title: string;
  error: string | null;
  reload: () => void;
}) {
  return (
    <>
      <header className="ph">
        <h1>{title}</h1>
      </header>
      <ServiceNote what={title.toLowerCase()} error={error} retry={reload} />
      {!error && <GridSkeleton className="grid" />}
    </>
  );
}

function AuthorDetail({ id }: { id: string }) {
  const [offsets, setOffsets] = useState([0]);
  const offset = offsets.at(-1) ?? 0;
  const path = `/author/${encodeURIComponent(id)}?limit=${pageSize}`;
  const firstPage = useApi<Author>(`${path}&offset=0`);
  const laterPage = useApi<Author>(offset ? `${path}&offset=${offset}` : null, {
    currentPathOnly: true,
  });
  const author = offset ? laterPage : firstPage;
  const data = author.data;
  if (!data)
    return (
      <Loading title="Author" error={author.error} reload={author.reload} />
    );
  const nextOffset = data.pagination.offset + data.works.length;
  const bibliography = firstPage.data;
  return (
    <article className="detail">
      <DetailTop
        title={data.name}
        poster={bookArt(data.posterPath, 'L')}
        whole
        line={[data.birthDate, data.deathDate]}
      />
      <div className="dbody">
        <div className="dstatus">
          {bibliography && (
            <BulkBookRequest
              source={{
                id: data.id,
                books: bibliography.works,
                nextOffset:
                  bibliography.works.length &&
                  bibliography.works.length < bibliography.pagination.totalItems
                    ? bibliography.works.length
                    : undefined,
              }}
              onComplete={() => {
                firstPage.reload();
                if (offset) laterPage.reload();
              }}
            />
          )}

          <ReaderShelf
            target={{ type: 'author', id: data.id, name: data.name }}
          />
        </div>
        {data.biography && <p className="ov">{data.biography}</p>}
        <Books books={data.works} title="Bibliography" />
        {data.pagination.totalItems > pageSize && (
          <div className="toolbar" aria-label="Bibliography Pages">
            <button
              className="btn btn-tonal btn-sm"
              type="button"
              disabled={!offset}
              onClick={() => setOffsets((pages) => pages.slice(0, -1))}
            >
              Previous
            </button>
            <button
              className="btn btn-tonal btn-sm"
              type="button"
              disabled={
                !data.works.length || nextOffset >= data.pagination.totalItems
              }
              onClick={() => setOffsets((pages) => [...pages, nextOffset])}
            >
              Next
            </button>
          </div>
        )}
      </div>
    </article>
  );
}

const emptyFilters = {
  format: '',
  year: '',
  subject: '',
  rating: '',
  language: '',
};

const languageNames = new Intl.DisplayNames(['en'], { type: 'language' });
const languageLabel = (code: string) =>
  /^[a-z]{2,3}$/i.test(code) ? (languageNames.of(code) ?? code) : code;

function hasTrackedFormat(book: BookResult, format: 'ebook' | 'audiobook') {
  const status = bookMediaForFormat(book.mediaInfo, format)?.status;
  return (
    status !== undefined &&
    status >= MediaStatus.PENDING &&
    status <= MediaStatus.AVAILABLE
  );
}

function SeriesBooks({ books }: { books: BookResult[] }) {
  const [filters, setFilters] = useState(emptyFilters);
  const { format, year, subject, rating, language } = filters;
  const filtered = books.filter((book) => {
    if (
      format === 'ebook' &&
      !hasTrackedFormat(book, 'ebook') &&
      hasTrackedFormat(book, 'audiobook')
    )
      return false;
    if (
      format === 'audiobook' &&
      !hasTrackedFormat(book, 'audiobook') &&
      hasTrackedFormat(book, 'ebook')
    )
      return false;
    if (
      year === 'older' &&
      (!book.firstPublishYear || book.firstPublishYear >= 1970)
    )
      return false;
    if (year && year !== 'older' && String(book.firstPublishYear) !== year)
      return false;
    if (
      subject &&
      !book.subjects?.some((value) => value.trim().toLowerCase() === subject)
    )
      return false;
    if (rating && (book.ratingsAverage ?? 0) < Number(rating)) return false;
    return (
      !language ||
      !!book.languages?.some((code) => code.toLowerCase() === language)
    );
  });
  const years = [
    ...new Set(
      books.flatMap((book) =>
        book.firstPublishYear ? [book.firstPublishYear] : []
      )
    ),
  ].sort((left, right) => right - left);
  const subjects = new Map<string, string>();
  for (const book of books) {
    for (const value of book.subjects ?? []) {
      const label = value.trim();
      if (label) subjects.set(label.toLowerCase(), label);
    }
  }
  const languages = [
    ...new Set(
      books.flatMap(
        (book) => book.languages?.map((code) => code.toLowerCase()) ?? []
      )
    ),
  ].sort();
  const toOption = (value: string) => [value, value] as const;
  const controls: [
    keyof typeof filters,
    string,
    readonly (readonly [string, string])[],
  ][] = [
    [
      'format',
      'Format',
      [
        ['ebook', 'Ebooks'],
        ['audiobook', 'Audiobooks'],
      ],
    ],
    [
      'year',
      'First Published',
      [
        ...years
          .filter((value) => value >= 1970)
          .map((value) => toOption(String(value))),
        ...(years.some((value) => value < 1970)
          ? [['older', 'Before 1970'] as const]
          : []),
      ],
    ],
    [
      'subject',
      'Subject',
      [...subjects].sort((left, right) => left[1].localeCompare(right[1])),
    ],
    [
      'rating',
      'Minimum Rating',
      Array.from({ length: 9 }, (_, index) => {
        const score = (1 + index * 0.5).toFixed(1);
        return [score, `${score}+`];
      }),
    ],
    [
      'language',
      'Language',
      languages.map((code) => [code, languageLabel(code)]),
    ],
  ];
  return (
    <>
      <div className="toolbar" role="group" aria-label="Book Series Filters">
        {controls.map(([key, label, options]) => (
          <label className="sel" key={key}>
            <span className="lbl">{label}</span>
            <select
              value={filters[key]}
              onChange={(event) => {
                const value = event.target.value;
                setFilters((previous) => ({ ...previous, [key]: value }));
              }}
            >
              <option value="">Any</option>
              {options.map(([value, text]) => (
                <option key={value} value={value}>
                  {text}
                </option>
              ))}
            </select>
          </label>
        ))}
        {Object.values(filters).some(Boolean) && (
          <button
            className="btn btn-quiet btn-sm"
            type="button"
            onClick={() => setFilters(emptyFilters)}
          >
            Clear Filters
          </button>
        )}
      </div>
      <Books
        books={
          format
            ? filtered.map((book) => ({ ...book, bookFormat: format }))
            : filtered
        }
        title="Books in This Series"
        empty={
          books.length ? 'No books match these filters.' : 'No books found.'
        }
      />
    </>
  );
}

function SeriesDetail({ id }: { id: string }) {
  const series = useApi<Series>(`/series/${encodeURIComponent(id)}`, {
    currentPathOnly: true,
  });
  const data = series.data;
  if (!data)
    return (
      <Loading
        title="Book Series"
        error={series.error}
        reload={series.reload}
      />
    );
  const position = (book: BookResult) => {
    const value = book.series?.find(
      (entry) =>
        entry.id === data.id ||
        entry.title?.toLowerCase() === data.title.toLowerCase()
    )?.position;
    const number = value?.trim() ? Number(value) : NaN;
    return Number.isFinite(number) ? number : Infinity;
  };
  const books = [...data.books].sort(
    (left, right) =>
      position(left) - position(right) ||
      left.title.localeCompare(right.title, undefined, { numeric: true })
  );
  return (
    <article className="detail">
      <DetailTop
        title={data.title}
        poster={bookArt(books[0]?.posterPath, 'L')}
        whole
        line={[books.length === 1 ? '1 book' : `${books.length} books`]}
      />
      <div className="dbody">
        <div className="dstatus">
          <BulkBookRequest
            source={{ id: data.id, books }}
            onComplete={series.reload}
          />

          <ReaderShelf
            target={{ type: 'book-series', id: data.id, name: data.title }}
          />
          {books.length > 0 && (
            <CollectionAssociations
              key={books.map(({ id }) => id).join(',')}
              mediaType="book"
              parts={books}
            />
          )}
        </div>
        {data.description && <p className="ov">{data.description}</p>}
        {books.length > 0 ? (
          <SeriesBooks books={books} />
        ) : (
          <Books books={books} title="Books in This Series" />
        )}
      </div>
    </article>
  );
}

export default function BookGrouping({ kind }: { kind: 'author' | 'series' }) {
  const { id = '' } = useParams();
  return kind === 'author' ? (
    <AuthorDetail key={id} id={id} />
  ) : /^[1-9]\d*$/.test(id) ? (
    <BookSeriesCatalog key={id} />
  ) : (
    <SeriesDetail key={id} id={id} />
  );
}
