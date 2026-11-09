import { MediaType } from '@server/constants/media';
import { MediaServerType } from '@server/constants/server';
import type { MediaRequest } from '@server/entity/MediaRequest';
import { isActiveSeasonRequest } from '@server/entity/SeasonRequest';
import type { User } from '@server/entity/User';

export const isWatchAheadMediaServer = (
  mediaServerType: MediaServerType
): boolean =>
  mediaServerType === MediaServerType.PLEX ||
  mediaServerType === MediaServerType.JELLYFIN ||
  mediaServerType === MediaServerType.EMBY;

export const hasWatchAheadMediaServerLink = (
  user: Partial<Pick<User, 'plexId' | 'jellyfinUserId'>>,
  mediaServerType: MediaServerType
): boolean => {
  switch (mediaServerType) {
    case MediaServerType.PLEX:
      return (
        Number.isSafeInteger(Number(user.plexId)) && Number(user.plexId) > 0
      );
    case MediaServerType.JELLYFIN:
    case MediaServerType.EMBY:
      return Boolean(user.jellyfinUserId);
    default:
      return false;
  }
};

export const isPlexPlaybackSessionForUser = (
  session: { userId?: string; username?: string },
  user: Partial<Pick<User, 'plexId' | 'plexUsername'>>
): boolean =>
  (user.plexId != null && session.userId === String(user.plexId)) ||
  (user.plexUsername != null &&
    session.username?.toLocaleLowerCase() ===
      user.plexUsername.toLocaleLowerCase());

/** Keep every approval path from broadening a queue enrollment into whole seasons. */
export const hasValidEpisodeQueueStartingSelection = (
  request: Pick<
    MediaRequest,
    'type' | 'watchAheadEpisodeCount' | 'seasons' | 'serviceTargets'
  >
): boolean => {
  if (
    request.type !== MediaType.TV ||
    !(request.watchAheadEpisodeCount > 0) ||
    request.serviceTargets?.some((target) => target.requesterTagOnly)
  )
    return true;
  const seasons = request.seasons.filter(isActiveSeasonRequest);
  return seasons.length === 1 && seasons[0].episodeNumbers?.length === 1;
};
