import InlineBookSeriesResults from '@app/components/BookSeriesSearch/InlineResults';
import BookSeriesWatch from '@app/components/BookSeriesWatch';
import Button from '@app/components/Common/Button';
import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import PageTitle from '@app/components/Common/PageTitle';
import BulkRequestModal from '@app/components/RequestModal/BulkRequestModal';
import { Permission, useUser } from '@app/hooks/useUser';
import { encodeApiPathSegment } from '@app/utils/apiPath';
import defineMessages from '@app/utils/defineMessages';
import { MediaRequestStatus, MediaStatus } from '@server/constants/media';
import type Media from '@server/entity/Media';
import type { BookSeriesDetails as SeriesDetails } from '@server/models/BookSeries';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useMemo, useState } from 'react';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

const messages = defineMessages('components.BackendBookSeriesDetails', {
  series: 'Book Series',
  linkedBooks: 'Books in Series',
  search: 'Search Book Series',
  manage: 'Manage Series in {server}',
  request: 'Request Selected Books',
  extras: 'Include companion books and other extras in requests',
  extra: 'Extra',
  source: '{server} · {format}',
  scope:
    'Series membership and reading order from your book server, including books you have not downloaded.',
  unclassified:
    'The server has not classified primary and extra entries for every book.',
  unmatched: 'No verified book match — requests unavailable',
  ambiguous: 'Multiple book matches — requests unavailable',
  unavailable:
    'This series could not be loaded. Check the book server connection or try again later.',
  retry: 'Try Again',
  truncated:
    'This series is too large to show in full. Only the first 500 entries are shown and included in requests.',
  ebook: 'Book',
  audiobook: 'Audiobook',
  managed: 'In library manager',
  pending: 'Requested',
  missing: 'Not requested',
  blocked: 'Blocked',
  position: 'Book {position}',
  noBooks: 'No books have been listed for this series yet.',
  description:
    'Request selected books, or use Monitor Series for ongoing monitoring. Your book server handles searches and downloads.',
});

