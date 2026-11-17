import { MediaServerType } from '@server/constants/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FavoriteSeriesAPI,
  getJellyfinEmbySeriesCollections,
} from './jellyfinEmbySavedItems';

const state = vi.hoisted(() => ({
  request: vi.fn(),
  construction: vi.fn(),
  settings: { main: { mediaServerType: 2 }, jellyfin: {} },
}));
vi.mock('@server/api/externalapi', () => ({
  default: class {
    constructor(...args: unknown[]) {
      state.construction(...args);
    }
    request(...args: unknown[]) {
      return state.request(...args);
    }
  },
}));
vi.mock('@server/lib/settings', () => ({ getSettings: () => state.settings }));
vi.mock('@server/utils/getHostname', () => ({
  getHostname: () => 'http://configured-server:8096',
}));

const userId = '11111111111141118111111111111111';
const profile = (permission = true) => ({
  Id: userId,
  Policy: {
    IsAdministrator: permission,
    EnableCollectionManagement: permission,
    IsDisabled: false,
  },
});
const series = (saved = false) => ({
  Id: 'series',
  Type: 'Series',
  ProviderIds: { Tmdb: '113962' },
  UserData: { IsFavorite: saved },
});
const client = (type = MediaServerType.JELLYFIN, trustedAccountPair = true) =>
  new FavoriteSeriesAPI(
    'http://configured-server:8096',
    'own-user-token',
    userId,
    { serverType: type, trustedAccountPair }
  );
const collectionsPage = (
  items: unknown[] = [{ Id: 'collection', Type: 'BoxSet', Name: 'Watch Next' }],
  total = items.length,
  offset = 0
) => ({ Items: items, TotalRecordCount: total, StartIndex: offset });

beforeEach(() => {
  state.request.mockReset();
  state.construction.mockClear();
  state.settings.main.mediaServerType = MediaServerType.JELLYFIN;
});

