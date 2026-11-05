import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';

test('the custom test runner returns a failure status', async () => {
  const repoRoot = path.resolve(__dirname, '../..');
  const childEnvironment: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: 'test',
  };
  // Node marks test-runner children to prevent accidental recursive run()
  // calls. This subprocess intentionally starts an independent runner.
  delete childEnvironment['NODE_TEST_CONTEXT'];
  // Nested regression invocations must not overwrite the enclosing CI report.
  delete childEnvironment['CI'];
  const child = spawn(
    process.execPath,
    [
      path.join(repoRoot, 'server/test/index.mts'),
      path.join(repoRoot, 'server/test/fixtures/failing.test.fixture.ts'),
    ],
    {
      cwd: repoRoot,
      env: childEnvironment,
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );
  let output = '';
  child.stdout.on('data', (chunk) => {
    output += chunk.toString();
  });
  child.stderr.on('data', (chunk) => {
    output += chunk.toString();
  });

  const [code, signal] = (await once(child, 'exit')) as [
    number | null,
    NodeJS.Signals | null,
  ];

  assert.strictEqual(code, 1, output);
  assert.strictEqual(signal, null, output);
  assert.match(output, /intentional runner failure/);
});

test('the custom runner drains complete high-volume reports to every destination', async () => {
  const repoRoot = path.resolve(__dirname, '../..');
  const directory = await mkdtemp(path.join(tmpdir(), 'seerr-runner-report-'));
  const reportPath = path.join(directory, 'report.log');
  const childEnvironment: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: 'test',
  };
  delete childEnvironment['NODE_TEST_CONTEXT'];
  delete childEnvironment['CI'];
  const child = spawn(
    process.execPath,
    [
      path.join(repoRoot, 'server/test/index.mts'),
      path.join(repoRoot, 'server/test/fixtures/runner-report.fixture.ts'),
      '--coverage',
      '--test-reporter',
      'spec',
      '--test-reporter-destination',
      'stdout',
      '--test-reporter',
      'spec',
      '--test-reporter-destination',
      reportPath,
    ],
    { cwd: repoRoot, env: childEnvironment, stdio: ['ignore', 'pipe', 'pipe'] }
  );
  let output = '';
  child.stdout.on('data', (chunk) => {
    output += chunk.toString();
  });
  child.stderr.on('data', (chunk) => {
    output += chunk.toString();
  });
  const deadline = setTimeout(() => child.kill('SIGKILL'), 60000);
  try {
    const [code, signal] = await once(child, 'close');
    assert.equal(code, 0, output);
    assert.equal(signal, null, output);
    for (const report of [output, await readFile(reportPath, 'utf8')]) {
      assert.match(report, /suite 79/);
      assert.match(report, /tests 1600/);
      assert.match(report, /pass 1600/);
      assert.match(report, /fail 0/);
      assert.match(report, /duration_ms/);
      assert.match(report, /start of coverage report/);
    }
  } finally {
    clearTimeout(deadline);
    if (child.exitCode === null && child.signalCode === null) child.kill();
    await rm(directory, { recursive: true, force: true });
  }
});

test('the runner exits service workers but waits for asynchronous final reports', async () => {
  const repoRoot = path.resolve(__dirname, '../..');
  const childEnvironment: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: 'test',
  };
  delete childEnvironment['NODE_TEST_CONTEXT'];
  delete childEnvironment['CI'];
  const child = spawn(
    process.execPath,
    [
      path.join(repoRoot, 'server/test/index.mts'),
      path.join(repoRoot, 'server/test/fixtures/runner-report.fixture.ts'),
      '--test-reporter',
      pathToFileURL(
        path.join(repoRoot, 'server/test/fixtures/delayed-reporter.fixture.mjs')
      ).href,
    ],
    { cwd: repoRoot, env: childEnvironment, stdio: ['ignore', 'pipe', 'pipe'] }
  );
  let output = '';
  child.stdout.on('data', (chunk) => {
    output += chunk.toString();
  });
  child.stderr.on('data', (chunk) => {
    output += chunk.toString();
  });
  const deadline = setTimeout(() => child.kill('SIGKILL'), 60000);
  try {
    const [code, signal] = await once(child, 'close');
    assert.equal(code, 0, output);
    assert.equal(signal, null, output);
    assert.match(output, /Complete summary: 1600 tests; success=true/);
  } finally {
    clearTimeout(deadline);
    if (child.exitCode === null && child.signalCode === null) child.kill();
  }
});
