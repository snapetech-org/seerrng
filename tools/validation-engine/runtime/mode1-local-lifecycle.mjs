// Copyright (c) snapetech and SeerrNG contributors.
// Capability-free local containment bridge for the full native validation gate.
import { execFileSync, spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import {
  closeSync,
  constants as fsConstants,
  fstatSync,
  openSync,
  readFileSync,
  realpathSync,
} from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { appendJsonLineNoFollow } from './append-json-line.mjs';
import { assertProofParentExecutionIsolation } from './distributed-linux-host-adapters.mjs';
import {
  createDistributedLinuxProofSocketAdapter,
  createMode1LinuxHostContainmentCallbacks,
} from './distributed-linux-host-containment.mjs';
import { runDistributedLinuxProofClientCommand } from './distributed-linux-public-lifecycle.mjs';

export const MODE1_LOCAL_REQUEST_SCHEMA = 'seerrng-mode1-local-run-request/v1';
export const MODE1_LOCAL_GIT_EVIDENCE_SCHEMA =
  'seerrng-mode1-local-git-evidence/v1';
export const MODE1_LOCAL_REQUEST_PATH_ENV = 'SEERR_MODE1_LOCAL_REQUEST_PATH';
export const MODE1_LOCAL_REQUEST_SHA256_ENV =
  'SEERR_MODE1_LOCAL_REQUEST_SHA256';

const HASH40 = /^[a-f0-9]{40}$/u;
const HASH64 = /^[a-f0-9]{64}$/u;
const TOKEN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const compareText = (left, right) => (left < right ? -1 : left > right ? 1 : 0);
const hash = (value) => createHash('sha256').update(value).digest('hex');

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .toSorted(([left], [right]) => compareText(left, right))
        .map(([key, child]) => [key, canonical(child)])
    );
  return value;
}

function canonicalBytes(value) {
  return Buffer.from(`${JSON.stringify(canonical(value))}\n`, 'utf8');
}

function exactKeys(value, keys, label) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  )
    throw new Error(`${label} must be a plain object`);
  const actual = Reflect.ownKeys(value).toSorted(compareText);
  const expected = [...keys].toSorted(compareText);
  if (
    actual.some((key) => typeof key !== 'string') ||
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  )
    throw new Error(`${label} requires its exact field set`);
  return value;
}

function exactText(value, label) {
  if (
    typeof value !== 'string' ||
    !value ||
    value !== value.trim() ||
    value.includes('\0') ||
    value.includes('\n') ||
    value.includes('\r')
  )
    throw new Error(`Exact ${label} is required`);
  return value;
}

function exactDigest(value, label) {
  const result = exactText(value, label);
  if (!HASH64.test(result)) throw new Error(`${label} must be SHA-256`);
  return result;
}

function exactPath(value, label) {
  const result = exactText(value, label);
  if (!path.isAbsolute(result) || path.normalize(result) !== result)
    throw new Error(`${label} must be an absolute normalized path`);
  return result;
}

