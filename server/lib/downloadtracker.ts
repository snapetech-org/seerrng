import BackIssueAPI from '@server/api/comics/backissue';
import KapowarrAPI from '@server/api/comics/kapowarr';
import type { QueueItem, ServarrHistoryItem } from '@server/api/servarr/base';
import LidarrAPI from '@server/api/servarr/lidarr';
import RadarrAPI from '@server/api/servarr/radarr';
import ReadarrAPI from '@server/api/servarr/readarr';
import SonarrAPI from '@server/api/servarr/sonarr';
import WhisparrAPI from '@server/api/servarr/whisparr';
import { MediaType } from '@server/constants/media';
import { getExternalRuntimeConfig } from '@server/lib/externalRuntimeConfig';
import {
  hasSameServarrServiceAuthority,
  runWithServarrServiceAdmission,
  type ServarrDownloadServiceType,
  type ServarrServiceAuthority,
} from '@server/lib/serviceAdmission';
import type { DVRSettings, ReadarrSettings } from '@server/lib/settings';
import logger from '@server/logger';
import { mapWithConcurrency } from '@server/utils/concurrency';
import {
  DEFAULT_SERVARR_DOWNLOAD_QUEUE_SIZE,
  MAX_SERVARR_INSTANCES_PER_TYPE,
  validateServarrDownloadQueueSize,
} from '@server/utils/servarrSettings';
import { uniqWith } from 'lodash';

interface EpisodeNumberResult {
  seasonNumber: number;
  episodeNumber: number;
  absoluteEpisodeNumber: number;
  id: number;
}

export const isMatchingReadarrDownloadServer = (
  serverA: {
    hostname: string;
    port: number;
    baseUrl?: string;
    serviceType?: 'ebook' | 'audiobook' | 'both';
  },
  serverB: {
    hostname: string;
    port: number;
    baseUrl?: string;
    serviceType?: 'ebook' | 'audiobook' | 'both';
  }
): boolean =>
  serverA.hostname === serverB.hostname &&
  serverA.port === serverB.port &&
  serverA.baseUrl === serverB.baseUrl &&
  (serverA.serviceType ?? 'ebook') === (serverB.serviceType ?? 'ebook');

export interface DownloadingItem {
  mediaType: MediaType;
  externalId: number;
  size: number;
  sizeLeft: number;
  status: string;
  timeLeft: string;
  estimatedCompletionTime: Date;
  title: string;
  downloadId: string;
  /** Opaque, user-scoped ID for live torrent progress. */
  liveDownloadToken?: string;
  percent?: number;
  trackedDownloadStatus?: string;
  trackedDownloadState?: string;
  /** `torrent` or `usenet`, as reported by the *arr queue. */
  protocol?: string;
  /** Download client name configured in the *arr service. */
  downloadClient?: string;
  episode?: EpisodeNumberResult;
}

export type ServarrHistoryStage = 'grabbed' | 'imported' | 'failed';

export interface ServarrHistoryEvidence {
  stage: ServarrHistoryStage;
  observedAt: Date;
  downloadId?: string;
}

const getQueueState = (
  item: QueueItem
): Pick<
  DownloadingItem,
  | 'trackedDownloadStatus'
  | 'trackedDownloadState'
  | 'protocol'
  | 'downloadClient'
> => ({
  trackedDownloadStatus: item.trackedDownloadStatus,
  trackedDownloadState: item.trackedDownloadState,
  protocol:
    typeof item.protocol === 'string' ? item.protocol.slice(0, 32) : undefined,
  downloadClient:
    typeof item.downloadClient === 'string'
      ? item.downloadClient.slice(0, 120)
      : undefined,
});

export const DOWNLOAD_TRACKER_SERVER_CONCURRENCY = 5;

type DownloadTrackerServerSettings = DVRSettings &
  Partial<Pick<ReadarrSettings, 'serviceType'>>;

const getServarrDownloadQueueSize = (
  server: Pick<DVRSettings, 'downloadQueueSize'>
): number =>
  validateServarrDownloadQueueSize(
    server.downloadQueueSize ?? DEFAULT_SERVARR_DOWNLOAD_QUEUE_SIZE
  );

export const hasSameServarrDownloadAuthority = hasSameServarrServiceAuthority;

export class DownloadTracker {
  private static readonly monitoredRefreshCooldownMs = 5 * 60 * 1000;

