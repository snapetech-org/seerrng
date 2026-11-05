import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';

const posixIt = process.platform === 'win32' ? it.skip : it;

import fs from 'fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  enforcePrivateSettingsFile,
  MAX_SETTINGS_FILE_BYTES,
  PRIVATE_SETTINGS_DIRECTORY_MODE,
  PRIVATE_SETTINGS_FILE_MODE,
  readPrivateSettingsFile,
  withSettingsFileLock,
  writePrivateSettingsFile,
} from './fileSecurity';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      fs.rm(directory, {
        force: true,
        recursive: true,
      })
    )
  );
});

describe('settings file permissions', () => {
  it('serializes concurrent settings mutations and removes the lock', async () => {
    const directory = await fs.mkdtemp(
      path.join(os.tmpdir(), 'seerr-settings-')
    );
    temporaryDirectories.push(directory);
    const filePath = path.join(directory, 'settings.json');
    let active = 0;
    let maximumActive = 0;

    await Promise.all(
      Array.from({ length: 10 }, () =>
        withSettingsFileLock(filePath, async () => {
          active += 1;
          maximumActive = Math.max(maximumActive, active);
          await new Promise((resolve) => setImmediate(resolve));
          active -= 1;
        })
      )
    );

    assert.strictEqual(maximumActive, 1);
    assert.deepStrictEqual(await fs.readdir(directory), []);
  });

  it('retries when an existing lock is unlinked during inspection', async () => {
    const directory = await fs.mkdtemp(
      path.join(os.tmpdir(), 'seerr-settings-unlink-')
    );
    temporaryDirectories.push(directory);
    const filePath = path.join(directory, 'settings.json');
    const lockPath = path.join(directory, '.settings.json.lock');
    await fs.writeFile(lockPath, 'fixture lock');
    const originalLstat = fs.lstat.bind(fs);
    let released = false;
    const lstat = mock.method(
      fs,
      'lstat',
      async (...args: Parameters<typeof fs.lstat>) => {
        const stat = await originalLstat(...args);
        if (String(args[0]) === lockPath && !released) {
          released = true;
          await fs.unlink(lockPath);
          Object.defineProperty(stat, 'nlink', { value: 0 });
        }
        return stat;
      }
    );
    let calls = 0;
    try {
      await withSettingsFileLock(filePath, async () => {
        calls++;
      });
    } finally {
      lstat.mock.restore();
    }
    assert.equal(calls, 1);
    assert.deepEqual(await fs.readdir(directory), []);
  });

  posixIt(
    'rejects a hard-linked lock path without touching its target',
    async () => {
      const directory = await fs.mkdtemp(
        path.join(os.tmpdir(), 'seerr-settings-hardlink-')
      );
      temporaryDirectories.push(directory);
      const filePath = path.join(directory, 'settings.json');
      const target = path.join(directory, 'private-target');
      await fs.writeFile(target, 'unchanged');
      await fs.link(target, path.join(directory, '.settings.json.lock'));
      await assert.rejects(
        withSettingsFileLock(filePath, async () => undefined),
        /regular file/
      );
      assert.equal(await fs.readFile(target, 'utf8'), 'unchanged');
    }
  );

  it('recovers a lock abandoned by a dead local process', async () => {
    const directory = await fs.mkdtemp(
      path.join(os.tmpdir(), 'seerr-settings-')
    );
    temporaryDirectories.push(directory);
    const filePath = path.join(directory, 'settings.json');
    const lockPath = path.join(directory, '.settings.json.lock');
    await fs.writeFile(
      lockPath,
      JSON.stringify({
        hostname: os.hostname(),
        pid: 2_147_483_647,
        token: '00000000-0000-4000-8000-000000000000',
      })
    );

    let ran = false;
    await withSettingsFileLock(filePath, async () => {
      ran = true;
    });

    assert.strictEqual(ran, true);
    await assert.rejects(fs.stat(lockPath), { code: 'ENOENT' });
  });

  it('does not retry callbacks whose own error code is EEXIST', async () => {
    const directory = await fs.mkdtemp(
      path.join(os.tmpdir(), 'seerr-settings-')
    );
    temporaryDirectories.push(directory);
    const filePath = path.join(directory, 'settings.json');
    let calls = 0;
    const error = Object.assign(new Error('callback conflict'), {
      code: 'EEXIST',
    });

    await assert.rejects(
      withSettingsFileLock(filePath, async () => {
        calls += 1;
        throw error;
      }),
      error
    );

    assert.strictEqual(calls, 1);
    assert.deepStrictEqual(await fs.readdir(directory), []);
  });

  posixIt('rejects a symlink planted at the settings lock path', async () => {
    const directory = await fs.mkdtemp(
      path.join(os.tmpdir(), 'seerr-settings-')
    );
    temporaryDirectories.push(directory);
    const filePath = path.join(directory, 'settings.json');
    const targetPath = path.join(directory, 'target');
    await fs.writeFile(targetPath, 'do not unlink');
    await fs.symlink(targetPath, path.join(directory, '.settings.json.lock'));

    await assert.rejects(
      withSettingsFileLock(filePath, async () => undefined),
      /lock path must be a regular file/i
    );
    assert.strictEqual(await fs.readFile(targetPath, 'utf8'), 'do not unlink');
  });

  posixIt(
    'tightens existing settings files and keeps rewritten files private',
    async () => {
      const directory = await fs.mkdtemp(
        path.join(os.tmpdir(), 'seerr-settings-')
      );
      temporaryDirectories.push(directory);
      const filePath = path.join(directory, 'settings.json');

      await fs.writeFile(filePath, '{}', { mode: 0o644 });
      await fs.chmod(directory, 0o755);
      await enforcePrivateSettingsFile(filePath);
      assert.strictEqual(
        (await fs.stat(directory)).mode & 0o777,
        PRIVATE_SETTINGS_DIRECTORY_MODE
      );
      assert.strictEqual(
        (await fs.stat(filePath)).mode & 0o777,
        PRIVATE_SETTINGS_FILE_MODE
      );

      await fs.chmod(filePath, 0o644);
      await writePrivateSettingsFile(filePath, '{"secret":"value"}');
      assert.strictEqual(
        (await fs.stat(filePath)).mode & 0o777,
        PRIVATE_SETTINGS_FILE_MODE
      );
    }
  );

  posixIt(
    'atomically replaces symlinks without modifying their targets',
    async () => {
      const directory = await fs.mkdtemp(
        path.join(os.tmpdir(), 'seerr-settings-')
      );
      temporaryDirectories.push(directory);
      const filePath = path.join(directory, 'settings.json');
      const targetPath = path.join(directory, 'unrelated-file');

      await fs.writeFile(targetPath, 'do not replace');
      await fs.symlink(targetPath, filePath);

      await writePrivateSettingsFile(filePath, '{"secret":"value"}');

      assert.strictEqual(
        await fs.readFile(targetPath, 'utf8'),
        'do not replace'
      );
      assert.strictEqual(
        await fs.readFile(filePath, 'utf8'),
        '{"secret":"value"}'
      );
      assert.strictEqual((await fs.lstat(filePath)).isSymbolicLink(), false);
    }
  );

  posixIt('rejects symlinked settings files during reads', async () => {
    const directory = await fs.mkdtemp(
      path.join(os.tmpdir(), 'seerr-settings-')
    );
    temporaryDirectories.push(directory);
    const filePath = path.join(directory, 'settings.json');
    const targetPath = path.join(directory, 'unrelated-file');

    await fs.writeFile(targetPath, '{}');
    await fs.symlink(targetPath, filePath);

    await assert.rejects(
      readPrivateSettingsFile(filePath),
      (error: NodeJS.ErrnoException) =>
        error.code === 'ELOOP' || /must be a regular file/i.test(error.message)
    );
  });

  posixIt(
    'rejects hard-linked settings files without changing the target',
    async () => {
      const directory = await fs.mkdtemp(
        path.join(os.tmpdir(), 'seerr-settings-')
      );
      temporaryDirectories.push(directory);
      const targetPath = path.join(directory, 'target.json');
      const filePath = path.join(directory, 'settings.json');
      await fs.writeFile(targetPath, '{}', { mode: 0o644 });
      await fs.link(targetPath, filePath);

      await assert.rejects(readPrivateSettingsFile(filePath), /regular file/i);
      assert.equal((await fs.stat(targetPath)).mode & 0o777, 0o644);
    }
  );

  posixIt(
    'rejects symlinked settings directories during reads and writes',
    async () => {
      const root = await fs.mkdtemp(path.join(os.tmpdir(), 'seerr-settings-'));
      temporaryDirectories.push(root);
      const targetDirectory = path.join(root, 'target');
      const linkedDirectory = path.join(root, 'linked');
      await fs.mkdir(targetDirectory);
      await fs.writeFile(path.join(targetDirectory, 'settings.json'), '{}');
      await fs.symlink(targetDirectory, linkedDirectory);
      const linkedFile = path.join(linkedDirectory, 'settings.json');

      await assert.rejects(
        readPrivateSettingsFile(linkedFile),
        /directory must not.*symlink/i
      );
      await assert.rejects(
        writePrivateSettingsFile(linkedFile, '{"changed":true}'),
        /directory must not.*symlink/i
      );
      assert.strictEqual(
        await fs.readFile(path.join(targetDirectory, 'settings.json'), 'utf8'),
        '{}'
      );
    }
  );

  posixIt('rejects symlinks above the direct settings directory', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'seerr-settings-'));
    temporaryDirectories.push(root);
    const targetRoot = path.join(root, 'target');
    const targetDirectory = path.join(targetRoot, 'nested');
    const linkedRoot = path.join(root, 'linked');
    await fs.mkdir(targetDirectory, { recursive: true });
    await fs.writeFile(path.join(targetDirectory, 'settings.json'), '{}');
    await fs.symlink(targetRoot, linkedRoot);
    const linkedFile = path.join(linkedRoot, 'nested', 'settings.json');

    await assert.rejects(readPrivateSettingsFile(linkedFile), /symlink/i);
    await assert.rejects(
      writePrivateSettingsFile(linkedFile, '{"changed":true}'),
      /symlink/i
    );
    assert.equal(
      await fs.readFile(path.join(targetDirectory, 'settings.json'), 'utf8'),
      '{}'
    );
  });

  it('rejects oversized settings before creating a staging file', async () => {
    const directory = await fs.mkdtemp(
      path.join(os.tmpdir(), 'seerr-settings-')
    );
    temporaryDirectories.push(directory);
    const filePath = path.join(directory, 'settings.json');

    await assert.rejects(
      writePrivateSettingsFile(
        filePath,
        'x'.repeat(MAX_SETTINGS_FILE_BYTES + 1)
      ),
      /exceeds maximum size/
    );
    assert.deepEqual(await fs.readdir(directory), []);
  });
});
