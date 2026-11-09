import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';

import { Cache, estimateCacheEntryBytes, type CacheSnapshot } from './cache';

describe('Cache', () => {
  it('evicts the least recently set key when its key cap is exceeded', () => {
    const cache = new Cache('tmdb', 'Test cache', {
      checkPeriod: 0,
      maxKeys: 2,
    });

    cache.data.set('first', 1);
    cache.data.set('second', 2);
    cache.data.set('first', 3);
    cache.data.set('third', 4);

    assert.deepStrictEqual(cache.data.keys().sort(), ['first', 'third']);
    assert.strictEqual(cache.data.get('first'), 3);
    assert.strictEqual(cache.data.get('second'), undefined);
  });

  it('forgets key order when the cache is flushed', () => {
    const cache = new Cache('tmdb', 'Test cache', {
      checkPeriod: 0,
      maxKeys: 1,
    });

    cache.data.set('first', 1);
    cache.flush();
    cache.data.set('second', 2);

    assert.deepStrictEqual(cache.data.keys(), ['second']);
  });

  it('evicts entries before exceeding the byte cap', () => {
    const firstValue = 'x'.repeat(64);
    const secondValue = 'y'.repeat(64);
    const maxBytes = Math.max(
      estimateCacheEntryBytes('first', firstValue),
      estimateCacheEntryBytes('second', secondValue)
    );
    const cache = new Cache('tmdb', 'Test cache', {
      checkPeriod: 0,
      maxBytes,
    });

    cache.data.set('first', firstValue);
    cache.data.set('second', secondValue);

    assert.deepStrictEqual(cache.data.keys(), ['second']);
  });

  it('reclaims replaced and deleted entry bytes', () => {
    const small = 'x';
    const maxBytes =
      estimateCacheEntryBytes('first', small) +
      estimateCacheEntryBytes('second', small);
    const cache = new Cache('tmdb', 'Test cache', {
      checkPeriod: 0,
      maxBytes,
    });

    cache.data.set('first', 'x'.repeat(64));
    assert.strictEqual(cache.data.get('first'), undefined);
    cache.data.set('first', small);
    cache.data.set('second', small);
    assert.deepStrictEqual(cache.data.keys().sort(), ['first', 'second']);

    cache.data.del('first');
    cache.data.set('third', small);
    assert.deepStrictEqual(cache.data.keys().sort(), ['second', 'third']);
  });

  it('does not retain a single entry larger than the byte cap', () => {
    const cache = new Cache('tmdb', 'Test cache', {
      checkPeriod: 0,
      maxBytes: 32,
    });

    cache.data.set('oversized', 'x'.repeat(1_000));

    assert.deepStrictEqual(cache.data.keys(), []);
  });
});

describe('Cache stale copies', () => {
  const later = (ms: number) => {
    const now = Date.now();
    mock.method(Date, 'now', () => now + ms);
  };
  afterEach(() => mock.restoreAll());

  it('keeps an expired value for getStale but not for get', () => {
    const cache = new Cache('tmdb', 'Test cache', {
      checkPeriod: 0,
      staleMaxAge: 60,
    });
    cache.data.set('feed', { page: 1 }, 1);
    later(2_000);
    assert.strictEqual(cache.data.get('feed'), undefined);
    assert.deepStrictEqual(cache.getStale('feed'), { page: 1 });
  });

  it('drops a stale value after its stale window', () => {
    const cache = new Cache('tmdb', 'Test cache', {
      checkPeriod: 0,
      staleMaxAge: 60,
    });
    cache.data.set('feed', 1, 1);
    later(2_000);
    cache.data.get('feed');
    mock.restoreAll();
    later(70_000);
    assert.strictEqual(cache.getStale('feed'), undefined);
  });

  it('does not keep values that were invalidated, evicted or flushed', () => {
    const cache = new Cache('tmdb', 'Test cache', {
      checkPeriod: 0,
      staleMaxAge: 60,
      maxKeys: 1,
    });
    cache.data.set('removed', 1, 1);
    cache.data.del('removed');
    cache.data.set('evicted', 2, 1);
    cache.data.set('kept', 3, 1);
    later(2_000);
    cache.data.get('kept');
    assert.strictEqual(cache.getStale('removed'), undefined);
    assert.strictEqual(cache.getStale('evicted'), undefined);
    assert.strictEqual(cache.getStale('kept'), 3);
    cache.flush();
    assert.strictEqual(cache.getStale('kept'), undefined);
  });

  it('keeps nothing stale unless the cache opts in', () => {
    const cache = new Cache('tmdb', 'Test cache', { checkPeriod: 0 });
    cache.data.set('feed', 1, 1);
    later(2_000);
    cache.data.get('feed');
    assert.strictEqual(cache.getStale('feed'), undefined);
  });

  it('restores fresh entries as fresh and expired ones as stale only', () => {
    const source = new Cache('tmdb', 'Test cache', {
      checkPeriod: 0,
      staleMaxAge: 3600,
    });
    source.data.set('fresh', 'f', 600);
    source.data.set('old', 'o', 1);
    later(2_000);
    source.data.get('old');
    const snapshot = source.snapshot();

    const target = new Cache('tmdb', 'Test cache', {
      checkPeriod: 0,
      staleMaxAge: 3600,
    });
    target.data.set('fresh', 'current', 600);
    assert.strictEqual(target.restore(snapshot), 1);
    assert.strictEqual(target.data.get('fresh'), 'current');
    assert.strictEqual(target.data.get('old'), undefined);
    assert.strictEqual(target.getStale('old'), 'o');

    const empty = new Cache('tmdb', 'Test cache', {
      checkPeriod: 0,
      staleMaxAge: 3600,
    });
    assert.strictEqual(empty.restore(snapshot), 2);
    assert.strictEqual(empty.data.get('fresh'), 'f');
  });

  it('ignores snapshots of another cache or format', () => {
    const cache = new Cache('tmdb', 'Test cache', { checkPeriod: 0 });
    const entries = [{ key: 'k', value: 1, expiresAt: Date.now() + 60_000 }];
    assert.strictEqual(
      cache.restore({ version: 1, id: 'tvdb', savedAt: 0, entries }),
      0
    );
    assert.strictEqual(
      cache.restore({
        version: 2,
        id: 'tmdb',
        savedAt: 0,
        entries,
      } as unknown as CacheSnapshot),
      0
    );
    assert.strictEqual(cache.data.keys().length, 0);
  });
});
