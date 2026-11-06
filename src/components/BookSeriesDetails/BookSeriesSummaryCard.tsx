import CachedImage from '@app/components/Common/CachedImage';
import { encodeApiPathSegment } from '@app/utils/apiPath';
import defineMessages from '@app/utils/defineMessages';
import { formatLocalizedList } from '@app/utils/numberHelpers';
import type { BookSeriesDetails } from '@server/models/Book';
import Link from 'next/link';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

const messages = defineMessages('components.BookSeriesDetails.Summary', {
  overview: 'Overview',
  genres: 'Genres',
  collectionSize: 'Collection Size',
  selectionSize: 'Selection Size',
});

const BookSeriesSummaryCard = ({
  seriesId,
  title,
  initialData,
  selectionSize,
  standalone = false,
}: {
  seriesId: string;
  title: string;
  initialData?: BookSeriesDetails;
  selectionSize?: { selected: number; visible: number };
  standalone?: boolean;
}) => {
  const intl = useIntl();
  const { data } = useSWR<BookSeriesDetails>(
    `/api/v1/series/${encodeApiPathSegment(seriesId)}`,
    { fallbackData: initialData }
  );
  const href = `/series/${encodeApiPathSegment(seriesId)}`;
  const name = `${data?.title ?? title} Collection`;
  const posterPath = data?.books.find((book) => book.posterPath)?.posterPath;
  const genres = [
    ...new Set(data?.books.flatMap((book) => book.subjects ?? []) ?? []),
  ].slice(0, 3);
  const poster = (
    <CachedImage
      type="book"
      src={posterPath || '/images/seerr_poster_not_found.png'}
      alt=""
      fill
      sizes="(min-width: 640px) 80px, 64px"
      className="collection-summary-poster-image"
    />
  );

  return (
    <section className="app-card-sub detail-item-surface detail-summary-card media-detail-collection-card">
      <div className="collection-summary-header">
        {standalone ? (
          <div className="collection-summary-poster">{poster}</div>
        ) : (
          <Link
            href={href}
            aria-label={name}
            className="collection-summary-poster"
          >
            {poster}
          </Link>
        )}
        <div className="collection-summary-details">
          {standalone ? (
            <h1 className="collection-summary-title">{name}</h1>
          ) : (
            <h2 className="collection-summary-title">
              <Link href={href}>{name}</Link>
            </h2>
          )}
          <dl className="collection-summary-table detail-card-heading-spacing">
            <dt className="collection-summary-overview-label">
              {intl.formatMessage(messages.overview)}:
            </dt>
            <dd className="collection-summary-overview-value">
              {data?.description || '—'}
            </dd>
            <dt className="collection-summary-genres-label">
              {intl.formatMessage(messages.genres)}:
            </dt>
            <dd className="collection-summary-genres-value">
              {formatLocalizedList(genres, intl.locale) || '—'}
            </dd>
            <div className="collection-summary-size">
              <dt className="collection-summary-size-label">
                {intl.formatMessage(messages.collectionSize)}:
              </dt>
              <dd className="collection-summary-size-value">
                {data?.books.length ?? '—'}
              </dd>
              {selectionSize && (
                <>
                  <dt className="collection-summary-selection-label">
                    {intl.formatMessage(messages.selectionSize)}:
                  </dt>
                  <dd className="collection-summary-selection-value">
                    {selectionSize.selected} / {selectionSize.visible}
                  </dd>
                </>
              )}
            </div>
          </dl>
        </div>
      </div>
    </section>
  );
};

export default BookSeriesSummaryCard;
