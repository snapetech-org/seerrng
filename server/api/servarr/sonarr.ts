import type { SeasonEpisodeSelection } from '@server/interfaces/api/seasonInterfaces';
import type { SonarrSettings } from '@server/lib/settings';
import logger from '@server/logger';
import {
  fetchSafeRemoteImage,
  MAX_SAFE_REMOTE_IMAGE_BYTES,
  normalizeSafeRasterImage,
} from '@server/utils/safeRemoteImage';
import { redactSecrets } from '@server/utils/security';
import type { AxiosRequestConfig, AxiosResponse } from 'axios';
import ServarrBase, {
  isServarrServiceUrl,
  MAX_SERVARR_CONFIGURATION_RESULTS,
  MAX_SERVARR_LIBRARY_RESPONSE_BYTES,
  MAX_SERVARR_LIBRARY_RESULTS,
  MAX_SERVARR_LOOKUP_RESULTS,
  sanitizeServarrImages,
  sanitizeServarrRecordArray,
  sanitizeServarrSystemStatus,
} from './base';

const MAX_SONARR_TEXT_LENGTH = 10_000;
const MAX_SONARR_NESTED_RESULTS = 1_000;
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown): string =>
  typeof value === 'string' ? value.slice(0, MAX_SONARR_TEXT_LENGTH) : '';
const finiteNumber = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0;
const integer = (value: unknown): number =>
  Number.isSafeInteger(value) ? (value as number) : 0;
const boolean = (value: unknown): boolean => value === true;
const textArray = (value: unknown): string[] =>
  (Array.isArray(value) ? value : [])
    .slice(0, MAX_SONARR_NESTED_RESULTS)
    .flatMap((item) => (typeof item === 'string' ? [text(item)] : []));
const integerArray = (value: unknown): number[] =>
  (Array.isArray(value) ? value : [])
    .slice(0, MAX_SONARR_NESTED_RESULTS)
    .filter((item): item is number => Number.isSafeInteger(item));

const sanitizeSonarrSeasonTypes = (value: unknown): SonarrSeasonType[] =>
  (Array.isArray(value) ? value : []).slice(0, 50).flatMap((item) => {
    if (!isRecord(item)) return [];
    const name = text(item.name);
    const type = text(item.type);
    if (!name || !type) return [];
    return [
      {
        name,
        type,
        seasonNumbers: integerArray(item.seasonNumbers).filter(
          (seasonNumber) => seasonNumber >= 0 && seasonNumber <= 10_000
        ),
      },
    ];
  });

const sanitizeSonarrMetadataLanguage = (
  value: unknown
): SonarrMetadataLanguage | undefined => {
  if (!isRecord(value) || !Number.isSafeInteger(value.id)) return undefined;
  const id = value.id as number;
  const name = text(value.name);
  return id >= 0 && name ? { id, name } : undefined;
};

type SonarrApiVersion = 'v3' | 'v5';

const SONARR_API_VERSION_CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_SONARR_API_VERSION_CACHE_ENTRIES = 1_000;
const sonarrApiVersionCache = new Map<
  string,
  { version: SonarrApiVersion; expiresAt: number }
>();

const responseStatus = (error: unknown): number | undefined =>
  isRecord(error) && isRecord(error.response)
    ? integer(error.response.status)
    : undefined;

const buildSonarrApiUrl = (url: string, version: SonarrApiVersion): string => {
  const parsedUrl = new URL(url);
  const pathname = parsedUrl.pathname.replace(/\/+$/, '');

  parsedUrl.pathname = /\/api\/v\d+$/i.test(pathname)
    ? pathname.replace(/\/api\/v\d+$/i, `/api/${version}`)
    : /\/api$/i.test(pathname)
      ? `${pathname}/${version}`
      : `${pathname}/api/${version}`;
  parsedUrl.search = '';
  parsedUrl.hash = '';

  return parsedUrl.toString().replace(/\/$/, '');
};

const sonarrMajorVersion = (value: unknown): number => {
  const version = sanitizeServarrSystemStatus(value).version;
  const major = Number(version.match(/^(\d+)(?:\.|$)/)?.[1]);
  return Number.isSafeInteger(major) ? major : 0;
};

const sanitizeSonarrSeason = (value: unknown): SonarrSeason | undefined => {
  if (!isRecord(value) || !Number.isSafeInteger(value.seasonNumber)) {
    return undefined;
  }
  const stats = isRecord(value.statistics) ? value.statistics : undefined;
  return {
    seasonNumber: value.seasonNumber as number,
    monitored: boolean(value.monitored),
    statistics: stats
      ? {
          previousAiring: text(stats.previousAiring) || undefined,
          episodeFileCount: integer(stats.episodeFileCount),
          episodeCount: integer(stats.episodeCount),
          totalEpisodeCount: integer(stats.totalEpisodeCount),
          sizeOnDisk: finiteNumber(stats.sizeOnDisk),
          percentOfEpisodes: finiteNumber(stats.percentOfEpisodes),
        }
      : undefined,
  };
};

