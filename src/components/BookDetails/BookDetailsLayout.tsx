import BookSeriesLinks from '@app/components/BookSeriesDetails/BookSeriesLinks';
import BookSeriesSummaryCard from '@app/components/BookSeriesDetails/BookSeriesSummaryCard';
import CachedImage from '@app/components/Common/CachedImage';
import PlayOnDeviceButton from '@app/components/Common/PlayOnDeviceButton';
import AvailabilityValue from '@app/components/MediaDetails/AvailabilityValue';
import BookRating from '@app/components/MediaDetails/BookRating';
import DetailDisclosureButton from '@app/components/MediaDetails/DetailDisclosureButton';
import MediaQualitySelect from '@app/components/MediaDetails/MediaQualitySelect';
import PlaybackTrackList from '@app/components/MediaDetails/PlaybackTrackList';
import { subjectTagClassName } from '@app/components/MediaDetails/subjectTagStyle';
import useDetailDisclosurePins from '@app/hooks/useDetailDisclosurePins';
import usePlaybackCatalog from '@app/hooks/usePlaybackCatalog';
import { encodeApiPathSegment } from '@app/utils/apiPath';
import { normalizeBookOverviewMarkdown } from '@app/utils/bookMarkdown';
import defineMessages from '@app/utils/defineMessages';
import { formatLocalizedList } from '@app/utils/numberHelpers';
import { resolveCanonicalPlaybackSelection } from '@app/utils/playbackSelection';
import { getSafeMarkdownHref } from '@app/utils/safeUrl';
import type { BookDetails, BookRatingResponse } from '@server/models/Book';
import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';
import { useIntl } from 'react-intl';
import ReactMarkdown from 'react-markdown';

const messages = defineMessages('components.BookDetails.Layout', {
  mediaAndFormat: 'Media & Format',
  firstPublished: 'First Published',
  pages: 'Pages',
  publisher: 'Publisher',
  author: 'Author',
  editions: 'Editions',
  isbn: 'ISBN',
  collection: 'Collection',
  audiobookDuration: 'Runtime',
  narrators: 'Narrators',
  ebook: 'Book',
  audiobook: 'Audiobook',
  overview: 'Overview',
  overviewUnavailable: 'Overview unavailable',
  genres: 'Genres',
  noGenres: 'No Genres Available',
  keywords: 'Keywords',
  noKeywords: 'No keywords available',
  bookDetails: 'Details',
  openLibrary: 'Open Library',
  metadataSource: 'Metadata source',
  edition: 'Edition',
  isbnCandidates: 'ISBN Candidates',
  available: 'Available',
  requested: 'Requested',
  notAvailable: 'Not Available',
  format: 'Format',
});

export interface BookFormatCoverage {
  format: 'ebook' | 'audiobook';
  available: boolean;
  requested: boolean;
}

interface BookDetailsLayoutProps {
  data: BookDetails;
  ratingData?: BookRatingResponse;
  formatCoverage: BookFormatCoverage[];
  initialPlaybackFormat: 'ebook' | 'audiobook';
  primaryActions: ReactNode;
  secondaryActions: ReactNode;
  catalogActions?: ReactNode;
  playbackActions?: (
    itemIds: string[],
    format: 'ebook' | 'audiobook'
  ) => ReactNode;
  playbackUnavailableReason?: (format: 'ebook' | 'audiobook') => string;
  additionalContent?: ReactNode;
}

