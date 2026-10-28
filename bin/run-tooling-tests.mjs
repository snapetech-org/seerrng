import { spawnSync } from 'node:child_process';
import { availableParallelism } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { withGitBashOnPath } from './platform-tools.mjs';

export function parseToolingWorkers(args) {
  if (!Array.isArray(args) || args.some((arg) => typeof arg !== 'string'))
    throw new Error('Tooling options must be argument strings');
  if (args.length === 0) return undefined;
  if (args.length !== 1 || !/^--workers=[1-9]\d{0,2}$/.test(args[0]))
    throw new Error(
      'Tooling accepts only optional --workers=N (integer 1..256)'
    );
  const workers = Number(args[0].slice('--workers='.length));
  if (workers > 256)
    throw new Error('Tooling workers must be an integer 1..256');
  return workers;
}

const portableTests = [
  'bin/interface-theme-postgres-migration.test.mjs',
  'bin/check-current-batch-contract-lib.test.mjs',
  'bin/check-i18n-lib.test.mjs',
  'bin/extract-messages-lib.test.mjs',
  'bin/check-pr-template.test.mjs',
  'bin/check-refreshed-ui-style-lib.test.mjs',
  'bin/duplicate-detector/index.test.mjs',
  'bin/duplicate-detector/triage.test.mjs',
  'scripts/brace-expansion.security.test.mjs',
  'scripts/android-workflow.test.mjs',
  'scripts/commit-message-prompt.test.mjs',
  'scripts/dev-server.test.mjs',
  'scripts/eslint/formatjs-no-offset.test.mjs',
  'scripts/eslint/nextjs-rules.test.mjs',
  'scripts/chart-workflow.test.mjs',
  'scripts/check-container-security.test.mjs',
  'scripts/bookshelf-media-move.test.mjs',
  'scripts/setup-assistant.test.mjs',
  'scripts/backissue-service.test.mjs',
  'scripts/check-helm-security.test.mjs',
  'scripts/check-workflow-boundaries.test.mjs',
  'scripts/update-helm-release-metadata.test.mjs',
  'scripts/release-notes.test.mjs',
  'scripts/latest-published-release-tag.test.mjs',
  'scripts/setup-gh-cli-action.test.mjs',
  'scripts/release-workflow.test.mjs',
  'scripts/watch-github-run.test.mjs',
  'scripts/wait-for-launchpad-ppa.test.mjs',
  'scripts/replace-server-import-aliases.test.mjs',
  'scripts/verify-container-manifest.test.mjs',
  'packaging/unraid/unraid-template.test.mjs',
];

const posixOnlyTests = [
  'deploy/bookshelf-hardcover-migration.test.mjs',
  'deploy/bookshelf-migration-lab.test.mjs',
  'deploy/seerrng-migrate.test.mjs',
  'deploy/install-bookshelf-backend.test.mjs',
  'deploy/migrate-bookshelf-to-chaptarrng.test.mjs',
  'packaging/scripts/aur-scripts.test.mjs',
  'packaging/smoke/package-smoke.test.mjs',
  'scripts/build-release-assets.test.mjs',
  'scripts/relink-plex-from-local-preferences.test.mjs',
  'scripts/store-copr-kerberos-openbao.test.mjs',
  'scripts/verify-live-deployment.test.mjs',
];

const tests =
  process.platform === 'win32'
    ? portableTests
    : [...portableTests, ...posixOnlyTests];

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const workers =
    parseToolingWorkers(process.argv.slice(2)) ??
    Math.max(1, Math.min(8, availableParallelism()));

  if (process.platform === 'win32') {
    console.log(
      `Windows validation: running ${portableTests.length} portable tooling suites; ` +
        `${posixOnlyTests.length} POSIX filesystem/deployment suites remain mandatory in Linux CI.`
    );
  }

  const result = spawnSync(
    process.execPath,
    [
      '--test',
      '--test-reporter=tap',
      `--test-concurrency=${workers}`,
      ...tests,
    ],
    {
      env: withGitBashOnPath(),
      stdio: 'inherit',
      windowsHide: true,
    }
  );

  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  process.exit(result.status ?? 1);
}
