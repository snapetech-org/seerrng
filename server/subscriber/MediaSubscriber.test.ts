import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';

import {
  MediaRequestStatus,
  MediaStatus,
  MediaType,
} from '@server/constants/media';
import dataSource, { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import { MediaRequest } from '@server/entity/MediaRequest';
import { NotificationOutbox } from '@server/entity/NotificationOutbox';
import Season from '@server/entity/Season';
import { User } from '@server/entity/User';
import { isMagazineRequestFileAvailable } from '@server/lib/magazineAvailability';
import notificationManager, { Notification } from '@server/lib/notifications';
import {
  MEDIA_SUBSCRIBER_REQUEST_BATCH_SIZE,
  MediaSubscriber,
} from '@server/subscriber/MediaSubscriber';
import { setupTestDb } from '@server/test/db';
import { waitForBackgroundTasks } from '@server/utils/backgroundTasks';
import type { EntityManager, UpdateEvent } from 'typeorm';

setupTestDb();

type SubscriberInternals = {
  forEachRequestBatch: (
    manager: EntityManager,
    where: object,
    callback: (requests: MediaRequest[]) => Promise<void>
  ) => Promise<void>;
  updateChildRequestStatus: (
    manager: EntityManager,
    media: Media,
    is4k: boolean
  ) => Promise<void>;
  updateRelatedMediaRequest: (
    manager: EntityManager,
    media: Media,
    previousMedia: Media,
    is4k: boolean
  ) => Promise<void>;
};

const makeMedia = (init: Partial<Media>): Media =>
  new Media({
    id: 1,
    tmdbId: 10,
    mediaType: MediaType.MOVIE,
    status: MediaStatus.UNKNOWN,
    status4k: MediaStatus.UNKNOWN,
    seasons: [],
    ...init,
  });

const makeUpdateEvent = (
  entity: Media,
  databaseEntity: Media
): UpdateEvent<Media> =>
  ({ entity, databaseEntity }) as unknown as UpdateEvent<Media>;

describe('MediaSubscriber', () => {
  it('processes a fixed request snapshot in bounded keyset batches', async () => {
    const subscriber = new MediaSubscriber();
    const internals = subscriber as unknown as SubscriberInternals;
    const source = Array.from(
      { length: MEDIA_SUBSCRIBER_REQUEST_BATCH_SIZE + 2 },
      (_, index) => new MediaRequest({ id: index + 1 })
    );
    const observedLimits: number[] = [];
    const observedBatchSizes: number[] = [];
    let readIndex = 0;
    const requestRepository = {
      findOne: async () =>
        new MediaRequest({ id: MEDIA_SUBSCRIBER_REQUEST_BATCH_SIZE + 2 }),
      find: async (options: { take: number }) => {
        observedLimits.push(options.take);
        if (readIndex === 0) {
          source.push(new MediaRequest({ id: source.length + 1 }));
        }
        const batch = source.slice(readIndex, readIndex + options.take);
        readIndex += options.take;
        return batch;
      },
    };
    const manager = {
      getRepository: () => requestRepository,
    } as unknown as EntityManager;

    await internals.forEachRequestBatch(manager, {}, async (requests) => {
      observedBatchSizes.push(requests.length);
    });

    assert.deepStrictEqual(observedLimits, [250, 250]);
    assert.deepStrictEqual(observedBatchSizes, [250, 2]);
  });

  it('awaits child and related request transitions after availability changes', async () => {
    const subscriber = new MediaSubscriber();
    const internals = subscriber as unknown as SubscriberInternals;
    let releaseChild: (() => void) | undefined;
    let relatedCalls = 0;
    internals.updateChildRequestStatus = async () =>
      new Promise<void>((resolve) => {
        releaseChild = resolve;
      });
    internals.updateRelatedMediaRequest = async () => {
      relatedCalls += 1;
    };
    const entity = makeMedia({ status: MediaStatus.AVAILABLE });
    const previous = makeMedia({ status: MediaStatus.PENDING });

    let settled = false;
    const update = subscriber
      .afterUpdate(makeUpdateEvent(entity, previous))
      .then(() => {
        settled = true;
      });
    await new Promise<void>((resolve) => setImmediate(resolve));

    assert.strictEqual(settled, false);
    assert.strictEqual(relatedCalls, 0);
    releaseChild?.();
    await update;
    assert.strictEqual(relatedCalls, 1);
  });

  it('compares TV seasons by season number rather than relation order', async () => {
    const subscriber = new MediaSubscriber();
    const internals = subscriber as unknown as SubscriberInternals;
    let relatedCalls = 0;
    internals.updateChildRequestStatus = async () => undefined;
    internals.updateRelatedMediaRequest = async () => {
      relatedCalls += 1;
    };
    const seasonOne = new Season({
      seasonNumber: 1,
      status: MediaStatus.AVAILABLE,
      status4k: MediaStatus.UNKNOWN,
    });
    const seasonTwo = new Season({
      seasonNumber: 2,
      status: MediaStatus.UNKNOWN,
      status4k: MediaStatus.UNKNOWN,
    });
    const entity = makeMedia({
      mediaType: MediaType.TV,
      status: MediaStatus.PARTIALLY_AVAILABLE,
      seasons: [seasonTwo, seasonOne],
    });
    const previous = makeMedia({
      mediaType: MediaType.TV,
      status: MediaStatus.PARTIALLY_AVAILABLE,
      seasons: [seasonOne, seasonTwo],
    });

    await subscriber.afterUpdate(makeUpdateEvent(entity, previous));

    assert.strictEqual(relatedCalls, 0);
  });

  it('ignores partial update events without a database snapshot', async () => {
    const subscriber = new MediaSubscriber();
    const partialEvent = {
      entity: makeMedia({ status: MediaStatus.AVAILABLE }),
    } as unknown as UpdateEvent<Media>;

    await subscriber.beforeUpdate(partialEvent);
    await subscriber.afterUpdate(partialEvent);
  });

  it('rolls back child request transitions with the source media update', async () => {
    const user = await getRepository(User).findOneByOrFail({ id: 1 });
    const media = await getRepository(Media).save(
      new Media({
        tmdbId: 99_001,
        mediaType: MediaType.MOVIE,
        status: MediaStatus.PENDING,
        status4k: MediaStatus.UNKNOWN,
      })
    );
    const request = await getRepository(MediaRequest).save(
      new MediaRequest({
        type: MediaType.MOVIE,
        media,
        requestedBy: user,
        status: MediaRequestStatus.PENDING,
        is4k: false,
      })
    );
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const transactionalMedia = await queryRunner.manager.findOneByOrFail(
        Media,
        { id: media.id }
      );
      transactionalMedia.status = MediaStatus.AVAILABLE;
      await queryRunner.manager.save(transactionalMedia);
      const transitioned = await queryRunner.manager.findOneByOrFail(
        MediaRequest,
        { id: request.id }
      );
      assert.strictEqual(transitioned.status, MediaRequestStatus.COMPLETED);
      await queryRunner.rollbackTransaction();
    } finally {
      if (queryRunner.isTransactionActive) {
        await queryRunner.rollbackTransaction();
      }
      await queryRunner.release();
    }

    assert.strictEqual(
      (await getRepository(Media).findOneByOrFail({ id: media.id })).status,
      MediaStatus.PENDING
    );
    assert.strictEqual(
      (await getRepository(MediaRequest).findOneByOrFail({ id: request.id }))
        .status,
      MediaRequestStatus.PENDING
    );
  });

  it('completes an approved comic request once its media becomes available', async () => {
    const user = await getRepository(User).findOneByOrFail({ id: 1 });
    const media = await getRepository(Media).save(
      new Media({
        tmdbId: 0,
        mediaType: MediaType.COMIC,
        status: MediaStatus.PROCESSING,
        status4k: MediaStatus.UNKNOWN,
        comicServiceType: 'kapowarr',
        serviceId: 30,
        externalServiceId: 557,
      })
    );
    const request = await getRepository(MediaRequest).save(
      new MediaRequest({
        type: MediaType.COMIC,
        media,
        requestedBy: user,
        status: MediaRequestStatus.APPROVED,
        is4k: false,
      })
    );

    const savedMedia = await getRepository(Media).findOneByOrFail({
      id: media.id,
    });
    savedMedia.status = MediaStatus.AVAILABLE;
    await getRepository(Media).save(savedMedia);

    assert.strictEqual(
      (await getRepository(MediaRequest).findOneByOrFail({ id: request.id }))
        .status,
      MediaRequestStatus.COMPLETED
    );
  });
});