const BookDetailsLayout = ({
  data,
  ratingData,
  formatCoverage,
  initialPlaybackFormat,
  primaryActions,
  secondaryActions,
  catalogActions,
  playbackActions,
  playbackUnavailableReason,
  additionalContent,
}: BookDetailsLayoutProps) => {
  const intl = useIntl();
  const { pins, togglePinned } = useDetailDisclosurePins('book');
  const [showDetails, setShowDetails] = useState(false);
  const [showCollection, setShowCollection] = useState(false);
  const [selectedPlaybackFormat, setSelectedPlaybackFormat] = useState<
    'ebook' | 'audiobook'
  >(initialPlaybackFormat);
  useEffect(() => {
    setSelectedPlaybackFormat(initialPlaybackFormat);
  }, [data.id, initialPlaybackFormat]);
  useEffect(() => {
    setShowDetails(pins.details);
  }, [pins.details, data.id]);
  useEffect(() => {
    setShowCollection(pins.collection);
  }, [pins.collection, data.id]);
  const [showGenres, setShowGenres] = useState(false);
  const [selectedPlaybackItemIds, setSelectedPlaybackItemIds] = useState<
    string[]
  >([]);
  const { data: playbackCatalog } = usePlaybackCatalog(data.mediaInfo?.id);
  useEffect(() => {
    setShowGenres(pins.subjectTags);
  }, [pins.subjectTags]);
  useEffect(() => {
    const allowedIds = new Set(
      playbackCatalog?.groups.flatMap((group) =>
        group.items.map((item) => item.id)
      ) ?? []
    );
    setSelectedPlaybackItemIds((current) =>
      current.filter((itemId) => allowedIds.has(itemId))
    );
  }, [playbackCatalog]);
  const availablePlaybackItemIds =
    playbackCatalog?.groups.flatMap((group) =>
      group.items.map((item) => item.id)
    ) ?? [];
  const effectivePlaybackItemIds = resolveCanonicalPlaybackSelection(
    availablePlaybackItemIds,
    selectedPlaybackItemIds
  );
  const unavailable = intl.formatMessage(messages.notAvailable);
  const workId = encodeApiPathSegment(data.id);
  const authorId = data.authorId
    ? encodeApiPathSegment(data.authorId)
    : undefined;
  const availableFormats = formatCoverage
    .filter((format) => format.available)
    .map((format) =>
      intl.formatMessage(
        format.format === 'ebook' ? messages.ebook : messages.audiobook
      )
    );
  const mediaAndFormat = `Book${
    availableFormats.length > 0 ? ` · ${availableFormats.join(' + ')}` : ''
  }`;
  const genres = [
    ...new Set((data.subjects ?? []).map((genre) => genre.trim())),
  ]
    .filter(Boolean)
    .slice(0, 50);
  const formatStatus = (coverage: BookFormatCoverage) =>
    intl.formatMessage(
      coverage.available
        ? messages.available
        : coverage.requested
          ? messages.requested
          : messages.notAvailable
    );

  return (
    <div className="media-page">
      <article className="media-detail-card app-card-main refreshed-card-surface refreshed-detail-text relative overflow-hidden rounded-xl border border-gray-700 p-3 shadow-lg shadow-gray-950/20">
        {data.posterPath && (
          <div className="pointer-events-none absolute inset-0 z-0" aria-hidden>
            <CachedImage
              type="book"
              src={data.posterPath}
              alt=""
              fill
              priority
              sizes="100vw"
              className="object-cover object-center"
            />
            <div className="refreshed-artwork-scrim" />
            <div className="refreshed-artwork-gradient" />
          </div>
        )}

        <div className="relative z-10">
          <div className="app-card-inset refreshed-inset-surface detail-summary-card grid min-w-0 grid-cols-[64px_minmax(0,1fr)] gap-3 sm:grid-cols-[80px_minmax(0,1fr)]">
            <div
              className="relative h-24 w-16 overflow-hidden rounded-lg ring-1 ring-gray-600 sm:h-[120px] sm:w-20"
              data-testid="media-details-poster"
            >
              <CachedImage
                type="book"
                src={data.posterPath || '/images/seerr_poster_not_found.png'}
                alt=""
                fill
                priority
                sizes="(min-width: 640px) 80px, 64px"
                className="object-cover"
              />
            </div>

            <div className="flex min-w-0 flex-col">
              <h1
                className="detail-summary-title text-lg leading-5 font-semibold text-white"
                data-testid="media-title"
              >
                {data.title}
                {data.firstPublishYear ? ` (${data.firstPublishYear})` : ''}
              </h1>

              <div className="detail-card-heading-spacing detail-three-column-grid grid min-w-0 flex-1">
                <div className="detail-paired-column-span min-w-0">
                  <dl className="media-detail-rows detail-paired-columns grid min-w-0 content-start text-xs">
                    <dt className="card:col-start-1 card:row-start-1 font-medium text-gray-100">
                      {intl.formatMessage(messages.mediaAndFormat)}:
                    </dt>
                    <dd className="card:col-start-3 card:row-start-1 m-0 truncate">
                      {mediaAndFormat}
                    </dd>
                    <dt className="card:col-start-1 card:row-start-2 font-medium text-gray-100">
                      {intl.formatMessage(messages.firstPublished)}:
                    </dt>
                    <dd className="card:col-start-3 card:row-start-2 m-0 truncate">
                      {data.firstPublishYear ?? unavailable}
                    </dd>
                    <dt className="card:col-start-1 card:row-start-3 font-medium text-gray-100">
                      {intl.formatMessage(
                        selectedPlaybackFormat === 'audiobook'
                          ? messages.audiobookDuration
                          : messages.pages
                      )}
                      :
                    </dt>
                    <dd className="card:col-start-3 card:row-start-3 m-0 truncate">
                      {selectedPlaybackFormat === 'audiobook'
                        ? data.audiobookDuration && data.audiobookDuration > 0
                          ? `${Math.floor(data.audiobookDuration / 3600)}h ${Math.floor((data.audiobookDuration % 3600) / 60)}m`
                          : unavailable
                        : data.numberOfPages
                          ? intl.formatNumber(data.numberOfPages)
                          : unavailable}
                    </dd>
                    <div className="media-detail-rows media-detail-column-divider card:col-span-1 card:col-start-5 card:row-span-3 card:row-start-1 col-span-2 grid min-w-0 grid-cols-[max-content_minmax(0,1fr)] content-start gap-x-3">
                      <dt className="font-medium text-gray-100">
                        {intl.formatMessage(
                          selectedPlaybackFormat === 'audiobook'
                            ? messages.narrators
                            : messages.author
                        )}
                        :
                      </dt>
                      <dd className="m-0 truncate">
                        {selectedPlaybackFormat === 'audiobook' ? (
                          formatLocalizedList(
                            data.narrators ?? [],
                            intl.locale
                          ) || unavailable
                        ) : data.author ? (
                          authorId ? (
                            <Link
                              href={`/author/${authorId}`}
                              className="text-indigo-300 hover:text-indigo-200 hover:underline focus:ring-2 focus:ring-indigo-400 focus:outline-none"
                            >
                              {data.author}
                            </Link>
                          ) : (
                            data.author
                          )
                        ) : (
                          unavailable
                        )}
                      </dd>
                      <dt className="font-medium text-gray-100">
                        {intl.formatMessage(messages.editions)}:
                      </dt>
                      <dd className="m-0 truncate">
                        {data.editionCount
                          ? intl.formatNumber(data.editionCount)
                          : unavailable}
                      </dd>
                      <dt className="font-medium text-gray-100">
                        {intl.formatMessage(messages.isbn)}:
                      </dt>
                      <dd className="m-0 truncate">
                        {data.isbn13 || unavailable}
                      </dd>
                    </div>

                    <dt className="card:col-start-1 card:row-start-4 font-medium text-gray-100">
                      {intl.formatMessage(messages.genres)}:
                    </dt>
                    <dd
                      className="card:col-span-3 card:col-start-3 card:row-start-4 m-0 min-w-0 break-words"
                      data-testid="media-details-genres"
                    >
                      {genres.length > 0
                        ? genres.slice(0, 4).map((genre, index) => (
                            <span key={genre}>
                              {index > 0 && ', '}
                              <Link
                                href={`/discover/books?subject=${encodeURIComponent(genre)}&sortBy=ranked`}
                                className="text-indigo-300 hover:text-indigo-200 hover:underline focus:ring-2 focus:ring-indigo-400 focus:outline-none"
                              >
                                {genre}
                              </Link>
                            </span>
                          ))
                        : unavailable}
                    </dd>
                  </dl>
                </div>

                <dl className="media-detail-rows media-detail-column-divider grid min-w-0 grid-cols-[max-content_minmax(0,1fr)] content-start gap-x-3 text-xs">
                  {formatCoverage.map((coverage) => (
                    <div className="contents" key={coverage.format}>
                      <dt className="font-medium text-gray-100">
                        {intl.formatMessage(
                          coverage.format === 'ebook'
                            ? messages.ebook
                            : messages.audiobook
                        )}
                        :
                      </dt>
                      <dd className="m-0 truncate">
                        <AvailabilityValue
                          tone={
                            coverage.available
                              ? 'available'
                              : coverage.requested
                                ? 'processing'
                                : 'unavailable'
                          }
                        >
                          {formatStatus(coverage)}
                        </AvailabilityValue>
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>
          </div>

          {playbackCatalog && availablePlaybackItemIds.length > 0 && (
            <PlaybackTrackList
              catalog={playbackCatalog}
              selectedItemIds={selectedPlaybackItemIds}
              onSelectionChange={setSelectedPlaybackItemIds}
            />
          )}
          <div className="media-rating-row">
            <MediaQualitySelect
              value={selectedPlaybackFormat}
              options={[
                {
                  label: intl.formatMessage(messages.ebook),
                  value: 'ebook',
                },
                {
                  label: intl.formatMessage(messages.audiobook),
                  value: 'audiobook',
                },
              ]}
              onChange={setSelectedPlaybackFormat}
              label={intl.formatMessage(messages.format)}
              autoSelectAvailable={false}
            />
            {playbackActions?.(
              effectivePlaybackItemIds,
              selectedPlaybackFormat
            )}
            {playbackActions && (
              <PlayOnDeviceButton
                mediaId={data.mediaInfo?.id}
                unavailableReason={playbackUnavailableReason?.(
                  selectedPlaybackFormat
                )}
                itemIds={
                  selectedPlaybackFormat === 'audiobook'
                    ? effectivePlaybackItemIds
                    : []
                }
              />
            )}
            <BookRating
              average={
                ratingData?.average ??
                (data.provider === 'bookshelf'
                  ? data.ratingsAverage
                  : undefined)
              }
              count={
                ratingData?.count ||
                (data.provider === 'bookshelf' ? data.ratingsCount : undefined)
              }
              source={
                ratingData?.average !== undefined && ratingData.count > 0
                  ? ratingData.source === 'bookshelf'
                    ? 'Bookshelf'
                    : 'Open Library'
                  : data.provider === 'bookshelf'
                    ? 'Bookshelf'
                    : 'Open Library'
              }
              href={
                ratingData?.workId && ratingData.source === 'openlibrary'
                  ? `https://openlibrary.org/works/${encodeURIComponent(ratingData.workId)}`
                  : data.provider !== 'bookshelf'
                    ? `https://openlibrary.org/works/${encodeURIComponent(data.id)}`
                    : undefined
              }
            />
          </div>

          <div className="media-primary-action-row">
            {primaryActions}
            {secondaryActions}
          </div>

          <BookSeriesLinks bookId={data.id} />

          <section className="app-card-inset refreshed-inset-surface card-spacing-before rounded-lg border border-gray-700 p-3">
            <h2 className="media-inset-heading">
              {intl.formatMessage(messages.overview)}
            </h2>
            <div className="refreshed-detail-text-muted prose prose-sm prose-p:my-0 prose-p:leading-5 prose-a:text-indigo-300 prose-a:underline prose-a:hover:text-indigo-200 mt-4 max-w-none text-sm leading-5">
              <ReactMarkdown
                skipHtml
                urlTransform={getSafeMarkdownHref}
                components={{
                  a: ({ children, ...props }) => (
                    <a {...props} target="_blank" rel="noreferrer">
                      {children}
                    </a>
                  ),
                }}
              >
                {normalizeBookOverviewMarkdown(
                  data.description ||
                    intl.formatMessage(messages.overviewUnavailable)
                )}
              </ReactMarkdown>
            </div>
          </section>

          <div className="media-detail-disclosure-row">
            {data.series && data.series.length > 0 && (
              <DetailDisclosureButton
                label={intl.formatMessage(messages.collection)}
                open={showCollection}
                onClick={() => setShowCollection((open) => !open)}
                pinned={pins.collection}
                onPinClick={() => void togglePinned('collection')}
              />
            )}
            <DetailDisclosureButton
              label={intl.formatMessage(messages.keywords)}
              open={showGenres}
              onClick={() => setShowGenres((open) => !open)}
              pinned={pins.subjectTags}
              onPinClick={() => void togglePinned('subjectTags')}
            />
            <DetailDisclosureButton
              label={intl.formatMessage(messages.bookDetails)}
              open={showDetails}
              onClick={() => setShowDetails((open) => !open)}
              pinned={pins.details}
              onPinClick={() => void togglePinned('details')}
              controls="book-additional-details"
            />
            {catalogActions}
          </div>

          {showCollection && data.series && data.series.length > 0 && (
            <div className="card-spacing-before space-y-2">
              {data.series.map((series) => (
                <BookSeriesSummaryCard
                  key={series.id}
                  seriesId={series.id}
                  title={series.title}
                />
              ))}
            </div>
          )}

          {showGenres && (
            <section className="app-card-inset refreshed-inset-surface card-spacing-before rounded-lg border border-gray-700 p-3">
              <h2 className="media-inset-heading mb-2">
                {intl.formatMessage(messages.keywords)}
              </h2>
              {genres.length === 0 ? (
                <p className="refreshed-detail-text-muted text-xs">
                  {intl.formatMessage(messages.noKeywords)}
                </p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {genres.map((genre, index) => (
                    <Link
                      key={genre}
                      href={`/discover/books?subject=${encodeURIComponent(genre)}&sortBy=ranked`}
                      className={subjectTagClassName(index)}
                    >
                      {genre}
                    </Link>
                  ))}
                </div>
              )}
            </section>
          )}

          {showDetails && (
            <section
              id="book-additional-details"
              className="app-card-inset refreshed-inset-surface card-spacing-before rounded-lg border border-gray-700 p-3"
            >
              <h2 className="media-inset-heading detail-card-heading-after">
                {intl.formatMessage(messages.bookDetails)}
              </h2>
              <div className="detail-three-column-grid grid">
                <dl className="media-detail-rows grid min-w-0 grid-cols-[max-content_minmax(0,1fr)] content-start gap-x-3 text-xs">
                  <dt className="font-medium text-gray-100">
                    {intl.formatMessage(messages.publisher)}:
                  </dt>
                  <dd className="m-0 truncate">
                    {data.publisher || unavailable}
                  </dd>
                  <dt className="font-medium text-gray-100">
                    {intl.formatMessage(messages.edition)}:
                  </dt>
                  <dd className="m-0 truncate">
                    {data.editionId || unavailable}
                  </dd>
                </dl>
                <dl className="media-detail-rows media-detail-column-divider grid min-w-0 grid-cols-[max-content_minmax(0,1fr)] content-start gap-x-3 text-xs">
                  <dt className="font-medium text-gray-100">
                    {intl.formatMessage(messages.openLibrary)}:
                  </dt>
                  <dd className="m-0 truncate">
                    <a
                      href={`https://openlibrary.org/works/${workId}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-indigo-300 hover:text-indigo-200 hover:underline focus:ring-2 focus:ring-indigo-400 focus:outline-none"
                    >
                      {data.id}
                    </a>
                  </dd>
                </dl>
                <dl className="media-detail-rows media-detail-column-divider grid min-w-0 grid-cols-[max-content_minmax(0,1fr)] content-start gap-x-3 text-xs">
                  <dt className="font-medium text-gray-100">
                    {intl.formatMessage(messages.isbnCandidates)}:
                  </dt>
                  <dd className="m-0 min-w-0">
                    {data.isbnCandidates?.length
                      ? data.isbnCandidates.slice(0, 4).map((candidate) => (
                          <span
                            className="block truncate"
                            key={`${candidate.editionId ?? candidate.isbn}-${candidate.isbn}`}
                            title={[
                              candidate.isbn,
                              candidate.title,
                              candidate.format,
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          >
                            {candidate.isbn}
                          </span>
                        ))
                      : unavailable}
                  </dd>
                </dl>
              </div>
            </section>
          )}
          {additionalContent}
        </div>
      </article>
      <div className="extra-bottom-space relative" />
    </div>
  );
};

export default BookDetailsLayout;
