import CachedImage from '@app/components/Common/CachedImage';
import AvailabilityValue from '@app/components/MediaDetails/AvailabilityValue';
import MovieSummaryCard from '@app/components/MediaDetails/MovieSummaryCard';
import type { AssociationEdge } from '@app/hooks/useAssociations';
import globalMessages from '@app/i18n/globalMessages';
import defineMessages from '@app/utils/defineMessages';
import { MediaStatus } from '@server/constants/media';
import Link from 'next/link';
import { Fragment } from 'react';
import { useIntl, type MessageDescriptor } from 'react-intl';
import { formatAssociationReason } from './associationReason';
import {
  nodeBackdrop,
  nodeHref,
  nodeImage,
  nodeImageType,
  nodeTitle,
} from './helpers';
import useAssociationMovieDetails from './useAssociationMovieDetails';

const messages = defineMessages(
  'components.Association.AssociationDetailCard',
  {
    mediaAndFormat: 'Media & Format',
    releaseDate: 'Release Date',
    author: 'Author',
    publisher: 'Publisher',
    isbn: 'ISBN',
    type: 'Type',
    country: 'Country',
    director: 'Director',
    writer: 'Writer',
    language: 'Language',
    knownFor: 'Known For',
  }
);

const getMediaLabel = (edge: AssociationEdge): MessageDescriptor => {
  switch (edge.node.mediaType) {
    case 'movie':
      return globalMessages.movie;
    case 'tv':
      return globalMessages.tvshow;
    case 'album':
      return globalMessages.album;
    case 'artist':
      return globalMessages.artist;
    case 'book':
      return globalMessages.book;
    case 'person':
      return globalMessages.person;
  }
};

const getReleaseDate = (edge: AssociationEdge) => {
  switch (edge.node.mediaType) {
    case 'movie':
      return edge.node.releaseDate;
    case 'tv':
      return edge.node.firstAirDate;
    case 'album':
      return edge.node['first-release-date'];
    case 'book':
      return edge.node.firstPublishYear?.toString();
    default:
      return undefined;
  }
};

const getStatusLabel = (status: MediaStatus | undefined) => {
  switch (status) {
    case MediaStatus.AVAILABLE:
      return globalMessages.available;
    case MediaStatus.PARTIALLY_AVAILABLE:
      return globalMessages.partiallyavailable;
    case MediaStatus.PROCESSING:
      return globalMessages.processing;
    case MediaStatus.PENDING:
      return globalMessages.requested;
    case MediaStatus.BLOCKLISTED:
      return globalMessages.blocklisted;
    default:
      return globalMessages.notrequested;
  }
};

interface AssociationDetailCardProps {
  edge: AssociationEdge;
  onSelect?: () => void;
}

