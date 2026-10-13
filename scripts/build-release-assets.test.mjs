import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';

const sourceScript = path.resolve('scripts/build-release-assets.sh');
const temporaryDirectories = new Set();

const createFixture = async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'release-assets-test-'));
  temporaryDirectories.add(root);
  const executableDirectory = path.join(root, 'tools');
  await Promise.all([
    ...['.next', 'bin', 'dist', 'patches', 'public'].map((directory) =>
      fs.mkdir(path.join(root, directory), { recursive: true })
    ),
    fs.mkdir(path.join(root, '.next', 'cache'), { recursive: true }),
    fs.mkdir(path.join(root, '.next', 'dev'), { recursive: true }),
    fs.mkdir(executableDirectory, { recursive: true }),
  ]);
  await Promise.all([
    fs.writeFile(path.join(root, '.next', 'cache', 'transient.txt'), 'cache\n'),
    fs.writeFile(path.join(root, '.next', 'dev', 'transient.txt'), 'dev\n'),
  ]);
  await fs.writeFile(path.join(root, 'dist', 'index.js'), 'fixture\n');
  await fs.writeFile(path.join(root, 'bin', 'prepare.mjs'), 'fixture\n');
  await fs.writeFile(
    path.join(
      root,
      'patches',
      'eslint-plugin-no-relative-import-paths@1.6.1.patch'
    ),
    'fixture patch\n'
  );
  await fs.writeFile(path.join(root, 'public', 'asset.txt'), 'public\n');
  for (const file of [
    'package.json',
    'pnpm-lock.yaml',
    'pnpm-workspace.yaml',
    'next.config.mjs',
    'seerr-api.yml',
    'LICENSE',
  ]) {
    await fs.writeFile(path.join(root, file), '{}\n');
  }
  await Promise.all([
    ...['.next', 'dist', 'public'].map((directory) =>
      fs.chmod(path.join(root, directory), 0o700)
    ),
    ...[
      'dist/index.js',
      'patches/eslint-plugin-no-relative-import-paths@1.6.1.patch',
      'public/asset.txt',
      'package.json',
      'pnpm-lock.yaml',
      'pnpm-workspace.yaml',
      'next.config.mjs',
      'seerr-api.yml',
      'LICENSE',
    ].map((file) => fs.chmod(path.join(root, file), 0o600)),
  ]);
  const script = path.join(root, 'build-release-assets.sh');
  await fs.copyFile(sourceScript, script);
  await fs.chmod(script, 0o755);
  await fs.writeFile(
    path.join(executableDirectory, 'corepack'),
    '#!/bin/sh\nexit 0\n',
    {
      mode: 0o755,
    }
  );
  await fs.writeFile(
    path.join(executableDirectory, 'pnpm'),
    '#!/bin/sh\nif [ "$1" = install ] && [ "$2" = --prod ]; then\n  test -f "$PWD/patches/eslint-plugin-no-relative-import-paths@1.6.1.patch" || exit 1\n  ln -s "$PWD/public/asset.txt" "$PWD/public/internal-link"\nfi\nexit 0\n',
    { mode: 0o755 }
  );
  return { executableDirectory, root, script };
};

const writeNodeArchitectureShim = (fixture) =>
  fs.writeFile(
    path.join(fixture.executableDirectory, 'node'),
    '#!/bin/sh\nif [ "$1" = "-p" ] && [ "$2" = "process.arch" ]; then\n  printf \'%s\\n\' "$TEST_NODE_ARCH"\n  exit 0\nfi\nexec "$TEST_NODE_BINARY" "$@"\n',
    { mode: 0o755 }
  );

const writeUnameShim = (fixture, system, machine) =>
  fs.writeFile(
    path.join(fixture.executableDirectory, 'uname'),
    `#!/bin/sh\nif [ "$1" = "-s" ]; then printf '%s\\n' '${system}'; else printf '%s\\n' '${machine}'; fi\n`,
    { mode: 0o755 }
  );

const run = (fixture, arguments_, environment = {}) =>
  new Promise((resolve) => {
    const child = spawn(fixture.script, arguments_, {
      cwd: fixture.root,
      env: {
        ...process.env,
        ...environment,
        PATH: `${fixture.executableDirectory}:${process.env.PATH}`,
        TMPDIR: fixture.root,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.setEncoding('utf8').on('data', (chunk) => {
      output += chunk;
    });
    child.stderr.setEncoding('utf8').on('data', (chunk) => {
      output += chunk;
    });
    child.on('close', (code) => resolve({ code, output }));
  });

const runForPlatformAndNodeArchitecture = async (
  fixture,
  arguments_,
  system,
  machine,
  architecture,
  environment = {}
) => {
  await Promise.all([
    writeNodeArchitectureShim(fixture),
    writeUnameShim(fixture, system, machine),
  ]);
  return run(fixture, arguments_, {
    ...environment,
    TEST_NODE_ARCH: architecture,
    TEST_NODE_BINARY: process.execPath,
  });
};

const runAsLinuxX64 = (fixture, arguments_, environment = {}) =>
  runForPlatformAndNodeArchitecture(
    fixture,
    arguments_,
    'Linux',
    'x86_64',
    'x64',
    environment
  );

const extractArchive = (archive, destination) =>
  new Promise((resolve, reject) => {
    const child = spawn('tar', ['-xzf', archive, '-C', destination]);
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`tar exited with ${code}`))
    );
  });

