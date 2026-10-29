import Spinner from '@app/assets/spinner.svg';
import Badge from '@app/components/Common/Badge';
import BookFormatBadge, {
  getRequestedBookFormat,
} from '@app/components/Common/BookFormatBadge';
import Button from '@app/components/Common/Button';
import CachedImage from '@app/components/Common/CachedImage';
import ConfirmButton from '@app/components/Common/ConfirmButton';
import MediaTypeBadge, {
  getMediaTypeBadgeType,
} from '@app/components/Common/MediaTypeBadge';
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
import { isActiveSeasonRequest } from '@app/utils/tvRequestSelection';
import {
  ArrowPathIcon,
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
import type { RequestResultsResponse } from '@server/interfaces/api/requestInterfaces';
import type { BookDetails } from '@server/models/Book';
import type { ComicDetails } from '@server/models/Comic';
import type { MagazineDetails } from '@server/models/Magazine';
import type { MovieDetails } from '@server/models/Movie';
import type { MusicDetails } from '@server/models/Music';
import type { SportarrDetails } from '@server/models/Sportarr';
import type { TvDetails } from '@server/models/Tv';
import axios from 'axios';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useState } from 'react';
import { useInView } from 'react-intersection-observer';
import { FormattedRelativeTime, useIntl } from 'react-intl';
import useSWR, { mutate } from 'swr';

const RequestModal = dynamic(() => import('@app/components/RequestModal'), {
  ssr: false,
});
const TvSeasonMappingModal = dynamic(
  () => import('@app/components/RequestCard/TvSeasonMappingModal'),
  { ssr: false }
);

const messages = defineMessages('components.RequestList.RequestItem', {
  seasons: '{seasonCount, plural, one {Season} other {Seasons}}',
  failedretry: 'Something went wrong while retrying the request.',
  failedmodify: 'Something went wrong while modifying the request.',
  mapTvSeasons: 'Map TV seasons',
  requested: 'Requested',
  requesteddate: 'Requested',
  modified: 'Modified',
  modifieduserdate: '{date} by {user}',
  mediaerror: '{mediaType} Not Found',
  editrequest: 'Edit Request',
  deleterequest: 'Delete Request',
  cancelRequest: 'Cancel Request',
  tmdbid: 'TMDB ID',
  tvdbid: 'TheTVDB ID',
  mbid: 'MusicBrainz ID',
  olid: 'Open Library ID',
  unknowntitle: 'Unknown Title',
  removearr: 'Remove from {arr}',
  removemediaerror: 'Something went wrong while removing the media.',
  profileName: 'Profile',
  bookFormat: 'Format',
  ebook: 'Book',
  audiobook: 'Audiobook',
  both: 'Both',
  partialBookService: 'Partial Bookshelf link',
  overQuota: 'Over quota',
  watchAheadAssigned:
    'Episode Queue · {count, plural, one {# episode} other {# episodes}} by administrator',
  watchAheadEpisodeBadge: 'Auto-Queued',
  watchAheadEpisodeBadgeTooltip:
    'Automatically requested by the Episode Queue as playback progressed.',
});

type RequestItemTitle =
  | MovieDetails
  | TvDetails
  | MusicDetails
  | BookDetails
  | ComicDetails
  | MagazineDetails
  | SportarrDetails;

const isMovie = (media: RequestItemTitle): media is MovieDetails => {
  return (
    (media as MovieDetails).releaseDate !== undefined &&
    (media as MovieDetails).originalTitle !== undefined
  );
};

const isMusic = (media: RequestItemTitle): media is MusicDetails => {
  return (media as MusicDetails).artist !== undefined;
};

const isBook = (media: RequestItemTitle): media is BookDetails => {
  return (media as BookDetails).mediaType === 'book';
};

const isComic = (media: RequestItemTitle): media is ComicDetails => {
  return (media as ComicDetails).mediaType === 'comic';
};

const isMagazine = (media: RequestItemTitle): media is MagazineDetails =>
  (media as MagazineDetails).mediaType === 'magazine';

const isSports = (media: RequestItemTitle): media is SportarrDetails =>
  (media as SportarrDetails).mediaType === 'sports';

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

