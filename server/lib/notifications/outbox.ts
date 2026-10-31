import { getRepository } from '@server/datasource';
import type Issue from '@server/entity/Issue';
import type IssueComment from '@server/entity/IssueComment';
import type Media from '@server/entity/Media';
import type { MediaRequest } from '@server/entity/MediaRequest';
import { NotificationOutbox } from '@server/entity/NotificationOutbox';
import type { User } from '@server/entity/User';
import outboxAdmissionCoordinator from '@server/lib/outboxAdmission';
import logger from '@server/logger';
import { randomUUID } from 'node:crypto';
import { In } from 'typeorm';
import type { Notification } from '.';
import type {
  NotificationEventDescriptor,
  NotificationEventKind,
  NotificationPayload,
} from './agents/agent';

export const MAX_NOTIFICATION_OUTBOX_ROWS = 10_000;
export const NOTIFICATION_OUTBOX_SCAN_BATCH_SIZE = 250;
export const MAX_NOTIFICATION_OUTBOX_PAYLOAD_BYTES = 64 * 1024;
export const MAX_NOTIFICATION_OUTBOX_ATTEMPTS = 50;
export const MAX_NOTIFICATION_OUTBOX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const MAX_NOTIFICATION_OUTBOX_RETRY_DELAY_MS = 6 * 60 * 60 * 1000;
export const NOTIFICATION_OUTBOX_CLAIM_LEASE_MS = 15 * 60 * 1000;

export const getNotificationOutboxRetryDelayMs = (attempts: number): number =>
  Math.min(
    60_000 * 2 ** Math.max(0, Math.min(attempts - 1, 30)),
    MAX_NOTIFICATION_OUTBOX_RETRY_DELAY_MS
  );

interface StoredMedia {
  id: Media['id'];
  mediaType: Media['mediaType'];
  tmdbId: Media['tmdbId'];
  tvdbId?: Media['tvdbId'];
  imdbId?: Media['imdbId'];
  mbId?: Media['mbId'];
  externalServiceId?: Media['externalServiceId'];
  jellyfinMediaId?: Media['jellyfinMediaId'];
  jellyfinMediaId4k?: Media['jellyfinMediaId4k'];
  status: Media['status'];
  status4k: Media['status4k'];
  ratingKey?: Media['ratingKey'];
  ratingKey4k?: Media['ratingKey4k'];
  identifiers?: { provider: string; value: string; canonical?: boolean }[];
}

interface StoredRequest {
  id: number;
  is4k: boolean;
  requestedById: number;
}

interface StoredIssue {
  id: number;
  issueType: Issue['issueType'];
  status: Issue['status'];
  createdById: number;
  modifiedById?: number;
}

interface StoredComment {
  id: number;
  message: string;
  userId: number;
}

interface StoredNotificationPayload {
  event?: string;
  eventMessage?: NotificationEventDescriptor;
  subject: string;
  notifySystem: boolean;
  notifyAdmin: boolean;
  notifyUserId?: number;
  media?: StoredMedia;
  mediaUrl?: string;
  image?: string;
  message?: string;
  availabilitySubscription?: boolean;
  extra?: { name: string; value: string }[];
  request?: StoredRequest;
  issue?: StoredIssue;
  comment?: StoredComment;
  pendingRequestsCount?: number;
  isAdmin?: boolean;
}

export type NotificationOutboxIntent =
  | { kind: 'media-request'; requestId: number }
  | {
      kind: 'media-availability-subscription';
      mediaId: number;
      userId: number;
    }
  | { kind: 'issue'; issueId: number; modifiedById?: number }
  | { kind: 'issue-comment'; commentId: number };

interface StoredNotificationIntent {
  intent: NotificationOutboxIntent;
}

const ensurePositiveInteger = (value: unknown, name: string): number => {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new Error(`Notification outbox ${name} is invalid.`);
  }
  return value as number;
};

