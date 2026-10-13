import PlexTvAPI, {
  MAX_PLEX_WATCHLIST_PAGE_SIZE,
  PLEX_WATCHLIST_HYDRATION_CONCURRENCY,
  type PlexWatchlistItem,
} from '@server/api/plextv';
import TheMovieDb from '@server/api/themoviedb';
import { MediaStatus, MediaType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import {
  BlocklistedMediaError,
  DuplicateMediaRequestError,
  MediaRequest,
  NoSeasonsAvailableError,
  QuotaRestrictedError,
  RequestPermissionError,
} from '@server/entity/MediaRequest';
import { PlexWatchlistSyncEntry } from '@server/entity/PlexWatchlistSyncEntry';
import { User } from '@server/entity/User';
import { runUserSecurityMutation } from '@server/lib/userSecurityMutation';
import logger from '@server/logger';
import { mapWithConcurrency } from '@server/utils/concurrency';
import { In, Not } from 'typeorm';
import type { MediaServerUserAuthoritySnapshot } from './mediaServerUserAuthority';
import { Permission } from './permissions';
import { forEachPlexTokenUser } from './plexTokenUserBatches';

export const MAX_PLEX_WATCHLIST_SYNC_ITEMS = 200;
const WATCHLIST_REQUEST_HISTORY_CLOCK_SKEW_MS = 5 * 60 * 1000;

type LoadTvSeasonNumbers = (tmdbId: number) => Promise<number[]>;

export const fetchPlexWatchlistForSync = async (
  plexTv: Pick<PlexTvAPI, 'getWatchlist'>
): Promise<{
  items: PlexWatchlistItem[];
  totalSize: number;
  truncated: boolean;
}> => {
  const items: PlexWatchlistItem[] = [];
  let offset = 0;
  let totalSize = 0;

  do {
    const size = Math.min(
      MAX_PLEX_WATCHLIST_PAGE_SIZE,
      MAX_PLEX_WATCHLIST_SYNC_ITEMS - offset
    );
    const page = await plexTv.getWatchlist({ offset, size });
    totalSize = Math.max(totalSize, page.totalSize);
    items.push(...page.items.slice(0, size));
    offset += size;
  } while (offset < totalSize && offset < MAX_PLEX_WATCHLIST_SYNC_ITEMS);

  return {
    items: dedupePlexWatchlistItems(items).slice(
      0,
      MAX_PLEX_WATCHLIST_SYNC_ITEMS
    ),
    totalSize,
    truncated: totalSize > MAX_PLEX_WATCHLIST_SYNC_ITEMS,
  };
};

const dedupePlexWatchlistItems = (
  items: PlexWatchlistItem[]
): PlexWatchlistItem[] => {
  const seen = new Set<string>();

  return items.filter((item) => {
    const mediaType = item.type === 'show' ? MediaType.TV : MediaType.MOVIE;
    const key = `${mediaType}:${item.tmdbId}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
};

const getMediaType = (item: PlexWatchlistItem) =>
  item.type === 'show' ? MediaType.TV : MediaType.MOVIE;

const canAutoRequestItem = (user: User, item: PlexWatchlistItem): boolean => {
  if (item.type === 'show') {
    return (
      !!item.tvdbId &&
      user.hasPermission(
        [Permission.AUTO_REQUEST, Permission.AUTO_REQUEST_TV],
        { type: 'or' }
      ) &&
      !!user.settings?.watchlistSyncTv
    );
  }

  return (
    user.hasPermission(
      [Permission.AUTO_REQUEST, Permission.AUTO_REQUEST_MOVIE],
      { type: 'or' }
    ) && !!user.settings?.watchlistSyncMovies
  );
};

const getTrackedSeasonNumbers = (value: unknown): number[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return [
    ...new Set(
      value.filter(
        (season): season is number => Number.isSafeInteger(season) && season > 0
      )
    ),
  ].sort((left, right) => left - right);
};

const mergeSeasonNumbers = (...seasons: number[][]): number[] =>
  getTrackedSeasonNumbers(seasons.flat());

export class WatchlistSync {
  private running = false;

  public constructor(
    private readonly loadTvSeasonNumbers: LoadTvSeasonNumbers = async (
      tmdbId
    ) => {
      const show = await new TheMovieDb().getTvShow({ tvId: tmdbId });
      return show.seasons
        .filter(
          (season) => season.season_number !== 0 && season.episode_count > 0
        )
        .map((season) => season.season_number);
    }
  ) {}

  public async syncWatchlist() {
    if (this.running) {
      logger.warn('Plex watchlist sync is already running; skipping this run', {
        label: 'Plex Watchlist Sync',
      });
      return;
    }

    this.running = true;
    try {
      await forEachPlexTokenUser(async (user) => {
        try {
          await this.syncUserWatchlist(user);
        } catch (error) {
          logger.error('Failed to sync Plex watchlist for user', {
            label: 'Plex Watchlist Sync',
            userId: user.id,
            errorMessage:
              error instanceof Error ? error.message : 'Unknown sync error',
          });
        }
      });
    } finally {
      this.running = false;
    }
  }

  private async syncUserWatchlist(user: User) {
    const admitted = await runUserSecurityMutation(user.id, async () => {
      const activeUser = await getRepository(User)
        .createQueryBuilder('user')
        .addSelect('user.plexToken')
        .leftJoinAndSelect('user.settings', 'settings')
        .where('user.id = :userId', { userId: user.id })
        .getOne();
      if (!activeUser?.plexToken) {
        logger.warn(
          'Skipping user watchlist sync for user without plex token',
          {
            label: 'Plex Watchlist Sync',
            userId: user.id,
          }
        );
        return undefined;
      }

      if (
        !activeUser.hasPermission(
          [
            Permission.AUTO_REQUEST,
            Permission.AUTO_REQUEST_MOVIE,
            Permission.AUTO_REQUEST_TV,
            Permission.AUTO_REQUEST_MUSIC,
            Permission.AUTO_REQUEST_BOOK,
            Permission.AUTO_REQUEST_COMIC,
          ],
          { type: 'or' }
        ) ||
        (!activeUser.settings?.watchlistSyncMovies &&
          !activeUser.settings?.watchlistSyncTv &&
          !activeUser.settings?.watchlistSyncMusic &&
          !activeUser.settings?.watchlistSyncBooks &&
          !activeUser.settings?.watchlistSyncComics)
      ) {
        return undefined;
      }

      const plexTv = new PlexTvAPI(activeUser.plexToken);
      return {
        user: activeUser,
        plexTv,
        authoritySnapshot: {
          userId: activeUser.id,
          type: 'plex',
          plexToken: activeUser.plexToken,
        } satisfies MediaServerUserAuthoritySnapshot,
        response: await fetchPlexWatchlistForSync(plexTv),
      };
    });
    if (!admitted) return;

    user = admitted.user;
    const plexTv = admitted.plexTv;
    const sourcePlexId =
      Number.isSafeInteger(user.plexId) && (user.plexId ?? 0) > 0
        ? (user.plexId as number)
        : 0;
    const authoritySnapshot = admitted.authoritySnapshot;
    const response = admitted.response;
    if (response.truncated) {
      logger.warn('Plex watchlist sync reached its per-user item limit', {
        label: 'Plex Watchlist Sync',
        userId: user.id,
        totalSize: response.totalSize,
        itemLimit: MAX_PLEX_WATCHLIST_SYNC_ITEMS,
      });
    }
    const watchlistItems = response.items;

    const mediaItems = await Media.getRelatedMedia(
      user,
      watchlistItems.map((i) => ({
        tmdbId: i.tmdbId,
        mediaType: i.type === 'show' ? MediaType.TV : MediaType.MOVIE,
      }))
    );

    const watchlistTmdbIds = watchlistItems.map((i) => i.tmdbId);

    const requestRepository = getRepository(MediaRequest);
    const existingAutoRequests: MediaRequest[] =
      watchlistTmdbIds.length > 0
        ? await requestRepository
            .createQueryBuilder('request')
            .leftJoinAndSelect('request.media', 'media')
            .leftJoinAndSelect('request.seasons', 'seasons')
            .where('request.requestedBy = :userId', { userId: user.id })
            .andWhere('request.isAutoRequest = true')
            .andWhere('media.tmdbId IN (:...tmdbIds)', {
              tmdbIds: watchlistTmdbIds,
            })
            .getMany()
        : [];

    const autoRequestedTmdbIds = new Set(
      existingAutoRequests
        .filter(
          (r) => r.media != null && r.media.status !== MediaStatus.DELETED
        )
        .map((r) => `${r.media.mediaType}:${r.media.tmdbId}`)
    );

    const unavailableItems = watchlistItems.filter((i) => {
      const itemMediaType = getMediaType(i);

      return (
        !autoRequestedTmdbIds.has(`${itemMediaType}:${i.tmdbId}`) &&
        !mediaItems.find(
          (m) =>
            m.tmdbId === i.tmdbId &&
            m.mediaType === itemMediaType &&
            (m.status === MediaStatus.BLOCKLISTED ||
              (itemMediaType === MediaType.MOVIE &&
                m.status !== MediaStatus.UNKNOWN &&
                m.status !== MediaStatus.DELETED) ||
              (itemMediaType === MediaType.TV &&
                m.status === MediaStatus.AVAILABLE))
        )
      );
    });

    if (unavailableItems.length === 0) {
      return;
    }

    const watchlistEntryRepository = getRepository(PlexWatchlistSyncEntry);
    const existingEntries = await watchlistEntryRepository.find({
      where: {
        requestedBy: { id: user.id },
        sourcePlexId,
        tmdbId: In(unavailableItems.map((item) => item.tmdbId)),
      },
    });
    const hasTrackedEntriesForOtherPlexAccount =
      (await watchlistEntryRepository.count({
        where: {
          requestedBy: { id: user.id },
          sourcePlexId: Not(sourcePlexId),
        },
      })) > 0;
    const entriesByKey = new Map(
      existingEntries.map((entry) => [
        `${entry.mediaType}:${entry.tmdbId}`,
        entry,
      ])
    );

    const autoRequestsByKey = new Map<string, MediaRequest[]>();
    for (const request of existingAutoRequests) {
      if (!request.media) {
        continue;
      }

      const key = `${request.media.mediaType}:${request.media.tmdbId}`;
      autoRequestsByKey.set(key, [
        ...(autoRequestsByKey.get(key) ?? []),
        request,
      ]);
    }

    const itemsWithUserState = unavailableItems.filter((item) =>
      canAutoRequestItem(user, item)
    );
    const watchlistedAtValues = await mapWithConcurrency(
      itemsWithUserState,
      PLEX_WATCHLIST_HYDRATION_CONCURRENCY,
      (item) => plexTv.getWatchlistedAt(item.ratingKey)
    );
    const watchlistedAtByKey = new Map(
      itemsWithUserState.map((item, index) => [
        `${getMediaType(item)}:${item.tmdbId}`,
        watchlistedAtValues[index],
      ])
    );

    for (const mediaItem of unavailableItems) {
      const mediaType = getMediaType(mediaItem);
      const key = `${mediaType}:${mediaItem.tmdbId}`;
      const entry = entriesByKey.get(key);
      let watchlistedAt: Date | null = null;
      let handledSeasonNumbers = entry
        ? getTrackedSeasonNumbers(entry.processedSeasonNumbers)
        : [];
      let candidateSeasonNumbers: number[] = [];
      let handledPreviously = false;

      try {
        if (mediaItem.type === 'show' && !mediaItem.tvdbId) {
          throw new Error('Missing TVDB ID from Plex Metadata');
        }

        // Check for auto-request permission and per-media sync preferences.
        if (!canAutoRequestItem(user, mediaItem)) {
          continue;
        }

        watchlistedAt = watchlistedAtByKey.get(key) ?? null;
        if (!watchlistedAt) {
          logger.warn('Skipping Plex watchlist item without a valid add date', {
            label: 'Plex Watchlist Sync',
            userId: user.id,
            mediaTitle: mediaItem.title,
          });
          continue;
        }

        const rearmed =
          entry != null &&
          entry.watchlistedAt.getTime() !== watchlistedAt.getTime();
        if (entry && !rearmed && mediaType === MediaType.MOVIE) {
          continue;
        }

        if (entry && rearmed) {
          handledSeasonNumbers = [];
          logger.info('Plex watchlist item was re-added', {
            label: 'Plex Watchlist Sync',
            userId: user.id,
            mediaTitle: mediaItem.title,
          });
        } else if (!entry) {
          const priorRequests = hasTrackedEntriesForOtherPlexAccount
            ? []
            : (autoRequestsByKey.get(key) ?? []).filter(
                (request) =>
                  request.createdAt.getTime() >=
                  watchlistedAt!.getTime() -
                    WATCHLIST_REQUEST_HISTORY_CLOCK_SKEW_MS
              );
          handledPreviously = priorRequests.length > 0;
          handledSeasonNumbers = mergeSeasonNumbers(
            priorRequests.flatMap((request) =>
              (request.seasons ?? []).map((season) => season.seasonNumber)
            )
          );
        }

        if (mediaType === MediaType.MOVIE) {
          if (handledPreviously) {
            await this.saveEntry(
              user,
              sourcePlexId,
              mediaItem,
              mediaType,
              watchlistedAt,
              []
            );
            continue;
          }

          await MediaRequest.request(
            {
              mediaId: mediaItem.tmdbId,
              mediaType,
              tvdbId: mediaItem.tvdbId,
              is4k: false,
            },
            user,
            {
              expectedMediaServerUserAuthority: authoritySnapshot,
              isAutoRequest: true,
            }
          );

          await this.saveEntry(
            user,
            sourcePlexId,
            mediaItem,
            mediaType,
            watchlistedAt,
            []
          );

          logger.info("Created media request from user's Plex Watchlist", {
            label: 'Plex Watchlist Sync',
            userId: user.id,
            mediaTitle: mediaItem.title,
          });
          continue;
        }

        candidateSeasonNumbers = await this.loadTvSeasonNumbers(
          mediaItem.tmdbId
        );

        // Legacy auto-requests without saved season rows still count as handled.
        if (handledPreviously && handledSeasonNumbers.length === 0) {
          handledSeasonNumbers = [...candidateSeasonNumbers];
        }

        const seasonsToRequest = candidateSeasonNumbers.filter(
          (seasonNumber) => !handledSeasonNumbers.includes(seasonNumber)
        );
        if (seasonsToRequest.length === 0) {
          if (!entry || rearmed || handledPreviously) {
            await this.saveEntry(
              user,
              sourcePlexId,
              mediaItem,
              mediaType,
              watchlistedAt,
              mergeSeasonNumbers(handledSeasonNumbers, candidateSeasonNumbers)
            );
          }
          continue;
        }

        await MediaRequest.request(
          {
            mediaId: mediaItem.tmdbId,
            mediaType,
            seasons: seasonsToRequest,
            tvdbId: mediaItem.tvdbId,
            is4k: false,
          },
          user,
          {
            expectedMediaServerUserAuthority: authoritySnapshot,
            isAutoRequest: true,
          }
        );

        await this.saveEntry(
          user,
          sourcePlexId,
          mediaItem,
          mediaType,
          watchlistedAt,
          mergeSeasonNumbers(handledSeasonNumbers, candidateSeasonNumbers)
        );

        logger.info("Created media request from user's Plex Watchlist", {
          label: 'Watchlist Sync',
          userId: user.id,
          mediaTitle: mediaItem.title,
        });
      } catch (e) {
        if (!(e instanceof Error)) {
          continue;
        }

        switch (e.constructor) {
          // During watchlist sync, these errors aren't necessarily
          // a problem with Seerr. Since we are auto syncing these constantly, it's
          // possible they are unexpectedly at their quota limit, for example. So we'll
          // instead log these as debug messages.
          case RequestPermissionError:
          case QuotaRestrictedError:
            logger.debug('Failed to create media request from watchlist', {
              label: 'Watchlist Sync',
              userId: user.id,
              mediaTitle: mediaItem.title,
              errorMessage: e.message,
            });
            break;
          case DuplicateMediaRequestError:
          case NoSeasonsAvailableError:
            if (watchlistedAt) {
              await this.saveEntry(
                user,
                sourcePlexId,
                mediaItem,
                mediaType,
                watchlistedAt,
                mediaType === MediaType.TV
                  ? mergeSeasonNumbers(
                      handledSeasonNumbers,
                      candidateSeasonNumbers
                    )
                  : []
              );
            }
            logger.debug('Plex watchlist item was already handled', {
              label: 'Plex Watchlist Sync',
              userId: user.id,
              mediaTitle: mediaItem.title,
              errorMessage: e.message,
            });
            break;
          // Blocklisted media should be silently ignored during watchlist sync to avoid spam
          case BlocklistedMediaError:
            break;
          default:
            logger.error('Failed to create media request from watchlist', {
              label: 'Watchlist Sync',
              userId: user.id,
              mediaTitle: mediaItem.title,
              errorMessage: e.message,
            });
        }
      }
    }
  }

  private async saveEntry(
    user: User,
    sourcePlexId: number,
    mediaItem: PlexWatchlistItem,
    mediaType: MediaType.MOVIE | MediaType.TV,
    watchlistedAt: Date,
    processedSeasonNumbers: number[]
  ): Promise<void> {
    const repository = getRepository(PlexWatchlistSyncEntry);
    const key = `${mediaType}:${mediaItem.tmdbId}`;

    try {
      const entry =
        (await repository.findOne({
          where: {
            requestedBy: { id: user.id },
            sourcePlexId,
            tmdbId: mediaItem.tmdbId,
            mediaType,
          },
        })) ??
        new PlexWatchlistSyncEntry({
          requestedBy: user,
          sourcePlexId,
          tmdbId: mediaItem.tmdbId,
          mediaType,
        });

      entry.watchlistedAt = watchlistedAt;
      entry.processedSeasonNumbers = mergeSeasonNumbers(processedSeasonNumbers);
      await repository.save(entry);
    } catch (error) {
      logger.warn('Unable to save Plex watchlist sync state', {
        label: 'Plex Watchlist Sync',
        userId: user.id,
        item: key,
        errorMessage:
          error instanceof Error ? error.message : 'Unknown database error',
      });
    }
  }
}

const watchlistSync = new WatchlistSync();

export default watchlistSync;
