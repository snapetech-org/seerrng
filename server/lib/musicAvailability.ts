import type { LidarrAlbum } from '@server/api/servarr/lidarr';
import LidarrAPI from '@server/api/servarr/lidarr';
import {
  MediaRequestStatus,
  MediaStatus,
  MediaType,
} from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import {
  MediaRequest,
  type MediaRequestServiceTarget,
} from '@server/entity/MediaRequest';
import { getExternalRuntimeConfig } from '@server/lib/externalRuntimeConfig';
import { runMediaEntityMutation } from '@server/lib/mediaMutation';
import { runWithServarrServiceSnapshot } from '@server/lib/serviceAdmission';
import logger from '@server/logger';
import { mapWithConcurrency } from '@server/utils/concurrency';

const LIDARR_AVAILABILITY_CONCURRENCY = 5;

const requestedMusicSearchTimes = new Map<string, Date>();

const getSearchKey = (serviceId: number, albumId: number): string =>
  `${serviceId}:${albumId}`;

export const getRequestedMusicSearchTime = (
  serviceId: number,
  albumId: number
): Date | undefined =>
  requestedMusicSearchTimes.get(getSearchKey(serviceId, albumId));

export const clearRequestedMusicSearchTimes = (): void => {
  requestedMusicSearchTimes.clear();
};

export const getLidarrAlbumMediaStatus = (
  album: Pick<LidarrAlbum, 'monitored' | 'statistics'>
): MediaStatus => {
  const trackFileCount = album.statistics?.trackFileCount ?? 0;
  const totalTrackCount = album.statistics?.totalTrackCount ?? 0;
  const percentOfTracks = album.statistics?.percentOfTracks ?? 0;

  if (trackFileCount <= 0) {
    return album.monitored ? MediaStatus.PROCESSING : MediaStatus.UNKNOWN;
  }

  if (
    percentOfTracks >= 100 ||
    (totalTrackCount > 0 && trackFileCount >= totalTrackCount)
  ) {
    return MediaStatus.AVAILABLE;
  }

  return MediaStatus.PARTIALLY_AVAILABLE;
};

/**
 * Refreshes only music attached to active or legacy in-flight requests.
 * The full Lidarr scanner discovers the wider catalogue; this lightweight
 * reconciliation closes the Picard staging gap without scanning the complete
 * Lidarr library every minute.
 */
export const reconcileRequestedMusicAvailability = async (
  requests: MediaRequest[]
): Promise<void> => {
  const candidates = new Map<
    number,
    { request: MediaRequest; target: MediaRequestServiceTarget }
  >();

  for (const request of requests) {
    // A request may be waiting for its media row to be linked. Only music
    // requests need this lookup, and only after the media relation exists.
    if (request.type !== MediaType.MUSIC || !request.media) {
      continue;
    }

    const media = request.media;
    const savedTarget = request.serviceTargets?.find(
      (target) => target.serviceType === 'lidarr' && target.format === 'music'
    );
    const target =
      savedTarget ??
      ((request.serverId == null || media.serviceId === request.serverId) &&
      media.serviceId != null &&
      media.externalServiceId != null
        ? {
            serviceType: 'lidarr' as const,
            format: 'music' as const,
            serverId: media.serviceId,
            externalServiceId: media.externalServiceId,
            externalServiceSlug: media.externalServiceSlug,
            profileId: request.profileId,
            metadataProfileId: request.metadataProfileId,
            rootFolder: request.rootFolder,
            tags: request.tags,
            status: media.status,
          }
        : undefined);
    if (
      ![MediaRequestStatus.APPROVED, MediaRequestStatus.COMPLETED].includes(
        request.status
      ) ||
      !target ||
      target.status === MediaStatus.AVAILABLE ||
      target.status === MediaStatus.DELETED ||
      target.externalServiceId === null ||
      target.externalServiceId === undefined
    ) {
      continue;
    }

    candidates.set(request.id, { request, target });
  }

  await mapWithConcurrency(
    [...candidates.values()],
    LIDARR_AVAILABILITY_CONCURRENCY,
    async ({ request, target }) => {
      try {
        await runMediaEntityMutation(request.media, async () => {
          const persistedRequest = Number.isSafeInteger(request.id)
            ? await getRepository(MediaRequest).findOne({
                where: { id: request.id },
              })
            : undefined;
          const currentRequest = persistedRequest ?? request;
          const current =
            persistedRequest?.media ??
            (await getRepository(Media).findOneBy({ id: request.media.id }));
          const currentTarget =
            currentRequest.serviceTargets?.find(
              (candidate) =>
                candidate.serviceType === target.serviceType &&
                candidate.format === target.format &&
                candidate.serverId === target.serverId
            ) ?? target;
          if (
            !currentRequest ||
            !current ||
            !currentTarget ||
            currentTarget.status === MediaStatus.AVAILABLE ||
            currentTarget.status === MediaStatus.DELETED ||
            currentTarget.externalServiceId === null ||
            currentTarget.externalServiceId === undefined
          ) {
            return;
          }

          const service = getExternalRuntimeConfig().lidarr.find(
            (candidate) => candidate.id === currentTarget.serverId
          );
          // An approved request must remain observable even when the operator
          // has disabled broad catalogue scanning for this Lidarr service.
          if (!service) {
            return;
          }

          const album = await runWithServarrServiceSnapshot(
            'lidarr',
            service,
            async (currentService) =>
              new LidarrAPI({
                apiKey: currentService.apiKey,
                url: LidarrAPI.buildUrl(currentService, '/api/v1'),
              }).getAlbum({ id: currentTarget.externalServiceId as number }, 0)
          );
          if (!album) {
            return;
          }

          const lastSearchTime = album.lastSearchTime
            ? new Date(album.lastSearchTime)
            : undefined;
          const searchKey = getSearchKey(
            currentTarget.serverId,
            currentTarget.externalServiceId
          );
          if (lastSearchTime && Number.isFinite(lastSearchTime.getTime())) {
            requestedMusicSearchTimes.set(searchKey, lastSearchTime);
          } else {
            requestedMusicSearchTimes.delete(searchKey);
          }

          const status = getLidarrAlbumMediaStatus(album);
          if (
            currentTarget.status !== status &&
            Number.isSafeInteger(currentRequest.id)
          ) {
            currentTarget.status = status;
            currentRequest.serviceTargets = currentRequest.serviceTargets?.map(
              (candidate) =>
                candidate.serviceType === currentTarget.serviceType &&
                candidate.format === currentTarget.format &&
                candidate.serverId === currentTarget.serverId
                  ? currentTarget
                  : candidate
            );
            await getRepository(MediaRequest).save(currentRequest);
          }
          if (
            current.serviceId === currentTarget.serverId &&
            current.externalServiceId === currentTarget.externalServiceId &&
            current.status !== status
          ) {
            current.status = status;
            await getRepository(Media).save(current);
          }
        });
      } catch (error) {
        logger.warn('Unable to reconcile requested album availability', {
          label: 'Lidarr Availability',
          mediaId: request.media.id,
          requestId: request.id,
          serviceId: target.serverId,
          externalServiceId: target.externalServiceId,
          errorMessage: error instanceof Error ? error.message : String(error),
        });
      }
    }
  );
};