describe.each([MediaServerType.JELLYFIN, MediaServerType.EMBY])(
  'native saved actions %s',
  (type) => {
    it('uses only the linked user token, never service API key', async () => {
      const api = client(type);
      state.request.mockResolvedValue({ data: profile() });
      await api.verifyAccount();
      const headers = state.construction.mock.calls[0][2].headers;
      expect(headers.Accept).toBe('application/json');
      if (type === MediaServerType.JELLYFIN) {
        expect(headers.Authorization).toMatch(
          /^MediaBrowser .*Token="own-user-token"/
        );
        expect(headers['X-Emby-Token']).toBeUndefined();
      } else {
        expect(headers['X-Emby-Token']).toBe('own-user-token');
        expect(headers.Authorization).toBeUndefined();
      }
      expect(state.request.mock.calls[0][1]).toBe(
        type === MediaServerType.JELLYFIN ? '/Users/Me' : `/Users/${userId}`
      );
    });
    it('rejects a mismatched or disabled account', async () => {
      const api = client(type);
      state.request.mockResolvedValue({ data: { ...profile(), Id: 'other' } });
      await expect(api.verifyAccount()).rejects.toThrow('not-authorized');
      state.request.mockResolvedValue({
        data: { ...profile(), Policy: { IsDisabled: true } },
      });
      await expect(api.verifyAccount()).rejects.toThrow('not-authorized');
    });
    it('rejects wrong source or non-Series before any write', async () => {
      const api = client(type);
      state.request.mockImplementation(async (_method, path) => ({
        data: path.includes('/Items/')
          ? { ...series(), ProviderIds: { Tmdb: '999' } }
          : profile(),
      }));
      await expect(api.getSeriesSaved('series', 113962)).rejects.toThrow(
        'series-not-found'
      );
      await expect(api.setSaved('series', true)).rejects.toThrow(
        'series-not-found'
      );
      expect(
        state.request.mock.calls.every(([method]) => method === 'GET')
      ).toBe(true);
    });
    it('writes only the verified whole-Series FavoriteItems route and confirms fresh state', async () => {
      const api = client(type);
      let saved = false;
      state.request.mockImplementation(async (method, path) => {
        if (method === 'POST') {
          saved = true;
          return { data: { IsFavorite: true } };
        }
        return { data: path.includes('/Items/') ? series(saved) : profile() };
      });
      await api.getSeriesSaved('series', 113962);
      expect(await api.setSaved('series', true)).toBe(true);
      const writes = state.request.mock.calls.filter(
        ([method]) => method !== 'GET'
      );
      expect(writes).toEqual([
        ['POST', `/Users/${userId}/FavoriteItems/series`],
      ]);
      expect(state.request.mock.calls.at(-1)?.[1]).toBe(
        `/Users/${userId}/Items/series`
      );
    });
    it('blocks collections without current native permission while Favorites remain usable', async () => {
      const api = client(type);
      state.request.mockImplementation(async (_method, path) => ({
        data: path.includes('/Items/') ? series() : profile(false),
      }));
      expect(await api.getSeriesSaved('series', 113962)).toBe(false);
      await expect(api.seriesCollections('series', 113962)).rejects.toThrow(
        'not-authorized'
      );
      expect(
        state.request.mock.calls.every(([method]) => method === 'GET')
      ).toBe(true);
    });
    it('lists existing accessible collections and reads membership under own user', async () => {
      const api = client(type);
      state.request.mockImplementation(async (_method, path, _body, config) => {
        const data = path.endsWith('/Items/series')
          ? series()
          : path.endsWith('/Items/collection')
            ? { Id: 'collection', Type: 'BoxSet' }
            : path.endsWith('/Items')
              ? config.params.ParentId
                ? collectionsPage([series()])
                : collectionsPage()
              : profile();
        return { data };
      });
      expect(await api.seriesCollections('series', 113962)).toEqual([
        { id: 'collection', name: 'Watch Next', member: true },
      ]);
      const queries = state.request.mock.calls.filter(([, path]) =>
        path.endsWith('/Items')
      );
      expect(
        queries.every(([, path]) => path === `/Users/${userId}/Items`)
      ).toBe(true);
      expect(queries[1][3].params).toMatchObject({
        ParentId: 'collection',
        Ids: 'series',
        Recursive: false,
      });
    });
    it('adds/removes membership without deleting collections or files', async () => {
      const api = client(type);
      let member = false;
      state.request.mockImplementation(async (method, path, _body, config) => {
        if (method !== 'GET') {
          member = method === 'POST';
          return { data: {} };
        }
        const data = path.endsWith('/Items/series')
          ? series()
          : path.endsWith('/Items/collection')
            ? { Id: 'collection', Type: 'BoxSet' }
            : path.endsWith('/Items')
              ? config.params.ParentId
                ? collectionsPage(member ? [series()] : [])
                : collectionsPage()
              : profile();
        return { data };
      });
      expect(
        (
          await api.setCollectionMembership(
            'series',
            113962,
            'collection',
            true
          )
        )[0].member
      ).toBe(true);
      expect(
        (
          await api.setCollectionMembership(
            'series',
            113962,
            'collection',
            false
          )
        )[0].member
      ).toBe(false);
      expect(
        state.request.mock.calls.filter(([method]) => method !== 'GET')
      ).toEqual([
        [
          'POST',
          '/Collections/collection/Items',
          undefined,
          { params: { Ids: 'series' } },
        ],
        [
          'DELETE',
          '/Collections/collection/Items',
          undefined,
          { params: { Ids: 'series' } },
        ],
      ]);
    });
  }
);

