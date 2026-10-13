import {
  getMetadataProvider,
  isTheMovieDbProvider,
} from '@server/api/metadata';
import type { SonarrSeries } from '@server/api/servarr/sonarr';
import SonarrAPI from '@server/api/servarr/sonarr';
import { ANIME_KEYWORD_ID } from '@server/api/themoviedb/constants';
import type {
  TmdbKeyword,
  TmdbTvDetails,
  TmdbTvScanDetails,
} from '@server/api/themoviedb/interfaces';
import { MediaStatus, MediaType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
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
  ServarrServiceAuthorityChangedError,
  runWithServarrServiceSnapshot,
  runWithServarrServiceSnapshots,
} from '@server/lib/serviceAdmission';
import type { SonarrSettings } from '@server/lib/settings';
import { getHttpErrorDetails } from '@server/utils/httpError';
import { uniqWith } from 'lodash';

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
    let resolvedTmdbId: number | undefined;
    if (server4k) {
      this.scanned4kTvdbIds.add(sonarrSeries.tvdbId);
    } else {
      this.scannedTvdbIds.add(sonarrSeries.tvdbId);
    }

    try {
      const mediaRepository = getRepository(Media);
      const processableSeasons: ProcessableSeason[] = [];
      let tvShow: TmdbTvScanDetails | TmdbTvDetails;

      const media = await mediaRepository.findOne({
        where: { tvdbId: sonarrSeries.tvdbId },
      });

      if (!media || !media.tmdbId) {
        tvShow = await this.tmdb.getShowByTvdbIdForScan({
          tvdbId: sonarrSeries.tvdbId,
        });
      } else {
        tvShow = await this.tmdb.getTvShowForScan({ tvId: media.tmdbId });
      }

      const tmdbId = tvShow.id;
      resolvedTmdbId = tmdbId;
      (server4k ? this.scanned4kTmdbIds : this.scannedTmdbIds).add(tmdbId);
      const metadataProvider = tvShow.keywords.results.some(
        (keyword: TmdbKeyword) => keyword.id === ANIME_KEYWORD_ID
      )
        ? await getMetadataProvider('anime')
        : await getMetadataProvider('tv');

      if (!isTheMovieDbProvider(metadataProvider)) {
        tvShow = await metadataProvider.getTvShow({ tvId: tmdbId });
      }
      const settings = getExternalRuntimeConfig();

      const filteredSeasons = tvShow.seasons
        .filter(
          (sn) => settings.main.enableSpecialEpisodes || sn.season_number !== 0
        )
        .map((season) => {
          const sonarrSeason = sonarrSeries.seasons.find(
            (s) => s.seasonNumber === season.season_number
          );
          if (!sonarrSeason) {
            return {
              seasonNumber: season.season_number,
              episodeCount: season.episode_count,
              monitored: false,
              statistics: {
                episodeFileCount: 0,
                totalEpisodeCount: season.episode_count,
              },
            };
          } else {
            return sonarrSeason;
          }
        });

      for (const season of filteredSeasons) {
        const totalAvailableEpisodes = season.statistics?.episodeFileCount ?? 0;

        processableSeasons.push({
          seasonNumber: season.seasonNumber,
          episodes: !server4k ? totalAvailableEpisodes : 0,
          episodes4k: server4k ? totalAvailableEpisodes : 0,
          totalEpisodes: season.statistics?.totalEpisodeCount ?? 0,
          processing: season.monitored && totalAvailableEpisodes === 0,
          is4kOverride: server4k,
        });
      }

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
    } catch (e) {
      if (e instanceof ServarrServiceAuthorityChangedError) throw e;
      this.markShowScanFailed(sonarrSeries.tvdbId, server4k, resolvedTmdbId);
      this.log('Failed to process Sonarr media', 'error', {
        errorMessage: e.message,
        title: sonarrSeries.title,
      });
    }
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

  private async cleanupOrphanedShows(): Promise<void> {
    const mediaRepository = getRepository(Media);

    if (this.didScanStandard) {
      await forEachMediaCleanupBatch(
        { mediaType: MediaType.TV, status: MediaStatus.PROCESSING },
        async (media) => {
          if (
            media.tvdbId &&
            !this.scannedTvdbIds.has(media.tvdbId) &&
            !this.scannedTmdbIds.has(media.tmdbId) &&
            !(await this.existsInAnyServer(media.tvdbId, false))
          ) {
            const changed = await runMediaEntityMutation(media, () =>
              runWithServarrServiceSnapshots(
                'sonarr',
                this.servers.filter(
                  (server) => server.syncEnabled && !server.is4k
                ),
                async () => {
                  const current = await mediaRepository.findOne({
                    where: { id: media.id },
                    relations: { seasons: true },
                  });
                  if (!current || current.status !== MediaStatus.PROCESSING) {
                    return false;
                  }
                  current.status = MediaStatus.UNKNOWN;
                  for (const season of current.seasons) {
                    if (season.status === MediaStatus.PROCESSING) {
                      season.status = MediaStatus.UNKNOWN;
                    }
                  }
                  await mediaRepository.save(current);
                  return true;
                },
                {
                  requireExactAuthoritySet: true,
                  includeCurrent: (server) =>
                    server.syncEnabled && !server.is4k,
                }
              )
            );
            if (changed) {
              await this.declineOrphanedRequests(media, false);
              this.log(
                `Show ${media.tmdbId} (tvdb: ${media.tvdbId}) not found in any Sonarr server. Status reset to UNKNOWN.`,
                'info'
              );
            }
          }
        },
        { relations: { seasons: true, requests: true } }
      );
    } else {
      this.log(
        'Skipping orphaned show cleanup: no standard Sonarr servers were scanned.',
        'info'
      );
    }

    if (this.didScan4k) {
      await forEachMediaCleanupBatch(
        { mediaType: MediaType.TV, status4k: MediaStatus.PROCESSING },
        async (media) => {
          if (
            media.tvdbId &&
            !this.scanned4kTvdbIds.has(media.tvdbId) &&
            !this.scanned4kTmdbIds.has(media.tmdbId) &&
            !(await this.existsInAnyServer(media.tvdbId, true))
          ) {
            const changed = await runMediaEntityMutation(media, () =>
              runWithServarrServiceSnapshots(
                'sonarr',
                this.servers.filter(
                  (server) => server.syncEnabled && server.is4k
                ),
                async () => {
                  const current = await mediaRepository.findOne({
                    where: { id: media.id },
                    relations: { seasons: true },
                  });
                  if (!current || current.status4k !== MediaStatus.PROCESSING) {
                    return false;
                  }
                  current.status4k = MediaStatus.UNKNOWN;
                  for (const season of current.seasons) {
                    if (season.status4k === MediaStatus.PROCESSING) {
                      season.status4k = MediaStatus.UNKNOWN;
                    }
                  }
                  await mediaRepository.save(current);
                  return true;
                },
                {
                  requireExactAuthoritySet: true,
                  includeCurrent: (server) => server.syncEnabled && server.is4k,
                }
              )
            );
            if (changed) {
              await this.declineOrphanedRequests(media, true);
              this.log(
                `Show ${media.tmdbId} (tvdb: ${media.tvdbId}) not found in any 4K Sonarr server. 4K status reset to UNKNOWN.`,
                'info'
              );
            }
          }
        },
        { relations: { seasons: true, requests: true } }
      );
    } else if (this.enable4kShow) {
      this.log(
        'Skipping orphaned 4K show cleanup: no 4K Sonarr servers were scanned.',
        'info'
      );
    }
  }
}

export const sonarrScanner = new SonarrScanner();
