import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';

import { MediaServerType } from '@server/constants/server';
import { getSettings } from '@server/lib/settings';
import JellyfinAPI, {
  MAX_JELLYFIN_SEASONS,
  MAX_JELLYFIN_USERS,
  sanitizeJellyfinLibraryItem,
  sanitizeJellyfinLoginResponse,
  sanitizeJellyfinSession,
  sanitizeJellyfinSystemInfo,
  sanitizeJellyfinUsers,
} from './jellyfin';

afterEach(() => {
  mock.restoreAll();
});

class TestJellyfinAPI extends JellyfinAPI {
  public getTransport() {
    return this.axios;
  }
  public getLookup() {
    return this.axios.defaults.lookup;
  }
}

describe('JellyfinAPI authorization headers', () => {
  it('uses modern Jellyfin and compatible Emby authorization headers', () => {
    const settings = getSettings();
    const originalMediaServerType = settings.main.mediaServerType;

    try {
      settings.main.mediaServerType = MediaServerType.JELLYFIN;
      const jellyfinApi = new TestJellyfinAPI(
        'http://localhost:8096',
        'jellyfin-token',
        'jellyfin-device'
      );
      const jellyfinHeaders = jellyfinApi.getTransport().defaults.headers;
      assert.match(String(jellyfinHeaders.Authorization), /^MediaBrowser /);
      assert.match(
        String(jellyfinHeaders.Authorization),
        /Token="jellyfin-token"/
      );
      assert.equal(jellyfinHeaders['X-Emby-Authorization'], undefined);

      settings.main.mediaServerType = MediaServerType.EMBY;
      const embyApi = new TestJellyfinAPI(
        'http://localhost:8096',
        'emby-token',
        'emby-device'
      );
      const embyHeaders = embyApi.getTransport().defaults.headers;
      assert.equal(embyHeaders.Authorization, undefined);
      assert.match(
        String(embyHeaders['X-Emby-Authorization']),
        /^MediaBrowser .*Token="emby-token"/
      );
    } finally {
      settings.main.mediaServerType = originalMediaServerType;
    }
  });
});

describe('Jellyfin deletion-check evidence', () => {
  it('accepts only a well-formed successful empty item list as absence', async () => {
    const api = new TestJellyfinAPI('http://localhost:8096', 'test');
    const get = mock.method(api.getTransport(), 'get', async () => ({
      data: { Items: [] },
    }));
    assert.equal(await api.getItemDataForDeletionCheck('movie-id'), undefined);
    get.mock.restore();
    for (const data of [
      {},
      { Items: [null] },
      { Items: [{ Id: 'different-id', Name: 'Wrong', Type: 'Movie' }] },
    ]) {
      const invalid = mock.method(api.getTransport(), 'get', async () => ({
        data,
      }));
      await assert.rejects(api.getItemDataForDeletionCheck('movie-id'));
      invalid.mock.restore();
    }
  });
  it('does not convert server errors to missing items', async () => {
    const api = new TestJellyfinAPI('http://localhost:8096', 'test');
    mock.method(api.getTransport(), 'get', async () => {
      throw { response: { status: 500 } };
    });
    await assert.rejects(api.getItemDataForDeletionCheck('movie-id'));
  });
});

