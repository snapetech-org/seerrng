import ExternalAPI from '@server/api/externalapi';
import type { TvShowProvider } from '@server/api/provider';
import TheMovieDb from '@server/api/themoviedb';
import type {
  TmdbSeasonWithEpisodes,
  TmdbTvDetails,
  TmdbTvEpisodeResult,
  TmdbTvSeasonResult,
} from '@server/api/themoviedb/interfaces';
import {
  TVDB_SOURCE_TYPE_TMDB_TV,
  convertTmdbLanguageToTvdbWithFallback,
  type TvdbBaseResponse,
  type TvdbEpisode,
  type TvdbLoginResponse,
  type TvdbOfficialSeason,
  type TvdbSearchByRemoteIdResult,
  type TvdbSeasonDetails,
  type TvdbSeriesBaseRecord,
  type TvdbTvDetails,
  type TvdbVideoMetadataRecord,
} from '@server/api/tvdb/interfaces';
import cacheManager, { type AvailableCacheIds } from '@server/lib/cache';
import logger from '@server/logger';
import { redactSecrets } from '@server/utils/security';

interface TvdbConfig {
  baseUrl: string;
  maxRequestsPerSecond: number;
  maxRequests: number;
  cachePrefix: AvailableCacheIds;
}

const DEFAULT_CONFIG: TvdbConfig = {
  baseUrl: 'https://api4.thetvdb.com/v4',
  maxRequestsPerSecond: 50,
  maxRequests: 20,
  cachePrefix: 'tvdb' as const,
};

const enum TvdbIdStatus {
  INVALID = -1,
}

const MAX_TVDB_TOKEN_LENGTH = 8 * 1024;
const MAX_TVDB_TOKEN_PAYLOAD_LENGTH = 4 * 1024;
const TVDB_TOKEN_REFRESH_WINDOW_SECONDS = 604_800;
const MAX_TVDB_REMOTE_ID_CANDIDATES = 25;
const MAX_TVDB_SEASONS_FOR_REQUEST_CHECK = 500;
const MAX_TVDB_EPISODES_FOR_REQUEST_CHECK = 50_000;
export const MAX_TVDB_EPISODES_PER_SEASON = 2_500;
export const MAX_TVDB_EPISODE_PAGES = 50;

export const hasTvdbSeasonTranslation = (
  translations: unknown,
  wantedLanguage: string,
  fallbackLanguage: string
): boolean =>
  Array.isArray(translations) &&
  translations.some(
    (translation) =>
      translation === wantedLanguage || translation === fallbackLanguage
  );

type TvdbId = number;
type ValidTvdbId = Exclude<TvdbId, TvdbIdStatus.INVALID>;

export const tvdbTokenNeedsRefresh = (
  token: string | undefined,
  nowSeconds = Math.floor(Date.now() / 1000)
) => {
  if (!token || token.length > MAX_TVDB_TOKEN_LENGTH) {
    return true;
  }

  const [, base64Url] = token.split('.');
  if (!base64Url || base64Url.length > MAX_TVDB_TOKEN_PAYLOAD_LENGTH) {
    return true;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(base64Url, 'base64url').toString('utf8')
    ) as { exp?: unknown };

    if (typeof payload.exp !== 'number' || !Number.isFinite(payload.exp)) {
      return true;
    }

    return payload.exp - nowSeconds < TVDB_TOKEN_REFRESH_WINDOW_SECONDS;
  } catch {
    return true;
  }
};

export const sanitizeTvdbLoginResponse = (
  value: unknown
): TvdbLoginResponse => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('TVDB returned an invalid login response');
  }
  const token = (value as Record<string, unknown>).token;
  if (
    typeof token !== 'string' ||
    token.length === 0 ||
    token.length > MAX_TVDB_TOKEN_LENGTH
  ) {
    throw new Error('TVDB returned an invalid login response');
  }
  return { token };
};

class Tvdb extends ExternalAPI implements TvShowProvider {
  private static instance: Tvdb | undefined;
  private static initialization: Promise<Tvdb> | undefined;
  private readonly tmdb: TheMovieDb;
  private static readonly DEFAULT_CACHE_TTL = 43200;
  private static readonly DEFAULT_LANGUAGE = 'eng';
  private token: string;
  private pin?: string;

