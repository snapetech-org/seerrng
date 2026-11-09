import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  alreadyDispatched,
  completedRelease,
  requirePublishedSource,
} from './dispatch-lumen-release.mjs';
const repository = 'snapetech-org/seerrng';
const sha = 'b'.repeat(40);
const event = () => ({
  workflow_run: {
    name: 'action:release:pool:public:tag:v3.72.25',
    path: '.github/workflows/release.yml',
    conclusion: 'success',
    event: 'workflow_dispatch',
    head_branch: 'main',
    head_repository: { full_name: repository },
    display_title: 'action:release:pool:public:tag:v3.72.25',
    head_sha: sha,
  },
});
const release = () => ({
  tagName: 'v3.72.25',
  isDraft: false,
  isPrerelease: false,
  publishedAt: '2026-11-08T00:00:00Z',
});
test('selects the completed stable release source, not the workflow default-branch SHA', () => {
  assert.deepEqual(completedRelease(event(), repository), {
    tag: 'v3.72.25',
    sha,
  });
});
test('rejects fork, PR, failed, cancelled, alternate branch and unrelated workflow events', () => {
  for (const change of [
    { head_repository: { full_name: 'attacker/seerrng' } },
    { event: 'pull_request' },
    { conclusion: 'failure' },
    { conclusion: 'cancelled' },
    { head_branch: 'feature' },
    { path: '.github/workflows/untrusted-release.yml' },
  ]) {
    const data = event();
    Object.assign(data.workflow_run, change);
    assert.equal(completedRelease(data, repository), undefined);
  }
});
test('rejects prerelease and shell-like titles and malformed source hashes', () => {
  for (const title of [
    'action:release:pool:public:tag:v3.72.25-rc1',
    'action:release:pool:public:tag:v3.72.25;echo bad',
    'action:ci:pool:public:tag:v3.72.25',
  ]) {
    const data = event();
    data.workflow_run.display_title = title;
    assert.equal(completedRelease(data, repository), undefined);
  }
  const data = event();
  data.workflow_run.head_sha = 'main';
  assert.equal(completedRelease(data, repository), undefined);
});
test('requires published stable metadata and the exact tagged completed source', () => {
  const candidate = completedRelease(event(), repository);
  assert.doesNotThrow(() => requirePublishedSource(candidate, release(), sha));
  for (const change of [
    { tagName: 'v3.72.24' },
    { isDraft: true },
    { isPrerelease: true },
    { publishedAt: null },
  ])
    assert.throws(() =>
      requirePublishedSource(candidate, { ...release(), ...change }, sha)
    );
  assert.throws(() =>
    requirePublishedSource(candidate, release(), 'c'.repeat(40))
  );
});
test('does not duplicate a successful or active same-tag publication but permits failed-run recovery', () => {
  const title = 'Lumen release v3.72.25';
  for (const status of ['queued', 'in_progress', 'pending', 'waiting'])
    assert(alreadyDispatched([{ displayTitle: title, status }], 'v3.72.25'));
  assert(
    alreadyDispatched(
      [{ displayTitle: title, status: 'completed', conclusion: 'success' }],
      'v3.72.25'
    )
  );
  assert(
    !alreadyDispatched(
      [{ displayTitle: title, status: 'completed', conclusion: 'failure' }],
      'v3.72.25'
    )
  );
  assert(
    !alreadyDispatched(
      [
        {
          displayTitle: 'Lumen release v3.72.23',
          status: 'completed',
          conclusion: 'success',
        },
      ],
      'v3.72.25'
    )
  );
});

test('workflow-only recovery may publish an older immutable tag only when git verifies its ancestry in the completed trusted run', () => {
  const candidate = completedRelease(event(), repository),
    tagSha = 'a'.repeat(40);
  let checked;
  requirePublishedSource(candidate, release(), tagSha, (source, head) => {
    checked = [source, head];
  });
  assert.deepEqual(checked, [tagSha, sha]);
  assert.throws(() =>
    requirePublishedSource(candidate, release(), tagSha, () => {
      throw new Error('unrelated history');
    })
  );
});
