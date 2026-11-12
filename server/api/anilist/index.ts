// Adapted from selmant/foreseerr, copyright (c) 2026 Selman Trabzon. MIT licensed.
// See NOTICE.md for attribution and license terms.
import type {
  AnilistMedia,
  AnilistMediaListCollection,
  AnilistMediaListEntry,
  AnilistMediaListStatus,
  AnilistMediaPage,
  AnilistMediaSeason,
  AnilistMediaSort,
  AnilistMediaWithRelations,
  AnilistTokenResponse,
  AnilistTokenState,
  AnilistViewer,
} from '@server/api/anilist/interfaces';
import {
  ANILIST_GRAPHQL_URL,
  ANILIST_OAUTH_AUTHORIZE_URL,
  ANILIST_OAUTH_PIN_REDIRECT,
  ANILIST_OAUTH_TOKEN_URL,
} from '@server/api/anilist/interfaces';
import ExternalAPI from '@server/api/externalapi';
import cacheManager from '@server/lib/cache';
import logger from '@server/logger';
import { proxyRequestInterceptor } from '@server/utils/customProxyAgent';
import { userAgentRequestInterceptor } from '@server/utils/userAgent';
import axios from 'axios';
import {
  AnilistAuthError,
  AnilistGraphQLError,
  AnilistOutageError,
  AnilistRateLimitedError,
  classifyAnilistFailure,
  firstAnilistGraphQlError,
} from './failures';

export {
  AnilistAuthError,
  AnilistGraphQLError,
  AnilistOutageError,
  AnilistRateLimitedError,
  classifyAnilistFailure,
} from './failures';

const ANILIST_PAGE_SIZE = 20;
const ANILIST_TOKEN_TTL_FALLBACK_SECONDS = 365 * 24 * 60 * 60;
const PUBLIC_PAGE_CACHE_TTL_SECONDS = 300;

const MEDIA_FIELDS = `
  isAdult
  genres
  tags { name }
  id
  idMal
  title { romaji english native }
  format
  episodes
  seasonYear
  startDate { year }
  coverImage { large medium }
`;

const PAGE_MEDIA_QUERY = `
  query PageMedia(
    $page: Int
    $perPage: Int
    $sort: [MediaSort]
    $season: MediaSeason
    $seasonYear: Int
    $type: MediaType
  ) {
    Page(page: $page, perPage: $perPage) {
      pageInfo { currentPage hasNextPage lastPage perPage total }
      media(
        type: $type
        sort: $sort
        season: $season
        seasonYear: $seasonYear
      ) {
        ${MEDIA_FIELDS}
      }
    }
  }
`;

const VIEWER_QUERY = `
  query Viewer {
    Viewer { id name }
  }
`;

const MEDIA_LIST_COLLECTION_QUERY = `
  query MediaListCollection($userId: Int!) {
    MediaListCollection(userId: $userId, type: ANIME) {
      lists {
        name
        isCustomList
        status
        entries {
          id
          status
          progress
          score(format: POINT_10)
          scoreRaw: score(format: POINT_100)
          media { ${MEDIA_FIELDS} }
        }
      }
    }
  }
`;

const MEDIA_QUERY = `
  query Media($id: Int) {
    Media(id: $id, type: ANIME) { ${MEDIA_FIELDS} }
  }
`;

const MEDIA_RELATIONS_QUERY = `
  query MediaRelations($id: Int) {
    Media(id: $id) {
      ${MEDIA_FIELDS}
      type
      relations {
        edges {
          relationType
          node { ${MEDIA_FIELDS} type }
        }
      }
    }
  }
`;

const SEARCH_ANIME_QUERY = `
  query SearchAnime($search: String, $perPage: Int) {
    Page(page: 1, perPage: $perPage) {
      media(type: ANIME, search: $search, sort: SEARCH_MATCH) {
        ${MEDIA_FIELDS}
      }
    }
  }
`;

const MANGA_FIELDS = `
  id
  isAdult
  format
  status
  volumes
  countryOfOrigin
  popularity
  synonyms
  genres
  title { romaji english native }
  startDate { year }
  coverImage { extraLarge large medium }
`;

