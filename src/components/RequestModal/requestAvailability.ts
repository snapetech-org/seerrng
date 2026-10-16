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
  requests?: StoredRequestDestination[];
}

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
  overrides: RequestOverrides | null | undefined
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
    rootFolder: overrides?.folder ?? service?.activeDirectory ?? null,
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
  if (hasTrackedAvailableDestination(media.requests, selected)) {
    return false;
  }

  const status = selected.format === '4k' ? media.status4k : media.status;
  if (status !== MediaStatus.AVAILABLE) {
    return false;
  }

  const legacyServerId =
    selected.format === '4k' ? media.serviceId4k : media.serviceId;
  return (
    legacyServerId == null ||
    legacyServerId === selected.serverId ||
    legacyAvailableServerIds.includes(selected.serverId as number)
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
    (firstMatch.quotaException && !actor.canManageRequests) ||
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
