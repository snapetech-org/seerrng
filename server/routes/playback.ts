import JellyfinAPI from '@server/api/jellyfin';
import PlexAPI from '@server/api/plexapi';
import PlexCompanionAPI from '@server/api/plexcompanion';
import PlexTvAPI from '@server/api/plextv';
import { MediaType } from '@server/constants/media';
import { MediaServerType } from '@server/constants/server';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import { User } from '@server/entity/User';
import { classifyAudioPlaybackFormats } from '@server/lib/audioPlaybackFormat';
import { resolveCollectionQualityCatalog } from '@server/lib/collectionPlaybackQuality';
import { getMediaServerWatchStatus } from '@server/lib/mediaServerWatchStatus';
import { Permission } from '@server/lib/permissions';
import { getPlaybackMediaRootId } from '@server/lib/playbackMediaRoot';
import {
  isPlaybackQuality4k,
  resolvePlaybackCatalogItemIds,
} from '@server/lib/playbackSelection';
import { buildPlexPlaylistWebUrl } from '@server/lib/plexPlaylistUrl';
import { getSettings } from '@server/lib/settings';
import logger from '@server/logger';
import type {
  PlaybackCatalogGroup,
  PlaybackCatalogItem,
  PlaybackCatalogResponse,
  PlaybackCommandBody,
  PlaybackDevice,
  PlaybackPlaylistBody,
  PlaybackPlaylistResponse,
} from '@server/models/Playback';
import type { WatchStatusResponse } from '@server/models/WatchStatus';
import { mapWithConcurrency } from '@server/utils/concurrency';
import { getHostname } from '@server/utils/getHostname';
import { getHttpErrorDetails } from '@server/utils/httpError';
import { parsePositiveRouteId } from '@server/utils/routeId';
import { isSafePlayerConnectionUri } from '@server/utils/security';
import { Router } from 'express';
import { In } from 'typeorm';

const playbackRoutes = Router();
const MAX_PLAYBACK_ITEMS = 1_000;
const CURRENT_SELECTION_PLAYLIST_NAME = 'SeerrNG - Current Selection';

interface PlexPlaybackTarget extends PlaybackDevice {
  connectionUri: string;
}

const getPlexPlaybackTargets = async (
  plexToken: string
): Promise<PlexPlaybackTarget[]> => {
  const settings = getSettings();
  const plex = new PlexAPI({
    plexToken,
    plexSettings: settings.plex,
  });
  const [resourceResult, clientResult] = await Promise.allSettled([
    new PlexTvAPI(plexToken).getDevices(),
    plex.getClients(),
  ]);

  if (
    resourceResult.status === 'rejected' &&
    clientResult.status === 'rejected'
  ) {
    throw resourceResult.reason;
  }

  const targets = new Map<string, PlexPlaybackTarget>();
  if (resourceResult.status === 'fulfilled') {
    for (const device of resourceResult.value) {
      const connection =
        device.connection.find((candidate) => candidate.local) ??
        device.connection[0];
      if (
        device.presence === true &&
        device.provides.includes('player') &&
        connection &&
        isSafePlayerConnectionUri(connection.uri)
      ) {
        targets.set(device.clientIdentifier, {
          id: device.clientIdentifier,
          name: device.name,
          client: device.product,
          platform: device.platform || undefined,
          serverType: MediaServerType.PLEX,
          connectionUri: connection.uri,
        });
      }
    }
  }

  // Plex's cloud resource list omits some active local Companion receivers,
  // including supported smart-TV apps. The configured server's /clients list
  // supplies those LAN players while they are reachable.
  if (clientResult.status === 'fulfilled') {
    for (const client of clientResult.value) {
      if (!isSafePlayerConnectionUri(client.connectionUri)) {
        continue;
      }
      targets.set(client.clientIdentifier, {
        id: client.clientIdentifier,
        name: client.name,
        client: client.product,
        platform: client.platform,
        serverType: MediaServerType.PLEX,
        connectionUri: client.connectionUri,
      });
    }
  }

  return [...targets.values()];
};

