import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';

// eslint-disable-next-line no-relative-import-paths/no-relative-import-paths -- Node tooling tests exercise the engine module directly.
import {
  createMode1LocalGitEvidence,
  createMode1LocalRunnerOptions,
  MODE1_LOCAL_REQUEST_PATH_ENV,
  MODE1_LOCAL_REQUEST_SHA256_ENV,
  readMode1LocalRequestBytes,
  verifyMode1LocalGitEvidence,
} from '../tools/validation-engine/runtime/mode1-local-lifecycle.mjs';
// eslint-disable-next-line no-relative-import-paths/no-relative-import-paths -- Node tooling tests exercise the engine module directly.
import { appendJsonLineNoFollow } from '../tools/validation-engine/runtime/append-json-line.mjs';

const hash = (value) => createHash('sha256').update(value).digest('hex');

test('Mode 1 rejects shared-UID proof execution before reading supplied paths', () => {
  assert.throws(
    () =>
      createMode1LocalRunnerOptions('/nonexistent-audit-source', {
        [MODE1_LOCAL_REQUEST_PATH_ENV]: '/nonexistent-audit-request',
        [MODE1_LOCAL_REQUEST_SHA256_ENV]: 'a'.repeat(64),
      }),
    /repository processes share the infrastructure UID/
  );
});

function git(directory, ...args) {
  return execFileSync('git', ['-C', directory, ...args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_TERMINAL_PROMPT: '0',
    },
  }).trim();
}

function findExecutable(name) {
  const suffixes = process.platform === 'win32' ? ['.exe', '.cmd', ''] : [''];
  for (const directory of (process.env.PATH ?? '').split(delimiter)) {
    for (const suffix of suffixes) {
      const candidate = join(directory, `${name}${suffix}`);
      if (existsSync(candidate)) return realpathSync(candidate);
    }
  }
  throw new Error(`Could not resolve executable ${name}`);
}

test('Mode 1 rejects a repository-local Git URL rewrite before fetching', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'seerrng-mode1-rewrite-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const source = join(root, 'source');
  mkdirSync(source);
  execFileSync('git', ['init', '--initial-branch=main', source]);
  git(source, 'config', 'user.name', 'SeerrNG test');
  git(source, 'config', 'user.email', 'seerrng-test@example.invalid');
  writeFileSync(join(source, 'tracked.txt'), 'candidate source\n');
  git(source, 'add', 'tracked.txt');
  git(source, 'commit', '-m', 'candidate source');
  const originUrl = 'https://github.com/snapetech/seerrng.git';
  git(source, 'remote', 'add', 'origin', originUrl);

  const candidate = {
    repository: 'snapetech/seerrng',
    branch: 'main',
    commit: git(source, 'rev-parse', 'HEAD'),
    tree: git(source, 'rev-parse', 'HEAD^{tree}'),
    lockSha256: 'a'.repeat(64),
    sourceSha256: 'b'.repeat(64),
  };
  const redirect = pathToFileURL(join(root, 'redirect.git')).href;
  const rewriteKey = `url."${redirect}".insteadOf`;
  git(source, 'config', rewriteKey, originUrl);

  assert.throws(
    () => createMode1LocalGitEvidence(source, candidate),
    /Authenticated Git origin URL is invalid/u
  );
  assert.equal(
    git(source, 'for-each-ref', '--format=%(refname)', 'refs/codex/mode1'),
    ''
  );
});