  private radarrServers: Record<number, DownloadingItem[]> = {};
  private radarrHistory: Record<number, ServarrHistoryItem[]> = {};
  private whisparrServers: Record<number, DownloadingItem[]> = {};
  private whisparrHistory: Record<number, ServarrHistoryItem[]> = {};
  private sonarrServers: Record<number, DownloadingItem[]> = {};
  private sonarrHistory: Record<number, ServarrHistoryItem[]> = {};
  private lidarrServers: Record<number, DownloadingItem[]> = {};
  private lidarrHistory: Record<number, ServarrHistoryItem[]> = {};
  private readarrServers: Record<number, DownloadingItem[]> = {};
  private kapowarrServers: Record<number, DownloadingItem[]> = {};
  private backissueServers: Record<number, DownloadingItem[]> = {};
  private monitoredRefreshes = new Map<string, Promise<boolean>>();
  private lastMonitoredRefresh = new Map<string, number>();
  /** Keep stale snapshots visible without reading after a refresh that failed. */
  private failedMonitoredRefreshes = new Set<string>();
  private activeUpdate?: Promise<void>;

  private runWithCurrentServarrDownloadServer<
    Server extends ServarrServiceAuthority,
    Result,
  >(
    serviceType: ServarrDownloadServiceType,
    server: Server,
    operation: () => Promise<Result>
  ): Promise<Result | undefined> {
    return runWithServarrServiceAdmission(
      [{ serviceType, serviceId: server.id }],
      async () => {
        const current = getExternalRuntimeConfig()[serviceType].find(
          (candidate) => candidate.id === server.id
        );
        if (
          !current ||
          !current.syncEnabled ||
          !hasSameServarrDownloadAuthority(current, server)
        ) {
          return undefined;
        }

        return operation();
      }
    );
  }

  private ensureMonitoredDownloadsRefreshed(
    key: string,
    serviceType: ServarrDownloadServiceType,
    server: DownloadTrackerServerSettings,
    refresh: () => Promise<void>,
    serverName: string
  ): Promise<boolean> {
    const activeRefresh = this.monitoredRefreshes.get(key);
    if (activeRefresh) {
      return activeRefresh;
    }

    const lastRefresh = this.lastMonitoredRefresh.get(key) ?? 0;

    if (Date.now() - lastRefresh < DownloadTracker.monitoredRefreshCooldownMs) {
      return Promise.resolve(!this.failedMonitoredRefreshes.has(key));
    }

    this.lastMonitoredRefresh.set(key, Date.now());
    const refreshTask = this.runWithCurrentServarrDownloadServer(
      serviceType,
      server,
      refresh
    )
      .then(() => true)
      .catch((e) => {
        logger.debug(
          `Unable to refresh monitored downloads for server: ${serverName}`,
          {
            errorMessage: e instanceof Error ? e.message : String(e),
            label: 'Download Tracker',
          }
        );
        return false;
      })
      .then((refreshed) => {
        if (refreshed) {
          this.failedMonitoredRefreshes.delete(key);
        } else {
          this.failedMonitoredRefreshes.add(key);
        }
        return refreshed;
      })
      .finally(() => {
        this.monitoredRefreshes.delete(key);
      });

    this.monitoredRefreshes.set(key, refreshTask);
    return refreshTask;
  }

  private async loadHistory(
    serviceType: ServarrDownloadServiceType,
    server: DownloadTrackerServerSettings,
    api: { getHistory: () => Promise<ServarrHistoryItem[]> },
    serverName: string
  ): Promise<ServarrHistoryItem[] | undefined> {
    try {
      return await this.runWithCurrentServarrDownloadServer(
        serviceType,
        server,
        () => api.getHistory()
      );
    } catch (e) {
      logger.debug(`Unable to get history from server: ${serverName}`, {
        errorMessage: e instanceof Error ? e.message : String(e),
        label: 'Download Tracker',
      });
      return undefined;
    }
  }

  public getMovieProgress(
    serverId: number,
    externalServiceId: number
  ): DownloadingItem[] {
    if (!this.radarrServers[serverId]) {
      return [];
    }

    return this.radarrServers[serverId].filter(
      (item) => item.externalId === externalServiceId
    );
  }

  public getSeriesProgress(
    serverId: number,
    externalServiceId: number
  ): DownloadingItem[] {
    if (!this.sonarrServers[serverId]) {
      return [];
    }

    return this.sonarrServers[serverId].filter(
      (item) => item.externalId === externalServiceId
    );
  }

