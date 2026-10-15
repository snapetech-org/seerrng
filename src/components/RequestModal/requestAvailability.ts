import type { RequestOverrides } from '@app/components/RequestModal/AdvancedRequester';
import { MediaRequestStatus, MediaStatus } from '@server/constants/media';
import type { ServiceCommonServer } from '@server/interfaces/api/serviceInterfaces';
import {
  getActiveRequestForDestination,
  getStoredRequestDestinations,
  hasTrackedAvailableDestination,
  isDestinationAvailableInTargets,
  isDestinationCoveredByActiveRequest,
  isExactRequestDestination,
  legacyRequestDestinationCovers,
  type RequestDestination,
  type StoredRequestDestination,
} from '@server/lib/requestDestination';

interface DestinationAvailabilityMedia {
  status?: MediaStatus;
  status4k?: MediaStatus;
  serviceId?: number | null;
  serviceId4k?: number | null;
  serviceStatuses?: {
    serviceType: 'radarr' | 'sonarr';
    serverId: number;
    format: 'standard' | '4k';
    status: MediaStatus;
    seasonStatuses?: Record<number, MediaStatus> | null;
  }[];
  seasons?: {
    seasonNumber: number;
    status: MediaStatus;
    status4k: MediaStatus;
  }[];
  requests?: StoredRequestDestination[];
}

const getServiceStatusForDestination = (
  media: DestinationAvailabilityMedia | null | undefined,
  selected: RequestDestination | null | undefined
) =>
  media?.serviceStatuses?.find(
    (status) =>
      status.serviceType === selected?.serviceType &&
      status.serverId === selected?.serverId &&
      status.format === selected?.format
  );

// Availability is quality-specific; a partial series must still allow its
// missing episodes to be requested.
export const isVideoQualityAvailable = (
  media: DestinationAvailabilityMedia | null | undefined,
  mediaType: 'movie' | 'tv',
  is4k = false
): boolean => {
  const status = is4k ? media?.status4k : media?.status;
  return (
    status === MediaStatus.AVAILABLE ||
    (mediaType === 'movie' && status === MediaStatus.PARTIALLY_AVAILABLE)
  );
};

export const createRequestDestination = (
  serviceType: RequestDestination['serviceType'],
  format: RequestDestination['format'],
  service: ServiceCommonServer | null | undefined,
  overrides: RequestOverrides | null | undefined,
  defaultRootFolder?: string | null
): RequestDestination | null => {
  const serverId = overrides?.server ?? service?.id;
  if (serverId == null) {
    return null;
  }

  return {
    serviceType,
    format,
    serverId,
    profileId: overrides?.profile ?? service?.activeProfileId ?? null,
    metadataProfileId:
      overrides?.metadataProfile ?? service?.activeMetadataProfileId ?? null,
    languageProfileId:
      overrides?.language ?? service?.activeLanguageProfileId ?? null,
    rootFolder:
      overrides?.folder ??
      defaultRootFolder ??
      service?.activeDirectory ??
      null,
  };
};

export const isRequestDestinationAvailable = (
  media: DestinationAvailabilityMedia | null | undefined,
  selected: RequestDestination | null | undefined,
  legacyAvailableServerIds: number[] = []
): boolean => {
  if (!media || !selected) {
    return false;
  }

  if (isDestinationAvailableInTargets(media.requests, selected)) {
    return true;
  }
  const serviceStatus = getServiceStatusForDestination(media, selected);
  if (serviceStatus) {
    return serviceStatus.status === MediaStatus.AVAILABLE;
  }
  const status = selected.format === '4k' ? media.status4k : media.status;
  const legacyServerId =
    selected.format === '4k' ? media.serviceId4k : media.serviceId;
  if (status !== MediaStatus.AVAILABLE) {
    return false;
  }
  if (hasTrackedAvailableDestination(media.requests, selected)) {
    return false;
  }
  if (
    media.serviceStatuses?.some(
      (candidate) => candidate.serviceType === selected.serviceType
    )
  ) {
    return (
      legacyServerId === selected.serverId ||
      (selected.serverId != null &&
        legacyAvailableServerIds.includes(selected.serverId))
    );
  }
  return (
    legacyServerId == null ||
    legacyServerId === selected.serverId ||
    (selected.serverId != null &&
      legacyAvailableServerIds.includes(selected.serverId))
  );
};

export const isRequestDestinationSeasonAvailable = (
  media: DestinationAvailabilityMedia | null | undefined,
  selected: RequestDestination | null | undefined,
  seasonNumber: number,
  legacyAvailableServerIds: number[] = []
): boolean => {
  if (!media || !selected) return false;

  const serviceStatus = getServiceStatusForDestination(media, selected);
  if (serviceStatus?.seasonStatuses) {
    const status = serviceStatus.seasonStatuses[seasonNumber];
    if (status !== undefined) {
      return status === MediaStatus.AVAILABLE;
    }
  }

  const season = media.seasons?.find(
    (candidate) => candidate.seasonNumber === seasonNumber
  );
  if (!season) return false;

  const status = selected.format === '4k' ? season.status4k : season.status;
  if (status !== MediaStatus.AVAILABLE) return false;

  const legacyServerId =
    selected.format === '4k' ? media.serviceId4k : media.serviceId;
  if (serviceStatus) {
    return (
      legacyServerId === selected.serverId && status === MediaStatus.AVAILABLE
    );
  }
  if (
    media.serviceStatuses?.some(
      (candidate) => candidate.serviceType === selected.serviceType
    )
  ) {
    return (
      legacyServerId === selected.serverId ||
      (selected.serverId != null &&
        legacyAvailableServerIds.includes(selected.serverId))
    );
  }
  return (
    legacyServerId == null ||
    legacyServerId === selected.serverId ||
    (selected.serverId != null &&
      legacyAvailableServerIds.includes(selected.serverId))
  );
};

export const isRequestDestinationRequested = (
  requests: StoredRequestDestination[] | null | undefined,
  selected: RequestDestination | null | undefined
): boolean =>
  selected ? isDestinationCoveredByActiveRequest(requests, selected) : false;

export const isRequestForDestination = (
  request: StoredRequestDestination,
  selected: RequestDestination | null | undefined
): boolean => {
  if (!selected) {
    return false;
  }

  const { targets, legacy } = getStoredRequestDestinations(request);
  return targets.some((target) =>
    legacy
      ? legacyRequestDestinationCovers(target, selected)
      : isExactRequestDestination(target, selected)
  );
};

export const canPromotePendingDestinationRequests = (
  requests: StoredRequestDestination[] | null | undefined,
  selected: (RequestDestination | null)[],
  actor: {
    canManageRequests: boolean;
    hasAutoApprove: boolean;
  }
): boolean => {
  const targets = selected.filter(
    (target): target is RequestDestination => !!target
  );
  if (targets.length === 0) {
    return false;
  }

  const matches = targets.map((target) =>
    getActiveRequestForDestination(requests, target)
  );
  const firstMatch = matches[0];
  if (
    !firstMatch ||
    firstMatch.status !== MediaRequestStatus.PENDING ||
    matches.some((match) => match?.id !== firstMatch.id)
  ) {
    return false;
  }

  return actor.canManageRequests || actor.hasAutoApprove;
};

export const areAllRequestDestinationsCovered = (
  targets: (RequestDestination | null)[],
  predicate: (target: RequestDestination) => boolean
): boolean =>
  targets.length > 0 &&
  targets.every((target) => !!target && predicate(target));
