import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { it } from 'node:test';
import { runInNewContext } from 'node:vm';

const createHarness = async (pathname: string, status?: number) => {
  const listeners = new Map<string, () => void>();
  const replacements: string[] = [];
  const timers: number[] = [];
  let reloads = 0;
  const html = readFileSync(
    resolve(__dirname, '../../../public/offline.html'),
    'utf8'
  );
  assert.match(html, /<script src="\/offline-recovery\.js" defer><\/script>/);
  for (const script of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
    assert.equal(
      script[1].trim(),
      '',
      'offline recovery must not need unsafe-inline'
    );
  }
  const source = readFileSync(
    resolve(__dirname, '../../../public/offline-recovery.js'),
    'utf8'
  );
  runInNewContext(source, {
    document: {
      querySelector: () => ({
        addEventListener: (event: string, handler: () => void) =>
          listeners.set(event, handler),
      }),
    },
    window: {
      location: {
        pathname,
        reload: () => reloads++,
        replace: (path: string) => replacements.push(path),
      },
      addEventListener: (event: string, handler: () => void) =>
        listeners.set(event, handler),
      setTimeout: (_handler: () => void, delay: number) => timers.push(delay),
    },
    fetch: async () => {
      if (status === undefined) throw new Error('Network unavailable');
      return { status };
    },
  });
  await new Promise((resolve) => setImmediate(resolve));
  return { listeners, replacements, timers, reloads: () => reloads };
};

it('returns direct offline-page visits home when the server recovers', async () => {
  const result = await createHarness('/offline.html', 200);
  assert.deepEqual(result.replacements, ['/']);
  assert.equal(result.reloads(), 0);
  assert.deepEqual(result.timers, []);
});

it('reloads the original route when offline HTML is a worker fallback', async () => {
  const result = await createHarness('/discover/movies', 200);
  assert.deepEqual(result.replacements, []);
  assert.equal(result.reloads(), 1);
});

for (const status of [undefined, 503]) {
  it(`waits without navigating while the server is unavailable (${status})`, async () => {
    const result = await createHarness('/offline.html', status);
    assert.deepEqual(result.replacements, []);
    assert.equal(result.reloads(), 0);
    assert.deepEqual(result.timers, [2500]);
  });
}

it('uses the same recovery target for the manual Reload control', async () => {
  const result = await createHarness('/offline.html');
  result.listeners.get('click')?.();
  assert.deepEqual(result.replacements, ['/']);
  assert.equal(result.reloads(), 0);
});

it('preserves the original route when connectivity returns', async () => {
  const result = await createHarness('/requests');
  result.listeners.get('online')?.();
  assert.equal(result.reloads(), 1);
  assert.deepEqual(result.replacements, []);
});
