import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
// eslint-disable-next-line no-relative-import-paths/no-relative-import-paths -- These focused tests run in native Node without application aliases.
import {
  persistControllerConfigFile,
  readControllerConfigFile,
} from '../tools/validation-engine/runtime/distributed-linux-config.mjs';
import { dispatchDistributedLinuxPublicRun } from './run-local-validation.mjs';

const cli = fileURLToPath(
  new URL('./run-local-validation.mjs', import.meta.url)
);
const repositoryRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));

function runCli(args, { env = process.env } = {}) {
  return spawnSync(process.execPath, [cli, ...args], {
    encoding: 'utf8',
    env,
    timeout: 30_000,
  });
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'seerrng-mode3-cli-'));
  const configRoot = join(root, 'config');
  const stateRoot = join(root, 'state');
  const logRoot = join(root, 'log');
  for (const directory of [configRoot, stateRoot, logRoot])
    mkdirSync(directory);
  return {
    root,
    configRoot,
    stateRoot,
    logRoot,
    cleanup() {
      rmSync(root, { recursive: true, force: true });
    },
  };
}

test('help marks Mode 3 network operations as disabled', () => {
  const result = runCli(['--help']);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /--distributed-configure-controller/);
  assert.match(result.stdout, /--distributed-configure-node/);
  assert.match(result.stdout, /--distributed-controller-service/);
  assert.match(result.stdout, /--distributed-run/);
  assert.match(result.stdout, /--distributed-node/);
  assert.match(result.stdout, /--distributed-node-thread-policy/);
  assert.match(result.stdout, /--distributed-applications/);
  assert.match(result.stdout, /--distributed-app-add/);
  assert.match(result.stdout, /--distributed-app-delete/);
  assert.match(result.stdout, /--distributed-dependency-plan/);
  assert.match(result.stdout, /--distributed-dependency-report/);
  assert.doesNotMatch(
    result.stdout,
    /--distributed-applications .*\(disabled\)|--distributed-dependency-plan .*\(disabled\)/
  );
  assert.match(result.stdout, /--app ID=ABSOLUTE_ROOT/);
  assert.match(result.stdout, /Mode 3 network operations are disabled/);
  assert.match(
    result.stdout,
    /--distributed-controller-service[\s\S]*disabled/
  );
  assert.doesNotMatch(result.stdout, /--distributed-contained-run/);
});

test('README documents the disabled Mode 3 entry points and security boundary', () => {
  const readme = readFileSync(
    resolve(repositoryRoot, 'tools/validation-engine/README.md'),
    'utf8'
  );
  assert.match(
    readme,
    /The CLI disables Mode 3 enrollment, listeners, dependency reporting, and\s+distributed test execution/
  );
  assert.match(
    readme,
    /before reading active configuration paths or\s+opening\s+sockets/
  );
  assert.match(readme, /not an OS sandbox/);
  assert.doesNotMatch(readme, /pnpm validate:development .*--distributed-/);
  assert.doesNotMatch(
    readme,
    /node bin\/run-local-validation\.mjs --distributed-/
  );
  const result = runCli(['--help']);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Mode 3 network operations are disabled/);
});

test('package validation entry rejects distributed operations before path validation', () => {
  const result = runCli([
    '--package-entry',
    '--distributed-controller-service',
  ]);
  assert.equal(result.status, 1);
  assert.match(
    result.stderr,
    /Mode 3 is dormant and unavailable through pnpm validate:development/
  );
  assert.doesNotMatch(result.stderr, /requires --active-config-marker/);
});

test('internal contained mode stays hidden and is disabled at its entrypoint', (t) => {
  const paths = fixture();
  t.after(paths.cleanup);
  const missingRequest = join(
    paths.stateRoot,
    'missing-contained-request.json'
  );
  const result = runCli([
    '--distributed-contained-run',
    '--request-file',
    missingRequest,
  ]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Mode 3 network operations are disabled/);

  const override = runCli([
    '--distributed-contained-run',
    '--request-file',
    missingRequest,
    '--thread-rule',
    '2n',
  ]);
  assert.equal(override.status, 1);
  assert.match(
    override.stderr,
    /Internal distributed contained run mode does not accept --thread-rule/
  );
});

