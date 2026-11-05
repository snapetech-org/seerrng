import assert from 'node:assert/strict';
import test from 'node:test';
import { prepareReleaseNoteValidation } from './prepare-release-note-validation.mjs';

const headSha = 'a'.repeat(40);
const baseSha = 'b'.repeat(40);
const repository = 'snapetech-org/seerrng';
const fixture = () => ({
  number: 550,
  state: 'open',
  user: { login: 'snapetech' },
  head: { sha: headSha, repo: { full_name: repository } },
  base: { sha: baseSha, ref: 'main', repo: { full_name: repository } },
  body: 'A literal body containing $(echo unsafe) and `commands`.',
});
const prepare = (pr) =>
  prepareReleaseNoteValidation({
    headSha,
    prNumber: '550',
    repository,
    fetchPullRequest: async () => pr,
    git: (args) => {
      assert.deepEqual(args, ['merge-base', baseSha, headSha]);
      return baseSha;
    },
  });
test('keeps PR body literal and validates the complete PR range', async () => {
  const pr = fixture();
  assert.deepEqual(await prepare(pr), { baseSha, body: pr.body });
});
for (const [name, alter] of [
  [
    'advanced head',
    (pr) => {
      pr.head.sha = 'c'.repeat(40);
    },
  ],
  [
    'foreign fork',
    (pr) => {
      pr.head.repo.full_name = 'attacker/seerrng';
    },
  ],
  [
    'other author',
    (pr) => {
      pr.user.login = 'attacker';
    },
  ],
  [
    'other target',
    (pr) => {
      pr.base.ref = 'other';
    },
  ],
  [
    'closed PR',
    (pr) => {
      pr.state = 'closed';
    },
  ],
])
  test(`rejects ${name}`, async () => {
    const pr = fixture();
    alter(pr);
    await assert.rejects(prepare(pr), /metadata does not match/u);
  });
test('rejects malformed input before fetching or executing git', async () => {
  await assert.rejects(
    prepareReleaseNoteValidation({ headSha: 'HEAD;echo unsafe' }),
    /Invalid head/u
  );
});
test('does not invent an internal-only opt-out for an owner PR', async () => {
  const pr = fixture();
  pr.body = null;
  assert.equal((await prepare(pr)).body, '');
});

for (const notes of ['', 'release-notes/fix.md']) {
  test(`manual main comparison ${notes ? 'requires release notes' : 'allows internal-only changes'}`, async () => {
    const calls = [];
    const result = await prepareReleaseNoteValidation({
      headSha,
      git: (args) => {
        calls.push(args);
        return calls.length === 1 ? baseSha : notes;
      },
    });
    assert.deepEqual(calls, [
      ['rev-parse', '--verify', `${headSha}^1`],
      ['diff', '--name-only', baseSha, headSha, '--', 'release-notes'],
    ]);
    assert.deepEqual(result, {
      baseSha,
      body: notes ? '' : 'release-note: none',
    });
  });
}
