import {
  MediaRequestFailureReason,
  MediaRequestStatus,
} from '@server/constants/media';
import dataSource, { getRepository } from '@server/datasource';
import { MediaRequest } from '@server/entity/MediaRequest';
import { RequestDispatchOutbox } from '@server/entity/RequestDispatchOutbox';
import notificationManager, { Notification } from '@server/lib/notifications';
import outboxAdmissionCoordinator from '@server/lib/outboxAdmission';
import logger from '@server/logger';
import { trackBackgroundTask } from '@server/utils/backgroundTasks';
import {
  BoundedTaskQueue,
  BoundedTaskQueueFullError,
} from '@server/utils/concurrency';
import { randomUUID } from 'node:crypto';
import type { QueryRunner } from 'typeorm';

export const MAX_REQUEST_DISPATCH_OUTBOX_ROWS = 10_000;
export const REQUEST_DISPATCH_SCAN_BATCH_SIZE = 250;
export const REQUEST_DISPATCH_CONCURRENCY = 4;
export const MAX_REQUEST_DISPATCH_ATTEMPTS = 50;
export const REQUEST_DISPATCH_CLAIM_LEASE_MS = 15 * 60 * 1000;
export const REQUEST_DISPATCH_SCAN_INTERVAL_MS = 60_000;
export const MAX_REQUEST_DISPATCH_RETRY_DELAY_MS = 6 * 60 * 60 * 1000;

export type RequestDispatchOutcome = {
  delivered: boolean;
  retryAfterMs?: number;
};

export const getRequestDispatchRetryDelayMs = (attempts: number): number =>
  Math.min(
    60_000 * 2 ** Math.max(0, Math.min(attempts - 1, 30)),
    MAX_REQUEST_DISPATCH_RETRY_DELAY_MS
  );

export class RequestDispatchManager {
  private active = new Set<number>();
  private deferred = new Set<number>();
  private deferredByQueryRunner = new WeakMap<
    QueryRunner,
    RequestDispatchOutbox[]
  >();
  private enqueuesInProgress = 0;
  private scan?: Promise<void>;
  private timer?: NodeJS.Timeout;
  private deliveryQueue = new BoundedTaskQueue(
    REQUEST_DISPATCH_CONCURRENCY,
    REQUEST_DISPATCH_SCAN_BATCH_SIZE - REQUEST_DISPATCH_CONCURRENCY
  );

  private isDue(
    record: RequestDispatchOutbox,
    now = Date.now(),
    respectBackoff = true
  ): boolean {
    if (record.nextAttemptAt) {
      return record.nextAttemptAt.getTime() <= now;
    }
    return (
      !respectBackoff ||
      !record.lastAttemptAt ||
      now - record.lastAttemptAt.getTime() >=
        getRequestDispatchRetryDelayMs(record.attempts)
    );
  }

  public async enqueue(
    requestId: number,
    queryRunner?: QueryRunner
  ): Promise<void> {
    if (!Number.isSafeInteger(requestId) || requestId <= 0) {
      throw new Error('Request dispatch outbox request id is invalid.');
    }
    const transactional = Boolean(queryRunner?.isTransactionActive);
    if (transactional) {
      this.enqueuesInProgress += 1;
    }
    try {
      const repository =
        queryRunner?.manager.getRepository(RequestDispatchOutbox) ??
        getRepository(RequestDispatchOutbox);
      let record = await repository.findOneBy({ requestId });
      if (!record) {
        record = await outboxAdmissionCoordinator.run(
          RequestDispatchOutbox,
          async (lockedRepository) => {
            const existing = await lockedRepository.findOneBy({ requestId });
            if (existing) {
              return existing;
            }
            if (
              (await lockedRepository.count()) >=
              MAX_REQUEST_DISPATCH_OUTBOX_ROWS
            ) {
              throw new Error('Request dispatch outbox is full.');
            }
            await lockedRepository
              .createQueryBuilder()
              .insert()
              .into(RequestDispatchOutbox)
              .values({ requestId })
              .orIgnore()
              .execute();
            return lockedRepository.findOneByOrFail({ requestId });
          },
          repository
        );
      }
      if (transactional && queryRunner) {
        this.deferred.add(record.id);
        const records = this.deferredByQueryRunner.get(queryRunner) ?? [];
        if (!records.some(({ id }) => id === record.id)) {
          records.push(record);
          this.deferredByQueryRunner.set(queryRunner, records);
        }
        return;
      }
      this.dispatch(record);
    } finally {
      if (transactional) {
        this.enqueuesInProgress -= 1;
      }
    }
  }

  public async cancel(
    requestId: number,
    queryRunner?: QueryRunner
  ): Promise<void> {
    const repository =
      queryRunner?.manager.getRepository(RequestDispatchOutbox) ??
      getRepository(RequestDispatchOutbox);
    await repository
      .createQueryBuilder()
      .delete()
      .from(RequestDispatchOutbox)
      .where('"requestId" = :requestId', { requestId })
      .andWhere('"claimToken" IS NULL')
      .execute();
  }

