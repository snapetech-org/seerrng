import BinderyAPI from '@server/api/bindery';
import ReadarrAPI from '@server/api/servarr/readarr';
import {
  MediaRequestStatus,
  MediaStatus,
  MediaType,
} from '@server/constants/media';
import { getRepository } from '@server/datasource';
import { BookRequestSearch } from '@server/entity/BookRequestSearch';
import Media from '@server/entity/Media';
import {
  MediaRequest,
  getRequestMutationAdmissionKey,
  runWithRequestAdmission,
} from '@server/entity/MediaRequest';
import MediaRequestStatusEvent from '@server/entity/MediaRequestStatusEvent';
import { User } from '@server/entity/User';
import notificationManager, { Notification } from '@server/lib/notifications';
import { getSettings } from '@server/lib/settings';
import { resetTestDb, seedTestDb } from '@server/utils/seedTestDb';
import assert from 'node:assert/strict';
import { afterEach, before, beforeEach, describe, it, mock } from 'node:test';
import bookRequestSearchManager from './bookRequestSearch';
import { RequestStatusStage } from './requestStatus';

const configureBookshelf = () => {
  getSettings().readarr = [
    {
      id: 20,
      name: 'Bookshelf',
      hostname: 'bookshelf.local',
      port: 8787,
      apiKey: 'test-key',
      useSsl: false,
      activeProfileId: 11,
      activeProfileName: 'Books',
      activeMetadataProfileId: 12,
      activeMetadataProfileName: 'Standard',
      activeDirectory: '/books',
      tags: [],
      is4k: false,
      isDefault: true,
      syncEnabled: true,
      preventSearch: false,
      tagRequests: false,
      overrideRule: [],
      serviceType: 'ebook',
    },
  ];
};

const configureBindery = () => {
  getSettings().readarr = [
    {
      id: 20,
      name: 'Bindery',
      hostname: 'bindery.local',
      port: 8787,
      apiKey: 'test-key',
      useSsl: false,
      activeProfileId: 0,
      activeProfileName: 'Bindery managed',
      activeMetadataProfileId: 0,
      activeMetadataProfileName: 'Bindery managed',
      activeDirectory: '/',
      tags: [],
      is4k: false,
      isDefault: true,
      syncEnabled: true,
      preventSearch: true,
      tagRequests: false,
      overrideRule: [],
      backend: 'bindery',
      serviceType: 'both',
    },
  ];
};

const createTrackedRequest = async (options: {
  createdBook: boolean;
  createdAuthor: boolean;
  pendingId?: number;
  binderyRequestId?: number;
  providerBookId?: string;
  monitoring?: boolean;
  providerManagedSearch?: boolean;
}) => {
  const pending =
    options.pendingId !== undefined || options.binderyRequestId !== undefined;
  const requestedBy = await getRepository(User).findOneByOrFail({
    email: 'friend@seerr.dev',
  });
  const media = await getRepository(Media).save(
    new Media({
      mediaType: MediaType.BOOK,
      tmdbId: 0,
      status: MediaStatus.PROCESSING,
      status4k: MediaStatus.UNKNOWN,
      serviceId: 20,
      externalServiceId: pending ? null : 55,
      externalServiceSlug: options.providerBookId ?? 'tracked-book',
    })
  );
  const request = await getRepository(MediaRequest).save(
    new MediaRequest({
      type: MediaType.BOOK,
      status: MediaRequestStatus.COMPLETED,
      is4k: false,
      bookFormat: 'ebook',
      media,
      requestedBy,
    })
  );
  await getRepository(BookRequestSearch).save(
    new BookRequestSearch({
      requestId: request.id,
      serviceId: 20,
      format: 'ebook',
      bookId: pending ? null : 55,
      providerBookId: options.providerBookId ?? 'hc:book-55',
      pendingId: options.pendingId ?? null,
      binderyRequestId: options.binderyRequestId ?? null,
      authorId: 77,
      commandId: pending || options.monitoring ? null : 901,
      createdBook: options.createdBook,
      createdAuthor: options.createdAuthor,
      providerManagedSearch: options.providerManagedSearch ?? false,
      state: pending
        ? 'pending'
        : options.monitoring
          ? 'monitoring'
          : 'searching',
    })
  );
  return { media, request };
};

const mockCurrentBooks = (fileCounts: Record<number, number> = {}) =>
  mock.method(
    ReadarrAPI.prototype,
    'getBookIfExists',
    async (bookId: number) => ({
      id: bookId,
      title: 'Tracked Book',
      foreignBookId: bookId === 66 ? 'hc:book-66' : 'hc:book-55',
      statistics: { bookFileCount: fileCounts[bookId] ?? 0 },
    })
  );

