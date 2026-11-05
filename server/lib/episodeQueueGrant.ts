import {
  EPISODE_QUEUE_ACCESS_STATUS,
  type EpisodeQueueAccessStatus,
} from '@server/constants/episodeQueueAccess';

/** An administrator may grant a root request a buffer independently of account defaults. */
export const hasEpisodeQueueGrant = (request: {
  watchAheadUsesUserDefault: boolean;
  requestedBy?: { episodeQueueAccessStatus: EpisodeQueueAccessStatus };
}): boolean =>
  Boolean(request.requestedBy) &&
  (request.watchAheadUsesUserDefault === false ||
    request.requestedBy?.episodeQueueAccessStatus ===
      EPISODE_QUEUE_ACCESS_STATUS.APPROVED);
