import { MediaRequestStatus } from '@server/constants/media';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isActiveSeasonRequest } from './tvRequestSelection';

describe('TV season request activity', () => {
  it('excludes declined selections while retaining completed history as covered', () => {
    assert.strictEqual(
      isActiveSeasonRequest({ status: MediaRequestStatus.DECLINED }),
      false
    );
    assert.strictEqual(
      isActiveSeasonRequest({ status: MediaRequestStatus.COMPLETED }),
      true
    );
    assert.strictEqual(isActiveSeasonRequest({}), true);
  });
});
