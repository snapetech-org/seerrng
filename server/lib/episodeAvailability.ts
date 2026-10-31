import { MediaType } from '@server/constants/media';
import dataSource, { getRepository } from '@server/datasource';
import EpisodeAvailability from '@server/entity/EpisodeAvailability';
import Media from '@server/entity/Media';
import Season from '@server/entity/Season';
import type { SonarrSettings } from '@server/lib/settings';
import { In } from 'typeorm';

const EPISODE_AVAILABILITY_BATCH_SIZE = 100;

export interface SonarrEpisodeAvailabilityEntry {
  episodeNumber: number;
  is4k: boolean;
}

export interface SonarrSeasonAvailabilitySync {
  seasonId: number;
  episodes: SonarrEpisodeAvailabilityEntry[];
}

export const syncSonarrEpisodeAvailability = async (
  serviceId: number,
  externalSeriesId: number,
  seasons: SonarrSeasonAvailabilitySync[]
): Promise<void> => {
  const seasonIds = [
    ...new Set(seasons.map(({ seasonId }) => seasonId)),
  ].filter((seasonId) => Number.isSafeInteger(seasonId) && seasonId > 0);
  if (
    !Number.isSafeInteger(serviceId) ||
    serviceId <= 0 ||
    !Number.isSafeInteger(externalSeriesId) ||
    externalSeriesId <= 0 ||
    seasonIds.length === 0
  ) {
    return;
  }

  await dataSource.transaction(async (manager) => {
    const repository = manager.getRepository(EpisodeAvailability);
    await repository
      .createQueryBuilder()
      .delete()
      .from(EpisodeAvailability)
      .where('"serviceId" = :serviceId', { serviceId })
      .andWhere('"externalSeriesId" = :externalSeriesId', {
        externalSeriesId,
      })
      .andWhere('"seasonId" IN (:...seasonIds)', { seasonIds })
      .execute();

    const rows = new Map<string, EpisodeAvailability>();
    for (const season of seasons) {
      if (!seasonIds.includes(season.seasonId)) continue;
      for (const episode of season.episodes) {
        if (
          !Number.isSafeInteger(episode.episodeNumber) ||
          episode.episodeNumber < 0
        ) {
          continue;
        }
        const key = `${season.seasonId}:${episode.episodeNumber}:${episode.is4k}`;
        rows.set(
          key,
          repository.create({
            episodeNumber: episode.episodeNumber,
            serviceId,
            externalSeriesId,
            is4k: episode.is4k,
            season: new Season({ id: season.seasonId }),
          })
        );
      }
    }

    const entries = [...rows.values()];
    for (
      let offset = 0;
      offset < entries.length;
      offset += EPISODE_AVAILABILITY_BATCH_SIZE
    ) {
      await repository.save(
        entries.slice(offset, offset + EPISODE_AVAILABILITY_BATCH_SIZE)
      );
    }
  });
};

export const removeMissingSonarrEpisodeSeries = async (
  serviceId: number,
  presentSeriesIds: number[]
): Promise<void> => {
  if (!Number.isSafeInteger(serviceId) || serviceId <= 0) return;
  const validSeriesIds = [...new Set(presentSeriesIds)].filter(
    (seriesId) => Number.isSafeInteger(seriesId) && seriesId > 0
  );
  if (validSeriesIds.length === 0) return;

  await getRepository(EpisodeAvailability)
    .createQueryBuilder()
    .delete()
    .from(EpisodeAvailability)
    .where('"serviceId" = :serviceId', { serviceId })
    .andWhere('"externalSeriesId" NOT IN (:...validSeriesIds)', {
      validSeriesIds,
    })
    .execute();
};

export const clearSonarrEpisodeAvailabilityForSeries = async (
  serviceId: number,
  externalSeriesId: number
): Promise<void> => {
  if (
    !Number.isSafeInteger(serviceId) ||
    serviceId <= 0 ||
    !Number.isSafeInteger(externalSeriesId) ||
    externalSeriesId <= 0
  ) {
    return;
  }

  await getRepository(EpisodeAvailability)
    .createQueryBuilder()
    .delete()
    .from(EpisodeAvailability)
    .where('"serviceId" = :serviceId', { serviceId })
    .andWhere('"externalSeriesId" = :externalSeriesId', {
      externalSeriesId,
    })
    .execute();
};

export interface EpisodeAvailabilityByQuality {
  hd: boolean;
  fourK: boolean;
}

export const getSonarrEpisodeAvailability = async (
  tmdbId: number,
  seasonNumber: number,
  servers: SonarrSettings[],
  include4k: boolean
): Promise<Map<number, EpisodeAvailabilityByQuality>> => {
  const serviceIds = [
    ...new Set(
      servers
        .filter((server) => server.syncEnabled)
        .map((server) => server.id)
        .filter((id) => Number.isSafeInteger(id) && id > 0)
    ),
  ];
  if (serviceIds.length === 0) return new Map();

  const media = await getRepository(Media).findOneBy({
    tmdbId,
    mediaType: MediaType.TV,
  });
  if (!media) return new Map();

  const season = await getRepository(Season).findOne({
    where: { media: { id: media.id }, seasonNumber },
  });
  if (!season) return new Map();

  const records = await getRepository(EpisodeAvailability).find({
    where: { season: { id: season.id }, serviceId: In(serviceIds) },
  });
  const availability = new Map<number, EpisodeAvailabilityByQuality>();
  for (const record of records) {
    if (record.is4k && !include4k) continue;
    const current = availability.get(record.episodeNumber) ?? {
      hd: false,
      fourK: false,
    };
    if (record.is4k) {
      current.fourK = true;
    } else {
      current.hd = true;
    }
    availability.set(record.episodeNumber, current);
  }
  return availability;
};
