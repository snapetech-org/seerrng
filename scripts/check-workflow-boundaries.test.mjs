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

const assertHostedRunner = (runner, expectedLabel, context) => {
  assert.equal(runner, expectedLabel, context);
  assert.doesNotMatch(runner, /self-hosted|ng-shared-main-jit|private-apple/u);
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

test('hosted runners are the default and gVisor smoke is the only JIT exception', () => {
  const workflowsDirectory = path.join(rootDirectory, '.github', 'workflows');
  const gvisor = yaml.load(
    fs.readFileSync(
      path.join(workflowsDirectory, 'gvisor-runner-smoke.yml'),
      'utf8'
    )
  );
  assert.deepEqual(gvisor.jobs.smoke['runs-on'], {
    group: 'gvisor-sandbox',
    labels: 'gvisor-sandbox',
  });

  const forkSafe = yaml.load(
    fs.readFileSync(
      path.join(workflowsDirectory, 'fork-safe-validation.yml'),
      'utf8'
    )
  );
  const forkJob = forkSafe.jobs['test-build'];
  const forkCheckout = forkJob.steps.find((step) => step.name === 'Checkout');
  assert.equal(forkJob['runs-on'], 'ubuntu-24.04');
  assert.equal(forkSafe.permissions.contents, 'read');
  assert.equal(forkJob.permissions.contents, 'read');
  assert.match(
    forkJob.if,
    /github\.event\.pull_request\.head\.repo\.fork == true/u
  );
  assert.match(forkJob.if, /github\.event\.pull_request\.base\.ref == 'main'/u);
  assert.doesNotMatch(forkJob.if, /github\.actor|labels|pool:/u);
  assert.equal(
    forkCheckout.with.ref,
    '${{ github.event.pull_request.head.sha }}'
  );
  assert.equal(forkCheckout.with['persist-credentials'], false);
  assert.doesNotMatch(JSON.stringify(forkSafe), /secrets\./u);

  for (const fileName of fs
    .readdirSync(workflowsDirectory)
    .filter(
      (name) => /\.ya?ml$/u.test(name) && name !== 'gvisor-runner-smoke.yml'
    )) {
    const source = fs.readFileSync(
      path.join(workflowsDirectory, fileName),
      'utf8'
    );
    assert.match(
      source,
      /^# ng-runner-policy: github-hosted-primary-v1/mu,
      fileName
    );
    const workflow = yaml.load(source);
    for (const [jobName, job] of Object.entries(workflow.jobs ?? {})) {
      const runner = job?.['runs-on'];
      if (runner === undefined) continue;
      assert.equal(typeof runner, 'string', `${fileName}/${jobName}`);
      assert.doesNotMatch(
        runner,
        /self-hosted|ng-shared-main-jit|private-apple-builds|packer-windows/u,
        `${fileName}/${jobName}`
      );
    }
  }
});

test('CodeQL workflow invocations are disabled', () => {
  const workflowsDirectory = path.join(rootDirectory, '.github', 'workflows');
  const codeqlConfigurationDirectory = path.join(
    rootDirectory,
    '.github',
    'codeql'
  );
  const containsFiles = (directory) =>
    fs.readdirSync(directory, { withFileTypes: true }).some((entry) => {
      const entryPath = path.join(directory, entry.name);
      return (
        entry.isFile() ||
        entry.isSymbolicLink() ||
        (entry.isDirectory() && containsFiles(entryPath))
      );
    });
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
    fs.existsSync(codeqlConfigurationDirectory) &&
      containsFiles(codeqlConfigurationDirectory),
    false
  );

  const workflowSources = fs
    .readdirSync(workflowsDirectory)
    .filter((fileName) => /\.ya?ml$/u.test(fileName))
    .map((fileName) =>
      fs.readFileSync(path.join(workflowsDirectory, fileName), 'utf8')
    );
  assert.ok(
    workflowSources.every(
      (source) =>
        !source.includes('github/codeql-action/') &&
        !/setup-codeql|security-events:\s*write/iu.test(source)
    )
  );

  const dependabot = fs.readFileSync(
    path.join(rootDirectory, '.github', 'dependabot.yml'),
    'utf8'
  );
  assert.doesNotMatch(dependabot, /codeql/iu);

  const matrixSuffix = '${{ matrix.suffix }}';
  for (const [fileName, artifactPrefix] of [
    ['ci.yml', 'trivy-main'],
    ['release.yml', 'trivy-release'],
    ['trivy-scan.yml', 'trivy'],
  ]) {
    const source = fs.readFileSync(
      path.join(workflowsDirectory, fileName),
      'utf8'
    );
    assert.match(source, /actions\/upload-artifact@/u, fileName);
    assert.ok(
      source.includes(`name: ${artifactPrefix}-${matrixSuffix}-sarif`),
      `${fileName} must name the retained report artifact`
    );
    assert.ok(
      source.includes(`path: ${artifactPrefix}-${matrixSuffix}.sarif`),
      `${fileName} must retain the SARIF output`
    );
  }
});

