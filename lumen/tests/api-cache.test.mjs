import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const moduleUrl = (source) =>
  `data:text/javascript,${encodeURIComponent(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText)}`;
const sessionUrl = moduleUrl(
  await readFile(new URL('../src/sessionState.ts', import.meta.url), 'utf8')
);
const session = await import(sessionUrl);
const source = (
  await readFile(new URL('../src/apiCache.ts', import.meta.url), 'utf8')
).replace("'./sessionState'", JSON.stringify(sessionUrl));
const cache = await import(moduleUrl(source));
const stored = new Map();
globalThis.localStorage = {
  getItem: (key) => stored.get(key) ?? null,
  setItem: (key, value) => stored.set(key, value),
  removeItem: (key) => stored.delete(key),
};

test('an open tab cannot keep serving cached answers after the one-day retention limit', (t) => {
  let now = 1_000_000;
  t.mock.method(Date, 'now', () => now);
  session.resetSessionState(1);
  t.after(() => session.resetSessionState(null));
  cache.remember('/movie/1', { title: 'First title' });
  assert.equal(cache.cached('/movie/1').title, 'First title');
  now += 24 * 60 * 60_000 + 1;
  assert.equal(cache.cached('/movie/1'), undefined);
  assert.equal(cache.isFresh('/movie/1'), false);
});

test('future-dated local storage cannot pin a supposedly fresh answer indefinitely', (t) => {
  t.mock.method(Date, 'now', () => 1_000_000);
  session.resetSessionState(null);
  stored.set(
    'lumen-cache:2',
    JSON.stringify([
      ['/movie/2', { at: 9_000_000_000, data: { title: 'Future title' } }],
    ])
  );
  session.resetSessionState(2);
  t.after(() => session.resetSessionState(null));
  assert.equal(cache.cached('/movie/2'), undefined);
  assert.equal(cache.isFresh('/movie/2'), false);
});

test('identical calls in flight share one answer', async (t) => {
  session.resetSessionState(3);
  t.after(() => session.resetSessionState(null));
  let calls = 0;
  const load = () =>
    new Promise((resolve) => setTimeout(() => resolve(++calls), 5));
  const answers = await Promise.all(
    Array.from({ length: 20 }, () => cache.shared('/settings/public', load))
  );
  assert.equal(calls, 1);
  assert.deepEqual(new Set(answers), new Set([1]));
  await cache.shared('/settings/public', load);
  assert.equal(calls, 2, 'a finished call is not reused by shared()');
});

test('always-checked answers are reused briefly, and asked again after a change', (t) => {
  let now = 5_000_000;
  t.mock.method(Date, 'now', () => now);
  session.resetSessionState(4);
  t.after(() => session.resetSessionState(null));
  cache.remember('/settings/public', { movie4kEnabled: true });
  assert.equal(cache.isFresh('/settings/public'), true);
  now += cache.RECHECK_MS + 1;
  assert.equal(cache.isFresh('/settings/public'), false);
  cache.remember('/request?take=40', { results: [] });
  cache.markAllStale();
  assert.equal(cache.isFresh('/request?take=40'), false);
});

test('the saved copy stays small and leaves out big lists', async (t) => {
  session.resetSessionState(5);
  t.after(() => session.resetSessionState(null));
  cache.remember('/request?take=500', { results: 'x'.repeat(300_000) });
  for (let i = 0; i < 140; i++)
    cache.remember(`/movie/${i}`, { overview: 'y'.repeat(12_000) });
  await new Promise((r) => setTimeout(r, 600));
  const saved = stored.get('lumen-cache:5');
  assert.ok(saved, 'something was saved');
  assert.ok(saved.length <= 1_000_000, `saved ${saved.length} chars`);
  const keys = JSON.parse(saved).map((e) => e[0]);
  assert.ok(!keys.includes('/request?take=500'));
  assert.ok(keys.includes('/movie/139'), 'newest answers are kept');
  assert.ok(
    cache.cached('/request?take=500'),
    'big list still served from memory'
  );
});