const getSportarrId = (request: NonFunctionProperties<MediaRequest>) =>
  request.media.identifiers?.find(
    (identifier) => identifier.provider === 'sportarr'
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
  const sportarrId = getSportarrId(request);

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
  if (request.type === 'sports' && sportarrId) {
    return `/sportarr/${encodeApiPathSegment(sportarrId)}${suffix}`;
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

interface RequestItemErrorProps {
  requestData?: NonFunctionProperties<MediaRequest>;
  revalidateList: () => void;
}

const RequestItemError = ({
  requestData,
  revalidateList,
}: RequestItemErrorProps) => {
  const intl = useIntl();
  const { hasPermission } = useUser();

  const deleteRequest = async () => {
    await axios.delete(`/api/v1/media/${requestData?.media.id}`);
    revalidateList();
    mutate('/api/v1/request/count');
  };

  const { mediaUrl: plexUrl, mediaUrl4k: plexUrl4k } = useDeepLinks({
    mediaUrl: requestData?.media?.mediaUrl,
    mediaUrl4k: requestData?.media?.mediaUrl4k,
    iOSPlexUrl: requestData?.media?.iOSPlexUrl,
    iOSPlexUrl4k: requestData?.media?.iOSPlexUrl4k,
  });

  return (
    <div className="flex h-64 w-full flex-col justify-center rounded-xl bg-gray-800 py-4 text-gray-400 shadow-md ring-1 ring-red-500 xl:h-28 xl:flex-row">
      <div className="flex w-full flex-col justify-between overflow-hidden sm:flex-row">
        <div className="flex w-full flex-col justify-center overflow-hidden ps-4 pe-4 sm:pe-0 xl:w-7/12 2xl:w-2/3">
          <div className="flex text-lg font-bold text-white xl:text-xl">
            {intl.formatMessage(messages.mediaerror, {
              mediaType: intl.formatMessage(
                requestData?.type
                  ? requestData?.type === 'movie'
                    ? globalMessages.movie
                    : requestData?.type === 'tv'
                      ? globalMessages.tvshow
                      : requestData?.type === 'music'
                        ? globalMessages.music
                        : requestData?.type === 'comic'
                          ? globalMessages.comic
                          : requestData?.type === 'magazine'
                            ? globalMessages.magazine
                            : requestData?.type === 'sports'
                              ? globalMessages.sports
                              : globalMessages.book
                  : globalMessages.request
              ),
            })}
          </div>
          {requestData && hasPermission(Permission.MANAGE_REQUESTS) && (
            <>
              {requestData.type !== 'music' &&
                requestData.type !== 'book' &&
                requestData.type !== 'comic' &&
                requestData.type !== 'magazine' &&
                requestData.type !== 'sports' && (
                  <div className="card-field">
                    <span className="card-field-name">
                      {intl.formatMessage(messages.tmdbid)}
                    </span>
                    <span className="flex truncate text-sm text-gray-300">
                      {requestData.media.tmdbId}
                    </span>
                  </div>
                )}
              {requestData.type === 'book' && getBookId(requestData) && (
                <div className="card-field">
                  <span className="card-field-name">
                    {intl.formatMessage(messages.olid)}
                  </span>
                  <span className="flex truncate text-sm text-gray-300">
                    {getBookId(requestData)}
                  </span>
                </div>
              )}
              {requestData.media.tvdbId && (
                <div className="card-field">
                  <span className="card-field-name">
                    {intl.formatMessage(messages.tvdbid)}
                  </span>
                  <span className="flex truncate text-sm text-gray-300">
                    {requestData?.media.tvdbId}
                  </span>
                </div>
              )}
              {requestData.media.mbId && requestData.type === 'music' && (
                <div className="card-field">
                  <span className="card-field-name">
                    {intl.formatMessage(messages.mbid)}
                  </span>
                  <span className="flex truncate text-sm text-gray-300">
                    {requestData.media.mbId}
                  </span>
                </div>
              )}
            </>
          )}
        </div>
        <div className="ms-4 mt-4 flex w-full flex-col justify-center overflow-hidden pe-4 text-sm sm:ms-2 sm:mt-0 xl:flex-1 xl:pe-0">
          {requestData && (
            <>
              <div className="card-field">
                <span className="card-field-name">
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
                        : requestData.type === 'comic'
                          ? getComicId(requestData)
                          : requestData.type === 'magazine'
                            ? getMagazineId(requestData)
                            : requestData.type === 'sports'
                              ? getSportarrId(requestData)
                              : undefined
                    }
                    mediaType={
                      requestData.type === 'music'
                        ? 'music'
                        : requestData.type === 'book'
                          ? 'book'
                          : requestData.type === 'comic'
                            ? 'comic'
                            : requestData.type === 'magazine'
                              ? 'magazine'
                              : requestData.type === 'sports'
                                ? 'sports'
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
              <div className="card-field">
                {hasPermission(
                  [Permission.MANAGE_REQUESTS, Permission.REQUEST_VIEW],
                  { type: 'or' }
                ) ? (
                  <>
                    <span className="card-field-name">
                      {intl.formatMessage(messages.requested)}
                    </span>
                    <span className="flex truncate text-sm text-gray-300">
                      {intl.formatMessage(messages.modifieduserdate, {
                        date: (
                          <FormattedRelativeTime
                            key="date"
                            value={Math.floor(
                              (new Date(requestData.createdAt).getTime() -
                                Date.now()) /
                                1000
                            )}
                            updateIntervalInSeconds={1}
                            numeric="auto"
                          />
                        ),
                        user: (
                          <Link
                            key="user"
                            href={`/users/${requestData.requestedBy.id}`}
                            className="group flex items-center truncate"
                          >
                            <span className="avatar-sm ms-1.5">
                              <CachedImage
                                type="avatar"
                                src={requestData.requestedBy.avatar}
                                alt=""
                                className="avatar-sm object-cover"
                                width={20}
                                height={20}
                              />
                            </span>
                            <span className="truncate text-sm group-hover:underline">
                              {requestData.requestedBy.displayName}
                            </span>
                          </Link>
                        ),
                      })}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="card-field-name">
                      {intl.formatMessage(messages.requesteddate)}
                    </span>
                    <span className="flex truncate text-sm text-gray-300">
                      <FormattedRelativeTime
                        key="date"
                        value={Math.floor(
                          (new Date(requestData.createdAt).getTime() -
                            Date.now()) /
                            1000
                        )}
                        updateIntervalInSeconds={1}
                        numeric="auto"
                      />
                    </span>
                  </>
                )}
              </div>
              {requestData.modifiedBy && (
                <div className="card-field">
                  <span className="card-field-name">
                    {intl.formatMessage(messages.modified)}
                  </span>
                  <span className="flex truncate text-sm text-gray-300">
                    {intl.formatMessage(messages.modifieduserdate, {
                      date: (
                        <FormattedRelativeTime
                          key="date"
                          value={Math.floor(
                            (new Date(requestData.updatedAt).getTime() -
                              Date.now()) /
                              1000
                          )}
                          updateIntervalInSeconds={1}
                          numeric="auto"
                        />
                      ),
                      user: (
                        <Link
                          key="user"
                          href={`/users/${requestData.modifiedBy.id}`}
                          className="group flex items-center truncate"
                        >
                          <span className="avatar-sm ms-1.5">
                            <CachedImage
                              type="avatar"
                              src={requestData.modifiedBy.avatar}
                              alt=""
                              className="avatar-sm object-cover"
                              width={20}
                              height={20}
                            />
                          </span>
                          <span className="truncate text-sm group-hover:underline">
                            {requestData.modifiedBy.displayName}
                          </span>
                        </Link>
                      ),
                    })}
                  </span>
                </div>
              )}
            </>
          )}
        </div>
      </div>
      <div className="z-10 mt-4 flex w-full flex-col justify-center ps-4 pe-4 xl:mt-0 xl:w-96 xl:items-end xl:ps-0">
        {hasPermission(Permission.MANAGE_REQUESTS) && requestData?.media.id && (
          <Button
            className="w-full"
            buttonType="danger"
            onClick={() => deleteRequest()}
          >
            <TrashIcon />
            <span>{intl.formatMessage(messages.deleterequest)}</span>
          </Button>
        )}
      </div>
    </div>
  );
};

interface RequestItemProps {
  request: RequestResultsResponse['results'][number];
  revalidateList: () => void;
}

const RequestItem = ({ request, revalidateList }: RequestItemProps) => {
  const { ref, inView } = useInView({
    triggerOnce: true,
  });
  const { addToast } = useToasts();
  const intl = useIntl();
  const { user, hasPermission } = useUser();
  const [showEditModal, setShowEditModal] = useState(false);
  const [showSeasonMappingModal, setShowSeasonMappingModal] = useState(false);
  const bookId =
    request.type === 'book' ? getNormalizedBookId(request) : undefined;
  const musicId =
    request.type === 'music' ? getNormalizedMusicId(request) : undefined;
  const comicId = request.type === 'comic' ? getComicId(request) : undefined;
  const magazineId =
    request.type === 'magazine' ? getMagazineId(request) : undefined;
  const sportarrId =
    request.type === 'sports' ? getSportarrId(request) : undefined;
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
                : request.type === 'sports' && sportarrId
                  ? `/api/v1/sportarr/${encodeApiPathSegment(sportarrId)}`
                  : null;
  const { data: title, error } = useSWR<RequestItemTitle>(inView ? url : null);
  const { data: requestData, mutate: revalidate } = useSWR<
    NonFunctionProperties<MediaRequest>
  >(`/api/v1/request/${request.id}`, {
    fallbackData: request,
    refreshInterval: refreshIntervalHelper(
      {
        downloadStatus: request.media.downloadStatus,
        downloadStatus4k: request.media.downloadStatus4k,
        audiobookDownloadStatus: request.media.audiobookDownloadStatus,
      },
      15000
    ),
  });
  const activeSeasonRequests = (requestData?.seasons ?? request.seasons).filter(
    isActiveSeasonRequest
  );
  const failureInfo = getRequestFailureInfo(requestData?.failureReason);
  const retryUnavailable = failureInfo?.retryUnavailable ?? false;
  const canRetry = Boolean(
    requestData &&
    user &&
    canRetryRequest({
      requestType: requestData.type,
      is4k: requestData.is4k,
      requestedById: requestData.requestedBy.id,
      userId: user.id,
      permissions: user.permissions,
    })
  );
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
    user &&
    canRetryRequest({
      requestType: requestData.type,
      is4k: requestData.is4k,
      requestedById: requestData.requestedBy.id,
      userId: user.id,
      permissions: user.permissions,
    })
  );

  const [isRetrying, setRetrying] = useState(false);
  const [updatingType, setUpdatingType] = useState<
    'approve' | 'decline' | null
  >(null);
  const hasPartialBookService =
    requestData?.type === 'book' && requestData.bookFormat === 'both'
      ? hasBookFormat(requestData, 'ebook') !==
        hasBookFormat(requestData, 'audiobook')
      : false;
  const removableBookFormat =
    requestData?.type === 'book' && requestData.bookFormat === 'both'
      ? hasPartialBookService
        ? hasBookFormat(requestData, 'ebook')
          ? 'ebook'
          : 'audiobook'
        : 'both'
      : requestData?.type === 'book'
        ? (requestData.bookFormat ?? 'ebook')
        : undefined;

  const modifyRequest = async (type: 'approve' | 'decline') => {
    setUpdatingType(type);
    try {
      await axios.post(`/api/v1/request/${request.id}/${type}`);
      revalidate();
      revalidateList();
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

    revalidateList();
    mutate('/api/v1/request/count');
  };

  const deleteMediaFile = async () => {
    if (requestData?.media) {
      const formatQuery =
        requestData.type === 'book' && removableBookFormat
          ? `&format=${removableBookFormat}`
          : '';

      try {
        await axios.delete(
          `/api/v1/media/${requestData.media.id}/file?is4k=${requestData.is4k}${formatQuery}`
        );
        if (requestData.type !== 'book' || removableBookFormat === 'both') {
          await axios.delete(`/api/v1/media/${requestData.media.id}`);
        }
      } catch (e) {
        if (!axios.isAxiosError(e) || e.response?.status !== 404) {
          addToast(intl.formatMessage(messages.removemediaerror), {
            autoDismiss: true,
            appearance: 'error',
          });
          revalidateList();
          return;
        }
      }
      revalidateList();
    }
  };

  const retryRequest = async () => {
    if (retryUnavailable) {
      return;
    }

    setRetrying(true);

    try {
      const result = await axios.post(`/api/v1/request/${request.id}/retry`);
      revalidate(result.data);
    } catch {
      addToast(intl.formatMessage(messages.failedretry), {
        autoDismiss: true,
        appearance: 'error',
      });
    } finally {
      setRetrying(false);
    }
  };

  const { mediaUrl: plexUrl, mediaUrl4k: plexUrl4k } = useDeepLinks({
    mediaUrl: requestData?.media?.mediaUrl,
    mediaUrl4k: requestData?.media?.mediaUrl4k,
    iOSPlexUrl: requestData?.media?.iOSPlexUrl,
    iOSPlexUrl4k: requestData?.media?.iOSPlexUrl4k,
  });

  if (!title && !error) {
    return (
      <div
        className="h-64 w-full animate-pulse rounded-xl bg-gray-800 xl:h-28"
        ref={ref}
      />
    );
  }

  if (!title || !requestData) {
    return (
      <RequestItemError
        requestData={requestData}
        revalidateList={revalidateList}
      />
    );
  }

  return (
    <>
      <RequestModal
        show={showEditModal}
        tmdbId={
          request.type === 'music' ||
          request.type === 'book' ||
          request.type === 'comic' ||
          request.type === 'magazine' ||
          request.type === 'sports'
            ? undefined
            : request.media.tmdbId
        }
        mbId={request.type === 'music' ? musicId : undefined}
        bookId={request.type === 'book' ? bookId : undefined}
        comicId={request.type === 'comic' ? comicId : undefined}
        magazineTitle={magazineId}
        sportarrLeagueId={sportarrId}
        sportarrTitle={isSports(title) ? title.title : undefined}
        type={
          request.type === 'music'
            ? 'music'
            : request.type === 'book'
              ? 'book'
              : request.type === 'comic'
                ? 'comic'
                : request.type === 'magazine'
                  ? 'magazine'
                  : request.type === 'sports'
                    ? 'sports'
                    : request.type === 'tv'
                      ? 'tv'
                      : 'movie'
        }
        is4k={request.is4k}
        editRequest={request}
        onCancel={() => setShowEditModal(false)}
        onComplete={() => {
          revalidateList();
          setShowEditModal(false);
        }}
      />
      {showSeasonMappingModal && requestData && (
        <TvSeasonMappingModal
          request={requestData}
          onCancel={() => setShowSeasonMappingModal(false)}
          onComplete={async () => {
            await revalidate();
            revalidateList();
            mutate('/api/v1/request/count');
            setShowSeasonMappingModal(false);
          }}
        />
      )}
      <div
        data-interface-role="request-card"
        className="relative flex w-full flex-col justify-between overflow-hidden rounded-xl bg-gray-800 py-2 text-gray-400 shadow-md ring-1 ring-gray-700 xl:h-28 xl:flex-row"
      >
        {!isMusic(title) &&
          !isBook(title) &&
          !isComic(title) &&
          !isMagazine(title) &&
          !isSports(title) &&
          title.backdropPath && (
            <div className="absolute inset-0 z-0 w-full bg-cover bg-center xl:w-2/3">
              <CachedImage
                type="tmdb"
                src={`https://image.tmdb.org/t/p/w1920_and_h800_multi_faces/${title.backdropPath}`}
                alt=""
                className="object-cover"
                fill
              />
              <div className="request-card-artwork-gradient" />
            </div>
          )}
        <div className="relative flex w-full flex-col justify-between overflow-hidden sm:flex-row">
          <div className="relative z-10 flex w-full items-center overflow-hidden ps-4 pe-4 sm:pe-0 xl:w-7/12 2xl:w-2/3">
            <Link
              href={getRequestDetailHref(requestData)}
              className="relative h-auto w-12 flex-shrink-0 scale-100 transform-gpu overflow-hidden rounded-md transition duration-300 hover:scale-105"
            >
              <CachedImage
                type={
                  isBook(title)
                    ? 'book'
                    : isMusic(title)
                      ? 'music'
                      : isComic(title) || isMagazine(title)
                        ? 'book'
                        : 'tmdb'
                }
                src={
                  (isMusic(title) ||
                    isBook(title) ||
                    isComic(title) ||
                    isMagazine(title) ||
                    isSports(title)) &&
                  title.posterPath
                    ? title.posterPath
                    : !isMusic(title) &&
                        !isBook(title) &&
                        !isComic(title) &&
                        !isMagazine(title) &&
                        !isSports(title) &&
                        title.posterPath
                      ? getTmdbPosterImageUrl(title.posterPath)
                      : '/images/seerr_poster_not_found.png'
                }
                alt=""
                sizes="100vw"
                className="h-auto w-full object-cover"
                width={600}
                height={900}
              />
            </Link>
            <div className="flex flex-col justify-center overflow-hidden ps-2 xl:ps-4">
              <div className="flex flex-wrap items-center gap-1 pt-0.5 text-xs font-medium text-white sm:pt-1">
                {requestData.type !== 'book' && (
                  <MediaTypeBadge
                    mediaType={
                      getMediaTypeBadgeType(requestData.type) ?? 'movie'
                    }
                    variant="compact"
                  />
                )}
                {requestData.type !== 'book' && requestData.is4k && (
                  <Badge badgeType="warning">4K</Badge>
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
                            : isSports(title)
                              ? title.year?.toString()
                              : title.firstAirDate
                  )?.slice(0, 4)}
                </span>
                {requestData.status === MediaRequestStatus.PENDING &&
                  requestData.quotaException && (
                    <Badge badgeType="warning">
                      {intl.formatMessage(messages.overQuota)}
                    </Badge>
                  )}
              </div>
              <Link
                href={getRequestDetailHref(requestData)}
                className="me-2 min-w-0 truncate text-lg font-bold text-white hover:underline xl:text-xl"
              >
                {isMovie(title)
                  ? title.title
                  : isMusic(title)
                    ? title.title
                    : isBook(title)
                      ? title.title
                      : isComic(title) || isMagazine(title) || isSports(title)
                        ? title.title
                        : title.name}
              </Link>
              {(isMusic(title) || isBook(title)) && (
                <div className="me-2 min-w-0 truncate text-sm text-gray-300">
                  {isMusic(title) ? title.artist.name : title.author}
                </div>
              )}
              {isMagazine(title) && title.latestIssue && (
                <div className="me-2 min-w-0 truncate text-sm text-gray-300">
                  {title.latestIssue}
                </div>
              )}
              {isSports(title) && (title.sport || title.country) && (
                <div className="me-2 min-w-0 truncate text-sm text-gray-300">
                  {[title.sport, title.country].filter(Boolean).join(' · ')}
                </div>
              )}
              {!isMovie(title) &&
                !isMusic(title) &&
                !isBook(title) &&
                activeSeasonRequests.length > 0 && (
                  <div className="card-field">
                    <span className="card-field-name">
                      {intl.formatMessage(messages.seasons, {
                        seasonCount: activeSeasonRequests.length,
                      })}
                    </span>
                    <div className="hide-scrollbar flex flex-nowrap overflow-x-scroll">
                      {activeSeasonRequests.map((season) => (
                        <span key={`season-${season.id}`} className="me-2">
                          <Badge>
                            {season.seasonNumber === 0
                              ? intl.formatMessage(globalMessages.specials)
                              : season.seasonNumber}
                          </Badge>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
            </div>
          </div>
          <div className="z-10 ms-4 mt-4 flex w-full flex-col justify-center gap-1 overflow-hidden pe-4 text-sm sm:ms-2 sm:mt-0 xl:flex-1 xl:pe-0">
            <div className="card-field">
              <span className="card-field-name">
                {intl.formatMessage(globalMessages.status)}
              </span>
              {requestData.status === MediaRequestStatus.DECLINED ? (
                <Badge badgeType="danger">
                  {intl.formatMessage(globalMessages.declined)}
                </Badge>
              ) : requestData.status === MediaRequestStatus.FAILED ? (
                <Badge
                  badgeType="danger"
                  href={getRequestDetailHref(requestData, true)}
                  aria-describedby={
                    failureInfo
                      ? getRequestFailureDescriptionId(
                          requestData.id,
                          'request-list'
                        )
                      : undefined
                  }
                >
                  {intl.formatMessage(globalMessages.failed)}
                </Badge>
              ) : requestData.status === MediaRequestStatus.PENDING &&
                getRequestMediaStatus(requestData) === MediaStatus.DELETED ? (
                <Badge
                  badgeType="warning"
                  href={getRequestDetailHref(requestData, true)}
                >
                  {intl.formatMessage(globalMessages.pending)}
                </Badge>
              ) : (
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
                          : isComic(title) ||
                              isMagazine(title) ||
                              isSports(title)
                            ? title.title
                            : title.name
                  }
                  inProgress={
                    (getRequestDownloadStatus(requestData) ?? []).length > 0
                  }
                  is4k={requestData.is4k}
                  tmdbId={
                    requestData.type === 'music'
                      ? undefined
                      : requestData.type === 'book'
                        ? undefined
                        : requestData.type === 'comic' ||
                            requestData.type === 'magazine' ||
                            requestData.type === 'sports'
                          ? undefined
                          : requestData.media.tmdbId
                  }
                  mbId={
                    requestData.type === 'music'
                      ? (requestData.media.mbId ?? undefined)
                      : undefined
                  }
                  externalId={
                    requestData.type === 'book'
                      ? getBookId(requestData)
                      : requestData.type === 'comic'
                        ? getComicId(requestData)
                        : requestData.type === 'magazine'
                          ? getMagazineId(requestData)
                          : requestData.type === 'sports'
                            ? getSportarrId(requestData)
                            : undefined
                  }
                  mediaType={
                    requestData.type === 'music'
                      ? 'music'
                      : requestData.type === 'book'
                        ? 'book'
                        : requestData.type === 'comic'
                          ? 'comic'
                          : requestData.type === 'magazine'
                            ? 'magazine'
                            : requestData.type === 'sports'
                              ? 'sports'
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
                  requestId={requestData.id}
                  canFailDownload={canFailDownload}
                />
              )}
            </div>
            {requestData.status === MediaRequestStatus.FAILED && (
              <RequestFailureDetails
                failureReason={requestData.failureReason}
                requestId={requestData.id}
                requestType={requestData.type}
                searchTitle={failureSearchTitle}
                descriptionId={getRequestFailureDescriptionId(
                  requestData.id,
                  'request-list'
                )}
              />
            )}
            <div className="card-field">
              {hasPermission(
                [Permission.MANAGE_REQUESTS, Permission.REQUEST_VIEW],
                { type: 'or' }
              ) ? (
                <>
                  <span className="card-field-name">
                    {intl.formatMessage(messages.requested)}
                  </span>
                  <span className="flex truncate text-sm text-gray-300">
                    {intl.formatMessage(messages.modifieduserdate, {
                      date: (
                        <FormattedRelativeTime
                          key="date"
                          value={Math.floor(
                            (new Date(requestData.createdAt).getTime() -
                              Date.now()) /
                              1000
                          )}
                          updateIntervalInSeconds={1}
                          numeric="auto"
                        />
                      ),
                      user: (
                        <Link
                          key="user"
                          href={`/users/${requestData.requestedBy.id}`}
                          className="group flex items-center truncate"
                        >
                          <span className="avatar-sm ms-1.5">
                            <CachedImage
                              type="avatar"
                              src={requestData.requestedBy.avatar}
                              alt=""
                              className="avatar-sm object-cover"
                              width={20}
                              height={20}
                            />
                          </span>
                          <span className="truncate text-sm font-semibold group-hover:text-white group-hover:underline">
                            {requestData.requestedBy.displayName}
                          </span>
                        </Link>
                      ),
                    })}
                  </span>
                </>
              ) : (
                <>
                  <span className="card-field-name">
                    {intl.formatMessage(messages.requesteddate)}
                  </span>
                  <span className="flex truncate text-sm text-gray-300">
                    <FormattedRelativeTime
                      key="date"
                      value={Math.floor(
                        (new Date(requestData.createdAt).getTime() -
                          Date.now()) /
                          1000
                      )}
                      updateIntervalInSeconds={1}
                      numeric="auto"
                    />
                  </span>
                </>
              )}
            </div>
            {requestData.modifiedBy && (
              <div className="card-field">
                <span className="card-field-name">
                  {intl.formatMessage(messages.modified)}
                </span>
                <span className="flex truncate text-sm text-gray-300">
                  {intl.formatMessage(messages.modifieduserdate, {
                    date: (
                      <FormattedRelativeTime
                        key="date"
                        value={Math.floor(
                          (new Date(requestData.updatedAt).getTime() -
                            Date.now()) /
                            1000
                        )}
                        updateIntervalInSeconds={1}
                        numeric="auto"
                      />
                    ),
                    user: (
                      <Link
                        key="user"
                        href={`/users/${requestData.modifiedBy.id}`}
                        className="group flex items-center truncate"
                      >
                        <span className="avatar-sm ms-1.5">
                          <CachedImage
                            type="avatar"
                            src={requestData.modifiedBy.avatar}
                            alt=""
                            className="avatar-sm object-cover"
                            width={20}
                            height={20}
                          />
                        </span>
                        <span className="truncate text-sm font-semibold group-hover:text-white group-hover:underline">
                          {requestData.modifiedBy.displayName}
                        </span>
                      </Link>
                    ),
                  })}
                </span>
              </div>
            )}
            {request.profileName && (
              <div className="card-field">
                <span className="card-field-name">
                  {intl.formatMessage(messages.profileName)}
                </span>
                <span className="flex truncate text-sm text-gray-300">
                  {request.profileName}
                </span>
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
          </div>
        </div>
        <div className="z-10 mt-4 flex w-full flex-col justify-center space-y-2 ps-4 pe-4 xl:mt-0 xl:w-96 xl:items-end xl:ps-0">
          {requestData.watchAheadParentRequestId && (
            <Tooltip
              content={intl.formatMessage(
                messages.watchAheadEpisodeBadgeTooltip
              )}
            >
              <span className="request-status-control request-status-control-success">
                {intl.formatMessage(messages.watchAheadEpisodeBadge)}
              </span>
            </Tooltip>
          )}
          {requestData.type === 'tv' &&
            !requestData.watchAheadParentRequestId &&
            requestData.requestedBy.id === user?.id &&
            (requestData.watchAheadEpisodeCount ?? 0) > 0 && (
              <div className="w-full text-start">
                <Badge badgeType="success">
                  {intl.formatMessage(messages.watchAheadAssigned, {
                    count: requestData.watchAheadEpisodeCount,
                  })}
                </Badge>
              </div>
            )}
          {requestData.status === MediaRequestStatus.FAILED && canRetry && (
            <Button
              className="request-tvdb-mapping-action"
              buttonType="primary"
              disabled={isRetrying || retryUnavailable}
              disabledReason={
                retryUnavailable
                  ? intl.formatMessage(
                      globalMessages.requestFailureRetryUnavailable
                    )
                  : undefined
              }
              aria-describedby={
                retryUnavailable
                  ? getRequestFailureDescriptionId(
                      requestData.id,
                      'request-list'
                    )
                  : undefined
              }
              onClick={() => retryRequest()}
            >
              <ArrowPathIcon
                className={isRetrying ? 'animate-spin' : ''}
                style={{ animationDirection: 'reverse' }}
              />
              <span>
                {intl.formatMessage(
                  isRetrying ? globalMessages.retrying : globalMessages.retry
                )}
              </span>
            </Button>
          )}
          {canRetry &&
            hasPermission(Permission.MANAGE_REQUESTS) &&
            canManuallyMapTvdbSeasons(
              requestData.type,
              requestData.status,
              requestData.failureReason
            ) && (
              <Button
                className="request-tvdb-mapping-action"
                buttonType="primary"
                disabled={isRetrying}
                onClick={() => setShowSeasonMappingModal(true)}
              >
                {intl.formatMessage(messages.mapTvSeasons)}
              </Button>
            )}
          {requestData.status !== MediaRequestStatus.PENDING &&
            hasPermission(Permission.MANAGE_REQUESTS) && (
              <>
                <ConfirmButton
                  onClick={() => deleteRequest()}
                  confirmText={intl.formatMessage(globalMessages.areyousure)}
                  className="w-full"
                >
                  <TrashIcon />
                  <span>{intl.formatMessage(messages.deleterequest)}</span>
                </ConfirmButton>
                {request.canRemove && (
                  <ConfirmButton
                    onClick={() => deleteMediaFile()}
                    confirmText={intl.formatMessage(globalMessages.areyousure)}
                    className="w-full"
                  >
                    <TrashIcon />
                    <span>
                      {intl.formatMessage(messages.removearr, {
                        arr:
                          request.type === 'movie'
                            ? 'Radarr'
                            : request.type === 'music'
                              ? 'Lidarr'
                              : request.type === 'book'
                                ? 'Bookshelf'
                                : 'Sonarr',
                      })}
                    </span>
                  </ConfirmButton>
                )}
              </>
            )}
          {requestData.status === MediaRequestStatus.PENDING &&
            hasPermission(Permission.MANAGE_REQUESTS) && (
              <div className="flex w-full flex-row space-x-2">
                <span className="w-full">
                  <Button
                    className="w-full"
                    buttonType="success"
                    onClick={() => modifyRequest('approve')}
                    disabled={updatingType !== null}
                  >
                    {updatingType === 'approve' ? <Spinner /> : <CheckIcon />}
                    <span>{intl.formatMessage(globalMessages.approve)}</span>
                  </Button>
                </span>
                <span className="w-full">
                  <Button
                    className="w-full"
                    buttonType="danger"
                    onClick={() => modifyRequest('decline')}
                    disabled={updatingType !== null}
                  >
                    {updatingType === 'decline' ? <Spinner /> : <XMarkIcon />}
                    <span>{intl.formatMessage(globalMessages.decline)}</span>
                  </Button>
                </span>
              </div>
            )}
          {requestData.status === MediaRequestStatus.PENDING &&
            (hasPermission(Permission.MANAGE_REQUESTS) ||
              (requestData.requestedBy.id === user?.id &&
                (requestData.type === 'tv' ||
                  hasPermission(Permission.REQUEST_ADVANCED)))) && (
              <span className="w-full">
                <Button
                  className="w-full"
                  buttonType="primary"
                  onClick={() => setShowEditModal(true)}
                  disabled={updatingType !== null}
                >
                  <PencilIcon />
                  <span>{intl.formatMessage(messages.editrequest)}</span>
                </Button>
              </span>
            )}
          {requestData.status === MediaRequestStatus.PENDING &&
            !hasPermission(Permission.MANAGE_REQUESTS) &&
            requestData.requestedBy.id === user?.id && (
              <ConfirmButton
                onClick={() => deleteRequest()}
                confirmText={intl.formatMessage(globalMessages.areyousure)}
                className="w-full"
              >
                <XMarkIcon />
                <span>{intl.formatMessage(messages.cancelRequest)}</span>
              </ConfirmButton>
            )}
        </div>
      </div>
    </>
  );
};

export default RequestItem;
