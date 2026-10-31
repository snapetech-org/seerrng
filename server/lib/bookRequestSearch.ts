import BinderyAPI, {
  type BinderyQueueItem,
  type BinderyRequestQueueSnapshot,
} from '@server/api/bindery';
import ReadarrAPI, {
  matchesReadarrBookProviderIdentity,
  type ReadarrBook,
  type ReadarrBookLookupResult,
  type ReadarrPendingAuthorImport,
} from '@server/api/servarr/readarr';
import { MediaRequestStatus, MediaStatus } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import { BookRequestSearch } from '@server/entity/BookRequestSearch';
import Media from '@server/entity/Media';
import MediaIdentifier, {
  MediaIdentifierProvider,
} from '@server/entity/MediaIdentifier';
import {
  MediaRequest,
  getRequestMutationAdmissionKey,
  runWithRequestAdmission,
  type MediaRequestServiceTarget,
} from '@server/entity/MediaRequest';
import { hasRequestedEditionFiles } from '@server/lib/editionCompare/availability';
import { getExternalRuntimeConfig } from '@server/lib/externalRuntimeConfig';
import { normalizeValidIsbn } from '@server/lib/isbn';
import {
  RequestStatusStage,
  recordRequestStatusOverride,
} from '@server/lib/requestStatus';
import type { ReadarrSettings } from '@server/lib/settings';
import logger from '@server/logger';
import { isProviderBookEdition } from '@server/utils/bookEdition';

const terminalCommandStates = new Set([
  'completed',
  'failed',
  'aborted',
  'cancelled',
  'orphaned',
]);
const COMPLETED_COMMAND_SETTLE_MS = 15_000;
const terminalOperationStates = new Set<BookRequestSearch['state']>([
  'available',
  'unavailable',
  'failed',
]);

const normalize = (value: unknown): string =>
  typeof value === 'string' ? value.trim().toLowerCase() : String(value ?? '');

const isGrabbedHistory = (eventType: unknown): boolean =>
  normalize(eventType) === 'grabbed' || Number(eventType) === 1;

const isImportedHistory = (eventType: unknown): boolean =>
  ['bookfileimported', 'downloadimported'].includes(normalize(eventType)) ||
  [3, 8].includes(Number(eventType));

const isFailedHistory = (eventType: unknown): boolean =>
  ['downloadfailed', 'importfailed'].includes(normalize(eventType)) ||
  Number(eventType) === 4;

const isFailedQueueItem = (item: {
  status?: unknown;
  trackedDownloadState?: unknown;
  trackedDownloadStatus?: unknown;
}): boolean =>
  [item.status, item.trackedDownloadState, item.trackedDownloadStatus]
    .map(normalize)
    .some(
      (state) =>
        state.includes('failed') ||
        state.includes('error') ||
        state === 'warning'
    );

const isImportingQueueItem = (item: {
  status?: unknown;
  trackedDownloadState?: unknown;
  trackedDownloadStatus?: unknown;
}): boolean =>
  [item.status, item.trackedDownloadState, item.trackedDownloadStatus]
    .map(normalize)
    .some((state) =>
      ['importing', 'importpending', 'imported'].includes(state)
    );

class BookRequestSearchManager {
  private activeRun?: Promise<void>;

  public run(): Promise<void> {
    if (this.activeRun) return this.activeRun;
    const run = this.reconcile().finally(() => {
      if (this.activeRun === run) this.activeRun = undefined;
    });
    this.activeRun = run;
    return run;
  }

  private async reconcile(): Promise<void> {
    const operations = await getRepository(BookRequestSearch).find({
      relations: { request: { media: true } },
      order: { id: 'ASC' },
      take: 500,
    });

    const binderyLibraries = new Map<
      string,
      Promise<Awaited<ReturnType<BinderyAPI['getImportedBooks']>>>
    >();
    const binderyRequestIds = new Map<number, Set<number>>();
    for (const operation of operations) {
      if (operation.binderyRequestId == null) continue;
      const ids =
        binderyRequestIds.get(operation.serviceId) ?? new Set<number>();
      ids.add(operation.binderyRequestId);
      binderyRequestIds.set(operation.serviceId, ids);
    }
    const binderyRequestQueues = new Map<
      number,
      Promise<BinderyRequestQueueSnapshot>
    >();
    const binderyDownloadQueues = new Map<
      number,
      Promise<BinderyQueueItem[]>
    >();
    for (const operation of operations) {
      await this.reconcileOperation(
        operation,
        binderyLibraries,
        binderyRequestIds,
        binderyRequestQueues,
        binderyDownloadQueues
      ).catch((error) => {
        logger.warn('Unable to reconcile book service request.', {
          label: 'Book Request Search',
          requestId: operation.requestId,
          serviceId: operation.serviceId,
          commandId: operation.commandId,
          errorMessage: error instanceof Error ? error.message : String(error),
        });
      });
    }
  }

