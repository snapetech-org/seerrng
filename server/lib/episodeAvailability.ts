import { MediaType } from '@server/constants/media';
import { MediaServerType } from '@server/constants/server';
import dataSource, { getRepository } from '@server/datasource';
import EpisodeAvailability, {
  type EpisodeAvailabilitySourceType,
} from '@server/entity/EpisodeAvailability';
import Media from '@server/entity/Media';
import Season from '@server/entity/Season';
import type { SonarrSettings } from '@server/lib/settings';
import {
  MetadataProviderType,
  type JellyfinSettings,
  type PlexSettings,
} from '@server/lib/settings';
import { createHash } from 'node:crypto';
import { In } from 'typeorm';

const EPISODE_AVAILABILITY_BATCH_SIZE = 100;

export interface EpisodeAvailabilityEntry {
  episodeNumber: number;
  is4k: boolean;
}

export interface EpisodeAvailabilitySeasonSync {
  seasonNumber: number;
  episodes: EpisodeAvailabilityEntry[];
}

export interface SonarrSeasonAvailabilitySync {
  seasonId: number;
  episodes: EpisodeAvailabilityEntry[];
}

export interface EpisodeAvailabilitySource {
  type: EpisodeAvailabilitySourceType;
  id: string;
}

export interface EpisodeAvailabilitySourceSettings {
  sonarr: SonarrSettings[];
  plex: PlexSettings;
  jellyfin: JellyfinSettings;
  mediaServerType: MediaServerType;
}

export interface EpisodeAvailabilityByQuality {
  hd: boolean;
  fourK: boolean;
}

export interface EpisodeAvailabilitySourceStatus extends EpisodeAvailabilityByQuality {
  sourceType: EpisodeAvailabilitySourceType;
}

const episodeAvailabilitySourceOrder: EpisodeAvailabilitySourceType[] = [
  'sonarr',
  'plex',
  'jellyfin',
  'emby',
];

export interface EpisodeAvailabilityForEpisode {
  sonarrAvailability?: EpisodeAvailabilityByQuality;
  sources: EpisodeAvailabilitySourceStatus[];
}

const isPositiveSafeInteger = (value: number): boolean =>
  Number.isSafeInteger(value) && value > 0;

const sourceIdForMediaServerLibrary = (
  type: 'plex' | 'jellyfin' | 'emby',
  serverIdentity: string,
  libraryId: string
): string => {
  const identity = serverIdentity.trim();
  const id = libraryId.trim();
  if (!identity || !id) return '';

  const digest = createHash('sha256')
    .update(JSON.stringify([type, identity, id]))
    .digest('hex');
  return `${type}:${digest}`;
};

export const getSonarrEpisodeAvailabilitySourceId = (
  serviceId: number
): string =>
  Number.isSafeInteger(serviceId) && serviceId >= 0
    ? `sonarr:${serviceId}`
    : '';

export const getPlexEpisodeAvailabilitySourceId = (
  settings: PlexSettings,
  libraryId: string
): string => {
  const identity =
    settings.machineId?.trim() ||
    `${settings.useSsl ? 'https' : 'http'}://${settings.ip}:${settings.port}`;
  return sourceIdForMediaServerLibrary('plex', identity, libraryId);
};

export const getJellyfinEpisodeAvailabilitySourceId = (
  settings: JellyfinSettings,
  libraryId: string,
  type: 'jellyfin' | 'emby'
): string => {
  const identity =
    settings.serverId?.trim() ||
    `${settings.useSsl ? 'https' : 'http'}://${settings.ip}:${settings.port}${settings.urlBase ?? ''}`;
  return sourceIdForMediaServerLibrary(type, identity, libraryId);
};

export const getActiveEpisodeAvailabilitySources = (
  metadataProvider: MetadataProviderType,
  settings: EpisodeAvailabilitySourceSettings
): EpisodeAvailabilitySource[] => {
  const sources: EpisodeAvailabilitySource[] = [];

  if (metadataProvider === MetadataProviderType.TVDB) {
    for (const server of settings.sonarr) {
      if (!server.syncEnabled) continue;
      const id = getSonarrEpisodeAvailabilitySourceId(server.id);
      if (id) sources.push({ type: 'sonarr', id });
    }
  }

  if (settings.mediaServerType === MediaServerType.PLEX) {
    for (const library of settings.plex.libraries) {
      if (
        !library.enabled ||
        library.type !== 'show' ||
        library.episodeOrderProvider !== metadataProvider
      ) {
        continue;
      }
      const id = getPlexEpisodeAvailabilitySourceId(settings.plex, library.id);
      if (id) sources.push({ type: 'plex', id });
    }
  } else if (
    settings.mediaServerType === MediaServerType.JELLYFIN ||
    settings.mediaServerType === MediaServerType.EMBY
  ) {
    const type =
      settings.mediaServerType === MediaServerType.EMBY ? 'emby' : 'jellyfin';
    for (const library of settings.jellyfin.libraries) {
      if (
        !library.enabled ||
        library.type !== 'show' ||
        library.episodeOrderProvider !== metadataProvider
      ) {
        continue;
      }
      const id = getJellyfinEpisodeAvailabilitySourceId(
        settings.jellyfin,
        library.id,
        type
      );
      if (id) sources.push({ type, id });
    }
  }

  return sources;
};

