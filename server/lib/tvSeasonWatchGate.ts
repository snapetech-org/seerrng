import { MediaServerType } from '@server/constants/server';
import type Media from '@server/entity/Media';
import type { User } from '@server/entity/User';
import { getMediaServerWatchStatus } from '@server/lib/mediaServerWatchStatus';
import { Permission } from '@server/lib/permissions';
import { getPlaybackMediaRootId } from '@server/lib/playbackMediaRoot';
import { getSettings } from '@server/lib/settings';
import {
  getIncompletePreviousSeasonRequirement,
  getMissingPreviousSeasonHistoryRequirement,
  getSeasonWatchGateRequirements,
  getTvSeasonSelectionsAllowedByWatchGate,
  type TvSeasonWatchGateCatalogEntry,
  type TvSeasonWatchGateEpisode,
  type TvSeasonWatchGateSelection,
} from '@server/lib/tvSeasonWatchGatePolicy';
import { hasWatchAheadMediaServerLink } from '@server/lib/watchAheadEligibility';

export class TvSeasonWatchGateError extends Error {
  public constructor(
    public readonly status: 403 | 503,
    message: string
  ) {
    super(message);
    this.name = 'TvSeasonWatchGateError';
  }
}

const hasWatchHistoryCredentials = (
  user: User,
  serverType: MediaServerType
): boolean => {
  if (serverType === MediaServerType.PLEX) {
    return Boolean(user.plexToken);
  }
  if (
    serverType === MediaServerType.JELLYFIN ||
    serverType === MediaServerType.EMBY
  ) {
    return Boolean(user.jellyfinAuthToken && user.jellyfinUserId);
  }
  return false;
};

const actorCanBypassTvSeasonWatchGate = (actor: User): boolean =>
  actor.hasPermission([Permission.MANAGE_REQUESTS, Permission.ADMIN], {
    type: 'or',
  });

const getVerifiedWatchHistory = async (
  requestUser: User,
  media: Media,
  catalog: TvSeasonWatchGateCatalogEntry[],
  selections: TvSeasonWatchGateSelection[]
): Promise<TvSeasonWatchGateEpisode[] | undefined> => {
  const requirements = getSeasonWatchGateRequirements(catalog, selections);
  if (requirements.length === 0) {
    return undefined;
  }
  if (requirements.some(({ requiredSeason }) => requiredSeason === null)) {
    throw new TvSeasonWatchGateError(
      403,
      'Unable to verify the selected season against TV metadata. Try again later.'
    );
  }

  const serverType = getSettings().main.mediaServerType;
  if (
    !hasWatchAheadMediaServerLink(requestUser, serverType) ||
    !hasWatchHistoryCredentials(requestUser, serverType)
  ) {
    throw new TvSeasonWatchGateError(
      403,
      'Link your Plex, Jellyfin, or Emby account before requesting a later season.'
    );
  }

  const rootIds = [
    getPlaybackMediaRootId(media, serverType, false),
    getPlaybackMediaRootId(media, serverType, true),
  ].filter((id): id is string => Boolean(id));
  if (new Set(rootIds).size === 0) {
    throw new TvSeasonWatchGateError(
      403,
      'Add this series to your linked media server and sync its library before requesting a later season.'
    );
  }

  try {
    const status = await getMediaServerWatchStatus(media, requestUser, true);
    return (status.seasons ?? []).flatMap((season) =>
      season.episodes.map((episode) => ({
        seasonNumber: episode.seasonNumber,
        episodeNumber: episode.episodeNumber,
        watched: episode.watched,
      }))
    );
  } catch {
    throw new TvSeasonWatchGateError(
      503,
      'Unable to verify playback history right now. Try again later.'
    );
  }
};

const throwNoEligibleSeasonError = (
  catalog: TvSeasonWatchGateCatalogEntry[],
  selections: TvSeasonWatchGateSelection[],
  watchedEpisodes: TvSeasonWatchGateEpisode[]
): never => {
  const missingLibrarySeason = getMissingPreviousSeasonHistoryRequirement(
    catalog,
    selections,
    watchedEpisodes
  );
  if (missingLibrarySeason) {
    throw new TvSeasonWatchGateError(
      403,
      'Add this series to your linked Plex, Jellyfin, or Emby library and sync it before requesting a later season.'
    );
  }

  const incompleteRequirement = getIncompletePreviousSeasonRequirement(
    catalog,
    selections,
    watchedEpisodes
  );
  if (incompleteRequirement?.requiredSeason === null) {
    throw new TvSeasonWatchGateError(
      403,
      'Unable to verify the selected season against TV metadata. Try again later.'
    );
  }
  if (incompleteRequirement) {
    throw new TvSeasonWatchGateError(
      403,
      `Watch every episode of Season ${incompleteRequirement.requiredSeason} before requesting Season ${incompleteRequirement.requestedSeason}.`
    );
  }

  throw new TvSeasonWatchGateError(
    403,
    'No seasons are currently eligible to request.'
  );
};

/**
 * Stages a full-series request to only the seasons that current playback
 * history permits. This is used when partial requests are disabled; callers
 * must still distinguish a full-series request from client-selected seasons.
 */
export const filterTvSeasonSelectionsByWatchGate = async (
  actor: User,
  requestUser: User,
  media: Media,
  catalog: TvSeasonWatchGateCatalogEntry[],
  selections: TvSeasonWatchGateSelection[]
): Promise<TvSeasonWatchGateSelection[]> => {
  if (
    !getSettings().main.tvSeasonWatchGateEnabled ||
    actorCanBypassTvSeasonWatchGate(actor)
  ) {
    return selections;
  }

  const watchedEpisodes = await getVerifiedWatchHistory(
    requestUser,
    media,
    catalog,
    selections
  );
  if (!watchedEpisodes) {
    return selections;
  }

  const eligibleSelections = getTvSeasonSelectionsAllowedByWatchGate(
    catalog,
    selections,
    watchedEpisodes,
    true
  );
  if (eligibleSelections.length === 0) {
    throwNoEligibleSeasonError(catalog, selections, watchedEpisodes);
  }
  return eligibleSelections;
};

export const enforceTvSeasonWatchGate = async (
  actor: User,
  requestUser: User,
  media: Media,
  catalog: TvSeasonWatchGateCatalogEntry[],
  selections: TvSeasonWatchGateSelection[]
): Promise<void> => {
  const settings = getSettings();
  if (
    !settings.main.tvSeasonWatchGateEnabled ||
    actorCanBypassTvSeasonWatchGate(actor)
  ) {
    return;
  }

  const watchedEpisodes = await getVerifiedWatchHistory(
    requestUser,
    media,
    catalog,
    selections
  );
  if (!watchedEpisodes) {
    return;
  }

  const missingLibrarySeason = getMissingPreviousSeasonHistoryRequirement(
    catalog,
    selections,
    watchedEpisodes
  );
  if (missingLibrarySeason) {
    throw new TvSeasonWatchGateError(
      403,
      'Add this series to your linked Plex, Jellyfin, or Emby library and sync it before requesting a later season.'
    );
  }

  const incompleteRequirement = getIncompletePreviousSeasonRequirement(
    catalog,
    selections,
    watchedEpisodes
  );
  if (incompleteRequirement) {
    if (incompleteRequirement.requiredSeason === null) {
      throw new TvSeasonWatchGateError(
        403,
        'Unable to verify the selected season against TV metadata. Try again later.'
      );
    }
    throw new TvSeasonWatchGateError(
      403,
      `Watch every episode of Season ${incompleteRequirement.requiredSeason} before requesting Season ${incompleteRequirement.requestedSeason}.`
    );
  }
};
