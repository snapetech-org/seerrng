import LazyLibrarianAPI, {
  type LazyLibrarianMagazine,
} from '@server/api/lazylibrarian';
import { getExternalRuntimeConfig } from '@server/lib/externalRuntimeConfig';
import { normalizeMagazineTitle } from '@server/lib/magazineIdentity';
import type {
  RunnableScanner,
  StatusBase,
} from '@server/lib/scanners/baseScanner';
import BaseScanner from '@server/lib/scanners/baseScanner';
import { runWithServarrServiceSnapshot } from '@server/lib/serviceAdmission';
import type { LazyLibrarianSettings } from '@server/lib/settings';

type SyncStatus = StatusBase & {
  currentServer?: LazyLibrarianSettings;
  servers: LazyLibrarianSettings[];
};

class LazyLibrarianScanner
  extends BaseScanner<LazyLibrarianMagazine>
  implements RunnableScanner<SyncStatus>
{
  private servers: LazyLibrarianSettings[] = [];
  private currentServer?: LazyLibrarianSettings;

  constructor() {
    super('LazyLibrarian Magazine Scan', { bundleSize: 5 });
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
    if (!sessionId) return;

    try {
      this.servers = structuredClone(settings.lazylibrarian);
      for (const server of this.servers) {
        this.currentServer = server;
        if (!server.syncEnabled) continue;
        this.log(
          `Beginning LazyLibrarian magazine scan: ${server.name}`,
          'info'
        );
        this.items = await runWithServarrServiceSnapshot(
          'lazylibrarian',
          server,
          async (current) =>
            new LazyLibrarianAPI({
              url: LazyLibrarianAPI.buildUrl(current),
              apiKey: current.apiKey,
            }).getMagazines()
        );
        await this.loop(this.processMagazineEntry.bind(this), { sessionId });
      }
      this.log('LazyLibrarian magazine scan complete', 'info');
    } catch (error) {
      this.log('LazyLibrarian magazine scan interrupted', 'error', {
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.currentServer = undefined;
      this.endRun(sessionId);
    }
  }

  private async processMagazineEntry(
    magazine: LazyLibrarianMagazine
  ): Promise<void> {
    const normalizedTitle = normalizeMagazineTitle(magazine.title);
    if (!normalizedTitle) return;
    try {
      const currentServer = this.currentServer;
      if (!currentServer) return;
      const detail = await runWithServarrServiceSnapshot(
        'lazylibrarian',
        currentServer,
        async (current) =>
          new LazyLibrarianAPI({
            url: LazyLibrarianAPI.buildUrl(current),
            apiKey: current.apiKey,
          }).getIssues(magazine.title, undefined, 0, { strict: true })
      );
      const hasFile = detail.issues.some((issue) => Boolean(issue.issueFile));
      const isMonitored =
        magazine.status?.trim().toLowerCase() === 'active' ||
        /^(wanted|snatched|seeding|processing)$/i.test(
          magazine.issueStatus?.trim() ?? ''
        );
      await this.processMagazine(normalizedTitle, {
        serviceId: currentServer.id,
        externalServiceId: 0,
        externalServiceSlug: magazine.title,
        title: magazine.title,
        hasFile,
        processing: isMonitored && !hasFile,
        mutationGuard: (callback) =>
          runWithServarrServiceSnapshot(
            'lazylibrarian',
            currentServer,
            callback
          ),
      });
    } catch (error) {
      this.log('Failed to process LazyLibrarian magazine', 'error', {
        errorMessage: error instanceof Error ? error.message : String(error),
        title: magazine.title,
      });
    }
  }
}

export const lazyLibrarianScanner = new LazyLibrarianScanner();
