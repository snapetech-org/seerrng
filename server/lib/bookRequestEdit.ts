import OpenLibraryAPI from '@server/api/openlibrary';
import { MediaStatus, MediaType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import MediaIdentifier, {
  MediaIdentifierProvider,
} from '@server/entity/MediaIdentifier';
import {
  MediaRequest,
  ServiceConfigurationError,
  type MediaRequestServiceTarget,
} from '@server/entity/MediaRequest';
import type { MediaRequestBody } from '@server/interfaces/api/requestInterfaces';
import { compareBookEditions } from '@server/lib/editionCompare';
import { normalizeOpenLibraryAuthorId } from '@server/lib/externalIds';
import { getExternalRuntimeConfig } from '@server/lib/externalRuntimeConfig';
import { validateExternalServiceConfiguration } from '@server/lib/requestTransition';
import { isProviderBookEdition } from '@server/utils/bookEdition';
import { parseBookshelfBookId } from '@server/utils/bookshelfCatalog';
import { readarrServiceSupportsFormat } from '@server/utils/readarrService';

export class BookRequestEditConflictError extends Error {
  readonly status = 409;
}

/** Plan first: failed destination/edition validation must leave the saved request intact. */
export const planBookRequestEdit = async (
  request: MediaRequest,
  body: Partial<MediaRequestBody>
) => {
  const format = body.format ?? request.bookFormat ?? 'ebook';
  const exactEdition = isProviderBookEdition(request.preferredEditionId);
  for (const field of [
    'preferredEditionId',
    'preferredIsbn13',
    'editionPolicy',
    'variantKey',
  ] as const) {
    if (body[field] !== undefined && body[field] !== request[field]) {
      throw new BookRequestEditConflictError(
        'Cancel this request and create a new one to change its edition selection.'
      );
    }
  }
  if (exactEdition && format !== request.bookFormat) {
    throw new BookRequestEditConflictError(
      'An exact edition cannot change book format. Create a new request for the other format.'
    );
  }

  const serverId = body.serverId ?? request.serverId;
  validateExternalServiceConfiguration(MediaType.BOOK, serverId, format);
  const servers = getExternalRuntimeConfig().readarr;
  const selected = servers.find((server) => server.id === serverId);
  const stored =
    request.serviceTargets?.filter(
      (target) => target.serviceType === 'readarr'
    ) ?? [];
  // Creation can omit a format already covered by another request. A partial edit
  // must not silently add that destination back to this request.
  const formats: ('ebook' | 'audiobook')[] =
    format === 'both'
      ? request.bookFormat === 'both' && stored.length
        ? stored.flatMap((target) =>
            target.format === 'ebook' || target.format === 'audiobook'
              ? [target.format]
              : []
          )
        : ['ebook', 'audiobook']
      : [format];

  const serviceTargets: MediaRequestServiceTarget[] = formats.map(
    (targetFormat) => {
      const previous = stored.find((target) => target.format === targetFormat);
      const server =
        body.serverId === undefined && previous
          ? servers.find((entry) => entry.id === previous.serverId)
          : selected && readarrServiceSupportsFormat(selected, targetFormat)
            ? selected
            : servers.find(
                (entry) =>
                  entry.isDefault &&
                  readarrServiceSupportsFormat(entry, targetFormat)
              );
      if (!server || !readarrServiceSupportsFormat(server, targetFormat)) {
        throw new ServiceConfigurationError(
          `No valid ${targetFormat} Bookshelf destination is configured for this request.`
        );
      }
      const sameDestination = previous
        ? previous.serverId === server.id
        : request.serverId === server.id &&
          (request.bookFormat ?? 'ebook') === targetFormat;
      const saved = previous ?? request;
      const overrides = serverId == null || server.id === serverId;
      return {
        serviceType: 'readarr',
        format: targetFormat,
        serverId: server.id,
        profileId:
          overrides && body.profileId !== undefined
            ? body.profileId
            : sameDestination
              ? (saved.profileId ?? server.activeProfileId)
              : server.activeProfileId,
        metadataProfileId:
          overrides && body.metadataProfileId !== undefined
            ? body.metadataProfileId
            : sameDestination
              ? (saved.metadataProfileId ?? null)
              : (server.activeMetadataProfileId ?? null),
        rootFolder:
          overrides && body.rootFolder !== undefined
            ? body.rootFolder
            : sameDestination
              ? (saved.rootFolder ?? server.activeDirectory)
              : server.activeDirectory,
        tags:
          overrides && body.tags !== undefined
            ? body.tags
            : sameDestination
              ? (saved.tags ?? null)
              : (server.tags ?? null),
        status:
          sameDestination && previous ? previous.status : MediaStatus.PENDING,
        ...(sameDestination && previous
          ? {
              externalServiceId: previous.externalServiceId,
              externalServiceSlug: previous.externalServiceSlug,
            }
          : {}),
      };
    }
  );
  const primary =
    serviceTargets.find((target) => target.serverId === serverId) ??
    serviceTargets[0];
  if (!primary)
    throw new ServiceConfigurationError(
      'This request has no book destinations.'
    );

  if (exactEdition) {
    const identifiers = await getRepository(MediaIdentifier).find({
      where: { media: { id: request.media.id } },
    });
    const bookId =
      identifiers.find(
        (entry) => entry.provider === MediaIdentifierProvider.BOOKSHELF
      )?.value ??
      identifiers.find(
        (entry) => entry.provider === MediaIdentifierProvider.OPENLIBRARY
      )?.value;
    const identity = bookId ? parseBookshelfBookId(bookId) : undefined;
    const openLibrary = new OpenLibraryAPI();
    const work =
      bookId && !identity ? await openLibrary.getWork(bookId) : undefined;
    const authorKey = work?.authors?.[0]?.author?.key;
    const author = authorKey
      ? (await openLibrary.getAuthor(normalizeOpenLibraryAuthorId(authorKey)))
          ?.name
      : undefined;
    const comparison = await compareBookEditions({
      bookId,
      mediaId: request.media.id,
      serverId: primary.serverId,
      format: format === 'audiobook' ? 'audiobook' : 'ebook',
      title: work?.title,
      author,
      term:
        request.preferredIsbn13 ||
        identity?.foreignBookId ||
        work?.title ||
        bookId,
    });
    const edition = comparison.editions.find(
      (entry) => entry.id === request.preferredEditionId
    );
    if (!edition || edition.requestable === false) {
      throw new ServiceConfigurationError(
        'The selected edition could not be verified for this book and destination.'
      );
    }
    if (edition.owned)
      throw new BookRequestEditConflictError(
        'This exact edition is already available at the selected destination.'
      );
    if (
      request.editionPolicy === 'alongside' &&
      !comparison.supportsAlongside
    ) {
      throw new ServiceConfigurationError(
        'This destination cannot keep another edition alongside the existing one.'
      );
    }
  }
  return {
    bookFormat: format,
    serverId: primary.serverId,
    profileId: primary.profileId,
    metadataProfileId: primary.metadataProfileId,
    rootFolder: primary.rootFolder,
    tags: primary.tags,
    serviceTargets,
  };
};