  constructor(pin?: string) {
    const finalConfig = { ...DEFAULT_CONFIG };
    super(
      finalConfig.baseUrl,
      {},
      {
        nodeCache: cacheManager.getCache(finalConfig.cachePrefix).data,
        rateLimit: {
          maxRequests: finalConfig.maxRequests,
          maxRPS: finalConfig.maxRequestsPerSecond,
        },
      }
    );
    this.pin = pin;
    this.tmdb = new TheMovieDb();
  }

  public static async getInstance(): Promise<Tvdb> {
    if (this.instance) {
      return this.instance;
    }
    if (this.initialization) {
      return this.initialization;
    }

    const instance = new Tvdb();
    const initialization = instance.login().then(() => {
      this.instance = instance;
      return instance;
    });
    this.initialization = initialization;

    try {
      return await initialization;
    } finally {
      if (this.initialization === initialization) {
        this.initialization = undefined;
      }
    }
  }

  private async refreshToken(): Promise<void> {
    try {
      if (tvdbTokenNeedsRefresh(this.token)) {
        await this.login();
      }
    } catch (error) {
      this.handleError('Failed to refresh token', error);
    }
  }

  public async test(): Promise<void> {
    try {
      await this.login();
    } catch (error) {
      this.handleError('Login failed', error);
      throw error;
    }
  }

  /** Fetch a source-native movie or series record without consulting TMDB. */
  public async getVideoMetadataById({
    mediaType,
    id,
  }: {
    mediaType: 'movie' | 'tv';
    id: number;
  }): Promise<TvdbVideoMetadataRecord> {
    if (!Number.isSafeInteger(id) || id <= 0) {
      throw new Error('Invalid TVDB metadata ID');
    }

    await this.refreshToken();
    if (mediaType === 'tv') {
      const response = await this.get<TvdbBaseResponse<TvdbTvDetails>>(
        `/series/${id}/extended`,
        { headers: { Authorization: `Bearer ${this.token}` } },
        Tvdb.DEFAULT_CACHE_TTL
      );
      return response.data as unknown as TvdbVideoMetadataRecord;
    }

    const response = await this.get<TvdbBaseResponse<TvdbVideoMetadataRecord>>(
      `/movies/${id}/extended`,
      { headers: { Authorization: `Bearer ${this.token}` } },
      Tvdb.DEFAULT_CACHE_TTL
    );
    return response.data;
  }

  /** Resolve only a TVDB series that confirms the exact TMDB TV remote ID. */
  public async resolveTvdbId(tmdbId: number): Promise<number | undefined> {
    if (!Number.isSafeInteger(tmdbId) || tmdbId <= 0) {
      return undefined;
    }

    try {
      await this.refreshToken();
      const response = await this.get<
        TvdbBaseResponse<TvdbSearchByRemoteIdResult[]>
      >(
        `/search/remoteid/${tmdbId}`,
        { headers: { Authorization: `Bearer ${this.token}` } },
        Tvdb.DEFAULT_CACHE_TTL
      );
      if (
        !Array.isArray(response?.data) ||
        response.data.length > MAX_TVDB_REMOTE_ID_CANDIDATES
      ) {
        return undefined;
      }

      const candidateIds = [
        ...new Set(
          response.data.flatMap((result) => {
            const id = result?.series?.id;
            return typeof id === 'number' && Number.isSafeInteger(id) && id > 0
              ? [id]
              : [];
          })
        ),
      ];
      if (
        candidateIds.length === 0 ||
        candidateIds.length > MAX_TVDB_REMOTE_ID_CANDIDATES
      ) {
        return undefined;
      }

      const verifiedIds: number[] = [];
      for (const candidateId of candidateIds) {
        const candidate = await this.fetchTvdbSeriesBaseRecord(candidateId);
        if (
          candidate?.id !== candidateId ||
          !Array.isArray(candidate.remoteIds)
        ) {
          return undefined;
        }

        const confirmsRequestedSeries = candidate.remoteIds.some(
          (remoteId) =>
            remoteId?.type === TVDB_SOURCE_TYPE_TMDB_TV &&
            String(remoteId.id) === String(tmdbId)
        );
        if (confirmsRequestedSeries) {
          verifiedIds.push(candidateId);
          if (verifiedIds.length > 1) {
            return undefined;
          }
        }
      }

      return verifiedIds.length === 1 ? verifiedIds[0] : undefined;
    } catch (error) {
      logger.debug('TVDB remote-ID lookup did not resolve a unique series', {
        label: 'TVDB',
        tmdbId,
        errorMessage:
          error instanceof Error
            ? redactSecrets(error.message)
            : 'Unknown error',
      });
      return undefined;
    }
  }

