import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const list = (...args) => {
  const result = spawnSync(
    process.execPath,
    ['server/test/index.mts', '--list', ...args],
    { cwd: root, encoding: 'utf8' }
  );
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
};
test('default native discovery includes production style MJS and excludes Vitest owners', () => {
  const files = list();
  for (const file of [
    'src/styles/cardSpacing.test.mjs',
    'src/styles/titleCardWatchlistActions.test.mjs',
    'server/routes/auth.test.ts',
    'server/test/native-discovery.test.mjs',
  ])
    assert.ok(files.includes(root + file), `missing native owner: ${file}`);
  assert.equal(new Set(files).size, files.length);
  assert.ok(!files.some((file) => file.endsWith('.vitest.test.ts')));
});
test('an explicit native selection does not broaden into the full suite', () => {
  assert.deepEqual(list('src/styles/cardSpacing.test.mjs'), [
    root + 'src/styles/cardSpacing.test.mjs',
  ]);
});