it('requires explicit trusted persisted login-pair provenance on Emby, not a spoofed device/user ID', async () => {
  await expect(
    client(MediaServerType.EMBY, false).verifyAccount()
  ).rejects.toThrow('account-not-linked');
  expect(state.request).not.toHaveBeenCalled();
});
it('rejects malformed path IDs and missing/invalid source IDs before reads', async () => {
  const api = client();
  await expect(api.getSeriesSaved('../series', 113962)).rejects.toThrow();
  await expect(api.getSeriesSaved('series', NaN)).rejects.toThrow();
  await expect(
    api.setCollectionMembership('series', 113962, '../collection', true)
  ).rejects.toThrow();
  expect(state.request).not.toHaveBeenCalled();
});
it('bounds collection loading and rejects pagination drift/duplicates', async () => {
  const api = client();
  state.request.mockImplementation(async (_method, path) => ({
    data: path.endsWith('/Items/series')
      ? series()
      : path.endsWith('/Items')
        ? collectionsPage([], 201)
        : profile(),
  }));
  await expect(api.seriesCollections('series', 113962)).rejects.toThrow(
    'collection-limit'
  );
  state.request.mockImplementation(async (_method, path) => ({
    data: path.endsWith('/Items/series')
      ? series()
      : path.endsWith('/Items/collection')
        ? { Id: 'collection', Type: 'BoxSet' }
        : path.endsWith('/Items')
          ? collectionsPage([
              { Id: 'collection', Type: 'BoxSet', Name: 'A' },
              { Id: 'collection', Type: 'BoxSet', Name: 'B' },
            ])
          : profile(),
  }));
  await expect(api.seriesCollections('series', 113962)).rejects.toThrow();
});
it('loads bounded consecutive pages without dropping or duplicating collection options', async () => {
  const api = client();
  const makeCollection = (index: number) => ({
    Id: `c${index}`,
    Type: 'BoxSet',
    Name: `List ${index}`,
  });
  state.request.mockImplementation(async (_method, path, _body, config) => ({
    data: path.endsWith('/Items/series')
      ? series()
      : path.endsWith('/Items')
        ? config.params.ParentId
          ? collectionsPage([])
          : config.params.StartIndex === 0
            ? collectionsPage(
                Array.from({ length: 50 }, (_, index) => makeCollection(index)),
                51
              )
            : collectionsPage([makeCollection(50)], 51, 50)
        : profile(),
  }));
  expect(
    (await api.seriesCollections('series', 113962)).map((item) => item.id)
  ).toEqual(Array.from({ length: 51 }, (_, index) => `c${index}`));
  expect(
    state.request.mock.calls
      .filter(
        ([, path, , config]) =>
          path.endsWith('/Items') && !config.params.ParentId
      )
      .map(([, , , config]) => config.params.StartIndex)
  ).toEqual([0, 50]);
});

it('rejects fabricated membership responses and unconfirmed favorite writes', async () => {
  const api = client();
  state.request.mockImplementation(async (method, path) => ({
    data:
      method === 'POST'
        ? { IsFavorite: true }
        : path.endsWith('/Items/series')
          ? series(false)
          : profile(),
  }));
  await api.getSeriesSaved('series', 113962);
  await expect(api.setSaved('series', true)).rejects.toThrow(
    'could not be verified'
  );
  state.request.mockImplementation(async (_method, path, _body, config) => ({
    data: path.endsWith('/Items/series')
      ? series()
      : path.endsWith('/Items')
        ? config.params.ParentId
          ? collectionsPage([{ ...series(), Id: 'other' }])
          : collectionsPage()
        : profile(),
  }));
  await expect(api.seriesCollections('series', 113962)).rejects.toThrow(
    'membership could not be verified'
  );
});

it('returns clear unavailable state without exposing credentials or borrowing admin tokens', async () => {
  const context = {
    user: { id: 2, jellyfinUserId: userId },
    tmdbId: 113962,
    itemId: 'series',
    is4k: false,
  };
  expect(await getJellyfinEmbySeriesCollections(context)).toEqual({
    serverType: MediaServerType.JELLYFIN,
    available: false,
    reason: 'account-not-linked',
    collections: [],
  });
  expect(state.request).not.toHaveBeenCalled();
});
