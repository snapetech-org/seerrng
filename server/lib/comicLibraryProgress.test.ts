import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import {
  clearComicLibraryProgress,
  getComicLibraryProgress,
  pruneComicLibraryProgressServices,
  replaceComicLibraryProgress,
} from './comicLibraryProgress';

afterEach(clearComicLibraryProgress);

describe('comic library progress snapshots', () => {
  it('replaces stale series and preserves other services', () => {
    replaceComicLibraryProgress(7, [
      { externalServiceId: 31, progress: { owned: 4, total: 16, active: 1 } },
      { externalServiceId: 32, progress: { owned: 8, total: 12, active: 0 } },
    ]);
    replaceComicLibraryProgress(8, [
      { externalServiceId: 31, progress: { owned: 3, total: 9, active: 0 } },
    ]);

    replaceComicLibraryProgress(7, [
      { externalServiceId: 32, progress: { owned: 9, total: 12, active: 0 } },
    ]);

    assert.equal(getComicLibraryProgress(7, 31), undefined);
    assert.deepEqual(getComicLibraryProgress(7, 32), {
      owned: 9,
      total: 12,
      active: 0,
    });
    assert.deepEqual(getComicLibraryProgress(8, 31), {
      owned: 3,
      total: 9,
      active: 0,
    });
  });

  it('removes empty snapshots and unconfigured services', () => {
    replaceComicLibraryProgress(7, [
      { externalServiceId: 31, progress: { owned: 4, total: 16, active: 1 } },
    ]);
    replaceComicLibraryProgress(8, [
      { externalServiceId: 41, progress: { owned: 5, total: 5, active: 0 } },
    ]);

    replaceComicLibraryProgress(7, []);
    pruneComicLibraryProgressServices([8]);

    assert.equal(getComicLibraryProgress(7, 31), undefined);
    assert.equal(getComicLibraryProgress(8, 41)?.owned, 5);
    pruneComicLibraryProgressServices([]);
    assert.equal(getComicLibraryProgress(8, 41), undefined);
  });
});
