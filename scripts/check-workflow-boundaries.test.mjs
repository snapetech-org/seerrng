import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import * as yaml from 'js-yaml';

const rootDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);
const workflowPath = path.join(
  rootDirectory,
  '.github',
  'workflows',
  'renovate-helm-custom-hooks.yml'
);
const workflow = yaml.load(fs.readFileSync(workflowPath, 'utf8'));
const renderSteps = workflow.jobs.render.steps;
const bumpScript = renderSteps.find(
  (step) => step.name === 'Bump changed chart versions'
).run;
const packageScript = renderSteps.find(
  (step) => step.name === 'Package bounded generated changes'
).run;
const validationScript = workflow.jobs.publish.steps.find(
  (step) => step.name === 'Validate generated change manifest'
).run;

const assertSharedMainJitRunner = (runner, context) => {
  assert.match(runner, /"group":"ng-shared-main-jit"/u, context);
  assert.match(runner, /"ng-shared-main-seerrng"/u, context);
  assert.match(runner, /"ng-main-run-\{0\}"/u, context);
  assert.match(runner, /gha-\{0\}-(?:\{1\}-)?[a-z0-9-]+/u, context);
  assert.match(runner, /github\.run_id/u, context);
  assert.doesNotMatch(
    runner,
    /\|\|\s*(?:matrix\.runner(?:\W|$)|['"](?:ubuntu|macos|windows)-)/u,
    context
  );
};

const expectedHeadOid = 'a'.repeat(40);
const headBranch = 'renovate/workflow-boundary-fixture';
const headRepository = 'snapetech-org/seerrng';

const validManifest = () => ({
  expectedHeadOid,
  repository: headRepository,
  branch: headBranch,
  fileChanges: {
    deletions: [],
    additions: [
      {
        path: 'charts/seerr/Chart.yaml',
        contents: Buffer.from(
          'apiVersion: v2\nname: seerr\nversion: 1.2.3\n',
          'utf8'
        ).toString('base64'),
      },
    ],
  },
});

const runValidator = (manifest, mutateArtifact) => {
  const runnerTemp = fs.mkdtempSync(
    path.join(os.tmpdir(), 'seerr-workflow-boundary-')
  );
  try {
    const artifactDirectory = path.join(runnerTemp, 'renovate-helm-changes');
    fs.mkdirSync(artifactDirectory, { mode: 0o700 });
    fs.writeFileSync(
      path.join(artifactDirectory, 'changes.json'),
      JSON.stringify(manifest),
      { mode: 0o600 }
    );
    mutateArtifact?.(artifactDirectory);

    return spawnSync('bash', ['-c', validationScript], {
      cwd: rootDirectory,
      encoding: 'utf8',
      env: {
        ...process.env,
        EXPECTED_HEAD_OID: expectedHeadOid,
        HEAD_BRANCH: headBranch,
        HEAD_REPOSITORY: headRepository,
        RUNNER_TEMP: runnerTemp,
      },
    });
  } finally {
    fs.rmSync(runnerTemp, { force: true, recursive: true });
  }
};

const assertRejected = (result) => {
  assert.notEqual(
    result.status,
    0,
    `validator unexpectedly accepted the artifact\nstdout: ${result.stdout}\nstderr: ${result.stderr}`
  );
};

const runCommand = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    ...options,
  });
  assert.equal(
    result.status,
    0,
    `${command} ${args.join(' ')} failed\nstdout: ${result.stdout}\nstderr: ${result.stderr}`
  );
  return result;
};

test(
  'publisher accepts a bounded generated-change manifest',
  {
    skip:
      process.platform === 'win32'
        ? 'Git Bash rewrites the embedded jq regular expression; Linux CI runs the publisher acceptance test.'
        : false,
  },
  () => {
    const result = runValidator(validManifest());
    assert.equal(
      result.status,
      0,
      `stdout: ${result.stdout}\nstderr: ${result.stderr}`
    );
  }
);

test('publisher rejects additional artifact entries', () => {
  const result = runValidator(validManifest(), (artifactDirectory) => {
    fs.mkdirSync(path.join(artifactDirectory, 'smuggled-directory'));
  });
  assertRejected(result);
});

test('publisher rejects manifest schema extensions', () => {
  const manifest = validManifest();
  manifest.unvalidated = true;
  assertRejected(runValidator(manifest));
});

test('publisher rejects chart path traversal', () => {
  const manifest = validManifest();
  manifest.fileChanges.additions[0].path = 'charts/../README.md';
  assertRejected(runValidator(manifest));
});

test('publisher rejects malformed base64 contents', () => {
  const manifest = validManifest();
  manifest.fileChanges.additions[0].contents = 'not-valid-base64!';
  assertRejected(runValidator(manifest));
});

