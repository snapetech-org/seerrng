// Runs unit tests using the `node:test` runner.

import { Command, Option } from 'commander';
import { createWriteStream, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { glob, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { run } from 'node:test';
import * as reporters from 'node:test/reporters';
import { fileURLToPath } from 'node:url';
// eslint-disable-next-line no-relative-import-paths/no-relative-import-paths -- Native test runner bootstrap cannot resolve application aliases.
import { setIsolatedTestEnvironment } from '../../tools/validation-engine/runtime/test-environment.mjs';

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

const stream = run({
  files,
  // Test files share the singleton application DataSource. Running files in
  // parallel races schema resets and causes nested SQLite transactions.
  concurrency: 1,
  execArgv: [
    '--experimental-test-module-mocks',
    '-r',
    'ts-node/register',
    '-r',
    'tsconfig-paths/register',
    '-r',
    resolveImport('./setup.ts'),
  ],
  coverage: opts.experimentalTestCoverage,
  coverageExcludeGlobs: [
    join(BASE_DIR, 'server/test/**'),
    join(BASE_DIR, 'server/migration/**'),
  ],
  testNamePatterns: opts.testNamePattern,
  // ensure test process doesn't hang when tests fail
  forceExit: true,
});

// A failed assertion or test file sets the final exit status but does not stop
// the remaining files. Preserve a complete, human-readable local report for a
// full-suite run so every failure from the pass can be reviewed together.
if (isFullSuite && !runningInCi) {
  const reportDirectory = join(BASE_DIR, 'artifacts', 'test-results');
  const reportTimestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = join(reportDirectory, `unit-tests-${reportTimestamp}.log`);
  mkdirSync(reportDirectory, { recursive: true });
  stream.compose(reporters.spec).pipe(createWriteStream(reportPath));
  console.log(`Full test report: ${reportPath}`);
}

// Unlike `node --test`, the programmatic runner does not set a failing process
// status for us. Propagate any failed test file, assertion, or compilation to
// callers and CI.
stream.on('test:fail', () => {
  process.exitCode = 1;
});

// In CI, write a JUnit report to a file for use by GitHub
if (runningInCi) {
  const reportStream = createWriteStream(join(BASE_DIR, 'report.xml'));
  stream.compose(reporters.junit).pipe(reportStream);
}

if (opts.testReporter.length > 0) {
  for (let i = 0; i < opts.testReporter.length; i++) {
    const reporterName = opts.testReporter[i];
    // check built-in reporters, otherwise import
    const reporter =
      reporterName in reporters
        ? reporters[reporterName as keyof typeof reporters]
        : await import(reporterName).then((m) => m.default);

    if (reporter == null) {
      console.error('Invalid test reporter: ', reporterName);
      process.exit(1);
    }

    const destArg = opts.testReporterDestination[i];
    const dest =
      destArg === 'stdout' || destArg == null
        ? process.stdout
        : destArg === 'stderr'
          ? process.stderr
          : createWriteStream(destArg);

    stream.compose(reporter).pipe(dest);
  }
} else {
  stream.compose(reporters.spec).pipe(process.stdout);
}
