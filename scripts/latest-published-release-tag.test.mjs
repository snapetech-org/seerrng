import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

test('selects the highest published stable version after an out-of-order release', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'latest-release-tag-'));
  t.after(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  execFileSync('git', ['init', '--quiet'], { cwd: directory });
  execFileSync('git', ['config', 'user.name', 'Release test'], {
    cwd: directory,
  });
  execFileSync(
    'git',
    ['config', 'user.email', 'release-test@example.invalid'],
    {
      cwd: directory,
    }
  );
  writeFileSync(join(directory, 'README.md'), 'release test\n');
  execFileSync('git', ['add', 'README.md'], { cwd: directory });
  execFileSync('git', ['commit', '--quiet', '-m', 'test'], { cwd: directory });
  for (const tag of ['v3.42.1', 'v3.45.3']) {
    execFileSync('git', ['tag', tag], { cwd: directory });
  }

  const fakeBin = join(directory, 'bin');
  mkdirSync(fakeBin);
  const fakeGh = join(fakeBin, 'gh');
  writeFileSync(fakeGh, '#!/bin/sh\nprintf "%s\\n" "$PUBLISHED_TAGS"\n');
  chmodSync(fakeGh, 0o755);

  const script = resolve('scripts/latest-published-release-tag.sh');
  const result = execFileSync('bash', [script], {
    cwd: directory,
    encoding: 'utf8',
    env: {
      ...process.env,
      GITHUB_REPOSITORY: 'snapetech-org/seerrng',
      PUBLISHED_TAGS: 'v3.42.1\nv3.45.3',
      PATH: `${fakeBin}:${process.env.PATH}`,
    },
  });

  assert.equal(result.trim(), 'v3.45.3');
});