test('renderer bumps and packages multiple changed charts', () => {
  const fixtureRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), 'seerr-workflow-render-')
  );
  try {
    const repository = path.join(fixtureRoot, 'repository');
    const runnerTemp = path.join(fixtureRoot, 'runner-temp');
    const binDirectory = path.join(fixtureRoot, 'bin');
    fs.mkdirSync(repository);
    fs.mkdirSync(runnerTemp);
    fs.mkdirSync(binDirectory);

    const chartPath = (name) =>
      path.join(repository, 'charts', name, 'Chart.yaml');
    const writeChart = (name, appVersion) => {
      fs.mkdirSync(path.dirname(chartPath(name)), { recursive: true });
      fs.writeFileSync(
        chartPath(name),
        `apiVersion: v2\nname: ${name}\nappVersion: ${appVersion}\nversion: 1.0.0\n`
      );
      fs.writeFileSync(
        path.join(repository, 'charts', name, 'README.md'),
        `# ${name}\n`
      );
    };

    runCommand('git', ['init', '-q', '-b', 'main'], { cwd: repository });
    runCommand('git', ['config', 'user.email', 'fixture@example.invalid'], {
      cwd: repository,
    });
    runCommand('git', ['config', 'user.name', 'Workflow Fixture'], {
      cwd: repository,
    });
    writeChart('alpha', '1.2.3');
    writeChart('beta', '1.2.3');
    runCommand('git', ['add', 'charts'], { cwd: repository });
    runCommand('git', ['commit', '-q', '-m', 'base'], { cwd: repository });
    const baseCommit = runCommand('git', ['rev-parse', 'HEAD'], {
      cwd: repository,
    }).stdout.trim();
    runCommand('git', ['update-ref', 'refs/remotes/origin/main', baseCommit], {
      cwd: repository,
    });
    runCommand('git', ['switch', '-q', '-c', headBranch], {
      cwd: repository,
    });
    writeChart('alpha', '2.0.0');
    writeChart('beta', '1.3.0');
    runCommand('git', ['add', 'charts'], { cwd: repository });
    runCommand('git', ['commit', '-q', '-m', 'renovate'], {
      cwd: repository,
    });
    const fixtureHead = runCommand('git', ['rev-parse', 'HEAD'], {
      cwd: repository,
    }).stdout.trim();

    const ctPath = path.join(binDirectory, 'ct');
    fs.writeFileSync(
      ctPath,
      "#!/usr/bin/env bash\nset -euo pipefail\nprintf '%s\\n' charts/alpha charts/beta\n",
      { mode: 0o755 }
    );
    const bumpOutput = path.join(fixtureRoot, 'bump-output');
    const environment = {
      ...process.env,
      PATH: `${binDirectory}:${process.env.PATH}`,
      RUNNER_TEMP: runnerTemp,
    };
    runCommand('bash', ['-c', bumpScript], {
      cwd: repository,
      env: {
        ...environment,
        GITHUB_OUTPUT: bumpOutput,
        TARGET_BRANCH: 'main',
      },
    });
    assert.match(fs.readFileSync(bumpOutput, 'utf8'), /^changed=true$/mu);
    assert.match(
      fs.readFileSync(chartPath('alpha'), 'utf8'),
      /^version: 2\.0\.0$/mu
    );
    assert.match(
      fs.readFileSync(chartPath('beta'), 'utf8'),
      /^version: 1\.1\.0$/mu
    );

    const packageOutput = path.join(fixtureRoot, 'package-output');
    runCommand('bash', ['-c', packageScript], {
      cwd: repository,
      env: {
        ...environment,
        EXPECTED_HEAD_OID: fixtureHead,
        GITHUB_OUTPUT: packageOutput,
        HEAD_BRANCH: headBranch,
        HEAD_REPOSITORY: headRepository,
      },
    });
    const outputLines = fs
      .readFileSync(packageOutput, 'utf8')
      .trim()
      .split('\n');
    assert.ok(outputLines.includes('has_changes=true'));
    const artifactPath = outputLines
      .find((line) => line.startsWith('artifact_path='))
      .slice('artifact_path='.length);
    const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
    assert.equal(artifact.expectedHeadOid, fixtureHead);
    assert.deepEqual(
      artifact.fileChanges.additions
        .map(({ path: filePath }) => filePath)
        .sort(),
      ['charts/alpha/Chart.yaml', 'charts/beta/Chart.yaml']
    );
  } finally {
    fs.rmSync(fixtureRoot, { force: true, recursive: true });
  }
});

test('all shared-main JIT workflow jobs have unique job-scoped labels', () => {
  const workflowsDirectory = path.join(rootDirectory, '.github', 'workflows');
  const unscopedJobs = [];
  for (const fileName of fs.readdirSync(workflowsDirectory)) {
    if (!/\.ya?ml$/u.test(fileName)) continue;
    const source = fs.readFileSync(
      path.join(workflowsDirectory, fileName),
      'utf8'
    );
    source.split('\n').forEach((line, index) => {
      if (
        line.includes('runs-on:') &&
        line.includes('ng-main-run-{0}') &&
        !line.includes('gha-{0}-')
      ) {
        unscopedJobs.push(`${fileName}:${index + 1}`);
      }
    });
  }
  assert.deepEqual(unscopedJobs, []);
});