  /** Return confirmed official TVDB seasons, or null when the record is incomplete. */
  public async getOfficialSeasons(
    tvdbId: number
  ): Promise<TvdbOfficialSeason[] | null> {
    if (!Number.isSafeInteger(tvdbId) || tvdbId <= 0) {
      return null;
    }

    await this.refreshToken();
    const tvdbData = await this.fetchTvdbShowData(tvdbId);
    if (
      tvdbData?.id !== tvdbId ||
      !Array.isArray(tvdbData.seasons) ||
      !Array.isArray(tvdbData.episodes) ||
      tvdbData.seasons.length > MAX_TVDB_SEASONS_FOR_REQUEST_CHECK ||
      tvdbData.episodes.length > MAX_TVDB_EPISODES_FOR_REQUEST_CHECK
    ) {
      return null;
    }

    return tvdbData.seasons
      .filter(
        (season) =>
          season?.type?.type === 'official' &&
          Number.isSafeInteger(season.number) &&
          season.number > 0
      )
      .sort((left, right) => left.number - right.number)
      .map((season) => {
        const seasonYear = Number(season.year);
        if (
          Number.isSafeInteger(seasonYear) &&
          seasonYear > 0 &&
          seasonYear < 10_000
        ) {
          return { seasonNumber: season.number, year: seasonYear };
        }

        let firstAiredYear: number | null = null;
        for (const episode of tvdbData.episodes) {
          if (episode?.seasonNumber !== season.number) {
            continue;
          }

          const year = Number(episode.aired?.slice(0, 4));
          if (
            Number.isSafeInteger(year) &&
            year > 0 &&
            year < 10_000 &&
            (firstAiredYear === null || year < firstAiredYear)
          ) {
            firstAiredYear = year;
          }
        }

        return {
          seasonNumber: season.number,
          year: firstAiredYear,
        };
      });
  }

  /** Resolve a TMDB ID through TVDB's remote-ID index without calling TMDB. */
  public async getVideoMetadataByTmdbId({
    mediaType,
    tmdbId,
  }: {
    mediaType: 'movie' | 'tv';
    tmdbId: number;
  }): Promise<TvdbVideoMetadataRecord | undefined> {
    if (!Number.isSafeInteger(tmdbId) || tmdbId <= 0) {
      throw new Error('Invalid TMDB metadata ID');
    }

    if (mediaType === 'tv') {
      const tvdbId = await this.resolveTvdbId(tmdbId);
      return tvdbId
        ? this.getVideoMetadataById({ mediaType, id: tvdbId })
        : undefined;
    }

    await this.refreshToken();
    const response = await this.get<
      TvdbBaseResponse<TvdbVideoMetadataRecord[]>
    >(
      `/search/remoteid/${tmdbId}`,
      { headers: { Authorization: `Bearer ${this.token}` } },
      Tvdb.DEFAULT_CACHE_TTL
    );
    const matches = Array.isArray(response.data)
      ? response.data.filter(
          (item) =>
            Number.isSafeInteger(item?.id) &&
            item.id > 0 &&
            item.type?.toLocaleLowerCase() === 'movie'
        )
      : [];

    return matches.length === 1 ? matches[0] : undefined;
  }

