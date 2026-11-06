import { MediaType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Follow, {
  FOLLOW_KINDS,
  type FollowConditions,
  type FollowKind,
} from '@server/entity/Follow';
import FollowEvent from '@server/entity/FollowEvent';
import MediaRequest from '@server/entity/MediaRequest';
import { syncSavedDiscoveries } from '@server/lib/gameDiscovery';
import logger from '@server/logger';
import { isUniqueConstraintError } from '@server/utils/databaseError';
import { FOLLOW_ADAPTERS } from './adapters';
import type { NewFollowEvent } from './types';

export * from './types';

export const MAX_FOLLOWS_PER_USER = 200;
const MAX_ERRORS_LOGGED = 20;

export const isFollowKind = (value: unknown): value is FollowKind =>
  FOLLOW_KINDS.includes(value as FollowKind);

export interface CreateFollowInput {
  userId: number;
  kind: FollowKind;
  subjectKey: string;
  subjectLabel: string;
  conditions?: FollowConditions | null;
  notify?: boolean;
  autoRequest?: boolean;
}

/** Idempotent: following the same subject twice updates the first follow. */
export const upsertFollow = async (
  input: CreateFollowInput
): Promise<Follow> => {
  const repository = getRepository(Follow);
  const existing = await repository.findOne({
    where: {
      user: { id: input.userId },
      kind: input.kind,
      subjectKey: input.subjectKey,
    },
  });
  if (existing) {
    existing.subjectLabel = input.subjectLabel;
    existing.conditions = input.conditions ?? existing.conditions;
    if (input.notify !== undefined) existing.notify = input.notify;
    if (input.autoRequest !== undefined)
      existing.autoRequest = input.autoRequest;
    return repository.save(existing);
  }
  return repository.save(
    repository.create({
      user: { id: input.userId } as Follow['user'],
      kind: input.kind,
      subjectKey: input.subjectKey,
      subjectLabel: input.subjectLabel,
      conditions: input.conditions ?? null,
      notify: input.notify ?? true,
      autoRequest: input.autoRequest ?? false,
      cursor: null,
    })
  );
};

/**
 * Auto-requests run through the normal request path so quotas, approval, and
 * history apply. Only books are supported; other media need choices (variant,
 * platform) that a background job must not guess.
 */
const autoRequest = async (follow: Follow, event: NewFollowEvent) => {
  if (!follow.autoRequest || event.target?.mediaType !== 'book') return;
  const user = follow.user;
  if (!user) return;
  try {
    await MediaRequest.request(
      {
        mediaType: MediaType.BOOK,
        mediaId: event.target.id,
        format:
          follow.kind === 'narrator' || follow.kind === 'edition'
            ? 'audiobook'
            : undefined,
        ...(event.target.variantKey && follow.kind === 'edition'
          ? {
              preferredEditionId: event.target.variantKey,
              editionPolicy: 'alongside' as const,
            }
          : {}),
      },
      user,
      { isAutoRequest: true }
    );
  } catch (error) {
    logger.info('Followed item could not be auto-requested', {
      label: 'Follow',
      followId: follow.id,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
  }
};

export const evaluateFollow = async (follow: Follow): Promise<number> => {
  const adapter = FOLLOW_ADAPTERS[follow.kind];
  const result = await adapter(follow);
  const eventRepository = getRepository(FollowEvent);
  let created = 0;
  for (const event of result.events) {
    try {
      await eventRepository.save(
        eventRepository.create({
          follow,
          user: follow.user,
          dedupeKey: event.dedupeKey.slice(0, 255),
          reasonKey: event.reasonKey,
          reasonValues: event.reasonValues ?? null,
          title: event.title.slice(0, 255),
          imageUrl: event.imageUrl?.slice(0, 1024) ?? null,
          target: event.target ?? null,
          seen: !follow.notify,
        })
      );
      created += 1;
      await autoRequest(follow, event);
    } catch (error) {
      // Only an existing event is safe to consume without writing it again.
      if (
        !isUniqueConstraintError(error) ||
        !(await eventRepository.exists({
          where: {
            follow: { id: follow.id },
            dedupeKey: event.dedupeKey.slice(0, 255),
          },
        }))
      )
        throw error;
    }
  }
  follow.cursor = result.cursor;
  follow.lastCheckedAt = new Date();
  await getRepository(Follow).save(follow);
  return created;
};

/** Scheduled job: evaluates every follow, isolating failures per follow. */
export const syncFollows = async (): Promise<void> => {
  const follows = await getRepository(Follow).find({
    relations: { user: true },
  });
  let errors = 0;
  for (const follow of follows) {
    try {
      await evaluateFollow(follow);
    } catch (error) {
      errors += 1;
      if (errors <= MAX_ERRORS_LOGGED) {
        logger.warn('Follow evaluation failed', {
          label: 'Follow',
          followId: follow.id,
          kind: follow.kind,
          errorMessage: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
  await syncSavedDiscoveries();
};
