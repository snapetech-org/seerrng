import ExternalAPI from '@server/api/externalapi';
import type { AvailableCacheIds } from '@server/lib/cache';
import cacheManager from '@server/lib/cache';
import { getExternalRuntimeConfig } from '@server/lib/externalRuntimeConfig';
import type { DVRSettings } from '@server/lib/settings';
import logger from '@server/logger';
import {
  MAX_SERVARR_DOWNLOAD_QUEUE_SIZE,
  validateServarrDownloadQueueSize,
} from '@server/utils/servarrSettings';
import { buildServiceUrl, trimTrailingSlashes } from '@server/utils/serviceUrl';
import type { AxiosRequestConfig } from 'axios';

export interface SystemStatus {
  appName?: string;
  version: string;
  buildTime: Date;
  isDebug: boolean;
  isProduction: boolean;
  isAdmin: boolean;
  isUserInteractive: boolean;
  startupPath: string;
  appData: string;
  osName: string;
  osVersion: string;
  isNetCore: boolean;
  isMono: boolean;
  isLinux: boolean;
  isOsx: boolean;
  isWindows: boolean;
  isDocker: boolean;
  mode: string;
  branch: string;
  authentication: string;
  sqliteVersion: string;
  migrationVersion: number;
  urlBase: string;
  runtimeVersion: string;
  runtimeName: string;
  startTime: Date;
  packageUpdateMechanism: string;
}

export interface ServarrCommand {
  id: number;
  name: string;
  status: string;
  result?: string;
  message?: string;
  exception?: string;
  queued?: string;
  started?: string;
  ended?: string;
}

export interface RootFolder {
  id: number;
  path: string;
  freeSpace: number;
  totalSpace: number;
  accessible?: boolean;
  unmappedFolders: {
    name: string;
    path: string;
  }[];
}

export interface QualityProfile {
  id: number;
  name: string;
  language?: string;
}

export interface QueueStatusMessage {
  title?: string;
  messages?: string[];
}

export interface QueueItem {
  size: number;
  title: string;
  sizeleft: number;
  timeleft: string;
  estimatedCompletionTime: string;
  status: string;
  trackedDownloadStatus: string;
  trackedDownloadState: string;
  downloadId: string;
  protocol: string;
  downloadClient: string;
  indexer: string;
  id: number;
  statusMessages?: QueueStatusMessage[];
}

export interface ServarrHistoryItem {
  id: number;
  movieId?: number;
  seriesId?: number;
  episodeId?: number;
  albumId?: number;
  bookId?: number;
  eventType?: string | number;
  date?: string;
  downloadId?: string;
}

export interface Tag {
  id: number;
  label: string;
}