  private async reconcileOperation(
    operation: BookRequestSearch,
    binderyLibraries: Map<
      string,
      Promise<Awaited<ReturnType<BinderyAPI['getImportedBooks']>>>
    >,
    binderyRequestIds: Map<number, Set<number>>,
    binderyRequestQueues: Map<number, Promise<BinderyRequestQueueSnapshot>>,
    binderyDownloadQueues: Map<number, Promise<BinderyQueueItem[]>>
  ): Promise<void> {
    if (terminalOperationStates.has(operation.state)) {
      await this.finalizeRequest(operation.requestId);
      return;
    }

    const server = getExternalRuntimeConfig().readarr.find(
      (candidate) => candidate.id === operation.serviceId
    );
    if (!server?.syncEnabled) return;

    if (server.backend === 'bindery') {
      const key = `${server.id}:${operation.format}`;
      let library = binderyLibraries.get(key);
      const bindery = new BinderyAPI(server);
      if (!library) {
        library = bindery.getImportedBooks(operation.format);
        binderyLibraries.set(key, library);
      }
      const importedBooks = await library;
      const imported = importedBooks.find(
        (book) =>
          book.foreignBookId === operation.providerBookId ||
          (operation.bookId != null && book.id === operation.bookId)
      );
      if (imported) {
        await getRepository(BookRequestSearch).update(operation.id, {
          bookId: imported.id,
          binderyRequestId: null,
          state: 'available',
          updatedAt: new Date(),
        });
        operation.bookId = imported.id;
        operation.binderyRequestId = null;
        operation.state = 'available';
        await this.storeBinderyBookServiceLink(operation, imported.id);
        await this.finalizeRequest(operation.requestId);
        return;
      }

      if (operation.binderyRequestId != null) {
        let requestQueue = binderyRequestQueues.get(server.id);
        if (!requestQueue) {
          requestQueue = bindery.getRequestsById(
            binderyRequestIds.get(server.id) ??
              new Set([operation.binderyRequestId])
          );
          binderyRequestQueues.set(server.id, requestQueue);
        }
        const snapshot = await requestQueue;
        const binderyRequest = snapshot.requests.get(
          operation.binderyRequestId
        );
        if (binderyRequest?.status === 'declined') {
          await this.failBinderyRequest(
            operation,
            'Bindery declined this request. Ask an administrator to review it in Bindery, then retry here if the book is still wanted.'
          );
          return;
        }
        if (binderyRequest?.status === 'pending') {
          await this.setState(operation, 'pending');
          return;
        }
        if (!binderyRequest && snapshot.complete) {
          await this.failBinderyRequest(
            operation,
            'Bindery no longer has the linked request. Ask an administrator to check Bindery, then retry here if the book is still wanted.'
          );
          return;
        }
        if (!binderyRequest) return;

        const bookId = binderyRequest.resultBookId ?? operation.bookId ?? null;
        const nextBinderyRequestId =
          bookId == null ? operation.binderyRequestId : null;
        await getRepository(BookRequestSearch).update(operation.id, {
          binderyRequestId: nextBinderyRequestId,
          bookId,
          state: 'monitoring',
          updatedAt: new Date(),
        });
        operation.binderyRequestId = nextBinderyRequestId;
        operation.bookId = bookId;
        operation.state = 'monitoring';
        if (bookId != null) {
          await this.storeBinderyBookServiceLink(operation, bookId);
        }
      }

      if (operation.bookId == null) return;

      let downloadQueue = binderyDownloadQueues.get(server.id);
      if (!downloadQueue) {
        downloadQueue = bindery.getQueue();
        binderyDownloadQueues.set(server.id, downloadQueue);
      }
      let queueItems: BinderyQueueItem[];
      try {
        queueItems = await downloadQueue;
      } catch (error) {
        logger.warn('Unable to read Bindery download progress.', {
          label: 'Book Request Search',
          requestId: operation.requestId,
          serviceId: operation.serviceId,
          errorMessage: error instanceof Error ? error.message : String(error),
        });
        return;
      }
      const activeItems = queueItems.filter(
        (item) => item.bookId === operation.bookId
      );
      if (activeItems.some((item) => isFailedQueueItem(item))) {
        await this.failBinderyRequest(
          operation,
          'The connected book service reported a download or import problem. Ask an administrator to check its queue or logs, fix the issue there, then retry the request.'
        );
        return;
      }
      if (activeItems.some((item) => isImportingQueueItem(item))) {
        await this.setState(operation, 'importing');
      } else if (activeItems.length > 0) {
        await this.setState(operation, 'grabbed');
      } else if (operation.state !== 'monitoring') {
        await this.setState(operation, 'monitoring');
      }
      return;
    }

    const readarr = new ReadarrAPI({
      apiKey: server.apiKey,
      url: ReadarrAPI.buildUrl(server, '/api/v1'),
      mediaType: operation.format,
    });

    if (operation.providerManagedSearch) {
      await this.reconcileProviderManagedSearch(operation, readarr);
      return;
    }

    if (operation.state === 'monitoring') {
      await this.reconcileMonitoringOperation(operation, readarr);
      return;
    }

    if (
      operation.state === 'pending' ||
      operation.bookId == null ||
      operation.commandId == null
    ) {
      await this.reconcilePendingOperation(operation, readarr, server);
      return;
    }

    const command = await readarr.getCommand(operation.commandId);
    const commandStatus = normalize(command.status);

    if (!terminalCommandStates.has(commandStatus)) {
      await this.setState(operation, 'searching');
      return;
    }
    if (commandStatus !== 'completed') {
      await this.finishWithoutRelease(
        operation,
        readarr,
        RequestStatusStage.FAILED,
        command.exception || command.message || 'Bookshelf search failed.'
      );
      return;
    }

    const providerBookId = await this.getProviderBookId(operation);
    const providerEditionId =
      operation.providerEditionId ??
      operation.request.preferredEditionId ??
      undefined;
    const book = await this.getBookAfterSearch(
      operation,
      readarr,
      providerBookId,
      providerEditionId
    );
    if (!book) {
      await this.waitForCatalogBook(operation, providerBookId);
      return;
    }

    const [queue, history] = await Promise.all([
      readarr.getQueue(),
      readarr.getBookHistory(book.id),
    ]);
    const currentHistory = history.filter((item) => {
      const eventTime = item.date ? new Date(item.date).getTime() : Number.NaN;
      return (
        Number.isFinite(eventTime) && eventTime >= operation.createdAt.getTime()
      );
    });
    if (
      await hasRequestedEditionFiles(
        readarr,
        book,
        operation.request.preferredEditionId
      )
    ) {
      await this.setState(operation, 'available');
      await this.finalizeRequest(operation.requestId);
      return;
    }

    const currentQueue = queue.filter(
      (item) => (item.bookId ?? item.book?.id) === book.id
    );
    if (
      currentQueue.some((item) => isFailedQueueItem(item)) ||
      currentHistory.some((item) => isFailedHistory(item.eventType))
    ) {
      await this.finishWithoutRelease(
        operation,
        readarr,
        RequestStatusStage.FAILED,
        'Bookshelf download or import failed.'
      );
      return;
    }
    if (currentQueue.some((item) => isImportingQueueItem(item))) {
      await this.setState(operation, 'importing');
      return;
    }
    if (currentHistory.some((item) => isImportedHistory(item.eventType))) {
      await this.setState(operation, 'importing');
      return;
    }
    if (currentQueue.length > 0) {
      await this.setState(operation, 'grabbed');
      return;
    }
    if (currentHistory.some((item) => isGrabbedHistory(item.eventType))) {
      // The release was handed to the downloader and has since disappeared
      // from Bookshelf's live queue. It is now waiting on import or manual
      // matching, not still downloading.
      await this.setState(operation, 'importing');
      return;
    }

    // Bookshelf can finish BookSearch just before its queue and history
    // projections become visible. Give those projections one reconciliation
    // window before concluding that the search produced no release.
    if (operation.state !== 'settling') {
      await this.setState(operation, 'settling');
      return;
    }
    if (
      Date.now() - operation.updatedAt.getTime() <
      COMPLETED_COMMAND_SETTLE_MS
    ) {
      return;
    }

    await this.finishWithoutRelease(
      operation,
      readarr,
      RequestStatusStage.UNAVAILABLE,
      'No release found.'
    );
  }

