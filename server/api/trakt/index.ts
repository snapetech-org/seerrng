// Adapted from selmant/foreseerr, copyright (c) 2026 Selman Trabzon. MIT licensed.
// See NOTICE.md for attribution and license terms.
import ExternalAPI from '@server/api/externalapi';
import type {
  TraktFetchMediaType,
  TraktLikedList,
  TraktListEntry,
  TraktListMetadata,
  TraktListSortBy,
  TraktMediaItem,
  TraktMediaObject,
  TraktSearchListEntry,
  TraktTokenResponse,
  TraktTokenState,
  TraktUserList,
  TraktUserSettingsResponse,
} from '@server/api/trakt/interfaces';
import cacheManager from '@server/lib/cache';
import {
  mergeAndPaginateTraktItems,
  paginateSortedTraktItems,
  traktItemKey,
  type TraktPaginatedItems,
} from '@server/lib/trakt/mixedPagination';
import logger from '@server/logger';
import { BoundedTaskQueue } from '@server/utils/concurrency';
import { proxyRequestInterceptor } from '@server/utils/customProxyAgent';
import { userAgentRequestInterceptor } from '@server/utils/userAgent';
import axios, { type AxiosInstance } from 'axios';
import { createHash, randomBytes } from 'node:crypto';

const TRAKT_BASE_URL = 'https://api.trakt.tv';
const TRAKT_AUTHORIZE_URL = 'https://auth.trakt.tv/oauth/authorize';

/** Generate a PKCE code verifier: 43 chars of base64url, within 43–128. */
export const generatePkceVerifier = (): string =>
  randomBytes(32).toString('base64url');

/** Derive the S256 PKCE code challenge (base64url, no padding). */
export const derivePkceChallenge = (verifier: string): string =>
  createHash('sha256').update(verifier).digest('base64url');

export const normalizeTraktApiPath = (endpoint: string): string => {
  if (
    typeof endpoint !== 'string' ||
    !endpoint.startsWith('/') ||
    endpoint.startsWith('//') ||
    endpoint.length > 4096 ||
    endpoint.includes('\\') ||
    Array.from(endpoint).some((character) => {
      const code = character.charCodeAt(0);
      return code <= 0x20 || code === 0x7f;
    }) ||
    endpoint.includes('?') ||
    endpoint.includes('#')
  ) {
    throw new Error('Trakt request path is not allowed.');
  }

  let parsed: URL;
  try {
    parsed = new URL(endpoint, TRAKT_BASE_URL);
  } catch {
    throw new Error('Trakt request path is not allowed.');
  }

  if (
    parsed.origin !== TRAKT_BASE_URL ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== endpoint
  ) {
    throw new Error('Trakt request path is not allowed.');
  }

  return parsed.pathname;
};

interface TraktPlaybackEpisode {
  id: number;
  progress?: number;
  episode?: { season?: number; number?: number };
  show?: { ids?: { tmdb?: number } };
}
export const TRAKT_RECOMMENDATIONS_LIMIT_MAX = 500;
const TRAKT_REFRESH_WINDOW_SECONDS = 300;
const TRAKT_RETRY_AFTER_MAX_SECONDS = 5;
const TRAKT_RATE_LIMIT_FALLBACK_SECONDS = 1;
const TRAKT_GET_CACHE_TTL_SECONDS = 300;
const TRAKT_CIRCUIT_FALLBACK_SECONDS = 60;
/** Trakt currently caps sync collection pages at 250 items. */
export const TRAKT_SYNC_PAGE_SIZE = 250;
/** `extended=progress` is capped at 100 items per page. */
export const TRAKT_SYNC_PROGRESS_PAGE_SIZE = 100;

/** Shared across TraktAPI instances, scoped per token or app client. */
const traktCircuitOpenUntilMs = new Map<string, number>();
const traktReadFlights = new Map<string, Promise<unknown>>();
const traktReadQueue = new BoundedTaskQueue(4, 64);

export class TraktRateLimitedError extends Error {
  public readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    const seconds = Math.max(1, Math.ceil(retryAfterSeconds));
    super(`Trakt API rate limited; retry after ${seconds}s`);
    this.name = 'TraktRateLimitedError';
    this.retryAfterSeconds = seconds;
  }
}

export class TraktRefreshRejectedError extends Error {
  public readonly status: number;

  constructor(status: number) {
    super('Trakt rejected the refresh token');
    this.name = 'TraktRefreshRejectedError';
    this.status = status;
  }
}

export class TraktReconnectRequiredError extends Error {
  constructor(message = 'Trakt authorization expired; reconnect your account') {
    super(message);
    this.name = 'TraktReconnectRequiredError';
  }
}

/**
 * Trakt refused a request carrying only the application `client_id`.
 *
 * Since Trakt removed custom API access for non-VIP accounts on 2026-07-30,
 * every unauthenticated request from this host returns 403 — including plainly
 * public endpoints. Reporting that as a 500 hides the one thing the user can
 * act on, which is linking a Trakt account.
 */
export class TraktAppAccessDeniedError extends Error {
  public readonly status: number;

  constructor(status: number) {
    super(
      'Trakt refused an unauthenticated request. Trakt now requires a linked account for API access.'
    );
    this.name = 'TraktAppAccessDeniedError';
    this.status = status;
  }
}

/** Test helper — clear per-client Trakt rate-limit circuits. */
export const resetTraktRateLimitState = (): void => {
  traktCircuitOpenUntilMs.clear();
};

const remainingCircuitSeconds = (circuitKey: string): number =>
  Math.max(
    0,
    Math.ceil(
      ((traktCircuitOpenUntilMs.get(circuitKey) ?? 0) - Date.now()) / 1000
    )
  );

const assertTraktCircuitClosed = (circuitKey: string): void => {
  const remaining = remainingCircuitSeconds(circuitKey);
  if (remaining > 0) {
    throw new TraktRateLimitedError(remaining);
  }
};

