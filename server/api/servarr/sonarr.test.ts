import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';

import type { SonarrSeries } from '@server/api/servarr/sonarr';
import type { AxiosInstance } from 'axios';
import axios from 'axios';

import {
  MAX_SERVARR_CONFIGURATION_RESULTS,
  MAX_SERVARR_COVER_IMAGES,
  MAX_SERVARR_LIBRARY_RESPONSE_BYTES,
  MAX_SERVARR_LOOKUP_RESULTS,
} from './base';
import SonarrAPI, {
  sanitizeSonarrLanguageProfiles,
  sanitizeSonarrSeries,
} from './sonarr';

describe('Sonarr deletion-check inventory', () => {
  afterEach(() => mock.restoreAll());
  it('rejects malformed records rather than interpreting them as missing series', async () => {
    const api = new SonarrAPI({
      url: 'http://localhost:8989/api/v3',
      apiKey: 'test',
    });
    const transport = (api as unknown as { axios: AxiosInstance }).axios;
    for (const data of [
      {},
      [null],
      [{ id: 0, tvdbId: 33, title: 'Invalid' }],
    ]) {
      const get = mock.method(transport, 'get', async () => ({ data }));
      await assert.rejects(api.getSeries({ strict: true }));
      get.mock.restore();
    }
  });
  it('accepts an empty result and filters by TVDB identity', async () => {
    const api = new SonarrAPI({
      url: 'http://localhost:8989/api/v3',
      apiKey: 'test',
    });
    const get = mock.method(
      (api as unknown as { axios: AxiosInstance }).axios,
      'get',
      async () => ({ data: [] })
    );
    assert.deepEqual(await api.getSeries({ strict: true, tvdbId: 33 }), []);
    const options = get.mock.calls[0].arguments[1] as
      { maxContentLength?: number; params?: { tvdbId?: number } } | undefined;
    assert.equal(options?.params?.tvdbId, 33);
    assert.equal(options?.maxContentLength, MAX_SERVARR_LIBRARY_RESPONSE_BYTES);
  });
});

function buildSonarr(): SonarrAPI {
  return new SonarrAPI({ url: 'http://localhost:8989/api/v3', apiKey: 'test' });
}

function getAxios(sonarr: SonarrAPI): AxiosInstance {
  return (sonarr as unknown as { axios: AxiosInstance }).axios;
}

describe('Sonarr response normalization', () => {
  it('returns exact bounded series, season, and statistics records', () => {
    const series = sanitizeSonarrSeries({
      id: 7,
      title: 'Series',
      tvdbId: 99,
      monitored: true,
      apiKey: 'provider-secret',
      tags: [1, 'bad', 2],
      seasons: [
        {
          seasonNumber: 1,
          monitored: true,
          providerOnly: true,
          statistics: {
            episodeFileCount: 4,
            totalEpisodeCount: 8,
            providerSecret: 'nested-secret',
          },
        },
      ],
      images: [
        {
          coverType: 'poster',
          url: '/MediaCover/42/poster.jpg',
          remoteUrl: 'https://covers.example/poster.jpg',
          providerSecret: 'must-not-leak',
        },
        ...Array.from({ length: MAX_SERVARR_COVER_IMAGES }, (_, index) => ({
          coverType: 'banner',
          url: `/banner-${index}.jpg`,
        })),
      ],
      statistics: { episodeFileCount: 4, totalEpisodeCount: 8 },
    });

    assert.ok(series);
    assert.deepStrictEqual(series.tags, [1, 2]);
    assert.strictEqual(series.seasons[0].statistics?.episodeFileCount, 4);
    assert.equal(series.images.length, MAX_SERVARR_COVER_IMAGES);
    assert.deepEqual(series.images[0], {
      coverType: 'poster',
      url: '/MediaCover/42/poster.jpg',
      remoteUrl: 'https://covers.example/poster.jpg',
    });
    assert.ok(!('apiKey' in series));
    assert.ok(!('providerOnly' in series.seasons[0]));
    assert.ok(!('providerSecret' in (series.seasons[0].statistics ?? {})));
  });

  it('rejects unusable series identities and bounds text', () => {
    assert.strictEqual(sanitizeSonarrSeries({ title: 'No ID' }), undefined);
    assert.strictEqual(
      sanitizeSonarrSeries({
        id: -1,
        title: 'x'.repeat(20_000),
        tvdbId: 1,
      })?.title.length,
      10_000
    );
    assert.strictEqual(
      sanitizeSonarrSeries({ id: -1, title: 'Series', tvdbId: 1 })?.id,
      undefined
    );
  });

  it('returns exact bounded language profile records', () => {
    const profiles = sanitizeSonarrLanguageProfiles([
      null,
      { id: 'invalid', name: 'Invalid' },
      ...Array.from(
        { length: MAX_SERVARR_CONFIGURATION_RESULTS + 100 },
        (_, id) => ({
          id,
          name: `Profile ${id}`,
          cutoff: 10,
          items: [{ id: 'provider-only' }],
          apiKey: 'provider-secret',
        })
      ),
    ]);

    assert.strictEqual(profiles.length, MAX_SERVARR_CONFIGURATION_RESULTS - 2);
    assert.deepStrictEqual(profiles[0], { id: 0, name: 'Profile 0' });
  });
});

