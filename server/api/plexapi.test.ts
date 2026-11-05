import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';

import { getSettings } from '@server/lib/settings';
import PlexAPI, {
  sanitizePlexClients,
  sanitizePlexMetadata,
  sanitizePlexPlaybackSession,
} from './plexapi';

afterEach(() => {
  mock.restoreAll();
});

describe('Plex playback sessions', () => {
  it('normalizes bounded episode progress and linked-user identity', () => {
    assert.deepEqual(
      sanitizePlexPlaybackSession({
        ratingKey: '42',
        grandparentRatingKey: '7',
        type: 'episode',
        index: 4,
        parentIndex: 2,
        viewOffset: 2_160_000,
        duration: 2_400_000,
        User: { id: '12', title: 'viewer' },
        Player: { state: 'playing' },
      }),
      {
        ratingKey: '42',
        grandparentRatingKey: '7',
        type: 'episode',
        index: 4,
        parentIndex: 2,
        viewOffset: 2_160_000,
        duration: 2_400_000,
        userId: '12',
        username: 'viewer',
        state: 'playing',
      }
    );
  });

  it('rejects sessions without valid episode timing', () => {
    assert.equal(
      sanitizePlexPlaybackSession({
        ratingKey: '42',
        type: 'episode',
        index: 4,
        parentIndex: 2,
        viewOffset: 100,
        duration: 0,
      }),
      undefined
    );
  });
});

describe('Plex library synchronization', () => {
  it('preserves stored libraries when the provider fetch fails', async () => {
    const settings = getSettings();
    const original = {
      ...settings.plex,
      libraries: [
        { id: 'stored', name: 'Stored', enabled: true, type: 'movie' as const },
      ],
    };
    settings.replaceSection('plex', original);
    const saveMock = mock.method(settings, 'save', async () => undefined);
    const plex = new PlexAPI({ plexToken: 'token' });
    mock.method(plex, 'getLibraries', async () => {
      throw new Error('Provider unavailable');
    });

    await assert.rejects(plex.syncLibraries(), /Provider unavailable/);

    assert.strictEqual(settings.plex, original);
    assert.strictEqual(saveMock.mock.callCount(), 0);
  });

  it('rolls back synchronized libraries when persistence fails', async () => {
    const settings = getSettings();
    const original = {
      ...settings.plex,
      libraries: [
        { id: 'stored', name: 'Stored', enabled: true, type: 'movie' as const },
      ],
    };
    settings.replaceSection('plex', original);
    mock.method(settings, 'save', async () => {
      throw new Error('Disk write failed');
    });
    const plex = new PlexAPI({ plexToken: 'token' });
    mock.method(plex, 'getLibraries', async () => [
      {
        key: 'new',
        title: 'New',
        type: 'show',
        agent: 'tv.plex.agents.series',
      },
    ]);

    await assert.rejects(
      plex.syncLibraries({ enabledLibraryIds: ['new'] }),
      /Disk write failed/
    );

    assert.strictEqual(settings.plex, original);
  });

  it('classifies artist libraries as music by default, and preserves a manual audiobook override across re-syncs', async () => {
    const settings = getSettings();
    settings.replaceSection('plex', {
      ...settings.plex,
      libraries: [
        {
          id: 'audiobooks',
          name: 'Previous audiobook name',
          enabled: true,
          type: 'book' as const,
        },
      ],
    });
    mock.method(settings, 'save', async () => undefined);
    const plex = new PlexAPI({ plexToken: 'token' });
    mock.method(plex, 'getLibraries', async () => [
      {
        key: 'music',
        title: 'Music',
        type: 'artist' as const,
        agent: 'tv.plex.agents.music',
      },
      {
        key: 'audiobooks',
        title: 'Audiobooks',
        type: 'artist' as const,
        agent: 'tv.plex.agents.music',
      },
    ]);

    const libraries = await plex.syncLibraries({
      enabledLibraryIds: ['music', 'audiobooks'],
    });

    const music = libraries.find((library) => library.id === 'music');
    const audiobooks = libraries.find((library) => library.id === 'audiobooks');

    assert.strictEqual(music?.type, 'music');
    // Plex reports both as 'artist' -- the manual reclassification and
    // enabled state must survive a provider-side library rename.
    assert.strictEqual(audiobooks?.type, 'book');
    assert.strictEqual(audiobooks?.enabled, true);
  });
});