const openTraktCircuit = (
  circuitKey: string,
  retryAfterSeconds: number
): void => {
  const seconds = Math.max(
    TRAKT_CIRCUIT_FALLBACK_SECONDS,
    Math.ceil(retryAfterSeconds || TRAKT_CIRCUIT_FALLBACK_SECONDS)
  );
  const openUntil = Date.now() + seconds * 1000;
  const current = traktCircuitOpenUntilMs.get(circuitKey) ?? 0;
  if (openUntil > current) {
    for (const [key, expires] of traktCircuitOpenUntilMs) {
      if (expires <= Date.now()) traktCircuitOpenUntilMs.delete(key);
    }
    if (
      traktCircuitOpenUntilMs.size >= 1024 &&
      !traktCircuitOpenUntilMs.has(circuitKey)
    ) {
      const oldest = traktCircuitOpenUntilMs.keys().next().value;
      if (oldest) traktCircuitOpenUntilMs.delete(oldest);
    }
    traktCircuitOpenUntilMs.set(circuitKey, openUntil);
    logger.warn('Trakt circuit opened after rate limit', {
      label: 'Trakt API',
      circuitKey,
      retryAfterSeconds: seconds,
      nextProbeAt: new Date(openUntil).toISOString(),
    });
  }
};

interface TraktAPIOptions {
  clientId: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  refreshTokens?: (currentTokens: TraktTokenState) => Promise<TraktTokenState>;
}

class TraktAPI extends ExternalAPI {
  private clientId: string;
  private accessToken?: string;
  private refreshToken?: string;
  private expiresAt: number;
  private refreshTokens?: TraktAPIOptions['refreshTokens'];
  private rawAxios: AxiosInstance;

  constructor(options: TraktAPIOptions) {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'trakt-api-version': '2',
      'trakt-api-key': options.clientId,
    };

    if (options.accessToken) {
      headers.Authorization = `Bearer ${options.accessToken}`;
    }

    super(
      TRAKT_BASE_URL,
      {},
      {
        headers,
        nodeCache: cacheManager.getCache('trakt').data,
      }
    );

    this.clientId = options.clientId.trim();
    this.accessToken = options.accessToken;
    this.refreshToken = options.refreshToken;
    this.expiresAt = options.expiresAt ?? 0;
    this.refreshTokens = options.refreshTokens;

