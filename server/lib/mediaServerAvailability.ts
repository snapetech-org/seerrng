import JellyfinAPI, { type JellyfinLibraryItem } from '@server/api/jellyfin';
import PlexAPI from '@server/api/plexapi';
import { MediaStatus, MediaType } from '@server/constants/media';
import { MediaServerType } from '@server/constants/server';
import { getRepository } from '@server/datasource';
import type Media from '@server/entity/Media';
import MediaServiceStatus from '@server/entity/MediaServiceStatus';
import { User } from '@server/entity/User';
import cacheManager from '@server/lib/cache';
import type { EpisodeAvailabilityForEpisode } from '@server/lib/episodeAvailability';
import { Permission } from '@server/lib/permissions';
import type { PlexSettings } from '@server/lib/settings';
import { getSettings } from '@server/lib/settings';
import { is4kResolution } from '@server/lib/videoResolution';
import { mapWithConcurrency } from '@server/utils/concurrency';
import { getHostname } from '@server/utils/getHostname';
import { normalizeJellyfinGuid } from '@server/utils/jellyfin';
import { parsePositiveRouteId } from '@server/utils/routeId';
import { createHash } from 'node:crypto';

const MEDIA_AVAILABILITY_CACHE_TTL_SECONDS = 30;
const MEDIA_AVAILABILITY_ERROR_TTL_SECONDS = 10;
const MAX_MEDIA_AVAILABILITY_CHECKS_PER_RESPONSE = 32;
const MEDIA_AVAILABILITY_CHECK_CONCURRENCY = 8;
const MAX_MEDIA_AVAILABILITY_IN_FLIGHT = 128;
const MEDIA_SERVER_CHECK_TIMEOUT_MS = 2_000;

type MediaServerSource = 'plex' | 'jellyfin' | 'emby';
export type VideoAvailabilityFormat = 'standard' | '4k';
type VideoFormat = VideoAvailabilityFormat;

interface MediaServerAccessContext {
  source: MediaServerSource;
  userId: number;
  linkedIdentity: string;
  credential?: string;
  deviceId?: string;
  host: string;
  plexSettings?: PlexSettings;
  scopeDigest: string;
}

interface MediaServerAccessResult {
  visible: boolean;
  seasonNumbers?: number[];
}

interface MediaVariant {
  media: Media;
  format: VideoFormat;
  key: string;
}

const pendingChecks = new Map<string, Promise<MediaServerAccessResult>>();
const unavailable: MediaServerAccessResult = { visible: false };

const isVideoMedia = (media: Media): boolean =>
  media.mediaType === MediaType.MOVIE || media.mediaType === MediaType.TV;

const isAvailable = (status: MediaStatus | null | undefined): boolean =>
  status === MediaStatus.AVAILABLE ||
  status === MediaStatus.PARTIALLY_AVAILABLE;

const sourceForServer = (
  serverType: MediaServerType
): MediaServerSource | undefined => {
  if (serverType === MediaServerType.PLEX) return 'plex';
  if (serverType === MediaServerType.JELLYFIN) return 'jellyfin';
  if (serverType === MediaServerType.EMBY) return 'emby';
  return undefined;
};

const accessScopeDigest = (input: {
  source: MediaServerSource;
  userId: number;
  linkedIdentity: string;
  credential?: string;
  deviceId?: string;
  host: string;
  machineId?: string;
}): string => createHash('sha256').update(JSON.stringify(input)).digest('hex');

