import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  BoundedTaskQueue,
  BoundedTaskQueueFullError,
  mapWithConcurrency,
  settlePromisesWithin,
} from './concurrency';

describe('mapWithConcurrency', () => {
  it('preserves order while bounding active work', async () => {
    let active = 0;
    let peak = 0;
    const releases: (() => void)[] = [];

    const resultPromise = mapWithConcurrency([1, 2, 3, 4, 5], 2, async (n) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise<void>((resolve) => releases.push(resolve));
      active--;
      return n * 2;
    });

    while (releases.length < 2) {
      await new Promise((resolve) => setImmediate(resolve));
    }
    while (releases.length > 0) {
      releases.shift()?.();
      await new Promise((resolve) => setImmediate(resolve));
    }

    assert.deepStrictEqual(await resultPromise, [2, 4, 6, 8, 10]);
    assert.strictEqual(peak, 2);
  });

  it('rejects invalid concurrency values', async () => {
    await assert.rejects(
      mapWithConcurrency([], 0, async () => undefined),
      /positive integer/
    );
  });
});

describe('settlePromisesWithin', () => {
  it('returns completed results when another promise exceeds the deadline', async () => {
    const result = await settlePromisesWithin(
      [Promise.resolve('available'), new Promise<string>(() => {})],
      5
    );

    assert.strictEqual(result.timedOut, true);
    assert.deepStrictEqual(result.results, [
      { status: 'fulfilled', value: 'available' },
    ]);
  });

  it('preserves rejection results when all promises settle before the deadline', async () => {
    const result = await settlePromisesWithin(
      [
        Promise.resolve('available'),
        Promise.reject(new Error('provider unavailable')),
      ],
      100
    );

    assert.strictEqual(result.timedOut, false);
    assert.strictEqual(result.results[0]?.status, 'fulfilled');
    assert.strictEqual(result.results[1]?.status, 'rejected');
  });
});

describe('settlePromisesWithin grace period', () => {
  const later = <T>(ms: number, value: T) =>
    new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));

  it('stops waiting for the rest a grace period after the primary promises', async () => {
    const started = Date.now();
    const result = await settlePromisesWithin(
      [later(5, 'primary'), later(2_000, 'slow')],
      5_000,
      { primary: [0], graceMs: 30 }
    );

    assert.ok(Date.now() - started < 1_000);
    assert.strictEqual(result.timedOut, true);
    assert.deepStrictEqual(result.results, [
      { status: 'fulfilled', value: 'primary' },
    ]);
  });

  it('keeps answers that arrive within the grace period', async () => {
    const result = await settlePromisesWithin(
      [later(5, 'primary'), later(15, 'quick')],
      5_000,
      { primary: [0], graceMs: 200 }
    );

    assert.strictEqual(result.timedOut, false);
    assert.deepStrictEqual(
      result.results.map(
        (entry) => entry.status === 'fulfilled' && entry.value
      ),
      ['primary', 'quick']
    );
  });

  it('still honors the overall deadline while a primary promise is pending', async () => {
    const result = await settlePromisesWithin(
      [new Promise<string>(() => undefined), later(5, 'other')],
      30,
      { primary: [0], graceMs: 10 }
    );

    assert.strictEqual(result.timedOut, true);
    assert.deepStrictEqual(result.results, [
      { status: 'fulfilled', value: 'other' },
    ]);
  });
});

describe('BoundedTaskQueue', () => {
  it('bounds active work and rejects tasks beyond queue capacity', async () => {
    const queue = new BoundedTaskQueue(2, 1);
    let active = 0;
    let maximumActive = 0;
    const releases: (() => void)[] = [];
    const task = (value: number) =>
      queue.run(
        () =>
          new Promise<number>((resolve) => {
            active += 1;
            maximumActive = Math.max(maximumActive, active);
            releases.push(() => {
              active -= 1;
              resolve(value);
            });
          })
      );

    const first = task(1);
    const second = task(2);
    const queued = task(3);
    await assert.rejects(task(4), BoundedTaskQueueFullError);
    assert.strictEqual(maximumActive, 2);

    releases.shift()?.();
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.strictEqual(maximumActive, 2);
    for (const release of releases) {
      release();
    }

    assert.deepStrictEqual(
      await Promise.all([first, second, queued]),
      [1, 2, 3]
    );
  });

  it('continues after synchronous and asynchronous task failures', async () => {
    const queue = new BoundedTaskQueue(1, 1);
    await assert.rejects(
      queue.run(async () => {
        throw new Error('first failed');
      }),
      /first failed/
    );
    await assert.rejects(
      queue.run(() => {
        throw new Error('second failed');
      }),
      /second failed/
    );
    assert.strictEqual(await queue.run(async () => 42), 42);
  });

  it('notifies coalesced idle waiters after active and queued work settles', async () => {
    const queue = new BoundedTaskQueue(1, 1);
    let releaseFirst: (() => void) | undefined;
    let releaseSecond: (() => void) | undefined;
    const first = queue.run(
      () =>
        new Promise<void>((resolve) => {
          releaseFirst = resolve;
        })
    );
    const second = queue.run(
      () =>
        new Promise<void>((resolve) => {
          releaseSecond = resolve;
        })
    );
    let idleNotifications = 0;
    const idle = Promise.all([queue.waitForIdle(), queue.waitForIdle()]).then(
      () => {
        idleNotifications += 1;
      }
    );

    for (let attempt = 0; attempt < 20 && !releaseFirst; attempt += 1) {
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
    assert.ok(releaseFirst, 'active task did not start');
    releaseFirst?.();
    await first;
    for (let attempt = 0; attempt < 20 && !releaseSecond; attempt += 1) {
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
    assert.strictEqual(idleNotifications, 0);
    assert.ok(releaseSecond, 'queued task did not start');
    releaseSecond?.();
    await Promise.all([second, idle]);
    assert.strictEqual(idleNotifications, 1);
    await queue.waitForIdle();
  });

  it('rejects invalid construction limits', () => {
    assert.throws(() => new BoundedTaskQueue(0, 1), /concurrency/);
    assert.throws(() => new BoundedTaskQueue(1, -1), /capacity/);
  });
});