    this.rawAxios = axios.create({
      maxRedirects: 0,
      maxContentLength: 8 * 1024 * 1024,
      maxBodyLength: 1024 * 1024,
      baseURL: TRAKT_BASE_URL,
      timeout: 15000,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'trakt-api-version': '2',
        'trakt-api-key': this.clientId,
      },
    });
    this.rawAxios.interceptors.request.use(proxyRequestInterceptor);
    this.rawAxios.interceptors.request.use(userAgentRequestInterceptor);
  }

  private circuitKey(): string {
    if (this.accessToken) {
      return `token:${createHash('sha256').update(this.accessToken).digest('hex')}`;
    }
    return `client:${this.clientId || 'public'}`;
  }

  public invalidateWatchedGetCache(): void {
    this.removeCacheByEndpointPrefix('/sync/watched/shows');
    this.removeCacheByEndpointPrefix('/sync/watched/movies');
    this.removeCacheByEndpointPrefix('/sync/ratings/shows');
    this.removeCacheByEndpointPrefix('/sync/ratings/movies');
  }

  protected async get<T>(
    endpoint: string,
    config?: {
      params?: Record<string, string | number>;
      headers?: Record<string, string>;
    },
    ttl?: number
  ): Promise<T> {
    assertTraktCircuitClosed(this.circuitKey());
    try {
      return await super.get<T>(endpoint, config, ttl);
    } catch (e) {
      const status = (e as { response?: { status?: number } })?.response
        ?.status;
      if (status === 429) {
        const headers = (e as { response?: { headers?: unknown } })?.response
          ?.headers;
        const retryAfter = this.parseRetryAfter(
          this.headerValue(headers, 'retry-after')
        );
        openTraktCircuit(
          this.circuitKey(),
          retryAfter || TRAKT_CIRCUIT_FALLBACK_SECONDS
        );
        throw new TraktRateLimitedError(
          retryAfter ||
            remainingCircuitSeconds(this.circuitKey()) ||
            TRAKT_CIRCUIT_FALLBACK_SECONDS
        );
      }
      throw e;
    }
  }

  public static parseListUrl(value: string): {
    username: string | null;
    listRef: string;
  } {
    const text = decodeURIComponent(String(value || '').trim());
    if (!text) {
      throw new Error('List URL or reference is required');
    }

    if (text.startsWith('http://') || text.startsWith('https://')) {
      const parsed = new URL(text);
      const parts = parsed.pathname.split('/').filter(Boolean);
      if (parts.length >= 4 && parts[0] === 'users' && parts[2] === 'lists') {
        return { username: parts[1], listRef: parts[3] };
      }
      if (
        parts.length === 3 &&
        parts[0] === 'users' &&
        parts[2] === 'watchlist'
      ) {
        return { username: parts[1], listRef: 'watchlist' };
      }
      if (parts.length >= 2 && parts[0] === 'lists') {
        return { username: null, listRef: parts[1] };
      }
      throw new Error(`Unsupported Trakt list URL: ${value}`);
    }

    if (text.includes('/')) {
      const [user, ...rest] = text.split('/');
      const listRef = rest.join('/').trim().toLowerCase();
      if (!user.trim() || !listRef) {
        throw new Error(`Invalid Trakt list reference: ${value}`);
      }
      return { username: user.trim(), listRef };
    }

    return { username: null, listRef: text };
  }

  public buildAuthorizeUrl(
    redirectUri: string,
    codeChallenge: string,
    state: string
  ): string {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.clientId,
      redirect_uri: redirectUri,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      state,
    });
    return `${TRAKT_AUTHORIZE_URL}?${params.toString()}`;
  }

  public async exchangeCodeForTokens(
    code: string,
    codeVerifier: string,
    redirectUri: string
  ): Promise<TraktTokenResponse & { expiresAt: number }> {
    const response = await this.rawAxios.post<TraktTokenResponse>(
      '/oauth/token',
      {
        code,
        client_id: this.clientId,
        code_verifier: codeVerifier,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      },
      { validateStatus: () => true }
    );

    if (response.status < 200 || response.status >= 300) {
      throw new Error(
        `Trakt token exchange failed (status ${response.status})`
      );
    }

    return this.applyTokens(response.data);
  }

  /**
   * Verify the application client ID is present. Trakt recommends PKCE for
   * user sign-in and deprecates client secrets for that flow, so there is
   * nothing else to validate without starting a user flow.
   */
  public async validateApplicationCredentials(): Promise<void> {
    if (!this.clientId) {
      throw new Error('Invalid Trakt Client ID');
    }
  }

  public async refreshAccessToken(): Promise<TraktTokenState> {
    if (!this.refreshToken) {
      throw new Error('Cannot refresh Trakt token without a refresh token');
    }

    if (this.refreshTokens && this.accessToken) {
      const tokens = await this.refreshTokens({
        accessToken: this.accessToken,
        refreshToken: this.refreshToken,
        expiresAt: this.expiresAt,
      });
      this.applyTokenState(tokens);
      return tokens;
    }

    // Refresh credentials are intentionally sent to Trakt's fixed OAuth endpoint.
    // codeql[js/file-access-to-http]
    const response = await this.rawAxios.post<TraktTokenResponse>(
      '/oauth/token',
      {
        refresh_token: this.refreshToken,
        client_id: this.clientId,
        grant_type: 'refresh_token',
      },
      { validateStatus: () => true }
    );

    if (response.status === 400 || response.status === 401) {
      throw new TraktRefreshRejectedError(response.status);
    }
    if (response.status < 200 || response.status >= 300) {
      throw new Error(
        `Trakt token refresh failed with status ${response.status}`
      );
    }

    const applied = this.applyTokens(response.data);
    return {
      accessToken: applied.access_token,
      refreshToken: applied.refresh_token,
      expiresAt: applied.expiresAt,
    };
  }

  public async getUserSettings(): Promise<{
    username: string;
    traktUserId: string;
  }> {
    await this.ensureFreshToken();
    const payload =
      await this.getAuthenticated<TraktUserSettingsResponse>('/users/settings');
    const user = payload.user ?? {};
    const ids = user.ids ?? {};
    const username = user.username || user.name || user.slug || ids.slug || '';
    const traktUserId = String(
      ids.uuid || ids.slug || ids.trakt || user.username || username
    );
    return { username, traktUserId };
  }

  public async getRecommendations(
    mediaType: 'movie' | 'tv',
    options: {
      limit?: number;
      ignoreCollected?: boolean;
      ignoreWatchlisted?: boolean;
      extended?: 'min' | 'full';
    } = {}
  ): Promise<TraktMediaItem[]> {
    await this.ensureFreshToken();
    const path =
      mediaType === 'movie'
        ? '/recommendations/movies'
        : '/recommendations/shows';
    const params: Record<string, string | number> = {
      limit: Math.max(
        1,
        Math.min(options.limit ?? 20, TRAKT_RECOMMENDATIONS_LIMIT_MAX)
      ),
      extended: options.extended ?? 'min',
    };
    if (options.ignoreCollected) {
      params.ignore_collected = 'true';
    }
    if (options.ignoreWatchlisted) {
      params.ignore_watchlisted = 'true';
    }

    const payload = await this.getAuthenticated<TraktMediaObject[]>(path, {
      params,
    });
    return this.normalizeRecommendationItems(payload, mediaType);
  }

  public async getUserLists(listUser = 'me'): Promise<TraktListMetadata[]> {
    await this.ensureFreshToken();
    const user = (listUser || 'me').trim() || 'me';
    const payload = await this.getAuthenticated<TraktUserList[]>(
      `/users/${user}/lists`,
      { params: { extended: 'min' } }
    );
    return this.normalizeUserLists(payload);
  }

  public async getLikedLists(): Promise<TraktListMetadata[]> {
    await this.ensureFreshToken();
    const payload =
      await this.getAuthenticated<TraktLikedList[]>('/users/likes/lists');

    return (payload || [])
      .map((entry) =>
        entry.list
          ? {
              ...this.normalizeListMetadata(entry.list),
              isLiked: true as const,
            }
          : null
      )
      .filter(
        (list): list is TraktListMetadata & { isLiked: true } => list !== null
      );
  }

  public async addToHistory(
    mediaType: 'movie' | 'tv',
    tmdbId: number,
    watchedAt?: string
  ): Promise<unknown> {
    const item: Record<string, unknown> = {
      ids: { tmdb: Number(tmdbId) },
    };
    if (watchedAt) {
      item.watched_at = watchedAt;
    }
    return this.postAuthenticated(
      '/sync/history',
      this.syncBody(mediaType, item)
    );
  }

  public async removeFromHistory(
    mediaType: 'movie' | 'tv',
    tmdbId: number
  ): Promise<unknown> {
    return this.postAuthenticated(
      '/sync/history/remove',
      this.syncBody(mediaType, { ids: { tmdb: Number(tmdbId) } })
    );
  }

  public async addEpisodeToHistory(
    tmdbShowId: number,
    seasonNumber: number,
    episodeNumber: number,
    tvdbShowId?: number
  ): Promise<unknown> {
    const result = await this.postAuthenticated(
      '/sync/history',
      TraktAPI.episodeHistoryPayload(
        tmdbShowId,
        seasonNumber,
        episodeNumber,
        tvdbShowId
      )
    );
    try {
      await this.removeEpisodePlaybackProgress(
        tmdbShowId,
        seasonNumber,
        episodeNumber
      );
    } catch (error) {
      logger.warn('Failed to clear Trakt playback progress after history add', {
        label: 'Trakt API',
        tmdbShowId,
        seasonNumber,
        episodeNumber,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    }
    return result;
  }

  /**
   * Drop leftover /sync/playback pause rows for one episode.
   * Trakt does not remove these when the episode is added to history.
   */
  public async removeEpisodePlaybackProgress(
    tmdbShowId: number,
    seasonNumber: number,
    episodeNumber: number
  ): Promise<void> {
    const paused = await this.listEpisodePlaybackProgress();
    const matches = paused.filter(
      (entry) =>
        Number(entry.show?.ids?.tmdb) === tmdbShowId &&
        Number(entry.episode?.season) === seasonNumber &&
        Number(entry.episode?.number) === episodeNumber
    );
    for (const entry of matches) {
      if (!Number.isFinite(entry.id) || entry.id <= 0) continue;
      try {
        await this.deleteAuthenticated(`/sync/playback/${entry.id}`);
      } catch (error) {
        logger.warn('Failed to remove Trakt playback progress', {
          label: 'Trakt API',
          tmdbShowId,
          seasonNumber,
          episodeNumber,
          playbackId: entry.id,
          errorMessage: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  private async listEpisodePlaybackProgress(): Promise<TraktPlaybackEpisode[]> {
    const items: TraktPlaybackEpisode[] = [];
    let page = 1;
    const limit = 100;
    while (page <= 20) {
      const batch = await this.requestWithRetry<TraktPlaybackEpisode[]>(
        'GET',
        '/sync/playback/episodes',
        { params: { page, limit }, skipCache: true }
      );
      const rows = Array.isArray(batch) ? batch : [];
      items.push(...rows);
      if (rows.length < limit) break;
      page += 1;
    }
    return items;
  }

  public async removeEpisodeFromHistory(
    tmdbShowId: number,
    seasonNumber: number,
    episodeNumber: number,
    tvdbShowId?: number
  ): Promise<unknown> {
    return this.postAuthenticated(
      '/sync/history/remove',
      TraktAPI.episodeHistoryPayload(
        tmdbShowId,
        seasonNumber,
        episodeNumber,
        tvdbShowId
      )
    );
  }

  public static episodeHistoryPayload(
    tmdbShowId: number,
    seasonNumber: number,
    episodeNumber: number,
    tvdbShowId?: number
  ): Record<string, unknown> {
    return {
      shows: [
        {
          ids: {
            tmdb: Number(tmdbShowId),
            ...(tvdbShowId ? { tvdb: Number(tvdbShowId) } : {}),
          },
          seasons: [
            { number: seasonNumber, episodes: [{ number: episodeNumber }] },
          ],
        },
      ],
    };
  }

  public async addRating(
    mediaType: 'movie' | 'tv',
    tmdbId: number,
    rating: number
  ): Promise<unknown> {
    const value = Math.trunc(rating);
    if (value < 1 || value > 10) {
      throw new Error('Trakt rating must be between 1 and 10');
    }
    return this.postAuthenticated(
      '/sync/ratings',
      this.syncBody(mediaType, {
        ids: { tmdb: Number(tmdbId) },
        rating: value,
      })
    );
  }

  public async removeRating(
    mediaType: 'movie' | 'tv',
    tmdbId: number
  ): Promise<unknown> {
    return this.postAuthenticated(
      '/sync/ratings/remove',
      this.syncBody(mediaType, { ids: { tmdb: Number(tmdbId) } })
    );
  }

  public async getSyncLibraryPage(
    mediaType: 'movie' | 'tv',
    collection: 'watched' | 'ratings',
    page: number,
    limit = 20
  ): Promise<TraktListEntry[]> {
    if (
      !Number.isSafeInteger(page) ||
      page < 1 ||
      page > 500 ||
      !Number.isSafeInteger(limit) ||
      limit < 1 ||
      limit > 250
    )
      throw new Error('Invalid Trakt library page.');
    const rows = await this.getAuthenticated<TraktListEntry[]>(
      `/sync/${collection}/${mediaType === 'movie' ? 'movies' : 'shows'}`,
      {
        params: {
          page,
          limit,
          ...(collection === 'watched' && mediaType === 'tv'
            ? { extended: 'progress' }
            : {}),
        },
      }
    );
    if (!Array.isArray(rows) || rows.length > limit)
      throw new Error('Trakt returned an invalid library page.');
    return rows;
  }

  /** Read watched progress for one show, including episode identity and rewatch reset state. */
  public async getShowWatchedProgress(
    traktId: number
  ): Promise<Record<string, unknown>> {
    if (!Number.isSafeInteger(traktId) || traktId <= 0)
      throw new Error('Invalid Trakt show ID.');
    return this.getAuthenticated<Record<string, unknown>>(
      '/shows/' + traktId + '/progress/watched',
      { params: { hidden: 'true', specials: 'true' } }
    );
  }

  public async getSyncWatched(
    mediaType: 'movie' | 'tv'
  ): Promise<TraktListEntry[]> {
    const path =
      mediaType === 'movie' ? '/sync/watched/movies' : '/sync/watched/shows';
    return this.getAllSyncPages(
      path,
      mediaType === 'tv'
        ? { extended: 'progress', limit: TRAKT_SYNC_PROGRESS_PAGE_SIZE }
        : undefined
    );
  }

  public async getSyncRatings(
    mediaType: 'movie' | 'tv'
  ): Promise<TraktListEntry[]> {
    const path =
      mediaType === 'movie' ? '/sync/ratings/movies' : '/sync/ratings/shows';
    return this.getAllSyncPages(path);
  }

  private async getAllSyncPages(
    path: string,
    params: Record<string, string | number> = {}
  ): Promise<TraktListEntry[]> {
    const items: TraktListEntry[] = [];
    const limit =
      Number(params.limit) > 0 ? Number(params.limit) : TRAKT_SYNC_PAGE_SIZE;
    let page = 1;
    const seen = new Set<string>();
    let bytes = 0;

    while (page <= 101) {
      const batch = await this.getAuthenticated<TraktListEntry[]>(path, {
        params: {
          ...params,
          page,
          limit,
        },
      });
      if (!batch || batch.length === 0) {
        return items;
      }
      if (
        !Array.isArray(batch) ||
        batch.length > limit ||
        items.length + batch.length > 10000
      )
        throw new Error('Trakt sync exceeded its supported result limit.');
      const encoded = JSON.stringify(batch);
      bytes += Buffer.byteLength(encoded);
      if (bytes > 8 * 1024 * 1024)
        throw new Error('Trakt sync exceeded its supported metadata size.');
      const fingerprint = createHash('sha256').update(encoded).digest('hex');
      if (seen.has(fingerprint)) throw new Error('Trakt repeated a sync page.');
      seen.add(fingerprint);
      items.push(...batch);
      if (batch.length < limit) {
        return items;
      }
      page += 1;
    }
    throw new Error('Trakt sync exceeded its supported page limit.');
  }

  public static payloadContainsTmdb(
    payload: TraktListEntry[] | undefined,
    itemKey: 'movie' | 'show',
    tmdbId: number | string
  ): boolean {
    const needle = String(tmdbId);
    for (const entry of payload || []) {
      const ids = entry?.[itemKey]?.ids;
      if (ids?.tmdb != null && String(ids.tmdb) === needle) {
        return true;
      }
    }
    return false;
  }

  public static findRatingForTmdb(
    payload: TraktListEntry[] | undefined,
    itemKey: 'movie' | 'show',
    tmdbId: number | string
  ): number | null {
    const needle = String(tmdbId);
    for (const entry of payload || []) {
      const ids = entry?.[itemKey]?.ids;
      if (ids?.tmdb != null && String(ids.tmdb) === needle) {
        return entry.rating != null ? Number(entry.rating) : null;
      }
    }
    return null;
  }

  public async searchLists(
    query: string,
    options: { limit?: number } = {}
  ): Promise<TraktListMetadata[]> {
    const q = String(query || '').trim();
    if (!q) {
      return [];
    }

    const limit = Math.max(1, Math.min(options.limit ?? 20, 100));
    const payload = await this.get<TraktSearchListEntry[]>(
      '/search/list',
      { params: { query: q, limit } },
      300
    );

    const items: TraktListMetadata[] = [];
    const seen = new Set<string>();
    for (const entry of payload || []) {
      if (entry.type !== 'list' || !entry.list) {
        continue;
      }
      const normalized = this.normalizeListMetadata(entry.list);
      const key = normalized.username
        ? `${normalized.username}/${normalized.slug || normalized.id}`
        : normalized.slug || normalized.id;
      if (!key || seen.has(key)) {
        continue;
      }
      seen.add(key);
      items.push(normalized);
    }

    return items;
  }

  public async getListMetadata(
    listUser: string | null,
    listRef: string
  ): Promise<TraktListMetadata> {
    const ref = String(listRef || '').trim();
    if (!ref) {
      throw new Error('listRef is required');
    }

    const path = listUser ? `/users/${listUser}/lists/${ref}` : `/lists/${ref}`;

    // Public lists can be fetched without user auth; use app key only when no token
    const payload = this.accessToken
      ? await this.getAuthenticatedOrPublic<TraktUserList>(path)
      : await this.get<TraktUserList>(path, undefined, 300);

    return this.normalizeListMetadata(payload);
  }

  public async getListItems(
    listUser: string | null,
    listRef: string,
    mediaType: TraktFetchMediaType = 'all',
    options: {
      limit?: number;
      page?: number;
      extended?: 'min' | 'full';
      sortBy?: TraktListSortBy;
    } = {}
  ): Promise<TraktPaginatedItems> {
    const ref = String(listRef || '').trim();
    if (!ref) {
      throw new Error('listRef is required');
    }

    const itemTypes = this.listItemTypes(mediaType);
    const limit = Math.max(1, Math.min(options.limit ?? 20, 100));
    const page = Math.max(1, options.page ?? 1);
    const extended = options.extended ?? 'min';
    const path = listUser
      ? `/users/${listUser}/lists/${ref}/items/${itemTypes}`
      : `/lists/${ref}/items/${itemTypes}`;

    const fetchPage = async (traktPage: number): Promise<TraktListEntry[]> => {
      const config = {
        params: {
          limit,
          page: traktPage,
          extended,
        },
      };
      return this.accessToken
        ? await this.getAuthenticatedOrPublic<TraktListEntry[]>(path, config)
        : await this.get<TraktListEntry[]>(path, config, 300);
    };

    if (!options.sortBy) {
      const payload = await fetchPage(page);
      const items = this.normalizeListItems(payload);
      return {
        items,
        hasMore: items.length >= limit,
      };
    }

    return this.fetchSortedListItems(fetchPage, {
      page,
      limit,
      sortBy: options.sortBy,
      cacheKey: `${path}:sorted`,
    });
  }

  public async getWatchlistItems(
    listUser = 'me',
    mediaType: TraktFetchMediaType = 'all',
    options: { limit?: number; page?: number; extended?: 'min' | 'full' } = {}
  ): Promise<TraktPaginatedItems> {
    await this.ensureFreshToken();
    const user = (listUser || 'me').trim() || 'me';
    const limit = Math.max(1, Math.min(options.limit ?? 20, 100));
    const page = Math.max(1, options.page ?? 1);
    const extended = options.extended ?? 'min';

    if (mediaType !== 'all') {
      const traktType = mediaType === 'movie' ? 'movies' : 'shows';
      return this.fetchSingleTypePage(`/users/${user}/watchlist/${traktType}`, {
        limit,
        page,
        extended,
      });
    }

    return this.fetchMergedMediaPages(
      (type, streamPage, streamLimit) =>
        this.getAuthenticated<TraktListEntry[]>(
          `/users/${user}/watchlist/${type}`,
          {
            params: {
              limit: streamLimit,
              page: streamPage,
              extended,
            },
          }
        ),
      { limit, page }
    );
  }

  /**
   * Recent watch history (chronological). Uses /sync/history which returns
   * the authenticated user's most recent plays first.
   */
  public async getHistoryItems(
    mediaType: TraktFetchMediaType = 'all',
    options: { limit?: number; page?: number; extended?: 'min' | 'full' } = {}
  ): Promise<TraktPaginatedItems> {
    await this.ensureFreshToken();
    const limit = Math.max(1, Math.min(options.limit ?? 20, 100));
    const page = Math.max(1, options.page ?? 1);
    const extended = options.extended ?? 'min';

    if (mediaType !== 'all') {
      const traktType = mediaType === 'movie' ? 'movies' : 'shows';
      return this.fetchSingleTypePage(`/sync/history/${traktType}`, {
        limit,
        page,
        extended,
      });
    }

    return this.fetchMergedMediaPages(
      (type, streamPage, streamLimit) =>
        this.getAuthenticated<TraktListEntry[]>(`/sync/history/${type}`, {
          params: {
            limit: streamLimit,
            page: streamPage,
            extended,
          },
        }),
      { limit, page }
    );
  }

  private async fetchSingleTypePage(
    path: string,
    options: { limit: number; page: number; extended: 'min' | 'full' }
  ): Promise<TraktPaginatedItems> {
    const payload = await this.getAuthenticated<TraktListEntry[]>(path, {
      params: {
        limit: options.limit,
        page: options.page,
        extended: options.extended,
      },
    });
    const items = this.normalizeListItems(payload);
    return {
      items,
      hasMore: items.length >= options.limit,
    };
  }

  /**
   * Fetch up to `page * limit` from movies and shows, merge by listed_at /
   * watched_at, dedupe, then return the requested page slice.
   */
  private async fetchMergedMediaPages(
    fetchTypePage: (
      type: 'movies' | 'shows',
      page: number,
      limit: number
    ) => Promise<TraktListEntry[] | undefined>,
    options: { limit: number; page: number }
  ): Promise<TraktPaginatedItems> {
    const needed = options.page * options.limit;
    const [movies, shows] = await Promise.all([
      this.collectTypePrefix(fetchTypePage, 'movies', needed, options.limit),
      this.collectTypePrefix(fetchTypePage, 'shows', needed, options.limit),
    ]);

    return mergeAndPaginateTraktItems(movies.items, shows.items, {
      page: options.page,
      limit: options.limit,
      movieHasMore: movies.hasMore,
      tvHasMore: shows.hasMore,
    });
  }

  private async collectTypePrefix(
    fetchTypePage: (
      type: 'movies' | 'shows',
      page: number,
      limit: number
    ) => Promise<TraktListEntry[] | undefined>,
    type: 'movies' | 'shows',
    needed: number,
    pageSize: number
  ): Promise<TraktPaginatedItems> {
    const items: TraktMediaItem[] = [];
    const seen = new Set<string>();
    let page = 1;
    let hasMore = false;

    while (items.length < needed) {
      const payload = await fetchTypePage(type, page, pageSize);
      const batch = this.normalizeListItems(payload);
      if (!batch.length) {
        hasMore = false;
        break;
      }

      for (const entry of batch) {
        const key = traktItemKey(entry);
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        items.push(entry);
        if (items.length >= needed) {
          break;
        }
      }

      if (batch.length < pageSize) {
        hasMore = false;
        break;
      }

      hasMore = true;
      if (items.length >= needed) {
        break;
      }
      page++;
    }

    return {
      items: items.slice(0, needed),
      hasMore: hasMore && items.length >= needed,
    };
  }

  private applyTokens(
    payload: TraktTokenResponse
  ): TraktTokenResponse & { expiresAt: number } {
    this.accessToken = payload.access_token || this.accessToken;
    this.refreshToken = payload.refresh_token || this.refreshToken;
    const expiresIn = Number(payload.expires_in || 0);
    if (expiresIn) {
      const createdAt = Number(payload.created_at || 0);
      this.expiresAt =
        (Number.isFinite(createdAt) && createdAt > 0
          ? createdAt
          : Math.floor(Date.now() / 1000)) + expiresIn;
    }

    this.syncAuthorizationHeaders();

    return {
      ...payload,
      expiresAt: this.expiresAt,
    };
  }

  private applyTokenState(tokens: TraktTokenState): void {
    this.accessToken = tokens.accessToken;
    this.refreshToken = tokens.refreshToken;
    this.expiresAt = tokens.expiresAt;
    this.syncAuthorizationHeaders();
  }

  private syncAuthorizationHeaders(): void {
    // Keep the cached/public client in sync for authenticated public-list calls.
    (this as unknown as { axios: AxiosInstance }).axios.defaults.headers.common[
      'Authorization'
    ] = `Bearer ${this.accessToken}`;
  }

  public async prepareAccessToken(): Promise<void> {
    await this.ensureFreshToken();
  }

  private async ensureFreshToken(): Promise<void> {
    if (!this.refreshToken || !this.expiresAt) {
      return;
    }
    if (
      this.expiresAt <=
      Math.floor(Date.now() / 1000) + TRAKT_REFRESH_WINDOW_SECONDS
    ) {
      await this.refreshAccessToken();
    }
  }

  private syncBody(
    mediaType: 'movie' | 'tv',
    item: Record<string, unknown>
  ): Record<string, Record<string, unknown>[]> {
    if (mediaType === 'movie') {
      return { movies: [item] };
    }
    return { shows: [item] };
  }

  private async postAuthenticated<T>(
    endpoint: string,
    data: unknown
  ): Promise<T> {
    const result = await this.requestWithRetry<T>('POST', endpoint, { data });
    if (
      endpoint.startsWith('/sync/history') ||
      endpoint.startsWith('/sync/ratings')
    ) {
      this.invalidateWatchedGetCache();
    }
    return result;
  }

  private async deleteAuthenticated(endpoint: string): Promise<void> {
    try {
      await this.requestWithRetry<unknown>('DELETE', endpoint, {
        skipCache: true,
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes('returned 404')) {
        return;
      }
      throw error;
    }
  }

  private async getAuthenticated<T>(
    endpoint: string,
    config?: {
      params?: Record<string, string | number>;
      headers?: Record<string, string>;
    }
  ): Promise<T> {
    return this.requestWithRetry<T>('GET', endpoint, config);
  }

  private async getAuthenticatedOrPublic<T>(
    endpoint: string,
    config?: {
      params?: Record<string, string | number>;
      headers?: Record<string, string>;
    }
  ): Promise<T> {
    try {
      return await this.getAuthenticated<T>(endpoint, config);
    } catch (e) {
      if (e instanceof TraktRateLimitedError) {
        throw e;
      }
      // Fall back to app-key-only for public lists if user token fails
      logger.debug('Authenticated Trakt request failed; retrying publicly', {
        label: 'Trakt API',
        endpoint,
        errorMessage: e instanceof Error ? e.message : 'unknown error',
      });
      assertTraktCircuitClosed(this.circuitKey());
      return this.get<T>(endpoint, config, TRAKT_GET_CACHE_TTL_SECONDS);
    }
  }

  private authCacheConfig(config?: {
    params?: Record<string, string | number>;
    headers?: Record<string, string>;
  }): {
    params?: Record<string, string | number>;
    headers?: Record<string, string>;
  } {
    return {
      ...config,
      headers: {
        ...config?.headers,
        // Namespace authenticated cache entries per token so private lists
        // never leak across linked accounts.
        'x-trakt-cache-scope': this.accessToken
          ? `auth:${createHash('sha256').update(this.accessToken).digest('hex')}`
          : 'public',
      },
    };
  }

  private async requestWithRetry<T>(
    method: 'GET' | 'POST' | 'DELETE',
    endpoint: string,
    config?: {
      params?: Record<string, string | number>;
      data?: unknown;
      skipCache?: boolean;
    },
    retryAuth = true,
    retryRateLimit = true
  ): Promise<T> {
    endpoint = normalizeTraktApiPath(endpoint);
    if (method !== 'GET' || config?.skipCache) {
      return this.executeRequestWithRetry<T>(
        method,
        endpoint,
        config,
        retryAuth,
        retryRateLimit
      );
    }
    const key = createHash('sha256')
      .update(
        JSON.stringify([
          this.clientId,
          this.accessToken,
          endpoint,
          config?.params ?? {},
          retryAuth,
          retryRateLimit,
        ])
      )
      .digest('hex');
    const existing = traktReadFlights.get(key);
    if (existing) return existing as Promise<T>;
    const pending = traktReadQueue.run(() =>
      this.executeRequestWithRetry<T>(
        method,
        endpoint,
        config,
        retryAuth,
        retryRateLimit
      )
    );
    if (traktReadFlights.size >= 256) return pending;
    traktReadFlights.set(key, pending);
    try {
      return await pending;
    } finally {
      if (traktReadFlights.get(key) === pending) traktReadFlights.delete(key);
    }
  }

  private async executeRequestWithRetry<T>(
    method: 'GET' | 'POST' | 'DELETE',
    endpoint: string,
    config?: {
      params?: Record<string, string | number>;
      data?: unknown;
      skipCache?: boolean;
    },
    retryAuth = true,
    retryRateLimit = true
  ): Promise<T> {
    await this.ensureFreshToken();
    assertTraktCircuitClosed(this.circuitKey());

    const cacheConfig =
      method === 'GET' && !config?.skipCache
        ? this.authCacheConfig(config)
        : undefined;
    if (cacheConfig) {
      const cached = this.getCached<T>(endpoint, cacheConfig);
      if (cached !== undefined) {
        return cached;
      }
    }

    try {
      // This relative path is validated against the fixed Trakt API origin;
      // account tokens are intentionally sent to that provider.
      // codeql[js/file-access-to-http]
      const response = await this.rawAxios.request<T>({
        method,
        url: endpoint,
        params: config?.params,
        data: config?.data,
        headers: this.accessToken
          ? { Authorization: `Bearer ${this.accessToken}` }
          : undefined,
        validateStatus: () => true,
      });

      if (response.status >= 200 && response.status < 300) {
        if (cacheConfig) {
          this.setCached(
            endpoint,
            response.data,
            TRAKT_GET_CACHE_TTL_SECONDS,
            cacheConfig
          );
        }
        return response.data;
      }

      if (response.status === 429) {
        const retryAfter = this.parseRetryAfter(
          response.headers['retry-after'] as string | undefined
        );
        if (retryRateLimit && retryAfter <= TRAKT_RETRY_AFTER_MAX_SECONDS) {
          await new Promise((resolve) =>
            setTimeout(
              resolve,
              (retryAfter || TRAKT_RATE_LIMIT_FALLBACK_SECONDS) * 1000
            )
          );
          return this.executeRequestWithRetry<T>(
            method,
            endpoint,
            config,
            retryAuth,
            false
          );
        }
        openTraktCircuit(
          this.circuitKey(),
          retryAfter || TRAKT_CIRCUIT_FALLBACK_SECONDS
        );
        throw new TraktRateLimitedError(
          retryAfter ||
            remainingCircuitSeconds(this.circuitKey()) ||
            TRAKT_CIRCUIT_FALLBACK_SECONDS
        );
      }

      if (response.status === 401 && this.accessToken && retryAuth) {
        await this.refreshAccessToken();
        return this.executeRequestWithRetry<T>(
          method,
          endpoint,
          config,
          false,
          retryRateLimit
        );
      }

      // No token to refresh: this is the app client being turned away, not a
      // transient failure, so callers can degrade to "link your account".
      if (
        !this.accessToken &&
        (response.status === 401 || response.status === 403)
      ) {
        throw new TraktAppAccessDeniedError(response.status);
      }

      throw new Error(
        `Trakt API request failed: ${method} ${endpoint} returned ${response.status}`
      );
    } catch (e) {
      if (
        e instanceof TraktRateLimitedError ||
        e instanceof TraktReconnectRequiredError ||
        e instanceof TraktRefreshRejectedError ||
        e instanceof TraktAppAccessDeniedError ||
        (e instanceof Error && e.message.startsWith('Trakt API'))
      ) {
        throw e;
      }
      throw new Error(
        `Trakt API request failed: ${method} ${endpoint}: ${
          e instanceof Error ? e.message : 'unknown error'
        }`,
        { cause: e }
      );
    }
  }

  private parseRetryAfter(value?: string): number {
    try {
      return Math.max(0, Number.parseInt(value || '0', 10) || 0);
    } catch {
      return 0;
    }
  }

  private headerValue(headers: unknown, name: string): string | undefined {
    if (!headers || typeof headers !== 'object') {
      return undefined;
    }
    const map = headers as {
      get?: (headerName: string) => unknown;
      [key: string]: unknown;
    };
    const raw = map.get?.(name) ?? map[name] ?? map[name.toLowerCase()];
    if (Array.isArray(raw)) {
      return String(raw[0] ?? '');
    }
    return raw == null ? undefined : String(raw);
  }

  private listItemTypes(mediaType: TraktFetchMediaType): string {
    if (mediaType === 'movie') return 'movies';
    if (mediaType === 'tv') return 'shows';
    if (mediaType === 'all') return 'movies,shows';
    throw new Error("mediaType must be 'movie', 'tv', or 'all'");
  }

  private async fetchSortedListItems(
    fetchPage: (page: number) => Promise<TraktListEntry[] | undefined>,
    options: {
      page: number;
      limit: number;
      sortBy: TraktListSortBy;
      cacheKey: string;
    }
  ): Promise<TraktPaginatedItems> {
    type SortedPool = { items: TraktMediaItem[]; hasMoreUpstream: boolean };
    const cacheConfig = this.authCacheConfig({
      params: {
        sortBy: options.sortBy,
        limit: options.limit,
        pool: 'sorted-list',
      },
    });
    const cachedPool = this.getCached<SortedPool>(
      options.cacheKey,
      cacheConfig
    );
    if (cachedPool) {
      return paginateSortedTraktItems(cachedPool.items, {
        page: options.page,
        limit: options.limit,
        sortBy: options.sortBy,
        hasMoreUpstream: cachedPool.hasMoreUpstream,
      });
    }

    const collected: TraktMediaItem[] = [];
    const seen = new Set<string>();
    let traktPage = 1;
    let hasMoreUpstream = false;
    const maxPages = 10;

    while (traktPage <= maxPages) {
      const payload = await fetchPage(traktPage);
      const batch = this.normalizeListItems(payload);
      if (!batch.length) {
        hasMoreUpstream = false;
        break;
      }

      for (const entry of batch) {
        const key = traktItemKey(entry);
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        collected.push(entry);
      }

      if (batch.length < options.limit) {
        hasMoreUpstream = false;
        break;
      }

      hasMoreUpstream = true;
      traktPage++;
    }

    this.setCached(
      options.cacheKey,
      { items: collected, hasMoreUpstream } satisfies SortedPool,
      TRAKT_GET_CACHE_TTL_SECONDS,
      cacheConfig
    );

    return paginateSortedTraktItems(collected, {
      page: options.page,
      limit: options.limit,
      sortBy: options.sortBy,
      hasMoreUpstream,
    });
  }

  private normalizeMediaItem(
    item: TraktMediaObject | undefined,
    mediaType: 'movie' | 'tv'
  ): TraktMediaItem | null {
    if (!item) {
      return null;
    }
    const tmdbRaw = Number(item.ids?.tmdb);
    const tmdbId =
      Number.isFinite(tmdbRaw) && tmdbRaw > 0 ? tmdbRaw : undefined;
    const slug = item.ids?.slug?.trim() || undefined;
    const traktRaw = Number(item.ids?.trakt);
    const traktId =
      Number.isFinite(traktRaw) && traktRaw > 0 ? traktRaw : undefined;
    const imdbId = item.ids?.imdb?.trim() || undefined;
    const tvdbRaw = Number(item.ids?.tvdb);
    const tvdbId =
      Number.isFinite(tvdbRaw) && tvdbRaw > 0 ? tvdbRaw : undefined;
    if (!tmdbId && !slug && !traktId) {
      return null;
    }
    const communityRating =
      item.rating != null && Number.isFinite(Number(item.rating))
        ? Number(item.rating)
        : undefined;
    return {
      ...(tmdbId ? { tmdbId } : {}),
      mediaType,
      title:
        item.title || item.name || slug || (traktId ? String(traktId) : ''),
      year: item.year,
      ...(slug ? { traktSlug: slug } : {}),
      ...(traktId ? { traktId } : {}),
      ...(imdbId ? { imdbId } : {}),
      ...(tvdbId ? { tvdbId } : {}),
      ...(communityRating != null
        ? { traktCommunityRating: communityRating }
        : {}),
    };
  }

  private normalizeRecommendationItems(
    payload: TraktMediaObject[] | undefined,
    mediaType: 'movie' | 'tv'
  ): TraktMediaItem[] {
    const items: TraktMediaItem[] = [];
    const seen = new Set<string>();
    for (const entry of payload || []) {
      const normalized = this.normalizeMediaItem(entry, mediaType);
      if (!normalized) continue;
      const key = traktItemKey(normalized);
      if (seen.has(key)) continue;
      seen.add(key);
      items.push(normalized);
    }
    return items;
  }

  private normalizeListItems(
    payload: TraktListEntry[] | undefined
  ): TraktMediaItem[] {
    const items: TraktMediaItem[] = [];
    const seen = new Set<string>();
    for (const entry of payload || []) {
      let normalized: TraktMediaItem | null = null;
      if (entry.type === 'movie') {
        normalized = this.normalizeMediaItem(entry.movie, 'movie');
      } else if (entry.type === 'show' || entry.type === 'episode') {
        normalized = this.normalizeMediaItem(entry.show, 'tv');
      }
      if (!normalized) continue;
      const key = traktItemKey(normalized);
      if (seen.has(key)) continue;
      seen.add(key);
      const media = entry.movie || entry.show;
      const sortAt = entry.listed_at || entry.watched_at;
      items.push({
        ...normalized,
        ...(sortAt ? { traktAddedAt: sortAt } : {}),
        ...(media?.released || media?.first_aired
          ? {
              traktReleaseDate: media.released || media.first_aired,
            }
          : {}),
      });
    }

    return items;
  }

  private normalizeUserLists(
    payload: TraktUserList[] | undefined
  ): TraktListMetadata[] {
    return (payload || []).map((entry) => this.normalizeListMetadata(entry));
  }

  private normalizeListMetadata(
    payload: TraktUserList = {}
  ): TraktListMetadata {
    const ids = payload.ids || {};
    const slug = payload.slug || ids.slug || '';
    const listId = ids.trakt;
    const user = payload.user || {};
    const userIds = user.ids || {};
    const username = user.username || user.slug || userIds.slug || '';

    return {
      id: listId != null ? String(listId) : '',
      slug: String(slug),
      name: payload.name || payload.title || String(slug),
      itemCount: Number(payload.item_count || 0),
      privacy: payload.privacy,
      username: username ? String(username) : undefined,
    };
  }
}

export default TraktAPI;