  private async reconcileMonitoringOperation(
    operation: BookRequestSearch,
    readarr: ReadarrAPI
  ): Promise<void> {
    const providerBookId = await this.getProviderBookId(operation);
    const providerEditionId =
      operation.providerEditionId ??
      operation.request.preferredEditionId ??
      undefined;
    const book = await this.getBookAfterSearch(
      operation,
      readarr,
      providerBookId,
      providerEditionId
    );

    if (
      await hasRequestedEditionFiles(
        readarr,
        book,
        operation.request.preferredEditionId
      )
    ) {
      await this.setState(operation, 'available');
      await this.finalizeRequest(operation.requestId);
      return;
    }

    if (operation.commandId != null) {
      await this.setState(operation, 'searching');
      return;
    }

    const bookId = operation.bookId ?? book?.id;
    if (bookId == null) return;

    // The add endpoint only creates the monitored Book/Author records. In
    // particular, Seerr's Bookshelf payload disables the backend's deferred
    // search flag, so a BookSearch command must be started explicitly. Do it
    // from this retryable job so a temporary command API failure cannot turn a
    // successful add into a failed request or leave it silently unsearched.
    const command = await readarr.startBookSearch(bookId);
    if (!Number.isSafeInteger(command.id) || command.id <= 0) {
      throw new Error('Bookshelf returned an invalid BookSearch command ID.');
    }

    const updatedAt = new Date();
    await getRepository(BookRequestSearch).update(operation.id, {
      commandId: command.id,
      state: 'searching',
      updatedAt,
    });
    operation.commandId = command.id;
    operation.state = 'searching';
    operation.updatedAt = updatedAt;
  }