const requestPermissions: Partial<Record<MediaType, Permission[]>> = {
  [MediaType.MOVIE]: [Permission.REQUEST, Permission.REQUEST_MOVIE],
  [MediaType.TV]: [Permission.REQUEST, Permission.REQUEST_TV],
  [MediaType.MUSIC]: [Permission.REQUEST, Permission.REQUEST_MUSIC],
  [MediaType.BOOK]: [Permission.REQUEST, Permission.REQUEST_BOOK],
  // Comics have no media-server playback surface (they're downloaded files,
  // not streamed) - this is exhaustive-switch coverage, not a reachable path.
  [MediaType.COMIC]: [Permission.REQUEST, Permission.REQUEST_COMIC],
  [MediaType.MAGAZINE]: [Permission.REQUEST, Permission.REQUEST_MAGAZINE],
};

const canUsePlayback = (user: User, mediaType: MediaType, is4k = false) => {
  if (mediaType === MediaType.COMIC || mediaType === MediaType.MAGAZINE) {
    return false;
  }
  const permissions = requestPermissions[mediaType];
  if (
    !permissions ||
    !user.hasPermission(permissions, {
      type: 'or',
    })
  ) {
    return false;
  }
  // Music reuses the existing standard/high-quality transport flag for its
  // MP3/FLAC catalog choice. FLAC does not require a video 4K permission.
  if (mediaType === MediaType.MUSIC) {
    return true;
  }
  if (!is4k) {
    return true;
  }

  const mediaPermission =
    mediaType === MediaType.MOVIE
      ? Permission.REQUEST_4K_MOVIE
      : Permission.REQUEST_4K_TV;
  return (
    (mediaType === MediaType.MOVIE || mediaType === MediaType.TV) &&
    user.hasPermission([Permission.REQUEST_4K, mediaPermission], { type: 'or' })
  );
};

const loadPlaybackUser = async (userId: number): Promise<User> =>
  getRepository(User).findOneOrFail({
    where: { id: userId },
    select: {
      id: true,
      permissions: true,
      plexToken: true,
      jellyfinUserId: true,
      jellyfinDeviceId: true,
      jellyfinAuthToken: true,
    },
  });

const loadMedia = async (mediaId: number): Promise<Media> =>
  getRepository(Media).findOneOrFail({ where: { id: mediaId } });

const toPlaybackItem = (
  item: {
    id: string;
    title: string;
    index?: number;
    parentIndex?: number;
  },
  kind: PlaybackCatalogItem['kind']
): PlaybackCatalogItem => ({
  id: item.id,
  title: item.title,
  index: item.index ?? 0,
  parentIndex: item.parentIndex,
  kind,
  available: true,
});

const createPlexCatalog = async (
  media: Media,
  plexToken: string,
  is4k: boolean,
  strictQuality = false
): Promise<PlaybackCatalogResponse> => {
  const rootId = getPlaybackMediaRootId(media, MediaServerType.PLEX, is4k);
  const settings = getSettings();
  const plex = new PlexAPI({ plexToken, plexSettings: settings.plex });
  const groups: PlaybackCatalogGroup[] = [];
  let rootItem: PlaybackCatalogItem | undefined;
  if (!rootId) {
    return {
      mediaId: media.id,
      serverType: MediaServerType.PLEX,
      is4k,
      groups,
    };
  }

  const root = await plex.getMetadata(rootId);
  if (media.mediaType === MediaType.MOVIE) {
    rootItem = toPlaybackItem(
      { id: root.ratingKey, title: root.title, index: root.index },
      'movie'
    );
  } else if (media.mediaType === MediaType.TV) {
    const seasons = (await plex.getChildrenMetadata(rootId)).filter(
      (item) => item.type === 'season'
    );
    const seasonGroups = await mapWithConcurrency(
      seasons,
      5,
      async (season) => {
        const episodes = (await plex.getChildrenMetadata(season.ratingKey))
          .filter((item) => item.type === 'episode')
          .filter(
            (item) =>
              !strictQuality ||
              (item.Media ?? []).some(
                (variant) => (variant.videoResolution === '4k') === is4k
              )
          )
          .map((episode) =>
            toPlaybackItem(
              {
                id: episode.ratingKey,
                title: episode.title,
                index: episode.index,
                parentIndex: episode.parentIndex ?? season.index,
              },
              'episode'
            )
          );
        return {
          id: season.ratingKey,
          title: season.title,
          index: season.index,
          available: episodes.length > 0,
          items: episodes,
        } satisfies PlaybackCatalogGroup;
      }
    );
    groups.push(...seasonGroups.sort((a, b) => a.index - b.index));
  } else {
    const trackMetadata =
      root.type === 'track' ? [root] : await plex.getChildrenMetadata(rootId);
    const tracks = trackMetadata
      .filter((item) => item.type === 'track')
      .filter(
        (item) =>
          !strictQuality ||
          classifyAudioPlaybackFormats(
            (item.Media ?? []).map((variant) => variant.audioCodec ?? '')
          ).includes(is4k ? 'flac' : 'mp3')
      )
      .map((track) =>
        toPlaybackItem(
          {
            id: track.ratingKey,
            title: track.title,
            index: track.index,
            parentIndex: track.parentIndex,
          },
          'track'
        )
      );
    groups.push({
      id: root.ratingKey,
      title: root.title,
      index: 0,
      available: tracks.length > 0,
      items: tracks,
    });
  }

  return {
    mediaId: media.id,
    serverType: MediaServerType.PLEX,
    is4k,
    rootItem,
    groups,
  };
};

