import assert from 'node:assert/strict';
import test from 'node:test';

import {
  defaultToolingWorkers,
  parseToolingWorkers,
} from './run-tooling-tests.mjs';

test('keeps default tooling concurrency bounded by available parallelism', () => {
  assert.equal(defaultToolingWorkers(1), 1);
  assert.equal(defaultToolingWorkers(2), 2);
  assert.equal(defaultToolingWorkers(4), 2);
  assert.equal(defaultToolingWorkers(32), 2);
});

test('retains the explicit tooling worker override', () => {
  assert.equal(parseToolingWorkers(['--workers=1']), 1);
  assert.equal(parseToolingWorkers(['--workers=4']), 4);
});

test('rejects invalid available parallelism', () => {
  assert.throws(() => defaultToolingWorkers(0), /positive integer/);
  assert.throws(() => defaultToolingWorkers(Number.NaN), /positive integer/);
});
