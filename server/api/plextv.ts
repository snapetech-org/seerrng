import type { PlexDevice } from '@server/interfaces/api/plexInterfaces';
import cacheManager from '@server/lib/cache';
import { getSettings } from '@server/lib/settings';
import logger from '@server/logger';
import { mapWithConcurrency } from '@server/utils/concurrency';
import {
  getHttpErrorDetails,
  withTransientHttpRetry,
} from '@server/utils/httpError';
import { randomUUID } from 'node:crypto';
import xml2js from 'xml2js';
import ExternalAPI, { createExternalApiCacheKeySuffix } from './externalapi';

export const PLEXTV_HTTP_OPTIONS = {
  timeout: 10_000,
  maxContentLength: 1024 * 1024,
  maxBodyLength: 1024,
} as const;
export const MAX_PLEX_SHARED_USERS = 250;
export const MAX_PLEX_WATCHLIST_PAGE_SIZE = 100;
export const PLEX_WATCHLIST_HYDRATION_CONCURRENCY = 10;
const PLEX_WATCHLIST_USER_STATE_CACHE_TTL_SECONDS = 15;
const PLEX_DISCOVER_API_URL = 'https://discover.provider.plex.tv';
const PLEX_METADATA_API_URL = 'https://metadata.provider.plex.tv';
const MAX_PLEX_WATCHLIST_OFFSET = 1_000_000;
const MAX_PLEX_WATCHLIST_TOTAL = 1_000_000;
const MAX_PLEX_METADATA_GUIDS = 100;
const MAX_PLEX_METADATA_TITLE_LENGTH = 512;
const MAX_PLEX_PROVIDER_ID = 1_000_000_000;
export const MAX_PLEX_RESOURCE_DEVICES = 250;
export const MAX_PLEX_RESOURCE_CONNECTIONS = 100;
const MAX_PLEX_RESOURCE_SERVERS_PER_USER = 100;
const MAX_PLEX_RESOURCE_TEXT_LENGTH = 2048;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const boundedPlexText = (
  value: unknown,
  maximum = MAX_PLEX_RESOURCE_TEXT_LENGTH
) => (typeof value === 'string' ? value.slice(0, maximum) : '');

const parsePlexTimestamp = (value: unknown): Date => {
  if (typeof value !== 'string' || !/^\d{1,15}$/.test(value)) {
    return new Date(0);
  }
  const milliseconds = Number(value) * 1000;
  return Number.isSafeInteger(milliseconds)
    ? new Date(milliseconds)
    : new Date(0);
};

export const parsePlexDevices = (value: unknown): PlexDevice[] => {
  if (!isRecord(value) || !isRecord(value.MediaContainer)) {
    return [];
  }
  const devices = value.MediaContainer.Device;
  if (!Array.isArray(devices)) {
    return [];
  }

  return devices.slice(0, MAX_PLEX_RESOURCE_DEVICES).flatMap((device) => {
    if (!isRecord(device) || !isRecord(device.$)) {
      return [];
    }
    const attributes = device.$;
    const name = boundedPlexText(attributes.name);
    const product = boundedPlexText(attributes.product);
    const clientIdentifier = boundedPlexText(attributes.clientIdentifier, 512);
    if (!name || !product || !clientIdentifier) {
      return [];
    }
    const rawConnections = Array.isArray(device.Connection)
      ? device.Connection
      : [];
    const connection = rawConnections
      .slice(0, MAX_PLEX_RESOURCE_CONNECTIONS)
      .flatMap((rawConnection) => {
        if (!isRecord(rawConnection) || !isRecord(rawConnection.$)) {
          return [];
        }
        const connectionAttributes = rawConnection.$;
        const protocol = boundedPlexText(connectionAttributes.protocol, 16);
        const address = boundedPlexText(connectionAttributes.address, 512);
        const uri = boundedPlexText(connectionAttributes.uri);
        const port = Number(connectionAttributes.port);
        if (
          !['http', 'https'].includes(protocol) ||
          !address ||
          !uri ||
          !Number.isSafeInteger(port) ||
          port < 1 ||
          port > 65_535
        ) {
          return [];
        }
        return [
          {
            protocol,
            address,
            port,
            uri,
            local: connectionAttributes.local === '1',
          },
        ];
      });

    return [
      {
        name,
        product,
        productVersion: boundedPlexText(attributes.productVersion, 512),
        platform: boundedPlexText(attributes.platform, 512),
        platformVersion: boundedPlexText(attributes.platformVersion, 512),
        device: boundedPlexText(attributes.device, 512),
        clientIdentifier,
        createdAt: parsePlexTimestamp(attributes.createdAt),
        lastSeenAt: parsePlexTimestamp(attributes.lastSeenAt),
        provides: boundedPlexText(attributes.provides, 512)
          .split(',')
          .slice(0, 50)
          .map((entry) => entry.trim())
          .filter(Boolean),
        owned: attributes.owned === '1',
        publicAddress:
          boundedPlexText(attributes.publicAddress, 512) || undefined,
        httpsRequired: attributes.httpsRequired === '1',
        synced: attributes.synced === '1',
        relay: attributes.relay === '1',
        dnsRebindingProtection: attributes.dnsRebindingProtection === '1',
        natLoopbackSupported: attributes.natLoopbackSupported === '1',
        publicAddressMatches: attributes.publicAddressMatches === '1',
        presence: attributes.presence === '1',
        ownerID: boundedPlexText(attributes.ownerID, 512) || undefined,
        home: attributes.home === '1',
        sourceTitle: boundedPlexText(attributes.sourceTitle, 512) || undefined,
        connection,
      },
    ];
  });
};