const createJellyfinCatalog = async (
  media: Media,
  user: User,
  is4k: boolean,
  strictQuality = false
): Promise<PlaybackCatalogResponse> => {
  const settings = getSettings();
  const rootId = getPlaybackMediaRootId(
    media,
    settings.main.mediaServerType,
    is4k
  );
  const groups: PlaybackCatalogGroup[] = [];
  let rootItem: PlaybackCatalogItem | undefined;
  if (!rootId || !user.jellyfinAuthToken || !user.jellyfinUserId) {
    return {
      mediaId: media.id,
      serverType: settings.main.mediaServerType,
      is4k,
      groups,
    };
  }

  const jellyfin = new JellyfinAPI(
    getHostname(settings.jellyfin),
    user.jellyfinAuthToken,
    user.jellyfinDeviceId
  );
  jellyfin.setUserId(user.jellyfinUserId);
  const root = await jellyfin.getItemData(rootId);
  if (!root) {
    return {
      mediaId: media.id,
      serverType: settings.main.mediaServerType,
      is4k,
      groups,
    };
  }

  if (media.mediaType === MediaType.MOVIE) {
    rootItem = toPlaybackItem({ id: root.Id, title: root.Name }, 'movie');
  } else if (media.mediaType === MediaType.TV) {
    const seasons = await jellyfin.getSeasons(rootId);
    const seasonGroups = await mapWithConcurrency(
      seasons,
      5,
      async (season) => {
        const episodes = (
          await jellyfin.getEpisodes(rootId, season.Id, {
            includeMediaInfo: true,
          })
        )
          .filter(
            (item) =>
              !strictQuality ||
              item.MediaSources?.some((source) =>
                source.MediaStreams.some(
                  (stream) =>
                    stream.Type === 'Video' &&
                    typeof stream.Width === 'number' &&
                    stream.Width > 2000 === is4k
                )
              )
          )
          .map((episode) =>
            toPlaybackItem(
              {
                id: episode.Id,
                title: episode.Name,
                index: episode.IndexNumber,
                parentIndex: episode.ParentIndexNumber ?? season.IndexNumber,
              },
              'episode'
            )
          );
        return {
          id: season.Id,
          title: season.Name,
          index: season.IndexNumber ?? 0,
          available: episodes.length > 0,
          items: episodes,
        } satisfies PlaybackCatalogGroup;
      }
    );
    groups.push(...seasonGroups.sort((a, b) => a.index - b.index));
  } else {
    const trackMetadata =
      root.Type === 'Audio' || root.Type === 'AudioBook'
        ? [root]
        : strictQuality
          ? await jellyfin.getAudioChildrenWithMediaInfo(rootId)
          : await jellyfin.getChildren(rootId);
    const tracks = trackMetadata
      .filter(
        (track) =>
          !strictQuality ||
          ('MediaSources' in track &&
            Array.isArray(track.MediaSources) &&
            classifyAudioPlaybackFormats(
              track.MediaSources.flatMap((source) =>
                source.MediaStreams.map(
                  (stream: { Codec?: string }) => stream.Codec ?? ''
                )
              )
            ).includes(is4k ? 'flac' : 'mp3'))
      )
      .map((track) =>
        toPlaybackItem(
          {
            id: track.Id,
            title: track.Name,
            index: track.IndexNumber,
            parentIndex: track.ParentIndexNumber,
          },
          'track'
        )
      );
    groups.push({
      id: root.Id,
      title: root.Name,
      index: 0,
      available: tracks.length > 0,
      items: tracks,
    });
  }

  return {
    mediaId: media.id,
    serverType: settings.main.mediaServerType,
    is4k,
    rootItem,
    groups,
  };
};