function repositorySlugFromRemoteUrl(remoteUrl) {
  if (typeof remoteUrl !== 'string' || !remoteUrl || /[\r\n]/u.test(remoteUrl))
    throw new Error('Authenticated Git origin URL is invalid');
  let slug;
  const scpStyle = /^git@github\.com:([^?#]+)$/u.exec(remoteUrl);
  if (scpStyle) {
    slug = scpStyle[1];
  } else {
    let parsed;
    try {
      parsed = new URL(remoteUrl);
    } catch {
      throw new Error('Authenticated Git origin URL is invalid');
    }
    if (
      !['https:', 'ssh:'].includes(parsed.protocol) ||
      parsed.hostname.toLowerCase() !== 'github.com' ||
      parsed.port ||
      (parsed.username &&
        !(parsed.protocol === 'ssh:' && parsed.username === 'git')) ||
      parsed.password ||
      parsed.search ||
      parsed.hash
    )
      throw new Error('Authenticated Git origin must target github.com');
    slug = parsed.pathname.replace(/^\/+|\/+$/gu, '');
  }
  slug = slug.replace(/\.git$/u, '');
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(slug))
    throw new Error('Authenticated Git origin repository path is invalid');
  return slug;
}

function readOrdinaryFile(file, label) {
  const noFollow = fsConstants.O_NOFOLLOW;
  if (!Number.isSafeInteger(noFollow) || noFollow === 0)
    throw new Error(`${label} requires no-follow file access`);
  const descriptor = openSync(
    file,
    fsConstants.O_RDONLY | noFollow | (fsConstants.O_NONBLOCK ?? 0)
  );
  try {
    const before = fstatSync(descriptor, { bigint: true });
    if (!before.isFile()) throw new Error(`${label} must be an ordinary file`);
    const content = readFileSync(descriptor);
    const after = fstatSync(descriptor, { bigint: true });
    if (
      after.dev !== before.dev ||
      after.ino !== before.ino ||
      after.size !== before.size ||
      after.mtimeNs !== before.mtimeNs ||
      after.ctimeNs !== before.ctimeNs
    )
      throw new Error(`${label} changed while being read`);
    return content;
  } finally {
    closeSync(descriptor);
  }
}

function git(sourceRoot, arguments_, input) {
  return execFileSync(
    'git',
    [
      '--no-optional-locks',
      '-C',
      sourceRoot,
      '-c',
      'core.fsmonitor=false',
      '-c',
      'init.templateDir=',
      ...arguments_,
    ],
    {
      encoding: 'utf8',
      input,
      maxBuffer: 64 * 1024 * 1024,
      env: {
        ...process.env,
        GIT_CONFIG_NOSYSTEM: '1',
        GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null',
        GIT_NO_REPLACE_OBJECTS: '1',
        GIT_TERMINAL_PROMPT: '0',
      },
    }
  );
}

function remoteRefs(sourceRoot) {
  // GitHub also advertises refs/pull/*, which this local fetch does not own.
  // Bind the proof to the branch and tag refs that the fetch actually closes.
  const lines = git(sourceRoot, [
    'ls-remote',
    '--symref',
    'origin',
    'HEAD',
    'refs/heads/*',
    'refs/tags/*',
  ])
    .trimEnd()
    .split('\n');
  const refs = [];
  let headTarget = null;
  for (const line of lines) {
    if (!line) continue;
    const symbolic = /^ref: (refs\/heads\/[A-Za-z0-9._/-]+)\tHEAD$/u.exec(line);
    if (symbolic) {
      if (headTarget !== null)
        throw new Error('Remote advertised multiple symbolic HEAD targets');
      headTarget = symbolic[1];
      continue;
    }
    const match =
      /^([a-f0-9]{40})\t((?:HEAD|refs\/(?:heads|tags)\/[A-Za-z0-9._/-]+)(?:\^\{\})?)$/u.exec(
        line
      );
    if (!match) throw new Error('Authenticated remote ref response is invalid');
    refs.push({ oid: match[1], ref: match[2] });
  }
  refs.sort((left, right) => compareText(left.ref, right.ref));
  if (
    refs.length < 2 ||
    refs.filter(({ ref }) => ref === 'HEAD').length !== 1 ||
    new Set(refs.map(({ ref }) => ref)).size !== refs.length
  )
    throw new Error('Authenticated remote ref closure is incomplete');
  if (headTarget) {
    const head = refs.find(({ ref }) => ref === 'HEAD');
    const target = refs.find(({ ref }) => ref === headTarget);
    if (!target || target.oid !== head.oid)
      throw new Error('Remote symbolic HEAD differs from its branch ref');
  }
  return refs;
}

/**
 * Fetch an authenticated remote closure in the already-owned source snapshot.
 * The frozen local candidate may be ahead of the published branch, but it must
 * descend from that branch and every fetched object/tag must be complete.
 */
export function createMode1LocalGitEvidence(sourceRoot, candidate) {
  sourceRoot = realpathSync(sourceRoot);
  if (
    !candidate ||
    !HASH40.test(candidate.commit ?? '') ||
    !HASH40.test(candidate.tree ?? '') ||
    !HASH64.test(candidate.lockSha256 ?? '') ||
    !HASH64.test(candidate.sourceSha256 ?? '') ||
    typeof candidate.repository !== 'string' ||
    !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(candidate.repository) ||
    typeof candidate.branch !== 'string' ||
    !candidate.branch ||
    git(sourceRoot, [
      'check-ref-format',
      '--branch',
      candidate.branch,
    ]).trim() !== candidate.branch
  )
    throw new Error('Exact local candidate Git identity is required');
  const originUrls = git(sourceRoot, [
    'config',
    '--get-all',
    'remote.origin.url',
  ])
    .trimEnd()
    .split('\n')
    .filter(Boolean);
  if (
    originUrls.length !== 1 ||
    repositorySlugFromRemoteUrl(originUrls[0]) !== candidate.repository
  )
    throw new Error('Authenticated Git origin differs from the candidate repo');
  // Git applies url.*.insteadOf rewrites before contacting a remote. Validate
  // the resolved URL too, so a repository-local rewrite cannot substitute an
  // unrelated host or local repository for the configured GitHub origin.
  const effectiveOriginUrls = git(sourceRoot, [
    'remote',
    'get-url',
    '--all',
    'origin',
  ])
    .trimEnd()
    .split('\n')
    .filter(Boolean);
  if (
    effectiveOriginUrls.length !== 1 ||
    repositorySlugFromRemoteUrl(effectiveOriginUrls[0]) !== candidate.repository
  )
    throw new Error('Git origin rewrite differs from the authenticated repo');

  const namespace = `refs/codex/mode1/${randomUUID()}`;
  const branchNamespace = `${namespace}/heads`;
  const tagNamespace = `${namespace}/tags`;
  const removeTemporaryRefs = () => {
    const refs = git(sourceRoot, [
      'for-each-ref',
      '--format=%(refname)',
      namespace,
    ])
      .trimEnd()
      .split('\n')
      .filter(Boolean);
    if (refs.length)
      git(
        sourceRoot,
        ['update-ref', '--stdin'],
        Buffer.from(refs.map((ref) => `delete ${ref}\n`).join(''))
      );
  };

  try {
    const before = remoteRefs(sourceRoot);
    // Fetch into a unique private namespace. Pruning tags or remote-tracking
    // refs in the user's checkout would silently delete local Git state.
    git(sourceRoot, [
      'fetch',
      '--force',
      '--prune',
      '--no-write-fetch-head',
      'origin',
      `+refs/heads/*:${branchNamespace}/*`,
      `+refs/tags/*:${tagNamespace}/*`,
    ]);
    const after = remoteRefs(sourceRoot);
    if (JSON.stringify(before) !== JSON.stringify(after))
      throw new Error('Authenticated Git remote refs changed during fetch');
    if (
      git(sourceRoot, ['rev-parse', '--is-shallow-repository']).trim() !==
      'false'
    )
      throw new Error('Complete authenticated Git history is required');

    const expectedBranches = after
      .filter(({ ref }) => ref.startsWith('refs/heads/'))
      .map(
        ({ oid, ref }) =>
          `${branchNamespace}/${ref.slice('refs/heads/'.length)} ${oid}`
      )
      .sort(compareText);
    const fetchedBranches = git(sourceRoot, [
      'for-each-ref',
      '--format=%(refname) %(objectname)',
      branchNamespace,
    ])
      .trimEnd()
      .split('\n')
      .filter(Boolean)
      .sort(compareText);
    const expectedRemoteTags = after
      .filter(({ ref }) => ref.startsWith('refs/tags/') && !ref.endsWith('^{}'))
      .map(
        ({ oid, ref }) =>
          `${tagNamespace}/${ref.slice('refs/tags/'.length)} ${oid}`
      )
      .sort(compareText);
    const fetchedTags = git(sourceRoot, [
      'for-each-ref',
      '--format=%(refname) %(objectname)',
      tagNamespace,
    ])
      .trimEnd()
      .split('\n')
      .filter(Boolean)
      .sort(compareText);
    if (
      JSON.stringify(fetchedBranches) !== JSON.stringify(expectedBranches) ||
      JSON.stringify(fetchedTags) !== JSON.stringify(expectedRemoteTags)
    )
      throw new Error('Authenticated Git fetch did not close every remote ref');

    const branchRef = `refs/heads/${candidate.branch}`;
    const branch = after.find(({ ref }) => ref === branchRef);
    if (!branch)
      throw new Error('Authenticated remote candidate branch is absent');
    const fetchedBranchRef = `${branchNamespace}/${candidate.branch}`;
    if (
      git(sourceRoot, ['rev-parse', fetchedBranchRef]).trim() !== branch.oid ||
      git(sourceRoot, ['rev-parse', `${candidate.commit}^{tree}`]).trim() !==
        candidate.tree
    )
      throw new Error('Fetched branch or candidate tree identity differs');
    git(sourceRoot, ['update-ref', `${namespace}/candidate`, candidate.commit]);
    try {
      // `merge-base --is-ancestor` expresses its answer through the exit status.
      git(sourceRoot, [
        'merge-base',
        '--is-ancestor',
        fetchedBranchRef,
        candidate.commit,
      ]);
    } catch {
      throw new Error(
        'Candidate is not a descendant of the authenticated branch'
      );
    }

    const missing = git(sourceRoot, [
      'rev-list',
      '--objects',
      '--all',
      '--missing=print',
    ]);
    if (missing.split('\n').some((line) => line.startsWith('?')))
      throw new Error('Authenticated Git object closure is incomplete');

    const localTagRefs = git(sourceRoot, [
      'for-each-ref',
      '--format=%(refname) %(objectname)',
      'refs/tags',
    ])
      .trimEnd()
      .split('\n')
      .filter(Boolean)
      .sort(compareText);
    const remoteTagRefs = after
      .filter(({ ref }) => ref.startsWith('refs/tags/') && !ref.endsWith('^{}'))
      .map(({ oid, ref }) => `${ref} ${oid}`)
      .sort(compareText);
    if (
      !remoteTagRefs.length ||
      JSON.stringify(localTagRefs) !== JSON.stringify(remoteTagRefs)
    )
      throw new Error('Local tags differ from authenticated remote tags');

    const localTagRefsSha256 = hash(
      Buffer.from(`${localTagRefs.join('\n')}\n`)
    );
    const remoteTagRefsSha256 = hash(
      Buffer.from(`${remoteTagRefs.join('\n')}\n`)
    );
    return {
      schema: MODE1_LOCAL_GIT_EVIDENCE_SCHEMA,
      repository: candidate.repository,
      branch: candidate.branch,
      candidateCommit: candidate.commit,
      candidateTree: candidate.tree,
      candidateLockSha256: candidate.lockSha256,
      candidateSourceSha256: candidate.sourceSha256,
      fetchedUsing:
        'authenticated Git fetch to isolated refs/codex/mode1 namespace',
      shallow: false,
      beforeAfterRemoteRefsVerified: true,
      completeObjectClosureVerified: true,
      candidateDescendsFromRemoteBranch: true,
      remoteBranchCommit: branch.oid,
      remoteRefs: after,
      remoteRefsSha256: hash(canonicalBytes(after)),
      remoteTagRefs,
      localTagRefsSha256,
      remoteTagRefsSha256,
      observedAt: new Date().toISOString(),
    };
  } finally {
    removeTemporaryRefs();
  }
}

export function verifyMode1LocalGitEvidence(raw, manifest, localTagRefsSha256) {
  if (hash(raw) !== manifest.gitHistory.evidenceSha256)
    throw new Error(
      'Local candidate Git evidence bytes differ from the manifest'
    );
  const value = JSON.parse(Buffer.from(raw).toString('utf8'));
  exactKeys(
    value,
    [
      'schema',
      'repository',
      'branch',
      'candidateCommit',
      'candidateTree',
      'candidateLockSha256',
      'candidateSourceSha256',
      'fetchedUsing',
      'shallow',
      'beforeAfterRemoteRefsVerified',
      'completeObjectClosureVerified',
      'candidateDescendsFromRemoteBranch',
      'remoteBranchCommit',
      'remoteRefs',
      'remoteRefsSha256',
      'remoteTagRefs',
      'localTagRefsSha256',
      'remoteTagRefsSha256',
      'observedAt',
    ],
    'Mode 1 authenticated Git evidence'
  );
  const candidate = manifest.candidate;
  if (
    value.schema !== MODE1_LOCAL_GIT_EVIDENCE_SCHEMA ||
    value.repository !== candidate.repository ||
    value.branch !== candidate.branch ||
    value.candidateCommit !== candidate.commit ||
    value.candidateTree !== candidate.tree ||
    value.candidateLockSha256 !== candidate.lockSha256 ||
    value.candidateSourceSha256 !== candidate.sourceSha256 ||
    value.fetchedUsing !==
      'authenticated Git fetch to isolated refs/codex/mode1 namespace' ||
    value.shallow !== false ||
    value.beforeAfterRemoteRefsVerified !== true ||
    value.completeObjectClosureVerified !== true ||
    value.candidateDescendsFromRemoteBranch !== true ||
    !HASH40.test(value.remoteBranchCommit ?? '') ||
    !Number.isFinite(Date.parse(value.observedAt)) ||
    !Array.isArray(value.remoteRefs) ||
    !Array.isArray(value.remoteTagRefs)
  )
    throw new Error('Complete local candidate Git proof is required');
  const refs = value.remoteRefs.map((entry) => {
    exactKeys(entry, ['oid', 'ref'], 'authenticated remote ref');
    if (!HASH40.test(entry.oid) || typeof entry.ref !== 'string')
      throw new Error('Authenticated remote ref is invalid');
    return entry;
  });
  const branchRef = `refs/heads/${candidate.branch}`;
  const branch = refs.find(({ ref }) => ref === branchRef);
  if (
    new Set(refs.map(({ ref }) => ref)).size !== refs.length ||
    JSON.stringify(refs) !==
      JSON.stringify(
        [...refs].sort((left, right) => compareText(left.ref, right.ref))
      ) ||
    refs.filter(({ ref }) => ref === 'HEAD').length !== 1 ||
    !branch ||
    branch.oid !== value.remoteBranchCommit ||
    value.remoteRefsSha256 !== hash(canonicalBytes(refs))
  )
    throw new Error('Authenticated remote branch/ref evidence differs');
  const tags = refs
    .filter(({ ref }) => ref.startsWith('refs/tags/') && !ref.endsWith('^{}'))
    .map(({ oid, ref }) => `${ref} ${oid}`)
    .sort(compareText);
  const providedTags = value.remoteTagRefs.map((entry) =>
    exactText(entry, 'authenticated remote tag ref')
  );
  const tagDigest = hash(Buffer.from(`${providedTags.join('\n')}\n`));
  if (
    !providedTags.length ||
    JSON.stringify(providedTags) !== JSON.stringify(tags) ||
    value.localTagRefsSha256 !== localTagRefsSha256 ||
    value.remoteTagRefsSha256 !== localTagRefsSha256 ||
    tagDigest !== localTagRefsSha256
  )
    throw new Error('Authenticated local/remote tag closure differs');
  return Object.freeze({
    verified: true,
    completeClosure: true,
    sourceSha256: candidate.sourceSha256,
    commit: candidate.commit,
    version: 'authenticated-git-complete-closure-with-local-descendant-v1',
    localTagRefsSha256,
    remoteTagRefsSha256: localTagRefsSha256,
    remoteRefsSha256: value.remoteRefsSha256,
    evidenceSha256: manifest.gitHistory.evidenceSha256,
  });
}

function probeTarget(descriptor) {
  const isPublic = descriptor.kind === 'public-provider';
  const isRepositoryPublic = descriptor.kind === 'repository-public-denial';
  return {
    args: [
      '--noproxy',
      '*',
      '--silent',
      '--show-error',
      '--connect-timeout',
      '2',
      '--max-time',
      '10',
      ...(isPublic
        ? ['--output', '/dev/null', '--write-out', '%{http_code}']
        : []),
      isPublic
        ? descriptor.endpoint.url
        : isRepositoryPublic
          ? 'https://1.1.1.1:443/'
          : `http://${descriptor.endpoint.host}:${descriptor.endpoint.port}/`,
    ],
  };
}

function runProbe(descriptor, signal) {
  const { args } = probeTarget(descriptor);
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('Network proof probe was aborted'));
      return;
    }
    let stdout = '';
    let stderr = '';
    let spawnError = null;
    let timedOut = false;
    let closed = false;
    const started = performance.now();
    const child = spawn('/usr/bin/curl', args, {
      cwd: process.cwd(),
      env: process.env,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, 15_000);
    const abort = () => child.kill('SIGTERM');
    signal?.addEventListener('abort', abort, { once: true });
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      if (stdout.length < 1_048_576) stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      if (stderr.length < 1_048_576) stderr += chunk;
    });
    child.on('error', (error) => {
      spawnError = error.message;
    });
    child.on('close', (exitCode, exitSignal) => {
      closed = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      const status =
        spawnError || timedOut || exitSignal
          ? 'incomplete'
          : exitCode === 0
            ? 'passed'
            : 'failed';
      resolve({
        id: descriptor.kind,
        status,
        exitCode,
        signal: exitSignal,
        aborted: signal?.aborted ?? false,
        timedOut,
        spawnError,
        stdout,
        stderr,
        wallMs: Math.max(0, Math.round(performance.now() - started)),
        stdoutSha256: hash(Buffer.from(stdout)),
        stderrSha256: hash(Buffer.from(stderr)),
        lifecycle: {
          completed: closed,
          cleanupVerified: closed,
          cleanupError: null,
        },
      });
    });
  });
}

