import TheMovieDb from '@server/api/themoviedb';
import {
  MediaRequestStatus,
  MediaStatus,
  MediaType,
} from '@server/constants/media';
import { MediaServerType } from '@server/constants/server';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import MediaRequest, {
  hasMediaRequestPermission,
} from '@server/entity/MediaRequest';
import { MovieCollectionQueue } from '@server/entity/MovieCollectionQueue';
import type { User } from '@server/entity/User';
import {
  captureConfigurationAuthority,
  getConfigurationAuthorityKey,
  runWithConfigurationSnapshot,
} from '@server/lib/configurationAdmission';
import {
  assertMediaServerUserAuthorityCurrent,
  type MediaServerUserAuthoritySnapshot,
  runWithMediaServerUserAuthority,
} from '@server/lib/mediaServerUserAuthority';
import { getMediaServerWatchStatus } from '@server/lib/mediaServerWatchStatus';
import { Permission } from '@server/lib/permissions';
import requestAdmission from '@server/lib/requestAdmission';
import { getSettings } from '@server/lib/settings';
import { runUserSecurityMutationWithActor } from '@server/lib/userSecurityMutation';
import {
  hasWatchAheadMediaServerLink,
  isWatchAheadMediaServer,
} from '@server/lib/watchAheadEligibility';
import logger from '@server/logger';
import AsyncLock from '@server/utils/asyncLock';
import { In } from 'typeorm';

export class MovieCollectionQueueError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}
export const queueView = (queue: MovieCollectionQueue) => ({
  id: queue.id,
  collectionId: queue.collectionId,
  is4k: queue.is4k,
  bufferSize: queue.bufferSize,
  status: queue.status,
  reason: queue.reason,
  total: queue.movieIds.length,
  watched: queue.watchedIds.length,
  requested: queue.requestedIds.length,
  updatedAt: queue.updatedAt,
});
const hasPlayback = (user: User) => {
  const type = getSettings().main.mediaServerType;
  return (
    isWatchAheadMediaServer(type) &&
    hasWatchAheadMediaServerLink(user, type) &&
    (type === MediaServerType.PLEX
      ? !!user.plexToken
      : !!user.jellyfinAuthToken)
  );
};
const eligible = (user: User, is4k: boolean) =>
  hasMediaRequestPermission(user, MediaType.MOVIE, is4k) &&
  (!is4k || getSettings().main.enable4k !== false) &&
  getSettings().main.enabledMediaCategories.movie;

