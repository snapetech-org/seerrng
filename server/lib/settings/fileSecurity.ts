import {
  assertNoSymlinkDirectoryComponents,
  isTolerableChmodError,
} from '@server/lib/pathSecurity';
import logger from '@server/logger';
import fs from 'fs/promises';
import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const PRIVATE_SETTINGS_FILE_MODE = 0o600;
export const PRIVATE_SETTINGS_DIRECTORY_MODE = 0o700;
export const MAX_SETTINGS_FILE_BYTES = 2 * 1024 * 1024;
export const SETTINGS_LOCK_STALE_MS = 10_000;
export const SETTINGS_LOCK_RETRY_MS = 25;
export const SETTINGS_LOCK_TIMEOUT_MS = 15_000;

interface SettingsLockOwner {
  hostname: string;
  pid: number;
  token: string;
}

export const assertSettingsFileSize = (bytes: number) => {
  if (!Number.isFinite(bytes) || bytes < 0 || bytes > MAX_SETTINGS_FILE_BYTES) {
    throw new Error('Settings file exceeds maximum size');
  }
};

const chmodHandleBestEffort = async (
  handle: { chmod: (mode: number) => Promise<void> },
  filePath: string
): Promise<void> => {
  try {
    await handle.chmod(PRIVATE_SETTINGS_FILE_MODE);
  } catch (error) {
    if (!isTolerableChmodError(error)) throw error;
    logger.warn(
      'Unable to set restrictive permissions on the settings file; continuing with its existing permissions.',
      { label: 'Settings', filePath, errorMessage: (error as Error).message }
    );
  }
};

const enforcePrivateSettingsDirectory = async (
  directory: string
): Promise<void> => {
  assertNoSymlinkDirectoryComponents(directory, {
    label: 'Settings directory',
  });
  const stat = await fs.lstat(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error('Settings directory must not be a symlink.');
  }
  try {
    await fs.chmod(directory, PRIVATE_SETTINGS_DIRECTORY_MODE);
  } catch (error) {
    if (!isTolerableChmodError(error)) throw error;
    logger.warn(
      'Unable to set restrictive permissions on the settings directory; continuing with its existing permissions.',
      { label: 'Settings', directory, errorMessage: (error as Error).message }
    );
  }
};