test('distributed production mode requires one application and rejects override options', (t) => {
  const paths = fixture();
  t.after(paths.cleanup);
  const marker = join(paths.stateRoot, 'active-controller');
  writeFileSync(marker, 'focused-controller.cfg\n');
  const base = [
    '--distributed-run',
    '--active-config-marker',
    marker,
    '--state-root',
    paths.stateRoot,
    '--log-root',
    paths.logRoot,
  ];

  const missing = runCli(base);
  assert.equal(missing.status, 1);
  assert.match(
    missing.stderr,
    /Distributed production run mode requires --application/
  );

  const multiple = runCli([
    ...base,
    '--application',
    '01',
    '--application',
    '02',
  ]);
  assert.equal(multiple.status, 1);
  assert.match(multiple.stderr, /requires exactly one --application/);

  const threadOverride = runCli([
    ...base,
    '--application',
    '01',
    '--thread-rule',
    '2n',
  ]);
  assert.equal(threadOverride.status, 1);
  assert.match(
    threadOverride.stderr,
    /Distributed production run mode does not accept --thread-rule/
  );

  const relativeState = runCli([
    '--distributed-run',
    '--active-config-marker',
    marker,
    '--state-root',
    'relative-state',
    '--log-root',
    paths.logRoot,
    '--application',
    '01',
  ]);
  assert.equal(relativeState.status, 1);
  assert.match(relativeState.stderr, /Mode 3 network operations are disabled/);
});

test('distributed public dispatch derives and seals the minimal run request', async (t) => {
  const paths = fixture();
  t.after(paths.cleanup);
  const marker = join(paths.stateRoot, 'active-controller');
  writeFileSync(marker, 'focused-controller.cfg\n');
  const signal = new AbortController().signal;
  let received;
  const execution = await dispatchDistributedLinuxPublicRun(
    {
      activeConfigMarkerPath: marker,
      applicationEntryId: '01',
      logRoot: paths.logRoot,
      sourceRoot: repositoryRoot,
      stateRoot: paths.stateRoot,
      signal,
    },
    {
      uniqueId: () => '00000000-0000-4000-8000-000000000001',
      executeLifecycle: async (request) => {
        received = request;
        return Object.freeze({
          runId: request.runId,
          status: 'passed',
        });
      },
    }
  );

  assert.deepEqual(Object.keys(received).sort(), [
    'activeConfigMarkerPath',
    'applicationEntryId',
    'logRoot',
    'runId',
    'runtimeApplicationKey',
    'signal',
    'sourceRoot',
    'stateRoot',
  ]);
  assert.equal(received.activeConfigMarkerPath, marker);
  assert.equal(received.applicationEntryId, '01');
  assert.equal(received.logRoot, paths.logRoot);
  assert.equal(received.runId, 'mode3-00000000-0000-4000-8000-000000000001');
  assert.equal(received.runtimeApplicationKey, 'seerrng');
  assert.equal(received.signal, signal);
  assert.equal(received.sourceRoot, repositoryRoot);
  assert.equal(received.stateRoot, paths.stateRoot);
  assert.equal(Object.isFrozen(received), true);
  assert.equal(execution.request, received);
  assert.equal(execution.result.status, 'passed');
});

test('distributed public dispatch fails closed before or after the lifecycle seam', async (t) => {
  const paths = fixture();
  t.after(paths.cleanup);
  const marker = join(paths.stateRoot, 'active-controller');
  writeFileSync(marker, 'focused-controller.cfg\n');
  let calls = 0;
  const common = {
    activeConfigMarkerPath: marker,
    applicationEntryId: '01',
    logRoot: paths.logRoot,
    sourceRoot: repositoryRoot,
    stateRoot: paths.stateRoot,
  };
  const dependencies = {
    uniqueId: () => '00000000-0000-4000-8000-000000000002',
    executeLifecycle: async (request) => {
      calls += 1;
      return { runId: request.runId, status: 'incomplete' };
    },
  };

  await assert.rejects(
    dispatchDistributedLinuxPublicRun(
      { ...common, stateRoot: 'relative-state' },
      dependencies
    ),
    /State root must be an absolute canonical directory/
  );
  assert.equal(calls, 0);

  if (process.platform === 'win32') {
    await assert.rejects(
      dispatchDistributedLinuxPublicRun(
        { ...common, stateRoot: common.stateRoot.replaceAll('\\', '\\\\') },
        dependencies
      ),
      /State root must be an absolute canonical directory/
    );
    assert.equal(calls, 0);
  }

  await assert.rejects(
    dispatchDistributedLinuxPublicRun(common, dependencies),
    /did not return the exact passing run result/
  );
  assert.equal(calls, 1);
});

