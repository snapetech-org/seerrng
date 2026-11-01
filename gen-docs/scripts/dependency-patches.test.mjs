import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const require = createRequire(import.meta.url);
const docusaurusRequire = createRequire(
  require.resolve('@docusaurus/core/package.json')
);
const { Globby } = docusaurusRequire('@docusaurus/utils');
const { match } = docusaurusRequire(
  'http-proxy-middleware/dist/context-matcher.js'
);
const presetRequire = createRequire(
  require.resolve('@docusaurus/preset-classic/package.json')
);
const pluginSvgrRequire = createRequire(
  presetRequire.resolve('@docusaurus/plugin-svgr/package.json')
);
const webpackRequire = createRequire(
  pluginSvgrRequire.resolve('@svgr/webpack/package.json')
);
const svgoRequire = createRequire(
  webpackRequire.resolve('@svgr/plugin-svgo/package.json')
);
const deepmerge = svgoRequire('deepmerge');

const assertNoDocsPrototypePoisoning = (value) => {
  assert.equal(Object.getPrototypeOf(value), Object.prototype);
  assert.equal(Object.hasOwn(value, '__proto__'), false);
  assert.equal(value.seerrngDocsPolluted, undefined);
  assert.equal({}.seerrngDocsPolluted, undefined);
};

test('patched deepmerge rejects prototype keys in all docs build merge paths', () => {
  const source = JSON.parse('{"__proto__":{"seerrngDocsPolluted":true}}');
  const nullTargetResult = deepmerge(Object.create(null), source);
  const nestedNullResult = deepmerge(
    { session: null },
    JSON.parse('{"session":{"__proto__":{"seerrngDocsPolluted":true}}}')
  );
  const ownTargetResult = deepmerge(
    JSON.parse('{"__proto__":{"seerrngDocsPolluted":true}}'),
    {}
  );
  const arrayCloneResult = deepmerge([], [source]);

  assertNoDocsPrototypePoisoning(nullTargetResult);
  assertNoDocsPrototypePoisoning(nestedNullResult.session);
  assertNoDocsPrototypePoisoning(ownTargetResult);
  assertNoDocsPrototypePoisoning(arrayCloneResult[0]);
});

test('patched Docusaurus Globby preserves directory expansion and ignore options', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'seerrng-glob-patch-'));
  try {
    await mkdir(path.join(root, 'docs', 'nested'), { recursive: true });
    await mkdir(path.join(root, 'docs', 'private'), { recursive: true });
    await writeFile(path.join(root, 'docs', 'guide.md'), 'guide');
    await writeFile(
      path.join(root, 'docs', 'nested', 'reference.mdx'),
      'reference'
    );
    await writeFile(path.join(root, 'docs', 'private', 'secret.md'), 'secret');
    await writeFile(path.join(root, 'docs', 'notes.txt'), 'notes');

    const expanded = await Globby('docs', {
      cwd: root,
      expandDirectories: ['**/*.{md,mdx}'],
      ignore: ['**/private/**'],
    });

    assert.deepEqual(expanded.sort(), [
      'docs/guide.md',
      'docs/nested/reference.mdx',
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('patched proxy middleware matches glob paths and strips query strings', () => {
  assert.equal(
    match('/api/**', 'https://example.test/api/users/42?include=profile'),
    true
  );
  assert.equal(match('/api/*', 'https://example.test/api/users/42'), false);
  assert.equal(
    match('/api/**', 'https://example.test/private/users/42?include=profile'),
    false
  );
});
