// Copyright (c) snapetech and SeerrNG contributors.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
// eslint-disable-next-line no-relative-import-paths/no-relative-import-paths -- This native Node test exercises the workspace boundary directly.
import { createDisposableTestWorkspace } from '../tools/validation-engine/runtime/isolated-process.mjs';
import { executePlan } from './local-validation.mjs';

const bwrap = ['/usr/bin/bwrap', '/bin/bwrap'].find(existsSync);
const sandboxAvailable = (() => {
  if (process.platform !== 'linux' || !bwrap) return false;
  const probe = spawnSync(
    bwrap,
    [
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
      '/srv',
      '--proc',
      '/proc',
      '--dev',
      '/dev',
      '--',
      '/bin/true',
    ],
    { stdio: 'ignore' }
  );
  return probe.status === 0;
})();

test('local validation rejects dependency roots linked outside the candidate', (t) => {
  const parent = mkdtempSync(path.join(tmpdir(), 'seerrng-dependency-link-'));
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  const source = path.join(parent, 'candidate');
  const outside = path.join(parent, 'host-dependencies');
  mkdirSync(source);
  mkdirSync(outside);
  writeFileSync(path.join(source, '.gitignore'), 'node_modules/\ngen-docs\n');
  writeFileSync(path.join(outside, 'host-canary.txt'), 'must stay hidden\n');
  mkdirSync(path.join(outside, 'node_modules'));
  execFileSync('git', ['init', '--quiet', '--initial-branch=main'], {
    cwd: source,
  });
  execFileSync('git', ['config', 'user.name', 'Fixture'], { cwd: source });
  execFileSync('git', ['config', 'user.email', 'fixture@example.invalid'], {
    cwd: source,
  });
  execFileSync('git', ['add', '--all'], { cwd: source });
  execFileSync('git', ['commit', '--quiet', '-m', 'Fixture'], {
    cwd: source,
  });
  try {
    symlinkSync(outside, path.join(source, 'node_modules'), 'dir');
  } catch (error) {
    if (error.code === 'EPERM' || error.code === 'EACCES') {
      t.skip(`symbolic links are unavailable: ${error.code}`);
      return;
    }
    throw error;
  }

  assert.throws(
    () => createDisposableTestWorkspace(source, path.join(parent, 'workspace')),
    /symbolic link/
  );

  rmSync(path.join(source, 'node_modules'));
  symlinkSync(outside, path.join(source, 'gen-docs'), 'dir');
  assert.throws(
    () =>
      createDisposableTestWorkspace(
        source,
        path.join(parent, 'parent-link-workspace')
      ),
    /escape the candidate workspace/
  );
});