  public getMusicProgress(
    serverId: number,
    externalServiceId: number
  ): DownloadingItem[] {
    if (!this.lidarrServers[serverId]) {
      return [];
    }

    return this.lidarrServers[serverId].filter(
      (item) => item.externalId === externalServiceId
    );
  }

  private getHistoryEvidence(
    history: Record<number, ServarrHistoryItem[]>,
    idField: 'movieId' | 'seriesId' | 'albumId',
    serverId: number,
    externalServiceId: number,
    since: Date
  ): ServarrHistoryEvidence | undefined {
    const sinceTime = since.getTime();
    if (!Number.isFinite(sinceTime)) {
      return undefined;
    }

    let evidence: ServarrHistoryEvidence | undefined;
    for (const item of history[serverId] ?? []) {
      if (item[idField] !== externalServiceId || !item.date) {
        continue;
      }
      const observedAt = new Date(item.date);
      if (
        Number.isNaN(observedAt.getTime()) ||
        observedAt.getTime() < sinceTime
      ) {
        continue;
      }

      const eventType = String(item.eventType ?? '')
        .trim()
        .toLocaleLowerCase();
      let stage: ServarrHistoryStage | undefined;
      if (
        eventType.includes('failed') ||
        eventType.includes('error') ||
        Number(item.eventType) === 4
      ) {
        stage = 'failed';
      } else if (
        eventType.includes('imported') ||
        eventType.includes('importcompleted') ||
        [3, 8].includes(Number(item.eventType))
      ) {
        stage = 'imported';
      } else if (eventType === 'grabbed' || Number(item.eventType) === 1) {
        stage = 'grabbed';
      }

      if (
        stage &&
        (!evidence || observedAt.getTime() > evidence.observedAt.getTime())
      ) {
        evidence = { stage, observedAt, downloadId: item.downloadId };
      }
    }

    return evidence;
  }

  public getMovieHistoryEvidence(
    serverId: number,
    externalServiceId: number,
    since: Date
  ): ServarrHistoryEvidence | undefined {
    return this.getHistoryEvidence(
      this.radarrHistory,
      'movieId',
      serverId,
      externalServiceId,
      since
    );
  }

  public getSeriesHistoryEvidence(
    serverId: number,
    externalServiceId: number,
    since: Date
  ): ServarrHistoryEvidence | undefined {
    return this.getHistoryEvidence(
      this.sonarrHistory,
      'seriesId',
      serverId,
      externalServiceId,
      since
    );
  }

  public getAdultHistoryEvidence(
    serverId: number,
    externalServiceId: number,
    since: Date
  ): ServarrHistoryEvidence | undefined {
    return this.getHistoryEvidence(
      this.whisparrHistory,
      'movieId',
      serverId,
      externalServiceId,
      since
    );
  }

  public getMusicHistoryEvidence(
    serverId: number,
    externalServiceId: number,
    since: Date
  ): ServarrHistoryEvidence | undefined {
    return this.getHistoryEvidence(
      this.lidarrHistory,
      'albumId',
      serverId,
      externalServiceId,
      since
    );
  }

  public getBookProgress(
    serverId: number,
    externalServiceId: number
  ): DownloadingItem[] {
    if (!this.readarrServers[serverId]) {
      return [];
    }

    return this.readarrServers[serverId].filter(
      (item) => item.externalId === externalServiceId
    );
  }

  public getComicProgress(
    serverId: number,
    externalServiceId: number
  ): DownloadingItem[] {
    return [
      ...(this.kapowarrServers[serverId] ?? []),
      ...(this.backissueServers[serverId] ?? []),
    ].filter((item) => item.externalId === externalServiceId);
  }

  public getAdultProgress(
    serverId: number,
    externalServiceId: number
  ): DownloadingItem[] {
    return (this.whisparrServers[serverId] ?? []).filter(
      (item) => item.externalId === externalServiceId
    );
  }

  public async resetDownloadTracker() {
    // A reset that races an update can otherwise be undone when the older
    // queue fetch writes its results after the reset. Drain that local update
    // first, then clear the snapshot and its refresh cooldowns.
    await this.activeUpdate?.catch(() => undefined);
    this.radarrServers = {};
    this.radarrHistory = {};
    this.whisparrServers = {};
    this.whisparrHistory = {};
    this.sonarrServers = {};
    this.sonarrHistory = {};
    this.lidarrServers = {};
    this.lidarrHistory = {};
    this.readarrServers = {};
    this.kapowarrServers = {};
    this.backissueServers = {};
    this.lastMonitoredRefresh.clear();
  }