const parseStoredIntent = (value: unknown): NotificationOutboxIntent => {
  if (!value || typeof value !== 'object') {
    throw new Error('Stored notification outbox intent is invalid.');
  }
  const intent = value as Record<string, unknown>;
  if (intent.kind === 'media-request') {
    return {
      kind: intent.kind,
      requestId: ensurePositiveInteger(intent.requestId, 'request id'),
    };
  }
  if (intent.kind === 'media-availability-subscription') {
    return {
      kind: intent.kind,
      mediaId: ensurePositiveInteger(intent.mediaId, 'media id'),
      userId: ensurePositiveInteger(intent.userId, 'user id'),
    };
  }
  if (intent.kind === 'issue') {
    return {
      kind: intent.kind,
      issueId: ensurePositiveInteger(intent.issueId, 'issue id'),
      modifiedById:
        intent.modifiedById === undefined
          ? undefined
          : ensurePositiveInteger(intent.modifiedById, 'modifier id'),
    };
  }
  if (intent.kind === 'issue-comment') {
    return {
      kind: intent.kind,
      commentId: ensurePositiveInteger(intent.commentId, 'comment id'),
    };
  }
  throw new Error('Stored notification outbox intent kind is invalid.');
};

const validateIntentType = (
  type: Notification,
  intent: NotificationOutboxIntent
): void => {
  const compatible =
    intent.kind === 'media-request'
      ? [2, 4, 8, 16, 64, 128, 4096].includes(type)
      : intent.kind === 'media-availability-subscription'
        ? type === 8
        : intent.kind === 'issue'
          ? [256, 1024, 2048].includes(type)
          : type === 512;
  if (!compatible) {
    throw new Error('Notification outbox intent type is incompatible.');
  }
};

const serializeStoredValue = (value: unknown): string => {
  const serialized = JSON.stringify(value);
  if (
    Buffer.byteLength(serialized, 'utf8') >
    MAX_NOTIFICATION_OUTBOX_PAYLOAD_BYTES
  ) {
    throw new Error('Notification outbox payload exceeds maximum size.');
  }
  return serialized;
};

const storedNotificationEventKinds = new Set<NotificationEventKind>([
  'available',
  'approved',
  'declined',
  'pending',
  'autoRequested',
  'autoApproved',
  'failed',
]);

const storedMediaTypes = new Set([
  'movie',
  'tv',
  'music',
  'book',
  'comic',
  'magazine',
  'adult',
  'sports',
]);

const parseStoredNotificationEvent = (
  value: unknown
): NotificationEventDescriptor | undefined => {
  if (value === undefined) {
    return undefined;
  }

  if (!value || typeof value !== 'object') {
    throw new Error('Stored notification event is invalid.');
  }

  const event = value as Record<string, unknown>;
  if (
    typeof event.kind !== 'string' ||
    !storedNotificationEventKinds.has(event.kind as NotificationEventKind) ||
    typeof event.mediaType !== 'string' ||
    !storedMediaTypes.has(event.mediaType) ||
    typeof event.is4k !== 'boolean'
  ) {
    throw new Error('Stored notification event is invalid.');
  }

  return event as unknown as NotificationEventDescriptor;
};

const serializePayload = (payload: NotificationPayload): string => {
  const stored: StoredNotificationPayload = {
    event: payload.event,
    eventMessage: payload.eventMessage,
    subject: payload.subject,
    notifySystem: payload.notifySystem,
    notifyAdmin: payload.notifyAdmin,
    notifyUserId: payload.notifyUser?.id,
    media: payload.media
      ? {
          id: payload.media.id,
          mediaType: payload.media.mediaType,
          tmdbId: payload.media.tmdbId,
          tvdbId: payload.media.tvdbId,
          imdbId: payload.media.imdbId,
          mbId: payload.media.mbId,
          externalServiceId: payload.media.externalServiceId,
          jellyfinMediaId: payload.media.jellyfinMediaId,
          jellyfinMediaId4k: payload.media.jellyfinMediaId4k,
          status: payload.media.status,
          status4k: payload.media.status4k,
          ratingKey: payload.media.ratingKey,
          ratingKey4k: payload.media.ratingKey4k,
          identifiers: payload.media.identifiers?.map((identifier) => ({
            provider: identifier.provider,
            value: identifier.value,
            canonical: identifier.canonical,
          })),
        }
      : undefined,
    mediaUrl: payload.mediaUrl,
    image: payload.image,
    message: payload.message,
    availabilitySubscription: payload.availabilitySubscription,
    extra: payload.extra?.map(({ name, value }) => ({ name, value })),
    request: payload.request
      ? {
          id: payload.request.id,
          is4k: payload.request.is4k,
          requestedById: payload.request.requestedBy.id,
        }
      : undefined,
    issue: payload.issue
      ? {
          id: payload.issue.id,
          issueType: payload.issue.issueType,
          status: payload.issue.status,
          createdById: payload.issue.createdBy.id,
          modifiedById: payload.issue.modifiedBy?.id,
        }
      : undefined,
    comment: payload.comment
      ? {
          id: payload.comment.id,
          message: payload.comment.message,
          userId: payload.comment.user.id,
        }
      : undefined,
    pendingRequestsCount: payload.pendingRequestsCount,
    isAdmin: payload.isAdmin,
  };
  return serializeStoredValue(stored);
};

