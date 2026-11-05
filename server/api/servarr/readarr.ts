import {
  normalizeOpenLibraryEditionId,
  normalizeOpenLibraryWorkId,
} from '@server/lib/externalIds';
import { normalizeIsbn, normalizeValidIsbn } from '@server/lib/isbn';
import logger from '@server/logger';
import {
  fetchSafeRemoteImage,
  MAX_SAFE_REMOTE_IMAGE_BYTES,
  normalizeSafeRasterImage,
} from '@server/utils/safeRemoteImage';
import { trimTrailingSlashes } from '@server/utils/serviceUrl';
import type { AxiosRequestConfig, AxiosResponse } from 'axios';
import axios from 'axios';
import { z } from 'zod';
import ServarrBase, {
  isServarrServiceUrl,
  MAX_SERVARR_CONFIGURATION_RESULTS,
  MAX_SERVARR_LIBRARY_RESPONSE_BYTES,
  MAX_SERVARR_LIBRARY_RESULTS,
  MAX_SERVARR_LOOKUP_RESULTS,
  sanitizeServarrImages,
  sanitizeServarrProfiles,
  sanitizeServarrRecordArray,
  sanitizeServarrSystemStatus,
  type ServarrCommand,
  type SystemStatus,
} from './base';

export interface ReadarrMetadataProfile {
  id: number;
  name: string;
}

export interface ReadarrDevelopmentConfig {
  id: number;
  metadataSource?: string;
}

export type ReadarrMediaType = 'ebook' | 'audiobook';
type ChaptarrDialect = 'hc' | 'gr';
interface ChaptarrIntegrationCapabilities {
  contract?: string;
  contractVersion?: number;
  providerIdDialect?: ChaptarrDialect;
  features?: {
    formatScopedFacade?: boolean;
    pagedLibrary?: boolean;
    providerScopedEditionIdentity?: boolean;
    pendingAuthorImports?: boolean;
    pendingImportCancellation?: boolean;
    restrictedServiceApiKey?: boolean;
    /** Wanted editions can be tracked alongside the current selection. */
    wantedEditionVariants?: boolean;
    /** Catalog-wide per-volume narrator comparison for a series. */
    seriesNarratorMatrix?: boolean;
    /** Edition catalog with narrator, production, and duration details. */
    editionCatalog?: boolean;
  };
}

export interface ChaptarrEditionCard {
  editionId: number;
  foreignEditionId?: string;
  title: string;
  language?: string;
  format?: string;
  isEbook: boolean;
  narrators: string[];
  production: 'solo' | 'full-cast' | 'unknown';
  abridged: 'abridged' | 'unabridged' | 'unknown';
  durationSeconds?: number;
  publisher?: string;
  releaseDate?: string;
  imageUrl?: string;
  sampleUrl?: string;
  editionLabel?: string;
  monitored: boolean;
  owned: boolean;
}

export interface ChaptarrNarratorMatrix {
  seriesId: number;
  seriesTitle: string;
  totalBooks: number;
  narrators: {
    name: string;
    production: 'solo' | 'full-cast' | 'unknown';
    coveredBookIds: number[];
    missingBookIds: number[];
    ownedBookIds: number[];
  }[];
  books: {
    bookId: number;
    title: string;
    position?: number;
    narrators: { name: string; editionId: number; owned: boolean }[];
  }[];
}
const CHAPTARR_REQUEST_TIMEOUT_MS = 60_000;
const CHAPTARR_LIBRARY_PAGE_SIZE = 500;

const seriesArtworkBooksSchema = z
  .array(
    z.object({
      title: z.string().max(2000),
      position: z.string().max(128).nullish(),
      images: z
        .array(
          z.object({
            url: z.string().max(2048),
            coverType: z.string().max(32).optional(),
          })
        )
        .max(50)
        .nullish()
        .catch(undefined),
    })
  )
  .max(5000)
  .nullish()
  .catch(undefined);

const nativeSeriesSchema = z
  .array(
    z.object({
      id: z.number().int().positive().safe(),
      title: z.string().max(2000),
      description: z.string().max(100000).nullish(),
      foreignSeriesId: z.string().max(256).nullish(),
      books: seriesArtworkBooksSchema,
      mediaType: z.enum(['ebook', 'audiobook']).optional(),
      links: z
        .array(
          z.object({
            bookId: z.number().int().positive().safe(),
            position: z.string().max(128).nullish(),
            seriesPosition: z.number().finite().optional(),
            isPrimary: z.boolean().optional(),
          })
        )
        .max(5000),
    })
  )
  .max(500);
export type ReadarrSeries = z.infer<typeof nativeSeriesSchema>[number];

export interface ReadarrBookLookupResult {
  id?: number;
  title: string;
  titleSlug?: string;
  foreignBookId: string;
  foreignEditionId?: string;
  mediaType?: ReadarrMediaType;
  audiobookMonitored?: boolean;
  ebookMonitored?: boolean;
  addOptions?: {
    searchForNewBook?: boolean;
  };
  authorId?: number;
  qualityProfileId?: number;
  metadataProfileId?: number;
  rootFolderPath?: string;
  monitored?: boolean;
  tags?: number[];
  authorTitle?: string;
  seriesTitle?: string;
  genres?: string[];
  subjects?: string[];
  languages?: string[];
  ratingsAverage?: number;
  ratingsCount?: number;
  releaseDate?: string;
  audiobookDuration?: number;
  audioSeconds?: number;
  durationSeconds?: number;
  narrators?: string[];
  author?: {
    foreignAuthorId?: string;
    authorName?: string;
    id?: number;
    rootFolderPath?: string;
    qualityProfileId?: number;
    metadataProfileId?: number;
    monitored?: boolean;
    monitorNewItems?: string;
    addOptions?: {
      monitor?: string;
      searchForMissingBooks?: boolean;
      booksToMonitor?: string[];
    };
    manualAdd?: boolean;
  };
  editions?: {
    foreignEditionId: string;
    title: string;
    isbn13?: string;
    asin?: string;
    monitored: boolean;
    audiobookDuration?: number;
    audioSeconds?: number;
    durationSeconds?: number;
    narrators?: string[];
    contributors?: { name?: string; role?: string }[];
  }[];
  images?: ReadarrBookImage[];
}

export interface ReadarrBookImage {
  coverType?: string;
  url?: string;
  remoteUrl?: string;
}

export interface ReadarrAuthorLookupResult {
  id?: number;
  foreignAuthorId: string;
  authorName: string;
  titleSlug?: string;
  remotePoster?: string;
  images?: ReadarrBookImage[];
}

export interface ReadarrMediaMoveAuthor {
  id: number;
  name: string;
  path: string;
  ebookPath?: string;
  audiobookPath?: string;
  bookFileCount: number;
}

export interface ReadarrMediaMoveFile {
  fileType: 'media' | 'metadata' | 'extra';
  sourcePath: string;
  destinationPath: string;
  status: 'ready' | 'missing' | 'alreadyAtDestination' | 'conflict';
  sourceExists: boolean;
  destinationExists: boolean;
  size: number;
}

export interface ReadarrMediaMoveAuthorPreview {
  authorId: number;
  authorName: string;
  format: ReadarrMediaType;
  sourcePath: string;
  destinationPath: string;
  mediaFileCount: number;
  sidecarFileCount: number;
  missingFileCount: number;
  alreadyAtDestinationCount: number;
  totalSize: number;
  requiredCopyBytes: number;
  availableSpace?: number;
  canMove: boolean;
  warnings: string[];
  conflicts: string[];
  files: ReadarrMediaMoveFile[];
}

export interface ReadarrMediaMoveBatchPreview {
  format: ReadarrMediaType;
  destinationRootPath: string;
  previewToken: string;
  authorCount: number;
  mediaFileCount: number;
  sidecarFileCount: number;
  missingFileCount: number;
  totalSize: number;
  requiredCopyBytes: number;
  availableSpace?: number;
  canMove: boolean;
  warnings: string[];
  conflicts: string[];
  authors: ReadarrMediaMoveAuthorPreview[];
}

export interface ReadarrMediaMoveCommand {
  id: number;
  name: string;
  status: string;
  message?: string;
  progress?: number;
  queued?: string;
  started?: string;
  ended?: string;
}

const MEDIA_MOVE_MAX_AUTHORS = 1_000;
const MEDIA_MOVE_MAX_FILES_PER_AUTHOR = 10_000;
const MEDIA_MOVE_MAX_TEXT = 4_096;
const boundedMediaMoveText = (value: unknown): string =>
  typeof value === 'string' ? value.slice(0, MEDIA_MOVE_MAX_TEXT) : '';
const mediaMoveInteger = (value: unknown): number =>
  Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : 0;

const sanitizeMediaMoveFile = (
  value: unknown
): ReadarrMediaMoveFile | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return undefined;
  const record = value as Record<string, unknown>;
  const fileType = record.fileType;
  const status = record.status;
  if (
    !['media', 'metadata', 'extra'].includes(String(fileType)) ||
    !['ready', 'missing', 'alreadyAtDestination', 'conflict'].includes(
      String(status)
    )
  )
    return undefined;
  const sourcePath = boundedMediaMoveText(record.sourcePath);
  const destinationPath = boundedMediaMoveText(record.destinationPath);
  if (!sourcePath || !destinationPath) return undefined;
  return {
    fileType: fileType as ReadarrMediaMoveFile['fileType'],
    sourcePath,
    destinationPath,
    status: status as ReadarrMediaMoveFile['status'],
    sourceExists: record.sourceExists === true,
    destinationExists: record.destinationExists === true,
    size: mediaMoveInteger(record.size),
  };
};

const sanitizeMediaMoveAuthorPreview = (
  value: unknown
): ReadarrMediaMoveAuthorPreview | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return undefined;
  const record = value as Record<string, unknown>;
  const authorId = mediaMoveInteger(record.authorId);
  const authorName = boundedMediaMoveText(record.authorName);
  const format = record.format;
  const sourcePath = boundedMediaMoveText(record.sourcePath);
  const destinationPath = boundedMediaMoveText(record.destinationPath);
  if (
    authorId <= 0 ||
    !authorName ||
    (format !== 'ebook' && format !== 'audiobook') ||
    !sourcePath ||
    !destinationPath
  )
    return undefined;
  const files = Array.isArray(record.files)
    ? record.files.slice(0, MEDIA_MOVE_MAX_FILES_PER_AUTHOR).flatMap((file) => {
        const sanitized = sanitizeMediaMoveFile(file);
        return sanitized ? [sanitized] : [];
      })
    : [];
  return {
    authorId,
    authorName,
    format,
    sourcePath,
    destinationPath,
    mediaFileCount: mediaMoveInteger(record.mediaFileCount),
    sidecarFileCount: mediaMoveInteger(record.sidecarFileCount),
    missingFileCount: mediaMoveInteger(record.missingFileCount),
    alreadyAtDestinationCount: mediaMoveInteger(
      record.alreadyAtDestinationCount
    ),
    totalSize: mediaMoveInteger(record.totalSize),
    requiredCopyBytes: mediaMoveInteger(record.requiredCopyBytes),
    ...(Number.isSafeInteger(record.availableSpace) &&
    Number(record.availableSpace) >= 0
      ? { availableSpace: Number(record.availableSpace) }
      : {}),
    canMove: record.canMove === true,
    warnings: Array.isArray(record.warnings)
      ? record.warnings
          .slice(0, 100)
          .flatMap((warning) =>
            typeof warning === 'string' ? [boundedMediaMoveText(warning)] : []
          )
      : [],
    conflicts: Array.isArray(record.conflicts)
      ? record.conflicts
          .slice(0, 100)
          .flatMap((conflict) =>
            typeof conflict === 'string' ? [boundedMediaMoveText(conflict)] : []
          )
      : [],
    files,
  };
};

