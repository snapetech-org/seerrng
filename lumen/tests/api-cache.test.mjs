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
