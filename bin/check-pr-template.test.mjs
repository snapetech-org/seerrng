import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const script = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'check-pr-template.mjs'
);

const baseBody = (releaseNotes) => `## Description

This describes a real change.

## How Has This Been Tested?

The relevant tests passed.

## Release Notes

${releaseNotes}

## Checklist:

- [x] I have read and followed the contribution guidelines.
- [x] Disclosed any use of AI.
`;

const runValidator = (body) => {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'seerrng-pr-template-')
  );
  const file = path.join(directory, 'pr-body.md');
  fs.writeFileSync(file, body);

  try {
    return {
      code: 0,
      output: execFileSync(process.execPath, [script, file], {
        encoding: 'utf8',
        env: { ...process.env, AUTHOR_ASSOCIATION: 'CONTRIBUTOR' },
      }),
    };
  } catch (error) {
    return {
      code: error.status,
      output: `${error.stdout ?? ''}${error.stderr ?? ''}`,
    };
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
};

test('release notes allow supporting confirmations alongside the fragment choice', () => {
  const result = runValidator(
    baseBody(`- [x] I added a release-note fragment under \`release-notes/\`.
- [ ] This change is internal-only and does not need a user-facing release note.
- [x] The fragment includes audience, area, action, and breaking-change status.
- [x] I previewed the release text with \`pnpm release-notes:preview\`.`)
  );

  assert.equal(result.code, 0, result.output);
});

test('release notes accept the wording in the repository pull request template', () => {
  const result = runValidator(
    baseBody(`- [x] I added a validated release-note fragment under \`release-notes/\` for this user-facing change.
- [ ] This change is internal-only and needs no release-note fragment.
- [x] The fragment includes audience, area, action, and breaking-change status.`)
  );

  assert.equal(result.code, 0, result.output);
});

test('release notes still reject selecting both primary choices', () => {
  const result = runValidator(
    baseBody(`- [x] I added a release-note fragment under \`release-notes/\`.
- [x] This change is internal-only and does not need a user-facing release note.
- [ ] The fragment includes audience, area, action, and breaking-change status.
- [ ] I previewed the release text with \`pnpm release-notes:preview\`.`)
  );

  assert.equal(result.code, 1);
  assert.match(result.output, /exactly one primary option/u);
});