describe('BookRequestSearchManager', () => {
  before(async () => {
    await seedTestDb();
  });

  beforeEach(async () => {
    await resetTestDb();
    configureBookshelf();
  });

  afterEach(() => {
    mock.restoreAll();
    getSettings().readarr = [];
  });

  it('completes an exact recording through notification and status history subscribers once', async () => {
    const { request } = await createTrackedRequest({
      createdBook: false,
      createdAuthor: false,
    });
    await getRepository(MediaRequest).update(request.id, {
      status: MediaRequestStatus.APPROVED,
      preferredEditionId: 'hc:voice-2',
      serviceTargets: [
        {
          serviceType: 'readarr',
          serverId: 20,
          format: 'ebook',
          status: MediaStatus.PROCESSING,
        },
      ],
    });
    await getRepository(BookRequestSearch).update(
      { requestId: request.id },
      { state: 'available', providerEditionId: 'hc:voice-2' }
    );
    const notification = mock.method(
      notificationManager,
      'sendNotificationIntent'
    );
    notification.mock.mockImplementation(async () => undefined);

    await bookRequestSearchManager.run();

    const saved = await getRepository(MediaRequest).findOneByOrFail({
      id: request.id,
    });
    assert.equal(saved.status, MediaRequestStatus.COMPLETED);
    assert.equal(saved.serviceTargets?.[0].status, MediaStatus.AVAILABLE);
    assert.equal(notification.mock.callCount(), 1);
    assert.equal(
      notification.mock.calls[0].arguments[0],
      Notification.MEDIA_AVAILABLE
    );
    assert.deepEqual(notification.mock.calls[0].arguments[1], {
      kind: 'media-request',
      requestId: request.id,
    });
    const history = await getRepository(MediaRequestStatusEvent).findBy({
      requestId: request.id,
    });
    assert.ok(
      history.some((event) => event.stage === RequestStatusStage.AVAILABLE)
    );

    await bookRequestSearchManager.run();
    assert.equal(notification.mock.callCount(), 1);
  });

  it('does not complete a recording after cancellation wins the request admission lock', async () => {
    const { request } = await createTrackedRequest({
      createdBook: false,
      createdAuthor: false,
    });
    await getRepository(MediaRequest).update(request.id, {
      status: MediaRequestStatus.APPROVED,
      preferredEditionId: 'hc:voice-2',
    });
    await getRepository(BookRequestSearch).update(
      { requestId: request.id },
      { state: 'available', providerEditionId: 'hc:voice-2' }
    );
    let entered!: () => void;
    let release!: () => void;
    const locked = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const cancellation = runWithRequestAdmission(
      [getRequestMutationAdmissionKey(request.id)],
      async () => {
        entered();
        await gate;
        await getRepository(MediaRequest).update(request.id, {
          status: MediaRequestStatus.DECLINED,
        });
      }
    );
    await locked;
    const completion = bookRequestSearchManager.run();
    release();
    await Promise.all([cancellation, completion]);

    const saved = await getRepository(MediaRequest).findOneByOrFail({
      id: request.id,
    });
    assert.equal(saved.status, MediaRequestStatus.DECLINED);
    assert.equal(
      await getRepository(BookRequestSearch).countBy({ requestId: request.id }),
      0
    );
  });

  it('keeps an active Bookshelf command in the searching state', async () => {
    const { request } = await createTrackedRequest({
      createdBook: true,
      createdAuthor: true,
    });
    mock.method(ReadarrAPI.prototype, 'getCommand', async () => ({
      id: 901,
      name: 'BookSearch',
      status: 'started',
    }));

    await bookRequestSearchManager.run();

    const operation = await getRepository(BookRequestSearch).findOneByOrFail({
      requestId: request.id,
    });
    assert.equal(operation.state, 'searching');
  });

  it('settles Bindery request tracking only after the format appears in its imported library', async () => {
    configureBindery();
    getSettings().readarr[0].serviceType = 'ebook';
    const { media, request } = await createTrackedRequest({
      createdBook: true,
      createdAuthor: false,
      monitoring: true,
      providerBookId: 'hc:book-55',
    });
    mock.method(BinderyAPI.prototype, 'getImportedBooks', async () => [
      {
        id: 55,
        foreignBookId: 'hc:book-55',
        title: 'Tracked Book',
      },
    ]);

    await bookRequestSearchManager.run();

    assert.equal(
      await getRepository(BookRequestSearch).countBy({ requestId: request.id }),
      0
    );
    const updatedMedia = await getRepository(Media).findOneByOrFail({
      id: media.id,
    });
    assert.equal(updatedMedia.status, MediaStatus.AVAILABLE);
  });

  it('waits for Bindery approval without losing the linked request ID', async () => {
    configureBindery();
    const { request } = await createTrackedRequest({
      createdBook: false,
      createdAuthor: false,
      binderyRequestId: 91,
      providerBookId: 'OL27448W',
    });
    mock.method(BinderyAPI.prototype, 'getImportedBooks', async () => []);
    const requestScan = mock.method(
      BinderyAPI.prototype,
      'getRequestsById',
      async (ids: ReadonlySet<number>) => {
        assert.deepEqual([...ids], [91]);
        return {
          requests: new Map([
            [
              91,
              {
                id: 91,
                kind: 'book' as const,
                foreignId: 'OL27448W',
                mediaType: 'ebook' as const,
                status: 'pending' as const,
              },
            ],
          ]),
          complete: true,
        };
      }
    );
    const downloadScan = mock.method(
      BinderyAPI.prototype,
      'getQueue',
      async () => {
        throw new Error('An unapproved request has no acquisition queue.');
      }
    );

    await bookRequestSearchManager.run();

    const operation = await getRepository(BookRequestSearch).findOneByOrFail({
      requestId: request.id,
    });
    assert.equal(operation.state, 'pending');
    assert.equal(operation.binderyRequestId, 91);
    assert.equal(requestScan.mock.callCount(), 1);
    assert.equal(downloadScan.mock.callCount(), 0);
  });

  it('tracks Bindery approval, download progress, and the new library link', async () => {
    configureBindery();
    const { media, request } = await createTrackedRequest({
      createdBook: false,
      createdAuthor: false,
      binderyRequestId: 91,
      providerBookId: 'OL27448W',
    });
    mock.method(BinderyAPI.prototype, 'getImportedBooks', async () => []);
    mock.method(BinderyAPI.prototype, 'getRequestsById', async () => ({
      requests: new Map([
        [
          91,
          {
            id: 91,
            kind: 'book' as const,
            foreignId: 'OL27448W',
            mediaType: 'ebook' as const,
            status: 'approved' as const,
            resultBookId: 55,
          },
        ],
      ]),
      complete: true,
    }));
    mock.method(BinderyAPI.prototype, 'getQueue', async () => [
      { id: 601, bookId: 55, status: 'downloading' },
    ]);

    await bookRequestSearchManager.run();

    const operation = await getRepository(BookRequestSearch).findOneByOrFail({
      requestId: request.id,
    });
    assert.equal(operation.state, 'grabbed');
    assert.equal(operation.binderyRequestId, null);
    assert.equal(operation.bookId, 55);
    const updatedMedia = await getRepository(Media).findOneByOrFail({
      id: media.id,
    });
    assert.equal(updatedMedia.serviceId, 20);
    assert.equal(updatedMedia.externalServiceId, 55);
    assert.equal(updatedMedia.externalServiceSlug, 'OL27448W');
  });

  it('reports Bindery import progress and a bounded failure message', async () => {
    configureBindery();
    const { request } = await createTrackedRequest({
      createdBook: false,
      createdAuthor: false,
      binderyRequestId: 91,
      providerBookId: 'OL27448W',
    });
    mock.method(BinderyAPI.prototype, 'getImportedBooks', async () => []);
    mock.method(BinderyAPI.prototype, 'getRequestsById', async () => ({
      requests: new Map([
        [
          91,
          {
            id: 91,
            kind: 'book' as const,
            foreignId: 'OL27448W',
            mediaType: 'ebook' as const,
            status: 'approved' as const,
            resultBookId: 55,
          },
        ],
      ]),
      complete: true,
    }));
    mock.method(BinderyAPI.prototype, 'getQueue', async () => [
      { id: 601, bookId: 55, trackedDownloadState: 'importing' },
    ]);

    await bookRequestSearchManager.run();

    const operation = await getRepository(BookRequestSearch).findOneByOrFail({
      requestId: request.id,
    });
    assert.equal(operation.state, 'importing');

    await resetTestDb();
    configureBindery();
    const failed = await createTrackedRequest({
      createdBook: false,
      createdAuthor: false,
      binderyRequestId: 92,
      providerBookId: 'OL27449W',
    });
    mock.restoreAll();
    mock.method(BinderyAPI.prototype, 'getImportedBooks', async () => []);
    mock.method(BinderyAPI.prototype, 'getRequestsById', async () => ({
      requests: new Map([
        [
          92,
          {
            id: 92,
            kind: 'book' as const,
            foreignId: 'OL27449W',
            mediaType: 'ebook' as const,
            status: 'approved' as const,
            resultBookId: 56,
          },
        ],
      ]),
      complete: true,
    }));
    mock.method(BinderyAPI.prototype, 'getQueue', async () => [
      { id: 602, bookId: 56, status: 'failed' },
    ]);

    await bookRequestSearchManager.run();

    assert.equal(
      await getRepository(MediaRequest)
        .findOneByOrFail({ id: failed.request.id })
        .then((value) => value.status),
      MediaRequestStatus.FAILED
    );
    const statusEvent = await getRepository(
      MediaRequestStatusEvent
    ).findOneOrFail({
      where: { requestId: failed.request.id },
      order: { id: 'DESC' },
    });
    assert.equal(statusEvent.stage, RequestStatusStage.FAILED);
    assert.match(statusEvent.message ?? '', /connected book service/);
    assert.doesNotMatch(statusEvent.message ?? '', /Bindery internal reason/);
    assert.equal(
      await getRepository(BookRequestSearch).countBy({
        requestId: failed.request.id,
      }),
      0
    );
  });

  it('syncs Bindery declines and only fails missing requests after a complete queue scan', async () => {
    configureBindery();
    const declined = await createTrackedRequest({
      createdBook: false,
      createdAuthor: false,
      binderyRequestId: 91,
      providerBookId: 'OL27448W',
    });
    mock.method(BinderyAPI.prototype, 'getImportedBooks', async () => []);
    mock.method(BinderyAPI.prototype, 'getRequestsById', async () => ({
      requests: new Map([
        [
          91,
          {
            id: 91,
            kind: 'book' as const,
            foreignId: 'OL27448W',
            mediaType: 'ebook' as const,
            status: 'declined' as const,
            declineReason: 'private service-side reason',
          },
        ],
      ]),
      complete: true,
    }));

    await bookRequestSearchManager.run();

    const statusEvent = await getRepository(
      MediaRequestStatusEvent
    ).findOneOrFail({
      where: { requestId: declined.request.id },
      order: { id: 'DESC' },
    });
    assert.equal(statusEvent.stage, RequestStatusStage.FAILED);
    assert.match(statusEvent.message ?? '', /Bindery declined this request/);
    assert.doesNotMatch(
      statusEvent.message ?? '',
      /private service-side reason/
    );

    await resetTestDb();
    configureBindery();
    const missing = await createTrackedRequest({
      createdBook: false,
      createdAuthor: false,
      binderyRequestId: 92,
      providerBookId: 'OL27449W',
    });
    mock.restoreAll();
    mock.method(BinderyAPI.prototype, 'getImportedBooks', async () => []);
    mock.method(BinderyAPI.prototype, 'getRequestsById', async () => ({
      requests: new Map(),
      complete: true,
    }));

    await bookRequestSearchManager.run();

    assert.equal(
      await getRepository(MediaRequest)
        .findOneByOrFail({ id: missing.request.id })
        .then((value) => value.status),
      MediaRequestStatus.FAILED
    );

    await resetTestDb();
    configureBindery();
    const notProvenMissing = await createTrackedRequest({
      createdBook: false,
      createdAuthor: false,
      binderyRequestId: 93,
      providerBookId: 'OL27450W',
    });
    mock.restoreAll();
    mock.method(BinderyAPI.prototype, 'getImportedBooks', async () => []);
    mock.method(BinderyAPI.prototype, 'getRequestsById', async () => ({
      requests: new Map(),
      complete: false,
    }));

    await bookRequestSearchManager.run();

    const retained = await getRepository(BookRequestSearch).findOneByOrFail({
      requestId: notProvenMissing.request.id,
    });
    assert.equal(retained.state, 'pending');
    assert.equal(retained.binderyRequestId, 93);
  });

  it('keeps a queued Chaptarr author import pending while its format retries', async () => {
    const { request } = await createTrackedRequest({
      createdBook: false,
      createdAuthor: false,
      pendingId: 901,
      providerBookId: 'hc:book-17',
    });
    mock.method(ReadarrAPI.prototype, 'getPendingAuthorImport', async () => ({
      id: 901,
      overallStatus: 'Retrying',
      ebookStatus: 'Retrying',
      audiobookStatus: 'NotRequested',
    }));
    const lookupMock = mock.method(
      ReadarrAPI.prototype,
      'lookupBookByProviderIdentity',
      async () => undefined
    );

    await bookRequestSearchManager.run();

    const operation = await getRepository(BookRequestSearch).findOneByOrFail({
      requestId: request.id,
    });
    assert.equal(operation.state, 'pending');
    assert.equal(operation.pendingId, 901);
    assert.equal(operation.bookId, null);
    assert.equal(operation.commandId, null);
    assert.equal(lookupMock.mock.calls.length, 0);
  });

  it('tracks provider-owned acquisition after a prepared Chaptarr book is added', async () => {
    const { media, request } = await createTrackedRequest({
      createdBook: false,
      createdAuthor: false,
      pendingId: 902,
      providerBookId: 'hc:book-18',
    });
    mock.method(ReadarrAPI.prototype, 'getPendingAuthorImport', async () => ({
      id: 902,
      overallStatus: 'Succeeded',
      ebookStatus: 'Succeeded',
      audiobookStatus: 'NotRequested',
    }));
    mock.method(
      ReadarrAPI.prototype,
      'lookupBookByProviderIdentity',
      async () => ({
        id: 56,
        title: 'Prepared Book',
        titleSlug: 'prepared-book',
        foreignBookId: 'hc:book-18',
      })
    );
    mock.method(ReadarrAPI.prototype, 'addBook', async () => ({
      id: 56,
      title: 'Prepared Book',
      titleSlug: 'prepared-book',
      foreignBookId: 'hc:book-18',
      authorId: 78,
      createdBook: true,
      createdAuthor: false,
    }));
    mock.method(ReadarrAPI.prototype, 'getBookIfExists', async () => ({
      id: 56,
      title: 'Prepared Book',
      foreignBookId: 'hc:book-18',
      statistics: { bookFileCount: 0 },
    }));
    const startBookSearch = mock.method(
      ReadarrAPI.prototype,
      'startBookSearch',
      async () => ({ id: 903, name: 'BookSearch', status: 'started' })
    );
    const getCommand = mock.method(
      ReadarrAPI.prototype,
      'getCommand',
      async () => {
        throw new Error('provider-managed requests do not poll commands');
      }
    );

    await bookRequestSearchManager.run();

    const operation = await getRepository(BookRequestSearch).findOneByOrFail({
      requestId: request.id,
    });
    assert.equal(operation.state, 'monitoring');
    assert.equal(operation.pendingId, null);
    assert.equal(operation.bookId, 56);
    assert.equal(operation.commandId, null);
    assert.equal(operation.providerManagedSearch, true);
    assert.equal(startBookSearch.mock.callCount(), 0);
    assert.equal(getCommand.mock.callCount(), 0);
    const updatedMedia = await getRepository(Media).findOneByOrFail({
      id: media.id,
    });
    assert.equal(updatedMedia.externalServiceId, 56);
    assert.equal(updatedMedia.externalServiceSlug, 'prepared-book');

    await bookRequestSearchManager.run();

    const monitoring = await getRepository(BookRequestSearch).findOneByOrFail({
      requestId: request.id,
    });
    assert.equal(monitoring.state, 'monitoring');
    assert.equal(monitoring.commandId, null);
    assert.equal(startBookSearch.mock.callCount(), 0);
    assert.equal(getCommand.mock.callCount(), 0);
  });

  it('starts and tracks BookSearch until the library scan finds a file', async () => {
    const { media, request } = await createTrackedRequest({
      createdBook: true,
      createdAuthor: true,
      monitoring: true,
    });
    let fileCount = 0;
    const currentBook = mock.method(
      ReadarrAPI.prototype,
      'getBookIfExists',
      async (bookId: number) => ({
        id: bookId,
        title: 'Tracked Book',
        foreignBookId: 'hc:book-55',
        statistics: { bookFileCount: fileCount },
      })
    );
    let commandStatus = 'started';
    const getCommand = mock.method(
      ReadarrAPI.prototype,
      'getCommand',
      async () => ({
        id: 902,
        name: 'BookSearch',
        status: commandStatus,
      })
    );
    mock.method(ReadarrAPI.prototype, 'getQueue', async () => []);
    mock.method(ReadarrAPI.prototype, 'getBookHistory', async () => []);
    const startBookSearch = mock.method(
      ReadarrAPI.prototype,
      'startBookSearch',
      async () => ({ id: 902, name: 'BookSearch', status: 'started' })
    );
    const removeBook = mock.method(
      ReadarrAPI.prototype,
      'removeBook',
      async () => undefined
    );

    await bookRequestSearchManager.run();

    const operation = await getRepository(BookRequestSearch).findOneByOrFail({
      requestId: request.id,
    });
    assert.equal(operation.state, 'searching');
    assert.equal(operation.commandId, 902);
    assert.equal(currentBook.mock.callCount(), 1);
    assert.equal(getCommand.mock.callCount(), 0);
    assert.equal(startBookSearch.mock.callCount(), 1);
    assert.equal(removeBook.mock.callCount(), 0);

    commandStatus = 'completed';
    await bookRequestSearchManager.run();

    const settling = await getRepository(BookRequestSearch).findOneByOrFail({
      requestId: request.id,
    });
    assert.equal(getCommand.mock.callCount(), 1);
    assert.equal(settling.state, 'settling');
    assert.equal(removeBook.mock.callCount(), 0);

    fileCount = 1;
    await bookRequestSearchManager.run();

    assert.equal(
      await getRepository(BookRequestSearch).countBy({ requestId: request.id }),
      0
    );
    const updatedMedia = await getRepository(Media).findOneByOrFail({
      id: media.id,
    });
    assert.equal(updatedMedia.status, MediaStatus.AVAILABLE);
    assert.equal(getCommand.mock.callCount(), 2);
    assert.equal(startBookSearch.mock.callCount(), 1);
    assert.equal(removeBook.mock.callCount(), 0);
  });

  it('lets Bookshelf manage search and tracks only library availability', async () => {
    const { media, request } = await createTrackedRequest({
      createdBook: true,
      createdAuthor: true,
      monitoring: true,
      providerManagedSearch: true,
    });
    let fileCount = 0;
    mock.method(
      ReadarrAPI.prototype,
      'getBookIfExists',
      async (bookId: number) => ({
        id: bookId,
        title: 'Provider managed book',
        foreignBookId: 'hc:book-55',
        statistics: { bookFileCount: fileCount },
      })
    );
    const startBookSearch = mock.method(
      ReadarrAPI.prototype,
      'startBookSearch',
      async () => ({ id: 905, name: 'BookSearch', status: 'started' })
    );
    const getCommand = mock.method(
      ReadarrAPI.prototype,
      'getCommand',
      async () => {
        throw new Error('provider-managed requests do not poll commands');
      }
    );
    const getQueue = mock.method(ReadarrAPI.prototype, 'getQueue', async () => {
      throw new Error('provider-managed requests do not poll queues');
    });
    const getBookHistory = mock.method(
      ReadarrAPI.prototype,
      'getBookHistory',
      async () => {
        throw new Error(
          'provider-managed requests do not poll download history'
        );
      }
    );

    await bookRequestSearchManager.run();

    const monitoring = await getRepository(BookRequestSearch).findOneByOrFail({
      requestId: request.id,
    });
    assert.equal(monitoring.state, 'monitoring');
    assert.equal(startBookSearch.mock.callCount(), 0);
    assert.equal(getCommand.mock.callCount(), 0);
    assert.equal(getQueue.mock.callCount(), 0);
    assert.equal(getBookHistory.mock.callCount(), 0);

    fileCount = 1;
    await bookRequestSearchManager.run();

    assert.equal(
      await getRepository(BookRequestSearch).countBy({ requestId: request.id }),
      0
    );
    assert.equal(
      (await getRepository(Media).findOneByOrFail({ id: media.id })).status,
      MediaStatus.AVAILABLE
    );
    assert.equal(startBookSearch.mock.callCount(), 0);
    assert.equal(getCommand.mock.callCount(), 0);
  });

  it('retries starting a BookSearch command after a temporary failure', async () => {
    const { request } = await createTrackedRequest({
      createdBook: true,
      createdAuthor: true,
      monitoring: true,
    });
    mockCurrentBooks();
    let attempts = 0;
    const startBookSearch = mock.method(
      ReadarrAPI.prototype,
      'startBookSearch',
      async () => {
        attempts += 1;
        if (attempts === 1) throw new Error('Temporary command API failure.');
        return { id: 904, name: 'BookSearch', status: 'queued' };
      }
    );

    await bookRequestSearchManager.run();

    const retryable = await getRepository(BookRequestSearch).findOneByOrFail({
      requestId: request.id,
    });
    assert.equal(retryable.state, 'monitoring');
    assert.equal(retryable.commandId, null);

    await bookRequestSearchManager.run();

    const searching = await getRepository(BookRequestSearch).findOneByOrFail({
      requestId: request.id,
    });
    assert.equal(searching.state, 'searching');
    assert.equal(searching.commandId, 904);
    assert.equal(startBookSearch.mock.callCount(), 2);
  });

  it('reports no release and removes only records it created', async () => {
    const { media, request } = await createTrackedRequest({
      createdBook: true,
      createdAuthor: true,
    });
    mock.method(ReadarrAPI.prototype, 'getCommand', async () => ({
      id: 901,
      name: 'BookSearch',
      status: 'completed',
    }));
    mockCurrentBooks();
    mock.method(ReadarrAPI.prototype, 'getQueue', async () => []);
    mock.method(ReadarrAPI.prototype, 'getBookHistory', async () => []);
    const removedBooks: number[] = [];
    const removedAuthors: number[] = [];
    mock.method(ReadarrAPI.prototype, 'removeBook', async (bookId: number) => {
      removedBooks.push(bookId);
    });
    mock.method(ReadarrAPI.prototype, 'getBooksByAuthor', async () => []);
    mock.method(
      ReadarrAPI.prototype,
      'removeAuthor',
      async (authorId: number) => {
        removedAuthors.push(authorId);
      }
    );

    await bookRequestSearchManager.run();
    assert.deepEqual(removedBooks, []);
    assert.deepEqual(removedAuthors, []);
    const settling = await getRepository(BookRequestSearch).findOneByOrFail({
      requestId: request.id,
    });
    assert.equal(settling.state, 'settling');
    await getRepository(BookRequestSearch).update(settling.id, {
      updatedAt: new Date(Date.now() - 60_000),
    });
    await bookRequestSearchManager.run();

    assert.deepEqual(removedBooks, [55]);
    assert.deepEqual(removedAuthors, [77]);
    assert.equal(
      await getRepository(BookRequestSearch).countBy({ requestId: request.id }),
      0
    );
    const updatedMedia = await getRepository(Media).findOneByOrFail({
      id: media.id,
    });
    assert.equal(updatedMedia.serviceId, null);
    assert.equal(updatedMedia.externalServiceId, null);
    assert.equal(updatedMedia.status, MediaStatus.UNKNOWN);
    const updatedRequest = await getRepository(MediaRequest).findOneByOrFail({
      id: request.id,
    });
    assert.equal(updatedRequest.status, MediaRequestStatus.APPROVED);
    const event = await getRepository(MediaRequestStatusEvent).findOneByOrFail({
      requestId: request.id,
      stage: RequestStatusStage.UNAVAILABLE,
    });
    assert.equal(event.message, 'No release found.');
  });

  it('preserves pre-existing Bookshelf records after no result', async () => {
    const { request } = await createTrackedRequest({
      createdBook: false,
      createdAuthor: false,
    });
    mock.method(ReadarrAPI.prototype, 'getCommand', async () => ({
      id: 901,
      name: 'BookSearch',
      status: 'completed',
    }));
    mockCurrentBooks();
    mock.method(ReadarrAPI.prototype, 'getQueue', async () => []);
    mock.method(ReadarrAPI.prototype, 'getBookHistory', async () => []);
    let removalAttempted = false;
    mock.method(ReadarrAPI.prototype, 'removeBook', async () => {
      removalAttempted = true;
    });
    mock.method(ReadarrAPI.prototype, 'removeAuthor', async () => {
      removalAttempted = true;
    });

    await bookRequestSearchManager.run();
    const settling = await getRepository(BookRequestSearch).findOneByOrFail({
      requestId: request.id,
    });
    await getRepository(BookRequestSearch).update(settling.id, {
      updatedAt: new Date(Date.now() - 60_000),
    });
    await bookRequestSearchManager.run();

    assert.equal(removalAttempted, false);
    assert.equal(
      await getRepository(BookRequestSearch).countBy({ requestId: request.id }),
      0
    );
  });

  it('reports a confirmed Bookshelf download failure', async () => {
    const { request } = await createTrackedRequest({
      createdBook: true,
      createdAuthor: false,
    });
    mock.method(ReadarrAPI.prototype, 'getCommand', async () => ({
      id: 901,
      name: 'BookSearch',
      status: 'completed',
    }));
    mockCurrentBooks();
    mock.method(ReadarrAPI.prototype, 'getQueue', async () => []);
    mock.method(ReadarrAPI.prototype, 'getBookHistory', async () => [
      {
        id: 1,
        bookId: 55,
        eventType: 'downloadFailed',
        date: new Date(Date.now() + 1_000).toISOString(),
      },
    ]);
    mock.method(ReadarrAPI.prototype, 'removeBook', async () => undefined);

    await bookRequestSearchManager.run();

    const updatedRequest = await getRepository(MediaRequest).findOneByOrFail({
      id: request.id,
    });
    assert.equal(updatedRequest.status, MediaRequestStatus.FAILED);
    const event = await getRepository(MediaRequestStatusEvent).findOneByOrFail({
      requestId: request.id,
      stage: RequestStatusStage.FAILED,
    });
    assert.equal(event.message, 'Bookshelf download or import failed.');
  });

  it('reports importing when a grabbed book has left the live queue', async () => {
    const { request } = await createTrackedRequest({
      createdBook: true,
      createdAuthor: false,
    });
    mock.method(ReadarrAPI.prototype, 'getCommand', async () => ({
      id: 901,
      name: 'BookSearch',
      status: 'completed',
    }));
    mockCurrentBooks();
    mock.method(ReadarrAPI.prototype, 'getQueue', async () => []);
    mock.method(ReadarrAPI.prototype, 'getBookHistory', async () => [
      {
        id: 1,
        bookId: 55,
        eventType: 'grabbed',
        date: new Date(Date.now() + 1_000).toISOString(),
      },
    ]);

    await bookRequestSearchManager.run();

    const operation = await getRepository(BookRequestSearch).findOneByOrFail({
      requestId: request.id,
    });
    assert.equal(operation.state, 'importing');
  });

  it('finishes tracking after Bookshelf confirms an imported file', async () => {
    const { media, request } = await createTrackedRequest({
      createdBook: true,
      createdAuthor: true,
    });
    mock.method(ReadarrAPI.prototype, 'getCommand', async () => ({
      id: 901,
      name: 'BookSearch',
      status: 'completed',
    }));
    mockCurrentBooks({ 55: 1 });
    mock.method(ReadarrAPI.prototype, 'getQueue', async () => []);
    mock.method(ReadarrAPI.prototype, 'getBookHistory', async () => []);

    await bookRequestSearchManager.run();

    assert.equal(
      await getRepository(BookRequestSearch).countBy({ requestId: request.id }),
      0
    );
    const updatedMedia = await getRepository(Media).findOneByOrFail({
      id: media.id,
    });
    assert.equal(updatedMedia.serviceId, 20);
    assert.equal(updatedMedia.externalServiceId, 55);
    assert.equal(updatedMedia.status, MediaStatus.AVAILABLE);
  });

  it('finishes a both-format request after both searches settle', async () => {
    getSettings().readarr.push({
      ...getSettings().readarr[0],
      id: 21,
      name: 'Audiobook Bookshelf',
      hostname: 'audiobooks.local',
      serviceType: 'audiobook',
    });
    const { media, request } = await createTrackedRequest({
      createdBook: true,
      createdAuthor: true,
    });
    await getRepository(MediaRequest).update(request.id, {
      bookFormat: 'both',
    });
    await getRepository(Media).update(media.id, {
      audiobookServiceId: 21,
      audiobookExternalServiceId: 66,
      audiobookExternalServiceSlug: 'tracked-audiobook',
    });
    await getRepository(BookRequestSearch).save(
      new BookRequestSearch({
        requestId: request.id,
        serviceId: 21,
        format: 'audiobook',
        bookId: 66,
        providerBookId: 'hc:book-66',
        authorId: 88,
        commandId: 902,
        createdBook: true,
        createdAuthor: true,
        state: 'searching',
      })
    );

    mock.method(
      ReadarrAPI.prototype,
      'getCommand',
      async (commandId: number) => ({
        id: commandId,
        name: 'BookSearch',
        status: 'completed',
      })
    );
    mockCurrentBooks({ 66: 1 });
    mock.method(ReadarrAPI.prototype, 'getQueue', async () => []);
    mock.method(ReadarrAPI.prototype, 'getBookHistory', async () => []);
    const removedBooks: number[] = [];
    mock.method(ReadarrAPI.prototype, 'removeBook', async (bookId: number) => {
      removedBooks.push(bookId);
    });
    mock.method(ReadarrAPI.prototype, 'getBooksByAuthor', async () => []);
    mock.method(ReadarrAPI.prototype, 'removeAuthor', async () => undefined);

    await bookRequestSearchManager.run();
    const ebookSearch = await getRepository(BookRequestSearch).findOneByOrFail({
      requestId: request.id,
      format: 'ebook',
    });
    assert.equal(ebookSearch.state, 'settling');
    const audiobookSearch = await getRepository(
      BookRequestSearch
    ).findOneByOrFail({ requestId: request.id, format: 'audiobook' });
    assert.equal(audiobookSearch.state, 'available');

    await getRepository(BookRequestSearch).update(ebookSearch.id, {
      updatedAt: new Date(Date.now() - 60_000),
    });
    await bookRequestSearchManager.run();

    assert.deepEqual(removedBooks, [55]);
    assert.equal(
      await getRepository(BookRequestSearch).countBy({ requestId: request.id }),
      0
    );
    const updatedMedia = await getRepository(Media).findOneByOrFail({
      id: media.id,
    });
    assert.equal(updatedMedia.externalServiceId, null);
    assert.equal(updatedMedia.audiobookExternalServiceId, 66);
    assert.equal(updatedMedia.status, MediaStatus.PROCESSING);
    const updatedRequest = await getRepository(MediaRequest).findOneByOrFail({
      id: request.id,
    });
    assert.equal(updatedRequest.status, MediaRequestStatus.APPROVED);
  });
});