export const syncEpisodeAvailabilityForSeries = async ({
  source,
  metadataProvider,
  externalSeriesId,
  tmdbId,
  seasons,
}: {
  source: EpisodeAvailabilitySource;
  metadataProvider: MetadataProviderType;
  externalSeriesId: number;
  tmdbId: number;
  seasons: EpisodeAvailabilitySeasonSync[];
}): Promise<void> => {
  if (
    !source.id ||
    !isPositiveSafeInteger(externalSeriesId) ||
    !isPositiveSafeInteger(tmdbId) ||
    !Array.isArray(seasons) ||
    seasons.length === 0 ||
    new Set(seasons.map(({ seasonNumber }) => seasonNumber)).size !==
      seasons.length ||
    seasons.some(
      (season) =>
        !Number.isSafeInteger(season.seasonNumber) ||
        season.seasonNumber < 0 ||
        !Array.isArray(season.episodes) ||
        season.episodes.some(
          (episode) =>
            !Number.isSafeInteger(episode.episodeNumber) ||
            episode.episodeNumber < 0 ||
            typeof episode.is4k !== 'boolean'
        )
    )
  ) {
    return;
  }

  await dataSource.transaction(async (manager) => {
    const media = await manager.getRepository(Media).findOneBy({
      tmdbId,
      mediaType: MediaType.TV,
    });
    if (!media) return;

    const seasonRepository = manager.getRepository(Season);
    const storedSeasons = await seasonRepository.find({
      where: { media: { id: media.id } },
      select: { id: true, seasonNumber: true },
    });
    const seasonIds = new Map(
      storedSeasons.map((season) => [season.seasonNumber, season.id])
    );
    if (seasons.some(({ seasonNumber }) => !seasonIds.has(seasonNumber))) {
      return;
    }

    const repository = manager.getRepository(EpisodeAvailability);
    await repository
      .createQueryBuilder()
      .delete()
      .from(EpisodeAvailability)
      .where('"sourceType" = :sourceType', { sourceType: source.type })
      .andWhere('"sourceId" = :sourceId', { sourceId: source.id })
      .andWhere('"metadataProvider" = :metadataProvider', {
        metadataProvider,
      })
      .andWhere('"externalSeriesId" = :externalSeriesId', {
        externalSeriesId,
      })
      .execute();

    const rows = new Map<string, EpisodeAvailability>();
    for (const season of seasons) {
      const seasonId = seasonIds.get(season.seasonNumber);
      if (!seasonId) continue;

      for (const episode of season.episodes) {
        const key = `${seasonId}:${episode.episodeNumber}:${episode.is4k}`;
        rows.set(
          key,
          repository.create({
            episodeNumber: episode.episodeNumber,
            sourceType: source.type,
            sourceId: source.id,
            metadataProvider,
            externalSeriesId,
            is4k: episode.is4k,
            season: new Season({ id: seasonId }),
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

export const syncSonarrEpisodeAvailability = async (
  serviceId: number,
  externalSeriesId: number,
  seasons: SonarrSeasonAvailabilitySync[]
): Promise<void> => {
  if (
    !Number.isSafeInteger(serviceId) ||
    serviceId < 0 ||
    !isPositiveSafeInteger(externalSeriesId) ||
    !Array.isArray(seasons) ||
    seasons.length === 0 ||
    seasons.some(
      (season) =>
        !isPositiveSafeInteger(season.seasonId) ||
        !Array.isArray(season.episodes)
    )
  ) {
    return;
  }

  const seasonIds = [...new Set(seasons.map(({ seasonId }) => seasonId))];
  const storedSeasons = await getRepository(Season).find({
    where: { id: In(seasonIds) },
    relations: { media: true },
  });
  if (storedSeasons.length !== seasonIds.length) return;

  const seasonMedia = await Promise.all(
    storedSeasons.map(({ media }) => media)
  );
  const media = seasonMedia[0];
  if (
    !media ||
    media.mediaType !== MediaType.TV ||
    seasonMedia.some((season) => season.id !== media.id)
  ) {
    return;
  }

  const seasonNumbers = new Map(
    storedSeasons.map((season) => [season.id, season.seasonNumber])
  );
  await syncEpisodeAvailabilityForSeries({
    source: {
      type: 'sonarr',
      id: getSonarrEpisodeAvailabilitySourceId(serviceId),
    },
    metadataProvider: MetadataProviderType.TVDB,
    externalSeriesId,
    tmdbId: media.tmdbId,
    seasons: seasons.map(({ seasonId, episodes }) => ({
      seasonNumber: seasonNumbers.get(seasonId) ?? -1,
      episodes,
    })),
  });
};

export const removeMissingEpisodeAvailabilitySeries = async (
  source: EpisodeAvailabilitySource,
  metadataProvider: MetadataProviderType,
  presentSeriesIds: number[],
  completeInventory: boolean
): Promise<void> => {
  if (
    !completeInventory ||
    !source.id ||
    !Array.isArray(presentSeriesIds) ||
    presentSeriesIds.some((id) => !isPositiveSafeInteger(id)) ||
    new Set(presentSeriesIds).size !== presentSeriesIds.length
  )
    return;
  const validSeriesIds = presentSeriesIds;

  const query = getRepository(EpisodeAvailability)
    .createQueryBuilder()
    .delete()
    .from(EpisodeAvailability)
    .where('"sourceType" = :sourceType', { sourceType: source.type })
    .andWhere('"sourceId" = :sourceId', { sourceId: source.id })
    .andWhere('"metadataProvider" = :metadataProvider', {
      metadataProvider,
    });

  if (validSeriesIds.length > 0) {
    query.andWhere('"externalSeriesId" NOT IN (:...validSeriesIds)', {
      validSeriesIds,
    });
  }

  await query.execute();
};

export const removeMissingSonarrEpisodeSeries = async (
  serviceId: number,
  presentSeriesIds: number[]
): Promise<void> => {
  const sourceId = getSonarrEpisodeAvailabilitySourceId(serviceId);
  if (!sourceId) return;

  await removeMissingEpisodeAvailabilitySeries(
    { type: 'sonarr', id: sourceId },
    MetadataProviderType.TVDB,
    presentSeriesIds,
    true
  );
};

export const clearEpisodeAvailabilityForSource = async (
  source: EpisodeAvailabilitySource
): Promise<void> => {
  if (!source.id) return;

  await getRepository(EpisodeAvailability)
    .createQueryBuilder()
    .delete()
    .from(EpisodeAvailability)
    .where('"sourceType" = :sourceType', { sourceType: source.type })
    .andWhere('"sourceId" = :sourceId', { sourceId: source.id })
    .execute();
};

export const clearSonarrEpisodeAvailabilityForService = async (
  serviceId: number
): Promise<void> => {
  const sourceId = getSonarrEpisodeAvailabilitySourceId(serviceId);
  if (!sourceId) return;

  await clearEpisodeAvailabilityForSource({ type: 'sonarr', id: sourceId });
};

export const clearSonarrEpisodeAvailabilityForSeries = async (
  serviceId: number,
  externalSeriesId: number
): Promise<void> => {
  const sourceId = getSonarrEpisodeAvailabilitySourceId(serviceId);
  if (!sourceId || !isPositiveSafeInteger(externalSeriesId)) return;

  await getRepository(EpisodeAvailability)
    .createQueryBuilder()
    .delete()
    .from(EpisodeAvailability)
    .where('"sourceType" = :sourceType', { sourceType: 'sonarr' })
    .andWhere('"sourceId" = :sourceId', { sourceId })
    .andWhere('"metadataProvider" = :metadataProvider', {
      metadataProvider: MetadataProviderType.TVDB,
    })
    .andWhere('"externalSeriesId" = :externalSeriesId', {
      externalSeriesId,
    })
    .execute();
};

export const getEpisodeAvailability = async (
  tmdbId: number,
  seasonNumber: number,
  metadataProvider: MetadataProviderType,
  sources: EpisodeAvailabilitySource[],
  include4k: boolean
): Promise<Map<number, EpisodeAvailabilityForEpisode>> => {
  const sourceIds = [...new Set(sources.map(({ id }) => id).filter(Boolean))];
  if (sourceIds.length === 0) return new Map();

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
    where: {
      season: { id: season.id },
      sourceId: In(sourceIds),
      sourceType: In([...new Set(sources.map(({ type }) => type))]),
      metadataProvider,
    },
  });
  const availability = new Map<number, EpisodeAvailabilityForEpisode>();

  for (const record of records) {
    if (record.is4k && !include4k) continue;

    const current = availability.get(record.episodeNumber) ?? { sources: [] };
    let sourceStatus = current.sources.find(
      ({ sourceType }) => sourceType === record.sourceType
    );
    if (!sourceStatus) {
      sourceStatus = { sourceType: record.sourceType, hd: false, fourK: false };
      current.sources.push(sourceStatus);
    }
    if (record.is4k) sourceStatus.fourK = true;
    else sourceStatus.hd = true;
    if (record.sourceType === 'sonarr') {
      current.sonarrAvailability = {
        hd: sourceStatus.hd,
        fourK: sourceStatus.fourK,
      };
    }
    availability.set(record.episodeNumber, current);
  }

  for (const episode of availability.values()) {
    episode.sources.sort(
      (left, right) =>
        episodeAvailabilitySourceOrder.indexOf(left.sourceType) -
        episodeAvailabilitySourceOrder.indexOf(right.sourceType)
    );
  }

  return availability;
};