describe('Plex response normalization', () => {
  it('normalizes active local Companion clients and rejects non-players', () => {
    assert.deepStrictEqual(
      sanitizePlexClients({
        MediaContainer: {
          Server: [
            {
              name: 'Living Room TV',
              product: 'Plex for Samsung',
              machineIdentifier: 'tv-client-id',
              address: '192.168.1.50',
              port: '32500',
              protocol: 'plex',
              protocolCapabilities: 'timeline,playback,navigation,playqueues',
              deviceClass: 'tv',
            },
            {
              name: 'Unusable Client',
              product: 'Plex Client',
              machineIdentifier: 'no-playback',
              address: '192.168.1.51',
              port: 32500,
              protocolCapabilities: 'timeline,navigation',
            },
          ],
        },
      }),
      [
        {
          clientIdentifier: 'tv-client-id',
          name: 'Living Room TV',
          product: 'Plex for Samsung',
          platform: 'tv',
          connectionUri: 'http://192.168.1.50:32500',
        },
      ]
    );
  });

  it('routes loopback Companion clients through the configured Plex server', async () => {
    const plex = new PlexAPI({
      plexToken: 'token',
      plexSettings: {
        name: 'Plex',
        ip: '192.168.10.9',
        port: 32400,
        useSsl: false,
        libraries: [],
      },
    });
    Object.defineProperty(plex, 'get', {
      configurable: true,
      value: async () => ({
        MediaContainer: {
          Server: [
            {
              name: 'TV 2017',
              product: 'Plex for Samsung',
              machineIdentifier: 'tv-client-id',
              address: '127.0.0.1',
              port: '32400',
              protocol: 'plex',
              deviceClass: 'pc',
              protocolCapabilities: 'timeline,playback,navigation,playqueues',
            },
          ],
        },
      }),
    });

    assert.deepStrictEqual(await plex.getClients(), [
      {
        clientIdentifier: 'tv-client-id',
        name: 'TV 2017',
        product: 'Plex for Samsung',
        platform: 'pc',
        connectionUri: 'http://192.168.10.9:32400',
      },
    ]);
  });

  it('returns exact nested metadata without provider-only fields', () => {
    const metadata = sanitizePlexMetadata({
      ratingKey: 'movie',
      type: 'movie',
      title: 'Movie',
      guid: 'plex://movie/1',
      Guid: [{ id: 'tmdb://1', providerOnly: true }],
      Media: [
        {
          id: 1,
          width: 3840,
          height: 2160,
          providerOnly: true,
        },
      ],
      Children: {
        size: 1,
        Metadata: [
          {
            ratingKey: 'season',
            type: 'season',
            title: 'Season 1',
            guid: 'plex://season/1',
            providerOnly: true,
          },
        ],
        providerOnly: true,
      },
      accessToken: 'provider-secret',
      providerOnly: true,
    });

    assert.ok(metadata);
    assert.ok(!('providerOnly' in metadata));
    assert.ok(!('accessToken' in metadata));
    assert.deepStrictEqual(metadata.Guid, [{ id: 'tmdb://1' }]);
    assert.ok(!('providerOnly' in metadata.Media[0]));
    assert.ok(!('providerOnly' in metadata.Children!.Metadata[0]));
  });

  it('encodes metadata path identifiers and normalizes the response', async () => {
    const plex = new PlexAPI({ plexToken: 'token' });
    let endpoint = '';
    let requestOptions: unknown;
    Object.defineProperty(plex, 'get', {
      configurable: true,
      value: async (path: string, options: unknown) => {
        endpoint = path;
        requestOptions = options;
        return {
          MediaContainer: {
            Metadata: [
              {
                ratingKey: 'movie',
                type: 'movie',
                title: 'Movie',
                guid: 'plex://movie/1',
                providerOnly: true,
              },
            ],
          },
        };
      },
    });

    const metadata = await plex.getMetadata('../unsafe?query=true', {
      includeChildren: true,
    });

    assert.ok(!endpoint.includes('/../'));
    assert.ok(!endpoint.includes('?'));
    assert.deepStrictEqual(requestOptions, {
      params: { includeChildren: 1 },
    });
    assert.ok(!('providerOnly' in metadata));
  });

  it('keeps per-user watch counts and bounded pagination metadata', async () => {
    const plex = new PlexAPI({ plexToken: 'linked-user-token' });
    let requestOptions: {
      params?: Record<string, number>;
      headers?: Record<string, string>;
    } = {};
    Object.defineProperty(plex, 'get', {
      configurable: true,
      value: async (_path: string, options: typeof requestOptions) => {
        requestOptions = options;
        return {
          MediaContainer: {
            totalSize: 30,
            Metadata: [
              {
                ratingKey: 'show-1',
                type: 'show',
                title: 'Partially watched show',
                year: 2024,
                leafCount: 10,
                viewedLeafCount: 4,
                viewCount: 0,
                Guid: [{ id: 'tmdb://42' }],
              },
            ],
          },
        };
      },
    });

    const page = await plex.getLibraryContents('7', {
      offset: 20,
      size: 10,
      libraryType: 'show',
    });

    assert.strictEqual(
      requestOptions.headers?.['X-Plex-Container-Start'],
      '20'
    );
    assert.strictEqual(requestOptions.headers?.['X-Plex-Container-Size'], '10');
    assert.strictEqual(requestOptions.params?.includeGuids, 1);
    assert.strictEqual(page.totalSize, 30);
    assert.strictEqual(page.items[0].year, 2024);
    assert.strictEqual(page.items[0].viewedLeafCount, 4);
    assert.strictEqual(page.items[0].leafCount, 10);
    assert.deepStrictEqual(page.items[0].Guid, [{ id: 'tmdb://42' }]);
  });

  it('filters watched and unwatched library pages on the Plex server', async () => {
    const plex = new PlexAPI({ plexToken: 'linked-user-token' });
    let requestOptions: {
      params?: Record<string, number>;
    } = {};
    Object.defineProperty(plex, 'get', {
      configurable: true,
      value: async (_path: string, options: typeof requestOptions) => {
        requestOptions = options;
        return { MediaContainer: { totalSize: 0, Metadata: [] } };
      },
    });

    await plex.getLibraryContents('7', { isWatched: true });
    assert.strictEqual(requestOptions.params?.unwatched, 0);

    await plex.getLibraryContents('7', { isWatched: false });
    assert.strictEqual(requestOptions.params?.unwatched, 1);
  });

  it('requests GUID details for recently added music albums', async () => {
    const plex = new PlexAPI({ plexToken: 'token' });
    let requestOptions: {
      params?: Record<string, number | string>;
    } = {};
    Object.defineProperty(plex, 'get', {
      configurable: true,
      value: async (_path: string, options: typeof requestOptions) => {
        requestOptions = options;
        return { MediaContainer: { Metadata: [] } };
      },
    });

    await plex.getRecentlyAdded(
      'music',
      { addedAt: 1_789_059_680_000 },
      'music'
    );

    assert.strictEqual(requestOptions.params?.includeGuids, 1);
    assert.strictEqual(requestOptions.params?.type, 9);
  });
});

