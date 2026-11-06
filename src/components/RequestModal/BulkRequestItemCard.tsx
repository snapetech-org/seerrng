import Badge from '@app/components/Common/Badge';
import {
  getBookFormatMessage,
  type RequestedBookFormat,
} from '@app/components/Common/BookFormatBadge';
import CachedImage from '@app/components/Common/CachedImage';
import SelectionCircle from '@app/components/Common/SelectionCircle';
import { encodeApiPathSegment } from '@app/utils/apiPath';
import defineMessages from '@app/utils/defineMessages';
import { formatDurationMinutes } from '@app/utils/numberHelpers';
import type { BookDetails } from '@server/models/Book';
import type { MusicDetails } from '@server/models/Music';
import axios from 'axios';
import Link from 'next/link';
import { Fragment, useEffect, useRef, useState } from 'react';
import { useIntl } from 'react-intl';
import useSWR from 'swr';
import type { BulkItem } from './BulkRequestModal';

const messages = defineMessages('components.RequestModal.BulkRequestItemCard', {
  mediaAndFormat: 'Media & Format',
  releaseDate: 'Release Date',
  pages: 'Pages',
  runtime: 'Runtime',
  author: 'Author',
  artist: 'Artist',
  publisher: 'Publisher',
  albumType: 'Album Type',
  isbn: 'ISBN',
  trackCount: 'Track Count',
  genres: 'Genres',
  status: 'Status',
  notRequested: 'Not Requested',
  unavailable: 'Not Available',
  musicAlbum: 'Music · Album',
  select: 'Select {title}',
  minutes: '{minutes} minutes',
  source: 'Source',
});

