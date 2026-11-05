import type { RadarrMovie } from '@server/api/servarr/radarr';
import RadarrAPI from '@server/api/servarr/radarr';
import { MediaStatus, MediaType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import { runWithRequestAdmission } from '@server/entity/MediaRequest';
import { getExternalRuntimeConfig } from '@server/lib/externalRuntimeConfig';
import { runMediaEntityMutation } from '@server/lib/mediaMutation';
import { upsertMediaSearchMetadata } from '@server/lib/mediaSearchMetadata';
import type {
  RunnableScanner,
  StatusBase,
} from '@server/lib/scanners/baseScanner';
import BaseScanner from '@server/lib/scanners/baseScanner';
import {
  reconcileExcludedServarrAvailability,
  type ExcludedServarrAvailabilitySource,
} from '@server/lib/scanners/excludedServarrAvailability';
import { forEachMediaCleanupBatch } from '@server/lib/scanners/mediaCleanupBatches';
import {
  getServarrSyncExcludedTagsForEndpoint,
  getServarrSyncServerIdsForEndpoint,
  partitionServarrItemsBySyncExcludedTags,
} from '@server/lib/scanners/servarrTagFilters';
import {
  ServarrServiceAuthorityChangedError,
  runWithServarrServiceSnapshot,
  runWithServarrServiceSnapshots,
} from '@server/lib/serviceAdmission';
import { getSettings, type RadarrSettings } from '@server/lib/settings';
import { is4kResolution } from '@server/lib/videoResolution';
import { getHttpErrorDetails } from '@server/utils/httpError';
import { uniqWith } from 'lodash';
import { In } from 'typeorm';

type SyncStatus = StatusBase & {
  currentServer: RadarrSettings;
  servers: RadarrSettings[];
};

class RadarrScanner
  extends BaseScanner<RadarrMovie>
  implements RunnableScanner<SyncStatus>
{
  private servers: RadarrSettings[];
  private currentServer: RadarrSettings;
  private radarrApi: RadarrAPI;
  private scannedTmdbIds: Set<number> = new Set();
  private scanned4kTmdbIds: Set<number> = new Set();
  private excludedMovies: {
    tmdbId: number;
    serverId: number;
    format: 'standard' | '4k';
  }[] = [];
  private didScanStandard = false;
  private didScan4k = false;
  private serverReturnedEmpty = false;
  private server4kReturnedEmpty = false;
  private resolutionAwareSingleServer = false;

  constructor() {
    super('Radarr Scan', { bundleSize: 50 });
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
    this.scannedTmdbIds.clear();
    this.scanned4kTmdbIds.clear();
    this.excludedMovies = [];
    this.didScanStandard = false;
    this.didScan4k = false;
    this.serverReturnedEmpty = false;
    this.server4kReturnedEmpty = false;

    try {
      const fourKEnabled = getSettings().main.enable4k !== false;
      const configuredServers = structuredClone(
        settings.radarr.filter((server) => fourKEnabled || !server.is4k)
      );
      this.servers = uniqWith(configuredServers, (radarrA, radarrB) => {
        return (
          radarrA.hostname === radarrB.hostname &&
          radarrA.port === radarrB.port &&
          radarrA.baseUrl === radarrB.baseUrl
        );
      }).map((server) => ({
        ...server,
        syncExcludedTags: getServarrSyncExcludedTagsForEndpoint(
          server,
          configuredServers
        ),
      }));
      this.resolutionAwareSingleServer =
        fourKEnabled &&
        this.servers.filter((server) => server.syncEnabled).length === 1 &&
        settings.radarr.some(
          (server) =>
            server.syncEnabled &&
            !server.is4k &&
            server.hostname === this.servers[0].hostname &&
            server.port === this.servers[0].port &&
            server.baseUrl === this.servers[0].baseUrl
        );

      for (const server of this.servers) {
        this.currentServer = server;
        if (server.syncEnabled) {
          this.log(
            `Beginning to process Radarr server: ${server.name}`,
            'info'
          );

          const serverItems = await runWithServarrServiceSnapshot(
            'radarr',
            server,
            async (current) => {
              this.radarrApi = new RadarrAPI({
                apiKey: current.apiKey,
                url: RadarrAPI.buildUrl(current, '/api/v3'),
              });
              return this.radarrApi.getMovies();
            }
          );

          if (
            fourKEnabled &&
            this.resolutionAwareSingleServer &&
            serverItems.some(
              (movie) =>
                movie.hasFile &&
                is4kResolution(movie.movieFile?.mediaInfo.resolution) === true
            )
          ) {
            this.enable4kMovie = true;
          }

          const server4k = this.enable4kMovie && server.is4k;
          const scansBothResolutions =
            this.resolutionAwareSingleServer && this.enable4kMovie;

          // Keep the provider response separate: excluded results still prove
          // that a scan completed and should not trigger the empty-library
          // safety path below.
          const { included, excluded } =
            partitionServarrItemsBySyncExcludedTags(
              serverItems,
              server.syncExcludedTags
            );
          this.items = included;
          for (const movie of excluded) {
            if (!Number.isSafeInteger(movie.tmdbId) || movie.tmdbId <= 0) {
              continue;
            }

            // One resolution-aware endpoint owns both availability tracks;
            // retain the media identity so neither request track is orphaned.
            if (this.resolutionAwareSingleServer) {
              this.scannedTmdbIds.add(movie.tmdbId);
              this.scanned4kTmdbIds.add(movie.tmdbId);
            } else {
              const is4k = this.getMovieIs4k(movie, server);
              (is4k ? this.scanned4kTmdbIds : this.scannedTmdbIds).add(
                movie.tmdbId
              );
            }

            const format = scansBothResolutions
              ? this.getMovieIs4k(movie, server)
                ? '4k'
                : 'standard'
              : server4k
                ? '4k'
                : 'standard';
            for (const serverId of getServarrSyncServerIdsForEndpoint(
              server,
              configuredServers
            )) {
              this.excludedMovies.push({
                tmdbId: movie.tmdbId,
                serverId,
                format,
              });
            }
          }

          if (scansBothResolutions) {
            this.didScanStandard = true;
            this.didScan4k = true;
          } else if (server4k) {
            this.didScan4k = true;
          } else {
            this.didScanStandard = true;
          }

          if (serverItems.length === 0) {
            if (server4k) {
              this.server4kReturnedEmpty = true;
            } else {
              this.serverReturnedEmpty = true;
            }
            if (scansBothResolutions) {
              this.serverReturnedEmpty = true;
              this.server4kReturnedEmpty = true;
            }
            this.log(
              `Radarr server ${server.name} returned no movies. Orphan cleanup for this profile type will be skipped.`,
              'warn'
            );
          }

          await this.loop(this.processRadarrMovie.bind(this), { sessionId });

          const hasCompleteMediaIdentity = serverItems.every(
            (movie) => Number.isSafeInteger(movie.tmdbId) && movie.tmdbId > 0
          );
          if (serverItems.length > 0 && hasCompleteMediaIdentity) {
            const qualityTmdbIds = {
              standard: new Set<number>(),
              '4k': new Set<number>(),
            };
            for (const movie of this.items) {
              qualityTmdbIds[
                this.getMovieIs4k(movie, server) ? '4k' : 'standard'
              ].add(movie.tmdbId);
            }

            const formats = scansBothResolutions
              ? (['standard', '4k'] as const)
              : ([server4k ? '4k' : 'standard'] as const);
            for (const format of formats) {
              await runWithServarrServiceSnapshot('radarr', server, async () =>
                this.markMissingVideoServiceStatusesUnknown({
                  serviceType: 'radarr',
                  serverId: server.id,
                  format,
                  mediaType: MediaType.MOVIE,
                  tmdbIds: qualityTmdbIds[format],
                })
              );
            }
          }
        } else {
          this.log(`Sync not enabled. Skipping Radarr server: ${server.name}`);
        }
      }

      await this.clearExcludedMovieAvailability(
        configuredServers,
        fourKEnabled
      );

      // Only run cleanup if all servers of this profile type have sync enabled.
      // If any server is skipped, we can't distinguish truly orphaned media from
      // media that exists on an unscanned server (e.g. separate instances for
      // anime, regional content, or different languages).
      const allStandardScanned = this.serversForQuality(false).every(
        (server) => server.syncEnabled
      );
      const all4kScanned = this.serversForQuality(true).every(
        (server) => server.syncEnabled
      );

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
        await this.resolveDeferredMovieStatusResets(false, (callback) =>
          runWithServarrServiceSnapshots(
            'radarr',
            this.serversForQuality(false).filter(
              (server) => server.syncEnabled
            ),
            callback,
            {
              requireExactAuthoritySet: true,
              includeCurrent: (server) =>
                server.syncEnabled && this.serverMatchesQuality(server, false),
            }
          )
        );
      }
      if (this.didScan4k) {
        await this.resolveDeferredMovieStatusResets(true, (callback) =>
          runWithServarrServiceSnapshots(
            'radarr',
            this.serversForQuality(true).filter((server) => server.syncEnabled),
            callback,
            {
              requireExactAuthoritySet: true,
              includeCurrent: (server) =>
                server.syncEnabled && this.serverMatchesQuality(server, true),
            }
          )
        );
      }

      await this.cleanupOrphanedMovies();
      this.log('Radarr scan complete', 'info');
    } catch (e) {
      this.log('Scan interrupted', 'error', {
        ...getHttpErrorDetails(e),
        errorStack: e instanceof Error ? e.stack : undefined,
      });
    } finally {
      this.endRun(sessionId);
    }
  }

  private async processRadarrMovie(radarrMovie: RadarrMovie): Promise<void> {
    const server4k = this.getMovieIs4k(radarrMovie, this.currentServer);
    if (server4k) {
      this.scanned4kTmdbIds.add(radarrMovie.tmdbId);
    } else {
      this.scannedTmdbIds.add(radarrMovie.tmdbId);
    }

    try {
      await this.processMovie(radarrMovie.tmdbId, {
        is4k: server4k,
        serviceId: this.currentServer.id,
        requestServiceType: 'radarr',
        externalServiceId: radarrMovie.id,
        externalServiceSlug: radarrMovie.titleSlug,
        title: radarrMovie.title,
        processing: !radarrMovie.hasFile && radarrMovie.monitored,
        hasFile: radarrMovie.hasFile,
        deferStatusReset: true,
        preserveInactiveServiceIdentity: true,
        mutationGuard: (callback) =>
          runWithServarrServiceSnapshot('radarr', this.currentServer, callback),
      });

      const media = await getRepository(Media).findOneBy({
        tmdbId: radarrMovie.tmdbId,
        mediaType: MediaType.MOVIE,
      });
      await upsertMediaSearchMetadata(media?.id, {
        title: radarrMovie.title,
        alternateTitle: radarrMovie.originalTitle,
        releaseDate: radarrMovie.year ? String(radarrMovie.year) : undefined,
        genres: radarrMovie.genres?.join(', '),
        runtime: radarrMovie.runtime
          ? `${radarrMovie.runtime} minutes`
          : radarrMovie.movieFile?.mediaInfo.runTime,
        studio: radarrMovie.studio,
        format: 'Movie',
        provider: this.currentServer.name,
        externalIds: [radarrMovie.tmdbId, radarrMovie.imdbId]
          .filter(Boolean)
          .join(' '),
      });
    } catch (e) {
      if (e instanceof ServarrServiceAuthorityChangedError) throw e;
      this.markMovieScanFailed(radarrMovie.tmdbId, server4k);
      this.log('Failed to process Radarr media', 'error', {
        errorMessage: e.message,
        title: radarrMovie.title,
      });
    }
  }

  private serverMatchesQuality(server: RadarrSettings, is4k: boolean): boolean {
    return (
      this.resolutionAwareSingleServer ||
      (this.enable4kMovie && server.is4k) === is4k
    );
  }

  private serversForQuality(is4k: boolean): RadarrSettings[] {
    return this.servers.filter((server) =>
      this.serverMatchesQuality(server, is4k)
    );
  }

  private getMovieIs4k(movie: RadarrMovie, server: RadarrSettings): boolean {
    if (this.resolutionAwareSingleServer && movie.hasFile) {
      const detected = is4kResolution(movie.movieFile?.mediaInfo.resolution);
      if (detected !== undefined) return detected;
    }

    return this.enable4kMovie && server.is4k;
  }

  private async clearExcludedMovieAvailability(
    configuredServers: RadarrSettings[],
    fourKEnabled: boolean
  ): Promise<void> {
    if (this.excludedMovies.length === 0) return;

    const excludedTmdbIds = [
      ...new Set(this.excludedMovies.map(({ tmdbId }) => tmdbId)),
    ];
    const mediaItems: Media[] = [];
    for (let offset = 0; offset < excludedTmdbIds.length; offset += 500) {
      mediaItems.push(
        ...(await getRepository(Media).find({
          where: {
            mediaType: MediaType.MOVIE,
            tmdbId: In(excludedTmdbIds.slice(offset, offset + 500)),
          },
        }))
      );
    }
    const mediaIdsByTmdbId = new Map(
      mediaItems.map((media) => [media.tmdbId, media.id])
    );
    const sources: ExcludedServarrAvailabilitySource[] = [];

    for (const excluded of this.excludedMovies) {
      const mediaId = mediaIdsByTmdbId.get(excluded.tmdbId);
      if (mediaId !== undefined) {
        sources.push({
          mediaId,
          serverId: excluded.serverId,
          format: excluded.format,
        });
      }
    }

    for (let offset = 0; offset < mediaItems.length; offset += 50) {
      const batch = mediaItems.slice(offset, offset + 50);
      const batchIds = new Set(batch.map(({ id }) => id));
      const batchSources = sources.filter((source) =>
        batchIds.has(source.mediaId)
      );
      if (batchSources.length === 0) continue;

      await runWithRequestAdmission(
        batch.map(
          (media) => `request-media:${MediaType.MOVIE}:${media.tmdbId}`
        ),
        () =>
          runWithServarrServiceSnapshots(
            'radarr',
            configuredServers.filter((server) => server.syncEnabled),
            () => reconcileExcludedServarrAvailability('radarr', batchSources),
            {
              requireExactAuthoritySet: true,
              includeCurrent: (server) =>
                server.syncEnabled && (fourKEnabled || !server.is4k),
            }
          )
      );
    }
  }

  private async existsInAnyServer(
    tmdbId: number,
    is4k: boolean
  ): Promise<boolean> {
    const servers = this.serversForQuality(is4k).filter(
      (server) => server.syncEnabled
    );

    for (const server of servers) {
      try {
        const api = new RadarrAPI({
          apiKey: server.apiKey,
          url: RadarrAPI.buildUrl(server, '/api/v3'),
        });
        const movies = await api.getLibraryMoviesByTmdbId(tmdbId);

        if (
          movies.some((movie) => {
            if (movie.tmdbId !== tmdbId) return false;
            if (!this.resolutionAwareSingleServer || !movie.hasFile) {
              return true;
            }
            const detected = is4kResolution(
              movie.movieFile?.mediaInfo.resolution
            );
            return detected === undefined || detected === is4k;
          })
        ) {
          return true;
        }
      } catch (e) {
        this.log(
          `Could not confirm movie ${tmdbId} against Radarr server ${server.name}. Skipping cleanup for it.`,
          'warn',
          { errorMessage: e.message }
        );
        return true;
      }
    }

    return false;
  }

  private async cleanupOrphanedMovies(): Promise<void> {
    const mediaRepository = getRepository(Media);

    if (this.didScanStandard) {
      await forEachMediaCleanupBatch(
        { mediaType: MediaType.MOVIE, status: MediaStatus.PROCESSING },
        async (media) => {
          if (
            !this.scannedTmdbIds.has(media.tmdbId) &&
            !(await this.existsInAnyServer(media.tmdbId, false))
          ) {
            const changed = await runMediaEntityMutation(media, () =>
              runWithServarrServiceSnapshots(
                'radarr',
                this.serversForQuality(false).filter(
                  (server) => server.syncEnabled
                ),
                async () => {
                  const current = await mediaRepository.findOneBy({
                    id: media.id,
                  });
                  if (!current || current.status !== MediaStatus.PROCESSING) {
                    return false;
                  }
                  current.status = MediaStatus.UNKNOWN;
                  await mediaRepository.save(current);
                  return true;
                },
                {
                  requireExactAuthoritySet: true,
                  includeCurrent: (server) =>
                    server.syncEnabled &&
                    this.serverMatchesQuality(server, false),
                }
              )
            );
            if (changed) {
              await this.declineOrphanedRequests(media, false);
              this.log(
                `Movie ${media.tmdbId} not found in any Radarr server. Status reset to UNKNOWN.`,
                'info'
              );
            }
          }
        },
        { relations: { requests: true } }
      );
    } else {
      this.log(
        'Skipping orphaned movie cleanup: no standard Radarr servers were scanned.',
        'info'
      );
    }

    if (this.didScan4k) {
      await forEachMediaCleanupBatch(
        {
          mediaType: MediaType.MOVIE,
          status4k: MediaStatus.PROCESSING,
        },
        async (media) => {
          if (
            !this.scanned4kTmdbIds.has(media.tmdbId) &&
            !(await this.existsInAnyServer(media.tmdbId, true))
          ) {
            const changed = await runMediaEntityMutation(media, () =>
              runWithServarrServiceSnapshots(
                'radarr',
                this.serversForQuality(true).filter(
                  (server) => server.syncEnabled
                ),
                async () => {
                  const current = await mediaRepository.findOneBy({
                    id: media.id,
                  });
                  if (!current || current.status4k !== MediaStatus.PROCESSING) {
                    return false;
                  }
                  current.status4k = MediaStatus.UNKNOWN;
                  await mediaRepository.save(current);
                  return true;
                },
                {
                  requireExactAuthoritySet: true,
                  includeCurrent: (server) =>
                    server.syncEnabled &&
                    this.serverMatchesQuality(server, true),
                }
              )
            );
            if (changed) {
              await this.declineOrphanedRequests(media, true);
              this.log(
                `Movie ${media.tmdbId} not found in any 4K Radarr server. 4K status reset to UNKNOWN.`,
                'info'
              );
            }
          }
        },
        { relations: { requests: true } }
      );
    } else if (this.enable4kMovie) {
      this.log(
        'Skipping orphaned 4K movie cleanup: no 4K Radarr servers were scanned.',
        'info'
      );
    }
  }
}

export const radarrScanner = new RadarrScanner();
