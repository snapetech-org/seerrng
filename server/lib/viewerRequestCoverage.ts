import {
  MediaRequestStatus,
  MediaStatus,
  MediaType,
} from '@server/constants/media';
import { getRepository } from '@server/datasource';
import type Media from '@server/entity/Media';
import { MediaRequest } from '@server/entity/MediaRequest';
import Season from '@server/entity/Season';
import type { User } from '@server/entity/User';
import logger from '@server/logger';

export interface ViewerSeasonRequestCoverage {
  seasonNumber: number;
  standard: boolean;
  fourK: boolean;
}

/**
 * This records request coverage for the authenticated viewer. It does not
 * describe access rights in the connected media server.
 */
export interface ViewerRequestCoverage {
  standard: boolean;
  fourK: boolean;
  seasons?: ViewerSeasonRequestCoverage[];
}

interface RequestCoverageRow {
  mediaId: number | string;
  is4k: boolean | number | string;
  seasonNumber: number | string | null;
  seasonStatus: number | string | null;
  episodeNumbers: string | number[] | null;
}

interface AvailableSeasonRow {
  mediaId: number | string;
  seasonNumber: number | string;
  status: number | string;
  status4k: number | string;
}

const qualifiedRequestStatuses = [
  MediaRequestStatus.APPROVED,
  MediaRequestStatus.COMPLETED,
];

const isQualifiedStatus = (value: number | string | null): boolean =>
  value !== null &&
  qualifiedRequestStatuses.includes(Number(value) as MediaRequestStatus);

const isAvailableStatus = (value: MediaStatus): boolean =>
  value === MediaStatus.AVAILABLE || value === MediaStatus.PARTIALLY_AVAILABLE;

const is4kRequest = (value: boolean | number | string): boolean =>
  value === true || value === 1 || value === '1';

/**
 * Adds per-viewer request coverage to movie and TV media without attaching
 * request entities or exposing requester identities to the response.
 */
export const attachViewerRequestCoverage = async (
  mediaItems: Media[],
  user?: User
): Promise<Media[]> => {
  if (!user) return mediaItems;

  const videoItems = mediaItems.filter(
    (media) =>
      media.mediaType === MediaType.MOVIE || media.mediaType === MediaType.TV
  );
  const tvItems = videoItems.filter(
    (media) => media.mediaType === MediaType.TV
  );
  const mediaIds = [
    ...new Set(
      videoItems
        .map((media) => media.id)
        .filter((id) => Number.isSafeInteger(id) && id > 0)
    ),
  ];
  if (!mediaIds.length) return mediaItems;
  const tvMediaIds = tvItems.map((media) => media.id);

  try {
    const [rows, availableSeasonRows] = await Promise.all([
      getRepository(MediaRequest)
        .createQueryBuilder('request')
        .innerJoin('request.media', 'requestMedia')
        .innerJoin('request.requestedBy', 'requester')
        .leftJoin('request.seasons', 'requestedSeason')
        .select('requestMedia.id', 'mediaId')
        .addSelect('request.is4k', 'is4k')
        .addSelect('requestedSeason.seasonNumber', 'seasonNumber')
        .addSelect('requestedSeason.status', 'seasonStatus')
        .addSelect('requestedSeason.episodeNumbers', 'episodeNumbers')
        .where('requestMedia.id IN (:...mediaIds)', { mediaIds })
        .andWhere('requester.id = :userId', { userId: user.id })
        .andWhere('request.status IN (:...statuses)', {
          statuses: qualifiedRequestStatuses,
        })
        .getRawMany<RequestCoverageRow>(),
      tvMediaIds.length
        ? getRepository(Season)
            .createQueryBuilder('season')
            .innerJoin('season.media', 'seasonMedia')
            .select('seasonMedia.id', 'mediaId')
            .addSelect('season.seasonNumber', 'seasonNumber')
            .addSelect('season.status', 'status')
            .addSelect('season.status4k', 'status4k')
            .where('seasonMedia.id IN (:...tvMediaIds)', { tvMediaIds })
            .getRawMany<AvailableSeasonRow>()
        : Promise.resolve([]),
    ]);

    const rowsByMediaId = new Map<number, RequestCoverageRow[]>();
    for (const row of rows) {
      const mediaId = Number(row.mediaId);
      const mediaRows = rowsByMediaId.get(mediaId) ?? [];
      mediaRows.push(row);
      rowsByMediaId.set(mediaId, mediaRows);
    }
    const availableSeasonsByMediaId = new Map<number, AvailableSeasonRow[]>();
    for (const row of availableSeasonRows) {
      const mediaId = Number(row.mediaId);
      const seasons = availableSeasonsByMediaId.get(mediaId) ?? [];
      seasons.push(row);
      availableSeasonsByMediaId.set(mediaId, seasons);
    }

    for (const media of videoItems) {
      const mediaRows = rowsByMediaId.get(media.id) ?? [];
      const ownWholeSeries = { standard: false, fourK: false };
      const ownSeasons = {
        standard: new Set<number>(),
        fourK: new Set<number>(),
      };

      for (const row of mediaRows) {
        if (
          row.seasonNumber !== null &&
          (!isQualifiedStatus(row.seasonStatus) || row.episodeNumbers !== null)
        ) {
          continue;
        }

        const quality = is4kRequest(row.is4k) ? 'fourK' : 'standard';
        if (row.seasonNumber === null) {
          ownWholeSeries[quality] = true;
        } else {
          ownSeasons[quality].add(Number(row.seasonNumber));
        }
      }

      if (media.mediaType === MediaType.MOVIE) {
        media.viewerRequestCoverage = {
          standard: ownWholeSeries.standard,
          fourK: ownWholeSeries.fourK,
        };
        continue;
      }

      const availableSeasons = availableSeasonsByMediaId.get(media.id) ?? [];
      const seasonNumbers = new Set([
        ...availableSeasons.map((season) => Number(season.seasonNumber)),
        ...ownSeasons.standard,
        ...ownSeasons.fourK,
      ]);
      const seasons = [...seasonNumbers].map((seasonNumber) => ({
        seasonNumber,
        standard:
          ownWholeSeries.standard || ownSeasons.standard.has(seasonNumber),
        fourK: ownWholeSeries.fourK || ownSeasons.fourK.has(seasonNumber),
      }));
      const getSeriesCoverage = (
        quality: 'standard' | 'fourK',
        status: MediaStatus
      ): boolean => {
        if (ownWholeSeries[quality]) return true;
        if (!isAvailableStatus(status)) return ownSeasons[quality].size > 0;

        const availableSeasonNumbers = availableSeasons
          .filter((season) =>
            isAvailableStatus(
              Number(
                season[quality === 'fourK' ? 'status4k' : 'status']
              ) as MediaStatus
            )
          )
          .map((season) => Number(season.seasonNumber));
        return (
          availableSeasonNumbers.length > 0 &&
          availableSeasonNumbers.every((seasonNumber) =>
            ownSeasons[quality].has(seasonNumber)
          )
        );
      };

      media.viewerRequestCoverage = {
        standard: getSeriesCoverage('standard', media.status),
        fourK: getSeriesCoverage('fourK', media.status4k),
        seasons,
      };
    }
  } catch (error) {
    // A personalization lookup must not make an otherwise valid catalog
    // response fail. The client falls back to the existing shared display.
    logger.warn('Could not load per-viewer video request coverage', {
      errorMessage: error instanceof Error ? error.message : String(error),
    });
  }

  return mediaItems;
};