const createCatalog = async (
  media: Media,
  user: User,
  is4k: boolean,
  strictQuality = false
): Promise<PlaybackCatalogResponse> => {
  const mediaServerType = getSettings().main.mediaServerType;
  if (mediaServerType === MediaServerType.PLEX && user.plexToken) {
    return createPlexCatalog(media, user.plexToken, is4k, strictQuality);
  }
  if (
    mediaServerType === MediaServerType.JELLYFIN ||
    mediaServerType === MediaServerType.EMBY
  ) {
    return createJellyfinCatalog(media, user, is4k, strictQuality);
  }
  return {
    mediaId: media.id,
    serverType: mediaServerType,
    is4k,
    groups: [],
  };
};

const resolvePlaylistItemIds = async (
  media: Media,
  user: User,
  requestedItemIds: string[],
  is4k: boolean
): Promise<string[]> => {
  const targetCatalog = await createCatalog(media, user, is4k);
  const sourceCatalog =
    media.mediaType !== MediaType.MOVIE && requestedItemIds.length > 0
      ? await createCatalog(media, user, !is4k)
      : undefined;

  return resolvePlaybackCatalogItemIds({
    mediaType: media.mediaType,
    targetCatalog,
    requestedItemIds,
    sourceCatalog,
  });
};

const createCollectionCatalog = async (
  media: Media,
  user: User,
  is4k: boolean
): Promise<PlaybackCatalogResponse> => {
  if (media.mediaType === MediaType.MUSIC)
    return createCatalog(media, user, is4k, true);
  return (
    (await resolveCollectionQualityCatalog(media, is4k, (quality) =>
      createCatalog(media, user, quality, true)
    )) ?? {
      mediaId: media.id,
      serverType: getSettings().main.mediaServerType,
      is4k,
      groups: [],
    }
  );
};

const replaceCurrentSelectionPlaylist = async (
  user: User,
  itemIds: string[],
  mediaType: 'audio' | 'video'
): Promise<PlaybackPlaylistResponse | undefined> => {
  const settings = getSettings();
  if (
    settings.main.mediaServerType === MediaServerType.PLEX &&
    user.plexToken &&
    settings.plex.machineId
  ) {
    const playlist = await new PlexAPI({
      plexToken: user.plexToken,
      plexSettings: settings.plex,
    }).replacePlaylist(
      CURRENT_SELECTION_PLAYLIST_NAME,
      itemIds,
      mediaType,
      settings.plex.machineId
    );
    return {
      url: buildPlexPlaylistWebUrl({
        webAppUrl: settings.plex.webAppUrl,
        machineIdentifier: settings.plex.machineId,
        playlistKey: playlist.key,
      }),
    };
  }

  if (
    (settings.main.mediaServerType === MediaServerType.JELLYFIN ||
      settings.main.mediaServerType === MediaServerType.EMBY) &&
    user.jellyfinAuthToken &&
    user.jellyfinUserId
  ) {
    const jellyfin = new JellyfinAPI(
      getHostname(settings.jellyfin),
      user.jellyfinAuthToken,
      user.jellyfinDeviceId
    );
    jellyfin.setUserId(user.jellyfinUserId);
    const playlist = await jellyfin.replacePlaylist(
      CURRENT_SELECTION_PLAYLIST_NAME,
      itemIds,
      mediaType === 'audio' ? 'Audio' : 'Video',
      user.jellyfinUserId
    );
    const mediaServerHost = (
      settings.jellyfin.externalHostname || getHostname(settings.jellyfin)
    ).replace(/\/$/, '');
    const pageName =
      settings.main.mediaServerType === MediaServerType.EMBY
        ? 'item'
        : 'details';
    return {
      url: `${mediaServerHost}/web/index.html#!/${pageName}?id=${encodeURIComponent(
        playlist.Id
      )}&context=home&serverId=${encodeURIComponent(
        settings.jellyfin.serverId
      )}`,
    };
  }

  return undefined;
};

