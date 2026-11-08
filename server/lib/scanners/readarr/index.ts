import BinderyAPI, { type BinderyBook } from '@server/api/bindery';
import type { ReadarrBook } from '@server/api/servarr/readarr';
import ReadarrAPI from '@server/api/servarr/readarr';
import { MediaStatus, MediaType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import { MediaIdentifierProvider } from '@server/entity/MediaIdentifier';
import {
  getBookAvailabilityStatus,
  recordBookFileAvailability,
} from '@server/lib/bookAvailability';
import { resolveOpenLibraryIdentifiersForReadarrBook } from '@server/lib/bookIdentifierResolver';
import {
  normalizeExternalBookId,
  normalizeValidAsin,
} from '@server/lib/externalIds';
import { getExternalRuntimeConfig } from '@server/lib/externalRuntimeConfig';
import { normalizeIsbn, normalizeValidIsbn } from '@server/lib/isbn';
import { runMediaEntityMutation } from '@server/lib/mediaMutation';
import type {
  ProcessOptions,
  RunnableScanner,
  StatusBase,
} from '@server/lib/scanners/baseScanner';
import BaseScanner from '@server/lib/scanners/baseScanner';
import { forEachMediaCleanupBatch } from '@server/lib/scanners/mediaCleanupBatches';
import {
  ServarrServiceAuthorityChangedError,
  runWithServarrServiceSnapshot,
  runWithServarrServiceSnapshots,
} from '@server/lib/serviceAdmission';
import type { ReadarrSettings } from '@server/lib/settings';
import { makeBookshelfBookId } from '@server/utils/bookshelfCatalog';
import { getHttpErrorDetails } from '@server/utils/httpError';
import {
  getReadarrServiceFormats,
  type BookServiceFormat,
} from '@server/utils/readarrService';
import { uniqWith } from 'lodash';

type SyncStatus = StatusBase & {
  currentServer: ReadarrSettings;
  servers: ReadarrSettings[];
};

type BinderyScanBook = BinderyBook & { binderyFormat: BookServiceFormat };

const normalizeReadarrIsbn = (isbn?: string): string | undefined =>
  normalizeValidIsbn(isbn) ?? normalizeIsbn(isbn);

const getBookIdentifierKey = (
  provider: MediaIdentifierProvider,
  value: string
): string => `${provider}:${normalizeExternalBookId(value, provider)}`;

const SQLITE_BUSY_RETRY_ATTEMPTS = 3;
const SQLITE_BUSY_RETRY_DELAY_MS = 750;

const isSqliteBusyError = (error: unknown): boolean =>
  error instanceof Error &&
  (error.message.includes('SQLITE_BUSY') ||
    error.message.includes('database is locked'));

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

class ReadarrScanner
  extends BaseScanner<ReadarrBook | BinderyScanBook>
  implements RunnableScanner<SyncStatus>
{
  private servers: ReadarrSettings[];
  private currentServer: ReadarrSettings;
  private readarrApi: ReadarrAPI;
  private binderyPrimaryProvider?: string;
  private scannedIdentifierKeys: Set<string> = new Set();
  private scannedFormatKeys = new Set<string>();
  private scanItemsComplete = true;
  private didScan = false;

  constructor() {
    super('Bookshelf Scan', { bundleSize: 10 });
  }

  public status(): SyncStatus {
    return {
      running: this.running,
      progress: this.progress,
      total: this.items.length,
      currentServer: this.currentServer,
      servers: this.servers,
    };
  }

  public async run(): Promise<void> {
    const settings = getExternalRuntimeConfig();
    const sessionId = this.startRun();
    if (!sessionId) {
      return;
    }
    this.scannedIdentifierKeys.clear();
    this.scannedFormatKeys.clear();
    this.didScan = false;
    this.scanItemsComplete = true;

    try {
      this.servers = uniqWith(
        structuredClone(settings.readarr),
        (readarrA, readarrB) =>
          readarrA.hostname === readarrB.hostname &&
          readarrA.port === readarrB.port &&
          readarrA.baseUrl === readarrB.baseUrl &&
          (readarrA.serviceType ?? 'ebook') ===
            (readarrB.serviceType ?? 'ebook')
      );

      for (const server of this.servers) {
        this.currentServer = server;
        if (server.syncEnabled) {
          this.log(
            `Beginning to process Bookshelf server: ${server.name}`,
            'info'
          );

          this.items = await runWithServarrServiceSnapshot(
            'readarr',
            server,
            async (current) => {
              if (current.backend === 'bindery') {
                const bindery = new BinderyAPI(current);
                this.binderyPrimaryProvider =
                  await bindery.getPrimaryMetadataProvider();
                const formats = getReadarrServiceFormats(current);
                const books = await Promise.all(
                  formats.map(async (format) =>
                    (await bindery.getImportedBooks(format)).map((book) => ({
                      ...book,
                      binderyFormat: format,
                    }))
                  )
                );
                return books.flat();
              }

              this.readarrApi = new ReadarrAPI({
                apiKey: current.apiKey,
                url: ReadarrAPI.buildUrl(current, '/api/v1'),
                mediaType:
                  current.serviceType === 'audiobook' ? 'audiobook' : 'ebook',
              });
              return this.readarrApi.getBooks();
            }
          );
          this.didScan = true;
          await this.loop(
            async (book) =>
              this.currentServer.backend === 'bindery'
                ? this.processBinderyBook(book as BinderyScanBook)
                : this.processReadarrBook(book as ReadarrBook),
            { sessionId }
          );
        } else {
          this.log(
            `Sync not enabled. Skipping Bookshelf server: ${server.name}`
          );
        }
      }

      if (
        !this.scanItemsComplete ||
        !this.servers.every((server) => server.syncEnabled)
      ) {
        this.didScan = false;
      }

      await this.cleanupOrphanedBooks();
      this.log('Bookshelf scan complete', 'info');
    } catch (e) {
      this.log('Scan interrupted', 'error', {
        ...getHttpErrorDetails(e),
        errorStack: e instanceof Error ? e.stack : undefined,
      });
    } finally {
      this.endRun(sessionId);
    }
  }

  private async processReadarrBook(readarrBook: ReadarrBook): Promise<void> {
    try {
      if (!readarrBook.editions?.length) {
        try {
          readarrBook.editions = await runWithServarrServiceSnapshot(
            'readarr',
            this.currentServer,
            async () => this.readarrApi.getEditions(readarrBook.id)
          );
        } catch {
          // Edition enrichment is optional when inventory supplies a scoped work
          // identity and file counts. Keep cleanup conservative after this gap.
          this.scanItemsComplete = false;
          this.log(
            'Book edition metadata is unavailable; retaining catalog file observations.',
            'warn',
            { bookId: readarrBook.id }
          );
          readarrBook.editions = [];
        }
      }

      const identifier =
        readarrBook.editions
          ?.map((edition) => normalizeReadarrIsbn(edition.isbn13))
          .find((isbn): isbn is string => !!isbn) ?? readarrBook.foreignBookId;

      if (!identifier) {
        this.scanItemsComplete = false;
        this.log(
          'No supported identifier found for this book. Skipping item.',
          'debug',
          {
            title: readarrBook.title,
          }
        );
        return;
      }

      const provider = readarrBook.editions?.some(
        (edition) => normalizeReadarrIsbn(edition.isbn13) === identifier
      )
        ? MediaIdentifierProvider.ISBN
        : MediaIdentifierProvider.READARR;
      const resolvedOpenLibraryIdentifiers =
        await resolveOpenLibraryIdentifiersForReadarrBook(readarrBook);

      const secondaryIdentifiers = [
        // Catalog requests use an opaque identity scoped to the selected server.
        // Keep that same record when ISBN/Readarr identifiers become available.
        ...(readarrBook.foreignBookId
          ? this.readarrApi
              .getKnownBookIdentityAliases(readarrBook.foreignBookId)
              .map((id) => ({
                provider: MediaIdentifierProvider.BOOKSHELF,
                value: makeBookshelfBookId(this.currentServer.id, id),
              }))
          : []),
        readarrBook.foreignBookId
          ? {
              provider: MediaIdentifierProvider.READARR,
              value: readarrBook.foreignBookId,
            }
          : undefined,
        ...((readarrBook.editions ?? [])
          .map((edition) => {
            const isbn = normalizeReadarrIsbn(edition.isbn13);

            return isbn
              ? {
                  provider: MediaIdentifierProvider.ISBN,
                  value: isbn,
                }
              : undefined;
          })
          .filter(Boolean) as {
          provider: MediaIdentifierProvider;
          value: string;
        }[]),
        ...resolvedOpenLibraryIdentifiers,
        ...(readarrBook.editions ?? []).flatMap((edition) => {
          const asin = normalizeValidAsin(edition.asin);
          return asin
            ? [{ provider: MediaIdentifierProvider.ASIN, value: asin }]
            : [];
        }),
      ].filter(
        (
          item
        ): item is {
          provider: MediaIdentifierProvider;
          value: string;
        } =>
          !!item && !(item.provider === provider && item.value === identifier)
      );

      [{ provider, value: identifier }, ...secondaryIdentifiers].forEach(
        (item) =>
          this.scannedIdentifierKeys.add(
            getBookIdentifierKey(item.provider, item.value)
          )
      );

      const serviceType =
        this.currentServer.serviceType === 'audiobook' ? 'audiobook' : 'ebook';
      for (const item of [
        { provider, value: identifier },
        ...secondaryIdentifiers,
      ]) {
        this.scannedFormatKeys.add(
          `${this.currentServer.id}:${serviceType}:${getBookIdentifierKey(item.provider, item.value)}`
        );
      }
      const observedFileCount =
        (serviceType === 'audiobook'
          ? readarrBook.statistics?.audiobookFileCount
          : readarrBook.statistics?.ebookFileCount) ??
        readarrBook.statistics?.bookFileCount;
      const bookFileObservationKnown =
        typeof observedFileCount === 'number' &&
        Number.isFinite(observedFileCount) &&
        observedFileCount >= 0;
      const bookFileCount = bookFileObservationKnown ? observedFileCount : 0;
      const hasFile = bookFileCount > 0;
      const totalBooks = readarrBook.statistics?.totalBookCount ?? 1;

      if (!readarrBook.monitored && !hasFile) {
        await this.processBookWithRetry(provider, identifier, {
          serviceId: this.currentServer.id,
          externalServiceId: readarrBook.id,
          externalServiceSlug:
            readarrBook.titleSlug ?? readarrBook.foreignBookId,
          title: readarrBook.title,
          mediaAddedAt: readarrBook.added
            ? new Date(readarrBook.added)
            : undefined,
          hasFile: false,
          bookFileObservationKnown,
          secondaryIdentifiers,
          processing: false,
          bookServiceType: serviceType,
          mutationGuard: (callback) =>
            runWithServarrServiceSnapshot(
              'readarr',
              this.currentServer,
              callback
            ),
        });
        return;
      }

      await this.processBookWithRetry(provider, identifier, {
        serviceId: this.currentServer.id,
        externalServiceId: readarrBook.id,
        externalServiceSlug: readarrBook.titleSlug ?? readarrBook.foreignBookId,
        title: readarrBook.title,
        mediaAddedAt: readarrBook.added
          ? new Date(readarrBook.added)
          : undefined,
        hasFile,
        bookFileObservationKnown,
        secondaryIdentifiers,
        bookServiceType: serviceType,
        processing:
          readarrBook.monitored &&
          (readarrBook.statistics ? bookFileCount < totalBooks : !hasFile),
        mutationGuard: (callback) =>
          runWithServarrServiceSnapshot(
            'readarr',
            this.currentServer,
            callback
          ),
      });
    } catch (e) {
      this.scanItemsComplete = false;
      if (e instanceof ServarrServiceAuthorityChangedError) throw e;
      this.log('Failed to process Bookshelf media', 'error', {
        errorMessage: e.message,
        title: readarrBook.title,
      });
    }
  }

  private async processBinderyBook(book: BinderyScanBook): Promise<void> {
    try {
      const mappedProvider =
        this.binderyPrimaryProvider === 'openlibrary'
          ? MediaIdentifierProvider.OPENLIBRARY
          : this.binderyPrimaryProvider === 'hardcover'
            ? MediaIdentifierProvider.HARDCOVER
            : undefined;
      const primaryIsbn =
        this.binderyPrimaryProvider === 'isbn'
          ? normalizeReadarrIsbn(book.foreignBookId)
          : undefined;
      const foreignBookId = mappedProvider
        ? normalizeExternalBookId(book.foreignBookId, mappedProvider)
        : undefined;
      const isbns = [book.isbn, ...(book.isbns ?? [])]
        .map((isbn) => normalizeReadarrIsbn(isbn))
        .filter(
          (isbn, index, values): isbn is string =>
            Boolean(isbn) && values.indexOf(isbn) === index
        );
      const provider = foreignBookId
        ? mappedProvider!
        : MediaIdentifierProvider.ISBN;
      const identifier = foreignBookId ?? primaryIsbn ?? isbns[0];

      if (!identifier) {
        this.scanItemsComplete = false;
        this.log(
          'No supported Bindery book identifier found. Skipping item.',
          'debug',
          { title: book.title, foreignBookId: book.foreignBookId }
        );
        return;
      }

      const secondaryIdentifiers = [
        ...(foreignBookId
          ? isbns.map((isbn) => ({
              provider: MediaIdentifierProvider.ISBN,
              value: isbn,
            }))
          : []),
        ...(foreignBookId
          ? []
          : mappedProvider
            ? [
                {
                  provider: mappedProvider,
                  value: normalizeExternalBookId(
                    book.foreignBookId,
                    mappedProvider
                  ),
                },
              ]
            : []),
      ];
      [{ provider, value: identifier }, ...secondaryIdentifiers].forEach(
        (item) =>
          this.scannedIdentifierKeys.add(
            getBookIdentifierKey(item.provider, item.value)
          )
      );

      for (const item of [
        { provider, value: identifier },
        ...secondaryIdentifiers,
      ]) {
        this.scannedFormatKeys.add(
          `${this.currentServer.id}:${book.binderyFormat}:${getBookIdentifierKey(item.provider, item.value)}`
        );
      }
      await this.processBookWithRetry(provider, identifier, {
        serviceId: this.currentServer.id,
        externalServiceId: book.id,
        externalServiceSlug: book.titleSlug ?? book.foreignBookId,
        title: book.title,
        hasFile: true,
        processing: false,
        secondaryIdentifiers,
        bookServiceType: book.binderyFormat,
        mutationGuard: (callback) =>
          runWithServarrServiceSnapshot(
            'readarr',
            this.currentServer,
            callback
          ),
      });
    } catch (error) {
      this.scanItemsComplete = false;
      if (error instanceof ServarrServiceAuthorityChangedError) throw error;
      this.log('Failed to process Bindery media', 'error', {
        errorMessage: error instanceof Error ? error.message : String(error),
        title: book.title,
      });
    }
  }

  private async processBookWithRetry(
    provider: MediaIdentifierProvider,
    identifier: string,
    options: ProcessOptions
  ): Promise<void> {
    for (let attempt = 1; attempt <= SQLITE_BUSY_RETRY_ATTEMPTS; attempt += 1) {
      try {
        await this.processBook(provider, identifier, options);
        return;
      } catch (e) {
        if (!isSqliteBusyError(e) || attempt === SQLITE_BUSY_RETRY_ATTEMPTS) {
          throw e;
        }

        await sleep(SQLITE_BUSY_RETRY_DELAY_MS * attempt);
      }
    }
  }

  private async cleanupOrphanedBooks(): Promise<void> {
    const mediaRepository = getRepository(Media);

    if (!this.didScan) {
      this.log(
        'Skipping orphaned book cleanup: not all Bookshelf servers were scanned.',
        'info'
      );
      return;
    }

    await forEachMediaCleanupBatch(
      { mediaType: MediaType.BOOK },
      async (media) => {
        const identifierKeys = (media.identifiers ?? []).map((identifier) =>
          getBookIdentifierKey(identifier.provider, identifier.value)
        );

        const missingSources = (['ebook', 'audiobook'] as const).flatMap(
          (format) =>
            (format === 'ebook'
              ? (media.availableEbookServiceIds ?? [])
              : (media.availableAudiobookServiceIds ?? [])
            )
              .filter(
                (serviceId) =>
                  this.servers.some(
                    (server) => server.id === serviceId && server.syncEnabled
                  ) &&
                  !identifierKeys.some((key) =>
                    this.scannedFormatKeys.has(`${serviceId}:${format}:${key}`)
                  )
              )
              .map((serviceId) => ({ format, serviceId }))
        );
        const orphanedProcessing =
          media.status === MediaStatus.PROCESSING &&
          identifierKeys.length > 0 &&
          !identifierKeys.some((key) => this.scannedIdentifierKeys.has(key));
        if (missingSources.length || orphanedProcessing) {
          const changed = await runMediaEntityMutation(media, () =>
            runWithServarrServiceSnapshots(
              'readarr',
              this.servers.filter((server) => server.syncEnabled),
              async () => {
                const current = await mediaRepository.findOne({
                  where: { id: media.id },
                  relations: { identifiers: true },
                });
                if (!current) return false;
                for (const { format, serviceId } of missingSources)
                  recordBookFileAvailability(current, format, serviceId, false);
                current.status = getBookAvailabilityStatus(
                  current,
                  !orphanedProcessing &&
                    current.status === MediaStatus.PROCESSING
                );
                await mediaRepository.save(current);
                return true;
              },
              {
                requireExactAuthoritySet: true,
                includeCurrent: (server) => server.syncEnabled,
              }
            )
          );
          if (changed) {
            this.log(
              `Book ${identifierKeys[0]} not found in any Bookshelf server. File availability refreshed.`,
              'info'
            );
          }
        }
      },
      { relations: { identifiers: true } }
    );
  }
}

export const readarrScanner = new ReadarrScanner();
