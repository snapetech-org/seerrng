import CachedImage from '@app/components/Common/CachedImage';
import SelectionCircle from '@app/components/Common/SelectionCircle';
import AvailabilityValue from '@app/components/MediaDetails/AvailabilityValue';
import globalMessages from '@app/i18n/globalMessages';
import { encodeApiPathSegment } from '@app/utils/apiPath';
import defineMessages from '@app/utils/defineMessages';
import { MediaRequestStatus, MediaStatus } from '@server/constants/media';
import type { BookResult } from '@server/models/Book';
import Link from 'next/link';
import { useIntl } from 'react-intl';

const messages = defineMessages('components.AuthorDetails.AuthorWorkCard', {
  selectForRequest: 'Select {workTitle} for this bibliography request',
  mediaAndFormat: 'Media & Format',
  firstPublished: 'First Published',
  editions: 'Editions',
  author: 'Author',
  isbn: 'ISBN',
  publisher: 'Publisher',
  genres: 'Genres',
});

export const getBookFormatState = (
  work: BookResult,
  format: 'ebook' | 'audiobook'
): 'available' | 'requested' | 'unavailable' => {
  const media = work.mediaInfo;
  const available =
    format === 'ebook'
      ? media?.serviceId != null && media.externalServiceId != null
      : media?.audiobookServiceId != null &&
        media.audiobookExternalServiceId != null;
  if (available) return 'available';
  const requested = (media?.requests ?? []).some(
    (request) =>
      request.status !== MediaRequestStatus.DECLINED &&
      request.status !== MediaRequestStatus.FAILED &&
      request.status !== MediaRequestStatus.COMPLETED &&
      (request.bookFormat === 'both' ||
        (request.bookFormat ?? 'ebook') === format)
  );
  return requested ? 'requested' : 'unavailable';
};

export default function AuthorWorkCard({
  work,
  author,
  selected,
  onToggle,
}: {
  work: BookResult;
  author: string;
  selected?: boolean;
  onToggle?: () => void;
}) {
  const intl = useIntl();
  const href = `/book/${encodeApiPathSegment(work.id)}`;
  const bookState = getBookFormatState(work, 'ebook');
  const audioState = getBookFormatState(work, 'audiobook');
  const status = (state: ReturnType<typeof getBookFormatState>) => (
    <AvailabilityValue
      status={
        state === 'available'
          ? MediaStatus.AVAILABLE
          : state === 'requested'
            ? MediaStatus.PENDING
            : MediaStatus.UNKNOWN
      }
    >
      {intl.formatMessage(
        state === 'available'
          ? globalMessages.available
          : state === 'requested'
            ? globalMessages.requested
            : globalMessages.notavailable
      )}
    </AvailabilityValue>
  );

  return (
    <article
      className={[
        'detail-summary-card movie-summary-card app-card-sub detail-item-surface',
        onToggle ? 'movie-summary-card-with-selection' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {onToggle && (
        <div className="movie-summary-selection">
          <SelectionCircle
            label={intl.formatMessage(messages.selectForRequest, {
              workTitle: work.title,
            })}
            selected={!!selected}
            onClick={onToggle}
          />
        </div>
      )}
      <div className="collection-summary-poster">
        <CachedImage
          type="book"
          src={work.posterPath || '/images/seerr_poster_not_found.png'}
          alt=""
          fill
          sizes="80px"
          className="collection-summary-poster-image"
        />
        <Link
          href={href}
          aria-label={work.title}
          className="movie-summary-poster-link"
        />
      </div>
      <div className="flex min-w-0 flex-col">
        <h3 className="movie-summary-title">
          <Link href={href} className="catalog-item-title">
            {work.title}
            {work.firstPublishYear ? ` (${work.firstPublishYear})` : ''}
          </Link>
        </h3>
        <div className="detail-card-heading-spacing detail-three-column-grid grid min-w-0 flex-1">
          <div className="detail-paired-column-span min-w-0">
            <dl className="media-detail-rows detail-paired-columns grid min-w-0 content-start text-xs">
              <dt className="card:col-start-1 card:row-start-1 font-medium text-gray-100">
                {intl.formatMessage(messages.mediaAndFormat)}:
              </dt>
              <dd className="card:col-start-3 card:row-start-1 m-0 truncate">
                {intl.formatMessage(globalMessages.ebookAndAudiobook)}
              </dd>
              <dt className="card:col-start-1 card:row-start-2 font-medium text-gray-100">
                {intl.formatMessage(messages.firstPublished)}:
              </dt>
              <dd className="card:col-start-3 card:row-start-2 m-0 truncate">
                {work.firstPublishYear ||
                  intl.formatMessage(globalMessages.notavailable)}
              </dd>
              <dt className="card:col-start-1 card:row-start-3 font-medium text-gray-100">
                {intl.formatMessage(messages.editions)}:
              </dt>
              <dd className="card:col-start-3 card:row-start-3 m-0 truncate">
                {work.editionCount ||
                  intl.formatMessage(globalMessages.notavailable)}
              </dd>
              <div className="media-detail-rows media-detail-column-divider card:col-span-1 card:col-start-5 card:row-span-3 card:row-start-1 col-span-2 grid min-w-0 grid-cols-[max-content_minmax(0,1fr)] content-start gap-x-3">
                <dt className="font-medium text-gray-100">
                  {intl.formatMessage(messages.author)}:
                </dt>
                <dd className="m-0 truncate">{author}</dd>
                <dt className="font-medium text-gray-100">
                  {intl.formatMessage(messages.isbn)}:
                </dt>
                <dd className="m-0 truncate">
                  {work.isbn13 ||
                    intl.formatMessage(globalMessages.notavailable)}
                </dd>
                <dt className="font-medium text-gray-100">
                  {intl.formatMessage(messages.publisher)}:
                </dt>
                <dd className="m-0 truncate">
                  {work.publisher ||
                    intl.formatMessage(globalMessages.notavailable)}
                </dd>
              </div>
              <dt className="card:col-start-1 card:row-start-4 font-medium text-gray-100">
                {intl.formatMessage(messages.genres)}:
              </dt>
              <dd className="card:col-span-3 card:col-start-3 card:row-start-4 m-0 min-w-0">
                {intl.formatMessage(globalMessages.notavailable)}
              </dd>
            </dl>
          </div>
          <div className="media-detail-column-divider flex min-w-0 flex-col text-xs">
            <dl className="media-detail-rows grid min-w-0 grid-cols-[max-content_minmax(0,1fr)] content-start gap-x-3">
              <dt className="font-medium text-gray-100">
                {intl.formatMessage(globalMessages.book)}:
              </dt>
              <dd className="m-0">{status(bookState)}</dd>
              <dt className="font-medium text-gray-100">
                {intl.formatMessage(globalMessages.audiobook)}:
              </dt>
              <dd className="m-0">{status(audioState)}</dd>
            </dl>
          </div>
        </div>
      </div>
    </article>
  );
}