export const sanitizeSonarrSeries = (
  value: unknown
): SonarrSeries | undefined => {
  if (!isRecord(value)) return undefined;
  const tvdbId = integer(value.tvdbId);
  const title = text(value.title);
  if (tvdbId <= 0 || !title) return undefined;
  const stats = isRecord(value.statistics) ? value.statistics : {};
  const ratings = isRecord(value.ratings) ? value.ratings : {};
  const language = sanitizeSonarrMetadataLanguage(value.language);
  const originalLanguage = sanitizeSonarrMetadataLanguage(
    value.originalLanguage
  );
  const seriesType = ['standard', 'daily', 'anime'].includes(
    String(value.seriesType)
  )
    ? (value.seriesType as SonarrSeries['seriesType'])
    : 'standard';
  const monitorNewItems = value.monitorNewItems === 'none' ? 'none' : 'all';

  return {
    title,
    sortTitle: text(value.sortTitle),
    seasonCount: integer(value.seasonCount),
    status: text(value.status),
    overview: text(value.overview),
    network: text(value.network),
    airTime: text(value.airTime),
    images: sanitizeServarrImages(value.images),
    remotePoster: text(value.remotePoster),
    seasons: (Array.isArray(value.seasons) ? value.seasons : [])
      .slice(0, MAX_SONARR_NESTED_RESULTS)
      .flatMap((season) => {
        const normalized = sanitizeSonarrSeason(season);
        return normalized ? [normalized] : [];
      }),
    year: integer(value.year),
    path: text(value.path),
    profileId: integer(value.profileId),
    languageProfileId: integer(value.languageProfileId),
    seasonFolder: boolean(value.seasonFolder),
    monitored: boolean(value.monitored),
    monitorNewItems,
    useSceneNumbering: boolean(value.useSceneNumbering),
    runtime: integer(value.runtime),
    tvdbId,
    tvRageId: integer(value.tvRageId),
    tvMazeId: integer(value.tvMazeId),
    firstAired: text(value.firstAired),
    lastInfoSync: text(value.lastInfoSync) || undefined,
    seriesType,
    ...(language ? { language } : {}),
    ...(originalLanguage ? { originalLanguage } : {}),
    seasonType: text(value.seasonType) || undefined,
    seasonTypes: sanitizeSonarrSeasonTypes(value.seasonTypes),
    malIds: integerArray(value.malIds).filter((id) => id > 0),
    aniListIds: integerArray(value.aniListIds).filter((id) => id > 0),
    originalCountry: text(value.originalCountry) || undefined,
    originalTitle: text(value.originalTitle) || undefined,
    alternateTitles: (Array.isArray(value.alternateTitles)
      ? value.alternateTitles
      : []
    )
      .slice(0, 100)
      .flatMap((item) => {
        if (!isRecord(item)) return [];
        const title = text(item.title);
        return title ? [title] : [];
      }),
    cleanTitle: text(value.cleanTitle),
    imdbId: text(value.imdbId),
    titleSlug: text(value.titleSlug),
    ...(integer(value.tmdbId) > 0 ? { tmdbId: integer(value.tmdbId) } : {}),
    certification: text(value.certification),
    genres: textArray(value.genres),
    tags: integerArray(value.tags),
    added: text(value.added),
    ratings: {
      votes: integer(ratings.votes),
      value: finiteNumber(ratings.value),
    },
    qualityProfileId: integer(value.qualityProfileId),
    id:
      Number.isSafeInteger(value.id) && (value.id as number) > 0
        ? (value.id as number)
        : undefined,
    rootFolderPath: text(value.rootFolderPath) || undefined,
    addOptions: isRecord(value.addOptions)
      ? {
          ignoreEpisodesWithFiles:
            typeof value.addOptions.ignoreEpisodesWithFiles === 'boolean'
              ? value.addOptions.ignoreEpisodesWithFiles
              : undefined,
          ignoreEpisodesWithoutFiles:
            typeof value.addOptions.ignoreEpisodesWithoutFiles === 'boolean'
              ? value.addOptions.ignoreEpisodesWithoutFiles
              : undefined,
          searchForMissingEpisodes:
            typeof value.addOptions.searchForMissingEpisodes === 'boolean'
              ? value.addOptions.searchForMissingEpisodes
              : undefined,
        }
      : undefined,
    statistics: {
      seasonCount: integer(stats.seasonCount),
      episodeFileCount: integer(stats.episodeFileCount),
      episodeCount: integer(stats.episodeCount),
      totalEpisodeCount: integer(stats.totalEpisodeCount),
      monitoredEpisodeCount: integer(stats.monitoredEpisodeCount),
      sizeOnDisk: finiteNumber(stats.sizeOnDisk),
      releaseGroups: textArray(stats.releaseGroups),
      releaseTypes: textArray(stats.releaseTypes),
      episodeFileQualities: (Array.isArray(stats.episodeFileQualities)
        ? stats.episodeFileQualities
        : []
      )
        .slice(0, 50)
        .flatMap((item) => {
          if (!isRecord(item)) return [];
          const quality = isRecord(item.quality) ? item.quality : item;
          const name = text(quality.name);
          return name ? [name] : [];
        }),
      percentOfEpisodes: finiteNumber(stats.percentOfEpisodes),
    },
  };
};

const requireSonarrSeries = (value: unknown): SonarrSeries => {
  const series = sanitizeSonarrSeries(value);
  if (!series) throw new Error('Sonarr returned an invalid series');
  return series;
};

const sanitizeSonarrEpisode = (value: unknown): EpisodeResult | undefined => {
  if (!isRecord(value)) return undefined;
  const id = integer(value.id);
  const seasonNumber = integer(value.seasonNumber);
  if (id <= 0 || seasonNumber < 0) return undefined;
  const episodeFile = isRecord(value.episodeFile) ? value.episodeFile : {};
  const mediaInfo = isRecord(episodeFile.mediaInfo)
    ? episodeFile.mediaInfo
    : {};
  return {
    seriesId: integer(value.seriesId),
    episodeFileId: integer(value.episodeFileId),
    seasonNumber,
    episodeNumber: integer(value.episodeNumber),
    title: text(value.title),
    airDate: text(value.airDate),
    airDateUtc: text(value.airDateUtc),
    overview: text(value.overview),
    hasFile: boolean(value.hasFile),
    monitored: boolean(value.monitored),
    absoluteEpisodeNumber: integer(value.absoluteEpisodeNumber),
    unverifiedSceneNumbering: boolean(value.unverifiedSceneNumbering),
    fileResolution: text(mediaInfo.resolution) || undefined,
    id,
  };
};

export interface SonarrEpisodeFile {
  id: number;
  seriesId: number;
  seasonNumber: number;
  relativePath?: string;
  path?: string;
  size: number;
}

const sanitizeSonarrEpisodeFile = (
  value: unknown
): SonarrEpisodeFile | undefined => {
  if (!isRecord(value)) return undefined;
  const id = integer(value.id);
  const seriesId = integer(value.seriesId);
  const seasonNumber = integer(value.seasonNumber);
  if (id <= 0 || seriesId <= 0 || seasonNumber < 0) return undefined;
  return {
    id,
    seriesId,
    seasonNumber,
    relativePath: text(value.relativePath) || undefined,
    path: text(value.path) || undefined,
    size: finiteNumber(value.size),
  };
};

const isConflictError = (error: unknown): boolean =>
  (typeof error === 'object' &&
    error !== null &&
    (error as { response?: { status?: number } }).response?.status === 409) ||
  (error instanceof Error && /status code 409/i.test(error.message));

export interface SonarrSeason {
  seasonNumber: number;
  monitored: boolean;
  statistics?: {
    previousAiring?: string;
    episodeFileCount: number;
    episodeCount: number;
    totalEpisodeCount: number;
    sizeOnDisk: number;
    percentOfEpisodes: number;
  };
}

export interface SonarrSeasonType {
  name: string;
  type: string;
  seasonNumbers: number[];
}

export interface SonarrMetadataLanguage {
  id: number;
  name: string;
}

