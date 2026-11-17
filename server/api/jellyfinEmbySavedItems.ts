import ExternalAPI from '@server/api/externalapi';
import { MediaServerType } from '@server/constants/server';
import { getSettings } from '@server/lib/settings';
import type {
  MediaServerCollectionContext,
  MediaServerCollectionOption,
  MediaServerCollectionsStatus,
} from '@server/models/MediaServerCollections';
import { getHostname } from '@server/utils/getHostname';
import { getMediaBrowserAuthorizationHeaders } from '@server/utils/mediaServerAuthorization';

const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
export const validSavedItemId = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-z\d-]{1,128}$/i.test(value);
const sameId = (left: unknown, right: string): boolean =>
  validSavedItemId(left) &&
  (left === right ||
    (/^[a-f\d]{32}$/i.test(left.replace(/-/g, '')) &&
      /^[a-f\d]{32}$/i.test(right.replace(/-/g, '')) &&
      left.replace(/-/g, '').toLowerCase() ===
        right.replace(/-/g, '').toLowerCase()));
const validTmdbId = (value: number): boolean =>
  Number.isSafeInteger(value) && value > 0;

class SavedItemError extends Error {
  constructor(
    readonly reason: NonNullable<MediaServerCollectionsStatus['reason']>
  ) {
    super(`Media-server action unavailable: ${reason}.`);
  }
}

/** Native account Favorites and shared collections. No service-owner token fallback. */
export class FavoriteSeriesAPI extends ExternalAPI {
  private readonly serverType: MediaServerType;
  private readonly trustedAccountPair: boolean;
  private readonly verifiedSeries = new Map<string, number>();

  constructor(
    host: string,
    token: string,
    private readonly userId: string,
    options: {
      serverType?: MediaServerType;
      trustedAccountPair?: boolean;
    } = {}
  ) {
    if (!validSavedItemId(userId) || !token || /[\r\n]/.test(token))
      throw new SavedItemError('account-not-linked');
    super(
      host,
      {},
      {
        allowPrivateAddresses: true,
        timeout: 8000,
        maxContentLength: 2 * 1024 * 1024,
        headers: {
          ...((options.serverType ?? getSettings().main.mediaServerType) ===
          MediaServerType.EMBY
            ? { 'X-Emby-Token': token }
            : getMediaBrowserAuthorizationHeaders({
                mediaServerType: MediaServerType.JELLYFIN,
                deviceId: Buffer.from('BOT_seerr').toString('base64'),
                token,
              })),
          Accept: 'application/json',
        },
      }
    );
    this.serverType = options.serverType ?? getSettings().main.mediaServerType;
    this.trustedAccountPair = options.trustedAccountPair === true;
  }

  private async profile(): Promise<Record<string, unknown>> {
    let data: unknown;
    if (this.serverType === MediaServerType.JELLYFIN) {
      ({ data } = await this.request<unknown>('GET', '/Users/Me'));
    } else if (this.serverType === MediaServerType.EMBY) {
      // Emby documents no token-self endpoint. Only accept the server-owned
      // User.Id + AccessToken pair persisted from the SAME native login result
      // by Seerr's authenticated linking/login flow. Users/{Id} alone is not
      // proof of token ownership; a client-supplied ID or DeviceId cannot attest it.
      if (!this.trustedAccountPair)
        throw new SavedItemError('account-not-linked');
      ({ data } = await this.request<unknown>('GET', `/Users/${this.userId}`));
    } else {
      throw new SavedItemError('unsupported-server');
    }
    if (
      !record(data) ||
      !sameId(data.Id, this.userId) ||
      !record(data.Policy) ||
      data.Policy.IsDisabled === true
    )
      throw new SavedItemError('not-authorized');
    return data;
  }

  public async verifyAccount(): Promise<void> {
    await this.profile();
  }