  /** Search TVDB's native catalogue; these results do not depend on TMDB. */
  public async searchVideoMetadata({
    query,
    mediaType,
  }: {
    query: string;
    mediaType: 'movie' | 'tv';
  }): Promise<TvdbVideoMetadataRecord[]> {
    const normalizedQuery = query.trim();
    if (!normalizedQuery || normalizedQuery.length > 200) {
      return [];
    }

    await this.refreshToken();
    const response = await this.get<
      TvdbBaseResponse<TvdbVideoMetadataRecord[]>
    >(
      '/search',
      {
        params: {
          query: normalizedQuery,
          type: mediaType === 'tv' ? 'series' : 'movie',
        },
        headers: { Authorization: `Bearer ${this.token}` },
      },
      Tvdb.DEFAULT_CACHE_TTL
    );

    return Array.isArray(response.data)
      ? response.data
          .filter(
            (item) =>
              Number.isSafeInteger(item?.id) &&
              item.id > 0 &&
              typeof item.name === 'string' &&
              item.name.trim().length > 0
          )
          .slice(0, 20)
      : [];
  }

  /** Official lists only: personal watchlists are not franchise metadata. */
  public async getSeriesCollections(
    tvdbId: number
  ): Promise<{ id: number; name: string }[]> {
    if (!Number.isSafeInteger(tvdbId) || tvdbId <= 0)
      throw new Error('Invalid series ID');
    await this.refreshToken();
    const response = await this.get<{
      data: { lists?: { id: number; name: string; isOfficial: boolean }[] };
    }>(
      `/series/${tvdbId}/extended`,
      { headers: { Authorization: `Bearer ${this.token}` } },
      3600
    );
    if (!response.data || !Array.isArray(response.data.lists))
      throw new Error('Unverified series collections');
    return response.data.lists
      .filter(
        (list) =>
          list.isOfficial === true &&
          Number.isSafeInteger(list.id) &&
          list.id > 0 &&
          typeof list.name === 'string'
      )
      .slice(0, 50)
      .map(({ id, name }) => ({ id, name: name.slice(0, 512) }));
  }

  public async getSeriesCollection(id: number): Promise<{
    id: number;
    name: string;
    overview: string;
    seriesIds: number[];
  }> {
    if (!Number.isSafeInteger(id) || id <= 0)
      throw new Error('Invalid collection ID');
    await this.refreshToken();
    const response = await this.get<{
      data: {
        id: number;
        name: string;
        overview?: string;
        isOfficial: boolean;
        entities: { seriesId?: number; order: number }[];
      };
    }>(
      `/lists/${id}/extended`,
      { headers: { Authorization: `Bearer ${this.token}` } },
      3600
    );
    const list = response.data;
    if (
      !list ||
      list.id !== id ||
      list.isOfficial !== true ||
      typeof list.name !== 'string' ||
      !Array.isArray(list.entities) ||
      list.entities.length > 500
    )
      throw new Error('Unverified official collection');
    return {
      id,
      name: list.name.slice(0, 512),
      overview: (list.overview || '').slice(0, 20000),
      seriesIds: [
        ...new Set(
          list.entities
            .slice()
            .sort((a, b) => a.order - b.order)
            .map((entry) => entry.seriesId)
            .filter(
              (value): value is number =>
                Number.isSafeInteger(value) && Number(value) > 0
            )
        ),
      ],
    };
  }

  async login(): Promise<TvdbLoginResponse> {
    let body: { apiKey: string; pin?: string } = {
      apiKey: 'd00d9ecb-a9d0-4860-958a-74b14a041405',
    };

    if (this.pin) {
      body = {
        ...body,
        pin: this.pin,
      };
    }

    const response = await this.post<TvdbBaseResponse<unknown>>('/login', {
      ...body,
    });

    const loginResponse = sanitizeTvdbLoginResponse(response.data);
    this.token = loginResponse.token;

    return loginResponse;
  }

  public async getShowByTvdbId({
    tvdbId,
    language,
  }: {
    tvdbId: number;
    language?: string;
  }): Promise<TmdbTvDetails> {
    try {
      const tmdbTvShow = await this.tmdb.getShowByTvdbId({
        tvdbId: tvdbId,
        language,
      });

      try {
        await this.refreshToken();

        const validTvdbId = await this.getTvdbIdFromTmdb(tmdbTvShow);

        if (this.isValidTvdbId(validTvdbId)) {
          return this.enrichTmdbShowWithTvdbData(tmdbTvShow, validTvdbId);
        }

        return tmdbTvShow;
      } catch {
        return tmdbTvShow;
      }
    } catch (error) {
      this.handleError('Failed to fetch TV show details', error);
      throw error;
    }
  }