describe('Sonarr series search errors', () => {
  it('keeps existing best-effort behavior and exposes a strict search method', async (t) => {
    const api = buildSonarr();
    const runCommand = mock.method(
      api as unknown as {
        runCommand: (command: string, payload: unknown) => Promise<void>;
      },
      'runCommand',
      async () => {
        throw new Error('Sonarr command rejected');
      }
    );
    t.after(() => runCommand.mock.restore());

    await api.searchSeries(42);
    await assert.rejects(
      api.searchSeriesOrThrow(42),
      /Failed to execute Sonarr series search/
    );
    assert.strictEqual(runCommand.mock.callCount(), 2);
  });
});

describe('SonarrAPI getLibrarySeriesByTvdbId', () => {
  afterEach(() => mock.restoreAll());

  it('normalizes and bounds series lookup results', async () => {
    const sonarr = buildSonarr();
    const records = Array.from(
      { length: MAX_SERVARR_LOOKUP_RESULTS + 1 },
      (_, index) => ({
        id: index + 1,
        title: `Series ${index + 1}`,
        tvdbId: 1234,
        apiKey: 'provider-secret',
      })
    );
    const get = mock.method(getAxios(sonarr), 'get', async () => ({
      data: records,
    }));

    const series = await sonarr.getLibrarySeriesByTvdbId(1234);

    assert.equal(series.length, MAX_SERVARR_LOOKUP_RESULTS);
    assert.equal(series[0].tvdbId, 1234);
    assert.ok(!('apiKey' in series[0]));
    assert.equal(get.mock.callCount(), 1);
    const requestConfig = get.mock.calls[0].arguments[1] as
      { params?: Record<string, unknown> } | undefined;
    assert.equal(requestConfig?.params?.tvdbId, 1234);
  });
});

describe('SonarrAPI removeSeries', () => {
  afterEach(() => mock.restoreAll());

  it('removes the series when it exists in the library', async () => {
    const sonarr = buildSonarr();
    mock.method(SonarrAPI.prototype, 'getSeriesByTvdbId', async () => ({
      id: 9,
      title: 'Test Series',
    }));
    const del = mock.method(getAxios(sonarr), 'delete', async () => ({}));

    await sonarr.removeSeries(1234);

    assert.strictEqual(del.mock.callCount(), 1);
    assert.strictEqual(
      del.mock.calls[0].arguments[0],
      'http://localhost:8989/api/v3/series/9'
    );
  });

  it('does nothing when the series is not in the library', async () => {
    const sonarr = buildSonarr();
    mock.method(getAxios(sonarr), 'get', async () => ({
      data: [{ id: 0, title: 'Breaking Bad', tvdbId: 1234 }],
    }));
    const del = mock.method(getAxios(sonarr), 'delete', async () => ({}));

    await assert.doesNotReject(() => sonarr.removeSeries(1234));
    assert.strictEqual(del.mock.callCount(), 0);
  });

  it('rejects when the tvdbId is unknown to the lookup', async () => {
    const sonarr = buildSonarr();
    mock.method(getAxios(sonarr), 'get', async () => ({ data: [] }));
    const del = mock.method(getAxios(sonarr), 'delete', async () => ({}));

    await assert.rejects(() => sonarr.removeSeries(1234), /Series not found/);
    assert.strictEqual(del.mock.callCount(), 0);
  });

  it('ignores a 404 when the series was already removed in Sonarr', async () => {
    const sonarr = buildSonarr();
    mock.method(SonarrAPI.prototype, 'getSeriesByTvdbId', async () => ({
      id: 9,
      title: 'Test Series',
    }));
    mock.method(getAxios(sonarr), 'delete', async () => {
      throw { response: { status: 404 } };
    });

    await assert.doesNotReject(() => sonarr.removeSeries(1234));
  });

  it('rethrows errors other than 404', async () => {
    const sonarr = buildSonarr();
    mock.method(SonarrAPI.prototype, 'getSeriesByTvdbId', async () => ({
      id: 9,
      title: 'Test Series',
    }));
    mock.method(getAxios(sonarr), 'delete', async () => {
      throw { response: { status: 500 } };
    });

    await assert.rejects(() => sonarr.removeSeries(1234));
  });

  it('rethrows a 404 from the lookup instead of treating it as removed', async () => {
    const sonarr = buildSonarr();
    mock.method(getAxios(sonarr), 'get', async () => {
      throw { response: { status: 404 } };
    });
    const del = mock.method(getAxios(sonarr), 'delete', async () => ({}));

    await assert.rejects(
      () => sonarr.removeSeries(1234),
      (e: unknown) =>
        (e as { response?: { status?: number } }).response?.status === 404
    );
    assert.strictEqual(del.mock.callCount(), 0);
  });
});

