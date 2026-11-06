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

function buildSonarr(version: 'v3' | 'v5' = 'v3'): SonarrAPI {
  const api = new SonarrAPI({
    url: 'http://localhost:8989/api/v3',
    apiKey: 'test',
  });
  Object.defineProperty(api, 'getApiVersion', {
    value: async () => version,
  });
  return api;
}

function getAxios(sonarr: SonarrAPI): AxiosInstance {
  return (sonarr as unknown as { axios: AxiosInstance }).axios;
}

describe('SonarrAPI episode file resolution', () => {
  afterEach(() => mock.restoreAll());

  it('requests embedded episode files and keeps only the sanitized resolution', async () => {
    const api = buildSonarr();
    const get = mock.method(getAxios(api), 'get', async () => ({
      data: [
        {
          id: 11,
          seriesId: 42,
          episodeFileId: 9,
          seasonNumber: 1,
          episodeNumber: 1,
          hasFile: true,
          episodeFile: {
            mediaInfo: {
              resolution: '3840x2160',
              providerSecret: 'hidden',
            },
          },
          providerSecret: 'hidden',
        },
      ],
    }));

    const episodes = await api.getEpisodes(42, true);

    assert.equal(episodes[0].fileResolution, '3840x2160');
    assert.ok(!('providerSecret' in episodes[0]));
    const options = get.mock.calls[0].arguments[1] as
      { params?: Record<string, unknown> } | undefined;
    assert.deepEqual(options?.params, {
      seriesId: 42,
      includeEpisodeFile: true,
    });
  });
});