export const MAX_SERVARR_CONFIGURATION_RESULTS = 1_000;
export const MAX_SERVARR_QUEUE_RESULTS = MAX_SERVARR_DOWNLOAD_QUEUE_SIZE;
export const MAX_SERVARR_QUEUE_PAGE_SIZE = 1_000;
const MAX_SERVARR_INTERVENTION_QUEUE_RESULTS = 5_000;
const SERVARR_INTERVENTION_QUEUE_PAGE_SIZE = 250;
const SERVARR_COMMAND_POLL_INTERVAL_MS = 1_000;
const SERVARR_COMMAND_TIMEOUT_MS = 60_000;
export const MAX_SERVARR_LIBRARY_RESULTS = 100_000;
/** Finite cap for provider endpoints that return a complete library in one response. */
export const MAX_SERVARR_LIBRARY_RESPONSE_BYTES = 64 * 1024 * 1024;
export const MAX_SERVARR_LOOKUP_RESULTS = 1_000;
export const MAX_SERVARR_COVER_IMAGES = 20;
const MAX_SERVARR_TEXT_LENGTH = 10_000;
const MAX_SERVARR_IMAGE_URL_LENGTH = 2_048;
const SERVARR_TERMINAL_COMMAND_STATES = new Set([
  'completed',
  'failed',
  'aborted',
  'cancelled',
  'orphaned',
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const boundedText = (value: unknown): string =>
  typeof value === 'string' ? value.slice(0, MAX_SERVARR_TEXT_LENGTH) : '';

const boundedImageUrl = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length <= MAX_SERVARR_IMAGE_URL_LENGTH
    ? value
    : undefined;

export interface ServarrImage {
  coverType?: string;
  url?: string;
  remoteUrl?: string;
}

export const sanitizeServarrImages = (value: unknown): ServarrImage[] =>
  (Array.isArray(value) ? value : [])
    .slice(0, MAX_SERVARR_COVER_IMAGES)
    .flatMap((image) =>
      isRecord(image)
        ? [
            {
              coverType: boundedText(image.coverType) || undefined,
              url: boundedImageUrl(image.url),
              remoteUrl: boundedImageUrl(image.remoteUrl),
            },
          ]
        : []
    );

export const isServarrServiceUrl = (
  candidateUrl: string,
  serviceBaseUrl: string
): boolean => {
  try {
    const candidate = new URL(candidateUrl);
    const service = new URL(serviceBaseUrl);

    return (
      !candidate.username &&
      !candidate.password &&
      candidate.origin === service.origin
    );
  } catch {
    return false;
  }
};

export const sanitizeServarrCommand = (value: unknown): ServarrCommand => {
  if (!isRecord(value) || !Number.isSafeInteger(value.id)) {
    throw new Error('Servarr returned an invalid command');
  }

  const name = boundedText(value.name);
  const status = boundedText(value.status).toLowerCase();
  if (!name || !status) {
    throw new Error('Servarr returned an invalid command');
  }

  const optionalText = (field: string): string | undefined => {
    const result = boundedText(value[field]);
    return result || undefined;
  };

  return {
    id: value.id as number,
    name,
    status,
    result: optionalText('result')?.toLowerCase(),
    message: optionalText('message'),
    exception: optionalText('exception'),
    queued: optionalText('queued'),
    started: optionalText('started'),
    ended: optionalText('ended'),
  };
};

export const sanitizeServarrSystemStatus = (
  value: unknown
): Pick<SystemStatus, 'appName' | 'version' | 'urlBase'> => {
  if (!isRecord(value)) {
    throw new Error('Servarr returned invalid system status');
  }
  const version = boundedText(value.version);
  if (!version) {
    throw new Error('Servarr returned invalid system status');
  }
  return {
    appName: boundedText(value.appName) || undefined,
    version,
    urlBase: boundedText(value.urlBase),
  };
};

export const sanitizeServarrRecordArray = <T>(
  value: unknown,
  maximum = MAX_SERVARR_LIBRARY_RESULTS
): T[] =>
  (Array.isArray(value) ? value : []).slice(0, maximum).filter(isRecord) as T[];

export const sanitizeServarrProfiles = (value: unknown): QualityProfile[] =>
  (Array.isArray(value) ? value : [])
    .slice(0, MAX_SERVARR_CONFIGURATION_RESULTS)
    .flatMap((profile) => {
      if (!isRecord(profile) || !Number.isSafeInteger(profile.id)) {
        return [];
      }
      const name = boundedText(profile.name);
      const profileLanguage = profile.language;
      const language = isRecord(profileLanguage)
        ? boundedText(profileLanguage.name)
        : boundedText(profileLanguage);
      return name
        ? [
            {
              id: profile.id as number,
              name,
              ...(language ? { language } : {}),
            },
          ]
        : [];
    });

export const sanitizeServarrRootFolders = (value: unknown): RootFolder[] =>
  (Array.isArray(value) ? value : [])
    .slice(0, MAX_SERVARR_CONFIGURATION_RESULTS)
    .flatMap((folder) => {
      if (!isRecord(folder) || !Number.isSafeInteger(folder.id)) {
        return [];
      }
      const path = boundedText(folder.path);
      if (!path) {
        return [];
      }
      const finiteNumber = (number: unknown): number =>
        typeof number === 'number' && Number.isFinite(number) ? number : 0;
      return [
        {
          id: folder.id as number,
          path,
          freeSpace: finiteNumber(folder.freeSpace),
          totalSpace: finiteNumber(folder.totalSpace),
          accessible:
            typeof folder.accessible === 'boolean'
              ? folder.accessible
              : undefined,
          unmappedFolders: (Array.isArray(folder.unmappedFolders)
            ? folder.unmappedFolders
            : []
          )
            .slice(0, MAX_SERVARR_CONFIGURATION_RESULTS)
            .flatMap((unmapped) =>
              isRecord(unmapped)
                ? [
                    {
                      name: boundedText(unmapped.name),
                      path: boundedText(unmapped.path),
                    },
                  ]
                : []
            ),
        },
      ];
    });

export const sanitizeServarrTags = (value: unknown): Tag[] =>
  (Array.isArray(value) ? value : [])
    .slice(0, MAX_SERVARR_CONFIGURATION_RESULTS)
    .flatMap((tag) => {
      if (!isRecord(tag) || !Number.isSafeInteger(tag.id)) {
        return [];
      }
      const label = boundedText(tag.label);
      return label ? [{ id: tag.id as number, label }] : [];
    });

export const sanitizeServarrQueue = <T>(value: unknown): T[] =>
  (Array.isArray(value) ? value : [])
    .slice(0, MAX_SERVARR_QUEUE_RESULTS)
    .flatMap((item) => {
      if (!isRecord(item)) {
        return [];
      }
      const normalized = { ...item };
      for (const field of [
        'title',
        'timeleft',
        'estimatedCompletionTime',
        'status',
        'trackedDownloadStatus',
        'trackedDownloadState',
        'downloadId',
        'protocol',
        'downloadClient',
        'indexer',
      ]) {
        normalized[field] = boundedText(normalized[field]);
      }
      return [normalized as T];
    });

export const sanitizeServarrHistory = (
  value: unknown,
  maximum = MAX_SERVARR_LOOKUP_RESULTS
): ServarrHistoryItem[] =>
  sanitizeServarrRecordArray<Record<string, unknown>>(value, maximum).flatMap(
    (item) => {
      if (!Number.isSafeInteger(item.id)) {
        return [];
      }

      const historyItem: ServarrHistoryItem = { id: item.id as number };
      for (const field of [
        'movieId',
        'seriesId',
        'episodeId',
        'albumId',
        'bookId',
      ] as const) {
        if (Number.isSafeInteger(item[field])) {
          historyItem[field] = item[field] as number;
        }
      }
      if (
        typeof item.eventType === 'string' ||
        typeof item.eventType === 'number'
      ) {
        historyItem.eventType = item.eventType;
      }
      if (typeof item.date === 'string') {
        historyItem.date = boundedText(item.date);
      }
      if (typeof item.downloadId === 'string') {
        historyItem.downloadId = boundedText(item.downloadId);
      }
      return [historyItem];
    }
  );

const EXTERNAL_READ_ONLY =
  process.env.SEERR_EXTERNAL_READ_ONLY?.toLowerCase() === 'true' ||
  process.env.SEERR_EXTERNAL_READ_ONLY === '1';

export const normalizeConfiguredServiceUrl = (
  value: string,
  apiName: string
) => {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) {
      throw new Error('Service URL must be HTTP or HTTPS.');
    }

    url.username = '';
    url.password = '';
    return trimTrailingSlashes(url.toString());
  } catch (e) {
    throw new Error(`[${apiName}] Invalid configured service URL`, {
      cause: e,
    });
  }
};