interface PlexAccountResponse {
  user: PlexUser;
}

interface PlexUser {
  id: number;
  uuid: string;
  email: string;
  joined_at: string;
  username: string;
  title: string;
  thumb: string;
  hasPassword: boolean;
  authToken: string;
  subscription: {
    active: boolean;
    status: string;
    plan: string;
    features: string[];
  };
  roles: {
    roles: string[];
  };
  entitlements: string[];
}

interface ServerResponse {
  $: {
    id: string;
    serverId: string;
    machineIdentifier: string;
    name: string;
    lastSeenAt: string;
    numLibraries: string;
    owned: string;
  };
}

export interface PlexSharedUser {
  $: {
    id: string;
    title: string;
    username: string;
    email: string;
    thumb: string;
  };
  Server?: ServerResponse[];
}

interface UsersResponse {
  MediaContainer: {
    User: PlexSharedUser[];
  };
}

export const parsePlexSharedUsers = (value: unknown): UsersResponse => {
  const mediaContainer = isRecord(value) ? value.MediaContainer : undefined;
  const rawUsers = isRecord(mediaContainer) ? mediaContainer.User : undefined;
  const users = (Array.isArray(rawUsers) ? rawUsers : [])
    .slice(0, MAX_PLEX_SHARED_USERS)
    .flatMap((rawUser) => {
      if (!isRecord(rawUser) || !isRecord(rawUser.$)) {
        return [];
      }
      const attributes = rawUser.$;
      const id = boundedPlexText(attributes.id, 32);
      if (!/^\d{1,20}$/.test(id)) {
        return [];
      }
      const servers = (Array.isArray(rawUser.Server) ? rawUser.Server : [])
        .slice(0, MAX_PLEX_RESOURCE_SERVERS_PER_USER)
        .flatMap((rawServer) => {
          if (!isRecord(rawServer) || !isRecord(rawServer.$)) {
            return [];
          }
          const server = rawServer.$;
          const machineIdentifier = boundedPlexText(
            server.machineIdentifier,
            512
          );
          if (!machineIdentifier) {
            return [];
          }
          return [
            {
              $: {
                id: boundedPlexText(server.id, 32),
                serverId: boundedPlexText(server.serverId, 32),
                machineIdentifier,
                name: boundedPlexText(server.name, 512),
                lastSeenAt: boundedPlexText(server.lastSeenAt, 32),
                numLibraries: boundedPlexText(server.numLibraries, 32),
                owned: boundedPlexText(server.owned, 8),
              },
            },
          ];
        });
      return [
        {
          $: {
            id,
            title: boundedPlexText(attributes.title, 512),
            username: boundedPlexText(attributes.username, 512),
            email: boundedPlexText(attributes.email, 512),
            thumb: boundedPlexText(attributes.thumb),
          },
          Server: servers,
        },
      ];
    });

  return { MediaContainer: { User: users } };
};

export const plexUserHasServerAccess = (
  user: PlexSharedUser,
  machineId: string | undefined
): boolean =>
  !!machineId &&
  !!user.Server?.some((server) => server.$.machineIdentifier === machineId);

interface WatchlistResponse {
  MediaContainer: {
    totalSize: number;
    Metadata?: {
      ratingKey: string;
    }[];
  };
}

