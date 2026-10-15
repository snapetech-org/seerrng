import {
  getMetadataProvider,
  isTheMovieDbProvider,
} from '@server/api/metadata';
import type { SonarrSeries } from '@server/api/servarr/sonarr';
import SonarrAPI from '@server/api/servarr/sonarr';
import { ANIME_KEYWORD_ID } from '@server/api/themoviedb/constants';
import type {
  TmdbTvDetails,
  TmdbTvScanDetails,
} from '@server/api/themoviedb/interfaces';
import {
  MediaRequestStatus,
  MediaStatus,
  MediaType,
} from '@server/constants/media';
import dataSource, { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import MediaRequest from '@server/entity/MediaRequest';
import Season from '@server/entity/Season';
import SeasonRequest, {
  isActiveSeasonRequest,
} from '@server/entity/SeasonRequest';
import { getExternalRuntimeConfig } from '@server/lib/externalRuntimeConfig';
import { runMediaEntityMutation } from '@server/lib/mediaMutation';
import { upsertMediaSearchMetadata } from '@server/lib/mediaSearchMetadata';
import type {
  ProcessableSeason,
  RunnableScanner,
  StatusBase,
} from '@server/lib/scanners/baseScanner';
import BaseScanner from '@server/lib/scanners/baseScanner';
import { forEachMediaCleanupBatch } from '@server/lib/scanners/mediaCleanupBatches';
import {
  externalSeasonNumberFor,
  findMediaForTvdbId,
  getSeasonMappingsForTvdbIdentifier,
} from '@server/lib/seasonNumberMapping';
import {
  ServarrServiceAuthorityChangedError,
  runWithServarrServiceSnapshot,
  runWithServarrServiceSnapshots,
} from '@server/lib/serviceAdmission';
import type { SonarrSettings } from '@server/lib/settings';
import { getHttpErrorDetails } from '@server/utils/httpError';
import { uniqWith } from 'lodash';
import type { FindOptionsWhere } from 'typeorm';

type SyncStatus = StatusBase & {
  currentServer: SonarrSettings;
  servers: SonarrSettings[];
};

class SonarrScanner
  extends BaseScanner<SonarrSeries>
  implements RunnableScanner<SyncStatus>
{
  private servers: SonarrSettings[];
  private currentServer: SonarrSettings;
  private sonarrApi: SonarrAPI;
  private scannedTvdbIds: Set<number> = new Set();
  private scanned4kTvdbIds: Set<number> = new Set();
  private scannedTmdbIds: Set<number> = new Set();
  private scanned4kTmdbIds: Set<number> = new Set();
  private didScanStandard = false;
  private didScan4k = false;
  private serverReturnedEmpty = false;
  private server4kReturnedEmpty = false;

  constructor() {
    super('Sonarr Scan', { bundleSize: 50 });
  }

  public status(): SyncStatus {
    return {
      running: this.running,
      progress: this.progress,
      total: this.items.length,
      currentServer: this.currentServer,
      servers: this.servers,
    };
  }

  public async run(): Promise<void> {
    const settings = getExternalRuntimeConfig();
    const sessionId = this.startRun();
    if (!sessionId) {
      return;
    }
    this.scannedTvdbIds.clear();
    this.scanned4kTvdbIds.clear();
    this.scannedTmdbIds.clear();
    this.scanned4kTmdbIds.clear();
    this.didScanStandard = false;
    this.didScan4k = false;
    this.serverReturnedEmpty = false;
    this.server4kReturnedEmpty = false;

    try {
      this.servers = uniqWith(
        structuredClone(settings.sonarr),
        (sonarrA, sonarrB) =>
          sonarrA.hostname === sonarrB.hostname &&
          sonarrA.port === sonarrB.port &&
          sonarrA.baseUrl === sonarrB.baseUrl
      );

      for (const server of this.servers) {
        this.currentServer = server;
        if (server.syncEnabled) {
          this.log(
            `Beginning to process Sonarr server: ${server.name}`,
            'info'
          );

          this.items = await runWithServarrServiceSnapshot(
            'sonarr',
            server,
            async (current) => {
              this.sonarrApi = new SonarrAPI({
                apiKey: current.apiKey,
                url: SonarrAPI.buildUrl(current, '/api/v3'),
              });
              return this.sonarrApi.getSeries();
            }
          );

          const server4k = this.enable4kShow && server.is4k;
          if (server4k) {
            this.didScan4k = true;
          } else {
            this.didScanStandard = true;
          }

          if (this.items.length === 0) {
            if (server4k) {
              this.server4kReturnedEmpty = true;
            } else {
              this.serverReturnedEmpty = true;
            }
            this.log(
              `Sonarr server ${server.name} returned no series. Orphan cleanup for this profile type will be skipped.`,
              'warn'
            );
          }

          await this.loop(this.processSonarrSeries.bind(this), { sessionId });
        } else {
          this.log(`Sync not enabled. Skipping Sonarr server: ${server.name}`);
        }
      }

      // Only run cleanup if all servers of this profile type have sync enabled.
      // If any server is skipped, we can't distinguish truly orphaned media from
      // media that exists on an unscanned server (e.g. separate instances for
      // anime, regional content, or different languages).
      const allStandardScanned = this.servers
        .filter((s) => !this.enable4kShow || !s.is4k)
        .every((s) => s.syncEnabled);
      const all4kScanned = this.servers
        .filter((s) => this.enable4kShow && s.is4k)
        .every((s) => s.syncEnabled);

      if (!allStandardScanned) {
        this.didScanStandard = false;
      }
      if (!all4kScanned) {
        this.didScan4k = false;
      }

      if (this.serverReturnedEmpty) {
        this.didScanStandard = false;
      }
      if (this.server4kReturnedEmpty) {
        this.didScan4k = false;
      }

      if (this.didScanStandard) {
        await this.resolveDeferredSeasonStatusResets(false, (callback) =>
          runWithServarrServiceSnapshots(
            'sonarr',
            this.servers.filter((server) => !this.enable4kShow || !server.is4k),
            callback,
            {
              requireExactAuthoritySet: true,
              includeCurrent: (server) => !this.enable4kShow || !server.is4k,
            }
          )
        );
      }
      if (this.didScan4k) {
        await this.resolveDeferredSeasonStatusResets(true, (callback) =>
          runWithServarrServiceSnapshots(
            'sonarr',
            this.servers.filter((server) => this.enable4kShow && server.is4k),
            callback,
            {
              requireExactAuthoritySet: true,
              includeCurrent: (server) => this.enable4kShow && server.is4k,
            }
          )
        );
      }

      await this.cleanupOrphanedShows();
      this.log('Sonarr scan complete', 'info');
    } catch (e) {
      this.log('Scan interrupted', 'error', {
        ...getHttpErrorDetails(e),
        errorStack: e instanceof Error ? e.stack : undefined,
      });
    } finally {
      this.endRun(sessionId);
    }
  }

  private async processSonarrSeries(sonarrSeries: SonarrSeries) {
    const server4k = this.enable4kShow && this.currentServer.is4k;
    if (server4k) {
      this.scanned4kTvdbIds.add(sonarrSeries.tvdbId);
    } else {
      this.scannedTvdbIds.add(sonarrSeries.tvdbId);
    }

    try {
      const mediaMatches = await findMediaForTvdbId(
        dataSource.manager,
        sonarrSeries.tvdbId
      );
      const targets: (Media | undefined)[] =
        mediaMatches.length > 0 ? mediaMatches : [undefined];

      for (const media of targets) {
        let resolvedTmdbId: number | undefined;
        try {
          resolvedTmdbId = await this.processSonarrSeriesForMedia(
            sonarrSeries,
            media,
            server4k
          );
        } catch (e) {
          if (e instanceof ServarrServiceAuthorityChangedError) throw e;
          this.markShowScanFailed(
            sonarrSeries.tvdbId,
            server4k,
            resolvedTmdbId
          );
          this.log('Failed to process Sonarr media', 'error', {
            errorMessage: e instanceof Error ? e.message : String(e),
            title: sonarrSeries.title,
            mediaId: media?.id,
          });
        }
      }
    } catch (e) {
      if (e instanceof ServarrServiceAuthorityChangedError) throw e;
      this.markShowScanFailed(sonarrSeries.tvdbId, server4k);
      this.log('Failed to process Sonarr media', 'error', {
        errorMessage: e instanceof Error ? e.message : String(e),
        title: sonarrSeries.title,
      });
    }
  }

  private async processSonarrSeriesForMedia(
    sonarrSeries: SonarrSeries,
    media: Media | undefined,
    server4k: boolean
  ): Promise<number> {
    let tvShow: TmdbTvScanDetails | TmdbTvDetails;
    if (!media || !media.tmdbId) {
      tvShow = await this.tmdb.getShowByTvdbIdForScan({
        tvdbId: sonarrSeries.tvdbId,
      });
    } else {
      tvShow = await this.tmdb.getTvShowForScan({ tvId: media.tmdbId });
    }

    const tmdbId = tvShow.id;
    (server4k ? this.scanned4kTmdbIds : this.scannedTmdbIds).add(tmdbId);
    tvShow = await this.applyMetadataProvider(tvShow);
    const settings = getExternalRuntimeConfig();
    const seasonMappings = media
      ? getSeasonMappingsForTvdbIdentifier(
          media,
          sonarrSeries.tvdbId,
          this.currentServer.id,
          Boolean(this.currentServer.is4k)
        )
      : [];

    const processableSeasons: ProcessableSeason[] = tvShow.seasons
      .filter(
        (season) =>
          settings.main.enableSpecialEpisodes || season.season_number !== 0
      )
      .map((season) => {
        const externalSeasonNumber = externalSeasonNumberFor(
          season.season_number,
          seasonMappings
        );
        const sonarrSeason = sonarrSeries.seasons.find(
          (item) => item.seasonNumber === externalSeasonNumber
        );
        const totalAvailableEpisodes =
          sonarrSeason?.statistics?.episodeFileCount ?? 0;

        return {
          seasonNumber: season.season_number,
          episodes: !server4k ? totalAvailableEpisodes : 0,
          episodes4k: server4k ? totalAvailableEpisodes : 0,
          totalEpisodes:
            sonarrSeason?.statistics?.totalEpisodeCount ?? season.episode_count,
          processing:
            Boolean(sonarrSeason?.monitored) && totalAvailableEpisodes === 0,
          is4kOverride: server4k,
        };
      });

    await this.processShow(tmdbId, sonarrSeries.tvdbId, processableSeasons, {
      serviceId: this.currentServer.id,
      externalServiceId: sonarrSeries.id,
      externalServiceSlug: sonarrSeries.titleSlug,
      title: sonarrSeries.title,
      is4k: server4k,
      deferStatusReset: true,
      preserveInactiveServiceIdentity: true,
      mutationGuard: (callback) =>
        runWithServarrServiceSnapshot('sonarr', this.currentServer, callback),
    });

    const updatedMedia = await getRepository(Media).findOneBy({
      tmdbId,
      mediaType: MediaType.TV,
    });
    await upsertMediaSearchMetadata(updatedMedia?.id, {
      title: tvShow.name,
      alternateTitle: tvShow.original_name,
      releaseDate: tvShow.first_air_date,
      genres: tvShow.genres.map((genre) => genre.name).join(', '),
      runtime: tvShow.episode_run_time[0]
        ? `${tvShow.episode_run_time[0]} minutes`
        : undefined,
      creator: tvShow.created_by.map((creator) => creator.name).join(', '),
      studio: tvShow.production_companies
        .map((company) => company.name)
        .join(', '),
      network: tvShow.networks.map((network) => network.name).join(', '),
      format: 'Series',
      provider: this.currentServer.name,
      externalIds: [tmdbId, sonarrSeries.tvdbId, sonarrSeries.imdbId]
        .filter(Boolean)
        .join(' '),
    });

    return tmdbId;
  }

  private async applyMetadataProvider(
    tvShow: TmdbTvScanDetails | TmdbTvDetails
  ): Promise<TmdbTvScanDetails | TmdbTvDetails> {
    const metadataProvider = tvShow.keywords.results.some(
      (keyword) => keyword.id === ANIME_KEYWORD_ID
    )
      ? await getMetadataProvider('anime')
      : await getMetadataProvider('tv');

    return isTheMovieDbProvider(metadataProvider)
      ? tvShow
      : metadataProvider.getTvShow({ tvId: tvShow.id });
  }

  private async existsInAnyServer(
    tvdbId: number,
    is4k: boolean
  ): Promise<boolean> {
    const servers = this.servers.filter(
      (server) =>
        server.syncEnabled && (this.enable4kShow && server.is4k) === is4k
    );

    for (const server of servers) {
      try {
        const api = new SonarrAPI({
          apiKey: server.apiKey,
          url: SonarrAPI.buildUrl(server, '/api/v3'),
        });
        const series = await api.getLibrarySeriesByTvdbId(tvdbId);

        if (series.some((show) => show.tvdbId === tvdbId)) {
          return true;
        }
      } catch (e) {
        this.log(
          `Could not confirm series ${tvdbId} against Sonarr server ${server.name}. Skipping cleanup for it.`,
          'warn',
          { errorMessage: e.message }
        );
        return true;
      }
    }

    return false;
  }

  private async getMaterialSeasonNumbers(
    tmdbId: number
  ): Promise<Set<number> | undefined> {
    try {
      const tvShow = await this.applyMetadataProvider(
        await this.tmdb.getTvShowForScan({ tvId: tmdbId })
      );
      return new Set(
        tvShow.seasons
          .filter(
            (season) => season.season_number !== 0 && season.episode_count > 0
          )
          .map((season) => season.season_number)
      );
    } catch (e) {
      this.log(
        `Could not look up the seasons of orphaned show ${tmdbId}. Skipping cleanup for it.`,
        'warn',
        { errorMessage: e instanceof Error ? e.message : String(e) }
      );
      return;
    }
  }

  private async settleOrphanedShow(
    mediaSnapshot: Media,
    is4k: boolean
  ): Promise<boolean> {
    const statusField = is4k ? 'status4k' : 'status';
    const servers = this.servers.filter(
      (server) =>
        server.syncEnabled && (this.enable4kShow && server.is4k) === is4k
    );

    return runMediaEntityMutation(mediaSnapshot, () =>
      runWithServarrServiceSnapshots(
        'sonarr',
        servers,
        async () => {
          if (
            !mediaSnapshot.tvdbId ||
            (await this.existsInAnyServer(mediaSnapshot.tvdbId, is4k))
          ) {
            return false;
          }
          const materialSeasonNumbers = await this.getMaterialSeasonNumbers(
            mediaSnapshot.tmdbId
          );
          if (!materialSeasonNumbers) return false;

          return dataSource.transaction(async (manager) => {
            const mediaRepository = manager.getRepository(Media);
            const seasonRepository = manager.getRepository(Season);
            const seasonRequestRepository =
              manager.getRepository(SeasonRequest);
            const requestRepository = manager.getRepository(MediaRequest);
            const media = await mediaRepository.findOne({
              where: { id: mediaSnapshot.id, mediaType: MediaType.TV },
              relations: { seasons: true, requests: { seasons: true } },
            });

            if (
              !media ||
              media.tmdbId !== mediaSnapshot.tmdbId ||
              media.tvdbId !== mediaSnapshot.tvdbId
            ) {
              return false;
            }

            const approvedRequests = (media.requests ?? []).filter(
              (request) =>
                request.is4k === is4k &&
                request.status === MediaRequestStatus.APPROVED
            );
            const processingSeasons = media.seasons.filter(
              (season) => season[statusField] === MediaStatus.PROCESSING
            );

            if (
              media[statusField] !== MediaStatus.PROCESSING &&
              processingSeasons.length === 0 &&
              approvedRequests.length === 0
            ) {
              return false;
            }

            const changedSeasons: Season[] = [];
            for (const season of processingSeasons) {
              season[statusField] = MediaStatus.UNKNOWN;
              changedSeasons.push(season);
            }

            const seasonsByNumber = new Map(
              media.seasons.map((season) => [season.seasonNumber, season])
            );
            const changedSeasonRequests: SeasonRequest[] = [];
            const changedRequests: MediaRequest[] = [];
            const settledSeasonNumbers = new Set(
              processingSeasons
                .filter((season) => season.seasonNumber !== 0)
                .map((season) => season.seasonNumber)
            );
            const availableSeasonNumbers = new Set(
              media.seasons
                .filter(
                  (season) => season[statusField] === MediaStatus.AVAILABLE
                )
                .map((season) => season.seasonNumber)
            );

            for (const request of approvedRequests) {
              if ((request.seasons ?? []).length === 0) {
                request.status =
                  media[statusField] === MediaStatus.AVAILABLE
                    ? MediaRequestStatus.COMPLETED
                    : MediaRequestStatus.DECLINED;
                changedRequests.push(request);
                continue;
              }

              for (const requestedSeason of request.seasons ?? []) {
                if (
                  requestedSeason.status === MediaRequestStatus.DECLINED ||
                  requestedSeason.status === MediaRequestStatus.COMPLETED ||
                  requestedSeason.status === MediaRequestStatus.FAILED
                ) {
                  continue;
                }

                requestedSeason.status = availableSeasonNumbers.has(
                  requestedSeason.seasonNumber
                )
                  ? MediaRequestStatus.COMPLETED
                  : MediaRequestStatus.DECLINED;
                if (requestedSeason.seasonNumber !== 0) {
                  settledSeasonNumbers.add(requestedSeason.seasonNumber);
                }
                changedSeasonRequests.push(requestedSeason);
              }

              const hasOutstandingSelection = (request.seasons ?? []).some(
                (season) =>
                  isActiveSeasonRequest(season) &&
                  season.status !== MediaRequestStatus.COMPLETED &&
                  season.status !== MediaRequestStatus.FAILED
              );
              if (!hasOutstandingSelection) {
                request.status = (request.seasons ?? []).some(
                  (season) => season.status === MediaRequestStatus.COMPLETED
                )
                  ? MediaRequestStatus.COMPLETED
                  : MediaRequestStatus.DECLINED;
                changedRequests.push(request);
              }
            }

            const rollupSeasonNumbers = new Set([
              ...materialSeasonNumbers,
              ...settledSeasonNumbers,
              ...media.seasons
                .filter(
                  (season) =>
                    season.seasonNumber !== 0 &&
                    season[statusField] !== MediaStatus.UNKNOWN
                )
                .map((season) => season.seasonNumber),
            ]);
            const allMaterialSeasonsAvailable =
              rollupSeasonNumbers.size > 0 &&
              [...rollupSeasonNumbers].every(
                (seasonNumber) =>
                  seasonsByNumber.get(seasonNumber)?.[statusField] ===
                  MediaStatus.AVAILABLE
              );
            const hasAvailableSeason = media.seasons.some(
              (season) =>
                season.seasonNumber !== 0 &&
                (season[statusField] === MediaStatus.PARTIALLY_AVAILABLE ||
                  season[statusField] === MediaStatus.AVAILABLE)
            );
            const hasProcessingSeason = media.seasons.some(
              (season) =>
                season.seasonNumber !== 0 &&
                season[statusField] === MediaStatus.PROCESSING
            );
            const nextMediaStatus = allMaterialSeasonsAvailable
              ? MediaStatus.AVAILABLE
              : hasAvailableSeason
                ? MediaStatus.PARTIALLY_AVAILABLE
                : hasProcessingSeason
                  ? MediaStatus.PROCESSING
                  : media[statusField] === MediaStatus.DELETED
                    ? MediaStatus.DELETED
                    : MediaStatus.UNKNOWN;

            if (changedSeasons.length > 0) {
              await seasonRepository.save(changedSeasons);
            }
            if (changedSeasonRequests.length > 0) {
              await seasonRequestRepository.save(changedSeasonRequests);
            }
            if (changedRequests.length > 0) {
              await requestRepository.save(changedRequests);
            }
            if (media[statusField] !== nextMediaStatus) {
              await mediaRepository.update(media.id, {
                [statusField]: nextMediaStatus,
              });
            }

            return (
              changedSeasons.length > 0 ||
              changedSeasonRequests.length > 0 ||
              changedRequests.length > 0 ||
              media[statusField] !== nextMediaStatus
            );
          });
        },
        {
          requireExactAuthoritySet: true,
          includeCurrent: (server) =>
            server.syncEnabled && (this.enable4kShow && server.is4k) === is4k,
        }
      )
    );
  }

  private async cleanupOrphanedShowsForQuality(
    is4k: boolean,
    didScan: boolean
  ): Promise<void> {
    const quality = is4k ? '4K ' : '';
    if (!didScan) {
      this.log(
        `Skipping orphaned ${quality}show cleanup: no ${quality}Sonarr servers were scanned.`,
        'info'
      );
      return;
    }
    if (this.hasShowScanFailures(is4k)) {
      this.log(
        `Skipping orphaned ${quality}show cleanup after an incomplete series lookup.`,
        'warn'
      );
      return;
    }

    const statusField = is4k ? 'status4k' : 'status';
    const where: FindOptionsWhere<Media>[] = [
      { mediaType: MediaType.TV, [statusField]: MediaStatus.PROCESSING },
      {
        mediaType: MediaType.TV,
        seasons: { [statusField]: MediaStatus.PROCESSING },
      },
      {
        mediaType: MediaType.TV,
        requests: { is4k, status: MediaRequestStatus.APPROVED },
      },
    ];
    const visitedMedia = new Set<number>();
    const scannedTvdbIds = is4k ? this.scanned4kTvdbIds : this.scannedTvdbIds;
    const scannedTmdbIds = is4k ? this.scanned4kTmdbIds : this.scannedTmdbIds;

    await forEachMediaCleanupBatch(
      where,
      async (media) => {
        if (visitedMedia.has(media.id)) return;
        visitedMedia.add(media.id);
        if (
          !media.tvdbId ||
          scannedTvdbIds.has(media.tvdbId) ||
          scannedTmdbIds.has(media.tmdbId)
        ) {
          return;
        }

        const changed = await this.settleOrphanedShow(media, is4k);
        if (changed) {
          this.log(
            `Settled ${quality.toLowerCase()}orphaned Sonarr state for show ${media.tmdbId} (tvdb: ${media.tvdbId}).`,
            'info'
          );
        }
      },
      { relations: { seasons: true, requests: { seasons: true } } }
    );
  }

  private async cleanupOrphanedShows(): Promise<void> {
    await this.cleanupOrphanedShowsForQuality(false, this.didScanStandard);
    if (this.enable4kShow) {
      await this.cleanupOrphanedShowsForQuality(true, this.didScan4k);
    }
  }
}

export const sonarrScanner = new SonarrScanner();
