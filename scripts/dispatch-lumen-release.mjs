import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function completedRelease(event, repository) {
  const run = event?.workflow_run;
  if (
    run?.name !== 'SeerrNG Release' ||
    run.conclusion !== 'success' ||
    run.event !== 'workflow_dispatch' ||
    run.head_branch !== 'main' ||
    run.head_repository?.full_name !== repository
  ) {
    return undefined;
  }
  const match = /^action:release:pool:public:tag:(v\d+\.\d+\.\d+)$/.exec(
    run.display_title ?? ''
  );
  if (!match || !/^[a-f0-9]{40}$/.test(run.head_sha ?? '')) return undefined;
  return { tag: match[1], sha: run.head_sha };
}

export function requirePublishedSource(
  candidate,
  release,
  tagSha,
  verifyAncestry = (source, head) =>
    assert.equal(source, head, 'Release source differs from completed run')
) {
  assert.equal(release.tagName, candidate.tag);
  assert.equal(release.isDraft, false);
  assert.equal(release.isPrerelease, false);
  assert.ok(release.publishedAt);
  assert.match(tagSha, /^[a-f0-9]{40}$/);
  verifyAncestry(tagSha, candidate.sha);
}

export function alreadyDispatched(runs, tag) {
  return runs.some(
    (run) =>
      run.displayTitle === `Lumen release ${tag}` &&
      (run.status !== 'completed' || run.conclusion === 'success')
  );
}

function main() {
  const repository = process.env.GITHUB_REPOSITORY;
  assert.match(repository ?? '', /^[\w.-]+\/[\w.-]+$/);
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
  const candidate = completedRelease(event, repository);
  if (!candidate) {
    console.log('No completed stable main release to dispatch.');
    return;
  }
  const gh = (...args) => execFileSync('gh', args, { encoding: 'utf8' }).trim();
  const git = (...args) =>
    execFileSync('git', args, { encoding: 'utf8' }).trim();
  const release = JSON.parse(
    gh(
      'release',
      'view',
      candidate.tag,
      '--repo',
      repository,
      '--json',
      'tagName,isDraft,isPrerelease,publishedAt'
    )
  );
  requirePublishedSource(
    candidate,
    release,
    git('rev-parse', `${candidate.tag}^{commit}`),
    (source, head) => git('merge-base', '--is-ancestor', source, head)
  );
  git('merge-base', '--is-ancestor', candidate.sha, 'origin/main');
  const runs = JSON.parse(
    gh(
      'run',
      'list',
      '--repo',
      repository,
      '--workflow',
      'lumen-release.yml',
      '--limit',
      '100',
      '--json',
      'displayTitle,status,conclusion'
    )
  );
  if (alreadyDispatched(runs, candidate.tag)) {
    console.log(`Lumen ${candidate.tag} is already published or in progress.`);
    return;
  }
  gh(
    'workflow',
    'run',
    'lumen-release.yml',
    '--repo',
    repository,
    '--ref',
    'main',
    '-f',
    `tag=${candidate.tag}`
  );
  console.log(
    `Dispatched Lumen for published ${candidate.tag} at ${candidate.sha}.`
  );
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main();