  public async getSeriesSaved(
    itemId: string,
    tmdbId: number
  ): Promise<boolean> {
    if (!validSavedItemId(itemId) || !validTmdbId(tmdbId))
      throw new SavedItemError('series-not-found');
    this.verifiedSeries.delete(itemId);
    await this.verifyAccount();
    const { data } = await this.request<unknown>(
      'GET',
      `/Users/${this.userId}/Items/${itemId}`,
      undefined,
      { params: { Fields: 'ProviderIds' } }
    );
    if (
      !record(data) ||
      !sameId(data.Id, itemId) ||
      data.Type !== 'Series' ||
      !record(data.ProviderIds) ||
      (data.ProviderIds.Tmdb ?? data.ProviderIds.TheMovieDb) !==
        String(tmdbId) ||
      !record(data.UserData) ||
      typeof data.UserData.IsFavorite !== 'boolean' ||
      data.LocationType === 'Virtual' ||
      data.LocationType === 'Offline'
    )
      throw new SavedItemError('series-not-found');
    this.verifiedSeries.set(itemId, tmdbId);
    return data.UserData.IsFavorite;
  }

  public async setSaved(itemId: string, saved: boolean): Promise<boolean> {
    const tmdbId = this.verifiedSeries.get(itemId);
    if (!tmdbId || typeof saved !== 'boolean')
      throw new SavedItemError('series-not-found');
    const current = await this.getSeriesSaved(itemId, tmdbId);
    if (current !== saved) {
      const { data } = await this.request<unknown>(
        saved ? 'POST' : 'DELETE',
        `/Users/${this.userId}/FavoriteItems/${itemId}`
      );
      if (!record(data) || data.IsFavorite !== saved)
        throw new Error('Favorites update could not be verified.');
    }
    const confirmed = await this.getSeriesSaved(itemId, tmdbId);
    if (confirmed !== saved)
      throw new Error('Favorites update could not be verified.');
    return confirmed;
  }

  private async verifyCollectionManagement(): Promise<void> {
    const profile = await this.profile();
    const policy = profile.Policy as Record<string, unknown>;
    // Jellyfin's controller uses EnableCollectionManagement. Emby's documented
    // policy has no equivalent field: permit verified native administrators only
    // until a finer current permission contract is established.
    if (
      this.serverType === MediaServerType.JELLYFIN
        ? policy.EnableCollectionManagement !== true
        : policy.IsAdministrator !== true
    )
      throw new SavedItemError('not-authorized');
  }

  private async collectionMember(
    collectionId: string,
    itemId: string,
    verifyCollection = true
  ): Promise<boolean> {
    if (verifyCollection) {
      const { data: collection } = await this.request<unknown>(
        'GET',
        `/Users/${this.userId}/Items/${collectionId}`
      );
      if (
        !record(collection) ||
        !sameId(collection.Id, collectionId) ||
        collection.Type !== 'BoxSet'
      )
        throw new SavedItemError('not-authorized');
    }
    const { data } = await this.request<unknown>(
      'GET',
      `/Users/${this.userId}/Items`,
      undefined,
      {
        params: {
          ParentId: collectionId,
          Ids: itemId,
          Recursive: false,
          CollapseBoxSetItems: false,
          Limit: 2,
        },
      }
    );
    if (
      !record(data) ||
      !Array.isArray(data.Items) ||
      !Number.isSafeInteger(data.TotalRecordCount) ||
      data.TotalRecordCount !== data.Items.length ||
      data.Items.length > 1 ||
      data.Items.some(
        (item) =>
          !record(item) || !sameId(item.Id, itemId) || item.Type !== 'Series'
      )
    )
      throw new Error('Collection membership could not be verified.');
    return data.Items.length === 1;
  }

