import Badge from '@app/components/Common/Badge';
import Button from '@app/components/Common/Button';
import CachedImage from '@app/components/Common/CachedImage';
import { getMediaServerName } from '@app/components/Common/MediaServerIcon';
import Modal from '@app/components/Common/Modal';
import MediaQualitySelect from '@app/components/MediaDetails/MediaQualitySelect';
import AdvancedOptionsDisclosureButton from '@app/components/RequestModal/AdvancedOptionsDisclosureButton';
import type { RequestOverrides } from '@app/components/RequestModal/AdvancedRequester';
import AdvancedRequester, {
  RequestListboxControl,
} from '@app/components/RequestModal/AdvancedRequester';
import QuotaDisplay from '@app/components/RequestModal/QuotaDisplay';
import RequestFooterStatus from '@app/components/RequestModal/RequestFooterStatus';
import RequestMediaCard from '@app/components/RequestModal/RequestMediaCard';
import RequestSeasonEpisodeTree from '@app/components/RequestModal/RequestSeasonEpisodeTree';
import SearchByNameModal from '@app/components/RequestModal/SearchByNameModal';
import {
  canPromotePendingDestinationRequests,
  createRequestDestination,
  isRequestDestinationAvailable,
  isRequestDestinationRequested,
  isRequestDestinationSeasonAvailable,
  isRequestForDestination,
  isVideoQualityAvailable,
} from '@app/components/RequestModal/requestAvailability';
import useAdvancedOptionsDisclosure from '@app/hooks/useAdvancedOptionsDisclosure';
import usePlaybackCatalog from '@app/hooks/usePlaybackCatalog';
import useSettings from '@app/hooks/useSettings';
import useToasts from '@app/hooks/useToasts';
import { useUser } from '@app/hooks/useUser';
import useWatchStatus from '@app/hooks/useWatchStatus';
import globalMessages from '@app/i18n/globalMessages';
import { sortCrewPriority } from '@app/utils/creditHelpers';
import defineMessages from '@app/utils/defineMessages';
import { getTmdbPosterImageUrl } from '@app/utils/imageCache';
import {
  getAvailableEpisodesBySeason,
  getDefaultUnavailableSeasonSelections,
  getRequestableTvSelections,
  isActiveSeasonRequest,
  mergeEpisodeNumbersBySeason,
} from '@app/utils/tvRequestSelection';
import { hasLinkedWatchAheadAccount } from '@app/utils/watchAhead';
import { ArrowDownTrayIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { ANIME_KEYWORD_ID } from '@server/api/themoviedb/constants';
import { MediaRequestStatus, MediaStatus } from '@server/constants/media';
import type { MediaRequest } from '@server/entity/MediaRequest';
import type { NonFunctionProperties } from '@server/interfaces/api/common';
import type { SeasonEpisodeSelection } from '@server/interfaces/api/seasonInterfaces';
import type { ServiceCommonServer } from '@server/interfaces/api/serviceInterfaces';
import type { QuotaResponse } from '@server/interfaces/api/userInterfaces';
import type {
  EpisodeQueueAccessResponse,
  UserRequestRootFolders,
} from '@server/interfaces/api/userSettingsInterfaces';
import {
  Permission,
  hasAutoApprovePermission,
  hasPermission as hasUserPermission,
} from '@server/lib/permissions';
import {
  getIncompletePreviousSeasonRequirement,
  getMissingPreviousSeasonHistoryRequirement,
  getSeasonWatchGateRequirements,
  getTvSeasonSelectionsAllowedByWatchGate,
} from '@server/lib/tvSeasonWatchGatePolicy';
import type { TvDetails } from '@server/models/Tv';
import axios from 'axios';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useIntl } from 'react-intl';
import useSWR, { mutate } from 'swr';

const messages = defineMessages('components.RequestModal', {
  requestSuccess: '<strong>{title}</strong> requested successfully!',
  requestseriestitle: 'Request Series',
  requestseries4ktitle: 'Request Series in 4K',
  edit: 'Edit Request',
  approve: 'Approve Request',
  failedrequest: 'Failed Request',
  failed4krequest: 'Failed 4K Request',
  repairFailedDescription:
    'Choose another server to resubmit this failed request.',
  repairPreservesSelections:
    'The original season and episode selections will be kept.',
  saveAndRetry: 'Save and Retry',
  cancel: 'Cancel Request',
  pendingrequest: 'Pending Request',
  pending4krequest: 'Pending 4K Request',
  requestfrom: "{username}'s request is pending approval.",
  selectUnavailableItemsToRequest:
    'Select unavailable seasons or episodes to request.',
  alreadyAvailable:
    'The selected seasons or episodes are already available or requested.',
  noUnavailableItems: 'No unavailable seasons or episodes remain to request.',
  episodesLoading: 'Load episode information before submitting this selection.',
  requestQuotaExceeded:
    'Your remaining request quota is not enough for this selection.',
  season: 'Season',
  episodes: 'Episodes',
  seasonnumber: 'Season {number}',
  errorediting: 'Something went wrong while editing the request.',
  requestedited: 'Request for <strong>{title}</strong> edited successfully!',
  requestApproved: 'Request for <strong>{title}</strong> approved!',
  requestResubmitted: 'Request for <strong>{title}</strong> resubmitted.',
  requestcancelled: 'Request for <strong>{title}</strong> canceled.',
  autoapproval: 'Automatic Approval',
  requesterror: 'Something went wrong while submitting the request.',
  pendingapproval: 'Your request is pending approval.',
  quotaApprovalSubmitted:
    'Your over-quota request for <strong>{title}</strong> is waiting for administrator approval.',
  requestQuotaApproval: 'Request approval',
  mediaAndFormat: 'Media & Format',
  releaseDate: 'Release Date',
  runtime: 'Runtime',
  genres: 'Genres',
  network: 'Network',
  status: 'Status',
  service: 'Service',
  approval: 'Approval',
  readyToRequest: 'Ready to Request',
  requested: 'Requested',
  notAvailable: 'Not Available',
  advancedOptions: 'Advanced Options',
  quality: 'Quality',
  destination: 'Request destination',
  defaultDestination: 'Default destination ({name})',
  watchAheadLabel: 'Episode Queue',
  watchAheadEnabledForAccount:
    'Episode Queue is enabled by your administrator for {owner} TV requests, with {count} queued ahead.',
  watchAheadAssignedButUnavailable:
    'Your administrator set Episode Queue to {count} for {owner} TV requests, but it cannot run for this request yet.',
  watchAheadActiveForRequest:
    'This request uses the administrator’s Episode Queue default of {count}.',
  watchAheadOffForAccount:
    'Episode Queue is off for {owner} TV requests. A user manager controls this setting.',
  watchAheadLoading: 'Loading your Episode Queue setting…',
  watchAheadLoadError:
    'Could not load your Episode Queue setting. Retry before submitting this request.',
  watchAheadRetry: 'Retry',
  watchAheadUnavailableServer:
    'Episode Queue needs Plex, Jellyfin, or Emby playback tracking.',
  watchAheadUnavailableLink:
    'Link your {mediaServer} account to SeerrNG so it can match your playback to this request.',
  watchAheadUnavailableIdentity:
    'Episode Queue needs a TVDB match for this series before it can connect playback to Sonarr.',
  watchAheadUnavailablePermission:
    'You need permission to request the selected TV quality to use Episode Queue.',
  watchAheadUnavailableSonarr:
    'Choose or configure a Sonarr server for the selected TV quality to use Episode Queue.',
  watchAheadUnavailableOtherLink:
    'The request owner must link their {mediaServer} account before Episode Queue can run.',
  watchAheadLearnMore: 'How Episode Queue works',
  watchAheadLinkAccount: 'Link account',
  watchAheadStartingEpisode:
    'Choose one starting episode. Once {owner} account is linked, SeerrNG uses playback to keep your administrator’s episode buffer requested in Sonarr.',
  watchAheadAdminManaged: 'Set by your administrator',
  watchAheadEpisodeOption:
    '{count, plural, one {# episode} other {# episodes}}',
  seasonWatchGateLoading:
    'Checking linked playback history before requesting later seasons.',
  seasonWatchGateIncomplete:
    'Watch every episode of Season {requiredSeason} before requesting Season {requestedSeason}.',
  seasonWatchGateLibraryRequired:
    'Add this series to your linked Plex, Jellyfin, or Emby library and sync it before requesting a later season.',
  seasonWatchGateUnknownSeason:
    'Unable to verify this season against TV metadata. Try again later.',
  seasonWatchGateStaged:
    'Only seasons that pass this playback check will be included in the request. {reason}',
  seasonWatchGateUnavailable:
    'Unable to verify playback history right now. Try again.',
  seasonWatchGateAccountRequired:
    'Link your Plex, Jellyfin, or Emby account and add this series to its library before requesting a later season.',
  seasonWatchGateLinkAccount: 'Link Playback Account',
  seasonWatchGateAccessPending:
    'Your request for TV season access is waiting for a user manager to review it.',
  seasonWatchGateAccessApproved:
    'A user manager approved the rule for your account. Turn it on in your profile when you want it to apply to your TV requests.',
  seasonWatchGateAccessOff:
    'Want later seasons to unlock after you watch the previous one? Ask a user manager to enable the watch requirement for your account.',
  seasonWatchGateManageAccess: 'TV Season Rule',
  retryWatchStatus: 'Retry Playback Check',
});