  public updateDownloads(): Promise<void> {
    if (this.activeUpdate) {
      return this.activeUpdate;
    }

    const update = Promise.all([
      this.updateRadarrDownloads(),
      this.updateWhisparrDownloads(),
      this.updateSonarrDownloads(),
      this.updateLidarrDownloads(),
      this.updateReadarrDownloads(),
      this.updateKapowarrDownloads(),
      this.updateBackIssueDownloads(),
    ])
      .then(() => undefined)
      .finally(() => {
        if (this.activeUpdate === update) {
          this.activeUpdate = undefined;
        }
      });
    this.activeUpdate = update;
    return update;
  }

  private async updateRadarrDownloads() {
    const settings = getExternalRuntimeConfig();

    // Remove duplicate servers
    const filteredServers = uniqWith(
      settings.radarr
        .filter((server) => server.syncEnabled)
        .slice(0, MAX_SERVARR_INSTANCES_PER_TYPE),
      (radarrA, radarrB) => {
        return (
          radarrA.hostname === radarrB.hostname &&
          radarrA.port === radarrB.port &&
          radarrA.baseUrl === radarrB.baseUrl
        );
      }
    );

    // Load downloads from Radarr servers
    await mapWithConcurrency(
      filteredServers,
      DOWNLOAD_TRACKER_SERVER_CONCURRENCY,
      async (server) => {
        const radarr = new RadarrAPI({
          apiKey: server.apiKey,
          url: RadarrAPI.buildUrl(server, '/api/v3'),
        });
        const matchingServers = settings.radarr.filter(
          (candidate) =>
            candidate.syncEnabled &&
            candidate.id !== server.id &&
            candidate.hostname === server.hostname &&
            candidate.port === server.port &&
            candidate.baseUrl === server.baseUrl
        );

        try {
          const queueLimits = new Map(
            [server, ...matchingServers].map((candidate) => [
              candidate.id,
              getServarrDownloadQueueSize(candidate),
            ])
          );
          const physicalQueueLimit = Math.max(...queueLimits.values());

          if (
            !(await this.ensureMonitoredDownloadsRefreshed(
              `radarr:${server.id}`,
              'radarr',
              server,
              () => radarr.refreshMonitoredDownloads(),
              server.name
            ))
          ) {
            return;
          }

          const [queueItems, historyItems] = await Promise.all([
            this.runWithCurrentServarrDownloadServer('radarr', server, () =>
              radarr.getQueue(physicalQueueLimit)
            ),
            this.loadHistory('radarr', server, radarr, server.name),
          ]);
          if (!queueItems) {
            delete this.radarrServers[server.id];
            delete this.radarrHistory[server.id];
            return;
          }

          const serverDownloads = queueItems.map((item) => ({
            externalId: item.movieId,
            estimatedCompletionTime: new Date(item.estimatedCompletionTime),
            mediaType: MediaType.MOVIE,
            size: item.size,
            sizeLeft: item.sizeleft,
            status: item.status,
            timeLeft: item.timeleft,
            title: item.title,
            downloadId: item.downloadId,
            ...getQueueState(item),
          }));

          for (const candidate of [server, ...matchingServers]) {
            const queueLimit = queueLimits.get(candidate.id);
            if (queueLimit === undefined) continue;
            this.radarrServers[candidate.id] = serverDownloads.slice(
              0,
              queueLimit
            );
            if (historyItems) {
              this.radarrHistory[candidate.id] = historyItems;
            }
          }

          if (queueItems.length > 0) {
            logger.debug(
              `Found ${queueItems.length} item(s) in progress on Radarr server: ${server.name}`,
              { label: 'Download Tracker' }
            );
          }
          if (matchingServers.length > 0) {
            logger.debug(
              `Matching download data to ${matchingServers.length} other Radarr server(s)`,
              { label: 'Download Tracker' }
            );
          }
        } catch (error) {
          logger.error(
            `Unable to get queue from Radarr server: ${server.name}`,
            {
              errorMessage:
                error instanceof Error ? error.message : String(error),
              label: 'Download Tracker',
            }
          );
        }
      }
    );
  }

