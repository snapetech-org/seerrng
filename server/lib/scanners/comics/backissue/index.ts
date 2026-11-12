import type { BackIssueCollectionItem } from '@server/api/comics/backissue';
import BackIssueAPI from '@server/api/comics/backissue';
import {
  backIssueSeriesState,
  setComicLibraryProgress,
} from '@server/lib/comicLibraryProgress';
import { getExternalRuntimeConfig } from '@server/lib/externalRuntimeConfig';
import type {
  RunnableScanner,
  StatusBase,
} from '@server/lib/scanners/baseScanner';
import BaseScanner from '@server/lib/scanners/baseScanner';
import { runWithServarrServiceSnapshot } from '@server/lib/serviceAdmission';
import type { BackIssueSettings } from '@server/lib/settings';
import { getHttpErrorDetails } from '@server/utils/httpError';

type SyncStatus = StatusBase & {
  currentServer: BackIssueSettings;
  servers: BackIssueSettings[];
};

class BackIssueScanner
  extends BaseScanner<BackIssueCollectionItem>
  implements RunnableScanner<SyncStatus>
{
  private servers: BackIssueSettings[] = [];
  private currentServer: BackIssueSettings;

  constructor() {
    super('BackIssue Comics Scan', { bundleSize: 10 });
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

  private rescanTimer?: ReturnType<typeof setTimeout>;

  /**
   * Rescans shortly after a download leaves BackIssue's queue, so a finished
   * series turns available (and its requester is told) without waiting for
   * the scheduled scan. Repeated calls coalesce into one scan.
   */
  public scheduleRescan(delayMs = 90_000): void {
    if (this.rescanTimer) return;
    this.rescanTimer = setTimeout(() => {
      this.rescanTimer = undefined;
      if (this.running) return;
      this.run().catch(() => undefined);
    }, delayMs);
    this.rescanTimer.unref?.();
  }

  public async run(): Promise<void> {
    const settings = getExternalRuntimeConfig();
    const sessionId = this.startRun();
    if (!sessionId) return;

    try {
      this.servers = structuredClone(settings.backissue);
      for (const server of this.servers) {
        this.currentServer = server;
        if (!server.syncEnabled) {
          this.log(
            `Sync not enabled. Skipping BackIssue server: ${server.name}`
          );
          continue;
        }
        this.log(
          `Beginning to process BackIssue server: ${server.name}`,
          'info'
        );
        this.items = await runWithServarrServiceSnapshot(
          'backissue',
          server,
          async (current) => {
            const client = new BackIssueAPI({
              url: BackIssueAPI.buildUrl(current),
              apiKey: current.apiKey,
            });
            return client.getCollection();
          }
        );
        await this.loop(this.processSeries.bind(this), { sessionId });
      }
      this.log('BackIssue comics scan complete', 'info');
    } catch (error) {
      this.log('Scan interrupted', 'error', {
        ...getHttpErrorDetails(error),
        errorStack: error instanceof Error ? error.stack : undefined,
      });
    } finally {
      this.endRun(sessionId);
    }
  }

  private async processSeries(series: BackIssueCollectionItem): Promise<void> {
    // Comics and manga (each manga volume is one ComicVine "issue").
    if (series.type && series.type !== 'comic' && series.type !== 'manga')
      return;
    try {
      const counts = {
        owned: series.owned,
        total: series.total,
        active: series.active,
      };
      setComicLibraryProgress(this.currentServer.id, series.id, counts);
      await this.processComic(String(series.cv_id), {
        serviceId: this.currentServer.id,
        externalServiceId: series.id,
        externalServiceSlug: String(series.id),
        title: series.title,
        ...backIssueSeriesState(counts),
        comicServiceType: 'backissue',
        mutationGuard: (callback) =>
          runWithServarrServiceSnapshot(
            'backissue',
            this.currentServer,
            callback
          ),
      });
    } catch (error) {
      this.log('Failed to process BackIssue comic', 'error', {
        errorMessage: error instanceof Error ? error.message : String(error),
        title: series.title,
      });
    }
  }
}

export const backissueScanner = new BackIssueScanner();
