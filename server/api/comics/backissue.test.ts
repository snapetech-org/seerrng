import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';

import BackIssueAPI, { commonFolder } from '@server/api/comics/backissue';

type MockableBackIssue = {
  get: (
    endpoint: string,
    options?: { params?: Record<string, unknown> },
    ttl?: number
  ) => Promise<unknown>;
  post: (endpoint: string, data?: Record<string, unknown>) => Promise<unknown>;
};

const api = () =>
  new BackIssueAPI({ url: 'http://backissue.test:8787', apiKey: 'k' });

const row = (id: number, cvId: number, type = 'comic', owned = 0) => ({
  id,
  title: `Series ${id}`,
  cv_id: cvId,
  total: 10,
  owned,
  missing: 10 - owned,
  active: 0,
  type,
});

const httpError = (status: number) =>
  Object.assign(new Error(`HTTP ${status}`), {
    isAxiosError: true,
    response: { status },
  });

describe('BackIssueAPI', () => {
  afterEach(() => mock.restoreAll());

  it('reads the collection one comic/manga library at a time without a page total', async () => {
    const calls: Record<string, unknown>[] = [];
    mock.method(
      BackIssueAPI.prototype as unknown as MockableBackIssue,
      'get',
      async (
        endpoint: string,
        options?: { params?: Record<string, unknown> }
      ) => {
        if (endpoint === '/api/libraries')
          return {
            libraries: [
              { id: 1, name: 'Manga', type: 'manga' },
              { id: 2, name: 'Comics', type: 'comic' },
              { id: 3, name: 'Books', type: 'ebook' },
            ],
            defaultId: 2,
          };
        calls.push(options?.params ?? {});
        const params = options?.params ?? {};
        if (params.library === 1) {
          // BackIssue sends total: null when counts=0
          return params.offset === 0
            ? {
                rows: Array.from({ length: 500 }, (_, i) =>
                  row(i + 1, 1000 + i, 'manga')
                ),
                total: null,
                counts: {},
              }
            : { rows: [row(501, 5000, 'manga')], total: null, counts: {} };
        }
        return {
          rows: [row(900, 9000), { id: 901, title: 'Unmatched', cv_id: null }],
          total: null,
          counts: {},
        };
      }
    );

    const rows = await api().getCollection();

    assert.equal(rows.length, 502);
    assert.deepEqual(
      calls.map((params) => [params.library, params.offset, params.counts]),
      [
        [1, 0, 0],
        [1, 500, 0],
        [2, 0, 0],
      ]
    );
    assert.equal(rows.at(-1)?.cv_id, 9000);
    assert.equal(rows[0].type, 'manga');
  });

  it('falls back to the whole collection when BackIssue has no library list', async () => {
    mock.method(
      BackIssueAPI.prototype as unknown as MockableBackIssue,
      'get',
      async (endpoint: string) => {
        if (endpoint === '/api/libraries') throw httpError(404);
        return { rows: [row(1, 10)], total: 1 };
      }
    );
    assert.equal((await api().getCollection()).length, 1);
  });

  it('does not fall back to an unfiltered scan when the library request fails', async () => {
    const collectionCalls: string[] = [];
    mock.method(
      BackIssueAPI.prototype as unknown as MockableBackIssue,
      'get',
      async (endpoint: string) => {
        if (endpoint === '/api/libraries') throw httpError(503);
        collectionCalls.push(endpoint);
        return { rows: [], total: 0 };
      }
    );

    await assert.rejects(api().getCollection(), /HTTP 503/);
    assert.deepEqual(collectionCalls, []);
  });

  it('does not scan libraries when BackIssue has no comic or manga library', async () => {
    const calls: string[] = [];
    mock.method(
      BackIssueAPI.prototype as unknown as MockableBackIssue,
      'get',
      async (endpoint: string) => {
        calls.push(endpoint);
        if (endpoint === '/api/libraries') {
          return { libraries: [{ id: 8, name: 'Books', type: 'ebook' }] };
        }
        return { rows: [], total: 0 };
      }
    );

    assert.deepEqual(await api().getCollection(), []);
    assert.deepEqual(calls, ['/api/libraries']);
  });

  it('does not guess a missing library type or fall back to a global scan', async () => {
    const calls: string[] = [];
    mock.method(
      BackIssueAPI.prototype as unknown as MockableBackIssue,
      'get',
      async (endpoint: string) => {
        calls.push(endpoint);
        if (endpoint === '/api/libraries') {
          return { libraries: [{ id: 2, name: 'Unclassified' }] };
        }
        return { rows: [], total: 0 };
      }
    );

    await assert.rejects(api().getCollection(), /invalid library entry/i);
    assert.deepEqual(calls, ['/api/libraries']);
  });

  it('checks one collection row and the queue without mutating BackIssue', async () => {
    const calls: { endpoint: string; params?: Record<string, unknown> }[] = [];
    mock.method(
      BackIssueAPI.prototype as unknown as MockableBackIssue,
      'get',
      async (
        endpoint: string,
        options?: { params?: Record<string, unknown> }
      ) => {
        calls.push({ endpoint, params: options?.params });
        if (endpoint === '/api/libraries') {
          return {
            libraries: [{ id: 2, name: 'Comics', type: 'comic' }],
          };
        }
        if (endpoint === '/api/collection') {
          return { rows: [row(1, 10)], total: 1 };
        }
        return { items: [], packs: [] };
      }
    );

    await api().testConnection();
    assert.deepEqual(
      calls.map(({ endpoint }) => endpoint),
      ['/api/libraries', '/api/collection', '/api/queue']
    );
    assert.deepEqual(calls[1].params, {
      limit: 1,
      offset: 0,
      counts: 0,
      library: 2,
    });
  });

  it('files a manga into the manga library when adding it', async () => {
    const bodies: (Record<string, unknown> | undefined)[] = [];
    mock.method(
      BackIssueAPI.prototype as unknown as MockableBackIssue,
      'post',
      async (_endpoint: string, data?: Record<string, unknown>) => {
        bodies.push(data);
        return { seriesId: 44, outcome: 'added' };
      }
    );
    await api().addVolume(147500, { manga: true });
    await api().addVolume(796);
    assert.deepEqual(bodies, [
      { comicvineId: 147500, manga: true },
      { comicvineId: 796 },
    ]);
  });

  it('reports pack grabs alongside issue downloads', async () => {
    mock.method(
      BackIssueAPI.prototype as unknown as MockableBackIssue,
      'get',
      async () => ({
        items: [
          {
            id: 5,
            series_id: 12,
            series_title: 'Saga',
            status: 'downloading',
            live: { progress: 40 },
          },
        ],
        packs: [
          {
            id: 77,
            title: 'Oshi no Ko v01-13',
            series_id: 31,
            series_title: '[Oshi No Ko]',
            live: { state: 'downloading', progress: 62.5, seeders: 4 },
          },
          { id: 78, title: 'Unlinked pack', series_id: null, live: null },
        ],
        media: [],
        paused: false,
        running: true,
      })
    );
    assert.deepEqual(await api().getQueue(), [
      {
        id: 5,
        seriesId: 12,
        title: 'Saga',
        status: 'downloading',
        progress: 40,
      },
      {
        id: 77,
        seriesId: 31,
        title: '[Oshi No Ko]',
        status: 'downloading',
        progress: 62.5,
        pack: true,
      },
    ]);
  });

  it('cancels a pack grab using the pack queue ID', async () => {
    const calls: { endpoint: string; data?: Record<string, unknown> }[] = [];
    mock.method(
      BackIssueAPI.prototype as unknown as MockableBackIssue,
      'post',
      async (endpoint: string, data?: Record<string, unknown>) => {
        calls.push({ endpoint, data });
        return {};
      }
    );

    await api().cancelQueueItem(77);
    assert.deepEqual(calls, [
      { endpoint: '/api/queue/cancel/77', data: {} },
    ]);
  });
});

describe('BackIssue series folder', () => {
  it('takes the reported folder, else the folder the files share', async () => {
    const client = api();
    const internals = client as unknown as MockableBackIssue;
    mock.method(internals, 'get', async (endpoint: string) =>
      endpoint === '/api/collection/1'
        ? {
            id: 1,
            title: 'Frieren',
            files: [
              { path: '/manga/Frieren/Volume 01/Frieren v01.cbz' },
              { path: '/manga/Frieren/Volume 02/Frieren v02.cbz' },
            ],
          }
        : {
            id: 2,
            title: 'Watchmen',
            location: '/comics/DC Comics/Watchmen (1986)',
            files: [],
          }
    );
    assert.equal((await client.getSeries(1))?.location, '/manga/Frieren');
    assert.equal(
      (await client.getSeries(2))?.location,
      '/comics/DC Comics/Watchmen (1986)'
    );
    assert.equal(commonFolder([]), undefined);
    assert.equal(commonFolder(['/a.cbz', '/b.cbz']), undefined);
    assert.equal(commonFolder(['C:\\manga\\Eri\\v1.cbz']), 'C:/manga/Eri');
  });
});