  private async updateWhisparrDownloads() {
    const settings = getExternalRuntimeConfig();
    const filteredServers = uniqWith(
      settings.whisparr
        .filter((server) => server.syncEnabled)
        .slice(0, MAX_SERVARR_INSTANCES_PER_TYPE),
      (left, right) =>
        left.hostname === right.hostname &&
        left.port === right.port &&
        left.baseUrl === right.baseUrl
    );

    await mapWithConcurrency(
      filteredServers,
      DOWNLOAD_TRACKER_SERVER_CONCURRENCY,
      async (server) => {
        const whisparr = new WhisparrAPI({
          apiKey: server.apiKey,
          url: WhisparrAPI.buildUrl(server, '/api/v3'),
        });
        const matchingServers = settings.whisparr.filter(
          (candidate) =>
            candidate.syncEnabled &&
            candidate.id !== server.id &&
            candidate.hostname === server.hostname &&
            candidate.port === server.port &&
            candidate.baseUrl === server.baseUrl
        );

        try {
          const queueLimits = new Map(
            [server, ...matchingServers].map((candidate) => [
              candidate.id,
              getServarrDownloadQueueSize(candidate),
            ])
          );
          const physicalQueueLimit = Math.max(...queueLimits.values());

          if (
            !(await this.ensureMonitoredDownloadsRefreshed(
              `whisparr:${server.id}`,
              'whisparr',
              server,
              () => whisparr.refreshMonitoredDownloads(),
              server.name
            ))
          ) {
            return;
          }
          const [queueItems, historyItems] = await Promise.all([
            this.runWithCurrentServarrDownloadServer('whisparr', server, () =>
              whisparr.getQueue(physicalQueueLimit)
            ),
            this.loadHistory('whisparr', server, whisparr, server.name),
          ]);
          if (!queueItems) {
            delete this.whisparrServers[server.id];
            delete this.whisparrHistory[server.id];
            return;
          }
          const serverDownloads = queueItems.flatMap((item) =>
            item.movieId === undefined
              ? []
              : [
                  {
                    externalId: item.movieId,
                    estimatedCompletionTime: new Date(
                      item.estimatedCompletionTime
                    ),
                    mediaType: MediaType.ADULT,
                    size: item.size,
                    sizeLeft: item.sizeleft,
                    status: item.status,
                    timeLeft: item.timeleft,
                    title: item.title,
                    downloadId: item.downloadId,
                    ...getQueueState(item),
                  },
                ]
          );
          for (const candidate of [server, ...matchingServers]) {
            const queueLimit = queueLimits.get(candidate.id);
            if (queueLimit === undefined) continue;
            this.whisparrServers[candidate.id] = serverDownloads.slice(
              0,
              queueLimit
            );
            if (historyItems) {
              this.whisparrHistory[candidate.id] = historyItems;
            }
          }
          if (matchingServers.length > 0) {
            logger.debug(
              `Matching download data to ${matchingServers.length} other Whisparr server(s)`,
              { label: 'Download Tracker' }
            );
          }
        } catch (error) {
          logger.error(
            `Unable to get queue from Whisparr server: ${server.name}`,
            {
              errorMessage:
                error instanceof Error ? error.message : String(error),
              label: 'Download Tracker',
            }
          );
          return;
        }
      }
    );
  }

