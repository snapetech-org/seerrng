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

const expectedHeadOid = 'a'.repeat(40);
const headBranch = 'renovate/workflow-boundary-fixture';
const headRepository = 'snapetech/seerrng';

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

test('CodeQL models the awaited image cache validation barrier', () => {
  const codeqlWorkflow = yaml.load(
    fs.readFileSync(
      path.join(rootDirectory, '.github', 'workflows', 'codeql.yml'),
      'utf8'
    )
  );
  const codeqlModelDirectory = path.join(
    rootDirectory,
    '.github',
    'codeql',
    'model-pack'
  );
  const modelPack = yaml.load(
    fs.readFileSync(path.join(codeqlModelDirectory, 'qlpack.yml'), 'utf8')
  );
  const securityModels = yaml.load(
    fs.readFileSync(
      path.join(codeqlModelDirectory, 'models', 'security.yml'),
      'utf8'
    )
  );
  const modelPackReference = codeqlWorkflow.jobs.analyze.steps.find(
    (step) => step.name === 'Initialize CodeQL'
  ).with.packs;
  const imageCacheBarriers = securityModels.extensions
    .filter(({ addsTo }) => addsTo.extensible === 'barrierModel')
    .flatMap(({ data }) => data)
    .filter(([module]) => module === '@server/lib/imageproxy');

  assert.ok(
    modelPackReference.includes(
      `snapetech/seerrng-codeql-models@${modelPack.version}`
    )
  );
  assert.deepEqual(
    imageCacheBarriers.sort(([left], [right]) => left.localeCompare(right)),
    [
      [
        '@server/lib/imageproxy',
        'Member[prepareRasterImageForCache].ReturnValue.Awaited',
        'http-to-file-access',
      ],
      [
        '@server/lib/imageproxy',
        'Member[prepareRasterImageForCache].ReturnValue.Awaited.Member[buffer]',
        'http-to-file-access',
      ],
    ].sort(([left], [right]) => left.localeCompare(right))
  );
});

test('unit-test pull requests stay on hosted runners', () => {
  const ciWorkflow = yaml.load(
    fs.readFileSync(
      path.join(rootDirectory, '.github', 'workflows', 'ci.yml'),
      'utf8'
    )
  );
  const runner = ciWorkflow.jobs['unit-test']?.['runs-on'];
  const mainRunnerCondition =
    "((github.event_name == 'push' && github.ref == 'refs/heads/main') || " +
    "(github.event_name == 'workflow_dispatch' && github.ref == 'refs/heads/main'))";
  const trustedRunnerJson =
    '{"group":"trusted-main","labels":["self-hosted","Linux","X64","host"]}';
  const expectedRunner =
    '$' +
    '{{ (' +
    mainRunnerCondition +
    " && vars.TRUSTED_MAIN_RUNNERS_ENABLED == 'true') && fromJSON('" +
    trustedRunnerJson +
    "') || 'ubuntu-latest' }}";
  assert.equal(runner, expectedRunner);
});
