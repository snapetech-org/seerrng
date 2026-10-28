import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

const posixIt = process.platform === 'win32' ? it.skip : it;

import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  PRIVATE_SQLITE_DIRECTORY_MODE,
  PRIVATE_SQLITE_FILE_MODE,
  secureSqliteDatabaseFiles,
} from './sqliteFileSecurity';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => fs.rm(directory, { force: true, recursive: true }))
  );
});

describe('SQLite file permissions', () => {
  posixIt(
    'creates private database files before the first SQLite connection',
    async () => {
      const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'seerr-sqlite-'));
      temporaryDirectories.push(parent);
      const databasePath = path.join(parent, 'new', 'db', 'db.sqlite3');
      secureSqliteDatabaseFiles(databasePath);
      assert.equal(
        (await fs.stat(databasePath)).mode & 0o777,
        PRIVATE_SQLITE_FILE_MODE
      );
      assert.equal(
        (await fs.stat(path.dirname(databasePath))).mode & 0o777,
        PRIVATE_SQLITE_DIRECTORY_MODE
      );
      assert.equal((await fs.stat(databasePath)).size, 0);
    }
  );

  posixIt(
    'preserves live WAL locks when startup rechecks database permissions',
    async () => {
      const parent = await fs.mkdtemp(
        path.join(os.tmpdir(), 'seerr-sqlite-locks-')
      );
      temporaryDirectories.push(parent);
      const script = `
      const assert = require('node:assert/strict');
      const fs = require('node:fs');
      process.umask(0o022);
      const {spawnSync} = require('node:child_process');
      const {default: dataSource, enforceSqliteDatabasePermissions} = require(process.argv[1]);
      (async () => {
        await dataSource.initialize();
        const db = dataSource.driver.databaseConnection;
        const databasePath = process.env.CONFIG_DIRECTORY + '/db/db.sqlite3';
        db.exec('CREATE TABLE permission_lock_probe (value INTEGER); INSERT INTO permission_lock_probe VALUES (1)');
        enforceSqliteDatabasePermissions();
        const readCount = () => {
          const child = spawnSync(process.execPath, ['-e',
            'const D=require(process.argv[1]); const db=new D(process.argv[2]); console.log(db.prepare("SELECT count(*) AS n FROM permission_lock_probe").get().n); db.close();',
            require.resolve('better-sqlite3'), databasePath], {encoding:'utf8'});
          assert.equal(child.status, 0, child.stderr);
          return Number(child.stdout.trim());
        };
        assert.equal(readCount(), 1);
        assert.ok(fs.existsSync(databasePath + '-wal'), 'another connection must not unlink the live WAL');
        db.exec('INSERT INTO permission_lock_probe VALUES (2)');
        assert.equal(readCount(), 2, 'a fresh connection must observe later committed writes');
        for (const suffix of ['', '-wal', '-shm']) {
          assert.equal(fs.statSync(databasePath + suffix).mode & 0o777, 0o600);
        }
        await dataSource.destroy();
      })().catch(error => { console.error(error); process.exitCode = 1; });
    `;
      const child = spawnSync(
        process.execPath,
        [
          '-r',
          'ts-node/register',
          '-r',
          'tsconfig-paths/register',
          '-e',
          script,
          require.resolve('../datasource'),
        ],
        {
          env: {
            ...process.env,
            NODE_ENV: 'production',
            CONFIG_DIRECTORY: parent,
          },
          encoding: 'utf8',
          timeout: 30000,
        }
      );
      assert.equal(child.status, 0, child.stderr || child.stdout);
    }
  );

  posixIt('tightens database directories and SQLite files', async () => {
    const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'seerr-sqlite-'));
    temporaryDirectories.push(parent);
    const databaseDirectory = path.join(parent, 'db');
    const databasePath = path.join(databaseDirectory, 'db.sqlite3');
    await fs.mkdir(databaseDirectory, { mode: 0o755 });
    await fs.chmod(databaseDirectory, 0o755);
    await Promise.all(
      [databasePath, `${databasePath}-wal`, `${databasePath}-shm`].map(
        async (filePath) => {
          await fs.writeFile(filePath, 'sqlite', { mode: 0o644 });
          await fs.chmod(filePath, 0o644);
        }
      )
    );

    secureSqliteDatabaseFiles(databasePath);

    assert.equal(
      (await fs.stat(databaseDirectory)).mode & 0o777,
      PRIVATE_SQLITE_DIRECTORY_MODE
    );
    for (const filePath of [
      databasePath,
      `${databasePath}-wal`,
      `${databasePath}-shm`,
    ]) {
      assert.equal(
        (await fs.stat(filePath)).mode & 0o777,
        PRIVATE_SQLITE_FILE_MODE
      );
    }
  });

  posixIt(
    'rejects symlinked database files without modifying their targets',
    async () => {
      const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'seerr-sqlite-'));
      temporaryDirectories.push(parent);
      const databaseDirectory = path.join(parent, 'db');
      const databasePath = path.join(databaseDirectory, 'db.sqlite3');
      const targetPath = path.join(parent, 'unrelated');
      await fs.mkdir(databaseDirectory);
      await fs.writeFile(targetPath, 'unrelated', { mode: 0o644 });
      await fs.chmod(targetPath, 0o644);
      await fs.symlink(targetPath, databasePath);

      assert.throws(
        () => secureSqliteDatabaseFiles(databasePath),
        /regular file/
      );
      assert.equal((await fs.stat(targetPath)).mode & 0o777, 0o644);
    }
  );

  posixIt(
    'rejects hard-linked database files without modifying their targets',
    async () => {
      const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'seerr-sqlite-'));
      temporaryDirectories.push(parent);
      const databaseDirectory = path.join(parent, 'db');
      const databasePath = path.join(databaseDirectory, 'db.sqlite3');
      const targetPath = path.join(parent, 'unrelated');
      await fs.mkdir(databaseDirectory);
      await fs.writeFile(targetPath, 'unrelated', { mode: 0o644 });
      await fs.chmod(targetPath, 0o644);
      await fs.link(targetPath, databasePath);

      assert.throws(
        () => secureSqliteDatabaseFiles(databasePath),
        /regular file/
      );
      assert.equal((await fs.stat(targetPath)).mode & 0o777, 0o644);
    }
  );

  posixIt('rejects symlinks above the direct database directory', async () => {
    const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'seerr-sqlite-'));
    temporaryDirectories.push(parent);
    const targetRoot = path.join(parent, 'target');
    const targetDirectory = path.join(targetRoot, 'db');
    const linkedRoot = path.join(parent, 'linked');
    const databasePath = path.join(linkedRoot, 'db', 'db.sqlite3');
    await fs.mkdir(targetDirectory, { recursive: true, mode: 0o755 });
    await fs.chmod(targetDirectory, 0o755);
    await fs.writeFile(path.join(targetDirectory, 'db.sqlite3'), 'sqlite');
    await fs.symlink(targetRoot, linkedRoot);

    assert.throws(() => secureSqliteDatabaseFiles(databasePath), /symlink/);
    assert.equal((await fs.stat(targetDirectory)).mode & 0o777, 0o755);
  });
});