  private async updateSonarrDownloads() {
    const settings = getExternalRuntimeConfig();

    // Remove duplicate servers
    const filteredServers = uniqWith(
      settings.sonarr
        .filter((server) => server.syncEnabled)
        .slice(0, MAX_SERVARR_INSTANCES_PER_TYPE),
      (sonarrA, sonarrB) => {
        return (
          sonarrA.hostname === sonarrB.hostname &&
          sonarrA.port === sonarrB.port &&
          sonarrA.baseUrl === sonarrB.baseUrl
        );
      }
    );

    // Load downloads from Sonarr servers
    await mapWithConcurrency(
      filteredServers,
      DOWNLOAD_TRACKER_SERVER_CONCURRENCY,
      async (server) => {
        const sonarr = new SonarrAPI({
          apiKey: server.apiKey,
          url: SonarrAPI.buildUrl(server, '/api/v3'),
        });
        const matchingServers = settings.sonarr.filter(
          (candidate) =>
            candidate.syncEnabled &&
            candidate.id !== server.id &&
            candidate.hostname === server.hostname &&
            candidate.port === server.port &&
            candidate.baseUrl === server.baseUrl
        );

        try {
          const queueLimits = new Map(
            [server, ...matchingServers].map((candidate) => [
              candidate.id,
              getServarrDownloadQueueSize(candidate),
            ])
          );
          const physicalQueueLimit = Math.max(...queueLimits.values());

          if (
            !(await this.ensureMonitoredDownloadsRefreshed(
              `sonarr:${server.id}`,
              'sonarr',
              server,
              () => sonarr.refreshMonitoredDownloads(),
              server.name
            ))
          ) {
            return;
          }

          const [queueItems, historyItems] = await Promise.all([
            this.runWithCurrentServarrDownloadServer('sonarr', server, () =>
              sonarr.getQueue(physicalQueueLimit)
            ),
            this.loadHistory('sonarr', server, sonarr, server.name),
          ]);
          if (!queueItems) {
            delete this.sonarrServers[server.id];
            delete this.sonarrHistory[server.id];
            return;
          }

          const serverDownloads = queueItems.map((item) => ({
            externalId: item.seriesId,
            estimatedCompletionTime: new Date(item.estimatedCompletionTime),
            mediaType: MediaType.TV,
            size: item.size,
            sizeLeft: item.sizeleft,
            status: item.status,
            timeLeft: item.timeleft,
            title: item.title,
            episode: item.episode,
            downloadId: item.downloadId,
            ...getQueueState(item),
          }));

          for (const candidate of [server, ...matchingServers]) {
            const queueLimit = queueLimits.get(candidate.id);
            if (queueLimit === undefined) continue;
            this.sonarrServers[candidate.id] = serverDownloads.slice(
              0,
              queueLimit
            );
            if (historyItems) {
              this.sonarrHistory[candidate.id] = historyItems;
            }
          }

          if (queueItems.length > 0) {
            logger.debug(
              `Found ${queueItems.length} item(s) in progress on Sonarr server: ${server.name}`,
              { label: 'Download Tracker' }
            );
          }
          if (matchingServers.length > 0) {
            logger.debug(
              `Matching download data to ${matchingServers.length} other Sonarr server(s)`,
              { label: 'Download Tracker' }
            );
          }
        } catch (error) {
          logger.error(
            `Unable to get queue from Sonarr server: ${server.name}`,
            {
              errorMessage:
                error instanceof Error ? error.message : String(error),
              label: 'Download Tracker',
            }
          );
        }
      }
    );
  }

  private async updateLidarrDownloads() {
    const settings = getExternalRuntimeConfig();

    const filteredServers = uniqWith(
      settings.lidarr
        .filter((server) => server.syncEnabled)
        .slice(0, MAX_SERVARR_INSTANCES_PER_TYPE),
      (lidarrA, lidarrB) => {
        return (
          lidarrA.hostname === lidarrB.hostname &&
          lidarrA.port === lidarrB.port &&
          lidarrA.baseUrl === lidarrB.baseUrl
        );
      }
    );

    await mapWithConcurrency(
      filteredServers,
      DOWNLOAD_TRACKER_SERVER_CONCURRENCY,
      async (server) => {
        const lidarr = new LidarrAPI({
          apiKey: server.apiKey,
          url: LidarrAPI.buildUrl(server, '/api/v1'),
        });
        const matchingServers = settings.lidarr.filter(
          (candidate) =>
            candidate.syncEnabled &&
            candidate.id !== server.id &&
            candidate.hostname === server.hostname &&
            candidate.port === server.port &&
            candidate.baseUrl === server.baseUrl
        );

        try {
          const queueLimits = new Map(
            [server, ...matchingServers].map((candidate) => [
              candidate.id,
              getServarrDownloadQueueSize(candidate),
            ])
          );
          const physicalQueueLimit = Math.max(...queueLimits.values());

          if (
            !(await this.ensureMonitoredDownloadsRefreshed(
              `lidarr:${server.id}`,
              'lidarr',
              server,
              () => lidarr.refreshMonitoredDownloads(),
              server.name
            ))
          ) {
            return;
          }

          const [queueItems, historyItems] = await Promise.all([
            this.runWithCurrentServarrDownloadServer('lidarr', server, () =>
              lidarr.getQueue(physicalQueueLimit)
            ),
            this.loadHistory('lidarr', server, lidarr, server.name),
          ]);
          if (!queueItems) {
            delete this.lidarrServers[server.id];
            delete this.lidarrHistory[server.id];
            return;
          }

          const serverDownloads = queueItems
            .filter((item) => item.albumId !== undefined)
            .map((item) => ({
              externalId: item.albumId,
              estimatedCompletionTime: new Date(item.estimatedCompletionTime),
              mediaType: MediaType.MUSIC,
              size: item.size,
              sizeLeft: item.sizeleft,
              status: item.status,
              timeLeft: item.timeleft,
              title: item.title,
              downloadId: item.downloadId,
              ...getQueueState(item),
            }));

          for (const candidate of [server, ...matchingServers]) {
            const queueLimit = queueLimits.get(candidate.id);
            if (queueLimit === undefined) continue;
            this.lidarrServers[candidate.id] = serverDownloads.slice(
              0,
              queueLimit
            );
            if (historyItems) {
              this.lidarrHistory[candidate.id] = historyItems;
            }
          }

          if (queueItems.length > 0) {
            logger.debug(
              `Found ${queueItems.length} item(s) in progress on Lidarr server: ${server.name}`,
              { label: 'Download Tracker' }
            );
          }
          if (matchingServers.length > 0) {
            logger.debug(
              `Matching download data to ${matchingServers.length} other Lidarr server(s)`,
              { label: 'Download Tracker' }
            );
          }
        } catch (error) {
          logger.error(
            `Unable to get queue from Lidarr server: ${server.name}`,
            {
              errorMessage:
                error instanceof Error ? error.message : String(error),
              label: 'Download Tracker',
            }
          );
        }
      }
    );
  }