export default function BulkRequestItemCard({
  item,
  mediaType,
  format,
  selected,
  reason,
  onToggle,
  onNavigate,
}: {
  item: BulkItem;
  mediaType: 'book' | 'music';
  format: RequestedBookFormat;
  selected: boolean;
  reason?: string;
  onToggle: () => void;
  onNavigate: () => void;
}) {
  const intl = useIntl();
  const ref = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);
  const matched = !item.matchStatus || item.matchStatus === 'matched';
  useEffect(() => {
    if (!ref.current || !matched) return;
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setVisible(true);
        observer.disconnect();
      }
    });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [matched]);
  const href = `/${mediaType}/${encodeApiPathSegment(item.id)}`;
  const { data } = useSWR<BookDetails | MusicDetails>(
    visible && matched ? `/api/v1${href}` : null,
    (url: string) =>
      axios.get(url, { timeout: 20000 }).then((response) => response.data),
    {
      revalidateOnFocus: false,
      dedupingInterval: 60000,
      shouldRetryOnError: false,
    }
  );
  const book = data?.mediaType === 'book' ? data : undefined;
  const album = data?.mediaType === 'album' ? data : undefined;
  const missing = intl.formatMessage(messages.unavailable);
  const date = album?.releaseDate || book?.firstPublishYear || item.year;
  const year = String(date ?? '').slice(0, 4);
  const title = item.title + (year ? ` (${year})` : '');
  const duration = album?.tracks.reduce((sum, track) => sum + track.length, 0);
  const left = [
    [
      messages.mediaAndFormat,
      mediaType === 'book'
        ? intl.formatMessage(getBookFormatMessage(format))
        : intl.formatMessage(messages.musicAlbum),
    ],
    [messages.releaseDate, date ? String(date) : missing],
    [
      mediaType === 'book' ? messages.pages : messages.runtime,
      mediaType === 'book'
        ? book?.numberOfPages
        : duration
          ? formatDurationMinutes(Math.round(duration / 60000), intl.locale)
          : missing,
    ],
  ] as const;
  const middle =
    mediaType === 'book'
      ? ([
          [messages.author, book?.author || item.artist],
          [messages.publisher, book?.publisher],
          [messages.isbn, book?.isbn13 || item.isbn13],
        ] as const)
      : ([
          [messages.artist, album?.artist.name || item.artist],
          [messages.albumType, album?.type || item.releaseType],
          [messages.trackCount, album?.tracks.length],
        ] as const);
  const genres =
    book?.subjects?.slice(0, 4) ??
    album?.tags?.releaseGroup.slice(0, 4).map((tag) => tag.tag) ??
    [];
  return (
    <article
      ref={ref}
      className="detail-summary-card movie-summary-card app-card-sub detail-item-surface"
      data-testid="bulk-request-item-card"
    >
      <div className="collection-summary-poster">
        <CachedImage
          type={mediaType}
          src={
            data?.posterPath ||
            item.image ||
            '/images/seerr_poster_not_found.png'
          }
          alt=""
          fill
          sizes="(min-width: 640px) 80px, 64px"
          className="collection-summary-poster-image"
        />
        {matched && (
          <Link
            href={href}
            onClick={onNavigate}
            aria-label={item.title}
            className="movie-summary-poster-link"
          />
        )}
      </div>
      <div className="flex min-w-0 flex-col">
        <h3 className="movie-summary-title">
          <SelectionCircle
            label={intl.formatMessage(messages.select, { title: item.title })}
            selected={selected}
            disabled={!!reason}
            onClick={onToggle}
          />
          {matched ? (
            <Link
              href={href}
              onClick={onNavigate}
              className="catalog-item-title"
            >
              {title}
            </Link>
          ) : (
            <span className="catalog-item-title">{title}</span>
          )}
        </h3>
        <div className="detail-card-heading-spacing detail-three-column-grid grid min-w-0 flex-1">
          <div className="detail-paired-column-span min-w-0">
            <dl className="media-detail-rows detail-paired-columns grid min-w-0 content-start text-xs">
              {left.map(([label, value], index) => (
                <Fragment key={label.id}>
                  <dt
                    className={`font-medium text-gray-100 ${['card:col-start-1 card:row-start-1', 'card:col-start-1 card:row-start-2', 'card:col-start-1 card:row-start-3'][index]}`}
                  >
                    {intl.formatMessage(label)}:
                  </dt>
                  <dd
                    className={`m-0 truncate ${['card:col-start-3 card:row-start-1', 'card:col-start-3 card:row-start-2', 'card:col-start-3 card:row-start-3'][index]}`}
                  >
                    {value ?? missing}
                  </dd>
                </Fragment>
              ))}
              <div className="media-detail-rows media-detail-column-divider card:col-span-1 card:col-start-5 card:row-span-3 card:row-start-1 col-span-2 grid min-w-0 grid-cols-[max-content_minmax(0,1fr)] content-start gap-x-3">
                {middle.map(([label, value]) => (
                  <Fragment key={label.id}>
                    <dt className="font-medium text-gray-100">
                      {intl.formatMessage(label)}:
                    </dt>
                    <dd className="m-0 truncate">{value ?? missing}</dd>
                  </Fragment>
                ))}
              </div>
              <dt className="card:col-start-1 card:row-start-4 font-medium text-gray-100">
                {intl.formatMessage(messages.genres)}:
              </dt>
              <dd className="card:col-span-3 card:col-start-3 card:row-start-4 m-0 line-clamp-2 min-w-0 break-words">
                {genres.join(', ') || missing}
              </dd>
            </dl>
          </div>
          <div className="media-detail-column-divider flex min-w-0 flex-col text-xs">
            <dl className="media-detail-rows grid min-w-0 grid-cols-[max-content_minmax(0,1fr)] content-start gap-x-3">
              <dt className="font-medium text-gray-100">
                {intl.formatMessage(messages.status)}:
              </dt>
              <dd className="m-0">
                <Badge badgeType={reason ? 'warning' : 'default'}>
                  {reason || intl.formatMessage(messages.notRequested)}
                </Badge>
              </dd>
            </dl>
            {item.sourceTitle && item.sourceTitle !== item.title && (
              <div className="detail-summary-footer">
                {intl.formatMessage(messages.source)}: {item.sourceTitle}
              </div>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
