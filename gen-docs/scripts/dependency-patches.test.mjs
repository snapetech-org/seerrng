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