  public async getTvShow({
    tvId,
    language,
  }: {
    tvId: number;
    language?: string;
  }): Promise<TmdbTvDetails> {
    try {
      const tmdbTvShow = await this.tmdb.getTvShow({ tvId, language });

      try {
        await this.refreshToken();

        const tvdbId = await this.getTvdbIdFromTmdb(tmdbTvShow);

        if (this.isValidTvdbId(tvdbId)) {
          return await this.enrichTmdbShowWithTvdbData(tmdbTvShow, tvdbId);
        }

        return tmdbTvShow;
      } catch (error) {
        this.handleError('Failed to fetch TV show details', error);
        return tmdbTvShow;
      }
    } catch (error) {
      this.handleError('Failed to fetch TV show details', error);
      return this.tmdb.getTvShow({ tvId, language });
    }
  }

  public async getTvSeason({
    tvId,
    seasonNumber,
    language = Tvdb.DEFAULT_LANGUAGE,
  }: {
    tvId: number;
    seasonNumber: number;
    language?: string;
  }): Promise<TmdbSeasonWithEpisodes> {
    try {
      const tmdbTvShow = await this.tmdb.getTvShow({ tvId, language });

      try {
        await this.refreshToken();

        const tvdbId = await this.getTvdbIdFromTmdb(tmdbTvShow);

        if (!this.isValidTvdbId(tvdbId)) {
          return await this.tmdb.getTvSeason({ tvId, seasonNumber, language });
        }

        return await this.getTvdbSeasonData(
          tvdbId,
          seasonNumber,
          tvId,
          language
        );
      } catch (error) {
        this.handleError('Failed to fetch TV season details', error);
        return await this.tmdb.getTvSeason({ tvId, seasonNumber, language });
      }
    } catch (error) {
      logger.error(
        `[TVDB] Failed to fetch TV season details: ${error.message}`
      );
      throw error;
    }
  }

  private async enrichTmdbShowWithTvdbData(
    tmdbTvShow: TmdbTvDetails,
    tvdbId: ValidTvdbId
  ): Promise<TmdbTvDetails> {
    const resolvedShow = {
      ...tmdbTvShow,
      external_ids: { ...tmdbTvShow.external_ids, tvdb_id: tvdbId },
    };

    try {
      await this.refreshToken();

      const tvdbData = await this.fetchTvdbShowData(tvdbId);
      const seasons = this.processSeasons(tvdbData);

      if (!seasons.length) {
        return resolvedShow;
      }

      return { ...resolvedShow, seasons };
    } catch (error) {
      logger.error('Failed to enrich TMDB show with TVDB data', {
        label: 'TVDB',
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      });
      return resolvedShow;
    }
  }

  private async fetchTvdbShowData(tvdbId: number): Promise<TvdbTvDetails> {
    const resp = await this.get<TvdbBaseResponse<TvdbTvDetails>>(
      `/series/${tvdbId}/extended?meta=episodes&short=true`,
      {
        headers: {
          Authorization: `Bearer ${this.token}`,
        },
      },
      Tvdb.DEFAULT_CACHE_TTL
    );

    return resp.data;
  }

  private async fetchTvdbSeriesBaseRecord(
    tvdbId: number
  ): Promise<TvdbSeriesBaseRecord> {
    const response = await this.get<TvdbBaseResponse<TvdbSeriesBaseRecord>>(
      `/series/${tvdbId}/extended`,
      {
        headers: {
          Authorization: `Bearer ${this.token}`,
        },
      },
      Tvdb.DEFAULT_CACHE_TTL
    );

    return response.data;
  }

  private processSeasons(tvdbData: TvdbTvDetails): TmdbTvSeasonResult[] {
    if (!tvdbData || !tvdbData.seasons || !tvdbData.episodes) {
      return [];
    }

    const seasons = tvdbData.seasons
      .filter((season) => season.type && season.type.type === 'official')
      .sort((a, b) => a.number - b.number)
      .map((season) => this.createSeasonData(season, tvdbData))
      .filter(
        (season) => season && season.season_number >= 0
      ) as TmdbTvSeasonResult[];

    return seasons;
  }

