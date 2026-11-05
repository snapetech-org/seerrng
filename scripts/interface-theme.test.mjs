import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const command = fileURLToPath(
  new URL('./interface-theme.mjs', import.meta.url)
);
const sandbox = (t) => {
  const directory = mkdtempSync(path.join(tmpdir(), 'seerr-theme-author-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const options = {
    cwd: directory,
    env: { ...process.env, CONFIG_DIRECTORY: path.join(directory, 'config') },
    encoding: 'utf8',
  };
  return {
    directory,
    run: (...args) =>
      execFileSync(process.execPath, [command, ...args], options),
    reject: (...args) => {
      const result = spawnSync(process.execPath, [command, ...args], options);
      assert.notEqual(result.status, 0);
      return result.stderr;
    },
  };
};

test('creates an independent native Persius theme from outside the checkout', (t) => {
  const { directory, run } = sandbox(t);
  run(
    'create',
    'paper-cinema',
    '--name',
    'Paper Cinema',
    '--author',
    'Theme Author'
  );
  const manifest = JSON.parse(
    readFileSync(path.join(directory, 'paper-cinema/manifest.json'), 'utf8')
  );
  const css = readFileSync(
    path.join(directory, 'paper-cinema/theme.css'),
    'utf8'
  );
  assert.equal(manifest.id, 'paper-cinema');
  assert.equal(manifest.layout, 'persius');
  assert.equal(manifest.name, 'Paper Cinema');
  assert.equal(manifest.author, 'Theme Author');
  assert.match(css, /data-interface-theme='paper-cinema'/);
  assert.doesNotMatch(css, /data-interface-theme='persiusNG'/);
  assert.match(run('validate', 'paper-cinema'), /Valid:/);
});

test('classic bases remain supported; creation never overwrites an existing directory', (t) => {
  const { directory, run, reject } = sandbox(t);
  run('create', 'classic-paper', '--from', 'seerrOrig');
  assert.equal(JSON.parse(run('inspect', 'classic-paper')).layout, 'classic');
  const before = readFileSync(
    path.join(directory, 'classic-paper/theme.css'),
    'utf8'
  );
  reject('create', 'classic-paper');
  assert.equal(
    readFileSync(path.join(directory, 'classic-paper/theme.css'), 'utf8'),
    before
  );
  reject('create', 'persiusNG');
  reject('create', '../escape');
  reject('create', 'valid-id', '--from', 'not-installed');
  reject('create', 'valid-id', '--unknown');
  assert.equal(existsSync(path.join(directory, 'valid-id')), false);
});

test('packs reproducibly with a matching checksum and validates the distributable', (t) => {
  const { directory, run, reject } = sandbox(t);
  run('create', 'ocean-room');
  run('pack', 'ocean-room');
  const filename = 'ocean-room-0.1.0.seerrtheme';
  const bytes = readFileSync(path.join(directory, filename));
  const hash = createHash('sha256').update(bytes).digest('hex');
  assert.equal(
    readFileSync(path.join(directory, filename + '.sha256'), 'utf8'),
    `${hash}  ${filename}\n`
  );
  assert.match(run('validate', filename), /Valid: Ocean Room/);
  assert.equal(JSON.parse(run('inspect', filename)).sha256, hash);
  run('pack', 'ocean-room', 'second.seerrtheme');
  assert.deepEqual(
    readFileSync(path.join(directory, 'second.seerrtheme')),
    bytes
  );
  reject('pack', 'ocean-room');
  assert.deepEqual(readFileSync(path.join(directory, filename)), bytes);
});

test('installs, lists, explicitly replaces and removes a custom package', (t) => {
  const { directory, run, reject } = sandbox(t);
  run('create', 'custom-layout');
  run('pack', 'custom-layout');
  const filename = 'custom-layout-0.1.0.seerrtheme';
  run('install', filename);
  assert.equal(
    JSON.parse(run('list')).find((theme) => theme.id === 'custom-layout')
      ?.layout,
    'persius'
  );
  reject('install', filename);
  const source = path.join(directory, 'custom-layout/theme.css');
  writeFileSync(
    source,
    readFileSync(source, 'utf8') +
      "\n[data-interface-theme='custom-layout'] body { background: #030712; }\n"
  );
  run('pack', 'custom-layout', 'updated.seerrtheme');
  run('install', 'updated.seerrtheme', '--replace');
  assert.match(
    readFileSync(
      path.join(directory, 'config/interface-themes/custom-layout/theme.css'),
      'utf8'
    ),
    /#030712/
  );
  reject('uninstall', 'persiusNG');
  run('uninstall', 'custom-layout');
  assert.equal(
    JSON.parse(run('list')).some((theme) => theme.id === 'custom-layout'),
    false
  );
});

test('rejects unsafe CSS and unsupported composition before installing files', (t) => {
  const { directory, run, reject } = sandbox(t);
  run('create', 'broken-theme');
  run('pack', 'broken-theme');
  const filename = path.join(directory, 'broken-theme-0.1.0.seerrtheme');
  const bundle = JSON.parse(readFileSync(filename, 'utf8'));
  for (const update of [
    { css: 'body { display:none }' },
    { manifest: { ...bundle.manifest, layout: 'remote-script' } },
    {
      css: "[data-interface-theme='broken-theme'] body { background:url(https://example.invalid/asset); }",
    },
  ]) {
    writeFileSync(filename, JSON.stringify({ ...bundle, ...update }));
    reject('validate', filename);
    reject('install', filename);
    assert.equal(
      existsSync(path.join(directory, 'config/interface-themes/broken-theme')),
      false
    );
  }
});

test('protects an existing checksum when packing and exposes built-in metadata', (t) => {
  const { directory, run, reject } = sandbox(t);
  run('create', 'custom-pack');
  writeFileSync(path.join(directory, 'custom.seerrtheme.sha256'), 'keep this');
  reject('pack', 'custom-pack', 'custom.seerrtheme');
  assert.equal(existsSync(path.join(directory, 'custom.seerrtheme')), false);
  assert.equal(
    readFileSync(path.join(directory, 'custom.seerrtheme.sha256'), 'utf8'),
    'keep this'
  );
  const info = JSON.parse(run('inspect', 'persiusNG'));
  assert.equal(info.layout, 'persius');
  assert.ok(info.cssBytes > 0);
});
