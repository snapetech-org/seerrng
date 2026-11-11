import {
  MediaRequestStatus,
  MediaStatus,
  MediaType,
} from '@server/constants/media';
import dataSource, { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import { MediaRequest } from '@server/entity/MediaRequest';
import { RequestDispatchOutbox } from '@server/entity/RequestDispatchOutbox';
import { User } from '@server/entity/User';
import notificationManager, { Notification } from '@server/lib/notifications';
import logger from '@server/logger';
import { MediaRequestSubscriber } from '@server/subscriber/MediaRequestSubscriber';
import { setupTestDb } from '@server/test/db';
import { waitForBackgroundTasks } from '@server/utils/backgroundTasks';
import assert from 'node:assert/strict';
import { beforeEach, describe, it, mock } from 'node:test';
import {
  MAX_BOOK_METADATA_PENDING_MS,
  REQUEST_DISPATCH_CONCURRENCY,
  RequestDispatchManager,
  getRequestDispatchRetryDelayMs,
} from '.';

setupTestDb();

const createPendingRequest = async (tmdbId = 12345): Promise<MediaRequest> => {
  const requestedBy = await getRepository(User).findOneByOrFail({ id: 2 });
  const media = await getRepository(Media).save(
    new Media({
      mediaType: MediaType.MOVIE,
      tmdbId,
      status: MediaStatus.PENDING,
      status4k: MediaStatus.UNKNOWN,
    })
  );
  return getRepository(MediaRequest).save(
    new MediaRequest({
      type: MediaType.MOVIE,
      status: MediaRequestStatus.PENDING,
      media,
      requestedBy,
      is4k: false,
      isAutoRequest: false,
    })
  );
};

describe('RequestDispatchManager', () => {
  beforeEach(() => mock.restoreAll());

  it('persists with the source transaction and disappears on rollback', async () => {
    const request = await createPendingRequest();
    const manager = new RequestDispatchManager();
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      await manager.enqueue(request.id, queryRunner);
      assert.strictEqual(
        await queryRunner.manager.getRepository(RequestDispatchOutbox).count(),
        1
      );
      await queryRunner.rollbackTransaction();
      manager.rollback(queryRunner);
      await manager.resume();
      await waitForBackgroundTasks();
      assert.strictEqual(await getRepository(RequestDispatchOutbox).count(), 0);
    } finally {
      if (queryRunner.isTransactionActive) {
        await queryRunner.rollbackTransaction();
      }
      manager.rollback(queryRunner);
      await queryRunner.release();
    }
  });

  it('is inserted and rolled back by the real request subscriber', async (t) => {
    let dispatches = 0;
    const dispatchMock = mock.method(
      MediaRequestSubscriber.prototype,
      'dispatchRequestById',
      async () => {
        dispatches += 1;
        return { delivered: true };
      }
    );
    t.after(() => dispatchMock.mock.restore());
    const requestedBy = await getRepository(User).findOneByOrFail({ id: 2 });
    const media = await getRepository(Media).save(
      new Media({
        mediaType: MediaType.MOVIE,
        tmdbId: 67890,
        status: MediaStatus.PENDING,
        status4k: MediaStatus.UNKNOWN,
      })
    );

    await assert.rejects(
      dataSource.transaction(async (manager) => {
        await manager.save(
          new MediaRequest({
            type: MediaType.MOVIE,
            status: MediaRequestStatus.APPROVED,
            media,
            requestedBy,
            is4k: false,
            isAutoRequest: false,
          })
        );
        assert.strictEqual(
          await manager.getRepository(RequestDispatchOutbox).count(),
          1
        );
        throw new Error('force request rollback');
      }),
      /force request rollback/
    );
    await waitForBackgroundTasks();

    assert.strictEqual(dispatches, 0);
    assert.strictEqual(await getRepository(RequestDispatchOutbox).count(), 0);
  });

  it('dispatches the real subscriber record only after commit', async (t) => {
    let release: (() => void) | undefined;
    let dispatches = 0;
    const dispatchMock = mock.method(
      MediaRequestSubscriber.prototype,
      'dispatchRequestById',
      async () => {
        dispatches += 1;
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        return { delivered: true };
      }
    );
    t.after(() => dispatchMock.mock.restore());
    const requestedBy = await getRepository(User).findOneByOrFail({ id: 2 });
    const media = await getRepository(Media).save(
      new Media({
        mediaType: MediaType.MOVIE,
        tmdbId: 67891,
        status: MediaStatus.PENDING,
        status4k: MediaStatus.UNKNOWN,
      })
    );

    await dataSource.transaction(async (manager) => {
      await manager.save(
        new MediaRequest({
          type: MediaType.MOVIE,
          status: MediaRequestStatus.APPROVED,
          media,
          requestedBy,
          is4k: false,
          isAutoRequest: false,
        })
      );
      assert.strictEqual(dispatches, 0);
      assert.strictEqual(
        await manager.getRepository(RequestDispatchOutbox).count(),
        1
      );
    });
    for (let attempt = 0; attempt < 100 && !release; attempt += 1) {
      await new Promise<void>((resolve) => setTimeout(resolve, 1));
    }
    assert.strictEqual(dispatches, 1);
    assert.ok(release);
    release();
    await waitForBackgroundTasks();
    assert.strictEqual(await getRepository(RequestDispatchOutbox).count(), 0);
  });

  it('uses one database claim across competing workers', async (t) => {
    const request = await createPendingRequest();
    await getRepository(RequestDispatchOutbox).save(
      new RequestDispatchOutbox({ requestId: request.id, attempts: 0 })
    );
    let dispatches = 0;
    const dispatchMock = mock.method(
      MediaRequestSubscriber.prototype,
      'dispatchRequestById',
      async () => {
        dispatches += 1;
        return { delivered: true };
      }
    );
    t.after(() => dispatchMock.mock.restore());

    const first = new RequestDispatchManager();
    const second = new RequestDispatchManager();
    await Promise.all([first.resume(), second.resume()]);
    await waitForBackgroundTasks();

    assert.strictEqual(dispatches, 1);
    assert.strictEqual(await getRepository(RequestDispatchOutbox).count(), 0);
  });

  it('rejects a stale worker snapshot after another worker persists metadata backoff', async (t) => {
    const request = await createPendingRequest();
    await getRepository(MediaRequest).update(request.id, {
      status: MediaRequestStatus.APPROVED,
    });
    const record = await getRepository(RequestDispatchOutbox).save(
      new RequestDispatchOutbox({ requestId: request.id, attempts: 0 })
    );
    let dispatches = 0;
    const dispatchMock = mock.method(
      MediaRequestSubscriber.prototype,
      'dispatchRequestById',
      async () => {
        dispatches++;
        return {
          delivered: false,
          metadataPending: true,
          retryAfterMs: 120_000,
        };
      }
    );
    const first = new RequestDispatchManager();
    const second = new RequestDispatchManager();
    type Scan = {
      getPending: (respectBackoff: boolean) => Promise<RequestDispatchOutbox[]>;
    };
    const originalScan = (second as unknown as Scan).getPending.bind(second);
    let scanned!: () => void;
    const captured = new Promise<void>((resolve) => {
      scanned = resolve;
    });
    let release!: () => void;
    const continueScan = new Promise<void>((resolve) => {
      release = resolve;
    });
    const getPending = mock.method(
      second as unknown as Scan,
      'getPending',
      async (respectBackoff) => {
        const snapshot = await originalScan(respectBackoff);
        scanned();
        await continueScan;
        return snapshot;
      }
    );
    t.after(() => {
      release();
      getPending.mock.restore();
      dispatchMock.mock.restore();
    });
    const secondScan = second.resume(false);
    await captured;
    await first.resume(false);
    await waitForBackgroundTasks();
    const deferred = await getRepository(RequestDispatchOutbox).findOneByOrFail(
      { id: record.id }
    );
    assert.equal(dispatches, 1);
    assert.equal(deferred.attempts, 0);
    assert.ok(
      deferred.nextAttemptAt && deferred.nextAttemptAt.getTime() > Date.now()
    );
    release();
    await secondScan;
    await waitForBackgroundTasks();
    assert.equal(dispatches, 1);
    const persisted = await getRepository(
      RequestDispatchOutbox
    ).findOneByOrFail({ id: record.id });
    assert.equal(persisted.attempts, 0);
    assert.equal(persisted.claimToken, null);
    assert.equal(
      persisted.nextAttemptAt?.getTime(),
      deferred.nextAttemptAt.getTime()
    );
    assert.equal(
      (await getRepository(MediaRequest).findOneByOrFail({ id: request.id }))
        .status,
      MediaRequestStatus.APPROVED
    );
  });

  it('bounds concurrent durable request dispatches', async (t) => {
    const requests: MediaRequest[] = [];
    for (let index = 0; index < REQUEST_DISPATCH_CONCURRENCY + 3; index += 1) {
      requests.push(await createPendingRequest(70000 + index));
    }
    await getRepository(RequestDispatchOutbox).save(
      requests.map(
        (mediaRequest) =>
          new RequestDispatchOutbox({
            requestId: mediaRequest.id,
            attempts: 0,
          })
      )
    );
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let active = 0;
    let maximumActive = 0;
    const dispatchMock = mock.method(
      MediaRequestSubscriber.prototype,
      'dispatchRequestById',
      async () => {
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        await held;
        active -= 1;
        return { delivered: true };
      }
    );
    t.after(async () => {
      release();
      dispatchMock.mock.restore();
      await waitForBackgroundTasks();
    });

    await new RequestDispatchManager().resume();
    for (
      let attempt = 0;
      attempt < 100 && maximumActive < REQUEST_DISPATCH_CONCURRENCY;
      attempt += 1
    ) {
      await new Promise<void>((resolve) => setTimeout(resolve, 1));
    }

    assert.strictEqual(maximumActive, REQUEST_DISPATCH_CONCURRENCY);
    release();
    await waitForBackgroundTasks();
    assert.strictEqual(await getRepository(RequestDispatchOutbox).count(), 0);
  });

  it('retains and dispatches records created before a long shutdown', async (t) => {
    const request = await createPendingRequest();
    await getRepository(RequestDispatchOutbox).save(
      new RequestDispatchOutbox({
        requestId: request.id,
        attempts: 0,
        createdAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
      })
    );
    let dispatches = 0;
    const dispatchMock = mock.method(
      MediaRequestSubscriber.prototype,
      'dispatchRequestById',
      async () => {
        dispatches += 1;
        return { delivered: true };
      }
    );
    t.after(() => dispatchMock.mock.restore());

    await new RequestDispatchManager().resume();
    await waitForBackgroundTasks();

    assert.strictEqual(dispatches, 1);
    assert.strictEqual(await getRepository(RequestDispatchOutbox).count(), 0);
  });

  it('releases failed attempts for a later retry', async (t) => {
    const request = await createPendingRequest();
    await getRepository(RequestDispatchOutbox).save(
      new RequestDispatchOutbox({ requestId: request.id, attempts: 0 })
    );
    const dispatchMock = mock.method(
      MediaRequestSubscriber.prototype,
      'dispatchRequestById',
      async () => ({ delivered: false })
    );
    t.after(() => dispatchMock.mock.restore());
    const manager = new RequestDispatchManager();

    await manager.resume();
    await waitForBackgroundTasks();

    const pending = await getRepository(RequestDispatchOutbox).findOneByOrFail({
      requestId: request.id,
    });
    assert.strictEqual(pending.attempts, 1);
    assert.strictEqual(pending.claimToken, null);
    assert.strictEqual(pending.claimedAt, null);
    assert.ok(pending.nextAttemptAt);
  });

  it('persists provider-directed retry delays across manager restarts', async (t) => {
    const request = await createPendingRequest();
    await getRepository(RequestDispatchOutbox).save(
      new RequestDispatchOutbox({ requestId: request.id, attempts: 0 })
    );
    let dispatches = 0;
    const dispatchMock = mock.method(
      MediaRequestSubscriber.prototype,
      'dispatchRequestById',
      async () => {
        dispatches += 1;
        return dispatches === 1
          ? { delivered: false, retryAfterMs: 60 * 60 * 1000 }
          : { delivered: true };
      }
    );
    t.after(() => dispatchMock.mock.restore());

    await new RequestDispatchManager().resume();
    await waitForBackgroundTasks();
    const pending = await getRepository(RequestDispatchOutbox).findOneByOrFail({
      requestId: request.id,
    });
    assert.ok(
      pending.nextAttemptAt &&
        pending.nextAttemptAt.getTime() >= Date.now() + 59 * 60 * 1000
    );

    await new RequestDispatchManager().resume(false);
    await waitForBackgroundTasks();
    assert.strictEqual(dispatches, 1);

    pending.nextAttemptAt = new Date(Date.now() - 1);
    await getRepository(RequestDispatchOutbox).save(pending);
    await new RequestDispatchManager().resume(false);
    await waitForBackgroundTasks();
    assert.strictEqual(dispatches, 2);
    assert.strictEqual(await getRepository(RequestDispatchOutbox).count(), 0);
  });

  it('persists metadata-pending state across restarts and retires a ready request only once', async (t) => {
    const request = await createPendingRequest();
    await getRepository(MediaRequest).update(request.id, {
      status: MediaRequestStatus.APPROVED,
    });
    const record = await getRepository(RequestDispatchOutbox).save(
      new RequestDispatchOutbox({ requestId: request.id, attempts: 49 })
    );
    let dispatches = 0;
    const dispatchMock = mock.method(
      MediaRequestSubscriber.prototype,
      'dispatchRequestById',
      async () => {
        dispatches++;
        return dispatches === 1
          ? { delivered: false, metadataPending: true, retryAfterMs: 120_000 }
          : { delivered: true };
      }
    );
    const logs = mock.method(logger, 'error', () => logger);
    const notifications = mock.method(
      notificationManager,
      'sendNotificationIntent',
      async () => undefined
    );
    t.after(() => {
      dispatchMock.mock.restore();
      notifications.mock.restore();
      logs.mock.restore();
    });

    await new RequestDispatchManager().resume(false);
    await waitForBackgroundTasks();
    const pending = await getRepository(RequestDispatchOutbox).findOneByOrFail({
      id: record.id,
    });
    assert.equal(pending.attempts, 49);
    assert.equal(pending.claimToken, null);
    assert.equal(pending.claimedAt, null);
    assert.ok(pending.lastAttemptAt && pending.nextAttemptAt);
    assert.equal(
      pending.nextAttemptAt.getTime() - pending.lastAttemptAt.getTime(),
      120_000
    );
    assert.equal(
      (await getRepository(MediaRequest).findOneByOrFail({ id: request.id }))
        .status,
      MediaRequestStatus.APPROVED
    );
    assert.equal(notifications.mock.callCount(), 0);
    assert.equal(logs.mock.callCount(), 0);

    await new RequestDispatchManager().resume(false);
    await waitForBackgroundTasks();
    assert.equal(dispatches, 1);
    await getRepository(RequestDispatchOutbox).update(record.id, {
      nextAttemptAt: new Date(Date.now() - 1),
    });
    await new RequestDispatchManager().resume(false);
    await waitForBackgroundTasks();
    await new RequestDispatchManager().resume(false);
    await waitForBackgroundTasks();
    assert.equal(dispatches, 2);
    assert.equal(await getRepository(RequestDispatchOutbox).count(), 0);
    assert.equal(notifications.mock.callCount(), 0);
  });

  for (const [requested, expected] of [
    [0, 60_000],
    [60 * 60_000, 900_000],
  ] as const) {
    it(`bounds metadata-pending outbox delay ${requested} without consuming attempts`, async (t) => {
      const request = await createPendingRequest();
      const record = await getRepository(RequestDispatchOutbox).save(
        new RequestDispatchOutbox({ requestId: request.id, attempts: 0 })
      );
      const dispatchMock = mock.method(
        MediaRequestSubscriber.prototype,
        'dispatchRequestById',
        async () => ({
          delivered: false,
          metadataPending: true,
          retryAfterMs: requested,
        })
      );
      t.after(() => dispatchMock.mock.restore());
      await new RequestDispatchManager().resume(false);
      await waitForBackgroundTasks();
      const pending = await getRepository(
        RequestDispatchOutbox
      ).findOneByOrFail({ id: record.id });
      assert.equal(pending.attempts, 0);
      assert.ok(pending.lastAttemptAt && pending.nextAttemptAt);
      assert.equal(
        pending.nextAttemptAt.getTime() - pending.lastAttemptAt.getTime(),
        expected
      );
    });
  }

  it('fails expired metadata preparation once using the persisted 24-hour deadline', async (t) => {
    const request = await createPendingRequest();
    await getRepository(MediaRequest).update(request.id, {
      status: MediaRequestStatus.APPROVED,
    });
    await getRepository(RequestDispatchOutbox).save(
      new RequestDispatchOutbox({
        requestId: request.id,
        attempts: 0,
        createdAt: new Date(Date.now() - MAX_BOOK_METADATA_PENDING_MS - 60_000),
      })
    );
    let dispatches = 0;
    const dispatchMock = mock.method(
      MediaRequestSubscriber.prototype,
      'dispatchRequestById',
      async () => {
        dispatches++;
        return {
          delivered: false,
          metadataPending: true,
          retryAfterMs: 60_000,
        };
      }
    );
    const notifications = mock.method(
      notificationManager,
      'sendNotificationIntent',
      async () => undefined
    );
    t.after(() => {
      dispatchMock.mock.restore();
      notifications.mock.restore();
    });
    await new RequestDispatchManager().resume(false);
    await waitForBackgroundTasks();
    assert.equal(
      (await getRepository(MediaRequest).findOneByOrFail({ id: request.id }))
        .status,
      MediaRequestStatus.FAILED
    );
    assert.equal(await getRepository(RequestDispatchOutbox).count(), 0);
    assert.equal(notifications.mock.callCount(), 1);
    assert.equal(
      notifications.mock.calls[0].arguments[0],
      Notification.MEDIA_FAILED
    );
    await new RequestDispatchManager().resume(false);
    await waitForBackgroundTasks();
    assert.equal(dispatches, 1);
    assert.equal(notifications.mock.callCount(), 1);
  });

  it('atomically fails approved requests when dispatch attempts are exhausted', async (t) => {
    const request = await createPendingRequest();
    await getRepository(MediaRequest).update(request.id, {
      status: MediaRequestStatus.APPROVED,
    });
    await getRepository(RequestDispatchOutbox).save(
      new RequestDispatchOutbox({
        requestId: request.id,
        attempts: 49,
      })
    );
    const dispatchMock = mock.method(
      MediaRequestSubscriber.prototype,
      'dispatchRequestById',
      async () => ({ delivered: false })
    );
    const notificationMock = mock.method(
      notificationManager,
      'sendNotificationIntent',
      async () => undefined
    );
    t.after(() => {
      dispatchMock.mock.restore();
      notificationMock.mock.restore();
    });

    await new RequestDispatchManager().resume();
    await waitForBackgroundTasks();

    const failed = await getRepository(MediaRequest).findOneByOrFail({
      id: request.id,
    });
    assert.strictEqual(failed.status, MediaRequestStatus.FAILED);
    assert.strictEqual(await getRepository(RequestDispatchOutbox).count(), 0);
    assert.strictEqual(notificationMock.mock.callCount(), 1);
    assert.strictEqual(
      notificationMock.mock.calls[0].arguments[0],
      Notification.MEDIA_FAILED
    );
  });

  it('respects retry backoff during periodic scans', async (t) => {
    const request = await createPendingRequest();
    const record = await getRepository(RequestDispatchOutbox).save(
      new RequestDispatchOutbox({
        requestId: request.id,
        attempts: 2,
        lastAttemptAt: new Date(),
      })
    );
    let dispatches = 0;
    const dispatchMock = mock.method(
      MediaRequestSubscriber.prototype,
      'dispatchRequestById',
      async () => {
        dispatches += 1;
        return { delivered: true };
      }
    );
    t.after(() => dispatchMock.mock.restore());
    const manager = new RequestDispatchManager();

    await manager.resume(true);
    await waitForBackgroundTasks();
    assert.strictEqual(dispatches, 0);

    record.lastAttemptAt = new Date(
      Date.now() - getRequestDispatchRetryDelayMs(record.attempts) - 1
    );
    await getRepository(RequestDispatchOutbox).save(record);
    await manager.resume(true);
    await waitForBackgroundTasks();

    assert.strictEqual(dispatches, 1);
    assert.strictEqual(await getRepository(RequestDispatchOutbox).count(), 0);
  });

  it('cancels an unclaimed dispatch transactionally', async () => {
    const request = await createPendingRequest();
    const manager = new RequestDispatchManager();
    await getRepository(RequestDispatchOutbox).save(
      new RequestDispatchOutbox({ requestId: request.id, attempts: 0 })
    );
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      await manager.cancel(request.id, queryRunner);
      assert.strictEqual(
        await queryRunner.manager.getRepository(RequestDispatchOutbox).count(),
        0
      );
      await queryRunner.rollbackTransaction();
      assert.strictEqual(await getRepository(RequestDispatchOutbox).count(), 1);

      await queryRunner.startTransaction();
      await manager.cancel(request.id, queryRunner);
      await queryRunner.commitTransaction();
      assert.strictEqual(await getRepository(RequestDispatchOutbox).count(), 0);
    } finally {
      if (queryRunner.isTransactionActive) {
        await queryRunner.rollbackTransaction();
      }
      await queryRunner.release();
    }
  });

  it('does not cancel a dispatch for a partial update without status', async (t) => {
    const cancelMock = mock.method(
      // The subscriber singleton is the production collaborator used here.
      (await import('.')).default,
      'cancel',
      async () => undefined
    );
    t.after(() => cancelMock.mock.restore());

    await new MediaRequestSubscriber().afterUpdate({
      entity: { id: 12345 },
      queryRunner: dataSource.createQueryRunner(),
    } as never);

    assert.strictEqual(cancelMock.mock.callCount(), 0);
  });
});
