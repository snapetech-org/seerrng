import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';

import { Cache } from '@server/lib/cache';
import {
  restoreCacheSnapshots,
  saveCacheSnapshots,
} from '@server/lib/cachePersistence';

describe('provider cache snapshots', () => {
  let directory: string;
  const make = () =>
    new Cache('tmdb', 'Test cache', { checkPeriod: 0, staleMaxAge: 3600 });

  beforeEach(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), 'seerr-cache-'));
  });
  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('restores saved entries after a restart', async () => {
    const before = make();
    before.data.set('trending', { results: [1, 2] }, 600);
    assert.strictEqual(await saveCacheSnapshots(directory, [before]), 1);

    const after = make();
    assert.strictEqual(await restoreCacheSnapshots(directory, [after]), 1);
    assert.deepStrictEqual(after.data.get('trending'), { results: [1, 2] });
    // written atomically: no temporary files are left behind
    assert.deepStrictEqual(await readdir(directory), [
      'provider-cache-tmdb.json',
    ]);
  });

  it('writes simultaneous snapshots atomically without losing a writer', async () => {
    const cache = make();
    cache.data.set('trending', { results: [1, 2] }, 600);
    const saved = await Promise.all(
      Array.from({ length: 8 }, () => saveCacheSnapshots(directory, [cache]))
    );
    assert.ok(saved.every((count) => count === 1));
    const restored = make();
    assert.strictEqual(await restoreCacheSnapshots(directory, [restored]), 1);
    assert.deepStrictEqual(restored.data.get('trending'), { results: [1, 2] });
    assert.deepStrictEqual(await readdir(directory), [
      'provider-cache-tmdb.json',
    ]);
  });

  it('keeps optional cache storage failure nonfatal', async () => {
    const blocked = path.join(directory, 'not-a-directory');
    await writeFile(blocked, 'fixture');
    const cache = make();
    cache.data.set('trending', 1, 600);
    assert.strictEqual(await saveCacheSnapshots(blocked, [cache]), 0);
  });

  it('removes the snapshot when the cache is empty', async () => {
    const cache = make();
    cache.data.set('trending', 1, 600);
    await saveCacheSnapshots(directory, [cache]);
    cache.flush();
    await saveCacheSnapshots(directory, [cache]);
    assert.deepStrictEqual(await readdir(directory), []);
  });

  it('ignores missing and unreadable snapshots', async () => {
    const cache = make();
    assert.strictEqual(await restoreCacheSnapshots(directory, [cache]), 0);
    await writeFile(path.join(directory, 'provider-cache-tmdb.json'), '{nope');
    assert.strictEqual(await restoreCacheSnapshots(directory, [cache]), 0);
    assert.strictEqual(cache.data.keys().length, 0);
  });
});