  public commit(queryRunner: QueryRunner): void {
    const records = this.deferredByQueryRunner.get(queryRunner) ?? [];
    this.deferredByQueryRunner.delete(queryRunner);
    for (const record of records) {
      this.deferred.delete(record.id);
      this.dispatch(record);
    }
  }

  public rollback(queryRunner: QueryRunner): void {
    const records = this.deferredByQueryRunner.get(queryRunner) ?? [];
    this.deferredByQueryRunner.delete(queryRunner);
    for (const record of records) {
      this.deferred.delete(record.id);
    }
  }

  private async getPending(
    respectBackoff: boolean
  ): Promise<RequestDispatchOutbox[]> {
    const repository = getRepository(RequestDispatchOutbox);
    const now = Date.now();
    const claimExpiredBefore = new Date(now - REQUEST_DISPATCH_CLAIM_LEASE_MS);
    const records = await repository
      .createQueryBuilder('dispatch')
      .where(
        'dispatch."claimToken" IS NULL OR dispatch."claimedAt" IS NULL OR dispatch."claimedAt" < :claimExpiredBefore',
        { claimExpiredBefore }
      )
      .orderBy('dispatch.createdAt', 'ASC')
      .addOrderBy('dispatch.id', 'ASC')
      .take(REQUEST_DISPATCH_SCAN_BATCH_SIZE)
      .getMany();
    return records.filter(
      (record) =>
        !(
          record.claimToken &&
          record.claimedAt &&
          record.claimedAt >= claimExpiredBefore
        ) && this.isDue(record, now, respectBackoff)
    );
  }

  private async claim(
    record: RequestDispatchOutbox
  ): Promise<string | undefined> {
    const claimToken = randomUUID();
    const claimedAt = new Date();
    const result = await getRepository(RequestDispatchOutbox)
      .createQueryBuilder()
      .update(RequestDispatchOutbox)
      .set({ claimToken, claimedAt })
      .where('id = :id', { id: record.id })
      .andWhere(
        '("claimToken" IS NULL OR "claimedAt" IS NULL OR "claimedAt" < :expiredBefore)',
        {
          expiredBefore: new Date(
            claimedAt.getTime() - REQUEST_DISPATCH_CLAIM_LEASE_MS
          ),
        }
      )
      .execute();
    return result.affected === 1 ? claimToken : undefined;
  }

  private async renew(
    record: RequestDispatchOutbox,
    claimToken: string
  ): Promise<void> {
    const result = await getRepository(RequestDispatchOutbox).update(
      { id: record.id, claimToken },
      { claimedAt: new Date() }
    );
    if (result.affected !== 1) {
      throw new Error(`Request dispatch outbox ${record.id} claim was lost.`);
    }
  }

  private async runWithHeartbeat<T>(
    record: RequestDispatchOutbox,
    claimToken: string,
    task: () => Promise<T>
  ): Promise<T> {
    let heartbeatError: unknown;
    let pendingRenewal = Promise.resolve();
    const renew = (): void => {
      pendingRenewal = pendingRenewal
        .then(() => this.renew(record, claimToken))
        .catch((error) => {
          heartbeatError ??= error;
        });
    };
    await this.renew(record, claimToken);
    const timer = setInterval(
      renew,
      Math.max(1_000, Math.floor(REQUEST_DISPATCH_CLAIM_LEASE_MS / 3))
    );
    timer.unref();
    try {
      const result = await task();
      await pendingRenewal;
      if (heartbeatError) {
        throw heartbeatError;
      }
      await this.renew(record, claimToken);
      return result;
    } finally {
      clearInterval(timer);
      await pendingRenewal;
    }
  }