/** Load only the linked account fields required for a viewer-scoped check. */
export const getMediaServerAccessContext = async (
  user?: User
): Promise<MediaServerAccessContext | undefined> => {
  if (!user || !Number.isSafeInteger(user.id) || user.id <= 0) {
    return undefined;
  }

  const settings = getSettings();
  const source = sourceForServer(settings.main.mediaServerType);
  if (!source) return undefined;

  const host =
    source === 'plex'
      ? `${settings.plex.useSsl ? 'https' : 'http'}://${settings.plex.ip}:${settings.plex.port}`
      : getHostname(settings.jellyfin);

  let linkedUser: User | null;
  try {
    linkedUser = await getRepository(User).findOne({
      where: { id: user.id },
      select: {
        id: true,
        plexId: true,
        plexToken: true,
        jellyfinUserId: true,
        jellyfinDeviceId: true,
        jellyfinAuthToken: true,
      },
    });
  } catch {
    // If the identity cannot be loaded, callers must not expose availability
    // that may belong to a linked account whose provider rules are unknown.
    const unknownIdentity = `unresolved-user-${user.id}`;
    return {
      source,
      userId: user.id,
      linkedIdentity: unknownIdentity,
      host,
      scopeDigest: accessScopeDigest({
        source,
        userId: user.id,
        linkedIdentity: unknownIdentity,
        host,
      }),
    };
  }

  if (!linkedUser) {
    const unknownIdentity = `missing-user-${user.id}`;
    return {
      source,
      userId: user.id,
      linkedIdentity: unknownIdentity,
      host,
      scopeDigest: accessScopeDigest({
        source,
        userId: user.id,
        linkedIdentity: unknownIdentity,
        host,
      }),
    };
  }

  if (source === 'plex') {
    const linked =
      linkedUser.plexId !== null && linkedUser.plexId !== undefined;
    if (!linked && !linkedUser.plexToken) return undefined;

    const linkedIdentity = linkedUser.plexId
      ? String(linkedUser.plexId)
      : `token-linked-user-${linkedUser.id}`;
    return {
      source,
      userId: linkedUser.id,
      linkedIdentity,
      credential: linkedUser.plexToken ?? undefined,
      host,
      plexSettings: { ...settings.plex },
      scopeDigest: accessScopeDigest({
        source,
        userId: linkedUser.id,
        linkedIdentity,
        credential: linkedUser.plexToken ?? undefined,
        host,
        machineId: settings.plex.machineId,
      }),
    };
  }

  const normalizedIdentity = normalizeJellyfinGuid(linkedUser.jellyfinUserId);
  const linked = Boolean(normalizedIdentity || linkedUser.jellyfinAuthToken);
  if (!linked) return undefined;

  const linkedIdentity =
    normalizedIdentity ?? `token-linked-user-${linkedUser.id}`;
  // A server API key can query a disabled viewer. Password sign-in persists
  // the viewer credential; legacy sessions without one must sign in again.
  const credential = linkedUser.jellyfinAuthToken ?? undefined;
  return {
    source,
    userId: linkedUser.id,
    linkedIdentity,
    credential,
    deviceId: linkedUser.jellyfinDeviceId ?? undefined,
    host,
    scopeDigest: accessScopeDigest({
      source,
      userId: linkedUser.id,
      linkedIdentity,
      credential,
      deviceId: linkedUser.jellyfinDeviceId ?? undefined,
      host,
    }),
  };
};

/** Managers need the global scanned state while reviewing the library. */
export const getPresentationMediaServerAccessContext = async (
  user?: User
): Promise<MediaServerAccessContext | undefined> =>
  user?.hasPermission(Permission.ADMIN)
    ? undefined
    : getMediaServerAccessContext(user);

const variantStatus = (media: Media, format: VideoFormat): MediaStatus =>
  media[format === '4k' ? 'status4k' : 'status'];

const variantServiceId = (media: Media, format: VideoFormat): number | null =>
  (format === '4k' ? media.serviceId4k : media.serviceId) ?? null;

const variantNativeId = (
  media: Media,
  format: VideoFormat,
  source: MediaServerSource
): string | undefined => {
  const value =
    source === 'plex'
      ? format === '4k'
        ? media.ratingKey4k
        : media.ratingKey
      : format === '4k'
        ? media.jellyfinMediaId4k
        : media.jellyfinMediaId;
  return typeof value === 'string' && value.length <= 128 ? value : undefined;
};

const needsAccessCheck = (media: Media, format: VideoFormat): boolean =>
  isAvailable(variantStatus(media, format)) ||
  (media.serviceStatuses ?? []).some(
    (status) => status.format === format && isAvailable(status.status)
  ) ||
  (media.requests ?? []).some((request) =>
    (request.serviceTargets ?? []).some(
      (target) => target.format === format && isAvailable(target.status)
    )
  );

