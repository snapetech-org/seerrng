import Spinner from '@app/assets/spinner.svg';
import Badge from '@app/components/Common/Badge';
import BookFormatBadge, {
  getRequestedBookFormat,
} from '@app/components/Common/BookFormatBadge';
import Button from '@app/components/Common/Button';
import CachedImage from '@app/components/Common/CachedImage';
import MediaTypeBadge, {
  getMediaTypeBadgeType,
} from '@app/components/Common/MediaTypeBadge';
import StatusBadgeMini from '@app/components/Common/StatusBadgeMini';
import Tooltip from '@app/components/Common/Tooltip';
import { canRetryRequest } from '@app/components/RequestCard/retryPermissions';
import RequestFailureDetails from '@app/components/RequestFailureDetails';
import StatusBadge from '@app/components/StatusBadge';
import useDeepLinks from '@app/hooks/useDeepLinks';
import useToasts from '@app/hooks/useToasts';
import { Permission, useUser } from '@app/hooks/useUser';
import globalMessages from '@app/i18n/globalMessages';
import {
  encodeApiPathSegment,
  normalizeMusicBrainzId,
  normalizeOpenLibraryWorkId,
} from '@app/utils/apiPath';
import defineMessages from '@app/utils/defineMessages';
import { getTmdbPosterImageUrl } from '@app/utils/imageCache';
import { refreshIntervalHelper } from '@app/utils/refreshIntervalHelper';
import {
  canManuallyMapTvdbSeasons,
  getRequestFailureDescriptionId,
  getRequestFailureInfo,
} from '@app/utils/requestFailure';
import { withProperties } from '@app/utils/typeHelpers';
import {
  CheckIcon as AvailableStatusIcon,
  ExclamationTriangleIcon as FailedStatusIcon,
  ClockIcon as PendingStatusIcon,
  ArrowPathIcon as ProcessingStatusIcon,
} from '@heroicons/react/24/outline';
import {
  CheckIcon,
  PencilIcon,
  TrashIcon,
  XMarkIcon,
} from '@heroicons/react/24/solid';
import {
  MediaRequestStatus,
  MediaStatus,
  MediaType,
} from '@server/constants/media';
import type { MediaRequest } from '@server/entity/MediaRequest';
import type { NonFunctionProperties } from '@server/interfaces/api/common';
import type { BookDetails } from '@server/models/Book';
import type { ComicDetails } from '@server/models/Comic';
import type { MagazineDetails } from '@server/models/Magazine';
import type { MovieDetails } from '@server/models/Movie';
import type { MusicDetails } from '@server/models/Music';
import type { TvDetails } from '@server/models/Tv';
import axios from 'axios';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useInView } from 'react-intersection-observer';
import { useIntl } from 'react-intl';
import useSWR, { mutate } from 'swr';

const RequestModal = dynamic(() => import('@app/components/RequestModal'), {
  ssr: false,
});
const TvSeasonMappingModal = dynamic(
  () => import('@app/components/RequestCard/TvSeasonMappingModal'),
  { ssr: false }
);

const messages = defineMessages('components.RequestCard', {
  failedretry: 'Something went wrong while retrying the request.',
  retry: 'Retry',
  retryRequest: 'Retry this request',
  mapTvSeasons: 'Map TV seasons',
  failedmodify: 'Something went wrong while modifying the request.',
  mediaerror: '{mediaType} Not Found',
  tmdbid: 'TMDB ID',
  tvdbid: 'TheTVDB ID',
  approverequest: 'Approve Request',
  declinerequest: 'Decline Request',
  editrequest: 'Edit Request',
  cancelrequest: 'Cancel Request',
  deleterequest: 'Delete Request',
  unknowntitle: 'Unknown Title',
  bookFormat: 'Format',
  ebook: 'Book',
  audiobook: 'Audiobook',
  both: 'Both',
  partialBookService: 'Partial Bookshelf link',
});

type RequestCardTitle =
  | MovieDetails
  | TvDetails
  | MusicDetails
  | BookDetails
  | ComicDetails
  | MagazineDetails;

const isMovie = (media: RequestCardTitle): media is MovieDetails => {
  return (
    (media as MovieDetails).releaseDate !== undefined &&
    (media as MovieDetails).originalTitle !== undefined
  );
};

const isMusic = (media: RequestCardTitle): media is MusicDetails => {
  return (media as MusicDetails).artist !== undefined;
};

const isBook = (media: RequestCardTitle): media is BookDetails => {
  return (media as BookDetails).mediaType === 'book';
};

const isComic = (media: RequestCardTitle): media is ComicDetails => {
  return (media as ComicDetails).mediaType === 'comic';
};

const isMagazine = (media: RequestCardTitle): media is MagazineDetails =>
  (media as MagazineDetails).mediaType === 'magazine';

const getBookId = (request: NonFunctionProperties<MediaRequest>) =>
  request.media.identifiers?.find(
    (identifier) => identifier.provider === 'openlibrary'
  )?.value;

