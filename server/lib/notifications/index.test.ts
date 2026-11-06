import ListenBrainzAPI from '@server/api/listenbrainz';
import { IssueStatus, IssueType } from '@server/constants/issue';
import {
  MediaRequestStatus,
  MediaStatus,
  MediaType,
} from '@server/constants/media';
import dataSource, { getRepository } from '@server/datasource';
import Issue from '@server/entity/Issue';
import IssueComment from '@server/entity/IssueComment';
import Media from '@server/entity/Media';
import { MediaRequest } from '@server/entity/MediaRequest';
import { NotificationOutbox } from '@server/entity/NotificationOutbox';
import { User } from '@server/entity/User';
import { UserSettings } from '@server/entity/UserSettings';
import notificationManager, {
  NOTIFICATION_OUTBOX_DELIVERY_CONCURRENCY,
  Notification,
  NotificationManager,
} from '@server/lib/notifications';
import type {
  NotificationAgent,
  NotificationPayload,
} from '@server/lib/notifications/agents/agent';
import {
  MAX_NOTIFICATION_OUTBOX_RETRY_DELAY_MS,
  NOTIFICATION_OUTBOX_CLAIM_LEASE_MS,
  claimNotificationOutboxRecord,
  createNotificationOutboxRecord,
  getNotificationOutboxRetryDelayMs,
  getPendingNotificationOutboxRecords,
  hydrateNotificationOutboxPayload,
  markNotificationAgentDelivered,
} from '@server/lib/notifications/outbox';
import logger from '@server/logger';
import { setupTestDb } from '@server/test/db';
import {
  getPendingBackgroundTaskCount,
  waitForBackgroundTasks,
} from '@server/utils/backgroundTasks';
import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';

const payload: NotificationPayload = {
  subject: 'Test subject',
  notifySystem: true,
  notifyAdmin: true,
};

setupTestDb();

