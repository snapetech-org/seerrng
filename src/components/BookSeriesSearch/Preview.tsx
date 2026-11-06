import BookSeriesWatch from '@app/components/BookSeriesWatch';
import Button from '@app/components/Common/Button';
import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import PageTitle from '@app/components/Common/PageTitle';
import BulkRequestModal from '@app/components/RequestModal/BulkRequestModal';
import { Permission, useUser } from '@app/hooks/useUser';
import defineMessages from '@app/utils/defineMessages';
import type { BookSeriesPreview } from '@server/models/BookSeries';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useMemo, useState } from 'react';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

const messages = defineMessages('components.BookSeriesPreview', {
  title: 'Series Catalog Preview',
  scope:
    'A preview from your book server’s catalog. It may not list every book. Previewing does not request books or enable monitoring.',
  manage: 'Open in {server}',
  hint: 'Choose books and formats to request. Your book server handles monitoring and downloads.',
  request: 'Request Selected Books',
  unmatched: 'No verified book match — requests unavailable',
  ambiguous: 'Conflicting book matches — requests unavailable',
  unresolved: 'Book identity could not be checked — try again',
  truncated:
    'Only the first 100 distinct books were checked for requests. Other entries remain visible.',
  unavailable: 'This series preview could not be loaded.',
  retry: 'Try Again',
  search: 'Search Book Series',
  empty: 'No books were included in this preview.',
  ebook: 'Books',
  audiobook: 'Audiobooks',
});

export default function BookSeriesPreview() {
  const intl = useIntl();
  const router = useRouter();
  const { hasPermission } = useUser();
  const [showRequest, setShowRequest] = useState(false);
  const [routeReady, setRouteReady] = useState(false);
  useEffect(() => {
    if (router.isReady) setRouteReady(true);
  }, [router.isReady]);
  const { serverId, scope, providerId } = router.query;
  const params =
    typeof serverId === 'string' &&
    typeof scope === 'string' &&
    typeof providerId === 'string'
      ? new URLSearchParams({ serverId, scope, providerId }).toString()
      : undefined;
  const { data, error, mutate } = useSWR<BookSeriesPreview>(
    routeReady && params ? `/api/v1/book-series/catalog?${params}` : null,
    {
      keepPreviousData: false,
      revalidateOnFocus: false,
      shouldRetryOnError: false,
    }
  );
  const items = useMemo(
    () =>
      (data?.books ?? []).flatMap((entry) => {
        const book = entry.book;
        if (entry.matchStatus !== 'matched' || !book) return [];
        return [
          {
            id: book.id,
            title: entry.title,
            year: book.firstPublishYear,
            image: book.posterPath,
            artist: book.author,
            isbn13: book.isbn13,
            authorId: book.authorId,
            mediaInfo: book.mediaInfo,
          },
        ];
      }),
    [data]
  );
  if (!routeReady || (params && !data && !error)) return <LoadingSpinner />;
  if (!data)
    return (
      <div className="mt-6 space-y-4">
        <p>{intl.formatMessage(messages.unavailable)}</p>
        <Button onClick={() => mutate()}>
          {intl.formatMessage(messages.retry)}
        </Button>
        <Link href="/book-series">{intl.formatMessage(messages.search)}</Link>
      </div>
    );
  return (
    <>
      <PageTitle title={data.title} />
      {showRequest && (
        <BulkRequestModal
          key={params}
          show
          bookSeries
          mediaType="book"
          initialBookFormat={data.format}
          unresolvedBookTitles={data.books
            .filter((b) => b.matchStatus !== 'matched' || !b.book)
            .map((b) => b.title)}
          title={data.title}
          initialItems={items}
          onCancel={() => setShowRequest(false)}
          onComplete={() => mutate()}
        />
      )}
      <p className="mt-6 text-sm text-gray-400">
        {intl.formatMessage(messages.title)}
      </p>
      <h1 className="my-3 text-3xl font-bold text-white">{data.title}</h1>
      <p className="mb-4 text-gray-300">
        {data.serverName} ·{' '}
        {intl.formatMessage(
          data.format === 'audiobook' ? messages.audiobook : messages.ebook
        )}
      </p>
      <p className="mb-4 text-gray-300">{intl.formatMessage(messages.scope)}</p>
      {data.description && (
        <p className="mb-4 whitespace-pre-line text-gray-300">
          {data.description}
        </p>
      )}
      <p className="mb-4 text-sm text-gray-400">
        {intl.formatMessage(messages.hint)}
      </p>
      <div className="mb-6 flex flex-wrap items-center gap-4">
        {hasPermission([Permission.REQUEST, Permission.REQUEST_BOOK], {
          type: 'or',
        }) && (
          <Button
            buttonType="primary"
            disabled={!items.length}
            onClick={() => setShowRequest(true)}
          >
            {intl.formatMessage(messages.request)}
          </Button>
        )}
        {data.managementUrl && (
          <Button
            as="a"
            href={data.managementUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            {intl.formatMessage(messages.manage, { server: data.serverName })}
          </Button>
        )}
        <Link
          className="text-indigo-300 hover:underline"
          href={{
            pathname: '/book-series',
            query: { query: data.title, format: data.format },
          }}
        >
          {intl.formatMessage(messages.search)}
        </Link>
      </div>
      {typeof serverId === 'string' &&
        typeof scope === 'string' &&
        typeof providerId === 'string' && (
          <BookSeriesWatch
            key={params}
            target={{ serverId: Number(serverId), scope, providerId }}
          />
        )}
      {data.resolutionTruncated && (
        <p role="status" className="mb-4 text-gray-300">
          {intl.formatMessage(messages.truncated)}
        </p>
      )}
      {data.books.some((book) => book.matchStatus === 'unavailable') && (
        <Button onClick={() => mutate()}>
          {intl.formatMessage(messages.retry)}
        </Button>
      )}
      {!data.books.length && <p>{intl.formatMessage(messages.empty)}</p>}
      <ol className="divide-y divide-gray-700 rounded-lg border border-gray-700">
        {data.books.map((book, index) => (
          <li key={index} className="p-4">
            <span className="me-3 text-gray-400">{book.position}</span>
            {book.book ? (
              <Link
                className="font-semibold text-indigo-200 hover:underline"
                href={`/book/${book.book.id}`}
              >
                {book.title}
              </Link>
            ) : (
              <span className="font-semibold text-gray-100">{book.title}</span>
            )}
            {book.author && (
              <span className="ms-3 text-gray-400">{book.author}</span>
            )}
            {book.matchStatus !== 'matched' && (
              <p className="mt-2 text-sm text-gray-400">
                {intl.formatMessage(
                  book.matchStatus === 'ambiguous'
                    ? messages.ambiguous
                    : book.matchStatus === 'unavailable'
                      ? messages.unresolved
                      : messages.unmatched
                )}
              </p>
            )}
          </li>
        ))}
      </ol>
    </>
  );
}
