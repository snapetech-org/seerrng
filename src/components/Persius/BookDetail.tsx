import Button from '@app/components/Common/Button';
import CachedImage from '@app/components/Common/CachedImage';
import { encodeApiPathSegment } from '@app/utils/apiPath';
import { normalizeBookOverviewMarkdown } from '@app/utils/bookMarkdown';
import { getSafeMarkdownHref } from '@app/utils/safeUrl';
import { CheckIcon } from '@heroicons/react/24/outline';
import { MediaRequestStatus, MediaStatus } from '@server/constants/media';
import type { BookDetails, BookResult } from '@server/models/Book';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useIntl } from 'react-intl';
import ReactMarkdown from 'react-markdown';
import useSWR from 'swr';
import { duration } from './format';
import { ClosedBookIcon, HeadphonesIcon } from './Icons';
import messages from './messages';

const RequestModal = dynamic(() => import('@app/components/RequestModal'), {
  ssr: false,
});
type Format = 'ebook' | 'audiobook';
type Coverage = { format: Format; available: boolean; requested: boolean };
const identity = (value?: string) =>
  value?.normalize('NFKC').trim().toLocaleLowerCase().replace(/\s+/g, ' ');

export function NarrationPicker({
  book,
  available,
  requested,
  canRequest,
  playback,
  onChanged,
}: {
  book: BookDetails;
  available: boolean;
  requested?: boolean;
  canRequest: boolean;
  playback?: ReactNode;
  onChanged?: () => void;
}) {
  const intl = useIntl();
  const [selectedId, setSelectedId] = useState(book.id);
  const [requestId, setRequestId] = useState<string>();
  const autoSelected = useRef(false);
  const { data, error, mutate } = useSWR<{ results: BookResult[] }>(
    `/api/v1/discover/books?query=${encodeURIComponent(book.title.slice(0, 160))}&format=audiobook&responseVersion=3`,
    { revalidateOnFocus: false }
  );
  useEffect(() => {
    setSelectedId(book.id);
    setRequestId(undefined);
    autoSelected.current = false;
  }, [book.id]);
  const recordings = useMemo(() => {
    const candidates = (data?.results ?? []).filter(
      (candidate) =>
        identity(candidate.title) === identity(book.title) &&
        Boolean(book.author) &&
        identity(candidate.author) === identity(book.author) &&
        candidate.id !== book.id
    );
    return [
      ...new Map(
        [book, ...candidates].map((candidate) => [candidate.id, candidate])
      ).values(),
    ];
  }, [book, data]);
  const selected = recordings.find((item) => item.id === selectedId) ?? book;
  const inLibrary = useCallback(
    (item: BookResult) =>
      item.id === book.id
        ? available
        : Boolean(
            item.mediaInfo &&
            ((item.mediaInfo.audiobookLibraryServiceId != null &&
              item.mediaInfo.audiobookLibraryItemId) ||
              (item.mediaInfo.audiobookServiceId != null &&
                item.mediaInfo.audiobookExternalServiceId != null))
          ),
    [available, book.id]
  );
  useEffect(() => {
    if (data && !autoSelected.current) {
      autoSelected.current = true;
      if (available) {
        const next = recordings.find((item) => !inLibrary(item));
        if (next) setSelectedId(next.id);
      }
    }
  }, [data, available, recordings, inLibrary]);
  const pending =
    selected.id === book.id
      ? requested
      : selected.mediaInfo?.requests?.some(
          (request) =>
            (request.bookFormat === 'audiobook' ||
              request.bookFormat === 'both') &&
            (request.status === MediaRequestStatus.PENDING ||
              request.status === MediaRequestStatus.APPROVED)
        );
  return (
    <section>
      <div className="persius-section-header">
        <h2 className="page-heading">
          {intl.formatMessage(messages.narrations)}
        </h2>
        <small>
          {intl.formatMessage(messages.recordings, {
            count: recordings.length,
          })}
        </small>
      </div>
      <p className="persius-narration-hint">
        {intl.formatMessage(messages.narrationHint)}
      </p>
      <fieldset className="persius-recordings">
        <legend className="sr-only">
          {intl.formatMessage(messages.narrations)}
        </legend>
        {recordings.map((recording) => (
          <div
            className="persius-recording"
            key={recording.id}
            data-selected={selected.id === recording.id}
            data-available={inLibrary(recording)}
          >
            <label className="persius-recording-choice">
              <input
                type="radio"
                name={`narration-${book.id}`}
                value={recording.id}
                checked={selected.id === recording.id}
                onChange={() => setSelectedId(recording.id)}
              />
              <span className="persius-recording-cover">
                {recording.posterPath ? (
                  <CachedImage
                    type="book"
                    src={recording.posterPath}
                    alt=""
                    fill
                    sizes="64px"
                  />
                ) : (
                  <HeadphonesIcon aria-hidden="true" />
                )}
              </span>
              <span className="persius-recording-copy">
                <strong>
                  {recording.narrators?.join(', ') ||
                    intl.formatMessage(messages.narratorUnknown)}
                </strong>
                <small>
                  {[
                    duration(
                      recording.audiobookDuration
                        ? recording.audiobookDuration / 60
                        : undefined
                    ),
                    recording.publisher,
                    recording.firstPublishYear,
                  ]
                    .filter(Boolean)
                    .join(' · ') || intl.formatMessage(messages.unknown)}
                </small>
                {inLibrary(recording) && (
                  <span className="persius-status" data-tone="success">
                    <CheckIcon aria-hidden="true" />
                    {intl.formatMessage(messages.inLibrary)}
                  </span>
                )}
              </span>
            </label>
            {recording.id === book.id && available && (
              <div className="persius-recording-actions">{playback}</div>
            )}
          </div>
        ))}
      </fieldset>
      {error && (
        <p className="persius-narration-hint" role="status">
          {intl.formatMessage(messages.failed)}{' '}
          <Button onClick={() => void mutate()}>
            {intl.formatMessage(messages.retry)}
          </Button>
        </p>
      )}
      {!inLibrary(selected) && (
        <Button
          className="persius-request-recording"
          buttonType="primary"
          disabled={
            !canRequest ||
            pending ||
            selected.mediaInfo?.status === MediaStatus.BLOCKLISTED
          }
          onClick={() => setRequestId(selected.id)}
        >
          {intl.formatMessage(
            pending
              ? messages.requested
              : selected.narrators?.length
                ? messages.requestRecording
                : messages.request,
            { narrator: selected.narrators?.join(', ') }
          )}
        </Button>
      )}
      {requestId && (
        <RequestModal
          key={requestId}
          bookId={requestId}
          type="book"
          initialBookFormat="audiobook"
          show
          onCancel={() => setRequestId(undefined)}
          onComplete={() => {
            setRequestId(undefined);
            void mutate();
            onChanged?.();
          }}
        />
      )}
    </section>
  );
}

