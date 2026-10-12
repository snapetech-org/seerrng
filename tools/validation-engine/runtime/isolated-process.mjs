import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  realpathSync,
  symlinkSync,
} from 'node:fs';
import path from 'node:path';

const SANDBOX_ROOT = '/mnt/workspace';
const SANDBOX_SCRATCH = '/mnt/scratch';
const SANDBOX_RUN = '/mnt/run-data';
const SENSITIVE_SOURCE_PATH =
  /^(?:config(?:\.[^/]+)?(?:\/|$)|\.git(?:\/|$)|(?:.*\/)?(?:node_modules|\.ssh|\.aws|\.gnupg)(?:\/|$)|(?:.*\/)?(?:id_(?:rsa|ed25519)|credentials?(?:\.[^/]+)?|secrets?(?:\.[^/]+)?|\.git-credentials|\.npmrc|\.pypirc|\.netrc|[^/]+\.(?:pem|key))$)/i;
const SENSITIVE_ENV_PATH = /(?:^|[\\/])\.env(?:$|\.(?!example$))/i;
const SENSITIVE_DATA_EXTENSION =
  /\.(?:json|jsonc|ya?ml|toml|ini|cfg|conf|properties|txt|db|sqlite3?|pem|key)$/i;
const SENSITIVE_DATA_NAME =
  /(?:auth(?:entication)?|config|credentials?|passwords?|private|secrets?|settings?|tokens?)/i;

function isSensitiveSourcePath(relativePath) {
  if (
    SENSITIVE_SOURCE_PATH.test(relativePath) ||
    SENSITIVE_ENV_PATH.test(relativePath)
  )
    return true;
  const basename = relativePath.split(/[\\/]/u).at(-1);
  return (
    SENSITIVE_DATA_EXTENSION.test(basename) &&
    SENSITIVE_DATA_NAME.test(basename)
  );
}

function gitFiles(root) {
  const output = execFileSync(
    'git',
    [
      '-C',
      root,
      'ls-files',
      '--cached',
      '--others',
      '--exclude-standard',
      '-z',
    ],
    { encoding: 'buffer', maxBuffer: 64 * 1024 * 1024 }
  );
  return output.toString('utf8').split('\0').filter(Boolean).sort();
}

function isWithin(root, candidate) {
  const relative = path.relative(root, candidate);
  return (
    relative === '' ||
    (relative !== '..' &&
      !relative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relative))
  );
}

function copyCandidateFile(sourceRoot, targetRoot, relativePath) {
  if (
    path.isAbsolute(relativePath) ||
    relativePath.split(/[\\/]/u).includes('..') ||
    isSensitiveSourcePath(relativePath)
  )
    return;
  const source = path.resolve(sourceRoot, relativePath);
  const target = path.resolve(targetRoot, relativePath);
  if (!target.startsWith(`${targetRoot}${path.sep}`))
    throw new Error('Candidate path escaped the disposable test workspace');

  let ancestor = sourceRoot;
  const components = relativePath.split(/[\\/]/u);
  for (const component of components.slice(0, -1)) {
    ancestor = path.join(ancestor, component);
    if (lstatSync(ancestor).isSymbolicLink())
      throw new Error(
        `Candidate source contains a linked parent: ${relativePath}`
      );
  }
  const stat = lstatSync(source);
  mkdirSync(path.dirname(target), { recursive: true });
  if (stat.isSymbolicLink()) {
    throw new Error(
      `Candidate source contains a symbolic link: ${relativePath}`
    );
  }
  if (!stat.isFile())
    throw new Error(`Candidate source is not a regular file: ${relativePath}`);
  cpSync(source, target, { preserveTimestamps: true });
  chmodSync(target, stat.mode & 0o777);
}

