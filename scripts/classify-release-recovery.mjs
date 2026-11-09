import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const sharedJobs = [
  'Validate main release tag',
  'Generate changelog',
  'Create draft release',
  'Publish multi-arch manifests',
  'Scan release image (linux/amd64)',
  'Scan release image (linux/arm64)',
  'Sign images and create SBOM attestations',
  'Build release assets / Validate release tag',
  ...[
    'linux x64',
    'linux arm64',
    'macos arm64',
    'macos x64',
    'windows x64',
    'windows arm64',
    'Android APK',
    'iOS Simulator release package',
    'optional Jellyfin plugin',
  ].map((name) => `Build release assets / Build ${name}`),
  'Build release assets / Upload release assets',
];
const artifactsRequired = [
  'seerrng-linux-x64',
  'seerrng-linux-arm64',
  'seerrng-macos-arm64',
  'seerrng-macos-x64',
  'seerrng-windows-x64',
  'seerrng-windows-arm64',
  'seerrng-android',
  'seerrng-ios-simulator',
  'seerrng-jellyfin-plugin',
];

export function latestExecutedJobs(jobs) {
  const selected = new Map();
  for (const job of [...jobs].sort(
    (a, b) =>
      (a.run_attempt ?? 0) - (b.run_attempt ?? 0) || (a.id ?? 0) - (b.id ?? 0)
  )) {
    if (job.conclusion === 'skipped' && selected.has(job.name)) continue;
    selected.set(job.name, job);
  }
  return [...selected.values()];
}

export function classifyRecovery({
  run,
  jobs,
  artifacts,
  repository,
  tag,
  releaseSha,
}) {
  assert.match(repository, /^[\w.-]+\/[\w.-]+$/);
  assert.match(tag, /^v[0-9][0-9A-Za-z._+-]{0,126}$/);
  assert.match(releaseSha, /^[a-f0-9]{40}$/);
  assert.equal(run.repository?.full_name, repository);
  assert.equal(run.path, '.github/workflows/release.yml');
  assert.equal(run.status, 'completed');
  assert.equal(run.conclusion, 'failure');
  assert.match(run.head_sha, /^[a-f0-9]{40}$/);
  assert(
    (run.event === 'push' &&
      run.head_branch === tag &&
      run.head_sha === releaseSha) ||
      (run.event === 'workflow_dispatch' &&
        run.head_branch === 'main' &&
        run.display_title === `action:release:pool:public:tag:${tag}`),
    'Previous run is not the matching trusted release'
  );
  jobs = latestExecutedJobs(jobs);
  const failed = jobs
    .filter((job) => job.conclusion === 'failure')
    .map((job) => job.name);
  assert.equal(failed.length, 1, 'Recovery requires exactly one failed stage');
  const reverify = failed[0] === 'Verify signatures and attestations';
  assert(
    reverify || failed[0] === 'Dispatch package channels',
    'Recovery supports completed assets with verifier or package-dispatch failure'
  );
  const required = [
    ...sharedJobs,
    ...(reverify ? [] : ['Verify signatures and attestations']),
  ];
  for (const name of required)
    assert(
      jobs.some((job) => job.name === name && job.conclusion === 'success'),
      `Required qualified stage missing: ${name}`
    );
  for (const name of artifactsRequired)
    assert(
      artifacts.some(
        (artifact) => artifact.name === name && artifact.expired === false
      ),
      `Required unexpired artifact missing: ${name}`
    );
  return {
    reverify_existing_image: reverify,
    reuse_windows_x64_artifact: true,
    reuse_windows_arm64_artifact: true,
  };
}

function main() {
  const repository = process.env.REPO,
    id = process.env.REUSE_FROM_RUN_ID,
    tag = process.env.RELEASE_TAG;
  assert.match(repository ?? '', /^[\w.-]+\/[\w.-]+$/);
  assert.match(id ?? '', /^\d+$/);
  const gh = (...args) => execFileSync('gh', args, { encoding: 'utf8' }).trim();
  const git = (...args) =>
    execFileSync('git', args, { encoding: 'utf8' }).trim();
  const releaseSha = git('rev-parse', `${tag}^{commit}`);
  const run = JSON.parse(gh('api', `repos/${repository}/actions/runs/${id}`));
  const jobs = JSON.parse(
    gh(
      'api',
      `repos/${repository}/actions/runs/${id}/jobs?filter=all&per_page=100`,
      '--paginate',
      '--slurp'
    )
  ).flatMap((page) => page.jobs);
  const artifacts = JSON.parse(
    gh(
      'api',
      `repos/${repository}/actions/runs/${id}/artifacts?per_page=100`,
      '--paginate',
      '--slurp'
    )
  ).flatMap((page) => page.artifacts);
  const result = classifyRecovery({
    run,
    jobs,
    artifacts,
    repository,
    tag,
    releaseSha,
  });
  git('merge-base', '--is-ancestor', releaseSha, run.head_sha);
  git('merge-base', '--is-ancestor', run.head_sha, 'origin/main');
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    Object.entries(result)
      .map(([key, value]) => `${key}=${value}\n`)
      .join('')
  );
  console.log(
    `Validated matching completed release assets; fresh image verification required: ${result.reverify_existing_image}`
  );
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main();
