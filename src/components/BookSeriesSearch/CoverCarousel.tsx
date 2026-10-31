import defineMessages from '@app/utils/defineMessages';
import {
  BookOpenIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from '@heroicons/react/24/outline';
import type { BookSeriesCovers } from '@server/models/BookSeries';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

const messages = defineMessages('components.BookSeriesSearch.CoverCarousel', {
  covers: 'Book covers in {series}',
  previous: 'Previous book covers',
  next: 'Next book covers',
  open: 'Open {series}: {book}',
  roleDescription: 'carousel',
});

function Cover({ book }: { book: BookSeriesCovers['books'][number] }) {
  const [failed, setFailed] = useState(false);
  return book.coverUrl && !failed ? (
    <Image
      src={book.coverUrl}
      alt={book.title}
      width={72}
      height={108}
      unoptimized
      loading="lazy"
      className="h-28 w-[4.5rem] rounded object-cover"
      onError={() => setFailed(true)}
    />
  ) : (
    <div
      className="flex h-28 w-[4.5rem] items-center justify-center rounded bg-gray-700 text-gray-300"
      role="img"
      aria-label={book.title}
    >
      <BookOpenIcon className="h-8 w-8" aria-hidden="true" />
    </div>
  );
}

export default function CoverCarousel({
  href,
  title,
}: {
  href: string;
  title: string;
}) {
  const intl = useIntl();
  const container = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLUListElement>(null);
  const [visible, setVisible] = useState(false);
  const [edges, setEdges] = useState({ start: true, end: true });
  useEffect(() => {
    const node = container.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '150px' }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const target = new URL(href, 'http://series.local');
  const native = /^\/book-series\/([1-9]\d*)$/.exec(target.pathname);
  const query = native
    ? `seriesId=${native[1]}`
    : target.searchParams.toString();
  const { data } = useSWR<BookSeriesCovers>(
    visible ? `/api/v1/book-series/covers?${query}` : null,
    {
      revalidateOnFocus: false,
      shouldRetryOnError: false,
      dedupingInterval: 300000,
    }
  );
  useEffect(() => {
    const node = track.current;
    if (!node) return;
    const update = () =>
      setEdges({
        start: node.scrollLeft <= 1,
        end: node.scrollLeft + node.clientWidth >= node.scrollWidth - 1,
      });
    const observer = new ResizeObserver(update);
    observer.observe(node);
    node.addEventListener('scroll', update, { passive: true });
    update();
    return () => {
      observer.disconnect();
      node.removeEventListener('scroll', update);
    };
  }, [data]);
  const scroll = (direction: number) => {
    const node = track.current;
    if (node)
      node.scrollBy({
        left: direction * Math.max(80, node.clientWidth * 0.8),
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
          ? 'auto'
          : 'smooth',
      });
  };
  return (
    <div ref={container} className="relative z-10 min-w-0">
      {!!data?.books.length && (
        <div
          className="mt-3"
          role="group"
          aria-roledescription={intl.formatMessage(messages.roleDescription)}
          aria-label={intl.formatMessage(messages.covers, { series: title })}
        >
          <div className="mb-2 flex justify-end gap-1">
            <button
              type="button"
              disabled={edges.start}
              onClick={() => scroll(-1)}
              aria-label={intl.formatMessage(messages.previous)}
              className="rounded border border-gray-600 p-1 text-gray-200 hover:bg-gray-700 focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-30"
            >
              <ChevronLeftIcon className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              disabled={edges.end}
              onClick={() => scroll(1)}
              aria-label={intl.formatMessage(messages.next)}
              className="rounded border border-gray-600 p-1 text-gray-200 hover:bg-gray-700 focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-30"
            >
              <ChevronRightIcon className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <ul
            ref={track}
            tabIndex={0}
            aria-label={intl.formatMessage(messages.covers, { series: title })}
            className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none"
          >
            {data.books.map((book, index) => (
              <li
                key={`${index}:${book.coverUrl ?? book.title}`}
                className="w-[4.5rem] shrink-0 snap-start"
              >
                <Link
                  href={href}
                  title={book.title}
                  aria-label={intl.formatMessage(messages.open, {
                    series: title,
                    book: book.title,
                  })}
                  className="block rounded focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none"
                >
                  <Cover book={book} />
                  <span className="mt-1 block truncate text-xs text-gray-300">
                    {book.title}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