const parseStoredPayload = (serialized: string): StoredNotificationPayload => {
  if (
    Buffer.byteLength(serialized, 'utf8') >
    MAX_NOTIFICATION_OUTBOX_PAYLOAD_BYTES
  ) {
    throw new Error('Stored notification outbox payload exceeds maximum size.');
  }
  const parsed: unknown = JSON.parse(serialized);
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    typeof (parsed as StoredNotificationPayload).subject !== 'string' ||
    typeof (parsed as StoredNotificationPayload).notifySystem !== 'boolean' ||
    typeof (parsed as StoredNotificationPayload).notifyAdmin !== 'boolean'
  ) {
    throw new Error('Stored notification outbox payload is invalid.');
  }
  const stored = parsed as StoredNotificationPayload;
  stored.eventMessage = parseStoredNotificationEvent(stored.eventMessage);
  return stored;
};

export const createNotificationOutboxRecord = async (
  type: Notification,
  payload: NotificationPayload,
  targetAgents: string[],
  repository = getRepository(NotificationOutbox)
): Promise<NotificationOutbox> => {
  const serializedPayload = serializePayload(payload);
  return outboxAdmissionCoordinator.run(
    NotificationOutbox,
    async (lockedRepository) => {
      if ((await lockedRepository.count()) >= MAX_NOTIFICATION_OUTBOX_ROWS) {
        throw new Error('Notification outbox is full.');
      }
      return lockedRepository.save(
        new NotificationOutbox({
          type,
          payload: serializedPayload,
          targetAgents: [...targetAgents],
          deliveredAgents: [],
          attempts: 0,
        })
      );
    },
    repository
  );
};

export const createNotificationOutboxIntent = async (
  type: Notification,
  intent: NotificationOutboxIntent,
  targetAgents: string[],
  repository = getRepository(NotificationOutbox)
): Promise<NotificationOutbox> => {
  const validatedIntent = parseStoredIntent(intent);
  validateIntentType(type, validatedIntent);
  const serializedIntent = serializeStoredValue({ intent: validatedIntent });
  return outboxAdmissionCoordinator.run(
    NotificationOutbox,
    async (lockedRepository) => {
      if ((await lockedRepository.count()) >= MAX_NOTIFICATION_OUTBOX_ROWS) {
        throw new Error('Notification outbox is full.');
      }
      return lockedRepository.save(
        new NotificationOutbox({
          type,
          payload: serializedIntent,
          targetAgents: [...targetAgents],
          deliveredAgents: [],
          attempts: 0,
        })
      );
    },
    repository
  );
};