const queueLock = new AsyncLock();
const queueAdmission = <T>(
  userId: number,
  collectionId: number,
  is4k: boolean,
  callback: () => Promise<T>
): Promise<T> => {
  const key = `movie-collection:${userId}:${collectionId}:${is4k}`;
  return requestAdmission.run([key], () => queueLock.dispatch(key, callback));
};
class MovieCollectionQueues {
  private running = false;
  public start(
    user: User,
    collectionId: number,
    is4k: boolean,
    bufferSize: number,
    expectedCredentialVersion?: number
  ): Promise<MovieCollectionQueue> {
    return queueAdmission(user.id, collectionId, is4k, () =>
      runUserSecurityMutationWithActor(
        user.id,
        user.id,
        Permission.NONE,
        (actor) => this.startAuthorized(actor, collectionId, is4k, bufferSize),
        { includeMediaServerCredentials: true, expectedCredentialVersion }
      )
    );
  }
  public stop(
    userId: number,
    collectionId: number,
    is4k: boolean,
    expectedCredentialVersion?: number
  ): Promise<void> {
    return queueAdmission(userId, collectionId, is4k, () =>
      runUserSecurityMutationWithActor(
        userId,
        userId,
        Permission.NONE,
        async (actor) => {
          await getRepository(MovieCollectionQueue).update(
            { user: { id: actor.id }, collectionId, is4k },
            { status: 'stopped', reason: null }
          );
        },
        { expectedCredentialVersion }
      )
    );
  }
  private async startAuthorized(
    user: User,
    collectionId: number,
    is4k: boolean,
    bufferSize: number
  ): Promise<MovieCollectionQueue> {
    if (!eligible(user, is4k))
      throw new MovieCollectionQueueError(
        403,
        'Movie request access is required for this quality.'
      );
    if (!hasPlayback(user))
      throw new MovieCollectionQueueError(
        409,
        'Link your Plex, Jellyfin, or Emby account before queueing a collection.'
      );
    const collection = await new TheMovieDb().getCollection({ collectionId });
    const parts = [...collection.parts].sort(
      (a, b) =>
        (a.release_date || '9999').localeCompare(b.release_date || '9999') ||
        a.id - b.id
    );
    const ids = [...new Set(parts.map((p) => p.id))];
    if (
      collection.id !== collectionId ||
      !ids.length ||
      ids.length > 500 ||
      ids.some(
        (id) => !Number.isSafeInteger(id) || id <= 0 || id > 1_000_000_000
      )
    )
      throw new MovieCollectionQueueError(
        400,
        'This collection must contain between 1 and 500 valid movies.'
      );
    return requestAdmission.run(
      [`movie-collection:${user.id}:${collectionId}:${is4k}`],
      async () => {
        const repo = getRepository(MovieCollectionQueue);
        const existing = await repo.findOne({
          where: { user: { id: user.id }, collectionId, is4k },
        });
        if (existing && ['active', 'waiting'].includes(existing.status))
          throw new MovieCollectionQueueError(
            409,
            'Stop the existing collection queue before restarting it.'
          );
        if (
          (await repo.count({
            where: { user: { id: user.id }, status: In(['active', 'waiting']) },
          })) >= 20
        )
          throw new MovieCollectionQueueError(
            409,
            'Stop an active collection queue before adding another.'
          );
        return repo.save(
          new MovieCollectionQueue({
            id: existing?.id,
            user,
            collectionId,
            is4k,
            bufferSize,
            movieIds: ids,
            watchedIds: [],
            requestedIds: [],
            admittingMovieId: null,
            status: 'active',
            reason: null,
          })
        );
      }
    );
  }
  public async reconcile(
    id: number,
    budget = { remaining: 20 }
  ): Promise<void> {
    const initial = await getRepository(MovieCollectionQueue).findOne({
      where: { id },
      relations: { user: true },
    });
    if (!initial) return;
    await queueAdmission(
      initial.user.id,
      initial.collectionId,
      initial.is4k,
      async () => {
        const actor = await runUserSecurityMutationWithActor(
          initial.user.id,
          initial.user.id,
          Permission.NONE,
          async (actor) => actor,
          { includeMediaServerCredentials: true }
        );
        const repo = getRepository(MovieCollectionQueue);
        const queue = await repo.findOne({
          where: { id, user: { id: initial.user.id } },
          relations: { user: { settings: true } },
        });
        if (!queue || !['active', 'waiting'].includes(queue.status)) return;
        queue.user = actor;
        if (!eligible(queue.user, queue.is4k)) {
          await repo.update(id, {
            status: 'waiting',
            reason: 'request-policy',
          });
          return;
        }
        if (!hasPlayback(queue.user)) {
          await repo.update(id, {
            status: 'waiting',
            reason: 'playback-unlinked',
          });
          return;
        }
        const serverType = getSettings().main.mediaServerType;
        const config = captureConfigurationAuthority(
          serverType === MediaServerType.PLEX ? 'plex' : 'jellyfin'
        );
        const authority: MediaServerUserAuthoritySnapshot = {
          userId: actor.id,
          type: serverType === MediaServerType.PLEX ? 'plex' : 'jellyfin',
          plexToken: actor.plexToken,
          jellyfinUserId: actor.jellyfinUserId,
          jellyfinDeviceId: actor.jellyfinDeviceId,
        };
        const watched = new Set(queue.watchedIds);
        const requested = new Set(queue.requestedIds);
        let buffered = 0;
        queue.status = 'active';
        queue.reason = null;
        try {
          await (async () => {
            const media = await getRepository(Media).find({
              where: {
                tmdbId: In(queue.movieIds),
                mediaType: MediaType.MOVIE,
              },
              relations: { requests: true },
            });
            const byId = new Map(media.map((item) => [item.tmdbId, item]));
            if (queue.admittingMovieId != null) {
              const previous = byId.get(queue.admittingMovieId);
              const covered =
                previous &&
                ([
                  MediaStatus.AVAILABLE,
                  MediaStatus.PARTIALLY_AVAILABLE,
                ].includes(queue.is4k ? previous.status4k : previous.status) ||
                  previous.requests.some(
                    (request) =>
                      request.is4k === queue.is4k &&
                      [
                        MediaRequestStatus.PENDING,
                        MediaRequestStatus.APPROVED,
                        MediaRequestStatus.COMPLETED,
                      ].includes(request.status)
                  ));
              if (!covered) {
                queue.status = 'stopped';
                queue.reason = 'request-cancelled';
                return;
              }
              requested.add(queue.admittingMovieId);
              queue.admittingMovieId = null;
            }
            for (const movieId of queue.movieIds) {
              if (
                getConfigurationAuthorityKey(config.section) !==
                config.authorityKey
              )
                throw new Error('Playback configuration changed.');
              await assertMediaServerUserAuthorityCurrent(authority);
              if (watched.has(movieId)) continue;
              if (buffered >= queue.bufferSize || budget.remaining <= 0) break;
              const item = byId.get(movieId);
              if (item) {
                budget.remaining -= 1;
                const status = await runWithMediaServerUserAuthority(
                  authority,
                  () =>
                    runWithConfigurationSnapshot(config, () =>
                      getMediaServerWatchStatus(item, queue.user, false)
                    )
                );
                if (status.availableCount > 0 && status.watchedCount > 0) {
                  watched.add(movieId);
                  continue;
                }
              }
              const active = item?.requests?.find(
                (request) =>
                  request.is4k === queue.is4k &&
                  [
                    MediaRequestStatus.PENDING,
                    MediaRequestStatus.APPROVED,
                    MediaRequestStatus.FAILED,
                    MediaRequestStatus.COMPLETED,
                  ].includes(request.status)
              );
              const available =
                item &&
                [
                  MediaStatus.AVAILABLE,
                  MediaStatus.PARTIALLY_AVAILABLE,
                ].includes(queue.is4k ? item.status4k : item.status);
              if (!available && active?.status === MediaRequestStatus.FAILED) {
                queue.status = 'waiting';
                queue.reason = 'request-policy';
                break;
              }
              if (active || available) {
                buffered += 1;
                continue;
              }
              if (requested.has(movieId)) {
                queue.status = 'stopped';
                queue.reason = 'request-cancelled';
                break;
              }
              try {
                queue.admittingMovieId = movieId;
                await repo.update(id, { admittingMovieId: movieId });
                await MediaRequest.request(
                  {
                    mediaType: MediaType.MOVIE,
                    mediaId: movieId,
                    is4k: queue.is4k,
                  },
                  queue.user,
                  { expectedMediaServerUserAuthority: authority }
                );
                requested.add(movieId);
                queue.admittingMovieId = null;
                buffered += 1;
                // Preserve successful admission before moving to the next movie.
                await repo.update(id, {
                  admittingMovieId: null,
                  requestedIds: [...requested],
                  watchedIds: [...watched],
                });
              } catch {
                await repo.update(id, { admittingMovieId: null });
                queue.admittingMovieId = null;
                queue.status = 'waiting';
                queue.reason = 'request-policy';
                break;
              }
            }
          })();
        } catch {
          queue.status = 'waiting';
          queue.reason = 'provider-unavailable';
        }
        queue.watchedIds = [...watched];
        queue.requestedIds = [...requested];
        if (
          queue.movieIds.every(
            (movieId) => watched.has(movieId) || requested.has(movieId)
          )
        ) {
          queue.status = 'completed';
          queue.reason = null;
        }
        await repo.save(queue);
      }
    );
  }
  public async run(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const queues = await getRepository(MovieCollectionQueue).find({
        where: { status: In(['active', 'waiting']) },
        order: { updatedAt: 'ASC' },
        take: 20,
      });
      const budget = { remaining: 40 };
      for (const queue of queues) {
        if (budget.remaining <= 0) break;
        await this.reconcile(queue.id, budget);
      }
    } catch {
      logger.warn('Movie collection queue check could not complete.', {
        label: 'Movie Collection Queue',
      });
    } finally {
      this.running = false;
    }
  }
}
export default new MovieCollectionQueues();
