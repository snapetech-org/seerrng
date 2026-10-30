import type { ChaptarrNarratorMatrix } from '@server/api/servarr/readarr';
import ReadarrAPI from '@server/api/servarr/readarr';
import { MediaType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import { titleSimilarity } from '@server/lib/resolve/match';
import type { ReadarrSettings } from '@server/lib/settings';
import { getSettings } from '@server/lib/settings';
import { parseBookshelfBookId } from '@server/utils/bookshelfCatalog';
import { readarrServiceSupportsFormat } from '@server/utils/readarrService';
import { hasExactEditionFiles } from './availability';
import {
  cardFromCatalog,
  cardFromLookup,
  type BookFormat,
  type EditionComparison,
  type LookupEdition,
} from './cards';

export * from './cards';

export interface LibraryBookService {
  server: ReadarrSettings;
  bookId: number;
  format: BookFormat;
  api: ReadarrAPI;
}

export const getLibraryBookService = async (
  mediaId: number,
  format: BookFormat
): Promise<LibraryBookService | undefined> => {
  const media = await getRepository(Media).findOne({
    where: { id: mediaId, mediaType: MediaType.BOOK },
  });
  if (!media) return undefined;
  const serviceId =
    format === 'audiobook' ? media.audiobookServiceId : media.serviceId;
  const bookId =
    format === 'audiobook'
      ? media.audiobookExternalServiceId
      : media.externalServiceId;
  if (
    serviceId === null ||
    serviceId === undefined ||
    bookId === null ||
    bookId === undefined
  ) {
    return undefined;
  }
  const servers = getSettings().readarr;
  const server = servers.find(
    (entry) => entry.id === serviceId && entry.backend !== 'bindery'
  );
  if (!server) return undefined;
  return {
    server,
    bookId,
    format,
    api: new ReadarrAPI({
      apiKey: server.apiKey,
      url: ReadarrAPI.buildUrl(server, '/api/v1'),
      mediaType: format,
    }),
  };
};

export const compareBookEditions = async (options: {
  mediaId?: number;
  bookId?: string;
  /** Internal resolved destination, never read directly from the public query. */
  serverId?: number;
  author?: string;
  format: BookFormat;
  /** Lookup term (title or ISBN) for books not yet in the library. */
  term?: string;
  foreignBookId?: string;
  /** Expected title; a lookup result must match it closely. */
  title?: string;
}): Promise<EditionComparison> => {
  if (options.mediaId) {
    const service = await getLibraryBookService(
      options.mediaId,
      options.format
    );
    if (
      service &&
      (options.serverId === undefined || service.server.id === options.serverId)
    ) {
      const catalog = await service.api.getEditionCatalog(service.bookId);
      if (catalog.length) {
        return {
          format: options.format,
          editions: catalog
            .filter(
              (edition) => edition.isEbook === (options.format === 'ebook')
            )
            .map((edition) => cardFromCatalog(edition, options.format)),
          supportsAlongside: service.api.supportsWantedEditionVariants(),
          source: 'library',
        };
      }
      const [book, editions] = await Promise.all([
        service.api.getBookIfExists(service.bookId),
        service.api.getEditions(service.bookId),
      ]);
      if (editions.length)
        return {
          format: options.format,
          supportsAlongside: false,
          source: 'library',
          editions: (editions as LookupEdition[])
            .filter(
              (edition) =>
                edition.isEbook === undefined ||
                edition.isEbook === (options.format === 'ebook')
            )
            .map((edition) => ({
              ...cardFromLookup(edition, options.format),
              owned: hasExactEditionFiles(
                edition.foreignEditionId,
                [],
                editions,
                book?.statistics?.bookFileCount ?? 0
              ),
            })),
        };
    }
  }

  const identity = options.bookId
    ? parseBookshelfBookId(options.bookId)
    : undefined;
  const servers = getSettings().readarr;
  const wantedServer = options.serverId ?? identity?.serviceId;
  const server = servers.find(
    (entry) =>
      entry.backend !== 'bindery' &&
      (wantedServer === undefined || entry.id === wantedServer) &&
      readarrServiceSupportsFormat(entry, options.format)
  );
  if (
    server &&
    options.term &&
    (options.title || identity || options.foreignBookId)
  ) {
    const api = new ReadarrAPI({
      apiKey: server.apiKey,
      url: ReadarrAPI.buildUrl(server, '/api/v1'),
      mediaType: options.format,
    });
    const results = await api.lookupBook(options.term).catch(() => []);
    const foreignBookId = options.foreignBookId ?? identity?.foreignBookId;
    const match = foreignBookId
      ? results.find((entry) => entry.foreignBookId === foreignBookId)
      : results.find(
          (entry) =>
            (!options.title ||
              titleSimilarity(options.title, entry.title) >= 0.95) &&
            (!options.author ||
              (entry.author?.authorName &&
                titleSimilarity(options.author, entry.author.authorName) >=
                  0.95))
        );
    const editions = (match?.editions ?? []) as LookupEdition[];
    if (editions.length) {
      return {
        format: options.format,
        editions: editions
          .filter(
            (edition) =>
              !!edition.foreignEditionId &&
              (edition.isEbook === undefined ||
                edition.isEbook === (options.format === 'ebook'))
          )
          .map((edition) => cardFromLookup(edition, options.format)),
        supportsAlongside: api.supportsWantedEditionVariants(),
        source: 'lookup',
      };
    }
  }

  return {
    format: options.format,
    editions: [],
    supportsAlongside: false,
    source: 'none',
  };
};

export interface NarratorSeriesPlan {
  narrator: string;
  production: 'solo' | 'full-cast' | 'unknown';
  covered: number[];
  missing: number[];
  owned: number[];
  totalBooks: number;
  complete: boolean;
  /** Volumes only available in another performance. */
  otherPerformanceOnly: number[];
}

export const planSeriesWithNarrator = (
  matrix: ChaptarrNarratorMatrix
): NarratorSeriesPlan[] =>
  matrix.narrators
    .map((narrator) => {
      const missing = new Set(narrator.missingBookIds);
      const otherPerformanceOnly = matrix.books
        .filter(
          (book) =>
            missing.has(book.bookId) &&
            book.narrators.some((entry) => entry.name !== narrator.name)
        )
        .map((book) => book.bookId);
      return {
        narrator: narrator.name,
        production: narrator.production,
        covered: narrator.coveredBookIds,
        missing: narrator.missingBookIds,
        owned: narrator.ownedBookIds,
        totalBooks: matrix.totalBooks,
        complete: narrator.missingBookIds.length === 0,
        otherPerformanceOnly,
      };
    })
    .sort(
      (a, b) =>
        b.covered.length - a.covered.length ||
        a.narrator.localeCompare(b.narrator)
    );
