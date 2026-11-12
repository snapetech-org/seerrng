import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';

import BackIssueAPI from '@server/api/comics/backissue';

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
        if (endpoint === '/api/libraries') throw new Error('404');
        return { rows: [row(1, 10)], total: 1 };
      }
    );
    assert.equal((await api().getCollection()).length, 1);
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
});
