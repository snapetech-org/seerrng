import AurralAPI, {
  type AurralAlbumDownloadStatus,
  type AurralAlbumStatusResponse,
} from '@server/api/aurral';
import type { LidarrAlbum } from '@server/api/servarr/lidarr';
import LidarrAPI from '@server/api/servarr/lidarr';
import {
  MediaRequestFailureReason,
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
import { Notification } from '@server/lib/notifications';
import { runWithServarrServiceSnapshot } from '@server/lib/serviceAdmission';
import logger from '@server/logger';
import { mapWithConcurrency } from '@server/utils/concurrency';

const LIDARR_AVAILABILITY_CONCURRENCY = 5;
// One entry per polled album. Bounded so a long-running server does not keep
// every album it ever polled; the oldest entries go first.
const MAX_REQUESTED_AURRAL_ALBUM_STATUSES = 5_000;

const requestedMusicSearchTimes = new Map<string, Date>();
const requestedAurralAlbumStatuses = new Map<
  string,
  AurralAlbumDownloadStatus
>();

const rememberAurralAlbumStatus = (
  key: string,
  status: AurralAlbumDownloadStatus
): void => {
  requestedAurralAlbumStatuses.delete(key);
  requestedAurralAlbumStatuses.set(key, status);
  while (
    requestedAurralAlbumStatuses.size > MAX_REQUESTED_AURRAL_ALBUM_STATUSES
  ) {
    const oldest = requestedAurralAlbumStatuses.keys().next().value;
    if (oldest === undefined) break;
    requestedAurralAlbumStatuses.delete(oldest);
  }
};

/** Aurral album states that end a download attempt without the album. */
export const isAurralAlbumTerminalFailure = (
  status: AurralAlbumDownloadStatus | string | undefined | null
): boolean =>
  status === 'failed' || status === 'blocked' || status === 'cancelled';

/**
 * One rule for albums with some but not all tracks, shared by the Aurral
 * scanner and the request poll so the two never overwrite each other.
 */
export const isAurralPartialTrackCount = (
  ownedTracks: number | undefined,
  totalTracks: number | undefined
): boolean =>
  typeof ownedTracks === 'number' &&
  typeof totalTracks === 'number' &&
  totalTracks > 0 &&
  ownedTracks > 0 &&
  ownedTracks < totalTracks;

/**
 * Media status for an album that SeerrNG has an open request for. A poll must
 * never move such an album back to UNKNOWN (it would look unrequested and
 * could be requested again), so anything that is not available or partial
 * stays PROCESSING, the same guard the send-to-Aurral path uses.
 */
export const getRequestedAurralAlbumMediaStatus = (albumStatus: {
  status?: AurralAlbumDownloadStatus | string | null;
  counts?: AurralAlbumStatusResponse['counts'];
}): MediaStatus => {
  const mapped = getAurralAlbumMediaStatus(albumStatus.status);
  if (mapped === MediaStatus.AVAILABLE) {
    return mapped;
  }
  if (
    mapped === MediaStatus.PARTIALLY_AVAILABLE ||
    isAurralPartialTrackCount(
      albumStatus.counts?.ownedTracks,
      albumStatus.counts?.totalTracks
    )
  ) {
    return MediaStatus.PARTIALLY_AVAILABLE;
  }
  return MediaStatus.PROCESSING;
};

/**
 * THE status SeerrNG records on an Aurral album target, used by both the send
 * to Aurral and the status poll. They must agree: the poll saves the request
 * whenever the value changes, and if the send wrote a different value for the
 * same album state, the two kept rewriting each other (and the album was sent
 * again each time). An album that already has some of its songs stays partial
 * while the rest download or Aurral retries; the scanner corrects it if the
 * files go away.
 */
export const resolveAurralRequestTargetStatus = (
  albumStatus: {
    status?: AurralAlbumDownloadStatus | string | null;
    counts?: AurralAlbumStatusResponse['counts'];
  },
  previousStatus: MediaStatus | undefined | null
): MediaStatus => {
  const observed = getRequestedAurralAlbumMediaStatus(albumStatus);
  return observed === MediaStatus.PROCESSING &&
    previousStatus === MediaStatus.PARTIALLY_AVAILABLE
    ? MediaStatus.PARTIALLY_AVAILABLE
    : observed;
};

const getSearchKey = (serviceId: number, albumId: number): string =>
  `${serviceId}:${albumId}`;

export const getRequestedMusicSearchTime = (
  serviceId: number,
  albumId: number
): Date | undefined =>
  requestedMusicSearchTimes.get(getSearchKey(serviceId, albumId));

export const getRequestedAurralAlbumStatus = (
  serviceId: number,
  albumId: number
): AurralAlbumDownloadStatus | undefined =>
  requestedAurralAlbumStatuses.get(getSearchKey(serviceId, albumId));

export const clearRequestedMusicSearchTimes = (): void => {
  requestedMusicSearchTimes.clear();
  requestedAurralAlbumStatuses.clear();
};

export const getAurralAlbumMediaStatus = (
  status: AurralAlbumDownloadStatus | string | undefined | null
): MediaStatus => {
  switch (status) {
    case 'complete':
    case 'available':
      return MediaStatus.AVAILABLE;
    case 'partial':
      return MediaStatus.PARTIALLY_AVAILABLE;
    case 'downloading':
    case 'queued':
    case 'unreleased':
    case 'inLibrary':
      return MediaStatus.PROCESSING;
    case 'blocked':
    case 'cancelled':
    case 'failed':
    case 'missing':
    default:
      return MediaStatus.UNKNOWN;
  }
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
      (target) =>
        (target.serviceType === 'lidarr' || target.serviceType === 'aurral') &&
        target.format === 'music'
    );
    const inferredServiceType =
      media.musicServiceType === 'aurral'
        ? ('aurral' as const)
        : ('lidarr' as const);
    const target =
      savedTarget ??
      ((request.serverId == null || media.serviceId === request.serverId) &&
      media.serviceId != null &&
      media.externalServiceId != null
        ? {
            serviceType: inferredServiceType,
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
    // A request that failed because Aurral could not download the album keeps
    // its Aurral link, so it is still polled: if Aurral later gets the whole
    // album the request completes.
    const isFailedAurralDownload =
      request.status === MediaRequestStatus.FAILED &&
      target?.serviceType === 'aurral';
    if (
      (![MediaRequestStatus.APPROVED, MediaRequestStatus.COMPLETED].includes(
        request.status
      ) &&
        !isFailedAurralDownload) ||
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

          if (currentTarget.serviceType === 'aurral') {
            const service = getExternalRuntimeConfig().aurral.find(
              (candidate) => candidate.id === currentTarget.serverId
            );
            if (!service) {
              return;
            }

            const albumStatus = await runWithServarrServiceSnapshot(
              'aurral',
              service,
              async (currentService) =>
                new AurralAPI({
                  apiKey: currentService.apiKey,
                  url: AurralAPI.buildUrl(currentService),
                }).getAlbumStatus(currentTarget.externalServiceId as number)
            );
            const searchKey = getSearchKey(
              currentTarget.serverId,
              currentTarget.externalServiceId
            );
            rememberAurralAlbumStatus(searchKey, albumStatus.status);

            const status = resolveAurralRequestTargetStatus(
              albumStatus,
              current.status
            );
            const terminalFailure = isAurralAlbumTerminalFailure(
              albumStatus.status
            );
            // Aurral gave up: fail the request so the existing retry path
            // ("Try again") and failure notifications work. If Aurral later
            // gets the whole album anyway, the failed request completes.
            const shouldFail =
              terminalFailure &&
              currentRequest.status === MediaRequestStatus.APPROVED;
            const shouldResume =
              status === MediaStatus.AVAILABLE &&
              currentRequest.status === MediaRequestStatus.FAILED;
            const targetChanged = currentTarget.status !== status;
            if (
              (targetChanged || shouldFail || shouldResume) &&
              Number.isSafeInteger(currentRequest.id)
            ) {
              currentTarget.status = status;
              currentRequest.serviceTargets =
                currentRequest.serviceTargets?.map((candidate) =>
                  candidate.serviceType === currentTarget.serviceType &&
                  candidate.format === currentTarget.format &&
                  candidate.serverId === currentTarget.serverId
                    ? currentTarget
                    : candidate
                );
              if (shouldFail) {
                currentRequest.status = MediaRequestStatus.FAILED;
                currentRequest.failureReason =
                  MediaRequestFailureReason.DISPATCH_FAILED;
              } else if (shouldResume) {
                currentRequest.status = MediaRequestStatus.COMPLETED;
                currentRequest.failureReason = null;
              }
              await getRepository(MediaRequest).save(currentRequest);
              if (shouldFail) {
                logger.warn('Aurral could not download a requested album', {
                  label: 'Aurral Availability',
                  requestId: currentRequest.id,
                  mediaId: current.id,
                  aurralStatus: albumStatus.status,
                });
                try {
                  await MediaRequest.sendNotification(
                    currentRequest,
                    current,
                    Notification.MEDIA_FAILED
                  );
                } catch (notifyError) {
                  logger.debug('Unable to send Aurral failure notification', {
                    label: 'Aurral Availability',
                    requestId: currentRequest.id,
                    errorMessage:
                      notifyError instanceof Error
                        ? notifyError.message
                        : String(notifyError),
                  });
                }
              }
            }
            if (
              current.serviceId === currentTarget.serverId &&
              current.externalServiceId === currentTarget.externalServiceId &&
              current.status !== status
            ) {
              current.status = status;
              current.musicServiceType = 'aurral';
              await getRepository(Media).save(current);
            }
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