test(
  'local validation confines test processes to disposable files, dependencies, services and network',
  {
    skip:
      !sandboxAvailable && 'bubblewrap isolation namespaces are unavailable',
  },
  async (t) => {
    const parent = mkdtempSync(path.join(tmpdir(), 'seerrng-isolation-test-'));
    t.after(() => rmSync(parent, { recursive: true, force: true }));
    const source = path.join(parent, 'candidate');
    const dependency = path.join(source, 'node_modules');
    mkdirSync(source);
    mkdirSync(path.join(source, 'nested'));
    mkdirSync(path.join(dependency, 'probe'), { recursive: true });
    writeFileSync(path.join(source, '.gitignore'), 'node_modules/\n');
    writeFileSync(path.join(source, '.env'), 'PRIVATE_ENV_CANARY=hidden\n');
    writeFileSync(
      path.join(source, 'nested/.env.local'),
      'NESTED_ENV_CANARY=hidden\n'
    );
    writeFileSync(path.join(source, 'config.json'), '{"private":true}\n');
    writeFileSync(
      path.join(source, 'credentials.json'),
      '{"token":"hidden"}\n'
    );
    writeFileSync(path.join(source, 'auth.json'), '{"token":"hidden"}\n');
    writeFileSync(
      path.join(source, 'settings.json'),
      '{"password":"hidden"}\n'
    );
    writeFileSync(path.join(source, 'service-token.txt'), 'hidden\n');
    writeFileSync(path.join(source, 'apiToken.json'), '{"token":"hidden"}\n');
    writeFileSync(
      path.join(dependency, 'probe', 'dependency.txt'),
      'read-only\n'
    );
    const secretFile = path.join(parent, 'host-secret.txt');
    const hostSocket = path.join(parent, 'host-service.sock');
    writeFileSync(secretFile, 'host secret must stay hidden');
    const hostServer = net.createServer((socket) => socket.end('host service'));
    await new Promise((resolve, reject) => {
      hostServer.once('error', reject);
      hostServer.listen(0, '127.0.0.1', resolve);
    });
    t.after(() => hostServer.close());
    const { port } = hostServer.address();
    const unixServer = net.createServer((socket) =>
      socket.end('host unix service')
    );
    await new Promise((resolve, reject) => {
      unixServer.once('error', reject);
      unixServer.listen(hostSocket, resolve);
    });
    t.after(() => unixServer.close());

    const probeSource = `
      import assert from 'node:assert/strict';
      import { execFileSync } from 'node:child_process';
      import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
      import net from 'node:net';
      import test from 'node:test';
      const host = ${JSON.stringify({ secretFile, hostSocket, port })};
      test('host files and ignored configuration are absent', () => {
        assert.equal(process.cwd(), '/mnt/workspace');
        assert.throws(() => readFileSync(host.secretFile), { code: 'ENOENT' });
        assert.equal(existsSync('/mnt/workspace/.env'), false);
        assert.equal(existsSync('/mnt/workspace/nested/.env.local'), false);
        assert.equal(existsSync('/mnt/workspace/config.json'), false);
        assert.equal(existsSync('/mnt/workspace/credentials.json'), false);
        assert.equal(existsSync('/mnt/workspace/auth.json'), false);
        assert.equal(existsSync('/mnt/workspace/settings.json'), false);
        assert.equal(existsSync('/mnt/workspace/service-token.txt'), false);
        assert.equal(existsSync('/mnt/workspace/apiToken.json'), false);
        assert.equal(readdirSync('/opt').length, 0);
        assert.equal(readdirSync('/srv').length, 0);
        assert.equal(process.env.SECRET_CANARY, undefined);
        assert.doesNotMatch(readFileSync('/mnt/workspace/.git/config', 'utf8'), /credential/i);
        assert.equal(execFileSync('git', ['branch', '--show-current'], { encoding: 'utf8' }).trim(), 'main');
      });
      test('writes stay inside the disposable candidate copy', () => {
        writeFileSync('/mnt/workspace/sandbox-write-canary.txt', 'sandbox only');
      });
      test('installed dependencies are readable but not writable', () => {
        const dependency = '/mnt/workspace/node_modules/probe/dependency.txt';
        assert.equal(readFileSync(dependency, 'utf8'), 'read-only\\n');
        assert.throws(() => writeFileSync(dependency, 'changed'), (error) =>
          ['EROFS', 'EACCES', 'EPERM'].includes(error.code)
        );
      });
      test('host unix sockets and TCP listeners cannot be reached', async () => {
        await assert.rejects(new Promise((resolve, reject) => {
          const socket = net.createConnection(host.hostSocket);
          socket.once('connect', () => { socket.destroy(); resolve(); });
          socket.once('error', reject);
        }), (error) => ['ENOENT', 'ECONNREFUSED'].includes(error.code));
        await assert.rejects(new Promise((resolve, reject) => {
          const socket = net.createConnection({ host: '127.0.0.1', port: host.port });
          socket.setTimeout(750, () => socket.destroy(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' })));
          socket.once('connect', () => { socket.destroy(); resolve(); });
          socket.once('error', reject);
        }), (error) => ['ECONNREFUSED', 'ETIMEDOUT'].includes(error.code));
      });
      test('loopback remains available inside the isolated test namespace', async () => {
        const server = net.createServer((socket) => socket.end('sandbox loopback'));
        await new Promise((resolve, reject) => {
          server.once('error', reject);
          server.listen(0, '127.0.0.1', resolve);
        });
        const { port } = server.address();
        const data = await new Promise((resolve, reject) => {
          const socket = net.createConnection({ host: '127.0.0.1', port });
          let received = '';
          socket.setEncoding('utf8');
          socket.on('data', (chunk) => { received += chunk; });
          socket.once('end', () => resolve(received));
          socket.once('error', reject);
        });
        await new Promise((resolve) => server.close(resolve));
        assert.equal(data, 'sandbox loopback');
      });
    `;
    writeFileSync(path.join(source, 'probe.test.mjs'), probeSource);
    execFileSync('git', ['init', '--quiet', '--initial-branch=main'], {
      cwd: source,
    });
    execFileSync('git', ['config', 'user.name', 'Fixture'], { cwd: source });
    execFileSync('git', ['config', 'user.email', 'fixture@example.invalid'], {
      cwd: source,
    });
    execFileSync('git', ['add', '--all'], { cwd: source });
    execFileSync('git', ['commit', '--quiet', '-m', 'Fixture'], {
      cwd: source,
    });

    const result = await executePlan(
      {
        root: source,
        steps: [
          {
            name: 'Isolation canaries',
            command: process.execPath,
            args: [
              '--test',
              '--test-concurrency=1',
              '--test-reporter=tap',
              'probe.test.mjs',
            ],
            kind: 'node-js',
            files: ['probe.test.mjs'],
          },
        ],
      },
      {
        sandbox: true,
        inherited: { ...process.env, SECRET_CANARY: 'must-not-be-inherited' },
        stdout: { write() {} },
        stderr: { write() {} },
      }
    );
    assert.equal(result.get('node-js').total, 5);
    assert.equal(result.get('node-js').active, 5);
    assert.equal(
      existsSync(path.join(source, 'sandbox-write-canary.txt')),
      false
    );
  }
);
