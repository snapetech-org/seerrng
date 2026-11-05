import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export async function prepareReleaseNoteValidation({
  headSha,
  prNumber = '',
  repository,
  fetchPullRequest,
  git = (args) => execFileSync('git', args, { encoding: 'utf8' }).trim(),
}) {
  if (!/^[a-f0-9]{40}$/u.test(headSha ?? ''))
    throw new Error('Invalid head SHA');
  if (prNumber) {
    if (!/^[1-9][0-9]*$/u.test(prNumber)) throw new Error('Invalid PR number');
    if (repository !== 'snapetech-org/seerrng')
      throw new Error('Invalid repository');
    const pr = await fetchPullRequest(prNumber);
    if (
      pr.state !== 'open' ||
      pr.number !== Number(prNumber) ||
      pr.user?.login !== 'snapetech' ||
      pr.head?.repo?.full_name !== repository ||
      pr.base?.repo?.full_name !== repository ||
      pr.base?.ref !== 'main' ||
      pr.head?.sha !== headSha ||
      !/^[a-f0-9]{40}$/u.test(pr.base?.sha ?? '')
    )
      throw new Error('PR metadata does not match the authorized owner head');
    // Compare the actual PR change range, including stacked integration history.
    const baseSha = git(['merge-base', pr.base.sha, headSha]);
    if (!/^[a-f0-9]{40}$/u.test(baseSha)) throw new Error('Invalid merge base');
    return { baseSha, body: typeof pr.body === 'string' ? pr.body : '' };
  }
  const baseSha = git(['rev-parse', '--verify', `${headSha}^1`]);
  if (!/^[a-f0-9]{40}$/u.test(baseSha)) throw new Error('Invalid parent SHA');
  const notes = git([
    'diff',
    '--name-only',
    baseSha,
    headSha,
    '--',
    'release-notes',
  ]);
  return { baseSha, body: notes ? '' : 'release-note: none' };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const repository = process.env.GITHUB_REPOSITORY;
  const result = await prepareReleaseNoteValidation({
    repository,
    headSha: process.env.HEAD_SHA,
    prNumber: process.env.PR_NUMBER,
    fetchPullRequest: async (number) => {
      const response = await fetch(
        `https://api.github.com/repos/${repository}/pulls/${number}`,
        {
          headers: {
            Accept: 'application/vnd.github+json',
            Authorization: `Bearer ${process.env.GH_TOKEN}`,
          },
          signal: AbortSignal.timeout(15_000),
        }
      );
      if (!response.ok)
        throw new Error(`PR metadata request failed: HTTP ${response.status}`);
      return response.json();
    },
  });
  const bodyFile = path.join(
    process.env.RUNNER_TEMP,
    'release-note-pr-body.md'
  );
  fs.writeFileSync(bodyFile, result.body, { mode: 0o600 });
  fs.appendFileSync(
    process.env.GITHUB_OUTPUT,
    `base_sha=${result.baseSha}\nbody_file=${bodyFile}\n`
  );
}
