import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { afterEach, describe, it, mock } from 'node:test';
import { gzipSync } from 'node:zlib';

import type {
  RadarrMovie,
  RadarrMovieOptions,
} from '@server/api/servarr/radarr';
import type { AxiosInstance } from 'axios';
import axios from 'axios';

import {
  MAX_SERVARR_COVER_IMAGES,
  MAX_SERVARR_LIBRARY_RESPONSE_BYTES,
  MAX_SERVARR_LOOKUP_RESULTS,
} from './base';
import RadarrAPI, { sanitizeRadarrMovie } from './radarr';

function buildRadarr(): RadarrAPI {
  return new RadarrAPI({ url: 'http://localhost:7878/api/v3', apiKey: 'test' });
}

function getAxios(radarr: RadarrAPI): AxiosInstance {
  return (radarr as unknown as { axios: AxiosInstance }).axios;
}

function createRadarrMovie(overrides: Partial<RadarrMovie> = {}): RadarrMovie {
  return {
    id: 7,
    title: 'Test Movie',
    isAvailable: false,
    monitored: true,
    tmdbId: 7,
    imdbId: '',
    titleSlug: 'test-movie',
    folderName: 'Test Movie',
    path: '/movies/Test Movie',
    profileId: 1,
    qualityProfileId: 1,
    added: '2026-01-01T00:00:00Z',
    hasFile: false,
    tags: [],
    ...overrides,
  };
}

function createRadarrMovieOptions(
  overrides: Partial<RadarrMovieOptions> = {}
): RadarrMovieOptions {
  return {
    title: 'Test Movie',
    qualityProfileId: 1,
    minimumAvailability: 'Released',
    tags: [],
    profileId: 1,
    year: 2026,
    rootFolderPath: '/movies',
    tmdbId: 7,
    monitored: true,
    searchNow: true,
    ...overrides,
  };
}