test('CodeQL workflow invocations are disabled', () => {
  const workflowsDirectory = path.join(rootDirectory, '.github', 'workflows');
  assert.equal(
    fs.existsSync(path.join(workflowsDirectory, 'codeql.yml')),
    false
  );
  assert.equal(
    fs.existsSync(
      path.join(workflowsDirectory, 'publish-codeql-model-pack.yml')
    ),
    false
  );
  assert.equal(
    fs.existsSync(path.join(rootDirectory, '.github', 'codeql')),
    false
  );

  const workflowSources = fs
    .readdirSync(workflowsDirectory)
    .filter((fileName) => /\.ya?ml$/u.test(fileName))
    .map((fileName) =>
      fs.readFileSync(path.join(workflowsDirectory, fileName), 'utf8')
    );
  assert.ok(
    workflowSources.every((source) => !source.includes('github/codeql-action/'))
  );
});

test('unit-test shards use private JIT runners with exact-run labels', () => {
  const ciWorkflow = yaml.load(
    fs.readFileSync(
      path.join(rootDirectory, '.github', 'workflows', 'ci.yml'),
      'utf8'
    )
  );
  const runner = ciWorkflow.jobs['unit-test']?.['runs-on'];
  assertSharedMainJitRunner(runner, 'unit-test');
  assert.deepEqual(ciWorkflow.on.push.branches, ['main']);
  assert.equal(Object.hasOwn(ciWorkflow.on, 'pull_request'), false);
  assert.equal(Object.hasOwn(ciWorkflow.on, 'pull_request_target'), false);
  assert.deepEqual(
    ciWorkflow.on.workflow_dispatch.inputs.runner_pool_tag.options,
    ['private']
  );
  assert.equal(ciWorkflow.jobs['unit-test']?.strategy?.['max-parallel'], 4);
  assert.equal(ciWorkflow.jobs['preflight-deploy'], undefined);
  assert.equal(ciWorkflow.jobs['deploy-main'], undefined);
});

test('main validation and image scanning use private JIT runners', () => {
  const workflowsDirectory = path.join(rootDirectory, '.github', 'workflows');
  const ciWorkflow = yaml.load(
    fs.readFileSync(path.join(workflowsDirectory, 'ci.yml'), 'utf8')
  );
  for (const jobName of ['release-notes', 'scan-main-image']) {
    const runner = ciWorkflow.jobs[jobName]?.['runs-on'];
    assertSharedMainJitRunner(runner, jobName);
  }
  for (const [workflowName, jobName] of [
    ['semgrep-community.yml', 'semgrep'],
  ]) {
    const scanWorkflow = yaml.load(
      fs.readFileSync(path.join(workflowsDirectory, workflowName), 'utf8')
    );
    const runner = scanWorkflow.jobs[jobName]?.['runs-on'];
    assertSharedMainJitRunner(runner, workflowName);
    assert.deepEqual(
      scanWorkflow.on.workflow_dispatch.inputs.runner_pool_tag.options,
      ['private']
    );
  }
  const semgrep = fs.readFileSync(
    path.join(workflowsDirectory, 'semgrep-community.yml'),
    'utf8'
  );
  assert.match(semgrep, /docker info/u);
  assert.match(semgrep, /docker run/u);
});

test('shared runner jobs use SeerrNG and exact-run labels', () => {
  const workflowsDirectory = path.join(rootDirectory, '.github', 'workflows');
  let sharedRunnerCount = 0;
  for (const filename of fs
    .readdirSync(workflowsDirectory)
    .filter((name) => /\.ya?ml$/u.test(name))) {
    const workflow = yaml.load(
      fs.readFileSync(path.join(workflowsDirectory, filename), 'utf8')
    );
    for (const [jobName, job] of Object.entries(workflow.jobs ?? {})) {
      const runner = job?.['runs-on'];
      if (
        typeof runner !== 'string' ||
        !runner.includes('ng-shared-main-jit')
      ) {
        continue;
      }
      sharedRunnerCount += 1;
      assertSharedMainJitRunner(runner, `${filename}/${jobName}`);
    }
  }
  assert.ok(sharedRunnerCount > 0);
});

test('credentialed chart publication uses the private JIT pool', () => {
  const helmWorkflow = yaml.load(
    fs.readFileSync(
      path.join(rootDirectory, '.github', 'workflows', 'helm.yml'),
      'utf8'
    )
  );
  const publisher = helmWorkflow.jobs.publish;
  assertSharedMainJitRunner(publisher?.['runs-on'], 'Helm publisher');
  assert.equal(publisher.permissions.packages, 'write');
});