const safeSeasonNumbers = (values: unknown[]): number[] =>
  [
    ...new Set(
      values.filter(
        (value): value is number =>
          typeof value === 'number' &&
          Number.isSafeInteger(value) &&
          value >= 0 &&
          value <= 10_000
      )
    ),
  ].slice(0, 1_000);

type ProviderIdentity = Partial<Record<'tmdb' | 'tvdb' | 'imdb', string[]>>;

const matchesProviderIdentity = (
  media: Media,
  ids: ProviderIdentity
): boolean => {
  let corroborated = false;
  for (const provider of ['tmdb', 'tvdb', 'imdb'] as const) {
    const expected =
      provider === 'tmdb'
        ? media.tmdbId
        : provider === 'tvdb'
          ? media.tvdbId
          : media.imdbId;
    const normalizedExpected =
      provider === 'imdb'
        ? typeof expected === 'string' && /^tt\d{1,20}$/i.test(expected)
          ? expected.toLowerCase()
          : undefined
        : parsePositiveRouteId(expected);
    if (normalizedExpected === undefined || !ids[provider]?.length) continue;
    for (const id of ids[provider] ?? []) {
      const actual =
        provider === 'imdb' ? id.toLowerCase() : parsePositiveRouteId(id);
      if (actual !== normalizedExpected) return false;
    }
    corroborated = true;
  }
  return corroborated;
};

