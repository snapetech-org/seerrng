// Runs unit tests using the `node:test` runner.

import { Command, Option } from 'commander';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { glob, readFile } from 'node:fs/promises';
import { availableParallelism, tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setIsolatedTestEnvironment } from './test-environment.mjs';

const resolveImport = (specifier: string) =>
  fileURLToPath(import.meta.resolve(specifier));
const BASE_DIR = join(import.meta.dirname, '../..');
const isVitestFile = async (file: string) => {
  if (file.endsWith('.vitest.test.ts')) return true;
  const source = await readFile(file, 'utf8');
  return /\bfrom\s*['"]vitest['"]|\bimport\s*(?:\(\s*)?['"]vitest['"]/.test(
    source
  );
};

const program = new Command();
const parseTestConcurrency = (value: string) => {
  const workers = Number(value);
  if (!Number.isSafeInteger(workers) || workers < 1 || workers > 256)
    throw new Error('Test concurrency must be an integer between 1 and 256');
  return workers;
};

program
  .name('test')
  .argument('[file...]', 'Test file(s) to run (default: all)')
  .option(
    '-m, --test-name-pattern <pattern>',
    'Run tests matching the given pattern',
    (v, acc: string[]) => [...acc, v],
    [] as string[]
  )
  .option(
    '--test-reporter <reporter>',
    'Test reporter to use (repeatable)',
    (v, acc: string[]) => [...acc, v],
    [] as string[]
  )
  .option(
    '--test-reporter-destination <dest>',
    'Test reporter destination: stdout, stderr, or a file path (repeatable)',
    (v, acc: string[]) => [...acc, v],
    [] as string[]
  )
  .option(
    '--coverage, --experimental-test-coverage',
    'Enable code coverage collection'
  )
  .option(
    '--test-concurrency <workers>',
    'Maximum number of isolated test files to run concurrently',
    parseTestConcurrency
  )
  // ignore additional options passed by vscode test runner
  .addOption(new Option('--test').hideHelp())
  .parse();

const positionals: string[] = program.args;
const isFullSuite = positionals.length === 0;
const runningInCi = process.env.CI !== undefined;
const opts = program.opts<{
  testNamePattern: string[];
  testReporter: string[];
  testReporterDestination: string[];
  experimentalTestCoverage: boolean;
  testConcurrency?: number;
}>();

let files: string[];

if (positionals.length > 0) {
  files = positionals.map((f) => resolve(f));
} else {
  files = [];
  for await (const entry of glob(join(BASE_DIR, 'server/**/*.test.ts'))) {
    if (!(await isVitestFile(entry))) {
      files.push(resolve(entry));
    }
  }
  for await (const entry of glob(join(BASE_DIR, 'src/**/*.test.ts'))) {
    if (!(await isVitestFile(entry))) {
      files.push(resolve(entry));
    }
  }
  files.sort();
}

// @ts-expect-error Node's test runner needs this explicit test environment.
process.env.NODE_ENV = 'test';
const testConcurrency =
  opts.testConcurrency ?? Math.max(1, Math.min(8, availableParallelism()));
const testConfigDirectory = mkdtempSync(
  join(tmpdir(), 'seerrng-node-test-config-')
);
setIsolatedTestEnvironment(testConfigDirectory, process.env, {
  includeCi: runningInCi,
});
process.on('exit', () => {
  rmSync(testConfigDirectory, { force: true, recursive: true });
});
// configure ts
process.env.TS_NODE_PROJECT = resolveImport('../tsconfig.json');
process.env.TS_NODE_FILES = 'true';

// Delegate reporting and shutdown to Node's CLI. Manually composing reporters
// around run() can return zero with a truncated report after a large run. The
// CLI owns reporter completion, worker shutdown and the aggregate exit status.
const args = [
  '--test',
  '--test-isolation=process',
  '--test-force-exit',
  '--experimental-test-module-mocks',
  `--test-concurrency=${testConcurrency}`,
  '--require',
  resolveImport('./worker-bootstrap.cjs'),
];
if (opts.experimentalTestCoverage) {
  args.push(
    '--experimental-test-coverage',
    `--test-coverage-exclude=${join(BASE_DIR, 'server/test/**')}`,
    `--test-coverage-exclude=${join(BASE_DIR, 'server/migration/**')}`
  );
}
for (const pattern of opts.testNamePattern) {
  args.push('--test-name-pattern', pattern);
}
const addReporter = (reporter: string, destination: string) => {
  args.push(
    '--test-reporter',
    reporter,
    '--test-reporter-destination',
    destination === 'stdout' || destination === 'stderr'
      ? destination
      : resolve(destination)
  );
};

// A failed assertion or test file sets the final exit status but does not stop
// the remaining files. Preserve a complete, human-readable local report for a
// full-suite run so every failure from the pass can be reviewed together.
if (isFullSuite && !runningInCi) {
  const reportDirectory = join(BASE_DIR, 'artifacts', 'test-results');
  const reportTimestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = join(reportDirectory, `unit-tests-${reportTimestamp}.log`);
  mkdirSync(reportDirectory, { recursive: true });
  addReporter('spec', reportPath);
  console.log(`Full test report: ${reportPath}`);
}

// In CI, write a JUnit report to a file for use by GitHub
if (runningInCi) {
  addReporter('junit', join(BASE_DIR, 'report.xml'));
}

if (opts.testReporter.length > 0) {
  for (let i = 0; i < opts.testReporter.length; i++) {
    addReporter(
      opts.testReporter[i],
      opts.testReporterDestination[i] ?? 'stdout'
    );
  }
} else {
  addReporter('spec', 'stdout');
}

// Relative file arguments keep a full checkout below Windows' command-line
// length limit while preserving each test file's own isolated process.
const child = spawn(
  process.execPath,
  [...args, '--', ...files.map((file) => relative(BASE_DIR, file))],
  {
    cwd: BASE_DIR,
    env: process.env,
    stdio: 'inherit',
  }
);
const interrupt = () => child.kill('SIGINT');
const terminate = () => child.kill('SIGTERM');
process.on('SIGINT', interrupt);
process.on('SIGTERM', terminate);
try {
  const [code, signal] = await once(child, 'close');
  process.exitCode =
    code ?? (signal === 'SIGINT' ? 130 : signal === 'SIGTERM' ? 143 : 1);
} finally {
  process.off('SIGINT', interrupt);
  process.off('SIGTERM', terminate);
}