  private async reconcileProviderManagedSearch(
    operation: BookRequestSearch,
    readarr: ReadarrAPI
  ): Promise<void> {
    const providerBookId = await this.getProviderBookId(operation);
    const providerEditionId =
      operation.providerEditionId ??
      operation.request.preferredEditionId ??
      undefined;
    const book = await this.getBookAfterSearch(
      operation,
      readarr,
      providerBookId,
      providerEditionId
    );

    if (
      await hasRequestedEditionFiles(
        readarr,
        book,
        operation.request.preferredEditionId
      )
    ) {
      await this.setState(operation, 'available');
      await this.finalizeRequest(operation.requestId);
      return;
    }

    await this.setState(operation, 'monitoring');
  }

  private async reconcilePendingOperation(
    operation: BookRequestSearch,
    readarr: ReadarrAPI,
    server: ReadarrSettings
  ): Promise<void> {
    const providerBookId = await this.getProviderBookId(operation);
    if (!providerBookId) {
      logger.warn('Pending Bookshelf add has no saved provider book ID.', {
        label: 'Book Request Search',
        requestId: operation.requestId,
        serviceId: operation.serviceId,
      });
      return;
    }

    if (operation.pendingId != null) {
      const pendingImport = await readarr.getPendingAuthorImport(
        operation.pendingId
      );
      const formatStatus = this.getPendingFormatStatus(
        pendingImport,
        operation.format
      );
      const nextAttemptAt = pendingImport?.nextAttemptAt
        ? new Date(pendingImport.nextAttemptAt)
        : undefined;
      const validNextAttemptAt =
        nextAttemptAt && Number.isFinite(nextAttemptAt.getTime())
          ? nextAttemptAt
          : undefined;
      await getRepository(BookRequestSearch).update(operation.id, {
        pendingAttemptCount: pendingImport?.attemptCount ?? null,
        pendingMaxAttempts: pendingImport?.maxAttempts ?? null,
        pendingNextAttemptAt: validNextAttemptAt ?? null,
      });
      operation.pendingAttemptCount = pendingImport?.attemptCount ?? null;
      operation.pendingMaxAttempts = pendingImport?.maxAttempts ?? null;
      operation.pendingNextAttemptAt = validNextAttemptAt ?? null;
      if (formatStatus === 'failed') {
        await this.finishWithoutRelease(
          operation,
          readarr,
          RequestStatusStage.FAILED,
          'ChaptarrNG could not prepare this author. Check ChaptarrNG’s logs and metadata-source settings, then retry the request.'
        );
        return;
      }
      if (
        pendingImport &&
        formatStatus !== 'succeeded' &&
        formatStatus !== 'partialsuccess'
      ) {
        await this.setState(operation, 'pending');
        return;
      }
    }

    const providerEditionId =
      operation.providerEditionId ??
      operation.request.preferredEditionId ??
      undefined;
    const lookup = await readarr.lookupBookByProviderIdentity(
      providerBookId,
      providerEditionId
    );
    if (!lookup) {
      await this.setState(operation, 'pending');
      return;
    }

    const addOptions = this.buildPendingAddOptions(
      operation,
      server,
      lookup,
      providerBookId,
      providerEditionId
    );
    if (!addOptions) {
      await this.setState(operation, 'pending');
      return;
    }

    const result = await readarr.addBook(addOptions);
    if (result.pending) {
      await getRepository(BookRequestSearch).update(operation.id, {
        bookId: null,
        commandId: null,
        pendingId: result.pendingId ?? null,
        pendingAttemptCount: null,
        pendingMaxAttempts: null,
        pendingNextAttemptAt: null,
        providerBookId: result.foreignBookId || providerBookId,
        providerEditionId,
        createdBook: false,
        createdAuthor: false,
        state: 'pending',
        providerManagedSearch: false,
        updatedAt: new Date(),
      });
      operation.bookId = null;
      operation.commandId = null;
      operation.pendingId = result.pendingId ?? null;
      operation.pendingAttemptCount = null;
      operation.pendingMaxAttempts = null;
      operation.pendingNextAttemptAt = null;
      operation.providerBookId = result.foreignBookId || providerBookId;
      operation.providerEditionId = providerEditionId;
      operation.createdBook = false;
      operation.createdAuthor = false;
      operation.state = 'pending';
      await this.storeBookServiceLink(operation, undefined);
      return;
    }
    const bookId = result.id;
    if (
      typeof bookId !== 'number' ||
      !Number.isSafeInteger(bookId) ||
      bookId <= 0
    ) {
      throw new Error('Bookshelf returned no book ID after its pending add.');
    }

    await getRepository(BookRequestSearch).update(operation.id, {
      bookId,
      commandId: null,
      pendingId: null,
      pendingAttemptCount: null,
      pendingMaxAttempts: null,
      pendingNextAttemptAt: null,
      providerBookId: result.foreignBookId || providerBookId,
      providerEditionId,
      authorId: result.authorId ?? result.author?.id ?? null,
      createdBook: result.createdBook,
      createdAuthor: result.createdAuthor,
      providerManagedSearch: true,
      state: 'monitoring',
      updatedAt: new Date(),
    });
    operation.bookId = bookId;
    operation.commandId = null;
    operation.pendingId = null;
    operation.pendingAttemptCount = null;
    operation.pendingMaxAttempts = null;
    operation.pendingNextAttemptAt = null;
    operation.providerBookId = result.foreignBookId || providerBookId;
    operation.providerEditionId = providerEditionId;
    operation.authorId = result.authorId ?? result.author?.id ?? null;
    operation.createdBook = result.createdBook;
    operation.createdAuthor = result.createdAuthor;
    operation.providerManagedSearch = true;
    operation.state = 'monitoring';
    await this.storeBookServiceLink(operation, result);
  }

