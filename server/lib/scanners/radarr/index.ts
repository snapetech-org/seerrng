import type { RadarrMovie } from '@server/api/servarr/radarr';
import RadarrAPI from '@server/api/servarr/radarr';
import { MediaStatus, MediaType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import { getExternalRuntimeConfig } from '@server/lib/externalRuntimeConfig';
import { runMediaEntityMutation } from '@server/lib/mediaMutation';
import { upsertMediaSearchMetadata } from '@server/lib/mediaSearchMetadata';
import type {
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
import type { RadarrSettings } from '@server/lib/settings';
import { getHttpErrorDetails } from '@server/utils/httpError';
import { uniqWith } from 'lodash';

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
  private didScanStandard = false;
  private didScan4k = false;
  private serverReturnedEmpty = false;
  private server4kReturnedEmpty = false;

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
    this.didScanStandard = false;
    this.didScan4k = false;
    this.serverReturnedEmpty = false;
    this.server4kReturnedEmpty = false;

    try {
      this.servers = uniqWith(
        structuredClone(settings.radarr),
        (radarrA, radarrB) => {
          return (
            radarrA.hostname === radarrB.hostname &&
            radarrA.port === radarrB.port &&
            radarrA.baseUrl === radarrB.baseUrl
          );
        }
      );

      for (const server of this.servers) {
        this.currentServer = server;
        if (server.syncEnabled) {
          this.log(
            `Beginning to process Radarr server: ${server.name}`,
            'info'
          );

          this.items = await runWithServarrServiceSnapshot(
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

          const server4k = this.enable4kMovie && server.is4k;
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
              `Radarr server ${server.name} returned no movies. Orphan cleanup for this profile type will be skipped.`,
              'warn'
            );
          }

          await this.loop(this.processRadarrMovie.bind(this), { sessionId });

          const hasCompleteMediaIdentity = this.items.every(
            (movie) => Number.isSafeInteger(movie.tmdbId) && movie.tmdbId > 0
          );
          if (this.items.length > 0 && hasCompleteMediaIdentity) {
            await runWithServarrServiceSnapshot('radarr', server, async () =>
              this.markMissingVideoServiceStatusesUnknown({
                serviceType: 'radarr',
                serverId: server.id,
                format: server4k ? '4k' : 'standard',
                mediaType: MediaType.MOVIE,
                tmdbIds: new Set(this.items.map(({ tmdbId }) => tmdbId)),
              })
            );
          }
        } else {
          this.log(`Sync not enabled. Skipping Radarr server: ${server.name}`);
        }
      }

      // Only run cleanup if all servers of this profile type have sync enabled.
      // If any server is skipped, we can't distinguish truly orphaned media from
      // media that exists on an unscanned server (e.g. separate instances for
      // anime, regional content, or different languages).
      const allStandardScanned = this.servers
        .filter((s) => !this.enable4kMovie || !s.is4k)
        .every((s) => s.syncEnabled);
      const all4kScanned = this.servers
        .filter((s) => this.enable4kMovie && s.is4k)
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
        await this.resolveDeferredMovieStatusResets(false, (callback) =>
          runWithServarrServiceSnapshots(
            'radarr',
            this.servers.filter(
              (server) => !this.enable4kMovie || !server.is4k
            ),
            callback,
            {
              requireExactAuthoritySet: true,
              includeCurrent: (server) => !this.enable4kMovie || !server.is4k,
            }
          )
        );
      }
      if (this.didScan4k) {
        await this.resolveDeferredMovieStatusResets(true, (callback) =>
          runWithServarrServiceSnapshots(
            'radarr',
            this.servers.filter((server) => this.enable4kMovie && server.is4k),
            callback,
            {
              requireExactAuthoritySet: true,
              includeCurrent: (server) => this.enable4kMovie && server.is4k,
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
    const server4k = this.enable4kMovie && this.currentServer.is4k;
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

  private async existsInAnyServer(
    tmdbId: number,
    is4k: boolean
  ): Promise<boolean> {
    const servers = this.servers.filter(
      (server) =>
        server.syncEnabled && (this.enable4kMovie && server.is4k) === is4k
    );

    for (const server of servers) {
      try {
        const api = new RadarrAPI({
          apiKey: server.apiKey,
          url: RadarrAPI.buildUrl(server, '/api/v3'),
        });
        const movies = await api.getLibraryMoviesByTmdbId(tmdbId);

        if (movies.some((movie) => movie.tmdbId === tmdbId)) {
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
                this.servers.filter(
                  (server) => server.syncEnabled && !server.is4k
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
                    server.syncEnabled && !server.is4k,
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
                this.servers.filter(
                  (server) => server.syncEnabled && server.is4k
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
                  includeCurrent: (server) => server.syncEnabled && server.is4k,
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
