import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

test('the tracked tree excludes runtime crash reports and heap dumps', () => {
  const files = execFileSync('git', ['ls-files', '-z'], {
    cwd: fileURLToPath(new URL('../', import.meta.url)),
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  }).split('\0');
  const dumps = files.filter((file) =>
    /(?:^|\/)(?:hs_err_pid[^/]*\.log|replay_pid[^/]*\.log|[^/]*\.hprof)$/i.test(
      file
    )
  );
  assert.deepEqual(
    dumps,
    [],
    'Remove runtime diagnostics from the tracked tree.'
  );
});
