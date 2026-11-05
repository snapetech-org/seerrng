import { MediaRequestStatus } from '@server/constants/media';
import type { MediaRequest } from '@server/entity/MediaRequest';

const getPendingRequestEditSnapshot = (request: MediaRequest): string =>
  JSON.stringify({
    requestedById: request.requestedBy?.id ?? null,
    serverId: request.serverId ?? null,
    profileId: request.profileId ?? null,
    metadataProfileId: request.metadataProfileId ?? null,
    rootFolder: request.rootFolder ?? null,
    languageProfileId: request.languageProfileId ?? null,
    metadataLanguageId: request.metadataLanguageId ?? null,
    sonarrSeasonType: request.sonarrSeasonType ?? null,
    bookFormat: request.bookFormat ?? null,
    monitorFutureSeasons:
      'monitorFutureSeasons' in request
        ? (request.monitorFutureSeasons ?? null)
        : null,
    serviceTargets: (request.serviceTargets ?? [])
      .map((target) => ({
        serviceType: target.serviceType,
        format: target.format,
        serverId: target.serverId,
        profileId: target.profileId ?? null,
        metadataProfileId: target.metadataProfileId ?? null,
        languageProfileId: target.languageProfileId ?? null,
        rootFolder: target.rootFolder ?? null,
        tags: [...(target.tags ?? [])].sort((left, right) => left - right),
      }))
      .sort((left, right) =>
        `${left.serviceType}:${left.format}:${left.serverId}`.localeCompare(
          `${right.serviceType}:${right.format}:${right.serverId}`
        )
      ),
    tags: [...(request.tags ?? [])].sort((left, right) => left - right),
    seasons: (request.seasons ?? [])
      .map((season) => ({
        seasonNumber: season.seasonNumber,
        episodeNumbers:
          season.episodeNumbers == null
            ? null
            : [...season.episodeNumbers].sort((left, right) => left - right),
        status: season.status,
      }))
      .sort((left, right) => left.seasonNumber - right.seasonNumber),
  });

export const hasMaterialPendingRequestEdit = (
  previousSnapshot: string,
  updatedRequest: MediaRequest
): boolean =>
  updatedRequest.status === MediaRequestStatus.PENDING &&
  getPendingRequestEditSnapshot(updatedRequest) !== previousSnapshot;

export const capturePendingRequestEditSnapshot = getPendingRequestEditSnapshot;
