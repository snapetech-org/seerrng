import { MediaRequestStatus, MediaType } from '@server/constants/media';
import type { MediaRequest } from '@server/entity/MediaRequest';

export const EPISODE_QUEUE_HELP_URL =
  'https://github.com/snapetech-org/seerrng/blob/main/docs/using-seerr/jellyfin-watch-ahead.md';

export const EPISODE_QUEUE_ACCESS_STATUS = {
  OFF: 'off',
  APPROVED: 'approved',
} as const;

export const EPISODE_QUEUE_ACCESS_STATUSES = Object.values(
  EPISODE_QUEUE_ACCESS_STATUS
);

export type EpisodeQueueAccessStatus =
  (typeof EPISODE_QUEUE_ACCESS_STATUSES)[number];

export const isApprovedEpisodeQueueStart = (
  request: Pick<
    MediaRequest,
    | 'type'
    | 'status'
    | 'watchAheadEpisodeCount'
    | 'watchAheadParentRequestId'
    | 'seasons'
  >
): boolean => {
  if (
    request.type !== MediaType.TV ||
    request.status !== MediaRequestStatus.APPROVED ||
    request.watchAheadEpisodeCount <= 0 ||
    request.watchAheadParentRequestId
  ) {
    return false;
  }
  const selected = (request.seasons ?? []).filter(
    (season) => season.status !== MediaRequestStatus.DECLINED
  );
  return selected.length === 1 && selected[0].episodeNumbers?.length === 1;
};