  private getPendingFormatStatus(
    pendingImport: ReadarrPendingAuthorImport | undefined,
    format: 'ebook' | 'audiobook'
  ): string | undefined {
    if (!pendingImport) return undefined;
    return normalize(
      format === 'audiobook'
        ? (pendingImport.audiobookStatus ?? pendingImport.overallStatus)
        : (pendingImport.ebookStatus ?? pendingImport.overallStatus)
    );
  }

  private buildPendingAddOptions(
    operation: BookRequestSearch,
    server: ReadarrSettings,
    book: ReadarrBookLookupResult,
    providerBookId: string,
    providerEditionId?: string
  ) {
    const savedTarget = operation.request.serviceTargets?.find(
      (target) =>
        target.serviceType === 'readarr' &&
        target.format === operation.format &&
        target.serverId === operation.serviceId
    );
    const rootFolder = savedTarget?.rootFolder ?? server.activeDirectory;
    const qualityProfileId = savedTarget?.profileId ?? server.activeProfileId;
    const metadataProfileId =
      savedTarget?.metadataProfileId ?? server.activeMetadataProfileId ?? 1;
    const tags = [...(savedTarget?.tags ?? server.tags ?? [])];
    const preferredIsbn = normalizeValidIsbn(
      operation.request.preferredIsbn13 ?? undefined
    );
    const editions = book.editions ?? [];
    const requestedEdition = editions.find(
      (edition) =>
        (providerEditionId &&
          normalize(edition.foreignEditionId) ===
            normalize(providerEditionId)) ||
        (preferredIsbn && normalizeValidIsbn(edition.isbn13) === preferredIsbn)
    );

    if ((providerEditionId || preferredIsbn) && !requestedEdition) {
      return undefined;
    }

    return {
      ...book,
      mediaType: operation.format,
      monitored: true,
      qualityProfileId,
      metadataProfileId,
      rootFolderPath: rootFolder,
      tags,
      author: book.author
        ? {
            ...book.author,
            rootFolderPath: rootFolder,
            qualityProfileId,
            metadataProfileId,
            monitored: true,
            monitorNewItems: 'none',
            addOptions: {
              monitor: 'none',
              searchForMissingBooks: false,
              booksToMonitor: [providerBookId],
            },
            manualAdd: true,
          }
        : book.author,
      editions: editions.map((edition) => ({
        ...edition,
        monitored: requestedEdition
          ? edition.foreignEditionId === requestedEdition.foreignEditionId
          : edition.monitored,
      })),
      useRequestedEdition: !!requestedEdition,
      addOptions: { searchForNewBook: true },
    };
  }