test('dependency planning requires entries or all, never both', (t) => {
  const paths = fixture();
  t.after(paths.cleanup);
  const marker = join(paths.stateRoot, 'active-controller');
  const neither = runCli([
    '--distributed-dependency-plan',
    '--active-config-marker',
    marker,
    '--json',
  ]);
  assert.equal(neither.status, 1);
  assert.match(
    neither.stderr,
    /exactly one of --application or --all-applications/
  );

  const both = runCli([
    '--distributed-dependency-plan',
    '--active-config-marker',
    marker,
    '--application',
    '01',
    '--all-applications',
    '--json',
  ]);
  assert.equal(both.status, 1);
  assert.match(
    both.stderr,
    /exactly one of --application or --all-applications/
  );
});

test('node thread-policy assignment requires a complete policy tuple', (t) => {
  const paths = fixture();
  t.after(paths.cleanup);
  const result = runCli([
    '--distributed-node-thread-policy',
    '--active-config-marker',
    join(paths.stateRoot, 'active-controller'),
    '--node-id',
    '01',
    '--thread-rule',
    'n-1',
  ]);
  assert.equal(result.status, 1);
  assert.match(
    result.stderr,
    /requires node ID, thread rule, and minimum thread count together/
  );
});

test('node thread-policy CLI lists and updates an enrolled controller node', (t) => {
  const paths = fixture();
  t.after(paths.cleanup);
  const controllerPath = join(
    paths.configRoot,
    'test-suite-multi-computer-CliTester.cfg'
  );
  const marker = join(paths.stateRoot, 'active-controller');
  persistControllerConfigFile(controllerPath, {
    global: {
      githubUsername: 'CliTester',
      computerName: 'Focused controller',
      ipAddress: '127.0.0.1',
      port: 62021,
      cpuName: 'Focused controller CPU',
      availableThreads: 12,
      threads: '2n',
      minimumThreadCount: 1,
    },
    nodes: [
      {
        nodeNumber: '01',
        computerName: 'Focused node',
        ipAddress: '127.0.0.2',
        port: 62021,
        cpuName: 'Focused node CPU',
        availableThreads: 8,
        threads: null,
        minimumThreadCount: null,
      },
    ],
    sharedAuthenticationKey: 'a'.repeat(64),
  });
  writeFileSync(marker, `${controllerPath}\n`, { mode: 0o600 });

  const listed = runCli([
    '--distributed-node-thread-policy',
    '--active-config-marker',
    marker,
    '--json',
  ]);
  assert.equal(listed.status, 0, listed.stderr);
  assert.equal(JSON.parse(listed.stdout).nodes[0].threads, null);

  const updated = runCli([
    '--distributed-node-thread-policy',
    '--active-config-marker',
    marker,
    '--node-id',
    '01',
    '--thread-rule',
    'n-2',
    '--minimum-thread-count',
    '2',
    '--json',
  ]);
  assert.equal(updated.status, 0, updated.stderr);
  assert.deepEqual(JSON.parse(updated.stdout).node, {
    ...readControllerConfigFile(controllerPath).nodes[0],
  });
  assert.equal(
    readControllerConfigFile(controllerPath).nodes[0].threads,
    'n-2'
  );
});