  private createSeasonData(
    season: TvdbSeasonDetails,
    tvdbData: TvdbTvDetails
  ): TmdbTvSeasonResult {
    const seasonNumber = season.number ?? -1;
    if (seasonNumber < 0) {
      return {
        id: 0,
        episode_count: 0,
        name: '',
        overview: '',
        season_number: -1,
        poster_path: '',
        air_date: '',
      };
    }

    const episodeCount = tvdbData.episodes.filter(
      (episode) => episode.seasonNumber === season.number
    ).length;

    return {
      id: tvdbData.id,
      episode_count: episodeCount,
      name: `${season.number}`,
      overview: '',
      season_number: season.number,
      poster_path: '',
      air_date: '',
    };
  }

  private async getTvdbSeasonData(
    tvdbId: number,
    seasonNumber: number,
    tvId: number,
    language: string = Tvdb.DEFAULT_LANGUAGE
  ): Promise<TmdbSeasonWithEpisodes> {
    const tvdbData = await this.fetchTvdbShowData(tvdbId);

    if (!tvdbData) {
      logger.error('Failed to fetch TVDB data', {
        label: 'TVDB API',
        tvdbId,
      });
      return this.createEmptySeasonResponse(tvId);
    }

    // get season id
    const season = tvdbData.seasons.find(
      (season) =>
        season.number === seasonNumber &&
        season.type.type &&
        season.type.type === 'official'
    );

    if (!season) {
      logger.error('Failed to find TVDB season', {
        label: 'TVDB API',
        seasonNumber,
        tvdbId,
      });
      return this.createEmptySeasonResponse(tvId);
    }

    const wantedTranslation = convertTmdbLanguageToTvdbWithFallback(
      language,
      Tvdb.DEFAULT_LANGUAGE
    );

    // check if translation is available for the season
    if (
      !hasTvdbSeasonTranslation(
        season.nameTranslations,
        wantedTranslation,
        Tvdb.DEFAULT_LANGUAGE
      )
    ) {
      return this.getSeasonWithOriginalLanguage(
        tvdbId,
        tvId,
        seasonNumber,
        season
      );
    }

    return this.getSeasonWithTranslation(
      tvdbId,
      tvId,
      seasonNumber,
      season,
      wantedTranslation
    );
  }

  private async getSeasonWithTranslation(
    tvdbId: number,
    tvId: number,
    seasonNumber: number,
    season: TvdbSeasonDetails,
    language: string
  ): Promise<TmdbSeasonWithEpisodes> {
    if (!season) {
      logger.error('Failed to find TVDB season', {
        label: 'TVDB API',
        seasonNumber,
        tvdbId,
      });
      return this.createEmptySeasonResponse(tvId);
    }

    const allEpisodes = [] as TvdbEpisode[];
    const episodeIds = new Set<number>();
    let page = 0;

    while (
      page < MAX_TVDB_EPISODE_PAGES &&
      allEpisodes.length < MAX_TVDB_EPISODES_PER_SEASON
    ) {
      const resp = await this.get<TvdbBaseResponse<TvdbSeasonDetails>>(
        `/series/${tvdbId}/episodes/default/${language}`,
        {
          headers: {
            Authorization: `Bearer ${this.token}`,
          },
          params: {
            page: page,
          },
        }
      );

      if (!resp?.data?.episodes) {
        logger.warn('No episodes found in TVDB response', {
          label: 'TVDB API',
          tvdbId,
          page,
          seasonNumber,
        });
        break;
      }

      const { episodes } = resp.data;

      if (!episodes) {
        logger.debug('No more episodes found in TVDB response', {
          label: 'TVDB API',
          tvdbId,
          page,
          seasonNumber,
        });
        break;
      }

      const previousEpisodeCount = allEpisodes.length;
      for (const episode of episodes) {
        if (!episodeIds.has(episode.id)) {
          episodeIds.add(episode.id);
          allEpisodes.push(episode);
        }

        if (allEpisodes.length >= MAX_TVDB_EPISODES_PER_SEASON) {
          break;
        }
      }

      const hasNextPage =
        resp.links?.next &&
        episodes.length > 0 &&
        allEpisodes.length > previousEpisodeCount;

      if (!hasNextPage) {
        break;
      }

      page++;
    }

    if (
      page >= MAX_TVDB_EPISODE_PAGES ||
      allEpisodes.length >= MAX_TVDB_EPISODES_PER_SEASON
    ) {
      logger.warn('Reached the TVDB episode retrieval limit', {
        label: 'TVDB API',
        tvdbId,
        seasonNumber,
        language,
      });
    }

    const episodes = this.processEpisodes(
      { ...season, episodes: allEpisodes },
      seasonNumber,
      tvId
    );

    return {
      episodes,
      external_ids: { tvdb_id: tvdbId },
      name: '',
      overview: '',
      id: season.id,
      air_date: season.firstAired,
      season_number: seasonNumber,
    };
  }

