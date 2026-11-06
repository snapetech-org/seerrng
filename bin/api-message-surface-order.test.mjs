import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

// Windows and Unix do not promise identical directory enumeration order. The
// reviewed surface inventory must remain strict without depending on that order.
test('reviewed message inventory accepts reversed filesystem enumeration', () => {
  const scratch = mkdtempSync(join(tmpdir(), 'seerrng-message-order-'));
  try {
    const preload = join(scratch, 'reverse-readdir.cjs');
    writeFileSync(
      preload,
      `const fs = require('node:fs');
const original = fs.readdirSync;
fs.readdirSync = function (...args) {
  const entries = original.apply(this, args);
  return Array.isArray(entries) ? entries.reverse() : entries;
};\n`
    );
    const result = spawnSync(
      process.execPath,
      ['--require', preload, 'bin/check-api-message-surfaces.cjs'],
      {
        cwd: fileURLToPath(new URL('..', import.meta.url)),
        encoding: 'utf8',
        timeout: 60_000,
      }
    );
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /Reviewed message rendering surfaces: \d+\./);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});