test(
  'Windows package-script path transport restores only fully doubled separators',
  { skip: process.platform !== 'win32' },
  (t) => {
    const paths = fixture();
    t.after(paths.cleanup);
    const controllerPath = join(
      paths.configRoot,
      'test-suite-multi-computer-CliTransport.cfg'
    );
    const marker = join(paths.stateRoot, 'active-controller');
    persistControllerConfigFile(controllerPath, {
      global: {
        githubUsername: 'CliTransport',
        computerName: 'Transport controller',
        ipAddress: '127.0.0.1',
        port: 62021,
        cpuName: 'Transport controller CPU',
        availableThreads: 12,
        threads: '2n',
        minimumThreadCount: 1,
      },
      nodes: [],
      sharedAuthenticationKey: 'a'.repeat(64),
    });
    writeFileSync(marker, `${controllerPath}\n`, { mode: 0o600 });

    const doubledMarker = marker.replaceAll('\\', '\\\\');
    const doubledArguments = [
      '--distributed-node-thread-policy',
      '--active-config-marker',
      doubledMarker,
      '--json',
    ];
    const directEnvironment = { ...process.env };
    delete directEnvironment.npm_config_user_agent;
    delete directEnvironment.npm_execpath;
    delete directEnvironment.npm_lifecycle_event;
    const pnpmEnvironment = {
      ...directEnvironment,
      npm_config_user_agent: 'pnpm/10.24.0 npm/? node/v24.19.0 win32 x64',
      npm_lifecycle_event: 'validate:development',
    };
    const restored = runCli(doubledArguments, {
      env: pnpmEnvironment,
    });
    assert.equal(restored.status, 0, restored.stderr);
    assert.deepEqual(JSON.parse(restored.stdout), { nodes: [] });

    const direct = runCli(doubledArguments, { env: directEnvironment });
    assert.equal(direct.status, 1);
    assert.match(direct.stderr, /absolute canonical file path/);

    // Deliberately duplicate exactly one separator for the rejection case.
    const firstSeparator = marker.indexOf('\\');
    assert.notEqual(firstSeparator, -1);
    const partlyDoubledMarker =
      marker.slice(0, firstSeparator + 1) +
      '\\' +
      marker.slice(firstSeparator + 1);
    assert.notEqual(partlyDoubledMarker, doubledMarker);
    const rejected = runCli(
      [
        '--distributed-node-thread-policy',
        '--active-config-marker',
        partlyDoubledMarker,
        '--json',
      ],
      { env: pnpmEnvironment }
    );
    assert.equal(rejected.status, 1);
    assert.match(rejected.stderr, /absolute canonical file path/);
  }
);

test('Mode 3 network CLI modes fail closed before path access or socket creation', (t) => {
  const paths = fixture();
  t.after(paths.cleanup);
  const marker = join(paths.stateRoot, 'missing-active-config');
  const configPath = join(paths.configRoot, 'must-not-be-created.cfg');
  const modes = [
    {
      name: 'node enrollment',
      args: [
        '--distributed-configure-node',
        '--config-file',
        configPath,
        '--node-id',
        '01',
        '--node-name',
        'Synthetic node',
        '--listen-address',
        '127.0.0.1',
        '--listen-port',
        '62021',
        '--controller-address',
        '127.0.0.1',
        '--controller-port',
        '62022',
        '--active-config-marker',
        marker,
        '--state-root',
        paths.stateRoot,
        '--log-root',
        paths.logRoot,
      ],
      status: 1,
    },
    {
      name: 'controller listener',
      args: [
        '--distributed-controller-service',
        '--active-config-marker',
        marker,
        '--state-root',
        paths.stateRoot,
        '--log-root',
        paths.logRoot,
      ],
      status: 0,
      noListener: true,
    },
    {
      name: 'contained run',
      args: [
        '--distributed-contained-run',
        '--request-file',
        join(paths.stateRoot, 'missing-request.json'),
      ],
      status: 1,
    },
    {
      name: 'distributed run',
      args: [
        '--distributed-run',
        '--active-config-marker',
        marker,
        '--state-root',
        paths.stateRoot,
        '--log-root',
        paths.logRoot,
        '--application',
        '01',
      ],
      status: 1,
    },
    {
      name: 'node listener',
      args: [
        '--distributed-node',
        '--active-config-marker',
        marker,
        '--state-root',
        paths.stateRoot,
        '--log-root',
        paths.logRoot,
        '--app',
        `seerrng=${paths.root}`,
      ],
      status: 0,
      noListener: true,
    },
    {
      name: 'dependency reporting',
      args: [
        '--distributed-dependency-report',
        '--active-config-marker',
        marker,
        '--application',
        '01',
        '--dependency',
        'node=24.15.0',
        '--json',
      ],
      status: 1,
    },
  ];

  for (const mode of modes) {
    const result = runCli(mode.args);
    assert.equal(result.status, mode.status, `${mode.name}: ${result.stderr}`);
    assert.match(
      `${result.stdout}${result.stderr}`,
      /Mode 3 network operations are disabled/
    );
    if (mode.noListener) assert.match(result.stdout, /No listener was started/);
  }

  assert.equal(existsSync(configPath), false);
  assert.equal(existsSync(marker), false);
});

