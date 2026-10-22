import AudiobookshelfAPI, {
  type AudiobookshelfLibraryItem,
} from '@server/api/audiobookshelf';
import { MediaStatus, MediaType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import MediaIdentifier, {
  MediaIdentifierProvider,
} from '@server/entity/MediaIdentifier';
import { getExternalRuntimeConfig } from '@server/lib/externalRuntimeConfig';
import { normalizeValidIsbn } from '@server/lib/isbn';
import {
  AUDIOBOOKSHELF_MAX_LIBRARY_ITEMS,
  AUDIOBOOKSHELF_MAX_LIBRARY_PAGES,
  AUDIOBOOKSHELF_PAGE_SIZE,
  getCompleteAudiobookshelfItemIds,
} from '@server/lib/scanners/audiobookshelf/libraryScan';
import type {
  ProcessOptions,
  RunnableScanner,
  StatusBase,
} from '@server/lib/scanners/baseScanner';
import BaseScanner from '@server/lib/scanners/baseScanner';
import logger from '@server/logger';

class AudiobookshelfScanner
  extends BaseScanner<AudiobookshelfLibraryItem>
  implements RunnableScanner<StatusBase>
{
  private serviceId?: number;
  private seenItemIds = new Set<string>();

  constructor() {
    // processBook writes each ISBN match in its own SQLite transaction. Keep
    // those transactions serialized on SQLite's single connection.
    super('Audiobookshelf Scan', { bundleSize: 1 });
  }

  public status(): StatusBase {
    return {
      running: this.running,
      progress: this.progress,
      total: this.items.length,
    };
  }

  public async run(): Promise<void> {
    const settings = getExternalRuntimeConfig().audiobookshelf;
    if (!settings?.syncEnabled) return;

    const sessionId = this.startRun();
    if (!sessionId) return;

    this.serviceId = settings.id;
    this.seenItemIds.clear();

    try {
      const api = new AudiobookshelfAPI(settings);
      const items: AudiobookshelfLibraryItem[] = [];
      let total: number | undefined;
      let firstPageTotal: number | undefined;

      for (let page = 0; page < AUDIOBOOKSHELF_MAX_LIBRARY_PAGES; page += 1) {
        const result = await api.getLibraryItems(
          settings.libraryId,
          page,
          AUDIOBOOKSHELF_PAGE_SIZE
        );
        total = result.total;
        if (total > AUDIOBOOKSHELF_MAX_LIBRARY_ITEMS) {
          throw new Error(
            `Audiobookshelf library exceeds the ${AUDIOBOOKSHELF_MAX_LIBRARY_ITEMS}-item scan limit. Orphan cleanup was skipped.`
          );
        }
        if (firstPageTotal === undefined) {
          firstPageTotal = total;
        } else if (total !== firstPageTotal) {
          throw new Error(
            'Audiobookshelf library changed during the scan. Orphan cleanup was skipped; the next scan will retry.'
          );
        }
        if (items.length + result.results.length > total) {
          throw new Error(
            'Audiobookshelf returned more items than its reported library total. Orphan cleanup was skipped.'
          );
        }
        items.push(...result.results);

        if (items.length === total) break;
        if (result.results.length === 0) {
          throw new Error(
            'Audiobookshelf returned an incomplete library scan. Orphan cleanup was skipped.'
          );
        }
      }

      const itemIds =
        total === undefined
          ? undefined
          : getCompleteAudiobookshelfItemIds(items, total);
      if (!itemIds) {
        throw new Error(
          'Audiobookshelf returned an incomplete or duplicated library scan. Orphan cleanup was skipped.'
        );
      }

      this.items = items;
      this.seenItemIds = itemIds;
      await this.loop(this.processItem.bind(this), { sessionId });
      await this.cleanupRemovedItems();
      logger.info('Audiobookshelf library scan complete', {
        label: 'Audiobookshelf',
        itemCount: items.length,
      });
    } catch (error) {
      logger.error('Audiobookshelf library scan failed', {
        label: 'Audiobookshelf',
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.endRun(sessionId);
      this.serviceId = undefined;
    }
  }

  private async processItem(item: AudiobookshelfLibraryItem): Promise<void> {
    const itemId = typeof item.id === 'string' ? item.id.trim() : '';
    const isbn = normalizeValidIsbn(item.media?.metadata?.isbn ?? undefined);
    if (!itemId || !isbn || this.serviceId === undefined) {
      return;
    }

    const options: ProcessOptions = {
      title: item.media?.metadata?.title ?? 'Audiobookshelf book',
      hasFile: true,
      bookServiceType: 'audiobook',
      audiobookLibrarySource: { serviceId: this.serviceId, itemId },
      mediaAddedAt:
        typeof item.addedAt === 'number' && Number.isFinite(item.addedAt)
          ? new Date(item.addedAt)
          : undefined,
      secondaryIdentifiers: [
        { provider: MediaIdentifierProvider.AUDIOBOOKSHELF, value: itemId },
      ],
    };

    await this.processBook(MediaIdentifierProvider.ISBN, isbn, options);
  }

  private async cleanupRemovedItems(): Promise<void> {
    if (this.serviceId === undefined) return;

    const mediaRepository = getRepository(Media);
    const identifierRepository = getRepository(MediaIdentifier);
    const tracked = await mediaRepository.find({
      where: {
        mediaType: MediaType.BOOK,
        audiobookLibraryServiceId: this.serviceId,
      },
      relations: { identifiers: true },
    });

    for (const media of tracked) {
      const itemId = media.audiobookLibraryItemId;
      if (!itemId || this.seenItemIds.has(itemId)) continue;

      media.audiobookLibraryServiceId = null;
      media.audiobookLibraryItemId = null;
      if (
        media.status === MediaStatus.AVAILABLE &&
        media.externalServiceId == null &&
        media.audiobookExternalServiceId == null
      ) {
        media.status = MediaStatus.UNKNOWN;
      }

      await mediaRepository.save(media);
      const sourceIdentifier = media.identifiers?.find(
        (identifier) =>
          identifier.provider === MediaIdentifierProvider.AUDIOBOOKSHELF &&
          identifier.value === itemId
      );
      if (sourceIdentifier) await identifierRepository.remove(sourceIdentifier);
    }
  }
}

export const audiobookshelfScanner = new AudiobookshelfScanner();