test(
  'Mode 1 isolates remote refs and preserves local refs',
  { skip: process.platform === 'win32' },
  (t) => {
    const root = mkdtempSync(join(tmpdir(), 'seerrng-mode1-git-'));
    t.after(() => rmSync(root, { recursive: true, force: true }));

    const remote = join(root, 'remote.git');
    const source = join(root, 'source');
    const shimDirectory = join(root, 'git-shim');
    mkdirSync(shimDirectory);
    const gitShim = join(shimDirectory, 'git');
    const realGit = findExecutable('git');
    writeFileSync(
      gitShim,
      `#!/usr/bin/env node
  const { spawnSync } = require('node:child_process');
  const args = process.argv.slice(2);
  const operationIndex = args.findIndex(
    (arg) => arg === 'fetch' || arg === 'ls-remote'
  );
  if (operationIndex >= 0) {
    const originIndex = args.indexOf('origin', operationIndex + 1);
    if (originIndex >= 0)
      args[originIndex] = process.env.SEERRNG_MODE1_TEST_REMOTE;
  }
  const result = spawnSync(process.env.SEERRNG_MODE1_REAL_GIT, args, {
    stdio: 'inherit',
  });
  process.exit(result.status ?? 1);
  `
    );
    chmodSync(gitShim, 0o700);
    const previousPath = process.env.PATH;
    const previousTestRemote = process.env.SEERRNG_MODE1_TEST_REMOTE;
    const previousRealGit = process.env.SEERRNG_MODE1_REAL_GIT;
    process.env.PATH = `${shimDirectory}${delimiter}${previousPath ?? ''}`;
    process.env.SEERRNG_MODE1_TEST_REMOTE = remote;
    process.env.SEERRNG_MODE1_REAL_GIT = realGit;
    t.after(() => {
      if (previousPath === undefined) delete process.env.PATH;
      else process.env.PATH = previousPath;
      if (previousTestRemote === undefined)
        delete process.env.SEERRNG_MODE1_TEST_REMOTE;
      else process.env.SEERRNG_MODE1_TEST_REMOTE = previousTestRemote;
      if (previousRealGit === undefined)
        delete process.env.SEERRNG_MODE1_REAL_GIT;
      else process.env.SEERRNG_MODE1_REAL_GIT = previousRealGit;
    });

    const payload = join(source, 'tracked.txt');
    execFileSync('git', ['init', '--bare', '--initial-branch=main', remote]);
    mkdirSync(source);
    execFileSync('git', ['init', '--initial-branch=main', source]);
    git(source, 'config', 'user.name', 'SeerrNG test');
    git(source, 'config', 'user.email', 'seerrng-test@example.invalid');
    writeFileSync(payload, 'remote base\n');
    git(source, 'add', 'tracked.txt');
    git(source, 'commit', '-m', 'remote base');
    git(source, 'tag', 'v1');
    const originUrl = 'https://github.com/snapetech/seerrng.git';
    git(source, 'remote', 'add', 'origin', originUrl);
    git(source, 'push', remote, 'main', '--tags');
    const remoteBase = git(source, 'rev-parse', 'HEAD');
    execFileSync('git', [
      '--git-dir',
      remote,
      'update-ref',
      'refs/pull/123/head',
      remoteBase,
    ]);
    git(source, 'update-ref', 'refs/remotes/origin/main', remoteBase);
    writeFileSync(payload, 'local candidate descendant\n');
    git(source, 'commit', '-am', 'local candidate');
    git(source, 'update-ref', 'refs/remotes/origin/stale-local-ref', 'HEAD');

    const candidate = {
      repository: 'snapetech/seerrng',
      branch: 'main',
      commit: git(source, 'rev-parse', 'HEAD'),
      tree: git(source, 'rev-parse', 'HEAD^{tree}'),
      lockSha256: 'a'.repeat(64),
      sourceSha256: 'b'.repeat(64),
    };

    git(source, 'tag', 'local-only');
    assert.throws(
      () => createMode1LocalGitEvidence(source, candidate),
      /Local tags differ from authenticated remote tags/u
    );
    assert.equal(
      git(source, 'rev-parse', 'refs/tags/local-only'),
      candidate.commit
    );
    assert.equal(
      git(source, 'for-each-ref', '--format=%(refname)', 'refs/codex/mode1'),
      ''
    );
    git(source, 'tag', '-d', 'local-only');

    const remoteTrackingRefsBefore = git(
      source,
      'for-each-ref',
      '--format=%(refname) %(objectname)',
      'refs/remotes/origin'
    );
    const evidence = createMode1LocalGitEvidence(source, candidate);
    assert.equal(
      git(
        source,
        'for-each-ref',
        '--format=%(refname) %(objectname)',
        'refs/remotes/origin'
      ),
      remoteTrackingRefsBefore
    );
    assert.equal(
      git(source, 'for-each-ref', '--format=%(refname)', 'refs/codex/mode1'),
      ''
    );
    assert.equal(evidence.candidateDescendsFromRemoteBranch, true);
    assert.equal(evidence.completeObjectClosureVerified, true);
    assert.ok(
      evidence.remoteRefs.every(({ ref }) => !ref.startsWith('refs/pull/'))
    );
    assert.equal(
      evidence.remoteBranchCommit,
      git(source, 'rev-parse', 'origin/main')
    );
    assert.deepEqual(evidence.remoteTagRefs, [
      'refs/tags/v1 ' + git(source, 'rev-parse', 'refs/tags/v1'),
    ]);

    const raw = Buffer.from(`${JSON.stringify(evidence)}\n`);
    const tagRefs = git(
      source,
      'for-each-ref',
      '--format=%(refname) %(objectname)',
      'refs/tags'
    );
    const tagRefsSha256 = hash(Buffer.from(`${tagRefs}\n`));
    const manifest = {
      candidate,
      gitHistory: { evidenceSha256: hash(raw) },
    };
    const verified = verifyMode1LocalGitEvidence(raw, manifest, tagRefsSha256);
    assert.equal(verified.verified, true);
    assert.equal(verified.completeClosure, true);
    assert.equal(verified.commit, candidate.commit);
    assert.equal(verified.localTagRefsSha256, tagRefsSha256);

    assert.throws(
      () =>
        verifyMode1LocalGitEvidence(
          raw,
          { ...manifest, candidate: { ...candidate, commit: 'c'.repeat(40) } },
          tagRefsSha256
        ),
      /candidate Git proof is required/u
    );
    const altered = Buffer.from(raw);
    altered[0] ^= 1;
    assert.throws(
      () => verifyMode1LocalGitEvidence(altered, manifest, tagRefsSha256),
      /evidence bytes differ/u
    );
  }
);