export function createDisposableTestWorkspace(sourceRoot, workspaceRoot) {
  sourceRoot = realpathSync(sourceRoot);
  workspaceRoot = path.resolve(workspaceRoot);
  mkdirSync(workspaceRoot, { recursive: false, mode: 0o700 });
  for (const file of gitFiles(sourceRoot))
    copyCandidateFile(sourceRoot, workspaceRoot, file);

  const templateDirectory = path.join(workspaceRoot, '.empty-git-template');
  const nullDevice = process.platform === 'win32' ? 'NUL' : '/dev/null';
  mkdirSync(templateDirectory, { mode: 0o700 });
  const gitEnvironment = {
    ...(process.env.PATH ? { PATH: process.env.PATH } : {}),
    ...(process.env.LANG ? { LANG: process.env.LANG } : {}),
    ...(process.env.LC_ALL ? { LC_ALL: process.env.LC_ALL } : {}),
    ...(process.env.SYSTEMROOT ? { SYSTEMROOT: process.env.SYSTEMROOT } : {}),
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: nullDevice,
    GIT_ATTR_NOSYSTEM: '1',
    GIT_TEMPLATE_DIR: templateDirectory,
    HOME: workspaceRoot,
  };
  execFileSync('git', ['init', '--quiet', '--initial-branch=main'], {
    cwd: workspaceRoot,
    env: gitEnvironment,
  });
  execFileSync('git', ['config', 'user.name', 'Disposable Validation'], {
    cwd: workspaceRoot,
    env: gitEnvironment,
  });
  execFileSync('git', ['config', 'user.email', 'validation@example.invalid'], {
    cwd: workspaceRoot,
    env: gitEnvironment,
  });
  execFileSync('git', ['config', 'core.hooksPath', nullDevice], {
    cwd: workspaceRoot,
    env: gitEnvironment,
  });
  execFileSync('git', ['add', '--all'], {
    cwd: workspaceRoot,
    env: gitEnvironment,
  });
  execFileSync(
    'git',
    [
      'commit',
      '--quiet',
      '--no-verify',
      '-m',
      'Disposable validation snapshot',
    ],
    {
      cwd: workspaceRoot,
      env: gitEnvironment,
    }
  );

  const dependencies = [];
  for (const relativePath of ['node_modules', 'gen-docs/node_modules']) {
    const source = path.join(sourceRoot, relativePath);
    if (!existsSync(source)) continue;
    const sourceMetadata = lstatSync(source);
    if (sourceMetadata.isSymbolicLink() || !sourceMetadata.isDirectory())
      throw new Error(
        `Installed dependency path must be a real directory, not a symbolic link: ${relativePath}`
      );
    const dependency = realpathSync(source);
    if (!isWithin(sourceRoot, dependency))
      throw new Error(
        `Installed dependencies escape the candidate workspace: ${relativePath}`
      );
    if (!lstatSync(dependency).isDirectory())
      throw new Error(
        `Installed dependency path is not a directory: ${relativePath}`
      );
    const target = path.join(workspaceRoot, relativePath);
    mkdirSync(path.dirname(target), { recursive: true });
    let index = dependencies.indexOf(dependency);
    if (index === -1) {
      index = dependencies.length;
      dependencies.push(dependency);
    }
    symlinkSync(`${SANDBOX_RUN}/dependencies/${index}`, target, 'dir');
  }
  return { root: workspaceRoot, dependencies: [...new Set(dependencies)] };
}

function rewritePath(value, mappings) {
  if (typeof value !== 'string') return value;
  for (const [source, target] of mappings) {
    if (value === source || value.startsWith(`${source}${path.sep}`))
      return `${target}${value.slice(source.length).split(path.sep).join('/')}`;
    value = value.split(`${source}${path.sep}`).join(`${target}/`);
  }
  return value;
}

function remapSourceRoots(sourceRoots, targetRoot) {
  return [...new Set(sourceRoots.filter((value) => typeof value === 'string'))]
    .map((value) => [realpathSync(value), targetRoot])
    .sort((a, b) => b[0].length - a[0].length);
}