afterEach(async () => {
  await Promise.all(
    [...temporaryDirectories].map((directory) =>
      fs.rm(directory, { force: true, recursive: true })
    )
  );
  temporaryDirectories.clear();
});

describe('release asset construction', () => {
  it('atomically publishes a narrowed archive with a location-independent launcher', async () => {
    const fixture = await createFixture();
    const distribution = path.join(fixture.root, 'dist-release');
    const sentinel = path.join(fixture.root, 'sentinel');
    const asset = 'seerrng-v1.2.3-linux-x64';
    const archive = path.join(distribution, `${asset}.tar.gz`);
    await fs.mkdir(distribution);
    await fs.writeFile(sentinel, 'unchanged');
    await fs.symlink(sentinel, archive);

    const result = await runAsLinuxX64(fixture, ['v1.2.3', distribution]);

    assert.equal(result.code, 0, result.output);
    assert.match(
      result.output,
      /Completed release archive phase: Install build dependencies in \d+s/u
    );
    assert.match(
      result.output,
      /Completed release archive phase: Create seerrng-v1\.2\.3-linux-x64\.tar\.gz in \d+s \(\d+ bytes\)/u
    );
    assert.equal(await fs.readFile(sentinel, 'utf8'), 'unchanged');
    assert.equal((await fs.stat(archive)).mode & 0o777, 0o644);
    const extracted = path.join(fixture.root, 'extracted');
    await fs.mkdir(extracted);
    await extractArchive(archive, extracted);
    const root = path.join(extracted, asset);
    await assert.rejects(fs.stat(path.join(root, 'server')), {
      code: 'ENOENT',
    });
    await assert.rejects(fs.stat(path.join(root, 'bin')), { code: 'ENOENT' });
    await assert.rejects(fs.stat(path.join(root, '.next', 'cache')), {
      code: 'ENOENT',
    });
    await assert.rejects(fs.stat(path.join(root, '.next', 'dev')), {
      code: 'ENOENT',
    });
    await assert.rejects(fs.stat(path.join(root, 'patches')), {
      code: 'ENOENT',
    });
    assert.equal((await fs.stat(root)).mode & 0o777, 0o755);
    assert.equal((await fs.stat(path.join(root, 'dist'))).mode & 0o777, 0o755);
    assert.equal(
      (await fs.stat(path.join(root, 'dist', 'index.js'))).mode & 0o777,
      0o644
    );

    const invocation = path.join(fixture.root, 'node-invocation');
    await fs.writeFile(
      path.join(fixture.executableDirectory, 'node'),
      '#!/bin/sh\nprintf \'%s\\n%s\\n%s\\n\' "$PWD" "$CONFIG_DIRECTORY" "$*" >"$NODE_INVOCATION"\n',
      { mode: 0o755 }
    );
    const launch = async (configurationDirectory) =>
      new Promise((resolve) => {
        const child = spawn(path.join(root, 'seerrng'), ['--version'], {
          cwd: fixture.root,
          env: {
            ...process.env,
            // Default-path coverage must not inherit the gate's isolated config.
            CONFIG_DIRECTORY: configurationDirectory,
            NODE_INVOCATION: invocation,
            PATH: `${fixture.executableDirectory}:${process.env.PATH}`,
          },
        });
        child.on('close', resolve);
      });
    assert.equal(await launch(''), 0);
    assert.deepEqual(
      (await fs.readFile(invocation, 'utf8')).trim().split('\n'),
      [root, path.join(root, 'config'), 'dist/index.js --version']
    );
    const configured = path.join(fixture.root, 'explicit-config');
    assert.equal(await launch(configured), 0);
    assert.deepEqual(
      (await fs.readFile(invocation, 'utf8')).trim().split('\n'),
      [root, configured, 'dist/index.js --version']
    );
  });

  it('rejects tag traversal before creating a distribution directory', async () => {
    const fixture = await createFixture();
    const distribution = path.join(fixture.root, 'dist-release');

    const result = await run(fixture, ['../../escaped', distribution]);

    assert.notEqual(result.code, 0);
    assert.match(result.output, /Invalid release tag/);
    await assert.rejects(fs.stat(distribution), { code: 'ENOENT' });
  });

  it('rejects absolute symlinks from staged runtime content', async () => {
    const fixture = await createFixture();
    const distribution = path.join(fixture.root, 'dist-release');
    await fs.symlink(
      '/etc/passwd',
      path.join(fixture.root, 'public', 'escape')
    );

    const result = await runAsLinuxX64(fixture, ['v1.2.3', distribution]);

    assert.notEqual(result.code, 0);
    assert.match(result.output, /Refusing absolute archive symlink/);
    await assert.rejects(
      fs.stat(path.join(distribution, 'seerrng-v1.2.3-linux-x64.tar.gz')),
      { code: 'ENOENT' }
    );
  });

  it('normalizes absolute symlinks that remain inside staged runtime content', async () => {
    const fixture = await createFixture();
    const distribution = path.join(fixture.root, 'dist-release');
    const asset = 'seerrng-v1.2.3-linux-x64';
    const archive = path.join(distribution, `${asset}.tar.gz`);
    await fs.mkdir(distribution);
    const result = await runAsLinuxX64(fixture, ['v1.2.3', distribution]);

    assert.equal(result.code, 0, result.output);
    const extracted = path.join(fixture.root, 'extracted');
    await fs.mkdir(extracted);
    await extractArchive(archive, extracted);
    const link = path.join(extracted, asset, 'public', 'internal-link');
    assert.equal(path.isAbsolute(await fs.readlink(link)), false);
    assert.equal(await fs.readFile(link, 'utf8'), 'public\n');
  });

  it('uses the fast Windows archiver before PowerShell fallback', async () => {
    const fixture = await createFixture();
    const distribution = path.join(fixture.root, 'dist-release');
    const archive = path.join(distribution, 'seerrng-v1.2.3-windows-x64.zip');
    const archiverLog = path.join(fixture.root, 'archiver.log');
    await fs.mkdir(distribution);
    await fs.writeFile(
      path.join(fixture.executableDirectory, '7z'),
      '#!/bin/sh\nprintf \'%s\\n\' "$*" >"$ARCHIVER_LOG"\nprevious_argument=\'\'\nfor argument in "$@"; do\n  archive_path="$previous_argument"\n  stage_path="$argument"\n  previous_argument="$argument"\ndone\nzip -qr "$archive_path" "$stage_path"\n',
      { mode: 0o755 }
    );

    const result = await runForPlatformAndNodeArchitecture(
      fixture,
      ['v1.2.3', distribution],
      'MINGW64_NT',
      'x86_64',
      'x64',
      { ARCHIVER_LOG: archiverLog }
    );

    assert.equal(result.code, 0, result.output);
    assert.match(
      result.output,
      /Skipping recursive POSIX permission normalization for the Windows archive/u
    );
    assert.match(
      result.output,
      /Completed release archive phase: Create seerrng-v1\.2\.3-windows-x64\.zip in \d+s \(\d+ bytes\)/u
    );
    const archiverArguments = await fs.readFile(archiverLog, 'utf8');
    assert.match(archiverArguments, /-tzip/);
    assert.match(archiverArguments, /-mx=1/);
    assert.match(archiverArguments, /-mmt=on/);
    assert.match(archiverArguments, /-bsp1/);
    assert.match(archiverArguments, /-bso0/);
    assert.match(archiverArguments, /-bse2/);
    assert.equal((await fs.stat(archive)).mode & 0o777, 0o644);
    const listing = await new Promise((resolve, reject) => {
      const child = spawn('unzip', ['-l', archive]);
      let output = '';
      child.stdout.setEncoding('utf8').on('data', (chunk) => {
        output += chunk;
      });
      child.on('error', reject);
      child.on('close', (code) =>
        code === 0
          ? resolve(output)
          : reject(new Error(`unzip exited with ${code}`))
      );
    });
    assert.match(listing, /start\.cmd/);
  });

  it('rejects Linux ARMv7 without a supported Node.js 24 runtime', async () => {
    const fixture = await createFixture();
    const distribution = path.join(fixture.root, 'dist-release');
    const result = await runForPlatformAndNodeArchitecture(
      fixture,
      ['v1.2.3', distribution],
      'Linux',
      'armv7l',
      'armv7l'
    );

    assert.notEqual(result.code, 0);
    assert.match(
      result.output,
      /Unsupported release architecture reported by Node\.js: armv7l/u
    );
    await assert.rejects(
      fs.stat(path.join(distribution, 'seerrng-v1.2.3-linux-arm.tar.gz')),
      { code: 'ENOENT' }
    );
  });

  it('rejects an architecture outside the published archive matrix', async () => {
    const fixture = await createFixture();
    const distribution = path.join(fixture.root, 'dist-release');
    const result = await runForPlatformAndNodeArchitecture(
      fixture,
      ['v1.2.3', distribution],
      'Linux',
      'riscv64',
      'riscv64'
    );

    assert.notEqual(result.code, 0);
    assert.match(
      result.output,
      /Unsupported release architecture reported by Node\.js: riscv64/u
    );
    await assert.rejects(
      fs.stat(path.join(distribution, 'seerrng-v1.2.3-linux-x64.tar.gz')),
      { code: 'ENOENT' }
    );
  });
});
