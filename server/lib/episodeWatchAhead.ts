import JellyfinAPI, {
  type JellyfinLibraryItemExtended,
  type JellyfinSession,
} from '@server/api/jellyfin';
import PlexAPI, {
  type PlexMetadata,
  type PlexPlaybackSession,
} from '@server/api/plexapi';
import SonarrAPI from '@server/api/servarr/sonarr';
import {
  MediaRequestStatus,
  MediaStatus,
  MediaType,
} from '@server/constants/media';
import { MediaServerType } from '@server/constants/server';
import dataSource, { getRepository } from '@server/datasource';
import MediaRequest, {
  getRequestMutationAdmissionKey,
  hasMediaRequestPermission,
  runWithRequestAdmission,
} from '@server/entity/MediaRequest';
import SeasonRequest, {
  isActiveSeasonRequest,
} from '@server/entity/SeasonRequest';
import type { SeasonEpisodeSelection } from '@server/interfaces/api/seasonInterfaces';
import { getExternalRuntimeConfig } from '@server/lib/externalRuntimeConfig';
import { runWithCurrentServarrService } from '@server/lib/serviceAdmission';
import type { SonarrSettings } from '@server/lib/settings';
import { runUserSecurityMutation } from '@server/lib/userSecurityMutation';
import {
  isPlexPlaybackSessionForUser,
  isWatchAheadMediaServer,
} from '@server/lib/watchAheadEligibility';
import logger from '@server/logger';
import { getHostname } from '@server/utils/getHostname';
import { normalizeJellyfinGuid } from '@server/utils/jellyfin';
import { In, MoreThan } from 'typeorm';

export const MAX_WATCH_AHEAD_EPISODES = 5;
export const MAX_WATCH_AHEAD_ENROLLMENTS_PER_RUN = 1_000;
export const WATCH_AHEAD_RECONCILE_INTERVAL_SECONDS = 15 * 60;

export interface WatchAheadEpisode {
  seasonNumber: number;
  episodeNumber: number;
  hasFile: boolean;
  monitored: boolean;
}

export interface WatchAheadProgress {
  seasonNumber: number;
  episodeNumber: number;
}

const episodeKey = (seasonNumber: number, episodeNumber: number) =>
  `${seasonNumber}:${episodeNumber}`;

const compareProgress = (
  left: WatchAheadProgress,
  right: WatchAheadProgress
): number =>
  left.seasonNumber - right.seasonNumber ||
  left.episodeNumber - right.episodeNumber;

const isValidProgress = (
  progress: WatchAheadProgress | null | undefined
): progress is WatchAheadProgress =>
  Boolean(
    progress &&
    Number.isSafeInteger(progress.seasonNumber) &&
    progress.seasonNumber >= 0 &&
    Number.isSafeInteger(progress.episodeNumber) &&
    progress.episodeNumber >= 0
  );

export const selectNextWatchAheadEpisodeSelections = (
  episodes: WatchAheadEpisode[],
  progress: WatchAheadProgress,
  bufferSize: number,
  coveredEpisodes: ReadonlySet<string>,
  includeSpecials: boolean
): SeasonEpisodeSelection[] => {
  if (
    !isValidProgress(progress) ||
    !Number.isSafeInteger(bufferSize) ||
    bufferSize <= 0 ||
    bufferSize > MAX_WATCH_AHEAD_EPISODES
  ) {
    return [];
  }

  const orderedEpisodes = [...episodes]
    .filter(
      (episode) =>
        Number.isSafeInteger(episode.seasonNumber) &&
        episode.seasonNumber >= 0 &&
        Number.isSafeInteger(episode.episodeNumber) &&
        episode.episodeNumber >= 0 &&
        (includeSpecials || episode.seasonNumber !== 0) &&
        compareProgress(episode, progress) > 0
    )
    .sort(compareProgress);

  const selectedBySeason = new Map<number, number[]>();
  let bufferedEpisodeCount = 0;
  for (const episode of orderedEpisodes) {
    const isCovered =
      episode.hasFile ||
      episode.monitored ||
      coveredEpisodes.has(
        episodeKey(episode.seasonNumber, episode.episodeNumber)
      );

    if (!isCovered) {
      const selected = selectedBySeason.get(episode.seasonNumber) ?? [];
      selected.push(episode.episodeNumber);
      selectedBySeason.set(episode.seasonNumber, selected);
    }

    bufferedEpisodeCount += 1;
    if (bufferedEpisodeCount >= bufferSize) {
      break;
    }
  }

  return [...selectedBySeason.entries()]
    .sort(([left], [right]) => left - right)
    .map(([seasonNumber, episodeNumbers]) => ({
      seasonNumber,
      episodeNumbers,
    }));
};