describe('SonarrAPI getSeriesByTvdbId', () => {
  afterEach(() => mock.restoreAll());

  it('rethrows a 401 from the lookup with the status intact', async () => {
    const sonarr = buildSonarr();
    mock.method(getAxios(sonarr), 'get', async () => {
      throw { response: { status: 401 } };
    });

    await assert.rejects(
      () => sonarr.getSeriesByTvdbId(1234),
      (e: unknown) =>
        (e as { response?: { status?: number } }).response?.status === 401
    );
  });

  it('throws "Series not found" when the lookup returns no results', async () => {
    const sonarr = buildSonarr();
    mock.method(getAxios(sonarr), 'get', async () => ({ data: [] }));

    await assert.rejects(() => sonarr.getSeriesByTvdbId(1234), {
      message: 'Series not found',
    });
  });
});

describe('SonarrAPI getSeriesByTmdbId', () => {
  afterEach(() => mock.restoreAll());

  it('uses a bounded TMDB lookup and returns the matching series', async () => {
    const sonarr = buildSonarr();
    const get = mock.method(getAxios(sonarr), 'get', async () => ({
      data: [
        { id: 9, tvdbId: 184871, tmdbId: 87012, title: 'Bake Off' },
        { id: 10, tvdbId: 200001, tmdbId: 87013, title: 'Other show' },
      ],
    }));

    const result = await sonarr.getSeriesByTmdbId(87012);

    assert.equal(result?.tvdbId, 184871);
    assert.equal(result?.tmdbId, 87012);
    assert.equal(
      get.mock.calls[0].arguments[0],
      'http://localhost:8989/api/v3/series/lookup'
    );
    assert.deepEqual(
      (get.mock.calls[0].arguments[1] as { params?: unknown }).params,
      { term: 'tmdb:87012' }
    );
  });

  it('rejects malformed, empty, failed, and ambiguous lookups', async () => {
    const malformedSonarr = buildSonarr();
    const malformedGet = mock.method(
      getAxios(malformedSonarr),
      'get',
      async () => ({ data: [] })
    );
    assert.equal(await malformedSonarr.getSeriesByTmdbId(0), null);
    assert.equal(malformedGet.mock.callCount(), 0);

    const emptySonarr = buildSonarr();
    mock.method(getAxios(emptySonarr), 'get', async () => ({ data: [] }));
    assert.equal(await emptySonarr.getSeriesByTmdbId(87012), null);

    const failedSonarr = buildSonarr();
    mock.method(getAxios(failedSonarr), 'get', async () => {
      throw new Error('Sonarr unavailable');
    });
    assert.equal(await failedSonarr.getSeriesByTmdbId(87012), null);

    const ambiguousSonarr = buildSonarr();
    mock.method(getAxios(ambiguousSonarr), 'get', async () => ({
      data: [
        { tvdbId: 184871, title: 'First candidate' },
        { tvdbId: 200001, title: 'Second candidate' },
      ],
    }));
    assert.equal(await ambiguousSonarr.getSeriesByTmdbId(87012), null);
  });
});

