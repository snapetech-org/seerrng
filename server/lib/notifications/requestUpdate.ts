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