playbackRoutes.get('/devices', async (req, res, next) => {
  try {
    const user = await loadPlaybackUser(req.user!.id);
    const settings = getSettings();
    let devices: PlaybackDevice[] = [];

    if (
      settings.main.mediaServerType === MediaServerType.PLEX &&
      user.plexToken
    ) {
      devices = (await getPlexPlaybackTargets(user.plexToken)).map(
        (device) => ({
          id: device.id,
          name: device.name,
          client: device.client,
          platform: device.platform,
          serverType: device.serverType,
        })
      );
    } else if (
      (settings.main.mediaServerType === MediaServerType.JELLYFIN ||
        settings.main.mediaServerType === MediaServerType.EMBY) &&
      user.jellyfinAuthToken &&
      user.jellyfinUserId
    ) {
      const jellyfin = new JellyfinAPI(
        getHostname(settings.jellyfin),
        user.jellyfinAuthToken,
        user.jellyfinDeviceId
      );
      jellyfin.setUserId(user.jellyfinUserId);
      devices = (
        await jellyfin.getControllableSessions(user.jellyfinUserId)
      ).map((session) => ({
        id: session.Id,
        name: session.DeviceName,
        client: session.Client,
        serverType: settings.main.mediaServerType,
      }));
    }

    return res.status(200).json(devices);
  } catch {
    return next({
      status: 502,
      message: 'Unable to retrieve playback devices.',
    });
  }
});

playbackRoutes.get('/watched/:mediaType/:tmdbId', async (req, res, next) => {
  const mediaType = req.params.mediaType;
  const tmdbId = parsePositiveRouteId(req.params.tmdbId, 1_000_000_000);
  if (
    (mediaType !== MediaType.MOVIE && mediaType !== MediaType.TV) ||
    !tmdbId
  ) {
    return next({ status: 404, message: 'Media not found.' });
  }

  try {
    const [media, user] = await Promise.all([
      getRepository(Media).findOne({ where: { tmdbId, mediaType } }),
      loadPlaybackUser(req.user!.id),
    ]);
    if (!media) {
      return res.status(200).json({
        serverType: getSettings().main.mediaServerType,
        availableCount: 0,
        watchedCount: 0,
        unwatchedCount: 0,
      } satisfies WatchStatusResponse);
    }
    return res
      .status(200)
      .json(
        await getMediaServerWatchStatus(media, user, req.query.details === '1')
      );
  } catch {
    return next({ status: 502, message: 'Unable to retrieve watched status.' });
  }
});

playbackRoutes.get('/media/:mediaId', async (req, res, next) => {
  const mediaId = parsePositiveRouteId(req.params.mediaId, 1_000_000_000);
  const is4k = isPlaybackQuality4k(req.query.is4k);
  if (!mediaId) {
    return next({ status: 404, message: 'Media not found.' });
  }

  try {
    const [media, user] = await Promise.all([
      loadMedia(mediaId),
      loadPlaybackUser(req.user!.id),
    ]);
    if (!canUsePlayback(user, media.mediaType, is4k)) {
      return res
        .status(403)
        .json({ status: 403, message: 'Playback is not permitted.' });
    }
    return res.status(200).json(await createCatalog(media, user, is4k));
  } catch {
    return next({ status: 502, message: 'Unable to retrieve playable media.' });
  }
});