test('controller-local application listing and dependency planning stay offline', (t) => {
  const paths = fixture();
  t.after(paths.cleanup);
  const controllerPath = join(
    paths.configRoot,
    'test-suite-multi-computer-CliTester.cfg'
  );
  const marker = join(paths.stateRoot, 'active-controller');
  const sharedKey = 'a'.repeat(64);
  persistControllerConfigFile(controllerPath, {
    global: {
      githubUsername: 'CliTester',
      computerName: 'Focused controller',
      ipAddress: '127.0.0.1',
      port: 62021,
      cpuName: 'Focused controller CPU',
      availableThreads: 12,
      threads: '2n',
      minimumThreadCount: 1,
    },
    nodes: [],
    supportedApplications: [
      {
        entryId: '01',
        applicationId: 'SeerrNG 3.17.0',
        name: 'SeerrNG',
        profilePath: join(
          paths.configRoot,
          'seerrng-test-suite-dependancies.cfg'
        ),
      },
    ],
    applicationRequirements: [
      {
        applicationId: 'SeerrNG 3.17.0',
        dependencies: [
          { name: 'node', version: '24.21.0' },
          { name: 'pnpm', version: '10.24.0' },
        ],
      },
    ],
    nodeDependencyAvailability: [],
    sharedAuthenticationKey: sharedKey,
  });
  writeFileSync(marker, `${controllerPath}\n`, { mode: 0o600 });

  const listing = runCli([
    '--distributed-applications',
    '--active-config-marker',
    marker,
    '--json',
  ]);
  assert.equal(listing.status, 0, listing.stderr);
  assert.equal(JSON.parse(listing.stdout).applications[0].entryId, '01');
  assert.doesNotMatch(listing.stdout, new RegExp(sharedKey));

  const plan = runCli([
    '--distributed-dependency-plan',
    '--active-config-marker',
    marker,
    '--application',
    '01',
    '--json',
  ]);
  assert.equal(plan.status, 0, plan.stderr);
  const dependencyPlan = JSON.parse(plan.stdout);
  assert.equal(dependencyPlan.selectedApplications.length, 1);
  assert.deepEqual(
    dependencyPlan.dependencies.map(({ name, version }) => ({ name, version })),
    [
      { name: 'node', version: '24.21.0' },
      { name: 'pnpm', version: '10.24.0' },
    ]
  );
  assert.doesNotMatch(plan.stdout, new RegExp(sharedKey));
});

test(
  'new configuration modes fail closed outside Linux before touching files',
  { skip: process.platform === 'linux' },
  (t) => {
    const paths = fixture();
    t.after(paths.cleanup);
    const controllerPath = join(
      paths.configRoot,
      'test-suite-multi-computer-CliTester.cfg'
    );
    const result = runCli([
      '--distributed-configure-controller',
      '--config-file',
      controllerPath,
      '--profile',
      'CliTester',
      '--controller-name',
      'Test controller',
      '--listen-address',
      '127.0.0.1',
      '--listen-port',
      '62021',
      '--thread-rule',
      '2n',
      '--minimum-thread-count',
      '1',
      '--active-config-marker',
      join(paths.stateRoot, 'active-controller'),
      '--state-root',
      paths.stateRoot,
      '--log-root',
      paths.logRoot,
    ]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /requires Linux/);
    assert.equal(existsSync(controllerPath), false);
  }
);