interface RequestModalProps extends React.HTMLAttributes<HTMLDivElement> {
  tmdbId: number;
  onCancel?: () => void;
  onComplete?: (newStatus: MediaStatus, is4k?: boolean) => void;
  onUpdating?: (isUpdating: boolean) => void;
  is4k?: boolean;
  editRequest?: NonFunctionProperties<MediaRequest>;
  allow4kServerSelection?: boolean;
}

const TvRequestModal = ({
  onCancel,
  onComplete,
  tmdbId,
  onUpdating,
  editRequest,
  is4k = false,
  allow4kServerSelection = false,
}: RequestModalProps) => {
  const settings = useSettings();
  const { user, hasPermission } = useUser();
  const [selectedIs4k, setSelectedIs4k] = useState(is4k);
  const [qualityRevision, setQualityRevision] = useState(0);
  const [requestServiceServerId, setRequestServiceServerId] =
    useState<number>();
  const { addToast } = useToasts();
  const editingSeasonSelections: SeasonEpisodeSelection[] = (
    editRequest?.seasons ?? []
  )
    .filter(isActiveSeasonRequest)
    .map((season) => ({
      seasonNumber: season.seasonNumber,
      ...(season.episodeNumbers
        ? { episodeNumbers: season.episodeNumbers }
        : {}),
    }));
  const { data, error } = useSWR<TvDetails>(`/api/v1/tv/${tmdbId}`);
  const [requestOverrides, setRequestOverrides] =
    useState<RequestOverrides | null>(null);
  const requestOwner =
    editRequest?.requestedBy ?? requestOverrides?.user ?? user;
  const requestOwnerId = requestOwner?.id;
  const requestOwnerPlaybackProfile =
    requestOwnerId === user?.id ? user : requestOwner;
  const requestOwnerLinkIsKnown =
    requestOwnerId === user?.id ||
    requestOwner?.plexId !== undefined ||
    requestOwner?.jellyfinUsername !== undefined;
  const requestOwnerHasLinkedPlaybackAccount = requestOwnerLinkIsKnown
    ? hasLinkedWatchAheadAccount(
        requestOwnerPlaybackProfile,
        settings.currentSettings.mediaServerType
      )
    : undefined;
  const {
    data: episodeQueueAccess,
    error: episodeQueueAccessError,
    mutate: refreshEpisodeQueueAccess,
  } = useSWR<EpisodeQueueAccessResponse>(
    requestOwnerId
      ? `/api/v1/user/${requestOwnerId}/settings/episode-queue`
      : null
  );
  const [seasonSelections, setSeasonSelections] = useState<
    SeasonEpisodeSelection[]
  >(editRequest ? editingSeasonSelections : []);
  const [watchAheadEpisodeCount, setWatchAheadEpisodeCount] = useState(
    editRequest?.watchAheadEpisodeCount ?? 0
  );
  const selectionBeforeWatchAhead = useRef<SeasonEpisodeSelection[] | null>(
    null
  );
  const [initializedSelectionKey, setInitializedSelectionKey] = useState('');
  const [requestTreeReady, setRequestTreeReady] = useState(false);
  const selectedSeasons = seasonSelections.map(
    (selection) => selection.seasonNumber
  );
  const {
    open: advancedOptionsOpen,
    pinned: advancedOptionsPinned,
    toggleOpen: toggleAdvancedOptions,
    togglePin: toggleAdvancedOptionsPin,
  } = useAdvancedOptionsDisclosure('tv');
  const [requestedByPortal, setRequestedByPortal] =
    useState<HTMLDivElement | null>(null);
  const effectiveIs4k = requestOverrides?.is4k ?? selectedIs4k;
  const canUseAdvancedOptions = hasPermission(
    [Permission.REQUEST_ADVANCED, Permission.MANAGE_REQUESTS],
    { type: 'or' }
  );
  const isAnime =
    data?.keywords.some((keyword) => keyword.id === ANIME_KEYWORD_ID) ?? false;
  const isFailedManagerRepair =
    editRequest?.status === MediaRequestStatus.FAILED &&
    hasPermission(Permission.MANAGE_REQUESTS);
  const { data: playbackCatalog } = usePlaybackCatalog(
    data?.mediaInfo?.id,
    effectiveIs4k
  );
  const availableEpisodesBySeason = useMemo(
    () => getAvailableEpisodesBySeason(playbackCatalog),
    [playbackCatalog]
  );
  const intl = useIntl();
  const [searchModal, setSearchModal] = useState<{
    show: boolean;
  }>({
    show: true,
  });
  const [tvdbId, setTvdbId] = useState<number | undefined>(undefined);
  const { data: quota } = useSWR<QuotaResponse>(
    user &&
      (!requestOverrides?.user?.id ||
        hasPermission([Permission.MANAGE_REQUESTS, Permission.MANAGE_USERS], {
          type: 'or',
        }))
      ? `/api/v1/user/${requestOverrides?.user?.id ?? user.id}/quota`
      : null
  );
  const defaultWatchAheadEpisodeCount =
    episodeQueueAccess?.defaultEpisodeCount ?? 0;
  const watchAheadOwnerLabel =
    requestOwnerId === user?.id
      ? 'your'
      : `${requestOwner?.displayName ?? 'this user'}’s`;

  const { data: sonarrServers } = useSWR<ServiceCommonServer[]>(
    '/api/v1/service/sonarr',
    {
      refreshInterval: 0,
      refreshWhenHidden: false,
      revalidateOnFocus: false,
    }
  );
  const selectedService = sonarrServers?.find(
    (server) => server.id === requestOverrides?.server
  );
  const fallbackService = sonarrServers?.find(
    (server) => server.isDefault && server.is4k === effectiveIs4k
  );
  const requestServiceOptions = canUseAdvancedOptions
    ? []
    : (sonarrServers ?? []).filter(
        (server) =>
          !server.isDefault &&
          server.is4k === effectiveIs4k &&
          Boolean(server.requestButtonLabel?.trim()) &&
          (!server.requestButtonAnimeOnly || isAnime) &&
          user?.requestServices?.includes(`sonarr:${server.id}`)
      );
  const selectedRequestServiceServerId = requestServiceOptions.some(
    (server) => server.id === requestServiceServerId
  )
    ? requestServiceServerId
    : !fallbackService
      ? requestServiceOptions[0]?.id
      : undefined;
  const selectedRequestService = sonarrServers?.find(
    (server) => server.id === selectedRequestServiceServerId
  );
  const watchAheadService =
    selectedService ?? selectedRequestService ?? fallbackService;
  const requestDestinationUserId = requestOverrides?.user?.id ?? user?.id;
  const { data: requestRootFolders, error: requestRootFoldersError } =
    useSWR<UserRequestRootFolders>(
      requestDestinationUserId
        ? `/api/v1/user/${requestDestinationUserId}/settings/request-root-folders`
        : null
    );
  const watchAheadTvdbId = editRequest
    ? editRequest.media.tvdbId
    : (tvdbId ?? data?.externalIds.tvdbId);
  const watchAheadAppliesToRequest =
    episodeQueueAccess?.status === 'approved' &&
    defaultWatchAheadEpisodeCount > 0 &&
    Number.isSafeInteger(Number(watchAheadTvdbId)) &&
    Number(watchAheadTvdbId) > 0 &&
    !editRequest?.watchAheadParentRequestId;
  const watchAheadMediaServerName = getMediaServerName(
    settings.currentSettings.mediaServerType
  );
  const needsWatchAheadAccountLink =
    Boolean(watchAheadMediaServerName) &&
    requestOwnerId === user?.id &&
    requestOwnerHasLinkedPlaybackAccount === false;
  const watchAheadCardVisible =
    !editRequest ||
    (!editRequest.watchAheadParentRequestId &&
      (editRequest.requestedBy.id === user?.id ||
        hasPermission(Permission.MANAGE_USERS)));
  const watchAheadUnavailableMessage = (() => {
    if (!defaultWatchAheadEpisodeCount || !episodeQueueAccess) {
      return undefined;
    }
    if (!watchAheadMediaServerName) {
      return intl.formatMessage(messages.watchAheadUnavailableServer);
    }
    if (requestOwnerHasLinkedPlaybackAccount === false) {
      return requestOwnerId === user?.id
        ? intl.formatMessage(messages.watchAheadUnavailableLink, {
            mediaServer: watchAheadMediaServerName,
          })
        : intl.formatMessage(messages.watchAheadUnavailableOtherLink, {
            mediaServer: watchAheadMediaServerName,
          });
    }
    if (
      !Number.isSafeInteger(Number(watchAheadTvdbId)) ||
      Number(watchAheadTvdbId) <= 0
    ) {
      return intl.formatMessage(messages.watchAheadUnavailableIdentity);
    }
    if (
      !hasUserPermission(
        effectiveIs4k
          ? [Permission.REQUEST_4K, Permission.REQUEST_4K_TV]
          : [Permission.REQUEST, Permission.REQUEST_TV],
        requestOwner?.permissions ?? 0,
        { type: 'or' }
      )
    ) {
      return intl.formatMessage(messages.watchAheadUnavailablePermission);
    }
    if (!watchAheadService) {
      return intl.formatMessage(messages.watchAheadUnavailableSonarr);
    }
    return undefined;
  })();
  const selectedDestination = useMemo(
    () =>
      createRequestDestination(
        'sonarr',
        effectiveIs4k ? '4k' : 'standard',
        watchAheadService,
        requestOverrides,
        watchAheadService
          ? requestRootFolders?.[`sonarr:${watchAheadService.id}`]
          : undefined
      ),
    [effectiveIs4k, requestOverrides, requestRootFolders, watchAheadService]
  );
  const requestSelectionKey = JSON.stringify([
    tmdbId,
    requestOwnerId,
    effectiveIs4k,
    selectedDestination?.serverId,
    selectedDestination?.profileId,
    selectedDestination?.metadataProfileId,
    selectedDestination?.languageProfileId,
    selectedDestination?.rootFolder,
  ]);
  const requestDestinationSettingsLoading =
    Boolean(requestDestinationUserId) &&
    !requestRootFolders &&
    !requestRootFoldersError;
  const selectedDestinationAvailable =
    !editRequest &&
    (isRequestDestinationAvailable(data?.mediaInfo, selectedDestination) ||
      (!selectedDestination &&
        isVideoQualityAvailable(data?.mediaInfo, 'tv', effectiveIs4k)));
  const selectedDestinationRequested =
    !editRequest &&
    isRequestDestinationRequested(
      data?.mediaInfo?.requests,
      selectedDestination
    );
  const currentlyRemaining =
    (quota?.tv.remaining ?? 0) -
    selectedSeasons.length +
    (editRequest?.seasons.filter(isActiveSeasonRequest) ?? []).length;

  const showAlreadyAvailableToast = () => {
    addToast(intl.formatMessage(messages.alreadyAvailable), {
      appearance: 'info',
      autoDismiss: true,
    });
  };

  const updateRequest = async (alsoApproveRequest = false) => {
    if (!editRequest || requestDisabled) {
      return;
    }

    if (isFailedManagerRepair && selectedSeasons.length === 0) {
      return;
    }

    if (onUpdating) {
      onUpdating(true);
      mutate('/api/v1/request/count');
    }

    try {
      if (selectedSeasons.length > 0) {
        const response = await axios.put(`/api/v1/request/${editRequest.id}`, {
          mediaType: 'tv',
          serverId: requestOverrides?.server,
          profileId: requestOverrides?.profile,
          rootFolder: requestOverrides?.folder,
          languageProfileId: requestOverrides?.language,
          metadataLanguageId: requestOverrides?.metadataLanguage,
          sonarrSeasonType: requestOverrides?.sonarrSeasonType,
          userId: requestOverrides?.user?.id,
          tags: requestOverrides?.tags,
          requestTargetOptions: requestOverrides?.requestTargetOptions,
          seasons: [...selectedSeasons].sort((a, b) => a - b),
          seasonRequests: seasonSelections,
        });

        if (response.status === 202) {
          showAlreadyAvailableToast();
          return;
        }

        if (alsoApproveRequest) {
          await axios.post(`/api/v1/request/${editRequest.id}/approve`);
        }
      } else {
        await axios.delete(`/api/v1/request/${editRequest.id}`);
      }
      mutate('/api/v1/request?filter=all&take=10&sort=modified&skip=0');
      mutate('/api/v1/request/count');

      addToast(
        <span>
          {selectedSeasons.length > 0
            ? intl.formatMessage(
                isFailedManagerRepair
                  ? messages.requestResubmitted
                  : alsoApproveRequest
                    ? messages.requestApproved
                    : messages.requestedited,
                {
                  title: data?.name,
                  strong: (msg: React.ReactNode) => <strong>{msg}</strong>,
                }
              )
            : intl.formatMessage(messages.requestcancelled, {
                title: data?.name,
                strong: (msg: React.ReactNode) => <strong>{msg}</strong>,
              })}
        </span>,
        {
          appearance: 'success',
          autoDismiss: true,
        }
      );
      if (onComplete) {
        onComplete(MediaStatus.PENDING, effectiveIs4k);
      }
    } catch (error) {
      const serverMessage =
        axios.isAxiosError(error) &&
        (error.response?.status === 403 || error.response?.status === 503) &&
        typeof error.response.data?.message === 'string'
          ? error.response.data.message
          : undefined;
      addToast(
        <span>
          {serverMessage ?? intl.formatMessage(messages.errorediting)}
        </span>,
        {
          appearance: 'error',
          autoDismiss: true,
        }
      );
    } finally {
      if (onUpdating) {
        onUpdating(false);
      }
    }
  };

  const sendRequest = async () => {
    if (requestDisabled) {
      return;
    }

    if (usesEpisodeSelection && selectedSeasons.length === 0) {
      return;
    }

    if (onUpdating) {
      onUpdating(true);
      mutate('/api/v1/request/count');
    }

    try {
      let overrideParams = {};
      if (requestOverrides) {
        overrideParams = {
          serverId: requestOverrides.server,
          profileId: requestOverrides.profile,
          rootFolder: requestOverrides.folder,
          languageProfileId: requestOverrides.language,
          metadataLanguageId: requestOverrides.metadataLanguage,
          sonarrSeasonType: requestOverrides.sonarrSeasonType,
          userId: requestOverrides?.user?.id,
          tags: requestOverrides.tags,
          requesterSelectedOptions: requestOverrides.requesterSelectedOptions,
        };
      }
      const response = await axios.post<MediaRequest | { message: string }>(
        '/api/v1/request',
        {
          mediaId: data?.id,
          tvdbId: tvdbId ?? data?.externalIds.tvdbId,
          mediaType: 'tv',
          is4k: effectiveIs4k,
          requestServiceServerId: canUseAdvancedOptions
            ? undefined
            : selectedRequestServiceServerId,
          ignoreQuota: requestOverrides?.ignoreQuota,
          requestQuotaApproval: requestQuotaApproval || undefined,
          seasons: stagesFullSeriesThroughWatchGate
            ? 'all'
            : usesEpisodeSelection
              ? requestableSelections
                  .map((selection) => selection.seasonNumber)
                  .sort((a, b) => a - b)
              : fullSeasonSelectionsToSubmit.map(
                  (selection) => selection.seasonNumber
                ),
          seasonRequests: usesEpisodeSelection
            ? requestableSelections
            : undefined,
          ...overrideParams,
        }
      );

      if (response.status === 202) {
        showAlreadyAvailableToast();
        return;
      }

      if (!response.data || !('media' in response.data)) {
        throw new Error('TV request response did not contain a media request.');
      }

      mutate('/api/v1/request?filter=all&take=10&sort=modified&skip=0');

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
              title: data?.name,
              strong: (msg: React.ReactNode) => <strong>{msg}</strong>,
            }
          )}
        </span>,
        { appearance: 'success', autoDismiss: true }
      );
    } catch (error) {
      const serverMessage =
        axios.isAxiosError(error) &&
        (error.response?.status === 403 || error.response?.status === 503) &&
        typeof error.response.data?.message === 'string'
          ? error.response.data.message
          : undefined;
      addToast(serverMessage ?? intl.formatMessage(messages.requesterror), {
        appearance: 'error',
        autoDismiss: true,
      });
    } finally {
      if (onUpdating) {
        onUpdating(false);
      }
    }
  };

  const getAllSeasons = useCallback((): number[] => {
    let allSeasons = (data?.seasons ?? []).filter(
      (season) => season.episodeCount !== 0
    );
    if (!settings.currentSettings.enableSpecialEpisodes) {
      allSeasons = allSeasons.filter((season) => season.seasonNumber > 0);
    }
    return allSeasons.map((season) => season.seasonNumber);
  }, [data?.seasons, settings.currentSettings.enableSpecialEpisodes]);

  const getAllRequestedEpisodes = useCallback((): Record<number, number[]> => {
    const requestedEpisodes: Record<number, number[]> = {};
    (data?.mediaInfo?.requests ?? [])
      .filter(
        (request) =>
          request.id !== editRequest?.id &&
          (selectedDestination
            ? isRequestForDestination(request, selectedDestination)
            : request.is4k === effectiveIs4k) &&
          request.status !== MediaRequestStatus.DECLINED &&
          request.status !== MediaRequestStatus.FAILED &&
          request.status !== MediaRequestStatus.COMPLETED
      )
      .flatMap((request) => request.seasons)
      .filter(
        (season) =>
          isActiveSeasonRequest(season) && season.episodeNumbers != null
      )
      .forEach((season) => {
        requestedEpisodes[season.seasonNumber] = [
          ...new Set([
            ...(requestedEpisodes[season.seasonNumber] ?? []),
            ...(season.episodeNumbers ?? []),
          ]),
        ];
      });
    return requestedEpisodes;
  }, [
    data?.mediaInfo?.requests,
    editRequest?.id,
    effectiveIs4k,
    selectedDestination,
  ]);

  const getAllRequestedSeasons = useCallback((): number[] => {
    const requestedSeasons = (data?.mediaInfo?.requests ?? [])
      .filter(
        (request) =>
          request.id !== editRequest?.id &&
          (selectedDestination
            ? isRequestForDestination(request, selectedDestination)
            : request.is4k === effectiveIs4k) &&
          request.status !== MediaRequestStatus.DECLINED &&
          request.status !== MediaRequestStatus.FAILED &&
          request.status !== MediaRequestStatus.COMPLETED
      )
      .reduce((requestedSeasons, request) => {
        return [
          ...requestedSeasons,
          ...request.seasons
            .filter(isActiveSeasonRequest)
            .filter((season) => season.episodeNumbers == null)
            .map((sr) => sr.seasonNumber),
        ];
      }, [] as number[]);

    const availableSeasons = (data?.mediaInfo?.seasons ?? [])
      .filter(
        (season) =>
          (selectedDestination
            ? isRequestDestinationSeasonAvailable(
                data?.mediaInfo,
                selectedDestination,
                season.seasonNumber
              )
            : season[effectiveIs4k ? 'status4k' : 'status'] ===
              MediaStatus.AVAILABLE) &&
          !requestedSeasons.includes(season.seasonNumber)
      )
      .map((season) => season.seasonNumber);

    const fullyAvailableCatalogSeasons = (data?.seasons ?? [])
      .filter(
        (season) =>
          season.episodeCount > 0 &&
          (availableEpisodesBySeason[season.seasonNumber]?.length ?? 0) >=
            season.episodeCount
      )
      .map((season) => season.seasonNumber);
    const blockedEpisodes = mergeEpisodeNumbersBySeason(
      availableEpisodesBySeason,
      getAllRequestedEpisodes()
    );
    const fullyBlockedSeasons = (data?.seasons ?? [])
      .filter(
        (season) =>
          season.episodeCount > 0 &&
          (blockedEpisodes[season.seasonNumber]?.length ?? 0) >=
            season.episodeCount
      )
      .map((season) => season.seasonNumber);

    return [
      ...new Set([
        ...requestedSeasons,
        ...availableSeasons,
        ...fullyAvailableCatalogSeasons,
        ...fullyBlockedSeasons,
      ]),
    ];
  }, [
    availableEpisodesBySeason,
    data?.mediaInfo,
    data?.seasons,
    editRequest?.id,
    effectiveIs4k,
    getAllRequestedEpisodes,
    selectedDestination,
  ]);

  const unrequestedSeasons = getAllSeasons().filter(
    (season) => !getAllRequestedSeasons().includes(season)
  );
  const changeWatchAheadEpisodeCount = useCallback(
    (nextCount: number) => {
      if (!editRequest && watchAheadEpisodeCount === 0 && nextCount > 0) {
        const currentNormalSelection: SeasonEpisodeSelection[] = settings
          .currentSettings.partialRequestsEnabled
          ? seasonSelections
          : unrequestedSeasons.map((seasonNumber) => ({ seasonNumber }));
        selectionBeforeWatchAhead.current = currentNormalSelection.map(
          (selection) => ({
            seasonNumber: selection.seasonNumber,
            ...(selection.episodeNumbers
              ? { episodeNumbers: [...selection.episodeNumbers] }
              : {}),
          })
        );
        setSeasonSelections(currentNormalSelection);
      } else if (
        !editRequest &&
        watchAheadEpisodeCount > 0 &&
        nextCount === 0
      ) {
        if (selectionBeforeWatchAhead.current) {
          setSeasonSelections(selectionBeforeWatchAhead.current);
        }
        selectionBeforeWatchAhead.current = null;
      }
      setWatchAheadEpisodeCount(nextCount);
    },
    [
      editRequest,
      seasonSelections,
      settings.currentSettings.partialRequestsEnabled,
      unrequestedSeasons,
      watchAheadEpisodeCount,
    ]
  );

  useEffect(() => {
    if (
      !episodeQueueAccess ||
      editRequest ||
      !data ||
      watchAheadEpisodeCount ===
        (watchAheadAppliesToRequest ? defaultWatchAheadEpisodeCount : 0) ||
      (settings.currentSettings.partialRequestsEnabled &&
        initializedSelectionKey !== requestSelectionKey)
    ) {
      return;
    }

    changeWatchAheadEpisodeCount(
      watchAheadAppliesToRequest ? defaultWatchAheadEpisodeCount : 0
    );
  }, [
    changeWatchAheadEpisodeCount,
    data,
    defaultWatchAheadEpisodeCount,
    editRequest,
    episodeQueueAccess,
    initializedSelectionKey,
    requestSelectionKey,
    settings.currentSettings.partialRequestsEnabled,
    watchAheadAppliesToRequest,
    watchAheadEpisodeCount,
  ]);
  const usesEpisodeSelection =
    settings.currentSettings.partialRequestsEnabled ||
    watchAheadEpisodeCount > 0;
  const blockedEpisodesBySeason = mergeEpisodeNumbersBySeason(
    availableEpisodesBySeason,
    getAllRequestedEpisodes()
  );
  const requestSelections = usesEpisodeSelection
    ? seasonSelections
    : unrequestedSeasons.map((seasonNumber) => ({ seasonNumber }));
  const requestableSelections = getRequestableTvSelections(
    requestSelections,
    data?.seasons ?? [],
    getAllRequestedSeasons(),
    blockedEpisodesBySeason
  );
  const seasonWatchGateCatalog = (data?.seasons ?? []).map((season) => ({
    seasonNumber: season.seasonNumber,
    episodeCount: season.episodeCount,
  }));
  const seasonWatchGateSelections = requestableSelections.filter(
    (selection) =>
      !editRequest?.seasons.some(
        (season) => season.seasonNumber === selection.seasonNumber
      )
  );
  const isSeasonWatchGateOwner = editRequest
    ? editRequest.requestedBy.id === user?.id
    : !requestOverrides?.user || requestOverrides.user.id === user?.id;
  const canOverrideSeasonWatchGate = hasPermission(
    [Permission.MANAGE_REQUESTS, Permission.ADMIN],
    { type: 'or' }
  );
  const seasonWatchGateRequirements = getSeasonWatchGateRequirements(
    seasonWatchGateCatalog,
    seasonWatchGateSelections
  );
  const seasonWatchGateApplies =
    (settings.currentSettings.tvSeasonWatchGateEnabled ||
      user?.tvSeasonWatchGateStatus === 'enabled') &&
    seasonWatchGateRequirements.length > 0 &&
    isSeasonWatchGateOwner &&
    !canOverrideSeasonWatchGate;
  const hasSeasonWatchGateAccount = hasLinkedWatchAheadAccount(
    user,
    settings.currentSettings.mediaServerType
  );
  const seasonWatchGateCacheIdentity = [
    user?.id ?? 'anonymous',
    settings.currentSettings.mediaServerType,
    user?.plexId ?? user?.jellyfinUsername ?? 'unlinked',
    String(user?.updatedAt ?? ''),
  ].join(':');
  const seasonWatchStatusQuery = useWatchStatus(
    'tv',
    tmdbId,
    seasonWatchGateApplies && Boolean(user?.id) && hasSeasonWatchGateAccount,
    true,
    seasonWatchGateCacheIdentity
  );
  const seasonWatchStatusVerified =
    seasonWatchGateApplies &&
    hasSeasonWatchGateAccount &&
    !seasonWatchStatusQuery.error &&
    !seasonWatchStatusQuery.isLoading &&
    !seasonWatchStatusQuery.isValidating &&
    Boolean(seasonWatchStatusQuery.data);
  const seasonWatchEpisodes = (
    seasonWatchStatusQuery.data?.seasons ?? []
  ).flatMap((season) =>
    season.episodes.map((episode) => ({
      seasonNumber: episode.seasonNumber,
      episodeNumber: episode.episodeNumber,
      watched: episode.watched,
    }))
  );
  const incompleteSeasonWatchRequirement = seasonWatchStatusVerified
    ? getIncompletePreviousSeasonRequirement(
        seasonWatchGateCatalog,
        seasonWatchGateSelections,
        seasonWatchEpisodes
      )
    : undefined;
  const missingSeasonWatchLibraryRequirement = seasonWatchStatusVerified
    ? getMissingPreviousSeasonHistoryRequirement(
        seasonWatchGateCatalog,
        seasonWatchGateSelections,
        seasonWatchEpisodes
      )
    : undefined;
  const gateAllowedSeasonSelections = seasonWatchGateApplies
    ? getTvSeasonSelectionsAllowedByWatchGate(
        seasonWatchGateCatalog,
        seasonWatchGateSelections,
        seasonWatchEpisodes,
        seasonWatchStatusVerified
      )
    : requestableSelections;
  const fullSeasonSelectionsToSubmit =
    seasonWatchGateApplies &&
    !editRequest &&
    !settings.currentSettings.partialRequestsEnabled
      ? gateAllowedSeasonSelections
      : requestableSelections;
  const stagesFullSeriesThroughWatchGate =
    seasonWatchGateApplies &&
    !editRequest &&
    !settings.currentSettings.partialRequestsEnabled &&
    !usesEpisodeSelection;
  const seasonWatchGateFailure = seasonWatchGateApplies
    ? !hasSeasonWatchGateAccount
      ? 'account'
      : seasonWatchStatusQuery.error
        ? 'unavailable'
        : seasonWatchStatusQuery.isLoading ||
            seasonWatchStatusQuery.isValidating ||
            !seasonWatchStatusQuery.data
          ? 'loading'
          : missingSeasonWatchLibraryRequirement
            ? 'library'
            : incompleteSeasonWatchRequirement
              ? 'incomplete'
              : undefined
    : undefined;
  const seasonWatchGateMessage = (() => {
    switch (seasonWatchGateFailure) {
      case 'account':
        return intl.formatMessage(messages.seasonWatchGateAccountRequired);
      case 'loading':
        return intl.formatMessage(messages.seasonWatchGateLoading);
      case 'unavailable':
        return intl.formatMessage(messages.seasonWatchGateUnavailable);
      case 'library':
        return intl.formatMessage(messages.seasonWatchGateLibraryRequired);
      case 'incomplete': {
        return incompleteSeasonWatchRequirement?.requiredSeason === null
          ? intl.formatMessage(messages.seasonWatchGateUnknownSeason)
          : incompleteSeasonWatchRequirement
            ? intl.formatMessage(messages.seasonWatchGateIncomplete, {
                requiredSeason: incompleteSeasonWatchRequirement.requiredSeason,
                requestedSeason:
                  incompleteSeasonWatchRequirement.requestedSeason,
              })
            : undefined;
      }
      default:
        return undefined;
    }
  })();
  const partialQuotaExceeded =
    usesEpisodeSelection &&
    !!quota?.tv.limit &&
    !requestOverrides?.ignoreQuota &&
    requestableSelections.length >
      (quota.tv.remaining ?? 0) +
        (editRequest?.seasons.filter(isActiveSeasonRequest).length ?? 0);
  const fullQuotaExceeded =
    !!quota?.tv.limit &&
    !requestOverrides?.ignoreQuota &&
    fullSeasonSelectionsToSubmit.length > (quota.tv.remaining ?? 0);
  const requestQuotaApproval = Boolean(
    !editRequest &&
    !requestOverrides?.user &&
    !hasPermission(Permission.MANAGE_REQUESTS) &&
    (partialQuotaExceeded || (!usesEpisodeSelection && fullQuotaExceeded))
  );
  const gateBlocksSubmission =
    seasonWatchGateMessage &&
    (usesEpisodeSelection || fullSeasonSelectionsToSubmit.length === 0)
      ? seasonWatchGateMessage
      : undefined;
  const seasonWatchGateDisplayMessage =
    seasonWatchGateMessage &&
    !usesEpisodeSelection &&
    fullSeasonSelectionsToSubmit.length > 0
      ? intl.formatMessage(messages.seasonWatchGateStaged, {
          reason: seasonWatchGateMessage,
        })
      : seasonWatchGateMessage;
  const submissionSelectionCount = usesEpisodeSelection
    ? requestableSelections.length
    : fullSeasonSelectionsToSubmit.length;
  const requestDisabledReason =
    usesEpisodeSelection && !requestTreeReady && selectedSeasons.length > 0
      ? intl.formatMessage(messages.episodesLoading)
      : !requestQuotaApproval &&
          (partialQuotaExceeded || (!usesEpisodeSelection && fullQuotaExceeded))
        ? intl.formatMessage(messages.requestQuotaExceeded)
        : submissionSelectionCount === 0
          ? (gateBlocksSubmission ??
            (usesEpisodeSelection &&
            seasonSelections.length === 0 &&
            unrequestedSeasons.length > 0
              ? intl.formatMessage(messages.selectUnavailableItemsToRequest)
              : intl.formatMessage(
                  unrequestedSeasons.length === 0
                    ? messages.noUnavailableItems
                    : messages.alreadyAvailable
                )))
          : gateBlocksSubmission;

  useEffect(() => {
    if (
      editRequest ||
      !settings.currentSettings.partialRequestsEnabled ||
      !data ||
      initializedSelectionKey === requestSelectionKey
    ) {
      return;
    }

    const defaults = getDefaultUnavailableSeasonSelections(
      data.seasons.filter((season) =>
        getAllSeasons().includes(season.seasonNumber)
      ),
      getAllRequestedSeasons()
    );
    setSeasonSelections(defaults);
    setInitializedSelectionKey(requestSelectionKey);
  }, [
    data,
    editRequest,
    effectiveIs4k,
    getAllRequestedSeasons,
    getAllSeasons,
    initializedSelectionKey,
    requestSelectionKey,
    settings.currentSettings.partialRequestsEnabled,
  ]);

  useEffect(() => {
    if (editRequest) {
      return;
    }

    const coveredSeasons = new Set(getAllRequestedSeasons());
    setSeasonSelections((currentSelections) =>
      currentSelections.filter(
        (selection) => !coveredSeasons.has(selection.seasonNumber)
      )
    );
  }, [editRequest, getAllRequestedSeasons]);

  const isOwner = editRequest && editRequest.requestedBy.id === user?.id;
  const hasAutoApprove = hasAutoApprovePermission(
    requestOverrides?.user?.permissions ?? user?.permissions ?? 0,
    'tv',
    effectiveIs4k
  );
  const selectedDestinationPromotable =
    selectedDestinationRequested &&
    canPromotePendingDestinationRequests(
      data?.mediaInfo?.requests,
      [selectedDestination],
      {
        canManageRequests: hasPermission(Permission.MANAGE_REQUESTS),
        hasAutoApprove,
      }
    );
  const selectedDestinationCovered =
    selectedDestinationAvailable ||
    (selectedDestinationRequested && !selectedDestinationPromotable);
  const notAvailable = intl.formatMessage(messages.notAvailable);
  const firstAirDate = data?.firstAirDate
    ? intl.formatDate(new Date(`${data.firstAirDate}T00:00:00`), {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : notAvailable;
  const releaseYear = data?.firstAirDate?.match(/^\d{4}/)?.[0];
  const runtime = data?.episodeRunTime.find(
    (minutes) => minutes > 0 && Number.isFinite(minutes)
  );
  const featuredCrew =
    data && data.createdBy.length > 0
      ? data.createdBy.slice(0, 2).map((person) => ({
          id: person.id,
          job: 'Creator',
          name: person.name,
        }))
      : sortCrewPriority(data?.credits?.crew ?? []).slice(0, 2);
  const network =
    data?.networks?.[0]?.name ??
    data?.productionCompanies?.[0]?.name ??
    notAvailable;
  const visibleSeasons = (data?.seasons ?? []).filter(
    (season) =>
      season.episodeCount !== 0 &&
      (settings.currentSettings.enableSpecialEpisodes ||
        season.seasonNumber !== 0)
  );
  const requestButtonLabel = editRequest
    ? isFailedManagerRepair
      ? intl.formatMessage(messages.saveAndRetry)
      : selectedSeasons.length === 0
        ? intl.formatMessage(messages.cancel)
        : hasPermission(Permission.MANAGE_REQUESTS)
          ? intl.formatMessage(messages.approve)
          : intl.formatMessage(messages.edit)
    : requestQuotaApproval
      ? intl.formatMessage(messages.requestQuotaApproval)
      : intl.formatMessage(globalMessages.request);
  const requestDisabled = editRequest
    ? (isFailedManagerRepair
        ? selectedSeasons.length === 0
        : usesEpisodeSelection &&
          selectedSeasons.length > 0 &&
          !requestTreeReady) || Boolean(gateBlocksSubmission)
    : (usesEpisodeSelection && !requestTreeReady) ||
      requestDestinationSettingsLoading ||
      !episodeQueueAccess ||
      Boolean(episodeQueueAccessError) ||
      selectedDestinationCovered ||
      submissionSelectionCount === 0 ||
      (!requestQuotaApproval &&
        (partialQuotaExceeded ||
          (!usesEpisodeSelection && fullQuotaExceeded))) ||
      Boolean(gateBlocksSubmission);
  const closeAction = tvdbId ? () => setSearchModal({ show: true }) : onCancel;
  const submitAction = () =>
    editRequest
      ? isFailedManagerRepair
        ? updateRequest(false)
        : hasPermission(Permission.MANAGE_REQUESTS)
          ? updateRequest(true)
          : updateRequest()
      : sendRequest();

  return data && !error && !data.externalIds.tvdbId && searchModal.show ? (
    <SearchByNameModal
      tvdbId={tvdbId}
      setTvdbId={setTvdbId}
      closeModal={() => setSearchModal({ show: false })}
      onCancel={onCancel}
      modalTitle={intl.formatMessage(
        effectiveIs4k
          ? messages.requestseries4ktitle
          : messages.requestseriestitle
      )}
      modalSubTitle={data.name}
      tmdbId={tmdbId}
      backdrop={`https://image.tmdb.org/t/p/w1920_and_h800_multi_faces/${data?.backdropPath}`}
    />
  ) : (
    <Modal
      loading={!data && !error}
      backgroundClickable
      onCancel={closeAction}
      onOk={submitAction}
      hideActions
      alignTop
      title={intl.formatMessage(
        editRequest
          ? isFailedManagerRepair
            ? is4k
              ? messages.failed4krequest
              : messages.failedrequest
            : is4k
              ? messages.pending4krequest
              : messages.pendingrequest
          : effectiveIs4k
            ? messages.requestseries4ktitle
            : messages.requestseriestitle
      )}
      okText={requestButtonLabel}
      okButtonProps={{
        buttonIcon:
          editRequest && selectedSeasons.length === 0 ? 'cancel' : undefined,
      }}
      okDisabled={requestDisabled}
      okButtonType={
        editRequest
          ? isFailedManagerRepair
            ? 'success'
            : settings.currentSettings.partialRequestsEnabled &&
                selectedSeasons.length === 0
              ? 'danger'
              : hasPermission(Permission.MANAGE_REQUESTS)
                ? 'success'
                : 'primary'
          : 'primary'
      }
      cancelText={
        editRequest
          ? intl.formatMessage(globalMessages.close)
          : tvdbId
            ? intl.formatMessage(globalMessages.back)
            : intl.formatMessage(globalMessages.cancel)
      }
      cancelButtonType={editRequest ? 'danger' : 'default'}
      actionButtonSize={editRequest ? 'standard' : 'sm'}
      dialogClass="request-modal-site-surface"
    >
      <RequestMediaCard
        artwork={
          data?.backdropPath
            ? `https://image.tmdb.org/t/p/original${data.backdropPath}`
            : getTmdbPosterImageUrl(data?.posterPath, 'original')
        }
        artworkType="tmdb"
      >
        {editRequest && (
          <div className="app-card-inset refreshed-inset-surface card-spacing-after">
            {isFailedManagerRepair
              ? intl.formatMessage(messages.repairFailedDescription)
              : isOwner
                ? intl.formatMessage(messages.pendingapproval)
                : intl.formatMessage(messages.requestfrom, {
                    username: editRequest.requestedBy.displayName,
                  })}
          </div>
        )}
        {(quota?.tv.limit ?? 0) > 0 && (
          <QuotaDisplay
            mediaType="tv"
            quota={quota?.tv}
            remaining={
              !settings.currentSettings.partialRequestsEnabled &&
              fullSeasonSelectionsToSubmit.length > (quota?.tv.remaining ?? 0)
                ? 0
                : currentlyRemaining
            }
            userOverride={
              requestOverrides?.user && requestOverrides.user.id !== user?.id
                ? requestOverrides?.user?.id
                : undefined
            }
            overLimit={
              !settings.currentSettings.partialRequestsEnabled &&
              fullSeasonSelectionsToSubmit.length > (quota?.tv.remaining ?? 0)
                ? fullSeasonSelectionsToSubmit.length
                : undefined
            }
          />
        )}
        <div className="app-card-inset refreshed-inset-surface detail-summary-card">
          <div className="app-detail-summary-grid">
            <div className="app-detail-poster-frame detail-card-poster">
              <CachedImage
                type="tmdb"
                src={
                  getTmdbPosterImageUrl(data?.posterPath) ||
                  '/images/seerr_poster_not_found.png'
                }
                alt=""
                fill
                sizes="(min-width: 640px) 80px, 64px"
                className="media-detail-artwork-image"
              />
            </div>

            <div>
              <h3 className="card-title detail-summary-title">
                {data?.name}
                {releaseYear ? ` (${releaseYear})` : ''}
              </h3>

              <div className="detail-card-heading-spacing detail-three-column-grid">
                <div className="detail-paired-column-span">
                  <dl className="card-table detail-paired-columns">
                    <dt className="card-table-heading">
                      {intl.formatMessage(messages.mediaAndFormat)}:
                    </dt>
                    <dd className="card-table-value">
                      {intl.formatMessage(globalMessages.tvshow)} ·{' '}
                      {effectiveIs4k ? '4K' : 'HD'}
                    </dd>
                    <dt className="card-table-heading">
                      {intl.formatMessage(messages.releaseDate)}:
                    </dt>
                    <dd className="card-table-value">{firstAirDate}</dd>
                    <dt className="card-table-heading">
                      {intl.formatMessage(messages.runtime)}:
                    </dt>
                    <dd className="card-table-value">
                      {runtime
                        ? `${intl.formatNumber(runtime)} minutes`
                        : notAvailable}
                    </dd>
                    <div className="card-table media-detail-column-divider">
                      {featuredCrew.map((person) => (
                        <div
                          className="card-table-group"
                          key={`${person.job}-${person.id}`}
                        >
                          <dt className="card-table-heading">{person.job}:</dt>
                          <dd className="card-table-value">{person.name}</dd>
                        </div>
                      ))}
                      <dt className="card-table-heading">
                        {intl.formatMessage(messages.network)}:
                      </dt>
                      <dd className="card-table-value">{network}</dd>
                    </div>
                    <dt className="card-table-heading">
                      {intl.formatMessage(messages.genres)}:
                    </dt>
                    <dd
                      className="card-table-value"
                      data-wrap="true"
                      data-lines="2"
                    >
                      {data?.genres?.length
                        ? data.genres
                            .slice(0, 3)
                            .map((genre) => genre.name)
                            .join(', ')
                        : notAvailable}
                    </dd>
                  </dl>
                </div>
                <dl className="card-table media-detail-column-divider">
                  <dt className="card-table-heading">
                    {intl.formatMessage(messages.status)}:
                  </dt>
                  <dd className="card-table-value">
                    {intl.formatMessage(
                      selectedDestinationAvailable
                        ? globalMessages.available
                        : selectedDestinationRequested
                          ? messages.requested
                          : messages.readyToRequest
                    )}
                  </dd>
                  <dt className="card-table-heading">
                    {intl.formatMessage(messages.service)}:
                  </dt>
                  <dd className="card-table-value">
                    {selectedService?.name ??
                      (selectedRequestService
                        ? `${selectedRequestService.requestButtonLabel} (${selectedRequestService.name})`
                        : undefined) ??
                      fallbackService?.name ??
                      notAvailable}
                  </dd>
                  <dt className="card-table-heading">
                    {intl.formatMessage(messages.approval)}:
                  </dt>
                  <dd className="card-table-value">
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
        </div>

        <div className="request-selection-layout">
          {isFailedManagerRepair && selectedSeasons.length > 0 && (
            <p className="app-card-inset refreshed-inset-surface card-body-text">
              {intl.formatMessage(messages.repairPreservesSelections)}
            </p>
          )}
          {usesEpisodeSelection &&
            data &&
            (!isFailedManagerRepair || selectedSeasons.length === 0) && (
              <RequestSeasonEpisodeTree
                key={requestSelectionKey}
                tvId={data.id}
                seasons={visibleSeasons}
                selections={requestableSelections}
                disabledSeasons={getAllRequestedSeasons()}
                disabledEpisodes={blockedEpisodesBySeason}
                availableEpisodesBySeason={availableEpisodesBySeason}
                selectionMode={
                  watchAheadEpisodeCount > 0 && !editRequest
                    ? 'single-episode'
                    : 'multiple'
                }
                onReadyChange={setRequestTreeReady}
                onSelectionsChange={(nextSelections) => {
                  const allowedSelections =
                    (quota?.tv.remaining ?? 0) +
                    (editRequest?.seasons.filter(isActiveSeasonRequest)
                      .length ?? 0);
                  if (
                    !quota?.tv.limit ||
                    requestOverrides?.ignoreQuota ||
                    nextSelections.length <= seasonSelections.length ||
                    nextSelections.length <= allowedSelections
                  ) {
                    setSeasonSelections(nextSelections);
                  }
                }}
              />
            )}
          {seasonWatchGateDisplayMessage && (
            <div
              className="page-error-message"
              data-severity={
                seasonWatchGateFailure === 'unavailable' ? 'error' : 'warning'
              }
              role={
                seasonWatchGateFailure === 'unavailable' ? 'alert' : 'status'
              }
            >
              <span>{seasonWatchGateDisplayMessage}</span>
              {seasonWatchGateFailure === 'account' && (
                <Button
                  as="a"
                  href="/profile/settings/linked-accounts"
                  buttonType="ghost"
                  buttonSize="sm"
                >
                  {intl.formatMessage(messages.seasonWatchGateLinkAccount)}
                </Button>
              )}
              {seasonWatchGateFailure === 'unavailable' && (
                <Button
                  type="button"
                  buttonType="ghost"
                  buttonSize="sm"
                  disabled={seasonWatchStatusQuery.isValidating}
                  onClick={() => void seasonWatchStatusQuery.mutate()}
                >
                  {intl.formatMessage(messages.retryWatchStatus)}
                </Button>
              )}
            </div>
          )}
          {seasonWatchGateRequirements.length > 0 &&
            isSeasonWatchGateOwner &&
            !canOverrideSeasonWatchGate &&
            !settings.currentSettings.tvSeasonWatchGateEnabled &&
            user?.tvSeasonWatchGateStatus !== 'enabled' && (
              <div
                className="page-error-message"
                data-severity="info"
                role="status"
              >
                <span>
                  {user?.tvSeasonWatchGateStatus === 'pending'
                    ? intl.formatMessage(messages.seasonWatchGateAccessPending)
                    : user?.tvSeasonWatchGateStatus === 'approved'
                      ? intl.formatMessage(
                          messages.seasonWatchGateAccessApproved
                        )
                      : intl.formatMessage(messages.seasonWatchGateAccessOff)}
                </span>
                <Button
                  as="a"
                  href="/profile/settings/tv-request-access"
                  buttonType="ghost"
                  buttonSize="sm"
                >
                  {intl.formatMessage(messages.seasonWatchGateManageAccess)}
                </Button>
              </div>
            )}

          <div className="request-selection-options">
            {!editRequest && (
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
            )}
            {!editRequest &&
              !canUseAdvancedOptions &&
              requestServiceOptions.length > 0 &&
              (fallbackService || requestServiceOptions.length > 1) && (
                <RequestListboxControl
                  id="tv-request-destination"
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
                  disabled={Boolean(editRequest)}
                  loadingLabel={intl.formatMessage(messages.destination)}
                />
              )}
            {watchAheadCardVisible && (
              <section
                className="app-card-inset refreshed-inset-surface detail-item-padded request-episode-queue"
                aria-labelledby="tv-episode-queue-heading"
              >
                <div className="request-episode-queue-header">
                  <h3
                    id="tv-episode-queue-heading"
                    className="request-episode-queue-title"
                  >
                    {intl.formatMessage(messages.watchAheadLabel)}
                  </h3>
                  {episodeQueueAccess && (
                    <Badge
                      badgeType={
                        defaultWatchAheadEpisodeCount > 0
                          ? 'success'
                          : 'default'
                      }
                    >
                      {intl.formatMessage(messages.watchAheadAdminManaged)}
                    </Badge>
                  )}
                </div>
                <p className="request-episode-queue-description refreshed-detail-text-muted">
                  {episodeQueueAccess
                    ? defaultWatchAheadEpisodeCount > 0
                      ? editRequest && watchAheadEpisodeCount > 0
                        ? intl.formatMessage(
                            messages.watchAheadActiveForRequest,
                            {
                              count: intl.formatMessage(
                                messages.watchAheadEpisodeOption,
                                { count: watchAheadEpisodeCount }
                              ),
                            }
                          )
                        : !editRequest && watchAheadAppliesToRequest
                          ? intl.formatMessage(
                              messages.watchAheadEnabledForAccount,
                              {
                                owner: watchAheadOwnerLabel,
                                count: intl.formatMessage(
                                  messages.watchAheadEpisodeOption,
                                  { count: defaultWatchAheadEpisodeCount }
                                ),
                              }
                            )
                          : intl.formatMessage(
                              messages.watchAheadAssignedButUnavailable,
                              {
                                owner: watchAheadOwnerLabel,
                                count: intl.formatMessage(
                                  messages.watchAheadEpisodeOption,
                                  { count: defaultWatchAheadEpisodeCount }
                                ),
                              }
                            )
                      : intl.formatMessage(messages.watchAheadOffForAccount, {
                          owner: watchAheadOwnerLabel,
                        })
                    : episodeQueueAccessError
                      ? intl.formatMessage(messages.watchAheadLoadError)
                      : intl.formatMessage(messages.watchAheadLoading)}
                </p>
                {episodeQueueAccess &&
                  watchAheadEpisodeCount > 0 &&
                  !editRequest && (
                    <p className="request-episode-queue-description refreshed-detail-text-muted">
                      {intl.formatMessage(messages.watchAheadStartingEpisode, {
                        owner: watchAheadOwnerLabel,
                      })}
                    </p>
                  )}
                {watchAheadUnavailableMessage && (
                  <p
                    className="request-episode-queue-description refreshed-detail-text-muted"
                    role="status"
                  >
                    {watchAheadUnavailableMessage}
                  </p>
                )}
                {needsWatchAheadAccountLink && (
                  <Button
                    as="a"
                    href="/profile/settings/linked-accounts"
                    buttonType="ghost"
                    buttonSize="sm"
                  >
                    {intl.formatMessage(messages.watchAheadLinkAccount)}
                  </Button>
                )}
                {episodeQueueAccessError && (
                  <Button
                    type="button"
                    buttonType="ghost"
                    buttonSize="sm"
                    onClick={() => void refreshEpisodeQueueAccess()}
                  >
                    {intl.formatMessage(messages.watchAheadRetry)}
                  </Button>
                )}
                <Button
                  as="a"
                  href="https://github.com/snapetech-org/seerrng/blob/main/docs/using-seerr/jellyfin-watch-ahead.md"
                  target="_blank"
                  rel="noreferrer"
                  buttonType="ghost"
                  buttonSize="sm"
                >
                  {intl.formatMessage(messages.watchAheadLearnMore)}
                </Button>
              </section>
            )}
          </div>
        </div>
        {canUseAdvancedOptions && (
          <AdvancedRequester
            key={(selectedIs4k ? '4k' : 'hd') + '-' + qualityRevision}
            type="tv"
            tmdbId={tmdbId}
            tvdbId={tvdbId ?? data?.externalIds.tvdbId}
            is4k={selectedIs4k}
            allow4kServerSelection={allow4kServerSelection && !editRequest}
            isAnime={isAnime}
            quota={quota}
            requestUser={editRequest?.requestedBy}
            requestId={editRequest?.id}
            reassignMissingServer={isFailedManagerRepair}
            defaultOverrides={
              editRequest
                ? {
                    folder: editRequest.rootFolder,
                    profile: editRequest.profileId,
                    server: editRequest.serverId,
                    language: editRequest.languageProfileId,
                    metadataLanguage: editRequest.metadataLanguageId,
                    sonarrSeasonType: editRequest.sonarrSeasonType,
                    tags: editRequest.tags,
                  }
                : undefined
            }
            expanded={advancedOptionsOpen}
            panelOnly
            rootFolderTable
            requestedByPortal={isFailedManagerRepair ? null : requestedByPortal}
            onChange={(overrides) => setRequestOverrides(overrides)}
          />
        )}

        <div className="app-action-row app-modal-actions">
          <div className="app-action-row" data-action-placement="leading">
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
          <div className="app-action-row" ref={setRequestedByPortal} />
          <Button
            type="button"
            onClick={closeAction}
            data-testid="modal-cancel-button"
            buttonType="danger"
            buttonSize="standard"
          >
            <XMarkIcon aria-hidden="true" />
            {editRequest
              ? intl.formatMessage(globalMessages.close)
              : intl.formatMessage(globalMessages.cancel)}
          </Button>
          <Button
            type="button"
            disabled={requestDisabled}
            disabledReason={requestDisabledReason}
            onClick={() => void submitAction()}
            data-testid="modal-ok-button"
            buttonType="success"
            buttonSize="standard"
          >
            {editRequest && selectedSeasons.length === 0 ? (
              <XMarkIcon aria-hidden="true" />
            ) : (
              <ArrowDownTrayIcon aria-hidden="true" />
            )}
            {requestButtonLabel}
          </Button>
        </div>
      </RequestMediaCard>
    </Modal>
  );
};

export default TvRequestModal;