  private async failAttempt(
    record: RequestDispatchOutbox,
    claimToken: string,
    retryAfterMs?: number
  ): Promise<void> {
    const attempts = record.attempts + 1;
    if (attempts >= MAX_REQUEST_DISPATCH_ATTEMPTS) {
      const queryRunner = dataSource.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();
      try {
        const requestUpdate = await queryRunner.manager
          .getRepository(MediaRequest)
          .createQueryBuilder()
          .update(MediaRequest)
          .set({
            status: MediaRequestStatus.FAILED,
            failureReason: MediaRequestFailureReason.DISPATCH_FAILED,
          })
          .where('id = :requestId', { requestId: record.requestId })
          .andWhere('status = :approved', {
            approved: MediaRequestStatus.APPROVED,
          })
          .execute();
        if (requestUpdate.affected === 1) {
          await notificationManager.sendNotificationIntent(
            Notification.MEDIA_FAILED,
            { kind: 'media-request', requestId: record.requestId },
            queryRunner
          );
        }
        const result = await queryRunner.manager
          .getRepository(RequestDispatchOutbox)
          .delete({ id: record.id, claimToken });
        if (result.affected !== 1) {
          throw new Error(
            `Request dispatch outbox ${record.id} claim was lost.`
          );
        }
        await queryRunner.commitTransaction();
      } catch (error) {
        if (queryRunner.isTransactionActive) {
          await queryRunner.rollbackTransaction();
        }
        throw error;
      } finally {
        await queryRunner.release();
      }
      logger.error('Discarded exhausted request dispatch outbox record', {
        label: 'Media Request',
        outboxId: record.id,
        requestId: record.requestId,
      });
      return;
    }
    const lastAttemptAt = new Date();
    const requestedDelay =
      typeof retryAfterMs === 'number' && Number.isFinite(retryAfterMs)
        ? Math.min(
            Math.max(0, retryAfterMs),
            MAX_REQUEST_DISPATCH_RETRY_DELAY_MS
          )
        : 0;
    const retryDelay = Math.max(
      getRequestDispatchRetryDelayMs(attempts),
      requestedDelay
    );
    const nextAttemptAt = new Date(lastAttemptAt.getTime() + retryDelay);
    const result = await getRepository(RequestDispatchOutbox).update(
      { id: record.id, claimToken },
      {
        attempts,
        lastAttemptAt,
        nextAttemptAt,
        claimToken: null,
        claimedAt: null,
      }
    );
    if (result.affected !== 1) {
      throw new Error(`Request dispatch outbox ${record.id} claim was lost.`);
    }
    record.attempts = attempts;
    record.lastAttemptAt = lastAttemptAt;
    record.nextAttemptAt = nextAttemptAt;
    record.claimToken = null;
    record.claimedAt = null;
  }

  private dispatch(record: RequestDispatchOutbox): void {
    if (this.active.has(record.id) || !this.isDue(record)) {
      return;
    }
    this.active.add(record.id);
    trackBackgroundTask(`request dispatch outbox ${record.id}`, async () => {
      try {
        await this.deliveryQueue.run(async () => {
          let claimToken: string | undefined;
          try {
            claimToken = await this.claim(record);
            if (!claimToken) {
              return;
            }
            const { MediaRequestSubscriber } =
              await import('@server/subscriber/MediaRequestSubscriber');
            const dispatchResult = await this.runWithHeartbeat(
              record,
              claimToken,
              () =>
                new MediaRequestSubscriber().dispatchRequestById(
                  record.requestId
                )
            );
            const outcome: RequestDispatchOutcome =
              typeof dispatchResult === 'boolean'
                ? { delivered: dispatchResult }
                : dispatchResult;
            if (outcome.delivered) {
              const result = await getRepository(RequestDispatchOutbox).delete({
                id: record.id,
                claimToken,
              });
              if (result.affected !== 1) {
                throw new Error(
                  `Request dispatch outbox ${record.id} claim was lost.`
                );
              }
              claimToken = undefined;
              return;
            }
            await this.failAttempt(record, claimToken, outcome.retryAfterMs);
            claimToken = undefined;
            throw new Error(
              `Request dispatch outbox ${record.id} remains pending.`
            );
          } catch (error) {
            if (claimToken) {
              try {
                await this.failAttempt(record, claimToken);
              } catch (finalizationError) {
                logger.error(
                  'Failed to release request dispatch outbox claim',
                  {
                    label: 'Media Request',
                    outboxId: record.id,
                    errorMessage:
                      finalizationError instanceof Error
                        ? finalizationError.message
                        : 'Unknown dispatch finalization error',
                  }
                );
              }
            }
            throw error;
          }
        });
      } catch (error) {
        if (!(error instanceof BoundedTaskQueueFullError)) {
          throw error;
        }
      } finally {
        this.active.delete(record.id);
      }
    });
  }

  public async resume(respectBackoff = false): Promise<void> {
    if (this.enqueuesInProgress > 0) {
      return;
    }
    if (this.scan) {
      return this.scan;
    }
    const scan = (async () => {
      const records = await this.getPending(respectBackoff);
      if (this.enqueuesInProgress > 0) {
        return;
      }
      for (const record of records) {
        if (!this.deferred.has(record.id)) {
          this.dispatch(record);
        }
      }
    })();
    this.scan = scan;
    try {
      await scan;
    } finally {
      this.scan = undefined;
    }
  }

  public start(): void {
    if (this.timer) {
      return;
    }
    this.timer = setInterval(() => {
      trackBackgroundTask('request dispatch outbox retry scan', () =>
        this.resume(true)
      );
    }, REQUEST_DISPATCH_SCAN_INTERVAL_MS);
    this.timer.unref();
  }

  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }
}

const requestDispatchManager = new RequestDispatchManager();
export default requestDispatchManager;