export function createBubblewrapCommand(
  command,
  {
    root,
    sourceRoots = [],
    scratchRoot = root,
    runDirectory,
    dependencies = [],
    environment = {},
  }
) {
  if (process.platform !== 'linux')
    throw new Error(
      'Local test execution requires Linux bubblewrap isolation; use GitHub-hosted validation on other platforms.'
    );
  const bubblewrap = ['/usr/bin/bwrap', '/bin/bwrap'].find((candidate) =>
    existsSync(candidate)
  );
  if (!bubblewrap)
    throw new Error('bubblewrap is required; no test process was started.');
  for (const value of [root, scratchRoot, runDirectory])
    if (typeof value !== 'string' || !path.isAbsolute(value))
      throw new Error('Bubblewrap requires exact absolute workspace paths');

  root = realpathSync(root);
  scratchRoot = realpathSync(scratchRoot);
  runDirectory = realpathSync(runDirectory);
  const nodeRuntimeDirectory = path.dirname(realpathSync(process.execPath));
  const externalDependencies = [
    ...new Set(
      [...dependencies, nodeRuntimeDirectory].map((dependency) =>
        realpathSync(dependency)
      )
    ),
  ];
  mkdirSync(path.join(runDirectory, 'dependencies'), { recursive: true });
  const dependencyMappings = externalDependencies.map((dependency, index) => {
    const targetPath = path.join(runDirectory, 'dependencies', String(index));
    mkdirSync(targetPath, { recursive: true, mode: 0o700 });
    return [dependency, `${SANDBOX_RUN}/dependencies/${index}`];
  });
  const mappings = [
    ...remapSourceRoots(sourceRoots, SANDBOX_ROOT),
    [root, SANDBOX_ROOT],
    [scratchRoot, SANDBOX_SCRATCH],
    [runDirectory, SANDBOX_RUN],
    ...dependencyMappings,
  ].sort((a, b) => b[0].length - a[0].length);
  const args = [
    '--die-with-parent',
    '--new-session',
    '--unshare-user',
    '--unshare-pid',
    '--unshare-ipc',
    '--unshare-uts',
    '--unshare-net',
    '--ro-bind',
    '/',
    '/',
    '--tmpfs',
    '/mnt',
    '--dir',
    SANDBOX_ROOT,
    '--bind',
    root,
    SANDBOX_ROOT,
  ];
  if (scratchRoot !== root)
    args.push('--dir', SANDBOX_SCRATCH, '--bind', scratchRoot, SANDBOX_SCRATCH);
  if (runDirectory !== root && runDirectory !== scratchRoot)
    args.push('--dir', SANDBOX_RUN, '--bind', runDirectory, SANDBOX_RUN);

  for (const [source, target] of dependencyMappings)
    args.push('--ro-bind', source, target);

  args.push(
    '--proc',
    '/proc',
    '--dev',
    '/dev',
    '--tmpfs',
    '/dev/shm',
    '--tmpfs',
    '/home',
    '--tmpfs',
    '/root',
    '--tmpfs',
    '/run',
    '--tmpfs',
    '/var',
    '--tmpfs',
    '/tmp',
    '--tmpfs',
    '/sys',
    '--tmpfs',
    '/media',
    '--tmpfs',
    '/opt',
    '--tmpfs',
    '/srv'
  );

  const runTarget = `${SANDBOX_RUN}/config`;
  const env = {};
  for (const [name, value] of Object.entries(environment)) {
    if (
      typeof value !== 'string' ||
      /(?:TOKEN|SECRET|PASSWORD|CREDENTIAL|API[_-]?KEY|SSH_AUTH|AWS_|AZURE_|GCP_)/i.test(
        name
      )
    )
      continue;
    env[name] = rewritePath(value, mappings);
  }
  Object.assign(env, {
    HOME: `${SANDBOX_RUN}/home`,
    USERPROFILE: `${SANDBOX_RUN}/home`,
    TMPDIR: '/tmp',
    TMP: '/tmp',
    TEMP: '/tmp',
    XDG_CONFIG_HOME: `${SANDBOX_RUN}/xdg-config`,
    XDG_CACHE_HOME: `${SANDBOX_RUN}/xdg-cache`,
    CONFIG_DIRECTORY: runTarget,
    PATH: `${rewritePath(nodeRuntimeDirectory, mappings)}:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin`,
  });
  for (const directory of [
    env.HOME,
    env.XDG_CONFIG_HOME,
    env.XDG_CACHE_HOME,
    env.CONFIG_DIRECTORY,
    `${SANDBOX_RUN}/AppData`,
    `${SANDBOX_RUN}/AppData/Local`,
    `${SANDBOX_RUN}/AppData/Roaming`,
  ])
    args.push('--dir', directory);

  const rewrittenArgs = command.args.map((value) =>
    rewritePath(value, mappings)
  );
  const cwd = rewritePath(command.cwd ?? root, mappings);
  args.push(
    '--chdir',
    cwd,
    '--setenv',
    'PATH',
    env.PATH,
    '--setenv',
    'HOME',
    env.HOME,
    '--setenv',
    'USERPROFILE',
    env.USERPROFILE,
    '--setenv',
    'TMPDIR',
    env.TMPDIR,
    '--setenv',
    'TMP',
    env.TMP,
    '--setenv',
    'TEMP',
    env.TEMP,
    '--setenv',
    'XDG_CONFIG_HOME',
    env.XDG_CONFIG_HOME,
    '--setenv',
    'XDG_CACHE_HOME',
    env.XDG_CACHE_HOME,
    '--setenv',
    'CONFIG_DIRECTORY',
    env.CONFIG_DIRECTORY,
    '--',
    rewritePath(command.command, mappings),
    ...rewrittenArgs
  );
  return { command: bubblewrap, args, env, cwd: root };
}
