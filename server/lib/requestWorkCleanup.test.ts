import BinderyAPI from '@server/api/bindery';
import BackIssueAPI from '@server/api/comics/backissue';
import KapowarrAPI from '@server/api/comics/kapowarr';
import ReadarrAPI from '@server/api/servarr/readarr';
import {
  MediaRequestStatus,
  MediaStatus,
  MediaType,
} from '@server/constants/media';
import { getRepository } from '@server/datasource';
import { BookRequestSearch } from '@server/entity/BookRequestSearch';
import Media from '@server/entity/Media';
import { MediaRequest } from '@server/entity/MediaRequest';
import { User } from '@server/entity/User';
import requestDispatchManager from '@server/lib/requestDispatch';
import { getSettings } from '@server/lib/settings';
import { resetTestDb, seedTestDb } from '@server/utils/seedTestDb';
import assert from 'node:assert/strict';
import { afterEach, before, beforeEach, describe, it, mock } from 'node:test';
import requestWorkCleanupManager, {
  RequestWorkCleanupError,
} from './requestWorkCleanup';

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
  configureBookshelf();
  getSettings().readarr[0] = {
    ...getSettings().readarr[0],
    backend: 'bindery',
    serviceType: 'both',
  };
};

const createActiveBookRequest = async () => {
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
      externalServiceId: 55,
      externalServiceSlug: 'cleanup-book',
    })
  );
  const request = await getRepository(MediaRequest).save(
    new MediaRequest({
      type: MediaType.BOOK,
      status: MediaRequestStatus.COMPLETED,
      bookFormat: 'ebook',
      media,
      requestedBy,
      is4k: false,
    })
  );
  await getRepository(BookRequestSearch).save(
    new BookRequestSearch({
      requestId: request.id,
      serviceId: 20,
      format: 'ebook',
      bookId: 55,
      authorId: 77,
      commandId: 901,
      createdBook: true,
      createdAuthor: true,
      state: 'grabbed',
    })
  );
  return request;
};

const createActiveComicRequest = async (
  comicServiceType: 'mylar' | 'kapowarr' | 'backissue'
) => {
  const requestedBy = await getRepository(User).findOneByOrFail({
    email: 'friend@seerr.dev',
  });
  const media = await getRepository(Media).save(
    new Media({
      mediaType: MediaType.COMIC,
      tmdbId: 0,
      status: MediaStatus.PROCESSING,
      status4k: MediaStatus.UNKNOWN,
      serviceId: 40,
      externalServiceId: 1,
      comicServiceType,
    })
  );
  return getRepository(MediaRequest).save(
    new MediaRequest({
      type: MediaType.COMIC,
      status: MediaRequestStatus.APPROVED,
      media,
      requestedBy,
      is4k: false,
      serverId: 40,
    })
  );
};

