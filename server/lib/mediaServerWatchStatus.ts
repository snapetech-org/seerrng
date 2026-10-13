import JellyfinAPI from '@server/api/jellyfin';
import PlexAPI from '@server/api/plexapi';
import { MediaType } from '@server/constants/media';
import { MediaServerType } from '@server/constants/server';
import type Media from '@server/entity/Media';
import type { User } from '@server/entity/User';
import { getPlaybackMediaRootId } from '@server/lib/playbackMediaRoot';
import { getSettings } from '@server/lib/settings';
import {
  getMovieWatchStatus,
  getSeriesWatchStatus,
} from '@server/lib/watchStatus';
import type {
  WatchEpisodeStatus,
  WatchStatusResponse,
} from '@server/models/WatchStatus';
import { getHostname } from '@server/utils/getHostname';

export const getMediaServerWatchStatus = async (
  media: Media,
  user: User,
  includeEpisodes: boolean
): Promise<WatchStatusResponse> => {
  const settings = getSettings();
  const serverType = settings.main.mediaServerType;
  const rootIds = [
    getPlaybackMediaRootId(media, serverType, false),
    getPlaybackMediaRootId(media, serverType, true),
  ].filter(
    (id, index, ids): id is string => Boolean(id) && ids.indexOf(id) === index
  );
  const empty: WatchStatusResponse = {
    serverType,
    availableCount: 0,
    watchedCount: 0,
    unwatchedCount: 0,
    ...(includeEpisodes ? { seasons: [] } : {}),
  };
  if (rootIds.length === 0) {
    return empty;
  }

  if (serverType === MediaServerType.PLEX) {
    if (!user.plexToken) {
      return empty;
    }
    const plex = new PlexAPI({
      plexToken: user.plexToken,
      plexSettings: settings.plex,
    });
    if (media.mediaType === MediaType.MOVIE) {
      const roots = await Promise.all(
        rootIds.map((id) => plex.getMetadata(id))
      );
      return getMovieWatchStatus(
        serverType,
        roots.some((root) => root.viewCount > 0)
      );
    }
    const leaves = (
      await Promise.all(rootIds.map((id) => plex.getAllLeavesMetadata(id)))
    ).flat();
    const episodes: WatchEpisodeStatus[] = leaves.map((episode) => ({
      seasonNumber: episode.parentIndex ?? -1,
      episodeNumber: episode.index,
      watched: episode.viewCount > 0,
    }));
    return getSeriesWatchStatus(serverType, episodes, includeEpisodes);
  }

  if (
    serverType === MediaServerType.JELLYFIN ||
    serverType === MediaServerType.EMBY
  ) {
    if (!user.jellyfinAuthToken || !user.jellyfinUserId) {
      return empty;
    }
    const jellyfin = new JellyfinAPI(
      getHostname(settings.jellyfin),
      user.jellyfinAuthToken,
      user.jellyfinDeviceId
    );
    jellyfin.setUserId(user.jellyfinUserId);
    if (media.mediaType === MediaType.MOVIE) {
      const played = await Promise.all(
        rootIds.map((id) => jellyfin.getUserItemPlayed(id))
      );
      return getMovieWatchStatus(serverType, played.some(Boolean));
    }
    const episodes = (
      await Promise.all(rootIds.map((id) => jellyfin.getUserWatchEpisodes(id)))
    )
      .flat()
      .map((episode) => ({
        seasonNumber: episode.seasonNumber,
        episodeNumber: episode.episodeNumber,
        watched: episode.played,
      }));
    return getSeriesWatchStatus(serverType, episodes, includeEpisodes);
  }

  return empty;
};