const SEARCH_MANGA_QUERY = `
  query SearchManga($search: String, $perPage: Int) {
    Page(page: 1, perPage: $perPage) {
      media(type: MANGA, search: $search, sort: SEARCH_MATCH) {
        ${MANGA_FIELDS}
      }
    }
  }
`;

// Browsing (the Comics page): manga and one-shots with an English licence
// AniList knows of. Unset filters must be left out of the variables: AniList
// answers an empty page when a filter variable is null.
const BROWSE_MANGA_QUERY = `
  query BrowseManga(
    $page: Int
    $perPage: Int
    $sort: [MediaSort]
    $genres: [String]
    $status: MediaStatus
    $licensedBy: [Int]
    $popularity: Int
  ) {
    Page(page: $page, perPage: $perPage) {
      pageInfo { currentPage hasNextPage }
      media(
        type: MANGA
        isAdult: false
        format_in: [MANGA, ONE_SHOT]
        status_not: NOT_YET_RELEASED
        sort: $sort
        genre_in: $genres
        status: $status
        licensedById_in: $licensedBy
        popularity_greater: $popularity
      ) {
        ${MANGA_FIELDS}
      }
    }
  }
`;

const MANGA_BY_ID_QUERY = `
  query MangaById($id: Int) {
    Media(id: $id, type: MANGA) {
      ${MANGA_FIELDS}
      description(asHtml: false)
    }
  }
`;

/**
 * AniList's external-link sources for English manga releases (print
 * publishers, and the publishers' own reading sites): Kodansha USA, Seven
 * Seas, SuBLime, TOKYOPOP (English), Yen Press, VIZ, K MANGA, Manga UP!
 * (Square Enix) and J-Novel Club. Browsing keeps to manga licensed by one of
 * them, so webtoons only read in Korean don't fill the page.
 */
export const ANILIST_ENGLISH_MANGA_SOURCES = [
  182, 184, 260, 259, 183, 132, 215, 199, 105,
];

export type AnilistMangaBrowseSort =
  'TRENDING_DESC' | 'POPULARITY_DESC' | 'START_DATE_DESC' | 'TITLE_ENGLISH';

export interface AnilistMangaSearchResult {
  id: number;
  isAdult?: boolean | null;
  format?: string | null;
  status?: string | null;
  volumes?: number | null;
  countryOfOrigin?: string | null;
  popularity?: number | null;
  synonyms?: string[] | null;
  genres?: string[] | null;
  description?: string | null;
  title?: {
    romaji?: string | null;
    english?: string | null;
    native?: string | null;
  } | null;
  startDate?: { year?: number | null } | null;
  coverImage?: {
    extraLarge?: string | null;
    large?: string | null;
    medium?: string | null;
  } | null;
}

const SAVE_MEDIA_LIST_ENTRY_MUTATION = `
  mutation SaveMediaListEntry(
    $mediaId: Int
    $status: MediaListStatus
    $scoreRaw: Int
    $progress: Int
  ) {
    SaveMediaListEntry(
      mediaId: $mediaId
      status: $status
      scoreRaw: $scoreRaw
      progress: $progress
    ) {
      id
      status
      progress
      score(format: POINT_10)
      scoreRaw: score(format: POINT_100)
      media { ${MEDIA_FIELDS} }
    }
  }
`;

const DELETE_MEDIA_LIST_ENTRY_MUTATION = `
  mutation DeleteMediaListEntry($id: Int) {
    DeleteMediaListEntry(id: $id) { deleted }
  }
`;

interface GraphQLResponse<T> {
  data?: T;
  errors?: { message?: string; status?: number }[];
}

interface AnilistAPIOptions {
  accessToken?: string;
}

class AnilistAPI extends ExternalAPI {
  private accessToken?: string;

  constructor(options: AnilistAPIOptions = {}) {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
    if (options.accessToken) {
      headers.Authorization = `Bearer ${options.accessToken}`;
    }

    super(
      ANILIST_GRAPHQL_URL,
      {},
      {
        headers,
        nodeCache: cacheManager.getCache('anilist').data,
        rateLimit: {
          maxRPS: 1,
          maxRequests: 90,
        },
        sharedRateLimit: {
          // Search/browse helpers construct clients per request; share the
          // one-request-per-second budget across those clients.
          key: 'anilist:graphql',
          limits: [{ maxRequests: 1, perMilliseconds: 1000 }],
        },
      }
    );

    this.accessToken = options.accessToken;
  }