export default function BookSeriesDetails() {
  const intl = useIntl();
  const router = useRouter();
  const { hasPermission } = useUser();
  const [showRequest, setShowRequest] = useState(false);
  const [includeExtras, setIncludeExtras] = useState(false);
  const seriesId =
    typeof router.query.seriesId === 'string'
      ? router.query.seriesId
      : undefined;
  const { data, error, mutate } = useSWR<SeriesDetails>(
    seriesId ? `/api/v1/book-series/${encodeApiPathSegment(seriesId)}` : null,
    {
      keepPreviousData: false,
      revalidateOnFocus: false,
      shouldRetryOnError: false,
    }
  );
  const items = useMemo(
    () =>
      (data?.entries ?? []).flatMap((entry) => {
        const book = entry.book;
        if (!book || (!includeExtras && entry.primary === false)) return [];
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
    [data, includeExtras]
  );
  if (!data && !error) return <LoadingSpinner />;
  if (!data)
    return (
      <div className="mt-8 space-y-4 text-gray-300">
        <p>{intl.formatMessage(messages.unavailable)}</p>
        <Button onClick={() => mutate()}>
          {intl.formatMessage(messages.retry)}
        </Button>
      </div>
    );
  const formatStatus = (
    media: Media | undefined,
    format: 'ebook' | 'audiobook'
  ) => {
    const serviceId =
      format === 'ebook'
        ? media?.externalServiceId
        : media?.audiobookExternalServiceId;
    const requested = media?.requests?.some(
      (request) =>
        ![
          MediaRequestStatus.DECLINED,
          MediaRequestStatus.FAILED,
          MediaRequestStatus.COMPLETED,
        ].includes(request.status) &&
        ((request.bookFormat ?? 'ebook') === format ||
          request.bookFormat === 'both')
    );
    return intl.formatMessage(
      media?.status === MediaStatus.BLOCKLISTED
        ? messages.blocked
        : serviceId != null
          ? messages.managed
          : requested
            ? messages.pending
            : messages.missing
    );
  };
  return (
    <>
      <PageTitle title={data.title} />
      {showRequest && (
        <BulkRequestModal
          show
          bookSeries
          librarySubset
          initialBookFormat={data.format}
          mediaType="book"
          title={data.title}
          initialItems={items}
          onCancel={() => setShowRequest(false)}
          onComplete={() => mutate()}
        />
      )}
      <div className="mt-6 mb-8 space-y-4">
        <p className="text-sm text-gray-400">
          {intl.formatMessage(messages.series)}
        </p>
        <h1 className="page-title">{data.title}</h1>
        <Link
          className="inline-block text-indigo-300 hover:underline"
          href={{ pathname: '/book-series', query: { format: data.format } }}
        >
          {intl.formatMessage(messages.search)}
        </Link>
        {data.managementUrl && hasPermission(Permission.MANAGE_REQUESTS) && (
          <Button
            as="a"
            href={data.managementUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            {intl.formatMessage(messages.manage, { server: data.serverName })}
          </Button>
        )}
        <p className="text-sm text-gray-400">
          {intl.formatMessage(messages.source, {
            server: data.serverName,
            format: intl.formatMessage(
              data.format === 'audiobook' ? messages.audiobook : messages.ebook
            ),
          })}
        </p>
        <p className="text-sm text-gray-300">
          {intl.formatMessage(messages.scope)}
        </p>
        {data.entries.some((entry) => entry.primary === undefined) && (
          <p className="text-sm text-gray-400">
            {intl.formatMessage(messages.unclassified)}
          </p>
        )}
        {data.description && (
          <p className="max-w-4xl whitespace-pre-line text-gray-300">
            {data.description}
          </p>
        )}
        <p className="text-sm text-gray-400">
          {intl.formatMessage(messages.description)}
        </p>
        {data.truncated && (
          <p role="status" className="rounded bg-yellow-900 p-3">
            {intl.formatMessage(messages.truncated)}
          </p>
        )}
        {hasPermission([Permission.REQUEST, Permission.REQUEST_BOOK], {
          type: 'or',
        }) && (
          <div className="flex flex-wrap items-center gap-4">
            <Button
              buttonType="primary"
              disabled={!items.length}
              onClick={() => setShowRequest(true)}
            >
              {intl.formatMessage(messages.request)}
            </Button>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={includeExtras}
                onChange={(event) => setIncludeExtras(event.target.checked)}
              />
              {intl.formatMessage(messages.extras)}
            </label>
          </div>
        )}
      </div>
      {data.watchTarget && (
        <BookSeriesWatch key={data.id} target={data.watchTarget} />
      )}
      <h2 className="mb-4 text-xl font-semibold text-white">
        {intl.formatMessage(messages.linkedBooks)}
      </h2>
      {!data.entries.length && <p>{intl.formatMessage(messages.noBooks)}</p>}
      <ol className="divide-y divide-gray-700 rounded-lg border border-gray-700">
        {data.entries.map((entry, index) => (
          <li
            key={`${entry.providerId}:${index}`}
            className="flex flex-wrap items-center justify-between gap-3 p-4"
          >
            <div>
              <div className="mb-1 text-xs text-gray-400">
                {entry.position !== undefined &&
                  intl.formatMessage(messages.position, {
                    position: entry.position,
                  })}
                {entry.primary === false &&
                  `${entry.position !== undefined ? ' · ' : ''}${intl.formatMessage(messages.extra)}`}
              </div>
              {entry.book ? (
                <Link
                  className="font-semibold text-indigo-200 hover:underline"
                  href={`/book/${encodeApiPathSegment(entry.book.id)}`}
                >
                  {entry.title}
                </Link>
              ) : (
                <span className="font-semibold text-gray-200">
                  {entry.title}
                </span>
              )}
            </div>
            {entry.book ? (
              <div className="flex flex-wrap gap-4 text-sm text-gray-300">
                <span>
                  {intl.formatMessage(messages.ebook)}:{' '}
                  {formatStatus(entry.book.mediaInfo, 'ebook')}
                </span>
                <span>
                  {intl.formatMessage(messages.audiobook)}:{' '}
                  {formatStatus(entry.book.mediaInfo, 'audiobook')}
                </span>
              </div>
            ) : (
              <span className="text-sm text-gray-400">
                {intl.formatMessage(
                  entry.matchStatus === 'ambiguous'
                    ? messages.ambiguous
                    : messages.unmatched
                )}
              </span>
            )}
          </li>
        ))}
      </ol>
      <div className="mt-8">
        <InlineBookSeriesResults
          query={data.title}
          format={data.format}
          catalogOnly
        />
      </div>
    </>
  );
}
