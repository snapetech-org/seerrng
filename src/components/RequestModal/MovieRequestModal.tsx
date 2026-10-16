import CachedImage from '@app/components/Common/CachedImage';
import Modal from '@app/components/Common/Modal';
import MediaQualitySelect from '@app/components/MediaDetails/MediaQualitySelect';
import AdvancedOptionsDisclosureButton from '@app/components/RequestModal/AdvancedOptionsDisclosureButton';
import AdvancedRequester, {
  RequestListboxControl,
  type RequestOverrides,
} from '@app/components/RequestModal/AdvancedRequester';
import QuotaDisplay from '@app/components/RequestModal/QuotaDisplay';
import RequestFooterStatus from '@app/components/RequestModal/RequestFooterStatus';
import RequestMediaCard from '@app/components/RequestModal/RequestMediaCard';
import {
  canPromotePendingDestinationRequests,
  createRequestDestination,
  isRequestDestinationAvailable,
  isRequestDestinationRequested,
  isVideoQualityAvailable,
} from '@app/components/RequestModal/requestAvailability';
import useAdvancedOptionsDisclosure from '@app/hooks/useAdvancedOptionsDisclosure';
import useToasts from '@app/hooks/useToasts';
import { useUser } from '@app/hooks/useUser';
import globalMessages from '@app/i18n/globalMessages';
import { sortCrewPriority } from '@app/utils/creditHelpers';
import defineMessages from '@app/utils/defineMessages';
import { getTmdbPosterImageUrl } from '@app/utils/imageCache';
import { ArrowDownTrayIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { ANIME_KEYWORD_ID } from '@server/api/themoviedb/constants';
import { MediaRequestStatus, MediaStatus } from '@server/constants/media';
import type { MediaRequest } from '@server/entity/MediaRequest';
import type { NonFunctionProperties } from '@server/interfaces/api/common';
import type { ServiceCommonServer } from '@server/interfaces/api/serviceInterfaces';
import type { QuotaResponse } from '@server/interfaces/api/userInterfaces';
import type { UserRequestRootFolders } from '@server/interfaces/api/userSettingsInterfaces';
import { Permission, hasAutoApprovePermission } from '@server/lib/permissions';
import type { MovieDetails } from '@server/models/Movie';
import axios from 'axios';
import { useCallback, useEffect, useState } from 'react';
import { useIntl } from 'react-intl';
import useSWR, { mutate } from 'swr';

const messages = defineMessages('components.RequestModal', {
  requestSuccess: '<strong>{title}</strong> requested successfully!',
  requestCancel: 'Request for <strong>{title}</strong> canceled.',
  requestmovietitle: 'Request Movie',
  requestmovie4ktitle: 'Request Movie in 4K',
  edit: 'Edit Request',
  approve: 'Approve Request',
  cancel: 'Cancel Request',
  pendingMovieRequest: 'Pending Movie Request',
  pending4kMovieRequest: 'Pending 4K Movie Request',
  failedMovieRequest: 'Failed Movie Request',
  failed4kMovieRequest: 'Failed 4K Movie Request',
  repairFailedDescription:
    'Choose another server to resubmit this failed request.',
  saveAndRetry: 'Save and Retry',
  requestResubmitted: 'Request for <strong>{title}</strong> resubmitted.',
  requestfrom: "{username}'s request is pending approval.",
  errorediting: 'Something went wrong while editing the request.',
  requestedited: 'Request for <strong>{title}</strong> edited successfully!',
  requestApproved: 'Request for <strong>{title}</strong> approved!',
  requesterror: 'Something went wrong while submitting the request.',
  pendingapproval: 'Your request is pending approval.',
  quotaApprovalSubmitted:
    'Your over-quota request for <strong>{title}</strong> is waiting for administrator approval.',
  requestQuotaApproval: 'Request approval',
  mediaAndFormat: 'Media & Format',
  releaseDate: 'Release Date',
  runtime: 'Runtime',
  genres: 'Genres',
  studio: 'Studio',
  status: 'Status',
  service: 'Service',
  approval: 'Approval',
  requested: 'Requested',
  readyToRequest: 'Ready to Request',
  notAvailable: 'Not Available',
  advancedOptions: 'Advanced Options',
  quality: 'Quality',
  destination: 'Request destination',
  defaultDestination: 'Default destination ({name})',
});

interface RequestModalProps extends React.HTMLAttributes<HTMLDivElement> {
  tmdbId: number;
  is4k?: boolean;
  editRequest?: NonFunctionProperties<MediaRequest>;
  onCancel?: () => void;
  onComplete?: (newStatus: MediaStatus, is4k?: boolean) => void;
  onUpdating?: (isUpdating: boolean) => void;
  allow4kServerSelection?: boolean;
}

const MovieRequestModal = ({
  onCancel,
  onComplete,
  tmdbId,
  onUpdating,
  editRequest,
  is4k = false,
  allow4kServerSelection = false,
}: RequestModalProps) => {
  const [isUpdating, setIsUpdating] = useState(false);
  const [selectedIs4k, setSelectedIs4k] = useState(is4k);
  const [qualityRevision, setQualityRevision] = useState(0);
  const [requestServiceServerId, setRequestServiceServerId] =
    useState<number>();
  const [requestOverrides, setRequestOverrides] =
    useState<RequestOverrides | null>(null);
  const { addToast } = useToasts();
  const { data, error } = useSWR<MovieDetails>(`/api/v1/movie/${tmdbId}`, {
    revalidateOnMount: true,
  });
  const intl = useIntl();
  const { user, hasPermission } = useUser();
  const { data: quota } = useSWR<QuotaResponse>(
    user &&
      (!requestOverrides?.user?.id ||
        hasPermission([Permission.MANAGE_REQUESTS, Permission.MANAGE_USERS], {
          type: 'or',
        }))
      ? `/api/v1/user/${requestOverrides?.user?.id ?? user.id}/quota`
      : null
  );
  const requestQuotaApproval = Boolean(
    !editRequest &&
    !requestOverrides?.user &&
    !hasPermission(Permission.MANAGE_REQUESTS) &&
    quota?.movie.restricted
  );
  const { data: radarrServers } = useSWR<ServiceCommonServer[]>(
    '/api/v1/service/radarr',
    {
      refreshInterval: 0,
      refreshWhenHidden: false,
      revalidateOnFocus: false,
    }
  );
  const {
    open: advancedOptionsOpen,
    pinned: advancedOptionsPinned,
    toggleOpen: toggleAdvancedOptions,
    togglePin: toggleAdvancedOptionsPin,
  } = useAdvancedOptionsDisclosure('movie');
  const [requestedByPortal, setRequestedByPortal] =
    useState<HTMLDivElement | null>(null);
  const effectiveIs4k = requestOverrides?.is4k ?? selectedIs4k;
  const canUseAdvancedOptions = hasPermission(
    [Permission.REQUEST_ADVANCED, Permission.MANAGE_REQUESTS],
    { type: 'or' }
  );
  const isAnimeTitle =
    data?.keywords.some((keyword) => keyword.id === ANIME_KEYWORD_ID) ?? false;
  const isFailedManagerRepair =
    editRequest?.status === MediaRequestStatus.FAILED &&
    hasPermission(Permission.MANAGE_REQUESTS);
  const selectedService = radarrServers?.find(
    (server) => server.id === requestOverrides?.server
  );
  const fallbackService = radarrServers?.find(
    (server) => server.isDefault && server.is4k === effectiveIs4k
  );
  const requestServiceOptions = canUseAdvancedOptions
    ? []
    : (radarrServers ?? []).filter(
        (server) =>
          !server.isDefault &&
          server.is4k === effectiveIs4k &&
          Boolean(server.requestButtonLabel?.trim()) &&
          (!server.requestButtonAnimeOnly || isAnimeTitle) &&
          user?.requestServices?.includes(`radarr:${server.id}`)
      );
  const selectedRequestServiceServerId = requestServiceOptions.some(
    (server) => server.id === requestServiceServerId
  )
    ? requestServiceServerId
    : !fallbackService
      ? requestServiceOptions[0]?.id
      : undefined;
  const selectedRequestService = radarrServers?.find(
    (server) => server.id === selectedRequestServiceServerId
  );
  const requestDestinationUserId = requestOverrides?.user?.id ?? user?.id;
  const { data: requestRootFolders, error: requestRootFoldersError } =
    useSWR<UserRequestRootFolders>(
      requestDestinationUserId
        ? `/api/v1/user/${requestDestinationUserId}/settings/request-root-folders`
        : null
    );
  const destinationService =
    selectedService ?? selectedRequestService ?? fallbackService;
  const selectedDestination = createRequestDestination(
    'radarr',
    effectiveIs4k ? '4k' : 'standard',
    destinationService,
    requestOverrides,
    destinationService
      ? requestRootFolders?.[`radarr:${destinationService.id}`]
      : undefined
  );
  const selectedDestinationAvailable =
    !editRequest &&
    (isRequestDestinationAvailable(data?.mediaInfo, selectedDestination) ||
      (!selectedDestination &&
        isVideoQualityAvailable(data?.mediaInfo, 'movie', effectiveIs4k)));
  const selectedDestinationRequested =
    !editRequest &&
    isRequestDestinationRequested(
      data?.mediaInfo?.requests,
      selectedDestination
    );
  const selectedDestinationPromotable =
    selectedDestinationRequested &&
    canPromotePendingDestinationRequests(
      data?.mediaInfo?.requests,
      [selectedDestination],
      {
        canManageRequests: hasPermission(Permission.MANAGE_REQUESTS),
        hasAutoApprove: hasAutoApprovePermission(
          user?.permissions ?? 0,
          'movie',
          effectiveIs4k
        ),
      }
    );
  const selectedDestinationCovered =
    selectedDestinationAvailable ||
    (selectedDestinationRequested && !selectedDestinationPromotable);
  const requestDestinationSettingsLoading =
    Boolean(requestDestinationUserId) &&
    !requestRootFolders &&
    !requestRootFoldersError;

  useEffect(() => {
    if (onUpdating) {
      onUpdating(isUpdating);
    }
  }, [isUpdating, onUpdating]);

  const sendRequest = useCallback(async () => {
    if (selectedDestinationCovered || requestDestinationSettingsLoading) {
      return;
    }

    setIsUpdating(true);

    try {
      let overrideParams = {};
      if (requestOverrides) {
        overrideParams = {
          serverId: requestOverrides.server,
          profileId: requestOverrides.profile,
          rootFolder: requestOverrides.folder,
          userId: requestOverrides.user?.id,
          tags: requestOverrides.tags,
        };
      }
      const response = await axios.post<MediaRequest>('/api/v1/request', {
        mediaId: data?.id,
        mediaType: 'movie',
        is4k: effectiveIs4k,
        requestServiceServerId: canUseAdvancedOptions
          ? undefined
          : selectedRequestServiceServerId,
        ignoreQuota: requestOverrides?.ignoreQuota,
        requestQuotaApproval: requestQuotaApproval || undefined,
        ...overrideParams,
      });
      mutate('/api/v1/request?filter=all&take=10&sort=modified&skip=0');
      mutate('/api/v1/request/count');

      if (response.data) {
        if (onComplete) {
          onComplete(
            response.data.media[effectiveIs4k ? 'status4k' : 'status'],
            effectiveIs4k
          );
        }
        addToast(
          <span>
            {intl.formatMessage(
              response.data.quotaException
                ? messages.quotaApprovalSubmitted
                : messages.requestSuccess,
              {
                title: data?.title,
                strong: (msg: React.ReactNode) => <strong>{msg}</strong>,
              }
            )}
          </span>,
          { appearance: 'success', autoDismiss: true }
        );
      }
    } catch (error) {
      const responseMessage = axios.isAxiosError<{ message?: unknown }>(error)
        ? error.response?.data?.message
        : undefined;
      const errorMessage =
        typeof responseMessage === 'string' && responseMessage.length > 0
          ? responseMessage
          : intl.formatMessage(messages.requesterror);

      addToast(errorMessage, {
        appearance: 'error',
        autoDismiss: true,
      });
    } finally {
      setIsUpdating(false);
    }
  }, [
    requestOverrides,
    selectedRequestServiceServerId,
    requestDestinationSettingsLoading,
    canUseAdvancedOptions,
    requestQuotaApproval,
    data?.id,
    data?.title,
    effectiveIs4k,
    selectedDestinationCovered,
    onComplete,
    addToast,
    intl,
  ]);

  const cancelRequest = async () => {
    setIsUpdating(true);

    try {
      const response = await axios.delete<MediaRequest>(
        `/api/v1/request/${editRequest?.id}`
      );
      mutate('/api/v1/request?filter=all&take=10&sort=modified&skip=0');
      mutate('/api/v1/request/count');

      if (response.status === 204) {
        if (onComplete) {
          onComplete(MediaStatus.UNKNOWN, is4k);
        }
        addToast(
          <span>
            {intl.formatMessage(messages.requestCancel, {
              title: data?.title,
              strong: (msg: React.ReactNode) => <strong>{msg}</strong>,
            })}
          </span>,
          { appearance: 'success', autoDismiss: true }
        );
      }
    } catch {
      setIsUpdating(false);
    }
  };

  const updateRequest = async (alsoApproveRequest = false) => {
    setIsUpdating(true);

    try {
      await axios.put(`/api/v1/request/${editRequest?.id}`, {
        mediaType: 'movie',
        serverId: requestOverrides?.server,
        profileId: requestOverrides?.profile,
        rootFolder: requestOverrides?.folder,
        userId: requestOverrides?.user?.id,
        tags: requestOverrides?.tags,
      });

      if (alsoApproveRequest) {
        await axios.post(`/api/v1/request/${editRequest?.id}/approve`);
      }
      mutate('/api/v1/request?filter=all&take=10&sort=modified&skip=0');
      mutate('/api/v1/request/count');

      addToast(
        <span>
          {intl.formatMessage(
            isFailedManagerRepair
              ? messages.requestResubmitted
              : alsoApproveRequest
                ? messages.requestApproved
                : messages.requestedited,
            {
              title: data?.title,
              strong: (msg: React.ReactNode) => <strong>{msg}</strong>,
            }
          )}
        </span>,
        {
          appearance: 'success',
          autoDismiss: true,
        }
      );

      if (onComplete) {
        onComplete(MediaStatus.PENDING, is4k);
      }
    } catch {
      addToast(<span>{intl.formatMessage(messages.errorediting)}</span>, {
        appearance: 'error',
        autoDismiss: true,
      });
    } finally {
      setIsUpdating(false);
    }
  };

  if (editRequest) {
    const isOwner = editRequest.requestedBy.id === user?.id;

    return (
      <Modal
        loading={!data && !error}
        backgroundClickable
        onCancel={onCancel}
        title={intl.formatMessage(
          isFailedManagerRepair
            ? is4k
              ? messages.failed4kMovieRequest
              : messages.failedMovieRequest
            : is4k
              ? messages.pending4kMovieRequest
              : messages.pendingMovieRequest
        )}
        subTitle={data?.title}
        onOk={() =>
          isFailedManagerRepair
            ? updateRequest()
            : hasPermission(Permission.MANAGE_REQUESTS)
              ? updateRequest(true)
              : hasPermission(Permission.REQUEST_ADVANCED)
                ? updateRequest()
                : cancelRequest()
        }
        okDisabled={isUpdating}
        okButtonProps={{
          buttonIcon:
            !hasPermission(Permission.MANAGE_REQUESTS) &&
            !hasPermission(Permission.REQUEST_ADVANCED)
              ? 'cancel'
              : undefined,
        }}
        secondaryButtonProps={{ buttonIcon: 'cancel' }}
        okText={
          isFailedManagerRepair
            ? intl.formatMessage(messages.saveAndRetry)
            : hasPermission(Permission.MANAGE_REQUESTS)
              ? intl.formatMessage(messages.approve)
              : hasPermission(Permission.REQUEST_ADVANCED)
                ? intl.formatMessage(messages.edit)
                : intl.formatMessage(messages.cancel)
        }
        okButtonType={
          isFailedManagerRepair || hasPermission(Permission.MANAGE_REQUESTS)
            ? 'success'
            : hasPermission(Permission.REQUEST_ADVANCED)
              ? 'primary'
              : 'danger'
        }
        onSecondary={
          !isFailedManagerRepair &&
          isOwner &&
          hasPermission(
            [Permission.REQUEST_ADVANCED, Permission.MANAGE_REQUESTS],
            { type: 'or' }
          )
            ? () => cancelRequest()
            : undefined
        }
        secondaryDisabled={isUpdating}
        secondaryText={
          !isFailedManagerRepair &&
          isOwner &&
          hasPermission(
            [Permission.REQUEST_ADVANCED, Permission.MANAGE_REQUESTS],
            { type: 'or' }
          )
            ? intl.formatMessage(messages.cancel)
            : undefined
        }
        secondaryButtonType="danger"
        cancelText={intl.formatMessage(globalMessages.close)}
        cancelButtonType="danger"
        alignTop
        actionButtonSize="standard"
        dialogClass="app-card-main request-modal-site-surface sm:max-w-5xl"
      >
        <RequestMediaCard
          artwork={
            data?.backdropPath
              ? `https://image.tmdb.org/t/p/original${data.backdropPath}`
              : undefined
          }
          artworkType="tmdb"
        >
          <div className="app-card-inset refreshed-inset-surface rounded-lg border border-gray-700 p-3">
            {isFailedManagerRepair
              ? intl.formatMessage(messages.repairFailedDescription)
              : isOwner
                ? intl.formatMessage(messages.pendingapproval)
                : intl.formatMessage(messages.requestfrom, {
                    username: editRequest.requestedBy.displayName,
                  })}
          </div>
          {(hasPermission(Permission.REQUEST_ADVANCED) ||
            hasPermission(Permission.MANAGE_REQUESTS)) && (
            <AdvancedRequester
              type="movie"
              tmdbId={tmdbId}
              is4k={is4k}
              requestUser={editRequest.requestedBy}
              requestId={editRequest.id}
              defaultOverrides={{
                folder: editRequest.rootFolder,
                profile: editRequest.profileId,
                server: editRequest.serverId,
                tags: editRequest.tags,
              }}
              reassignMissingServer={isFailedManagerRepair}
              requestedByPortal={
                isFailedManagerRepair ? null : requestedByPortal
              }
              onChange={(overrides) => {
                setRequestOverrides(overrides);
              }}
            />
          )}
        </RequestMediaCard>
      </Modal>
    );
  }

  const hasAutoApprove = hasAutoApprovePermission(
    requestOverrides?.user?.permissions ?? user?.permissions ?? 0,
    'movie',
    effectiveIs4k
  );
  const notAvailable = intl.formatMessage(messages.notAvailable);
  const releaseDate = data?.releaseDate
    ? intl.formatDate(new Date(`${data.releaseDate}T00:00:00`), {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : notAvailable;
  const releaseYear = data?.releaseDate?.match(/^\d{4}/)?.[0];
  const featuredCrew = sortCrewPriority(data?.credits?.crew ?? []).slice(0, 2);
  const studio = data?.productionCompanies?.[0]?.name ?? notAvailable;
  const requestButtonLabel = isUpdating
    ? intl.formatMessage(globalMessages.requesting)
    : requestQuotaApproval
      ? intl.formatMessage(messages.requestQuotaApproval)
      : intl.formatMessage(
          effectiveIs4k ? globalMessages.request4k : globalMessages.request
        );

  return (
    <Modal
      loading={(!data && !error) || !quota}
      backgroundClickable
      onCancel={onCancel}
      onOk={sendRequest}
      hideActions
      alignTop
      okDisabled={
        isUpdating ||
        requestDestinationSettingsLoading ||
        selectedDestinationCovered ||
        (quota?.movie.restricted &&
          !requestOverrides?.ignoreQuota &&
          !requestQuotaApproval)
      }
      title={intl.formatMessage(
        effectiveIs4k
          ? messages.requestmovie4ktitle
          : messages.requestmovietitle
      )}
      okText={requestButtonLabel}
      okButtonType={'primary'}
      dialogClass="app-card-main request-modal-site-surface sm:max-w-5xl"
    >
      {(quota?.movie.limit ?? 0) > 0 && (
        <QuotaDisplay
          mediaType="movie"
          quota={quota?.movie}
          userOverride={
            requestOverrides?.user && requestOverrides.user.id !== user?.id
              ? requestOverrides?.user?.id
              : undefined
          }
        />
      )}
      <RequestMediaCard
        artwork={
          data?.backdropPath
            ? `https://image.tmdb.org/t/p/original${data.backdropPath}`
            : getTmdbPosterImageUrl(data?.posterPath, 'original')
        }
        artworkType="tmdb"
      >
        <div className="app-card-inset refreshed-inset-surface detail-summary-card grid min-w-0 grid-cols-[64px_minmax(0,1fr)] gap-3 sm:grid-cols-[80px_minmax(0,1fr)]">
          <div className="detail-card-poster relative overflow-hidden rounded-lg ring-1 ring-gray-600">
            <CachedImage
              type="tmdb"
              src={
                getTmdbPosterImageUrl(data?.posterPath) ||
                '/images/seerr_poster_not_found.png'
              }
              alt=""
              fill
              sizes="(min-width: 640px) 80px, 64px"
              className="object-cover"
            />
          </div>

          <div className="flex min-w-0 flex-col">
            <h3 className="detail-summary-title truncate text-lg leading-5 font-semibold text-white">
              {data?.title}
              {releaseYear ? ` (${releaseYear})` : ''}
            </h3>

            <div className="detail-card-heading-spacing detail-three-column-grid grid min-h-0 min-w-0 flex-1 items-stretch">
              <div className="detail-paired-column-span min-w-0">
                <dl className="media-detail-rows detail-paired-columns refreshed-detail-text grid min-w-0 content-start text-xs">
                  <dt className="card:col-start-1 card:row-start-1 font-medium text-gray-100">
                    {intl.formatMessage(messages.mediaAndFormat)}:
                  </dt>
                  <dd className="card:col-start-3 card:row-start-1 m-0 truncate">
                    {intl.formatMessage(globalMessages.movie)} ·{' '}
                    {effectiveIs4k ? '4K' : 'HD'}
                  </dd>
                  <dt className="card:col-start-1 card:row-start-2 font-medium text-gray-100">
                    {intl.formatMessage(messages.releaseDate)}:
                  </dt>
                  <dd className="card:col-start-3 card:row-start-2 m-0 truncate">
                    {releaseDate}
                  </dd>
                  <dt className="card:col-start-1 card:row-start-3 font-medium text-gray-100">
                    {intl.formatMessage(messages.runtime)}:
                  </dt>
                  <dd className="card:col-start-3 card:row-start-3 m-0 truncate">
                    {data?.runtime
                      ? `${intl.formatNumber(data.runtime)} minutes`
                      : notAvailable}
                  </dd>

                  <div className="media-detail-rows media-detail-column-divider card:col-span-1 card:col-start-5 card:row-span-3 card:row-start-1 col-span-2 grid min-w-0 grid-cols-[max-content_minmax(0,1fr)] content-start gap-x-3">
                    {featuredCrew.map((person) => (
                      <div
                        className="contents"
                        key={`${person.job}-${person.id}`}
                      >
                        <dt className="font-medium text-gray-100">
                          {person.job}:
                        </dt>
                        <dd className="m-0 truncate">{person.name}</dd>
                      </div>
                    ))}
                    <dt className="font-medium text-gray-100">
                      {intl.formatMessage(messages.studio)}:
                    </dt>
                    <dd className="m-0 truncate">{studio}</dd>
                  </div>

                  <dt className="card:col-start-1 card:row-start-4 font-medium text-gray-100">
                    {intl.formatMessage(messages.genres)}:
                  </dt>
                  <dd className="card:col-span-3 card:col-start-3 card:row-start-4 m-0 line-clamp-2 min-w-0 break-words">
                    {data?.genres?.length
                      ? data.genres
                          .slice(0, 3)
                          .map((genre) => genre.name)
                          .join(', ')
                      : notAvailable}
                  </dd>
                </dl>
              </div>

              <dl className="media-detail-rows media-detail-column-divider refreshed-detail-text grid h-full min-w-0 grid-cols-[max-content_minmax(0,1fr)] content-start gap-x-3 text-xs">
                <dt className="font-medium text-gray-100">
                  {intl.formatMessage(messages.status)}:
                </dt>
                <dd className="m-0 truncate">
                  {intl.formatMessage(
                    selectedDestinationAvailable
                      ? globalMessages.available
                      : selectedDestinationRequested
                        ? messages.requested
                        : messages.readyToRequest
                  )}
                </dd>
                <dt className="font-medium text-gray-100">
                  {intl.formatMessage(messages.service)}:
                </dt>
                <dd className="m-0 truncate">
                  {selectedService?.name ??
                    (selectedRequestService
                      ? `${selectedRequestService.requestButtonLabel} (${selectedRequestService.name})`
                      : undefined) ??
                    fallbackService?.name ??
                    notAvailable}
                </dd>
                <dt className="font-medium text-gray-100">
                  {intl.formatMessage(messages.approval)}:
                </dt>
                <dd className="m-0 min-w-0">
                  <RequestFooterStatus
                    available={selectedDestinationAvailable}
                    requested={selectedDestinationRequested}
                    hasAutoApprove={hasAutoApprove}
                  />
                </dd>
              </dl>
            </div>
          </div>
        </div>

        <div className="request-selection-options card-spacing-before">
          <MediaQualitySelect
            value={effectiveIs4k ? '4k' : 'hd'}
            options={[
              { label: 'HD', value: 'hd' },
              { label: '4K', value: '4k' },
            ]}
            onChange={(quality) => {
              setSelectedIs4k(quality === '4k');
              setRequestServiceServerId(undefined);
              setRequestOverrides(null);
              setQualityRevision((current) => current + 1);
            }}
            label={intl.formatMessage(messages.quality)}
            autoSelectAvailable={false}
            purpose="request"
          />
          {!canUseAdvancedOptions &&
            requestServiceOptions.length > 0 &&
            (fallbackService || requestServiceOptions.length > 1) && (
              <RequestListboxControl
                id="movie-request-destination"
                label={intl.formatMessage(messages.destination)}
                value={selectedRequestServiceServerId ?? -1}
                options={[
                  ...(fallbackService
                    ? [
                        {
                          value: -1,
                          label: intl.formatMessage(
                            messages.defaultDestination,
                            { name: fallbackService.name }
                          ),
                        },
                      ]
                    : []),
                  ...requestServiceOptions.map((server) => ({
                    value: server.id,
                    label: `${server.requestButtonLabel} (${server.name})`,
                  })),
                ]}
                onChange={(serverId) => {
                  setRequestServiceServerId(
                    serverId < 0 ? undefined : serverId
                  );
                  setRequestOverrides(null);
                }}
                disabled={isUpdating}
                loadingLabel={intl.formatMessage(messages.destination)}
              />
            )}
        </div>

        {canUseAdvancedOptions && (
          <AdvancedRequester
            key={(selectedIs4k ? '4k' : 'hd') + '-' + qualityRevision}
            type="movie"
            tmdbId={tmdbId}
            is4k={selectedIs4k}
            allow4kServerSelection={allow4kServerSelection}
            quota={quota}
            mediaTitle={data?.title}
            posterPath={data?.posterPath}
            expanded={advancedOptionsOpen}
            panelOnly
            rootFolderTable
            requestedByPortal={requestedByPortal}
            onChange={(overrides) => {
              setRequestOverrides(overrides);
            }}
          />
        )}

        <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
          <div className="mr-auto flex items-center gap-2">
            {canUseAdvancedOptions && (
              <AdvancedOptionsDisclosureButton
                label={intl.formatMessage(messages.advancedOptions)}
                open={advancedOptionsOpen}
                pinned={advancedOptionsPinned}
                onToggle={toggleAdvancedOptions}
                onPin={toggleAdvancedOptionsPin}
              />
            )}
          </div>
          <div
            className="compact-control flex items-center"
            ref={setRequestedByPortal}
          />
          <button
            type="button"
            onClick={onCancel}
            data-testid="modal-cancel-button"
            className="app-button app-button-danger button-standard"
          >
            <XMarkIcon aria-hidden="true" />
            {intl.formatMessage(globalMessages.cancel)}
          </button>
          <button
            type="button"
            onClick={() => void sendRequest()}
            data-testid="modal-ok-button"
            disabled={
              isUpdating ||
              requestDestinationSettingsLoading ||
              selectedDestinationCovered ||
              (quota?.movie.restricted &&
                !requestOverrides?.ignoreQuota &&
                !requestQuotaApproval)
            }
            className="app-button app-button-success button-standard"
          >
            <ArrowDownTrayIcon aria-hidden="true" />
            {requestButtonLabel}
          </button>
        </div>
      </RequestMediaCard>
    </Modal>
  );
};

export default MovieRequestModal;
