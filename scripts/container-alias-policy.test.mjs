import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
const project = fileURLToPath(new URL('../', import.meta.url));
function check(mutate) {
  const scratch = mkdtempSync(
    join(process.env.TMPDIR ?? tmpdir(), 'seerrng-alias-policy-')
  );
  try {
    for (const file of [
      '.github/workflows/release.yml',
      '.github/workflows/ci.yml',
      '.github/workflows/promote-container-aliases.yml',
      'scripts/promote-container-aliases.sh',
    ]) {
      mkdirSync(join(scratch, file, '..'), { recursive: true });
      copyFileSync(join(project, file), join(scratch, file));
    }
    const file = join(scratch, '.github/workflows/release.yml');
    writeFileSync(file, mutate(readFileSync(file, 'utf8')));
    return spawnSync(
      process.execPath,
      [join(project, 'scripts/check-container-alias-policy.mjs')],
      { cwd: scratch, encoding: 'utf8' }
    );
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}
function changePromotion(source, replace) {
  const a = source.indexOf('\n  promote-stable-container-aliases:\n'),
    b = source.indexOf('\n  dispatch-chocolatey:\n', a);
  return source.slice(0, a) + replace(source.slice(a, b)) + source.slice(b);
}
test('alias promotion accepts its publication dependency plus additional validation', () => {
  const r = check((x) => x);
  assert.equal(r.status, 0, r.stderr);
});
test('alias promotion accepts dependency reordering', () => {
  const r = check((x) =>
    changePromotion(x, (s) =>
      s.replace(
        'needs: [validate-main-tag, publish-release]',
        'needs: [publish-release, validate-main-tag]'
      )
    )
  );
  assert.equal(r.status, 0, r.stderr);
});
test('another job publication dependency cannot hide an ungated alias promotion', () => {
  const r = check(
    (x) =>
      changePromotion(x, (s) =>
        s.replace(
          'needs: [validate-main-tag, publish-release]',
          'needs: [validate-main-tag]'
        )
      ) + '\n  other:\n    needs: [publish-release]\n'
  );
  assert.equal(r.status, 1);
  assert.match(r.stderr, /only after release publication/);
});
test('an absent publication dependency fails closed', () => {
  const r = check((x) =>
    changePromotion(x, (s) =>
      s.replace('needs: [validate-main-tag, publish-release]', 'needs: [sign]')
    )
  );
  assert.equal(r.status, 1);
  assert.match(r.stderr, /only after release publication/);
});