export interface SonarrHistoryEvent {
  id: number;
  date: string;
  eventType: string;
  sourceTitle: string;
  seriesTitle?: string;
  seasonNumber?: number;
  episodeNumber?: number;
  episodeTitle?: string;
}

export const sanitizeSonarrHistory = (value: unknown): SonarrHistoryEvent[] => {
  const events = sanitizeServarrRecordArray<Record<string, unknown>>(
    value,
    MAX_SONARR_NESTED_RESULTS
  ).flatMap((item) => {
    const id = integer(item.id);
    const date = text(item.date);
    if (id <= 0 || !date || !Number.isFinite(Date.parse(date))) return [];
    const episode = isRecord(item.episode) ? item.episode : {};
    const seasonNumber = integer(episode.seasonNumber);
    const episodeNumber = integer(episode.episodeNumber);
    return [
      {
        id,
        date,
        eventType: text(item.eventType),
        sourceTitle: text(item.sourceTitle),
        ...(Number.isSafeInteger(episode.seasonNumber) && seasonNumber >= 0
          ? { seasonNumber }
          : {}),
        ...(Number.isSafeInteger(episode.episodeNumber) && episodeNumber > 0
          ? { episodeNumber }
          : {}),
        ...(text(episode.title) ? { episodeTitle: text(episode.title) } : {}),
      },
    ];
  });
  return events
    .sort((left, right) => Date.parse(right.date) - Date.parse(left.date))
    .slice(0, 100);
};
interface EpisodeResult {
  seriesId: number;
  episodeFileId: number;
  seasonNumber: number;
  episodeNumber: number;
  title: string;
  airDate: string;
  airDateUtc: string;
  overview: string;
  hasFile: boolean;
  monitored: boolean;
  absoluteEpisodeNumber: number;
  unverifiedSceneNumbering: boolean;
  fileResolution?: string;
  id: number;
}

export interface SonarrSeries {
  title: string;
  sortTitle: string;
  seasonCount: number;
  status: string;
  overview: string;
  network: string;
  airTime: string;
  images: {
    coverType?: string;
    url?: string;
    remoteUrl?: string;
  }[];
  remotePoster: string;
  seasons: SonarrSeason[];
  year: number;
  path: string;
  profileId: number;
  languageProfileId: number;
  seasonFolder: boolean;
  monitored: boolean;
  monitorNewItems: 'all' | 'none';
  useSceneNumbering: boolean;
  runtime: number;
  tvdbId: number;
  tvRageId: number;
  tvMazeId: number;
  firstAired: string;
  lastInfoSync?: string;
  seriesType: 'standard' | 'daily' | 'anime';
  language?: SonarrMetadataLanguage;
  originalLanguage?: SonarrMetadataLanguage;
  seasonType?: string;
  seasonTypes?: SonarrSeasonType[];
  malIds?: number[];
  aniListIds?: number[];
  originalCountry?: string;
  originalTitle?: string;
  alternateTitles?: string[];
  cleanTitle: string;
  imdbId: string;
  titleSlug: string;
  tmdbId?: number;
  certification: string;
  genres: string[];
  tags: number[];
  added: string;
  ratings: {
    votes: number;
    value: number;
  };
  qualityProfileId: number;
  id?: number;
  sonarrServerId?: number;
  rootFolderPath?: string;
  addOptions?: {
    ignoreEpisodesWithFiles?: boolean;
    ignoreEpisodesWithoutFiles?: boolean;
    searchForMissingEpisodes?: boolean;
  };
  statistics: {
    seasonCount: number;
    episodeFileCount: number;
    episodeCount: number;
    totalEpisodeCount: number;
    monitoredEpisodeCount?: number;
    sizeOnDisk: number;
    releaseGroups: string[];
    releaseTypes?: string[];
    episodeFileQualities?: string[];
    percentOfEpisodes: number;
  };
}

export type SonarrCoverImage = {
  imageBuffer: Buffer;
  contentType: string;
};

export interface AddSeriesOptions {
  tvdbid: number;
  title: string;
  profileId: number;
  languageProfileId?: number;
  metadataLanguageId?: number;
  seasonType?: string;
  /** Applied only when creating a series; request overrides take priority. */
  defaults?: Pick<
    SonarrSettings,
    'defaultMetadataLanguageId' | 'defaultSeasonType'
  >;
  seasons: number[];
  episodeSelections?: SeasonEpisodeSelection[];
  seasonFolder: boolean;
  rootFolderPath: string;
  tags?: number[];
  seriesType: SonarrSeries['seriesType'];
  monitored?: boolean;
  monitorNewItems?: SonarrSeries['monitorNewItems'];
  /** Explicit opt-in for an existing series; never unmonitors another request. */
  enableFutureSeasons?: boolean;
  searchNow?: boolean;
}

export interface LanguageProfile {
  id: number;
  name: string;
  languages?: string[];
}

const sanitizeLanguageNames = (value: unknown): string[] =>
  (Array.isArray(value) ? value.slice(0, 100) : []).flatMap((entry) => {
    if (typeof entry === 'string') return [entry.slice(0, 100)];
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      return [];
    }

    const languageEntry = entry as Record<string, unknown>;
    if (languageEntry.allowed === false) return [];
    const language =
      languageEntry.language &&
      typeof languageEntry.language === 'object' &&
      !Array.isArray(languageEntry.language)
        ? (languageEntry.language as Record<string, unknown>)
        : languageEntry;

    return typeof language.name === 'string' && language.name
      ? [language.name.slice(0, 100)]
      : [];
  });

export const sanitizeSonarrLanguageProfiles = (
  value: unknown
): LanguageProfile[] =>
  sanitizeServarrRecordArray<Record<string, unknown>>(
    value,
    MAX_SERVARR_CONFIGURATION_RESULTS
  ).flatMap((profile) => {
    if (
      !Number.isSafeInteger(profile.id) ||
      typeof profile.name !== 'string' ||
      profile.name.length === 0
    ) {
      return [];
    }

    const languages = sanitizeLanguageNames(profile.languages);
    return [
      {
        id: profile.id as number,
        name: profile.name.slice(0, 10_000),
        ...(languages.length > 0 ? { languages } : {}),
      },
    ];
  });

