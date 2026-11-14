import { getRepository } from '@server/datasource';
import { MediaSearchMetadata } from '@server/entity/MediaSearchMetadata';
import logger from '@server/logger';
import type { EntityManager } from 'typeorm';

export type MediaSearchMetadataInput = Partial<
  Pick<
    MediaSearchMetadata,
    | 'title'
    | 'overview'
    | 'posterPath'
    | 'alternateTitle'
    | 'releaseDate'
    | 'genres'
    | 'runtime'
    | 'creator'
    | 'director'
    | 'writer'
    | 'studio'
    | 'network'
    | 'artist'
    | 'albumType'
    | 'author'
    | 'publisher'
    | 'format'
    | 'provider'
    | 'externalIds'
    | 'videoMetadataExpiresAt'
  >
>;

const MAX_FIELD_LENGTH = 4_000;

const clean = (value: unknown): string | undefined => {
  if (Array.isArray(value)) {
    return clean(value.filter(Boolean).join(', '));
  }
  if (typeof value !== 'string' && typeof value !== 'number') {
    return undefined;
  }
  const normalized = String(value).replace(/\s+/g, ' ').trim();
  return normalized ? normalized.slice(0, MAX_FIELD_LENGTH) : undefined;
};

const searchableFields: (keyof MediaSearchMetadataInput)[] = [
  'title',
  'alternateTitle',
  'releaseDate',
  'genres',
  'runtime',
  'creator',
  'director',
  'writer',
  'studio',
  'network',
  'artist',
  'albumType',
  'author',
  'publisher',
  'format',
  'provider',
  'externalIds',
];

export const upsertMediaSearchMetadata = async (
  mediaId: number | undefined,
  input: MediaSearchMetadataInput,
  manager?: EntityManager
): Promise<void> => {
  if (!mediaId) {
    return;
  }

  try {
    const repository =
      manager?.getRepository(MediaSearchMetadata) ??
      getRepository(MediaSearchMetadata);
    const existing = await repository.findOne({ where: { mediaId } });
    const next = existing ?? repository.create({ mediaId, searchText: '' });

    const overview = clean(input.overview);
    if (overview) {
      next.overview = overview;
    }

    const posterPath = clean(input.posterPath);
    if (posterPath) {
      next.posterPath = posterPath;
    }

    for (const field of searchableFields) {
      const value = clean(input[field]);
      if (value) {
        Object.assign(next, { [field]: value });
      }
    }

    if (input.videoMetadataExpiresAt instanceof Date) {
      next.videoMetadataExpiresAt = input.videoMetadataExpiresAt;
    }

    next.searchText = searchableFields
      .map((field) => next[field])
      .filter((value): value is string => typeof value === 'string' && !!value)
      .join(' ')
      .toLocaleLowerCase();

    await repository.save(next);
  } catch (error) {
    logger.warn('Unable to refresh searchable media metadata', {
      label: 'Metadata Search',
      mediaId,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
  }
};

/**
 * Stores the title and primary author of a Bookshelf-sourced book so request
 * notifications can name it. Existing values are never replaced, so metadata
 * written from Open Library or another provider wins.
 */
export const upsertMissingBookMetadata = async (
  mediaId: number | undefined,
  input: { title?: string; author?: string; externalIds?: string }
): Promise<void> => {
  if (!mediaId) {
    return;
  }

  try {
    const existing = await getRepository(MediaSearchMetadata).findOne({
      where: { mediaId },
    });
    const hasTitle = !!existing?.title?.trim();
    const hasAuthor = !!existing?.author?.trim();
    const title = hasTitle ? undefined : clean(input.title);
    const author = hasAuthor ? undefined : clean(input.author);
    if (!title && !author) {
      return;
    }

    await upsertMediaSearchMetadata(mediaId, {
      title,
      author,
      provider: hasTitle ? undefined : 'Bookshelf catalog',
      externalIds: hasTitle ? undefined : input.externalIds,
    });
  } catch (error) {
    logger.warn('Unable to refresh searchable media metadata', {
      label: 'Metadata Search',
      mediaId,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
  }
};