  private async getProviderBookId(
    operation: BookRequestSearch
  ): Promise<string | undefined> {
    if (operation.providerBookId?.trim()) return operation.providerBookId;

    const identifier = await getRepository(MediaIdentifier).findOne({
      where: {
        media: { id: operation.request.media.id },
        provider: MediaIdentifierProvider.READARR,
      },
    });
    if (!identifier?.value.trim()) return undefined;

    operation.providerBookId = identifier.value;
    await getRepository(BookRequestSearch).update(operation.id, {
      providerBookId: identifier.value,
    });
    return identifier.value;
  }

  private async getBookAfterSearch(
    operation: BookRequestSearch,
    readarr: ReadarrAPI,
    providerBookId?: string,
    providerEditionId?: string
  ): Promise<ReadarrBook | undefined> {
    const currentBook =
      operation.bookId != null
        ? await readarr.getBookIfExists(operation.bookId)
        : null;
    if (
      currentBook &&
      (!providerBookId ||
        matchesReadarrBookProviderIdentity(
          currentBook,
          providerBookId,
          providerEditionId
        ))
    ) {
      return currentBook;
    }
    if (!providerBookId) return currentBook ?? undefined;

    const recoveredBook = await readarr.lookupBookByProviderIdentity(
      providerBookId,
      providerEditionId
    );
    if (
      !recoveredBook?.id ||
      !Number.isSafeInteger(recoveredBook.id) ||
      recoveredBook.id <= 0
    ) {
      return undefined;
    }

    await getRepository(BookRequestSearch).update(operation.id, {
      bookId: recoveredBook.id,
      providerBookId,
      providerEditionId: providerEditionId ?? null,
      updatedAt: new Date(),
    });
    operation.bookId = recoveredBook.id;
    operation.providerBookId = providerBookId;
    operation.providerEditionId = providerEditionId ?? null;
    await this.storeBookServiceLink(operation, recoveredBook);
    return recoveredBook as ReadarrBook;
  }

  private async waitForCatalogBook(
    operation: BookRequestSearch,
    providerBookId?: string
  ): Promise<void> {
    const updatedAt = new Date();
    await getRepository(BookRequestSearch).update(operation.id, {
      bookId: null,
      commandId: null,
      pendingId: null,
      providerBookId: providerBookId ?? null,
      createdBook: false,
      createdAuthor: false,
      state: 'pending',
      updatedAt,
    });
    operation.bookId = null;
    operation.commandId = null;
    operation.pendingId = null;
    operation.providerBookId = providerBookId ?? null;
    operation.createdBook = false;
    operation.createdAuthor = false;
    operation.state = 'pending';
    operation.updatedAt = updatedAt;
    await this.storeBookServiceLink(operation, undefined);
  }

  private async storeBookServiceLink(
    operation: BookRequestSearch,
    book: ReadarrBookLookupResult | undefined
  ): Promise<void> {
    const providerBookId = operation.providerBookId ?? book?.foreignBookId;
    const externalServiceId = book?.id ?? null;
    const externalServiceSlug =
      book?.titleSlug ?? providerBookId ?? book?.title ?? null;
    const media = operation.request.media;
    const mediaPatch: Partial<Media> = {};
    if (operation.format === 'audiobook') {
      mediaPatch.audiobookServiceId = operation.serviceId;
      mediaPatch.audiobookExternalServiceId = externalServiceId;
      mediaPatch.audiobookExternalServiceSlug = externalServiceSlug;
    } else {
      mediaPatch.serviceId = operation.serviceId;
      mediaPatch.externalServiceId = externalServiceId;
      mediaPatch.externalServiceSlug = externalServiceSlug;
    }
    await getRepository(Media).update(media.id, mediaPatch);
    Object.assign(media, mediaPatch);

    const targets = operation.request.serviceTargets ?? [];
    const target: MediaRequestServiceTarget = {
      serviceType: 'readarr',
      format: operation.format,
      serverId: operation.serviceId,
      externalServiceId,
      externalServiceSlug,
    };
    const targetIndex = targets.findIndex(
      (candidate) =>
        candidate.serviceType === target.serviceType &&
        candidate.format === target.format &&
        candidate.serverId === target.serverId
    );
    const nextTargets =
      targetIndex === -1
        ? [...targets, target]
        : targets.map((candidate, index) =>
            index === targetIndex ? { ...candidate, ...target } : candidate
          );
    await getRepository(MediaRequest).update(operation.requestId, {
      serviceTargets: nextTargets,
    });
    operation.request.serviceTargets = nextTargets;
  }