export const getPendingNotificationOutboxRecords = async (
  respectRetryBackoff = false
): Promise<NotificationOutbox[]> => {
  const repository = getRepository(NotificationOutbox);
  const staleBefore = new Date(Date.now() - MAX_NOTIFICATION_OUTBOX_AGE_MS);
  const claimExpiredBefore = new Date(
    Date.now() - NOTIFICATION_OUTBOX_CLAIM_LEASE_MS
  );
  const records = await repository
    .createQueryBuilder('outbox')
    .where(
      'outbox."claimToken" IS NULL OR outbox."claimedAt" IS NULL OR outbox."claimedAt" < :claimExpiredBefore',
      { claimExpiredBefore }
    )
    .orderBy('outbox.createdAt', 'ASC')
    .addOrderBy('outbox.id', 'ASC')
    .take(NOTIFICATION_OUTBOX_SCAN_BATCH_SIZE)
    .getMany();
  const hasLiveClaim = (record: NotificationOutbox): boolean =>
    Boolean(
      record.claimToken &&
      record.claimedAt &&
      record.claimedAt >= claimExpiredBefore
    );
  const stale = records.filter(
    (record) =>
      !hasLiveClaim(record) &&
      (record.attempts >= MAX_NOTIFICATION_OUTBOX_ATTEMPTS ||
        record.createdAt < staleBefore)
  );
  if (stale.length > 0) {
    const result = await repository
      .createQueryBuilder()
      .delete()
      .from(NotificationOutbox)
      .where('(attempts >= :maxAttempts OR "createdAt" < :staleBefore)', {
        maxAttempts: MAX_NOTIFICATION_OUTBOX_ATTEMPTS,
        staleBefore,
      })
      .andWhere(
        '("claimToken" IS NULL OR "claimedAt" IS NULL OR "claimedAt" < :claimExpiredBefore)',
        { claimExpiredBefore }
      )
      .execute();
    if ((result.affected ?? 0) > 0) {
      logger.error('Discarded expired notification outbox records', {
        label: 'Notifications',
        outboxCount: result.affected,
      });
    }
  }
  const pending = records.filter(
    (record) => !stale.includes(record) && !hasLiveClaim(record)
  );
  if (!respectRetryBackoff) {
    return pending;
  }
  const now = Date.now();
  return pending.filter(
    (record) =>
      !record.lastAttemptAt ||
      now - record.lastAttemptAt.getTime() >=
        getNotificationOutboxRetryDelayMs(record.attempts)
  );
};

export const claimNotificationOutboxRecord = async (
  record: NotificationOutbox
): Promise<string | undefined> => {
  const claimToken = randomUUID();
  const claimedAt = new Date();
  const expiredBefore = new Date(
    claimedAt.getTime() - NOTIFICATION_OUTBOX_CLAIM_LEASE_MS
  );
  const result = await getRepository(NotificationOutbox)
    .createQueryBuilder()
    .update(NotificationOutbox)
    .set({ claimToken, claimedAt })
    .where('id = :id', { id: record.id })
    .andWhere(
      '("claimToken" IS NULL OR "claimedAt" IS NULL OR "claimedAt" < :expiredBefore)',
      { expiredBefore }
    )
    .execute();
  if (result.affected !== 1) {
    return undefined;
  }
  record.claimToken = claimToken;
  record.claimedAt = claimedAt;
  return claimToken;
};

export const renewNotificationOutboxClaim = async (
  record: NotificationOutbox,
  claimToken: string
): Promise<void> => {
  const claimedAt = new Date();
  const result = await getRepository(NotificationOutbox).update(
    { id: record.id, claimToken },
    { claimedAt }
  );
  if (result.affected !== 1) {
    throw new Error(`Notification outbox ${record.id} claim was lost.`);
  }
  record.claimedAt = claimedAt;
};

