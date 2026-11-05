import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import ServarrBase from './base';

afterEach(() => mock.restoreAll());
const client = () =>
  new ServarrBase({
    url: 'http://127.0.0.1:8989/api/v3',
    apiKey: 'fixture-only-key',
    cacheName: 'sonarr',
    apiName: 'Sonarr',
  });
type RequestClient = { request: (...args: unknown[]) => Promise<unknown> };

describe('bounded Servarr queue snapshots', () => {
  it('keeps pagination offsets stable when a configured cap ends partway through a page', async () => {
    const api = client();
    const pages: number[] = [];
    mock.method(
      api as unknown as RequestClient,
      'request',
      async (...args: unknown[]) => {
        const { page, pageSize } = (
          args[3] as { params: { page: number; pageSize: number } }
        ).params;
        assert.equal(pageSize, 1000);
        pages.push(page);
        return {
          data: {
            totalRecords: 3000,
            records: Array.from({ length: 1000 }, (_, i) => ({
              id: (page - 1) * 1000 + i + 1,
              title: 'Queue fixture',
            })),
          },
        };
      }
    );
    const rows = await api.getQueue(1500);
    assert.deepEqual(pages, [1, 2]);
    assert.equal(rows.length, 1500);
    assert.equal(rows[0].id, 1);
    assert.equal(rows[1499].id, 1500);
  });
  it('rejects duplicate IDs within a single provider page', async () => {
    const api = client();
    mock.method(api as unknown as RequestClient, 'request', async () => ({
      data: {
        totalRecords: 2,
        records: [
          { id: 1, title: 'First' },
          { id: 1, title: 'Duplicate' },
        ],
      },
    }));
    await assert.rejects(api.getQueue(10), /repeated records/u);
  });
});