describe('Radarr response normalization', () => {
  it('accepts large inventories and rejects decompressed responses above the finite cap', async () => {
    const largeInventory = JSON.stringify(
      Array.from({ length: 17_000 }, (_, index) => ({
        id: index + 1,
        tmdbId: index + 1,
        title: `Movie ${index + 1}`,
        overview: 'x'.repeat(1_024),
      }))
    );
    const largeInventoryBytes = Buffer.byteLength(largeInventory);
    assert.ok(largeInventoryBytes > 16 * 1024 * 1024);
    assert.ok(largeInventoryBytes < MAX_SERVARR_LIBRARY_RESPONSE_BYTES);

    const oversizedCompressedInventory = gzipSync(
      Buffer.alloc(MAX_SERVARR_LIBRARY_RESPONSE_BYTES + 1, 0x78)
    );
    let sendOversizedResponse = false;
    const server = createServer((_request, response) => {
      response.statusCode = 200;
      response.setHeader('content-type', 'application/json');
      if (sendOversizedResponse) {
        response.setHeader('content-encoding', 'gzip');
        response.end(oversizedCompressedInventory);
        return;
      }
      response.end(largeInventory);
    });

    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    assert.ok(address && typeof address !== 'string');

    try {
      const radarr = new RadarrAPI({
        url: `http://127.0.0.1:${address.port}/api/v3`,
        apiKey: 'test',
      });
      assert.equal(
        getAxios(radarr).defaults.maxContentLength,
        16 * 1024 * 1024
      );

      const movies = await radarr.getMovies();
      assert.equal(movies.length, 17_000);
      assert.equal(movies.at(-1)?.title, 'Movie 17000');

      sendOversizedResponse = true;
      await assert.rejects(radarr.getMovies(), (error: unknown) => {
        const cause = error instanceof Error ? error.cause : undefined;
        assert.ok(cause instanceof Error);
        assert.match(cause.message, /maxContentLength.*67108864/u);
        return true;
      });
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });

  it('rejects malformed or incomplete inventories in deletion-check mode', async () => {
    const radarr = buildRadarr();
    for (const data of [
      {},
      [null],
      [{ id: 0, tmdbId: 42, title: 'Invalid' }],
      [{ id: 4, title: 'No canonical ID' }],
    ]) {
      const get = mock.method(getAxios(radarr), 'get', async () => ({ data }));
      await assert.rejects(radarr.getMovies({ strict: true }));
      get.mock.restore();
    }
  });
  it('accepts a verified empty inventory and sends the canonical filter', async () => {
    const radarr = buildRadarr();
    const get = mock.method(getAxios(radarr), 'get', async () => ({
      data: [],
    }));
    assert.deepEqual(await radarr.getMovies({ strict: true, tmdbId: 42 }), []);
    const options = get.mock.calls[0].arguments[1] as
      { params?: { tmdbId?: number } } | undefined;
    assert.equal(options?.params?.tmdbId, 42);
    get.mock.restore();
  });
  it('returns an exact bounded movie and nested media record', () => {
    const movie = sanitizeRadarrMovie({
      id: 9,
      title: 'Movie',
      tmdbId: 42,
      monitored: true,
      hasFile: true,
      tags: [1, 'bad', 2],
      apiKey: 'provider-secret',
      movieFile: {
        id: 3,
        movieId: 9,
        size: 100,
        dateAdded: '2026-01-01',
        qualityCutoffNotMet: false,
        providerSecret: 'nested-secret',
        mediaInfo: {
          resolution: '3840x2160',
          providerOnly: true,
        },
      },
    });

    assert.ok(movie);
    assert.strictEqual(movie.movieFile?.mediaInfo.resolution, '3840x2160');
    assert.deepStrictEqual(movie.tags, [1, 2]);
    assert.ok(!('apiKey' in movie));
    assert.ok(!('providerSecret' in (movie.movieFile ?? {})));
    assert.ok(!('providerOnly' in (movie.movieFile?.mediaInfo ?? {})));
  });

  it('rejects unusable identities and bounds provider text', () => {
    assert.strictEqual(sanitizeRadarrMovie({ title: 'Missing ID' }), undefined);
    const movie = sanitizeRadarrMovie({
      id: -1,
      title: 'x'.repeat(20_000),
      tmdbId: 1,
    });
    assert.strictEqual(movie?.title.length, 10_000);
    assert.strictEqual(movie?.id, 0);
  });

  it('bounds advertised cover images and rejects oversized image URLs', () => {
    const movie = sanitizeRadarrMovie({
      id: 9,
      title: 'Movie',
      tmdbId: 42,
      images: [
        {
          coverType: 'poster',
          url: '/poster.jpg',
          remoteUrl: 'https://covers.example/poster.jpg',
        },
        {
          coverType: 'poster',
          url: 'x'.repeat(2_049),
          remoteUrl: 'https://covers.example/' + 'x'.repeat(2_049),
        },
        ...Array.from({ length: MAX_SERVARR_COVER_IMAGES }, (_, index) => ({
          coverType: 'banner',
          url: `/banner-${index}.jpg`,
        })),
      ],
    });

    assert.equal(movie?.images?.length, MAX_SERVARR_COVER_IMAGES);
    assert.deepEqual(movie?.images?.[0], {
      coverType: 'poster',
      url: '/poster.jpg',
      remoteUrl: 'https://covers.example/poster.jpg',
    });
    assert.deepEqual(movie?.images?.[1], {
      coverType: 'poster',
      url: undefined,
      remoteUrl: undefined,
    });
  });
});

describe('Radarr movie search errors', () => {
  it('keeps existing best-effort behavior and exposes a strict search method', async (t) => {
    const api = buildRadarr();
    const runCommand = mock.method(
      api as unknown as {
        runCommand: (command: string, payload: unknown) => Promise<void>;
      },
      'runCommand',
      async () => {
        throw new Error('Radarr command rejected');
      }
    );
    t.after(() => runCommand.mock.restore());

    await api.searchMovie(42);
    await assert.rejects(
      api.searchMovieOrThrow(42),
      /Failed to execute Radarr movie search/
    );
    assert.strictEqual(runCommand.mock.callCount(), 2);
  });
});

describe('RadarrAPI addMovie availability searches', () => {
  afterEach(() => mock.restoreAll());

  it('does not search an existing monitored movie before it is available', async () => {
    const radarr = buildRadarr();
    mock.method(RadarrAPI.prototype, 'getMovieByTmdbId', async () =>
      createRadarrMovie()
    );
    const search = mock.method(
      RadarrAPI.prototype,
      'searchMovie',
      async () => {}
    );

    await radarr.addMovie(createRadarrMovieOptions());

    assert.equal(search.mock.callCount(), 0);
  });

  it('searches an existing monitored movie once it is available', async () => {
    const radarr = buildRadarr();
    mock.method(RadarrAPI.prototype, 'getMovieByTmdbId', async () =>
      createRadarrMovie({ isAvailable: true })
    );
    const search = mock.method(
      RadarrAPI.prototype,
      'searchMovie',
      async () => {}
    );

    await radarr.addMovie(createRadarrMovieOptions());

    assert.equal(search.mock.callCount(), 1);
    assert.equal(search.mock.calls[0].arguments[0], 7);
  });

  it('does not request a search when re-enabling an unavailable movie', async () => {
    const radarr = buildRadarr();
    mock.method(RadarrAPI.prototype, 'getMovieByTmdbId', async () =>
      createRadarrMovie({ monitored: false })
    );
    const put = mock.method(getAxios(radarr), 'put', async () => ({
      data: createRadarrMovie(),
    }));
    const search = mock.method(
      RadarrAPI.prototype,
      'searchMovie',
      async () => {}
    );

    await radarr.addMovie(createRadarrMovieOptions());

    const payload = put.mock.calls[0].arguments[1] as {
      addOptions: { searchForMovie: boolean };
    };
    assert.equal(payload.addOptions.searchForMovie, false);
    assert.equal(search.mock.callCount(), 0);
  });

  it('preserves searching when re-enabling an available movie', async () => {
    const radarr = buildRadarr();
    mock.method(RadarrAPI.prototype, 'getMovieByTmdbId', async () =>
      createRadarrMovie({ monitored: false, isAvailable: true })
    );
    const put = mock.method(getAxios(radarr), 'put', async () => ({
      data: createRadarrMovie({ isAvailable: true }),
    }));
    const search = mock.method(
      RadarrAPI.prototype,
      'searchMovie',
      async () => {}
    );

    await radarr.addMovie(createRadarrMovieOptions());

    const payload = put.mock.calls[0].arguments[1] as {
      addOptions: { searchForMovie: boolean };
    };
    assert.equal(payload.addOptions.searchForMovie, true);
    assert.equal(search.mock.callCount(), 1);
  });

  it('keeps conflict recovery from searching an unavailable monitored movie', async () => {
    const radarr = buildRadarr();
    const conflict = Object.assign(
      new Error('Request failed with status code 409'),
      { response: { status: 409 } }
    );
    mock.method(RadarrAPI.prototype, 'getMovieByTmdbId', async () => {
      throw conflict;
    });
    mock.method(radarr, 'getMovies', async () => [createRadarrMovie()]);
    const search = mock.method(
      RadarrAPI.prototype,
      'searchMovie',
      async () => {}
    );

    await radarr.addMovie(createRadarrMovieOptions());

    assert.equal(search.mock.callCount(), 0);
  });

  it('preserves conflict recovery searches for an available monitored movie', async () => {
    const radarr = buildRadarr();
    const conflict = Object.assign(
      new Error('Request failed with status code 409'),
      { response: { status: 409 } }
    );
    mock.method(RadarrAPI.prototype, 'getMovieByTmdbId', async () => {
      throw conflict;
    });
    mock.method(radarr, 'getMovies', async () => [
      createRadarrMovie({ isAvailable: true }),
    ]);
    const search = mock.method(
      RadarrAPI.prototype,
      'searchMovie',
      async () => {}
    );

    await radarr.addMovie(createRadarrMovieOptions());

    assert.equal(search.mock.callCount(), 1);
  });

  it('keeps conflict recovery from searching when re-enabling an unavailable movie', async () => {
    const radarr = buildRadarr();
    const conflict = Object.assign(
      new Error('Request failed with status code 409'),
      { response: { status: 409 } }
    );
    mock.method(RadarrAPI.prototype, 'getMovieByTmdbId', async () => {
      throw conflict;
    });
    mock.method(radarr, 'getMovies', async () => [
      createRadarrMovie({ monitored: false }),
    ]);
    const put = mock.method(getAxios(radarr), 'put', async () => ({
      data: createRadarrMovie(),
    }));

    await radarr.addMovie(createRadarrMovieOptions());

    const payload = put.mock.calls[0].arguments[1] as {
      addOptions: { searchForMovie: boolean };
    };
    assert.equal(payload.addOptions.searchForMovie, false);
  });

  it('searches a recovered movie when the updated availability threshold is met', async () => {
    const radarr = buildRadarr();
    const conflict = Object.assign(
      new Error('Request failed with status code 409'),
      { response: { status: 409 } }
    );
    mock.method(RadarrAPI.prototype, 'getMovieByTmdbId', async () => {
      throw conflict;
    });
    mock.method(radarr, 'getMovies', async () => [
      createRadarrMovie({ monitored: false, isAvailable: false }),
    ]);
    mock.method(getAxios(radarr), 'put', async () => ({
      data: createRadarrMovie({ monitored: true, isAvailable: true }),
    }));
    const search = mock.method(
      RadarrAPI.prototype,
      'searchMovie',
      async () => {}
    );

    await radarr.addMovie(createRadarrMovieOptions());

    assert.equal(search.mock.callCount(), 1);
    assert.equal(search.mock.calls[0].arguments[0], 7);
  });

  it('preserves conflict recovery searches when re-enabling an available movie', async () => {
    const radarr = buildRadarr();
    const conflict = Object.assign(
      new Error('Request failed with status code 409'),
      { response: { status: 409 } }
    );
    mock.method(RadarrAPI.prototype, 'getMovieByTmdbId', async () => {
      throw conflict;
    });
    mock.method(radarr, 'getMovies', async () => [
      createRadarrMovie({ monitored: false, isAvailable: true }),
    ]);
    const put = mock.method(getAxios(radarr), 'put', async () => ({
      data: createRadarrMovie({ isAvailable: true }),
    }));

    await radarr.addMovie(createRadarrMovieOptions());

    const payload = put.mock.calls[0].arguments[1] as {
      addOptions: { searchForMovie: boolean };
    };
    assert.equal(payload.addOptions.searchForMovie, true);
  });
});

describe('RadarrAPI getLibraryMoviesByTmdbId', () => {
  afterEach(() => mock.restoreAll());

  it('normalizes and bounds movie lookup results', async () => {
    const radarr = buildRadarr();
    const records = Array.from(
      { length: MAX_SERVARR_LOOKUP_RESULTS + 1 },
      (_, index) => ({
        id: index + 1,
        title: `Movie ${index + 1}`,
        tmdbId: 550,
        apiKey: 'provider-secret',
      })
    );
    const get = mock.method(getAxios(radarr), 'get', async () => ({
      data: records,
    }));

    const movies = await radarr.getLibraryMoviesByTmdbId(550);

    assert.equal(movies.length, MAX_SERVARR_LOOKUP_RESULTS);
    assert.equal(movies[0].tmdbId, 550);
    assert.ok(!('apiKey' in movies[0]));
    assert.equal(get.mock.callCount(), 1);
    const requestConfig = get.mock.calls[0].arguments[1] as
      { params?: Record<string, unknown> } | undefined;
    assert.equal(requestConfig?.params?.tmdbId, 550);
  });
});

describe('RadarrAPI removeMovie', () => {
  afterEach(() => mock.restoreAll());

  it('removes the movie when it exists in the library', async () => {
    const radarr = buildRadarr();
    mock.method(RadarrAPI.prototype, 'getMovieByTmdbId', async () => ({
      id: 7,
      title: 'Test Movie',
    }));
    const del = mock.method(getAxios(radarr), 'delete', async () => ({}));

    await radarr.removeMovie(550);

    assert.strictEqual(del.mock.callCount(), 1);
    assert.strictEqual(
      del.mock.calls[0].arguments[0],
      'http://localhost:7878/api/v3/movie/7'
    );
  });

  it('does nothing when the movie is not in the library', async () => {
    const radarr = buildRadarr();
    mock.method(getAxios(radarr), 'get', async () => ({
      data: [{ id: 0, title: 'Fight Club', tmdbId: 550 }],
    }));
    const del = mock.method(getAxios(radarr), 'delete', async () => ({}));

    await assert.doesNotReject(() => radarr.removeMovie(550));
    assert.strictEqual(del.mock.callCount(), 0);
  });

  it('rejects when the tmdbId is unknown to the lookup', async () => {
    const radarr = buildRadarr();
    mock.method(getAxios(radarr), 'get', async () => ({ data: [] }));
    const del = mock.method(getAxios(radarr), 'delete', async () => ({}));

    await assert.rejects(() => radarr.removeMovie(550), /Movie not found/);
    assert.strictEqual(del.mock.callCount(), 0);
  });

  it('ignores a 404 when the movie was already removed in Radarr', async () => {
    const radarr = buildRadarr();
    mock.method(RadarrAPI.prototype, 'getMovieByTmdbId', async () => ({
      id: 7,
      title: 'Test Movie',
    }));
    mock.method(getAxios(radarr), 'delete', async () => {
      throw { response: { status: 404 } };
    });

    await assert.doesNotReject(() => radarr.removeMovie(550));
  });

  it('rethrows errors other than 404', async () => {
    const radarr = buildRadarr();
    mock.method(RadarrAPI.prototype, 'getMovieByTmdbId', async () => ({
      id: 7,
      title: 'Test Movie',
    }));
    mock.method(getAxios(radarr), 'delete', async () => {
      throw { response: { status: 500 } };
    });

    await assert.rejects(() => radarr.removeMovie(550));
  });

  it('rethrows a 404 from the lookup instead of treating it as removed', async () => {
    const radarr = buildRadarr();
    mock.method(getAxios(radarr), 'get', async () => {
      throw { response: { status: 404 } };
    });
    const del = mock.method(getAxios(radarr), 'delete', async () => ({}));

    await assert.rejects(
      () => radarr.removeMovie(550),
      (e: unknown) =>
        (e as { response?: { status?: number } }).response?.status === 404
    );
    assert.strictEqual(del.mock.callCount(), 0);
  });
});

describe('RadarrAPI getMovieByTmdbId', () => {
  afterEach(() => mock.restoreAll());

  it('rethrows a 401 from the lookup with the status intact', async () => {
    const radarr = buildRadarr();
    mock.method(getAxios(radarr), 'get', async () => {
      throw { response: { status: 401 } };
    });

    await assert.rejects(
      () => radarr.getMovieByTmdbId(550),
      (e: unknown) =>
        (e as { response?: { status?: number } }).response?.status === 401
    );
  });

  it('throws "Movie not found" when the lookup returns no results', async () => {
    const radarr = buildRadarr();
    mock.method(getAxios(radarr), 'get', async () => ({ data: [] }));

    await assert.rejects(() => radarr.getMovieByTmdbId(550), {
      message: 'Movie not found',
    });
  });
});

const movie = (overrides: Partial<RadarrMovie> = {}): RadarrMovie => ({
  id: 42,
  title: 'Test Movie',
  isAvailable: true,
  monitored: true,
  tmdbId: 100,
  imdbId: 'tt0000100',
  titleSlug: 'test-movie',
  folderName: 'Test Movie',
  path: '/movies/Test Movie',
  profileId: 1,
  qualityProfileId: 1,
  added: '2026-01-01T00:00:00Z',
  hasFile: true,
  tags: [],
  ...overrides,
});

describe('RadarrAPI.getMovieCover', () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it('fetches the first advertised relative cover path outside the API base path', async () => {
    const api = new RadarrAPI({
      url: 'http://localhost:7878/base/api/v3',
      apiKey: 'key',
    });
    mock.method(api, 'getMovie', async () =>
      movie({
        images: [
          {
            coverType: 'poster',
            url: '/MediaCover/42/poster.jpg',
          },
        ],
      })
    );
    const axiosGetMock = mock.fn(async () => ({
      data: Buffer.from('movie-image'),
      headers: { 'content-type': 'image/jpeg' },
    }));
    (
      api as unknown as {
        axios: { get: typeof axiosGetMock };
      }
    ).axios.get = axiosGetMock;

    const result = await api.getMovieCover(42);

    assert.deepStrictEqual(result.imageBuffer, Buffer.from('movie-image'));
    assert.strictEqual(result.contentType, 'image/jpeg');
    assert.strictEqual(
      (
        axiosGetMock.mock.calls as unknown as {
          arguments: [string];
        }[]
      )[0].arguments[0],
      'http://localhost:7878/base/MediaCover/42/poster.jpg'
    );
  });

  it('falls back to the standard Radarr-compatible poster path', async () => {
    const api = new RadarrAPI({
      url: 'http://localhost:7878/api/v3',
      apiKey: 'key',
    });
    mock.method(api, 'getMovie', async () => movie());
    const axiosGetMock = mock.fn(async () => ({
      data: Buffer.from('fallback-movie-image'),
      headers: { 'content-type': 'image/png' },
    }));
    (
      api as unknown as {
        axios: { get: typeof axiosGetMock };
      }
    ).axios.get = axiosGetMock;

    const result = await api.getMovieCover(42);

    assert.deepStrictEqual(
      result.imageBuffer,
      Buffer.from('fallback-movie-image')
    );
    assert.strictEqual(
      (
        axiosGetMock.mock.calls as unknown as {
          arguments: [string];
        }[]
      )[0].arguments[0],
      'http://localhost:7878/MediaCover/42/poster.jpg'
    );
  });

  it('falls back to an advertised remote poster when local media cover is not an image', async () => {
    const api = new RadarrAPI({
      url: 'http://localhost:7878/api/v3',
      apiKey: 'key',
    });
    mock.method(api, 'getMovie', async () =>
      movie({
        images: [
          {
            coverType: 'poster',
            url: '/MediaCover/42/poster.jpg?lastWrite=123',
            remoteUrl: 'https://8.8.8.8/poster.jpg',
          },
        ],
      })
    );
    const axiosGetMock = mock.fn(async () => ({
      data: Buffer.from('login-page'),
      headers: { 'content-type': 'text/html; charset=utf-8' },
    }));
    (
      api as unknown as {
        axios: { get: typeof axiosGetMock };
      }
    ).axios.get = axiosGetMock;
    const remoteGetMock = mock.method(axios, 'get', async () => ({
      data: Buffer.from('remote-movie-image'),
      headers: { 'content-type': 'image/jpeg' },
    }));

    const result = await api.getMovieCover(42);

    assert.deepStrictEqual(
      result.imageBuffer,
      Buffer.from('remote-movie-image')
    );
    assert.strictEqual(result.contentType, 'image/jpeg');
    assert.strictEqual(
      remoteGetMock.mock.calls[0].arguments[0],
      'https://8.8.8.8/poster.jpg'
    );
    const options = remoteGetMock.mock.calls[0].arguments[1] as Record<
      string,
      unknown
    >;
    assert.strictEqual(options.responseType, 'arraybuffer');
    assert.strictEqual(options.maxContentLength, 10 * 1024 * 1024);
    assert.strictEqual(options.maxBodyLength, 10 * 1024 * 1024);
    assert.strictEqual(options.timeout, 10_000);
    assert.strictEqual(options.proxy, false);
  });
});
