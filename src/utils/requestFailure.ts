import {
  MediaRequestFailureReason,
  MediaRequestStatus,
  MediaType,
} from '@server/constants/media';

export type RequestFailureMessageKey =
  | 'requestFailureServiceUnavailable'
  | 'requestFailureDispatchFailed'
  | 'requestFailureTvdbIdUnresolved'
  | 'requestFailureTvdbSeasonDataUnverified'
  | 'requestFailureTvdbSeasonMismatch';

export interface RequestFailureInfo {
  messageKey: RequestFailureMessageKey;
  retryUnavailable: boolean;
  findAnotherListing: boolean;
}

const failureInfoByReason: Record<
  MediaRequestFailureReason,
  RequestFailureInfo
> = {
  [MediaRequestFailureReason.SERVICE_UNAVAILABLE]: {
    messageKey: 'requestFailureServiceUnavailable',
    retryUnavailable: false,
    findAnotherListing: false,
  },
  [MediaRequestFailureReason.DISPATCH_FAILED]: {
    messageKey: 'requestFailureDispatchFailed',
    retryUnavailable: false,
    findAnotherListing: false,
  },
  [MediaRequestFailureReason.TVDB_ID_UNRESOLVED]: {
    messageKey: 'requestFailureTvdbIdUnresolved',
    retryUnavailable: false,
    findAnotherListing: false,
  },
  [MediaRequestFailureReason.TVDB_SEASON_DATA_UNVERIFIED]: {
    messageKey: 'requestFailureTvdbSeasonDataUnverified',
    retryUnavailable: false,
    findAnotherListing: false,
  },
  [MediaRequestFailureReason.TVDB_SEASON_MISMATCH]: {
    messageKey: 'requestFailureTvdbSeasonMismatch',
    retryUnavailable: true,
    findAnotherListing: true,
  },
};

export const getRequestFailureInfo = (
  reason: string | null | undefined
): RequestFailureInfo | null => {
  if (
    !reason ||
    !Object.prototype.hasOwnProperty.call(failureInfoByReason, reason)
  ) {
    return null;
  }

  return failureInfoByReason[reason as MediaRequestFailureReason];
};

export const canManuallyMapTvdbSeasons = (
  requestType: string | null | undefined,
  requestStatus: number | null | undefined,
  failureReason: string | null | undefined
): boolean =>
  requestType === MediaType.TV &&
  requestStatus === MediaRequestStatus.FAILED &&
  (failureReason === MediaRequestFailureReason.TVDB_ID_UNRESOLVED ||
    failureReason === MediaRequestFailureReason.TVDB_SEASON_MISMATCH);

export const getRequestFailureDescriptionId = (
  requestId: number | string,
  surface = 'request'
): string => `request-failure-reason-${surface}-${requestId}`;

export const getRequestFailureSearchHref = (
  reason: string | null | undefined,
  requestType: string,
  title: string | null | undefined
): string | undefined => {
  const info = getRequestFailureInfo(reason);
  const normalizedTitle = title?.trim();

  if (
    !info?.findAnotherListing ||
    requestType !== MediaType.TV ||
    !normalizedTitle
  ) {
    return undefined;
  }

  return `/search?query=${encodeURIComponent(normalizedTitle)}&type=${MediaType.TV}`;
};