const isProcessAlive = (owner: SettingsLockOwner): boolean | undefined => {
  if (owner.hostname !== os.hostname()) {
    return undefined;
  }

  try {
    process.kill(owner.pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
};

const readSettingsLockOwner = async (
  lockPath: string
): Promise<SettingsLockOwner | undefined> => {
  try {
    const contents = await fs.readFile(lockPath, 'utf8');
    if (Buffer.byteLength(contents, 'utf8') > 1_024) return undefined;
    const owner = JSON.parse(contents) as Partial<SettingsLockOwner>;
    return typeof owner.hostname === 'string' &&
      Number.isSafeInteger(owner.pid) &&
      (owner.pid ?? 0) > 0 &&
      typeof owner.token === 'string' &&
      /^[a-f0-9-]{36}$/.test(owner.token)
      ? (owner as SettingsLockOwner)
      : undefined;
  } catch {
    return undefined;
  }
};

const removeAbandonedSettingsLock = async (
  lockPath: string
): Promise<boolean> => {
  let stat;
  try {
    stat = await fs.lstat(lockPath);
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'ENOENT';
  }

  // A cooperating owner may unlink the regular file during lstat. Retry the
  // exclusive create; a replacement still has to pass the normal path checks.
  if (stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 0) {
    return true;
  }
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) {
    throw new Error('Settings lock path must be a regular file.');
  }

  const owner = await readSettingsLockOwner(lockPath);
  if (owner && isProcessAlive(owner) === true) {
    return false;
  }
  if (
    (!owner || isProcessAlive(owner) === undefined) &&
    Date.now() - stat.mtimeMs < SETTINGS_LOCK_STALE_MS
  ) {
    return false;
  }

  await fs.unlink(lockPath).catch((error) => {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  });
  return true;
};

export const withSettingsFileLock = async <Result>(
  filePath: string,
  callback: () => Promise<Result>
): Promise<Result> => {
  const directory = path.dirname(filePath);
  await enforcePrivateSettingsDirectory(directory);
  const lockPath = path.join(directory, `.${path.basename(filePath)}.lock`);
  const owner: SettingsLockOwner = {
    hostname: os.hostname(),
    pid: process.pid,
    token: randomUUID(),
  };
  const deadline = Date.now() + SETTINGS_LOCK_TIMEOUT_MS;

  while (true) {
    if (Date.now() >= deadline) {
      throw new Error('Timed out waiting for the settings file lock.');
    }
    let handle: Awaited<ReturnType<typeof fs.open>>;
    try {
      handle = await fs.open(
        lockPath,
        constants.O_CREAT |
          constants.O_EXCL |
          constants.O_WRONLY |
          constants.O_NOFOLLOW,
        PRIVATE_SETTINGS_FILE_MODE
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      if (await removeAbandonedSettingsLock(lockPath)) continue;
      if (Date.now() >= deadline) {
        throw new Error('Timed out waiting for the settings file lock.', {
          cause: error,
        });
      }
      await new Promise((resolve) =>
        setTimeout(resolve, SETTINGS_LOCK_RETRY_MS)
      );
      continue;
    }

    try {
      await handle.writeFile(JSON.stringify(owner), 'utf8');
      await handle.sync();
    } catch (error) {
      await handle.close().catch(() => undefined);
      await fs.unlink(lockPath).catch(() => undefined);
      throw error;
    }

    const heartbeat = setInterval(
      () => {
        const now = new Date();
        void handle.utimes(now, now).catch(() => undefined);
      },
      Math.max(250, Math.floor(SETTINGS_LOCK_STALE_MS / 4))
    );
    heartbeat.unref();

    try {
      return await callback();
    } finally {
      clearInterval(heartbeat);
      await handle.close();
      const currentOwner = await readSettingsLockOwner(lockPath);
      if (currentOwner?.token === owner.token) {
        await fs.unlink(lockPath).catch((error) => {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        });
      }
    }
  }
};

export const enforcePrivateSettingsFile = async (
  filePath: string
): Promise<void> => {
  await enforcePrivateSettingsDirectory(path.dirname(filePath));
  const handle = await fs.open(
    filePath,
    constants.O_RDONLY | constants.O_NOFOLLOW
  );
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.nlink !== 1) {
      throw new Error('Settings path must be a regular file.');
    }
    await chmodHandleBestEffort(handle, filePath);
  } finally {
    await handle.close();
  }
};

export const readPrivateSettingsFile = async (
  filePath: string
): Promise<string> => {
  await enforcePrivateSettingsDirectory(path.dirname(filePath));
  const handle = await fs.open(
    filePath,
    constants.O_RDONLY | constants.O_NOFOLLOW
  );

  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.nlink !== 1) {
      throw new Error('Settings path must be a regular file.');
    }
    assertSettingsFileSize(stat.size);
    await chmodHandleBestEffort(handle, filePath);
    return await handle.readFile('utf8');
  } finally {
    await handle.close();
  }
};

export const writePrivateSettingsFile = async (
  filePath: string,
  data: string
): Promise<void> => {
  assertSettingsFileSize(Buffer.byteLength(data, 'utf8'));
  const directory = path.dirname(filePath);
  await enforcePrivateSettingsDirectory(directory);
  const temporaryPath = path.join(
    directory,
    `.${path.basename(filePath)}.${process.pid}.${randomUUID()}.tmp`
  );
  let handle: Awaited<ReturnType<typeof fs.open>> | undefined;

  try {
    // An exclusive, same-directory temporary file prevents symlink following
    // and makes the final replacement atomic across process crashes.
    handle = await fs.open(temporaryPath, 'wx', PRIVATE_SETTINGS_FILE_MODE);
    await handle.writeFile(data, 'utf8');
    await chmodHandleBestEffort(handle, temporaryPath);
    await handle.sync();
    await handle.close();
    handle = undefined;
    await fs.rename(temporaryPath, filePath);
  } catch (error) {
    await handle?.close().catch(() => undefined);
    await fs.rm(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  }
};