playbackRoutes.post('/media/:mediaId/play', async (req, res, next) => {
  const mediaId = parsePositiveRouteId(req.params.mediaId, 1_000_000_000);
  const body = req.body as Partial<PlaybackCommandBody>;
  const deviceId =
    typeof body.deviceId === 'string' ? body.deviceId.slice(0, 512) : '';
  const requestedItemIds = Array.isArray(body.itemIds)
    ? body.itemIds
        .slice(0, MAX_PLAYBACK_ITEMS)
        .filter((itemId): itemId is string => typeof itemId === 'string')
        .map((itemId) => itemId.slice(0, 128))
    : [];
  const is4k = body.is4k === true;
  if (!mediaId || !deviceId) {
    return res.status(400).json({
      status: 400,
      message: 'A playback device is required.',
    });
  }

  try {
    const [media, user] = await Promise.all([
      loadMedia(mediaId),
      loadPlaybackUser(req.user!.id),
    ]);
    if (!canUsePlayback(user, media.mediaType, is4k)) {
      logger.warn('Media-server playback was rejected.', {
        label: 'Playback',
        mediaId,
        deviceId,
        reason: 'permission',
      });
      return res
        .status(403)
        .json({ status: 403, message: 'Playback is not permitted.' });
    }

    const itemIds = await resolvePlaylistItemIds(
      media,
      user,
      requestedItemIds,
      is4k
    );
    if (itemIds.length === 0) {
      logger.warn('Media-server playback was rejected.', {
        label: 'Playback',
        mediaId,
        deviceId,
        reason: 'empty-selection',
        requestedItemCount: requestedItemIds.length,
      });
      return res
        .status(400)
        .json({ status: 400, message: 'The media selection is not playable.' });
    }

    const settings = getSettings();
    if (
      settings.main.mediaServerType === MediaServerType.PLEX &&
      user.plexToken
    ) {
      const device = (await getPlexPlaybackTargets(user.plexToken)).find(
        (candidate) => candidate.id === deviceId
      );
      if (!device) {
        logger.warn('Media-server playback was rejected.', {
          label: 'Playback',
          mediaId,
          deviceId,
          reason: 'plex-device-unavailable',
        });
        return res
          .status(404)
          .json({ status: 404, message: 'Playback device is unavailable.' });
      }
      const plex = new PlexAPI({
        plexToken: user.plexToken,
        plexSettings: settings.plex,
      });
      const machineIdentifier = settings.plex.machineId;
      if (!machineIdentifier) {
        logger.warn('Media-server playback was rejected.', {
          label: 'Playback',
          mediaId,
          deviceId,
          reason: 'plex-server-identifier-unavailable',
        });
        return res.status(503).json({
          status: 503,
          message: 'The Plex server identifier is unavailable.',
        });
      }
      const playbackType =
        media.mediaType === MediaType.MUSIC ||
        media.mediaType === MediaType.BOOK
          ? 'audio'
          : 'video';
      const queue = await plex.createPlayQueue(
        itemIds,
        playbackType,
        machineIdentifier
      );
      await new PlexCompanionAPI({
        clientUrl: device.connectionUri,
        clientIdentifier: device.id,
        plexToken: user.plexToken,
      }).playMedia({
        server: settings.plex,
        machineIdentifier,
        ratingKey: queue.selectedItemId,
        playQueueId: queue.playQueueId,
        mediaType: playbackType,
      });
    } else if (
      (settings.main.mediaServerType === MediaServerType.JELLYFIN ||
        settings.main.mediaServerType === MediaServerType.EMBY) &&
      user.jellyfinAuthToken &&
      user.jellyfinUserId
    ) {
      const jellyfin = new JellyfinAPI(
        getHostname(settings.jellyfin),
        user.jellyfinAuthToken,
        user.jellyfinDeviceId
      );
      jellyfin.setUserId(user.jellyfinUserId);
      const sessions = await jellyfin.getControllableSessions(
        user.jellyfinUserId
      );
      if (!sessions.some((session) => session.Id === deviceId)) {
        return res
          .status(404)
          .json({ status: 404, message: 'Playback device is unavailable.' });
      }
      await jellyfin.playOnSession(deviceId, itemIds);
    } else {
      return res
        .status(409)
        .json({ status: 409, message: 'No media server is configured.' });
    }

    return res.status(204).send();
  } catch (error) {
    logger.warn('Unable to start media-server playback.', {
      label: 'Playback',
      mediaId,
      deviceId,
      ...getHttpErrorDetails(error),
    });
    return next({ status: 502, message: 'Unable to start playback.' });
  }
});

