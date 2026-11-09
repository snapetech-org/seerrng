import { load } from 'js-yaml';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  classifyRecovery,
  latestExecutedJobs,
} from './classify-release-recovery.mjs';
const fixture = () => ({
  repository: 'snapetech-org/seerrng',
  tag: 'v3.72.25',
  releaseSha: 'b'.repeat(40),
  run: {
    repository: { full_name: 'snapetech-org/seerrng' },
    path: '.github/workflows/release.yml',
    status: 'completed',
    conclusion: 'failure',
    event: 'workflow_dispatch',
    head_branch: 'main',
    head_sha: 'b'.repeat(40),
    display_title: 'action:release:pool:public:tag:v3.72.25',
  },
  jobs: [
    ...[
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
      ].map((x) => `Build release assets / Build ${x}`),
      'Build release assets / Upload release assets',
    ].map((name) => ({ name, conclusion: 'success' })),
    { name: 'Verify signatures and attestations', conclusion: 'failure' },
  ],
  artifacts: [
    'linux-x64',
    'linux-arm64',
    'macos-arm64',
    'macos-x64',
    'windows-x64',
    'windows-arm64',
    'android',
    'ios-simulator',
    'jellyfin-plugin',
  ].map((x) => ({ name: 'seerrng-' + x, expired: false })),
});
test('completed signed/scanned assets permit verifier recovery only with fresh cryptographic verification', () => {
  assert.equal(classifyRecovery(fixture()).reverify_existing_image, true);
});
test('package recovery requires earlier successful signature verification', () => {
  const f = fixture();
  f.jobs.at(-1).conclusion = 'success';
  f.jobs.push({ name: 'Dispatch package channels', conclusion: 'failure' });
  assert.equal(classifyRecovery(f).reverify_existing_image, false);
  f.jobs.at(-2).conclusion = 'skipped';
  assert.throws(() => classifyRecovery(f));
});
test('each required scan, signature, native platform and upload must have succeeded', () => {
  for (let i = 0; i < fixture().jobs.length - 1; i++) {
    const f = fixture();
    f.jobs[i].conclusion = 'skipped';
    assert.throws(() => classifyRecovery(f), f.jobs[i].name);
  }
});
test('every mandatory artifact must exist and remain unexpired', () => {
  for (let i = 0; i < fixture().artifacts.length; i++) {
    const f = fixture();
    f.artifacts[i].expired = true;
    assert.throws(() => classifyRecovery(f), f.artifacts[i].name);
  }
  const f = fixture();
  f.artifacts.pop();
  assert.throws(() => classifyRecovery(f));
});
test('rejects incomplete, unrelated, wrong-tag, fork and multiple-failure runs', () => {
  for (const patch of [
    { status: 'in_progress' },
    { conclusion: 'success' },
    { repository: { full_name: 'attacker/seerrng' } },
    { path: '.github/workflows/untrusted.yml' },
    { event: 'pull_request' },
    { head_branch: 'feature' },
    { display_title: 'action:release:pool:public:tag:v3.72.24' },
  ]) {
    const f = fixture();
    Object.assign(f.run, patch);
    assert.throws(() => classifyRecovery(f));
  }
  const f = fixture();
  f.jobs.push({ name: 'Something Else', conclusion: 'failure' });
  assert.throws(() => classifyRecovery(f));
});
test('legacy tag-triggered runs must match the exact release commit', () => {
  const f = fixture();
  Object.assign(f.run, { event: 'push', head_branch: f.tag });
  assert.equal(classifyRecovery(f).reverify_existing_image, true);
  f.run.head_sha = 'c'.repeat(40);
  assert.throws(() => classifyRecovery(f));
});
test('local actions are checked out at their used path with sibling verification helpers available', () => {
  const workflow = load(readFileSync('.github/workflows/release.yml', 'utf8'));
  for (const [name, job] of Object.entries(workflow.jobs)) {
    if (!job.steps) continue;
    const checkouts = [];
    for (const step of job.steps) {
      if (step.uses?.startsWith('actions/checkout@')) checkouts.push(step);
      if (!step.uses?.startsWith('./')) continue;
      const target = step.uses.slice(2);
      const matches = checkouts.filter(
        (x) => !x.with?.path || target.startsWith(x.with.path + '/')
      );
      assert(matches.length, `${name}: ${target} has no checkout`);
      const checkout = matches.at(-1),
        prefix = checkout.with?.path ? checkout.with.path + '/' : '';
      const relative = target.slice(prefix.length);
      assert(
        existsSync(relative + '/action.yml'),
        `${name}: ${relative} missing`
      );
      const sparse = checkout.with?.['sparse-checkout'];
      if (sparse)
        assert(
          sparse
            .split(/\s+/)
            .some((p) => relative === p || relative.startsWith(p + '/')),
          `${name}: sparse checkout omits ${relative}`
        );
    }
  }
});
test('verifier recovery cannot publish or dispatch packages without fresh verification', () => {
  const w = load(readFileSync('.github/workflows/release.yml', 'utf8'));
  for (const name of ['publish-release', 'dispatch-package-channels']) {
    assert.match(w.jobs[name].if, /reverify_existing_image/);
    assert.match(w.jobs[name].if, /needs\.verify\.result == 'success'/);
  }
  assert.match(w.jobs.verify.if, /needs\.publish\.result == 'success'/);
  assert.match(w.jobs.verify.if, /reverify_existing_image/);
});

test('a targeted retry uses the newest executed job and never masks a fresh failure with an old success', () => {
  const original = {
    name: 'iOS',
    id: 1,
    run_attempt: 1,
    conclusion: 'failure',
  };
  const retry = { name: 'iOS', id: 2, run_attempt: 2, conclusion: 'success' };
  assert.deepEqual(latestExecutedJobs([retry, original]), [retry]);
  const skipped = { ...retry, id: 3, run_attempt: 3, conclusion: 'skipped' };
  assert.deepEqual(latestExecutedJobs([skipped, original]), [original]);
  const failed = { ...retry, id: 4, run_attempt: 4, conclusion: 'failure' };
  assert.deepEqual(latestExecutedJobs([failed, retry, original]), [failed]);
});
