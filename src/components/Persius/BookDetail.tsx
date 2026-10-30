import Button from '@app/components/Common/Button';
import CachedImage from '@app/components/Common/CachedImage';
import type { EditionChoice } from '@app/components/EditionCompare';
import useBookEditions from '@app/hooks/useBookEditions';
import { encodeApiPathSegment } from '@app/utils/apiPath';
import { normalizeBookOverviewMarkdown } from '@app/utils/bookMarkdown';
import {
  initialNarration,
  recommendedNarration,
} from '@app/utils/narrationSelection';
import { getSafeMarkdownHref } from '@app/utils/safeUrl';
import { CheckIcon } from '@heroicons/react/24/outline';
import { MediaRequestStatus, MediaStatus } from '@server/constants/media';
import type { EditionCard } from '@server/lib/editionCompare';
import type { BookDetails } from '@server/models/Book';
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
import { duration } from './format';
import { ClosedBookIcon, HeadphonesIcon } from './Icons';
import messages from './messages';
import NarrationSample from './NarrationSample';

const RequestModal = dynamic(() => import('@app/components/RequestModal'), {
  ssr: false,
});
type Format = 'ebook' | 'audiobook';
type Coverage = { format: Format; available: boolean; requested: boolean };
export function NarrationPicker({
  book,
  available,
  requested,
  canRequest,
  playback,
  onChanged,
  onCoverageChanged,
}: {
  book: BookDetails;
  available: boolean;
  requested?: boolean;
  canRequest: boolean;
  playback?: ReactNode;
  onChanged?: () => void;
  onCoverageChanged?: (
    coverage: { owned: number; total: number } | undefined
  ) => void;
}) {
  const intl = useIntl();
  const [selectedId, setSelectedId] = useState<string>();
  const [requestChoice, setRequestChoice] = useState<EditionChoice>();
  const [requestOpen, setRequestOpen] = useState(false);
  const [sampleId, setSampleId] = useState<string>();
  const selectedByUser = useRef(false);
  const { data, error, mutate } = useBookEditions({
    bookId: book.id,
    mediaId: book.mediaInfo?.id,
    format: 'audiobook',
    title: book.title,
    author: book.author,
  });
  const recordings = useMemo<EditionCard[]>(
    () =>
      data?.editions.length
        ? data.editions
        : [
            {
              id: book.id,
              title: book.title,
              format: 'audiobook',
              narrators: book.narrators ?? [],
              production: 'unknown',
              abridged: 'unknown',
              durationSeconds: book.audiobookDuration,
              publisher: book.publisher,
              releaseDate: book.firstPublishYear?.toString(),
              imageUrl: book.posterPath,
              selected: available,
              owned: available,
              unknownFields: [],
            },
          ],
    [book, available, data]
  );
  const recommendation = recommendedNarration(recordings, intl.locale);
  const selected =
    recordings.find((item) => item.id === selectedId) ??
    initialNarration(recordings, intl.locale)!;
  useEffect(() => {
    setSelectedId(undefined);
    setRequestOpen(false);
    setSampleId(undefined);
    selectedByUser.current = false;
  }, [book.id]);
  useEffect(() => {
    if (!selectedByUser.current)
      setSelectedId(initialNarration(recordings, intl.locale)?.id);
  }, [recordings, intl.locale]);
  const ownedCount = recordings.filter((item) => item.owned).length;
  useEffect(() => {
    onCoverageChanged?.(
      data?.editions.length
        ? { owned: ownedCount, total: recordings.length }
        : undefined
    );
  }, [data, ownedCount, recordings.length, onCoverageChanged]);
  const hasEditions = Boolean(data?.editions.length);
  const pending = hasEditions
    ? book.mediaInfo?.requests?.some(
        (request) =>
          (request.bookFormat === 'audiobook' ||
            request.bookFormat === 'both') &&
          (request.status === MediaRequestStatus.PENDING ||
            request.status === MediaRequestStatus.APPROVED) &&
          (!request.preferredEditionId ||
            request.preferredEditionId === selected.id)
      )
    : requested;
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
      {!data && !error && (
        <p className="persius-narration-hint" role="status">
          {intl.formatMessage(messages.narrationLoading)}
        </p>
      )}
      <fieldset className="persius-recordings">
        <legend className="sr-only">
          {intl.formatMessage(messages.narrations)}
        </legend>
        {recordings.map((recording) => (
          <div
            className="persius-recording"
            key={recording.id}
            data-selected={selected.id === recording.id}
            data-available={recording.owned}
          >
            <label className="persius-recording-choice">
              <input
                type="radio"
                name={`narration-${book.id}`}
                value={recording.id}
                checked={selected.id === recording.id}
                onChange={() => {
                  selectedByUser.current = true;
                  setSelectedId(recording.id);
                  setSampleId(undefined);
                }}
              />
              <span className="persius-recording-cover">
                {recording.imageUrl ? (
                  <CachedImage
                    type="book"
                    src={recording.imageUrl}
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
                  {recording.narrators.join(', ') ||
                    intl.formatMessage(messages.narratorUnknown)}
                </strong>
                <small>
                  {[
                    duration(
                      recording.durationSeconds
                        ? recording.durationSeconds / 60
                        : undefined
                    ),
                    recording.publisher,
                    recording.releaseDate?.match(/^\d{4}/)?.[0],
                  ]
                    .filter(Boolean)
                    .join(' · ') || intl.formatMessage(messages.unknown)}
                </small>
                <span className="persius-recording-badges">
                  {recording.owned && (
                    <span className="persius-status" data-tone="success">
                      <CheckIcon aria-hidden="true" />
                      {intl.formatMessage(messages.inLibrary)}
                    </span>
                  )}
                  {recommendation?.id === recording.id && (
                    <span
                      className="persius-status"
                      data-tone="progress"
                      title={intl.formatMessage(messages.recommendationReason)}
                    >
                      {intl.formatMessage(messages.recommended)}
                    </span>
                  )}
                  {recording.editionLabel && (
                    <span className="persius-status">
                      {recording.editionLabel}
                    </span>
                  )}
                  {recording.production === 'full-cast' && (
                    <span className="persius-status">
                      {intl.formatMessage(messages.fullCastRecording)}
                    </span>
                  )}
                  {recording.abridged === 'abridged' && (
                    <span className="persius-status">
                      {intl.formatMessage(messages.abridgedRecording)}
                    </span>
                  )}
                </span>
              </span>
            </label>
            <div className="persius-recording-actions">
              {recording.owned && recording.selected ? (
                playback
              ) : (
                <NarrationSample
                  url={recording.sampleUrl}
                  active={sampleId === recording.id}
                  onActiveChange={(active) =>
                    setSampleId(active ? recording.id : undefined)
                  }
                />
              )}
            </div>
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
      {!selected.owned && (
        <Button
          className="persius-request-recording"
          buttonType="primary"
          disabled={
            !canRequest ||
            selected.requestable === false ||
            pending ||
            book.mediaInfo?.status === MediaStatus.BLOCKLISTED
          }
          onClick={() => {
            setSampleId(undefined);
            setRequestChoice(
              hasEditions
                ? {
                    editionId: selected.id,
                    variantKey: selected.id,
                    policy:
                      ownedCount > 0 && data?.supportsAlongside
                        ? 'alongside'
                        : 'only',
                  }
                : undefined
            );
            setRequestOpen(true);
          }}
        >
          {intl.formatMessage(
            pending
              ? messages.requested
              : selected.narrators.length
                ? messages.requestRecording
                : messages.request,
            { narrator: selected.narrators.join(', ') }
          )}
        </Button>
      )}
      {requestOpen && (
        <RequestModal
          bookId={book.id}
          type="book"
          initialBookFormat="audiobook"
          initialEditionChoice={requestChoice}
          show
          onCancel={() => setRequestOpen(false)}
          onComplete={() => {
            setRequestOpen(false);
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
  const [narrationCoverage, setNarrationCoverage] = useState<{
    owned: number;
    total: number;
    bookId: string;
  }>();
  const updateNarrationCoverage = useCallback(
    (coverage: { owned: number; total: number } | undefined) => {
      setNarrationCoverage(
        coverage ? { ...coverage, bookId: data.id } : undefined
      );
    },
    [data.id]
  );
  const currentCoverage =
    narrationCoverage?.bookId === data.id ? narrationCoverage : undefined;
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
            <small
              data-available={
                item.format === 'audiobook' && currentCoverage
                  ? currentCoverage.owned > 0
                  : item.available
              }
            >
              {item.format === 'audiobook' && currentCoverage
                ? intl.formatMessage(messages.narrationOwned, currentCoverage)
                : intl.formatMessage(
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
              key={data.id}
              book={data}
              onCoverageChanged={updateNarrationCoverage}
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