test(
  'Mode 1 opens a request without following a path replaced by a symlink',
  { skip: process.platform !== 'linux' },
  (t) => {
    const root = mkdtempSync(join(tmpdir(), 'seerrng-mode1-read-'));
    t.after(() => rmSync(root, { recursive: true, force: true }));

    const target = join(root, 'outside.json');
    const requestPath = join(root, 'request.json');
    writeFileSync(target, '{}\n');
    symlinkSync(target, requestPath);

    assert.throws(
      () => readMode1LocalRequestBytes(requestPath),
      (error) => error.code === 'ELOOP'
    );
    const ordinary = join(root, 'ordinary.json');
    writeFileSync(ordinary, '{}\n');
    assert.equal(readMode1LocalRequestBytes(ordinary).toString('utf8'), '{}\n');
  }
);

test(
  'evidence JSONL appends reject symlinks and hard links',
  { skip: process.platform !== 'linux' },
  (t) => {
    const root = mkdtempSync(join(tmpdir(), 'seerrng-evidence-append-'));
    t.after(() => rmSync(root, { recursive: true, force: true }));

    const target = join(root, 'target.jsonl');
    const linked = join(root, 'linked.jsonl');
    const hardLinked = join(root, 'hard-linked.jsonl');
    writeFileSync(target, 'preserve\n');
    symlinkSync(target, linked);
    writeFileSync(hardLinked, 'hard-link target\n');
    const hardLink = join(root, 'hard-link.jsonl');
    linkSync(hardLinked, hardLink);

    assert.throws(() =>
      appendJsonLineNoFollow(linked, '{"event":"blocked"}\n')
    );
    assert.throws(
      () => appendJsonLineNoFollow(hardLink, '{"event":"blocked"}\n'),
      /single-link file/u
    );
    appendJsonLineNoFollow(target, '{"event":"accepted"}\n');

    assert.equal(
      readFileSync(target, 'utf8'),
      'preserve\n{"event":"accepted"}\n'
    );
    assert.equal(readFileSync(hardLinked, 'utf8'), 'hard-link target\n');
  }
);