  private async storeBinderyBookServiceLink(
    operation: BookRequestSearch,
    bookId: number
  ): Promise<void> {
    const externalServiceSlug = operation.providerBookId ?? String(bookId);
    const media = operation.request.media;
    const mediaPatch: Partial<Media> =
      operation.format === 'audiobook'
        ? {
            audiobookServiceId: operation.serviceId,
            audiobookExternalServiceId: bookId,
            audiobookExternalServiceSlug: externalServiceSlug,
          }
        : {
            serviceId: operation.serviceId,
            externalServiceId: bookId,
            externalServiceSlug,
          };
    await getRepository(Media).update(media.id, mediaPatch);
    Object.assign(media, mediaPatch);

    const targets = operation.request.serviceTargets ?? [];
    const target: MediaRequestServiceTarget = {
      serviceType: 'readarr',
      format: operation.format,
      serverId: operation.serviceId,
      externalServiceId: bookId,
      externalServiceSlug,
    };
    const targetIndex = targets.findIndex(
      (candidate) =>
        candidate.serviceType === target.serviceType &&
        candidate.format === target.format &&
        candidate.serverId === target.serverId
    );
    const nextTargets =
      targetIndex === -1
        ? [...targets, target]
        : targets.map((candidate, index) =>
            index === targetIndex ? { ...candidate, ...target } : candidate
          );
    await getRepository(MediaRequest).update(operation.requestId, {
      serviceTargets: nextTargets,
    });
    operation.request.serviceTargets = nextTargets;
  }

  private async failBinderyRequest(
    operation: BookRequestSearch,
    message: string
  ): Promise<void> {
    const repository = getRepository(BookRequestSearch);
    const relatedOperations =
      operation.binderyRequestId == null
        ? [operation]
        : await repository.find({
            where: {
              requestId: operation.requestId,
              serviceId: operation.serviceId,
              binderyRequestId: operation.binderyRequestId,
            },
          });
    const targets = operation.request.serviceTargets ?? [];
    const failedFormats = new Set(
      relatedOperations.map((related) => related.format)
    );
    const mediaPatch: Partial<Media> = {};
    if (failedFormats.has('ebook')) {
      mediaPatch.serviceId = null;
      mediaPatch.externalServiceId = null;
      mediaPatch.externalServiceSlug = null;
    }
    if (failedFormats.has('audiobook')) {
      mediaPatch.audiobookServiceId = null;
      mediaPatch.audiobookExternalServiceId = null;
      mediaPatch.audiobookExternalServiceSlug = null;
    }
    if (Object.keys(mediaPatch).length > 0) {
      await getRepository(Media).update(operation.request.media.id, mediaPatch);
      Object.assign(operation.request.media, mediaPatch);
    }
    const nextTargets = targets.map((target) =>
      target.serviceType === 'readarr' &&
      target.serverId === operation.serviceId &&
      failedFormats.has(target.format as 'ebook' | 'audiobook')
        ? { ...target, externalServiceId: null, externalServiceSlug: null }
        : target
    );
    await getRepository(MediaRequest).update(operation.requestId, {
      serviceTargets: nextTargets,
    });
    operation.request.serviceTargets = nextTargets;

    for (const related of relatedOperations) {
      await repository.update(related.id, {
        binderyRequestId: null,
        state: 'failed',
        updatedAt: new Date(),
      });
      related.binderyRequestId = null;
      related.state = 'failed';
    }
    await this.finalizeRequest(operation.requestId, {
      stage: RequestStatusStage.FAILED,
      message,
    });
  }

  private async setState(
    operation: BookRequestSearch,
    state: BookRequestSearch['state']
  ): Promise<void> {
    if (operation.state === state) return;
    await getRepository(BookRequestSearch).update(operation.id, {
      state,
      updatedAt: new Date(),
    });
    operation.state = state;
  }

