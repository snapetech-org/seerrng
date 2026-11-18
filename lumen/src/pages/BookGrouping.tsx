import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { type BookResult, bookArt } from '../api';
import { BookCard, GridSkeleton, Section } from '../components/cards';
import { DetailTop } from '../components/detail';
import { ServiceNote } from '../components/extra';
import ReaderShelf from '../components/ReaderShelf';
import { useApi } from '../hooks';

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

function Books({ books, title }: { books: BookResult[]; title: string }) {
  return (
    <Section title={title}>
      {books.length ? (
        <div className="grid">
          {books.map((book) => (
            <BookCard key={book.id} b={book} />
          ))}
        </div>
      ) : (
        <p className="note">No books found.</p>
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
  const author = useApi<Author>(
    `/author/${encodeURIComponent(id)}?limit=${pageSize}&offset=${offset}`,
    { currentPathOnly: true }
  );
  const data = author.data;
  if (!data)
    return (
      <Loading title="Author" error={author.error} reload={author.reload} />
    );
  const nextOffset = data.pagination.offset + data.works.length;
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
          <ReaderShelf
            target={{ type: 'book-series', id: data.id, name: data.title }}
          />
        </div>
        {data.description && <p className="ov">{data.description}</p>}
        <Books books={books} title="Books in This Series" />
      </div>
    </article>
  );
}

export default function BookGrouping({ kind }: { kind: 'author' | 'series' }) {
  const { id = '' } = useParams();
  return kind === 'author' ? (
    <AuthorDetail key={id} id={id} />
  ) : (
    <SeriesDetail key={id} id={id} />
  );
}
