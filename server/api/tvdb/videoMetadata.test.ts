import ExternalAPI from '@server/api/externalapi';
import type { AxiosRequestConfig } from 'axios';
import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import Tvdb from './index';
import type { TvdbBaseResponse, TvdbVideoMetadataRecord } from './interfaces';

type MockableTvdbToken = {
  refreshToken: () => Promise<void>;
};

type MockableVideoRequest = {
  get: (
    endpoint: string,
    config?: AxiosRequestConfig,
    ttl?: number
  ) => Promise<Pick<TvdbBaseResponse<TvdbVideoMetadataRecord[]>, 'data'>>;
};

describe('TheTVDB remote-ID video lookup', () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it('uses the v4 remote-ID endpoint and filters to the requested media type', async () => {
    const tvdb = new Tvdb();
    mock.method(
      tvdb as unknown as MockableTvdbToken,
      'refreshToken',
      async () => undefined
    );
    const request = mock.method(
      ExternalAPI.prototype as unknown as MockableVideoRequest,
      'get',
      async () => ({
        data: [
          { id: 10, name: 'A series', type: 'series' },
          { id: 20, name: 'A movie', type: 'movie' },
        ],
      })
    );

    const result = await tvdb.getVideoMetadataByTmdbId({
      mediaType: 'movie',
      tmdbId: 456,
    });

    assert.equal(result?.id, 20);
    assert.equal(request.mock.calls[0].arguments[0], '/search/remoteid/456');
  });

  it('rejects an ambiguous same-type remote-ID match', async () => {
    const tvdb = new Tvdb();
    mock.method(
      tvdb as unknown as MockableTvdbToken,
      'refreshToken',
      async () => undefined
    );
    mock.method(
      ExternalAPI.prototype as unknown as MockableVideoRequest,
      'get',
      async () => ({
        data: [
          { id: 20, name: 'First movie', type: 'movie' },
          { id: 21, name: 'Second movie', type: 'movie' },
        ],
      })
    );

    const result = await tvdb.getVideoMetadataByTmdbId({
      mediaType: 'movie',
      tmdbId: 456,
    });

    assert.equal(result, undefined);
  });

  it('fetches TV metadata only after verifying the exact TMDB series ID', async () => {
    const tvdb = new Tvdb();
    mock.method(
      tvdb as unknown as MockableTvdbToken,
      'refreshToken',
      async () => undefined
    );
    const paths: string[] = [];
    mock.method(
      ExternalAPI.prototype as unknown as MockableTvdbRequest,
      'get',
      async (endpoint: string) => {
        paths.push(endpoint);
        return endpoint === '/search/remoteid/87012'
          ? { data: [{ series: { id: 184871 } }] }
          : {
              data: {
                id: 184871,
                name: 'The Great British Bake Off',
                remoteIds: [{ id: '87012', type: 12 }],
              },
            };
      }
    );

    const result = await tvdb.getVideoMetadataByTmdbId({
      mediaType: 'tv',
      tmdbId: 87012,
    });

    assert.equal(result?.id, 184871);
    assert.deepEqual(paths, [
      '/search/remoteid/87012',
      '/series/184871/extended',
      '/series/184871/extended',
    ]);
  });
});

type MockableTvdbRequest = {
  get: (
    endpoint: string,
    config?: AxiosRequestConfig,
    ttl?: number
  ) => Promise<{ data: unknown }>;
};