interface PlexUserStateResponse {
  MediaContainer?: {
    UserState?:
      | {
          watchlistedAt?: unknown;
        }
      | {
          watchlistedAt?: unknown;
        }[];
  };
}

type PlexMetadataItem = {
  ratingKey: string;
  type: 'movie' | 'show';
  title: string;
  Guid?: {
    id: `imdb://tt${number}` | `tmdb://${number}` | `tvdb://${number}`;
  }[];
};
interface MetadataResponse {
  MediaContainer: {
    Metadata?: PlexMetadataItem[];
    Video?: PlexMetadataItem[];
  };
}

export interface PlexWatchlistItem {
  ratingKey: string;
  tmdbId: number;
  tvdbId?: number;
  type: 'movie' | 'show';
  title: string;
}

export const parsePlexWatchlistedAt = (value: unknown): Date | null => {
  const timestamp =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && /^\d{1,16}$/.test(value)
        ? Number(value)
        : undefined;

  if (
    typeof timestamp !== 'number' ||
    !Number.isSafeInteger(timestamp) ||
    timestamp <= 0
  ) {
    return null;
  }

  const milliseconds =
    timestamp > 100_000_000_000 ? timestamp : timestamp * 1000;
  const date = new Date(milliseconds);
  return Number.isFinite(date.getTime()) ? date : null;
};

export interface PlexWatchlistCache {
  etag: string;
  response: WatchlistResponse;
}

export const normalizePlexWatchlistPage = (offset: number, size: number) => ({
  offset:
    Number.isSafeInteger(offset) && offset >= 0
      ? Math.min(offset, MAX_PLEX_WATCHLIST_OFFSET)
      : 0,
  size:
    Number.isSafeInteger(size) && size > 0
      ? Math.min(size, MAX_PLEX_WATCHLIST_PAGE_SIZE)
      : 20,
});

export const preparePlexWatchlistRatingKeys = (
  value: unknown,
  limit = MAX_PLEX_WATCHLIST_PAGE_SIZE
): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const ratingKeys = new Set<string>();
  const maxItems =
    Number.isSafeInteger(limit) && limit > 0
      ? Math.min(limit, MAX_PLEX_WATCHLIST_PAGE_SIZE)
      : MAX_PLEX_WATCHLIST_PAGE_SIZE;
  for (const item of value) {
    const ratingKey =
      item && typeof item === 'object' && 'ratingKey' in item
        ? (item as { ratingKey?: unknown }).ratingKey
        : undefined;
    if (typeof ratingKey === 'string' && /^\d{1,20}$/.test(ratingKey)) {
      ratingKeys.add(ratingKey);
    }
    if (ratingKeys.size >= maxItems) {
      break;
    }
  }

  return [...ratingKeys];
};

export const createPlexWatchlistPageCacheKey = (
  cacheKeyPrefix: string,
  offset: number,
  size: number
) => `${cacheKeyPrefix}:${offset}:${size}`;

const parsePlexGuidId = (
  value: unknown,
  provider: 'tmdb' | 'tvdb'
): number | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }

  const match = new RegExp(`^${provider}:\\/\\/(\\d{1,10})$`).exec(value);
  const id = match ? Number(match[1]) : undefined;
  return typeof id === 'number' &&
    Number.isSafeInteger(id) &&
    id > 0 &&
    id <= MAX_PLEX_PROVIDER_ID
    ? id
    : undefined;
};

const parsePlexWatchlistMetadata = (
  metadata: PlexMetadataItem | undefined
): PlexWatchlistItem | undefined => {
  if (
    !metadata ||
    typeof metadata.ratingKey !== 'string' ||
    !/^\d{1,20}$/.test(metadata.ratingKey) ||
    (metadata.type !== 'movie' && metadata.type !== 'show') ||
    typeof metadata.title !== 'string'
  ) {
    return undefined;
  }

  const title = metadata.title.trim();
  if (!title || title.length > MAX_PLEX_METADATA_TITLE_LENGTH) {
    return undefined;
  }

  const guids = Array.isArray(metadata.Guid)
    ? metadata.Guid.slice(0, MAX_PLEX_METADATA_GUIDS)
    : [];
  const tmdbId = guids
    .map((guid) => parsePlexGuidId(guid?.id, 'tmdb'))
    .find((id) => id !== undefined);
  if (tmdbId === undefined) {
    return undefined;
  }

  const tvdbId = guids
    .map((guid) => parsePlexGuidId(guid?.id, 'tvdb'))
    .find((id) => id !== undefined);

  return {
    ratingKey: metadata.ratingKey,
    tmdbId,
    tvdbId,
    title,
    type: metadata.type,
  };
};