const series = (overrides: Partial<SonarrSeries> = {}): SonarrSeries => ({
  id: 42,
  title: 'Test Series',
  sortTitle: 'test series',
  seasonCount: 1,
  status: 'continuing',
  overview: 'A test series.',
  network: 'Test Network',
  airTime: '20:00',
  images: [],
  remotePoster: '',
  seasons: [],
  year: 2026,
  path: '/tv/Test Series',
  profileId: 1,
  languageProfileId: 1,
  seasonFolder: true,
  monitored: true,
  monitorNewItems: 'all',
  useSceneNumbering: false,
  runtime: 45,
  tvdbId: 100,
  tvRageId: 0,
  tvMazeId: 0,
  firstAired: '2026-01-01T00:00:00Z',
  seriesType: 'standard',
  cleanTitle: 'testseries',
  imdbId: 'tt0000100',
  titleSlug: 'test-series',
  certification: 'TV-14',
  genres: [],
  tags: [],
  added: '2026-01-01T00:00:00Z',
  ratings: {
    votes: 0,
    value: 0,
  },
  qualityProfileId: 1,
  statistics: {
    seasonCount: 1,
    episodeFileCount: 1,
    episodeCount: 1,
    totalEpisodeCount: 1,
    sizeOnDisk: 1,
    releaseGroups: [],
    percentOfEpisodes: 100,
  },
  ...overrides,
});

describe('SonarrAPI exact episode requests', () => {
  afterEach(() => mock.restoreAll());

  it('monitors a fully selected season when updating an existing series', async () => {
    const api = buildSonarr();
    const existingSeries = series({
      seasons: [
        { seasonNumber: 1, monitored: false },
        { seasonNumber: 2, monitored: false },
      ],
    });
    mock.method(api, 'getSeriesByTvdbId', async () => existingSeries);
    let updatePayload: SonarrSeries | undefined;
    mock.method(
      getAxios(api),
      'put',
      async (_endpoint: string, payload: SonarrSeries) => {
        updatePayload = payload;
        return { data: series({ ...payload, id: existingSeries.id }) };
      }
    );
    mock.method(api, 'getEpisodes', async () => [
      {
        seriesId: 42,
        episodeFileId: 0,
        seasonNumber: 1,
        episodeNumber: 1,
        title: 'One',
        airDate: '',
        airDateUtc: '',
        overview: '',
        hasFile: false,
        monitored: false,
        absoluteEpisodeNumber: 1,
        unverifiedSceneNumbering: false,
        id: 101,
      },
      {
        seriesId: 42,
        episodeFileId: 0,
        seasonNumber: 1,
        episodeNumber: 2,
        title: 'Two',
        airDate: '',
        airDateUtc: '',
        overview: '',
        hasFile: false,
        monitored: false,
        absoluteEpisodeNumber: 2,
        unverifiedSceneNumbering: false,
        id: 102,
      },
      {
        seriesId: 42,
        episodeFileId: 0,
        seasonNumber: 2,
        episodeNumber: 1,
        title: 'Other Season',
        airDate: '',
        airDateUtc: '',
        overview: '',
        hasFile: false,
        monitored: false,
        absoluteEpisodeNumber: 3,
        unverifiedSceneNumbering: false,
        id: 201,
      },
    ]);
    const monitor = mock.method(api, 'monitorEpisodes', async () => undefined);
    const search = mock.method(api, 'searchSeries', async () => undefined);

    await api.addSeries({
      tvdbid: 100,
      title: 'Test Series',
      profileId: 1,
      seasons: [1],
      seasonFolder: true,
      rootFolderPath: '/tv',
      seriesType: 'standard',
      searchNow: true,
    });

    assert.deepStrictEqual(
      updatePayload?.seasons?.map(({ seasonNumber, monitored }) => ({
        seasonNumber,
        monitored,
      })),
      [
        { seasonNumber: 1, monitored: true },
        { seasonNumber: 2, monitored: false },
      ]
    );
    assert.deepStrictEqual(monitor.mock.calls[0].arguments[0], [101, 102]);
    assert.equal(search.mock.calls[0].arguments[0], 42);
  });

  it('monitors and searches only the selected episodes', async () => {
    const api = buildSonarr();
    mock.method(api, 'getSeriesByTvdbId', async () =>
      series({
        seasons: [
          { seasonNumber: 1, monitored: false },
          { seasonNumber: 2, monitored: false },
        ],
      })
    );
    mock.method(getAxios(api), 'put', async () => ({ data: series() }));
    mock.method(api, 'getEpisodes', async () => [
      {
        seriesId: 42,
        episodeFileId: 0,
        seasonNumber: 1,
        episodeNumber: 1,
        title: 'One',
        airDate: '',
        airDateUtc: '',
        overview: '',
        hasFile: false,
        monitored: false,
        absoluteEpisodeNumber: 1,
        unverifiedSceneNumbering: false,
        id: 101,
      },
      {
        seriesId: 42,
        episodeFileId: 0,
        seasonNumber: 1,
        episodeNumber: 2,
        title: 'Two',
        airDate: '',
        airDateUtc: '',
        overview: '',
        hasFile: false,
        monitored: false,
        absoluteEpisodeNumber: 2,
        unverifiedSceneNumbering: false,
        id: 102,
      },
      {
        seriesId: 42,
        episodeFileId: 0,
        seasonNumber: 2,
        episodeNumber: 1,
        title: 'Other Season',
        airDate: '',
        airDateUtc: '',
        overview: '',
        hasFile: false,
        monitored: false,
        absoluteEpisodeNumber: 3,
        unverifiedSceneNumbering: false,
        id: 201,
      },
    ]);
    const monitor = mock.method(api, 'monitorEpisodes', async () => undefined);
    const search = mock.method(api, 'searchEpisodes', async () => undefined);

    await api.addSeries({
      tvdbid: 100,
      title: 'Test Series',
      profileId: 1,
      seasons: [1],
      episodeSelections: [{ seasonNumber: 1, episodeNumbers: [2] }],
      seasonFolder: true,
      rootFolderPath: '/tv',
      seriesType: 'standard',
      searchNow: true,
    });

    assert.deepStrictEqual(monitor.mock.calls[0].arguments[0], [102]);
    assert.deepStrictEqual(search.mock.calls[0].arguments[0], [102]);
  });
});