it('queues magazine availability once after matching file observation, retaining completed tracking history', async () => {
  const user = await getRepository(User).findOneByOrFail({ id: 1 });
  const media = await getRepository(Media).save(
    new Media({
      mediaType: MediaType.MAGAZINE,
      tmdbId: 0,
      status: MediaStatus.PROCESSING,
      status4k: MediaStatus.UNKNOWN,
      serviceId: 0,
      externalServiceId: 0,
    })
  );
  const request = await getRepository(MediaRequest).save(
    new MediaRequest({
      type: MediaType.MAGAZINE,
      media,
      requestedBy: user,
      status: MediaRequestStatus.COMPLETED,
      is4k: false,
      serverId: 0,
      serviceTargets: [
        {
          serviceType: 'lazylibrarian',
          format: 'magazine',
          serverId: 0,
          externalServiceId: 0,
          status: MediaStatus.PROCESSING,
        },
      ],
    })
  );
  await waitForBackgroundTasks();
  const queued = mock.method(
    notificationManager,
    'sendNotificationIntent',
    async () => undefined
  );
  try {
    media.status = MediaStatus.AVAILABLE;
    await getRepository(Media).save(media);
    assert.equal(queued.mock.callCount(), 1);
    assert.equal(
      queued.mock.calls[0].arguments[0],
      Notification.MEDIA_AVAILABLE
    );
    assert.deepEqual(queued.mock.calls[0].arguments[1], {
      kind: 'media-request',
      requestId: request.id,
    });
    await getRepository(Media).save(media);
    assert.equal(queued.mock.callCount(), 1);
    media.serviceId = 1;
    await getRepository(Media).save(media);
    assert.equal(queued.mock.callCount(), 1);
    assert.equal(
      (await getRepository(MediaRequest).findOneByOrFail({ id: request.id }))
        .status,
      MediaRequestStatus.COMPLETED
    );
  } finally {
    queued.mock.restore();
  }
});