playbackRoutes.post('/media/:mediaId/playlist', async (req, res, next) => {
  const mediaId = parsePositiveRouteId(req.params.mediaId, 1_000_000_000);
  const body = req.body as Partial<PlaybackPlaylistBody>;
  const requestedItemIds = Array.isArray(body.itemIds)
    ? body.itemIds
        .slice(0, MAX_PLAYBACK_ITEMS)
        .filter((itemId): itemId is string => typeof itemId === 'string')
        .map((itemId) => itemId.slice(0, 128))
    : [];
  const is4k = body.is4k === true;
  if (!mediaId) {
    return res.status(400).json({
      status: 400,
      message: 'A valid media item is required.',
    });
  }

  try {
    const [media, user] = await Promise.all([
      loadMedia(mediaId),
      loadPlaybackUser(req.user!.id),
    ]);
    if (!canUsePlayback(user, media.mediaType, is4k)) {
      return res
        .status(403)
        .json({ status: 403, message: 'Playback is not permitted.' });
    }

    const itemIds = await resolvePlaylistItemIds(
      media,
      user,
      requestedItemIds,
      is4k
    );
    if (itemIds.length === 0) {
      return res
        .status(400)
        .json({ status: 400, message: 'The media selection is not playable.' });
    }

    const playlist = await replaceCurrentSelectionPlaylist(
      user,
      itemIds,
      media.mediaType === MediaType.MUSIC || media.mediaType === MediaType.BOOK
        ? 'audio'
        : 'video'
    );
    if (!playlist) {
      return res
        .status(409)
        .json({ status: 409, message: 'No media server is configured.' });
    }

    return res.status(200).json(playlist);
  } catch {
    return next({
      status: 502,
      message: 'Unable to replace the media-server playlist.',
    });
  }
});

playbackRoutes.post('/collection/play', async (req, res, next) => {
  const body = req.body as {
    deviceId?: unknown;
    mediaIds?: unknown;
    is4k?: unknown;
  };
  const is4k = body.is4k === true;
  const deviceId =
    typeof body.deviceId === 'string' ? body.deviceId.slice(0, 512) : '';
  const requestedMediaIds = Array.isArray(body.mediaIds)
    ? body.mediaIds
        .slice(0, MAX_PLAYBACK_ITEMS)
        .filter(
          (mediaId): mediaId is number =>
            Number.isSafeInteger(mediaId) && mediaId > 0
        )
    : [];
  if (!deviceId || requestedMediaIds.length === 0) {
    return res.status(400).json({
      status: 400,
      message: 'A device and collection selection are required.',
    });
  }

  try {
    const user = await loadPlaybackUser(req.user!.id);
    const uniqueMediaIds = [...new Set(requestedMediaIds)];
    const mediaItems = await getRepository(Media).find({
      where: { id: In(uniqueMediaIds) },
    });
    const mediaById = new Map(mediaItems.map((media) => [media.id, media]));
    if (
      mediaItems.length !== uniqueMediaIds.length ||
      mediaItems.some(
        (media) =>
          ![MediaType.MOVIE, MediaType.TV, MediaType.MUSIC].includes(
            media.mediaType
          )
      ) ||
      new Set(mediaItems.map((media) => media.mediaType)).size !== 1
    ) {
      return res.status(400).json({
        status: 400,
        message: 'The collection selection is not playable.',
      });
    }
    if (
      mediaItems.some((media) => !canUsePlayback(user, media.mediaType, is4k))
    )
      return res.status(403).json({ message: 'Playback is not permitted.' });
    const playbackType =
      mediaItems[0].mediaType === MediaType.MUSIC ? 'audio' : 'video';
    const catalogs = await mapWithConcurrency(uniqueMediaIds, 5, (mediaId) =>
      createCollectionCatalog(mediaById.get(mediaId)!, user, is4k)
    );
    const itemIds = catalogs.flatMap((catalog) =>
      catalog.rootItem
        ? [catalog.rootItem.id]
        : catalog.groups.flatMap((group) =>
            group.items.filter((item) => item.available).map((item) => item.id)
          )
    );
    if (itemIds.length === 0 || itemIds.length > 5000) {
      return res.status(400).json({
        status: 400,
        message: 'No selected collection items are available in this quality.',
      });
    }

    const settings = getSettings();
    if (
      settings.main.mediaServerType === MediaServerType.PLEX &&
      user.plexToken
    ) {
      const device = (await getPlexPlaybackTargets(user.plexToken)).find(
        (candidate) => candidate.id === deviceId
      );
      const machineIdentifier = settings.plex.machineId;
      if (!device || !machineIdentifier) {
        return res
          .status(404)
          .json({ status: 404, message: 'Playback device is unavailable.' });
      }
      const plex = new PlexAPI({
        plexToken: user.plexToken,
        plexSettings: settings.plex,
      });
      const queue = await plex.createPlayQueue(
        itemIds,
        playbackType,
        machineIdentifier
      );
      await new PlexCompanionAPI({
        clientUrl: device.connectionUri,
        clientIdentifier: device.id,
        plexToken: user.plexToken,
      }).playMedia({
        server: settings.plex,
        machineIdentifier,
        ratingKey: queue.selectedItemId,
        playQueueId: queue.playQueueId,
        mediaType: playbackType,
      });
    } else if (
      (settings.main.mediaServerType === MediaServerType.JELLYFIN ||
        settings.main.mediaServerType === MediaServerType.EMBY) &&
      user.jellyfinAuthToken &&
      user.jellyfinUserId
    ) {
      const jellyfin = new JellyfinAPI(
        getHostname(settings.jellyfin),
        user.jellyfinAuthToken,
        user.jellyfinDeviceId
      );
      jellyfin.setUserId(user.jellyfinUserId);
      const sessions = await jellyfin.getControllableSessions(
        user.jellyfinUserId
      );
      if (!sessions.some((session) => session.Id === deviceId)) {
        return res
          .status(404)
          .json({ status: 404, message: 'Playback device is unavailable.' });
      }
      await jellyfin.playOnSession(deviceId, itemIds);
    } else {
      return res
        .status(409)
        .json({ status: 409, message: 'No media server is configured.' });
    }

    return res.status(204).send();
  } catch {
    return next({
      status: 502,
      message: 'Unable to start collection playback.',
    });
  }
});