describe('SonarrAPI.getSeriesCover', () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it('fetches the first advertised relative cover path outside the API base path', async () => {
    const api = new SonarrAPI({
      url: 'http://localhost:8989/base/api/v3',
      apiKey: 'key',
    });
    mock.method(api, 'getSeriesById', async () =>
      series({
        images: [
          {
            coverType: 'poster',
            url: '/MediaCover/42/poster.jpg',
          },
        ],
      })
    );
    const axiosGetMock = mock.fn(async () => ({
      data: Buffer.from('series-image'),
      headers: { 'content-type': 'image/jpeg' },
    }));
    (
      api as unknown as {
        axios: { get: typeof axiosGetMock };
      }
    ).axios.get = axiosGetMock;

    const result = await api.getSeriesCover(42);

    assert.deepStrictEqual(result.imageBuffer, Buffer.from('series-image'));
    assert.strictEqual(result.contentType, 'image/jpeg');
    assert.strictEqual(
      (
        axiosGetMock.mock.calls as unknown as {
          arguments: [string];
        }[]
      )[0].arguments[0],
      'http://localhost:8989/base/MediaCover/42/poster.jpg'
    );
  });

  it('falls back to the standard Sonarr-compatible poster path', async () => {
    const api = new SonarrAPI({
      url: 'http://localhost:8989/api/v3',
      apiKey: 'key',
    });
    mock.method(api, 'getSeriesById', async () => series());
    const axiosGetMock = mock.fn(async () => ({
      data: Buffer.from('fallback-series-image'),
      headers: { 'content-type': 'image/png' },
    }));
    (
      api as unknown as {
        axios: { get: typeof axiosGetMock };
      }
    ).axios.get = axiosGetMock;

    const result = await api.getSeriesCover(42);

    assert.deepStrictEqual(
      result.imageBuffer,
      Buffer.from('fallback-series-image')
    );
    assert.strictEqual(
      (
        axiosGetMock.mock.calls as unknown as {
          arguments: [string];
        }[]
      )[0].arguments[0],
      'http://localhost:8989/MediaCover/42/poster.jpg'
    );
  });

  it('falls back to an advertised remote poster when local media cover is not an image', async () => {
    const api = new SonarrAPI({
      url: 'http://localhost:8989/api/v3',
      apiKey: 'key',
    });
    mock.method(api, 'getSeriesById', async () =>
      series({
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
      data: Buffer.from('remote-series-image'),
      headers: { 'content-type': 'image/jpeg' },
    }));

    const result = await api.getSeriesCover(42);

    assert.deepStrictEqual(
      result.imageBuffer,
      Buffer.from('remote-series-image')
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