describe('Plex current-selection playlist replacement', () => {
  it('removes every exact-name remnant before creating one ordered replacement', async () => {
    const plex = new PlexAPI({ plexToken: 'token' });
    const requests: {
      method: string;
      endpoint: string;
      params?: Record<string, unknown>;
    }[] = [];
    Object.defineProperty(plex, 'get', {
      configurable: true,
      value: async () => ({
        MediaContainer: {
          Metadata: [
            { ratingKey: 'old-video', title: 'SeerrNG - Current Selection' },
            { ratingKey: 'keep-me', title: 'Personal Playlist' },
            { ratingKey: 'old-audio', title: 'SeerrNG - Current Selection' },
          ],
        },
      }),
    });
    const createPlayQueueMock = mock.method(
      plex,
      'createPlayQueue',
      async () => ({
        playQueueId: 44,
        selectedItemId: 'episode-2',
      })
    );
    Object.defineProperty(plex, 'request', {
      configurable: true,
      value: async (
        method: string,
        endpoint: string,
        _data?: unknown,
        options?: { params?: Record<string, unknown> }
      ) => {
        requests.push({ method, endpoint, params: options?.params });
        return method === 'POST'
          ? {
              data: {
                MediaContainer: {
                  Metadata: [
                    {
                      ratingKey: '12345',
                      key: '/playlists/12345/items',
                    },
                  ],
                },
              },
            }
          : { data: undefined };
      },
    });

    const playlist = await plex.replacePlaylist(
      'SeerrNG - Current Selection',
      ['episode-2', 'episode-1'],
      'video',
      'server-id'
    );

    assert.deepStrictEqual(playlist, {
      ratingKey: '12345',
      key: '/playlists/12345/items',
      title: 'SeerrNG - Current Selection',
      playlistType: 'video',
    });
    assert.deepStrictEqual(
      requests.map(({ method, endpoint }) => ({ method, endpoint })),
      [
        { method: 'DELETE', endpoint: '/playlists/old-video' },
        { method: 'DELETE', endpoint: '/playlists/old-audio' },
        { method: 'POST', endpoint: '/playlists' },
      ]
    );
    assert.deepStrictEqual(requests[2].params, {
      type: 'video',
      title: 'SeerrNG - Current Selection',
      smart: 0,
      playQueueID: 44,
    });
    assert.deepStrictEqual(createPlayQueueMock.mock.calls[0].arguments, [
      ['episode-2', 'episode-1'],
      'video',
      'server-id',
    ]);
  });

  it('serializes simultaneous replacements of the reserved playlist', async () => {
    const firstPlex = new PlexAPI({ plexToken: 'token' });
    const secondPlex = new PlexAPI({ plexToken: 'token' });
    let releaseFirstLookup: () => void = () => undefined;
    let markFirstLookupStarted: () => void = () => undefined;
    const firstLookupStarted = new Promise<void>((resolve) => {
      markFirstLookupStarted = resolve;
    });
    const holdFirstLookup = new Promise<void>((resolve) => {
      releaseFirstLookup = resolve;
    });
    let secondLookupCount = 0;

    Object.defineProperty(firstPlex, 'get', {
      configurable: true,
      value: async () => {
        markFirstLookupStarted();
        await holdFirstLookup;
        return { MediaContainer: { Metadata: [] } };
      },
    });
    Object.defineProperty(secondPlex, 'get', {
      configurable: true,
      value: async () => {
        secondLookupCount += 1;
        return { MediaContainer: { Metadata: [] } };
      },
    });
    for (const plex of [firstPlex, secondPlex]) {
      mock.method(plex, 'createPlayQueue', async () => ({
        playQueueId: 44,
        selectedItemId: 'movie',
      }));
      Object.defineProperty(plex, 'request', {
        configurable: true,
        value: async () => ({
          data: {
            MediaContainer: {
              Metadata: [
                { ratingKey: 'playlist', key: '/playlists/playlist/items' },
              ],
            },
          },
        }),
      });
    }

    const firstReplacement = firstPlex.replacePlaylist(
      'SeerrNG - Current Selection',
      ['movie'],
      'video',
      'server-id'
    );
    await firstLookupStarted;
    const secondReplacement = secondPlex.replacePlaylist(
      'SeerrNG - Current Selection',
      ['movie'],
      'video',
      'server-id'
    );
    await new Promise<void>((resolve) => setImmediate(resolve));

    assert.strictEqual(secondLookupCount, 0);
    releaseFirstLookup();
    await Promise.all([firstReplacement, secondReplacement]);
    assert.strictEqual(secondLookupCount, 1);
  });
});

describe('Plex season analysis', () => {
  it('uses PUT for a numeric item identity and rejects path injection before I/O', async () => {
    const plex = new PlexAPI({ plexToken: 'fixture-token' });
    const calls: unknown[][] = [];
    Object.defineProperty(plex, 'request', {
      value: async (...args: unknown[]) => {
        calls.push(args);
      },
    });
    await plex.analyzeSeason('123');
    assert.deepEqual(calls, [['PUT', '/library/metadata/123/analyze']]);
    for (const key of ['../123', '123/analyze', '0', '-1', '', '1?token=x']) {
      await assert.rejects(
        plex.analyzeSeason(key),
        /Invalid Plex season identity/
      );
    }
    assert.equal(calls.length, 1);
  });
});