const AssociationDetailCard = ({
  edge,
  onSelect,
}: AssociationDetailCardProps) => {
  const intl = useIntl();
  const { ref, data: movie } = useAssociationMovieDetails(
    edge.node.mediaType === 'movie' ? edge.node.id : undefined
  );
  const image = nodeImage(edge.node);
  const backdrop = nodeBackdrop(edge.node);
  const mediaInfo = 'mediaInfo' in edge.node ? edge.node.mediaInfo : undefined;
  const isAlbum = edge.node.mediaType === 'album';
  const qualityStatuses =
    edge.node.mediaType === 'album' ? edge.node.qualityStatuses : undefined;
  const status = isAlbum
    ? (qualityStatuses?.find(({ quality }) => quality === 'MP3')?.status ??
      mediaInfo?.status)
    : mediaInfo?.status;
  const status4k = isAlbum
    ? (qualityStatuses?.find(({ quality }) => quality === 'FLAC')?.status ??
      mediaInfo?.status4k)
    : mediaInfo?.status4k;
  const primaryQualityLabel = isAlbum ? 'MP3' : 'HD';
  const secondaryQualityLabel = isAlbum ? 'FLAC' : '4K';
  const association = (
    <span data-testid="association-type">
      {formatAssociationReason(intl, edge)}
    </span>
  );
  const node = edge.node;
  const fieldLabelMessages: Record<string, MessageDescriptor> = {
    Author: messages.author,
    Publisher: messages.publisher,
    ISBN: messages.isbn,
    Artist: globalMessages.artist,
    Type: messages.type,
    Country: messages.country,
    Director: messages.director,
    Writer: messages.writer,
    Language: messages.language,
    'Known For': messages.knownFor,
  };
  const middleRows: [string, string | undefined][] =
    node.mediaType === 'book'
      ? [
          ['Author', node.author],
          ['Publisher', node.publisher],
          ['ISBN', node.isbn13],
        ]
      : node.mediaType === 'album'
        ? [
            [
              'Artist',
              node['artist-credit'].map((credit) => credit.name).join(', '),
            ],
            ['Type', node['primary-type']],
          ]
        : node.mediaType === 'artist'
          ? [
              ['Type', node.type],
              ['Country', node.country],
            ]
          : node.mediaType === 'tv'
            ? [
                ['Director', node.directors?.join(', ')],
                ['Writer', node.writers?.join(', ')],
                [
                  'Language',
                  intl.formatDisplayName(node.originalLanguage, {
                    type: 'language',
                  }),
                ],
              ]
            : node.mediaType === 'person'
              ? [['Known For', node.knownFor.map(nodeTitle).join(', ')]]
              : [];
  const isVideo = node.mediaType === 'movie' || node.mediaType === 'tv';
  const qualities =
    isVideo || isAlbum
      ? ([
          [primaryQualityLabel, status],
          [secondaryQualityLabel, status4k],
        ] as const)
      : node.mediaType === 'book'
        ? ([['Status', status]] as const)
        : [];

  if (node.mediaType === 'movie') {
    return (
      <article ref={ref} data-testid="association-detail-card">
        <MovieSummaryCard
          data={
            movie ?? {
              ...node,
              runtime: 0,
              genres: [],
              productionCompanies: [],
            }
          }
          sortedCrew={movie?.credits.crew ?? []}
          show4kAvailability
          href={nodeHref(node)}
          onSelect={onSelect}
          standalone
          artwork={
            backdrop && (
              <div
                className="pointer-events-none absolute inset-0 z-0"
                aria-hidden
              >
                <CachedImage
                  type="tmdb"
                  src={backdrop}
                  alt=""
                  fill
                  sizes="(min-width: 640px) 56rem, 100vw"
                  className="object-cover object-center"
                />
                <div className="refreshed-artwork-scrim" />
                <div className="refreshed-artwork-gradient" />
              </div>
            )
          }
          availabilityFooter={association}
        />
      </article>
    );
  }

  return (
    <article
      data-testid="association-detail-card"
      className="detail-summary-standalone app-card-main refreshed-card-surface refreshed-detail-text relative overflow-hidden rounded-xl border border-gray-700 shadow-lg shadow-gray-950/20"
    >
      {backdrop && (
        <div className="pointer-events-none absolute inset-0 z-0" aria-hidden>
          <CachedImage
            type={nodeImageType(edge.node)}
            src={backdrop}
            alt=""
            fill
            sizes="(min-width: 640px) 56rem, 100vw"
            className="object-cover object-center"
          />
          <div className="refreshed-artwork-scrim" />
          <div className="refreshed-artwork-gradient" />
        </div>
      )}

      <div className="movie-summary-card relative z-10">
        <Link
          href={nodeHref(edge.node)}
          onClick={onSelect}
          className="collection-summary-poster"
          aria-label={nodeTitle(edge.node)}
        >
          <CachedImage
            type={nodeImageType(edge.node)}
            src={image || '/images/seerr_poster_not_found.png'}
            alt=""
            fill
            sizes="(min-width: 640px) 80px, 64px"
            className="collection-summary-poster-image"
          />
        </Link>

        <div className="flex min-w-0 flex-col">
          <Link
            href={nodeHref(edge.node)}
            onClick={onSelect}
            className="detail-summary-title block truncate text-lg leading-5 font-semibold text-white underline decoration-white/45 underline-offset-2 transition hover:decoration-white focus:ring-2 focus:ring-cyan-400 focus:outline-none"
          >
            {nodeTitle(edge.node)}
          </Link>

          <div className="detail-card-heading-spacing detail-three-column-grid grid min-h-0 min-w-0 flex-1 items-stretch text-xs leading-4">
            <dl className="media-detail-rows card:pe-3 grid min-w-0 grid-cols-[max-content_minmax(0,1fr)] content-start gap-x-3">
              <dt className="font-medium text-gray-100">
                {intl.formatMessage(messages.mediaAndFormat)}:
              </dt>
              <dd className="m-0 truncate">
                {intl.formatMessage(getMediaLabel(edge))}
              </dd>
              <dt className="font-medium text-gray-100">
                {intl.formatMessage(messages.releaseDate)}:
              </dt>
              <dd className="m-0 truncate">
                {getReleaseDate(edge) ||
                  intl.formatMessage(globalMessages.notavailable)}
              </dd>
            </dl>

            <dl className="media-detail-rows media-detail-column-divider grid min-w-0 grid-cols-[max-content_minmax(0,1fr)] content-start gap-x-3">
              {middleRows.map(([label, value]) => (
                <Fragment key={label}>
                  <dt className="font-medium text-gray-100">
                    {intl.formatMessage(fieldLabelMessages[label])}:
                  </dt>
                  <dd className="m-0 truncate" title={value}>
                    {value || intl.formatMessage(globalMessages.notavailable)}
                  </dd>
                </Fragment>
              ))}
            </dl>
            <div className="media-detail-column-divider flex min-w-0 flex-col">
              <dl className="media-detail-rows grid min-w-0 grid-cols-[max-content_minmax(0,1fr)] content-start gap-x-3">
                {qualities.map(([label, qualityStatus]) => (
                  <Fragment key={label}>
                    <dt className="font-medium text-gray-100">{label}:</dt>
                    <dd className="m-0 truncate">
                      <AvailabilityValue status={qualityStatus}>
                        {intl.formatMessage(getStatusLabel(qualityStatus))}
                      </AvailabilityValue>
                    </dd>
                  </Fragment>
                ))}
              </dl>
              <div className="detail-summary-footer">{association}</div>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
};

export default AssociationDetailCard;