it('rolls back magazine availability intent with its uncommitted file observation', async () => {
  const user = await getRepository(User).findOneByOrFail({ id: 1 });
  const media = await getRepository(Media).save(
    new Media({
      mediaType: MediaType.MAGAZINE,
      tmdbId: 0,
      status: MediaStatus.PROCESSING,
      status4k: MediaStatus.UNKNOWN,
      serviceId: 0,
      externalServiceId: 0,
    })
  );
  await getRepository(MediaRequest).save(
    new MediaRequest({
      type: MediaType.MAGAZINE,
      media,
      requestedBy: user,
      status: MediaRequestStatus.COMPLETED,
      is4k: false,
      serverId: 0,
      serviceTargets: [
        {
          serviceType: 'lazylibrarian',
          format: 'magazine',
          serverId: 0,
          externalServiceId: 0,
          status: MediaStatus.PROCESSING,
        },
      ],
    })
  );
  await waitForBackgroundTasks();
  const before = await getRepository(NotificationOutbox).count();
  const runner = dataSource.createQueryRunner();
  await runner.connect();
  await runner.startTransaction();
  try {
    const current = await runner.manager.findOneByOrFail(Media, {
      id: media.id,
    });
    current.status = MediaStatus.AVAILABLE;
    await runner.manager.save(current);
    await runner.rollbackTransaction();
  } finally {
    if (runner.isTransactionActive) await runner.rollbackTransaction();
    await runner.release();
  }
  await waitForBackgroundTasks();
  assert.equal(
    (await getRepository(Media).findOneByOrFail({ id: media.id })).status,
    MediaStatus.PROCESSING
  );
  assert.equal(await getRepository(NotificationOutbox).count(), before);
});

it('retains each magazine destination observation across alternating scans and notifies only file transitions', async () => {
  const user = await getRepository(User).findOneByOrFail({ id: 1 });
  const media = await getRepository(Media).save(
    new Media({
      mediaType: MediaType.MAGAZINE,
      tmdbId: 0,
      status: MediaStatus.PROCESSING,
      status4k: MediaStatus.UNKNOWN,
      serviceId: 0,
      externalServiceId: 0,
    })
  );
  const requests: MediaRequest[] = [];
  for (const serverId of [0, 1])
    requests.push(
      await getRepository(MediaRequest).save(
        new MediaRequest({
          type: MediaType.MAGAZINE,
          media,
          requestedBy: user,
          status: MediaRequestStatus.COMPLETED,
          is4k: false,
          serverId,
          serviceTargets: [
            {
              serviceType: 'lazylibrarian',
              format: 'magazine',
              serverId,
              externalServiceId: 0,
              status: MediaStatus.PROCESSING,
            },
          ],
        })
      )
    );
  await waitForBackgroundTasks();
  const queued = mock.method(
    notificationManager,
    'sendNotificationIntent',
    async () => undefined
  );
  const observe = async (serverId: number, status: MediaStatus) => {
    media.serviceId = serverId;
    media.status = status;
    await getRepository(Media).save(media);
  };
  const saved = async (index: number) =>
    getRepository(MediaRequest).findOneByOrFail({ id: requests[index].id });
  try {
    await observe(0, MediaStatus.AVAILABLE);
    await observe(1, MediaStatus.PROCESSING);
    assert.equal(queued.mock.callCount(), 1);
    assert.equal(isMagazineRequestFileAvailable(media, await saved(0)), true);
    await observe(0, MediaStatus.AVAILABLE);
    await observe(1, MediaStatus.PROCESSING);
    assert.equal(queued.mock.callCount(), 1);
    await observe(1, MediaStatus.AVAILABLE);
    assert.equal(queued.mock.callCount(), 2);
    await observe(0, MediaStatus.PROCESSING);
    assert.equal(isMagazineRequestFileAvailable(media, await saved(0)), false);
    assert.equal(isMagazineRequestFileAvailable(media, await saved(1)), true);
    await observe(0, MediaStatus.AVAILABLE);
    await getRepository(Media).save(media);
    assert.equal(queued.mock.callCount(), 3);
    assert.deepEqual(
      queued.mock.calls.map((call) => call.arguments[1]),
      [
        { kind: 'media-request', requestId: requests[0].id },
        { kind: 'media-request', requestId: requests[1].id },
        { kind: 'media-request', requestId: requests[0].id },
      ]
    );
  } finally {
    queued.mock.restore();
  }
});