  private async getSeasonWithOriginalLanguage(
    tvdbId: number,
    tvId: number,
    seasonNumber: number,
    season: TvdbSeasonDetails
  ): Promise<TmdbSeasonWithEpisodes> {
    if (!season) {
      logger.error('Failed to find TVDB season', {
        label: 'TVDB API',
        seasonNumber,
        tvdbId,
      });
      return this.createEmptySeasonResponse(tvId);
    }

    const resp = await this.get<TvdbBaseResponse<TvdbSeasonDetails>>(
      `/seasons/${season.id}/extended`,
      {
        headers: {
          Authorization: `Bearer ${this.token}`,
        },
      }
    );

    const seasons = resp.data;

    const episodes = this.processEpisodes(seasons, seasonNumber, tvId);

    return {
      episodes,
      external_ids: { tvdb_id: tvdbId },
      name: '',
      overview: '',
      id: seasons.id,
      air_date: seasons.firstAired,
      season_number: seasonNumber,
    };
  }

  private processEpisodes(
    tvdbSeason: TvdbSeasonDetails,
    seasonNumber: number,
    tvId: number
  ): TmdbTvEpisodeResult[] {
    if (!tvdbSeason || !tvdbSeason.episodes) {
      logger.error('No episodes found in TVDB season data');
      return [];
    }

    return tvdbSeason.episodes
      .filter((episode) => episode.seasonNumber === seasonNumber)
      .slice(0, MAX_TVDB_EPISODES_PER_SEASON)
      .map((episode, index) => this.createEpisodeData(episode, index, tvId));
  }

  private createEpisodeData(
    episode: TvdbEpisode,
    index: number,
    tvId: number
  ): TmdbTvEpisodeResult {
    return {
      id: episode.id,
      air_date: episode.aired,
      episode_number: episode.number,
      name: episode.name || `Episode ${index + 1}`,
      overview: episode.overview || '',
      season_number: episode.seasonNumber,
      production_code: '',
      show_id: tvId,
      still_path:
        episode.image && !episode.image.startsWith('https://')
          ? 'https://artworks.thetvdb.com' + episode.image
          : '',
      vote_average: 1,
      vote_count: 1,
    };
  }

  private createEmptySeasonResponse(tvId: number): TmdbSeasonWithEpisodes {
    return {
      episodes: [],
      external_ids: { tvdb_id: tvId },
      name: '',
      overview: '',
      id: 0,
      air_date: '',
      season_number: 0,
    };
  }

  private async getTvdbIdFromTmdb(tmdbTvShow: TmdbTvDetails): Promise<TvdbId> {
    const directId = tmdbTvShow?.external_ids?.tvdb_id;
    if (
      typeof directId === 'number' &&
      Number.isSafeInteger(directId) &&
      directId > 0
    ) {
      return directId;
    }

    return (await this.resolveTvdbId(tmdbTvShow?.id)) ?? TvdbIdStatus.INVALID;
  }

  private isValidTvdbId(tvdbId: TvdbId): tvdbId is ValidTvdbId {
    return Number.isSafeInteger(tvdbId) && tvdbId > 0;
  }

  private handleError(context: string, error: Error): void {
    throw new Error(`[TVDB] ${context}: ${error.message}`);
  }
}

export default Tvdb;
