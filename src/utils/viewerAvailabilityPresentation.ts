import { OtherUserAvailabilityMode } from '@server/constants/availability';
import { MediaStatus } from '@server/constants/media';
import type { ViewerRequestCoverage } from '@server/lib/viewerRequestCoverage';

export interface ViewerAvailabilityPresentation {
  shared: boolean;
  hidden: boolean;
  hidePlayback: boolean;
}

export const getViewerAvailabilityPresentation = (
  status: MediaStatus | undefined,
  mode: OtherUserAvailabilityMode | undefined,
  viewerHasRequestedCopy: boolean | undefined,
  inProgress = false
): ViewerAvailabilityPresentation => {
  const isAvailable =
    status === MediaStatus.AVAILABLE ||
    status === MediaStatus.PARTIALLY_AVAILABLE;
  const shared =
    (mode === OtherUserAvailabilityMode.DISTINGUISH ||
      mode === OtherUserAvailabilityMode.HIDE) &&
    isAvailable &&
    !inProgress &&
    viewerHasRequestedCopy === false;

  return {
    shared,
    hidden: shared && mode === OtherUserAvailabilityMode.HIDE,
    hidePlayback: shared,
  };
};

export const isViewerSeasonShared = (
  coverage: ViewerRequestCoverage | undefined,
  mode: OtherUserAvailabilityMode | undefined,
  seasonNumber: number,
  quality: 'standard' | 'fourK'
): boolean => {
  if (!coverage) return false;

  const requestedSeasonCoverage = coverage.seasons?.find(
    (season) => season.seasonNumber === seasonNumber
  )?.[quality];
  const viewerHasRequestedCopy =
    coverage[quality] || requestedSeasonCoverage
      ? true
      : coverage.seasons
        ? false
        : undefined;

  return getViewerAvailabilityPresentation(
    MediaStatus.AVAILABLE,
    mode,
    viewerHasRequestedCopy
  ).shared;
};