export default function BookDetail({
  data,
  coverage,
  format,
  onFormatChange,
  actions,
  playback,
  extra,
  canRequest,
  onChanged,
}: {
  data: BookDetails;
  coverage: Coverage[];
  format: Format;
  onFormatChange: (format: Format) => void;
  actions: ReactNode;
  playback?: ReactNode;
  extra?: ReactNode;
  canRequest: boolean;
  onChanged?: () => void;
}) {
  const intl = useIntl();
  const description = (
    <ReactMarkdown skipHtml urlTransform={getSafeMarkdownHref}>
      {normalizeBookOverviewMarkdown(data.description || '')}
    </ReactMarkdown>
  );
  return (
    <article
      className="persius-detail"
      data-media-type="book"
      data-book-format={format}
    >
      <header className="persius-detail-hero">
        {data.posterPath && (
          <CachedImage
            type="book"
            src={data.posterPath}
            alt=""
            fill
            priority
            sizes="1320px"
            className="persius-detail-backdrop"
          />
        )}
        <div className="persius-detail-identity">
          <div className="persius-detail-poster">
            <CachedImage
              type="book"
              src={data.posterPath || '/images/seerr_poster_not_found.png'}
              alt=""
              fill
              sizes="220px"
              priority
            />
          </div>
          <div>
            <h1 className="page-title" data-testid="media-title">
              {data.title}
            </h1>
            {data.author && (
              <p className="persius-detail-author">
                {intl.formatMessage(messages.byAuthor, { author: data.author })}
                {data.series?.[0] && (
                  <>
                    {' '}
                    ·{' '}
                    <Link
                      href={`/book-series?query=${encodeURIComponent(data.series[0].title)}&format=${format}`}
                    >
                      {data.series[0].title}
                      {data.series[0].position
                        ? ` #${data.series[0].position}`
                        : ''}
                    </Link>
                  </>
                )}
              </p>
            )}
            <p className="persius-detail-meta">
              {[
                data.firstPublishYear,
                data.numberOfPages
                  ? intl.formatMessage(messages.pages, {
                      count: data.numberOfPages,
                    })
                  : undefined,
                duration(
                  data.audiobookDuration
                    ? data.audiobookDuration / 60
                    : undefined
                ),
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
        </div>
      </header>
      <div
        className="persius-format-tiles"
        role="group"
        aria-label={intl.formatMessage(messages.books)}
      >
        {coverage.map((item) => (
          <button
            key={item.format}
            type="button"
            aria-pressed={format === item.format}
            onClick={() => onFormatChange(item.format)}
          >
            <strong>
              {item.format === 'ebook' ? (
                <ClosedBookIcon aria-hidden="true" />
              ) : (
                <HeadphonesIcon aria-hidden="true" />
              )}
              {intl.formatMessage(
                item.format === 'ebook' ? messages.ebooks : messages.audiobooks
              )}
            </strong>
            <small data-available={item.available}>
              {intl.formatMessage(
                item.available
                  ? messages.inLibrary
                  : item.requested
                    ? messages.requested
                    : messages.notYet
              )}
            </small>
          </button>
        ))}
      </div>
      <div className="persius-detail-columns">
        <div>
          {format === 'audiobook' ? (
            <NarrationPicker
              book={data}
              available={Boolean(
                coverage.find((item) => item.format === 'audiobook')?.available
              )}
              requested={
                coverage.find((item) => item.format === 'audiobook')?.requested
              }
              playback={playback}
              canRequest={canRequest}
              onChanged={onChanged}
            />
          ) : (
            <>
              <div className="persius-overview">{description}</div>
              <div className="persius-tools">
                {playback}
                {actions}
              </div>
            </>
          )}
          <details className="persius-secondary">
            <summary>{intl.formatMessage(messages.details)}</summary>
            <div className="persius-tools">
              {format === 'audiobook' && actions}
              {extra}
            </div>
          </details>
        </div>
        <aside>
          <h2 className="page-heading">
            {intl.formatMessage(messages.aboutBook)}
          </h2>
          {format === 'audiobook' && (
            <div className="persius-overview">{description}</div>
          )}
          <div className="persius-subjects">
            {data.subjects?.slice(0, 8).map((subject) => (
              <Link
                key={subject}
                href={`/discover/books?subject=${encodeURIComponent(subject)}&format=${format}`}
              >
                {subject}
              </Link>
            ))}
          </div>
          {data.authorId && (
            <Link
              className="persius-author-link"
              href={`/author/${encodeApiPathSegment(data.authorId)}`}
            >
              {data.author}
            </Link>
          )}
        </aside>
      </div>
    </article>
  );
}