class ServarrBase<QueueItemAppendT> extends ExternalAPI {
  static buildUrl(
    settings: Pick<DVRSettings, 'useSsl' | 'hostname' | 'port' | 'baseUrl'>,
    path?: string
  ): string {
    return buildServiceUrl({
      useSsl: settings.useSsl,
      hostname: settings.hostname,
      port: settings.port,
      urlBase: settings.baseUrl,
      path,
    });
  }

  protected apiName: string;
  private readonly requestParams: Record<string, unknown>;

  constructor({
    url,
    apiKey,
    cacheName,
    apiName,
    requestParams,
  }: {
    url: string;
    apiKey: string;
    cacheName: AvailableCacheIds;
    apiName: string;
    requestParams?: Record<string, unknown>;
  }) {
    const timeout = getExternalRuntimeConfig().network.apiRequestTimeout;
    const normalizedUrl = normalizeConfiguredServiceUrl(url, apiName);

    super(
      normalizedUrl,
      {},
      {
        allowPrivateAddresses: true,
        nodeCache: cacheManager.getCache(cacheName).data,
        timeout,
        headers: { 'X-Api-Key': apiKey },
      }
    );

    this.apiName = apiName;
    this.requestParams = requestParams ?? {};

    if (EXTERNAL_READ_ONLY) {
      this.axios.interceptors.request.use((config) => {
        const method = (config.method ?? 'get').toUpperCase();

        if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
          logger.warn('Blocked mutating Servarr request in read-only mode.', {
            label: this.apiName,
            method,
            url: config.url,
          });

          throw new Error(
            `[${this.apiName}] Mutating API request blocked by SEERR_EXTERNAL_READ_ONLY`
          );
        }

        return config;
      });
    }
  }

  public async getReleaseCalendar(
    start: string,
    end: string,
    includeUnmonitored = false,
    includeArtist = false,
    includeAuthor = false
  ): Promise<unknown[]> {
    const results = await this.get<unknown>(
      '/calendar',
      {
        params: {
          ...this.requestParams,
          start,
          end,
          unmonitored: includeUnmonitored,
          ...(includeArtist ? { includeArtist: true } : {}),
          ...(includeAuthor ? { includeAuthor: true } : {}),
        },
      },
      300
    );
    if (!Array.isArray(results) || results.length > 5000)
      throw new Error('Invalid release calendar response.');
    return results;
  }

  protected getRequestConfig(
    params?: Record<string, unknown>
  ): AxiosRequestConfig | undefined {
    const mergedParams = { ...this.requestParams, ...params };

    return Object.keys(mergedParams).length
      ? { params: mergedParams }
      : undefined;
  }

  public async getSystemStatus(): Promise<
    Pick<SystemStatus, 'appName' | 'version' | 'urlBase'>
  > {
    try {
      const response = await this.request<unknown>(
        'GET',
        '/system/status',
        undefined,
        this.getRequestConfig()
      );

      return sanitizeServarrSystemStatus(response.data);
    } catch (e) {
      throw new Error(
        `[${this.apiName}] Failed to retrieve system status: ${e.message}`,
        { cause: e }
      );
    }
  }

  public async getProfiles(
    options: { forceRefresh?: boolean } = {}
  ): Promise<QualityProfile[]> {
    try {
      const data = await this.getRolling<QualityProfile[]>(
        `/qualityProfile`,
        this.getRequestConfig(),
        options.forceRefresh ? 0 : 3600
      );

      return sanitizeServarrProfiles(data);
    } catch (e) {
      throw new Error(
        `[${this.apiName}] Failed to retrieve profiles: ${e.message}`,
        { cause: e }
      );
    }
  }

  public async getRootFolders(): Promise<RootFolder[]> {
    try {
      const data = await this.getRolling<RootFolder[]>(
        `/rootfolder`,
        this.getRequestConfig(),
        3600
      );

      return sanitizeServarrRootFolders(data);
    } catch (e) {
      throw new Error(
        `[${this.apiName}] Failed to retrieve root folders: ${e.message}`,
        { cause: e }
      );
    }
  }

  public async getQueue(
    maxRecords?: number
  ): Promise<(QueueItem & QueueItemAppendT)[]> {
    try {
      const maximum =
        maxRecords === undefined
          ? MAX_SERVARR_QUEUE_RESULTS
          : validateServarrDownloadQueueSize(maxRecords);
      return await this.getQueueSnapshot(
        Math.min(MAX_SERVARR_QUEUE_PAGE_SIZE, maximum),
        maximum,
        true,
        maxRecords !== undefined
      );
    } catch (e) {
      throw new Error(
        `[${this.apiName}] Failed to retrieve queue: ${e.message}`,
        { cause: e }
      );
    }
  }

  public async getHistory(pageSize = 250): Promise<ServarrHistoryItem[]> {
    try {
      const boundedPageSize = Math.min(Math.max(pageSize, 1), 1_000);
      const response = await this.request<{ records?: unknown[] }>(
        'GET',
        '/history',
        undefined,
        this.getRequestConfig({
          page: 1,
          pageSize: boundedPageSize,
          sortKey: 'date',
          sortDirection: 'descending',
        })
      );

      return sanitizeServarrHistory(response.data?.records, boundedPageSize);
    } catch (e) {
      throw new Error(
        `[${this.apiName}] Failed to retrieve history: ${e.message}`,
        { cause: e }
      );
    }
  }

  public async deleteQueueItem(
    queueId: number,
    options: {
      removeFromClient?: boolean;
      blocklist?: boolean;
      skipRedownload?: boolean;
      changeCategory?: boolean;
    } = {}
  ): Promise<void> {
    try {
      await this.request('DELETE', `/queue/${queueId}`, undefined, {
        ...this.getRequestConfig({
          removeFromClient: options.removeFromClient ?? true,
          blocklist: options.blocklist ?? true,
          skipRedownload: options.skipRedownload ?? false,
          changeCategory: options.changeCategory ?? false,
        }),
      });
    } catch (e) {
      throw new Error(
        `[${this.apiName}] Failed to remove queue item ${queueId}: ${e.message}`,
        { cause: e }
      );
    }
  }

  public getTags = async (): Promise<Tag[]> => {
    try {
      const response = await this.request<Tag[]>(
        'GET',
        `/tag`,
        undefined,
        this.getRequestConfig()
      );

      return sanitizeServarrTags(response.data);
    } catch (e) {
      throw new Error(
        `[${this.apiName}] Failed to retrieve tags: ${e.message}`,
        { cause: e }
      );
    }
  };

  public createTag = async ({ label }: { label: string }): Promise<Tag> => {
    try {
      const response = await this.request<Tag>(
        'POST',
        `/tag`,
        { label },
        this.getRequestConfig()
      );

      const tag = sanitizeServarrTags([response.data])[0];
      if (!tag) throw new Error('Servarr returned an invalid tag');
      return tag;
    } catch (e) {
      throw new Error(`[${this.apiName}] Failed to create tag: ${e.message}`, {
        cause: e,
      });
    }
  };

  public renameTag = async ({
    id,
    label,
  }: {
    id: number;
    label: string;
  }): Promise<Tag> => {
    try {
      const response = await this.request<Tag>(
        'PUT',
        `/tag/${id}`,
        {
          id,
          label,
        },
        this.getRequestConfig()
      );

      const tag = sanitizeServarrTags([response.data])[0];
      if (!tag) throw new Error('Servarr returned an invalid tag');
      return tag;
    } catch (e) {
      throw new Error(`[${this.apiName}] Failed to rename tag: ${e.message}`, {
        cause: e,
      });
    }
  };

  async refreshMonitoredDownloads(): Promise<void> {
    if (EXTERNAL_READ_ONLY) {
      logger.debug('Skipping monitored download refresh in read-only mode.', {
        label: this.apiName,
      });

      return;
    }

    let command = await this.runCommand('RefreshMonitoredDownloads', {});
    const deadline = Date.now() + SERVARR_COMMAND_TIMEOUT_MS;

    while (!SERVARR_TERMINAL_COMMAND_STATES.has(command.status)) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        throw new Error(
          `[${this.apiName}] Monitored download refresh did not finish within ${SERVARR_COMMAND_TIMEOUT_MS} ms.`
        );
      }

      await new Promise<void>((resolve) =>
        setTimeout(
          resolve,
          Math.min(SERVARR_COMMAND_POLL_INTERVAL_MS, remaining)
        )
      );
      command = await this.getCommand(command.id);
    }

    if (command.status !== 'completed' || command.result === 'unsuccessful') {
      const detail = command.exception || command.message;
      throw new Error(
        `[${this.apiName}] Monitored download refresh failed (${command.status})${detail ? `: ${detail}` : '.'}`
      );
    }
  }

  /** Read an uncapped, complete queue snapshot within the safety bound. */
  public async getInterventionQueue(): Promise<
    (QueueItem & QueueItemAppendT)[]
  > {
    return this.getQueueSnapshot(
      SERVARR_INTERVENTION_QUEUE_PAGE_SIZE,
      MAX_SERVARR_INTERVENTION_QUEUE_RESULTS,
      true
    );
  }

  private async getQueueSnapshot(
    pageSize: number,
    maximum: number,
    includeEpisode: boolean,
    allowCappedSnapshot = false
  ): Promise<(QueueItem & QueueItemAppendT)[]> {
    const records: (QueueItem & QueueItemAppendT)[] = [];
    const seen = new Set<number>();
    let expectedTotal: number | undefined;
    const maximumPages = Math.ceil(maximum / pageSize);

    for (let page = 1; page <= maximumPages; page++) {
      const response = await this.request<unknown>(
        'GET',
        '/queue',
        undefined,
        this.getRequestConfig({ includeEpisode, page, pageSize })
      );

      const data = response.data;
      const total = isRecord(data) ? data.totalRecords : undefined;
      if (
        typeof total !== 'number' ||
        !Number.isSafeInteger(total) ||
        total < 0 ||
        (total > maximum && !allowCappedSnapshot) ||
        !isRecord(data) ||
        !Array.isArray(data.records)
      ) {
        throw new Error(
          'Queue snapshot exceeds supported limits or is invalid.'
        );
      }

      if (expectedTotal !== undefined && total !== expectedTotal) {
        throw new Error('Queue changed while reading its pages.');
      }
      expectedTotal = total;

      const targetRecords = Math.min(total, maximum);
      const remaining = targetRecords - records.length;
      const expectedPageRecords = Math.min(pageSize, remaining);
      if (remaining < 0 || data.records.length !== expectedPageRecords) {
        throw new Error('Queue snapshot is incomplete.');
      }

      const items = sanitizeServarrQueue<QueueItem & QueueItemAppendT>(
        data.records
      );
      if (
        items.length !== data.records.length ||
        items.some(
          (item) =>
            !Number.isSafeInteger(item.id) || item.id <= 0 || seen.has(item.id)
        )
      ) {
        throw new Error('Queue snapshot contains invalid or repeated records.');
      }
      items.forEach((item) => {
        seen.add(item.id);
      });
      records.push(...items);
      if (records.length === targetRecords) {
        return records;
      }
    }

    throw new Error('Queue snapshot is incomplete.');
  }

  public async getManualImportCandidates(params: {
    folder: string;
    downloadId?: string;
    movieId?: number;
    seriesId?: number;
    artistId?: number;
    authorId?: number;
    filterExistingFiles?: boolean;
    replaceExistingFiles?: boolean;
  }): Promise<Record<string, unknown>[]> {
    const response = await this.request<unknown>(
      'GET',
      '/manualimport',
      undefined,
      this.getRequestConfig(params)
    );
    if (!Array.isArray(response.data) || response.data.length > 5000) {
      throw new Error('Invalid manual import response.');
    }
    return response.data.filter(
      (item): item is Record<string, unknown> =>
        !!item && typeof item === 'object' && !Array.isArray(item)
    );
  }

  public async importManualFiles(
    files: Record<string, unknown>[],
    importMode: 'copy' | 'move'
  ): Promise<ServarrCommand> {
    return this.runCommand('ManualImport', { files, importMode });
  }

  public async getCommand(commandId: number): Promise<ServarrCommand> {
    try {
      const response = await this.request<unknown>(
        'GET',
        `/command/${commandId}`,
        undefined,
        this.getRequestConfig()
      );
      return sanitizeServarrCommand(response.data);
    } catch (e) {
      throw new Error(`[${this.apiName}] Failed to get command: ${e.message}`, {
        cause: e,
      });
    }
  }

  protected async runCommand(
    commandName: string,
    options: Record<string, unknown>
  ): Promise<ServarrCommand> {
    try {
      const response = await this.request<unknown>(
        'POST',
        `/command`,
        {
          name: commandName,
          ...options,
        },
        this.getRequestConfig()
      );
      return sanitizeServarrCommand(response.data);
    } catch (e) {
      throw new Error(`[${this.apiName}] Failed to run command: ${e.message}`, {
        cause: e,
      });
    }
  }
}

export default ServarrBase;