describe('NotificationManager delivery lifecycle', () => {
  it('tracks asynchronous agent delivery until it settles', async () => {
    let release: (() => void) | undefined;
    let sends = 0;
    const agent: NotificationAgent = {
      shouldSend: () => true,
      send: async () => {
        sends += 1;
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        return true;
      },
    };
    const manager = new NotificationManager();
    manager.registerAgents([agent]);

    await manager.sendNotification(Notification.MEDIA_AVAILABLE, payload);
    for (let attempt = 0; attempt < 100 && sends === 0; attempt += 1) {
      await new Promise<void>((resolve) => setTimeout(resolve, 1));
    }

    assert.strictEqual(sends, 1);
    assert.strictEqual(getPendingBackgroundTaskCount(), 1);
    assert.ok(release);

    release();
    await waitForBackgroundTasks();
    assert.strictEqual(getPendingBackgroundTaskCount(), 0);
  });

  it('bounds concurrent notification outbox deliveries', async (t) => {
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let active = 0;
    let maximumActive = 0;
    const agent: NotificationAgent = {
      shouldSend: () => true,
      send: async () => {
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        await held;
        active -= 1;
        return true;
      },
    };
    const manager = new NotificationManager();
    manager.registerAgents([agent]);
    t.after(async () => {
      release();
      await waitForBackgroundTasks();
    });

    await Promise.all(
      Array.from({ length: NOTIFICATION_OUTBOX_DELIVERY_CONCURRENCY + 3 }, () =>
        manager.sendNotification(Notification.MEDIA_AVAILABLE, payload)
      )
    );
    for (
      let attempt = 0;
      attempt < 100 && maximumActive < NOTIFICATION_OUTBOX_DELIVERY_CONCURRENCY;
      attempt += 1
    ) {
      await new Promise<void>((resolve) => setTimeout(resolve, 1));
    }

    assert.strictEqual(maximumActive, NOTIFICATION_OUTBOX_DELIVERY_CONCURRENCY);
    release();
    await waitForBackgroundTasks();
    assert.strictEqual(await getRepository(NotificationOutbox).count(), 0);
  });

  it('persists in the source transaction and delivers only after commit', async () => {
    let sends = 0;
    const agent: NotificationAgent = {
      shouldSend: () => true,
      send: async () => {
        sends += 1;
        return true;
      },
    };
    const manager = new NotificationManager();
    manager.registerAgents([agent]);
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      await manager.sendNotification(
        Notification.MEDIA_AVAILABLE,
        payload,
        queryRunner
      );
      await manager.resumePendingNotifications();
      await new Promise<void>((resolve) => setImmediate(resolve));

      assert.strictEqual(sends, 0);
      assert.strictEqual(
        await queryRunner.manager.getRepository(NotificationOutbox).count(),
        1
      );

      await queryRunner.commitTransaction();
      manager.commitDeferredNotifications(queryRunner);
      await waitForBackgroundTasks();

      assert.strictEqual(sends, 1);
      assert.strictEqual(await getRepository(NotificationOutbox).count(), 0);
    } finally {
      if (queryRunner.isTransactionActive) {
        await queryRunner.rollbackTransaction();
      }
      manager.rollbackDeferredNotifications(queryRunner);
      await queryRunner.release();
    }
  });

  it('does not deliver an outbox record from a rolled-back transaction', async () => {
    let sends = 0;
    const agent: NotificationAgent = {
      shouldSend: () => true,
      send: async () => {
        sends += 1;
        return true;
      },
    };
    const manager = new NotificationManager();
    manager.registerAgents([agent]);
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      await manager.sendNotification(
        Notification.MEDIA_AVAILABLE,
        payload,
        queryRunner
      );
      await queryRunner.rollbackTransaction();
      manager.rollbackDeferredNotifications(queryRunner);
      await manager.resumePendingNotifications();
      await waitForBackgroundTasks();

      assert.strictEqual(sends, 0);
      assert.strictEqual(await getRepository(NotificationOutbox).count(), 0);
    } finally {
      if (queryRunner.isTransactionActive) {
        await queryRunner.rollbackTransaction();
      }
      manager.rollbackDeferredNotifications(queryRunner);
      await queryRunner.release();
    }
  });

  it('rolls back an intent inserted by the real request subscriber', async (t) => {
    let sends = 0;
    notificationManager.registerAgents([
      {
        shouldSend: () => true,
        send: async () => {
          sends += 1;
          return true;
        },
      },
    ]);
    t.after(() => notificationManager.registerAgents([]));
    const requestedBy = await getRepository(User).findOneByOrFail({ id: 2 });
    const media = await getRepository(Media).save(
      new Media({
        mediaType: MediaType.MUSIC,
        tmdbId: 0,
        mbId: 'rolled-back-release-group',
        status: MediaStatus.PENDING,
        status4k: MediaStatus.UNKNOWN,
      })
    );

    await assert.rejects(
      dataSource.transaction(async (manager) => {
        await manager.save(
          new MediaRequest({
            type: MediaType.MUSIC,
            status: MediaRequestStatus.PENDING,
            media,
            requestedBy,
            is4k: false,
            isAutoRequest: false,
          })
        );
        assert.strictEqual(
          await manager.getRepository(NotificationOutbox).count(),
          1
        );
        throw new Error('force source rollback');
      }),
      /force source rollback/
    );
    await waitForBackgroundTasks();

    assert.strictEqual(sends, 0);
    assert.strictEqual(await getRepository(NotificationOutbox).count(), 0);
  });

  it('isolates a broken agent without suppressing later deliveries', async () => {
    const errorMock = mock.method(logger, 'error', () => logger);
    let delivered = false;
    const brokenAgent: NotificationAgent = {
      shouldSend: () => {
        throw new Error('invalid agent settings');
      },
      send: async () => true,
    };
    const workingAgent: NotificationAgent = {
      shouldSend: () => true,
      send: async () => {
        delivered = true;
        return true;
      },
    };
    const manager = new NotificationManager();
    manager.registerAgents([brokenAgent, workingAgent]);

    await manager.sendNotification(Notification.MEDIA_AVAILABLE, payload);
    await waitForBackgroundTasks();

    assert.strictEqual(delivered, true);
    assert.strictEqual(errorMock.mock.callCount(), 1);
    errorMock.mock.restore();
  });

  it('replaces registration state instead of duplicating deliveries', async () => {
    let sends = 0;
    const agent: NotificationAgent = {
      shouldSend: () => true,
      send: async () => {
        sends += 1;
        return true;
      },
    };
    const manager = new NotificationManager();
    manager.registerAgents([agent]);
    manager.registerAgents([agent]);

    await manager.sendNotification(Notification.MEDIA_AVAILABLE, payload);
    await waitForBackgroundTasks();

    assert.strictEqual(sends, 1);
  });

  it('surfaces and retains an agent-reported delivery failure', async () => {
    const errorMock = mock.method(logger, 'error', () => logger);
    const agent: NotificationAgent = {
      shouldSend: () => true,
      send: async () => false,
    };
    const manager = new NotificationManager();
    manager.registerAgents([agent]);

    await manager.sendNotification(Notification.MEDIA_AVAILABLE, payload);
    await waitForBackgroundTasks();

    assert.strictEqual(errorMock.mock.callCount(), 1);
    assert.match(
      String(errorMock.mock.calls[0].arguments[0]),
      /Background task failed: notification outbox/
    );
    const pending = await getRepository(NotificationOutbox).findOneByOrFail({
      type: Notification.MEDIA_AVAILABLE,
    });
    assert.strictEqual(pending.attempts, 1);
    errorMock.mock.restore();
  });

  it('checkpoints successful agents and resumes only incomplete delivery', async () => {
    let firstSends = 0;
    let secondSends = 0;
    const firstAgent: NotificationAgent = {
      shouldSend: () => true,
      send: async () => {
        firstSends += 1;
        return true;
      },
    };
    const failingSecondAgent: NotificationAgent = {
      shouldSend: () => true,
      send: async () => {
        secondSends += 1;
        return false;
      },
    };
    const firstManager = new NotificationManager();
    firstManager.registerAgents([firstAgent, failingSecondAgent]);

    await firstManager.sendNotification(Notification.MEDIA_AVAILABLE, payload);
    await waitForBackgroundTasks();

    const pending = await getRepository(NotificationOutbox).findOneByOrFail({
      type: Notification.MEDIA_AVAILABLE,
    });
    assert.deepEqual(pending.targetAgents, ['Object:0', 'Object:1']);
    assert.deepEqual(pending.deliveredAgents, ['Object:0']);
    assert.strictEqual(pending.attempts, 1);

    const recoveredFirstAgent: NotificationAgent = {
      shouldSend: () => true,
      send: async () => {
        firstSends += 1;
        return true;
      },
    };
    const recoveredSecondAgent: NotificationAgent = {
      shouldSend: () => true,
      send: async () => {
        secondSends += 1;
        return true;
      },
    };
    const recoveredManager = new NotificationManager();
    recoveredManager.registerAgents([
      recoveredFirstAgent,
      recoveredSecondAgent,
    ]);
    await recoveredManager.resumePendingNotifications();
    await waitForBackgroundTasks();

    assert.strictEqual(firstSends, 1);
    assert.strictEqual(secondSends, 2);
    assert.strictEqual(await getRepository(NotificationOutbox).count(), 0);
  });

  it('persists app-copy identities and dynamic values for recipient-time localization', async () => {
    const original: NotificationPayload = {
      ...payload,
      event: 'Comic Request Approved',
      eventMessage: { kind: 'approved', mediaType: 'comic', is4k: false },
      issueEventMessage: { kind: 'comment', issueType: 'video' },
      bodyMessage: 'comicRequestDetails',
      subjectMessage: 'bookRequest',
      message: 'Comic request details are available in SeerrNG.',
      extra: [
        {
          name: 'Publisher',
          label: 'publisher',
          value: 'User Publisher <raw>',
        },
      ],
    };
    const record = await createNotificationOutboxRecord(
      Notification.MEDIA_APPROVED,
      original,
      ['test']
    );
    const stored = JSON.parse(record.payload);
    assert.deepEqual(stored.eventMessage, original.eventMessage);
    assert.deepEqual(stored.issueEventMessage, original.issueEventMessage);
    assert.equal(stored.bodyMessage, original.bodyMessage);
    assert.equal(stored.subjectMessage, original.subjectMessage);
    const hydrated = await hydrateNotificationOutboxPayload(record);
    assert.equal(hydrated?.subject, original.subject);
    assert.equal(hydrated?.message, original.message);
    assert.deepEqual(hydrated?.extra, original.extra);
    assert.deepEqual(hydrated?.eventMessage, original.eventMessage);
  });

  it('rejects unknown descriptors before persistence and when reading stored payloads', async () => {
    await assert.rejects(
      createNotificationOutboxRecord(
        Notification.MEDIA_AVAILABLE,
        {
          ...payload,
          eventMessage: {
            kind: 'provider-generated',
            mediaType: 'movie',
            is4k: false,
          },
        } as unknown as NotificationPayload,
        ['test']
      ),
      /event descriptor is invalid/
    );
    const record = await createNotificationOutboxRecord(
      Notification.MEDIA_AVAILABLE,
      payload,
      ['test']
    );
    record.payload = JSON.stringify({
      ...JSON.parse(record.payload),
      bodyMessage: 'untrusted message ID',
    });
    await assert.rejects(
      hydrateNotificationOutboxPayload(record),
      /body descriptor is invalid/
    );
  });

  it('rejects oversized outbox payloads before persistence', async () => {
    const agent: NotificationAgent = {
      shouldSend: () => true,
      send: async () => true,
    };
    const manager = new NotificationManager();
    manager.registerAgents([agent]);

    await assert.rejects(
      manager.sendNotification(Notification.MEDIA_AVAILABLE, {
        ...payload,
        message: 'x'.repeat(70 * 1024),
      }),
      /payload exceeds maximum size/i
    );
    assert.strictEqual(await getRepository(NotificationOutbox).count(), 0);
  });

  it('rejects incompatible durable intent types', async () => {
    const manager = new NotificationManager();
    manager.registerAgents([
      { shouldSend: () => true, send: async () => true },
    ]);

    await assert.rejects(
      manager.sendNotificationIntent(Notification.ISSUE_COMMENT, {
        kind: 'media-request',
        requestId: 1,
      }),
      /intent type is incompatible/
    );
    assert.strictEqual(await getRepository(NotificationOutbox).count(), 0);
  });

  it('rehydrates current users without persisting notification secrets', async () => {
    const [admin, recipientWithoutSettings] = await Promise.all([
      getRepository(User).findOneByOrFail({ id: 1 }),
      getRepository(User).findOneByOrFail({ id: 2 }),
    ]);
    await getRepository(UserSettings).save(
      new UserSettings({
        user: recipientWithoutSettings,
        notificationTypes: {},
        pushbulletAccessToken: 'must-not-enter-outbox',
      })
    );
    const recipient = await getRepository(User).findOneByOrFail({ id: 2 });
    let recoveredPayload: NotificationPayload | undefined;
    const failingAgent: NotificationAgent = {
      shouldSend: () => true,
      send: async () => false,
    };
    const firstManager = new NotificationManager();
    firstManager.registerAgents([failingAgent]);
    await firstManager.sendNotification(Notification.ISSUE_COMMENT, {
      subject: 'Durable issue notification',
      notifySystem: true,
      notifyAdmin: true,
      notifyUser: recipient,
      media: {
        id: 44,
        mediaType: MediaType.MOVIE,
        tmdbId: 123,
        status: MediaStatus.PROCESSING,
        status4k: MediaStatus.UNKNOWN,
        identifiers: [],
      } as unknown as Media,
      request: {
        id: 55,
        is4k: false,
        requestedBy: recipient,
      } as MediaRequest,
      issue: {
        id: 66,
        issueType: IssueType.VIDEO,
        status: IssueStatus.OPEN,
        createdBy: recipient,
        modifiedBy: admin,
      } as Issue,
      comment: {
        id: 77,
        message: 'Comment body',
        user: admin,
      } as IssueComment,
    });
    await waitForBackgroundTasks();

    const record = await getRepository(NotificationOutbox).findOneByOrFail({
      type: Notification.ISSUE_COMMENT,
    });
    assert.doesNotMatch(record.payload, /pushbullet|pushover|telegramChatId/i);

    const recoveredAgent: NotificationAgent = {
      shouldSend: () => true,
      send: async (_type, recovered) => {
        recoveredPayload = recovered;
        return true;
      },
    };
    const recoveredManager = new NotificationManager();
    recoveredManager.registerAgents([recoveredAgent]);
    await recoveredManager.resumePendingNotifications();
    await waitForBackgroundTasks();

    assert.strictEqual(recoveredPayload?.notifyUser?.id, recipient.id);
    assert.strictEqual(
      typeof recoveredPayload?.notifyUser?.settings?.hasNotificationType,
      'function'
    );
    assert.strictEqual(recoveredPayload?.request?.requestedBy.id, recipient.id);
    assert.strictEqual(recoveredPayload?.issue?.modifiedBy?.id, admin.id);
    assert.strictEqual(recoveredPayload?.comment?.user.id, admin.id);
    assert.strictEqual(recoveredPayload?.media?.tmdbId, 123);
    assert.strictEqual(await getRepository(NotificationOutbox).count(), 0);
  });

  it('persists a typed intent and rehydrates it after restart', async (t) => {
    const getAlbumMock = mock.method(
      ListenBrainzAPI.prototype,
      'getAlbum',
      async () =>
        ({
          release_group_mbid: 'durable-release-group',
          release_group_metadata: {
            release_group: {
              name: 'Durable Album',
              date: '2024-01-02',
            },
            artist: { name: 'Persistent Artist' },
          },
        }) as Awaited<ReturnType<ListenBrainzAPI['getAlbum']>>
    );
    t.after(() => getAlbumMock.mock.restore());
    const requestedBy = await getRepository(User).findOneByOrFail({ id: 2 });
    const media = await getRepository(Media).save(
      new Media({
        mediaType: MediaType.MUSIC,
        tmdbId: 0,
        mbId: 'durable-release-group',
        status: MediaStatus.PENDING,
        status4k: MediaStatus.UNKNOWN,
      })
    );
    const request = await getRepository(MediaRequest).save(
      new MediaRequest({
        type: MediaType.MUSIC,
        status: MediaRequestStatus.PENDING,
        media,
        requestedBy,
        is4k: false,
        isAutoRequest: false,
      })
    );
    const firstManager = new NotificationManager();
    firstManager.registerAgents([
      { shouldSend: () => true, send: async () => false },
    ]);
    await firstManager.sendNotificationIntent(Notification.MEDIA_PENDING, {
      kind: 'media-request',
      requestId: request.id,
    });
    await waitForBackgroundTasks();

    const stored = await getRepository(NotificationOutbox).findOneByOrFail({
      type: Notification.MEDIA_PENDING,
    });
    assert.deepEqual(JSON.parse(stored.payload), {
      intent: { kind: 'media-request', requestId: request.id },
    });

    let recoveredPayload: NotificationPayload | undefined;
    const recoveredManager = new NotificationManager();
    recoveredManager.registerAgents([
      {
        shouldSend: () => true,
        send: async (_type, recovered) => {
          recoveredPayload = recovered;
          return true;
        },
      },
    ]);
    await recoveredManager.resumePendingNotifications();
    await waitForBackgroundTasks();

    assert.strictEqual(recoveredPayload?.subject, 'Durable Album (2024)');
    assert.strictEqual(
      recoveredPayload?.request?.requestedBy.id,
      requestedBy.id
    );
    assert.strictEqual(await getRepository(NotificationOutbox).count(), 0);
  });

  it('retires a typed intent when its source record was deleted', async () => {
    let sends = 0;
    const manager = new NotificationManager();
    manager.registerAgents([
      {
        shouldSend: () => true,
        send: async () => {
          sends += 1;
          return true;
        },
      },
    ]);

    await manager.sendNotificationIntent(Notification.MEDIA_PENDING, {
      kind: 'media-request',
      requestId: Number.MAX_SAFE_INTEGER,
    });
    await waitForBackgroundTasks();

    assert.strictEqual(sends, 0);
    assert.strictEqual(await getRepository(NotificationOutbox).count(), 0);
  });

  it('hydrates durable issue-comment intents with their relations', async (t) => {
    const getAlbumMock = mock.method(
      ListenBrainzAPI.prototype,
      'getAlbum',
      async () =>
        ({
          release_group_mbid: 'issue-release-group',
          release_group_metadata: {
            release_group: { name: 'Issue Album', date: '2025' },
            artist: { name: 'Issue Artist' },
          },
        }) as Awaited<ReturnType<ListenBrainzAPI['getAlbum']>>
    );
    t.after(() => getAlbumMock.mock.restore());
    const [createdBy, commenter] = await Promise.all([
      getRepository(User).findOneByOrFail({ id: 2 }),
      getRepository(User).findOneByOrFail({ id: 1 }),
    ]);
    const media = await getRepository(Media).save(
      new Media({
        mediaType: MediaType.MUSIC,
        tmdbId: 0,
        mbId: 'issue-release-group',
        status: MediaStatus.AVAILABLE,
        status4k: MediaStatus.UNKNOWN,
      })
    );
    const issue = await getRepository(Issue).save(
      new Issue({
        createdBy,
        issueType: IssueType.VIDEO,
        status: IssueStatus.OPEN,
        media,
        comments: [
          new IssueComment({ user: createdBy, message: 'Original report' }),
        ],
      })
    );
    const comment = await getRepository(IssueComment).save(
      new IssueComment({
        issue,
        user: commenter,
        message: 'A durable reply',
      })
    );
    let recoveredPayload: NotificationPayload | undefined;
    const manager = new NotificationManager();
    manager.registerAgents([
      {
        shouldSend: () => true,
        send: async (_type, recovered) => {
          recoveredPayload = recovered;
          return true;
        },
      },
    ]);
    await manager.sendNotificationIntent(Notification.ISSUE_COMMENT, {
      kind: 'issue-comment',
      commentId: comment.id,
    });
    await waitForBackgroundTasks();

    assert.strictEqual(recoveredPayload?.subject, 'Issue Album (2025)');
    assert.strictEqual(recoveredPayload?.comment?.message, 'A durable reply');
    assert.strictEqual(recoveredPayload?.issue?.createdBy.id, createdBy.id);
    assert.strictEqual(await getRepository(NotificationOutbox).count(), 0);
  });

  it('delivers an issue update when its optional actor account is gone', async (t) => {
    const getAlbumMock = mock.method(
      ListenBrainzAPI.prototype,
      'getAlbum',
      async () =>
        ({
          release_group_mbid: 'removed-actor-release-group',
          release_group_metadata: {
            release_group: {
              name: 'Issue Album',
              date: '2025-01-02',
            },
            artist: { name: 'Issue Artist' },
          },
        }) as Awaited<ReturnType<ListenBrainzAPI['getAlbum']>>
    );
    t.after(() => getAlbumMock.mock.restore());

    const createdBy = await getRepository(User).findOneByOrFail({ id: 2 });
    const media = await getRepository(Media).save(
      new Media({
        mediaType: MediaType.MUSIC,
        tmdbId: 0,
        mbId: 'removed-actor-release-group',
        status: MediaStatus.AVAILABLE,
        status4k: MediaStatus.UNKNOWN,
      })
    );
    const issue = await getRepository(Issue).save(
      new Issue({
        createdBy,
        issueType: IssueType.VIDEO,
        status: IssueStatus.OPEN,
        media,
        comments: [
          new IssueComment({ user: createdBy, message: 'Original report' }),
        ],
      })
    );

    let recoveredPayload: NotificationPayload | undefined;
    const manager = new NotificationManager();
    manager.registerAgents([
      {
        shouldSend: () => true,
        send: async (_type, recovered) => {
          recoveredPayload = recovered;
          return true;
        },
      },
    ]);

    await manager.sendNotificationIntent(Notification.ISSUE_RESOLVED, {
      kind: 'issue',
      issueId: issue.id,
      modifiedById: Number.MAX_SAFE_INTEGER,
    });
    await waitForBackgroundTasks();

    assert.strictEqual(recoveredPayload?.subject, 'Issue Album (2025)');
    assert.strictEqual(recoveredPayload?.issue?.modifiedBy, undefined);
    assert.strictEqual(recoveredPayload?.notifyUser?.id, createdBy.id);
    assert.strictEqual(await getRepository(NotificationOutbox).count(), 0);
  });
});