describe('Sonarr API version selection', () => {
  afterEach(() => mock.restoreAll());

  it('uses the v5 API when the service reports Sonarr 5', async () => {
    const api = new SonarrAPI({
      url: 'http://127.0.0.1:9011/sonarr/api/v3',
      apiKey: 'test',
    });
    const paths: string[] = [];
    mock.method(getAxios(api), 'get', async (url: string) => {
      paths.push(url);
      if (url.endsWith('/api/v3/system/status')) {
        return { data: { version: '5.0.0.2608' } };
      }
      if (url.endsWith('/api/v5/series')) {
        return { data: [{ id: 42, title: 'Series', tvdbId: 100 }] };
      }
      throw new Error(`Unexpected Sonarr request: ${url}`);
    });

    const result = await api.getSeries();

    assert.equal(result[0].title, 'Series');
    assert.deepEqual(paths, [
      'http://127.0.0.1:9011/sonarr/api/v3/system/status',
      'http://127.0.0.1:9011/sonarr/api/v5/series',
    ]);
  });

  it('can identify a v5-only server when the v3 status route is missing', async () => {
    const api = new SonarrAPI({
      url: 'http://127.0.0.1:9014/api/v3',
      apiKey: 'test',
    });
    const paths: string[] = [];
    mock.method(getAxios(api), 'get', async (url: string) => {
      paths.push(url);
      if (url.endsWith('/api/v3/system/status')) {
        throw { response: { status: 404 } };
      }
      if (url.endsWith('/api/v5/system/status')) {
        return { data: { version: '5.0.0.2608' } };
      }
      if (url.endsWith('/api/v5/series')) return { data: [] };
      throw new Error(`Unexpected Sonarr request: ${url}`);
    });

    assert.deepEqual(await api.getSeries(), []);
    assert.deepEqual(paths, [
      'http://127.0.0.1:9014/api/v3/system/status',
      'http://127.0.0.1:9014/api/v5/system/status',
      'http://127.0.0.1:9014/api/v5/series',
    ]);
  });

  it('refreshes the detected API version after its cache expires', async () => {
    let now = 2_000_000_000;
    let version = '4.0.20.3014';
    mock.method(Date, 'now', () => now);
    const api = new SonarrAPI({
      url: 'http://127.0.0.1:9015/api/v3',
      apiKey: 'test',
    });
    const paths: string[] = [];
    mock.method(getAxios(api), 'get', async (url: string) => {
      paths.push(url);
      if (url.endsWith('/system/status')) return { data: { version } };
      if (url.endsWith('/api/v3/series')) return { data: [] };
      if (url.endsWith('/api/v5/series')) return { data: [] };
      throw new Error(`Unexpected Sonarr request: ${url}`);
    });

    await api.getSeries();
    version = '5.0.0.2608';
    now += 5 * 60 * 1000 + 1;
    await api.getSeries();

    assert.deepEqual(paths, [
      'http://127.0.0.1:9015/api/v3/system/status',
      'http://127.0.0.1:9015/api/v3/series',
      'http://127.0.0.1:9015/api/v3/system/status',
      'http://127.0.0.1:9015/api/v5/series',
    ]);
  });

  it('keeps v3 routes for v4 and falls back when a v5 route is missing', async () => {
    const v4Api = new SonarrAPI({
      url: 'http://127.0.0.1:9012/api/v3',
      apiKey: 'test',
    });
    const v4Paths: string[] = [];
    mock.method(getAxios(v4Api), 'get', async (url: string) => {
      v4Paths.push(url);
      if (url.endsWith('/system/status')) {
        return { data: { version: '4.0.20.3014' } };
      }
      if (url.endsWith('/api/v3/series')) return { data: [] };
      throw new Error(`Unexpected Sonarr request: ${url}`);
    });
    await v4Api.getSeries();
    assert.ok(v4Paths.some((url) => url.endsWith('/api/v3/series')));
    assert.ok(!v4Paths.some((url) => url.endsWith('/api/v5/series')));

    const v5Api = new SonarrAPI({
      url: 'http://127.0.0.1:9013/api/v3',
      apiKey: 'test',
    });
    const v5Paths: string[] = [];
    mock.method(getAxios(v5Api), 'get', async (url: string) => {
      v5Paths.push(url);
      if (url.endsWith('/system/status')) {
        return { data: { version: '5.0.0.2608' } };
      }
      if (url.endsWith('/api/v5/series')) {
        throw { response: { status: 404 } };
      }
      if (url.endsWith('/api/v3/series')) return { data: [] };
      throw new Error(`Unexpected Sonarr request: ${url}`);
    });
    await v5Api.getSeries();
    assert.ok(v5Paths.some((url) => url.endsWith('/api/v5/series')));
    assert.ok(v5Paths.some((url) => url.endsWith('/api/v3/series')));
  });
});

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

  it('keeps bounded Sonarr v5 metadata and identity fields', () => {
    const series = sanitizeSonarrSeries({
      id: 7,
      title: 'Example Anime',
      tvdbId: 99,
      language: { id: 4, name: 'Japanese', ignored: true },
      originalLanguage: { id: 4, name: 'Japanese' },
      seasonType: 'absolute',
      seasonTypes: [
        {
          name: 'Absolute',
          type: 'absolute',
          seasonNumbers: [1, 'invalid', 2],
          ignored: true,
        },
      ],
      malIds: [12, 'invalid', -1],
      aniListIds: [34],
      originalCountry: 'JP',
      originalTitle: '例',
      alternateTitles: [{ title: 'Alt' }, { title: '' }, null],
      statistics: {
        monitoredEpisodeCount: 2,
        releaseTypes: ['WEB-DL', 1],
        episodeFileQualities: [
          { quality: { name: 'WEB-1080p', id: 3 } },
          { quality: { id: 4 } },
        ],
      },
    });

    assert.ok(series);
    assert.deepEqual(series.language, { id: 4, name: 'Japanese' });
    assert.deepEqual(series.originalLanguage, { id: 4, name: 'Japanese' });
    assert.equal(series.seasonType, 'absolute');
    assert.deepEqual(series.seasonTypes, [
      { name: 'Absolute', type: 'absolute', seasonNumbers: [1, 2] },
    ]);
    assert.deepEqual(series.malIds, [12]);
    assert.deepEqual(series.aniListIds, [34]);
    assert.equal(series.originalCountry, 'JP');
    assert.equal(series.originalTitle, '例');
    assert.deepEqual(series.alternateTitles, ['Alt']);
    assert.equal(series.statistics.monitoredEpisodeCount, 2);
    assert.deepEqual(series.statistics.releaseTypes, ['WEB-DL']);
    assert.deepEqual(series.statistics.episodeFileQualities, ['WEB-1080p']);
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

describe('Sonarr v5 metadata and history APIs', () => {
  afterEach(() => mock.restoreAll());

  it('passes a selected language to metadata lookup', async () => {
    const api = buildSonarr('v5');
    const get = mock.method(getAxios(api), 'get', async () => ({
      data: [{ id: 10, title: 'Series', tvdbId: 100 }],
    }));

    await api.getSeriesByTitle('Series', 4);

    assert.deepEqual(
      (get.mock.calls[0].arguments[1] as { params?: unknown }).params,
      { term: 'Series', language: 4 }
    );
  });

  it('does not send v5 language parameters to Sonarr v3', async () => {
    const api = buildSonarr('v3');
    const get = mock.method(getAxios(api), 'get', async () => ({
      data: [{ id: 10, title: 'Series', tvdbId: 100 }],
    }));

    await api.getSeriesByTitle('Series', 4);

    assert.deepEqual(
      (get.mock.calls[0].arguments[1] as { params?: unknown }).params,
      { term: 'Series' }
    );
  });

  it('returns bounded metadata languages and newest series history', async () => {
    const api = buildSonarr('v5');
    const get = mock.method(getAxios(api), 'get', async (url: string) => {
      if (url.endsWith('/api/v5/language')) {
        return {
          data: [
            { id: 4, name: 'Japanese', ignored: true },
            { id: 'bad', name: 'Invalid' },
          ],
        };
      }
      if (url.endsWith('/api/v5/history/series')) {
        return {
          data: [
            {
              id: 1,
              date: '2026-01-01T00:00:00Z',
              eventType: 'grabbed',
              sourceTitle: 'Older release',
              episode: { seasonNumber: 1, episodeNumber: 1, title: 'First' },
            },
            {
              id: 2,
              date: '2026-02-01T00:00:00Z',
              eventType: 'downloadFolderImported',
              sourceTitle: 'Newer release',
              episode: { seasonNumber: 1, episodeNumber: 2, title: 'Second' },
            },
            { id: 0, date: '2026-03-01T00:00:00Z' },
          ],
        };
      }
      throw new Error(`Unexpected Sonarr request: ${url}`);
    });

    assert.deepEqual(await api.getMetadataLanguages(), [
      { id: 4, name: 'Japanese' },
    ]);
    assert.deepEqual(await api.getSeriesHistory(42, 1), [
      {
        id: 2,
        date: '2026-02-01T00:00:00Z',
        eventType: 'downloadFolderImported',
        sourceTitle: 'Newer release',
        seasonNumber: 1,
        episodeNumber: 2,
        episodeTitle: 'Second',
      },
    ]);
    const historyRequest = get.mock.calls.find((call) =>
      String(call.arguments[0]).endsWith('/api/v5/history/series')
    );
    assert.ok(historyRequest);
    assert.deepEqual(
      (historyRequest.arguments[1] as { params?: unknown }).params,
      { seriesId: 42 }
    );
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

  it('uses the v5 season endpoint without loading every episode', async () => {
    const api = buildSonarr('v5');
    const existingSeries = series({
      seasons: [{ seasonNumber: 1, monitored: false }],
    });
    mock.method(api, 'getSeriesByTvdbId', async () => existingSeries);
    const puts = mock.method(
      getAxios(api),
      'put',
      async (_url: string, payload: unknown) => ({
        data: series({ ...existingSeries, ...(payload as object) }),
      })
    );
    const getEpisodes = mock.method(api, 'getEpisodes', async () => []);

    await api.addSeries({
      tvdbid: 100,
      title: 'Test Series',
      profileId: 1,
      seasons: [1],
      episodeSelections: [{ seasonNumber: 1 }],
      seasonFolder: true,
      rootFolderPath: '/tv',
      seriesType: 'standard',
    });

    assert.equal(getEpisodes.mock.callCount(), 0);
    assert.ok(
      !puts.mock.calls.some((call) =>
        String(call.arguments[0]).endsWith('/api/v5/series')
      )
    );

    const seasonRequest = puts.mock.calls.find((call) =>
      String(call.arguments[0]).endsWith('/api/v5/series/42/season')
    );
    assert.ok(seasonRequest);
    assert.deepEqual(seasonRequest.arguments[1], {
      seasonNumber: 1,
      monitored: true,
    });
  });

  it('uses the v5 series editor for monitored and tag changes', async () => {
    const api = buildSonarr('v5');
    mock.method(api, 'getSeriesByTvdbId', async () =>
      series({ seasons: [{ seasonNumber: 1, monitored: false }], tags: [7] })
    );
    const puts = mock.method(getAxios(api), 'put', async () => ({ data: [] }));

    await api.addSeries({
      tvdbid: 100,
      title: 'Test Series',
      profileId: 1,
      seasons: [1],
      tags: [8],
      monitored: false,
      seasonFolder: true,
      rootFolderPath: '/tv',
      seriesType: 'standard',
    });

    const editorRequest = puts.mock.calls.find((call) =>
      String(call.arguments[0]).endsWith('/api/v5/series/editor')
    );
    assert.ok(editorRequest);
    assert.deepEqual(editorRequest.arguments[1], {
      seriesIds: [42],
      monitored: false,
      tags: [8],
      applyTags: 'add',
    });
    assert.ok(
      !puts.mock.calls.some((call) =>
        String(call.arguments[0]).endsWith('/api/v5/series')
      )
    );
  });

  it('omits legacy language profiles when adding a series through v5', async () => {
    const api = buildSonarr('v5');
    mock.method(api, 'getSeriesByTvdbId', async () =>
      series({ id: undefined, languageProfileId: 17 })
    );
    mock.method(api, 'getMetadataLanguages', async () => [
      { id: 1, name: 'English' },
    ]);
    const post = mock.method(getAxios(api), 'post', async () => ({
      data: { id: 99, title: 'Test Series', tvdbId: 100 },
    }));

    await api.addSeries({
      tvdbid: 100,
      title: 'Test Series',
      profileId: 1,
      languageProfileId: 17,
      seasons: [1],
      seasonFolder: true,
      rootFolderPath: '/tv',
      seriesType: 'standard',
    });

    const createPayload = post.mock.calls[0].arguments[1] as Record<
      string,
      unknown
    >;
    assert.ok(!('languageProfileId' in createPayload));
    assert.deepEqual(createPayload.language, { id: 1, name: 'English' });
    assert.equal(createPayload.seasonType, 'official');
  });

  for (const testCase of [
    {
      name: 'lookup language and aired order when the selected order is absent',
      lookup: {
        language: { id: 1, name: 'English' },
        originalLanguage: { id: 4, name: 'Japanese' },
      },
      options: {},
      expectedLanguage: { id: 1, name: 'English' },
      expectedSeasonType: 'official',
    },
    {
      name: 'original language when lookup has no selected language',
      lookup: { originalLanguage: { id: 4, name: 'Japanese' } },
      options: {},
      expectedLanguage: { id: 4, name: 'Japanese' },
      expectedSeasonType: 'official',
    },
    {
      name: 'aired order for the default season-order option',
      lookup: { language: { id: 1, name: 'English' } },
      options: { seasonType: 'standard' },
      expectedLanguage: { id: 1, name: 'English' },
      expectedSeasonType: 'official',
    },
    {
      name: 'the selected lookup order when no request order is chosen',
      lookup: {
        language: { id: 1, name: 'English' },
        seasonType: 'dvd',
      },
      options: {},
      expectedLanguage: { id: 1, name: 'English' },
      expectedSeasonType: 'dvd',
    },
  ]) {
    it(`adds v5 series with ${testCase.name}`, async () => {
      const api = buildSonarr('v5');
      mock.method(api, 'getSeriesByTvdbId', async () =>
        series({
          id: undefined,
          seasonTypes: [
            { name: 'Aired Order', type: 'official', seasonNumbers: [1] },
            { name: 'DVD Order', type: 'dvd', seasonNumbers: [1] },
          ],
          ...testCase.lookup,
        })
      );
      mock.method(api, 'getMetadataLanguages', async () => {
        throw new Error('Lookup already supplied a metadata language');
      });
      const post = mock.method(getAxios(api), 'post', async () => ({
        data: { id: 99, title: 'Test Series', tvdbId: 100 },
      }));

      await api.addSeries({
        tvdbid: 100,
        title: 'Test Series',
        profileId: 1,
        seasons: [1],
        seasonFolder: true,
        rootFolderPath: '/tv',
        seriesType: 'standard',
        ...testCase.options,
      });

      const createPayload = post.mock.calls[0].arguments[1] as Record<
        string,
        unknown
      >;
      assert.deepEqual(createPayload.language, testCase.expectedLanguage);
      assert.equal(createPayload.seasonType, testCase.expectedSeasonType);
      assert.ok(!('languageProfileId' in createPayload));
    });
  }

  for (const testCase of [
    {
      name: 'server defaults',
      version: 'v5',
      options: {},
      defaults: { defaultMetadataLanguageId: 2, defaultSeasonType: 'official' },
      language: 2,
      order: 'official',
    },
    {
      name: 'request overrides before server defaults',
      version: 'v5',
      options: { metadataLanguageId: 4, seasonType: 'dvd' },
      defaults: { defaultMetadataLanguageId: 2, defaultSeasonType: 'official' },
      language: 4,
      order: 'dvd',
    },
    {
      name: 'automatic server order from lookup',
      version: 'v5',
      options: {},
      defaults: {
        defaultMetadataLanguageId: 2,
        defaultSeasonType: 'automatic',
      },
      language: 2,
      order: 'dvd',
    },
    {
      name: 'v3 compatibility despite saved v5 defaults',
      version: 'v3',
      options: {},
      defaults: { defaultMetadataLanguageId: 2, defaultSeasonType: 'official' },
      language: undefined,
      order: undefined,
    },
  ] as const) {
    it(`creates a series using ${testCase.name}`, async () => {
      const api = buildSonarr(testCase.version);
      mock.method(api, 'getSeriesByTvdbId', async () =>
        series({
          id: undefined,
          language: { id: 1, name: 'English' },
          seasonType: 'dvd',
          seasonTypes: [
            { name: 'Aired Order', type: 'official', seasonNumbers: [1] },
            { name: 'DVD Order', type: 'dvd', seasonNumbers: [1] },
          ],
        })
      );
      mock.method(api, 'getMetadataLanguages', async () => {
        assert.equal(testCase.version, 'v5');
        return [
          { id: 1, name: 'English' },
          { id: 2, name: 'French' },
          { id: 4, name: 'Japanese' },
        ];
      });
      const post = mock.method(getAxios(api), 'post', async () => ({
        data: { id: 99, title: 'Test Series', tvdbId: 100 },
      }));
      await api.addSeries({
        tvdbid: 100,
        title: 'Test Series',
        profileId: 1,
        seasons: [1],
        seasonFolder: true,
        rootFolderPath: '/tv',
        seriesType: 'standard',
        defaults: testCase.defaults,
        ...testCase.options,
      });
      const payload = post.mock.calls[0].arguments[1] as {
        language?: { id: number };
        seasonType?: string;
      };
      assert.equal(payload.language?.id, testCase.language);
      assert.equal(payload.seasonType, testCase.order);
    });
  }

  it('does not change existing series metadata to match server defaults', async () => {
    const api = buildSonarr('v5');
    mock.method(api, 'getSeriesByTvdbId', async () =>
      series({ language: { id: 4, name: 'Japanese' }, seasonType: 'dvd' })
    );
    mock.method(api, 'getMetadataLanguages', async () => {
      throw new Error('Existing metadata must be preserved');
    });
    mock.method(getAxios(api), 'put', async () => {
      throw new Error('Existing metadata must be preserved');
    });
    const result = await api.addSeries({
      tvdbid: 100,
      title: 'Test Series',
      profileId: 1,
      seasons: [],
      seasonFolder: true,
      rootFolderPath: '/tv',
      seriesType: 'standard',
      defaults: { defaultMetadataLanguageId: 2, defaultSeasonType: 'official' },
    });
    assert.equal(result.language?.id, 4);
    assert.equal(result.seasonType, 'dvd');
  });

  it('adds v5 metadata language and season order to a new series', async () => {
    const api = buildSonarr('v5');
    mock.method(api, 'getSeriesByTvdbId', async () =>
      series({
        id: undefined,
        language: { id: 1, name: 'English' },
        seasonType: 'official',
        seasonTypes: [
          { name: 'Aired Order', type: 'official', seasonNumbers: [1] },
          { name: 'Absolute', type: 'absolute', seasonNumbers: [1] },
        ],
      })
    );
    mock.method(api, 'getMetadataLanguages', async () => [
      { id: 4, name: 'Japanese' },
    ]);
    const post = mock.method(getAxios(api), 'post', async () => ({
      data: { id: 99, title: 'Test Series', tvdbId: 100 },
    }));

    await api.addSeries({
      tvdbid: 100,
      title: 'Test Series',
      profileId: 1,
      metadataLanguageId: 4,
      seasonType: 'absolute',
      seasons: [],
      seasonFolder: true,
      rootFolderPath: '/tv',
      seriesType: 'standard',
    });

    const createPayload = post.mock.calls[0].arguments[1] as Record<
      string,
      unknown
    >;
    assert.deepEqual(createPayload.language, { id: 4, name: 'Japanese' });
    assert.equal(createPayload.seasonType, 'absolute');
    assert.ok(!('languageProfileId' in createPayload));
  });

  it('updates only requested metadata while preserving Sonarr-owned series fields', async () => {
    const api = buildSonarr('v5');
    mock.method(api, 'getSeriesByTvdbId', async () =>
      series({
        seasonType: 'standard',
        seasonTypes: [
          { name: 'Standard', type: 'standard', seasonNumbers: [1] },
          { name: 'Absolute', type: 'absolute', seasonNumbers: [1] },
        ],
        language: { id: 1, name: 'English' },
      })
    );
    mock.method(api, 'getMetadataLanguages', async () => [
      { id: 4, name: 'Japanese' },
    ]);
    const currentResource = {
      id: 42,
      tvdbId: 100,
      title: 'Test Series',
      path: '/tv/Test Series',
      qualityProfileId: 9,
      language: { id: 1, name: 'English' },
      seasonType: 'standard',
      seasonTypes: [
        { name: 'Standard', type: 'standard', seasonNumbers: [1] },
        { name: 'Absolute', type: 'absolute', seasonNumbers: [1] },
      ],
      providerOwnedValue: 'keep me',
    };
    const get = mock.method(getAxios(api), 'get', async () => ({
      data: currentResource,
    }));
    const put = mock.method(
      getAxios(api),
      'put',
      async (_url: string, payload: Record<string, unknown>) => ({
        data: payload,
      })
    );

    await api.addSeries({
      tvdbid: 100,
      title: 'Test Series',
      profileId: 1,
      metadataLanguageId: 4,
      seasonType: 'absolute',
      seasons: [],
      seasonFolder: true,
      rootFolderPath: '/tv',
      seriesType: 'standard',
    });

    const metadataUpdate = put.mock.calls.find((call) =>
      String(call.arguments[0]).endsWith('/api/v5/series/42')
    );
    assert.ok(metadataUpdate);
    assert.deepEqual(metadataUpdate.arguments[1], {
      ...currentResource,
      language: { id: 4, name: 'Japanese' },
      seasonType: 'absolute',
    });
    assert.equal(get.mock.callCount(), 2);
    assert.ok(
      !put.mock.calls.some((call) =>
        String(call.arguments[0]).endsWith('/api/v5/series/editor')
      )
    );
  });

  it('keeps legacy language profiles when adding a series through v3', async () => {
    const api = buildSonarr();
    mock.method(api, 'getSeriesByTvdbId', async () =>
      series({ id: undefined, languageProfileId: 17 })
    );
    const post = mock.method(getAxios(api), 'post', async () => ({
      data: { id: 99, title: 'Test Series', tvdbId: 100 },
    }));

    await api.addSeries({
      tvdbid: 100,
      title: 'Test Series',
      profileId: 1,
      languageProfileId: 17,
      seasons: [1],
      seasonFolder: true,
      rootFolderPath: '/tv',
      seriesType: 'standard',
    });

    const createPayload = post.mock.calls[0].arguments[1] as Record<
      string,
      unknown
    >;
    assert.equal(createPayload.languageProfileId, 17);
    assert.ok(!('language' in createPayload));
    assert.ok(!('seasonType' in createPayload));
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

describe('Sonarr requester-tag editor boundary', () => {
  afterEach(() => mock.restoreAll());
  it('adds only exact-item tags without acquisition or monitoring options', async () => {
    const api = buildSonarr();
    const request = mock.method(
      api as unknown as { request: (...args: unknown[]) => Promise<unknown> },
      'request',
      async () => ({ data: [] })
    );
    await api.addTagsToSeries(91, [7, 7, 8]);
    assert.deepEqual(
      request.mock.calls.map((call) => call.arguments),
      [
        [
          'PUT',
          '/series/editor',
          { seriesIds: [91], tags: [7, 8], applyTags: 'add' },
        ],
      ]
    );
  });
  it('rejects invalid provider identities and tags before any network write', async () => {
    const api = buildSonarr();
    const request = mock.method(
      api as unknown as { request: (...args: unknown[]) => Promise<unknown> },
      'request',
      async () => ({ data: [] })
    );
    for (const [id, tags] of [
      [0, [7]],
      [-1, [7]],
      [NaN, [7]],
      [91, []],
      [91, [0]],
      [91, [1.5]],
    ] as [number, number[]][]) {
      await assert.rejects(api.addTagsToSeries(id, tags));
    }
    assert.equal(request.mock.callCount(), 0);
  });
});