export const hydrateNotificationOutboxPayload = async (
  record: NotificationOutbox
): Promise<NotificationPayload | undefined> => {
  if (
    Buffer.byteLength(record.payload, 'utf8') >
    MAX_NOTIFICATION_OUTBOX_PAYLOAD_BYTES
  ) {
    throw new Error('Stored notification outbox payload exceeds maximum size.');
  }
  const untyped = JSON.parse(record.payload) as unknown;
  if (untyped && typeof untyped === 'object' && 'intent' in untyped) {
    const intent = parseStoredIntent(
      (untyped as StoredNotificationIntent).intent
    );
    validateIntentType(record.type as Notification, intent);
    // Keep intent hydration lazy: it imports the notification enum from the
    // notification manager, which itself imports this outbox module.
    const { hydrateNotificationIntent } = await import('./intents');
    const payload = await hydrateNotificationIntent(
      record.type as Notification,
      intent
    );
    if (payload) {
      serializePayload(payload);
    }
    return payload;
  }
  const stored = parseStoredPayload(record.payload);
  const userIds = [
    stored.notifyUserId,
    stored.request?.requestedById,
    stored.issue?.createdById,
    stored.issue?.modifiedById,
    stored.comment?.userId,
  ].filter((id): id is number => id !== undefined);
  const usersById = new Map<number, User>();
  if (userIds.length > 0) {
    const { User } = await import('@server/entity/User');
    const users = await getRepository(User).findBy({ id: In(userIds) });
    for (const user of users) {
      usersById.set(user.id, user);
    }
  }
  const getRequiredUser = (id: number): User => {
    const user = usersById.get(id);
    if (!user) {
      throw new Error(`Notification outbox user ${id} no longer exists.`);
    }
    return user;
  };

  return {
    event: stored.event,
    eventMessage: stored.eventMessage,
    subject: stored.subject,
    notifySystem: stored.notifySystem,
    notifyAdmin: stored.notifyAdmin,
    notifyUser:
      stored.notifyUserId !== undefined
        ? getRequiredUser(stored.notifyUserId)
        : undefined,
    media: stored.media as Media | undefined,
    mediaUrl: stored.mediaUrl,
    image: stored.image,
    message: stored.message,
    availabilitySubscription: stored.availabilitySubscription,
    extra: stored.extra,
    request: stored.request
      ? ({
          id: stored.request.id,
          is4k: stored.request.is4k,
          requestedBy: getRequiredUser(stored.request.requestedById),
        } as MediaRequest)
      : undefined,
    issue: stored.issue
      ? ({
          id: stored.issue.id,
          issueType: stored.issue.issueType,
          status: stored.issue.status,
          createdBy: getRequiredUser(stored.issue.createdById),
          modifiedBy:
            stored.issue.modifiedById !== undefined
              ? getRequiredUser(stored.issue.modifiedById)
              : undefined,
        } as Issue)
      : undefined,
    comment: stored.comment
      ? ({
          id: stored.comment.id,
          message: stored.comment.message,
          user: getRequiredUser(stored.comment.userId),
        } as IssueComment)
      : undefined,
    pendingRequestsCount: stored.pendingRequestsCount,
    isAdmin: stored.isAdmin,
  };
};

export const markNotificationAgentDelivered = async (
  record: NotificationOutbox,
  agent: string,
  claimToken: string
): Promise<void> => {
  if (!record.deliveredAgents.includes(agent)) {
    const deliveredAgents = [...record.deliveredAgents, agent];
    const result = await getRepository(NotificationOutbox).update(
      { id: record.id, claimToken },
      { deliveredAgents }
    );
    if (result.affected !== 1) {
      throw new Error(`Notification outbox ${record.id} claim was lost.`);
    }
    record.deliveredAgents = deliveredAgents;
  }
};

export const markNotificationOutboxAttemptFailed = async (
  record: NotificationOutbox,
  claimToken: string
): Promise<void> => {
  const attempts = record.attempts + 1;
  const lastAttemptAt = new Date();
  if (attempts >= MAX_NOTIFICATION_OUTBOX_ATTEMPTS) {
    const result = await getRepository(NotificationOutbox).delete({
      id: record.id,
      claimToken,
    });
    if (result.affected !== 1) {
      throw new Error(`Notification outbox ${record.id} claim was lost.`);
    }
    logger.error('Discarded exhausted notification outbox record', {
      label: 'Notifications',
      outboxId: record.id,
    });
    return;
  }
  const result = await getRepository(NotificationOutbox).update(
    { id: record.id, claimToken },
    { attempts, lastAttemptAt, claimToken: null, claimedAt: null }
  );
  if (result.affected !== 1) {
    throw new Error(`Notification outbox ${record.id} claim was lost.`);
  }
  record.attempts = attempts;
  record.lastAttemptAt = lastAttemptAt;
  record.claimToken = null;
  record.claimedAt = null;
};

export const completeNotificationOutboxRecord = async (
  id: number,
  claimToken: string
): Promise<void> => {
  const result = await getRepository(NotificationOutbox).delete({
    id,
    claimToken,
  });
  if (result.affected !== 1) {
    throw new Error(`Notification outbox ${id} claim was lost.`);
  }
};