const runLookup = (
  lookup: ReturnType<TestJellyfinAPI['getLookup']>,
  hostname: string
) =>
  new Promise<void>((resolve, reject) => {
    lookup?.(hostname, { all: true }, (error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });

describe('JellyfinAPI address policy', () => {
  it('can block private addresses during unauthenticated setup', async () => {
    const api = new TestJellyfinAPI(
      'http://public.example',
      undefined,
      undefined,
      false
    );

    await assert.rejects(
      runLookup(api.getLookup(), 'localhost'),
      (error: NodeJS.ErrnoException) => error.code === 'EACCES'
    );
  });

  it('retains private network support for configured media servers', async () => {
    const api = new TestJellyfinAPI('http://localhost');

    await assert.doesNotReject(runLookup(api.getLookup(), 'localhost'));
  });
});

describe('Jellyfin response normalization', () => {
  it('preserves safe playback tick values larger than ordinary API integers', () => {
    const runtimeTicks = 2_400_000_000_000;
    const positionTicks = 2_200_000_000_000;
    const session = sanitizeJellyfinSession({
      Id: 'session',
      DeviceName: 'TV',
      Client: 'Jellyfin',
      IsActive: true,
      NowPlayingItem: {
        Id: 'episode',
        Name: 'Episode',
        Type: 'Episode',
        RunTimeTicks: runtimeTicks,
        UserData: {
          Played: true,
          PlaybackPositionTicks: positionTicks,
        },
      },
      PlayState: { PositionTicks: positionTicks, IsPaused: false },
    });

    assert.equal(session?.NowPlayingItem?.RunTimeTicks, runtimeTicks);
    assert.equal(
      session?.NowPlayingItem?.UserData?.PlaybackPositionTicks,
      positionTicks
    );
    assert.equal(session?.PlayState?.PositionTicks, positionTicks);
    assert.equal(
      sanitizeJellyfinSession({
        Id: 'unsafe',
        DeviceName: 'TV',
        Client: 'Jellyfin',
        IsActive: true,
        PlayState: { PositionTicks: Number.MAX_SAFE_INTEGER + 1 },
      })?.PlayState?.PositionTicks,
      undefined
    );
  });

  it('caps users and drops provider credentials and unknown fields', () => {
    const users = sanitizeJellyfinUsers([
      null,
      { Id: '', Name: 'Missing id' },
      ...Array.from({ length: MAX_JELLYFIN_USERS + 100 }, (_, index) => ({
        Id: `user-${index}`,
        Name: `User ${index}`,
        Policy: { IsAdministrator: index === 0, hidden: 'provider-only' },
        AccessToken: 'provider-user-secret',
        providerOnly: true,
      })),
    ]);

    assert.strictEqual(users.length, MAX_JELLYFIN_USERS - 2);
    assert.strictEqual(users[0].Policy.IsAdministrator, true);
    assert.ok(!('AccessToken' in users[0]));
    assert.ok(!('providerOnly' in users[0]));
  });

  it('requires a bounded login token and valid user', () => {
    const login = sanitizeJellyfinLoginResponse({
      User: { Id: 'user', Name: 'User' },
      AccessToken: 'token',
      providerOnly: true,
    });
    assert.deepStrictEqual(Object.keys(login).sort(), ['AccessToken', 'User']);
    assert.throws(
      () =>
        sanitizeJellyfinLoginResponse({
          User: { Id: 'user', Name: 'User' },
          AccessToken: '',
        }),
      /invalid authentication response/
    );
    assert.throws(
      () =>
        sanitizeJellyfinLoginResponse({
          User: { Id: 'user', Name: 'User' },
          AccessToken: 'x'.repeat(4_097),
        }),
      /invalid authentication response/
    );
  });

  it('exposes only bounded system identity fields', () => {
    assert.deepStrictEqual(
      sanitizeJellyfinSystemInfo({
        Id: 'server',
        ServerName: 'Jellyfin',
        LocalAddress: 'http://internal.example',
        AccessToken: 'secret',
      }),
      { Id: 'server', ServerName: 'Jellyfin' }
    );
    assert.strictEqual(sanitizeJellyfinSystemInfo(null), undefined);
  });

  it('normalizes library metadata and bounds nested media information', () => {
    const item = sanitizeJellyfinLibraryItem(
      {
        Id: 'movie',
        Name: 'Movie',
        Type: 'Movie',
        LocationType: 'FileSystem',
        ProviderIds: {
          Tmdb: '123',
          providerSecret: 'secret',
        },
        MediaSources: [
          {
            Id: 'source',
            Path: '/media/movie.mkv',
            MediaStreams: [
              {
                Codec: 'hevc',
                Type: 'Video',
                Width: 3840,
                providerOnly: true,
              },
              { Type: 'Executable', Path: '/bin/sh' },
            ],
            providerOnly: true,
          },
        ],
        AccessToken: 'provider-secret',
        providerOnly: true,
      },
      true
    );

    assert.ok(item && 'ProviderIds' in item);
    assert.deepStrictEqual(item.ProviderIds, {
      Tmdb: '123',
      TheMovieDb: undefined,
      Imdb: undefined,
      Tvdb: undefined,
      AniDB: undefined,
      MusicBrainzAlbum: undefined,
      MusicBrainzReleaseGroup: undefined,
      MusicBrainzArtist: undefined,
    });
    assert.strictEqual(item.MediaSources?.length, 1);
    assert.strictEqual(item.MediaSources?.[0].MediaStreams.length, 1);
    assert.ok(!('providerOnly' in item));
    assert.ok(!('AccessToken' in item));
    assert.ok(!('providerOnly' in (item.MediaSources?.[0] ?? {})));
    assert.ok(
      !('providerOnly' in (item.MediaSources?.[0].MediaStreams[0] ?? {}))
    );
  });

  it('exposes music libraries and requests album items for music scans', async () => {
    const api = new JellyfinAPI('http://localhost');
    const requests: { url: string; params?: Record<string, unknown> }[] = [];

    Object.defineProperty(api, 'get', {
      configurable: true,
      value: async (
        url: string,
        options?: { params?: Record<string, unknown> }
      ) => {
        requests.push({ url, params: options?.params });
        if (url === '/Library/MediaFolders') {
          return {
            Items: [
              {
                Type: 'CollectionFolder',
                Id: 'music-library',
                Name: 'Music',
                CollectionType: 'Music',
              },
              {
                Type: 'CollectionFolder',
                Id: 'books-library',
                Name: 'Books',
                CollectionType: 'books',
              },
            ],
          };
        }

        return {
          Items: [
            {
              Id: 'album',
              Name: 'Album',
              Type: 'MusicAlbum',
              ProviderIds: {
                MusicBrainzReleaseGroup: 'release-group-id',
              },
            },
          ],
        };
      },
    });

    assert.deepStrictEqual(await api.getLibraries(), [
      {
        key: 'music-library',
        title: 'Music',
        type: 'music',
        agent: 'jellyfin',
      },
    ]);

    const albums = await api.getLibraryContents('music-library', 'music');
    assert.strictEqual(albums[0].Type, 'MusicAlbum');
    assert.strictEqual(requests[1].params?.IncludeItemTypes, 'MusicAlbum');
  });

  it('bounds season collections and encodes provider path identifiers', async () => {
    const api = new JellyfinAPI('http://localhost');
    let endpoint = '';
    Object.defineProperty(api, 'get', {
      configurable: true,
      value: async (value: string) => {
        endpoint = value;
        return {
          Items: [
            null,
            ...Array.from(
              { length: MAX_JELLYFIN_SEASONS + 100 },
              (_, index) => ({
                Id: String(index),
                Type: 'Season',
                providerOnly: true,
              })
            ),
          ],
        };
      },
    });

    const seasons = await api.getSeasons('../unsafe?query=true');

    assert.strictEqual(seasons.length, MAX_JELLYFIN_SEASONS - 1);
    assert.ok(!('providerOnly' in seasons[0]));
    assert.ok(!endpoint.includes('../'));
    assert.ok(!endpoint.includes('?query='));
  });
});

describe('Jellyfin personal library browsing', () => {
  it('uses the linked user views and paged UserData item query', async () => {
    const userId = 'a2ed2f1f-5a82-4c55-9a1c-1385e4e90ca1';
    const normalizedUserId = userId.replaceAll('-', '');
    const api = new JellyfinAPI('http://localhost:8096', 'linked-user-token');
    api.setUserId(userId);
    const requests: {
      path: string;
      params?: Record<string, unknown>;
    }[] = [];
    Object.defineProperty(api, 'get', {
      configurable: true,
      value: async (
        path: string,
        options?: { params?: Record<string, unknown> }
      ) => {
        requests.push({ path, params: options?.params });
        if (path.endsWith('/Views')) {
          return {
            Items: [
              {
                Id: 'movies-library',
                Name: 'Movies',
                Type: 'CollectionFolder',
                CollectionType: 'movies',
              },
            ],
          };
        }
        return {
          Items: [
            {
              Id: 'movie-1',
              Name: 'Watched Movie',
              Type: 'Movie',
              LocationType: 'FileSystem',
              MediaType: 'Video',
              ProviderIds: { Tmdb: '42' },
              ProductionYear: 2025,
              UserData: { Played: true, PlayCount: 1 },
            },
          ],
          TotalRecordCount: 1,
        };
      },
    });

    assert.deepStrictEqual(await api.getUserLibraries(), [
      {
        key: 'movies-library',
        title: 'Movies',
        type: 'movie',
        agent: 'jellyfin',
      },
    ]);
    const page = await api.getUserLibraryContents('movies-library', 'movie', {
      offset: 20,
      size: 20,
      isPlayed: true,
    });

    assert.strictEqual(requests[0].path, `/Users/${normalizedUserId}/Views`);
    assert.strictEqual(requests[1].path, '/Items');
    assert.deepStrictEqual(requests[1].params, {
      userId: normalizedUserId,
      parentId: 'movies-library',
      recursive: true,
      includeItemTypes: 'Movie',
      fields: 'ProviderIds,UserData',
      enableUserData: true,
      enableTotalRecordCount: true,
      enableImages: false,
      sortBy: 'SortName',
      sortOrder: 'Ascending',
      startIndex: 20,
      limit: 20,
      isPlayed: true,
    });
    assert.strictEqual(page.Items[0].UserData?.Played, true);
    assert.strictEqual(page.Items[0].ProviderIds.Tmdb, '42');
    assert.strictEqual(page.Items[0].ProductionYear, 2025);
  });
});

describe('Jellyfin and Emby current-selection playlist replacement', () => {
  it('removes every exact-name remnant before creating one ordered replacement', async () => {
    const api = new JellyfinAPI('http://localhost', 'token', 'device');
    const requests: {
      method: string;
      endpoint: string;
      params?: Record<string, unknown>;
    }[] = [];
    Object.defineProperty(api, 'get', {
      configurable: true,
      value: async () => ({
        Items: [
          { Id: 'old-audio', Name: 'SeerrNG - Current Selection' },
          { Id: 'keep-me', Name: 'Personal Playlist' },
          { Id: 'old-video', Name: 'SeerrNG - Current Selection' },
        ],
      }),
    });
    Object.defineProperty(api, 'request', {
      configurable: true,
      value: async (
        method: string,
        endpoint: string,
        _data?: unknown,
        options?: { params?: Record<string, unknown> }
      ) => {
        requests.push({ method, endpoint, params: options?.params });
        return method === 'POST'
          ? { data: { Id: 'replacement' } }
          : { data: undefined };
      },
    });

    const playlist = await api.replacePlaylist(
      'SeerrNG - Current Selection',
      ['track-3', 'track-1'],
      'Audio',
      'user-id'
    );

    assert.deepStrictEqual(playlist, {
      Id: 'replacement',
      Name: 'SeerrNG - Current Selection',
      MediaType: 'Audio',
    });
    assert.deepStrictEqual(
      requests.map(({ method, endpoint }) => ({ method, endpoint })),
      [
        { method: 'DELETE', endpoint: '/Items/old-audio' },
        { method: 'DELETE', endpoint: '/Items/old-video' },
        { method: 'POST', endpoint: '/Playlists' },
      ]
    );
    assert.deepStrictEqual(requests[2].params, {
      UserId: 'user-id',
      Name: 'SeerrNG - Current Selection',
      Ids: 'track-3,track-1',
      MediaType: 'Audio',
    });
  });
});