export const getCompletedWatchAheadProgress = (
  session: JellyfinSession,
  userItem: JellyfinLibraryItemExtended
): WatchAheadProgress | undefined => {
  const episode = session.NowPlayingItem;
  const runtimeTicks = userItem.RunTimeTicks ?? episode?.RunTimeTicks;
  const positionTicks = session.PlayState?.PositionTicks;

  if (
    !episode ||
    episode.Type !== 'Episode' ||
    userItem.Type !== 'Episode' ||
    userItem.Id !== episode.Id ||
    userItem.UserData?.Played !== true ||
    session.PlayState?.IsPaused === true ||
    !runtimeTicks ||
    !positionTicks ||
    positionTicks < runtimeTicks * 0.9 ||
    episode.ParentIndexNumber === undefined ||
    episode.IndexNumber === undefined
  ) {
    return undefined;
  }

  const progress = {
    seasonNumber: episode.ParentIndexNumber,
    episodeNumber: episode.IndexNumber,
  };
  return isValidProgress(progress) ? progress : undefined;
};

export const getCompletedPlexWatchAheadProgress = (
  session: PlexPlaybackSession
): WatchAheadProgress | undefined => {
  if (
    session.type !== 'episode' ||
    session.state !== 'playing' ||
    session.duration <= 0 ||
    session.viewOffset < session.duration * 0.9
  ) {
    return undefined;
  }

  const progress = {
    seasonNumber: session.parentIndex,
    episodeNumber: session.index,
  };
  return isValidProgress(progress) ? progress : undefined;
};

export const getPlexTvdbId = (
  series: Pick<PlexMetadata, 'guid' | 'Guid'>
): number | undefined => {
  for (const guid of [
    series.guid,
    ...(series.Guid ?? []).map(({ id }) => id),
  ]) {
    const match = /^tvdb:\/\/(\d+)$/.exec(guid);
    if (!match) continue;
    const tvdbId = Number(match[1]);
    if (Number.isSafeInteger(tvdbId) && tvdbId > 0) return tvdbId;
  }
  return undefined;
};

const enrollmentStatuses = [
  MediaRequestStatus.PENDING,
  MediaRequestStatus.APPROVED,
  MediaRequestStatus.COMPLETED,
];

const coveredStatuses = [
  MediaRequestStatus.PENDING,
  MediaRequestStatus.APPROVED,
];

const getProgressFromRequest = (
  request: MediaRequest
): WatchAheadProgress | undefined => {
  const progress = {
    seasonNumber: request.watchAheadLastSeason,
    episodeNumber: request.watchAheadLastEpisode,
  };
  return isValidProgress(progress as WatchAheadProgress)
    ? (progress as WatchAheadProgress)
    : undefined;
};

const getLaterProgress = (
  existing: WatchAheadProgress | undefined,
  observed: WatchAheadProgress | undefined
): WatchAheadProgress | undefined => {
  if (!existing) return observed;
  if (!observed) return existing;
  return compareProgress(observed, existing) > 0 ? observed : existing;
};

const getMatchingSonarr = (
  settings: ReturnType<typeof getExternalRuntimeConfig>,
  request: MediaRequest
): SonarrSettings | undefined => {
  const selected =
    request.serverId == null
      ? settings.sonarr.find(
          (server) => server.isDefault && Boolean(server.is4k) === request.is4k
        )
      : settings.sonarr.find(
          (server) =>
            server.id === request.serverId &&
            Boolean(server.is4k) === request.is4k
        );
  return selected;
};