/** Read request bytes without granting execution authority. */
export function readMode1LocalRequestBytes(requestPath) {
  return readOrdinaryFile(
    exactPath(requestPath, 'Mode 1 request path'),
    'Mode 1 request'
  );
}

/** Load the run-owned proof callbacks inside the no-flag runner child. */
export function createMode1LocalRunnerOptions(
  sourceRoot,
  inherited = process.env
) {
  assertProofParentExecutionIsolation();

  const requestPath = exactPath(
    inherited[MODE1_LOCAL_REQUEST_PATH_ENV],
    'Mode 1 request path'
  );
  const requestBytes = readMode1LocalRequestBytes(requestPath);
  const requestSha256 = hash(requestBytes);
  if (
    exactDigest(
      inherited[MODE1_LOCAL_REQUEST_SHA256_ENV],
      'Mode 1 request hash'
    ) !== requestSha256
  )
    throw new Error('Mode 1 request bytes differ from the proof-parent seal');
  const request = JSON.parse(requestBytes.toString('utf8'));
  exactKeys(
    request,
    [
      'schema',
      'runId',
      'sourceRoot',
      'scratchParent',
      'manifestPath',
      'codeqlModelsPath',
      'playwrightBrowsersPath',
      'cypressCachePath',
      'gitEvidencePath',
      'proofParentConfigPath',
      'proofParentConfigSha256',
      'helperReadyFile',
    ],
    'Mode 1 local run request'
  );
  if (request.schema !== MODE1_LOCAL_REQUEST_SCHEMA)
    throw new Error('Unsupported Mode 1 local run request schema');
  const normalized = {
    runId: exactText(request.runId, 'Mode 1 run ID'),
    sourceRoot: exactPath(request.sourceRoot, 'Mode 1 source root'),
    scratchParent: exactPath(request.scratchParent, 'Mode 1 scratch parent'),
    manifestPath: exactPath(request.manifestPath, 'Mode 1 manifest path'),
    codeqlModelsPath: exactPath(
      request.codeqlModelsPath,
      'Mode 1 CodeQL model path'
    ),
    playwrightBrowsersPath: exactPath(
      request.playwrightBrowsersPath,
      'Mode 1 Playwright browser path'
    ),
    cypressCachePath: exactPath(
      request.cypressCachePath,
      'Mode 1 Cypress cache path'
    ),
    gitEvidencePath: exactPath(
      request.gitEvidencePath,
      'Mode 1 Git evidence path'
    ),
    proofParentConfigPath: exactPath(
      request.proofParentConfigPath,
      'Mode 1 proof config path'
    ),
    proofParentConfigSha256: exactDigest(
      request.proofParentConfigSha256,
      'Mode 1 proof config hash'
    ),
    helperReadyFile: exactPath(
      request.helperReadyFile,
      'Mode 1 helper readiness path'
    ),
  };
  if (!TOKEN.test(normalized.runId))
    throw new Error('Mode 1 run ID must be a bounded token');
  if (
    normalized.runId !== inherited.SEERR_MODE1_LOCAL_RUN_ID ||
    normalized.sourceRoot !== realpathSync(sourceRoot) ||
    normalized.sourceRoot !== process.cwd() ||
    normalized.scratchParent !== inherited.SEERR_VALIDATION_STATE_DIR ||
    normalized.codeqlModelsPath !==
      inherited.SEERR_MODE1_LOCAL_CODEQL_MODELS_PATH ||
    normalized.playwrightBrowsersPath !== inherited.PLAYWRIGHT_BROWSERS_PATH ||
    normalized.cypressCachePath !== inherited.CYPRESS_CACHE_FOLDER
  )
    throw new Error('Mode 1 local request differs from the contained process');
  const manifest = JSON.parse(
    readOrdinaryFile(normalized.manifestPath, 'Mode 1 manifest').toString(
      'utf8'
    )
  );
  const proofConfigBytes = readOrdinaryFile(
    normalized.proofParentConfigPath,
    'Mode 1 proof-parent config'
  );
  if (
    hash(proofConfigBytes) !== normalized.proofParentConfigSha256 ||
    JSON.stringify(canonical(JSON.parse(proofConfigBytes.toString('utf8')))) !==
      JSON.stringify(canonical(manifest.proofParentConfig))
  )
    throw new Error('Mode 1 proof-parent config differs from its manifest');
  if (
    manifest.runId !== normalized.runId ||
    manifest.gitHistory?.evidencePath !== normalized.gitEvidencePath ||
    manifest.paths?.helperReadyFile !== normalized.helperReadyFile ||
    manifest.paths?.stateRoot !== normalized.scratchParent ||
    manifest.paths?.logRoot !== inherited.SEERR_VALIDATION_LOG_DIR
  )
    throw new Error('Mode 1 request and containment manifest differ');
  const helperReady = JSON.parse(
    readOrdinaryFile(
      normalized.helperReadyFile,
      'Mode 1 helper readiness'
    ).toString('utf8')
  );
  if (!Number.isSafeInteger(helperReady.parentPid) || helperReady.parentPid < 1)
    throw new Error('Mode 1 proof parent PID is absent from readiness');
  const proof = createDistributedLinuxProofSocketAdapter({
    runCommand: runDistributedLinuxProofClientCommand,
    python: manifest.proof.binaries.python,
    scriptPath: manifest.inner.parentScript,
    socketPath: manifest.paths.proofSocket,
    parentPid: helperReady.parentPid,
  });
  const callbacks = createMode1LinuxHostContainmentCallbacks(manifest, {
    fs: {
      readFile: async (file) => readOrdinaryFile(file, 'Containment evidence'),
      appendJsonLine: async (file, value) =>
        appendJsonLineNoFollow(file, canonicalBytes(value)),
    },
    process: {
      probe: (descriptor) => runProbe(descriptor),
    },
    proof,
    gitHistory: {
      verifyEvidence: verifyMode1LocalGitEvidence,
    },
  });
  return Object.freeze({
    runId: normalized.runId,
    scratchParent: normalized.scratchParent,
    callbacks,
    prerequisiteReferences: Object.freeze({
      codeqlModels: normalized.codeqlModelsPath,
      playwrightBrowsers: normalized.playwrightBrowsersPath,
      cypressCache: normalized.cypressCachePath,
    }),
  });
}
