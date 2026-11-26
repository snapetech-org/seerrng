import AurralAPI, { type AurralLibraryAlbumItem } from '@server/api/aurral';
import { MediaStatus, MediaType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import { normalizeMusicBrainzId } from '@server/lib/externalIds';
import { getExternalRuntimeConfig } from '@server/lib/externalRuntimeConfig';
import { runMediaEntityMutation } from '@server/lib/mediaMutation';
import { upsertMediaSearchMetadata } from '@server/lib/mediaSearchMetadata';
import { isAurralPartialTrackCount } from '@server/lib/musicAvailability';
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
import type { AurralSettings } from '@server/lib/settings';
import { getHttpErrorDetails } from '@server/utils/httpError';
import { uniqWith } from 'lodash';

type SyncStatus = StatusBase & {
  currentServer: AurralSettings;
  servers: AurralSettings[];
};

const PAGE_SIZE = 100;
// Media timestamps may be stored with whole-second precision, so a row
// touched within this margin of the scan start counts as touched during it.
const SCAN_START_MARGIN_MS = 1_000;

class AurralScanner
  extends BaseScanner<AurralLibraryAlbumItem>
  implements RunnableScanner<SyncStatus>
{
  private servers: AurralSettings[] = [];
  private currentServer!: AurralSettings;
  private scannedMbIds: Set<string> = new Set();
  private scannedServiceAlbums: Set<string> = new Set();
  private scannedAvailableServiceMbIds: Set<string> = new Set();
  private processedAlbumCount = 0;
  private totalAlbumCount = 0;
  private didScan = false;
  private scanStartedAt = 0;

  constructor() {
    super('Aurral Scan', { bundleSize: 50 });
  }

  public status(): SyncStatus {
    return {
      running: this.running,
      progress: this.processedAlbumCount,
      total: this.totalAlbumCount,
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

    this.scannedMbIds.clear();
    this.scannedServiceAlbums.clear();
    this.scannedAvailableServiceMbIds.clear();
    this.processedAlbumCount = 0;
    this.totalAlbumCount = 0;
    this.didScan = false;
    this.scanStartedAt = Date.now();

    try {
      this.servers = uniqWith(
        structuredClone(settings.aurral),
        (left, right) =>
          left.hostname === right.hostname &&
          left.port === right.port &&
          left.baseUrl === right.baseUrl
      );

      for (const server of this.servers) {
        this.currentServer = server;
        if (!server.syncEnabled) {
          continue;
        }

        this.log(`Beginning to process Aurral server: ${server.name}`, 'info');

        let page = 1;
        let hasMore = true;

        while (hasMore && this.running) {
          const albumPage = await runWithServarrServiceSnapshot(
            'aurral',
            server,
            async (current) => {
              const aurral = new AurralAPI({
                apiKey: current.apiKey,
                url: AurralAPI.buildUrl(current),
              });
              return aurral.getLibraryAlbumsPage(page, PAGE_SIZE);
            }
          );

          if (page === 1) {
            this.totalAlbumCount += albumPage.total;
          }

          if (albumPage.items.length === 0) {
            break;
          }

          for (const album of albumPage.items) {
            if (!this.running || this.sessionId !== sessionId) {
              throw new Error('Sync was aborted.');
            }
            await this.processAurralAlbum(album);
          }

          hasMore = albumPage.hasMore;
          page += 1;
        }

        this.log(`Completed Aurral server scan: ${server.name}`, 'info');
      }

      this.didScan = this.servers.some((server) => server.syncEnabled);
      if (this.didScan) {
        await this.cleanupOrphanedAlbums();
      }
    } catch (e) {
      if (e instanceof ServarrServiceAuthorityChangedError) {
        this.log(
          'Aurral server configuration changed mid-scan; stopping safely.',
          'warn'
        );
      } else {
        const details = getHttpErrorDetails(e);
        this.log('Aurral scan aborted due to error', 'error', {
          errorMessage: e instanceof Error ? e.message : String(e),
          ...(details.status ? { httpStatus: details.status } : {}),
        });
      }
    } finally {
      this.endRun(sessionId);
    }
  }

  private async processAurralAlbum(
    album: AurralLibraryAlbumItem
  ): Promise<void> {
    try {
      const rawMbId = album.releaseGroupMbid || album.mbid;
      if (!rawMbId) {
        return;
      }

      const mbId = normalizeMusicBrainzId(rawMbId);
      const availableCount = album.availableTrackCount ?? 0;
      const trackCount = album.trackCount ?? 0;
      // Aurral keeps single tracks (playlists, flows, voice requests) as
      // partial albums. Only a fully downloaded album counts as available.
      const hasFile = trackCount > 0 && availableCount >= trackCount;
      const hasSomeTracks = isAurralPartialTrackCount(
        availableCount,
        trackCount
      );
      // Same partial rule as the request poll: an album with some tracks is
      // PARTIALLY_AVAILABLE when Aurral monitors it or SeerrNG already
      // tracks it (requested or partial). Loose single tracks on albums
      // nobody asked for do not turn whole albums partial.
      let partiallyAvailable = false;
      if (hasSomeTracks) {
        if (album.monitored === true) {
          partiallyAvailable = true;
        } else {
          const tracked = await getRepository(Media).findOne({
            where: { mbId, mediaType: MediaType.MUSIC },
          });
          partiallyAvailable =
            tracked?.status === MediaStatus.PROCESSING ||
            tracked?.status === MediaStatus.PARTIALLY_AVAILABLE;
        }
      }
      const processing =
        album.monitored === true &&
        !partiallyAvailable &&
        (trackCount === 0 || availableCount < trackCount);

      this.scannedMbIds.add(mbId);
      this.scannedServiceAlbums.add(`${this.currentServer.id}:${album.id}`);

      if (hasFile && !processing) {
        this.scannedAvailableServiceMbIds.add(
          `${this.currentServer.id}:${mbId}`
        );
      }

      await this.processMusic(mbId, {
        serviceId: this.currentServer.id,
        musicServiceType: 'aurral',
        externalServiceId: album.id,
        externalServiceSlug: mbId,
        title: album.title ?? 'Unknown Album',
        processing: album.monitored ? processing : false,
        hasFile,
        partiallyAvailable,
        mutationGuard: (callback) =>
          runWithServarrServiceSnapshot('aurral', this.currentServer, callback),
      });

      const media = await getRepository(Media).findOne({
        where: [
          { mbId, mediaType: MediaType.MUSIC },
          {
            serviceId: this.currentServer.id,
            externalServiceId: album.id,
            mediaType: MediaType.MUSIC,
          },
        ],
      });
      await upsertMediaSearchMetadata(media?.id, {
        title: album.title ?? undefined,
        releaseDate: album.releaseDate ?? undefined,
        artist: album.albumArtist ?? undefined,
        format: 'Music',
        provider: this.currentServer.name,
        externalIds: mbId,
      });
    } catch (e) {
      if (e instanceof ServarrServiceAuthorityChangedError) throw e;
      this.log('Failed to process Aurral media', 'error', {
        errorMessage: e instanceof Error ? e.message : String(e),
        title: album.title,
      });
    } finally {
      this.processedAlbumCount += 1;
    }
  }

  private async cleanupOrphanedAlbums(): Promise<void> {
    const mediaRepository = getRepository(Media);

    const scannedServiceIds = new Set(
      this.servers
        .filter((server) => server.syncEnabled)
        .map((server) => server.id)
    );

    await forEachMediaCleanupBatch(
      { mediaType: MediaType.MUSIC },
      async (media) => {
        if (media.musicServiceType !== 'aurral') {
          return;
        }

        const mbId = media.mbId
          ? normalizeMusicBrainzId(media.mbId)
          : undefined;
        const serviceAlbumKey =
          media.serviceId !== null &&
          media.serviceId !== undefined &&
          media.externalServiceId !== null &&
          media.externalServiceId !== undefined
            ? `${media.serviceId}:${media.externalServiceId}`
            : undefined;

        const currentAvailableServiceIds = media.availableMusicServiceIds ?? [];
        const nextAvailableServiceIds = currentAvailableServiceIds.filter(
          (serverId) =>
            !scannedServiceIds.has(serverId) ||
            (mbId !== undefined &&
              this.scannedAvailableServiceMbIds.has(`${serverId}:${mbId}`))
        );
        const availabilityChanged =
          nextAvailableServiceIds.length !==
            currentAvailableServiceIds.length ||
          nextAvailableServiceIds.some(
            (serverId, index) => serverId !== currentAvailableServiceIds[index]
          );
        // A row changed after the scan started (for example an album
        // requested while the pages were being read) is not reset: the scan
        // could not have seen it.
        const touchedDuringScan =
          media.updatedAt instanceof Date &&
          media.updatedAt.getTime() >=
            this.scanStartedAt - SCAN_START_MARGIN_MS;
        const shouldResetProcessing =
          media.status === MediaStatus.PROCESSING &&
          mbId &&
          !touchedDuringScan &&
          !this.scannedMbIds.has(mbId) &&
          (!serviceAlbumKey || !this.scannedServiceAlbums.has(serviceAlbumKey));

        if (availabilityChanged || shouldResetProcessing) {
          await runMediaEntityMutation(media, () =>
            runWithServarrServiceSnapshots(
              'aurral',
              this.servers.filter((server) => server.syncEnabled),
              async () => {
                const current = await mediaRepository.findOneBy({
                  id: media.id,
                });
                if (!current) {
                  return false;
                }
                if (availabilityChanged) {
                  current.availableMusicServiceIds = nextAvailableServiceIds;
                }
                if (
                  shouldResetProcessing &&
                  current.status === MediaStatus.PROCESSING &&
                  !(
                    current.updatedAt instanceof Date &&
                    current.updatedAt.getTime() >=
                      this.scanStartedAt - SCAN_START_MARGIN_MS
                  )
                ) {
                  current.status = MediaStatus.UNKNOWN;
                }
                await mediaRepository.save(current);
                return true;
              },
              {
                requireExactAuthoritySet: true,
                includeCurrent: (server) => server.syncEnabled,
              }
            )
          );
        }
      }
    );
  }
}

export const aurralScanner = new AurralScanner();