playbackRoutes.post('/collection/playlist', async (req, res, next) => {
  const body = req.body as { mediaIds?: unknown; is4k?: unknown };
  const is4k = body.is4k === true;
  const requestedMediaIds = Array.isArray(body.mediaIds)
    ? body.mediaIds
        .slice(0, MAX_PLAYBACK_ITEMS)
        .filter(
          (mediaId): mediaId is number =>
            Number.isSafeInteger(mediaId) && mediaId > 0
        )
    : [];
  if (requestedMediaIds.length === 0) {
    return res.status(400).json({
      status: 400,
      message: 'A collection selection is required.',
    });
  }

  try {
    const user = await loadPlaybackUser(req.user!.id);
    const uniqueMediaIds = [...new Set(requestedMediaIds)];
    const mediaItems = await getRepository(Media).find({
      where: { id: In(uniqueMediaIds) },
    });
    const mediaById = new Map(mediaItems.map((media) => [media.id, media]));
    if (
      mediaItems.length !== uniqueMediaIds.length ||
      mediaItems.some(
        (media) =>
          ![MediaType.MOVIE, MediaType.TV, MediaType.MUSIC].includes(
            media.mediaType
          )
      ) ||
      new Set(mediaItems.map((media) => media.mediaType)).size !== 1
    ) {
      return res.status(400).json({
        status: 400,
        message: 'The collection selection is not playable.',
      });
    }
    if (
      mediaItems.some((media) => !canUsePlayback(user, media.mediaType, is4k))
    )
      return res.status(403).json({ message: 'Playback is not permitted.' });
    const playbackType =
      mediaItems[0].mediaType === MediaType.MUSIC ? 'audio' : 'video';
    const catalogs = await mapWithConcurrency(uniqueMediaIds, 5, (mediaId) =>
      createCollectionCatalog(mediaById.get(mediaId)!, user, is4k)
    );
    const itemIds = catalogs.flatMap((catalog) =>
      catalog.rootItem
        ? [catalog.rootItem.id]
        : catalog.groups.flatMap((group) =>
            group.items.filter((item) => item.available).map((item) => item.id)
          )
    );
    if (itemIds.length === 0 || itemIds.length > 5000) {
      return res.status(400).json({
        status: 400,
        message: 'No selected collection items are available in this quality.',
      });
    }

    const playlist = await replaceCurrentSelectionPlaylist(
      user,
      itemIds,
      playbackType
    );
    if (!playlist) {
      return res
        .status(409)
        .json({ status: 409, message: 'No media server is configured.' });
    }

    return res.status(200).json(playlist);
  } catch {
    return next({
      status: 502,
      message: 'Unable to replace the media-server playlist.',
    });
  }
});

export default playbackRoutes;