export interface ReadarrEdition {
  foreignEditionId: string;
  title: string;
  isbn13?: string;
  asin?: string;
  monitored: boolean;
}

export interface ReadarrBookOptions extends ReadarrBookLookupResult {
  qualityProfileId: number;
  metadataProfileId: number;
  rootFolderPath: string;
  monitored: boolean;
  useRequestedEdition?: boolean;
  /** `alongside` tracks the requested edition as an additional variant. */
  editionPolicy?: 'only' | 'either' | 'alongside';
  tags?: number[];
  addOptions?: {
    searchForNewBook: boolean;
  };
}

export interface ReadarrBook extends ReadarrBookLookupResult {
  id: number;
  titleSlug?: string;
  added?: string;
  statistics?: {
    bookFileCount?: number;
    ebookFileCount?: number;
    audiobookFileCount?: number;
    totalBookCount?: number;
  };
}

export interface ReadarrBookPage {
  books: ReadarrBook[];
  totalCount: number;
}

export interface ReadarrBookFile {
  id: number;
  bookId: number;
  path?: string;
  relativePath?: string;
  size: number;
}

interface PagedReadarrBooksResponse {
  records?: unknown;
  totalCount?: unknown;
  offset?: unknown;
  pageSize?: unknown;
}

export interface ReadarrAddBookResult extends ReadarrBookLookupResult {
  createdBook: boolean;
  createdAuthor: boolean;
  pending?: true;
  pendingId?: number;
  message?: string;
}

export interface ReadarrPendingAuthorImport {
  id: number;
  status?: string;
  overallStatus?: string;
  ebookStatus?: string;
  audiobookStatus?: string;
  attemptCount?: number;
  maxAttempts?: number;
  nextAttemptAt?: string;
  lastError?: string;
}

type ReadarrQueueItem = {
  bookId?: number;
  book?: {
    id?: number;
  };
};

export interface ReadarrHistoryItem {
  id: number;
  bookId?: number;
  eventType?: string;
  date?: string;
  downloadId?: string;
}

export type ReadarrCoverImage = {
  imageBuffer: Buffer;
  contentType: string;
};

