import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';

import DeezerAPI, {
  DeezerResponseError,
  matchDeezerGenre,
} from '@server/api/deezer';
import cacheManager from '@server/lib/cache';

describe('DeezerAPI', () => {
  afterEach(() => {
    mock.restoreAll();
    cacheManager.getCache('deezer').flush();
  });

  it('searches artists, sanitizes picture_xl, caches for 10 min, and drops unsafe URLs', async () => {
    const getMock = mock.method(
      DeezerAPI.prototype as unknown as {
        get: (
          endpoint: string,
          config?: { params?: Record<string, unknown>; timeout?: number },
          ttl?: number
        ) => Promise<unknown>;
      },
      'get',
      async (
        endpoint: string,
        config?: { params?: Record<string, unknown>; timeout?: number },
        ttl?: number
      ) => {
        assert.strictEqual(endpoint, '/search/artist');
        assert.strictEqual(config?.timeout, 3000);
        // fetched uncached; DeezerAPI caches only real answers itself
        assert.strictEqual(ttl, 0);
        assert.deepStrictEqual(config?.params, {
          q: 'phobe bridgers',
          limit: 5,
        });
        return {
          data: [
            {
              id: 123,
              name: 'Phoebe Bridgers',
              picture_xl: 'https://cdn-images.dzcdn.net/images/artist/pb.jpg',
              nb_fan: 211000,
            },
            {
              id: 456,
              name: 'Unsafe Artist',
              picture_xl: 'https://evil.example/a.jpg',
              nb_fan: 5,
            },
          ],
        };
      }
    );

    const client = new DeezerAPI();
    const artists = await client.searchArtists('phobe bridgers', 5);
    // the second call is answered from the 10 minute cache
    await client.searchArtists('phobe bridgers', 5);

    assert.strictEqual(getMock.mock.callCount(), 1);
    assert.deepStrictEqual(artists, [
      {
        id: 123,
        name: 'Phoebe Bridgers',
        pictureXl: 'https://cdn-images.dzcdn.net/images/artist/pb.jpg',
        nbFan: 211000,
      },
      {
        id: 456,
        name: 'Unsafe Artist',
        pictureXl: null,
        nbFan: 5,
      },
    ]);
  });

  it('throws on a Deezer quota error (HTTP 200 + error object) and never caches it', async () => {
    let quota = true;
    const getMock = mock.method(
      DeezerAPI.prototype as unknown as {
        get: () => Promise<unknown>;
      },
      'get',
      async () =>
        quota
          ? {
              error: {
                type: 'Exception',
                message: 'Quota limit exceeded',
                code: 4,
              },
            }
          : { data: [{ id: 7, title: 'In Rainbows', artist: { name: 'R' } }] }
    );
    const client = new DeezerAPI();

    await assert.rejects(
      client.searchArtists('radiohead', 3),
      (error: Error) =>
        error instanceof DeezerResponseError && /code 4/.test(error.message)
    );
    await assert.rejects(
      client.searchAlbums('in rainbows', 3),
      DeezerResponseError
    );

    // once the quota resets the real answer is fetched (nothing was cached)
    quota = false;
    const albums = await client.searchAlbums('in rainbows', 3);
    assert.strictEqual(albums.length, 1);
    assert.strictEqual(getMock.mock.callCount(), 3);
  });

  it('returns empty list for blank queries without calling upstream', async () => {
    const getMock = mock.method(
      DeezerAPI.prototype as unknown as { get: () => Promise<unknown> },
      'get'
    );

    const artists = await new DeezerAPI().searchArtists('   ', 5);

    assert.deepStrictEqual(artists, []);
    assert.strictEqual(getMock.mock.callCount(), 0);
  });

  it('maps genre tags to Deezer genres by name and alias', () => {
    const genres = [
      { id: 132, name: 'Pop' },
      { id: 116, name: 'Rap/Hip Hop' },
      { id: 165, name: 'R&B' },
      { id: 106, name: 'Electro' },
      { id: 16, name: 'Asian Music' },
      { id: 197, name: 'Latin Music' },
      { id: 169, name: 'Soul & Funk' },
      { id: 85, name: 'Alternative' },
    ];
    const id = (tag: string) => matchDeezerGenre(tag, genres)?.id ?? null;
    assert.strictEqual(id('pop'), 132);
    assert.strictEqual(id('hip hop'), 116);
    assert.strictEqual(id('Hip-Hop'), 116);
    assert.strictEqual(id('rap'), 116);
    assert.strictEqual(id('r&b'), 165);
    assert.strictEqual(id('rnb'), 165);
    assert.strictEqual(id('electronic'), 106);
    assert.strictEqual(id('latin'), 197);
    assert.strictEqual(id('funk'), 169);
    assert.strictEqual(id('indie'), 85);
    assert.strictEqual(id('k-pop'), 16);
    assert.strictEqual(
      matchDeezerGenre('k-pop', [...genres, { id: 999, name: 'K-Pop' }])?.id,
      999
    );
    assert.strictEqual(id('punk'), null);
    assert.strictEqual(id('  '), null);
  });

  const chartArtist = (id: number, name: string, picture = true) => ({
    id: id * 10,
    title: `Song ${id}`,
    artist: {
      id,
      name,
      ...(picture
        ? {
            picture_xl: `https://cdn-images.dzcdn.net/images/artist/${id}/1000x1000.jpg`,
          }
        : {}),
    },
  });

  it('builds genre artists from the genre chart, tops them up from its radios, and caches 6 h', async () => {
    let quota = true;
    const endpoints: string[] = [];
    mock.method(
      DeezerAPI.prototype as unknown as {
        get: (endpoint: string) => Promise<unknown>;
      },
      'get',
      async (endpoint: string) => {
        endpoints.push(endpoint);
        if (endpoint === '/genre') {
          return { data: [{ id: 116, name: 'Rap/Hip Hop' }] };
        }
        if (endpoint === '/chart/116/tracks') {
          if (quota) return { error: { code: 4, message: 'Quota limit' } };
          return {
            data: [
              chartArtist(1, 'BigXthaPlug'),
              chartArtist(2, 'Doechii'),
              chartArtist(1, 'BigXthaPlug'),
              chartArtist(3, 'Various Artists'),
              chartArtist(4, 'Kendrick Lamar'),
            ],
          };
        }
        if (endpoint === '/genre/116/radios') {
          return { data: [{ id: 30991 }, { id: 31021 }, { id: 39021 }] };
        }
        if (endpoint === '/radio/30991/tracks') {
          return {
            data: [chartArtist(5, 'A$AP Rocky'), chartArtist(2, 'Doechii')],
          };
        }
        if (endpoint === '/radio/31021/tracks') {
          return { data: [chartArtist(6, 'Cardi B', false)] };
        }
        if (endpoint === '/artist/6') {
          return {
            id: 6,
            name: 'Cardi B',
            picture_xl: 'https://cdn-images.dzcdn.net/images/artist/6/x.jpg',
          };
        }
        throw new Error(`unexpected ${endpoint}`);
      }
    );
    const client = new DeezerAPI();

    // a quota answer is a failure and is not cached
    await assert.rejects(
      client.getArtistsForGenreTag('hip hop'),
      DeezerResponseError
    );
    quota = false;
    const artists = await client.getArtistsForGenreTag('hip hop');
    assert.deepStrictEqual(
      artists.map((artist) => artist.name),
      ['BigXthaPlug', 'Doechii', 'Kendrick Lamar', 'A$AP Rocky', 'Cardi B']
    );
    assert.strictEqual(
      artists[4].pictureXl,
      'https://cdn-images.dzcdn.net/images/artist/6/x.jpg'
    );
    assert.ok(!endpoints.includes('/radio/39021/tracks'));
    assert.ok(!endpoints.some((endpoint) => endpoint.endsWith('/artists')));

    const callsBefore = endpoints.length;
    await client.getArtistsForGenreTag('rap');
    assert.strictEqual(endpoints.length, callsBefore);
    // every good answer (genre list, radios, composed artists) is kept 6 h
    const cache = cacheManager.getCache('deezer').data;
    const ttls = cache.keys().map((key) => Number(cache.getTtl(key)));
    assert.ok(ttls.length >= 3);
    for (const ttl of ttls) {
      assert.ok(ttl - Date.now() > 5 * 60 * 60 * 1000);
    }
  });

  it('treats one list for two different genres as unusable', async () => {
    DeezerAPI.resetGenreSignatures();
    let chartCalls = 0;
    const sameList = {
      data: Array.from({ length: 12 }, (_, index) =>
        chartArtist(index + 1, `Global Star ${index + 1}`)
      ),
    };
    mock.method(
      DeezerAPI.prototype as unknown as {
        get: (endpoint: string) => Promise<unknown>;
      },
      'get',
      async (endpoint: string) => {
        if (endpoint.startsWith('/chart/')) {
          chartCalls += 1;
          return sameList;
        }
        if (endpoint.endsWith('/radios')) return { data: [] };
        throw new Error(`unexpected ${endpoint}`);
      }
    );
    const client = new DeezerAPI();
    assert.strictEqual((await client.getGenreArtists(132)).length, 12);
    assert.strictEqual(chartCalls, 1);
    // cached: no new chart read
    await client.getGenreArtists(132);
    assert.strictEqual(chartCalls, 1);
    // another genre with the same list: unusable, and neither is kept
    assert.deepStrictEqual(await client.getGenreArtists(116), []);
    await client.getGenreArtists(132);
    assert.strictEqual(chartCalls, 3);
    DeezerAPI.resetGenreSignatures();
  });

  it('searches tracks with their rank, preferring title_short', async () => {
    mock.method(
      DeezerAPI.prototype as unknown as {
        get: (
          endpoint: string,
          config?: { params?: Record<string, unknown> }
        ) => Promise<unknown>;
      },
      'get',
      async (
        endpoint: string,
        config?: { params?: Record<string, unknown> }
      ) => {
        assert.strictEqual(endpoint, '/search/track');
        assert.deepStrictEqual(config?.params, {
          q: 'i wanna dance with somebody',
          limit: 25,
        });
        return {
          data: [
            {
              id: 11,
              title: 'I Wanna Dance with Somebody (Who Loves Me) (Remastered)',
              title_short: 'I Wanna Dance with Somebody (Who Loves Me)',
              artist: { name: 'Whitney Houston' },
              rank: 912000,
            },
            { id: 12, title: 'No Artist', rank: 5 },
            { id: 13, title: 'Cover', artist: { name: 'Calum Scott' } },
          ],
        };
      }
    );
    assert.deepStrictEqual(
      await new DeezerAPI().searchTracks('i wanna dance with somebody'),
      [
        {
          id: 11,
          title: 'I Wanna Dance with Somebody (Who Loves Me)',
          artistName: 'Whitney Houston',
          rank: 912000,
        },
        { id: 13, title: 'Cover', artistName: 'Calum Scott', rank: 0 },
      ]
    );
  });
});
