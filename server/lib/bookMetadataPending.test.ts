import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getBookMetadataPendingRetryMs } from './bookMetadataPending';

const pending = (retryAfterSeconds: unknown = 60) => ({
  response: {
    status: 503,
    data: { code: 'metadata_pending', retryAfterSeconds },
  },
});

describe('book metadata pending contract', () => {
  it('extracts an explicit pending response through wrapped causes', () => {
    const inner = pending(120);
    const wrapped = new Error('Add failed', {
      cause: new Error('Lookup failed', { cause: inner }),
    });
    assert.equal(getBookMetadataPendingRetryMs(wrapped), 120_000);
  });

  for (const [seconds, expected] of [
    [-100, 60_000],
    [0, 60_000],
    [59, 60_000],
    [60, 60_000],
    [75, 75_000],
    [900, 900_000],
    [90_000, 900_000],
    [NaN, 60_000],
    [Infinity, 60_000],
    ['120', 60_000],
    [null, 60_000],
  ] as const) {
    it(`bounds or defaults retry delay ${String(seconds)}`, () => {
      assert.equal(getBookMetadataPendingRetryMs(pending(seconds)), expected);
    });
  }

  it('does not classify generic 503, other statuses, or message text as pending', () => {
    for (const error of [
      { response: { status: 503, data: { message: 'metadata_pending' } } },
      { response: { status: 503, data: { code: 'temporarily_unavailable' } } },
      ...[200, 202, 400, 404, 429, 500].map((status) => ({
        response: { status, data: { code: 'metadata_pending' } },
      })),
      new Error('metadata_pending'),
    ])
      assert.equal(getBookMetadataPendingRetryMs(error), undefined);
  });

  it('bounds malformed and cyclic cause chains', () => {
    const cycle: { cause?: unknown } = {};
    cycle.cause = cycle;
    for (const error of [
      undefined,
      null,
      false,
      503,
      'metadata_pending',
      [],
      { response: [] },
      { response: { status: 503, data: [] } },
      cycle,
    ]) {
      assert.equal(getBookMetadataPendingRetryMs(error), undefined);
    }
    const wrappedCycle = { cause: { ...pending(90), cause: cycle } };
    assert.equal(getBookMetadataPendingRetryMs(wrappedCycle), 90_000);
  });

  it('does not inspect beyond eight error objects', () => {
    let error: unknown = pending(90);
    for (let i = 0; i < 7; i++) error = { cause: error };
    assert.equal(getBookMetadataPendingRetryMs(error), 90_000);
    error = { cause: error };
    assert.equal(getBookMetadataPendingRetryMs(error), undefined);
  });
});