test('unit-test shards use GitHub-hosted runners', () => {
  const ciWorkflow = yaml.load(
    fs.readFileSync(
      path.join(rootDirectory, '.github', 'workflows', 'ci.yml'),
      'utf8'
    )
  );
  const runner = ciWorkflow.jobs['unit-test']?.['runs-on'];
  assertHostedRunner(runner, 'ubuntu-24.04', 'unit-test');
  assert.equal(ciWorkflow.on.push, undefined);
  assert.equal(Object.hasOwn(ciWorkflow.on, 'pull_request'), false);
  assert.deepEqual(ciWorkflow.on.pull_request_target.branches, ['main']);
  assert.deepEqual(ciWorkflow.on.pull_request_target.types, ['labeled']);
  assert.deepEqual(ciWorkflow.on.workflow_dispatch.inputs.runner_pool.options, [
    'public',
  ]);
  assert.deepEqual(ciWorkflow.on.workflow_dispatch.inputs.action.options, [
    'ci',
    'publish-image',
  ]);
  assert.equal(ciWorkflow.jobs['unit-test']?.strategy?.['max-parallel'], 4);
  assert.equal(ciWorkflow.jobs['preflight-deploy'], undefined);
  assert.equal(ciWorkflow.jobs['deploy-main'], undefined);
});