  private async finishWithoutRelease(
    operation: BookRequestSearch,
    readarr: ReadarrAPI,
    stage: RequestStatusStage.UNAVAILABLE | RequestStatusStage.FAILED,
    message: string
  ): Promise<void> {
    if (operation.createdBook && operation.bookId != null) {
      await readarr.removeBook(operation.bookId, { deleteFiles: false });
    }

    if (operation.createdAuthor && operation.authorId) {
      const remainingBooks = await readarr.getBooksByAuthor(operation.authorId);
      if (remainingBooks.length === 0) {
        await readarr.removeAuthor(operation.authorId, { deleteFiles: true });
      }
    }

    const media = operation.request.media;
    const mediaPatch: Partial<Media> = {};
    if (operation.format === 'audiobook') {
      mediaPatch.audiobookServiceId = null;
      mediaPatch.audiobookExternalServiceId = null;
      mediaPatch.audiobookExternalServiceSlug = null;
    } else {
      mediaPatch.serviceId = null;
      mediaPatch.externalServiceId = null;
      mediaPatch.externalServiceSlug = null;
    }
    await getRepository(Media).update(media.id, mediaPatch);
    const targets = operation.request.serviceTargets ?? [];
    const nextTargets = targets.map((target) =>
      target.serviceType === 'readarr' &&
      target.format === operation.format &&
      target.serverId === operation.serviceId
        ? {
            ...target,
            externalServiceId: null,
            externalServiceSlug: null,
          }
        : target
    );
    await getRepository(MediaRequest).update(operation.requestId, {
      serviceTargets: nextTargets,
    });
    operation.request.serviceTargets = nextTargets;
    await this.setState(
      operation,
      stage === RequestStatusStage.FAILED ? 'failed' : 'unavailable'
    );
    await this.finalizeRequest(operation.requestId, { stage, message });
  }

  private async finalizeRequest(
    requestId: number,
    detail?: {
      stage: RequestStatusStage.UNAVAILABLE | RequestStatusStage.FAILED;
      message: string;
    }
  ): Promise<void> {
    return runWithRequestAdmission(
      [getRequestMutationAdmissionKey(requestId)],
      () => this.finalizeLockedRequest(requestId, detail)
    );
  }

  private async finalizeLockedRequest(
    requestId: number,
    detail?: {
      stage: RequestStatusStage.UNAVAILABLE | RequestStatusStage.FAILED;
      message: string;
    }
  ): Promise<void> {
    const operations = await getRepository(BookRequestSearch).find({
      where: { requestId },
    });
    if (
      operations.length === 0 ||
      operations.some((item) => !terminalOperationStates.has(item.state))
    ) {
      return;
    }

    const request = await getRepository(MediaRequest).findOne({
      where: { id: requestId },
      relations: { media: true },
    });
    if (
      !request ||
      ![MediaRequestStatus.APPROVED, MediaRequestStatus.COMPLETED].includes(
        request.status
      )
    ) {
      await getRepository(BookRequestSearch).delete({ requestId });
      return;
    }

    const failed = operations.find((item) => item.state === 'failed');
    const unavailable = operations.find((item) => item.state === 'unavailable');
    const terminalFailure = failed ?? unavailable;
    if (!terminalFailure) {
      if (
        isProviderBookEdition(request.preferredEditionId) &&
        request.status === MediaRequestStatus.APPROVED
      ) {
        request.status = MediaRequestStatus.COMPLETED;
        request.failureReason = null;
        request.serviceTargets = request.serviceTargets?.map((target) =>
          operations.some(
            (operation) =>
              target.serviceType === 'readarr' &&
              target.serverId === operation.serviceId &&
              target.format === operation.format
          )
            ? { ...target, status: MediaStatus.AVAILABLE }
            : target
        );
        // The request admission lock is shared with cancellation. Save the full
        // entity so the existing transactional notification outbox and status
        // history subscribers observe this exact recording's completion.
        await getRepository(MediaRequest).save(request);
      }
      // Publish availability before removing the operation. Otherwise the
      // status projection loses its authoritative tracking state and falls
      // back to "Adding to library" until the next availability scan.
      await getRepository(Media).update(request.media.id, {
        status: MediaStatus.AVAILABLE,
      });
      await getRepository(BookRequestSearch).delete({ requestId });
      return;
    }

    await getRepository(BookRequestSearch).delete({ requestId });

    const stage = failed
      ? RequestStatusStage.FAILED
      : RequestStatusStage.UNAVAILABLE;
    await getRepository(MediaRequest).update(requestId, {
      status: failed ? MediaRequestStatus.FAILED : MediaRequestStatus.APPROVED,
    });
    if (
      !operations.some((item) => item.state === 'available') &&
      request.media.status !== MediaStatus.AVAILABLE
    ) {
      await getRepository(Media).update(request.media.id, {
        status: MediaStatus.UNKNOWN,
      });
    }
    await recordRequestStatusOverride(
      requestId,
      stage,
      detail?.stage === stage
        ? detail.message
        : failed
          ? 'Bookshelf search failed.'
          : 'No release found.'
    );
  }
}

const bookRequestSearchManager = new BookRequestSearchManager();

export default bookRequestSearchManager;
