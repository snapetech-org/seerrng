import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';

import { createMusicReadCache } from './musicReadCache';

const OPTIONS = {
  ttlMs: 1_000,
  revalidateMs: 5_000,
  maxStaleMs: 60_000,
  waitMs: 100,
};

describe('music read cache', () => {
  beforeEach(() => {
    mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 1_000_000 });
  });
  afterEach(() => {
    mock.timers.reset();
  });

  it('shares one provider call between readers and answers from it while fresh', async () => {
    const cache = createMusicReadCache(10);
    let calls = 0;
    const load = async () => ++calls;
    const [a, b] = await Promise.all([
      cache.read('k', OPTIONS, load),
      cache.read('k', OPTIONS, load),
    ]);
    assert.equal(a, 1);
    assert.equal(b, 1);
    assert.equal(await cache.read('k', OPTIONS, load), 1);
    assert.equal(calls, 1);
  });

  it('answers a recent copy at once and refreshes it in the background', async () => {
    const cache = createMusicReadCache(10);
    let calls = 0;
    const load = async () => ++calls;
    await cache.read('k', OPTIONS, load);
    mock.timers.tick(2_000);
    assert.equal(await cache.read('k', OPTIONS, load), 1);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(await cache.read('k', OPTIONS, load), 2);
  });

  it('answers an older copy when the provider fails', async () => {
    const cache = createMusicReadCache(10);
    await cache.read('k', OPTIONS, async () => 'old');
    mock.timers.tick(10_000);
    const value = await cache.read('k', OPTIONS, async () => {
      throw new Error('Aurral down');
    });
    assert.equal(value, 'old');
  });

  it('answers an older copy when the provider is slow, then keeps the new answer', async () => {
    const cache = createMusicReadCache(10);
    await cache.read('k', OPTIONS, async () => 'old');
    mock.timers.tick(10_000);
    let finish!: (value: string) => void;
    const slow = new Promise<string>((resolve) => {
      finish = resolve;
    });
    const answer = cache.read('k', OPTIONS, () => slow);
    await new Promise((resolve) => setImmediate(resolve));
    mock.timers.tick(100);
    assert.equal(await answer, 'old');
    finish('new');
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(await cache.read('k', OPTIONS, async () => 'never'), 'new');
  });

  it('waits for the provider when no copy is recent enough, and fails without one', async () => {
    const cache = createMusicReadCache(10);
    await cache.read('k', OPTIONS, async () => 'old');
    mock.timers.tick(120_000);
    await assert.rejects(
      cache.read('k', OPTIONS, async () => {
        throw new Error('Aurral down');
      }),
      /Aurral down/
    );
  });

  it('drops copies on invalidate, and an earlier read does not put one back', async () => {
    const cache = createMusicReadCache(10);
    await cache.read('library:a', OPTIONS, async () => 1);
    await cache.read('activity:a', OPTIONS, async () => 1);
    let finish!: (value: number) => void;
    mock.timers.tick(10_000);
    const running = cache.read(
      'library:b',
      OPTIONS,
      () =>
        new Promise<number>((resolve) => {
          finish = resolve;
        })
    );
    await new Promise((resolve) => setImmediate(resolve));
    cache.invalidate('library:');
    finish(5);
    assert.equal(await running, 5);
    assert.equal(await cache.read('library:a', OPTIONS, async () => 2), 2);
    assert.equal(await cache.read('library:b', OPTIONS, async () => 3), 3);
    // activity:a was not invalidated: its copy still answers a failing read
    assert.equal(
      await cache.read('activity:a', OPTIONS, async () => {
        throw new Error('Aurral down');
      }),
      1
    );
  });

  it('keeps only the answers its store filter accepts', async () => {
    const cache = createMusicReadCache(10);
    const options = { ...OPTIONS, store: (value: unknown) => value !== null };
    let calls = 0;
    const load = async () => {
      calls += 1;
      return calls === 1 ? null : 'cover';
    };
    assert.strictEqual(await cache.read('k', options, load), null);
    assert.strictEqual(await cache.read('k', options, load), 'cover');
    assert.strictEqual(await cache.read('k', options, load), 'cover');
    assert.strictEqual(calls, 2);
  });

  it('keeps at most maxEntries copies, dropping the oldest', async () => {
    const cache = createMusicReadCache(2);
    await cache.read('a', OPTIONS, async () => 'a1');
    await cache.read('b', OPTIONS, async () => 'b1');
    await cache.read('c', OPTIONS, async () => 'c1');
    assert.equal(await cache.read('a', OPTIONS, async () => 'a2'), 'a2');
    assert.equal(await cache.read('c', OPTIONS, async () => 'c2'), 'c1');
  });
});