class SonarrAPI extends ServarrBase<{
  seriesId: number;
  episodeId: number;
  episode: EpisodeResult;
}> {
  private coverBaseUrl: string;
  private readonly apiV3Url: string;
  private readonly apiV5Url: string;
  private apiVersion?: {
    version: SonarrApiVersion;
    expiresAt: number;
  };
  private apiVersionPromise?: Promise<SonarrApiVersion>;

  constructor({ url, apiKey }: { url: string; apiKey: string }) {
    const apiV3Url = buildSonarrApiUrl(url, 'v3');
    const apiV5Url = buildSonarrApiUrl(url, 'v5');
    super({ url: apiV3Url, apiKey, apiName: 'Sonarr', cacheName: 'sonarr' });
    this.apiV3Url = apiV3Url;
    this.apiV5Url = apiV5Url;
    this.coverBaseUrl = SonarrAPI.buildCoverBaseUrl(apiV3Url);
  }

  protected override async request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    endpoint: string,
    data?: unknown,
    config?: AxiosRequestConfig
  ): Promise<AxiosResponse<T>> {
    const version = await this.getApiVersion();
    const baseURL =
      config?.baseURL ?? (version === 'v5' ? this.apiV5Url : this.apiV3Url);
    const requestConfig = { ...config, baseURL };

    try {
      return await super.request<T>(method, endpoint, data, requestConfig);
    } catch (error) {
      if (
        version === 'v5' &&
        config?.baseURL === undefined &&
        responseStatus(error) === 404
      ) {
        // Sonarr v5 retains the v3 API, and a few endpoints were removed or
        // replaced in v5. Keep those calls working while preferring v5 routes.
        return super.request<T>(method, endpoint, data, {
          ...config,
          baseURL: this.apiV3Url,
        });
      }

      throw error;
    }
  }

  private async getApiVersion(): Promise<SonarrApiVersion> {
    if (this.apiVersion && this.apiVersion.expiresAt > Date.now()) {
      return this.apiVersion.version;
    }
    if (!this.apiVersionPromise) {
      this.apiVersionPromise = this.resolveApiVersion();
    }

    try {
      const version = await this.apiVersionPromise;
      this.apiVersion = {
        version,
        expiresAt: Date.now() + SONARR_API_VERSION_CACHE_TTL_MS,
      };
      return version;
    } finally {
      this.apiVersionPromise = undefined;
    }
  }

  private async resolveApiVersion(): Promise<SonarrApiVersion> {
    const now = Date.now();
    const cached = sonarrApiVersionCache.get(this.apiV3Url);
    if (cached && cached.expiresAt > now) return cached.version;
    for (const [url, entry] of sonarrApiVersionCache) {
      if (entry.expiresAt <= now) sonarrApiVersionCache.delete(url);
    }

    let version: SonarrApiVersion;
    try {
      const response = await super.request<unknown>(
        'GET',
        '/system/status',
        undefined,
        { baseURL: this.apiV3Url }
      );
      try {
        version = sonarrMajorVersion(response.data) >= 5 ? 'v5' : 'v3';
      } catch {
        // An unreadable version probe should preserve the existing v3 request
        // path; the operation itself will report any real connection problem.
        version = 'v3';
      }
    } catch (error) {
      if (responseStatus(error) !== 404) {
        version = 'v3';
      } else {
        try {
          const response = await super.request<unknown>(
            'GET',
            '/system/status',
            undefined,
            { baseURL: this.apiV5Url }
          );
          version = sonarrMajorVersion(response.data) >= 5 ? 'v5' : 'v3';
        } catch {
          version = 'v3';
        }
      }
    }

    if (sonarrApiVersionCache.size >= MAX_SONARR_API_VERSION_CACHE_ENTRIES) {
      sonarrApiVersionCache.delete(sonarrApiVersionCache.keys().next().value!);
    }
    sonarrApiVersionCache.set(this.apiV3Url, {
      version,
      expiresAt: now + SONARR_API_VERSION_CACHE_TTL_MS,
    });
    return version;
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

  private async updateSeriesV5Metadata(
    seriesId: number,
    changes: {
      seasonType?: string;
      language?: SonarrMetadataLanguage;
      monitorNewItems?: SonarrSeries['monitorNewItems'];
    }
  ): Promise<SonarrSeries> {
    const currentResponse = await this.request<unknown>(
      'GET',
      `/series/${seriesId}`
    );
    if (
      !isRecord(currentResponse.data) ||
      integer(currentResponse.data.id) !== seriesId
    ) {
      throw new Error('Sonarr returned an invalid series for metadata update.');
    }

    const payload = { ...currentResponse.data, ...changes };
    const response = await this.request<unknown>(
      'PUT',
      `/series/${seriesId}`,
      payload
    );
    return requireSonarrSeries(
      isRecord(response.data) ? { ...payload, ...response.data } : payload
    );
  }

  public async getSeries({
    strict = false,
    tvdbId,
  }: { strict?: boolean; tvdbId?: number } = {}): Promise<SonarrSeries[]> {
    try {
      const response = await this.request<SonarrSeries[]>(
        'GET',
        '/series',
        undefined,
        {
          ...(tvdbId ? { params: { tvdbId } } : {}),
          maxContentLength: MAX_SERVARR_LIBRARY_RESPONSE_BYTES,
        }
      );

      const series = sanitizeServarrRecordArray<Record<string, unknown>>(
        response.data,
        MAX_SERVARR_LIBRARY_RESULTS
      ).flatMap((series) => {
        const normalized = sanitizeSonarrSeries(series);
        return normalized ? [normalized] : [];
      });
      if (
        strict &&
        (!Array.isArray(response.data) ||
          series.length !== response.data.length ||
          series.some(
            (item) =>
              !Number.isSafeInteger(item.tvdbId) ||
              item.tvdbId <= 0 ||
              typeof item.id !== 'number' ||
              !Number.isSafeInteger(item.id) ||
              item.id <= 0
          ))
      ) {
        throw new Error(
          'Incomplete or invalid Sonarr inventory; deletion reconciliation is not safe.'
        );
      }
      return series;
    } catch (e) {
      throw new Error(`[Sonarr] Failed to retrieve series: ${e.message}`, {
        cause: e,
      });
    }
  }

  public async getLibrarySeriesByTvdbId(
    tvdbId: number
  ): Promise<SonarrSeries[]> {
    try {
      const response = await this.request<unknown[]>(
        'GET',
        '/series',
        undefined,
        { params: { tvdbId } }
      );

      return sanitizeServarrRecordArray<Record<string, unknown>>(
        response.data,
        MAX_SERVARR_LOOKUP_RESULTS
      ).flatMap((series) => {
        const normalized = sanitizeSonarrSeries(series);
        return normalized ? [normalized] : [];
      });
    } catch (e) {
      throw new Error(
        `[Sonarr] Failed to retrieve series by TVDB ID: ${e.message}`,
        { cause: e }
      );
    }
  }

  public async getSeriesById(id: number): Promise<SonarrSeries> {
    try {
      const response = await this.request<SonarrSeries>('GET', `/series/${id}`);

      return requireSonarrSeries(response.data);
    } catch (e) {
      throw new Error(
        `[Sonarr] Failed to retrieve series by ID: ${e.message}`,
        { cause: e }
      );
    }
  }

  public async getSeriesCover(seriesId: number): Promise<SonarrCoverImage> {
    const series = await this.getSeriesById(seriesId).catch(() => undefined);
    const advertisedCoverPaths = (series?.images ?? [])
      .filter((image) => {
        const coverType = image.coverType?.toLowerCase();
        return !coverType || coverType === 'poster' || coverType === 'cover';
      })
      .map((image) => image.url)
      .filter((url): url is string => !!url && url.startsWith('/'));
    const candidatePaths = [
      ...advertisedCoverPaths,
      `/MediaCover/${seriesId}/poster.jpg`,
      `/MediaCover/${seriesId}/cover.jpg`,
    ];
    const remoteCoverUrls = (series?.images ?? [])
      .filter((image) => {
        const coverType = image.coverType?.toLowerCase();
        return !coverType || coverType === 'poster' || coverType === 'cover';
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
      `[Sonarr] Failed to retrieve cover for series ${seriesId}: ${
        lastError instanceof Error ? lastError.message : 'No cover path worked'
      }`,
      { cause: lastError }
    );
  }

  public async getSeriesByTitle(
    title: string,
    languageId?: number
  ): Promise<SonarrSeries[]> {
    try {
      const apiVersion =
        languageId !== undefined ? await this.getApiVersion() : undefined;
      const response = await this.request<SonarrSeries[]>(
        'GET',
        '/series/lookup',
        undefined,
        {
          params: {
            term: title,
            ...(languageId !== undefined && apiVersion === 'v5'
              ? { language: languageId }
              : {}),
          },
        }
      );

      const series = sanitizeServarrRecordArray<Record<string, unknown>>(
        response.data,
        MAX_SERVARR_LOOKUP_RESULTS
      ).flatMap((item) => {
        const normalized = sanitizeSonarrSeries(item);
        return normalized ? [normalized] : [];
      });
      if (!series[0]) {
        throw new Error('No series found');
      }

      return series;
    } catch (e) {
      logger.error('Error retrieving series by series title', {
        label: 'Sonarr API',
        errorMessage: e.message,
        title,
      });
      throw new Error('No series found', { cause: e });
    }
  }

  public async getSeriesByTmdbId(id: number): Promise<SonarrSeries | null> {
    if (!Number.isSafeInteger(id) || id <= 0) {
      return null;
    }

    try {
      const response = await this.request<unknown>(
        'GET',
        '/series/lookup',
        undefined,
        { params: { term: `tmdb:${id}` } }
      );
      const results = sanitizeServarrRecordArray<Record<string, unknown>>(
        response.data,
        MAX_SERVARR_LOOKUP_RESULTS
      );

      const matches = results
        .map(sanitizeSonarrSeries)
        .filter(
          (series): series is SonarrSeries =>
            !!series && (!series.tmdbId || series.tmdbId === id)
        );
      const exactMatches = matches.filter((series) => series.tmdbId === id);
      if (exactMatches.length === 1) {
        return exactMatches[0];
      }

      if (exactMatches.length > 1) {
        return null;
      }

      return matches.length === 1 ? matches[0] : null;
    } catch (error) {
      logger.debug('Sonarr could not resolve a series by TMDB ID', {
        label: 'Sonarr API',
        tmdbId: id,
        errorMessage:
          error instanceof Error
            ? redactSecrets(error.message)
            : 'Unknown error',
      });
      return null;
    }
  }

  public async getSeriesByTvdbId(id: number): Promise<SonarrSeries> {
    try {
      const response = await this.request<SonarrSeries[]>(
        'GET',
        '/series/lookup',
        undefined,
        {
          params: {
            term: `tvdb:${id}`,
          },
        }
      );

      const series = sanitizeServarrRecordArray<Record<string, unknown>>(
        response.data,
        MAX_SERVARR_LOOKUP_RESULTS
      ).flatMap((item) => {
        const normalized = sanitizeSonarrSeries(item);
        return normalized ? [normalized] : [];
      });
      if (!series[0]) {
        throw new Error('Series not found');
      }

      return series[0];
    } catch (e) {
      logger.error('Error retrieving series by tvdb ID', {
        label: 'Sonarr API',
        errorMessage: e.message,
        tvdbId: id,
      });
      throw e;
    }
  }

  public async addSeries(options: AddSeriesOptions): Promise<SonarrSeries> {
    try {
      let series = await this.getSeriesByTvdbId(options.tvdbid);
      const apiVersion = await this.getApiVersion();
      if (
        options.seasonType &&
        apiVersion !== 'v5' &&
        options.seasonType !== 'standard'
      ) {
        throw new Error('Alternate season ordering requires Sonarr v5.');
      }
      if (
        options.seasonType &&
        apiVersion === 'v5' &&
        options.seasonType !== 'standard' &&
        !(series.seasonTypes ?? []).some(
          (item) => item.type === options.seasonType
        )
      ) {
        throw new Error('The requested Sonarr season order is not available.');
      }

      const metadataLanguageId =
        options.metadataLanguageId ??
        (apiVersion === 'v5' && !series.id
          ? options.defaults?.defaultMetadataLanguageId
          : undefined);
      const metadataLanguage =
        apiVersion === 'v5' && metadataLanguageId !== undefined
          ? (await this.getMetadataLanguages()).find(
              (language) => language.id === metadataLanguageId
            )
          : undefined;
      if (metadataLanguageId !== undefined && !metadataLanguage) {
        throw new Error(
          'The requested Sonarr metadata language is not available.'
        );
      }

      const metadataLanguageChanged =
        metadataLanguage !== undefined &&
        series.language?.id !== metadataLanguage.id;
      const seasonTypeChanged =
        options.seasonType !== undefined &&
        options.seasonType !== series.seasonType;

      if (
        series.id &&
        apiVersion === 'v5' &&
        (seasonTypeChanged ||
          metadataLanguageChanged ||
          (options.enableFutureSeasons && series.monitorNewItems !== 'all'))
      ) {
        await this.updateSeriesV5Metadata(series.id, {
          ...(options.seasonType ? { seasonType: options.seasonType } : {}),
          ...(metadataLanguage ? { language: metadataLanguage } : {}),
          ...(options.enableFutureSeasons
            ? { monitorNewItems: 'all' as const }
            : {}),
        });
        series = await this.getSeriesById(series.id);
      }
      const fullySelectedSeasons = options.episodeSelections
        ? options.episodeSelections
            .filter((selection) => selection.episodeNumbers === undefined)
            .map((selection) => selection.seasonNumber)
        : options.seasons;

      // If the series already exists, we will simply just update it
      if (series.id) {
        series.monitored = options.monitored ?? series.monitored;
        if (options.enableFutureSeasons) series.monitorNewItems = 'all';
        series.tags = options.tags
          ? Array.from(new Set([...series.tags, ...options.tags]))
          : series.tags;
        series.seasons = this.buildSeasonList(
          fullySelectedSeasons,
          series.seasons
        );

        let updatedSeries: SonarrSeries;
        if (apiVersion === 'v5') {
          const editorPayload: {
            seriesIds: number[];
            monitored?: boolean;
            tags?: number[];
            applyTags?: 'add';
          } = { seriesIds: [series.id] };
          if (options.monitored !== undefined) {
            editorPayload.monitored = options.monitored;
          }
          if (options.tags?.length) {
            editorPayload.tags = Array.from(new Set(options.tags));
            editorPayload.applyTags = 'add';
          }
          if (
            editorPayload.monitored !== undefined ||
            editorPayload.tags !== undefined
          ) {
            await this.request('PUT', '/series/editor', editorPayload);
          }
          updatedSeries = series;
        } else {
          const newSeriesResponse = await this.request<SonarrSeries>(
            'PUT',
            '/series',
            this.buildSeriesUpdatePayload(series)
          );
          updatedSeries = requireSonarrSeries(
            isRecord(newSeriesResponse.data)
              ? { ...series, ...newSeriesResponse.data }
              : newSeriesResponse.data
          );
        }

        if (updatedSeries.id) {
          logger.info('Updated existing series in Sonarr.', {
            label: 'Sonarr',
            seriesId: updatedSeries.id,
            seriesTitle: updatedSeries.title,
          });
          logger.debug('Sonarr update details', {
            label: 'Sonarr',
            series: updatedSeries,
          });

          if (options.episodeSelections) {
            await this.applyEpisodeSelections(
              updatedSeries.id,
              options.episodeSelections,
              options.searchNow ?? false
            );
          } else {
            try {
              const fallbackSeasons = new Set<number>();
              for (const seasonNumber of new Set(options.seasons)) {
                if (
                  !(await this.setSeasonMonitoring(
                    updatedSeries.id,
                    seasonNumber
                  ))
                ) {
                  fallbackSeasons.add(seasonNumber);
                }
              }

              const episodes =
                fallbackSeasons.size > 0
                  ? await this.getEpisodes(updatedSeries.id)
                  : [];
              const episodeIdsToMonitor = episodes
                .filter(
                  (ep) => fallbackSeasons.has(ep.seasonNumber) && !ep.monitored
                )
                .map((ep) => ep.id);

              if (episodeIdsToMonitor.length > 0) {
                logger.debug(
                  'Re-monitoring unmonitored episodes for requested seasons.',
                  {
                    label: 'Sonarr',
                    seriesId: updatedSeries.id,
                    episodeCount: episodeIdsToMonitor.length,
                  }
                );
                await this.monitorEpisodes(episodeIdsToMonitor);
              }
            } catch (e) {
              logger.warn('Failed to re-monitor episodes', {
                label: 'Sonarr',
                errorMessage: e.message,
                seriesId: updatedSeries.id,
              });
            }
          }

          if (options.searchNow && !options.episodeSelections) {
            await this.searchSeries(updatedSeries.id);
          }

          return updatedSeries;
        } else {
          logger.error('Failed to update series in Sonarr', {
            label: 'Sonarr',
            options,
          });
          throw new Error('Failed to update series in Sonarr');
        }
      }

      const createSeriesPayload: Partial<SonarrSeries> = {
        tvdbId: options.tvdbid,
        title: options.title,
        qualityProfileId: options.profileId,
        seasons: this.buildSeasonList(
          fullySelectedSeasons,
          series.seasons.map((season) => ({
            seasonNumber: season.seasonNumber,
            // We force all seasons to false if its the first request
            monitored: false,
          }))
        ),
        tags: options.tags,
        seasonFolder: options.seasonFolder,
        monitored: options.monitored,
        monitorNewItems: options.monitorNewItems,
        rootFolderPath: options.rootFolderPath,
        seriesType: options.seriesType,
        addOptions: {
          ignoreEpisodesWithFiles: true,
          searchForMissingEpisodes:
            options.searchNow && !options.episodeSelections,
        },
      };
      if (apiVersion === 'v3' && options.languageProfileId !== undefined) {
        createSeriesPayload.languageProfileId = options.languageProfileId;
      }
      if (apiVersion === 'v5') {
        // V5 requires both fields even when no request override is selected.
        // Lookup can return a language and available orders without a seasonType.
        createSeriesPayload.language =
          metadataLanguage ??
          series.language ??
          series.originalLanguage ??
          (await this.getMetadataLanguages()).find(
            (language) => language.id === 1
          );
        const seasonType =
          options.seasonType ??
          (options.defaults?.defaultSeasonType === 'official'
            ? 'official'
            : series.seasonType);
        createSeriesPayload.seasonType =
          !seasonType || seasonType === 'standard' ? 'official' : seasonType;
      }

      const createdSeriesResponse = await this.request<SonarrSeries>(
        'POST',
        '/series',
        createSeriesPayload
      );
      const createdSeries = requireSonarrSeries(
        isRecord(createdSeriesResponse.data)
          ? {
              tvdbId: options.tvdbid,
              title: options.title,
              ...(createdSeriesResponse.data as unknown as Record<
                string,
                unknown
              >),
            }
          : createdSeriesResponse.data
      );

      if (createdSeries.id) {
        logger.info('Sonarr accepted request', { label: 'Sonarr' });
        logger.debug('Sonarr add details', {
          label: 'Sonarr',
          series: createdSeries,
        });
        if (options.episodeSelections) {
          await this.applyEpisodeSelections(
            createdSeries.id,
            options.episodeSelections,
            options.searchNow ?? false
          );
        }
      } else {
        logger.error('Failed to add series to Sonarr', {
          label: 'Sonarr',
          options,
        });
        throw new Error('Failed to add series to Sonarr');
      }

      return createdSeries;
    } catch (e) {
      if (isConflictError(e)) {
        const existingSeries = await this.recoverExistingSeries(options).catch(
          (recoveryError) => {
            logger.warn(
              'Failed to recover existing Sonarr series after conflict.',
              {
                label: 'Sonarr API',
                errorMessage:
                  recoveryError instanceof Error
                    ? recoveryError.message
                    : 'Unknown recovery error',
                options,
              }
            );

            return undefined;
          }
        );

        if (existingSeries) {
          return existingSeries;
        }
      }

      logger.error('Something went wrong while adding a series to Sonarr.', {
        label: 'Sonarr API',
        errorMessage: e.message,
        options,
        response: redactSecrets(e?.response?.data),
      });
      throw new Error('Failed to add series', { cause: e });
    }
  }

  private async recoverExistingSeries(
    options: AddSeriesOptions
  ): Promise<SonarrSeries | undefined> {
    const series = (await this.getSeries()).find(
      (item) => item.tvdbId === options.tvdbid
    );

    if (!series?.id) {
      return undefined;
    }

    logger.warn('Recovered existing Sonarr series after add conflict.', {
      label: 'Sonarr API',
      seriesId: series.id,
      seriesTitle: series.title,
      tvdbId: series.tvdbId,
    });

    series.monitored = options.monitored ?? series.monitored;
    series.tags = options.tags
      ? Array.from(new Set([...series.tags, ...options.tags]))
      : series.tags;
    const fullySelectedSeasons = options.episodeSelections
      ? options.episodeSelections
          .filter((selection) => selection.episodeNumbers === undefined)
          .map((selection) => selection.seasonNumber)
      : options.seasons;
    series.seasons = this.buildSeasonList(fullySelectedSeasons, series.seasons);

    const response = await this.request<SonarrSeries>('PUT', '/series', series);

    const updatedSeries = requireSonarrSeries(
      isRecord(response.data) ? { ...series, ...response.data } : response.data
    );
    if (options.episodeSelections && updatedSeries.id) {
      await this.applyEpisodeSelections(
        updatedSeries.id,
        options.episodeSelections,
        options.searchNow ?? false
      );
    } else if (options.searchNow && updatedSeries.id) {
      await this.searchSeries(updatedSeries.id);
    }

    return updatedSeries;
  }

  public async getLanguageProfiles(): Promise<LanguageProfile[]> {
    try {
      const data = await this.getRolling<LanguageProfile[]>(
        '/languageprofile',
        undefined,
        3600
      );

      return sanitizeSonarrLanguageProfiles(data);
    } catch (e) {
      logger.error(
        'Something went wrong while retrieving Sonarr language profiles.',
        {
          label: 'Sonarr API',
          errorMessage: e.message,
        }
      );

      throw new Error('Failed to get language profiles', { cause: e });
    }
  }

  public async getMetadataLanguages(): Promise<SonarrMetadataLanguage[]> {
    if ((await this.getApiVersion()) !== 'v5') return [];
    try {
      const response = await this.request<unknown>('GET', '/language');
      return sanitizeServarrRecordArray<Record<string, unknown>>(
        response.data,
        MAX_SERVARR_CONFIGURATION_RESULTS
      ).flatMap((item) => {
        const language = sanitizeSonarrMetadataLanguage(item);
        return language ? [language] : [];
      });
    } catch (e) {
      logger.error('Unable to retrieve Sonarr metadata languages.', {
        label: 'Sonarr API',
        errorMessage: e instanceof Error ? e.message : String(e),
      });
      throw new Error('Failed to get metadata languages', { cause: e });
    }
  }

  public async getSeriesHistory(
    seriesId: number,
    limit = 20
  ): Promise<SonarrHistoryEvent[] | undefined> {
    if (!Number.isSafeInteger(seriesId) || seriesId <= 0) {
      throw new Error('A valid Sonarr series ID is required.');
    }
    if ((await this.getApiVersion()) !== 'v5') return undefined;
    try {
      const response = await this.request<unknown>(
        'GET',
        '/history/series',
        undefined,
        {
          params: { seriesId },
          maxContentLength: MAX_SERVARR_LIBRARY_RESPONSE_BYTES,
        }
      );
      return sanitizeSonarrHistory(response.data).slice(
        0,
        Math.max(1, Math.min(limit, 100))
      );
    } catch (e) {
      logger.error('Unable to retrieve Sonarr series history.', {
        label: 'Sonarr API',
        errorMessage: e instanceof Error ? e.message : String(e),
        seriesId,
      });
      throw new Error('Failed to get series history', { cause: e });
    }
  }

  public async searchSeries(seriesId: number): Promise<void> {
    return this.executeSeriesSearch(seriesId, false);
  }

  /** Run a series search and let callers handle a provider command failure. */
  public async searchSeriesOrThrow(seriesId: number): Promise<void> {
    return this.executeSeriesSearch(seriesId, true);
  }

  private async executeSeriesSearch(
    seriesId: number,
    throwOnError: boolean
  ): Promise<void> {
    logger.info('Executing series search command.', {
      label: 'Sonarr API',
      seriesId,
    });

    try {
      await this.runCommand('MissingEpisodeSearch', { seriesId });
    } catch (e) {
      logger.error(
        'Something went wrong while executing Sonarr missing episode search.',
        {
          label: 'Sonarr API',
          errorMessage: e.message,
          seriesId,
        }
      );
      if (throwOnError) {
        throw new Error('Failed to execute Sonarr series search.', {
          cause: e,
        });
      }
    }
  }

  public async getEpisodes(
    seriesId: number,
    includeEpisodeFile = false
  ): Promise<EpisodeResult[]> {
    try {
      const response = await this.request<EpisodeResult[]>(
        'GET',
        '/episode',
        undefined,
        {
          params: {
            seriesId,
            ...(includeEpisodeFile ? { includeEpisodeFile: true } : {}),
          },
        }
      );
      return sanitizeServarrRecordArray<Record<string, unknown>>(
        response.data,
        MAX_SERVARR_LIBRARY_RESULTS
      ).flatMap((episode) => {
        const normalized = sanitizeSonarrEpisode(episode);
        return normalized ? [normalized] : [];
      });
    } catch (e) {
      logger.error('Failed to retrieve episodes', {
        label: 'Sonarr API',
        errorMessage: e.message,
        seriesId,
      });
      throw new Error('Failed to get episodes', { cause: e });
    }
  }

  public async getEpisodeFiles(seriesId: number): Promise<SonarrEpisodeFile[]> {
    try {
      const response = await this.request<unknown[]>(
        'GET',
        '/episodefile',
        undefined,
        { params: { seriesId } }
      );
      return sanitizeServarrRecordArray<Record<string, unknown>>(
        response.data,
        MAX_SERVARR_LIBRARY_RESULTS
      ).flatMap((file) => {
        const normalized = sanitizeSonarrEpisodeFile(file);
        return normalized ? [normalized] : [];
      });
    } catch (error) {
      throw new Error(
        `[Sonarr] Failed to retrieve episode files: ${error.message}`,
        {
          cause: error,
        }
      );
    }
  }

  public async setSeasonMonitoring(
    seriesId: number,
    seasonNumber: number,
    monitored = true
  ): Promise<boolean> {
    if (!Number.isSafeInteger(seriesId) || seriesId <= 0) {
      throw new Error('Invalid Sonarr series ID.');
    }
    if (!Number.isSafeInteger(seasonNumber) || seasonNumber < 0) {
      throw new Error('Invalid Sonarr season number.');
    }
    if ((await this.getApiVersion()) !== 'v5') return false;

    try {
      await this.request('PUT', `/series/${seriesId}/season`, {
        seasonNumber,
        monitored,
      });
      return true;
    } catch (error) {
      if (responseStatus(error) === 404) return false;
      throw error;
    }
  }

  public async monitorEpisodes(episodeIds: number[]): Promise<void> {
    try {
      const normalizedEpisodeIds = Array.from(
        new Set(
          episodeIds
            .slice(0, MAX_SERVARR_LIBRARY_RESULTS)
            .filter(
              (id) => Number.isSafeInteger(id) && id > 0 && id <= 1_000_000_000
            )
        )
      );
      if (normalizedEpisodeIds.length === 0) {
        return;
      }
      await this.request('PUT', '/episode/monitor', {
        episodeIds: normalizedEpisodeIds,
        monitored: true,
      });
    } catch (e) {
      logger.error('Failed to monitor episodes', {
        label: 'Sonarr API',
        errorMessage: e.message,
        episodeIds,
      });
      throw new Error('Failed to monitor episodes', { cause: e });
    }
  }

  public async searchEpisodes(episodeIds: number[]): Promise<void> {
    const normalizedEpisodeIds = Array.from(
      new Set(
        episodeIds
          .slice(0, MAX_SERVARR_LIBRARY_RESULTS)
          .filter(
            (id) => Number.isSafeInteger(id) && id > 0 && id <= 1_000_000_000
          )
      )
    );
    if (normalizedEpisodeIds.length === 0) {
      return;
    }
    await this.runCommand('EpisodeSearch', {
      episodeIds: normalizedEpisodeIds,
    });
  }

  private async applyEpisodeSelections(
    seriesId: number,
    selections: SeasonEpisodeSelection[],
    searchNow: boolean
  ): Promise<void> {
    const fallbackSeasons = new Set<number>();
    const fullSeasonNumbers = new Set(
      selections
        .filter((selection) => selection.episodeNumbers === undefined)
        .map((selection) => selection.seasonNumber)
    );
    for (const seasonNumber of fullSeasonNumbers) {
      if (!(await this.setSeasonMonitoring(seriesId, seasonNumber))) {
        fallbackSeasons.add(seasonNumber);
      }
    }

    const needsEpisodeDetails =
      searchNow ||
      fallbackSeasons.size > 0 ||
      selections.some((selection) => selection.episodeNumbers !== undefined);
    if (!needsEpisodeDetails) return;

    const episodes = await this.getEpisodes(seriesId);
    const selectedEpisodes = episodes.filter((episode) => {
      const selection = selections.find(
        (item) => item.seasonNumber === episode.seasonNumber
      );
      return (
        !!selection &&
        (selection.episodeNumbers === undefined ||
          selection.episodeNumbers.includes(episode.episodeNumber))
      );
    });
    const episodeIdsToMonitor = selectedEpisodes
      .filter((episode) => {
        const selection = selections.find(
          (item) => item.seasonNumber === episode.seasonNumber
        );
        return (
          !episode.monitored &&
          (fallbackSeasons.has(episode.seasonNumber) ||
            selection?.episodeNumbers !== undefined)
        );
      })
      .map((episode) => episode.id);
    if (episodeIdsToMonitor.length > 0) {
      await this.monitorEpisodes(episodeIdsToMonitor);
    }
    if (searchNow) {
      await this.searchEpisodes(
        selectedEpisodes
          .filter((episode) => !episode.hasFile)
          .map((episode) => episode.id)
      );
    }
  }

  private buildSeasonList(
    seasons: number[],
    existingSeasons?: SonarrSeason[]
  ): SonarrSeason[] {
    if (existingSeasons) {
      const newSeasons = existingSeasons.map((season) => {
        if (seasons.includes(season.seasonNumber)) {
          season.monitored = true;
        }
        return season;
      });

      return newSeasons;
    }

    const newSeasons = seasons.map((seasonNumber): SonarrSeason => ({
      seasonNumber,
      monitored: true,
    }));

    return newSeasons;
  }

  private buildSeriesUpdatePayload(
    series: SonarrSeries
  ): Record<string, unknown> {
    const payload = { ...series } as unknown as Record<string, unknown>;
    delete payload.profileId;
    delete payload.seasonCount;
    delete payload.lastInfoSync;
    return payload;
  }

  public removeSeries = async (tvdbId: number): Promise<void> => {
    const { id, title } = await this.getSeriesByTvdbId(tvdbId);

    if (!id) {
      logger.info(`[Sonarr] Series not in library, nothing to remove`, {
        tvdbId,
      });
      return;
    }

    try {
      await this.request('DELETE', `/series/${id}`, undefined, {
        params: {
          deleteFiles: true,
          addImportExclusion: false,
        },
      });
      logger.info(`[Sonarr] Removed series ${title}`);
    } catch (e) {
      if (e?.response?.status === 404) {
        logger.info(`[Sonarr] Series already removed from Sonarr`, {
          tvdbId,
        });
        return;
      }
      throw e;
    }
  };

  public async removeSeriesById(id: number): Promise<void> {
    if (!Number.isSafeInteger(id) || id <= 0)
      throw new Error('Invalid series ID.');
    await this.request('DELETE', `/series/${id}`, undefined, {
      params: { deleteFiles: true, addImportExclusion: false },
    });
  }

  public clearCache = ({
    tvdbId,
    externalId,
    title,
  }: {
    tvdbId?: number | null;
    externalId?: number | null;
    title?: string | null;
  }) => {
    if (tvdbId) {
      this.removeCache('/series/lookup', {
        term: `tvdb:${tvdbId}`,
      });
    }
    if (externalId) {
      this.removeCache(`/series/${externalId}`);
    }
    if (title) {
      this.removeCache('/series/lookup', {
        term: title,
      });
    }
  };
}

export default SonarrAPI;
