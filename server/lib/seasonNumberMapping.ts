import { MediaType } from '@server/constants/media';
import Media from '@server/entity/Media';
import MediaIdentifier, {
  MediaIdentifierProvider,
} from '@server/entity/MediaIdentifier';
import MediaIdentifierSeasonMapping from '@server/entity/MediaIdentifierSeasonMapping';
import type { EntityManager } from 'typeorm';

export type SeasonNumberMapping = {
  seasonNumber: number;
  externalSeasonNumber: number;
};

export const externalSeasonNumberFor = (
  seasonNumber: number,
  mappings: readonly SeasonNumberMapping[] = []
): number =>
  mappings.find((mapping) => mapping.seasonNumber === seasonNumber)
    ?.externalSeasonNumber ?? seasonNumber;

export const internalSeasonNumberFor = (
  externalSeasonNumber: number,
  mappings: readonly SeasonNumberMapping[] = []
): number =>
  mappings.find(
    (mapping) => mapping.externalSeasonNumber === externalSeasonNumber
  )?.seasonNumber ?? externalSeasonNumber;

export class DuplicateExternalSeasonMappingError extends Error {}

export const getSeasonMappingsForTvdbIdentifier = (
  media: Pick<Media, 'identifiers'>,
  tvdbId: number,
  sonarrServerId: number,
  is4k: boolean
): SeasonNumberMapping[] => {
  const identifier = media.identifiers?.find(
    (candidate) =>
      candidate.provider === MediaIdentifierProvider.TVDB &&
      candidate.value === String(tvdbId)
  );
  return (
    identifier?.seasonMappings
      ?.filter(
        (mapping) =>
          mapping.sonarrServerId === sonarrServerId && mapping.is4k === is4k
      )
      .map(({ seasonNumber, externalSeasonNumber }) => ({
        seasonNumber,
        externalSeasonNumber,
      })) ?? []
  );
};

export const findMediaForTvdbId = async (
  manager: EntityManager,
  tvdbId: number
): Promise<Media[]> => {
  const mediaRepository = manager.getRepository(Media);
  const identifierRepository = manager.getRepository(MediaIdentifier);
  const relations = {
    seasons: true,
    identifiers: { seasonMappings: true },
  } as const;
  const [canonicalMedia, matchingIdentifiers] = await Promise.all([
    mediaRepository.find({
      where: { mediaType: MediaType.TV, tvdbId },
      relations,
    }),
    identifierRepository.find({
      where: {
        provider: MediaIdentifierProvider.TVDB,
        value: String(tvdbId),
        media: { mediaType: MediaType.TV },
      },
      relations: { media: relations },
    }),
  ]);
  const uniqueMedia = new Map<number, Media>();
  for (const media of canonicalMedia) {
    uniqueMedia.set(media.id, media);
  }
  for (const identifier of matchingIdentifiers) {
    if (identifier.media) {
      uniqueMedia.set(identifier.media.id, identifier.media);
    }
  }
  return [...uniqueMedia.values()].sort((left, right) => left.id - right.id);
};

export const findTvdbSeasonMappings = async (
  manager: EntityManager,
  mediaId: number,
  tvdbId: number,
  sonarrServerId: number,
  is4k: boolean
): Promise<SeasonNumberMapping[]> => {
  const identifier = await manager.getRepository(MediaIdentifier).findOne({
    where: {
      media: { id: mediaId },
      provider: MediaIdentifierProvider.TVDB,
      value: String(tvdbId),
    },
    relations: { seasonMappings: true },
  });
  return (
    identifier?.seasonMappings
      ?.filter(
        (mapping) =>
          mapping.sonarrServerId === sonarrServerId && mapping.is4k === is4k
      )
      .map(({ seasonNumber, externalSeasonNumber }) => ({
        seasonNumber,
        externalSeasonNumber,
      })) ?? []
  );
};

export const hasTvdbIdentifierForMedia = async (
  manager: EntityManager,
  mediaId: number,
  tvdbId: number
): Promise<boolean> =>
  manager.getRepository(MediaIdentifier).exists({
    where: {
      media: { id: mediaId },
      provider: MediaIdentifierProvider.TVDB,
      value: String(tvdbId),
    },
  });

export const persistTvdbSeasonMappings = async (
  manager: EntityManager,
  mediaId: number,
  tvdbId: number,
  sonarrServerId: number,
  is4k: boolean,
  mappings: readonly SeasonNumberMapping[]
): Promise<void> => {
  const mediaRepository = manager.getRepository(Media);
  const identifierRepository = manager.getRepository(MediaIdentifier);
  const mappingRepository = manager.getRepository(MediaIdentifierSeasonMapping);
  const media = await mediaRepository.findOne({
    where: { id: mediaId, mediaType: MediaType.TV },
  });
  if (!media) {
    throw new Error('TV media was not found while saving season mappings.');
  }

  let identifier = await identifierRepository.findOne({
    where: {
      media: { id: media.id },
      provider: MediaIdentifierProvider.TVDB,
      value: String(tvdbId),
    },
  });
  if (!identifier) {
    identifier = await identifierRepository.save(
      new MediaIdentifier({
        media,
        provider: MediaIdentifierProvider.TVDB,
        value: String(tvdbId),
        canonical: false,
      })
    );
  }

  const existingMappings = await mappingRepository.find({
    where: {
      mediaIdentifier: { id: identifier.id },
      sonarrServerId,
      is4k,
    },
  });
  const mergedMappings = new Map<number, SeasonNumberMapping>(
    existingMappings.map((mapping) => [
      mapping.seasonNumber,
      {
        seasonNumber: mapping.seasonNumber,
        externalSeasonNumber: mapping.externalSeasonNumber,
      },
    ])
  );
  mappings.forEach((mapping) =>
    mergedMappings.set(mapping.seasonNumber, mapping)
  );

  const externalNumbers = new Set<number>();
  for (const mapping of mergedMappings.values()) {
    if (externalNumbers.has(mapping.externalSeasonNumber)) {
      throw new DuplicateExternalSeasonMappingError(
        'Each TVDB season can be mapped to only one TMDB season.'
      );
    }
    externalNumbers.add(mapping.externalSeasonNumber);
  }

  await mappingRepository.delete({
    mediaIdentifier: { id: identifier.id },
    sonarrServerId,
    is4k,
  });
  if (mergedMappings.size > 0) {
    await mappingRepository.save(
      [...mergedMappings.values()].map(
        ({ seasonNumber, externalSeasonNumber }) =>
          new MediaIdentifierSeasonMapping({
            mediaIdentifier: identifier!,
            sonarrServerId,
            is4k,
            seasonNumber,
            externalSeasonNumber,
          })
      )
    );
  }
};
