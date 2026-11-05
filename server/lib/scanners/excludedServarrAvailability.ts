import { MediaStatus, MediaType } from '@server/constants/media';
import dataSource from '@server/datasource';
import Media from '@server/entity/Media';
import MediaServiceStatus, {
  type VideoRequestServiceType,
} from '@server/entity/MediaServiceStatus';
import { In } from 'typeorm';

export type ExcludedServarrAvailabilitySource = {
  mediaId: number;
  serverId: number;
  format: 'standard' | '4k';
};

const libraryAvailabilityStatuses = new Set([
  MediaStatus.AVAILABLE,
  MediaStatus.PARTIALLY_AVAILABLE,
  MediaStatus.PROCESSING,
]);

const reportedAvailabilityStatuses = new Set([
  MediaStatus.AVAILABLE,
  MediaStatus.PARTIALLY_AVAILABLE,
]);

export const reconcileExcludedServarrAvailability = async (
  serviceType: Extract<VideoRequestServiceType, 'radarr' | 'sonarr'>,
  sources: readonly ExcludedServarrAvailabilitySource[]
): Promise<void> => {
  const sourcesByMedia = new Map<number, Map<'standard' | '4k', Set<number>>>();
  const statusUpdates = new Map<
    string,
    { serverId: number; format: 'standard' | '4k'; mediaIds: Set<number> }
  >();

  for (const source of sources) {
    const formats = sourcesByMedia.get(source.mediaId) ?? new Map();
    const serverIds = formats.get(source.format) ?? new Set<number>();
    serverIds.add(source.serverId);
    formats.set(source.format, serverIds);
    sourcesByMedia.set(source.mediaId, formats);

    const key = `${source.serverId}:${source.format}`;
    const update = statusUpdates.get(key) ?? {
      serverId: source.serverId,
      format: source.format,
      mediaIds: new Set<number>(),
    };
    update.mediaIds.add(source.mediaId);
    statusUpdates.set(key, update);
  }

  if (sourcesByMedia.size === 0) {
    return;
  }

  await dataSource.transaction(async (manager) => {
    const serviceStatusRepository = manager.getRepository(MediaServiceStatus);
    for (const { serverId, format, mediaIds } of statusUpdates.values()) {
      await serviceStatusRepository.update(
        {
          mediaId: In([...mediaIds]),
          serviceType,
          serverId,
          format,
        },
        {
          status: MediaStatus.UNKNOWN,
          externalServiceId: null,
          externalServiceSlug: null,
          seasonStatuses: null,
        }
      );
    }

    const mediaRepository = manager.getRepository(Media);
    const mediaItems = await mediaRepository.find({
      where: { id: In([...sourcesByMedia.keys()]) },
      relations: { seasons: true, serviceStatuses: true },
    });

    for (const media of mediaItems) {
      let changed = false;
      const sourcesByFormat = sourcesByMedia.get(media.id);
      if (!sourcesByFormat) continue;

      for (const format of ['standard', '4k'] as const) {
        const excludedServerIds = sourcesByFormat.get(format);
        if (!excludedServerIds?.size) continue;

        const is4k = format === '4k';
        const serviceIdField = is4k ? 'serviceId4k' : 'serviceId';
        const currentServiceId = media[serviceIdField];
        if (
          currentServiceId == null ||
          !excludedServerIds.has(currentServiceId)
        ) {
          continue;
        }

        const formatStatuses = (media.serviceStatuses ?? []).filter(
          (status) =>
            status.serviceType === serviceType &&
            status.format === format &&
            !excludedServerIds.has(status.serverId)
        );
        const alternativeAvailability = formatStatuses
          .filter((status) => reportedAvailabilityStatuses.has(status.status))
          .sort((left, right) => {
            const rank = (status: MediaStatus): number =>
              status === MediaStatus.AVAILABLE ? 0 : 1;
            return rank(left.status) - rank(right.status);
          })[0];
        const hasMediaServerCopy = is4k
          ? Boolean(media.ratingKey4k || media.jellyfinMediaId4k)
          : Boolean(media.ratingKey || media.jellyfinMediaId);
        const statusField = is4k ? 'status4k' : 'status';

        if (!hasMediaServerCopy) {
          if (alternativeAvailability) {
            if (
              media[statusField] !== MediaStatus.BLOCKLISTED &&
              media[statusField] !== MediaStatus.DELETED &&
              media[statusField] !== MediaStatus.PENDING
            ) {
              media[statusField] = alternativeAvailability.status;
            }
          } else if (libraryAvailabilityStatuses.has(media[statusField])) {
            media[statusField] = MediaStatus.UNKNOWN;
          }

          if (media.mediaType === MediaType.TV) {
            for (const season of media.seasons ?? []) {
              if (
                season[statusField] === MediaStatus.PENDING ||
                season[statusField] === MediaStatus.BLOCKLISTED ||
                season[statusField] === MediaStatus.DELETED
              ) {
                continue;
              }
              const nextStatus = alternativeAvailability
                ? (alternativeAvailability.seasonStatuses?.[
                    season.seasonNumber
                  ] ?? MediaStatus.UNKNOWN)
                : MediaStatus.UNKNOWN;
              if (season[statusField] !== nextStatus) {
                season[statusField] = nextStatus;
              }
            }
          }
        }

        if (alternativeAvailability) {
          const externalServiceIdField = is4k
            ? 'externalServiceId4k'
            : 'externalServiceId';
          const externalServiceSlugField = is4k
            ? 'externalServiceSlug4k'
            : 'externalServiceSlug';
          media[serviceIdField] = alternativeAvailability.serverId;
          media[externalServiceIdField] =
            alternativeAvailability.externalServiceId ?? null;
          media[externalServiceSlugField] =
            alternativeAvailability.externalServiceSlug ?? null;
        } else {
          media.resetServiceDataForResolution(is4k, true);
        }
        changed = true;
      }

      if (changed) {
        await mediaRepository.save(media);
      }
    }
  });
};