describe('RequestWorkCleanupManager', () => {
  before(async () => {
    await seedTestDb();
  });

  beforeEach(async () => {
    await resetTestDb();
    configureBookshelf();
    getSettings().backissue = [];
    mock.method(requestDispatchManager, 'cancel', async () => undefined);
  });

  afterEach(() => {
    mock.restoreAll();
    getSettings().readarr = [];
    getSettings().mylar = [];
    getSettings().kapowarr = [];
    getSettings().backissue = [];
  });

  it('preserves an imported ebook while cancelling the still-pending audiobook', async () => {
    const request = await createActiveBookRequest();
    request.bookFormat = 'both';
    await getRepository(MediaRequest).save(request);
    const operation = await getRepository(BookRequestSearch).findOneByOrFail({
      requestId: request.id,
    });
    await getRepository(BookRequestSearch).update(operation.id, {
      state: 'available',
      commandId: null,
    });
    await getRepository(Media).update(request.media.id, {
      status: MediaStatus.AVAILABLE,
      availableEbookServiceIds: [20],
    });
    getSettings().readarr.push({
      ...getSettings().readarr[0],
      id: 21,
      serviceType: 'audiobook',
    });
    await getRepository(BookRequestSearch).save(
      new BookRequestSearch({
        requestId: request.id,
        serviceId: 21,
        format: 'audiobook',
        bookId: null,
        pendingId: 904,
        state: 'pending',
        createdBook: false,
        createdAuthor: false,
      })
    );
    const canceled: number[] = [];
    mock.method(
      ReadarrAPI.prototype,
      'cancelPendingAuthorImport',
      async (id: number) => {
        canceled.push(id);
      }
    );
    const remove = mock.method(ReadarrAPI.prototype, 'removeBook', async () => {
      throw new Error('Imported files must remain');
    });
    await requestWorkCleanupManager.cleanup(request, true);
    assert.deepEqual(canceled, [904]);
    assert.equal(remove.mock.callCount(), 0);
    const media = await getRepository(Media).findOneByOrFail({
      id: request.media.id,
    });
    assert.equal(media.externalServiceId, 55);
    assert.deepEqual(media.availableEbookServiceIds, [20]);
  });
  it('cancels a pending Chaptarr import without requiring a book or command ID', async () => {
    const request = await createActiveBookRequest();
    const operation = await getRepository(BookRequestSearch).findOneByOrFail({
      requestId: request.id,
    });
    await getRepository(BookRequestSearch).update(operation.id, {
      bookId: null,
      commandId: null,
      providerBookId: 'hc:book-17',
      pendingId: 904,
      createdBook: false,
      createdAuthor: false,
      state: 'pending',
    });
    await getRepository(Media).update(request.media.id, {
      externalServiceId: null,
      externalServiceSlug: 'hc:book-17',
    });
    const canceled: number[] = [];
    mock.method(
      ReadarrAPI.prototype,
      'cancelPendingAuthorImport',
      async (pendingId: number) => {
        canceled.push(pendingId);
      }
    );
    const commandMock = mock.method(
      ReadarrAPI.prototype,
      'getCommand',
      async () => {
        throw new Error('A pending import has no command.');
      }
    );

    await requestWorkCleanupManager.cleanup(request, true);

    assert.deepEqual(canceled, [904]);
    assert.equal(commandMock.mock.calls.length, 0);
    assert.equal(
      await getRepository(BookRequestSearch).countBy({ requestId: request.id }),
      0
    );
    const media = await getRepository(Media).findOneByOrFail({
      id: request.media.id,
    });
    assert.equal(media.serviceId, null);
    assert.equal(media.externalServiceId, null);
    assert.equal(media.externalServiceSlug, null);
  });

  it('keeps a pending Chaptarr import when another request still references it', async () => {
    const request = await createActiveBookRequest();
    const otherRequest = await createActiveBookRequest();
    const operations = await getRepository(BookRequestSearch).find({
      where: [{ requestId: request.id }, { requestId: otherRequest.id }],
      order: { id: 'ASC' },
    });
    await getRepository(BookRequestSearch).update(
      operations.map((operation) => operation.id),
      {
        bookId: null,
        commandId: null,
        providerBookId: 'hc:book-17',
        pendingId: 905,
        createdBook: false,
        createdAuthor: false,
        state: 'pending',
      }
    );
    const canceled: number[] = [];
    mock.method(
      ReadarrAPI.prototype,
      'cancelPendingAuthorImport',
      async (pendingId: number) => {
        canceled.push(pendingId);
      }
    );

    await requestWorkCleanupManager.cleanup(request, true);

    assert.deepEqual(canceled, []);
    assert.equal(
      await getRepository(BookRequestSearch).countBy({
        requestId: otherRequest.id,
        pendingId: 905,
      }),
      1
    );
  });

  it('keeps a pending import shared by ebook and audiobook entries on one instance', async () => {
    const request = await createActiveBookRequest();
    const otherRequest = await createActiveBookRequest();
    const ebookService = getSettings().readarr[0];
    getSettings().readarr = [
      ebookService,
      {
        ...ebookService,
        id: 21,
        name: 'Bookshelf Audiobooks',
        isDefault: false,
        serviceType: 'audiobook',
      },
    ];

    const operations = await getRepository(BookRequestSearch).find({
      where: [{ requestId: request.id }, { requestId: otherRequest.id }],
      order: { id: 'ASC' },
    });
    await getRepository(BookRequestSearch).update(
      operations.map((operation) => operation.id),
      {
        bookId: null,
        commandId: null,
        providerBookId: 'hc:book-18',
        pendingId: 906,
        createdBook: false,
        createdAuthor: false,
        state: 'pending',
      }
    );
    await getRepository(BookRequestSearch).update(operations[1].id, {
      serviceId: 21,
      format: 'audiobook',
    });

    const canceled: number[] = [];
    mock.method(
      ReadarrAPI.prototype,
      'cancelPendingAuthorImport',
      async (pendingId: number) => {
        canceled.push(pendingId);
      }
    );

    await requestWorkCleanupManager.cleanup(request, true);

    assert.deepEqual(canceled, []);
    assert.equal(
      await getRepository(BookRequestSearch).countBy({
        requestId: otherRequest.id,
        pendingId: 906,
        serviceId: 21,
        format: 'audiobook',
      }),
      1
    );
  });

  it('withdraws a still-pending Bindery request and clears its local service link', async () => {
    const request = await createActiveBookRequest();
    configureBindery();
    const operation = await getRepository(BookRequestSearch).findOneByOrFail({
      requestId: request.id,
    });
    await getRepository(BookRequestSearch).update(operation.id, {
      bookId: null,
      binderyRequestId: 91,
      pendingId: null,
      commandId: null,
      state: 'pending',
    });
    await getRepository(Media).update(request.media.id, {
      externalServiceId: null,
      externalServiceSlug: 'OL27448W',
    });
    request.serviceTargets = [
      {
        serviceType: 'readarr',
        format: 'ebook',
        serverId: 20,
        externalServiceSlug: 'OL27448W',
      },
    ];
    await getRepository(MediaRequest).update(request.id, {
      serviceTargets: request.serviceTargets,
    });
    mock.method(
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
    const declined: { id: number; reason: string }[] = [];
    mock.method(
      BinderyAPI.prototype,
      'declineRequest',
      async (id: number, reason: string) => {
        declined.push({ id, reason });
      }
    );

    await requestWorkCleanupManager.cleanup(request, true);

    assert.deepEqual(declined, [{ id: 91, reason: 'Withdrawn in SeerrNG.' }]);
    assert.equal(
      await getRepository(BookRequestSearch).countBy({ requestId: request.id }),
      0
    );
    const media = await getRepository(Media).findOneByOrFail({
      id: request.media.id,
    });
    assert.equal(media.serviceId, null);
    assert.equal(media.externalServiceId, null);
    assert.equal(media.externalServiceSlug, null);
    const updatedRequest = await getRepository(MediaRequest).findOneByOrFail({
      id: request.id,
    });
    assert.equal(updatedRequest.serviceTargets?.[0].externalServiceSlug, null);
  });

  it('clears a stale Bindery link when a complete scan confirms the request is gone', async () => {
    const request = await createActiveBookRequest();
    configureBindery();
    await getRepository(BookRequestSearch).update(
      { requestId: request.id },
      { binderyRequestId: 94, state: 'pending' }
    );
    mock.method(BinderyAPI.prototype, 'getRequestsById', async () => ({
      requests: new Map(),
      complete: true,
    }));
    const decline = mock.method(
      BinderyAPI.prototype,
      'declineRequest',
      async () => undefined
    );

    await requestWorkCleanupManager.cleanup(request, true);

    assert.equal(decline.mock.callCount(), 0);
    const media = await getRepository(Media).findOneByOrFail({
      id: request.media.id,
    });
    assert.equal(media.serviceId, null);
    assert.equal(media.externalServiceId, null);
    assert.equal(media.externalServiceSlug, null);
    assert.equal(
      await getRepository(BookRequestSearch).countBy({ requestId: request.id }),
      0
    );
  });

  it('leaves a Bindery acquisition alone after approval and preserves its service link', async () => {
    const request = await createActiveBookRequest();
    configureBindery();
    await getRepository(BookRequestSearch).update(
      { requestId: request.id },
      { binderyRequestId: 92, state: 'monitoring' }
    );
    const requestScan = mock.method(
      BinderyAPI.prototype,
      'getRequestsById',
      async () => ({
        requests: new Map([
          [
            92,
            {
              id: 92,
              kind: 'book' as const,
              foreignId: 'OL27449W',
              mediaType: 'ebook' as const,
              status: 'approved' as const,
              resultBookId: 55,
            },
          ],
        ]),
        complete: true,
      })
    );
    const decline = mock.method(
      BinderyAPI.prototype,
      'declineRequest',
      async () => undefined
    );

    await requestWorkCleanupManager.cleanup(request, true);

    assert.equal(requestScan.mock.callCount(), 1);
    assert.equal(decline.mock.callCount(), 0);
    const media = await getRepository(Media).findOneByOrFail({
      id: request.media.id,
    });
    assert.equal(media.serviceId, 20);
    assert.equal(media.externalServiceId, 55);
  });

  it('preserves a Bindery acquisition when approval races with cancellation', async () => {
    const request = await createActiveBookRequest();
    configureBindery();
    await getRepository(BookRequestSearch).update(
      { requestId: request.id },
      { binderyRequestId: 93, state: 'pending' }
    );
    const pending = {
      id: 93,
      kind: 'book' as const,
      foreignId: 'OL27450W',
      mediaType: 'ebook' as const,
      status: 'pending' as const,
    };
    const approved = {
      ...pending,
      status: 'approved' as const,
      resultBookId: 55,
    };
    let queueReads = 0;
    mock.method(BinderyAPI.prototype, 'getRequestsById', async () => ({
      requests: new Map([[93, queueReads++ === 0 ? pending : approved]]),
      complete: true,
    }));
    mock.method(BinderyAPI.prototype, 'declineRequest', async () => {
      throw Object.assign(new Error('request was approved'), {
        isAxiosError: true,
        response: { status: 409 },
      });
    });

    await requestWorkCleanupManager.cleanup(request, true);

    assert.equal(queueReads, 2);
    const media = await getRepository(Media).findOneByOrFail({
      id: request.media.id,
    });
    assert.equal(media.serviceId, 20);
    assert.equal(media.externalServiceId, 55);
    assert.equal(media.externalServiceSlug, 'cleanup-book');
  });

  it('cancels a book download and removes request-created empty records', async () => {
    const request = await createActiveBookRequest();
    mock.method(ReadarrAPI.prototype, 'getCommand', async () => ({
      id: 901,
      name: 'BookSearch',
      status: 'completed',
    }));
    let queueRead = 0;
    mock.method(ReadarrAPI.prototype, 'getQueue', async () =>
      queueRead++ === 0
        ? [
            {
              id: 12,
              bookId: 55,
              size: 100,
              sizeleft: 50,
              title: 'Cleanup Book',
              timeleft: '00:01:00',
              estimatedCompletionTime: '',
              status: 'downloading',
              trackedDownloadStatus: 'ok',
              trackedDownloadState: 'downloading',
              downloadId: 'download-1',
              protocol: 'usenet',
              downloadClient: 'sabnzbd',
              indexer: 'indexer',
            },
          ]
        : []
    );
    const deletedQueueIds: number[] = [];
    mock.method(
      ReadarrAPI.prototype,
      'deleteQueueItem',
      async (queueId: number) => {
        deletedQueueIds.push(queueId);
      }
    );
    mock.method(ReadarrAPI.prototype, 'getBookIfExists', async () => ({
      id: 55,
      title: 'Cleanup Book',
      statistics: { bookFileCount: 0 },
    }));
    const removedBooks: number[] = [];
    mock.method(ReadarrAPI.prototype, 'removeBook', async (bookId: number) => {
      removedBooks.push(bookId);
    });
    mock.method(ReadarrAPI.prototype, 'getBooksByAuthor', async () => []);
    const removedAuthors: number[] = [];
    mock.method(
      ReadarrAPI.prototype,
      'removeAuthor',
      async (authorId: number) => {
        removedAuthors.push(authorId);
      }
    );

    await requestWorkCleanupManager.cleanup(request, true);

    assert.deepEqual(deletedQueueIds, [12]);
    assert.deepEqual(removedBooks, [55]);
    assert.deepEqual(removedAuthors, [77]);
    assert.equal(
      await getRepository(BookRequestSearch).countBy({ requestId: request.id }),
      0
    );
    const media = await getRepository(Media).findOneByOrFail({
      id: request.media.id,
    });
    assert.equal(media.serviceId, null);
    assert.equal(media.externalServiceId, null);
  });

  it('cancels a monitored book without waiting for a search command', async () => {
    const request = await createActiveBookRequest();
    const operation = await getRepository(BookRequestSearch).findOneByOrFail({
      requestId: request.id,
    });
    await getRepository(BookRequestSearch).update(operation.id, {
      state: 'monitoring',
      commandId: null,
    });
    const getCommand = mock.method(
      ReadarrAPI.prototype,
      'getCommand',
      async () => {
        throw new Error('Monitoring should not have a search command.');
      }
    );
    mock.method(ReadarrAPI.prototype, 'getQueue', async () => []);
    mock.method(ReadarrAPI.prototype, 'getBookIfExists', async () => ({
      id: 55,
      title: 'Cleanup Book',
      statistics: { bookFileCount: 0 },
    }));
    const removedBooks: number[] = [];
    mock.method(ReadarrAPI.prototype, 'removeBook', async (bookId: number) => {
      removedBooks.push(bookId);
    });
    mock.method(ReadarrAPI.prototype, 'getBooksByAuthor', async () => []);
    mock.method(ReadarrAPI.prototype, 'removeAuthor', async () => undefined);

    await requestWorkCleanupManager.cleanup(request, true);

    assert.equal(getCommand.mock.callCount(), 0);
    assert.deepEqual(removedBooks, [55]);
    assert.equal(
      await getRepository(BookRequestSearch).countBy({ requestId: request.id }),
      0
    );
  });

  it('keeps the request intact when Bookshelf cannot confirm cancellation', async () => {
    const request = await createActiveBookRequest();
    mock.method(ReadarrAPI.prototype, 'getCommand', async () => ({
      id: 901,
      name: 'BookSearch',
      status: 'started',
    }));

    await assert.rejects(
      () => requestWorkCleanupManager.cleanup(request, true),
      RequestWorkCleanupError
    );
    assert.equal(
      await getRepository(BookRequestSearch).countBy({ requestId: request.id }),
      1
    );
  });

  it('reports Mylar cancellation as unsupported without touching the request', async () => {
    const request = await createActiveComicRequest('mylar');

    await assert.rejects(
      () => requestWorkCleanupManager.cleanup(request, true),
      RequestWorkCleanupError
    );
  });

  it('cancels a Kapowarr comic download by matching the queued volume', async () => {
    getSettings().kapowarr = [
      {
        id: 40,
        name: 'Kapowarr',
        hostname: 'kapowarr.local',
        port: 5656,
        apiKey: 'kapowarr-key',
        useSsl: false,
        tags: [],
        isDefault: true,
        syncEnabled: true,
        preventSearch: false,
      },
    ];
    const request = await createActiveComicRequest('kapowarr');
    let queueRead = 0;
    mock.method(KapowarrAPI.prototype, 'getQueue', async () =>
      queueRead++ === 0 ? [{ id: 9, volumeId: 1 }] : []
    );
    const removed: [number, boolean][] = [];
    mock.method(
      KapowarrAPI.prototype,
      'removeQueueItem',
      async (downloadId: number, blocklist: boolean) => {
        removed.push([downloadId, blocklist]);
      }
    );

    await requestWorkCleanupManager.cleanup(request, true);

    assert.deepEqual(removed, [[9, false]]);
  });

  it('confirms cancellation actually removed the Kapowarr queue entry', async () => {
    getSettings().kapowarr = [
      {
        id: 40,
        name: 'Kapowarr',
        hostname: 'kapowarr.local',
        port: 5656,
        apiKey: 'kapowarr-key',
        useSsl: false,
        tags: [],
        isDefault: true,
        syncEnabled: true,
        preventSearch: false,
      },
    ];
    const request = await createActiveComicRequest('kapowarr');
    mock.method(KapowarrAPI.prototype, 'getQueue', async () => [
      { id: 9, volumeId: 1 },
    ]);
    mock.method(
      KapowarrAPI.prototype,
      'removeQueueItem',
      async () => undefined
    );

    await assert.rejects(
      () => requestWorkCleanupManager.cleanup(request, true),
      RequestWorkCleanupError
    );
  });

  it('cancels a BackIssue pack grab by its pack queue ID', async () => {
    getSettings().backissue = [
      {
        id: 40,
        name: 'BackIssue',
        hostname: 'backissue.local',
        port: 8787,
        apiKey: 'backissue-key',
        useSsl: false,
        tags: [],
        isDefault: true,
        syncEnabled: true,
        preventSearch: false,
      },
    ];
    const request = await createActiveComicRequest('backissue');
    const pack = {
      id: 77,
      seriesId: 1,
      title: 'Manga volumes 1-13',
      status: 'downloading',
      progress: 62.5,
      pack: true,
    };
    let queueRead = 0;
    mock.method(BackIssueAPI.prototype, 'getQueue', async () =>
      queueRead++ === 0 ? [pack] : []
    );
    const canceled: number[] = [];
    mock.method(BackIssueAPI.prototype, 'cancelQueueItem', async (id: number) => {
      canceled.push(id);
    });

    await requestWorkCleanupManager.cleanup(request, true);

    assert.deepEqual(canceled, [77]);
  });
});