  private async updateKapowarrDownloads() {
    const settings = getExternalRuntimeConfig();

    const filteredServers = uniqWith(
      settings.kapowarr.slice(0, MAX_SERVARR_INSTANCES_PER_TYPE),
      (kapowarrA, kapowarrB) => {
        return (
          kapowarrA.hostname === kapowarrB.hostname &&
          kapowarrA.port === kapowarrB.port &&
          kapowarrA.baseUrl === kapowarrB.baseUrl
        );
      }
    );

    await mapWithConcurrency(
      filteredServers,
      DOWNLOAD_TRACKER_SERVER_CONCURRENCY,
      async (server) => {
        if (server.syncEnabled) {
          const kapowarr = new KapowarrAPI({
            apiKey: server.apiKey,
            url: KapowarrAPI.buildUrl(server),
          });

          try {
            const queueItems = await this.runWithCurrentServarrDownloadServer(
              'kapowarr',
              server,
              () => kapowarr.getQueue()
            );
            if (!queueItems) {
              delete this.kapowarrServers[server.id];
              return;
            }

            this.kapowarrServers[server.id] = queueItems.map((item) => {
              const sizeLeft = Math.round(
                item.size * (1 - item.progress / 100)
              );
              const etaSeconds = item.speed > 0 ? sizeLeft / item.speed : NaN;
              return {
                externalId: item.volumeId,
                estimatedCompletionTime: new Date(
                  Date.now() + etaSeconds * 1000
                ),
                mediaType: MediaType.COMIC,
                size: item.size,
                sizeLeft,
                status: item.status,
                timeLeft: 'unknown',
                title: item.title,
                downloadId: String(item.id),
              };
            });

            if (queueItems.length > 0) {
              logger.debug(
                `Found ${queueItems.length} item(s) in progress on Kapowarr server: ${server.name}`,
                { label: 'Download Tracker' }
              );
            }
          } catch (e) {
            logger.error(
              `Unable to get queue from Kapowarr server: ${server.name}`,
              {
                errorMessage: e.message,
                label: 'Download Tracker',
              }
            );
          }

          const matchingServers = settings.kapowarr.filter(
            (ks) =>
              ks.hostname === server.hostname &&
              ks.port === server.port &&
              ks.baseUrl === server.baseUrl &&
              ks.id !== server.id
          );

          matchingServers.forEach((ms) => {
            if (ms.syncEnabled) {
              this.kapowarrServers[ms.id] = this.kapowarrServers[server.id];
            }
          });
        }
      }
    );
  }

  private async updateBackIssueDownloads() {
    const settings = getExternalRuntimeConfig();
    const filteredServers = uniqWith(
      settings.backissue.slice(0, MAX_SERVARR_INSTANCES_PER_TYPE),
      (left, right) =>
        left.hostname === right.hostname &&
        left.port === right.port &&
        left.baseUrl === right.baseUrl
    );

    await mapWithConcurrency(
      filteredServers,
      DOWNLOAD_TRACKER_SERVER_CONCURRENCY,
      async (server) => {
        if (!server.syncEnabled) return;
        const api = new BackIssueAPI({
          url: BackIssueAPI.buildUrl(server),
          apiKey: server.apiKey,
        });
        try {
          const queueItems = await this.runWithCurrentServarrDownloadServer(
            'backissue',
            server,
            () => api.getQueue()
          );
          if (!queueItems) {
            delete this.backissueServers[server.id];
            return;
          }
          this.backissueServers[server.id] = queueItems.map((item) => ({
            externalId: item.seriesId,
            estimatedCompletionTime: new Date(Number.NaN),
            mediaType: MediaType.COMIC,
            size: 0,
            sizeLeft: 0,
            status: item.status,
            timeLeft: 'unknown',
            title: item.title,
            downloadId: String(item.id),
            ...(item.progress !== undefined ? { percent: item.progress } : {}),
          }));
        } catch (error) {
          logger.error(
            `Unable to get queue from BackIssue server: ${server.name}`,
            {
              errorMessage:
                error instanceof Error ? error.message : String(error),
              label: 'Download Tracker',
            }
          );
        }

        for (const matching of settings.backissue.filter(
          (candidate) =>
            candidate.id !== server.id &&
            candidate.syncEnabled &&
            candidate.hostname === server.hostname &&
            candidate.port === server.port &&
            candidate.baseUrl === server.baseUrl
        )) {
          this.backissueServers[matching.id] =
            this.backissueServers[server.id] ?? [];
        }
      }
    );
  }