  public async seriesCollections(
    itemId: string,
    tmdbId: number
  ): Promise<MediaServerCollectionOption[]> {
    await this.verifyCollectionManagement();
    await this.getSeriesSaved(itemId, tmdbId);
    const options: MediaServerCollectionOption[] = [];
    const seen = new Set<string>();
    let total: number | undefined;
    for (let offset = 0; offset < 200; offset += 50) {
      const { data } = await this.request<unknown>(
        'GET',
        `/Users/${this.userId}/Items`,
        undefined,
        {
          params: {
            IncludeItemTypes: 'BoxSet',
            Recursive: true,
            SortBy: 'SortName',
            SortOrder: 'Ascending',
            StartIndex: offset,
            Limit: 50,
          },
        }
      );
      if (
        !record(data) ||
        !Array.isArray(data.Items) ||
        !Number.isSafeInteger(data.TotalRecordCount) ||
        Number(data.TotalRecordCount) < 0 ||
        data.StartIndex !== offset ||
        data.Items.length > 50
      )
        throw new Error('Collection list could not be verified.');
      if (Number(data.TotalRecordCount) > 200)
        throw new SavedItemError('collection-limit');
      if (total !== undefined && total !== data.TotalRecordCount)
        throw new Error('Collection list changed during loading.');
      total = Number(data.TotalRecordCount);
      for (const raw of data.Items) {
        if (
          !record(raw) ||
          raw.Type !== 'BoxSet' ||
          !validSavedItemId(raw.Id) ||
          typeof raw.Name !== 'string' ||
          !raw.Name.trim() ||
          raw.Name.length > 512 ||
          seen.has(raw.Id)
        )
          throw new Error('Collection identity could not be verified.');
        seen.add(raw.Id);
        options.push({
          id: raw.Id,
          name: raw.Name,
          // This fresh user-scoped page already verified the BoxSet identity.
          // Only writes need the additional direct collection identity read.
          member: await this.collectionMember(raw.Id, itemId, false),
        });
      }
      if (options.length === total) return options;
      if (options.length > total || data.Items.length !== 50)
        throw new Error('Incomplete collection list.');
    }
    throw new SavedItemError('collection-limit');
  }

  public async setCollectionMembership(
    itemId: string,
    tmdbId: number,
    collectionId: string,
    member: boolean
  ): Promise<MediaServerCollectionOption[]> {
    if (!validSavedItemId(collectionId) || typeof member !== 'boolean')
      throw new SavedItemError('not-authorized');
    const options = await this.seriesCollections(itemId, tmdbId);
    const selected = options.find((option) => option.id === collectionId);
    if (!selected) throw new SavedItemError('not-authorized');
    if (selected.member !== member) {
      // Revalidate capability and identities immediately before the native write.
      await this.verifyCollectionManagement();
      await this.getSeriesSaved(itemId, tmdbId);
      await this.collectionMember(collectionId, itemId);
      await this.request(
        member ? 'POST' : 'DELETE',
        `/Collections/${collectionId}/Items`,
        undefined,
        { params: { Ids: itemId } }
      );
      if ((await this.collectionMember(collectionId, itemId)) !== member)
        throw new Error('Collection update could not be verified.');
    }
    return this.seriesCollections(itemId, tmdbId);
  }
}

const collectionClient = (
  context: MediaServerCollectionContext
): FavoriteSeriesAPI => {
  const settings = getSettings();
  if (
    ![MediaServerType.JELLYFIN, MediaServerType.EMBY].includes(
      settings.main.mediaServerType
    )
  )
    throw new SavedItemError('unsupported-server');
  if (!context.user.jellyfinAuthToken || !context.user.jellyfinUserId)
    throw new SavedItemError('account-not-linked');
  return new FavoriteSeriesAPI(
    getHostname(settings.jellyfin),
    context.user.jellyfinAuthToken,
    context.user.jellyfinUserId,
    { serverType: settings.main.mediaServerType, trustedAccountPair: true }
  );
};

export const getJellyfinEmbySeriesCollections = async (
  context: MediaServerCollectionContext
): Promise<MediaServerCollectionsStatus> => {
  const serverType = getSettings().main.mediaServerType;
  try {
    const collections = await collectionClient(context).seriesCollections(
      context.itemId,
      context.tmdbId
    );
    return { serverType, available: true, collections };
  } catch (error) {
    if (error instanceof SavedItemError)
      return {
        serverType,
        available: false,
        reason: error.reason,
        collections: [],
      };
    throw error;
  }
};

export const setJellyfinEmbySeriesCollectionMembership = async (
  context: MediaServerCollectionContext,
  collectionId: string,
  member: boolean
): Promise<MediaServerCollectionsStatus> => ({
  serverType: getSettings().main.mediaServerType,
  available: true,
  collections: await collectionClient(context).setCollectionMembership(
    context.itemId,
    context.tmdbId,
    collectionId,
    member
  ),
});