const getReadarrErrorMessage = (error: unknown): string => {
  if (!axios.isAxiosError(error)) {
    return error instanceof Error ? error.message : String(error);
  }

  const status = error.response?.status;
  const data = error.response?.data as
    { message?: unknown; errorMessage?: unknown } | undefined;
  const message =
    typeof data?.message === 'string'
      ? data.message
      : typeof data?.errorMessage === 'string'
        ? data.errorMessage
        : error.message;

  return status ? `${message} (status ${status})` : message;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const sanitizeReadarrBookFile = (
  value: unknown
): ReadarrBookFile | undefined => {
  if (!isRecord(value)) return undefined;
  const id = Number(value.id);
  const bookId = Number(value.bookId);
  if (
    !Number.isSafeInteger(id) ||
    id <= 0 ||
    !Number.isSafeInteger(bookId) ||
    bookId <= 0
  ) {
    return undefined;
  }
  const path =
    typeof value.path === 'string' ? value.path.slice(0, 10_000) : '';
  const relativePath =
    typeof value.relativePath === 'string'
      ? value.relativePath.slice(0, 10_000)
      : '';
  const size = Number(value.size);
  return {
    id,
    bookId,
    path: path || undefined,
    relativePath: relativePath || undefined,
    size: Number.isFinite(size) && size >= 0 ? size : 0,
  };
};

const isReadarrBookLookupResult = (
  value: unknown
): value is ReadarrBookLookupResult =>
  isRecord(value) &&
  typeof value.title === 'string' &&
  typeof value.foreignBookId === 'string';

const normalizeProviderIdentity = (
  value?: string,
  edition = false
): string | undefined => {
  if (!value?.trim()) return undefined;

  const openLibraryId = edition
    ? normalizeOpenLibraryEditionId(value)
    : normalizeOpenLibraryWorkId(value);
  return (openLibraryId ?? value).trim().toLowerCase();
};

export const matchesReadarrBookProviderIdentity = (
  book: ReadarrBookLookupResult,
  providerBookId: string,
  providerEditionId?: string
): boolean => {
  const normalizedBookId = normalizeProviderIdentity(providerBookId);
  const normalizedEditionId = normalizeProviderIdentity(
    providerEditionId,
    true
  );

  return (
    (!!normalizedBookId &&
      normalizeProviderIdentity(book.foreignBookId) === normalizedBookId) ||
    (!!normalizedEditionId &&
      (normalizeProviderIdentity(book.foreignEditionId, true) ===
        normalizedEditionId ||
        (book.editions ?? []).some(
          (edition) =>
            normalizeProviderIdentity(edition.foreignEditionId, true) ===
            normalizedEditionId
        )))
  );
};

class ReadarrAPI extends ServarrBase<ReadarrQueueItem> {
  private readonly nativeApiUrl: string;
  private readonly mediaType?: ReadarrMediaType;
  private coverBaseUrl: string;
  private requestBaseUrl?: string;
  private chaptarrDialect?: ChaptarrDialect;
  private chaptarrCapabilities?: ChaptarrIntegrationCapabilities;
  private detectedSystemStatus?: Pick<
    SystemStatus,
    'appName' | 'version' | 'urlBase'
  >;
  private providerDetection?: Promise<void>;

  constructor({
    url,
    apiKey,
    mediaType,
  }: {
    url: string;
    apiKey: string;
    mediaType?: ReadarrMediaType;
  }) {
    super({
      url,
      apiKey,
      cacheName: 'readarr',
      apiName: 'Readarr',
      requestParams: mediaType ? { mediaType } : undefined,
    });
    this.nativeApiUrl = trimTrailingSlashes(url);
    this.mediaType = mediaType;
    this.coverBaseUrl = ReadarrAPI.buildCoverBaseUrl(url);
  }

  private static isChaptarrStatus(status: { appName?: string }): boolean {
    return status.appName?.trim().toLowerCase() === 'chaptarr';
  }

  private static buildChaptarrFacadeUrl(
    apiUrl: string,
    mediaType: ReadarrMediaType,
    dialect: ChaptarrDialect
  ): string {
    try {
      const parsedUrl = new URL(apiUrl);
      const apiPath = parsedUrl.pathname.match(/^(.*)\/api\/v\d+\/?$/i);

      if (!apiPath) {
        return apiUrl;
      }

      parsedUrl.pathname = `${apiPath[1]}/readarr/${dialect}/${mediaType}/api/v1`;
      parsedUrl.search = '';
      parsedUrl.hash = '';
      return trimTrailingSlashes(parsedUrl.toString());
    } catch {
      return apiUrl;
    }
  }

  private async detectChaptarrCapabilities(): Promise<ChaptarrIntegrationCapabilities> {
    const legacyChaptarrFeatures = {
      formatScopedFacade: true,
      pagedLibrary: true,
      providerScopedEditionIdentity: true,
      pendingAuthorImports: true,
      pendingImportCancellation: true,
      restrictedServiceApiKey: false,
    };
    try {
      const response = await super.request<unknown>(
        'GET',
        '/system/capabilities',
        undefined,
        this.getRequestConfig()
      );
      const capabilities = response.data as
        ChaptarrIntegrationCapabilities | undefined;

      if (
        (capabilities?.contract === 'chaptarrng-seerr-bookshelf' ||
          capabilities?.contract === 'seerrng-bookshelf') &&
        capabilities.contractVersion === 1
      ) {
        return capabilities;
      }
    } catch {
      // Older Chaptarr builds have no explicit integration capability endpoint.
    }

    try {
      const response = await super.request<unknown>(
        'GET',
        '/config/hardcover',
        undefined,
        this.getRequestConfig()
      );

      if (
        response.data &&
        typeof response.data === 'object' &&
        !Array.isArray(response.data) &&
        typeof (response.data as Record<string, unknown>).enabled === 'boolean'
      ) {
        return {
          providerIdDialect: (response.data as Record<string, unknown>).enabled
            ? 'hc'
            : 'gr',
          features: legacyChaptarrFeatures,
        };
      }
    } catch {
      // Older Chaptarr builds do not expose the Hardcover config endpoint.
      // Their native compatibility scope defaults to Hardcover.
    }

    return {
      providerIdDialect: 'hc',
      features: legacyChaptarrFeatures,
    };
  }

  private async ensureProvider(): Promise<void> {
    if (!this.mediaType) {
      return;
    }

    if (this.providerDetection) {
      return this.providerDetection;
    }

    this.providerDetection = (async () => {
      const response = await super.request<unknown>(
        'GET',
        '/system/status',
        undefined,
        this.getRequestConfig()
      );
      const status = sanitizeServarrSystemStatus(response.data);
      this.detectedSystemStatus = status;

      if (this.mediaType && ReadarrAPI.isChaptarrStatus(status)) {
        this.axios.defaults.timeout = Math.max(
          this.axios.defaults.timeout ?? 0,
          CHAPTARR_REQUEST_TIMEOUT_MS
        );
        this.chaptarrCapabilities = await this.detectChaptarrCapabilities();
        this.chaptarrDialect =
          this.chaptarrCapabilities.providerIdDialect ?? 'hc';
        if (this.chaptarrCapabilities.features?.formatScopedFacade === true) {
          this.requestBaseUrl = ReadarrAPI.buildChaptarrFacadeUrl(
            this.nativeApiUrl,
            this.mediaType,
            this.chaptarrDialect
          );
        }
      } else if (this.mediaType) {
        // BookshelfNG retains Readarr's appName for API compatibility, so
        // identify its format facade from the explicit capability contract.
        try {
          const response = await super.request<unknown>(
            'GET',
            '/system/capabilities',
            undefined,
            this.getRequestConfig()
          );
          const capabilities = response.data as
            ChaptarrIntegrationCapabilities | undefined;

          if (
            capabilities?.contract === 'seerrng-bookshelf' &&
            capabilities.contractVersion === 1
          ) {
            this.chaptarrCapabilities = capabilities;
            if (
              capabilities.providerIdDialect === 'hc' ||
              capabilities.providerIdDialect === 'gr'
            ) {
              this.chaptarrDialect = capabilities.providerIdDialect;
            }
            if (capabilities.features?.formatScopedFacade === true) {
              this.requestBaseUrl = ReadarrAPI.buildChaptarrFacadeUrl(
                this.nativeApiUrl,
                this.mediaType,
                this.chaptarrDialect ?? 'hc'
              );
            }
          }
        } catch {
          // Older BookshelfNG releases continue to use the standard Readarr routes.
        }
      }
    })();

    try {
      await this.providerDetection;
    } catch (error) {
      this.providerDetection = undefined;
      throw error;
    }
  }

  public override async getSystemStatus(): Promise<
    Pick<SystemStatus, 'appName' | 'version' | 'urlBase'>
  > {
    if (!this.mediaType) {
      return super.getSystemStatus();
    }

    try {
      await this.ensureProvider();
      return this.detectedSystemStatus as Pick<
        SystemStatus,
        'appName' | 'version' | 'urlBase'
      >;
    } catch (e) {
      throw new Error(
        `[Readarr] Failed to retrieve system status: ${getReadarrErrorMessage(e)}`,
        { cause: e }
      );
    }
  }

  protected override async request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    endpoint: string,
    data?: unknown,
    config?: AxiosRequestConfig
  ): Promise<AxiosResponse<T>> {
    await this.ensureProvider();

    return super.request(
      method,
      endpoint,
      data,
      this.requestBaseUrl && !config?.baseURL
        ? { ...config, baseURL: this.requestBaseUrl }
        : config
    );
  }

  private isChaptarr(): boolean {
    return ReadarrAPI.isChaptarrStatus(this.detectedSystemStatus ?? {});
  }

  private static hasAddressableLookupIdentity(
    result: ReadarrBookLookupResult
  ): boolean {
    return (
      !!result.foreignBookId?.trim() &&
      !!result.author?.foreignAuthorId?.trim() &&
      (result.editions ?? []).some(
        (edition) => !!edition.foreignEditionId?.trim()
      )
    );
  }

  private getMediaMonitoringFields(
    monitored: boolean
  ): Record<string, boolean> {
    if (this.mediaType === 'audiobook') {
      return { audiobookMonitored: monitored };
    }

    if (this.mediaType === 'ebook') {
      return { ebookMonitored: monitored };
    }

    return {};
  }

  private isBookMonitored(book: ReadarrBookLookupResult): boolean {
    const mediaSpecificMonitoring =
      this.mediaType === 'audiobook'
        ? book.audiobookMonitored
        : this.mediaType === 'ebook'
          ? book.ebookMonitored
          : undefined;

    return typeof mediaSpecificMonitoring === 'boolean'
      ? mediaSpecificMonitoring
      : book.monitored === true;
  }

  private async resolveBookMutationResult(
    result: ReadarrBookLookupResult | number,
    fallback: ReadarrBookLookupResult
  ): Promise<ReadarrBookLookupResult> {
    if (typeof result !== 'number') {
      return result;
    }

    return this.getFreshBook(result).catch(() => ({
      ...fallback,
      id: result,
    }));
  }

  private async getFreshBook(bookId: number): Promise<ReadarrBook> {
    const response = await this.request<ReadarrBook>(
      'GET',
      `/book/${bookId}`,
      undefined,
      this.getRequestConfig()
    );
    return response.data;
  }

  public async getBookHistory(bookId: number): Promise<ReadarrHistoryItem[]> {
    const response = await this.request<{
      records?: ReadarrHistoryItem[];
    }>(
      'GET',
      '/history',
      undefined,
      this.getRequestConfig({
        page: 1,
        pageSize: 100,
        sortKey: 'date',
        sortDirection: 'descending',
        bookId,
      })
    );
    return sanitizeServarrRecordArray<ReadarrHistoryItem>(
      response.data?.records,
      100
    );
  }

  public async getBooksByAuthor(
    authorId: number,
    cacheTtl?: number
  ): Promise<ReadarrBook[]> {
    return sanitizeServarrRecordArray<ReadarrBook>(
      await this.get<ReadarrBook[]>(
        '/book',
        {
          ...this.getRequestConfig({ authorId }),
        },
        cacheTtl
      ),
      MAX_SERVARR_LIBRARY_RESULTS
    );
  }

  public async removeAuthor(
    authorId: number,
    options: { deleteFiles?: boolean; addImportListExclusion?: boolean } = {}
  ): Promise<void> {
    await this.request(
      'DELETE',
      `/author/${authorId}`,
      undefined,
      this.getRequestConfig({
        deleteFiles: options.deleteFiles ?? false,
        addImportListExclusion: options.addImportListExclusion ?? false,
      })
    );
  }

  private async ensureRequestedBookState(
    addedBook: ReadarrBookLookupResult,
    options: ReadarrBookOptions
  ): Promise<ReadarrBookLookupResult> {
    if (
      !this.isChaptarr() ||
      !this.mediaType ||
      !options.monitored ||
      !addedBook.id
    ) {
      return addedBook;
    }

    const observedBook = await this.getFreshBook(addedBook.id).catch(
      () => addedBook
    );
    const needsMonitoringRepair = !this.isBookMonitored(observedBook);
    const needsSearchRepair =
      options.addOptions?.searchForNewBook === true &&
      observedBook.addOptions?.searchForNewBook !== true;

    if (!needsMonitoringRepair && !needsSearchRepair) {
      return observedBook;
    }

    const updatedBookResponse = await this.request<
      ReadarrBookLookupResult | number
    >(
      'PUT',
      `/book/${addedBook.id}`,
      {
        id: addedBook.id,
        mediaType: this.mediaType,
        monitored: true,
        ...this.getMediaMonitoringFields(true),
        ...(options.addOptions?.searchForNewBook
          ? {
              addOptions: {
                ...(observedBook.addOptions ?? {}),
                searchForNewBook: true,
              },
            }
          : {}),
      },
      this.getRequestConfig()
    );
    const updatedBook = await this.resolveBookMutationResult(
      updatedBookResponse.data,
      {
        ...addedBook,
        monitored: true,
        ...this.getMediaMonitoringFields(true),
        ...(options.addOptions?.searchForNewBook
          ? { addOptions: options.addOptions }
          : {}),
      }
    );

    if (options.addOptions?.searchForNewBook) {
      await this.post(
        '/command',
        {
          name: 'BookSearch',
          bookIds: [updatedBook.id ?? addedBook.id],
        },
        this.getRequestConfig()
      );
    }

    return updatedBook;
  }

  private static buildCoverBaseUrl(url: string): string {
    const parsedUrl = new URL(url);
    parsedUrl.pathname = parsedUrl.pathname.replace(/\/api\/v\d+\/?$/i, '');
    parsedUrl.search = '';
    parsedUrl.hash = '';

    return parsedUrl.toString().replace(/\/$/, '');
  }

  private buildCoverUrl(path: string): string | undefined {
    if (!path.startsWith('/') || path.includes('://')) {
      return undefined;
    }

    return `${this.coverBaseUrl}${path}`;
  }

  private buildRemoteCoverUrl(url: string): string | undefined {
    if (url.length > 2_048) {
      return undefined;
    }

    try {
      const parsedUrl = new URL(url);

      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        return undefined;
      }

      return parsedUrl.toString();
    } catch {
      return undefined;
    }
  }

  public async getMetadataProfiles(): Promise<ReadarrMetadataProfile[]> {
    try {
      return sanitizeServarrProfiles(
        await this.get<ReadarrMetadataProfile[]>(
          '/metadataProfile',
          this.getRequestConfig()
        )
      );
    } catch (e) {
      throw new Error(
        `[Readarr] Failed to retrieve metadata profiles: ${e.message}`,
        { cause: e }
      );
    }
  }

  public async getDevelopmentConfig(): Promise<ReadarrDevelopmentConfig> {
    try {
      const response = await this.get<unknown>(
        '/config/development',
        this.getRequestConfig()
      );
      if (
        !response ||
        typeof response !== 'object' ||
        Array.isArray(response)
      ) {
        return { id: 0 };
      }
      const record = response as Record<string, unknown>;
      return {
        id: Number.isSafeInteger(record.id) ? (record.id as number) : 0,
        metadataSource:
          typeof record.metadataSource === 'string'
            ? record.metadataSource.slice(0, 10_000)
            : undefined,
      };
    } catch (e) {
      throw new Error(
        `[Readarr] Failed to retrieve development config: ${e.message}`,
        { cause: e }
      );
    }
  }

  private static matchesExistingBook(
    book: ReadarrBookLookupResult,
    options: ReadarrBookOptions
  ): boolean {
    const normalizedForeignBookId = options.foreignBookId
      ? normalizeOpenLibraryWorkId(options.foreignBookId)
      : undefined;
    const optionEditionIds = new Set(
      options.editions
        ?.map((edition) =>
          edition.foreignEditionId
            ? normalizeOpenLibraryEditionId(edition.foreignEditionId)
            : undefined
        )
        .filter(Boolean)
    );
    const optionIsbns = new Set(
      options.editions
        ?.map((edition) => normalizeIsbn(edition.isbn13))
        .filter(Boolean)
    );

    if (
      book.foreignBookId &&
      normalizedForeignBookId &&
      normalizeOpenLibraryWorkId(book.foreignBookId) === normalizedForeignBookId
    ) {
      return true;
    }

    return (
      book.editions?.some((edition) => {
        const editionIsbn = normalizeIsbn(edition.isbn13);

        return (
          (!!edition.foreignEditionId &&
            optionEditionIds.has(
              normalizeOpenLibraryEditionId(edition.foreignEditionId)
            )) ||
          (!!editionIsbn && optionIsbns.has(editionIsbn))
        );
      }) ?? false
    );
  }

  private async findExistingBookForAdd(
    options: ReadarrBookOptions
  ): Promise<ReadarrBook | undefined> {
    if (this.isChaptarr()) {
      // Chaptarr's POST /book is provider-aware and resolves existing local
      // rows in its indexed database. Only use a positive ID already returned
      // by a lookup as a targeted read; never scan the whole library here.
      const bookId = options.id;
      if (
        typeof bookId !== 'number' ||
        !Number.isSafeInteger(bookId) ||
        bookId <= 0
      ) {
        return undefined;
      }

      try {
        const existingBook = await this.getBook(bookId);
        return ReadarrAPI.matchesExistingBook(existingBook, options)
          ? existingBook
          : undefined;
      } catch (error) {
        logger.debug(
          'Chaptarr targeted existing-book lookup failed; letting the provider resolve the add.',
          {
            label: 'Readarr',
            bookId,
            errorMessage:
              error instanceof Error ? error.message : String(error),
          }
        );
        return undefined;
      }
    }

    const existingBooks = sanitizeServarrRecordArray<ReadarrBook>(
      await this.get<ReadarrBook[]>('/book', {
        ...this.getRequestConfig(),
        maxContentLength: MAX_SERVARR_LIBRARY_RESPONSE_BYTES,
      }),
      MAX_SERVARR_LIBRARY_RESULTS
    );

    return existingBooks.find((book) =>
      ReadarrAPI.matchesExistingBook(book, options)
    );
  }

  private async getChaptarrBooks(): Promise<ReadarrBook[]> {
    if (this.chaptarrCapabilities?.features?.pagedLibrary !== true) {
      return sanitizeServarrRecordArray<ReadarrBook>(
        await this.get<ReadarrBook[]>('/book', {
          ...this.getRequestConfig(),
          maxContentLength: MAX_SERVARR_LIBRARY_RESPONSE_BYTES,
        }),
        MAX_SERVARR_LIBRARY_RESULTS
      );
    }

    const books: ReadarrBook[] = [];
    let offset = 0;
    let reportedTotalCount: number | undefined;

    while (books.length < MAX_SERVARR_LIBRARY_RESULTS) {
      const response = await this.get<unknown>(
        '/book/paged',
        this.getRequestConfig({
          offset,
          pageSize: CHAPTARR_LIBRARY_PAGE_SIZE,
          includeUnmonitored: true,
        })
      );
      if (
        !response ||
        typeof response !== 'object' ||
        Array.isArray(response) ||
        !Array.isArray((response as PagedReadarrBooksResponse).records)
      ) {
        throw new Error('Chaptarr returned an invalid paged library response');
      }

      const payload = response as PagedReadarrBooksResponse;
      const responsePageSize =
        typeof payload.pageSize === 'number' &&
        Number.isSafeInteger(payload.pageSize) &&
        payload.pageSize > 0
          ? payload.pageSize
          : CHAPTARR_LIBRARY_PAGE_SIZE;
      const responseOffset =
        typeof payload.offset === 'number' &&
        Number.isSafeInteger(payload.offset) &&
        payload.offset >= 0
          ? payload.offset
          : offset;
      if (responseOffset !== offset) {
        throw new Error(
          `Chaptarr returned offset ${responseOffset} when SeerrNG requested ${offset}`
        );
      }
      const totalCount =
        typeof payload.totalCount === 'number' &&
        Number.isSafeInteger(payload.totalCount) &&
        payload.totalCount >= 0
          ? payload.totalCount
          : undefined;
      if (totalCount !== undefined) {
        reportedTotalCount = totalCount;
      }
      const page = sanitizeServarrRecordArray<ReadarrBook>(
        payload.records,
        Math.min(
          CHAPTARR_LIBRARY_PAGE_SIZE,
          MAX_SERVARR_LIBRARY_RESULTS - books.length
        )
      );

      if (page.length === 0) {
        if (totalCount !== undefined && responseOffset < totalCount) {
          throw new Error(
            `Chaptarr returned an empty page before the reported library total of ${totalCount}`
          );
        }
        break;
      }

      books.push(...page);
      const nextOffset = responseOffset + page.length;

      if (nextOffset <= offset) {
        throw new Error('Chaptarr returned a non-advancing library page');
      }

      if (totalCount !== undefined && nextOffset >= totalCount) {
        break;
      }

      if (totalCount === undefined && page.length < responsePageSize) {
        break;
      }

      offset = nextOffset;
    }

    if (
      books.length >= MAX_SERVARR_LIBRARY_RESULTS &&
      (reportedTotalCount === undefined || reportedTotalCount > books.length)
    ) {
      throw new Error(
        `Chaptarr library scan reached the ${MAX_SERVARR_LIBRARY_RESULTS}-book safety limit before confirming the library was complete`
      );
    }

    return books;
  }

  /** Series resources use the native API; Chaptarr's facade only normalizes books. */
  public async getSeriesByAuthor(
    authorId: number
  ): Promise<ReadarrSeries[] | undefined> {
    if (!Number.isSafeInteger(authorId) || authorId <= 0)
      throw new Error('Invalid author ID.');
    try {
      // Cached native resources must not skip backend capability detection on
      // a fresh client; management links depend on the detected provider.
      await this.ensureProvider();
      const response = await this.get<unknown>(
        '/series',
        {
          ...this.getRequestConfig(),
          baseURL: this.nativeApiUrl,
          params: {
            authorId,
            ...(this.mediaType ? { mediaType: this.mediaType } : {}),
          },
        },
        300
      );
      return nativeSeriesSchema
        .parse(response)
        .filter(
          (series) => !series.mediaType || series.mediaType === this.mediaType
        );
    } catch (error) {
      const status = (error as { response?: { status?: number } }).response
        ?.status;
      if (status === 404 || status === 405 || status === 501) return undefined;
      throw new Error('Book server series metadata is unavailable.', {
        cause: error,
      });
    }
  }

  /** Native library inventory, independent of SeerrNG book identity bindings. */
  public async getNativeSeriesLibrary() {
    await this.ensureProvider();
    const authors = z
      .array(z.object({ id: z.number().int().positive().safe() }))
      .max(MAX_SERVARR_LIBRARY_RESULTS)
      .parse(
        await this.get<unknown>(
          '/author',
          {
            ...this.getRequestConfig(),
            baseURL: this.nativeApiUrl,
          },
          300
        )
      );
    const ids = [...new Set(authors.map((author) => author.id))].sort(
      (a, b) => a - b
    );
    const results = new Map<
      number,
      { series: ReadarrSeries; authorId: number }
    >();
    let supported = ids.length === 0,
      failed = false;
    for (let offset = 0; offset < Math.min(ids.length, 250); offset += 5) {
      const batch = await Promise.allSettled(
        ids.slice(offset, Math.min(offset + 5, 250)).map(async (authorId) => ({
          authorId,
          series: await this.getSeriesByAuthor(authorId),
        }))
      );
      for (const result of batch) {
        if (result.status === 'rejected') {
          failed = true;
          continue;
        }
        if (!result.value.series) continue;
        supported = true;
        for (const series of result.value.series) {
          if (!results.has(series.id))
            results.set(series.id, { series, authorId: result.value.authorId });
        }
      }
      // A missing series capability is independent of author; avoid scanning all authors.
      if (offset === 0 && !supported) break;
    }
    return {
      entries: [...results.values()],
      supported,
      partial: failed,
      truncated: ids.length > 250,
    };
  }

  /** Catalog lookup is a backend capability; provider credentials stay there. */
  public async searchSeriesCatalog(query: string) {
    await this.ensureProvider();
    if (!this.isChaptarr()) return undefined;
    const response = await this.get<unknown>(
      '/search',
      {
        ...this.getRequestConfig(),
        baseURL: this.nativeApiUrl,
        params: { term: query },
      },
      300
    );
    const rows = z
      .array(
        z.object({
          foreignId: z.string().max(256).nullish(),
          series: z
            .object({
              foreignSeriesId: z.string().max(256).nullish(),
              title: z.string().max(2000),
              description: z.string().max(100000).nullish(),
              workCount: z.number().int().nonnegative().optional(),
            })
            .nullish(),
        })
      )
      .max(500)
      .parse(response);
    return rows.flatMap((row) => {
      if (!row.series) return [];
      const providerId = row.foreignId ?? row.series.foreignSeriesId;
      // Only identifiers supported by Chaptarr's series/lookup are previewable.
      if (!providerId || !/^hc:[1-9]\d*$/.test(providerId)) return [];
      return [
        {
          providerId,
          title: row.series.title,
          description: row.series.description ?? undefined,
          bookCount: row.series.workCount,
        },
      ];
    });
  }

  /** Resolve work identities through the native backend, never a facade or title search. */
  public async getCatalogBookIdentity(providerId: string) {
    if (!/^hc:[1-9]\d*$/.test(providerId)) return undefined;
    await this.ensureProvider();
    if (!this.isChaptarr()) return undefined;
    const response = await this.get<unknown>(
      '/book/lookup',
      {
        ...this.getRequestConfig({ term: providerId }),
        baseURL: this.nativeApiUrl,
      },
      300
    );
    const rows = z
      .array(
        z.object({
          foreignBookId: z.string().max(256).nullish(),
          hardcoverBookId: z.string().max(256).nullish(),
          openLibraryWorkId: z.string().max(256).nullish(),
          mediaType: z.enum(['ebook', 'audiobook']).optional(),
          editions: z
            .array(z.object({ isbn13: z.string().max(64).nullish() }))
            .max(5000)
            .nullish(),
        })
      )
      .max(100)
      .parse(response);
    if (!rows.length) return undefined;
    if (
      rows.some(
        (row) =>
          (row.foreignBookId !== providerId &&
            row.hardcoverBookId !== providerId &&
            `hc:${row.hardcoverBookId}` !== providerId) ||
          (row.mediaType && row.mediaType !== this.mediaType)
      )
    ) {
      throw new Error(
        'Catalog book identity does not match the requested work and format.'
      );
    }
    return {
      workIds: [
        ...new Set(
          rows.flatMap((row) =>
            row.openLibraryWorkId
              ? [row.openLibraryWorkId.replace(/^ol:/, '')]
              : []
          )
        ),
      ],
      isbns: [
        ...new Set(
          rows.flatMap((row) =>
            (row.editions ?? []).flatMap((edition) =>
              edition.isbn13 ? [edition.isbn13] : []
            )
          )
        ),
      ],
    };
  }

  public async getSeriesCatalogPreview(
    providerId: string,
    includeBookIdentifiers = true
  ) {
    if (!/^hc:[1-9]\d*$/.test(providerId))
      throw new Error('Invalid series catalog ID.');
    await this.ensureProvider();
    if (!this.isChaptarr()) return undefined;
    const response = await this.get<unknown>(
      '/series/lookup',
      {
        ...this.getRequestConfig(),
        baseURL: this.nativeApiUrl,
        params: { foreignSeriesId: providerId, includeBookIdentifiers },
      },
      300
    );
    return z
      .object({
        foreignSeriesId: z.literal(providerId),
        title: z.string().max(2000),
        description: z.string().max(100000).nullish(),
        workCount: z.number().int().nonnegative(),
        books: z
          .array(
            z.object({
              foreignBookId: z.string().max(256),
              isbns: z.array(z.string().max(64)).max(400).nullish(),
              identifiersComplete: z.boolean().nullish(),
              title: z.string().max(2000),
              authorName: z.string().max(2000).nullish(),
              position: z.string().max(128).nullish(),
              images: z
                .array(
                  z.object({
                    url: z.string().max(2048),
                    coverType: z.string().max(32).optional(),
                  })
                )
                .max(50)
                .nullish()
                .catch(undefined),
            })
          )
          .max(600),
      })
      .parse(response);
  }

  /** Only fetch backend-owned artwork paths; never accept an arbitrary image URL. */
  public async getSeriesCoverImage(path: string): Promise<ReadarrCoverImage> {
    if (
      !/^\/(?:MediaCoverProxy\/[a-f0-9]{32,128}\/[A-Za-z0-9_.-]+|MediaCover\/\d+\/(?:cover|poster)\.(?:jpg|jpeg|png|webp))$/i.test(
        path
      )
    )
      throw new Error('Invalid series cover path.');
    const response = await this.axios.get<ArrayBuffer>(
      `${this.nativeApiUrl}${path}`,
      {
        responseType: 'arraybuffer',
        maxRedirects: 0,
        timeout: 10000,
        maxContentLength: 5 * 1024 * 1024,
        headers: { Accept: 'image/*' },
      }
    );
    const contentType = String(response.headers['content-type'] ?? '')
      .split(';')[0]
      .toLowerCase();
    if (
      ![
        'image/jpeg',
        'image/png',
        'image/webp',
        'image/gif',
        'image/avif',
      ].includes(contentType)
    )
      throw new Error('Invalid series cover content type.');
    return { imageBuffer: Buffer.from(response.data), contentType };
  }

  public async getSeriesWatchCapabilities() {
    await this.ensureProvider();
    if (!this.isChaptarr()) return undefined;
    try {
      const value = await this.get<unknown>(
        '/series/watch/capabilities',
        {
          ...this.getRequestConfig(),
          baseURL: this.nativeApiUrl,
        },
        0
      );
      return z
        .object({
          version: z.literal(1),
          futureBooks: z.literal(true),
          providers: z.array(z.enum(['hc', 'gr'])),
        })
        .parse(value);
    } catch (error) {
      if (
        axios.isAxiosError(error) &&
        [404, 405].includes(error.response?.status ?? 0)
      )
        return undefined;
      throw error;
    }
  }

  public async getSeriesWatch(providerId: string) {
    const value = await this.get<unknown>(
      '/series/watch',
      {
        ...this.getRequestConfig(),
        baseURL: this.nativeApiUrl,
        params: { providerId, mediaType: this.mediaType },
      },
      0
    );
    return z
      .object({
        enabled: z.boolean(),
        watchId: z
          .number()
          .int()
          .positive()
          .nullish()
          .transform((value) => value ?? null),
        includeExtras: z.boolean().optional(),
      })
      .parse(value);
  }

  public async setSeriesWatch(
    providerId: string,
    options: {
      enabled: boolean;
      includeExtras: boolean;
      rootFolder: string;
      qualityProfileId: number;
      metadataProfileId: number;
      searchForMissing: boolean;
    }
  ) {
    const response = await this.request<unknown>(
      'PUT',
      '/series/watch',
      {
        ...options,
        providerId,
        mediaType: this.mediaType,
      },
      { ...this.getRequestConfig(), baseURL: this.nativeApiUrl }
    );
    return z
      .object({
        enabled: z.boolean(),
        watchId: z
          .number()
          .int()
          .positive()
          .nullish()
          .transform((value) => value ?? null),
        includeExtras: z.boolean().optional(),
      })
      .parse(response.data);
  }

  public getSeriesManagementPath(seriesId: number): string | undefined {
    return this.isChaptarr() && Number.isSafeInteger(seriesId) && seriesId > 0
      ? `/series/${seriesId}`
      : undefined;
  }

  /** Reads local membership only; this does not add or monitor any books. */
  public async getNativeSeriesBook(bookId: number, includeEditions = false) {
    if (!Number.isSafeInteger(bookId) || bookId <= 0)
      throw new Error('Invalid book ID.');
    const response = await this.get<unknown>(
      `/book/${bookId}`,
      { ...this.getRequestConfig(), baseURL: this.nativeApiUrl },
      300
    );
    const result = z
      .object({
        id: z.number().int().positive().safe(),
        title: z.string().max(2000),
        authorId: z.number().int().positive().safe().optional(),
        author: z.object({ id: z.number().int().positive().safe() }).nullish(),
        mediaType: z.enum(['ebook', 'audiobook']).optional(),
        editions: z
          .array(z.object({ isbn13: z.string().max(64).nullish() }))
          .max(5000)
          .nullish(),
      })
      .parse(response);
    if (
      result.id !== bookId ||
      typeof result.title !== 'string' ||
      (result.mediaType && result.mediaType !== this.mediaType)
    )
      throw new Error('Invalid book server member.');
    // Chaptarr omits editions from native book resources. Keep discovery cheap,
    // but load exact native edition membership when resolving request identities.
    if (includeEditions && !result.editions?.length) {
      try {
        const response = await this.get<unknown>(
          '/edition',
          {
            ...this.getRequestConfig({ bookId }),
            baseURL: this.nativeApiUrl,
          },
          300
        );
        const editions = z
          .array(
            z.object({
              bookId: z.literal(bookId),
              isbn13: z.string().max(64).nullish(),
            })
          )
          .max(5000)
          .parse(response);
        result.editions = editions.map(({ isbn13 }) => ({ isbn13 }));
      } catch (error) {
        const status = (error as { response?: { status?: number } }).response
          ?.status;
        if (status !== 404 && status !== 405 && status !== 501)
          throw new Error('Book server edition metadata is unavailable.', {
            cause: error,
          });
      }
    }
    return result;
  }

  public async getBooks(): Promise<ReadarrBook[]> {
    try {
      await this.ensureProvider();

      if (this.isChaptarr()) {
        return await this.getChaptarrBooks();
      }

      return sanitizeServarrRecordArray<ReadarrBook>(
        await this.get<ReadarrBook[]>('/book', {
          ...this.getRequestConfig(),
          maxContentLength: MAX_SERVARR_LIBRARY_RESPONSE_BYTES,
        }),
        MAX_SERVARR_LIBRARY_RESULTS
      );
    } catch (e) {
      throw new Error(`[Readarr] Failed to retrieve books: ${e.message}`, {
        cause: e,
      });
    }
  }

  public async getBooksPage(
    offset: number,
    pageSize: number
  ): Promise<ReadarrBookPage> {
    const safeOffset = Math.max(0, Math.floor(offset));
    const safePageSize = Math.min(Math.max(1, Math.floor(pageSize)), 200);

    try {
      await this.ensureProvider();
      if (
        this.isChaptarr() &&
        this.chaptarrCapabilities?.features?.pagedLibrary !== true
      ) {
        const books = await this.getBooks();
        return {
          books: books.slice(safeOffset, safeOffset + safePageSize),
          totalCount: books.length,
        };
      }
      const payload = await this.get<unknown>(
        '/book/paged',
        this.getRequestConfig({
          offset: safeOffset,
          pageSize: safePageSize,
          includeUnmonitored: true,
        }),
        0
      );

      if (
        !isRecord(payload) ||
        !Array.isArray(payload.records) ||
        !Number.isSafeInteger(payload.totalCount) ||
        Number(payload.totalCount) < 0 ||
        (payload.offset !== undefined && payload.offset !== safeOffset)
      ) {
        throw new Error('Readarr returned an invalid paged library response.');
      }

      return {
        books: sanitizeServarrRecordArray<ReadarrBook>(
          payload.records,
          safePageSize
        ),
        totalCount: Number(payload.totalCount),
      };
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        const books = await this.getBooks();
        return {
          books: books.slice(safeOffset, safeOffset + safePageSize),
          totalCount: books.length,
        };
      }

      throw new Error(
        `[Readarr] Failed to retrieve a book page: ${getReadarrErrorMessage(error)}`,
        {
          cause: error,
        }
      );
    }
  }

  public async getMediaMoveAuthors(): Promise<ReadarrMediaMoveAuthor[]> {
    await this.ensureProvider();
    const response = await this.request<unknown>(
      'GET',
      '/author',
      undefined,
      this.getRequestConfig()
    );
    return sanitizeServarrRecordArray<Record<string, unknown>>(
      response.data,
      MAX_SERVARR_LIBRARY_RESULTS
    ).flatMap((record) => {
      const id = mediaMoveInteger(record.id);
      const name = boundedMediaMoveText(record.authorName ?? record.name);
      const path = boundedMediaMoveText(record.path);
      const statistics =
        record.statistics &&
        typeof record.statistics === 'object' &&
        !Array.isArray(record.statistics)
          ? (record.statistics as Record<string, unknown>)
          : {};
      if (id <= 0 || !name) return [];
      return [
        {
          id,
          name,
          path,
          ...(typeof record.ebookPath === 'string' && record.ebookPath
            ? { ebookPath: boundedMediaMoveText(record.ebookPath) }
            : {}),
          ...(typeof record.audiobookPath === 'string' && record.audiobookPath
            ? { audiobookPath: boundedMediaMoveText(record.audiobookPath) }
            : {}),
          bookFileCount: mediaMoveInteger(statistics.bookFileCount),
        },
      ];
    });
  }

  public async previewMediaMoveBatch(options: {
    authorIds: number[];
    format: ReadarrMediaType;
    destinationRootPath: string;
  }): Promise<ReadarrMediaMoveBatchPreview> {
    await this.ensureProvider();
    const response = await this.request<unknown>(
      'POST',
      '/author/media-move/bulk/preview',
      options,
      this.getRequestConfig()
    );
    if (
      !response.data ||
      typeof response.data !== 'object' ||
      Array.isArray(response.data)
    ) {
      throw new Error('BookshelfNG returned an invalid media-move preview.');
    }
    const record = response.data as Record<string, unknown>;
    const format = record.format;
    const destinationRootPath = boundedMediaMoveText(
      record.destinationRootPath
    );
    const previewToken = boundedMediaMoveText(record.previewToken);
    const authors = Array.isArray(record.authors)
      ? record.authors.slice(0, MEDIA_MOVE_MAX_AUTHORS).flatMap((author) => {
          const sanitized = sanitizeMediaMoveAuthorPreview(author);
          return sanitized ? [sanitized] : [];
        })
      : [];
    if (
      format !== options.format ||
      destinationRootPath !== options.destinationRootPath ||
      !previewToken ||
      authors.length !== options.authorIds.length
    ) {
      throw new Error('BookshelfNG returned an incomplete media-move preview.');
    }
    return {
      format: options.format,
      destinationRootPath,
      previewToken,
      authorCount: mediaMoveInteger(record.authorCount) || authors.length,
      mediaFileCount:
        mediaMoveInteger(record.mediaFileCount) ||
        authors.reduce((count, author) => count + author.mediaFileCount, 0),
      sidecarFileCount:
        mediaMoveInteger(record.sidecarFileCount) ||
        authors.reduce((count, author) => count + author.sidecarFileCount, 0),
      missingFileCount:
        mediaMoveInteger(record.missingFileCount) ||
        authors.reduce((count, author) => count + author.missingFileCount, 0),
      totalSize:
        mediaMoveInteger(record.totalSize) ||
        authors.reduce((size, author) => size + author.totalSize, 0),
      requiredCopyBytes:
        mediaMoveInteger(record.requiredCopyBytes) ||
        authors.reduce((size, author) => size + author.requiredCopyBytes, 0),
      ...(Number.isSafeInteger(record.availableSpace) &&
      Number(record.availableSpace) >= 0
        ? { availableSpace: Number(record.availableSpace) }
        : {}),
      canMove: record.canMove === true,
      warnings: Array.isArray(record.warnings)
        ? record.warnings
            .slice(0, 100)
            .flatMap((warning) =>
              typeof warning === 'string' ? [boundedMediaMoveText(warning)] : []
            )
        : [],
      conflicts: Array.isArray(record.conflicts)
        ? record.conflicts
            .slice(0, 100)
            .flatMap((conflict) =>
              typeof conflict === 'string'
                ? [boundedMediaMoveText(conflict)]
                : []
            )
        : [],
      authors,
    };
  }

  public async startMediaMoveBatch(options: {
    authorIds: number[];
    format: ReadarrMediaType;
    destinationRootPath: string;
    previewToken: string;
  }): Promise<ReadarrMediaMoveCommand> {
    await this.ensureProvider();
    const response = await this.request<unknown>(
      'POST',
      '/author/media-move/bulk/start',
      options,
      this.getRequestConfig()
    );
    return ReadarrAPI.sanitizeMediaMoveCommand(response.data);
  }

  public async getMediaMoveCommand(
    commandId: number
  ): Promise<ReadarrMediaMoveCommand> {
    await this.ensureProvider();
    const response = await this.request<unknown>(
      'GET',
      `/command/${commandId}`,
      undefined,
      this.getRequestConfig()
    );
    return ReadarrAPI.sanitizeMediaMoveCommand(response.data);
  }

  private static sanitizeMediaMoveCommand(
    value: unknown
  ): ReadarrMediaMoveCommand {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new Error('BookshelfNG returned an invalid media-move command.');
    const record = value as Record<string, unknown>;
    const id = mediaMoveInteger(record.id);
    const name = boundedMediaMoveText(record.name);
    const status = boundedMediaMoveText(record.status);
    if (!id || !name || !status)
      throw new Error('BookshelfNG returned an invalid media-move command.');
    return {
      id,
      name,
      status,
      ...(typeof record.message === 'string'
        ? { message: boundedMediaMoveText(record.message) }
        : {}),
      ...(Number.isFinite(record.progress)
        ? { progress: Number(record.progress) }
        : {}),
      ...(typeof record.queued === 'string'
        ? { queued: boundedMediaMoveText(record.queued) }
        : {}),
      ...(typeof record.started === 'string'
        ? { started: boundedMediaMoveText(record.started) }
        : {}),
      ...(typeof record.ended === 'string'
        ? { ended: boundedMediaMoveText(record.ended) }
        : {}),
    };
  }

  public async getBook(
    bookId: number,
    cacheTtl?: number
  ): Promise<ReadarrBook> {
    try {
      return await this.get<ReadarrBook>(
        `/book/${bookId}`,
        this.getRequestConfig(),
        cacheTtl
      );
    } catch (e) {
      throw new Error(
        `[Readarr] Failed to retrieve book ${bookId}: ${e.message}`,
        { cause: e }
      );
    }
  }

  public async getBookFiles(bookId: number): Promise<ReadarrBookFile[]> {
    try {
      await this.ensureProvider();
      const response = await this.request<unknown[]>(
        'GET',
        '/bookfile',
        undefined,
        this.getRequestConfig({ bookId })
      );
      return sanitizeServarrRecordArray<Record<string, unknown>>(
        response.data,
        MAX_SERVARR_LIBRARY_RESULTS
      ).flatMap((file) => {
        const normalized = sanitizeReadarrBookFile(file);
        return normalized ? [normalized] : [];
      });
    } catch (error) {
      throw new Error(
        `[Readarr] Failed to retrieve book files: ${error.message}`,
        {
          cause: error,
        }
      );
    }
  }

  public async getBookIfExists(bookId: number): Promise<ReadarrBook | null> {
    try {
      const response = await this.request<ReadarrBook>(
        'GET',
        `/book/${bookId}`,
        undefined,
        this.getRequestConfig()
      );
      return response.data;
    } catch (e) {
      if (e?.response?.status === 404) {
        return null;
      }
      throw new Error(
        `[Readarr] Failed to retrieve book ${bookId}: ${e.message}`,
        { cause: e }
      );
    }
  }

  public async getBookCover(bookId: number): Promise<ReadarrCoverImage> {
    const book = await this.getBook(bookId).catch(() => undefined);
    const images = sanitizeServarrImages(book?.images);
    const advertisedCoverPaths = images
      .filter((image) => {
        const coverType = image.coverType?.toLowerCase();
        return !coverType || coverType === 'cover' || coverType === 'poster';
      })
      .map((image) => image.url)
      .filter((url): url is string => !!url && url.startsWith('/'));
    const candidatePaths = [
      ...advertisedCoverPaths,
      `/MediaCover/${bookId}/cover.jpg`,
      `/MediaCover/${bookId}/poster.jpg`,
    ];
    const remoteCoverUrls = images
      .filter((image) => {
        const coverType = image.coverType?.toLowerCase();
        return !coverType || coverType === 'cover' || coverType === 'poster';
      })
      .map((image) => image.remoteUrl)
      .filter((url): url is string => !!url)
      .map((url) => this.buildRemoteCoverUrl(url))
      .filter((url): url is string => !!url);
    const candidateUrls = [
      ...candidatePaths.map((path) => this.buildCoverUrl(path)),
      ...remoteCoverUrls,
    ].filter((url): url is string => !!url);
    const uniqueCandidateUrls = [...new Set(candidateUrls)];
    let lastError: unknown;

    for (const coverUrl of uniqueCandidateUrls) {
      try {
        const isLocalCoverUrl = isServarrServiceUrl(
          coverUrl,
          this.coverBaseUrl
        );
        if (!isLocalCoverUrl) {
          return await fetchSafeRemoteImage(coverUrl);
        }

        const response = await this.axios.get<ArrayBuffer>(coverUrl, {
          responseType: 'arraybuffer',
          maxContentLength: MAX_SAFE_REMOTE_IMAGE_BYTES,
          headers: { Accept: 'image/*' },
        });
        return normalizeSafeRasterImage(
          response.data,
          response.headers['content-type']
        );
      } catch (e) {
        lastError = e;
      }
    }

    throw new Error(
      `[Readarr] Failed to retrieve cover for book ${bookId}: ${
        lastError instanceof Error ? lastError.message : 'No cover path worked'
      }`,
      { cause: lastError }
    );
  }

  public async getAuthorCover(authorId: number): Promise<ReadarrCoverImage> {
    if (!Number.isSafeInteger(authorId) || authorId <= 0) {
      throw new Error('[Readarr] Invalid author ID for cover lookup.');
    }

    const author = await this.get<ReadarrAuthorLookupResult>(
      `/author/${authorId}`,
      this.getRequestConfig()
    );
    const posterImages = sanitizeServarrImages(author?.images).filter(
      (image) => {
        const coverType = image.coverType?.toLowerCase();
        return !coverType || coverType === 'poster' || coverType === 'headshot';
      }
    );
    const candidatePaths = posterImages
      .map((image) => image.url)
      .filter((url): url is string => !!url && url.startsWith('/'));
    const candidateUrls = [
      ...candidatePaths.map((path) => this.buildCoverUrl(path)),
      ...posterImages
        .map((image) => image.remoteUrl)
        .filter((url): url is string => !!url)
        .map((url) => this.buildRemoteCoverUrl(url)),
      this.buildCoverUrl(`/MediaCover/${authorId}/poster.jpg`),
      author?.remotePoster
        ? this.buildRemoteCoverUrl(author.remotePoster)
        : undefined,
    ].filter((url): url is string => !!url);
    let lastError: unknown;

    for (const coverUrl of [...new Set(candidateUrls)]) {
      try {
        const isLocalCoverUrl = isServarrServiceUrl(
          coverUrl,
          this.coverBaseUrl
        );
        if (!isLocalCoverUrl) {
          return await fetchSafeRemoteImage(coverUrl);
        }

        const response = await this.axios.get<ArrayBuffer>(coverUrl, {
          responseType: 'arraybuffer',
          maxContentLength: MAX_SAFE_REMOTE_IMAGE_BYTES,
          headers: { Accept: 'image/*' },
        });
        return normalizeSafeRasterImage(
          response.data,
          response.headers['content-type']
        );
      } catch (error) {
        lastError = error;
      }
    }

    throw new Error(
      `[Readarr] Failed to retrieve cover for author ${authorId}: ${
        lastError instanceof Error ? lastError.message : 'No poster path worked'
      }`,
      { cause: lastError }
    );
  }

  public async getEditions(bookId: number): Promise<ReadarrEdition[]> {
    try {
      return sanitizeServarrRecordArray<ReadarrEdition>(
        await this.get<ReadarrEdition[]>('/edition', {
          ...this.getRequestConfig({ bookId }),
        }),
        MAX_SERVARR_CONFIGURATION_RESULTS
      );
    } catch (e) {
      throw new Error(
        `[Readarr] Failed to retrieve editions for book ${bookId}: ${e.message}`,
        { cause: e }
      );
    }
  }

  private qualifyChaptarrLookupResults(
    results: ReadarrBookLookupResult[],
    dialect: ChaptarrDialect
  ): ReadarrBookLookupResult[] {
    const qualify = (id: string) =>
      /^\d+$/.test(id) ? `${dialect}:${id}` : id;
    return results.map((book) => ({
      ...book,
      foreignBookId: qualify(book.foreignBookId),
      ...(book.foreignEditionId
        ? { foreignEditionId: qualify(book.foreignEditionId) }
        : {}),
      ...(book.author
        ? {
            author: {
              ...book.author,
              ...(book.author.foreignAuthorId
                ? { foreignAuthorId: qualify(book.author.foreignAuthorId) }
                : {}),
            },
          }
        : {}),
      ...(book.editions
        ? {
            editions: book.editions.map((edition) => ({
              ...edition,
              foreignEditionId: qualify(edition.foreignEditionId),
            })),
          }
        : {}),
    }));
  }

  public async lookupBook(term: string): Promise<ReadarrBookLookupResult[]> {
    try {
      await this.ensureProvider();
      // A saved identity belongs to its original provider, even when a new
      // API instance detects a different default provider.
      const requestedDialect = term.match(/^(hc|gr):/i)?.[1].toLowerCase() as
        ChaptarrDialect | undefined;
      if (
        this.isChaptarr() &&
        this.mediaType &&
        requestedDialect &&
        this.chaptarrCapabilities?.features?.formatScopedFacade === true
      ) {
        this.chaptarrDialect = requestedDialect;
        this.requestBaseUrl = ReadarrAPI.buildChaptarrFacadeUrl(
          this.nativeApiUrl,
          this.mediaType,
          requestedDialect
        );
      }
      // Chaptarr's facades accept provider-qualified identities; bare numeric
      // terms can return an empty result even within the matching facade.
      const lookupTerm =
        this.isChaptarr() &&
        this.requestBaseUrl &&
        /^\d+$/.test(term) &&
        !normalizeValidIsbn(term)
          ? `${this.chaptarrDialect ?? 'hc'}:${term}`
          : term;
      let scopedResults: ReadarrBookLookupResult[] = [];

      try {
        scopedResults = sanitizeServarrRecordArray<ReadarrBookLookupResult>(
          await this.get<ReadarrBookLookupResult[]>('/book/lookup', {
            ...this.getRequestConfig({ term: lookupTerm }),
          }),
          MAX_SERVARR_LOOKUP_RESULTS
        );
      } catch (error) {
        if (!this.isChaptarr()) {
          throw error;
        }

        logger.warn(
          'Chaptarr format facade lookup failed; trying compatible scopes.',
          {
            label: 'Readarr',
            mediaType: this.mediaType,
            term,
            errorMessage:
              error instanceof Error ? error.message : String(error),
          }
        );
      }

      if (this.isChaptarr() && this.requestBaseUrl) {
        scopedResults = this.qualifyChaptarrLookupResults(
          scopedResults,
          this.chaptarrDialect ?? 'hc'
        );
      }

      if (
        !this.isChaptarr() ||
        !this.mediaType ||
        scopedResults.some(ReadarrAPI.hasAddressableLookupIdentity)
      ) {
        return scopedResults;
      }

      const alternateDialect: ChaptarrDialect =
        this.chaptarrDialect === 'gr' ? 'hc' : 'gr';
      const alternateBaseUrl = ReadarrAPI.buildChaptarrFacadeUrl(
        this.nativeApiUrl,
        this.mediaType,
        alternateDialect
      );

      try {
        const alternateResults = this.qualifyChaptarrLookupResults(
          sanitizeServarrRecordArray<ReadarrBookLookupResult>(
            await this.get<ReadarrBookLookupResult[]>('/book/lookup', {
              ...this.getRequestConfig({
                term:
                  /^\d+$/.test(term) && !normalizeValidIsbn(term)
                    ? `${alternateDialect}:${term}`
                    : term,
              }),
              baseURL: alternateBaseUrl,
            }),
            MAX_SERVARR_LOOKUP_RESULTS
          ),
          alternateDialect
        );

        if (alternateResults.some(ReadarrAPI.hasAddressableLookupIdentity)) {
          this.chaptarrDialect = alternateDialect;
          this.requestBaseUrl = alternateBaseUrl;
          logger.info(
            'Chaptarr selected an alternate provider facade with addressable lookup results.',
            {
              label: 'Readarr',
              dialect: alternateDialect,
              mediaType: this.mediaType,
              term,
              resultCount: alternateResults.length,
            }
          );
          return alternateResults;
        }
      } catch (error) {
        logger.warn('Chaptarr alternate provider facade lookup failed.', {
          label: 'Readarr',
          dialect: alternateDialect,
          mediaType: this.mediaType,
          term,
          errorMessage: error instanceof Error ? error.message : String(error),
        });
      }

      try {
        const nativeResults =
          sanitizeServarrRecordArray<ReadarrBookLookupResult>(
            await this.get<ReadarrBookLookupResult[]>('/book/lookup', {
              baseURL: this.nativeApiUrl,
              params: { term },
            }),
            MAX_SERVARR_LOOKUP_RESULTS
          );

        const formatResults = nativeResults.filter(
          (result) => result.mediaType === this.mediaType
        );

        if (formatResults.length > 0) {
          logger.info(
            'Chaptarr provider facades returned no addressable lookup results; using native provider lookup results.',
            {
              label: 'Readarr',
              mediaType: this.mediaType,
              term,
              resultCount: formatResults.length,
            }
          );
          return formatResults;
        }

        // Chaptarr 0.9.911 can return only audiobook metadata from its native
        // lookup even when an ebook facade is configured. The add endpoint
        // still accepts that provider-backed record when the requested media
        // type is supplied, so keep the usable identity instead of turning a
        // valid request into a local "book not found" failure.
        const crossFormatResults = nativeResults
          .filter(ReadarrAPI.hasAddressableLookupIdentity)
          .map((result) => ({ ...result, mediaType: this.mediaType }));

        if (crossFormatResults.length > 0) {
          logger.warn(
            'Chaptarr returned no lookup results for the requested format; using addressable native metadata as an add seed.',
            {
              label: 'Readarr',
              requestedMediaType: this.mediaType,
              nativeMediaType: nativeResults.find((result) => result.mediaType)
                ?.mediaType,
              term,
              resultCount: crossFormatResults.length,
            }
          );
          return crossFormatResults;
        }
      } catch (error) {
        logger.warn('Chaptarr native lookup fallback failed.', {
          label: 'Readarr',
          mediaType: this.mediaType,
          term,
          errorMessage: error instanceof Error ? error.message : String(error),
        });
      }

      return scopedResults;
    } catch (e) {
      throw new Error(`[Readarr] Failed to lookup book: ${e.message}`, {
        cause: e,
      });
    }
  }

  public async lookupBookByProviderIdentity(
    providerBookId: string,
    providerEditionId?: string
  ): Promise<ReadarrBookLookupResult | undefined> {
    await this.ensureProvider();
    const bareNumericProviderBookId = providerBookId.trim().match(/^\d+$/)?.[0];
    const lookupProviderBookId =
      this.isChaptarr() &&
      bareNumericProviderBookId &&
      !normalizeValidIsbn(bareNumericProviderBookId)
        ? `${this.chaptarrDialect ?? 'hc'}:${bareNumericProviderBookId}`
        : providerBookId;
    const addressableEditionId =
      this.isChaptarr() &&
      this.chaptarrCapabilities?.features?.providerScopedEditionIdentity !==
        true
        ? undefined
        : providerEditionId;
    const terms = [
      ...new Set([lookupProviderBookId, addressableEditionId]),
    ].filter((term): term is string => !!term?.trim());

    for (const term of terms) {
      const results = await this.lookupBook(term);
      const match = results.find(
        (book) =>
          matchesReadarrBookProviderIdentity(
            book,
            providerBookId,
            addressableEditionId
          ) ||
          (lookupProviderBookId !== providerBookId &&
            matchesReadarrBookProviderIdentity(
              book,
              lookupProviderBookId,
              addressableEditionId
            ))
      );
      if (match) return match;
    }

    return undefined;
  }

  public async getPendingAuthorImport(
    pendingId: number
  ): Promise<ReadarrPendingAuthorImport | undefined> {
    await this.ensureProvider();
    if (
      !this.isChaptarr() ||
      this.chaptarrCapabilities?.features?.pendingAuthorImports !== true ||
      !Number.isSafeInteger(pendingId) ||
      pendingId <= 0
    ) {
      return undefined;
    }

    try {
      const response = await this.get<unknown>(
        `/pendingauthorimport/${pendingId}`,
        this.getRequestConfig(),
        0
      );
      if (!isRecord(response)) return undefined;

      const readText = (value: unknown): string | undefined =>
        typeof value === 'string' ? value.slice(0, 10_000) : undefined;
      const status = (camel: string, pascal: string): string | undefined =>
        readText(response[camel] ?? response[pascal]);
      const readCount = (camel: string, pascal: string): number | undefined => {
        const value = response[camel] ?? response[pascal];
        return Number.isSafeInteger(value) && Number(value) >= 0
          ? Number(value)
          : undefined;
      };
      const responseId = Number(response.id ?? response.Id);
      const nextAttemptAt = status('nextAttemptAt', 'NextAttemptAt');

      return {
        id: Number.isSafeInteger(responseId) ? responseId : pendingId,
        status: status('status', 'Status'),
        overallStatus: status('overallStatus', 'OverallStatus'),
        ebookStatus: status('ebookStatus', 'EbookStatus'),
        audiobookStatus: status('audiobookStatus', 'AudiobookStatus'),
        attemptCount: readCount('attemptCount', 'AttemptCount'),
        maxAttempts: readCount('maxAttempts', 'MaxAttempts'),
        nextAttemptAt,
        lastError: status('lastError', 'LastError'),
      };
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        return undefined;
      }

      throw new Error(
        `[Readarr] Failed to retrieve pending Chaptarr import ${pendingId}: ${getReadarrErrorMessage(error)}`,
        { cause: error }
      );
    }
  }

  public async cancelPendingAuthorImport(pendingId: number): Promise<void> {
    await this.ensureProvider();
    if (
      !this.isChaptarr() ||
      this.chaptarrCapabilities?.features?.pendingImportCancellation !== true ||
      !Number.isSafeInteger(pendingId) ||
      pendingId <= 0
    ) {
      return;
    }

    try {
      await this.request(
        'DELETE',
        `/pendingauthorimport/${pendingId}`,
        undefined,
        this.getRequestConfig()
      );
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        return;
      }

      throw new Error(
        `[Readarr] Failed to cancel pending Chaptarr import ${pendingId}: ${getReadarrErrorMessage(error)}`,
        { cause: error }
      );
    }
  }

  public async lookupAuthor(
    term: string
  ): Promise<ReadarrAuthorLookupResult[]> {
    try {
      return sanitizeServarrRecordArray<ReadarrAuthorLookupResult>(
        await this.get<ReadarrAuthorLookupResult[]>('/author/lookup', {
          ...this.getRequestConfig({ term }),
        }),
        MAX_SERVARR_LOOKUP_RESULTS
      );
    } catch (e) {
      throw new Error(`[Readarr] Failed to lookup author: ${e.message}`, {
        cause: e,
      });
    }
  }

  public async addBook(
    options: ReadarrBookOptions
  ): Promise<ReadarrAddBookResult> {
    try {
      await this.ensureProvider();
      const existingBook = await this.findExistingBookForAdd(options);
      const alongside = existingBook
        ? await this.addEditionAlongside(existingBook, options)
        : undefined;
      if (alongside) {
        return alongside;
      }
      const editionUpdate = existingBook
        ? this.getRequestedEditionUpdate(existingBook, options)
        : undefined;

      if (
        existingBook &&
        this.isBookMonitored(existingBook) &&
        !editionUpdate?.changed
      ) {
        logger.info(
          'Book is already monitored in Bookshelf/Readarr. Skipping add and returning success',
          {
            label: 'Readarr',
            bookId: existingBook.id,
            bookTitle: existingBook.title,
          }
        );

        if (options.addOptions?.searchForNewBook) {
          await this.searchBook(existingBook.id);
        }

        return {
          ...existingBook,
          createdBook: false,
          createdAuthor: false,
        };
      }

      if (existingBook) {
        logger.info(
          editionUpdate?.changed
            ? 'Updating the requested Bookshelf edition.'
            : 'Book exists in Bookshelf/Readarr but is not monitored. Updating monitored status.',
          {
            label: 'Readarr',
            bookId: existingBook.id,
            bookTitle: existingBook.title,
          }
        );

        const updatedBookResponse = await this.request<
          ReadarrBookLookupResult | number
        >(
          'PUT',
          `/book/${existingBook.id}`,
          {
            ...existingBook,
            editions: editionUpdate?.editions ?? existingBook.editions ?? [],
            monitored: true,
            qualityProfileId:
              options.qualityProfileId ?? existingBook.qualityProfileId,
            metadataProfileId:
              options.metadataProfileId ?? existingBook.metadataProfileId,
            rootFolderPath:
              options.rootFolderPath ?? existingBook.rootFolderPath,
            tags: options.tags ?? existingBook.tags,
            ...(this.isChaptarr() ? this.getMediaMonitoringFields(true) : {}),
            ...(this.isChaptarr() && options.addOptions
              ? { addOptions: options.addOptions }
              : {}),
          },
          this.getRequestConfig()
        );
        const updatedBook = await this.resolveBookMutationResult(
          updatedBookResponse.data,
          {
            ...existingBook,
            editions: editionUpdate?.editions ?? existingBook.editions ?? [],
            monitored: true,
            ...(this.isChaptarr() ? this.getMediaMonitoringFields(true) : {}),
            ...(this.isChaptarr() && options.addOptions
              ? { addOptions: options.addOptions }
              : {}),
          }
        );

        if (options.addOptions?.searchForNewBook) {
          await this.post(
            '/command',
            {
              name: 'BookSearch',
              bookIds: [updatedBook.id ?? existingBook.id],
            },
            this.getRequestConfig()
          );
        }

        return {
          ...updatedBook,
          createdBook: false,
          createdAuthor: false,
        };
      }

      const existingAuthors = this.isChaptarr()
        ? []
        : sanitizeServarrRecordArray<ReadarrAuthorLookupResult>(
            await this.get<ReadarrAuthorLookupResult[]>(
              '/author',
              this.getRequestConfig()
            ),
            MAX_SERVARR_LIBRARY_RESULTS
          );
      const createdAuthor =
        !this.isChaptarr() &&
        !existingAuthors.some(
          (author) =>
            !!author.foreignAuthorId &&
            author.foreignAuthorId === options.author?.foreignAuthorId
        );

      const postedBook = await this.post<
        ReadarrBookLookupResult | number | Record<string, unknown>
      >(
        '/book',
        {
          ...this.getBookAddPayload(options),
          ...(this.isChaptarr()
            ? this.getMediaMonitoringFields(options.monitored)
            : {}),
        },
        this.getRequestConfig()
      );

      if (this.isChaptarr() && isRecord(postedBook)) {
        const pendingIdValue = postedBook.pendingId ?? postedBook.PendingId;
        if (pendingIdValue !== undefined) {
          const pendingId = Number(pendingIdValue);
          if (!Number.isSafeInteger(pendingId) || pendingId <= 0) {
            throw new Error('Chaptarr returned an invalid pending add ID.');
          }
          if (
            this.chaptarrCapabilities?.features?.pendingAuthorImports !== true
          ) {
            throw new Error(
              'Chaptarr queued author preparation without advertising pending-import support. Update ChaptarrNG before retrying this request.'
            );
          }

          return {
            ...options,
            id: undefined,
            pending: true,
            pendingId,
            message:
              typeof (postedBook.message ?? postedBook.Message) === 'string'
                ? String(postedBook.message ?? postedBook.Message).slice(
                    0,
                    10_000
                  )
                : undefined,
            createdBook: false,
            createdAuthor: false,
          };
        }
      }

      let addedBook: ReadarrBookLookupResult;
      if (typeof postedBook === 'number') {
        addedBook = {
          ...(this.getBookAddPayload(
            options
          ) as unknown as ReadarrBookLookupResult),
          id: postedBook,
        };
      } else if (isReadarrBookLookupResult(postedBook)) {
        addedBook = postedBook;
      } else {
        throw new Error('Bookshelf returned an invalid book response.');
      }

      const ensuredBook = await this.ensureRequestedBookState(
        addedBook,
        options
      );
      const persistedBook =
        !this.isChaptarr() && ensuredBook.id
          ? await this.getFreshBook(ensuredBook.id).catch(() => ensuredBook)
          : ensuredBook;
      return {
        ...persistedBook,
        createdBook: true,
        createdAuthor,
      };
    } catch (e) {
      throw new Error(
        `[Readarr] Failed to add book: ${getReadarrErrorMessage(e)}`,
        {
          cause: e,
        }
      );
    }
  }

  private getRequestedEditionUpdate(
    existingBook: ReadarrBookLookupResult,
    options: ReadarrBookOptions
  ): { editions: ReadarrEdition[]; changed: boolean } | undefined {
    if (!options.useRequestedEdition) {
      return undefined;
    }

    const requestedEdition = options.editions?.find(
      (edition) => edition.monitored
    );
    if (!requestedEdition) {
      return undefined;
    }

    const currentEditions = existingBook.editions ?? [];
    const requestedEditionExists = currentEditions.some(
      (edition) =>
        edition.foreignEditionId === requestedEdition.foreignEditionId
    );
    const editions = requestedEditionExists
      ? currentEditions
      : [...currentEditions, requestedEdition];
    const monitoredEditions = editions.map((edition) => ({
      ...edition,
      monitored: edition.foreignEditionId === requestedEdition.foreignEditionId,
    }));

    return {
      editions: monitoredEditions,
      changed:
        monitoredEditions.length !== currentEditions.length ||
        currentEditions.some(
          (edition, index) =>
            edition.monitored !== monitoredEditions[index]?.monitored
        ),
    };
  }

  /** Loads the companion's capability contract; the supports* checks need it. */
  public async ensureCapabilities(): Promise<void> {
    await this.ensureProvider();
  }

  public supportsWantedEditionVariants(): boolean {
    return this.chaptarrCapabilities?.features?.wantedEditionVariants === true;
  }

  public supportsSeriesNarratorMatrix(): boolean {
    return this.chaptarrCapabilities?.features?.seriesNarratorMatrix === true;
  }

  public supportsEditionCatalog(): boolean {
    return this.chaptarrCapabilities?.features?.editionCatalog === true;
  }

  /**
   * Track a distinct performance next to the one already selected. Returns
   * undefined only when the request did not select alongside. Capability or
   * catalog failures must not fall back to replacing the existing recording.
   */
  private async addEditionAlongside(
    existingBook: ReadarrBook,
    options: ReadarrBookOptions
  ): Promise<ReadarrAddBookResult | undefined> {
    if (options.editionPolicy !== 'alongside') return undefined;
    if (!this.isChaptarr())
      throw new Error('This destination cannot add an edition alongside.');
    await this.ensureCapabilities();
    if (!this.supportsWantedEditionVariants()) {
      throw new Error(
        'This destination no longer supports additional editions.'
      );
    }
    const requested = options.editions?.find((edition) => edition.monitored);
    if (!requested) {
      throw new Error('An additional edition requires an explicit selection.');
    }
    const catalog = await this.getEditionCatalog(existingBook.id);
    const match = catalog.find(
      (edition) => edition.foreignEditionId === requested.foreignEditionId
    );
    if (!match) {
      throw new Error(
        'The selected additional edition is missing from the catalog.'
      );
    }
    if (match.monitored) {
      return { ...existingBook, createdBook: false, createdAuthor: false };
    }
    const wanted = await this.addWantedEdition(
      existingBook.id,
      match.editionId,
      {
        asNewVariant: true,
        search: options.addOptions?.searchForNewBook === true,
      }
    );
    return { ...wanted, createdBook: false, createdAuthor: false };
  }

  public async addWantedEdition(
    bookId: number,
    editionId: number,
    options: { asNewVariant?: boolean; search?: boolean } = {}
  ): Promise<ReadarrBook> {
    const response = await this.request<ReadarrBook>(
      'POST',
      `/book/${bookId}/editions/wanted`,
      {
        editionId,
        asNewVariant: options.asNewVariant === true,
        searchForNewBook: options.search === true,
      },
      this.getRequestConfig()
    );
    return response.data;
  }

  /** Makes one narrator the preferred performance for a whole series. */
  public async setSeriesPreferredNarrator(
    seriesId: number,
    narrator: string,
    applyToAllBooks = true
  ): Promise<void> {
    await this.request(
      'PUT',
      `/series/${seriesId}/narrators/preferred`,
      { narrator, applyToAllBooks, overrideExisting: false },
      this.getRequestConfig()
    );
  }

  public async getEditionCatalog(
    bookId: number
  ): Promise<ChaptarrEditionCard[]> {
    await this.ensureCapabilities();
    if (!this.supportsEditionCatalog()) {
      return [];
    }
    try {
      const response = await this.request<ChaptarrEditionCard[]>(
        'GET',
        `/book/${bookId}/editions/catalog`,
        undefined,
        this.getRequestConfig()
      );
      return Array.isArray(response.data) ? response.data.slice(0, 200) : [];
    } catch (e) {
      logger.warn('Failed to load the Chaptarr edition catalog', {
        label: 'Readarr API',
        bookId,
        errorMessage: getReadarrErrorMessage(e),
      });
      return [];
    }
  }

  public async getSeriesNarratorMatrix(lookup: {
    title: string;
    authorId?: number;
  }): Promise<ChaptarrNarratorMatrix | undefined> {
    await this.ensureCapabilities();
    if (!this.supportsSeriesNarratorMatrix()) {
      return undefined;
    }
    try {
      const response = await this.request<ChaptarrNarratorMatrix>(
        'GET',
        '/series/narrators/matrix',
        undefined,
        this.getRequestConfig({
          title: lookup.title,
          ...(lookup.authorId ? { authorId: lookup.authorId } : {}),
        })
      );
      return response.data;
    } catch (e) {
      logger.warn('Failed to load the Chaptarr series narrator matrix', {
        label: 'Readarr API',
        seriesTitle: lookup.title,
        errorMessage: getReadarrErrorMessage(e),
      });
      return undefined;
    }
  }

  private getBookAddPayload(
    options: ReadarrBookOptions
  ): Record<string, unknown> {
    const payload = { ...options };
    delete payload.useRequestedEdition;
    delete payload.editionPolicy;
    return payload;
  }

  public async removeBook(
    bookId: number,
    options: { deleteFiles?: boolean; addImportListExclusion?: boolean } = {}
  ): Promise<void> {
    try {
      await this.request(
        'DELETE',
        `/book/${bookId}`,
        undefined,
        this.getRequestConfig({
          deleteFiles: options.deleteFiles ?? true,
          addImportListExclusion: options.addImportListExclusion ?? false,
        })
      );
    } catch (e) {
      throw new Error(`[Readarr] Failed to remove book: ${e.message}`, {
        cause: e,
      });
    }
  }

  public async startBookSearch(bookId: number): Promise<ServarrCommand> {
    logger.info('Executing book search command.', {
      label: 'Readarr API',
      bookId,
    });

    try {
      return await this.runCommand('BookSearch', { bookIds: [bookId] });
    } catch (e) {
      logger.error(
        'Something went wrong while executing Bookshelf/Readarr book search.',
        {
          label: 'Readarr API',
          errorMessage: getReadarrErrorMessage(e),
          bookId,
        }
      );
      throw new Error(
        `[Readarr] Failed to start book search: ${getReadarrErrorMessage(e)}`,
        { cause: e }
      );
    }
  }

  public async searchBook(bookId: number): Promise<void> {
    await this.startBookSearch(bookId);
  }
}

export default ReadarrAPI;