  private async updateReadarrDownloads() {
    const settings = getExternalRuntimeConfig();

    const filteredServers = uniqWith(
      settings.readarr
        .filter((server) => server.backend !== 'bindery' && server.syncEnabled)
        .slice(0, MAX_SERVARR_INSTANCES_PER_TYPE),
      (readarrA, readarrB) =>
        isMatchingReadarrDownloadServer(readarrA, readarrB)
    );

    await mapWithConcurrency(
      filteredServers,
      DOWNLOAD_TRACKER_SERVER_CONCURRENCY,
      async (server) => {
        const readarr = new ReadarrAPI({
          apiKey: server.apiKey,
          url: ReadarrAPI.buildUrl(server, '/api/v1'),
          mediaType: server.serviceType === 'audiobook' ? 'audiobook' : 'ebook',
        });
        const matchingServers = settings.readarr.filter(
          (candidate) =>
            candidate.backend !== 'bindery' &&
            candidate.syncEnabled &&
            candidate.id !== server.id &&
            isMatchingReadarrDownloadServer(candidate, server)
        );

        try {
          const queueLimits = new Map(
            [server, ...matchingServers].map((candidate) => [
              candidate.id,
              getServarrDownloadQueueSize(candidate),
            ])
          );
          const physicalQueueLimit = Math.max(...queueLimits.values());

          if (
            !(await this.ensureMonitoredDownloadsRefreshed(
              `readarr:${server.id}`,
              'readarr',
              server,
              () => readarr.refreshMonitoredDownloads(),
              server.name
            ))
          ) {
            return;
          }

          const queueItems = await this.runWithCurrentServarrDownloadServer(
            'readarr',
            server,
            () => readarr.getQueue(physicalQueueLimit)
          );
          if (!queueItems) {
            delete this.readarrServers[server.id];
            return;
          }

          const serverDownloads = queueItems
            .map((item) => ({
              item,
              bookId: item.bookId ?? item.book?.id,
            }))
            .filter(
              (queueItem): queueItem is typeof queueItem & { bookId: number } =>
                queueItem.bookId !== undefined
            )
            .map(({ item, bookId }) => ({
              externalId: bookId,
              estimatedCompletionTime: new Date(item.estimatedCompletionTime),
              mediaType: MediaType.BOOK,
              size: item.size,
              sizeLeft: item.sizeleft,
              status: item.status,
              timeLeft: item.timeleft,
              title: item.title,
              downloadId: item.downloadId,
              ...getQueueState(item),
            }));

          for (const candidate of [server, ...matchingServers]) {
            const queueLimit = queueLimits.get(candidate.id);
            if (queueLimit === undefined) continue;
            this.readarrServers[candidate.id] = serverDownloads.slice(
              0,
              queueLimit
            );
          }

          if (queueItems.length > 0) {
            logger.debug(
              `Found ${queueItems.length} item(s) in progress on Bookshelf server: ${server.name}`,
              { label: 'Download Tracker' }
            );
          }
          if (matchingServers.length > 0) {
            logger.debug(
              `Matching download data to ${matchingServers.length} other Bookshelf server(s)`,
              { label: 'Download Tracker' }
            );
          }
        } catch (error) {
          logger.error(
            `Unable to get queue from Bookshelf server: ${server.name}`,
            {
              errorMessage:
                error instanceof Error ? error.message : String(error),
              label: 'Download Tracker',
            }
          );
        }
      }
    );
  }
}

const downloadTracker = new DownloadTracker();

export default downloadTracker;