const getNormalizedBookId = (request: NonFunctionProperties<MediaRequest>) => {
  const bookId = getBookId(request);
  return bookId ? normalizeOpenLibraryWorkId(bookId) : undefined;
};

const getNormalizedMusicId = (request: NonFunctionProperties<MediaRequest>) =>
  request.media.mbId ? normalizeMusicBrainzId(request.media.mbId) : undefined;

const getComicId = (request: NonFunctionProperties<MediaRequest>) =>
  request.media.identifiers?.find(
    (identifier) => identifier.provider === 'comicvine'
  )?.value;

const getMagazineId = (request: NonFunctionProperties<MediaRequest>) =>
  request.media.externalServiceSlug ??
  request.media.identifiers?.find(
    (identifier) => identifier.provider === 'lazylibrarian'
  )?.value;

const getRequestDetailHref = (
  request: NonFunctionProperties<MediaRequest>,
  manage = false
) => {
  const query = [
    manage ? 'manage=1' : null,
    request.type === 'book'
      ? `format=${getRequestedBookFormat(request.bookFormat)}`
      : null,
  ]
    .filter(Boolean)
    .join('&');
  const suffix = query ? `?${query}` : '';
  const bookId = getNormalizedBookId(request);
  const musicId = getNormalizedMusicId(request);
  const comicId = getComicId(request);
  const magazineId = getMagazineId(request);

  if (request.type === 'music' && musicId) {
    return `/music/${encodeApiPathSegment(musicId)}${suffix}`;
  }

  if (request.type === 'book' && bookId) {
    return `/book/${encodeApiPathSegment(bookId)}${suffix}`;
  }

  if (request.type === 'comic' && comicId) {
    return `/comic/${encodeApiPathSegment(comicId)}${suffix}`;
  }
  if (request.type === 'magazine' && magazineId) {
    return `/magazine/${encodeApiPathSegment(magazineId)}${suffix}`;
  }

  return `/${request.type}/${request.media.tmdbId}${suffix}`;
};

const getRequestDownloadStatus = (
  request: NonFunctionProperties<MediaRequest>
) => {
  if (request.type === 'book') {
    if (request.bookFormat === 'audiobook') {
      return request.media.audiobookDownloadStatus;
    }

    if (request.bookFormat === 'both') {
      return [
        ...(request.media.downloadStatus ?? []),
        ...(request.media.audiobookDownloadStatus ?? []),
      ];
    }
  }

  return request.media[request.is4k ? 'downloadStatus4k' : 'downloadStatus'];
};

const getRequestServiceUrl = (request: NonFunctionProperties<MediaRequest>) => {
  if (request.type === 'book') {
    if (request.bookFormat === 'audiobook') {
      return request.media.audiobookServiceUrl;
    }

    if (request.bookFormat === 'both') {
      return request.media.serviceUrl ?? request.media.audiobookServiceUrl;
    }
  }

  return request.is4k ? request.media.serviceUrl4k : request.media.serviceUrl;
};

const hasBookFormat = (
  request: NonFunctionProperties<MediaRequest>,
  format: 'ebook' | 'audiobook'
) => {
  if (format === 'audiobook') {
    return (
      request.media.audiobookExternalServiceId !== null &&
      request.media.audiobookExternalServiceId !== undefined
    );
  }

  return (
    request.media.externalServiceId !== null &&
    request.media.externalServiceId !== undefined
  );
};

const getRequestMediaStatus = (
  request: NonFunctionProperties<MediaRequest>
) => {
  if (request.type !== 'book') {
    return request.media[request.is4k ? 'status4k' : 'status'];
  }

  if (request.bookFormat === 'audiobook') {
    return hasBookFormat(request, 'audiobook')
      ? MediaStatus.AVAILABLE
      : request.media.status;
  }

  if (request.bookFormat === 'both') {
    const hasEbook = hasBookFormat(request, 'ebook');
    const hasAudiobook = hasBookFormat(request, 'audiobook');

    if (hasEbook && hasAudiobook) {
      return MediaStatus.AVAILABLE;
    }

    if (hasEbook || hasAudiobook) {
      return MediaStatus.PARTIALLY_AVAILABLE;
    }

    return request.media.status;
  }

  return hasBookFormat(request, 'ebook')
    ? MediaStatus.AVAILABLE
    : request.media.status;
};

interface RequestCardPlaceholderProps {
  compact?: boolean;
}

const RequestCardPlaceholder = ({ compact }: RequestCardPlaceholderProps) => {
  if (compact) {
    return (
      <div
        className="request-card-placeholder request-card-compact-layout"
        aria-hidden="true"
      />
    );
  }

  return (
    <div className="relative min-h-[17rem] w-72 animate-pulse rounded-xl bg-gray-700 p-4 sm:w-96">
      <div className="w-20 sm:w-28">
        <div className="w-full" style={{ paddingBottom: '150%' }} />
      </div>
    </div>
  );
};