export const getCoveredEpisodeKeys = (
  requests: MediaRequest[],
  parentId: number,
  episodes: WatchAheadEpisode[]
): Set<string> => {
  const covered = new Set<string>();
  for (const request of requests) {
    const isLinkedChild =
      request.watchAheadParentRequestId === parentId ||
      request.watchAheadParent?.id === parentId;
    const isOwnerDeclinedChild =
      isLinkedChild && request.status === MediaRequestStatus.DECLINED;
    if (
      request.id !== parentId &&
      !coveredStatuses.includes(request.status) &&
      !isOwnerDeclinedChild
    ) {
      continue;
    }

    for (const season of request.seasons ?? []) {
      if (!isActiveSeasonRequest(season)) continue;
      if (season.episodeNumbers == null) {
        for (const episode of episodes) {
          if (episode.seasonNumber === season.seasonNumber) {
            covered.add(
              episodeKey(episode.seasonNumber, episode.episodeNumber)
            );
          }
        }
      } else {
        for (const episodeNumber of season.episodeNumbers) {
          covered.add(episodeKey(season.seasonNumber, episodeNumber));
        }
      }
    }
  }
  return covered;
};

class EpisodeWatchAhead {
  private activeRun = false;
  private enrollmentCursor = 0;

  public async run(): Promise<void> {
    if (this.activeRun) return;
    this.activeRun = true;

    try {
      const settings = getExternalRuntimeConfig();
      if (!isWatchAheadMediaServer(settings.main.mediaServerType)) {
        return;
      }

      const enrollments = await this.getEnrollments();
      if (enrollments.length === 0) return;

      const advancedParents =
        settings.main.mediaServerType === MediaServerType.PLEX
          ? await this.reconcilePlexPlayback(enrollments, settings)
          : settings.jellyfin.apiKey
            ? await this.reconcileJellyfinPlayback(enrollments, settings)
            : new Set<number>();

      const now = Math.floor(Date.now() / 1_000);
      for (const enrollment of enrollments) {
        if (advancedParents.has(enrollment.id)) continue;
        if (
          !getProgressFromRequest(enrollment) ||
          enrollment.status === MediaRequestStatus.PENDING ||
          (enrollment.status !== MediaRequestStatus.APPROVED &&
            enrollment.status !== MediaRequestStatus.COMPLETED) ||
          (enrollment.watchAheadLastReconciledAt != null &&
            now - enrollment.watchAheadLastReconciledAt <
              WATCH_AHEAD_RECONCILE_INTERVAL_SECONDS)
        ) {
          continue;
        }
        await this.reconcileEnrollment(enrollment.id, undefined, settings);
      }
    } catch (error) {
      logger.error('Media server episode queue job failed', {
        label: 'Episode Queue',
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.activeRun = false;
    }
  }

  private async getEnrollments(): Promise<MediaRequest[]> {
    const repository = getRepository(MediaRequest);
    const buildQuery = (cursor: number) =>
      repository
        .createQueryBuilder('request')
        .innerJoinAndSelect('request.media', 'media')
        .innerJoinAndSelect('request.requestedBy', 'requestedBy')
        .select([
          'request.id',
          'request.status',
          'request.type',
          'request.is4k',
          'request.serverId',
          'request.watchAheadEpisodeCount',
          'request.watchAheadLastSeason',
          'request.watchAheadLastEpisode',
          'request.watchAheadLastReconciledAt',
          'media.id',
          'media.tvdbId',
          'requestedBy.id',
          'requestedBy.plexId',
          'requestedBy.plexUsername',
          'requestedBy.plexToken',
          'requestedBy.jellyfinUserId',
        ])
        .where('request.type = :type', { type: MediaType.TV })
        .andWhere('request.watchAheadEpisodeCount > 0')
        .andWhere('request.status IN (:...statuses)', {
          statuses: enrollmentStatuses,
        })
        .andWhere('request.id > :cursor', { cursor })
        .orderBy('request.id', 'ASC')
        .take(MAX_WATCH_AHEAD_ENROLLMENTS_PER_RUN);

    let enrollments = await buildQuery(this.enrollmentCursor).getMany();
    if (enrollments.length === 0 && this.enrollmentCursor > 0) {
      this.enrollmentCursor = 0;
      enrollments = await buildQuery(0).getMany();
    }
    if (enrollments.length > 0) {
      this.enrollmentCursor = enrollments[enrollments.length - 1].id;
    }
    return enrollments;
  }

  private async reconcileJellyfinPlayback(
    enrollments: MediaRequest[],
    settings: ReturnType<typeof getExternalRuntimeConfig>
  ): Promise<Set<number>> {
    const jellyfin = new JellyfinAPI(
      getHostname(settings.jellyfin),
      settings.jellyfin.apiKey
    );
    const sessions = await jellyfin.getPlaybackSessions();
    const byUser = new Map<string, MediaRequest[]>();
    for (const enrollment of enrollments) {
      const jellyfinUserId = normalizeJellyfinGuid(
        enrollment.requestedBy.jellyfinUserId
      );
      if (!jellyfinUserId || enrollment.media.tvdbId == null) continue;
      const userEnrollments = byUser.get(jellyfinUserId) ?? [];
      userEnrollments.push(enrollment);
      byUser.set(jellyfinUserId, userEnrollments);
    }

    const seriesCache = new Map<
      string,
      JellyfinLibraryItemExtended | undefined
    >();
    const advancedParents = new Set<number>();
    for (const session of sessions.slice(0, 100)) {
      try {
        const jellyfinUserId = normalizeJellyfinGuid(session.UserId);
        const userEnrollments = jellyfinUserId
          ? byUser.get(jellyfinUserId)
          : undefined;
        const playingEpisode = session.NowPlayingItem;
        if (
          !jellyfinUserId ||
          !userEnrollments?.length ||
          !playingEpisode ||
          playingEpisode.Type !== 'Episode' ||
          !playingEpisode.SeriesId
        ) {
          continue;
        }

        const userItem = await jellyfin.getUserPlaybackItem(
          session.UserId!,
          playingEpisode.Id
        );
        if (!userItem) continue;
        const progress = getCompletedWatchAheadProgress(session, userItem);
        if (!progress) continue;

        const seriesCacheKey = `${jellyfinUserId}:${playingEpisode.SeriesId}`;
        let jellyfinSeries = seriesCache.get(seriesCacheKey);
        if (!jellyfinSeries) {
          jellyfinSeries = await jellyfin.getUserPlaybackItem(
            session.UserId!,
            playingEpisode.SeriesId
          );
          seriesCache.set(seriesCacheKey, jellyfinSeries);
        }
        if (jellyfinSeries?.Type !== 'Series') continue;
        const jellyfinTvdbId = Number(jellyfinSeries.ProviderIds.Tvdb);
        if (!Number.isSafeInteger(jellyfinTvdbId) || jellyfinTvdbId <= 0) {
          continue;
        }

        for (const enrollment of userEnrollments.filter(
          (candidate) => candidate.media.tvdbId === jellyfinTvdbId
        )) {
          await this.reconcileEnrollment(enrollment.id, progress, settings);
          advancedParents.add(enrollment.id);
        }
      } catch (error) {
        logger.warn('Unable to reconcile a media server playback session', {
          label: 'Episode Queue',
          errorMessage: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return advancedParents;
  }

  private async reconcilePlexPlayback(
    enrollments: MediaRequest[],
    settings: ReturnType<typeof getExternalRuntimeConfig>
  ): Promise<Set<number>> {
    const byUser = new Map<number, MediaRequest[]>();
    for (const enrollment of enrollments) {
      if (
        !enrollment.requestedBy.plexToken ||
        enrollment.media.tvdbId == null
      ) {
        continue;
      }
      const userEnrollments = byUser.get(enrollment.requestedBy.id) ?? [];
      userEnrollments.push(enrollment);
      byUser.set(enrollment.requestedBy.id, userEnrollments);
    }

    const advancedParents = new Set<number>();
    for (const userEnrollments of byUser.values()) {
      const linkedUser = userEnrollments[0].requestedBy;
      try {
        const plex = new PlexAPI({
          plexToken: linkedUser.plexToken,
          plexSettings: settings.plex,
        });
        const sessions = await plex.getPlaybackSessions();
        const seriesCache = new Map<string, PlexMetadata>();
        for (const session of sessions) {
          const belongsToLinkedUser = isPlexPlaybackSessionForUser(
            session,
            linkedUser
          );
          const progress = getCompletedPlexWatchAheadProgress(session);
          if (
            !belongsToLinkedUser ||
            !progress ||
            !session.grandparentRatingKey
          ) {
            continue;
          }

          let series = seriesCache.get(session.grandparentRatingKey);
          if (!series) {
            series = await plex.getMetadata(session.grandparentRatingKey);
            seriesCache.set(session.grandparentRatingKey, series);
          }
          const plexTvdbId = getPlexTvdbId(series);
          if (!plexTvdbId) continue;

          for (const enrollment of userEnrollments.filter(
            (candidate) => candidate.media.tvdbId === plexTvdbId
          )) {
            await this.reconcileEnrollment(enrollment.id, progress, settings);
            advancedParents.add(enrollment.id);
          }
        }
      } catch (error) {
        logger.warn('Unable to reconcile a Plex playback session', {
          label: 'Episode Queue',
          userId: linkedUser.id,
          errorMessage: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return advancedParents;
  }

  private async reconcileEnrollment(
    requestId: number,
    observedProgress: WatchAheadProgress | undefined,
    settings: ReturnType<typeof getExternalRuntimeConfig>
  ): Promise<void> {
    const repository = getRepository(MediaRequest);
    const enrollment = await repository.findOne({
      where: { id: requestId },
      relations: { requestedBy: true },
    });
    if (!enrollment) return;

    await runUserSecurityMutation(enrollment.requestedBy.id, () =>
      runWithRequestAdmission(
        [getRequestMutationAdmissionKey(requestId)],
        async () => {
          const snapshot = await repository.findOne({
            where: { id: requestId },
            relations: { media: true, requestedBy: true },
          });
          if (
            !snapshot ||
            snapshot.type !== MediaType.TV ||
            snapshot.watchAheadEpisodeCount <= 0 ||
            !enrollmentStatuses.includes(snapshot.status) ||
            !hasMediaRequestPermission(
              snapshot.requestedBy,
              MediaType.TV,
              snapshot.is4k
            )
          ) {
            return;
          }

          const currentProgress = getProgressFromRequest(snapshot);
          const nextProgress = getLaterProgress(
            currentProgress,
            observedProgress
          );
          const hasNewProgress =
            !!observedProgress &&
            (!currentProgress ||
              compareProgress(observedProgress, currentProgress) > 0);
          const now = Math.floor(Date.now() / 1_000);
          const isDue =
            snapshot.watchAheadLastReconciledAt == null ||
            now - snapshot.watchAheadLastReconciledAt >=
              WATCH_AHEAD_RECONCILE_INTERVAL_SECONDS;

          if (snapshot.status === MediaRequestStatus.PENDING) {
            if (hasNewProgress && nextProgress) {
              await repository.update(snapshot.id, {
                watchAheadLastSeason: nextProgress.seasonNumber,
                watchAheadLastEpisode: nextProgress.episodeNumber,
                watchAheadLastReconciledAt: null,
              });
            }
            return;
          }
          if (!nextProgress || (!hasNewProgress && !isDue)) return;

          const tvdbId = snapshot.media.tvdbId;
          const sonarrSettings = getMatchingSonarr(settings, snapshot);
          if (
            tvdbId == null ||
            !Number.isSafeInteger(Number(tvdbId)) ||
            Number(tvdbId) <= 0 ||
            !sonarrSettings
          ) {
            await this.saveProgressAndReconcileTime(
              requestId,
              nextProgress,
              now
            );
            return;
          }

          try {
            const reconciled = await runWithCurrentServarrService(
              'sonarr',
              sonarrSettings.id,
              (currentSonarrSettings) =>
                this.reconcileWithSonarr(
                  requestId,
                  nextProgress,
                  observedProgress,
                  now,
                  currentSonarrSettings,
                  settings.main.enableSpecialEpisodes,
                  Number(tvdbId)
                )
            );
            if (!reconciled) {
              await this.saveProgressAndReconcileTime(
                requestId,
                nextProgress,
                now
              );
            }
          } catch (error) {
            await this.saveProgressAndReconcileTime(
              requestId,
              nextProgress,
              now
            );
            logger.warn('Sonarr watch-ahead reconciliation failed', {
              label: 'Episode Queue',
              requestId,
              sonarrServerId: sonarrSettings.id,
              errorMessage:
                error instanceof Error ? error.message : String(error),
            });
          }
        }
      )
    );
  }

  private async reconcileWithSonarr(
    requestId: number,
    nextProgress: WatchAheadProgress,
    observedProgress: WatchAheadProgress | undefined,
    now: number,
    sonarrSettings: SonarrSettings,
    includeSpecials: boolean,
    tvdbId: number
  ): Promise<boolean> {
    const sonarr = new SonarrAPI({
      apiKey: sonarrSettings.apiKey,
      url: SonarrAPI.buildUrl(sonarrSettings, '/api/v3'),
    });
    const series = (await sonarr.getLibrarySeriesByTvdbId(tvdbId))
      .filter(
        (candidate) =>
          candidate.tvdbId === tvdbId &&
          Number.isSafeInteger(candidate.id) &&
          (candidate.id ?? 0) > 0
      )
      .sort((left, right) => (left.id ?? 0) - (right.id ?? 0))[0];
    if (!series?.id) return false;

    const sonarrEpisodes: WatchAheadEpisode[] = (
      await sonarr.getEpisodes(series.id)
    ).map((episode) => ({
      seasonNumber: episode.seasonNumber,
      episodeNumber: episode.episodeNumber,
      hasFile: episode.hasFile,
      monitored: episode.monitored,
    }));

    await dataSource.transaction(async (manager) => {
      const requestRepository = manager.getRepository(MediaRequest);
      const current = await requestRepository.findOne({
        where: { id: requestId },
        relations: { media: true, requestedBy: true },
      });
      if (
        !current ||
        current.type !== MediaType.TV ||
        current.watchAheadEpisodeCount <= 0 ||
        (current.status !== MediaRequestStatus.APPROVED &&
          current.status !== MediaRequestStatus.COMPLETED) ||
        !hasMediaRequestPermission(
          current.requestedBy,
          MediaType.TV,
          current.is4k
        )
      ) {
        return;
      }

      const latestProgress = getLaterProgress(
        getProgressFromRequest(current),
        observedProgress
      );
      if (!latestProgress) return;
      const transactionNow = Math.floor(Date.now() / 1_000);
      const transactionIsDue =
        current.watchAheadLastReconciledAt == null ||
        transactionNow - current.watchAheadLastReconciledAt >=
          WATCH_AHEAD_RECONCILE_INTERVAL_SECONDS;
      const transactionHasNewProgress =
        !!observedProgress &&
        (!getProgressFromRequest(current) ||
          compareProgress(observedProgress, getProgressFromRequest(current)!) >
            0);
      if (!transactionHasNewProgress && !transactionIsDue) return;

      const updated = await requestRepository.update(
        {
          id: current.id,
          watchAheadEpisodeCount: MoreThan(0),
          status: In([
            MediaRequestStatus.APPROVED,
            MediaRequestStatus.COMPLETED,
          ]),
        },
        {
          watchAheadLastSeason: latestProgress.seasonNumber,
          watchAheadLastEpisode: latestProgress.episodeNumber,
          watchAheadLastReconciledAt: transactionNow,
        }
      );
      if (updated.affected !== 1) return;

      const coverageQuery = requestRepository
        .createQueryBuilder('request')
        .leftJoinAndSelect('request.seasons', 'seasons')
        .leftJoinAndSelect('request.watchAheadParent', 'watchAheadParent')
        .innerJoin('request.media', 'media')
        .select([
          'request.id',
          'request.status',
          'request.is4k',
          'request.serverId',
          'watchAheadParent.id',
          'seasons.id',
          'seasons.seasonNumber',
          'seasons.status',
          'seasons.episodeNumbers',
        ])
        .where('media.id = :mediaId', { mediaId: current.media.id })
        .andWhere('request.type = :type', { type: MediaType.TV })
        .andWhere('request.is4k = :is4k', { is4k: current.is4k })
        .andWhere(
          sonarrSettings.isDefault
            ? '(request.serverId = :serverId OR request.serverId IS NULL)'
            : 'request.serverId = :serverId',
          { serverId: sonarrSettings.id }
        )
        .andWhere(
          '(request.status IN (:...coveredStatuses) OR request.id = :parentId OR watchAheadParent.id = :parentId)',
          { coveredStatuses, parentId: current.id }
        );
      const existingRequests = await coverageQuery.getMany();
      const coveredEpisodes = getCoveredEpisodeKeys(
        existingRequests,
        current.id,
        sonarrEpisodes
      );
      const selections = selectNextWatchAheadEpisodeSelections(
        sonarrEpisodes,
        latestProgress,
        current.watchAheadEpisodeCount,
        coveredEpisodes,
        includeSpecials
      );
      if (selections.length === 0) return;

      const child = new MediaRequest({
        type: MediaType.TV,
        media: current.media,
        requestedBy: current.requestedBy,
        status: MediaRequestStatus.APPROVED,
        is4k: current.is4k,
        serverId: sonarrSettings.id,
        profileId: current.profileId,
        languageProfileId: current.languageProfileId,
        rootFolder: current.rootFolder,
        tags: current.tags ? [...current.tags] : current.tags,
        serviceTargets: [
          {
            serviceType: 'sonarr',
            format: current.is4k ? '4k' : 'standard',
            serverId: sonarrSettings.id,
            profileId: current.profileId ?? null,
            languageProfileId: current.languageProfileId ?? null,
            rootFolder: current.rootFolder ?? null,
            tags: current.tags ? [...current.tags] : null,
            status: MediaStatus.PENDING,
          },
        ],
        seasons: selections.map(
          (selection) =>
            new SeasonRequest({
              seasonNumber: selection.seasonNumber,
              episodeNumbers: selection.episodeNumbers,
              status: MediaRequestStatus.APPROVED,
            })
        ),
        isAutoRequest: false,
        ignoreQuota: true,
        watchAheadParent: current,
      });
      await requestRepository.save(child);
    });
    return true;
  }

  private async saveProgressAndReconcileTime(
    requestId: number,
    progress: WatchAheadProgress,
    reconciledAt: number
  ): Promise<void> {
    const requestRepository = getRepository(MediaRequest);
    const current = await requestRepository.findOne({
      where: { id: requestId },
    });
    if (
      !current ||
      current.watchAheadEpisodeCount <= 0 ||
      (current.status !== MediaRequestStatus.APPROVED &&
        current.status !== MediaRequestStatus.COMPLETED)
    ) {
      return;
    }
    const laterProgress = getLaterProgress(
      getProgressFromRequest(current),
      progress
    );
    if (!laterProgress) return;
    await requestRepository.update(
      {
        id: current.id,
        watchAheadEpisodeCount: MoreThan(0),
        status: In([MediaRequestStatus.APPROVED, MediaRequestStatus.COMPLETED]),
      },
      {
        watchAheadLastSeason: laterProgress.seasonNumber,
        watchAheadLastEpisode: laterProgress.episodeNumber,
        watchAheadLastReconciledAt: reconciledAt,
      }
    );
  }
}

export default new EpisodeWatchAhead();