test('owner PR validation is metadata-only, main-pinned, and exact-SHA', () => {
  const workflowSource = fs.readFileSync(
    path.join(rootDirectory, '.github', 'workflows', 'ci.yml'),
    'utf8'
  );
  const ciWorkflow = yaml.load(workflowSource);
  const workflowInputs = ciWorkflow.on.workflow_dispatch.inputs;
  const dispatcher = ciWorkflow.jobs['dispatch-owner-pr'];
  const reporter = ciWorkflow.jobs['report-owner-pr-check'];

  assert.match(
    ciWorkflow['run-name'],
    /owner-pr:\{0\}:\{1\}:\{2\}:action:\{3\}:pool:\{4\}/u
  );
  assert.equal(workflowInputs.pr_number.required, false);
  assert.equal(workflowInputs.pr_sha.required, false);
  assert.equal(workflowInputs.target_run_id.required, false);
  assert.match(dispatcher.if, /github\.actor == 'snapetech'/u);
  assert.match(dispatcher.if, /github\.event\.action == 'labeled'/u);
  assert.match(dispatcher.if, /github\.event\.label\.name == 'action:ci'/u);
  assert.match(
    dispatcher.if,
    /github\.event\.pull_request\.user\.login == 'snapetech'/u
  );
  assert.match(
    dispatcher.if,
    /github\.event\.pull_request\.head\.repo\.id == github\.repository_id/u
  );
  assert.match(
    dispatcher.if,
    /github\.event\.pull_request\.base\.ref == 'main'/u
  );
  assert.match(
    dispatcher.if,
    /contains\(github\.event\.pull_request\.labels\.\*\.name, 'action:ci'\)/u
  );
  assert.match(
    dispatcher.if,
    /contains\(github\.event\.pull_request\.labels\.\*\.name, 'pool:public'\)/u
  );
  assert.deepEqual(dispatcher.permissions, {
    actions: 'write',
    contents: 'none',
  });
  assertHostedRunner(dispatcher['runs-on'], 'ubuntu-24.04', 'dispatcher');
  assert.doesNotMatch(
    JSON.stringify(dispatcher),
    /actions\/checkout|secrets\./u
  );
  assert.match(dispatcher.steps[0].run, /"ref": "main"/u);
  assert.match(
    dispatcher.steps[0].run,
    /actions\/workflows\/ci\.yml\/dispatches/u
  );
  assert.match(dispatcher.steps[0].run, /"action": "ci"/u);
  assert.match(dispatcher.steps[0].run, /"runner_pool": "public"/u);
  assert.equal(
    dispatcher.steps[0].env.PR_LABELS_JSON,
    '${{ toJSON(github.event.pull_request.labels.*.name) }}'
  );
  assert.match(
    dispatcher.steps[0].run,
    /action_labels != \["action:ci"\] or pool_labels != \["pool:public"\]/u
  );

  const exactShaJobs = [
    'i18n-and-tooling',
    'test',
    'node-test',
    'jellyfin-plugin',
    'playwright',
  ];
  for (const jobId of exactShaJobs) {
    const job = ciWorkflow.jobs[jobId];
    const checkout = job.steps.find((step) => step.name === 'Checkout');
    assert.match(job.if, /github\.actor == 'github-actions\[bot\]'/u, jobId);
    assert.match(checkout.with.ref, /inputs\.pr_sha/u, jobId);
    assert.equal(checkout.with['persist-credentials'], false, jobId);
    assertHostedRunner(job['runs-on'], 'ubuntu-24.04', jobId);
  }

  const unitTest = ciWorkflow.jobs['unit-test'];
  assertHostedRunner(unitTest['runs-on'], 'ubuntu-24.04', 'unit-test');
  assert.deepEqual(
    unitTest.strategy.matrix.include.map((shard) => shard.shard),
    [1, 2, 3, 4]
  );
  const contract = ciWorkflow.jobs['release-notes'];
  assert.match(contract.if, /inputs\.pr_sha != ''/u);
  const contractTooling = contract.steps.find(
    (step) => step.name === 'Checkout release validation tooling'
  );
  assert.equal(contractTooling.with.ref, '${{ github.sha }}');
  assert.equal(contractTooling.with.path, '.ci-release-tooling');
  assert.equal(contractTooling.with['persist-credentials'], false);
  assert.match(
    contract.steps.find((step) => step.name === 'Checkout').with.ref,
    /inputs\.pr_sha/u
  );
  assert.equal(
    contract.steps.find(
      (step) => step.name === 'Resolve validation range and PR body'
    ).run,
    'node .ci-release-tooling/scripts/prepare-release-note-validation.mjs'
  );

  const reusableOwnerPrChecks = [
    ['cypress', 'cypress.yml', 'cypress-run'],
    ['test-docs', 'test-docs.yml', 'test-build'],
    ['docs-links', 'docs-link-check.yml', 'link-check'],
    ['helm', 'lint-helm-charts.yml', 'lint-test'],
  ];
  for (const [jobId, workflowFile, reusableJobId] of reusableOwnerPrChecks) {
    const callerJob = ciWorkflow.jobs[jobId];
    const reusableWorkflow = yaml.load(
      fs.readFileSync(
        path.join(rootDirectory, '.github', 'workflows', workflowFile),
        'utf8'
      )
    );
    const reusableJob = reusableWorkflow.jobs[reusableJobId];
    const checkout = reusableJob.steps.find((step) => step.name === 'Checkout');

    assert.match(callerJob.if, /inputs\.pr_sha != ''/u, jobId);
    assert.match(callerJob.if, /inputs\.target_run_id != ''/u, jobId);
    assert.match(
      callerJob.if,
      /github\.actor == 'github-actions\[bot\]'/u,
      jobId
    );
    assert.equal(callerJob.with.pr_sha, '${{ inputs.pr_sha }}', jobId);
    assert.equal(
      reusableWorkflow.on.workflow_call.inputs.pr_sha.required,
      false,
      workflowFile
    );
    assert.equal(
      reusableWorkflow.on.workflow_call.inputs.pr_sha.type,
      'string',
      workflowFile
    );
    assert.match(
      checkout.with.ref,
      /inputs\.pr_sha \|\| github\.sha/u,
      workflowFile
    );
    assert.equal(checkout.with['persist-credentials'], false, workflowFile);
    assertHostedRunner(reusableJob['runs-on'], 'ubuntu-24.04', workflowFile);
    if (jobId === 'cypress') {
      const cloudRun = reusableJob.steps.find(
        (step) => step.name === 'Run Cypress suite with Cypress Cloud'
      );
      assert.match(
        cloudRun.env.COMMIT_INFO_SHA,
        /inputs\.pr_sha \|\| github\.sha/u
      );
    }
  }

  assert.equal(reporter.name, 'Report trusted owner PR validation');
  assert.deepEqual(reporter.needs, [
    'release-notes',
    'helm',
    'i18n-and-tooling',
    'test',
    'unit-test',
    'node-test',
    'jellyfin-plugin',
    'playwright',
    'cypress',
    'test-docs',
    'docs-links',
  ]);
  assert.match(reporter.if, /always\(\)/u);
  assert.match(reporter.if, /github\.actor == 'github-actions\[bot\]'/u);
  assert.deepEqual(reporter.permissions, {
    checks: 'write',
    contents: 'none',
  });
  assertHostedRunner(reporter['runs-on'], 'ubuntu-24.04', 'owner PR reporter');
  assert.doesNotMatch(JSON.stringify(reporter), /actions\/checkout|secrets\./u);
  assert.match(reporter.steps[0].env.PR_SHA, /inputs\.pr_sha/u);
  assert.match(
    reporter.steps[0].env.VALIDATION_RESULT,
    /needs\.test\.result == 'success'/u
  );
  for (const jobId of [
    'release-notes',
    'helm',
    'cypress',
    'test-docs',
    'docs-links',
  ]) {
    const needsReference = jobId.includes('-')
      ? `needs\\['${jobId}'\\]`
      : `needs\\.${jobId}`;
    assert.match(
      reporter.steps[0].env.VALIDATION_RESULT,
      new RegExp(`${needsReference}\\.result == 'success'`, 'u')
    );
  }
  assert.match(reporter.steps[0].run, /"name": "SeerrNG owner PR validation"/u);
  assert.match(reporter.steps[0].run, /actions\/runs\//u);
});

test('main validation and image scanning use GitHub-hosted runners', () => {
  const workflowsDirectory = path.join(rootDirectory, '.github', 'workflows');
  const ciWorkflow = yaml.load(
    fs.readFileSync(path.join(workflowsDirectory, 'ci.yml'), 'utf8')
  );
  for (const jobName of ['release-notes', 'scan-main-image']) {
    const runner = ciWorkflow.jobs[jobName]?.['runs-on'];
    assertHostedRunner(runner, 'ubuntu-24.04', jobName);
  }
  for (const [workflowName, jobName] of [
    ['semgrep-community.yml', 'semgrep'],
  ]) {
    const scanWorkflow = yaml.load(
      fs.readFileSync(path.join(workflowsDirectory, workflowName), 'utf8')
    );
    const runner = scanWorkflow.jobs[jobName]?.['runs-on'];
    assertHostedRunner(runner, 'ubuntu-24.04', workflowName);
    assert.deepEqual(
      scanWorkflow.on.workflow_dispatch.inputs.runner_pool_tag.options,
      ['public']
    );
  }
  const semgrep = fs.readFileSync(
    path.join(workflowsDirectory, 'semgrep-community.yml'),
    'utf8'
  );
  assert.match(semgrep, /docker info/u);
  assert.match(semgrep, /docker run/u);
});

test('only the explicit gVisor smoke workflow uses a private runner', () => {
  const workflowsDirectory = path.join(rootDirectory, '.github', 'workflows');
  const gvisor = yaml.load(
    fs.readFileSync(
      path.join(workflowsDirectory, 'gvisor-runner-smoke.yml'),
      'utf8'
    )
  );
  assert.deepEqual(gvisor.jobs.smoke['runs-on'], {
    group: 'gvisor-sandbox',
    labels: 'gvisor-sandbox',
  });
  let privateRunnerCount = 0;
  for (const filename of fs
    .readdirSync(workflowsDirectory)
    .filter((name) => /\.ya?ml$/u.test(name))) {
    const workflow = yaml.load(
      fs.readFileSync(path.join(workflowsDirectory, filename), 'utf8')
    );
    for (const [jobName, job] of Object.entries(workflow.jobs ?? {})) {
      const runner = job?.['runs-on'];
      if (runner === undefined) continue;
      if (filename === 'gvisor-runner-smoke.yml') {
        assert.deepEqual(runner, {
          group: 'gvisor-sandbox',
          labels: 'gvisor-sandbox',
        });
        privateRunnerCount += 1;
        continue;
      }
      assert.equal(typeof runner, 'string', `${filename}/${jobName}`);
      assert.doesNotMatch(
        runner,
        /self-hosted|ng-shared-main-jit|private-apple-builds|packer-windows/u,
        `${filename}/${jobName}`
      );
    }
  }
  assert.equal(privateRunnerCount, 1);
});

test('credentialed chart publication uses a GitHub-hosted runner', () => {
  const helmWorkflow = yaml.load(
    fs.readFileSync(
      path.join(rootDirectory, '.github', 'workflows', 'helm.yml'),
      'utf8'
    )
  );
  const publisher = helmWorkflow.jobs.publish;
  assertHostedRunner(publisher?.['runs-on'], 'ubuntu-24.04', 'Helm publisher');
  assert.equal(publisher.permissions.packages, 'write');
});