describe('notification outbox retry policy', () => {
  it('allows only one process to claim a delivery', async () => {
    const record = await createNotificationOutboxRecord(
      Notification.MEDIA_AVAILABLE,
      payload,
      ['EmailAgent']
    );

    const claims = await Promise.all([
      claimNotificationOutboxRecord(record),
      claimNotificationOutboxRecord(
        new NotificationOutbox({ ...record, claimToken: null, claimedAt: null })
      ),
    ]);

    assert.strictEqual(claims.filter(Boolean).length, 1);
    await assert.rejects(
      markNotificationAgentDelivered(record, 'EmailAgent', 'wrong-token'),
      /claim was lost/
    );
    const persisted = await getRepository(NotificationOutbox).findOneByOrFail({
      id: record.id,
    });
    assert.deepEqual(persisted.deliveredAgents, []);
  });

  it('hides live claims and recovers expired claims', async () => {
    const repository = getRepository(NotificationOutbox);
    const record = await repository.save(
      new NotificationOutbox({
        type: Notification.MEDIA_AVAILABLE,
        payload: JSON.stringify(payload),
        targetAgents: ['EmailAgent'],
        deliveredAgents: [],
        attempts: 0,
        claimToken: 'worker-claim',
        claimedAt: new Date(),
      })
    );

    assert.deepEqual(await getPendingNotificationOutboxRecords(), []);

    record.claimedAt = new Date(
      Date.now() - NOTIFICATION_OUTBOX_CLAIM_LEASE_MS - 1_000
    );
    await repository.save(record);
    assert.deepEqual(
      (await getPendingNotificationOutboxRecords()).map(({ id }) => id),
      [record.id]
    );
  });

  it('uses bounded exponential retry delays', () => {
    assert.strictEqual(getNotificationOutboxRetryDelayMs(0), 60_000);
    assert.strictEqual(getNotificationOutboxRetryDelayMs(1), 60_000);
    assert.strictEqual(getNotificationOutboxRetryDelayMs(2), 120_000);
    assert.strictEqual(
      getNotificationOutboxRetryDelayMs(1_000),
      MAX_NOTIFICATION_OUTBOX_RETRY_DELAY_MS
    );
  });

  it('defers recent failures only during periodic retry scans', async () => {
    const repository = getRepository(NotificationOutbox);
    const record = await repository.save(
      new NotificationOutbox({
        type: Notification.MEDIA_AVAILABLE,
        payload: JSON.stringify(payload),
        targetAgents: ['EmailAgent'],
        deliveredAgents: [],
        attempts: 1,
        lastAttemptAt: new Date(),
      })
    );

    assert.deepEqual(await getPendingNotificationOutboxRecords(true), []);
    assert.deepEqual(
      (await getPendingNotificationOutboxRecords()).map(({ id }) => id),
      [record.id]
    );

    record.lastAttemptAt = new Date(Date.now() - 61_000);
    await repository.save(record);
    assert.deepEqual(
      (await getPendingNotificationOutboxRecords(true)).map(({ id }) => id),
      [record.id]
    );
  });
});