  static buildAuthorizeUrl(clientId: string): string {
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: ANILIST_OAUTH_PIN_REDIRECT,
      response_type: 'code',
    });
    return `${ANILIST_OAUTH_AUTHORIZE_URL}?${params.toString()}`;
  }

  static async exchangePinCode(
    clientId: string,
    clientSecret: string,
    code: string
  ): Promise<AnilistTokenState> {
    const tokenClient = axios.create({
      maxRedirects: 0,
      maxContentLength: 8 * 1024 * 1024,
      maxBodyLength: 1024 * 1024,
      timeout: 15000,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    });
    tokenClient.interceptors.request.use(proxyRequestInterceptor);
    tokenClient.interceptors.request.use(userAgentRequestInterceptor);

    try {
      // The authorization code and client secret are intentionally sent to
      // AniList's fixed OAuth token endpoint.
      // codeql[js/file-access-to-http]
      const response = await tokenClient.post<AnilistTokenResponse>(
        ANILIST_OAUTH_TOKEN_URL,
        {
          grant_type: 'authorization_code',
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: ANILIST_OAUTH_PIN_REDIRECT,
          code,
        }
      );
      const accessToken = String(response.data?.access_token ?? '').trim();
      if (!accessToken) {
        throw new AnilistAuthError('AniList did not return an access token');
      }
      const expiresIn =
        Number(response.data.expires_in) > 0
          ? Number(response.data.expires_in)
          : ANILIST_TOKEN_TTL_FALLBACK_SECONDS;
      return {
        accessToken,
        expiresAt: Math.floor(Date.now() / 1000) + expiresIn,
      };
    } catch (e) {
      if (e instanceof AnilistAuthError) {
        throw e;
      }
      const status = axios.isAxiosError(e) ? e.response?.status : undefined;
      logger.warn('AniList PIN token exchange failed', {
        label: 'AniList API',
        status,
        errorMessage: e instanceof Error ? e.message : 'unknown error',
      });
      throw new AnilistAuthError(
        'Unable to exchange AniList authorization code'
      );
    }
  }

  static currentSeason(now = new Date()): {
    season: AnilistMediaSeason;
    year: number;
  } {
    const month = now.getMonth();
    const year = now.getFullYear();
    if (month <= 2) {
      return { season: 'WINTER', year };
    }
    if (month <= 5) {
      return { season: 'SPRING', year };
    }
    if (month <= 8) {
      return { season: 'SUMMER', year };
    }
    return { season: 'FALL', year };
  }

  static nextSeason(now = new Date()): {
    season: AnilistMediaSeason;
    year: number;
  } {
    const current = AnilistAPI.currentSeason(now);
    if (current.season === 'WINTER') {
      return { season: 'SPRING', year: current.year };
    }
    if (current.season === 'SPRING') {
      return { season: 'SUMMER', year: current.year };
    }
    if (current.season === 'SUMMER') {
      return { season: 'FALL', year: current.year };
    }
    return { season: 'WINTER', year: current.year + 1 };
  }

  async ping(): Promise<void> {
    // AniList rejects Page queries that only ask for pageInfo ("No field provided").
    await this.graphql<{
      Page: { pageInfo: { currentPage?: number }; media: { id: number }[] };
    }>(
      `query {
        Page(page: 1, perPage: 1) {
          pageInfo { currentPage }
          media { id }
        }
      }`,
      {},
      PUBLIC_PAGE_CACHE_TTL_SECONDS
    );
  }

  async getTrending(page = 1): Promise<AnilistMediaPage> {
    return this.getMediaPage(page, { sort: 'TRENDING_DESC' });
  }

  async getSeason(
    page = 1,
    season?: { season: AnilistMediaSeason; year: number }
  ): Promise<AnilistMediaPage> {
    const current = season ?? AnilistAPI.currentSeason();
    return this.getMediaPage(page, {
      sort: 'POPULARITY_DESC',
      season: current.season,
      seasonYear: current.year,
    });
  }

  async getPopular(page = 1): Promise<AnilistMediaPage> {
    return this.getMediaPage(page, { sort: 'POPULARITY_DESC' });
  }

  async getTop(page = 1): Promise<AnilistMediaPage> {
    return this.getMediaPage(page, { sort: 'SCORE_DESC' });
  }

  async getNextSeason(page = 1): Promise<AnilistMediaPage> {
    const next = AnilistAPI.nextSeason();
    return this.getMediaPage(page, {
      sort: 'POPULARITY_DESC',
      season: next.season,
      seasonYear: next.year,
    });
  }

  async getViewer(): Promise<AnilistViewer> {
    const data = await this.graphql<{ Viewer: AnilistViewer }>(
      VIEWER_QUERY,
      {},
      0
    );
    if (!data.Viewer?.id) {
      throw new AnilistAuthError('AniList Viewer query returned no user');
    }
    return data.Viewer;
  }

  async getMediaListCollection(
    userId: number
  ): Promise<AnilistMediaListCollection> {
    const data = await this.graphql<{
      MediaListCollection: AnilistMediaListCollection;
    }>(MEDIA_LIST_COLLECTION_QUERY, { userId }, 0);
    return {
      lists: data.MediaListCollection?.lists ?? [],
    };
  }

  async getMedia(id: number): Promise<AnilistMedia | null> {
    const data = await this.graphql<{ Media: AnilistMedia | null }>(
      MEDIA_QUERY,
      { id },
      0
    );
    return data.Media ?? null;
  }

  /**
   * One anime with its relationship edges (sequels, prequels, and the manga
   * or novel it adapts). Kept separate from MEDIA_FIELDS so list queries stay
   * small; cached for a day because relations rarely change.
   */
  async getMediaWithRelations(
    id: number
  ): Promise<AnilistMediaWithRelations | null> {
    const data = await this.graphql<{
      Media: AnilistMediaWithRelations | null;
    }>(MEDIA_RELATIONS_QUERY, { id }, 24 * 60 * 60);
    return data.Media ?? null;
  }

  async searchAnime(search: string, perPage = 5): Promise<AnilistMedia[]> {
    const data = await this.graphql<{ Page: { media: AnilistMedia[] } }>(
      SEARCH_ANIME_QUERY,
      { search, perPage },
      PUBLIC_PAGE_CACHE_TTL_SECONDS * 12
    );
    return data.Page?.media ?? [];
  }

  /**
   * Manga by title (type MANGA also covers manhwa, one-shots and light
   * novels). AniList matches English, romaji and native titles and synonyms.
   * Cached briefly so provider-side maturity changes are reflected promptly.
   */
  async searchManga(
    search: string,
    perPage = 6
  ): Promise<AnilistMangaSearchResult[]> {
    const data = await this.graphql<{
      Page: { media: AnilistMangaSearchResult[] };
    }>(SEARCH_MANGA_QUERY, { search, perPage }, 5 * 60);
    return data.Page?.media ?? [];
  }

  /**
   * A page of English-licensed manga for the Comics page. Cached briefly so
   * provider-side maturity changes are reflected promptly.
   */
  async browseManga({
    page = 1,
    perPage = 20,
    sort = 'TRENDING_DESC',
    genres,
    status,
    minPopularity,
  }: {
    page?: number;
    perPage?: number;
    sort?: AnilistMangaBrowseSort;
    genres?: string[];
    status?: 'RELEASING' | 'FINISHED';
    minPopularity?: number;
  } = {}): Promise<{
    hasNextPage: boolean;
    media: AnilistMangaSearchResult[];
  }> {
    const variables: Record<string, unknown> = {
      page,
      perPage,
      sort: [sort, ...(sort === 'TITLE_ENGLISH' ? [] : ['ID_DESC'])],
      licensedBy: ANILIST_ENGLISH_MANGA_SOURCES,
    };
    if (genres?.length) variables.genres = genres;
    if (status) variables.status = status;
    if (minPopularity) variables.popularity = minPopularity;
    const data = await this.graphql<{
      Page: {
        pageInfo?: { hasNextPage?: boolean };
        media: AnilistMangaSearchResult[];
      };
    }>(BROWSE_MANGA_QUERY, variables, 5 * 60);
    return {
      hasNextPage: !!data.Page?.pageInfo?.hasNextPage,
      media: (data.Page?.media ?? []).filter((m) => m?.id && !m.isAdult),
    };
  }

  /** One manga with its description; cached briefly to refresh maturity. */
  async getManga(id: number): Promise<AnilistMangaSearchResult | null> {
    const data = await this.graphql<{
      Media: AnilistMangaSearchResult | null;
    }>(MANGA_BY_ID_QUERY, { id }, 5 * 60);
    return data.Media ?? null;
  }

  async saveMediaListEntry(options: {
    mediaId: number;
    status?: AnilistMediaListStatus;
    scoreRaw?: number | null;
    progress?: number | null;
  }): Promise<AnilistMediaListEntry> {
    const variables: Record<string, unknown> = { mediaId: options.mediaId };
    if (options.status) {
      variables.status = options.status;
    }
    if (options.scoreRaw != null) {
      variables.scoreRaw = options.scoreRaw;
    }
    if (options.progress != null) {
      variables.progress = options.progress;
    }
    const data = await this.graphql<{
      SaveMediaListEntry: AnilistMediaListEntry;
    }>(SAVE_MEDIA_LIST_ENTRY_MUTATION, variables, 0);
    return data.SaveMediaListEntry;
  }

  async deleteMediaListEntry(entryId: number): Promise<boolean> {
    const data = await this.graphql<{
      DeleteMediaListEntry: { deleted?: boolean } | null;
    }>(DELETE_MEDIA_LIST_ENTRY_MUTATION, { id: entryId }, 0);
    return Boolean(data.DeleteMediaListEntry?.deleted);
  }

  mediaTitle(media?: AnilistMedia | null): string {
    return (
      media?.title?.english?.trim() ||
      media?.title?.romaji?.trim() ||
      media?.title?.native?.trim() ||
      ''
    );
  }

  private async getMediaPage(
    page: number,
    options: {
      sort: AnilistMediaSort;
      season?: AnilistMediaSeason;
      seasonYear?: number;
    }
  ): Promise<AnilistMediaPage> {
    const data = await this.graphql<{ Page: AnilistMediaPage }>(
      PAGE_MEDIA_QUERY,
      {
        page,
        perPage: ANILIST_PAGE_SIZE,
        type: 'ANIME',
        sort: [options.sort],
        season: options.season,
        seasonYear: options.seasonYear,
      },
      PUBLIC_PAGE_CACHE_TTL_SECONDS
    );
    return {
      pageInfo: data.Page?.pageInfo ?? {
        hasNextPage: false,
        currentPage: page,
      },
      media: (data.Page?.media ?? []).filter(
        (item) => item?.id && item.format !== 'MUSIC'
      ),
    };
  }

  private async graphql<T>(
    query: string,
    variables: Record<string, unknown>,
    ttl: number
  ): Promise<T> {
    try {
      const response = await this.post<GraphQLResponse<T>>(
        '',
        { query, variables },
        this.accessToken
          ? { headers: { Authorization: `Bearer ${this.accessToken}` } }
          : undefined,
        ttl
      );

      const graphQlError = firstAnilistGraphQlError(response);
      const classified = classifyAnilistFailure({
        graphQlStatus: graphQlError.status,
        message: graphQlError.message,
      });
      if (classified) {
        throw classified;
      }
      if (response.errors?.length) {
        throw new AnilistGraphQLError(
          response.errors[0]?.message || 'AniList GraphQL error'
        );
      }
      if (!response.data) {
        throw new AnilistGraphQLError('AniList returned an empty response');
      }
      return response.data;
    } catch (e) {
      if (
        e instanceof AnilistAuthError ||
        e instanceof AnilistGraphQLError ||
        e instanceof AnilistOutageError ||
        e instanceof AnilistRateLimitedError
      ) {
        throw e;
      }
      const status = axios.isAxiosError(e) ? e.response?.status : undefined;
      if (status === 429) {
        const retryAfter = Number(
          axios.isAxiosError(e)
            ? (e.response?.headers?.['retry-after'] ??
                e.response?.headers?.['Retry-After'])
            : 60
        );
        throw new AnilistRateLimitedError(
          Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 60
        );
      }
      const graphQlError = firstAnilistGraphQlError(
        axios.isAxiosError(e) ? e.response?.data : undefined
      );
      const classified = classifyAnilistFailure({
        httpStatus: status,
        graphQlStatus: graphQlError.status,
        message: graphQlError.message,
      });
      if (classified) {
        throw classified;
      }
      throw e;
    }
  }
}

export default AnilistAPI;