class PlexTvAPI extends ExternalAPI {
  private watchlistCacheKeyPrefix: string;

  constructor(authToken: string) {
    super(
      'https://plex.tv',
      {},
      {
        allowedBaseUrls: [PLEX_DISCOVER_API_URL, PLEX_METADATA_API_URL],
        headers: {
          'X-Plex-Token': authToken,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        ...PLEXTV_HTTP_OPTIONS,
        nodeCache: cacheManager.getCache('plextv').data,
      }
    );

    this.watchlistCacheKeyPrefix = createExternalApiCacheKeySuffix({
      authToken,
    });
  }

  public async getDevices(): Promise<PlexDevice[]> {
    try {
      const devicesResp = await this.request<string>(
        'GET',
        '/api/resources?includeHttps=1',
        undefined,
        {
          transformResponse: [],
          responseType: 'text',
        }
      );
      const parsedXml = await xml2js.parseStringPromise(devicesResp.data);
      return parsePlexDevices(parsedXml);
    } catch (e) {
      logger.error('Something went wrong getting the devices from plex.tv', {
        label: 'Plex.tv API',
        errorMessage: e.message,
      });
      throw new Error('Invalid auth token', { cause: e });
    }
  }

  public async getUser(): Promise<PlexUser> {
    try {
      const account = await this.request<PlexAccountResponse>(
        'GET',
        '/users/account.json'
      );

      return account.data.user;
    } catch (e) {
      logger.error(
        `Something went wrong while getting the account from plex.tv: ${e.message}`,
        { label: 'Plex.tv API' }
      );
      throw new Error('Invalid auth token', { cause: e });
    }
  }

  public async checkUserAccess(userId: number): Promise<boolean> {
    const settings = getSettings();

    try {
      if (!settings.plex.machineId) {
        throw new Error('Plex is not configured!');
      }

      const usersResponse = await this.getUsers();

      const users = usersResponse.MediaContainer.User;

      const user = users.find((u) => parseInt(u.$.id) === userId);

      if (!user) {
        throw new Error(
          "This user does not exist on the main Plex account's shared list"
        );
      }

      return plexUserHasServerAccess(user, settings.plex.machineId);
    } catch (e) {
      logger.error(`Error checking user access: ${e.message}`);
      return false;
    }
  }

  public async getUsers(): Promise<UsersResponse> {
    const response = await this.request<string>(
      'GET',
      '/api/users',
      undefined,
      {
        transformResponse: [],
        responseType: 'text',
      }
    );

    const parsedXml = await xml2js.parseStringPromise(response.data);
    return parsePlexSharedUsers(parsedXml);
  }

  public async getWatchlist({
    offset = 0,
    size = 20,
  }: { offset?: number; size?: number } = {}): Promise<{
    offset: number;
    size: number;
    totalSize: number;
    items: PlexWatchlistItem[];
  }> {
    const page = normalizePlexWatchlistPage(offset, size);
    offset = page.offset;
    size = page.size;

    try {
      const watchlistCache = cacheManager.getCache('plexwatchlist');
      const watchlistCacheKey = createPlexWatchlistPageCacheKey(
        this.watchlistCacheKeyPrefix,
        offset,
        size
      );
      let cachedWatchlist =
        watchlistCache.data.get<PlexWatchlistCache>(watchlistCacheKey);

      const response = await withTransientHttpRetry(
        () =>
          this.request<WatchlistResponse>(
            'GET',
            '/library/sections/watchlist/all',
            undefined,
            {
              params: {
                'X-Plex-Container-Start': offset,
                'X-Plex-Container-Size': size,
              },
              headers: {
                'If-None-Match': cachedWatchlist?.etag,
              },
              baseURL: PLEX_DISCOVER_API_URL,
              validateStatus: (status) => status < 400, // Allow HTTP 304 to return without error
            }
          ),
        {
          onRetry: (error, nextAttempt) => {
            logger.warn('Retrying transient Plex watchlist request', {
              label: 'Plex.TV Metadata API',
              nextAttempt,
              ...getHttpErrorDetails(error),
            });
          },
        }
      );

      // If we don't recieve HTTP 304, the watchlist has been updated and we need to update the cache.
      if (response.status >= 200 && response.status <= 299) {
        cachedWatchlist = {
          etag: response.headers.etag,
          response: response.data,
        };

        watchlistCache.data.set<PlexWatchlistCache>(
          watchlistCacheKey,
          cachedWatchlist
        );
      }

      const ratingKeys = preparePlexWatchlistRatingKeys(
        cachedWatchlist?.response?.MediaContainer?.Metadata,
        size
      );
      const watchlistDetails = await mapWithConcurrency(
        ratingKeys,
        PLEX_WATCHLIST_HYDRATION_CONCURRENCY,
        async (ratingKey) => {
          let detailedResponse: MetadataResponse;
          try {
            detailedResponse = await this.getRolling<MetadataResponse>(
              `/library/metadata/${ratingKey}`,
              {
                baseURL: PLEX_DISCOVER_API_URL,
              }
            );
          } catch (e) {
            if (e.response?.status === 404) {
              logger.warn(
                `Item with ratingKey ${ratingKey} not found, it may have been removed from the server.`,
                { label: 'Plex.TV Metadata API' }
              );
              return undefined;
            } else {
              throw e;
            }
          }

          const metadata =
            detailedResponse?.MediaContainer?.Metadata?.[0] ??
            detailedResponse?.MediaContainer?.Video?.[0];

          if (!metadata) {
            logger.warn(
              `Item with ratingKey ${ratingKey} returned no metadata, skipping.`,
              { label: 'Plex.TV Metadata API' }
            );
            return undefined;
          }

          return parsePlexWatchlistMetadata(metadata);
        }
      );

      const filteredList = watchlistDetails.filter(
        (detail): detail is PlexWatchlistItem => detail !== undefined
      );
      const totalSizeCandidate =
        cachedWatchlist?.response?.MediaContainer?.totalSize;
      const totalSize =
        typeof totalSizeCandidate === 'number' &&
        Number.isSafeInteger(totalSizeCandidate) &&
        totalSizeCandidate >= 0
          ? Math.min(
              Math.max(totalSizeCandidate, filteredList.length),
              MAX_PLEX_WATCHLIST_TOTAL
            )
          : filteredList.length;

      return {
        offset,
        size,
        totalSize,
        items: filteredList,
      };
    } catch (error) {
      logger.error('Failed to retrieve watchlist items', {
        label: 'Plex.TV Metadata API',
        ...getHttpErrorDetails(error),
      });
      return {
        offset,
        size,
        totalSize: 0,
        items: [],
      };
    }
  }

  public async getWatchlistedAt(ratingKey: string): Promise<Date | null> {
    if (!/^\d{1,20}$/.test(ratingKey)) {
      return null;
    }

    const watchlistCache = cacheManager.getCache('plexwatchlist').data;
    const cacheKey = `${this.watchlistCacheKeyPrefix}:userstate:${ratingKey}`;
    const cachedTimestamp = watchlistCache.get<number | null>(cacheKey);

    if (cachedTimestamp !== undefined) {
      return cachedTimestamp === null ? null : new Date(cachedTimestamp);
    }

    try {
      const response = await this.request<PlexUserStateResponse>(
        'GET',
        `/library/metadata/${ratingKey}/userState`,
        undefined,
        { baseURL: PLEX_METADATA_API_URL }
      );
      const userState = response.data?.MediaContainer?.UserState;
      const state = Array.isArray(userState) ? userState[0] : userState;
      const watchlistedAt = parsePlexWatchlistedAt(state?.watchlistedAt);

      watchlistCache.set(
        cacheKey,
        watchlistedAt?.getTime() ?? null,
        PLEX_WATCHLIST_USER_STATE_CACHE_TTL_SECONDS
      );

      return watchlistedAt;
    } catch (error) {
      logger.warn('Failed to retrieve Plex watchlist item state', {
        label: 'Plex.TV Metadata API',
        ...getHttpErrorDetails(error),
      });
      return null;
    }
  }

  public async pingToken() {
    try {
      const response = await this.request<{ pong?: boolean }>(
        'GET',
        '/api/v2/ping',
        undefined,
        {
          headers: {
            'X-Plex-Client-Identifier': randomUUID(),
          },
        }
      );
      if (!response?.data?.pong) {
        throw new Error('No pong response');
      }
    } catch (e) {
      logger.error('Failed to ping token', {
        label: 'Plex Refresh Token',
        errorMessage: e.message,
      });
    }
  }
}

export default PlexTvAPI;
