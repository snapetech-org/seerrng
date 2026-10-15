import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';

import MusicBrainz from '@server/api/musicbrainz';

const mockMusicBrainzGet = (
  implementation: (...args: unknown[]) => Promise<unknown>
) =>
  (
    mock.method as (
      object: object,
      methodName: string,
      implementation: (...args: unknown[]) => Promise<unknown>
    ) => {
      mock: { callCount: () => number; calls: { arguments: unknown[] }[] };
    }
  )(MusicBrainz.prototype, 'get', implementation);

describe('MusicBrainz connection test', () => {
  afterEach(() => mock.restoreAll());

  it('performs an uncached search and verifies the returned MusicBrainz ID', async () => {
    const calls: unknown[][] = [];
    const get = mockMusicBrainzGet(async (...args) => {
      calls.push(args);
      return {
        artists: [
          {
            id: 'a74b1b7f-71a5-4011-9441-d0b5e4122711',
            name: 'Radiohead',
          },
        ],
      };
    });

    await new MusicBrainz().testConnection();

    assert.strictEqual(get.mock.callCount(), 1);
    assert.strictEqual(calls[0]?.[0], '/artist');
    assert.deepStrictEqual(calls[0]?.[1], {
      params: { query: 'artist:Radiohead', fmt: 'json', limit: 1 },
      timeout: 8000,
    });
    assert.strictEqual(calls[0]?.[2], 0);
  });

  it('rejects a successful HTTP response without a valid MusicBrainz result', async () => {
    mockMusicBrainzGet(async () => ({
      artists: [{ id: 'not-an-id', name: '' }],
    }));

    await assert.rejects(
      new MusicBrainz().testConnection(),
      /MusicBrainz connection test failed/
    );
  });
});