interface RequestCardErrorProps {
  requestData?: NonFunctionProperties<MediaRequest>;
}

const RequestCardError = ({ requestData }: RequestCardErrorProps) => {
  const { hasPermission } = useUser();
  const intl = useIntl();
  const { mediaUrl: plexUrl, mediaUrl4k: plexUrl4k } = useDeepLinks({
    mediaUrl: requestData?.media?.mediaUrl,
    mediaUrl4k: requestData?.media?.mediaUrl4k,
    iOSPlexUrl: requestData?.media?.iOSPlexUrl,
    iOSPlexUrl4k: requestData?.media?.iOSPlexUrl4k,
  });
  const deleteRequest = async () => {
    await axios.delete(`/api/v1/media/${requestData?.media.id}`);
    mutate('/api/v1/media?filter=allavailable&take=20&sort=mediaAdded');
    mutate('/api/v1/request?filter=all&take=10&sort=modified&skip=0');
    mutate('/api/v1/request/count');
  };

  return (
    <div
      className="relative flex w-72 overflow-hidden rounded-xl bg-gray-800 p-4 text-gray-400 shadow ring-1 ring-red-500 sm:w-96"
      data-testid="request-card"
    >
      <div className="w-20 sm:w-28">
        <div className="w-full" style={{ paddingBottom: '150%' }}>
          <div className="absolute inset-0 z-10 flex min-w-0 flex-1 flex-col p-4">
            <div
              className="text-base font-bold whitespace-normal text-white sm:text-lg"
              data-testid="request-card-title"
            >
              {intl.formatMessage(messages.mediaerror, {
                mediaType: intl.formatMessage(
                  requestData?.type
                    ? requestData?.type === 'movie'
                      ? globalMessages.movie
                      : requestData?.type === 'tv'
                        ? globalMessages.tvshow
                        : requestData?.type === 'music'
                          ? globalMessages.music
                          : globalMessages.book
                    : globalMessages.request
                ),
              })}
            </div>
            {requestData && (
              <>
                {hasPermission(
                  [Permission.MANAGE_REQUESTS, Permission.REQUEST_VIEW],
                  { type: 'or' }
                ) && (
                  <div className="card-field !hidden sm:!block">
                    <Link
                      href={`/users/${requestData.requestedBy.id}`}
                      className="group flex items-center"
                    >
                      <span className="avatar-sm">
                        <CachedImage
                          type="avatar"
                          src={requestData.requestedBy.avatar}
                          alt=""
                          className="avatar-sm object-cover"
                          width={20}
                          height={20}
                        />
                      </span>
                      <span className="truncate group-hover:underline">
                        {requestData.requestedBy.displayName}
                      </span>
                    </Link>
                  </div>
                )}
                <div className="mt-2 flex items-center text-sm sm:mt-1">
                  <span className="mr-2 hidden font-bold sm:block">
                    {intl.formatMessage(globalMessages.status)}
                  </span>
                  {requestData.status === MediaRequestStatus.DECLINED ||
                  requestData.status === MediaRequestStatus.FAILED ? (
                    <Badge badgeType="danger">
                      {requestData.status === MediaRequestStatus.DECLINED
                        ? intl.formatMessage(globalMessages.declined)
                        : intl.formatMessage(globalMessages.failed)}
                    </Badge>
                  ) : (
                    <StatusBadge
                      status={getRequestMediaStatus(requestData)}
                      downloadItem={getRequestDownloadStatus(requestData)}
                      title={intl.formatMessage(messages.unknowntitle)}
                      inProgress={
                        (getRequestDownloadStatus(requestData) ?? []).length > 0
                      }
                      is4k={requestData.is4k}
                      externalId={
                        requestData.type === 'book'
                          ? getBookId(requestData)
                          : undefined
                      }
                      mediaType={
                        requestData.type === 'music'
                          ? 'music'
                          : requestData.type === 'book'
                            ? 'book'
                            : requestData.type === 'tv'
                              ? 'tv'
                              : 'movie'
                      }
                      bookFormat={
                        requestData.type === 'book'
                          ? getRequestedBookFormat(requestData.bookFormat)
                          : undefined
                      }
                      plexUrl={requestData.is4k ? plexUrl4k : plexUrl}
                      serviceUrl={getRequestServiceUrl(requestData)}
                    />
                  )}
                </div>
                {requestData.status === MediaRequestStatus.FAILED && (
                  <RequestFailureDetails
                    failureReason={requestData.failureReason}
                    requestId={requestData.id}
                    requestType={requestData.type}
                    descriptionId={getRequestFailureDescriptionId(
                      requestData.id,
                      'request-card'
                    )}
                  />
                )}
              </>
            )}
            <div className="flex flex-1 items-end space-x-2">
              {hasPermission(Permission.MANAGE_REQUESTS) &&
                requestData?.media.id && (
                  <>
                    <Button
                      buttonType="danger"
                      buttonSize="sm"
                      className="mt-4 hidden sm:block"
                      onClick={() => deleteRequest()}
                    >
                      <TrashIcon />
                      <span>{intl.formatMessage(globalMessages.delete)}</span>
                    </Button>
                    <Tooltip
                      content={intl.formatMessage(messages.deleterequest)}
                    >
                      <Button
                        buttonType="danger"
                        buttonSize="sm"
                        className="mt-4 sm:hidden"
                        onClick={() => deleteRequest()}
                      >
                        <TrashIcon />
                      </Button>
                    </Tooltip>
                  </>
                )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

interface RequestCardProps {
  request: NonFunctionProperties<MediaRequest>;
  compact?: boolean;
  showApprovalActions?: boolean;
  onTitleData?: (requestId: number, title: RequestCardTitle) => void;
}

const RequestCard = ({
  request,
  compact = false,
  showApprovalActions = true,
  onTitleData,
}: RequestCardProps) => {
  const { ref, inView } = useInView({
    triggerOnce: true,
  });
  const intl = useIntl();
  const { user, hasPermission } = useUser();
  const { addToast } = useToasts();
  const [isRetrying, setRetrying] = useState(false);
  const [updatingType, setUpdatingType] = useState<
    'approve' | 'decline' | null
  >(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showSeasonMappingModal, setShowSeasonMappingModal] = useState(false);
  const bookId =
    request.type === 'book' ? getNormalizedBookId(request) : undefined;
  const musicId =
    request.type === 'music' ? getNormalizedMusicId(request) : undefined;
  const comicId = request.type === 'comic' ? getComicId(request) : undefined;
  const magazineId =
    request.type === 'magazine' ? getMagazineId(request) : undefined;
  const url =
    request.type === 'movie'
      ? `/api/v1/movie/${request.media.tmdbId}`
      : request.type === 'tv'
        ? `/api/v1/tv/${request.media.tmdbId}`
        : request.type === 'music' && musicId
          ? `/api/v1/music/${encodeApiPathSegment(musicId)}`
          : request.type === 'book' && bookId
            ? `/api/v1/book/${encodeApiPathSegment(bookId)}`
            : request.type === 'comic' && comicId
              ? `/api/v1/comic/${encodeApiPathSegment(comicId)}`
              : request.type === 'magazine' && magazineId
                ? `/api/v1/magazine/${encodeApiPathSegment(magazineId)}`
                : null;

  const { data: title, error } = useSWR<RequestCardTitle>(inView ? url : null);
  const {
    data: requestData,
    error: requestError,
    mutate: revalidate,
  } = useSWR<NonFunctionProperties<MediaRequest>>(
    `/api/v1/request/${request.id}`,
    {
      fallbackData: request,
      refreshInterval: refreshIntervalHelper(
        {
          downloadStatus: request.media.downloadStatus,
          downloadStatus4k: request.media.downloadStatus4k,
          audiobookDownloadStatus: request.media.audiobookDownloadStatus,
        },
        15000
      ),
    }
  );
  const hasPartialBookService =
    requestData?.type === 'book' &&
    requestData.bookFormat === 'both' &&
    !!(
      requestData.media.serviceId !== requestData.media.audiobookServiceId &&
      ((requestData.media.serviceId !== null &&
        requestData.media.serviceId !== undefined) ||
        (requestData.media.audiobookServiceId !== null &&
          requestData.media.audiobookServiceId !== undefined))
    );
  const canRetry =
    requestData &&
    user &&
    canRetryRequest({
      requestType: requestData.type,
      is4k: requestData.is4k,
      requestedById: requestData.requestedBy.id,
      userId: user.id,
      permissions: user.permissions,
    });
  const failureInfo = getRequestFailureInfo(requestData?.failureReason);
  const retryUnavailable = failureInfo?.retryUnavailable ?? false;
  const failureSearchTitle =
    requestData?.type === MediaType.TV &&
    title &&
    'name' in title &&
    typeof title.name === 'string'
      ? title.name
      : undefined;
  const canFailDownload = Boolean(
    requestData &&
    requestData.status === MediaRequestStatus.APPROVED &&
    (requestData.type === 'movie' || requestData.type === 'tv') &&
    getRequestDownloadStatus(requestData)?.some((item) => item.downloadId) &&
    canRetry
  );
  const { mediaUrl: plexUrl, mediaUrl4k: plexUrl4k } = useDeepLinks({
    mediaUrl: requestData?.media?.mediaUrl,
    mediaUrl4k: requestData?.media?.mediaUrl4k,
    iOSPlexUrl: requestData?.media?.iOSPlexUrl,
    iOSPlexUrl4k: requestData?.media?.iOSPlexUrl4k,
  });
  const modifyRequest = async (type: 'approve' | 'decline') => {
    setUpdatingType(type);
    try {
      await axios.post(`/api/v1/request/${request.id}/${type}`);
      revalidate();
      mutate('/api/v1/request/count');
    } catch {
      addToast(intl.formatMessage(messages.failedmodify), {
        autoDismiss: true,
        appearance: 'error',
      });
    } finally {
      setUpdatingType(null);
    }
  };

  const deleteRequest = async () => {
    await axios.delete(`/api/v1/request/${request.id}`);
    mutate('/api/v1/request?filter=all&take=10&sort=modified&skip=0');
    mutate('/api/v1/request/count');
  };

  const retryRequest = async () => {
    if (retryUnavailable) {
      return;
    }

    setRetrying(true);

    try {
      const response = await axios.post(`/api/v1/request/${request.id}/retry`);

      if (response) {
        revalidate();
      }
    } catch {
      addToast(intl.formatMessage(messages.failedretry), {
        autoDismiss: true,
        appearance: 'error',
      });
    } finally {
      setRetrying(false);
    }
  };

  useEffect(() => {
    if (title && onTitleData) {
      onTitleData(request.id, title);
    }
  }, [title, onTitleData, request]);

  if (!title && !error) {
    return (
      <div ref={ref}>
        <RequestCardPlaceholder compact={compact} />
      </div>
    );
  }

  if (!requestData && !requestError) {
    return <RequestCardError />;
  }

  if (
    requestError &&
    axios.isAxiosError(requestError) &&
    requestError.response?.status === 404
  ) {
    return null;
  }

  if (!title || !requestData) {
    return <RequestCardError requestData={requestData} />;
  }

  const visibleMediaStatuses = [
    MediaStatus.PENDING,
    MediaStatus.PROCESSING,
    MediaStatus.PARTIALLY_AVAILABLE,
    MediaStatus.AVAILABLE,
    MediaStatus.BLOCKLISTED,
    MediaStatus.DELETED,
  ];
  const requestedMediaStatus = getRequestMediaStatus(requestData);
  const requestedQualityStatus = visibleMediaStatuses.includes(
    requestedMediaStatus
  )
    ? requestedMediaStatus
    : requestData.status === MediaRequestStatus.PENDING
      ? MediaStatus.PENDING
      : MediaStatus.PROCESSING;
  const availabilityQualityBadges =
    requestData.type === 'movie' || requestData.type === 'tv'
      ? [
          {
            quality: requestData.is4k ? ('4K' as const) : ('HD' as const),
            status: requestedQualityStatus,
            inProgress:
              (getRequestDownloadStatus(requestData) ?? []).length > 0,
          },
        ]
      : [
          {
            quality: undefined,
            status: getRequestMediaStatus(requestData),
            inProgress:
              (getRequestDownloadStatus(requestData) ?? []).length > 0,
          },
        ].filter((badge) => visibleMediaStatuses.includes(badge.status));
  return (
    <>
      {showEditModal && (
        <RequestModal
          show={showEditModal}
          tmdbId={
            request.type === 'music' ||
            request.type === 'book' ||
            request.type === 'comic' ||
            request.type === 'magazine'
              ? undefined
              : request.media.tmdbId
          }
          mbId={request.type === 'music' ? musicId : undefined}
          bookId={request.type === 'book' ? bookId : undefined}
          comicId={request.type === 'comic' ? comicId : undefined}
          magazineTitle={magazineId}
          type={
            request.type === 'music'
              ? 'music'
              : request.type === 'book'
                ? 'book'
                : request.type === 'comic'
                  ? 'comic'
                  : request.type === 'magazine'
                    ? 'magazine'
                    : request.type === 'tv'
                      ? 'tv'
                      : 'movie'
          }
          is4k={request.is4k}
          editRequest={request}
          onCancel={() => setShowEditModal(false)}
          onComplete={() => {
            revalidate();
            setShowEditModal(false);
          }}
        />
      )}
      {showSeasonMappingModal && requestData && (
        <TvSeasonMappingModal
          request={requestData}
          onCancel={() => setShowSeasonMappingModal(false)}
          onComplete={async () => {
            await revalidate();
            mutate('/api/v1/request/count');
            setShowSeasonMappingModal(false);
          }}
        />
      )}
      <div
        className={`app-card-main relative flex overflow-hidden rounded-xl bg-gray-800 bg-cover bg-center p-4 text-gray-400 shadow ring-1 ring-gray-700 ${
          compact ? 'request-card-compact-layout' : 'min-h-[17rem] w-72 sm:w-96'
        }`}
        data-testid="request-card"
      >
        {!isMusic(title) &&
          !isBook(title) &&
          !isComic(title) &&
          !isMagazine(title) &&
          title.backdropPath && (
            <div className="absolute inset-0 z-0">
              <CachedImage
                type="tmdb"
                alt=""
                src={`https://image.tmdb.org/t/p/w1920_and_h800_multi_faces/${title.backdropPath}`}
                className="object-cover"
                fill
              />
              <div className="request-card-artwork-gradient" />
            </div>
          )}
        <div
          className={`relative z-10 flex min-w-0 flex-1 flex-col pr-4 ${
            !isMusic(title) &&
            !isBook(title) &&
            !isComic(title) &&
            !isMagazine(title) &&
            title.backdropPath
              ? 'request-card-artwork-copy'
              : ''
          }`}
          data-testid="request-card-title"
        >
          <div className="flex flex-wrap items-center gap-1 text-xs font-medium text-white">
            {requestData.type !== 'book' && (
              <MediaTypeBadge
                mediaType={getMediaTypeBadgeType(requestData.type) ?? 'movie'}
                variant="button"
              />
            )}
            <span>
              {(isMovie(title)
                ? title.releaseDate
                : isMusic(title)
                  ? title.releaseDate
                  : isBook(title)
                    ? title.firstPublishYear?.toString()
                    : isComic(title)
                      ? title.startYear
                      : isMagazine(title)
                        ? title.latestIssue
                        : title.firstAirDate
              )?.slice(0, 4)}
            </span>
            {isMusic(title) && (
              <>
                <span className="mx-2">-</span>
                <span className="truncate">{title.artist.name}</span>
              </>
            )}
            {isBook(title) && title.author && (
              <>
                <span className="mx-2">-</span>
                <span className="truncate">{title.author}</span>
              </>
            )}
            {isComic(title) && title.publisher && (
              <>
                <span className="mx-2">-</span>
                <span className="truncate">{title.publisher}</span>
              </>
            )}
            {isMagazine(title) && title.latestIssue && (
              <>
                <span className="mx-2">-</span>
                <span className="truncate">{title.latestIssue}</span>
              </>
            )}
          </div>
          <Link
            href={getRequestDetailHref(requestData)}
            className="overflow-hidden text-base font-bold overflow-ellipsis whitespace-nowrap text-white hover:underline sm:text-lg"
          >
            {isMovie(title)
              ? title.title
              : isMusic(title)
                ? title.title
                : isBook(title)
                  ? title.title
                  : isComic(title)
                    ? title.title
                    : isMagazine(title)
                      ? title.title
                      : title.name}
          </Link>
          {hasPermission(
            [Permission.MANAGE_REQUESTS, Permission.REQUEST_VIEW],
            { type: 'or' }
          ) && (
            <div className="card-field">
              <Link
                href={`/users/${requestData.requestedBy.id}`}
                className="group flex items-center"
              >
                <span className="avatar-sm">
                  <CachedImage
                    type="avatar"
                    src={requestData.requestedBy.avatar}
                    alt=""
                    className="avatar-sm object-cover"
                    width={20}
                    height={20}
                  />
                </span>
                <span className="truncate font-semibold group-hover:text-white group-hover:underline">
                  {requestData.requestedBy.displayName}
                </span>
              </Link>
            </div>
          )}
          {requestData.type === 'book' && (
            <div className="card-field">
              <span className="card-field-name">
                {intl.formatMessage(messages.bookFormat)}
              </span>
              <BookFormatBadge
                format={getRequestedBookFormat(requestData.bookFormat)}
                variant="compact"
              />
            </div>
          )}
          {hasPartialBookService && (
            <div className="card-field">
              <span className="card-field-name">
                {intl.formatMessage(messages.partialBookService)}
              </span>
              <span className="flex truncate text-sm text-gray-300">
                {requestData.media.serviceId !== null &&
                requestData.media.serviceId !== undefined
                  ? intl.formatMessage(messages.ebook)
                  : intl.formatMessage(messages.audiobook)}
              </span>
            </div>
          )}
          <div className="request-status-action-row mt-2 flex flex-wrap items-center text-sm sm:mt-1">
            {requestData.type === 'movie' || requestData.type === 'tv' ? (
              requestData.status === MediaRequestStatus.FAILED ? (
                <Link
                  className="request-status-control request-status-control-link request-status-control-danger"
                  href={getRequestDetailHref(requestData, true)}
                  aria-describedby={
                    failureInfo
                      ? getRequestFailureDescriptionId(
                          requestData.id,
                          'request-card'
                        )
                      : undefined
                  }
                >
                  <FailedStatusIcon
                    className="request-status-control-icon"
                    aria-hidden="true"
                  />
                  {intl.formatMessage(globalMessages.failed)}
                </Link>
              ) : requestData.status === MediaRequestStatus.DECLINED ? (
                <Link
                  className="request-status-control request-status-control-link request-status-control-danger"
                  href={getRequestDetailHref(requestData, true)}
                >
                  <FailedStatusIcon
                    className="request-status-control-icon"
                    aria-hidden="true"
                  />
                  {intl.formatMessage(globalMessages.declined)}
                </Link>
              ) : canFailDownload ? (
                <StatusBadge
                  status={getRequestMediaStatus(requestData)}
                  downloadItem={getRequestDownloadStatus(requestData)}
                  title={
                    isMovie(title)
                      ? title.title
                      : isMusic(title)
                        ? title.title
                        : isBook(title)
                          ? title.title
                          : isComic(title)
                            ? title.title
                            : isMagazine(title)
                              ? title.title
                              : title.name
                  }
                  inProgress={
                    (getRequestDownloadStatus(requestData) ?? []).length > 0
                  }
                  is4k={requestData.is4k}
                  tmdbId={requestData.media.tmdbId}
                  mediaType={requestData.type === 'tv' ? 'tv' : 'movie'}
                  plexUrl={requestData.is4k ? plexUrl4k : plexUrl}
                  serviceUrl={getRequestServiceUrl(requestData)}
                  requestId={requestData.id}
                  canFailDownload
                  showQuality={false}
                  className="request-status-control request-status-control-link request-status-control-warning"
                  leadingIcon={
                    <ProcessingStatusIcon
                      className="request-status-control-icon"
                      aria-hidden="true"
                    />
                  }
                />
              ) : requestedQualityStatus === MediaStatus.AVAILABLE ? (
                <Link
                  className="request-status-control request-status-control-link request-status-control-success"
                  href={getRequestDetailHref(requestData, true)}
                >
                  <AvailableStatusIcon
                    className="request-status-control-icon"
                    aria-hidden="true"
                  />
                  {intl.formatMessage(globalMessages.available)}
                </Link>
              ) : requestData.status === MediaRequestStatus.PENDING ? (
                <Link
                  className="request-status-control request-status-control-link request-status-control-pending"
                  href={getRequestDetailHref(requestData, true)}
                >
                  <PendingStatusIcon
                    className="request-status-control-icon"
                    aria-hidden="true"
                  />
                  {intl.formatMessage(globalMessages.pending)}
                </Link>
              ) : (
                <Link
                  className="request-status-control request-status-control-link request-status-control-warning"
                  href={getRequestDetailHref(requestData, true)}
                >
                  <ProcessingStatusIcon
                    className="request-status-control-icon"
                    aria-hidden="true"
                  />
                  {intl.formatMessage(globalMessages.processing)}
                </Link>
              )
            ) : requestData.status === MediaRequestStatus.DECLINED ? (
              <Badge badgeType="danger">
                {intl.formatMessage(globalMessages.declined)}
              </Badge>
            ) : requestData.status === MediaRequestStatus.FAILED ? (
              <Button
                as="a"
                buttonType="danger"
                buttonSize="sm"
                href={getRequestDetailHref(requestData, true)}
              >
                <FailedStatusIcon
                  className="request-status-control-icon"
                  aria-hidden="true"
                />
                {intl.formatMessage(globalMessages.failed)}
              </Button>
            ) : requestData.status === MediaRequestStatus.PENDING &&
              getRequestMediaStatus(requestData) === MediaStatus.DELETED ? (
              <Badge
                badgeType="warning"
                href={getRequestDetailHref(requestData, true)}
              >
                {intl.formatMessage(globalMessages.pending)}
              </Badge>
            ) : (
              availabilityQualityBadges.map((badge) => (
                <StatusBadgeMini
                  key={badge.quality ?? 'availability'}
                  status={badge.status}
                  quality={badge.quality}
                  inProgress={badge.inProgress}
                  shrink
                  buttonStyle
                />
              ))
            )}
            {(requestData.type === 'movie' || requestData.type === 'tv') &&
              availabilityQualityBadges.map((badge) => (
                <StatusBadgeMini
                  key={badge.quality ?? 'availability'}
                  status={badge.status}
                  quality={badge.quality}
                  inProgress={badge.inProgress}
                  shrink
                  buttonStyle
                />
              ))}
          </div>
          {requestData.status === MediaRequestStatus.FAILED && (
            <RequestFailureDetails
              failureReason={requestData.failureReason}
              requestId={requestData.id}
              requestType={requestData.type}
              searchTitle={failureSearchTitle}
              descriptionId={getRequestFailureDescriptionId(
                requestData.id,
                'request-card'
              )}
            />
          )}
          {requestData.status === MediaRequestStatus.FAILED && canRetry && (
            <Tooltip content={intl.formatMessage(messages.retryRequest)}>
              <Button
                buttonType="warning"
                buttonSize="sm"
                disabled={isRetrying || retryUnavailable}
                disabledReason={
                  retryUnavailable
                    ? intl.formatMessage(
                        globalMessages.requestFailureRetryUnavailable
                      )
                    : undefined
                }
                buttonIcon="retry"
                aria-busy={isRetrying}
                aria-describedby={
                  retryUnavailable
                    ? getRequestFailureDescriptionId(
                        requestData.id,
                        'request-card'
                      )
                    : undefined
                }
                onClick={() => retryRequest()}
              >
                {intl.formatMessage(messages.retry)}
              </Button>
            </Tooltip>
          )}
          {canRetry &&
            hasPermission(Permission.MANAGE_REQUESTS) &&
            canManuallyMapTvdbSeasons(
              requestData.type,
              requestData.status,
              requestData.failureReason
            ) && (
              <Button
                buttonType="primary"
                buttonSize="sm"
                disabled={isRetrying}
                onClick={() => setShowSeasonMappingModal(true)}
              >
                {intl.formatMessage(messages.mapTvSeasons)}
              </Button>
            )}
          <div className="flex flex-1 items-end space-x-2">
            {showApprovalActions &&
              requestData.status === MediaRequestStatus.PENDING &&
              hasPermission(Permission.MANAGE_REQUESTS) && (
                <>
                  <div>
                    <Button
                      buttonType="success"
                      buttonSize="sm"
                      className="hidden sm:block"
                      onClick={() => modifyRequest('approve')}
                      disabled={updatingType !== null}
                    >
                      {updatingType === 'approve' ? <Spinner /> : <CheckIcon />}
                      <span>{intl.formatMessage(globalMessages.approve)}</span>
                    </Button>
                    <Tooltip
                      content={intl.formatMessage(messages.approverequest)}
                    >
                      <Button
                        buttonType="success"
                        buttonSize="sm"
                        className="sm:hidden"
                        onClick={() => modifyRequest('approve')}
                        disabled={updatingType !== null}
                      >
                        {updatingType === 'approve' ? (
                          <Spinner />
                        ) : (
                          <CheckIcon />
                        )}
                      </Button>
                    </Tooltip>
                  </div>
                  <div>
                    <Button
                      buttonType="danger"
                      buttonSize="sm"
                      className="hidden sm:block"
                      onClick={() => modifyRequest('decline')}
                      disabled={updatingType !== null}
                    >
                      {updatingType === 'decline' ? <Spinner /> : <XMarkIcon />}
                      <span>{intl.formatMessage(globalMessages.decline)}</span>
                    </Button>
                    <Tooltip
                      content={intl.formatMessage(messages.declinerequest)}
                    >
                      <Button
                        buttonType="danger"
                        buttonSize="sm"
                        className="sm:hidden"
                        onClick={() => modifyRequest('decline')}
                        disabled={updatingType !== null}
                      >
                        {updatingType === 'decline' ? (
                          <Spinner />
                        ) : (
                          <XMarkIcon />
                        )}
                      </Button>
                    </Tooltip>
                  </div>
                </>
              )}
            {requestData.status === MediaRequestStatus.PENDING &&
              !hasPermission(Permission.MANAGE_REQUESTS) &&
              requestData.requestedBy.id === user?.id &&
              (requestData.type === 'tv' ||
                hasPermission(Permission.REQUEST_ADVANCED)) && (
                <div>
                  {!hasPermission(Permission.MANAGE_REQUESTS) && (
                    <Button
                      buttonType="primary"
                      buttonSize="sm"
                      className="hidden sm:block"
                      onClick={() => setShowEditModal(true)}
                      disabled={updatingType !== null}
                    >
                      <PencilIcon />
                      <span>{intl.formatMessage(globalMessages.edit)}</span>
                    </Button>
                  )}
                  <Tooltip content={intl.formatMessage(messages.editrequest)}>
                    <Button
                      buttonType="primary"
                      buttonSize="sm"
                      className="sm:hidden"
                      onClick={() => setShowEditModal(true)}
                      disabled={updatingType !== null}
                    >
                      <PencilIcon />
                    </Button>
                  </Tooltip>
                </div>
              )}
            {requestData.status === MediaRequestStatus.PENDING &&
              !hasPermission(Permission.MANAGE_REQUESTS) &&
              requestData.requestedBy.id === user?.id && (
                <div>
                  <Button
                    buttonType="danger"
                    buttonSize="sm"
                    className="hidden sm:block"
                    onClick={() => deleteRequest()}
                  >
                    <XMarkIcon />
                    <span>{intl.formatMessage(globalMessages.cancel)}</span>
                  </Button>
                  <Tooltip content={intl.formatMessage(messages.cancelrequest)}>
                    <Button
                      buttonType="danger"
                      buttonSize="sm"
                      className="sm:hidden"
                      onClick={() => deleteRequest()}
                    >
                      <XMarkIcon />
                    </Button>
                  </Tooltip>
                </div>
              )}
          </div>
        </div>
        <Link
          href={getRequestDetailHref(requestData)}
          className="relative w-20 flex-shrink-0 scale-100 transform-gpu cursor-pointer self-stretch overflow-hidden rounded-md shadow-sm ring-1 ring-gray-700 transition duration-300 hover:scale-105 hover:shadow-md sm:w-28"
        >
          <CachedImage
            type={isBook(title) ? 'book' : isMusic(title) ? 'music' : 'tmdb'}
            src={
              (isMusic(title) || isBook(title)) && title.posterPath
                ? title.posterPath
                : !isMusic(title) && !isBook(title) && title.posterPath
                  ? getTmdbPosterImageUrl(title.posterPath)
                  : '/images/seerr_poster_not_found.png'
            }
            alt=""
            sizes="100vw"
            className="object-cover"
            fill
          />
        </Link>
      </div>
    </>
  );
};

export default withProperties(RequestCard, {
  Placeholder: RequestCardPlaceholder,
});