describe('TheTVDB verified TV series resolution', () => {
  afterEach(() => mock.restoreAll());

  const createTvdb = () => {
    const tvdb = new Tvdb();
    mock.method(
      tvdb as unknown as MockableTvdbToken,
      'refreshToken',
      async () => undefined
    );
    return tvdb;
  };

  it('accepts only a series that confirms the exact TMDB TV remote ID', async () => {
    const tvdb = createTvdb();
    mock.method(
      ExternalAPI.prototype as unknown as MockableTvdbRequest,
      'get',
      async (endpoint: string) => {
        if (endpoint === '/search/remoteid/87012') {
          return {
            data: [{ series: { id: 184871 } }, { series: { id: 184872 } }],
          };
        }

        if (endpoint === '/series/184871/extended') {
          return {
            data: {
              id: 184871,
              remoteIds: [{ id: '87012', type: 12 }],
              seasons: [],
              episodes: [],
            },
          };
        }

        return {
          data: {
            id: 184872,
            remoteIds: [{ id: '87012', type: 10 }],
            seasons: [],
            episodes: [],
          },
        };
      }
    );

    assert.equal(await tvdb.resolveTvdbId(87012), 184871);
  });

  it('rejects unrelated source IDs, ambiguous series, and incomplete records', async () => {
    const tvdb = createTvdb();
    let mode: 'wrong-source' | 'ambiguous' | 'incomplete' = 'wrong-source';
    mock.method(
      ExternalAPI.prototype as unknown as MockableTvdbRequest,
      'get',
      async (endpoint: string) => {
        if (endpoint === '/search/remoteid/87012') {
          return {
            data: [
              { series: { id: 184871 } },
              ...(mode === 'ambiguous' ? [{ series: { id: 184872 } }] : []),
            ],
          };
        }

        if (mode === 'incomplete') {
          return { data: { id: 184871, seasons: [], episodes: [] } };
        }

        return {
          data: {
            id: Number(endpoint.match(/series\/(\d+)/)?.[1]),
            remoteIds: [
              {
                id: '87012',
                type: mode === 'wrong-source' ? 10 : 12,
              },
            ],
            seasons: [],
            episodes: [],
          },
        };
      }
    );

    assert.equal(await tvdb.resolveTvdbId(87012), undefined);
    mode = 'ambiguous';
    assert.equal(await tvdb.resolveTvdbId(87012), undefined);
    mode = 'incomplete';
    assert.equal(await tvdb.resolveTvdbId(87012), undefined);
    assert.equal(await tvdb.resolveTvdbId(-1), undefined);
  });

  it('returns confirmed official seasons with their aired year', async () => {
    const tvdb = createTvdb();
    mock.method(
      ExternalAPI.prototype as unknown as MockableTvdbRequest,
      'get',
      async () => ({
        data: {
          id: 184871,
          seasons: [
            { number: 0, type: { type: 'official' }, year: '2020' },
            { number: 15, type: { type: 'official' }, year: '' },
            { number: 16, type: { type: 'alternate' }, year: '2025' },
          ],
          episodes: [
            { seasonNumber: 15, aired: '2024-04-13' },
            { seasonNumber: 15, aired: '2024-04-20' },
          ],
        },
      })
    );

    assert.deepEqual(await tvdb.getOfficialSeasons(184871), [
      { seasonNumber: 0, year: 2020 },
      { seasonNumber: 15, year: 2024 },
    ]);
  });

  it('distinguishes incomplete season data from a confirmed empty list', async () => {
    const tvdb = createTvdb();
    let record: unknown = { id: 184871, seasons: [] };
    mock.method(
      ExternalAPI.prototype as unknown as MockableTvdbRequest,
      'get',
      async () => ({ data: record })
    );

    assert.equal(await tvdb.getOfficialSeasons(184871), null);
    record = { id: 184871, seasons: [], episodes: [] };
    assert.deepEqual(await tvdb.getOfficialSeasons(184871), []);
    assert.equal(await tvdb.getOfficialSeasons(0), null);
  });

  it('keeps the official special season available for an explicit mapping', async () => {
    const tvdb = createTvdb();
    mock.method(
      ExternalAPI.prototype as unknown as MockableTvdbRequest,
      'get',
      async () => ({
        data: {
          id: 184871,
          seasons: [
            { number: 0, type: { type: 'official' }, year: '2024' },
            { number: 1, type: { type: 'official' }, year: '2024' },
            { number: -1, type: { type: 'official' }, year: '2023' },
          ],
          episodes: [],
        },
      })
    );

    assert.deepEqual(await tvdb.getOfficialSeasons(184871), [
      { seasonNumber: 0, year: 2024 },
      { seasonNumber: 1, year: 2024 },
    ]);
  });
});