const plexProviderIdentity = (guids: string[]): ProviderIdentity => {
  const ids: ProviderIdentity = {};
  for (const guid of guids) {
    if (typeof guid !== 'string') continue;
    const match =
      /^(?:com\.plexapp\.agents\.)?(tmdb|themoviedb|tvdb|thetvdb|imdb):\/\/([^/?#]+)/i.exec(
        guid
      );
    if (!match) continue;
    const provider = match[1].toLowerCase().includes('tvdb')
      ? 'tvdb'
      : match[1].toLowerCase() === 'imdb'
        ? 'imdb'
        : 'tmdb';
    (ids[provider] ??= []).push(match[2]);
  }
  return ids;
};

const verifyNativeItemAccess = async (
  context: MediaServerAccessContext,
  media: Media,
  format: VideoFormat,
  nativeId: string | undefined
): Promise<MediaServerAccessResult> => {
  if (!context.credential || !nativeId) return unavailable;

  if (context.source === 'plex') {
    if (!/^\d{1,20}$/.test(nativeId) || !context.plexSettings) {
      return unavailable;
    }
    const api = new PlexAPI({
      plexToken: context.credential,
      plexSettings: context.plexSettings,
      timeout: MEDIA_SERVER_CHECK_TIMEOUT_MS,
    });
    const item = await api.getMetadata(nativeId, {
      includeChildren: media.mediaType === MediaType.TV,
    });
    const expectedType = media.mediaType === MediaType.MOVIE ? 'movie' : 'show';
    if (
      item.ratingKey !== nativeId ||
      item.type !== expectedType ||
      !matchesProviderIdentity(
        media,
        plexProviderIdentity([
          item.guid,
          ...(item.Guid ?? []).map((guid) => guid.id),
        ])
      )
    ) {
      return unavailable;
    }
    if (media.mediaType === MediaType.MOVIE) {
      return { visible: true };
    }
    const children = item.Children?.Metadata;
    if (!children) return unavailable;
    return {
      visible: true,
      seasonNumbers: safeSeasonNumbers(
        children
          .filter((child) => child.type === 'season')
          .map((child) => child.index)
      ),
    };
  }

  const normalizedNativeId = normalizeJellyfinGuid(nativeId);
  const normalizedUserId = normalizeJellyfinGuid(context.linkedIdentity);
  if (!normalizedNativeId || !normalizedUserId) return unavailable;

  const api = new JellyfinAPI(
    context.host,
    context.credential,
    context.deviceId,
    true,
    MEDIA_SERVER_CHECK_TIMEOUT_MS
  );
  api.setUserId(normalizedUserId);
  const itemCheck = api.getUserItemForAvailabilityCheck(
    normalizedNativeId,
    normalizedUserId
  );
  const seasonsCheck =
    media.mediaType === MediaType.TV
      ? api.getUserSeasons(normalizedNativeId, normalizedUserId)
      : undefined;
  const [item, seasons] = await Promise.all([itemCheck, seasonsCheck]);
  const expectedType = media.mediaType === MediaType.MOVIE ? 'Movie' : 'Series';
  if (
    !item ||
    normalizeJellyfinGuid(item.Id) !== normalizedNativeId ||
    item.Type !== expectedType ||
    !matchesProviderIdentity(media, {
      tmdb: [item.ProviderIds.Tmdb, item.ProviderIds.TheMovieDb].filter(
        (id): id is string => Boolean(id)
      ),
      tvdb: item.ProviderIds.Tvdb ? [item.ProviderIds.Tvdb] : [],
      imdb: item.ProviderIds.Imdb ? [item.ProviderIds.Imdb] : [],
    })
  ) {
    return unavailable;
  }
  if (media.mediaType === MediaType.MOVIE) {
    return { visible: true };
  }
  if (!seasons) return unavailable;

  return {
    visible: true,
    seasonNumbers: safeSeasonNumbers(
      seasons
        .filter((season: JellyfinLibraryItem) => season.Type === 'Season')
        .map((season) => season.IndexNumber)
    ),
  };
};

const resolveNativeItemAccess = async (
  context: MediaServerAccessContext,
  media: Media,
  format: VideoFormat
): Promise<MediaServerAccessResult> => {
  const nativeId = variantNativeId(media, format, context.source);
  const keyDigest = createHash('sha256')
    .update(
      JSON.stringify({
        scope: context.scopeDigest,
        mediaType: media.mediaType,
        tmdbId: media.tmdbId,
        tvdbId: media.tvdbId,
        imdbId: media.imdbId,
        nativeId: nativeId ?? '',
      })
    )
    .digest('hex');
  const cache = cacheManager.getCache('mediaavailability').data;
  const cached = cache.get<MediaServerAccessResult>(keyDigest);
  if (cached) return cached;
  const pending = pendingChecks.get(keyDigest);
  if (pending) return pending;
  if (pendingChecks.size >= MAX_MEDIA_AVAILABILITY_IN_FLIGHT) {
    return unavailable;
  }

  const check = verifyNativeItemAccess(context, media, format, nativeId).catch(
    () => unavailable
  );
  pendingChecks.set(keyDigest, check);
  try {
    const result = await check;
    cache.set(
      keyDigest,
      result,
      result.visible
        ? MEDIA_AVAILABILITY_CACHE_TTL_SECONDS
        : MEDIA_AVAILABILITY_ERROR_TTL_SECONDS
    );
    return result;
  } finally {
    if (pendingChecks.get(keyDigest) === check) {
      pendingChecks.delete(keyDigest);
    }
  }
};

const maskStatusForSeasons = (
  media: Media,
  statusKey: 'status' | 'status4k',
  seasonNumbers: number[] | undefined
): boolean => {
  if (!isAvailable(media[statusKey])) return false;
  if (!seasonNumbers?.length || !media.seasons?.length) {
    media[statusKey] = MediaStatus.UNKNOWN;
    for (const season of media.seasons ?? []) {
      if (isAvailable(season[statusKey])) {
        season[statusKey] = MediaStatus.UNKNOWN;
      }
    }
    return true;
  }

  const visibleSeasons = new Set(seasonNumbers);
  let hiddenAvailableSeason = false;
  let visibleAvailableSeason = false;
  for (const season of media.seasons ?? []) {
    if (!isAvailable(season[statusKey])) continue;
    if (!visibleSeasons.has(season.seasonNumber)) {
      season[statusKey] = MediaStatus.UNKNOWN;
      hiddenAvailableSeason = true;
    } else {
      visibleAvailableSeason = true;
    }
  }

  if (hiddenAvailableSeason) {
    media[statusKey] = visibleAvailableSeason
      ? MediaStatus.PARTIALLY_AVAILABLE
      : MediaStatus.UNKNOWN;
  }
  return hiddenAvailableSeason;
};

const hideVariantLinks = (media: Media, format: VideoFormat): void => {
  if (format === '4k') {
    delete media.ratingKey4k;
    delete media.jellyfinMediaId4k;
    delete media.mediaUrl4k;
    delete media.iOSPlexUrl4k;
    delete media.tautulliUrl4k;
    return;
  }
  delete media.ratingKey;
  delete media.jellyfinMediaId;
  delete media.mediaUrl;
  delete media.iOSPlexUrl;
  delete media.tautulliUrl;
};

const maskUnverifiedVariant = (media: Media, format: VideoFormat): void => {
  const statusKey = format === '4k' ? 'status4k' : 'status';
  if (isAvailable(media[statusKey])) {
    media[statusKey] = MediaStatus.UNKNOWN;
  }
  if (media.mediaType === MediaType.TV) {
    for (const season of media.seasons ?? []) {
      if (isAvailable(season[statusKey])) {
        season[statusKey] = MediaStatus.UNKNOWN;
      }
    }
  }

  if (media.serviceStatuses) {
    media.serviceStatuses = media.serviceStatuses.map(
      (status) =>
        new MediaServiceStatus({
          ...status,
          seasonStatuses: status.seasonStatuses
            ? { ...status.seasonStatuses }
            : status.seasonStatuses,
        })
    );
    for (const status of media.serviceStatuses) {
      if (status.format !== format || !isAvailable(status.status)) continue;
      status.status = MediaStatus.UNKNOWN;
      status.seasonStatuses = null;
    }
  }

  hideVariantLinks(media, format);
};

const isPrimaryDestination = (
  media: Media,
  format: VideoFormat,
  serviceType: string,
  serverId: number | null | undefined
): boolean =>
  serviceType === (media.mediaType === MediaType.MOVIE ? 'radarr' : 'sonarr') &&
  serverId != null &&
  serverId === variantServiceId(media, format);

const maskServiceStatus = (
  media: Media,
  status: MediaServiceStatus,
  format: VideoFormat,
  access: MediaServerAccessResult
): boolean => {
  if (!isAvailable(status.status)) return false;
  if (
    !isPrimaryDestination(media, format, status.serviceType, status.serverId) ||
    !access.visible
  ) {
    status.status = MediaStatus.UNKNOWN;
    status.seasonStatuses = null;
    return false;
  }

  if (media.mediaType !== MediaType.TV) return false;
  if (
    !access.seasonNumbers?.length ||
    !status.seasonStatuses ||
    Object.keys(status.seasonStatuses).length === 0
  ) {
    status.status = MediaStatus.UNKNOWN;
    status.seasonStatuses = null;
    return true;
  }

  const visibleSeasons = new Set(access.seasonNumbers);
  const seasonStatuses = { ...(status.seasonStatuses ?? {}) };
  let hiddenAvailableSeason = false;
  let visibleAvailableSeason = false;
  for (const [seasonNumber, seasonStatus] of Object.entries(seasonStatuses)) {
    if (!isAvailable(seasonStatus)) continue;
    if (!visibleSeasons.has(Number(seasonNumber))) {
      seasonStatuses[Number(seasonNumber)] = MediaStatus.UNKNOWN;
      hiddenAvailableSeason = true;
    } else {
      visibleAvailableSeason = true;
    }
  }
  if (hiddenAvailableSeason) {
    status.status = visibleAvailableSeason
      ? MediaStatus.PARTIALLY_AVAILABLE
      : MediaStatus.UNKNOWN;
    status.seasonStatuses = seasonStatuses;
  }
  return hiddenAvailableSeason;
};

const maskRequestTargets = (
  media: Media,
  accessByFormat: Map<VideoFormat, MediaServerAccessResult>,
  seasonStatusByFormat: Map<VideoFormat, MediaStatus>
): void => {
  for (const request of media.requests ?? []) {
    request.serviceTargets = (request.serviceTargets ?? []).map((target) => {
      if (!isAvailable(target.status)) return target;
      const format = target.format === '4k' ? '4k' : 'standard';
      const access = accessByFormat.get(format) ?? unavailable;
      const isPrimary = isPrimaryDestination(
        media,
        format,
        target.serviceType,
        target.serverId
      );
      const maskedSeasonStatus = seasonStatusByFormat.get(format);
      return {
        ...target,
        status:
          isPrimary && access.visible
            ? media.mediaType === MediaType.TV && maskedSeasonStatus
              ? maskedSeasonStatus
              : media.mediaType === MediaType.TV &&
                  (!access.seasonNumbers || access.seasonNumbers.length === 0)
                ? MediaStatus.UNKNOWN
                : target.status
            : MediaStatus.UNKNOWN,
      };
    });
  }
};

/**
 * Project video availability through the signed-in user's linked media-server
 * identity. Only response objects are changed; the global library scan state
 * and provider records remain untouched.
 *
 * @returns whether a linked account policy was available for projection.
 */
export const applyUserMediaServerAvailability = async (
  mediaItems: Media[],
  context: MediaServerAccessContext | undefined,
  preferredFormat?: VideoAvailabilityFormat
): Promise<boolean> => {
  if (!context) return false;

  const formatOrder: VideoFormat[] = preferredFormat
    ? [preferredFormat, preferredFormat === '4k' ? 'standard' : '4k']
    : ['standard', '4k'];
  const variants = new Map<string, MediaVariant>();
  for (const format of formatOrder) {
    for (const media of mediaItems) {
      if (!isVideoMedia(media)) continue;
      if (!needsAccessCheck(media, format)) continue;
      variants.set(`${media.id}:${format}`, {
        media,
        format,
        key: `${media.id}:${format}`,
      });
    }
  }

  const checks = [...variants.values()];
  const results = new Map<string, MediaServerAccessResult>();
  const toCheck = checks.slice(0, MAX_MEDIA_AVAILABILITY_CHECKS_PER_RESPONSE);
  const checkedResults = await mapWithConcurrency(
    toCheck,
    MEDIA_AVAILABILITY_CHECK_CONCURRENCY,
    async ({ media, format, key }) => ({
      key,
      result: await resolveNativeItemAccess(context, media, format),
    })
  );
  for (const { key, result } of checkedResults) results.set(key, result);
  for (const { key } of checks.slice(
    MAX_MEDIA_AVAILABILITY_CHECKS_PER_RESPONSE
  )) {
    results.set(key, unavailable);
  }

  for (const media of mediaItems) {
    if (!isVideoMedia(media)) continue;
    const accessByFormat = new Map<VideoFormat, MediaServerAccessResult>();
    const seasonStatusByFormat = new Map<VideoFormat, MediaStatus>();
    for (const format of ['standard', '4k'] as const) {
      const access = results.get(`${media.id}:${format}`);
      if (!access) {
        // A missing result means the item was outside the bounded provider
        // check budget (or had no verifiable native identity). Preserve the
        // fail-closed contract for every availability surface, not just links.
        maskUnverifiedVariant(media, format);
        continue;
      }
      accessByFormat.set(format, access);

      const statusKey = format === '4k' ? 'status4k' : 'status';
      let hidden = false;
      if (isAvailable(media[statusKey])) {
        if (!access.visible) {
          media[statusKey] = MediaStatus.UNKNOWN;
          if (media.mediaType === MediaType.TV) {
            for (const season of media.seasons ?? []) {
              if (isAvailable(season[statusKey])) {
                season[statusKey] = MediaStatus.UNKNOWN;
              }
            }
          }
          hidden = true;
        } else if (media.mediaType === MediaType.TV) {
          hidden = maskStatusForSeasons(media, statusKey, access.seasonNumbers);
          if (hidden) seasonStatusByFormat.set(format, media[statusKey]);
        }
      }

      const statuses = (media.serviceStatuses ?? []).map((status) => {
        const copy = new MediaServiceStatus({
          ...status,
          seasonStatuses: status.seasonStatuses
            ? { ...status.seasonStatuses }
            : status.seasonStatuses,
        });
        if (copy.format === format) {
          if (maskServiceStatus(media, copy, format, access)) {
            hidden = true;
            seasonStatusByFormat.set(format, copy.status);
          }
        }
        return copy;
      });
      if (media.serviceStatuses) media.serviceStatuses = statuses;
      if (hidden || !access.visible) hideVariantLinks(media, format);
    }
    maskRequestTargets(media, accessByFormat, seasonStatusByFormat);
  }

  return true;
};

/** Intersect scanned media-server badges with episodes visible to this viewer.
 * Acquisition-only Sonarr indicators retain their separate meaning. */
export const restrictEpisodeAvailabilityForUser = async (
  availability: Map<number, EpisodeAvailabilityForEpisode>,
  media: Media | null,
  context: MediaServerAccessContext | undefined,
  seasonNumber: number
): Promise<void> => {
  if (
    !context ||
    ![...availability.values()].some((episode) =>
      episode.sources.some((source) => source.sourceType !== 'sonarr')
    )
  )
    return;
  const visible = new Map<number, { hd: boolean; fourK: boolean }>();
  const add = (episode: number, is4k: boolean | undefined) => {
    if (!Number.isSafeInteger(episode) || episode < 1 || is4k === undefined)
      return;
    const entry = visible.get(episode) ?? { hd: false, fourK: false };
    if (is4k) entry.fourK = true;
    else entry.hd = true;
    visible.set(episode, entry);
  };
  const visited = new Set<string>();
  if (media && context.credential) {
    for (const format of ['standard', '4k'] as const) {
      const id = variantNativeId(media, format, context.source);
      if (!id || visited.has(id)) continue;
      visited.add(id);
      const access = await resolveNativeItemAccess(context, media, format);
      if (!access.visible || !access.seasonNumbers?.includes(seasonNumber))
        continue;
      try {
        if (context.source === 'plex' && context.plexSettings) {
          const api = new PlexAPI({
            plexToken: context.credential,
            plexSettings: context.plexSettings,
            timeout: MEDIA_SERVER_CHECK_TIMEOUT_MS,
          });
          const episodes = await api.getAllLeavesMetadata(id);
          for (const episode of episodes) {
            if (episode.parentIndex !== seasonNumber) continue;
            for (const version of episode.Media ?? []) {
              add(
                episode.index,
                is4kResolution(`${version.width}x${version.height}`)
              );
            }
          }
        } else {
          const api = new JellyfinAPI(
            context.host,
            context.credential,
            context.deviceId,
            undefined,
            MEDIA_SERVER_CHECK_TIMEOUT_MS
          );
          api.setUserId(context.linkedIdentity);
          const episodes = await api.getUserEpisodesForAvailability(id);
          for (const episode of episodes) {
            if (
              episode.Type !== 'Episode' ||
              episode.ParentIndexNumber !== seasonNumber
            )
              continue;
            const first = episode.IndexNumber;
            const last = episode.IndexNumberEnd ?? first;
            if (
              !Number.isSafeInteger(first) ||
              !Number.isSafeInteger(last) ||
              first! < 1 ||
              last! < first! ||
              last! - first! > 1000
            )
              continue;
            let hd = false;
            let fourK = false;
            for (const version of episode.MediaSources ?? []) {
              for (const stream of version.MediaStreams ?? []) {
                if (stream.Type !== 'Video') continue;
                const is4k = is4kResolution(`${stream.Width}x${stream.Height}`);
                if (is4k === true) fourK = true;
                if (is4k === false) hd = true;
                if (hd && fourK) break;
              }
              if (hd && fourK) break;
            }
            for (let number = first!; number <= last!; number += 1) {
              if (!availability.has(number)) continue;
              if (hd) add(number, false);
              if (fourK) add(number, true);
            }
          }
        }
      } catch {
        // Provider failures cannot reveal a global scan's episode inventory.
      }
    }
  }
  for (const [number, episode] of availability) {
    const allowed = visible.get(number);
    episode.sources = episode.sources.flatMap((source) => {
      if (source.sourceType === 'sonarr') return [source];
      if (source.sourceType !== context.source || !allowed) return [];
      const projected = {
        ...source,
        hd: source.hd && allowed.hd,
        fourK: source.fourK && allowed.fourK,
      };
      return projected.hd || projected.fourK ? [projected] : [];
    });
  }
};
